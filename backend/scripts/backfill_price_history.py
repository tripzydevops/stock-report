"""
Historical Price & Technical Indicator Backfill Script
=====================================================
Backfills 1-year OHLCV history and computes full technical indicators (EMA20/50/200,
RSI14, MACD, ATR14, BB, Volume Ratio) for active database assets with insufficient history (< 200 bars).
Optionally executes quantitative & institutional screeners to populate fresh trade setups.

Usage:
    python backend/scripts/backfill_price_history.py [--market US|BIST|ALL] [--batch-size 35] [--screen]
"""
import sys
import os
import argparse
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Set
import pandas as pd

# Load env variables from backend/.env
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.database import get_supabase_client, upsert_rows
from app.services.data_fetcher import fetch_us_prices, fetch_bist_prices, _normalize_ohlcv_columns
from app.services.indicators import compute_all_indicators
from app.services.market_regime import get_all_regimes
from app.services.screener import run_all_screens
from app.services.institutional_screener import run_institutional_screens
from app.services.signal_persistence import persist_trade_signals
from app.services.ai_analyst import batch_analyze_signals

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("backfill")


def load_candidate_assets(client, market_filter: str = "ALL", min_bars: int = 200) -> List[Dict]:
    """Find active assets that have fewer than min_bars price history rows in Supabase."""
    query = client.table("assets").select("id, symbol, name, market, asset_class").eq("is_active", True)
    if market_filter in ("US", "BIST"):
        query = query.eq("market", market_filter)
    
    assets_res = query.execute()
    all_assets = assets_res.data or []
    logger.info(f"Loaded {len(all_assets)} active assets for market: {market_filter}")
    
    # Check current price_history counts via direct SQL or grouped query
    # Supabase PostgREST doesn't support GROUP BY directly via client, so we sample / query existing counts
    # Or query existing distinct dates
    try:
        # Query existing asset_ids with price history
        sql = f"""
        SELECT asset_id, count(*) as bar_count 
        FROM price_history 
        GROUP BY asset_id;
        """
        counts_res = client.rpc("execute_sql", {"query": sql}).execute() if hasattr(client, "rpc") else None
    except Exception:
        counts_res = None

    # Fallback if RPC is not enabled: query assets where price history is thin
    counts_map = {}
    if counts_res and counts_res.data:
        for r in counts_res.data:
            counts_map[r["asset_id"]] = r["bar_count"]
    else:
        # Sample check: fetch latest 500 price history entries
        pass

    candidates = []
    for a in all_assets:
        cnt = counts_map.get(a["id"], 0)
        if cnt < min_bars:
            candidates.append(a)

    logger.info(f"Identified {len(candidates)} assets with < {min_bars} bars eligible for 1-year backfill.")
    return candidates if candidates else all_assets


