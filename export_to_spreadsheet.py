"""
MarketPulse - Google Sheets / Excel Export Script
Fetches live market data, computes indicators, runs screeners,
and exports everything to a multi-tab Excel workbook.

Upload the output .xlsx to Google Drive to open in Google Sheets.

Usage:
    python export_to_spreadsheet.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import pandas as pd
import numpy as np
from datetime import datetime, date, timedelta
from pathlib import Path

from app.services.data_fetcher import fetch_us_prices, fetch_bist_prices, fetch_fx_rate
from app.services.indicators import compute_all_indicators
from app.services.screener import run_all_screens
from app.services.market_regime import evaluate_regime
from app.services.risk_manager import calculate_position_size, calculate_risk_reward
from app.services.trade_evaluator import backtest_all_historical_signals, calculate_performance_summary

# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION — Edit your watchlist here
# ═══════════════════════════════════════════════════════════════════
US_STOCKS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD"]
US_ETFS = ["SPY", "QQQ", "IWM", "GLD", "TLT", "XLF", "XLE", "ARKK"]

# Load entire BIST 100 universe
BIST100_FILE = Path(__file__).parent / "bist100_symbols.json"
if BIST100_FILE.exists():
    import json
    with open(BIST100_FILE, "r", encoding="utf-8") as f:
        BIST_STOCKS = json.load(f)
else:
    BIST_STOCKS = [
        'ISCTR', 'AEFES', 'AGHOL', 'AKBNK', 'AKSA', 'AKSEN', 'ALARK', 'ALTNY', 'ANSGR', 'ARCLK',
        'ASELS', 'ASTOR', 'BALSU', 'BERA', 'BIMAS', 'BRSAN', 'BRYAT', 'BSOKE', 'BTCIM', 'CANTE',
        'CCOLA', 'CIMSA', 'CVKMD', 'CWENE', 'DAPGM', 'DOAS', 'DOHOL', 'DSTKF', 'ECILC', 'EFOR',
        'EGEEN', 'EKGYO', 'ENERY', 'ENJSA', 'ENKAI', 'EREGL', 'ESEN', 'EUPWR', 'EUREN', 'FENER',
        'FROTO', 'GARAN', 'GESAN', 'GLRMK', 'GRSEL', 'GRTHO', 'GSRAY', 'GUBRF', 'HALKB', 'HEKTS',
        'IEYHO', 'ISMEN', 'IZENR', 'KCHOL', 'KLRHO', 'KONTR', 'KRDMD', 'KTLEV', 'KUYAS', 'MAGEN',
        'MAVI', 'MGROS', 'MIATK', 'MPARK', 'OBAMS', 'ODAS', 'ODINE', 'OTKAR', 'OYAKC', 'PAHOL',
        'PASEU', 'PETKM', 'PGSUS', 'PSGYO', 'QUAGR', 'RALYH', 'REEDR', 'SAHOL', 'SASA', 'SISE',
        'SKBNK', 'SMRTG', 'SOKM', 'TAVHL', 'TCELL', 'THYAO', 'TKFEN', 'TOASO', 'TRALT', 'TRENJ',
        'TRMET', 'TSKB', 'TTKOM', 'TUKAS', 'TUPRS', 'TURSG', 'ULKER', 'VAKBN', 'VESTL', 'YKBNK',
        'ZOREN'
    ]

BIST_ETFS = ["XU100.IS"]  # BIST 100 Index (fetched directly with .IS)

ACCOUNT_SIZE_USD = 10000
ACCOUNT_SIZE_TRY = 300000
RISK_PCT = 1.0

OUTPUT_DIR = Path(__file__).parent
# ═══════════════════════════════════════════════════════════════════


def fetch_all_data():
    """Fetch price data for all configured tickers."""
    print("📡 Fetching US stocks & ETFs...")
    us_data = fetch_us_prices(US_STOCKS + US_ETFS, period="1y")
    
    print("📡 Fetching BIST stocks...")
    bist_data = fetch_bist_prices(BIST_STOCKS, period="1y")
    
    # Fetch BIST index directly
    print("📡 Fetching BIST 100 index...")
    import yfinance as yf
    for etf in BIST_ETFS:
        try:
            df = yf.download(etf, period="1y", auto_adjust=False)
            if not df.empty:
                df.columns = [c.lower().replace(' ', '_') for c in df.columns]
                bist_data[etf] = df
        except Exception:
            pass
    
    print("📡 Fetching USD/TRY rate...")
    fx_data = fetch_fx_rate("USDTRY", period="1y")
    
    return us_data, bist_data, fx_data


def build_assets_sheet(us_data, bist_data):
    """Build the Assets Registry sheet."""
    rows = []
    for sym in us_data:
        asset_class = "etf" if sym in US_ETFS else "stock"
        rows.append({"Symbol": sym, "Name": sym, "Asset Class": asset_class, "Market": "US", "Currency": "USD"})
    for sym in bist_data:
        asset_class = "etf" if sym.replace(".IS", "") in [e.replace(".IS","") for e in BIST_ETFS] or sym == "XU100.IS" else "stock"
        clean_sym = sym.replace(".IS", "")
        rows.append({"Symbol": clean_sym, "Name": clean_sym, "Asset Class": asset_class, "Market": "BIST", "Currency": "TRY"})
    return pd.DataFrame(rows)


def build_latest_prices_sheet(all_enriched, asset_info):
    """Build the Latest Prices + Key Indicators sheet."""
    rows = []
    for sym, df in all_enriched.items():
        if df.empty:
            continue
        last = df.iloc[-1]
        prev = df.iloc[-2] if len(df) > 1 else last
        change_pct = ((last["close"] - prev["close"]) / prev["close"]) * 100 if prev["close"] != 0 else 0
        
        info = asset_info.get(sym, {})
        rows.append({
            "Symbol": sym.replace(".IS", ""),
            "Market": info.get("Market", ""),
            "Currency": info.get("Currency", ""),
            "Date": df.index[-1].strftime("%Y-%m-%d") if hasattr(df.index[-1], "strftime") else str(df.index[-1]),
            "Close": round(float(last["close"]), 2),
            "Change %": round(float(change_pct), 2),
            "Open": round(float(last.get("open", 0)), 2),
            "High": round(float(last.get("high", 0)), 2),
            "Low": round(float(last.get("low", 0)), 2),
            "Volume": int(last.get("volume", 0)) if pd.notna(last.get("volume")) else 0,
            "RSI (14)": round(float(last.get("rsi_14", 0)), 2) if pd.notna(last.get("rsi_14")) else "",
            "EMA 20": round(float(last.get("ema_20", 0)), 2) if pd.notna(last.get("ema_20")) else "",
            "EMA 50": round(float(last.get("ema_50", 0)), 2) if pd.notna(last.get("ema_50")) else "",
            "EMA 200": round(float(last.get("ema_200", 0)), 2) if pd.notna(last.get("ema_200")) else "",
            "ATR (14)": round(float(last.get("atr_14", 0)), 4) if pd.notna(last.get("atr_14")) else "",
            "MACD": round(float(last.get("macd", 0)), 4) if pd.notna(last.get("macd")) else "",
            "MACD Signal": round(float(last.get("macd_signal", 0)), 4) if pd.notna(last.get("macd_signal")) else "",
            "BB Upper": round(float(last.get("bb_upper", 0)), 2) if pd.notna(last.get("bb_upper")) else "",
            "BB Lower": round(float(last.get("bb_lower", 0)), 2) if pd.notna(last.get("bb_lower")) else "",
            "Volume Ratio": round(float(last.get("volume_ratio", 0)), 2) if pd.notna(last.get("volume_ratio")) else "",
            "52W High": round(float(last.get("high_52w", 0)), 2) if pd.notna(last.get("high_52w")) else "",
            "52W Low": round(float(last.get("low_52w", 0)), 2) if pd.notna(last.get("low_52w")) else "",
            "EMA Status": _ema_status(last),
        })
    
    df_out = pd.DataFrame(rows)
    # Sort by Change % descending
    if not df_out.empty and "Change %" in df_out.columns:
        df_out = df_out.sort_values("Change %", ascending=False)
    return df_out


def _ema_status(row):
    """Determine EMA trend status."""
    close = row.get("close", 0)
    ema200 = row.get("ema_200")
    ema50 = row.get("ema_50")
    if pd.isna(ema200) or pd.isna(ema50):
        return "N/A"
    if close > ema200 and close > ema50:
        return "✅ Above 200 & 50 EMA"
    elif close > ema200:
        return "🟡 Above 200, Below 50 EMA"
    else:
        return "🔴 Below 200 EMA"


def build_market_regime_sheet(us_data, bist_data):
    """Build market regime analysis sheet."""
    rows = []
    
    # US regime (SPY)
    if "SPY" in us_data:
        spy_enriched = compute_all_indicators(us_data["SPY"])
        if not spy_enriched.empty:
            regime_info = evaluate_regime(spy_enriched)
            last = spy_enriched.iloc[-1]
            rows.append({
                "Market": "US (SPY)",
                "Regime": regime_info.get("regime", "unknown").upper(),
                "Index Close": round(float(last["close"]), 2),
                "EMA 50": round(float(last.get("ema_50", 0)), 2),
                "EMA 200": round(float(last.get("ema_200", 0)), 2),
                "RSI": round(float(last.get("rsi_14", 0)), 2),
                "Notes": regime_info.get("notes", ""),
            })
    
    # BIST regime (XU100.IS)
    xu100_key = None
    for k in bist_data:
        if "XU100" in k:
            xu100_key = k
            break
    
    if xu100_key:
        xu_enriched = compute_all_indicators(bist_data[xu100_key])
        if not xu_enriched.empty:
            regime_info = evaluate_regime(xu_enriched)
            last = xu_enriched.iloc[-1]
            rows.append({
                "Market": "BIST (XU100)",
                "Regime": regime_info.get("regime", "unknown").upper(),
                "Index Close": round(float(last["close"]), 2),
                "EMA 50": round(float(last.get("ema_50", 0)), 2),
                "EMA 200": round(float(last.get("ema_200", 0)), 2),
                "RSI": round(float(last.get("rsi_14", 0)), 2),
                "Notes": regime_info.get("notes", ""),
            })
    
    return pd.DataFrame(rows)


def build_trade_signals_sheet(all_enriched, asset_info):
    """Run screeners and build trade signals sheet."""
    signals = run_all_screens(all_enriched, asset_info)
    
    rows = []
    for sig in signals:
        sym = sig.get("symbol", "").replace(".IS", "")
        info = asset_info.get(sig.get("symbol"), {})
        currency = info.get("Currency", "USD")
        account = ACCOUNT_SIZE_USD if currency == "USD" else ACCOUNT_SIZE_TRY
        
        entry = sig.get("entry_price", 0)
        stop = sig.get("stop_loss", 0)
        target = sig.get("target_1", 0)
        
        sizing = calculate_position_size(account, RISK_PCT, entry, stop) if entry and stop else {}
        rr = calculate_risk_reward(entry, stop, target) if entry and stop and target else 0
        
        rows.append({
            "Symbol": sym,
            "Market": info.get("Market", ""),
            "Strategy": sig.get("strategy", ""),
            "Signal Date": str(sig.get("signal_date", "")),
            "Entry Price": round(float(entry), 2) if entry else "",
            "Stop Loss": round(float(stop), 2) if stop else "",
            "Target": round(float(target), 2) if target else "",
            "R:R Ratio": round(float(rr), 2) if rr else "",
            "Risk Amount": round(float(sizing.get("risk_amount", 0)), 2) if sizing else "",
            "Shares to Buy": sizing.get("shares_to_buy", ""),
            "Position Value": round(float(sizing.get("position_value", 0)), 2) if sizing else "",
            "Currency": currency,
        })
    
    return pd.DataFrame(rows)


def build_price_history_sheet(all_enriched, top_n_days=252):
    """Build a price history sheet with last N days (1 year = 252 trading days) for each symbol."""
    frames = []
    for sym, df in all_enriched.items():
        if df.empty:
            continue
        recent = df.tail(top_n_days).copy()
        recent["Symbol"] = sym.replace(".IS", "")
        recent["Date"] = [d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10] for d in recent.index]
        cols = ["Symbol", "Date", "open", "high", "low", "close", "volume"]
        available = [c for c in cols if c in recent.columns]
        frames.append(recent[available])
    
    if frames:
        combined = pd.concat(frames, ignore_index=True)
        rename_map = {"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"}
        combined = combined.rename(columns=rename_map)
        # Round price columns
        for c in ["Open", "High", "Low", "Close"]:
            if c in combined.columns:
                combined[c] = combined[c].round(2)
        return combined
    return pd.DataFrame()


def build_fx_sheet(fx_data, top_n_days=252):
    """Build FX rates sheet with 1 full year of history."""
    if fx_data is None or fx_data.empty:
        return pd.DataFrame()
    
    recent = fx_data.tail(top_n_days).copy()
    recent["Date"] = [d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10] for d in recent.index]
    recent = recent[["Date", "close"]].copy()
    recent.columns = ["Date", "USD/TRY Rate"]
    recent["USD/TRY Rate"] = recent["USD/TRY Rate"].round(4)
    return recent


def build_trade_outcomes_and_scorecard(all_enriched):
    """
    Evaluates historical and active trade setups, tracks their real-world outcomes (target hit vs stop loss),
    and computes scorecard KPIs.
    """
    trades = backtest_all_historical_signals(all_enriched, lookback_bars=120)
    
    rows = []
    for t in trades:
        rows.append({
            "Symbol": t["symbol"].replace(".IS", ""),
            "Strategy": t["strategy"],
            "Signal Date": t["signal_date"],
            "Entry Price": round(t["entry_price"], 2),
            "Target Price": round(t["target"], 2) if t["target"] else "",
            "Stop Loss": round(t["stop_loss"], 2) if t["stop_loss"] else "",
            "Exit Price": round(t["exit_price"], 2) if t["exit_price"] else "",
            "Exit Date": t["exit_date"] if t["exit_date"] else "Still Active",
            "Result": t["status"],
            "PnL %": f"{t['pnl_pct']:+.2f}%",
            "Days Held": t["days_held"],
        })
    outcomes_df = pd.DataFrame(rows)
    kpi_df, strat_df = calculate_performance_summary(trades)
    return outcomes_df, kpi_df, strat_df


def build_position_sizing_sheet():
    """Build a reference position sizing table."""
    rows = []
    test_cases = [
        ("USD Example", 10000, 1.0, 150.0, 145.0, 165.0, "USD"),
        ("USD Aggressive", 10000, 2.0, 150.0, 145.0, 165.0, "USD"),
        ("TRY Example", 300000, 1.0, 310.0, 295.0, 350.0, "TRY"),
        ("TRY Conservative", 300000, 0.5, 310.0, 295.0, 350.0, "TRY"),
    ]
    for name, account, risk, entry, stop, target, curr in test_cases:
        sizing = calculate_position_size(account, risk, entry, stop)
        rr = calculate_risk_reward(entry, stop, target)
        symbol = "$" if curr == "USD" else "₺"
        rows.append({
            "Scenario": name,
            "Account Size": f"{symbol}{account:,.0f}",
            "Risk %": f"{risk}%",
            "Entry": round(entry, 2),
            "Stop Loss": round(stop, 2),
            "Target": round(target, 2),
            "Risk Amount": round(sizing.get("risk_amount", 0), 2),
            "Shares to Buy": sizing.get("shares_to_buy", 0),
            "Position Value": round(sizing.get("position_value", 0), 2),
            "R:R Ratio": round(rr, 2),
            "Currency": curr,
        })
    return pd.DataFrame(rows)


def export_to_excel(sheets: dict, output_path: str):
    """Export all DataFrames to a multi-tab Excel workbook."""
    with pd.ExcelWriter(output_path, engine="xlsxwriter") as writer:
        workbook = writer.book
        
        # Define formats
        header_fmt = workbook.add_format({
            "bold": True, "bg_color": "#1e3a5f", "font_color": "white",
            "border": 1, "text_wrap": True, "valign": "vcenter",
        })
        green_fmt = workbook.add_format({"font_color": "#16a34a", "bold": True})
        red_fmt = workbook.add_format({"font_color": "#dc2626", "bold": True})
        number_fmt = workbook.add_format({"num_format": "#,##0.00"})
        pct_fmt = workbook.add_format({"num_format": "0.00%"})
        
        for sheet_name, df in sheets.items():
            if df.empty:
                # Write a placeholder
                empty_df = pd.DataFrame({"Info": [f"No data available for {sheet_name}"]})
                empty_df.to_excel(writer, sheet_name=sheet_name, index=False)
                continue
            
            df.to_excel(writer, sheet_name=sheet_name, index=False, startrow=1, header=False)
            
            worksheet = writer.sheets[sheet_name]
            
            # Write headers with formatting
            for col_num, col_name in enumerate(df.columns):
                worksheet.write(0, col_num, col_name, header_fmt)
            
            # Auto-fit column widths
            for col_num, col_name in enumerate(df.columns):
                try:
                    max_data_len = df[col_name].astype(str).str.len().max() if len(df) > 0 else 0
                except Exception:
                    max_data_len = 10
                max_len = max(max_data_len, len(str(col_name))) + 2
                worksheet.set_column(col_num, col_num, min(max_len, 25))
            
            # Freeze top row
            worksheet.freeze_panes(1, 0)
            
            # Add autofilter
            if len(df) > 0:
                worksheet.autofilter(0, 0, len(df), len(df.columns) - 1)
    
    print(f"\n✅ Excel workbook saved to: {output_path}")


def main():
    print("=" * 60)
    print("  MARKETPULSE — SPREADSHEET EXPORT")
    print(f"  Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 60)
    
    # 1. Fetch data
    us_data, bist_data, fx_data = fetch_all_data()
    
    # 2. Merge all data
    all_data = {**us_data, **bist_data}
    print(f"\n📊 Successfully fetched data for {len(all_data)} tickers.")
    
    # 3. Compute indicators
    print("🧮 Computing technical indicators...")
    all_enriched = {}
    for sym, df in all_data.items():
        all_enriched[sym] = compute_all_indicators(df)
    
    # 4. Build asset info map
    asset_info = {}
    for sym in us_data:
        asset_info[sym] = {"Market": "US", "Currency": "USD", "Asset Class": "etf" if sym in US_ETFS else "stock"}
    for sym in bist_data:
        asset_info[sym] = {"Market": "BIST", "Currency": "TRY", "Asset Class": "stock"}
    
    # 5. Build all sheets
    print("📋 Building spreadsheet tabs & evaluating trade performance...")
    outcomes_df, kpi_df, strat_df = build_trade_outcomes_and_scorecard(all_enriched)
    
    sheets = {
        "📊 Dashboard": build_latest_prices_sheet(all_enriched, asset_info),
        "🏆 Trade Outcomes": outcomes_df,
        "📈 Scorecard & KPIs": kpi_df,
        "🔬 Strategy Breakdown": strat_df,
        "🎯 Trade Signals": build_trade_signals_sheet(all_enriched, asset_info),
        "🚦 Market Regime": build_market_regime_sheet(us_data, bist_data),
        "📋 Assets": build_assets_sheet(us_data, bist_data),
        "💱 USD-TRY Rate": build_fx_sheet(fx_data, top_n_days=252),
        "📐 Position Sizing": build_position_sizing_sheet(),
        "📅 Price History": build_price_history_sheet(all_enriched, top_n_days=252),
    }
    
    # 6. Export — always overwrite the SAME file so Google Drive sync keeps it fresh
    output_path = str(OUTPUT_DIR / "MarketPulse_Latest.xlsx")
    export_to_excel(sheets, output_path)
    
    # 7. Record permanently into Supabase PostgreSQL database
    try:
        from sync_to_supabase import sync_all_to_supabase
        sync_all_to_supabase()
    except Exception as e:
        print(f"⚠️ Note: Database sync skipped: {e}")
    
    # 8. Summary
    dashboard = sheets.get("📊 Dashboard", pd.DataFrame())
    signals = sheets.get("🎯 Trade Signals", pd.DataFrame())
    
    print(f"\n📊 Report Summary:")
    print(f"   • {len(dashboard)} assets tracked")
    print(f"   • {len(signals)} new trade signals found")
    print(f"   • {len(outcomes_df)} historical trades evaluated")
    print(f"   • {len(sheets)} total tabs exported")
    print(f"\n💡 Upload '{output_path}' to Google Drive → Open with Google Sheets")


if __name__ == "__main__":
    main()
