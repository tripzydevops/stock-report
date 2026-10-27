import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from datetime import datetime, timezone
from app.core.database import get_supabase_client
from app.services.report_storage import validate_report_file, BUCKET_NAME

def archive_legacy_report():
    file_path = Path("MarketPulse_Report_20260923_1058.xlsx")
    if not file_path.exists():
        print(f"File {file_path} not found.")
        return

    val = validate_report_file(file_path)
    print(f"Validation: valid={val.get('valid')}, size={val.get('file_size')}, rows={val.get('row_count')}")
    if not val.get("valid"):
        print("Validation failed, but archiving anyway for history.")

    client = get_supabase_client()
    storage_path = "2026/09/23/MarketPulse_Report_20260923_1058.xlsx"
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    try:
        client.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "upsert": "false"}
        )
        print("Uploaded to Supabase Storage successfully at:", storage_path)
    except Exception as e:
        print(f"Storage upload note (may already exist): {e}")

    # Register in report_files (is_latest=False)
    record = {
        "report_type": "marketpulse_daily",
        "storage_path": storage_path,
        "trading_date": "2026-09-23",
        "generated_at": "2026-09-23T10:58:00+00:00",
        "file_size_bytes": file_path.stat().st_size,
        "row_count": val.get("row_count", 0),
        "checksum_sha256": val.get("checksum", ""),
        "is_latest": False
    }

    try:
        # Check if record already exists
        existing = client.table("report_files").select("id").eq("storage_path", storage_path).execute()
        if existing.data:
            print("Record already exists in report_files:", existing.data)
        else:
            res = client.table("report_files").insert(record).execute()
            print("DB insert succeeded:", res.data)
    except Exception as e:
        print(f"DB insert note: {e}")

if __name__ == "__main__":
    archive_legacy_report()
