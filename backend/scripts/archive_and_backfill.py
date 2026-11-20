#!/usr/bin/env python3
"""
MarketPulse — Multi-Market Parquet Cold Archive & Hot-Tier Backfill Pipeline
===========================================================================
Executes the enterprise Hot / Cold Tiering strategy:
1. Backfills 1 full year (252 bars) of official NAV quotes for all 75 TEFAS mutual funds.
2. Backfills 5-year deep history for liquid BIST and US equities & ETFs.
3. Compresses full multi-year history into Apache Parquet (.parquet) with Zstandard compression.
4. Uploads Parquet archives directly to Supabase Object Storage ('marketpulse-reports/archives/parquet/...').
5. Batch-upserts the latest 252 bars into hot PostgreSQL ('price_history' and 'daily_indicators').
6. Executes all 11 screener engines to surface all new trade & fund momentum setups.

Usage:
    python backend/scripts/archive_and_backfill.py
    python backend/scripts/archive_and_backfill.py --market TEFAS
    python backend/scripts/archive_and_backfill.py --market BIST
    python backend/scripts/archive_and_backfill.py --market US
"""

import sys
import os
import time
import argparse
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, List, Any

# Set UTF-8
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

# Load env
from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / "backend" / ".env")

import pandas as pd
import yfinance as yf

from app.core.database import get_supabase_client
from app.services.market_data_archive import (
    export_dataframe_to_parquet,
    upload_parquet_archive_to_supabase,
    export_symbol_archive,
    upload_symbol_archive_to_supabase,
    validate_and_sanitize_ohlcv_dataframe,
    upsert_hot_tier_to_database
)
from app.services.indicators import compute_all_indicators
from app.services.screener import run_all_screens
from app.services.institutional_screener import run_institutional_screens
from app.services.signal_persistence import persist_trade_signals
from sync_tefas_funds import sync_all_tefas_funds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("archive_backfill")


def run_tefas_backfill_and_archive(client: Any) -> Dict[str, Any]:
    """Syncs 1 full year (252 bars) for all 75 TEFAS funds and exports to Parquet."""
    logger.info("=" * 60)
    logger.info("🏛️ STAGE 1: TEFAS MUTUAL FUNDS 1-YEAR BACKFILL & ARCHIVE")
    logger.info("=" * 60)

    # 1. Sync 252 bars into PostgreSQL
    sync_res = sync_all_tefas_funds(max_days=252, max_workers=5, period_months=12)
    logger.info(f"TEFAS Sync Complete: {sync_res.get('total_bars', 0)} bars saved.")

    # 2. Fetch all TEFAS price history for parquet archive by TEFAS asset_id chunks
    tefas_assets = client.table("assets").select("id, symbol").eq("market", "TEFAS").execute().data or []
    tefas_rows = []
    chunk_size = 20
    for i in range(0, len(tefas_assets), chunk_size):
        chunk_ids = [a["id"] for a in tefas_assets[i:i + chunk_size]]
        resp = client.table("price_history").select(
            "asset_id, date, open, high, low, close, adj_close, volume, source, assets(symbol, market)"
        ).in_("asset_id", chunk_ids).order("date").execute()

        for r in resp.data or []:
            asset = r.get("assets") or {}
            open_v = r.get("open")
            high_v = r.get("high")
            low_v = r.get("low")
            vol_v = r.get("volume")
            tefas_rows.append({
                "symbol": asset.get("symbol"),
                "market": "TEFAS",
                "date": r["date"],
                "open": float(open_v) if pd.notna(open_v) and np.isfinite(open_v) else None,
                "high": float(high_v) if pd.notna(high_v) and np.isfinite(high_v) else None,
                "low": float(low_v) if pd.notna(low_v) and np.isfinite(low_v) else None,
                "close": float(r["close"]),
                "adj_close": float(r.get("adj_close", r["close"])),
                "volume": float(vol_v) if pd.notna(vol_v) and np.isfinite(vol_v) else 0.0,
                "source": "tefas",
            })

    if tefas_rows:
        df_tefas = pd.DataFrame(tefas_rows)
        local_parquet = PROJECT_ROOT / "data" / "archives" / "tefas_daily_1y.parquet"
        parquet_bytes = export_dataframe_to_parquet(df_tefas, file_path=local_parquet)

        # Upload to Supabase Storage
        storage_path = "archives/parquet/tefas_daily_1y.parquet"
        upload_parquet_archive_to_supabase(parquet_bytes, storage_path, client=client)

        logger.info(f"✅ TEFAS Parquet cold archive created: {len(df_tefas)} rows ({len(parquet_bytes)/1024:.1f} KB).")

    return sync_res