def backfill_prices(client, assets: List[Dict], batch_size: int = 35) -> Dict[str, pd.DataFrame]:
    """Fetch 1-year OHLCV for assets and upsert all 252 bars to price_history."""
    asset_id_map = {a["symbol"]: a["id"] for a in assets}
    clean_map = {a["symbol"].replace(".IS", "").upper(): a for a in assets}
    
    us_assets = [a["symbol"] for a in assets if a.get("market") == "US"]
    bist_assets = [a["symbol"] for a in assets if a.get("market") == "BIST"]

    enriched_results: Dict[str, pd.DataFrame] = {}
    now_utc = datetime.now(timezone.utc).isoformat()

    # 1. US Assets backfill
    if us_assets:
        logger.info(f"Backfilling {len(us_assets)} US assets in batches of {batch_size}...")
        for i in range(0, len(us_assets), batch_size):
            batch = us_assets[i:i + batch_size]
            logger.info(f"Fetching US batch {i//batch_size + 1}/{(len(us_assets)-1)//batch_size + 1}: {len(batch)} tickers ({batch[:5]}...)")
            prices = fetch_us_prices(batch, period="1y")
            
            rows_to_upsert = []
            for sym, df in prices.items():
                if df.empty:
                    continue
                asset_id = asset_id_map.get(sym) or clean_map.get(sym.upper(), {}).get("id")
                if not asset_id:
                    continue

                edf = compute_all_indicators(df)
                enriched_results[sym] = edf

                for idx, row in df.iterrows():
                    dt = idx if isinstance(idx, datetime) else pd.to_datetime(idx)
                    dt_str = dt.strftime("%Y-%m-%d")
                    rows_to_upsert.append({
                        "asset_id": asset_id,
                        "date": dt_str,
                        "open": float(row.get("open", 0)) if pd.notna(row.get("open")) else None,
                        "high": float(row.get("high", 0)) if pd.notna(row.get("high")) else None,
                        "low": float(row.get("low", 0)) if pd.notna(row.get("low")) else None,
                        "close": float(row["close"]),
                        "adj_close": float(row.get("adj_close", row["close"])) if pd.notna(row.get("adj_close")) else None,
                        "volume": int(row.get("volume", 0)) if pd.notna(row.get("volume")) else None,
                        "source": "yahoo",
                        "observed_at": now_utc,
                    })

            if rows_to_upsert:
                # Upsert in chunks of 500
                for c in range(0, len(rows_to_upsert), 500):
                    chunk = rows_to_upsert[c:c + 500]
                    try:
                        upsert_rows("price_history", chunk, on_conflict="asset_id,date")
                    except Exception as e:
                        logger.error(f"Error upserting US price chunk {c}: {e}")
                logger.info(f"  ✓ Saved {len(rows_to_upsert)} price bars for {len(prices)} US assets.")

    # 2. BIST Assets backfill
    if bist_assets:
        logger.info(f"Backfilling {len(bist_assets)} BIST assets in batches of {batch_size}...")
        for i in range(0, len(bist_assets), batch_size):
            batch = bist_assets[i:i + batch_size]
            logger.info(f"Fetching BIST batch {i//batch_size + 1}/{(len(bist_assets)-1)//batch_size + 1}: {len(batch)} tickers ({batch[:5]}...)")
            prices = fetch_bist_prices(batch, period="1y")

            rows_to_upsert = []
            for sym, df in prices.items():
                if df.empty:
                    continue
                asset_id = asset_id_map.get(sym) or clean_map.get(sym.replace(".IS", "").upper(), {}).get("id")
                if not asset_id:
                    continue

                edf = compute_all_indicators(df)
                enriched_results[sym] = edf

                for idx, row in df.iterrows():
                    dt = idx if isinstance(idx, datetime) else pd.to_datetime(idx)
                    dt_str = dt.strftime("%Y-%m-%d")
                    rows_to_upsert.append({
                        "asset_id": asset_id,
                        "date": dt_str,
                        "open": float(row.get("open", 0)) if pd.notna(row.get("open")) else None,
                        "high": float(row.get("high", 0)) if pd.notna(row.get("high")) else None,
                        "low": float(row.get("low", 0)) if pd.notna(row.get("low")) else None,
                        "close": float(row["close"]),
                        "adj_close": float(row.get("adj_close", row["close"])) if pd.notna(row.get("adj_close")) else None,
                        "volume": int(row.get("volume", 0)) if pd.notna(row.get("volume")) else None,
                        "source": "yahoo",
                        "observed_at": now_utc,
                    })

            if rows_to_upsert:
                for c in range(0, len(rows_to_upsert), 500):
                    chunk = rows_to_upsert[c:c + 500]
                    try:
                        upsert_rows("price_history", chunk, on_conflict="asset_id,date")
                    except Exception as e:
                        logger.error(f"Error upserting BIST price chunk {c}: {e}")
                logger.info(f"  ✓ Saved {len(rows_to_upsert)} price bars for {len(prices)} BIST assets.")

    return enriched_results


def upsert_latest_indicators(client, enriched_prices: Dict[str, pd.DataFrame], asset_id_map: Dict[str, str]):
    """Computes and upserts the latest technical indicator snapshot for all enriched assets."""
    indicator_cols = [
        "ema_20", "ema_50", "ema_200", "rsi_14", "atr_14",
        "macd", "macd_signal", "macd_histogram",
        "bb_upper", "bb_middle", "bb_lower",
        "kc_upper", "kc_lower", "volume_ratio",
        "high_52w", "low_52w",
    ]
    rows = []
    clean_map = {sym.replace(".IS", "").upper(): aid for sym, aid in asset_id_map.items()}

    for sym, edf in enriched_prices.items():
        if edf.empty:
            continue
        asset_id = asset_id_map.get(sym) or clean_map.get(sym.replace(".IS", "").upper())
        if not asset_id:
            continue

        last_row = edf.iloc[-1]
        dt = edf.index[-1]
        dt_str = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]

        row = {"asset_id": asset_id, "date": dt_str}
        for col in indicator_cols:
            val = last_row.get(col)
            row[col] = round(float(val), 6) if pd.notna(val) else None
        rows.append(row)

    if rows:
        logger.info(f"Upserting {len(rows)} daily_indicator records...")
        for c in range(0, len(rows), 200):
            chunk = rows[c:c + 200]
            try:
                upsert_rows("daily_indicators", chunk, on_conflict="asset_id,date")
            except Exception as e:
                logger.error(f"Error upserting indicators chunk {c}: {e}")
        logger.info(f"✅ Successfully upserted {len(rows)} indicator snapshots.")


