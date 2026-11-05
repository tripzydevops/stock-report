from fastapi import APIRouter, Query
from typing import List
from app.models.schemas import MarketRegimeResponse, Market

from datetime import date as dt_date
from app.services.market_regime import get_all_regimes

router = APIRouter(prefix="/regime", tags=["regime"])

@router.get("/current", response_model=List[MarketRegimeResponse])
async def get_current_regime():
    regimes = get_all_regimes()
    result = []
    for m_key, r_data in regimes.items():
        if r_data and 'regime' in r_data and r_data['regime'] != 'Unknown':
            result.append(
                MarketRegimeResponse(
                    market=Market(m_key),
                    date=dt_date.today(),
                    regime=r_data['regime'].upper(),
                    index_close=float(r_data.get('index_close', 0.0)),
                    ema_50=float(r_data.get('ema_50', 0.0)),
                    ema_200=float(r_data.get('ema_200', 0.0)),
                    notes=r_data.get('notes')
                )
            )
    return result

@router.get("/history", response_model=List[MarketRegimeResponse])
async def get_regime_history(
    market: Market,
    days: int = Query(30, ge=1, le=365)
):
    return []
