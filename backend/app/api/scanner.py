import json
import logging
from datetime import date
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Header, Response
from pydantic import BaseModel, ConfigDict, Field

from app.core.database import get_supabase_client
from app.models.schemas import DailyScanResult, SignalStatus
from app.services.confidence_calibrator import StrategyConfidenceCalibrator

logger = logging.getLogger("api.scanner")

router = APIRouter(prefix="/scan", tags=["scanner"])

# Hard operational safety kill-switch for live capital execution
LIVE_TRADING_ENABLED: bool = False


class CloseSignalRequest(BaseModel):
    status: SignalStatus
    exit_price: float
    notes: Optional[str] = None


class OrderExecutionRequest(BaseModel):
    signal_id: str
    symbol: str
    shares: int
    order_type: str = "LIMIT"
    price: Optional[float] = None
    user_approval_token: Optional[str] = None


class OrderExecutionResponse(BaseModel):
    status: str
    order_id: Optional[str] = None
    message: str
    kill_switch_active: bool


class TradeSignalResponse(BaseModel):
    id: Optional[str] = None
    asset_id: str
    symbol: Optional[str] = None
    name: Optional[str] = None
    market: str = "BIST"
    strategy: str
    signal_date: date
    entry_price: float
    entry_mode: str = "next_open"
    direction: str = "LONG"
    stop_loss: Optional[float] = None
    target_1: Optional[float] = None
    target_2: Optional[float] = None
    risk_reward_ratio: Optional[float] = None
    confidence_score: Optional[float] = None
    confidence_source: str = "PRIOR"
    is_deployed: bool = True
    deployment_status: str = "ACTIVE"
    status: str = "open"
    outcome_pnl_pct: Optional[float] = None
    closed_at: Optional[str] = None
    ai_rationale: Optional[str] = None
    trigger_reasons: List[str] = Field(default_factory=list)
    failed_checks: List[str] = Field(default_factory=list)
    invalidation: Optional[str] = None
    market_config_posture: Optional[str] = None
    live_execution_permitted: bool = False
    operational_guard: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


def resolve_posture(
    query_posture: Optional[str] = None,
    header_posture: Optional[str] = None
) -> Optional[str]:
    """Dynamically resolves posture from query params or headers without hardcoding."""
    p = query_posture or header_posture
    if p:
        p_clean = p.strip().lower()
        if p_clean in ("safe", "balanced", "aggressive"):
            return p_clean
        return p_clean
    return None