def run_equities_backfill_and_archive(
    client: Any,
    market: str,
    target_symbols: List[str],
    asset_id_map: Dict[str, str],
    period: str = "5y",
    batch_size: int = 50
) -> Dict[str, Any]:
    """Fetches multi-year history in safe batches, creates Parquet cold archive, and upserts hot tier."""
    logger.info("=" * 60)
    logger.info(f"📈 STAGE: {market} EQUITIES & ETFS ({len(target_symbols)} symbols, {period})")
    logger.info("=" * 60)

    if not target_symbols:
        return {"count": 0}

    all_dfs: Dict[str, pd.DataFrame] = {}
    master_rows = []

    # Process in safe batches of 50 to avoid Yahoo Finance rate limits
    for batch_idx in range(0, len(target_symbols), batch_size):
        batch_symbols = target_symbols[batch_idx:batch_idx + batch_size]
        if market == "BIST":
            yf_symbols = [f"{s}.IS" if not s.endswith(".IS") else s for s in batch_symbols]
        else:
            yf_symbols = batch_symbols

        logger.info(f"Downloading batch {batch_idx//batch_size + 1}/{(len(target_symbols)+batch_size-1)//batch_size} ({len(yf_symbols)} tickers)...")
        try:
            raw_data = yf.download(yf_symbols, period=period, group_by="ticker", auto_adjust=False, threads=True)
            if raw_data.empty:
                continue

            for orig_sym, yf_sym in zip(batch_symbols, yf_symbols):
                try:
                    df_sym = pd.DataFrame()
                    if len(yf_symbols) == 1:
                        df_sym = raw_data.copy()
                    elif isinstance(raw_data.columns, pd.MultiIndex):
                        if yf_sym in raw_data.columns.get_level_values(0):
                            df_sym = raw_data[yf_sym].copy()
                        elif orig_sym in raw_data.columns.get_level_values(0):
                            df_sym = raw_data[orig_sym].copy()

                    if df_sym.empty:
                        continue

                    if isinstance(df_sym.columns, pd.MultiIndex):
                        df_sym.columns = [c[0].lower().replace(" ", "_") for c in df_sym.columns]
                    else:
                        df_sym.columns = [str(c).lower().replace(" ", "_") for c in df_sym.columns]

                    clean_sym = orig_sym.replace(".IS", "").upper()
                    df_sym = df_sym.dropna(subset=['close'])
                    df_sym = validate_and_sanitize_ohlcv_dataframe(df_sym)
                    if len(df_sym) < 5:
                        continue

                    all_dfs[clean_sym] = df_sym

                    # Export & upload partitioned per-symbol Parquet archive
                    try:
                        _, sym_bytes = export_symbol_archive(df_sym, market=market, symbol=clean_sym)
                        upload_symbol_archive_to_supabase(sym_bytes, market=market, symbol=clean_sym, client=client)
                    except Exception as sym_err:
                        logger.debug(f"Partitioned archive for {clean_sym} skipped/failed: {sym_err}")

                    for dt, r in df_sym.iterrows():
                        d_str = dt.strftime("%Y-%m-%d") if hasattr(dt, 'strftime') else str(dt)[:10]
                        open_val = r.get("open")
                        high_val = r.get("high")
                        low_val = r.get("low")
                        adj_val = r.get("adj_close")
                        vol_val = r.get("volume")

                        master_rows.append({
                            "symbol": clean_sym,
                            "market": market,
                            "date": d_str,
                            "open": float(open_val) if pd.notna(open_val) and np.isfinite(open_val) else None,
                            "high": float(high_val) if pd.notna(high_val) and np.isfinite(high_val) else None,
                            "low": float(low_val) if pd.notna(low_val) and np.isfinite(low_val) else None,
                            "close": float(r["close"]),
                            "adj_close": float(adj_val) if pd.notna(adj_val) and np.isfinite(adj_val) else None,
                            "volume": float(vol_val) if pd.notna(vol_val) and np.isfinite(vol_val) else 0.0,
                            "source": "yahoo",
                        })
                except Exception as ex:
                    logger.warning(f"Error parsing ticker {orig_sym}: {ex}")
        except Exception as e:
            logger.error(f"Error downloading batch: {e}")

    logger.info(f"Successfully processed {len(all_dfs)} tickers ({len(master_rows)} total daily bars).")

    if master_rows:
        df_master = pd.DataFrame(master_rows)

        # 1. Export Parquet Cold Archive
        local_parquet = PROJECT_ROOT / "data" / "archives" / f"{market.lower()}_daily_{period}.parquet"
        parquet_bytes = export_dataframe_to_parquet(df_master, file_path=local_parquet)

        # 2. Upload Parquet to Supabase Object Storage
        storage_path = f"archives/parquet/{market.lower()}_daily_{period}.parquet"
        upload_parquet_archive_to_supabase(parquet_bytes, storage_path, client=client)

        # 3. Upsert Hot Operational Tier (Latest 252 Bars) to PostgreSQL
        hot_res = upsert_hot_tier_to_database(df_master, asset_id_map, max_hot_bars=252, client=client)
        hot_count = hot_res.upserted if hasattr(hot_res, 'upserted') else int(hot_res)
        if getattr(hot_res, 'failed', 0) > 0:
            logger.warning(f"⚠️ Hot-tier upsert encountered {hot_res.failed} failures: {hot_res.errors}")

        # 4. Compute Indicators & Upsert
        logger.info(f"Computing daily indicators for {len(all_dfs)} {market} assets...")
        indicator_rows = []
        for sym, df_item in all_dfs.items():
            aid = asset_id_map.get(sym)
            if not aid:
                continue
            enriched = compute_all_indicators(df_item)
            if not enriched.empty:
                last_bar = enriched.iloc[-1]
                dt_str = enriched.index[-1].strftime("%Y-%m-%d") if hasattr(enriched.index[-1], 'strftime') else str(enriched.index[-1])[:10]
                indicator_cols = [
                    "ema_20", "ema_50", "ema_200", "rsi_14", "atr_14",
                    "macd", "macd_signal", "macd_histogram",
                    "bb_upper", "bb_middle", "bb_lower",
                    "kc_upper", "kc_lower", "volume_ratio",
                    "high_52w", "low_52w",
                ]
                ind_row = {"asset_id": aid, "date": dt_str}
                for c in indicator_cols:
                    val = last_bar.get(c)
                    ind_row[c] = round(float(val), 6) if pd.notna(val) else None
                indicator_rows.append(ind_row)

        if indicator_rows:
            for i in range(0, len(indicator_rows), 500):
                c = indicator_rows[i:i + 500]
                try:
                    client.table("daily_indicators").upsert(c, on_conflict="asset_id,date").execute()
                except Exception as e:
                    logger.error(f"Error upserting indicators: {e}")
            logger.info(f"✅ Upserted daily indicators for {len(indicator_rows)} {market} assets.")

        return {
            "tickers_processed": len(all_dfs),
            "cold_parquet_rows": len(df_master),
            "cold_parquet_kb": round(len(parquet_bytes) / 1024, 1),
            "hot_tier_bars": hot_count,
            "dfs": all_dfs,
        }

    return {"count": 0, "dfs": {}}


