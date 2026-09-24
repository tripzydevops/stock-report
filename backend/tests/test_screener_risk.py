"""
Tests for MarketPulse screener strategies and risk manager.
"""
import pytest
import pandas as pd
import numpy as np
from datetime import date, timedelta

import sys
sys.path.insert(0, "..")
from app.services.indicators import compute_all_indicators
from app.services.screener import (
    screen_momentum_breakout,
    screen_trend_pullback,
    screen_volatility_squeeze,
    screen_fund_momentum,
    run_all_screens,
)
from app.services.risk_manager import (
    calculate_position_size,
    calculate_risk_reward,
    calculate_atr_stop,
    format_position_recommendation,
)


def _make_breakout_df() -> pd.DataFrame:
    """Create a DataFrame that should trigger a momentum breakout signal."""
    n = 100
    dates = pd.date_range(end=date.today(), periods=n, freq="B")

    # Flat consolidation then breakout on last day
    close = np.array([50.0] * 80 + list(np.linspace(50, 52, 19)) + [58.0])
    high = close + 0.5
    low = close - 0.5
    volume = np.array([1_000_000] * 99 + [5_000_000])  # volume spike on last day

    df = pd.DataFrame(
        {"open": close, "high": high, "low": low, "close": close, "adj_close": close, "volume": volume},
        index=dates,
    )
    return compute_all_indicators(df)


def _make_pullback_df() -> pd.DataFrame:
    """Create a DataFrame that should trigger a trend pullback signal."""
    n = 252
    dates = pd.date_range(end=date.today(), periods=n, freq="B")

    # Strong uptrend then pullback to EMA
    trend = np.linspace(40, 80, 240)
    pullback = np.linspace(80, 72, 12)  # pullback near EMAs
    close = np.concatenate([trend, pullback])
    high = close + 1.0
    low = close - 1.0
    volume = np.full(n, 1_000_000)

    df = pd.DataFrame(
        {"open": close, "high": high, "low": low, "close": close, "adj_close": close, "volume": volume},
        index=dates,
    )
    return compute_all_indicators(df)


# ── Screener Tests ───────────────────────────────────────────────────────

class TestMomentumBreakout:
    def test_breakout_signal_structure(self):
        df = _make_breakout_df()
        signal = screen_momentum_breakout(df, "TEST")
        if signal is not None:
            assert "symbol" in signal
            assert "strategy" in signal
            assert "entry_price" in signal
            assert "stop_loss" in signal
            assert "target_1" in signal
            assert signal["entry_price"] > signal["stop_loss"]

    def test_no_signal_on_flat_data(self):
        n = 100
        dates = pd.date_range(end=date.today(), periods=n, freq="B")
        close = np.full(n, 50.0)
        df = pd.DataFrame(
            {"open": close, "high": close + 0.1, "low": close - 0.1, "close": close, "adj_close": close,
             "volume": np.full(n, 1_000_000)},
            index=dates,
        )
        df = compute_all_indicators(df)
        signal = screen_momentum_breakout(df, "FLAT")
        assert signal is None


class TestTrendPullback:
    def test_insufficient_data_returns_none(self):
        """Need at least 200 bars for 200 EMA."""
        n = 50
        dates = pd.date_range(end=date.today(), periods=n, freq="B")
        close = np.linspace(40, 60, n)
        df = pd.DataFrame(
            {"open": close, "high": close + 0.5, "low": close - 0.5, "close": close, "adj_close": close,
             "volume": np.full(n, 1_000_000)},
            index=dates,
        )
        df = compute_all_indicators(df)
        signal = screen_trend_pullback(df, "SHORT")
        assert signal is None


class TestVolatilitySqueeze:
    def test_no_signal_on_short_data(self):
        n = 10
        dates = pd.date_range(end=date.today(), periods=n, freq="B")
        close = np.full(n, 100.0)
        df = pd.DataFrame(
            {"open": close, "high": close + 1, "low": close - 1, "close": close, "adj_close": close,
             "volume": np.full(n, 1_000_000)},
            index=dates,
        )
        df = compute_all_indicators(df)
        signal = screen_volatility_squeeze(df, "SHORT")
        assert signal is None


# ── Risk Manager Tests ───────────────────────────────────────────────────

class TestPositionSizing:
    def test_basic_calculation(self):
        result = calculate_position_size(
            account_size=10000,
            risk_pct=1.0,
            entry_price=50.0,
            stop_loss=47.0,
        )
        assert result["risk_amount"] == 100.0  # 1% of 10000
        assert result["shares_to_buy"] == 33  # 100 / (50 - 47) = 33.33 → 33
        assert result["position_value"] == 33 * 50.0

    def test_zero_risk_distance(self):
        result = calculate_position_size(
            account_size=10000,
            risk_pct=1.0,
            entry_price=50.0,
            stop_loss=50.0,
        )
        assert result["shares_to_buy"] == 0

    def test_large_account_try(self):
        result = calculate_position_size(
            account_size=300000,
            risk_pct=1.0,
            entry_price=150.0,
            stop_loss=140.0,
        )
        assert result["risk_amount"] == 3000.0
        assert result["shares_to_buy"] == 300  # 3000 / 10 = 300


class TestRiskReward:
    def test_basic_rr(self):
        rr = calculate_risk_reward(entry=50, stop_loss=47, target=56)
        assert abs(rr - 2.0) < 0.01  # (56-50)/(50-47) = 6/3 = 2.0

    def test_zero_risk(self):
        rr = calculate_risk_reward(entry=50, stop_loss=50, target=55)
        assert rr == 0 or rr == float("inf")  # edge case


class TestATRStop:
    def test_atr_stop_below_price(self):
        stop = calculate_atr_stop(close=100.0, atr=3.0, multiplier=2.0)
        assert stop == 94.0  # 100 - (3 * 2)

    def test_atr_stop_tighter_with_lower_mult(self):
        stop_tight = calculate_atr_stop(close=100.0, atr=3.0, multiplier=1.0)
        stop_wide = calculate_atr_stop(close=100.0, atr=3.0, multiplier=3.0)
        assert stop_tight > stop_wide


class TestPositionRecommendation:
    def test_format_string_usd(self):
        result = format_position_recommendation(
            account_size=10000, risk_pct=1.0, entry=50.0, stop_loss=47.0, target=56.0, currency="USD"
        )
        assert isinstance(result, str)
        assert "$" in result or "USD" in result

    def test_format_string_try(self):
        result = format_position_recommendation(
            account_size=300000, risk_pct=1.0, entry=150.0, stop_loss=140.0, target=170.0, currency="TRY"
        )
        assert isinstance(result, str)
        assert "₺" in result or "TRY" in result