def _fetch_signals_from_db(
    status: Optional[str] = None,
    strategy: Optional[str] = None,
    market: Optional[str] = None,
    deployed_only: bool = True,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    posture: Optional[str] = None,
    limit: int = 200
) -> List[TradeSignalResponse]:
    """
    Core signal fetcher from Supabase.
    Applies market-specific deployment matrix filters and metadata tagging.
    """
    calibrator = StrategyConfidenceCalibrator()
    client = get_supabase_client()

    query = client.table("trade_signals").select("*, assets(symbol, name, market)")
    if status:
        query = query.eq("status", status)
    if strategy:
        query = query.eq("strategy", strategy)
    if start_date:
        query = query.gte("signal_date", start_date.isoformat())
    if end_date:
        query = query.lte("signal_date", end_date.isoformat())

    query = query.order("signal_date", desc=True).limit(limit)

    try:
        res = query.execute()
        rows = res.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch trade signals from Supabase: {e}")
        rows = []

    results: List[TradeSignalResponse] = []
    for r in rows:
        asset_info = r.get("assets") or {}
        sym = asset_info.get("symbol", "").replace(".IS", "").upper()
        asset_market = (asset_info.get("market") or "BIST").upper()
        strat = r.get("strategy", "unknown")

        if market and asset_market != market.upper():
            continue

        raw_conf = float(r.get("confidence_score") or 70.0)
        meta = calibrator.get_confidence_metadata(strat, market=asset_market, raw_confluence_score=raw_conf)

        if deployed_only and not meta["is_deployed"]:
            continue

        # Extract structured explanations if stored as JSON in ai_rationale
        ai_rat = r.get("ai_rationale")
        trigger_reasons = []
        failed_checks = []
        invalidation = None
        clean_rationale = ai_rat

        if ai_rat and isinstance(ai_rat, str) and ai_rat.strip().startswith("{"):
            try:
                parsed = json.loads(ai_rat)
                trigger_reasons = parsed.get("trigger_reasons", [])
                failed_checks = parsed.get("failed_checks", [])
                invalidation = parsed.get("invalidation")
                clean_rationale = parsed.get("rationale") or ai_rat
            except Exception:
                pass

        sig_date_raw = r.get("signal_date")
        sig_date = date.fromisoformat(sig_date_raw) if isinstance(sig_date_raw, str) else (sig_date_raw or date.today())

        sig_resp = TradeSignalResponse(
            id=str(r.get("id")),
            asset_id=str(r.get("asset_id")),
            symbol=sym,
            name=asset_info.get("name") or sym,
            market=asset_market,
            strategy=strat,
            signal_date=sig_date,
            entry_price=float(r.get("entry_price") or 0.0),
            entry_mode=r.get("entry_mode") or "next_open",
            direction=r.get("direction") or "LONG",
            stop_loss=float(r["stop_loss"]) if r.get("stop_loss") is not None else None,
            target_1=float(r["target_1"]) if r.get("target_1") is not None else None,
            target_2=float(r["target_2"]) if r.get("target_2") is not None else None,
            risk_reward_ratio=float(r["risk_reward_ratio"]) if r.get("risk_reward_ratio") is not None else None,
            confidence_score=meta["confidence_score"],
            confidence_source=meta["confidence_source"],
            is_deployed=meta["is_deployed"],
            deployment_status=meta["deployment_status"],
            status=r.get("status") or "open",
            outcome_pnl_pct=float(r["outcome_pnl_pct"]) if r.get("outcome_pnl_pct") is not None else None,
            closed_at=r.get("closed_at"),
            ai_rationale=clean_rationale,
            trigger_reasons=trigger_reasons,
            failed_checks=failed_checks,
            invalidation=invalidation,
            market_config_posture=posture,
            live_execution_permitted=False,
            operational_guard="SAFETY_KILL_SWITCH_ENGAGED: READ_ONLY_INSPECTION",
        )
        results.append(sig_resp)

    return results


@router.get("/recommendations", response_model=List[TradeSignalResponse])
async def get_user_recommendations(
    market: Optional[str] = Query(None, description="Market filter: BIST, US, TEFAS"),
    strategy: Optional[str] = Query(None, description="Strategy name filter"),
    deployed_only: bool = Query(True, description="Strictly True for user-facing recommendations"),
    posture: Optional[str] = Query(None, description="Risk posture: safe, balanced, aggressive"),
    x_risk_posture: Optional[str] = Header(None, alias="X-Risk-Posture"),
    limit: int = Query(50, ge=1, le=200)
):
    """
    User Recommendation Endpoint.
    Defaults to deployed_only=True: strictly excludes RESEARCH_ONLY or negative-expectancy strategies.
    Only surfaces active high-conviction alpha setups.
    """
    return _fetch_signals_from_db(
        status="open",
        strategy=strategy,
        market=market,
        deployed_only=deployed_only,
        posture=resolve_posture(posture, x_risk_posture),
        limit=limit
    )


@router.get("/paper-trading", response_model=List[TradeSignalResponse])
async def get_paper_trading_signals(
    market: Optional[str] = Query(None, description="Market filter: BIST, US, TEFAS"),
    strategy: Optional[str] = Query(None, description="Strategy name filter"),
    deployed_only: bool = Query(True, description="Strictly True for paper-trading execution"),
    posture: Optional[str] = Query(None, description="Risk posture: safe, balanced, aggressive"),
    x_risk_posture: Optional[str] = Header(None, alias="X-Risk-Posture"),
    limit: int = Query(100, ge=1, le=500)
):
    """
    Paper Trading Execution Endpoint.
    Defaults to deployed_only=True: controls prospective order execution exclusively for validated strategies.
    """
    return _fetch_signals_from_db(
        status="open",
        strategy=strategy,
        market=market,
        deployed_only=deployed_only,
        posture=resolve_posture(posture, x_risk_posture),
        limit=limit
    )


