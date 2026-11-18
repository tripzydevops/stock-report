"""
Pipeline Retention & Liveness Health Monitor.
Checks report recency, storage accessibility, data freshness, and trade signal availability across Supabase.
Supports autonomous self-healing via --auto-heal.
Usage:
    python scripts/check_pipeline_health.py [--max-age-hours 36] [--auto-heal]
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


def check_pipeline_health(max_age_hours: int = 36, auto_heal: bool = False) -> int:
    print("=" * 60)
    print("🩺 MARKETPULSE PIPELINE LIVENESS & RETENTION MONITOR")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"Auto-Heal Mode: {'ENABLED' if auto_heal else 'DISABLED'}")
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

    # 3. Check Trade Signal Liveness & Freshness (Critical Engine Check)
    print("\n3️⃣ Checking active trade signals pool & freshness...")
    try:
        open_res = client.table("trade_signals").select("id, signal_date, created_at").eq("status", "open").order("created_at", desc=True).limit(10).execute()
        open_signals = open_res.data or []
        open_count = len(open_signals)
        print(f"  ✓ Open trade signals count: {open_count}")

        if open_count == 0:
            health_issues.append("CRITICAL: There are 0 active trade signals in the open pool! Scanner may be stalled.")
            print("  ❌ CRITICAL: 0 open trade signals found.")
        else:
            latest_signal = open_signals[0]
            created_str = latest_signal.get("created_at")
            if created_str:
                sig_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                sig_age_hours = (now - sig_dt).total_seconds() / 3600.0
                is_weekend = now.weekday() in (5, 6)
                threshold_hours = 96 if is_weekend else max_age_hours
                print(f"  ✓ Latest signal created: {created_str} ({sig_age_hours:.1f}h ago, Threshold: {threshold_hours}h)")

                if sig_age_hours > threshold_hours:
                    health_issues.append(
                        f"Trade signals are stale: {sig_age_hours:.1f}h old (exceeds {threshold_hours}h threshold)."
                    )
    except Exception as err:
        health_issues.append(f"Failed to check trade signals: {err}")
        print(f"  ❌ Trade signals query error: {err}")

    # 4. Final Evaluation & Autonomous Self-Healing
    print("\n" + "=" * 60)
    if health_issues:
        print("❌ PIPELINE HEALTH ISSUES DETECTED:")
        for issue in health_issues:
            print(f"  • {issue}")

        if auto_heal:
            print("\n⚡ [AUTO-HEAL] Launching autonomous self-healing routine (app.cron_daily_job.run_daily_pipeline)...")
            try:
                from app.cron_daily_job import run_daily_pipeline
                run_daily_pipeline()
                print("✓ Autonomous self-healing execution finished. Re-verifying health state...")
                # Re-check without infinite auto-heal recursion
                return check_pipeline_health(max_age_hours=max_age_hours, auto_heal=False)
            except Exception as heal_err:
                print(f"❌ Autonomous self-healing failed: {heal_err}")
                print("=" * 60)
                return 1

        print("=" * 60)
        return 1

    print("✅ PIPELINE HEALTH IS OPTIMAL. All data streams, reports, and trade signals are active and live.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MarketPulse Pipeline Health Monitor")
    parser.add_argument("--max-age-hours", type=int, default=36, help="Maximum allowed report age in hours")
    parser.add_argument("--auto-heal", action="store_true", help="Automatically trigger self-healing pipeline if issues are detected")
    args = parser.parse_args()
    sys.exit(check_pipeline_health(max_age_hours=args.max_age_hours, auto_heal=args.auto_heal))
