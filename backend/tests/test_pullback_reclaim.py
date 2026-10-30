"""
Unit tests for the Trend Pullback Reclaim Screener Strategy
============================================================
Verifies:
1. Valid Pullback Reclaim setup produces structured signal with 1:2 R:R.
2. Below EMA200 / Bearish trend filter rejection.
3. Shallow (<2.5%) or excessive (>5.8%) pullback rejection.
4. Weak volume (<1.2x) rejection.
5. Daily drop (>4.5%) circuit breaker / limit-down rejection.
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from app.services.screener import screen_pullback_reclaim


def _create_synthetic_ohlcv(
    n_bars: int = 60,
    base_price: float = 100.0,
    pullback_bars_ago: int = 3,
    pullback_pct: float = 3.5,
    today_volume_mult: float = 1.5,
    today_close_in_upper_pct: float = 0.75,
    today_reclaims_prior_high: bool = True,
    close_above_ema200: bool = True,
    daily_drop_pct: float = 1.0,
) -> pd.DataFrame:
    """Helper to generate clean synthetic OHLCV data for testing screen_pullback_reclaim."""
    dates = [datetime(2026, 1, 1) + timedelta(days=i) for i in range(n_bars)]
    
    # Establish base price array trending upward
    prices = np.linspace(base_price * 0.8, base_price, n_bars)
    
    df = pd.DataFrame(index=dates)
    df["close"] = prices
    df["open"] = prices * 0.995
    df["high"] = prices * 1.01
    df["low"] = prices * 0.99
    df["volume"] = 100_000

    # Ensure rolling indicators are calculated
    df["ema_20"] = df["close"].ewm(span=20, adjust=False).mean()
    df["ema_50"] = df["close"].ewm(span=50, adjust=False).mean()
    if close_above_ema200:
        df["ema_200"] = df["close"] * 0.85  # Well below price
    else:
        df["ema_200"] = df["close"] * 1.15  # Overhead supply (Bear trend)

    df["atr_14"] = df["close"] * 0.03

    # Inject rolling 20-day high and pullback
    today_idx = n_bars - 1
    peak_idx = n_bars - 1 - pullback_bars_ago
    peak_price = base_price * 1.05
    df.iloc[peak_idx, df.columns.get_loc("high")] = peak_price
    df.iloc[peak_idx, df.columns.get_loc("close")] = peak_price * 0.995

    # Low of the pullback trough
    trough_price = peak_price * (1.0 - (pullback_pct / 100.0))
    trough_idx = n_bars - 2
    # Ensure lows during pullback do not fall below trough_price
    df.iloc[peak_idx+1:today_idx, df.columns.get_loc("low")] = trough_price * 1.002
    df.iloc[trough_idx, df.columns.get_loc("low")] = trough_price
    df.iloc[trough_idx, df.columns.get_loc("close")] = trough_price * 1.005

    # Prior day bar
    prior_idx = n_bars - 2
    prior_high = df.iloc[prior_idx]["high"]

    # Today's bar (last row)
    if today_reclaims_prior_high:
        today_close = prior_high * 1.01
    else:
        today_close = prior_high * 0.99

    # Daily drop check: today_close relative to prior_close
    prior_close = df.iloc[prior_idx]["close"]
    if daily_drop_pct < 0:
        today_close = prior_close * (1.0 + (daily_drop_pct / 100.0))

    today_low = today_close * 0.98
    today_high = today_close + ((today_close - today_low) / max(0.01, today_close_in_upper_pct)) * (1.0 - today_close_in_upper_pct)
    if today_high <= today_close:
        today_high = today_close * 1.01

    df.iloc[today_idx, df.columns.get_loc("close")] = today_close
    df.iloc[today_idx, df.columns.get_loc("open")] = today_close * 0.995
    df.iloc[today_idx, df.columns.get_loc("high")] = today_high
    df.iloc[today_idx, df.columns.get_loc("low")] = today_low
    df.iloc[today_idx, df.columns.get_loc("volume")] = 100_000 * today_volume_mult

    # Recalculate indicators for last bar
    df.iloc[today_idx, df.columns.get_loc("ema_20")] = today_close * 0.98
    df.iloc[today_idx, df.columns.get_loc("ema_50")] = today_close * 0.94
    if close_above_ema200:
        df.iloc[today_idx, df.columns.get_loc("ema_200")] = today_close * 0.88

    return df


def test_pullback_reclaim_valid_setup():
    """A textbook Pullback Reclaim setup must trigger with high confidence and 1:2 R:R."""
    df = _create_synthetic_ohlcv(
        pullback_bars_ago=3,
        pullback_pct=3.8,
        today_volume_mult=1.5,
        today_close_in_upper_pct=0.75,
        today_reclaims_prior_high=True,
        close_above_ema200=True,
    )

    signal = screen_pullback_reclaim(df, "THYAO")
    assert signal is not None
    assert signal["strategy"] == "Pullback Reclaim"
    assert signal["symbol"] == "THYAO"
    assert signal["entry_price"] > signal["stop_loss"]
    assert signal["target_1"] > signal["entry_price"]
    assert signal["risk_reward_ratio"] == 2.0
    assert signal["confidence_score"] in (8.5, 85.0)
    assert "Trend Pullback Reclaim" in signal["ai_rationale"]


def test_pullback_reclaim_rejects_bear_trend():
    """Setup must be rejected if price is below EMA 200 or in Stage 4 downtrend."""
    df = _create_synthetic_ohlcv(
        close_above_ema200=False,
    )

    signal = screen_pullback_reclaim(df, "THYAO")
    assert signal is None


def test_pullback_reclaim_rejects_excessive_pullback():
    """Setup must be rejected if pullback exceeds 5.8% (broken structural support)."""
    df = _create_synthetic_ohlcv(
        pullback_pct=8.5,  # Too deep
    )

    signal = screen_pullback_reclaim(df, "THYAO")
    assert signal is None


def test_pullback_reclaim_rejects_weak_volume():
    """Setup must be rejected if volume is below 1.2x SMA20."""
    df = _create_synthetic_ohlcv(
        today_volume_mult=0.7,  # Below 1.2x threshold
    )

    signal = screen_pullback_reclaim(df, "THYAO")
    assert signal is None


def test_pullback_reclaim_rejects_severe_daily_drop():
    """Setup must be rejected if signal day fell > 4.5% (falling knife protection)."""
    df = _create_synthetic_ohlcv(
        daily_drop_pct=-5.5,  # Fell > 4.5% today
    )

    signal = screen_pullback_reclaim(df, "THYAO")
    assert signal is None


def test_pullback_reclaim_us_growth_allowed():
    """US Growth leader (NVDA) triggers signal under US market profile."""
    df = _create_synthetic_ohlcv(
        pullback_bars_ago=4,
        pullback_pct=4.5,
        today_volume_mult=1.3,
        today_close_in_upper_pct=0.70,
        today_reclaims_prior_high=True,
        close_above_ema200=True,
    )

    signal = screen_pullback_reclaim(df, "NVDA", market="US")
    assert signal is not None
    assert signal["strategy"] == "Pullback Reclaim"
    assert signal["market"] == "US"
    assert "SPY" in signal["ai_rationale"]


def test_pullback_reclaim_us_reit_filtered():
    """Defensive/Income REIT (O) must be filtered from US Pullback Reclaim and reserved for DCA/Dividend."""
    df = _create_synthetic_ohlcv(
        pullback_bars_ago=4,
        pullback_pct=4.5,
        today_volume_mult=1.3,
        today_close_in_upper_pct=0.70,
        today_reclaims_prior_high=True,
        close_above_ema200=True,
    )

    signal = screen_pullback_reclaim(df, "O", market="US")
    assert signal is None

