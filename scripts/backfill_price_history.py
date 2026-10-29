"""
MarketPulse 5-Year Historical Price History Backfill Script.
Fetches multi-year OHLCV daily bars for all registered BIST & US assets
and idempotently upserts them into Supabase public.price_history.

Usage:
    python scripts/backfill_price_history.py [--period 5y] [--chunk-size 500] [--market ALL]
"""

import os
import sys
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import numpy as np

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Ensure backend modules can be imported
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.core.database import get_supabase_client
from app.services.data_fetcher import _normalize_ohlcv_columns


def clean_number(val):
    if pd.isna(val) or val is None or val == "":
        return None
    try:
        f = float(val)
        return None if np.isnan(f) or np.isinf(f) else f
    except (ValueError, TypeError):
        return None


def fetch_and_prepare_bars(symbols, symbol_to_id, period="5y"):
    """
    Downloads historical OHLCV data for given symbols via yfinance
    and transforms into clean rows ready for Supabase upsert.
    """
    import yfinance as yf

    print(f"📡 Downloading {len(symbols)} tickers from Yahoo Finance (period: {period})...")
    
    # Download in chunks of 20 to avoid Yahoo Finance URL length or rate limits
    chunk_size = 20
    all_rows = []
    total_symbols = len(symbols)

    for i in range(0, total_symbols, chunk_size):
        sub_symbols = symbols[i:i + chunk_size]
        print(f"  • Batch {i // chunk_size + 1}/{(total_symbols + chunk_size - 1) // chunk_size}: {len(sub_symbols)} tickers...")
        
        try:
            df_batch = yf.download(
                tickers=sub_symbols,
                period=period,
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                threads=True,
                progress=False
            )
        except Exception as e:
            print(f"    ⚠️ Batch download error: {e}")
            continue

        if df_batch.empty:
            continue

        # If only one symbol was requested, yfinance returns flat columns
        single_ticker = len(sub_symbols) == 1

        for sym in sub_symbols:
            asset_id = symbol_to_id.get(sym) or symbol_to_id.get(sym.replace(".IS", ""))
            if not asset_id:
                continue

            try:
                if single_ticker:
                    df_sym = df_batch.copy()
                else:
                    if sym not in df_batch.columns.levels[0]:
                        continue
                    df_sym = df_batch[sym].dropna(how="all").copy()

                df_sym = _normalize_ohlcv_columns(df_sym)
                if df_sym.empty or "close" not in df_sym.columns:
                    continue

                for dt_idx, row in df_sym.iterrows():
                    c = clean_number(row.get("close"))
                    if c is None or c <= 0:
                        continue

                    dt_str = dt_idx.strftime("%Y-%m-%d") if hasattr(dt_idx, "strftime") else str(dt_idx)[:10]
                    o = clean_number(row.get("open")) or c
                    h = clean_number(row.get("high")) or max(o, c)
                    l = clean_number(row.get("low")) or min(o, c)
                    ac = clean_number(row.get("adj_close")) or c
                    v = clean_number(row.get("volume")) or 0

                    all_rows.append({
                        "asset_id": asset_id,
                        "date": dt_str,
                        "open": round(o, 4),
                        "high": round(h, 4),
                        "low": round(l, 4),
                        "close": round(c, 4),
                        "adj_close": round(ac, 4),
                        "volume": int(v) if v else 0,
                    })
            except Exception as parse_err:
                print(f"    ⚠️ Error parsing {sym}: {parse_err}")

        # Sleep briefly between batches to respect rate limits
        time.sleep(0.3)

    return all_rows


def backfill_price_history(period="5y", chunk_size=500, market="ALL"):
    start_time = time.time()
    print("=" * 65)
    print(f"🚀 MARKETPULSE HISTORICAL DATA BACKFILL ({period.upper()})")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 65)

    client = get_supabase_client()

    # 1. Fetch registered assets
    print("📋 Fetching registered assets from Supabase...")
    query = client.table("assets").select("id, symbol, market, asset_class").eq("is_active", True)
    if market.upper() in ["BIST", "US"]:
        query = query.eq("market", market.upper())

    res = query.execute()
    assets = res.data or []
    if not assets:
        print("❌ No registered assets found in Supabase.")
        return 1

    print(f"✓ Found {len(assets)} active assets in Supabase (Market Filter: {market.upper()}).")

    symbol_to_id = {}
    download_symbols = []

    for a in assets:
        sym = a["symbol"].strip()
        aid = a["id"]
        mkt = a.get("market", "")

        symbol_to_id[sym] = aid
        symbol_to_id[sym.replace(".IS", "")] = aid

        # Ensure correct Yahoo Finance ticker format
        if mkt == "BIST" and not sym.endswith(".IS"):
            yf_sym = f"{sym}.IS"
        else:
            yf_sym = sym

        symbol_to_id[yf_sym] = aid
        download_symbols.append(yf_sym)

    # 2. Fetch and prepare bars
    rows = fetch_and_prepare_bars(download_symbols, symbol_to_id, period=period)
    total_bars = len(rows)
    print(f"\n✅ Successfully prepared {total_bars:,} OHLCV bars across {len(assets)} assets.")

    if total_bars == 0:
        print("❌ No price bars extracted. Aborting backfill.")
        return 1

    # 3. Upsert to Supabase in chunks
    print(f"\n💾 Upserting {total_bars:,} bars to Supabase in chunks of {chunk_size}...")
    inserted_count = 0
    errors = 0

    for i in range(0, total_bars, chunk_size):
        chunk = rows[i:i + chunk_size]
        try:
            client.table("price_history").upsert(chunk, on_conflict="asset_id,date").execute()
            inserted_count += len(chunk)
            pct = (inserted_count / total_bars) * 100
            print(f"  ✓ Progress: {inserted_count:,} / {total_bars:,} bars ({pct:.1f}%)", end="\r")
        except Exception as e:
            errors += 1
            print(f"\n  ❌ Error upserting chunk {i // chunk_size + 1}: {e}")
            time.sleep(1)

    print(f"\n\n{'=' * 65}")
    print(f"🎉 BACKFILL COMPLETE in {time.time() - start_time:.1f} seconds!")
    print(f"  • Total Bars Upserted : {inserted_count:,}")
    print(f"  • Batch Errors        : {errors}")
    print(f"{'=' * 65}")

    # 4. Verification Check
    try:
        res_verify = client.table("price_history").select("id", count="exact").limit(1).execute()
        total_in_db = res_verify.count if res_verify.count is not None else "N/A"
        print(f"📊 Current public.price_history row count in Supabase: {total_in_db:,}")
    except Exception as v_err:
        print(f"Note on row verification: {v_err}")

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill multi-year price history in Supabase")
    parser.add_argument("--period", default="5y", help="Historical period: 1y, 2y, 5y, max (default: 5y)")
    parser.add_argument("--chunk-size", type=int, default=500, help="Supabase upsert chunk size (default: 500)")
    parser.add_argument("--market", default="ALL", choices=["ALL", "BIST", "US"], help="Market filter (default: ALL)")
    args = parser.parse_args()

    sys.exit(backfill_price_history(period=args.period, chunk_size=args.chunk_size, market=args.market))
