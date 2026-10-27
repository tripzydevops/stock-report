"""
Institutional Trading Strategies Screener
==========================================
Implements hedge fund / institutional-grade market mechanics:
1. Anchored VWAP (AVWAP) Bounce: Institutional volume-weighted benchmark support.
2. Liquidity Sweep & Reclaim: Stop hunt flush below 20-day swing low absorbed by smart money.
3. Relative Strength (RS) Market Divergence: Identifying institutional accumulation leaders
   that hold firm or advance while the broad index (SPY/XU100) corrects.

These strategies run SEPARATELY from retail momentum/breakout screeners without replacing them.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional


def compute_anchored_vwap(df: pd.DataFrame, anchor_idx: int) -> pd.Series:
    """
    Computes Anchored VWAP from an integer index location (0 to len(df)-1).
    AVWAP = Cumulative(Typical_Price * Volume) / Cumulative(Volume) from anchor onward.
    """
    if df.empty or 'volume' not in df.columns or anchor_idx < 0 or anchor_idx >= len(df):
        return pd.Series(index=df.index, dtype=float)

    high = df['high'] if 'high' in df.columns else df['close']
    low = df['low'] if 'low' in df.columns else df['close']
    close = df['close']
    vol = df['volume'].fillna(0)

    typical_price = (high + low + close) / 3.0
    pv = typical_price * vol

    avwap = pd.Series(np.nan, index=df.index, dtype=float)
    subset_pv = pv.iloc[anchor_idx:].cumsum()
    subset_v = vol.iloc[anchor_idx:].cumsum()

    # Avoid zero division
    valid_mask = subset_v > 0
    calculated = np.where(valid_mask, subset_pv / subset_v, typical_price.iloc[anchor_idx:])
    avwap.iloc[anchor_idx:] = calculated
    return avwap


def screen_anchored_vwap_bounce(df: pd.DataFrame, symbol: str) -> Optional[Dict]:
    """
    Anchored VWAP Bounce:
    1. Finds significant swing low within the last 60 bars (major institutional pivot).
    2. Calculates AVWAP anchored from that pivot low.
    3. Triggers when:
       - Asset is in a broader uptrend (close > ema_200 or ema_50 > ema_200).
       - Price tests the AVWAP: close is within 2.0% of AVWAP, or low pierced AVWAP and closed back above.
       - Candle stabilization: close >= open * 0.995 (not a free-falling red candle).
       - RSI in healthy bounce territory: 40 <= rsi <= 62.
    """
    if len(df) < 50:
        return None

    last = df.iloc[-1]
    close = float(last['close'])
    open_p = float(last.get('open', close))
    low_p = float(last.get('low', close))
    rsi = float(last.get('rsi_14', 50))
    atr = float(last.get('atr_14', close * 0.03))
    ema_50 = float(last.get('ema_50', 0))
    ema_200 = float(last.get('ema_200', 0))

    # Broader trend check
    if ema_200 > 0 and close < ema_200 * 0.97:
        return None

    # Anchor to 60-day swing low (or max available lookback up to 60)
    lookback = min(len(df) - 5, 60)
    window = df.iloc[-lookback:]
    min_low_idx = window['low'].idxmin() if 'low' in window.columns else window['close'].idxmin()
    anchor_loc = df.index.get_loc(min_low_idx)

    # If the anchor is today or yesterday, it's too new to be a retest
    if len(df) - anchor_loc < 5:
        return None

    avwap_series = compute_anchored_vwap(df, anchor_loc)
    avwap_val = float(avwap_series.iloc[-1])
    if pd.isna(avwap_val) or avwap_val <= 0:
        return None

    # Test condition: close within 2% of AVWAP or low dipped below and closed back above
    dist_pct = abs(close - avwap_val) / avwap_val
    dipped_and_reclaimed = (low_p <= avwap_val) and (close >= avwap_val)
    near_avwap = dist_pct <= 0.020

    is_stabilizing = (close >= open_p * 0.995) and (40 <= rsi <= 65)

    if (near_avwap or dipped_and_reclaimed) and is_stabilizing:
        entry = close
        stop = round(min(avwap_val, low_p) - (1.0 * atr), 2)
        if stop >= entry * 0.98:
            stop = round(entry * 0.96, 2)

        risk = entry - stop
        if risk <= 0:
            return None

        # Two-tier institutional targets
        target_1 = round(entry + (1.5 * risk), 2)
        target_2 = round(entry + (2.5 * risk), 2)
        rr = round((target_1 - entry) / risk, 2)

        return {
            'symbol': symbol,
            'strategy': 'Anchored VWAP Bounce',
            'signal_date': df.index[-1],
            'entry_price': round(entry, 2),
            'stop_loss': stop,
            'target_1': target_1,
            'target_2': target_2,
            'risk_reward_ratio': rr,
            'category': 'INSTITUTIONAL'
        }

    return None


def screen_liquidity_sweep_reclaim(df: pd.DataFrame, symbol: str, lookback: int = 20) -> Optional[Dict]:
    """
    Liquidity Sweep & Reclaim (Institutional Stop Hunt):
    1. Identifies the prior 20-day swing low (retail stop pool).
    2. Today's low drops below the prior 20-day low (triggering retail stop losses).
    3. Today's close violently reclaims back ABOVE the prior swing low (smart money absorption).
    4. Lower wick absorption >= 35% of the total candle range.
    5. Volume confirmation: volume_ratio >= 1.15.
    """
    if len(df) < lookback + 5:
        return None

    last = df.iloc[-1]
    close = float(last['close'])
    open_p = float(last.get('open', close))
    high_p = float(last.get('high', close))
    low_p = float(last.get('low', close))
    vol_ratio = float(last.get('volume_ratio', 1.0))
    atr = float(last.get('atr_14', close * 0.03))

    prior_window = df.iloc[-(lookback + 1):-1]
    prior_low = float(prior_window['low'].min() if 'low' in prior_window.columns else prior_window['close'].min())

    # Conditions:
    # 1. Sweep: low breached prior swing low
    # 2. Reclaim: close ended above prior swing low
    swept_support = low_p < prior_low
    reclaimed_support = close > prior_low

    # 3. Candle absorption wick: lower wick must be significant
    candle_range = high_p - low_p
    lower_wick = min(open_p, close) - low_p
    wick_ratio = (lower_wick / candle_range) if candle_range > 0 else 0

    if swept_support and reclaimed_support and (wick_ratio >= 0.35) and (vol_ratio >= 1.15):
        entry = close
        # Tight stop placed below the swept low
        stop = round(low_p - (0.5 * atr), 2)
        if stop >= entry * 0.985:
            stop = round(entry * 0.97, 2)

        risk = entry - stop
        if risk <= 0:
            return None

        target_1 = round(entry + (1.6 * risk), 2)
        target_2 = round(entry + (2.6 * risk), 2)
        rr = round((target_1 - entry) / risk, 2)

        return {
            'symbol': symbol,
            'strategy': 'Liquidity Sweep Reclaim',
            'signal_date': df.index[-1],
            'entry_price': round(entry, 2),
            'stop_loss': stop,
            'target_1': target_1,
            'target_2': target_2,
            'risk_reward_ratio': rr,
            'category': 'INSTITUTIONAL'
        }

    return None


def screen_relative_strength_leaders(
    df: pd.DataFrame,
    symbol: str,
    benchmark_df: Optional[pd.DataFrame] = None,
    window: int = 15
) -> Optional[Dict]:
    """
    Relative Strength (RS) Market Divergence:
    Institutional accumulation creates divergence: the stock holds up or gains
    while the broader market index (SPY or XU100) is pulling back or consolidating.
    1. Over the last 15 bars:
       - Stock Return >= +2.5%
       - Benchmark Return <= +1.0% (market is struggling or falling)
       - RS Ratio >= 1.04 (stock outperforming index by 4%+)
    2. Stock is firmly above EMA 20 and EMA 50 (momentum alignment).
    3. Close > Open on the trigger bar.
    """
    if len(df) < window + 5:
        return None

    last = df.iloc[-1]
    close = float(last['close'])
    open_p = float(last.get('open', close))
    ema_20 = float(last.get('ema_20', close))
    ema_50 = float(last.get('ema_50', close))
    atr = float(last.get('atr_14', close * 0.03))

    stock_start_p = float(df['close'].iloc[-(window + 1)])
    stock_return = (close - stock_start_p) / stock_start_p if stock_start_p > 0 else 0

    # Benchmark comparison
    is_rs_divergent = False
    if benchmark_df is not None and len(benchmark_df) >= window + 5:
        bench_close = float(benchmark_df['close'].iloc[-1])
        bench_start = float(benchmark_df['close'].iloc[-(window + 1)])
        bench_return = (bench_close - bench_start) / bench_start if bench_start > 0 else 0

        # RS Ratio
        rs_ratio = (1.0 + stock_return) / (1.0 + bench_return) if (1.0 + bench_return) != 0 else 1.0
        # Trigger when stock is up and benchmark is flat/down and RS ratio is strong
        if stock_return >= 0.025 and bench_return <= 0.015 and rs_ratio >= 1.035:
            is_rs_divergent = True
    else:
        # Fallback without benchmark: Standalone strong momentum above key moving averages
        rsi = float(last.get('rsi_14', 50))
        if stock_return >= 0.05 and close > ema_20 and close > ema_50 and 52 <= rsi <= 72:
            is_rs_divergent = True

    # Moving average alignment and candle confirmation
    if is_rs_divergent and (close >= ema_20) and (close >= ema_50 * 0.99) and (close >= open_p * 0.995):
        entry = close
        stop = round(max(ema_20 - (1.0 * atr), entry - (1.8 * atr)), 2)
        if stop >= entry * 0.985:
            stop = round(entry * 0.965, 2)

        risk = entry - stop
        if risk <= 0:
            return None

        target_1 = round(entry + (1.5 * risk), 2)
        target_2 = round(entry + (2.5 * risk), 2)
        rr = round((target_1 - entry) / risk, 2)

        return {
            'symbol': symbol,
            'strategy': 'Relative Strength Leader',
            'signal_date': df.index[-1],
            'entry_price': round(entry, 2),
            'stop_loss': stop,
            'target_1': target_1,
            'target_2': target_2,
            'risk_reward_ratio': rr,
            'category': 'INSTITUTIONAL'
        }

    return None


def run_institutional_screens(
    asset_data: Dict[str, pd.DataFrame],
    asset_info: Dict[str, Dict],
    benchmark_data: Optional[Dict[str, pd.DataFrame]] = None
) -> List[Dict]:
    """
    Runs ONLY institutional screens across all assets.
    benchmark_data can contain 'SPY' and 'XU100.IS' for RS calculations.
    """
    signals = []
    benchmarks = benchmark_data or {}
    spy_df = benchmarks.get('SPY') or asset_data.get('SPY')
    xu100_df = benchmarks.get('XU100.IS') or asset_data.get('XU100.IS')

    for symbol, df in asset_data.items():
        if df.empty or len(df) < 30:
            continue

        info = asset_info.get(symbol, {})
        asset_type = info.get('type', 'stock').lower()
        market = info.get('Market', 'BIST' if '.IS' in symbol else 'US').upper()

        if asset_type in ['stock', 'etf']:
            # 1. Anchored VWAP Bounce
            sig = screen_anchored_vwap_bounce(df, symbol)
            if sig:
                signals.append(sig)

            # 2. Liquidity Sweep Reclaim
            sig = screen_liquidity_sweep_reclaim(df, symbol)
            if sig:
                signals.append(sig)

            # 3. Relative Strength Leader
            bench_df = xu100_df if market == 'BIST' else spy_df
            sig = screen_relative_strength_leaders(df, symbol, benchmark_df=bench_df)
            if sig:
                signals.append(sig)

    return signals