def run_screener_and_persist(client, enriched_prices: Dict[str, pd.DataFrame], assets_list: List[Dict]):
    """Execute strategy screeners across all enriched assets and persist discovered setups."""
    logger.info("=" * 60)
    logger.info(f"🎯 EXECUTING QUANTITATIVE SCREENERS ACROSS {len(enriched_prices)} TICKERS")
    logger.info("=" * 60)

    assets_map = {a["symbol"]: a for a in assets_list}
    # Also index by clean symbol
    for a in assets_list:
        clean = a["symbol"].replace(".IS", "").upper()
        if clean not in assets_map:
            assets_map[clean] = a

    asset_id_map = {a["symbol"]: a["id"] for a in assets_list}
    for a in assets_list:
        clean = a["symbol"].replace(".IS", "").upper()
        if clean not in asset_id_map:
            asset_id_map[clean] = a["id"]

    regimes = get_all_regimes()
    logger.info(f"Market Regimes: US={regimes.get('US', {}).get('regime')}, BIST={regimes.get('BIST', {}).get('regime')}")

    std_signals = run_all_screens(enriched_prices, assets_map)
    inst_signals = run_institutional_screens(enriched_prices, assets_map)
    all_signals = std_signals + inst_signals
    logger.info(f"Found {len(all_signals)} potential trade signals ({len(std_signals)} standard + {len(inst_signals)} institutional).")

    if not all_signals:
        logger.info("No new setups qualified under current regime filters.")
        return

    # Prepare indicators map for AI analysis
    indicators_map = {}
    for sym, edf in enriched_prices.items():
        if not edf.empty:
            last = edf.iloc[-1]
            indicators_map[sym] = {
                k: round(float(v), 4) if pd.notna(v) else None
                for k, v in last.items()
            }

    # AI batch analysis
    analyzed_signals = batch_analyze_signals(all_signals, indicators_map, regimes, assets_map)
    logger.info(f"AI analyzed {len(analyzed_signals)} signals. Persisting to trade_signals table...")

    res = persist_trade_signals(client, analyzed_signals, asset_id_map)
    logger.info(f"✅ Trade signals persistence complete: {res}")


def main():
    parser = argparse.ArgumentParser(description="MarketPulse Historical Price Backfill")
    parser.add_argument("--market", default="ALL", choices=["ALL", "US", "BIST"], help="Market to backfill")
    parser.add_argument("--batch-size", type=int, default=35, help="Batch size for price downloads")
    parser.add_argument("--symbols", type=str, default=None, help="Comma-separated list of symbols to backfill")
    parser.add_argument("--limit", type=int, default=None, help="Max assets to process (for testing)")
    parser.add_argument("--screen", action="store_true", default=True, help="Run screeners and generate trade signals after backfill")
    args = parser.parse_args()

    client = get_supabase_client()
    candidates = load_candidate_assets(client, market_filter=args.market)

    if args.symbols:
        sym_list = {s.strip().upper() for s in args.symbols.split(",")}
        candidates = [c for c in candidates if c["symbol"].replace(".IS", "").upper() in sym_list or c["symbol"].upper() in sym_list]
        logger.info(f"Filtered to {len(candidates)} assets matching symbols: {args.symbols}")
    elif args.limit:
        candidates = candidates[:args.limit]
        logger.info(f"Limited backfill to {len(candidates)} candidate assets.")

    if not candidates:
        logger.info("No candidates requiring backfill.")
        return

    asset_id_map = {a["symbol"]: a["id"] for a in candidates}

    # 1. Backfill prices
    enriched = backfill_prices(client, candidates, batch_size=args.batch_size)
    logger.info(f"Backfilled prices for {len(enriched)} assets.")

    # 2. Upsert indicators
    upsert_latest_indicators(client, enriched, asset_id_map)

    # 3. Screen for trade setups
    if args.screen and enriched:
        run_screener_and_persist(client, enriched, candidates)

    logger.info("=" * 60)
    logger.info("🎉 BACKFILL & SCREENING PIPELINE FINISHED SUCCESSFULLY")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
