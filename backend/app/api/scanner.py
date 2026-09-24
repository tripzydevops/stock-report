from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from datetime import date
from pydantic import BaseModel
from app.models.schemas import DailyScanResult, TradeSignalCreate, StrategyName, Market, SignalStatus

router = APIRouter(prefix="/scan", tags=["scanner"])

class CloseSignalRequest(BaseModel):
    status: SignalStatus
    exit_price: float
    notes: Optional[str] = None

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
    market: Optional[Market] = None,
    strategy: Optional[StrategyName] = None,
    min_confidence: Optional[float] = Query(None, ge=1.0, le=10.0)
):
    return []

@router.get("/signals", response_model=List[TradeSignalCreate])
async def list_signals(
    status: Optional[SignalStatus] = None,
    strategy: Optional[StrategyName] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    return []

@router.get("/signals/{signal_id}", response_model=TradeSignalCreate)
async def get_signal(signal_id: str):
    raise HTTPException(status_code=404, detail="Signal not found")

@router.put("/signals/{signal_id}/close")
async def close_signal(signal_id: str, request: CloseSignalRequest):
    return {"status": "success", "message": f"Signal {signal_id} closed as {request.status.value}"}
