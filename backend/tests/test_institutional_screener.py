"""
Unit tests for Institutional Screener strategies:
- Anchored VWAP Bounce
- Liquidity Sweep & Reclaim
- Relative Strength Leader
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from app.services.institutional_screener import (
    compute_anchored_vwap,
    screen_anchored_vwap_bounce,
    screen_liquidity_sweep_reclaim,
    screen_relative_strength_leaders,
    run_institutional_screens,
)


def _generate_synthetic_ohlcv(n_bars: int = 80, base_price: float = 100.0) -> pd.DataFrame:
    """Generate realistic OHLCV dataframe with indicators."""
    dates = [datetime(2026, 1, 1) + timedelta(days=i) for i in range(n_bars)]
    closes = []
    curr = base_price
    for _ in range(n_bars):
        curr += np.random.normal(0.2, 1.0)
        closes.append(round(curr, 2))

    df = pd.DataFrame(index=dates)
    df['close'] = closes
    df['open'] = [round(c - np.random.uniform(-0.5, 0.5), 2) for c in closes]
    df['high'] = [round(max(o, c) + np.random.uniform(0.1, 1.0), 2) for o, c in zip(df['open'], df['close'])]
    df['low'] = [round(min(o, c) - np.random.uniform(0.1, 1.0), 2) for o, c in zip(df['open'], df['close'])]
    df['volume'] = np.random.randint(100000, 500000, size=n_bars)
    df['rsi_14'] = 50.0
    df['atr_14'] = 2.0
    df['ema_20'] = df['close'].ewm(span=20).mean()
    df['ema_50'] = df['close'].ewm(span=50).mean()
    df['ema_200'] = df['close'] * 0.90  # Above 200 EMA
    df['volume_ratio'] = 1.0
    return df


def test_compute_anchored_vwap_monotonic():
    df = _generate_synthetic_ohlcv(50, 100.0)
    avwap = compute_anchored_vwap(df, 10)
    assert len(avwap) == 50
    assert pd.isna(avwap.iloc[5])  # Before anchor
    assert not pd.isna(avwap.iloc[10])  # At anchor
    assert not pd.isna(avwap.iloc[-1])  # After anchor
    assert avwap.iloc[-1] > 0


def test_anchored_vwap_bounce_detection():
    df = _generate_synthetic_ohlcv(70, 100.0)
    
    # Force anchor low 25 bars ago
    anchor_loc = 45
    df.loc[df.index[anchor_loc], 'low'] = 80.0
    df.loc[df.index[anchor_loc], 'close'] = 82.0
    df.loc[df.index[anchor_loc], 'open'] = 81.0

    # Recalculate moving averages and indicators
    df['ema_200'] = 85.0
    df['atr_14'] = 2.0
    df['rsi_14'] = 48.0

    # Calculate expected AVWAP from anchor
    avwap = compute_anchored_vwap(df, anchor_loc)
    avwap_target = avwap.iloc[-1]

    # Set last bar right at AVWAP with bullish rejection
    df.loc[df.index[-1], 'open'] = round(avwap_target * 0.998, 2)
    df.loc[df.index[-1], 'close'] = round(avwap_target * 1.005, 2)
    df.loc[df.index[-1], 'low'] = round(avwap_target * 0.995, 2)
    df.loc[df.index[-1], 'high'] = round(avwap_target * 1.02, 2)

    signal = screen_anchored_vwap_bounce(df, "TEST.IS")
    assert signal is not None
    assert signal['symbol'] == "TEST.IS"
    assert signal['strategy'] == "Anchored VWAP Bounce"
    assert signal['stop_loss'] < signal['entry_price']
    assert signal['target_1'] > signal['entry_price']
    assert signal['risk_reward_ratio'] >= 1.2


def test_liquidity_sweep_reclaim_detection():
    df = _generate_synthetic_ohlcv(60, 150.0)
    
    # Establish a clear swing low 10 bars ago
    prior_support_idx = len(df) - 10
    prior_support = 140.0
    df.loc[df.index[prior_support_idx], 'low'] = prior_support
    df.loc[df.index[prior_support_idx], 'close'] = 142.0

    # Today's bar:
    # 1. Sweeps below 140.0 (low = 138.5)
    # 2. Reclaims and closes at 143.0 (well above 140.0)
    # 3. High = 143.5 -> Total range = 5.0, Lower wick = (open 141 - low 138.5) = 2.5 (50% wick)
    # 4. High volume ratio
    df.loc[df.index[-1], 'open'] = 141.0
    df.loc[df.index[-1], 'low'] = 138.5
    df.loc[df.index[-1], 'high'] = 143.5
    df.loc[df.index[-1], 'close'] = 143.0
    df.loc[df.index[-1], 'volume_ratio'] = 1.45
    df.loc[df.index[-1], 'atr_14'] = 3.0

    signal = screen_liquidity_sweep_reclaim(df, "THYAO.IS", lookback=20)
    assert signal is not None
    assert signal['symbol'] == "THYAO.IS"
    assert signal['strategy'] == "Liquidity Sweep Reclaim"
    assert signal['entry_price'] == 143.0
    assert signal['stop_loss'] < 140.0  # Stop under swept low
    assert signal['target_1'] > signal['entry_price']


def test_relative_strength_leaders_divergence():
    stock_df = _generate_synthetic_ohlcv(50, 100.0)
    bench_df = _generate_synthetic_ohlcv(50, 500.0)

    # Benchmark drops 3% over last 15 days
    bench_df.loc[bench_df.index[-16], 'close'] = 520.0
    bench_df.loc[bench_df.index[-1], 'close'] = 504.0

    # Stock advances 8% over last 15 days
    stock_df.loc[stock_df.index[-16], 'close'] = 95.0
    stock_df.loc[stock_df.index[-1], 'close'] = 103.0
    stock_df.loc[stock_df.index[-1], 'open'] = 102.0
    stock_df['ema_20'] = 98.0
    stock_df['ema_50'] = 94.0
    stock_df['atr_14'] = 2.0

    signal = screen_relative_strength_leaders(stock_df, "NVDA", benchmark_df=bench_df, window=15)
    assert signal is not None
    assert signal['symbol'] == "NVDA"
    assert signal['strategy'] == "Relative Strength Leader"
    assert signal['entry_price'] == 103.0
    assert signal['target_1'] > signal['entry_price']
    assert signal['stop_loss'] < signal['entry_price']


def test_run_institutional_screens_composite():
    asset_data = {
        "NVDA": _generate_synthetic_ohlcv(60, 120.0),
        "SPY": _generate_synthetic_ohlcv(60, 550.0),
    }
    asset_info = {
        "NVDA": {"Market": "US", "type": "stock"},
        "SPY": {"Market": "US", "type": "etf"},
    }
    signals = run_institutional_screens(asset_data, asset_info)
    assert isinstance(signals, list)
