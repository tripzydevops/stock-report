from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from datetime import date
from app.services.report_storage import (
    get_latest_report,
    list_reports,
    get_signed_download_url,
    DEFAULT_REPORT_TYPE
)
from app.core.database import get_supabase_client
from app.models.schemas import ReportFileResponse

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/latest", response_model=ReportFileResponse)
def fetch_latest_report(report_type: str = Query(DEFAULT_REPORT_TYPE, description="Report type identifier")):
    """Get metadata and short-lived signed download URL for the latest report snapshot."""
    report = get_latest_report(report_type)
    if not report:
        raise HTTPException(status_code=404, detail=f"No latest report found for type '{report_type}'")
    return report


@router.get("", response_model=List[ReportFileResponse])
def fetch_report_history(
    from_date: Optional[date] = Query(None, alias="from", description="Filter from trading date YYYY-MM-DD"),
    to_date: Optional[date] = Query(None, alias="to", description="Filter to trading date YYYY-MM-DD"),
    report_type: str = Query(DEFAULT_REPORT_TYPE, description="Report type identifier"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """List paginated historical reports with short-lived download URLs."""
    from_str = from_date.isoformat() if from_date else None
    to_str = to_date.isoformat() if to_date else None
    return list_reports(from_date=from_str, to_date=to_str, report_type=report_type, limit=limit, offset=offset)


@router.get("/{report_id}", response_model=ReportFileResponse)
def fetch_specific_report(report_id: str):
    """Retrieve metadata and download URL for a specific report by UUID."""
    client = get_supabase_client()
    res = client.table("report_files").select("*").eq("id", report_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail=f"Report with id '{report_id}' not found")

    report = res.data[0]
    report["download_url"] = get_signed_download_url(report["storage_path"], client=client)
    return report
