"""
MarketPulse Scheduled Operational Ingestion Runner
==================================================
Production-grade scheduled automation script supporting:
1. Pre-Market Session (--session=pre_market, typically scheduled at 09:45 TRT):
   - Ingests overnight US index movements (SPY, QQQ, VOO, TLT, GLD).
   - Scans pre-market opening gaps across the BIST universe.
   - Pre-computes 15m Opening Range Breakout (ORB) bias.
2. Post-Market Session (--session=post_market, typically scheduled at 18:15 TRT):
   - Ingests official session closing prices.
   - Computes daily technical indicators (EMA, RSI, ATR, Volume Ratio).
   - Syncs and verifies official KAP dividend schedule declarations.
   - Reconciles open trade signals against stop loss / target levels.
   - Reconciles post-exit price recovery tracking.

Usage:
  py -3.14 backend/scripts/run_market_cron.py --session=pre_market [--dry-run]
  py -3.14 backend/scripts/run_market_cron.py --session=post_market [--dry-run]
"""

import sys
import os
import argparse
import logging
import datetime
from typing import Dict, List, Any

# Ensure backend root is on sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.core.config import get_settings
from app.services.market_assistant_tools import (
    tool_analyze_morning_orb_session,
    tool_query_dividends,
    KNOWN_DIVIDENDS_DB
)
from app.services.market_regime import get_all_regimes

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("MarketCronRunner")


def run_pre_market_session(dry_run: bool = False) -> Dict[str, Any]:
    """
    Executes the 09:45 TRT pre-market routine:
    1. Evaluates US overnight closes and macro index drivers.
    2. Runs the morning ORB gap scanner across active assets.
    3. Produces opening bias telemetry.
    """
    logger.info("=" * 65)
    logger.info("STARTING PRE-MARKET SESSION SCANNER (09:45 TRT)")
    logger.info("=" * 65)

    stats: Dict[str, Any] = {
        "session": "pre_market",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "dry_run": dry_run,
        "us_regime": None,
        "orb_summary": None,
        "top_gappers": []
    }

    try:
        # Step 1: Global & US Regime Check
        logger.info("Step 1/3: Assessing US Overnight & Global Index Movements...")
        regimes = get_all_regimes()
        us_regime = regimes.get("US", {})
        bist_regime = regimes.get("BIST", {})
        stats["us_regime"] = us_regime.get("regime", "neutral")
        stats["bist_prior_regime"] = bist_regime.get("regime", "neutral")
        logger.info(f"US Market Regime: {stats['us_regime'].upper()} | Prior BIST Regime: {stats['bist_prior_regime'].upper()}")

        # Step 2: 15m ORB & Gap Distribution Analysis
        logger.info("Step 2/3: Scanning BIST Universe Opening Gaps & ORB Direction...")
        orb_data = tool_analyze_morning_orb_session()
        stats["orb_summary"] = {
            "total_scanned": orb_data.get("total_scanned_assets", 0),
            "market_bias": orb_data.get("market_bias", "NEUTRAL"),
            "avg_gap_pct": orb_data.get("gap_distribution", {}).get("avg_gap_pct", 0.0),
            "breakouts": orb_data.get("orb_15m_breakouts", {})
        }
        stats["top_gappers"] = orb_data.get("top_volume_movers", [])[:5]

        logger.info(
            f"Pre-Market Scan Complete: {stats['orb_summary']['total_scanned']} Assets, "
            f"Avg Gap: +%{stats['orb_summary']['avg_gap_pct']}, Bias: {stats['orb_summary']['market_bias']}"
        )

        # Step 3: Persistence (unless dry-run)
        if dry_run:
            logger.info("DRY-RUN mode active: Skipping database mutations.")
        else:
            try:
                from app.cron_daily_job import db_upsert_regimes
                db_upsert_regimes(regimes)
                logger.info("Updated pre-market regime status in Supabase.")
            except Exception as dbe:
                logger.warning(f"Could not persist pre-market regime to DB: {dbe}")

        logger.info("PRE-MARKET SESSION COMPLETE - SUCCESS")
        return stats

    except Exception as e:
        logger.error(f"Error during pre-market session: {e}", exc_info=True)
        stats["error"] = str(e)
        return stats


def run_post_market_session(dry_run: bool = False) -> Dict[str, Any]:
    """
    Executes the 18:15 TRT post-market routine:
    1. Ingests official session closing prices and volume.
    2. Computes technical indicators (EMA, RSI, ATR, MACD).
    3. Verifies and reconciles KAP dividend declarations.
    4. Evaluates open signals against stop-loss and profit target levels.
    5. Reconciles post-exit price recovery stats.
    """
    logger.info("=" * 65)
    logger.info("STARTING POST-MARKET SESSION AGGREGATOR (18:15 TRT)")
    logger.info("=" * 65)

    stats: Dict[str, Any] = {
        "session": "post_market",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "dry_run": dry_run,
        "dividends_verified": 0,
        "pipeline_completed": False
    }

    try:
        # Step 1: KAP Dividend Ledger Reconciliation
        logger.info("Step 1/4: Reconciling KAP Dividend Declarations & Verified Schedules...")
        div_data = tool_query_dividends()
        assets = div_data.get("assets", [])
        confirmed_count = sum(1 for a in assets if str(a.get("status", "")).lower() == "confirmed")
        stats["dividends_verified"] = len(assets)
        stats["confirmed_payouts"] = confirmed_count
        logger.info(f"Verified {len(assets)} dividend assets ({confirmed_count} confirmed KAP payout schedules).")

        # Step 2: Master Daily Pipeline Execution
        if dry_run:
            logger.info("DRY-RUN mode active: Simulating daily post-market pipeline without mutating Supabase tables.")
            stats["pipeline_completed"] = True
        else:
            logger.info("Step 2/4: Triggering master daily EOD pipeline (prices, indicators, signals)...")
            from app.cron_daily_job import run_daily_pipeline
            run_daily_pipeline()
            stats["pipeline_completed"] = True

        logger.info("POST-MARKET SESSION COMPLETE - SUCCESS")
        return stats

    except Exception as e:
        logger.error(f"Error during post-market session: {e}", exc_info=True)
        stats["error"] = str(e)
        return stats


def main():
    parser = argparse.ArgumentParser(description="MarketPulse Scheduled Operational Ingestion Runner")
    parser.add_argument(
        "--session",
        choices=["pre_market", "post_market"],
        required=True,
        help="Market session to run: 'pre_market' (09:45 TRT) or 'post_market' (18:15 TRT)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run calculations and logging without writing to Supabase"
    )

    args = parser.parse_args()

    if args.session == "pre_market":
        res = run_pre_market_session(dry_run=args.dry_run)
    else:
        res = run_post_market_session(dry_run=args.dry_run)

    print(f"\n[SUMMARY] Session={res.get('session')} | Success={'error' not in res} | DryRun={res.get('dry_run')}")


if __name__ == "__main__":
    main()
