"""
MarketPulse Daily Pipeline
Autonomous end-of-day ingestion, indicator computation, screening, and signal generation.
Connects to Supabase for data persistence.
"""
import logging
import datetime
from typing import Dict, List
import pandas as pd

from app.core.database import get_supabase_client, upsert_rows, select_rows, insert_rows
from app.services.data_fetcher import fetch_all_prices
from app.services.indicators import compute_all_indicators
from app.services.screener import run_all_screens
from app.services.institutional_screener import run_institutional_screens
from app.services.market_regime import get_all_regimes
from app.services.ai_analyst import batch_analyze_signals
from app.services.signal_persistence import (
    persist_trade_signals,
    reconcile_open_signals_lifecycle,
    validate_and_normalize_confidence,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def db_load_active_assets() -> List[Dict]:
    """Load all active assets from the Supabase assets table."""
    try:
        result = select_rows("assets", {"is_active": True})
        return result.data if result.data else []
    except Exception as e:
        logger.error(f"Error loading assets: {e}")
        return []


def db_upsert_prices(asset_id_map: Dict[str, str], asset_data: Dict[str, pd.DataFrame]):
    """Upsert prices into price_history table."""
    rows = []
    for symbol, df in asset_data.items():
        asset_id = asset_id_map.get(symbol)
        if not asset_id or df.empty:
            continue

        for idx, row in df.tail(5).iterrows():  # Only upsert last 5 days (efficiency)
            dt = idx if isinstance(idx, datetime.date) else idx.date()
            rows.append({
                "asset_id": asset_id,
                "date": dt.isoformat(),
                "open": float(row.get("open", 0)) if pd.notna(row.get("open")) else None,
                "high": float(row.get("high", 0)) if pd.notna(row.get("high")) else None,
                "low": float(row.get("low", 0)) if pd.notna(row.get("low")) else None,
                "close": float(row["close"]),
                "adj_close": float(row.get("adj_close", row["close"])) if pd.notna(row.get("adj_close")) else None,
                "volume": int(row.get("volume", 0)) if pd.notna(row.get("volume")) else None,
            })

    if rows:
        try:
            upsert_rows("price_history", rows, on_conflict="asset_id,date")
            logger.info(f"Upserted {len(rows)} price rows for {len(asset_data)} assets.")
        except Exception as e:
            logger.error(f"Error upserting prices: {e}")


def db_upsert_indicators(asset_id_map: Dict[str, str], asset_data: Dict[str, pd.DataFrame]):
    """Upsert computed indicators into daily_indicators table."""
    rows = []
    indicator_cols = [
        "ema_20", "ema_50", "ema_200", "rsi_14", "atr_14",
        "macd", "macd_signal", "macd_histogram",
        "bb_upper", "bb_middle", "bb_lower",
        "kc_upper", "kc_lower", "volume_ratio",
        "high_52w", "low_52w",
    ]

    for symbol, df in asset_data.items():
        asset_id = asset_id_map.get(symbol)
        if not asset_id or df.empty:
            continue

        last_row = df.iloc[-1]
        dt = df.index[-1] if isinstance(df.index[-1], datetime.date) else df.index[-1].date()

        row = {"asset_id": asset_id, "date": dt.isoformat()}
        for col in indicator_cols:
            val = last_row.get(col)
            row[col] = round(float(val), 6) if pd.notna(val) else None
        rows.append(row)

    if rows:
        try:
            upsert_rows("daily_indicators", rows, on_conflict="asset_id,date")
            logger.info(f"Upserted indicators for {len(rows)} assets.")
        except Exception as e:
            logger.error(f"Error upserting indicators: {e}")


def db_insert_signals(asset_id_map: Dict[str, str], signals: List[Dict]):
    """
    Insert new signals into trade_signals table with structured explainer preservation and deduplication.
    Delegates to the canonical signal_persistence service.
    """
    if not signals:
        return
    client = get_supabase_client()
    return persist_trade_signals(client, signals, asset_id_map)


def db_update_open_signals(asset_id_map: Dict[str, str], asset_data: Dict[str, pd.DataFrame]):
    """
    Check existing open signals for stop-loss hits or target hits and update status.
    Delegates to the canonical reconcile_open_signals_lifecycle service:
    1. Protects user-held portfolio assets from auto-expiration.
    2. Strictly evaluates only subsequent future price bars (bar_date > signal_date).
    3. Enforces strategy-dependent time horizon limits (Breakout: 12, Squeeze: 15, Reversion: 7, Default: 20).
    """
    client = get_supabase_client()
    return reconcile_open_signals_lifecycle(client, asset_id_map, asset_data)


def db_reconcile_post_exit_recoveries(asset_id_map: Dict[str, str], asset_data: Dict[str, pd.DataFrame]):
    """
    Job 2: Post-Exit Recovery Tracker.
    Evaluates closed signals (expired, stopped_out) for subsequent price recoveries
    without altering or inflating original immutable trade outcomes.
    """
    from app.services.recovery_tracker import (
        reconcile_post_exit_recoveries,
        sync_existing_closed_signals_to_recovery_tracker
    )
    client = get_supabase_client()
    sync_existing_closed_signals_to_recovery_tracker(client)
    return reconcile_post_exit_recoveries(client, asset_id_map, asset_data)


def db_upsert_regimes(regimes: Dict[str, Dict]):
    """Upsert market regime evaluations."""
    today = datetime.date.today().isoformat()
    rows = []
    for market, data in regimes.items():
        rows.append({
            "market": market,
            "date": today,
            "regime": data.get("regime", "neutral"),
            "index_close": data.get("index_close"),
            "ema_50": data.get("ema_50"),
            "ema_200": data.get("ema_200"),
            "notes": data.get("notes"),
        })
    if rows:
        try:
            upsert_rows("market_regime", rows, on_conflict="market,date")
            logger.info(f"Upserted {len(rows)} regime records.")
        except Exception as e:
            logger.error(f"Error upserting regimes: {e}")


def run_daily_pipeline():
    """Master function orchestrating the daily autonomous pipeline."""
    logger.info("=" * 60)
    logger.info("MARKETPULSE DAILY PIPELINE STARTING")
    logger.info("=" * 60)

    # 1. Load active assets
    assets = db_load_active_assets()
    assets_map = {a["symbol"]: a for a in assets}
    asset_id_map = {a["symbol"]: a["id"] for a in assets}
    logger.info(f"Step 1/9: Loaded {len(assets)} active assets.")

    if not assets:
        logger.warning("No active assets found. Pipeline aborted.")
        return

    # 2. Fetch latest prices
    prices = fetch_all_prices(assets)
    logger.info(f"Step 2/9: Fetched prices for {len(prices)} assets.")

    # 3. Upsert prices
    db_upsert_prices(asset_id_map, prices)
    logger.info("Step 3/9: Prices saved to database.")

    # 4. Compute indicators
    enriched_prices = {}
    indicators_map = {}
    for sym, df in prices.items():
        edf = compute_all_indicators(df)
        enriched_prices[sym] = edf
        if not edf.empty:
            last = edf.iloc[-1]
            indicators_map[sym] = {
                k: round(float(v), 4) if pd.notna(v) else None
                for k, v in last.items()
            }
    db_upsert_indicators(asset_id_map, enriched_prices)
    logger.info("Step 4/9: Indicators computed and saved.")

    # 5. Evaluate market regime
    regimes = get_all_regimes()
    db_upsert_regimes(regimes)
    logger.info(f"Step 5/9: Market regimes → US: {regimes.get('US', {}).get('regime', '?')}, BIST: {regimes.get('BIST', {}).get('regime', '?')}")

    # 6. Run screeners (whitelisted standard & institutional engines)
    std_signals = run_all_screens(enriched_prices, assets_map)
    inst_signals = run_institutional_screens(enriched_prices, assets_map)
    signals = std_signals + inst_signals
    logger.info(f"Step 6/9: Screeners found {len(signals)} potential signals ({len(std_signals)} standard + {len(inst_signals)} institutional).")

    # 7. AI Analysis
    if signals:
        analyzed_signals = batch_analyze_signals(signals, indicators_map, regimes, assets_map)
        logger.info(f"Step 7/9: AI analyzed {len(analyzed_signals)} signals.")
    else:
        analyzed_signals = []
        logger.info("Step 7/9: No signals to analyze.")

    # 8. Insert new signals
    db_insert_signals(asset_id_map, analyzed_signals)
    logger.info("Step 8/9: Signals saved to database.")

    # 9. Update existing open signals (Job 1: Original Lifecycle)
    db_update_open_signals(asset_id_map, enriched_prices)
    logger.info("Step 9/10: Open signal statuses updated within strategy holding horizons.")

    # 10. Reconcile post-exit recoveries (Job 2: Post-Exit Recovery Tracker)
    recovery_stats = db_reconcile_post_exit_recoveries(asset_id_map, enriched_prices)
    logger.info(f"Step 10/10: Post-exit recovery tracking reconciled (Stats: {recovery_stats}).")

    logger.info("=" * 60)
    logger.info(f"PIPELINE COMPLETE: {len(prices)} assets, {len(signals)} signals found")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_daily_pipeline()
