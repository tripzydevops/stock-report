from fastapi import APIRouter, HTTPException, status
from typing import List, Optional
import math
from pydantic import BaseModel, Field, field_validator
from app.models.schemas import AssetResponse

router = APIRouter(tags=["portfolio"])

class WatchlistItem(BaseModel):
    id: str
    asset_id: str
    asset: Optional[AssetResponse] = None
    latest_price: Optional[float] = None
    added_at: str

class WatchlistAddRequest(BaseModel):
    asset_id: str

class Position(BaseModel):
    id: str
    asset_id: str
    shares: int
    entry_price: float
    current_price: Optional[float] = None
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    notes: Optional[str] = None

class PositionAddRequest(BaseModel):
    asset_id: str
    shares: int = Field(..., gt=0, description="Quantity of shares must be strictly positive (> 0)")
    entry_price: float = Field(..., gt=0, description="Entry price must be strictly positive and finite (> 0)")
    stop_loss: Optional[float] = Field(None, gt=0)
    target: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = None

    @field_validator("entry_price")
    @classmethod
    def validate_entry_price(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0:
            raise ValueError("Entry price must be a finite, strictly positive number (reject zero, negative, or nonfinite prices)")
        return v

    @field_validator("shares")
    @classmethod
    def validate_shares(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Shares must be strictly positive (> 0)")
        return v

class PositionUpdateRequest(BaseModel):
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    notes: Optional[str] = None

class PortfolioSummary(BaseModel):
    total_value_usd: float
    total_value_try: float
    open_positions_count: int

@router.get("/watchlist", response_model=List[WatchlistItem])
async def list_watchlist():
    return []

@router.post("/watchlist", response_model=WatchlistItem, status_code=status.HTTP_201_CREATED)
async def add_to_watchlist(request: WatchlistAddRequest):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.delete("/watchlist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(item_id: str):
    pass

@router.get("/portfolio", response_model=List[Position])
async def list_portfolio():
    return []

@router.post("/portfolio", response_model=Position, status_code=status.HTTP_201_CREATED)
async def add_position(request: PositionAddRequest):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.put("/portfolio/{position_id}", response_model=Position)
async def update_position(position_id: str, request: PositionUpdateRequest):
    raise HTTPException(status_code=501, detail="Not implemented")

@router.get("/portfolio/summary", response_model=PortfolioSummary)
async def get_portfolio_summary():
    return PortfolioSummary(total_value_usd=0.0, total_value_try=0.0, open_positions_count=0)
