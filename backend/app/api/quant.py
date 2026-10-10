"""
MarketPulse Institutional Quantitative API Router
Endpoints for Statistical Arbitrage Pairs Trading, Cross-Sectional Factor Rankings,
and Volatility-Targeted Risk Allocation.
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Dict, List, Optional
import pandas as pd
from datetime import datetime, date

from app.core.database import get_supabase_client
from app.services.pairs_trading_engine import scan_pairs_opportunities, BIST_PAIRS
from app.services.quant_factor_engine import compute_cross_sectional_factors
from app.services.risk_manager import (
    calculate_position_size,
    calculate_risk_budgeted_size,
    calculate_volatility_targeted_size
)

router = APIRouter(prefix="/quant", tags=["quant"])

class PositionSizingComparisonRequest(BaseModel):
    entry_price: float
    stop_loss: float
    fixed_capital_try: float = 1000.0
    risk_budget_try: float = 150.0
    account_size_try: float = 100000.0
    target_vol_pct: float = 15.0
    asset_annual_vol_pct: float = 35.0

@router.get("/pairs")
async def get_pairs_trading_opportunities():
    """
    Returns live Statistical Arbitrage Pairs Trading setups across Borsa Istanbul.
    Computes spread Z-score, Ornstein-Uhlenbeck half-life, and Long/Short execution legs.
    """
    sb = get_supabase_client()
    # Collect symbols needed for canonical pairs
    needed_symbols = set()
    for p in BIST_PAIRS:
        needed_symbols.add(p["leg_a"])
        needed_symbols.add(p["leg_b"])

    # Load asset IDs
    a_res = sb.table("assets").select("id, symbol").in_("symbol", list(needed_symbols)).execute()
    asset_map = {row["symbol"]: row["id"] for row in (a_res.data or [])}

    if not asset_map:
        return {"pairs": [], "total_pairs_tracked": len(BIST_PAIRS), "message": "No asset price history found."}

    # Fetch last 90 price bars for each pair asset
    asset_data = {}
    for sym, aid in asset_map.items():
        p_res = sb.table("price_history").select("date, close").eq("asset_id", aid).order("date", desc=True).limit(90).execute()
        rows = p_res.data or []
        if rows:
            # Sort ascending by date
            rows.reverse()
            df = pd.DataFrame(rows)
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            asset_data[sym] = df

    pairs_results = scan_pairs_opportunities(asset_data, lookback=60)
    
    # Summary metrics
    active_signals = [p for p in pairs_results if p["direction"] in ["LONG_SPREAD", "SHORT_SPREAD"]]
    watchlist_signals = [p for p in pairs_results if p["direction"] == "WATCHLIST"]

    return {
        "status": "success",
        "as_of": date.today().isoformat(),
        "total_pairs_tracked": len(BIST_PAIRS),
        "active_arbitrage_setups": len(active_signals),
        "watchlist_setups": len(watchlist_signals),
        "pairs": pairs_results
    }

@router.get("/factors")
async def get_factor_rankings(
    min_percentile: Optional[float] = Query(None, description="Filter for top percentiles e.g. 80.0")
):
    """
    Returns universe cross-sectional factor rankings (Momentum, Volatility, Volume Surge, Composite Alpha).
    """
    sb = get_supabase_client()
    a_res = sb.table("assets").select("id, symbol, name").eq("is_active", True).execute()
    assets = a_res.data or []
    id_to_sym = {row["id"]: row["symbol"] for row in assets}

    if not assets:
        return {"factors": []}

    # Fetch last 40 price bars for active assets to compute factors
    asset_data = {}
    for aid, sym in id_to_sym.items():
        p_res = sb.table("price_history").select("date, close, volume").eq("asset_id", aid).order("date", desc=True).limit(40).execute()
        rows = p_res.data or []
        if len(rows) >= 22:
            rows.reverse()
            df = pd.DataFrame(rows)
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            asset_data[sym] = df

    factor_dict = compute_cross_sectional_factors(asset_data)
    factor_list = list(factor_dict.values())
    factor_list.sort(key=lambda x: x["percentile_rank"], reverse=True)

    if min_percentile is not None and isinstance(min_percentile, (int, float)):
        factor_list = [f for f in factor_list if f["percentile_rank"] >= min_percentile]

    return {
        "status": "success",
        "assets_evaluated": len(factor_list),
        "rankings": factor_list
    }

@router.post("/position-size-compare")
async def compare_position_sizing(req: PositionSizingComparisonRequest):
    """
    Compares Retail Fixed Capital vs Institutional Risk-Budgeting vs Volatility-Targeted sizing.
    """
    # 1. Retail: Fixed ₺1,000 capital
    fixed_shares = int(req.fixed_capital_try / req.entry_price) if req.entry_price > 0 else 0
    fixed_val = fixed_shares * req.entry_price
    risk_per_share = abs(req.entry_price - req.stop_loss)
    fixed_risk_try = fixed_shares * risk_per_share

    # 2. Institutional: Fixed Risk Budget (₺150 max loss)
    risk_budgeted = calculate_risk_budgeted_size(
        risk_budget_try=req.risk_budget_try,
        entry_price=req.entry_price,
        stop_loss=req.stop_loss
    )

    # 3. Institutional: Volatility Targeted (Risk-Parity)
    vol_targeted = calculate_volatility_targeted_size(
        account_size=req.account_size_try,
        target_vol_pct=req.target_vol_pct,
        asset_annual_vol_pct=req.asset_annual_vol_pct,
        entry_price=req.entry_price
    )

    return {
        "entry_price": req.entry_price,
        "stop_loss": req.stop_loss,
        "risk_per_share": round(risk_per_share, 2),
        "stop_loss_pct": round((risk_per_share / req.entry_price) * 100, 2) if req.entry_price > 0 else 0,
        "retail_fixed_capital": {
            "mode": "Sabit Sermaye (Per-Trade Capital)",
            "allotted_capital": req.fixed_capital_try,
            "shares": fixed_shares,
            "position_value": round(fixed_val, 2),
            "effective_loss_at_stop": round(fixed_risk_try, 2)
        },
        "institutional_risk_budget": {
            "mode": "Kurumsal Risk Bütçesi (Risk-Parity Fixed Loss)",
            "risk_budget": req.risk_budget_try,
            "shares": risk_budgeted["shares_to_buy"],
            "position_value": risk_budgeted["position_value"],
            "effective_loss_at_stop": risk_budgeted["effective_loss_at_stop"]
        },
        "institutional_volatility_target": {
            "mode": "AQR Volatilite Hedefleme (Inverse Vol)",
            "account_size": req.account_size_try,
            "portfolio_weight_pct": vol_targeted["weight_pct"],
            "shares": vol_targeted["shares_to_buy"],
            "position_value": vol_targeted["position_value"]
        }
    }
