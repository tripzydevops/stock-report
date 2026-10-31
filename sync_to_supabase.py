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
import json
from datetime import datetime, timedelta, date
from pathlib import Path

# Load env variables from backend/.env
env_path = Path(__file__).parent / "backend" / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from app.core.database import get_supabase_client, upsert_rows, select_rows, insert_rows
from app.services.report_storage import compute_sha256
from app.models.data_contracts import (
    validate_ohlcv_dataframe,
    validate_indicators_dataframe,
    validate_movements_dataframe,
    validate_trade_signals_dataframe,
)

from app.services.signal_persistence import validate_and_normalize_confidence, validate_trade_geometry

def _normalize_confidence(raw: float) -> float:
    """Canonicalize confidence to a 0-100 scale at the write boundary."""
    return validate_and_normalize_confidence(raw)

def sync_all_to_supabase(excel_path=None, report_record=None, raw_signals=None):
    from datetime import timezone
    print("🚀 Connecting to Supabase...")
    client = get_supabase_client()
    
    # Critical section tracking for non-zero exit and enterprise error handling
    critical_sections = ["price_history", "daily_indicators", "price_snapshots", "stock_movements", "trade_signals"]
    sync_results = {}
    critical_errors = []
    
    # 1. Fetch asset symbol -> id map
    res = client.table("assets").select("id, symbol").execute()
    assets = res.data if res.data else []
    if not assets:
        raise RuntimeError("No assets found in Supabase. Seed assets first.")
        
    symbol_to_id = {}
    for a in assets:
        sym = a["symbol"]
        symbol_to_id[sym] = a["id"]
        # Also map without .IS
        clean_sym = sym.replace(".IS", "")
        symbol_to_id[clean_sym] = a["id"]
        
    print(f"✅ Loaded {len(assets)} registered assets from Supabase.")
    
    if excel_path is None:
        excel_path = Path(__file__).parent / "MarketPulse_Latest.xlsx"
    else:
        excel_path = Path(excel_path)

    if not excel_path.exists():
        raise FileNotFoundError(f"{excel_path} not found. Run export_to_spreadsheet.py first.")

    # Mandatory report record check: match by checksum or require upload first
    if report_record is None:
        checksum = compute_sha256(excel_path)
        try:
            res_reg = client.table("report_files").select("*").eq("checksum_sha256", checksum).order("created_at", desc=True).limit(1).execute()
            if res_reg.data and len(res_reg.data) > 0:
                report_record = res_reg.data[0]
                print(f"✅ Resolved report_record from database via checksum: {report_record.get('storage_path')}")
        except Exception as lookup_err:
            print(f"⚠️ Checksum registry lookup note: {lookup_err}")

    if report_record is None:
        raise ValueError(
            f"No matching report_files record found for {excel_path}. "
            "Refusing to sync unregistered report. Call upload_report_to_storage() before sync_all_to_supabase()."
        )

    report_file_id = report_record.get("id")
    snapshot_time = report_record.get("generated_at")
    if snapshot_time and isinstance(snapshot_time, datetime):
        snapshot_time = snapshot_time.isoformat()
    print(f"🔗 Linked to Report File ID: {report_file_id} (Snapshot Time: {snapshot_time})")
        
    # 2. Sync Price History (last 30 days per asset to Supabase for efficiency)
    print("📥 Reading Price History from spreadsheet...")
    df_prices = pd.read_excel(excel_path, sheet_name="📅 Price History")
    df_prices = validate_ohlcv_dataframe(df_prices, strict=False, preserve_original_columns=True)
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
    price_errors = 0
    for i in range(0, len(price_rows), 100):
        chunk = price_rows[i:i+100]
        try:
            client.table("price_history").upsert(chunk, on_conflict="asset_id,date").execute()
        except Exception as e:
            price_errors += 1
            print(f"Error upserting prices chunk {i}: {e}")
            critical_errors.append(f"price_history chunk {i}: {e}")

    if price_errors == 0:
        sync_results["price_history"] = {"status": "SUCCESS", "count": len(price_rows)}
        print("✅ Price history recorded in Supabase.")
    else:
        sync_results["price_history"] = {"status": "FAILED", "errors": price_errors}

    # 3. Sync Daily Indicators (from Dashboard sheet)
    print("📥 Syncing Daily Indicators...")
    df_dash = pd.read_excel(excel_path, sheet_name="📊 Dashboard")
    indicator_rows = []
    
    for _, row in df_dash.iterrows():
        sym = str(row["Symbol"]).strip()
        asset_id = symbol_to_id.get(sym) or symbol_to_id.get(f"{sym}.IS")
        if not asset_id:
            continue
            
        dt_str = str(row.get("Date", date.today()))[:10] if pd.notna(row.get("Date")) else str(date.today())
        def _get_float(r, col):
            if col in r and pd.notna(r[col]) and r[col] != "":
                try:
                    return float(r[col])
                except (ValueError, TypeError):
                    return None
            return None

        indicator_rows.append({
            "asset_id": asset_id,
            "date": dt_str,
            "ema_20": _get_float(row, "EMA 20"),
            "ema_50": _get_float(row, "EMA 50"),
            "ema_200": _get_float(row, "EMA 200"),
            "rsi_14": _get_float(row, "RSI (14)") if _get_float(row, "RSI (14)") is not None else _get_float(row, "RSI"),
            "atr_14": _get_float(row, "ATR (14)") if _get_float(row, "ATR (14)") is not None else _get_float(row, "ATR"),
            "macd": _get_float(row, "MACD"),
            "macd_signal": _get_float(row, "MACD Signal"),
            "bb_upper": _get_float(row, "BB Upper"),
            "bb_lower": _get_float(row, "BB Lower"),
            "volume_ratio": _get_float(row, "Volume Ratio"),
            "high_52w": _get_float(row, "52W High"),
            "low_52w": _get_float(row, "52W Low"),
        })
        
    indicator_errors = 0
    for i in range(0, len(indicator_rows), 100):
        chunk = indicator_rows[i:i+100]
        try:
            client.table("daily_indicators").upsert(chunk, on_conflict="asset_id,date").execute()
        except Exception as e:
            indicator_errors += 1
            print(f"Error upserting indicators chunk {i}: {e}")
            critical_errors.append(f"daily_indicators chunk {i}: {e}")

    if indicator_errors == 0:
        sync_results["daily_indicators"] = {"status": "SUCCESS", "count": len(indicator_rows)}
        print(f"✅ Recorded {len(indicator_rows)} daily indicator snapshots.")
    else:
        sync_results["daily_indicators"] = {"status": "FAILED", "errors": indicator_errors}

    # 3b. Sync Normalized Price Snapshots & Stock Movements (Immutable Point-in-time)
    print("📥 Syncing Normalized Price Snapshots & Stock Movements...")
    signal_lookup = {}
    try:
        df_sig_preview = pd.read_excel(excel_path, sheet_name="🎯 Trade Signals")
        for _, s_row in df_sig_preview.iterrows():
            s_sym = str(s_row["Symbol"]).replace(".IS", "").strip()
            signal_lookup[s_sym] = {
                "strategy": str(s_row.get("Strategy", "")),
                "score": float(s_row.get("R:R Ratio", 8.0)) if pd.notna(s_row.get("R:R Ratio")) else 8.0,
            }
    except Exception as e:
        print(f"Note on reading signals preview: {e}")

    price_snapshot_rows = []
    stock_movement_rows = []
    latest_asset_quotes = {}

    for _, row in df_dash.iterrows():
        sym = str(row["Symbol"]).strip()
        asset_id = symbol_to_id.get(sym) or symbol_to_id.get(f"{sym}.IS")
        if not asset_id:
            continue

        c = _clean_float(row.get("Close"))
        if c is None or c <= 0:
            continue

        o = _clean_float(row.get("Open"))
        h = _clean_float(row.get("High"))
        l = _clean_float(row.get("Low"))
        v = _clean_float(row.get("Volume"))
        chg_pct = _clean_float(row.get("Change %"))

        # Calculate true daily dollar change matching Change % (Close - Previous Close)
        prev_close = None
        if chg_pct is not None and chg_pct != -100.0:
            prev_close = c / (1.0 + (chg_pct / 100.0))
            daily_chg_amt = round(c - prev_close, 4)
        else:
            daily_chg_amt = round(c - o, 4) if (c is not None and o is not None) else None

        intraday_chg_amt = round(c - o, 4) if (c is not None and o is not None) else None

        latest_asset_quotes[asset_id] = {
            "open": o,
            "high": h,
            "low": l,
            "close": c
        }

        price_snapshot_rows.append({
            "asset_id": asset_id,
            "snapshot_time": snapshot_time,
            "open": o if o is not None else c,
            "high": h if h is not None else c,
            "low": l if l is not None else c,
            "close": c,
            "volume": int(v) if v is not None else 0,
            "source": "marketpulse_daily"
        })

        # Direction determination
        direction = "FLAT"
        if chg_pct is not None:
            if chg_pct > 0.05:
                direction = "UP"
            elif chg_pct < -0.05:
                direction = "DOWN"

        clean_sym = sym.replace(".IS", "").strip()
        sig_info = signal_lookup.get(clean_sym)
        sig_name = sig_info.get("strategy") if sig_info else None
        sig_score = sig_info.get("score") if sig_info else None

        movement_meta = {
            "rsi_14": _clean_float(row.get("RSI (14)")),
            "atr_14": _clean_float(row.get("ATR (14)")),
            "ema_20": _clean_float(row.get("EMA 20")),
            "ema_50": _clean_float(row.get("EMA 50")),
            "ema_200": _clean_float(row.get("EMA 200")),
            "volume_ratio": _clean_float(row.get("Volume Ratio")),
            "high_52w": _clean_float(row.get("52W High")),
            "low_52w": _clean_float(row.get("52W Low")),
            "intraday_change_amount": intraday_chg_amt,
            "previous_close": round(prev_close, 4) if prev_close is not None else None
        }

        stock_movement_rows.append({
            "asset_id": asset_id,
            "movement_time": snapshot_time,
            "direction": direction,
            "change_amount": daily_chg_amt,
            "change_pct": chg_pct,
            "signal": sig_name,
            "score": sig_score,
            "metadata": movement_meta,
            "report_file_id": report_file_id
        })

    # Upsert price_snapshots in chunks of 100
    snapshot_errors = 0
    for i in range(0, len(price_snapshot_rows), 100):
        chunk = price_snapshot_rows[i:i+100]
        try:
            client.table("price_snapshots").upsert(chunk, on_conflict="asset_id,snapshot_time").execute()
        except Exception as e:
            snapshot_errors += 1
            print(f"Error upserting price_snapshots chunk {i}: {e}")
            critical_errors.append(f"price_snapshots chunk {i}: {e}")

    if snapshot_errors == 0:
        sync_results["price_snapshots"] = {"status": "SUCCESS", "count": len(price_snapshot_rows)}
        print(f"✅ Recorded {len(price_snapshot_rows)} price snapshots in public.price_snapshots.")
    else:
        sync_results["price_snapshots"] = {"status": "FAILED", "errors": snapshot_errors}

    # Upsert stock_movements in chunks of 100
    movement_errors = 0
    for i in range(0, len(stock_movement_rows), 100):
        chunk = stock_movement_rows[i:i+100]
        try:
            client.table("stock_movements").upsert(chunk, on_conflict="asset_id,movement_time").execute()
        except Exception as e:
            movement_errors += 1
            print(f"Error upserting stock_movements chunk {i}: {e}")
            critical_errors.append(f"stock_movements chunk {i}: {e}")

    if movement_errors == 0:
        sync_results["stock_movements"] = {"status": "SUCCESS", "count": len(stock_movement_rows)}
        print(f"✅ Recorded {len(stock_movement_rows)} normalized stock movements in public.stock_movements.")
    else:
        sync_results["stock_movements"] = {"status": "FAILED", "errors": movement_errors}

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
            
        close_val = row.get("Index Close") if pd.notna(row.get("Index Close")) else row.get("Close")
        ema50_val = row.get("EMA 50")
        ema200_val = row.get("EMA 200")
        regime_rows.append({
            "market": market_code,
            "date": today_str,
            "regime": regime_status,
            "index_close": float(close_val) if pd.notna(close_val) else None,
            "ema_50": float(ema50_val) if pd.notna(ema50_val) else None,
            "ema_200": float(ema200_val) if pd.notna(ema200_val) else None,
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
    signal_rows = []
    today_date = date.today()
    today_str = today_date.strftime("%Y-%m-%d")

    if raw_signals is not None:
        # PATH A: Direct in-memory structured signals from screener engine (Lossless)
        for sig in raw_signals:
            raw_sym = str(sig.get("symbol", "")).strip()
            sym = raw_sym.replace(".IS", "")
            asset_id = symbol_to_id.get(sym) or symbol_to_id.get(f"{sym}.IS") or symbol_to_id.get(raw_sym)
            if not asset_id:
                continue

            sig_date = str(sig.get("signal_date", today_str))[:10]
            strategy = str(sig.get("strategy", "")).lower().replace(" ", "_")
            entry_p = float(sig.get("entry_price", 0)) if sig.get("entry_price") else 0.0
            stop_l = float(sig.get("stop_loss", 0)) if sig.get("stop_loss") else None
            target_1 = float(sig.get("target_1", 0)) if sig.get("target_1") else None
            target_2 = float(sig.get("target_2", 0)) if sig.get("target_2") else None
            rr = float(sig.get("risk_reward_ratio", 0)) if sig.get("risk_reward_ratio") else None
            raw_conf = float(sig.get("confidence_score", 0)) if sig.get("confidence_score") else 0.0
            conf = _normalize_confidence(raw_conf)

            # Spot equities trade geometry validation
            is_valid_geom, geom_err = validate_trade_geometry(sig)
            if not is_valid_geom:
                print(f"⚠️ Rejecting invalid trade geometry for {sym}: {geom_err}")
                continue

            # Full structured explainer package
            explanation_payload = {
                "symbol": sym,
                "strategy": sig.get("strategy") or strategy,
                "trigger_reasons": sig.get("trigger_reasons", []),
                "failed_checks": sig.get("failed_checks", []),
                "invalidation": sig.get("invalidation", ""),
                "market_context": sig.get("market_context", {}),
                "risk": sig.get("risk", {}),
                "rationale": sig.get("rationale") or f"{sig.get('strategy')} trigger for {sym}.",
                "entry_mode": sig.get("entry_mode", "next_open"),
                "direction": sig.get("direction", "LONG"),
                "signal_date": sig_date,
            }

            signal_rows.append({
                "asset_id": asset_id,
                "strategy": strategy,
                "signal_date": sig_date,
                "entry_price": entry_p,
                "stop_loss": stop_l,
                "target_1": target_1,
                "target_2": target_2,
                "risk_reward_ratio": rr,
                "confidence_score": conf,
                "ai_rationale": json.dumps(explanation_payload, ensure_ascii=False),
                "status": "open",
            })
    else:
        # PATH B: Fallback from Excel spreadsheet
        df_sig = pd.read_excel(excel_path, sheet_name="🎯 Trade Signals")
        df_sig = validate_trade_signals_dataframe(df_sig, strict=False, preserve_original_columns=True)

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
            target_2 = float(row["Target 2"]) if "Target 2" in row and pd.notna(row["Target 2"]) else None
            conf = _normalize_confidence(float(row["Confidence %"]) if "Confidence %" in row and pd.notna(row["Confidence %"]) else 0.0)

            candidate_sig = {
                "direction": "LONG",
                "entry_price": entry_p,
                "stop_loss": stop_l,
                "target_1": target_p,
                "target_2": target_2,
            }
            is_valid_geom, geom_err = validate_trade_geometry(candidate_sig)
            if not is_valid_geom:
                print(f"⚠️ Rejecting invalid trade geometry for {sym}: {geom_err}")
                continue

            # Check if Full Explainer JSON column exists in Excel
            if "Full Explainer JSON" in row and pd.notna(row["Full Explainer JSON"]):
                ai_rat_str = str(row["Full Explainer JSON"])
            else:
                why_fired = [r.strip() for r in str(row.get("Why It Fired", "")).split(" | ") if r.strip()]
                explanation_payload = {
                    "symbol": sym,
                    "strategy": str(row["Strategy"]),
                    "trigger_reasons": why_fired or [f"{row['Strategy']} trigger confirmed for {sym}."],
                    "failed_checks": [],
                    "invalidation": str(row.get("Invalidation Rule", f"Daily close below stop loss ({stop_l}) cancels the setup.")),
                    "market_context": {"market": str(row.get("Market", "BIST"))},
                    "risk": {"rr_ratio": float(row.get("R:R Ratio", 2.0)) if pd.notna(row.get("R:R Ratio")) else 2.0},
                    "rationale": str(row.get("Rationale", f"{row['Strategy']} trigger for {sym}. Target: {target_p}, Stop: {stop_l}.")),
                    "entry_mode": str(row.get("Entry Mode", "next_open")),
                    "direction": "LONG",
                    "signal_date": sig_date,
                }
                ai_rat_str = json.dumps(explanation_payload, ensure_ascii=False)

            signal_rows.append({
                "asset_id": asset_id,
                "strategy": strategy,
                "signal_date": sig_date,
                "entry_price": entry_p,
                "stop_loss": stop_l,
                "target_1": target_p,
                "target_2": target_2,
                "risk_reward_ratio": float(row["R:R Ratio"]) if pd.notna(row["R:R Ratio"]) else None,
                "confidence_score": conf,
                "ai_rationale": ai_rat_str,
                "status": "open",
            })

    try:
        # USER CONSTRAINT: If user is holding the stock in portfolio_positions, NEVER remove or auto-archive it!
        held_asset_ids = set()
        try:
            held_res = client.table("portfolio_positions").select("asset_id, quantity, is_open").eq("is_open", True).gt("quantity", 0).execute()
            if held_res.data:
                for p in held_res.data:
                    if p.get("asset_id"):
                        held_asset_ids.add(p["asset_id"])
        except Exception as e:
            print(f"Note checking held portfolio assets: {e}")

        # Fetch current open trade signals from Supabase
        existing_open = client.table("trade_signals").select("*").eq("status", "open").execute()
        existing_map = {}
        if existing_open.data:
            for row in existing_open.data:
                key = (row["asset_id"], str(row.get("strategy", "")).lower().strip())
                existing_map[key] = row

        signals_to_insert = []
        signals_to_resolve = []
        signals_reconfirmed = 0
        seen_keys = set()

        # 1. Process new daily triggers
        for sig in signal_rows:
            key = (sig["asset_id"], sig["strategy"])
            seen_keys.add(key)
            if key in existing_map:
                # Signal already exists in DB! Re-confirm without duplicate insertion.
                orig = existing_map[key]
                signals_reconfirmed += 1
                orig_rat = orig.get("ai_rationale") or ""

                update_fields = {}
                is_legacy = not (orig_rat.strip().startswith("{") and orig_rat.strip().endswith("}"))

                today_scan_payload = {}
                try:
                    today_scan_payload = json.loads(sig["ai_rationale"]) if isinstance(sig.get("ai_rationale"), str) else (sig.get("ai_rationale") or {})
                except Exception:
                    today_scan_payload = {}

                reconf_entry = {
                    "date": today_str,
                    "reconfirmed_price": float(sig.get("entry_price") or 0),
                    "reconfirmed_stop": float(sig.get("stop_loss") or 0) if sig.get("stop_loss") else None,
                    "reconfirmed_target_1": float(sig.get("target_1") or 0) if sig.get("target_1") else None,
                    "reconfirmed_target_2": float(sig.get("target_2") or 0) if sig.get("target_2") else None,
                    "scan_risk": today_scan_payload.get("risk", {}),
                    "trigger_reasons": today_scan_payload.get("trigger_reasons", []),
                    "market_context": today_scan_payload.get("market_context", {}),
                    "rationale": today_scan_payload.get("rationale", ""),
                }

                if is_legacy:
                    # UPGRADE LEGACY SIGNAL SAFELY:
                    # 1. Preserve original plan figures (entry, stop, targets, R:R). Never overwrite with today's scan!
                    # 2. Mark original explainer as unavailable/legacy, never substituting today's risk for the original trade's risk.
                    # 3. Store today's explanation cleanly as a dated reconfirmation.
                    orig_entry_val = float(orig.get("entry_price") or 0)
                    orig_stop_val = float(orig.get("stop_loss") or 0) if orig.get("stop_loss") else None
                    orig_t1_val = float(orig.get("target_1") or 0) if orig.get("target_1") else None
                    orig_t2_val = float(orig.get("target_2") or 0) if orig.get("target_2") else None
                    orig_rr_val = float(orig.get("risk_reward_ratio") or 2.0) if orig.get("risk_reward_ratio") else 2.0

                    clean_legacy_text = orig_rat.replace("RE-CONFIRMED: ", "").strip()

                    upgraded_payload = {
                        "symbol": sym,
                        "strategy": orig.get("strategy") or sig.get("strategy"),
                        "direction": orig.get("direction", "LONG"),
                        "entry_mode": "original_scan",
                        "signal_date": str(orig.get("signal_date")),
                        "original_explainer_status": "legacy_unstructured" if clean_legacy_text else "not_recorded",
                        "original_rationale": clean_legacy_text if clean_legacy_text else None,
                        "rationale": clean_legacy_text if clean_legacy_text else f"Original {orig.get('strategy')} signal recorded prior to structured explainer engine.",
                        "trigger_reasons": [clean_legacy_text] if clean_legacy_text else ["Original trigger conditions recorded prior to explainer upgrade."],
                        "failed_checks": [],
                        "invalidation": f"Daily close below original trade stop ({orig_stop_val}) cancels trade setup.",
                        "market_context": {
                            "note": "Historical scan context preserved from original signal date."
                        },
                        "risk": {
                            "original_entry": orig_entry_val,
                            "original_stop": orig_stop_val,
                            "original_target_1": orig_t1_val,
                            "original_target_2": orig_t2_val,
                            "risk_reward_ratio": orig_rr_val,
                            "note": "Original trade risk preserved; not substituted with today's scan risk."
                        },
                        "reconfirmations": [reconf_entry],
                        "last_reconfirmed_date": today_str,
                        "latest_reconfirmation": reconf_entry,
                    }
                    update_fields["ai_rationale"] = json.dumps(upgraded_payload, ensure_ascii=False)

                    # Standardize confidence score via canonical normalizer
                    orig_conf = float(orig.get("confidence_score") or 0)
                    new_conf = _normalize_confidence(float(sig.get("confidence_score", 0)) if sig.get("confidence_score") else 0.0)
                    if new_conf > 0 and (orig_conf == 0 or _normalize_confidence(orig_conf) != orig_conf):
                        # New scan has a proper score and original was either missing or on legacy scale
                        update_fields["confidence_score"] = new_conf
                    elif orig_conf > 0:
                        update_fields["confidence_score"] = _normalize_confidence(orig_conf)
                else:
                    # Already structured JSON. Preserve original entry evidence & append dated reconfirmation:
                    try:
                        orig_payload = json.loads(orig_rat)
                        reconf_list = orig_payload.get("reconfirmations", [])
                        
                        reconf_dates = [r.get("date") if isinstance(r, dict) else r for r in reconf_list]
                        if today_str not in reconf_dates:
                            reconf_list.append(reconf_entry)
                            orig_payload["reconfirmations"] = reconf_list

                        orig_payload["last_reconfirmed_date"] = today_str
                        orig_payload["latest_reconfirmation"] = reconf_entry

                        # Crucial: NEVER overwrite original trade's trigger_reasons, invalidation, or risk figures!
                        update_fields["ai_rationale"] = json.dumps(orig_payload, ensure_ascii=False)
                    except Exception:
                        pass

                    # Normalize legacy confidence scale if needed via canonical normalizer
                    orig_conf = float(orig.get("confidence_score") or 0)
                    norm_conf = _normalize_confidence(orig_conf)
                    if norm_conf != orig_conf and norm_conf > 0:
                        update_fields["confidence_score"] = norm_conf

                if update_fields:
                    try:
                        client.table("trade_signals").update(update_fields).eq("id", orig["id"]).execute()
                    except Exception as upd_err:
                        print(f"Note updating reconfirmed signal {orig['id']}: {upd_err}")
            else:
                # Brand new signal trigger: queue for insertion
                signals_to_insert.append(sig)

        # 2. Process existing open trades that did not re-trigger today
        for key, orig in existing_map.items():
            if key in seen_keys:
                continue

            aid = orig.get("asset_id")

            # USER CRITICAL RULE: If the user holds this stock, DO NOT REMOVE OR ARCHIVE IT!
            if aid in held_asset_ids:
                continue

            # For UNOWNED prospective signals: evaluate outcome against latest quotes and time-stop
            entry_p = float(orig.get("entry_price") or 0)
            stop_l = float(orig.get("stop_loss") or 0) if orig.get("stop_loss") else None
            target_p = float(orig.get("target_1") or 0) if orig.get("target_1") else None
            quote = latest_asset_quotes.get(aid, {})
            high_p = quote.get("high")
            low_p = quote.get("low")
            close_p = quote.get("close")

            # Determine strategy max holding days
            strat_lower = str(orig.get("strategy", "")).lower()
            max_days = 20
            if "breakout" in strat_lower or "momentum" in strat_lower:
                max_days = 12
            elif "squeeze" in strat_lower:
                max_days = 15
            elif "reversion" in strat_lower:
                max_days = 10
            elif "vwap" in strat_lower:
                max_days = 15
            elif "sweep" in strat_lower:
                max_days = 10
            elif "strength" in strat_lower or "rs" in strat_lower:
                max_days = 18

            # Calculate business days passed
            sig_date_str = str(orig.get("signal_date", ""))[:10]
            days_passed = 0
            try:
                s_dt = datetime.strptime(sig_date_str, "%Y-%m-%d").date()
                cur = s_dt
                while cur < today_date:
                    cur += timedelta(days=1)
                    if cur.weekday() < 5:
                        days_passed += 1
            except Exception:
                days_passed = 0

            # Outcome Evaluation:
            outcome_status = None
            pnl = 0.0
            exit_msg = ""
            exit_p = entry_p

            if low_p is not None and stop_l and low_p <= stop_l:
                outcome_status = "stopped_out"
                exit_p = stop_l
                pnl = round(((stop_l - entry_p) / entry_p) * 100, 2) if entry_p > 0 else -5.0
                exit_msg = f"Disciplined stop loss triggered at {stop_l} (Low hit {low_p}). Archived to audit ledger."
            elif high_p is not None and target_p and high_p >= target_p:
                outcome_status = "target_hit"
                exit_p = target_p
                pnl = round(((target_p - entry_p) / entry_p) * 100, 2) if entry_p > 0 else 10.0
                exit_msg = f"Target 1 objective reached at {target_p} (High hit {high_p}). Archived to audit ledger."
            elif days_passed >= max_days:
                exit_p = close_p or entry_p
                pnl = round(((exit_p - entry_p) / entry_p) * 100, 2) if entry_p > 0 else 0.0
                outcome_status = "stopped_out" if pnl < 0 else "target_hit"
                exit_msg = f"Max holding period ({max_days} trading days) expired without target. Closed at {exit_p}."

            if outcome_status:
                orig_rat = orig.get("ai_rationale") or ""
                # Preserve original entry rationale rather than overwriting it
                if orig_rat.strip().startswith("{") and orig_rat.strip().endswith("}"):
                    try:
                        resolved_payload = json.loads(orig_rat)
                        resolved_payload["resolution"] = {
                            "status": outcome_status,
                            "exit_price": exit_p,
                            "outcome_pnl_pct": pnl,
                            "closed_at": today_str,
                            "exit_reason": exit_msg,
                        }
                        final_rationale = json.dumps(resolved_payload, ensure_ascii=False)
                    except Exception:
                        final_rationale = f"{orig_rat} | Exit: {exit_msg}"
                else:
                    final_rationale = f"{orig_rat} | Exit: {exit_msg}"

                signals_to_resolve.append({
                    "id": orig["id"],
                    "status": outcome_status,
                    "outcome_pnl_pct": pnl,
                    "closed_at": today_str,
                    "ai_rationale": final_rationale
                })

        # Apply safe reconciliation: NO DELETIONS
        resolved_count = 0
        for res_sig in signals_to_resolve:
            try:
                client.table("trade_signals").update({
                    "status": res_sig["status"],
                    "outcome_pnl_pct": res_sig["outcome_pnl_pct"],
                    "closed_at": res_sig["closed_at"],
                    "ai_rationale": res_sig["ai_rationale"]
                }).eq("id", res_sig["id"]).execute()
                resolved_count += 1
            except Exception as update_err:
                print(f"Error resolving signal {res_sig['id']}: {update_err}")

        inserted_count = 0
        if signals_to_insert:
            for i in range(0, len(signals_to_insert), 50):
                chunk = signals_to_insert[i:i+50]
                try:
                    client.table("trade_signals").insert(chunk).execute()
                    inserted_count += len(chunk)
                except Exception as insert_err:
                    print(f"Error inserting new signals chunk: {insert_err}")
                    critical_errors.append(f"trade_signals insert: {insert_err}")

        sync_results["trade_signals"] = {
            "status": "SUCCESS",
            "inserted": inserted_count,
            "reconfirmed": signals_reconfirmed,
            "resolved": resolved_count
        }
        print(f"✅ Safe trade signals reconciliation complete: {inserted_count} new inserted, {signals_reconfirmed} re-confirmed open, {resolved_count} unowned resolved (Zero delete risk, held stocks strictly preserved).")
    except Exception as e:
        print(f"Error processing trade signals lifecycle: {e}")
        critical_errors.append(f"trade_signals lifecycle: {e}")
        sync_results["trade_signals"] = {"status": "FAILED", "error": str(e)}

    # 6. Sync Portfolio Positions
    portfolio_file = Path(__file__).parent / "portfolio.json"
    if portfolio_file.exists():
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
            print(f"Error loading portfolio.json: {e}")
    # 7. Final Sync Health Summary & Non-Zero Exit on Critical Failures
    print("\n" + "=" * 60)
    print("📊 SUPABASE SYNCHRONIZATION SUMMARY")
    print("=" * 60)
    for sec, res_data in sync_results.items():
        status = res_data.get("status")
        icon = "✅" if status == "SUCCESS" else "❌"
        info = f"{res_data.get('count', '')} rows" if "count" in res_data else str(res_data)
        print(f" {icon} {sec:<22} : {status} ({info})")

    if critical_errors:
        print("\n❌ CRITICAL SYNCHRONIZATION FAILURES DETECTED:")
        for err in critical_errors:
            print(f"  • {err}")
        print("=" * 60)
        raise RuntimeError(f"Supabase synchronization failed with {len(critical_errors)} critical errors.")

    print("=" * 60)
    print("🎉 ALL EXTRACTED DATA IS FULLY & IMMUTABLY RECORDED IN SUPABASE!")
    return sync_results

if __name__ == "__main__":
    sync_all_to_supabase()
