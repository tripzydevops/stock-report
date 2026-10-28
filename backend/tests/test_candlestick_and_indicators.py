import pytest
import pandas as pd
import numpy as np
from app.services.candlestick_patterns import (
    detect_doji,
    detect_hammer,
    detect_inverted_hammer,
    detect_bullish_engulfing,
    detect_bearish_engulfing,
    detect_morning_star,
    detect_evening_star,
    scan_all_candlestick_patterns,
)
from app.services.indicators import (
    compute_supertrend,
    compute_chaikin_money_flow,
    compute_vwap,
    compute_all_indicators,
)


def test_detect_doji():
    # Body is tiny relative to high-low range
    open_s = pd.Series([100.0, 100.0])
    high_s = pd.Series([110.0, 110.0])
    low_s = pd.Series([90.0, 90.0])
    close_s = pd.Series([100.5, 108.0])  # row 0 is doji (diff 0.5 <= 20*0.1=2.0), row 1 is big body

    doji = detect_doji(open_s, high_s, low_s, close_s, threshold=0.1)
    assert bool(doji.iloc[0]) is True
    assert bool(doji.iloc[1]) is False


def test_detect_hammer():
    # Small body at the top, long lower shadow (>= 2x body), tiny upper shadow
    open_s = pd.Series([108.0])
    high_s = pd.Series([110.0])
    low_s = pd.Series([90.0])
    close_s = pd.Series([109.0])  # Body: 1.0 (108-109), lower shadow: 18.0 (108-90), upper shadow: 1.0 (110-109)

    hammer = detect_hammer(open_s, high_s, low_s, close_s)
    assert bool(hammer.iloc[0]) is True


def test_detect_inverted_hammer():
    # Small body at bottom, long upper shadow (>= 2x body), tiny lower shadow
    open_s = pd.Series([92.0])
    high_s = pd.Series([110.0])
    low_s = pd.Series([91.5])
    close_s = pd.Series([93.0])  # Body: 1.0 (92-93), upper shadow: 17.0 (110-93), lower shadow: 0.5 (92-91.5)

    inv = detect_inverted_hammer(open_s, high_s, low_s, close_s)
    assert bool(inv.iloc[0]) is True


def test_detect_bullish_engulfing():
    # Bar 0: red candle (100 -> 95)
    # Bar 1: green candle opening below 95 and closing above 100 (94 -> 102)
    open_s = pd.Series([100.0, 94.0])
    close_s = pd.Series([95.0, 102.0])

    engulfing = detect_bullish_engulfing(open_s, close_s)
    assert bool(engulfing.iloc[1]) is True


def test_detect_bearish_engulfing():
    # Bar 0: green candle (95 -> 100)
    # Bar 1: red candle opening above 100 and closing below 95 (102 -> 93)
    open_s = pd.Series([95.0, 102.0])
    close_s = pd.Series([100.0, 93.0])

    engulfing = detect_bearish_engulfing(open_s, close_s)
    assert bool(engulfing.iloc[1]) is True


def test_scan_all_candlestick_patterns():
    df = pd.DataFrame({
        "open": [100.0, 94.0, 102.0],
        "high": [101.0, 103.0, 104.0],
        "low": [94.0, 93.0, 92.0],
        "close": [95.0, 102.0, 93.0],
        "volume": [1000.0, 2000.0, 1500.0],
    })
    scanned = scan_all_candlestick_patterns(df)
    assert "pattern_bullish_engulfing" in scanned.columns
    assert "pattern_hammer" in scanned.columns
    assert "pattern_doji" in scanned.columns


def test_compute_supertrend():
    dates = pd.date_range("2026-01-01", periods=30, freq="D")
    # Trending upwards
    prices = [100.0 + i * 2.0 for i in range(30)]
    high = pd.Series([p + 2.0 for p in prices], index=dates)
    low = pd.Series([p - 2.0 for p in prices], index=dates)
    close = pd.Series(prices, index=dates)

    st, st_dir = compute_supertrend(high, low, close, period=10, multiplier=3.0)
    assert len(st) == 30
    assert len(st_dir) == 30
    # In an uptrend, direction should be 1 (bullish) and supertrend should be below close
    assert st_dir.iloc[-1] == 1
    assert st.iloc[-1] < close.iloc[-1]


def test_compute_chaikin_money_flow():
    dates = pd.date_range("2026-01-01", periods=30, freq="D")
    high = pd.Series([105.0] * 30, index=dates)
    low = pd.Series([95.0] * 30, index=dates)
    close = pd.Series([104.0] * 30, index=dates)  # closing near high = heavy accumulation
    volume = pd.Series([10000.0] * 30, index=dates)

    cmf = compute_chaikin_money_flow(high, low, close, volume, period=20)
    assert len(cmf) == 30
    # CMF should be positive and bounded between -1.0 and +1.0
    assert cmf.iloc[-1] > 0.0
    assert -1.0 <= cmf.iloc[-1] <= 1.0


def test_compute_vwap():
    high = pd.Series([105.0, 110.0])
    low = pd.Series([95.0, 100.0])
    close = pd.Series([100.0, 105.0])
    volume = pd.Series([1000.0, 2000.0])

    vwap = compute_vwap(high, low, close, volume)
    assert len(vwap) == 2
    assert vwap.iloc[0] == 100.0  # (105+95+100)/3 = 100
    assert vwap.iloc[1] > 100.0


def test_compute_all_indicators_includes_new_features():
    dates = pd.date_range("2026-01-01", periods=30, freq="D")
    df = pd.DataFrame({
        "open": [100.0] * 30,
        "high": [105.0] * 30,
        "low": [95.0] * 30,
        "close": [102.0] * 30,
        "volume": [5000.0] * 30,
    }, index=dates)

    res = compute_all_indicators(df)
    assert "supertrend" in res.columns
    assert "supertrend_direction" in res.columns
    assert "cmf_20" in res.columns
    assert "vwap" in res.columns
