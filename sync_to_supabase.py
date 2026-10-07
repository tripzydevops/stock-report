"""
Sync extracted spreadsheet data to Supabase PostgreSQL database.
Reads the latest generated Excel file (or DataFrames) and persists all
prices, indicators, signals, and regime into Supabase.
"""
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

import pandas as pd
from datetime import datetime
from pathlib import Path

# Load env variables from backend/.env
env_path = Path(__file__).parent / "backend" / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from app.core.database import get_supabase_client, upsert_rows, select_rows, insert_rows

def sync_all_to_supabase():
    print("🚀 Connecting to Supabase...")
    client = get_supabase_client()
    
    # 1. Fetch asset symbol -> id map
    res = client.table("assets").select("id, symbol").execute()
    assets = res.data if res.data else []
    if not assets:
        print("❌ No assets found in Supabase. Run seed_assets.sql first.")
        return
        
    symbol_to_id = {}
    for a in assets:
        sym = a["symbol"]
        symbol_to_id[sym] = a["id"]
        # Also map without .IS
        clean_sym = sym.replace(".IS", "")
        symbol_to_id[clean_sym] = a["id"]
        
    print(f"✅ Loaded {len(assets)} registered assets from Supabase.")
    
    excel_path = Path(__file__).parent / "MarketPulse_Latest.xlsx"
    if not excel_path.exists():
        print(f"❌ {excel_path} not found. Run export_to_spreadsheet.py first.")
        return
        
    # 2. Sync Price History (last 30 days per asset to Supabase for efficiency)
    print("📥 Reading Price History from spreadsheet...")
    df_prices = pd.read_excel(excel_path, sheet_name="📅 Price History")
    print(f"Found {len(df_prices)} total price rows.")
    
    # We will upload the most recent 15 days of bars per symbol
    df_prices["Date"] = pd.to_datetime(df_prices["Date"])
    def _clean_float(val):
        if pd.isna(val) or val is None or val == "":
            return None
        try:
            f = float(val)
            import math
            return None if math.isnan(f) or math.isinf(f) else f
        except (ValueError, TypeError):
            return None

    recent_prices = df_prices.groupby("Symbol").tail(15).copy()
    
    price_rows = []
    for _, row in recent_prices.iterrows():
        sym = str(row["Symbol"]).strip()
        asset_id = symbol_to_id.get(sym) or symbol_to_id.get(f"{sym}.IS")
        if not asset_id:
            continue
            
        c = _clean_float(row["Close"])
        if c is None:
            continue
            
        dt_str = row["Date"].strftime("%Y-%m-%d")
        o = _clean_float(row["Open"])
        h = _clean_float(row["High"])
        l = _clean_float(row["Low"])
        v = _clean_float(row["Volume"])
        
        price_rows.append({
            "asset_id": asset_id,
            "date": dt_str,
            "open": o if o is not None else c,
            "high": h if h is not None else c,
            "low": l if l is not None else c,
            "close": c,
            "adj_close": c,
            "volume": int(v) if v is not None else 0,
        })
        
    print(f"Upserting {len(price_rows)} price bars to Supabase (chunks of 100)...")
    for i in range(0, len(price_rows), 100):
        chunk = price_rows[i:i+100]
        try:
            client.table("price_history").upsert(chunk, on_conflict="asset_id,date").execute()
        except Exception as e:
            print(f"Error upserting prices chunk {i}: {e}")
            
    print("✅ Price history recorded in Supabase.")

    # 3. Sync Daily Indicators (from Dashboard sheet)
    print("📥 Syncing Daily Indicators...")
    df_dash = pd.read_excel(excel_path, sheet_name="📊 Dashboard")
    indicator_rows = []
    
    for _, row in df_dash.iterrows():
        sym = str(row["Symbol"]).strip()
        asset_id = symbol_to_id.get(sym) or symbol_to_id.get(f"{sym}.IS")
        if not asset_id:
            continue
            
        dt_str = str(row["Date"])[:10]
        indicator_rows.append({
            "asset_id": asset_id,
            "date": dt_str,
            "ema_20": float(row["EMA 20"]) if pd.notna(row["EMA 20"]) and row["EMA 20"] != "" else None,
            "ema_50": float(row["EMA 50"]) if pd.notna(row["EMA 50"]) and row["EMA 50"] != "" else None,
            "ema_200": float(row["EMA 200"]) if pd.notna(row["EMA 200"]) and row["EMA 200"] != "" else None,
            "rsi_14": float(row["RSI (14)"]) if pd.notna(row["RSI (14)"]) and row["RSI (14)"] != "" else None,
            "atr_14": float(row["ATR (14)"]) if pd.notna(row["ATR (14)"]) and row["ATR (14)"] != "" else None,
            "macd": float(row["MACD"]) if pd.notna(row["MACD"]) and row["MACD"] != "" else None,
            "macd_signal": float(row["MACD Signal"]) if pd.notna(row["MACD Signal"]) and row["MACD Signal"] != "" else None,
            "bb_upper": float(row["BB Upper"]) if pd.notna(row["BB Upper"]) and row["BB Upper"] != "" else None,
            "bb_lower": float(row["BB Lower"]) if pd.notna(row["BB Lower"]) and row["BB Lower"] != "" else None,
            "volume_ratio": float(row["Volume Ratio"]) if pd.notna(row["Volume Ratio"]) and row["Volume Ratio"] != "" else None,
            "high_52w": float(row["52W High"]) if pd.notna(row["52W High"]) and row["52W High"] != "" else None,
            "low_52w": float(row["52W Low"]) if pd.notna(row["52W Low"]) and row["52W Low"] != "" else None,
        })
        
    for i in range(0, len(indicator_rows), 100):
        chunk = indicator_rows[i:i+100]
        try:
            client.table("daily_indicators").upsert(chunk, on_conflict="asset_id,date").execute()
        except Exception as e:
            print(f"Error upserting indicators chunk {i}: {e}")
            
    print(f"✅ Recorded {len(indicator_rows)} daily indicator snapshots.")

    # 4. Sync Market Regime
    print("📥 Syncing Market Regime...")
    df_reg = pd.read_excel(excel_path, sheet_name="🚦 Market Regime")
    regime_rows = []
    today_str = datetime.today().strftime("%Y-%m-%d")
    
    for _, row in df_reg.iterrows():
        market_raw = str(row["Market"])
        market_code = "US" if "US" in market_raw else "BIST"
        regime_status = str(row["Regime"]).lower()
        if regime_status not in ["bullish", "neutral", "bearish"]:
            regime_status = "neutral"
            
        regime_rows.append({
            "market": market_code,
            "date": today_str,
            "regime": regime_status,
            "index_close": float(row["Index Close"]) if pd.notna(row["Index Close"]) else None,
            "ema_50": float(row["EMA 50"]) if pd.notna(row["EMA 50"]) else None,
            "ema_200": float(row["EMA 200"]) if pd.notna(row["EMA 200"]) else None,
            "notes": str(row.get("Notes", "")),
        })
        
    if regime_rows:
        try:
            client.table("market_regime").upsert(regime_rows, on_conflict="market,date").execute()
            print(f"✅ Recorded {len(regime_rows)} market regime statuses.")
        except Exception as e:
            print(f"Error upserting regime: {e}")

    # 4b. Sync FX Rates
    try:
        xl = pd.ExcelFile(excel_path)
        if "💱 USD-TRY Rate" in xl.sheet_names:
            print("📥 Syncing FX Rates...")
            df_fx = pd.read_excel(excel_path, sheet_name="💱 USD-TRY Rate")
            fx_rows = []
            for _, row in df_fx.tail(30).iterrows():
                if pd.notna(row["USD/TRY Rate"]) and pd.notna(row["Date"]):
                    fx_rows.append({
                        "pair": "USDTRY",
                        "date": str(row["Date"])[:10],
                        "rate": float(row["USD/TRY Rate"])
                    })
            if fx_rows:
                client.table("fx_rates").upsert(fx_rows, on_conflict="pair,date").execute()
                print(f"✅ Recorded {len(fx_rows)} USD/TRY FX rates.")
    except Exception as e:
        print(f"Error syncing FX rates: {e}")

    # 4c. Sync Opening Direction & 15m ORB
    try:
        xl = pd.ExcelFile(excel_path)
        if "🔔 Opening Direction" in xl.sheet_names:
            print("📥 Syncing Opening Direction (15m ORB)...")
            df_orb = pd.read_excel(excel_path, sheet_name="🔔 Opening Direction")
            orb_rows = []
            for _, r in df_orb.iterrows():
                sym = str(r['Symbol']).replace('.IS', '').strip()
                aid = symbol_to_id.get(sym) or symbol_to_id.get(f"{sym}.IS")
                gap_pct = float(r['Gap %']) if pd.notna(r['Gap %']) else 0.0
                pat = str(r.get('Pattern', ''))
                bias_raw = str(r.get('Direction Bias', '')).upper()

                if 'GAP & GO' in pat.upper():
                    gap_type = 'Gap Up & Go'
                    orb_stat = 'Broke High'
                elif 'BREAKOUT' in pat.upper():
                    gap_type = 'Gap Up & Go' if gap_pct >= 0.5 else 'Flat Open'
                    orb_stat = 'Broke High'
                elif 'FADE' in pat.upper():
                    gap_type = 'Gap & Fade'
                    orb_stat = 'Inside Range'
                elif 'BREAKDOWN' in pat.upper():
                    gap_type = 'Gap Down' if gap_pct <= -0.5 else 'Flat Open'
                    orb_stat = 'Broke Low'
                else:
                    gap_type = 'Flat Open'
                    orb_stat = 'Inside Range'

                if 'STRONGLY' in bias_raw or 'STRONG' in bias_raw:
                    bias = 'Strong Bullish'
                elif 'BULLISH' in bias_raw:
                    bias = 'Bullish'
                elif 'BEARISH' in bias_raw:
                    bias = 'Bearish'
                else:
                    bias = 'Neutral'

                vol_spike = ('GAP & GO' in pat.upper() or 'BREAKOUT' in pat.upper() or abs(gap_pct) >= 5.0)

                orb_rows.append({
                    'asset_id': aid,
                    'symbol': sym,
                    'market': str(r.get('Market', 'BIST')),
                    'date': today_str,
                    'prev_close': float(r['Prev Close']) if pd.notna(r['Prev Close']) else None,
                    'open_price': float(r['Open Price']) if pd.notna(r['Open Price']) else None,
                    'current_price': float(r['Current Price']) if pd.notna(r['Current Price']) else None,
                    'gap_percent': gap_pct,
                    'gap_type': gap_type,
                    'orb_status': orb_stat,
                    'bias': bias,
                    'volume_spike': vol_spike,
                    'recommended_action': str(r.get('Recommended Action', ''))
                })

            if orb_rows:
                for i in range(0, len(orb_rows), 100):
                    client.table("opening_direction").upsert(orb_rows[i:i+100], on_conflict="symbol,date").execute()
                print(f"✅ Recorded {len(orb_rows)} opening direction (15m ORB) setups in Supabase.")
    except Exception as e:
        print(f"Error syncing opening direction: {e}")

    # 5. Sync Trade Signals
    print("📥 Syncing Trade Signals...")
    df_sig = pd.read_excel(excel_path, sheet_name="🎯 Trade Signals")
    signal_rows = []
    
    for _, row in df_sig.iterrows():
        sym = str(row["Symbol"]).strip()
        asset_id = symbol_to_id.get(sym) or symbol_to_id.get(f"{sym}.IS")
        if not asset_id:
            continue
            
        sig_date = str(row["Signal Date"])[:10]
        strategy = str(row["Strategy"]).lower().replace(" ", "_")
        entry_p = float(row["Entry Price"]) if pd.notna(row["Entry Price"]) else 0
        stop_l = float(row["Stop Loss"]) if pd.notna(row["Stop Loss"]) else None
        target_p = float(row["Target"]) if pd.notna(row["Target"]) else None

        # Sanity check: Spot equities MUST be long setups (target > entry and stop < entry)
        if target_p is not None and stop_l is not None and entry_p > 0:
            if target_p <= entry_p or stop_l >= entry_p:
                print(f"⚠️ Rejecting inverted setup for {sym} (Entry: {entry_p}, Stop: {stop_l}, Target: {target_p})")
                continue
        
        signal_rows.append({
            "asset_id": asset_id,
            "strategy": strategy,
            "signal_date": sig_date,
            "entry_price": entry_p,
            "stop_loss": stop_l,
            "target_1": target_p,
            "risk_reward_ratio": float(row["R:R Ratio"]) if pd.notna(row["R:R Ratio"]) else None,
            "confidence_score": 8.0,
            "ai_rationale": f"{row['Strategy']} trigger for {sym}. Target: {row['Target']}, Stop: {row['Stop Loss']}.",
            "status": "open",
        })
        
    if signal_rows:
        try:
            # Preserve original trigger entry prices, stop-loss, targets, and trigger dates for existing open trades
            existing_open = client.table("trade_signals").select("*").eq("status", "open").execute()
            existing_map = {}
            if existing_open.data:
                for row in existing_open.data:
                    existing_map[row["asset_id"]] = row
            
            final_signal_rows = []
            seen_assets = set()
            for sig in signal_rows:
                aid = sig["asset_id"]
                if aid in existing_map:
                    # Keep original trigger setup and original trigger date
                    orig = existing_map[aid]
                    sig["entry_price"] = orig["entry_price"]
                    sig["stop_loss"] = orig["stop_loss"]
                    sig["target_1"] = orig["target_1"]
                    sig["risk_reward_ratio"] = orig.get("risk_reward_ratio") or sig.get("risk_reward_ratio")
                    sig["signal_date"] = orig["signal_date"]
                    orig_rat = orig.get("ai_rationale", "")
                    sig["ai_rationale"] = orig_rat if "RE-CONFIRMED" in orig_rat else f"RE-CONFIRMED: {orig_rat or sig['ai_rationale']}"
                final_signal_rows.append(sig)
                seen_assets.add(aid)

            # Preserve existing open trades that did not trigger again today (they remain active until target/stop hit)
            for aid, orig in existing_map.items():
                if aid not in seen_assets:
                    clean_orig = {k: v for k, v in orig.items() if k not in ["id", "created_at", "assets"]}
                    final_signal_rows.append(clean_orig)
                    seen_assets.add(aid)

            client.table("trade_signals").delete().eq("status", "open").execute()
            client.table("trade_signals").insert(final_signal_rows).execute()
            print(f"✅ Recorded {len(final_signal_rows)} active trade signals in Supabase (multi-day active setups & original trigger dates preserved).")
        except Exception as e:
            print(f"Error inserting signals: {e}")

    # 6. Sync Portfolio Positions
    portfolio_file = Path(__file__).parent / "portfolio.json"
    if portfolio_file.exists():
        import json
        print("📥 Syncing Portfolio Positions...")
        try:
            with open(portfolio_file, "r", encoding="utf-8") as f:
                holdings = json.load(f)
            pos_rows = []
            for item in holdings:
                raw_sym = item.get("symbol", "").upper().strip()
                asset_id = symbol_to_id.get(raw_sym) or symbol_to_id.get(f"{raw_sym}.IS")
                if not asset_id:
                    continue
                pos_rows.append({
                    "asset_id": asset_id,
                    "quantity": float(item.get("shares", 0)),
                    "avg_entry_price": float(item.get("entry_price", 0)),
                    "entry_date": item.get("entry_date") or str(datetime.now().date()),
                    "stop_loss": float(item.get("stop_loss")) if item.get("stop_loss") else None,
                    "target_price": float(item.get("target_price")) if item.get("target_price") else None,
                    "notes": str(item.get("notes", "")),
                    "is_open": True,
                })
            if pos_rows:
                try:
                    # Check if user already has positions in Supabase
                    existing_pos = client.table("portfolio_positions").select("id").eq("is_open", True).execute()
                    if not existing_pos.data or len(existing_pos.data) == 0:
                        client.table("portfolio_positions").insert(pos_rows).execute()
                        print(f"✅ Initialized {len(pos_rows)} default portfolio positions in Supabase.")
                    else:
                        print(f"ℹ️ Preserving {len(existing_pos.data)} active user-managed positions in Supabase (no overwrite).")
                except Exception as e:
                    print(f"Error checking/syncing portfolio positions: {e}")
        except Exception as e:
            print(f"Error reading portfolio.json: {e}")

    print("\n🎉 ALL EXTRACTED DATA IS FULLY RECORDED IN SUPABASE POSTGRESQL!")

if __name__ == "__main__":
    sync_all_to_supabase()
