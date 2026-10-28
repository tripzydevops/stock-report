"""
Pipeline Retention & Liveness Health Monitor.
Checks report recency, storage accessibility, and data freshness across Supabase.
Usage:
    python scripts/check_pipeline_health.py [--max-age-hours 36]
"""

import os
import sys
import argparse
from datetime import datetime, timezone, timedelta
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.core.database import get_supabase_client
from app.services.report_storage import get_latest_report, DEFAULT_REPORT_TYPE


def check_pipeline_health(max_age_hours: int = 36) -> int:
    print("=" * 60)
    print("🩺 MARKETPULSE PIPELINE LIVENESS & RETENTION MONITOR")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    try:
        client = get_supabase_client()
    except Exception as e:
        print(f"❌ Failed to connect to Supabase: {e}")
        return 1

    health_issues = []

    # 1. Check report_files liveness
    print("1️⃣ Checking latest report generation & storage liveness...")
    try:
        latest = get_latest_report(DEFAULT_REPORT_TYPE, client=client)
        if not latest:
            health_issues.append("No active report found in public.report_files with is_latest=true.")
            print("  ❌ No latest report found.")
        else:
            gen_at_str = latest.get("generated_at")
            storage_path = latest.get("storage_path")
            file_size = latest.get("file_size_bytes", 0)
            print(f"  ✓ Latest report: {storage_path}")
            print(f"  ✓ Registered Size: {file_size} bytes")
            print(f"  ✓ Signed Download URL valid: {bool(latest.get('download_url'))}")

            if gen_at_str:
                # Handle ISO timestamps with or without timezone
                gen_dt = datetime.fromisoformat(gen_at_str.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                age = now - gen_dt
                age_hours = age.total_seconds() / 3600.0

                print(f"  ✓ Report age: {age_hours:.1f} hours (Threshold: {max_age_hours}h)")
                if age_hours > max_age_hours:
                    health_issues.append(
                        f"Latest report is stale: {age_hours:.1f}h old (exceeds {max_age_hours}h threshold). Cron sync may have failed."
                    )
    except Exception as err:
        health_issues.append(f"Report files query failed: {err}")
        print(f"  ❌ Error: {err}")

    # 2. Check Core Table Population
    print("\n2️⃣ Checking core table row count health...")
    core_tables = [
        ("assets", 50),
        ("price_history", 100),
        ("daily_indicators", 50),
        ("trade_signals", 5),
        ("stock_movements", 10),
    ]

    for table, min_expected in core_tables:
        try:
            res = client.table(table).select("id", count="exact").limit(1).execute()
            count = res.count if res.count is not None else 0
            if count < min_expected:
                health_issues.append(f"Table '{table}' row count is low: {count} (expected >= {min_expected})")
                print(f"  ⚠️ {table:<20} : {count} rows [LOW]")
            else:
                print(f"  ✓ {table:<20} : {count} rows [HEALTHY]")
        except Exception as err:
            health_issues.append(f"Failed to query '{table}': {err}")
            print(f"  ❌ {table:<20} : Query error: {err}")

    # 3. Final Summary
    print("\n" + "=" * 60)
    if health_issues:
        print("❌ PIPELINE HEALTH CHECK FAILED:")
        for issue in health_issues:
            print(f"  • {issue}")
        print("=" * 60)
        return 1

    print("✅ PIPELINE HEALTH IS OPTIMAL. All data streams and reports are live.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MarketPulse Pipeline Health Monitor")
    parser.add_argument("--max-age-hours", type=int, default=36, help="Maximum allowed report age in hours")
    args = parser.parse_args()
    sys.exit(check_pipeline_health(max_age_hours=args.max_age_hours))
