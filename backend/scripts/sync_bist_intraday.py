#!/usr/bin/env python3
"""
MarketPulse - Automated 30-Minute BIST Intraday Pricing & Portfolio Monitor
-------------------------------------------------------------------------
Fetches delayed Borsa Istanbul (BIST) prices and USDTRY via TradingView Scanner,
upserts today's price bars to Supabase price_history, updates opening direction
(ORB) data, and checks open portfolio positions against stop-loss and target limits.

Runs in < 3 seconds with bounded resource usage (1 single batch HTTP request).
"""
import sys
import os
from pathlib import Path
from datetime import datetime, timezone, date

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
root_dir = backend_dir.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

# Load environment configuration
env_path = backend_dir / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

import httpx
from datetime import timedelta
from app.core.database import get_supabase_client, upsert_rows

def get_bist_trading_session_date(dt: datetime | None = None) -> date:
    """
    Returns the latest official Borsa Istanbul (BIST) trading session date.
    BIST trading hours: Monday–Friday 10:00–18:10 TRT (UTC+3).
    Rolls back to the most recent completed session on weekends or pre-market.
    """
    if dt is None:
        dt = datetime.now(timezone.utc)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    trt_time = dt.astimezone(timezone(timedelta(hours=3)))
    weekday = trt_time.weekday()  # 0 = Monday, 6 = Sunday
    hour = trt_time.hour

    target = trt_time.date()
    if weekday == 6:  # Sunday -> Friday (-2 days)
        target = target - timedelta(days=2)
    elif weekday == 5:  # Saturday -> Friday (-1 day)
        target = target - timedelta(days=1)
    elif weekday == 0 and hour < 10:  # Monday pre-market -> Friday (-3 days)
        target = target - timedelta(days=3)
    elif hour < 10:  # Tue-Fri pre-market -> Previous day (-1 day)
        target = target - timedelta(days=1)

    return target

