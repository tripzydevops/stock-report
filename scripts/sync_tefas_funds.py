#!/usr/bin/env python3
"""
MarketPulse — Automated TEFAS Fund Synchronization Engine
Fetches live official Net Asset Value (NAV) quotes for all 75 TEFAS mutual
and money market funds directly from the official TEFAS API and upserts
clean price history records into Supabase PostgreSQL.

Usage:
    python scripts/sync_tefas_funds.py
    python scripts/sync_tefas_funds.py --symbol ZBJ
    python scripts/sync_tefas_funds.py --days 10
    python scripts/sync_tefas_funds.py --dry-run
"""
import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

import argparse
import logging
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import concurrent.futures
import httpx
import pandas as pd

# Set up paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

# Load environment
env_path = PROJECT_ROOT / "backend" / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

from app.core.database import get_supabase_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("tefas_sync")

TEFAS_API_URL = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir"
TEFAS_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}


def parse_tefas_date(raw_date: Any) -> Optional[str]:
    """Parse various TEFAS date formats into ISO YYYY-MM-DD."""
    if not raw_date:
        return None
    s = str(raw_date).strip()
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        return s[:10]
    parts = s.split('.')
    if len(parts) == 3 and len(parts[2]) == 4:
        return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
    return None


def fetch_tefas_fund_history(symbol: str, period_months: int = 1, timeout: float = 10.0) -> List[Dict[str, Any]]:
    """
    Fetch raw fund price series for a single TEFAS fund.
    Returns list of records sorted chronologically ascending.
    """
    clean_sym = symbol.strip().upper()
    payload = {
        "fonKodu": clean_sym,
        "dil": "TR",
        "periyod": period_months
    }
    
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(TEFAS_API_URL, json=payload, headers=TEFAS_HEADERS)
            resp.raise_for_status()
            data = resp.json()
            return data.get("resultList") or data.get("data") or []
    except Exception as e:
        logger.warning(f"Failed to fetch TEFAS quote for {clean_sym}: {e}")
        return []


def process_fund_quotes(
    asset_id: str,
    symbol: str,
    history: List[Dict[str, Any]],
    max_days: int = 5
) -> List[Dict[str, Any]]:
    """
    Transform raw TEFAS API items into database-ready price_history rows.
    """
    if not history:
        return []

    # Sort chronologically ascending
    def _get_sort_key(item):
        d_str = parse_tefas_date(item.get("tarih") or item.get("TARIH"))
        return d_str or "1970-01-01"

    sorted_history = sorted(history, key=_get_sort_key)
    recent_items = sorted_history[-max_days:] if len(sorted_history) > max_days else sorted_history

    rows = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for idx, item in enumerate(recent_items):
        raw_price = item.get("fiyat") if item.get("fiyat") is not None else item.get("FIYAT")
        if raw_price is None:
            continue

        try:
            p = float(str(raw_price).replace(',', '.'))
        except (ValueError, TypeError):
            continue

        if p <= 0:
            continue

        dt_str = parse_tefas_date(item.get("tarih") or item.get("TARIH"))
        if not dt_str:
            continue

        # Determine open price from preceding item if available
        prev_p = p
        if idx > 0:
            raw_prev = recent_items[idx - 1].get("fiyat") if recent_items[idx - 1].get("fiyat") is not None else recent_items[idx - 1].get("FIYAT")
            if raw_prev is not None:
                try:
                    prev_p = float(str(raw_prev).replace(',', '.'))
                except (ValueError, TypeError):
                    prev_p = p

        vol_val = item.get("PAY_SAYISI") or item.get("paySayisi")
        volume = None
        if vol_val is not None:
            try:
                volume = float(vol_val)
            except (ValueError, TypeError):
                volume = None

        rows.append({
            "asset_id": asset_id,
            "date": dt_str,
            "close": p,
            "open": prev_p,
            "high": max(p, prev_p),
            "low": min(p, prev_p),
            "volume": volume,
            "adj_close": p,
            "source": "tefas",
            "observed_at": now_iso
        })

    return rows


