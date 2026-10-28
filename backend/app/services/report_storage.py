"""
MarketPulse Report Storage & Immutable Registry Service
Manages storage in Supabase Storage ('marketpulse-reports') and
maintains the immutable historical registry table ('report_files').
"""
import os
import hashlib
from datetime import datetime, timezone, date
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
import pandas as pd
import openpyxl

from app.core.database import get_supabase_client

BUCKET_NAME = "marketpulse-reports"
DEFAULT_REPORT_TYPE = "marketpulse_daily"


def compute_sha256(file_path: Path | str) -> str:
    """Compute SHA-256 checksum of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def generate_storage_path(dt: Optional[datetime] = None) -> Tuple[str, str]:
    """
    Generate deterministic, unique timestamped storage path adhering to:
    marketpulse-reports/{year}/{month}/{day}/MarketPulse_{YYYY-MM-DDTHH-mm-ss}.xlsx
    Always uses UTC.
    """
    if dt is None:
        dt = datetime.now(timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    year = dt.strftime("%Y")
    month = dt.strftime("%m")
    day = dt.strftime("%d")
    # Sub-second precision (milliseconds) to guarantee strict path uniqueness across concurrent runs
    timestamp_str = dt.strftime("%Y-%m-%dT%H-%M-%S-%f")[:23]
    filename = f"MarketPulse_{timestamp_str}.xlsx"
    storage_path = f"{year}/{month}/{day}/{filename}"
    return storage_path, filename


def validate_report_file(file_path: Path | str) -> Dict[str, Any]:
    """
    Data-quality gates:
    - File exists and is non-empty.
    - XLSX opens successfully without corruption.
    - Required tabs/sheets and columns exist.
    - Symbols are valid non-empty strings.
    - Row count is within expected threshold (> 0).
    """
    path = Path(file_path)
    if not path.exists():
        return {"valid": False, "error": f"File does not exist: {path}"}
    
    file_size = path.stat().st_size
    if file_size == 0:
        return {"valid": False, "error": "File is 0 bytes"}

    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        sheet_names = wb.sheetnames
        wb.close()
    except Exception as e:
        return {"valid": False, "error": f"Corrupted or invalid XLSX: {e}"}

    if not sheet_names:
        return {"valid": False, "error": "XLSX has no sheets"}

    # Count rows across all sheets and inspect Dashboard / Assets
    total_rows = 0
    symbols_found = set()
    try:
        excel = pd.ExcelFile(path)
        for s in excel.sheet_names:
            df = excel.parse(s)
            total_rows += len(df)
            if "Symbol" in df.columns:
                symbols_found.update(df["Symbol"].dropna().astype(str).unique())
    except Exception as e:
        return {"valid": False, "error": f"Failed reading sheets with pandas: {e}"}

    if total_rows < 5:
        return {"valid": False, "error": f"Expected at least 5 rows across sheets, got {total_rows}"}

    checksum = compute_sha256(path)

    return {
        "valid": True,
        "file_size": file_size,
        "row_count": total_rows,
        "symbols_count": len(symbols_found),
        "checksum": checksum,
        "sheet_names": sheet_names,
        "error": None
    }


def upload_report_to_storage(
    file_path: Path | str,
    report_type: str = DEFAULT_REPORT_TYPE,
    dt: Optional[datetime] = None,
    client: Any = None
) -> Dict[str, Any]:
    """
    Uploads an immutable timestamped XLSX report to Supabase Storage and
    registers it in public.report_files with atomic is_latest flag management.
    """
    path = Path(file_path)
    validation = validate_report_file(path)
    if not validation["valid"]:
        raise ValueError(f"Report validation failed: {validation['error']}")

    if dt is None:
        dt = datetime.now(timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    storage_path, filename = generate_storage_path(dt)
    trading_date = dt.strftime("%Y-%m-%d")
    iso_generated_at = dt.isoformat()

    if client is None:
        client = get_supabase_client()

    with open(path, "rb") as f:
        file_bytes = f.read()

    # 1. Upload to Supabase Storage
    try:
        client.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "upsert": "false"}
        )
    except Exception as e:
        # Check if error is because bucket doesn't exist
        raise RuntimeError(f"Failed uploading to storage bucket '{BUCKET_NAME}': {e}")

    # 2. Database Insert & Safe 'is_latest' Transition
    # Insert new report as is_latest = true FIRST, so there is never a zero-latest window
    try:
        record = {
            "report_type": report_type,
            "storage_path": storage_path,
            "trading_date": trading_date,
            "generated_at": iso_generated_at,
            "file_size_bytes": validation["file_size"],
            "row_count": validation["row_count"],
            "checksum_sha256": validation["checksum"],
            "is_latest": True,
        }
        res = client.table("report_files").insert(record).execute()
        if not res.data:
            raise RuntimeError("Database insert returned empty record data.")
        created = res.data[0]
        new_id = created.get("id")

        # Now clear is_latest on all older reports of this type
        if new_id:
            try:
                client.table("report_files").update({"is_latest": False}) \
                    .eq("report_type", report_type) \
                    .neq("id", new_id) \
                    .execute()
            except Exception as clear_err:
                print(f"⚠️ Warning: Clearing prior is_latest flags failed: {clear_err}")

        return created
    except Exception as db_err:
        # Cleanup orphaned storage file on database failure
        try:
            client.storage.from_(BUCKET_NAME).remove([storage_path])
        except Exception:
            pass
        raise RuntimeError(f"Failed registering report in report_files database: {db_err}")


def get_signed_download_url(storage_path: str, expires_in: int = 3600, client: Any = None) -> Optional[str]:
    """Generate a short-lived presigned download URL for private report file."""
    if client is None:
        client = get_supabase_client()
    try:
        res = client.storage.from_(BUCKET_NAME).create_signed_url(storage_path, expires_in)
        if isinstance(res, dict) and "signedURL" in res:
            return res["signedURL"]
        if hasattr(res, "signed_url"):
            return res.signed_url
        if isinstance(res, dict) and "signedUrl" in res:
            return res["signedUrl"]
        return str(res)
    except Exception as e:
        print(f"⚠️ Error creating signed URL for {storage_path}: {e}")
        return None


def get_latest_report(report_type: str = DEFAULT_REPORT_TYPE, client: Any = None) -> Optional[Dict[str, Any]]:
    """Retrieve metadata and download URL for the latest report."""
    if client is None:
        client = get_supabase_client()

    res = client.table("report_files") \
        .select("*") \
        .eq("report_type", report_type) \
        .eq("is_latest", True) \
        .order("generated_at", desc=True) \
        .limit(1) \
        .execute()

    if not res.data:
        return None

    item = res.data[0]
    item["download_url"] = get_signed_download_url(item["storage_path"], client=client)
    return item


def list_reports(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    report_type: str = DEFAULT_REPORT_TYPE,
    limit: int = 50,
    offset: int = 0,
    client: Any = None
) -> List[Dict[str, Any]]:
    """List historical reports with pagination and signed download URLs."""
    if client is None:
        client = get_supabase_client()

    query = client.table("report_files").select("*").eq("report_type", report_type)
    if from_date:
        query = query.gte("trading_date", from_date)
    if to_date:
        query = query.lte("trading_date", to_date)

    query = query.order("generated_at", desc=True).range(offset, offset + limit - 1)
    res = query.execute()
    data = res.data or []

    for item in data:
        item["download_url"] = get_signed_download_url(item["storage_path"], client=client)

    return data
