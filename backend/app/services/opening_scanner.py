"""
MarketPulse Opening Session Scanner & Daily Direction Engine
Analyzes market opening range (ORB 15-min), overnight price gaps,
and opening relative volume to determine daily institutional direction.
"""
import pandas as pd
import numpy as np
from datetime import datetime, date, timedelta
from typing import Dict, List, Tuple, Any

def analyze_asset_opening(symbol: str, df_daily: pd.DataFrame, df_intraday: pd.DataFrame = None) -> Dict[str, Any]:
    """
    Analyzes the opening behavior of a single asset.
    If intraday data is available, extracts the exact 15-min Opening Range (ORB).
    Otherwise, derives opening metrics from the latest daily bar.
    """
    clean_sym = symbol.replace(".IS", "")
    
    if df_daily is None or df_daily.empty or len(df_daily) < 2:
        return {}
        
    prev_bar = df_daily.iloc[-2]
    curr_bar = df_daily.iloc[-1]
    
    prev_close = float(prev_bar["close"])
    today_open = float(curr_bar.get("open", curr_bar["close"]))
    curr_price = float(curr_bar["close"])
    curr_high = float(curr_bar.get("high", curr_price))
    curr_low = float(curr_bar.get("low", curr_price))
    curr_volume = float(curr_bar.get("volume", 0))
    
    gap_pct = ((today_open - prev_close) / prev_close) * 100 if prev_close > 0 else 0.0
    intraday_pct = ((curr_price - today_open) / today_open) * 100 if today_open > 0 else 0.0
    total_pct = ((curr_price - prev_close) / prev_close) * 100 if prev_close > 0 else 0.0
    
    # Check 15m opening range if available
    orb_high = curr_high
    orb_low = curr_low
    
    if df_intraday is not None and not df_intraday.empty:
        # First 1-2 bars of the session represent the 15-30m opening range
        open_bars = df_intraday.head(2)
        orb_high = float(open_bars["high"].max())
        orb_low = float(open_bars["low"].min())
    
    # Classification Logic
    if gap_pct >= 0.75 and curr_price >= today_open:
        pattern = "🚀 Gap & Go"
        bias = "STRONGLY BULLISH"
        action = "Gapping strong & holding above open"
    elif curr_price >= orb_high:
        pattern = "🟢 ORB Breakout"
        bias = "BULLISH"
        action = "Momentum breakout to session highs"
    elif gap_pct >= 1.0 and curr_price < today_open:
        pattern = "⚠️ Gap & Fade (Trap)"
        bias = "BEARISH REVERSAL"
        action = "Caution: Gapping buyers trapped below open"
    elif curr_price <= orb_low or (gap_pct <= -1.0 and curr_price < today_open):
        pattern = "🔻 ORB Breakdown"
        bias = "BEARISH"
        action = "Avoid longs / look for short setups"
    elif curr_price > today_open:
        pattern = "📈 Green Follow-Through"
        bias = "BULLISH"
        action = "Pushing higher after open"
    else:
        pattern = "⏸️ Range Bound"
        bias = "NEUTRAL"
        action = "Consolidating within opening range"

    return {
        "Symbol": clean_sym,
        "Prev Close": round(prev_close, 2),
        "Open Price": round(today_open, 2),
        "Current Price": round(curr_price, 2),
        "ORB High (15m)": round(orb_high, 2),
        "ORB Low (15m)": round(orb_low, 2),
        "Gap %": round(gap_pct, 2),
        "Intraday %": round(intraday_pct, 2),
        "Total Change %": round(total_pct, 2),
        "Pattern": pattern,
        "Direction Bias": bias,
        "Recommended Action": action
    }


def scan_all_openings(all_enriched: Dict[str, pd.DataFrame], asset_info: Dict[str, Dict] = None) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Scans the opening session across all assets in the universe.
    Calculates market breadth and ranks top opening momentum opportunities.
    """
    rows = []
    
    for symbol, df in all_enriched.items():
        if df.empty or len(df) < 2:
            continue
        data = analyze_asset_opening(symbol, df)
        if data:
            market = "US" if "US" in str(symbol) or (asset_info and asset_info.get(symbol, {}).get("Market") == "US") else "BIST"
            data["Market"] = market
            rows.append(data)
            
    if not rows:
        return pd.DataFrame(), {}
        
    df_results = pd.DataFrame(rows)
    
    # Sort: Put highest momentum and gap setups on top
    df_results["AbsGap"] = df_results["Gap %"].abs()
    df_results = df_results.sort_values(by=["AbsGap", "Intraday %"], ascending=[False, False]).drop(columns=["AbsGap"])
    
    # Market Breadth Calculation
    total_assets = len(df_results)
    gapping_up = len(df_results[df_results["Gap %"] > 0])
    gapping_down = len(df_results[df_results["Gap %"] < 0])
    green_intraday = len(df_results[df_results["Intraday %"] > 0])
    
    pct_bullish_open = (gapping_up / total_assets * 100) if total_assets > 0 else 0
    pct_holding_open = (green_intraday / total_assets * 100) if total_assets > 0 else 0
    
    if pct_bullish_open >= 65 and pct_holding_open >= 60:
        market_climate = "🟢 GREEN LIGHT: Strong Bullish Open (Aggressive Buying across majority of stocks)"
    elif pct_bullish_open <= 35:
        market_climate = "🔴 RED LIGHT: Heavy Bearish Open (Distribution / Defensive Day)"
    else:
        market_climate = "🟡 YELLOW LIGHT: Mixed / Selective Open (Trade only top relative strength leaders)"
        
    breadth_summary = {
        "Total Assets Scanned": total_assets,
        "Gapping Up": gapping_up,
        "Gapping Down": gapping_down,
        "Holding Above Open": green_intraday,
        "Bullish Breadth %": f"{pct_bullish_open:.1f}%",
        "Market Open Climate": market_climate
    }
    
    return df_results, breadth_summary