def sync_all_tefas_funds(
    max_days: int = 5,
    max_workers: int = 5,
    filter_symbol: Optional[str] = None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Queries all TEFAS funds from Supabase, fetches live prices concurrently,
    and upserts latest price bars into price_history.
    """
    start_time = time.time()
    client = get_supabase_client()

    logger.info("📡 Loading TEFAS assets from Supabase catalog...")
    query = client.table("assets").select("id, symbol, name, sector").eq("market", "TEFAS")
    if filter_symbol:
        query = query.eq("symbol", filter_symbol.upper())

    resp = query.execute()
    assets = resp.data or []
    if not assets:
        logger.warning("No TEFAS assets found in database.")
        return {"status": "EMPTY", "count": 0}

    logger.info(f"Found {len(assets)} TEFAS asset(s) to synchronize.")

    # Concurrently fetch raw history for each asset
    results: List[Tuple[Dict[str, Any], List[Dict[str, Any]]]] = []

    def _worker(asset_item):
        sym = asset_item["symbol"].strip().upper()
        history = fetch_tefas_fund_history(sym, period_months=1)
        return asset_item, history

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {executor.submit(_worker, a): a for a in assets}
        for future in concurrent.futures.as_completed(future_map):
            try:
                asset_item, history = future.result()
                results.append((asset_item, history))
            except Exception as e:
                asset = future_map[future]
                logger.error(f"Error processing {asset.get('symbol')}: {e}")

    # Process into price rows
    all_rows = []
    updated_funds = 0
    empty_funds = []

    for asset_item, history in results:
        sym = asset_item["symbol"].strip().upper()
        rows = process_fund_quotes(asset_item["id"], sym, history, max_days=max_days)
        if rows:
            all_rows.extend(rows)
            updated_funds += 1
            latest_row = rows[-1]
            logger.info(f"  ✓ {sym:<5} ({asset_item.get('name')[:35]}): {latest_row['date']} -> ₺{latest_row['close']:.6f}")
        else:
            empty_funds.append(sym)
            logger.info(f"  ⚠️ {sym:<5}: No current quote data returned from TEFAS")

    duration = time.time() - start_time
    logger.info(f"Fetched quotes for {updated_funds}/{len(assets)} funds ({len(all_rows)} total price bars) in {duration:.2f}s.")

    if dry_run:
        logger.info(f"[DRY-RUN] Skipping database upsert of {len(all_rows)} price rows.")
        return {
            "status": "DRY_RUN",
            "total_assets": len(assets),
            "updated_funds": updated_funds,
            "empty_funds": empty_funds,
            "total_bars": len(all_rows),
            "duration_seconds": round(duration, 2)
        }

    # Batch upsert into public.price_history
    upserted_count = 0
    if all_rows:
        chunk_size = 100
        for i in range(0, len(all_rows), chunk_size):
            chunk = all_rows[i:i + chunk_size]
            try:
                client.table("price_history").upsert(
                    chunk,
                    on_conflict="asset_id,date"
                ).execute()
                upserted_count += len(chunk)
            except Exception as e:
                logger.error(f"Error upserting chunk {i}-{i+len(chunk)}: {e}")

        logger.info(f"✅ Successfully upserted {upserted_count} price rows into public.price_history.")

    return {
        "status": "SUCCESS",
        "total_assets": len(assets),
        "updated_funds": updated_funds,
        "empty_funds": empty_funds,
        "total_bars": upserted_count,
        "duration_seconds": round(duration, 2)
    }


def main():
    parser = argparse.ArgumentParser(description="Synchronize TEFAS fund prices to Supabase")
    parser.add_argument("--days", type=int, default=5, help="Number of recent days to sync per fund (default: 5)")
    parser.add_argument("--workers", type=int, default=5, help="Concurrent HTTP worker threads (default: 5)")
    parser.add_argument("--symbol", type=str, default=None, help="Sync specific fund symbol (e.g. ZBJ)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch quotes without database upsert")
    args = parser.parse_args()

    res = sync_all_tefas_funds(
        max_days=args.days,
        max_workers=args.workers,
        filter_symbol=args.symbol,
        dry_run=args.dry_run
    )

    print("\n" + "=" * 60)
    print("🏦 TEFAS FUND SYNCHRONIZATION SUMMARY")
    print("=" * 60)
    print(f" Status:           {res.get('status')}")
    print(f" Total Funds:      {res.get('total_assets', 0)}")
    print(f" Updated Active:   {res.get('updated_funds', 0)}")
    print(f" Inactive/Empty:   {len(res.get('empty_funds', []))} ({', '.join(res.get('empty_funds', [])[:5])}...)")
    print(f" Price Bars Saved: {res.get('total_bars', 0)}")
    print(f" Duration:         {res.get('duration_seconds', 0)}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
