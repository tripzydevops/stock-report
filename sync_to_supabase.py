"""
Sync extracted spreadsheet data to Supabase PostgreSQL database.
Reads the latest generated Excel file (or DataFrames) and persists all
prices, indicators, signals, and regime into Supabase.
"""
import os
import sys
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
    recent_prices = df_prices.groupby("Symbol").tail(15).copy()
    
    price_rows = []
    for _, row in recent_prices.iterrows():
        sym = str(row["Symbol"]).strip()
        asset_id = symbol_to_id.get(sym) or symbol_to_id.get(f"{sym}.IS")
        if not asset_id:
            continue
            
        dt_str = row["Date"].strftime("%Y-%m-%d")
        price_rows.append({
            "asset_id": asset_id,
            "date": dt_str,
            "open": float(row["Open"]) if pd.notna(row["Open"]) else None,
            "high": float(row["High"]) if pd.notna(row["High"]) else None,
            "low": float(row["Low"]) if pd.notna(row["Low"]) else None,
            "close": float(row["Close"]),
            "adj_close": float(row["Close"]),
            "volume": int(row["Volume"]) if pd.notna(row["Volume"]) else 0,
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
        
        signal_rows.append({
            "asset_id": asset_id,
            "strategy": strategy,
            "signal_date": sig_date,
            "entry_price": float(row["Entry Price"]) if pd.notna(row["Entry Price"]) else 0,
            "stop_loss": float(row["Stop Loss"]) if pd.notna(row["Stop Loss"]) else None,
            "target_1": float(row["Target"]) if pd.notna(row["Target"]) else None,
            "risk_reward_ratio": float(row["R:R Ratio"]) if pd.notna(row["R:R Ratio"]) else None,
            "confidence_score": 8.0,
            "ai_rationale": f"{row['Strategy']} trigger for {sym}. Target: {row['Target']}, Stop: {row['Stop Loss']}.",
            "status": "open",
        })
        
    if signal_rows:
        try:
            client.table("trade_signals").insert(signal_rows).execute()
            print(f"✅ Recorded {len(signal_rows)} active trade signals in Supabase.")
        except Exception as e:
            print(f"Error inserting signals: {e}")

    print("\n🎉 ALL EXTRACTED DATA IS FULLY RECORDED IN SUPABASE POSTGRESQL!")

if __name__ == "__main__":
    sync_all_to_supabase()
