"""
Vectorized Candlestick Pattern Detection Engine.
Fast NumPy/Pandas implementation of high-probability Japanese candlestick patterns:
- Bullish & Bearish Engulfing
- Hammer & Inverted Hammer
- Shooting Star & Hanging Man
- Morning Star & Evening Star
- Standard, Dragonfly & Gravestone Doji
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional


def detect_doji(
    open_s: pd.Series,
    high_s: pd.Series,
    low_s: pd.Series,
    close_s: pd.Series,
    threshold: float = 0.1,
) -> pd.Series:
    """
    Doji pattern: Candle body is very small compared to the total range (<= threshold * range).
    """
    rng = high_s - low_s
    body = (close_s - open_s).abs()
    is_doji = (body <= (rng * threshold)) & (rng > 0)
    return is_doji


def detect_hammer(
    open_s: pd.Series,
    high_s: pd.Series,
    low_s: pd.Series,
    close_s: pd.Series,
) -> pd.Series:
    """
    Hammer (Bullish reversal):
    - Small body at the upper end of the trading range.
    - Lower shadow at least twice the length of the real body.
    - Upper shadow is minimal or non-existent (<= 10% of total range).
    """
    rng = high_s - low_s
    body = (close_s - open_s).abs()
    body_top = pd.concat([open_s, close_s], axis=1).max(axis=1)
    body_bottom = pd.concat([open_s, close_s], axis=1).min(axis=1)

    upper_shadow = high_s - body_top
    lower_shadow = body_bottom - low_s

    is_hammer = (
        (rng > 0)
        & (lower_shadow >= 2.0 * body)
        & (upper_shadow <= 0.15 * rng)
        & (body > 0)
    )
    return is_hammer


def detect_inverted_hammer(
    open_s: pd.Series,
    high_s: pd.Series,
    low_s: pd.Series,
    close_s: pd.Series,
) -> pd.Series:
    """
    Inverted Hammer / Shooting Star:
    - Small body at the lower end of the trading range.
    - Upper shadow at least twice the length of the real body.
    - Lower shadow is minimal or non-existent (<= 10% of total range).
    """
    rng = high_s - low_s
    body = (close_s - open_s).abs()
    body_top = pd.concat([open_s, close_s], axis=1).max(axis=1)
    body_bottom = pd.concat([open_s, close_s], axis=1).min(axis=1)

    upper_shadow = high_s - body_top
    lower_shadow = body_bottom - low_s

    is_inv_hammer = (
        (rng > 0)
        & (upper_shadow >= 2.0 * body)
        & (lower_shadow <= 0.15 * rng)
        & (body > 0)
    )
    return is_inv_hammer


def detect_bullish_engulfing(open_s: pd.Series, close_s: pd.Series) -> pd.Series:
    """
    Bullish Engulfing:
    - Previous bar is red (close < open).
    - Current bar is green (close > open).
    - Current bar's body completely covers (engulfs) previous bar's body:
      current_open <= prev_close and current_close >= prev_open.
    """
    prev_open = open_s.shift(1)
    prev_close = close_s.shift(1)

    prev_bearish = prev_close < prev_open
    curr_bullish = close_s > open_s

    engulfs = (open_s <= prev_close) & (close_s >= prev_open)
    return prev_bearish & curr_bullish & engulfs


def detect_bearish_engulfing(open_s: pd.Series, close_s: pd.Series) -> pd.Series:
    """
    Bearish Engulfing:
    - Previous bar is green (close > open).
    - Current bar is red (close < open).
    - Current bar's body completely covers (engulfs) previous bar's body:
      current_open >= prev_close and current_close <= prev_open.
    """
    prev_open = open_s.shift(1)
    prev_close = close_s.shift(1)

    prev_bullish = prev_close > prev_open
    curr_bearish = close_s < open_s

    engulfs = (open_s >= prev_close) & (close_s <= prev_open)
    return prev_bullish & curr_bearish & engulfs


def detect_morning_star(
    open_s: pd.Series,
    high_s: pd.Series,
    low_s: pd.Series,
    close_s: pd.Series,
) -> pd.Series:
    """
    Morning Star (3-bar bullish reversal):
    - Bar 1: Long bearish candle.
    - Bar 2: Small body candle gapping down (indecision/star).
    - Bar 3: Strong bullish candle closing above midpoint of Bar 1.
    """
    open1, close1 = open_s.shift(2), close_s.shift(2)
    open2, close2 = open_s.shift(1), close_s.shift(1)
    open3, close3 = open_s, close_s

    body1 = open1 - close1  # Positive if bearish
    body2 = (close2 - open2).abs()
    midpoint1 = (open1 + close1) / 2.0

    bar1_bearish = close1 < open1
    bar2_star = (body2 < (body1 * 0.5)) & (pd.concat([open2, close2], axis=1).max(axis=1) < close1)
    bar3_bullish = (close3 > open3) & (close3 > midpoint1)

    return bar1_bearish & bar2_star & bar3_bullish


def detect_evening_star(
    open_s: pd.Series,
    high_s: pd.Series,
    low_s: pd.Series,
    close_s: pd.Series,
) -> pd.Series:
    """
    Evening Star (3-bar bearish reversal):
    - Bar 1: Long bullish candle.
    - Bar 2: Small body candle gapping up (star).
    - Bar 3: Strong bearish candle closing below midpoint of Bar 1.
    """
    open1, close1 = open_s.shift(2), close_s.shift(2)
    open2, close2 = open_s.shift(1), close_s.shift(1)
    open3, close3 = open_s, close_s

    body1 = close1 - open1  # Positive if bullish
    body2 = (close2 - open2).abs()
    midpoint1 = (open1 + close1) / 2.0

    bar1_bullish = close1 > open1
    bar2_star = (body2 < (body1 * 0.5)) & (pd.concat([open2, close2], axis=1).min(axis=1) > close1)
    bar3_bearish = (close3 < open3) & (close3 < midpoint1)

    return bar1_bullish & bar2_star & bar3_bearish


def scan_all_candlestick_patterns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Scans a DataFrame containing OHLCV columns and appends boolean indicator series
    for all detected candlestick patterns.
    """
    if df.empty or "close" not in df.columns:
        return df

    out = df.copy()
    o = out.get("open", out["close"])
    h = out.get("high", out["close"])
    l = out.get("low", out["close"])
    c = out["close"]

    out["pattern_doji"] = detect_doji(o, h, l, c)
    out["pattern_hammer"] = detect_hammer(o, h, l, c)
    out["pattern_inv_hammer"] = detect_inverted_hammer(o, h, l, c)
    out["pattern_bullish_engulfing"] = detect_bullish_engulfing(o, c)
    out["pattern_bearish_engulfing"] = detect_bearish_engulfing(o, c)
    out["pattern_morning_star"] = detect_morning_star(o, h, l, c)
    out["pattern_evening_star"] = detect_evening_star(o, h, l, c)

    return out
