import pytest
import pandas as pd
from app.services.opening_scanner import analyze_asset_opening, scan_all_openings

def test_gap_and_go_pattern():
    dates = pd.date_range(start="2026-09-24", periods=2, freq="B")
    # Day 1 close: 100
    # Day 2 open: 102 (+2% gap), close: 103 (+1% intraday), high: 103.5, low: 101.8
    df = pd.DataFrame({
        "open": [99.0, 102.0],
        "high": [101.0, 103.5],
        "low": [98.5, 101.8],
        "close": [100.0, 103.0],
        "volume": [1000000, 1500000]
    }, index=dates)
    
    res = analyze_asset_opening("THYAO.IS", df)
    assert res["Symbol"] == "THYAO"
    assert res["Gap %"] == 2.0
    assert res["Intraday %"] == round(((103.0 - 102.0) / 102.0) * 100, 2)
    assert res["Direction Bias"] in ["STRONGLY BULLISH", "BULLISH"]

def test_gap_and_fade_trap_pattern():
    dates = pd.date_range(start="2026-09-24", periods=2, freq="B")
    # Day 1 close: 100
    # Day 2 open: 103 (+3% gap), but close: 101 (below open -> trap)
    df = pd.DataFrame({
        "open": [99.0, 103.0],
        "high": [101.0, 103.2],
        "low": [98.5, 100.5],
        "close": [100.0, 101.0],
        "volume": [1000000, 1200000]
    }, index=dates)
    
    res = analyze_asset_opening("AKBNK.IS", df)
    assert res["Gap %"] == 3.0
    assert res["Pattern"] == "⚠️ Gap & Fade (Trap)"
    assert res["Direction Bias"] == "BEARISH REVERSAL"

def test_scan_all_openings_breadth():
    dates = pd.date_range(start="2026-09-24", periods=2, freq="B")
    df1 = pd.DataFrame({"open": [99, 102], "high": [101, 103], "low": [98, 101], "close": [100, 102.5]}, index=dates)
    df2 = pd.DataFrame({"open": [49, 51], "high": [51, 52], "low": [48, 50], "close": [50, 51.5]}, index=dates)
    universe = {"STOCK1": df1, "STOCK2": df2}
    
    df_res, breadth = scan_all_openings(universe)
    assert len(df_res) == 2
    assert breadth["Gapping Up"] == 2
    assert "GREEN LIGHT" in breadth["Market Open Climate"]
