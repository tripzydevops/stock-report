from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from datetime import date
from app.core.database import get_supabase_client
from app.models.schemas import StockMovementResponse

router = APIRouter(prefix="/movements", tags=["movements"])


@router.get("", response_model=List[StockMovementResponse])
def fetch_stock_movements(
    symbol: Optional[str] = Query(None, description="Filter by stock ticker symbol (e.g. ASELS, THYAO, AAPL)"),
    from_date: Optional[date] = Query(None, alias="from", description="Filter from movement date YYYY-MM-DD"),
    to_date: Optional[date] = Query(None, alias="to", description="Filter to movement date YYYY-MM-DD"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Retrieve normalized historical stock movements with signals and scores for quantitative analysis."""
    client = get_supabase_client()
    
    asset_id = None
    if symbol:
        clean_sym = symbol.strip().upper()
        # Find asset id
        asset_res = client.table("assets").select("id, symbol").or_(f"symbol.eq.{clean_sym},symbol.eq.{clean_sym}.IS").limit(1).execute()
        if asset_res.data:
            asset_id = asset_res.data[0]["id"]
        else:
            # Symbol not found in registered assets
            return []

    query = client.table("stock_movements").select("*, assets(symbol, name, market)")
    if asset_id:
        query = query.eq("asset_id", asset_id)
    if from_date:
        query = query.gte("movement_time", from_date.isoformat())
    if to_date:
        query = query.lte("movement_time", f"{to_date.isoformat()}T23:59:59Z")

    query = query.order("movement_time", desc=True).range(offset, offset + limit - 1)
    res = query.execute()

    out = []
    for row in res.data or []:
        asset_info = row.get("assets") or {}
        out.append({
            "id": row["id"],
            "asset_id": row["asset_id"],
            "symbol": asset_info.get("symbol"),
            "name": asset_info.get("name"),
            "market": asset_info.get("market"),
            "movement_time": row["movement_time"],
            "direction": row.get("direction"),
            "change_amount": row.get("change_amount"),
            "change_pct": row.get("change_pct"),
            "signal": row.get("signal"),
            "score": row.get("score"),
            "metadata": row.get("metadata"),
            "report_file_id": row.get("report_file_id"),
            "created_at": row["created_at"],
        })

    return out
