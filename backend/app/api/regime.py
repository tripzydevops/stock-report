from fastapi import APIRouter, Query
from typing import List
from app.models.schemas import MarketRegimeResponse, Market

router = APIRouter(prefix="/regime", tags=["regime"])

@router.get("/current", response_model=List[MarketRegimeResponse])
async def get_current_regime():
    return []

@router.get("/history", response_model=List[MarketRegimeResponse])
async def get_regime_history(
    market: Market,
    days: int = Query(30, ge=1, le=365)
):
    return []