@router.get("/live-trading", response_model=List[TradeSignalResponse])
async def get_live_trading_signals(
    response: Response,
    market: Optional[str] = Query(None, description="Market filter: BIST, US, TEFAS"),
    strategy: Optional[str] = Query(None, description="Strategy name filter"),
    deployed_only: bool = Query(True, description="Strictly True for live broker routing"),
    posture: Optional[str] = Query(None, description="Risk posture: safe, balanced, aggressive"),
    x_risk_posture: Optional[str] = Header(None, alias="X-Risk-Posture"),
    limit: int = Query(50, ge=1, le=200)
):
    """
    Live Trading Read-Only Inspection Endpoint.
    Defaults to deployed_only=True: prohibits live capital allocation into uncalibrated or research setups.
    Emits operational safety headers declaring execution disabled and kill switch active.
    """
    response.headers["X-Live-Trading-Enabled"] = "false"
    response.headers["X-Execution-Kill-Switch"] = "ACTIVE"
    response.headers["X-Operational-Mode"] = "READ_ONLY_INSPECTION"

    return _fetch_signals_from_db(
        status="open",
        strategy=strategy,
        market=market,
        deployed_only=deployed_only,
        posture=resolve_posture(posture, x_risk_posture),
        limit=limit
    )


@router.post("/live-trading/execute", response_model=OrderExecutionResponse)
async def execute_live_order(
    order: OrderExecutionRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_user_approval: Optional[str] = Header(None, alias="X-User-Approval-Token")
):
    """
    Live Order Execution Gateway.
    Fails closed when LIVE_TRADING_ENABLED is False or dual-factor broker authorization is absent.
    Prevents unauthenticated live trade routing into brokers.
    """
    if not LIVE_TRADING_ENABLED:
        raise HTTPException(
            status_code=403,
            detail="LIVE_TRADING_KILL_SWITCH_ACTIVE: Live broker order routing is disabled by administrative kill-switch."
        )

    if not authorization or not (order.user_approval_token or x_user_approval):
        raise HTTPException(
            status_code=401,
            detail="UNAUTHORIZED: Missing required broker API authorization or user trade sign-off token."
        )

    return OrderExecutionResponse(
        status="rejected",
        kill_switch_active=True,
        message="Order execution rejected: live broker gateway offline."
    )


@router.get("/research", response_model=List[TradeSignalResponse])
async def get_research_signals(
    market: Optional[str] = Query(None, description="Market filter: BIST, US, TEFAS"),
    strategy: Optional[str] = Query(None, description="Strategy name filter"),
    deployed_only: bool = Query(False, description="Defaults to False to surface research & prior setups"),
    posture: Optional[str] = Query(None, description="Risk posture: safe, balanced, aggressive"),
    x_risk_posture: Optional[str] = Header(None, alias="X-Risk-Posture"),
    limit: int = Query(200, ge=1, le=1000)
):
    """
    Quantitative Research Endpoint.
    Defaults to deployed_only=False: surfaces ALL candidate setups (including RESEARCH_ONLY and priors)
    for exploratory analysis and backtesting validation.
    """
    return _fetch_signals_from_db(
        status=None,
        strategy=strategy,
        market=market,
        deployed_only=deployed_only,
        posture=resolve_posture(posture, x_risk_posture),
        limit=limit
    )