def run_complete_pipeline(target_market: Optional[str] = None):
    """Executes end-to-end hot/cold archiving and screener discovery."""
    start_time = time.time()
    client = get_supabase_client()

    logger.info("📡 Fetching asset catalog from Supabase...")
    resp = client.table("assets").select("id, symbol, name, market, asset_class, is_active").execute()
    assets = resp.data or []

    asset_id_map = {a["symbol"].replace(".IS", "").upper(): a["id"] for a in assets}
    assets_map = {a["symbol"].replace(".IS", "").upper(): a for a in assets}

    bist_symbols = [
        a["symbol"].replace(".IS", "").upper()
        for a in assets if a.get("market") == "BIST" and a.get("is_active", True)
    ]
    us_symbols = [
        a["symbol"].replace(".IS", "").upper()
        for a in assets if a.get("market") == "US" and a.get("is_active", True)
    ]

    summary = {}

    # 1. TEFAS Backfill & Archive
    if not target_market or target_market.upper() == "TEFAS":
        tefas_summary = run_tefas_backfill_and_archive(client)
        summary["TEFAS"] = tefas_summary

    # 2. BIST Backfill & Archive
    if not target_market or target_market.upper() == "BIST":
        # Prioritize active BIST equities
        bist_summary = run_equities_backfill_and_archive(client, "BIST", bist_symbols, asset_id_map, period="5y")
        summary["BIST"] = bist_summary

    # 3. US Backfill & Archive
    if not target_market or target_market.upper() == "US":
        # Target liquid US equities and ETFs
        us_summary = run_equities_backfill_and_archive(client, "US", us_symbols, asset_id_map, period="5y")
        summary["US"] = us_summary

    # 4. Run Screeners across all newly enriched assets
    logger.info("=" * 60)
    logger.info("🎯 STAGE 4: EXECUTING SCREENERS ACROSS HOT TIER")
    logger.info("=" * 60)

    asset_data: Dict[str, pd.DataFrame] = {}
    if "BIST" in summary and "dfs" in summary["BIST"]:
        for sym, df_item in summary["BIST"]["dfs"].items():
            asset_data[sym] = compute_all_indicators(df_item)
    if "US" in summary and "dfs" in summary["US"]:
        for sym, df_item in summary["US"]["dfs"].items():
            asset_data[sym] = compute_all_indicators(df_item)

    # Add TEFAS funds with >= 63 bars for Fund Momentum screening
    tefas_assets = client.table("assets").select("id, symbol").eq("market", "TEFAS").execute().data or []
    for a in tefas_assets:
        sym = a["symbol"].strip().upper()
        ph = client.table("price_history").select("date, open, high, low, close, volume").eq("asset_id", a["id"]).order("date").execute().data or []
        if len(ph) >= 63:
            df_t = pd.DataFrame(ph).set_index("date")
            df_t["close"] = df_t["close"].astype(float)
            df_t["open"] = pd.to_numeric(df_t.get("open"), errors="coerce")
            df_t["high"] = pd.to_numeric(df_t.get("high"), errors="coerce")
            df_t["low"] = pd.to_numeric(df_t.get("low"), errors="coerce")
            df_t["volume"] = pd.to_numeric(df_t.get("volume"), errors="coerce").fillna(0).astype(float)
            asset_data[sym] = compute_all_indicators(df_t)

    logger.info(f"Loaded and enriched {len(asset_data)} assets for screening.")

    std_signals = run_all_screens(asset_data, assets_map)
    inst_signals = run_institutional_screens(asset_data, assets_map)
    all_signals = std_signals + inst_signals

    logger.info(f"Screeners generated {len(all_signals)} total signals ({len(std_signals)} standard + {len(inst_signals)} institutional).")

    if all_signals:
        saved_sigs = persist_trade_signals(client, all_signals, asset_id_map)
        logger.info(f"✅ Persisted {len(saved_sigs)} active signals to trade_signals table.")

    total_duration = time.time() - start_time
    print("\n" + "=" * 65)
    print("🚀 HOT / COLD TIERING & BACKFILL PIPELINE EXECUTION SUMMARY")
    print("=" * 65)
    print(f" Total Duration:          {total_duration:.1f}s")
    for m, stats in summary.items():
        print(f" [{m}] Stats: {stats}")
    print(f" Total Open Trade Signals: {len(all_signals)}")
    print("=" * 65)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MarketPulse Parquet Cold Archive & Hot-Tier Backfill")
    parser.add_argument("--market", type=str, default=None, choices=["TEFAS", "BIST", "US"], help="Run specific market")
    args = parser.parse_args()
    run_complete_pipeline(target_market=args.market)