def fetch_tradingview_bist_batch(symbols: list[str]) -> dict[str, dict]:
    """
    Fetches delayed BIST OHLCV quotes in a single batch POST request.
    """
    results = {}
    if not symbols:
        return results

    clean_map = {sym.replace(".IS", "").upper(): sym for sym in symbols}
    tv_tickers = [f"BIST:{k}" for k in clean_map.keys()]

    url = "https://scanner.tradingview.com/turkey/scan"
    payload = {
        "symbols": {"tickers": tv_tickers},
        "columns": ["close", "open", "high", "low", "volume", "change", "change_abs"]
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                session_date_str = get_bist_trading_session_date().strftime("%Y-%m-%d")
                now_iso = datetime.now(timezone.utc).isoformat()

                for item in data:
                    ticker = item.get("s", "").replace("BIST:", "").upper()
                    vals = item.get("d", [])
                    if not ticker or not isinstance(vals, list) or len(vals) < 5:
                        continue
                    close = vals[0]
                    if not isinstance(close, (int, float)) or close <= 0:
                        continue
                    close_val = float(close)
                    open_p = float(vals[1]) if isinstance(vals[1], (int, float)) and vals[1] > 0 else None
                    high_p = float(vals[2]) if isinstance(vals[2], (int, float)) and vals[2] > 0 else None
                    low_p = float(vals[3]) if isinstance(vals[3], (int, float)) and vals[3] > 0 else None
                    vol = int(vals[4]) if isinstance(vals[4], (int, float)) and vals[4] >= 0 else None
                    change_pct = float(vals[5]) if len(vals) > 5 and isinstance(vals[5], (int, float)) else None
                    change_abs = float(vals[6]) if len(vals) > 6 and isinstance(vals[6], (int, float)) else None

                    prev_close = None
                    if change_abs is not None:
                        prev_close = round(close_val - change_abs, 2)
                    elif change_pct is not None and (1 + change_pct / 100) > 0:
                        prev_close = round(close_val / (1 + change_pct / 100), 2)

                    orig_sym = clean_map.get(ticker, f"{ticker}.IS")
                    results[orig_sym] = {
                        "symbol": orig_sym,
                        "ticker": ticker,
                        "close": close_val,
                        "open": open_p,
                        "high": high_p,
                        "low": low_p,
                        "volume": vol,
                        "prev_close": float(prev_close) if prev_close else None,
                        "change_pct": change_pct,
                        "session_date": session_date_str,
                        "observed_at": now_iso
                    }
    except Exception as e:
        print(f"⚠️ TradingView batch request failed: {e}")

    return results

def fetch_tradingview_usdtry() -> float | None:
    """Fetches real-time / delayed USDTRY rate from TradingView forex scanner."""
    url = "https://scanner.tradingview.com/forex/scan"
    payload = {
        "symbols": {"tickers": ["FX_IDC:USDTRY"]},
        "columns": ["close"]
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                if data and len(data) > 0:
                    val = data[0].get("d", [None])[0]
                    if isinstance(val, (int, float)) and val > 0:
                        return float(val)
    except Exception as e:
        print(f"⚠️ TradingView USDTRY fetch error: {e}")
    return None

def main():
    print(f"⚡ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting BIST Intraday 30-Minute Price Sync...")
    today_str = date.today().isoformat()
    now_iso = datetime.now(timezone.utc).isoformat()

    client = get_supabase_client()

    # 1. Fetch active BIST assets from database
    assets_resp = client.table("assets").select("id, symbol, market, name").execute()
    assets = assets_resp.data or []
    
    bist_assets = [
        a for a in assets 
        if a.get("market") == "BIST" or (a.get("symbol") and a["symbol"].endswith(".IS"))
    ]

    symbol_to_id = {a["symbol"].upper(): a["id"] for a in bist_assets if a.get("symbol")}
    # Also index without .IS suffix
    for a in bist_assets:
        clean = a["symbol"].replace(".IS", "").upper()
        symbol_to_id[clean] = a["id"]

    symbols_to_fetch = list({a["symbol"] for a in bist_assets if a.get("symbol")})
    if "XU100.IS" not in symbols_to_fetch:
        symbols_to_fetch.append("XU100.IS")

    print(f"📦 Total BIST assets to sync: {len(symbols_to_fetch)}")

    # 2. Batch fetch quotes via TradingView Scanner
    quotes = fetch_tradingview_bist_batch(symbols_to_fetch)
    print(f"✓ Retrieved {len(quotes)} BIST quotes from TradingView Turkey Scanner.")

    # 3. Fetch USDTRY FX rate
    usdtry_rate = fetch_tradingview_usdtry()
    if usdtry_rate:
        print(f"✓ USD/TRY Rate: {usdtry_rate:.4f}")
        try:
            upsert_rows("fx_rates", [{
                "pair": "USDTRY",
                "rate": usdtry_rate,
                "date": today_str
            }], on_conflict="pair,date")
        except Exception as e:
            print(f"⚠️ Failed to upsert fx_rates: {e}")

    # 4. Prepare price_history rows
    price_rows = []
    orb_rows = []
    xu100_close = None

    for sym, q in quotes.items():
        if sym == "XU100.IS" or sym == "XU100":
            xu100_close = q["close"]
            continue

        asset_id = symbol_to_id.get(sym.upper()) or symbol_to_id.get(sym.replace(".IS", "").upper())
        if not asset_id:
            continue

        price_rows.append({
            "asset_id": asset_id,
            "date": q.get("session_date", today_str),
            "open": q["open"],
            "high": q["high"],
            "low": q["low"],
            "close": q["close"],
            "adj_close": q["close"],
            "volume": q["volume"],
            "source": "tradingview",
            "observed_at": now_iso
        })

        # Calculate live Opening Range Breakout (ORB) status
        prev_close = q["prev_close"] or q["open"] or q["close"]
        open_price = q["open"] or q["close"]
        curr_price = q["close"]

        gap_pct = ((open_price - prev_close) / prev_close * 100) if prev_close > 0 else 0.0
        gap_type = 'gap_up' if gap_pct >= 0.5 else ('gap_down' if gap_pct <= -0.5 else 'flat')
        
        orb_status = 'consolidating'
        bias = 'neutral'
        if curr_price > open_price:
            orb_status = 'above_open'
            bias = 'bullish'
        elif curr_price < open_price:
            orb_status = 'below_open'
            bias = 'bearish'

        clean_sym = sym.replace(".IS", "").upper()
        orb_rows.append({
            "symbol": f"{clean_sym}.IS",
            "date": q.get("session_date", today_str),
            "prev_close": prev_close,
            "open_price": open_price,
            "current_price": curr_price,
            "gap_percent": round(gap_pct, 2),
            "gap_type": gap_type,
            "orb_status": orb_status,
            "bias": bias,
            "volume_spike": bool((q["volume"] is not None and q["volume"] > 500000) or abs(gap_pct) > 1.0),
            "recommended_action": "Holding above open (Bullish)" if bias == "bullish" else "Under session pressure (Caution)"
        })

    # 5. Upsert price_history in chunks of 100
    if price_rows:
        for i in range(0, len(price_rows), 100):
            chunk = price_rows[i:i + 100]
            try:
                upsert_rows("price_history", chunk, on_conflict="asset_id,date")
            except Exception as e:
                print(f"⚠️ Error upserting price_history chunk {i}: {e}")
        print(f"✓ Upserted {len(price_rows)} price_history records for {today_str}.")

    # 6. Upsert opening_direction in chunks of 100
    if orb_rows:
        for i in range(0, len(orb_rows), 100):
            chunk = orb_rows[i:i + 100]
            try:
                upsert_rows("opening_direction", chunk, on_conflict="symbol,date")
            except Exception as e:
                print(f"⚠️ Error upserting opening_direction chunk {i}: {e}")
        print(f"✓ Upserted {len(orb_rows)} opening_direction records for {today_str}.")

    # 7. Update BIST Market Regime if XU100 is available
    if xu100_close:
        try:
            upsert_rows("market_regime", [{
                "market": "BIST",
                "date": today_str,
                "index_close": xu100_close,
                "regime": "bullish" if xu100_close > 11500 else "neutral",
                "notes": f"Intraday 30m sync at {datetime.now().strftime('%H:%M:%S')} TRT via TradingView"
            }], on_conflict="market,date")
            print(f"✓ Updated BIST Market Regime: XU100 at {xu100_close:.2f}")
        except Exception as e:
            print(f"⚠️ Error updating market_regime: {e}")

    # 8. Check Portfolio Stop-Loss and Target Price Triggers
    try:
        open_positions = client.table("portfolio_positions").select("id, asset_id, stop_loss, target_price, avg_entry_price, quantity, assets(symbol)").eq("is_open", True).execute()
        positions = open_positions.data or []
        
        triggered_stops = []
        triggered_targets = []

        for p in positions:
            sym = (p.get("assets") or {}).get("symbol")
            if not sym:
                continue
            quote = quotes.get(sym.upper()) or quotes.get(sym.replace(".IS", "").upper())
            if not quote:
                continue

            curr_price = quote["close"]
            stop_loss = p.get("stop_loss")
            target_price = p.get("target_price")

            if stop_loss and curr_price <= float(stop_loss):
                triggered_stops.append((sym, curr_price, float(stop_loss)))
            if target_price and curr_price >= float(target_price):
                triggered_targets.append((sym, curr_price, float(target_price)))

        if triggered_stops:
            print("🚨 STOP-LOSS WARNINGS:")
            for sym, curr, sl in triggered_stops:
                print(f"   ⚠️ {sym}: Current price ₺{curr:.2f} is below Stop Loss ₺{sl:.2f}!")
        if triggered_targets:
            print("🎯 TARGET PRICE HIT:")
            for sym, curr, tp in triggered_targets:
                print(f"   🎉 {sym}: Current price ₺{curr:.2f} reached Target Price ₺{tp:.2f}!")
    except Exception as e:
        print(f"⚠️ Portfolio alert check encountered error: {e}")

    print(f"🏁 Intraday sync finished successfully at {datetime.now().strftime('%H:%M:%S')}.\n")

if __name__ == "__main__":
    main()