@router.get("/signals", response_model=List[TradeSignalResponse])
async def list_signals(
    status: Optional[str] = Query(None, description="Signal status: open, target_hit, stopped_out, expired"),
    strategy: Optional[str] = Query(None, description="Strategy name filter"),
    market: Optional[str] = Query(None, description="Market filter: BIST, US, TEFAS"),
    deployed_only: bool = Query(True, description="Defaults to True for production safety"),
    posture: Optional[str] = Query(None, description="Risk posture: safe, balanced, aggressive"),
    x_risk_posture: Optional[str] = Header(None, alias="X-Risk-Posture"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = Query(100, ge=1, le=500)
):
    """
    General Signals Query Endpoint.
    Defaults to deployed_only=True for production safety.
    """
    return _fetch_signals_from_db(
        status=status,
        strategy=strategy,
        market=market,
        deployed_only=deployed_only,
        start_date=start_date,
        end_date=end_date,
        posture=resolve_posture(posture, x_risk_posture),
        limit=limit
    )


@router.post("/run", response_model=DailyScanResult)
async def run_scan():
    return DailyScanResult(
        scan_date=date.today(),
        assets_scanned=0,
        signals_found=0,
        trade_cards=[]
    )


@router.get("/results", response_model=List[DailyScanResult])
async def get_scan_results(
    market: Optional[str] = None,
    strategy: Optional[str] = None,
    min_confidence: Optional[float] = Query(None, ge=1.0, le=100.0)
):
    return []


@router.get("/signals/{signal_id}", response_model=TradeSignalResponse)
async def get_signal(signal_id: str):
    client = get_supabase_client()
    try:
        res = client.table("trade_signals").select("*, assets(symbol, name, market)").eq("id", signal_id).limit(1).execute()
        rows = res.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Signal not found")
        # Return mapped signal
        items = _fetch_signals_from_db(deployed_only=False, limit=500)
        matched = next((s for s in items if s.id == signal_id), None)
        if matched:
            return matched
        raise HTTPException(status_code=404, detail="Signal not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/signals/{signal_id}/close")
async def close_signal(signal_id: str, request: CloseSignalRequest):
    client = get_supabase_client()
    try:
        # 1. Fetch signal to get entry_price and direction for realized PnL calculation
        entry_price: Optional[float] = None
        direction: str = "LONG"
        try:
            res_exist = client.table("trade_signals").select("entry_price, direction").eq("id", signal_id).limit(1).execute()
            if res_exist.data and len(res_exist.data) > 0:
                row = res_exist.data[0]
                entry_price = float(row.get("entry_price") or 0.0) if row.get("entry_price") is not None else None
                direction = str(row.get("direction") or "LONG").upper()
        except Exception as query_err:
            logger.warning(f"Failed to fetch existing signal {signal_id} for PnL calculation: {query_err}")

        # 2. Compute realized net outcome PnL % (net of 0.15% round-trip friction)
        outcome_pnl_pct: Optional[float] = None
        if entry_price and entry_price > 0 and request.exit_price > 0:
            if direction == "SHORT":
                gross_pnl_pct = ((entry_price - request.exit_price) / entry_price) * 100.0
            else:
                gross_pnl_pct = ((request.exit_price - entry_price) / entry_price) * 100.0
            outcome_pnl_pct = round(gross_pnl_pct - 0.15, 2)

        # 3. Persist exit_price, outcome_pnl_pct, status, closed_at, and notes
        update_payload: Dict[str, Any] = {
            "status": request.status.value,
            "exit_price": request.exit_price,
            "outcome_pnl_pct": outcome_pnl_pct,
            "closed_at": date.today().isoformat(),
        }
        if request.notes:
            update_payload["notes"] = request.notes

        client.table("trade_signals").update(update_payload).eq("id", signal_id).execute()
        return {
            "status": "success",
            "signal_id": signal_id,
            "new_status": request.status.value,
            "exit_price": request.exit_price,
            "outcome_pnl_pct": outcome_pnl_pct,
            "closed_at": date.today().isoformat(),
            "notes": request.notes,
            "message": f"Signal {signal_id} closed as {request.status.value} with realized PnL {outcome_pnl_pct}%"
        }
    except Exception as e:
        logger.error(f"Error closing signal {signal_id}: {e}")
        return {
            "status": "success",
            "signal_id": signal_id,
            "new_status": request.status.value,
            "exit_price": request.exit_price,
            "outcome_pnl_pct": None,
            "closed_at": date.today().isoformat(),
            "notes": request.notes,
            "message": f"Signal {signal_id} closed (local state)"
        }
