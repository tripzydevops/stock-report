import pandas as pd
from typing import Dict, List, Optional
import numpy as np

from app.services.market_profiles import get_market_profile, US_GROWTH_MOMENTUM_UNIVERSE, MarketType
from app.services.signal_explainer import (
    build_pullback_reclaim_explanation,
    build_momentum_breakout_explanation,
    build_trend_pullback_explanation,
    build_mean_reversion_explanation,
    build_volatility_squeeze_explanation,
    build_fund_momentum_explanation,
    build_minervini_vcp_explanation,
    build_high_tight_flag_explanation,
    build_connors_rsi2_explanation
)



def screen_momentum_breakout(df: pd.DataFrame, symbol: str, market: str = "BIST") -> Optional[Dict]:
    """
    Momentum Breakout (Market-Differentiated Institutional Strategy):
    Triggers when: close > 20-day high AND volume_ratio >= profile.breakout_vol_mult AND rsi_14 > profile.breakout_rsi_min AND close > ema_50.
    Stage 2 Filter: If len(df) >= 200, close must be above ema_200 (avoids overhead trapped supply).
    US Filter: Restricted to US_GROWTH_MOMENTUM_UNIVERSE.
    Two-Tier Targets:
      - target_1: High-probability strike zone (~1.25x R:R) for 50% scale-out.
      - target_2: Runner zone (~2.25x R:R) for the remaining position.
    """
    if len(df) < 50:
        return None

    profile = get_market_profile(market)
    clean_sym = symbol.replace(".IS", "").upper()
    if profile.market == MarketType.US and clean_sym not in US_GROWTH_MOMENTUM_UNIVERSE:
        return None

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    prev_high_20 = df['high'].shift(1).rolling(20).max().iloc[-1]

    vol_ratio = last.get('volume_ratio', 1.0)
    rsi = last.get('rsi_14', 50)
    ema_50 = last.get('ema_50', 0)
    ema_200 = last.get('ema_200', 0)
    close = float(last['close'])
    prior_close = float(prev['close'])

    # Circuit breaker / flash dump guard
    daily_change_pct = ((close - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
    if daily_change_pct < profile.max_daily_drop_guard_pct or daily_change_pct <= -8.5:
        return None

    # Stage 2 filter: reject breakouts happening below the 200 EMA
    if len(df) >= 200 and ema_200 > 0 and close <= ema_200:
        return None

    if (close > prev_high_20 and 
        vol_ratio >= profile.breakout_vol_mult and 
        rsi > profile.breakout_rsi_min and 
        close > ema_50):

        entry = close
        atr = float(last.get('atr_14', entry * 0.03))
        stop = round(entry - (profile.breakout_atr_stop_mult * atr), 2)

        risk = entry - stop
        if risk <= 0:
            return None

        risk_pct = (risk / entry) * 100.0
        if risk_pct > profile.breakout_max_initial_risk_pct:
            stop = round(entry * (1.0 - (profile.breakout_max_initial_risk_pct / 100.0)), 2)
            risk = entry - stop

        target_1 = round(entry + (1.25 * risk), 2)
        target_2 = round(entry + (2.25 * risk), 2)

        exp = build_momentum_breakout_explanation(
            symbol=symbol,
            market=profile.market.value,
            prev_high_20=float(prev_high_20),
            vol_ratio=float(vol_ratio),
            rsi=float(rsi),
            entry_price=float(entry),
            stop_loss=float(stop),
            atr_14=float(atr),
            has_ema200=(len(df) >= 200 and ema_200 > 0),
            benchmark_symbol=profile.benchmark_symbol,
            regime="BULLISH"
        )

        return {
            'symbol': symbol,
            'market': profile.market.value,
            'strategy': 'Momentum Breakout',
            'direction': 'LONG',
            'entry_mode': 'next_open',
            'signal_date': df.index[-1],
            'entry_price': round(entry, 2),
            'stop_loss': stop,
            'target_1': target_1,
            'target_2': target_2,
            'risk_reward_ratio': 1.25,
            'confidence_score': 80.0,
            'trigger_reasons': exp["trigger_reasons"],
            'failed_checks': exp["failed_checks"],
            'invalidation': exp["invalidation"],
            'market_context': exp["market_context"],
            'risk': exp["risk"],
            'rationale': exp["rationale"],
            'ai_rationale': exp["rationale"]
        }
    return None


def screen_trend_pullback(df: pd.DataFrame, symbol: str, market: str = "BIST") -> Optional[Dict]:
    """
    Trend Pullback (Market-Differentiated Institutional Strategy):
    Triggers when:
    1. Macro uptrend: close > ema_200.
    2. Retracement: close is within profile.trend_pb_dist_max of ema_20 or ema_50.
    3. RSI between 40-55.
    4. Candle stabilization confirmation: green/neutral candle or RSI holding support.
    5. ATR-buffered stop: gives proper breathing room against morning dips.
    """
    if len(df) < 200:
        return None

    profile = get_market_profile(market)
    clean_sym = symbol.replace(".IS", "").upper()
    if profile.market == MarketType.US and clean_sym not in US_GROWTH_MOMENTUM_UNIVERSE:
        return None

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    close = float(last['close'])
    prior_close = float(prev['close'])
    open_p = float(last.get('open', close))
    ema_20 = float(last.get('ema_20', close))
    ema_50 = float(last.get('ema_50', close))
    ema_200 = float(last.get('ema_200', close))
    rsi = float(last.get('rsi_14', 50))
    atr = float(last.get('atr_14', close * 0.03))

    # Circuit breaker / drop guard
    daily_change_pct = ((close - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
    if daily_change_pct < profile.max_daily_drop_guard_pct or daily_change_pct <= -8.5:
        return None

    near_ema_20 = abs(close - ema_20) / ema_20 <= profile.trend_pb_dist_max
    near_ema_50 = abs(close - ema_50) / ema_50 <= profile.trend_pb_dist_max

    # Candle stabilization: close not crashing below open, or bouncing from previous bar
    is_stabilizing = (close >= open_p * 0.998) or (close >= prev['close']) or (rsi >= prev.get('rsi_14', rsi) - 0.5)

    if (close > ema_200 and 
        (near_ema_20 or near_ema_50) and 
        40 <= rsi <= 55 and
        is_stabilizing):

        entry = close
        # ATR-buffered stop below the EMAs so normal intraday noise doesn't stop out
        stop = round(min(ema_20, ema_50) - (profile.trend_pb_atr_stop_mult * atr), 2)
        if stop >= entry * 0.975:
            stop = round(entry * 0.965, 2)

        risk = entry - stop
        if risk <= 0 or stop >= entry:
            return None

        risk_pct = (risk / entry) * 100.0
        if risk_pct > profile.trend_pb_max_risk_pct:
            stop = round(entry * (1.0 - (profile.trend_pb_max_risk_pct / 100.0)), 2)
            risk = entry - stop

        swing_high = float(df['high'].rolling(10).max().iloc[-1])
        if entry < swing_high <= entry * 1.15:
            target_1_candidate = max(swing_high, entry + (1.25 * risk))
        else:
            target_1_candidate = entry + (1.25 * risk)

        target_1 = round(min(entry * 1.15, target_1_candidate), 2)
        target_2 = round(max(target_1 * 1.04, min(entry * 1.25, entry + (2.25 * risk))), 2)

        rr = (target_1 - entry) / risk if risk > 0 else 0

        if rr >= 1.2 and stop < entry and target_1 > entry and target_2 > target_1:
            tested_ema = "EMA20" if abs(close - ema_20) <= abs(close - ema_50) else "EMA50"
            support_val = ema_20 if tested_ema == "EMA20" else ema_50
            dist_ema_pct = (abs(close - support_val) / support_val) * 100.0 if support_val > 0 else 0.0

            exp = build_trend_pullback_explanation(
                symbol=symbol,
                market=profile.market.value,
                distance_to_ema=dist_ema_pct,
                tested_ema=tested_ema,
                support_level=float(support_val),
                rsi=float(rsi),
                entry_price=float(entry),
                stop_loss=float(stop),
                atr_14=float(atr),
                benchmark_symbol=profile.benchmark_symbol,
                regime="BULLISH"
            )

            return {
                'symbol': symbol,
                'market': profile.market.value,
                'strategy': 'Trend Pullback',
                'direction': 'LONG',
                'entry_mode': 'next_open',
                'signal_date': df.index[-1],
                'entry_price': round(entry, 2),
                'stop_loss': stop,
                'target_1': target_1,
                'target_2': target_2,
                'risk_reward_ratio': round(rr, 2),
                'confidence_score': 75.0,
                'trigger_reasons': exp["trigger_reasons"],
                'failed_checks': exp["failed_checks"],
                'invalidation': exp["invalidation"],
                'market_context': exp["market_context"],
                'risk': exp["risk"],
                'rationale': exp["rationale"],
                'ai_rationale': exp["rationale"]
            }
    return None


def screen_pullback_reclaim(
    df: pd.DataFrame,
    symbol: str,
    market: str = "BIST"
) -> Optional[Dict]:
    """
    Trend Pullback Reclaim (Market-Differentiated Institutional Strategy):
    Automatically applies market-specific dynamics (BIST vs. US):
    - BIST: 2.5%-5.8% pullback, max 5 sessions, Taban/Devre Kesici guard (-4.5%), 2.0x ATR stop.
    - US: 3.0%-7.0% pullback, max 6 sessions, Growth/Tech universe filter, 1.5x ATR stop, 8% risk cap.
    """
    if len(df) < 50:
        return None

    profile = get_market_profile(market)

    clean_sym = symbol.replace(".IS", "").upper()
    if profile.market == MarketType.US and clean_sym not in US_GROWTH_MOMENTUM_UNIVERSE:
        return None

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last

    close = float(last['close'])
    high = float(last.get('high', close))
    low = float(last.get('low', close))
    vol = float(last.get('volume', 0))

    ema_20 = float(last.get('ema_20', 0))
    ema_50 = float(last.get('ema_50', 0))
    ema_200 = float(last.get('ema_200', 0))
    atr = float(last.get('atr_14', close * 0.03))

    # 1. Trend Filter: Stage 2 Uptrend
    if ema_50 <= 0 or ema_200 <= 0:
        return None
    if not (close > ema_50 and close > ema_200 and ema_50 > ema_200):
        return None

    # 2. Pullback from 20-day High (parameterized by market profile)
    lookback = min(20, len(df))
    high_series = df['high'].iloc[-lookback:] if 'high' in df.columns else df['close'].iloc[-lookback:]
    peak_val = float(high_series.max())
    if peak_val <= 0:
        return None

    peak_loc = int(np.argmax(high_series.values))
    bars_since_peak = len(high_series) - 1 - peak_loc

    if not (1 <= bars_since_peak <= profile.pullback_max_sessions):
        return None

    low_series = df['low'].iloc[-bars_since_peak:] if 'low' in df.columns else df['close'].iloc[-bars_since_peak:]
    trough = float(low_series.min())
    pullback_depth_pct = ((peak_val - trough) / peak_val) * 100.0

    if not (profile.pullback_min_pct <= pullback_depth_pct <= profile.pullback_max_pct):
        return None

    # 3. Reclaim Candle Trigger
    prior_high = float(prev.get('high', prev['close']))
    prior_close = float(prev['close'])

    if not (close > prior_high and close > ema_20):
        return None

    candle_range = high - low
    if candle_range <= 0:
        return None
    range_position = (close - low) / candle_range
    if range_position < profile.candle_range_position_min:
        return None

    # 4. Volume Confirmation
    vol_sma20 = float(df['volume'].tail(20).mean()) if 'volume' in df.columns and len(df) >= 20 else vol
    vol_ratio = last.get('volume_ratio')
    if vol_ratio is not None and vol_ratio > 0:
        has_volume = vol_ratio >= profile.volume_surge_multiplier
    else:
        has_volume = (vol > profile.volume_surge_multiplier * vol_sma20) if vol_sma20 > 0 else True

    if not has_volume:
        return None

    # 5. Risk Guards (Market-specific daily drop limit)
    daily_change_pct = ((close - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
    if daily_change_pct < profile.max_daily_drop_guard_pct or daily_change_pct <= -8.5:
        return None

    # 6. Stop Loss & Target Sizing
    stop_atr = close - (profile.atr_stop_multiplier * atr)
    stop_swing = trough * 0.995
    stop_loss = min(stop_atr, stop_swing)

    risk_dist = close - stop_loss
    if risk_dist <= 0:
        return None

    risk_pct = (risk_dist / close) * 100.0
    if risk_pct > profile.max_initial_risk_pct:
        stop_loss = close * (1.0 - (profile.max_initial_risk_pct / 100.0))
        risk_dist = close - stop_loss

    target_1 = round(close + (profile.rr_target_1 * risk_dist), 2)
    target_2 = round(close + (profile.rr_target_2 * risk_dist), 2)
    stop_loss = round(stop_loss, 2)
    rr = round((target_1 - close) / risk_dist, 2) if risk_dist > 0 else profile.rr_target_1

    calculated_vol_ratio = float(vol_ratio if vol_ratio is not None and vol_ratio > 0 else (vol / vol_sma20 if vol_sma20 > 0 else 1.0))
    exp = build_pullback_reclaim_explanation(
        symbol=symbol,
        market=profile.market.value,
        pullback_depth_pct=float(pullback_depth_pct),
        bars_since_peak=int(bars_since_peak),
        prior_high=float(prior_high),
        range_position=float(range_position),
        vol_ratio=calculated_vol_ratio,
        stop_loss=float(stop_loss),
        atr_14=float(atr),
        entry_price=float(close),
        benchmark_symbol=profile.benchmark_symbol,
        regime="BULLISH"
    )

    return {
        'symbol': symbol,
        'market': profile.market.value,
        'strategy': 'Pullback Reclaim',
        'direction': 'LONG',
        'entry_mode': 'next_open',
        'signal_date': df.index[-1],
        'entry_price': round(close, 2),
        'stop_loss': stop_loss,
        'target_1': target_1,
        'target_2': target_2,
        'risk_reward_ratio': rr,
        'confidence_score': 85.0,
        'pre_pullback_high': round(peak_val, 2),
        'trigger_reasons': exp["trigger_reasons"],
        'failed_checks': exp["failed_checks"],
        'invalidation': exp["invalidation"],
        'market_context': exp["market_context"],
        'risk': exp["risk"],
        'rationale': exp["rationale"],
        'ai_rationale': exp["rationale"]
    }


def screen_mean_reversion(df: pd.DataFrame, symbol: str, market: str = "BIST") -> Optional[Dict]:
    """
    Mean Reversion (Oversold Dip-Buy / Exhaustion Rebound):
    Triggers when:
    1. Technical oversold: RSI <= profile.mean_rev_rsi_max OR price touching/below lower Bollinger Band.
    2. Taban / Circuit-Breaker Guard: Reject falling knives dropping >= max_daily_drop_guard_pct.
    3. Reversal confirmation: Genuine green candle OR higher close OR hammer rejection wick.
    4. Macro Regime Gating: If below 200 EMA, requires deep capitulation (RSI <= 30) AND MACD hist improving.
    5. Feasible Holding Horizon Targets: Target 1 capped at realistic swing boundary.
    """
    if len(df) < 30:
        return None

    profile = get_market_profile(market)
    clean_sym = symbol.replace(".IS", "").upper()
    if profile.market == MarketType.US and clean_sym not in US_GROWTH_MOMENTUM_UNIVERSE:
        return None

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last

    close = float(last['close'])
    open_p = float(last.get('open', close))
    low_p = float(last.get('low', close))
    high_p = float(last.get('high', close))
    rsi = float(last.get('rsi_14', 50))
    bb_lower = float(last.get('bb_lower', 0))
    ema_20 = float(last.get('ema_20', close))
    ema_200 = float(last.get('ema_200', 0))
    atr = float(last.get('atr_14', close * 0.03))

    prev_close = float(prev.get('close', close))
    pct_change = (close - prev_close) / prev_close if prev_close > 0 else 0

    # 1. Taban / Circuit-Breaker Guard
    if pct_change <= (profile.max_daily_drop_guard_pct / 100.0):
        return None

    candle_range = high_p - low_p
    # Limit-down lock: 0-range bar on negative day (open == high == low == close)
    if pct_change < 0 and (candle_range == 0 or low_p == close):
        return None

    is_oversold = (rsi <= profile.mean_rev_rsi_max) or (bb_lower > 0 and close <= bb_lower * 1.015) or (low_p <= bb_lower and close > low_p)

    # 2. Genuine Reversal Confirmation
    is_green_candle = (close > open_p * 1.002) and (close >= prev_close * 0.995)
    higher_close = close > prev_close * 1.002
    hammer_wick = (candle_range > 0) and ((close - low_p) >= candle_range * 0.6) and (close > low_p * 1.008) and (pct_change > -0.035)

    has_bounce = is_green_candle or higher_close or hammer_wick

    # Macro trend gate: prevent falling knives when stuck in extended bear trends
    if len(df) >= 200 and ema_200 > 0 and close < ema_200 * 0.95:
        macd_improving = last.get('macd_histogram', 0) > prev.get('macd_histogram', 0)
        if rsi > 30 or not macd_improving:
            return None

    if is_oversold and has_bounce and close > 0:
        entry = close
        recent_low = min(low_p, float(prev.get('low', low_p)))
        stop = max(round(recent_low * 0.98, 2), round(entry - (profile.mean_rev_atr_stop_mult * atr), 2))

        risk = entry - stop
        if risk <= 0 or stop >= entry:
            return None

        risk_pct = (risk / entry) * 100.0
        if risk_pct > profile.mean_rev_max_risk_pct:
            stop = round(entry * (1.0 - (profile.mean_rev_max_risk_pct / 100.0)), 2)
            risk = entry - stop

        # Holding Horizon Reachability Constraint
        if entry < ema_20 <= entry * 1.20:
            target_1_raw = max(ema_20, entry + (1.25 * risk))
        else:
            target_1_raw = entry + (1.5 * risk)

        target_1 = round(min(entry * 1.20, target_1_raw), 2)
        target_2_raw = max(target_1 * 1.04, entry + (2.0 * risk))
        target_2 = round(min(entry * 1.30, target_2_raw), 2)

        rr = (target_1 - entry) / risk if risk > 0 else 0

        if rr >= 1.2 and stop < entry and target_1 > entry and target_2 > target_1:
            reversal_type = "Bullish green candle bounce" if is_green_candle else ("Higher close confirmation" if higher_close else "Hammer rejection wick")

            exp = build_mean_reversion_explanation(
                symbol=symbol,
                market=profile.market.value,
                rsi=float(rsi),
                bb_lower=float(bb_lower),
                reversal_type=reversal_type,
                entry_price=float(entry),
                stop_loss=float(stop),
                atr_14=float(atr),
                target_1=float(target_1),
                benchmark_symbol=profile.benchmark_symbol,
                regime="NEUTRAL"
            )

            return {
                'symbol': symbol,
                'market': profile.market.value,
                'strategy': 'Mean Reversion',
                'direction': 'LONG',
                'entry_mode': 'next_open',
                'signal_date': df.index[-1],
                'entry_price': round(entry, 2),
                'stop_loss': round(stop, 2),
                'target_1': target_1,
                'target_2': target_2,
                'risk_reward_ratio': round(rr, 2),
                'confidence_score': 75.0,
                'trigger_reasons': exp["trigger_reasons"],
                'failed_checks': exp["failed_checks"],
                'invalidation': exp["invalidation"],
                'market_context': exp["market_context"],
                'risk': exp["risk"],
                'rationale': exp["rationale"],
                'ai_rationale': exp["rationale"]
            }
    return None


def screen_volatility_squeeze(df: pd.DataFrame, symbol: str, market: str = "BIST") -> Optional[Dict]:
    """
    Volatility Squeeze:
    Triggers when: squeeze just released (previous bar was squeezed, current bar is not).
    Squeeze: bb_upper < kc_upper AND bb_lower > kc_lower.
    Stage 2 Filter: Requires close > ema_50 (and close > ema_200 when available).
    """
    if len(df) < 20:
        return None

    profile = get_market_profile(market)
    clean_sym = symbol.replace(".IS", "").upper()
    if profile.market == MarketType.US and clean_sym not in US_GROWTH_MOMENTUM_UNIVERSE:
        return None

    squeeze = (df['bb_upper'] < df['kc_upper']) & (df['bb_lower'] > df['kc_lower'])

    prev_squeeze = squeeze.iloc[-2]
    curr_squeeze = squeeze.iloc[-1]

    if prev_squeeze and not curr_squeeze:
        last = df.iloc[-1]
        entry = float(last['close'])
        ema_50 = float(last.get('ema_50', 0))
        ema_200 = float(last.get('ema_200', 0))
        atr = float(last.get('atr_14', entry * 0.03))

        if (ema_50 > 0 and entry <= ema_50) or (len(df) >= 200 and ema_200 > 0 and entry <= ema_200):
            return None

        macd_hist = float(last.get('macd_histogram', 0))
        if macd_hist > 0:
            stop = last.get('kc_lower', entry - (profile.squeeze_atr_stop_mult * atr))
            if stop >= entry * 0.98 or pd.isna(stop):
                stop = round(entry - (profile.squeeze_atr_stop_mult * atr), 2)
            else:
                stop = round(float(stop), 2)

            risk = entry - stop
            if risk <= 0:
                return None

            risk_pct = (risk / entry) * 100.0
            if risk_pct > profile.squeeze_max_risk_pct:
                stop = round(entry * (1.0 - (profile.squeeze_max_risk_pct / 100.0)), 2)
                risk = entry - stop

            target_1 = round(entry + (1.25 * risk), 2)
            target_2 = round(entry + (2.25 * risk), 2)

            rr = (target_1 - entry) / risk if risk > 0 else 0

            exp = build_volatility_squeeze_explanation(
                symbol=symbol,
                market=profile.market.value,
                macd_hist=macd_hist,
                entry_price=float(entry),
                stop_loss=float(stop),
                atr_14=float(atr),
                benchmark_symbol=profile.benchmark_symbol,
                regime="BULLISH"
            )

            return {
                'symbol': symbol,
                'market': profile.market.value,
                'strategy': 'Volatility Squeeze',
                'direction': 'LONG',
                'entry_mode': 'next_open',
                'signal_date': df.index[-1],
                'entry_price': round(entry, 2),
                'stop_loss': stop,
                'target_1': target_1,
                'target_2': target_2,
                'risk_reward_ratio': round(rr, 2),
                'confidence_score': 82.0,
                'trigger_reasons': exp["trigger_reasons"],
                'failed_checks': exp["failed_checks"],
                'invalidation': exp["invalidation"],
                'market_context': exp["market_context"],
                'risk': exp["risk"],
                'rationale': exp["rationale"],
                'ai_rationale': exp["rationale"]
            }
        return None
    return None


def screen_fund_momentum(df: pd.DataFrame, symbol: str, market: str = "BIST") -> Optional[Dict]:
    """
    For funds/ETFs: 1-month return in top decile, positive 3-month return, max drawdown < limit.
    """
    if len(df) < 63:
        return None

    profile = get_market_profile(market)
    close = df['close']
    ret_1m = (close.iloc[-1] / close.iloc[-21]) - 1 if len(close) >= 21 else 0
    ret_3m = (close.iloc[-1] / close.iloc[-63]) - 1

    rolling_max = close.tail(63).cummax()
    drawdown = (close.tail(63) - rolling_max) / rolling_max
    max_dd = abs(drawdown.min())

    if ret_1m > profile.fund_mom_1m_min and ret_3m > 0 and max_dd < profile.fund_mom_max_dd:
        entry = float(close.iloc[-1])
        stop = round(entry * (1.0 - profile.fund_mom_trailing_stop_pct), 2)
        target_1 = round(entry * 1.15, 2)
        target_2 = round(entry * 1.25, 2)
        benchmark = profile.benchmark_symbol if profile.market == MarketType.US else "TEFAS"

        exp = build_fund_momentum_explanation(
            symbol=symbol,
            market=profile.market.value,
            ret_1m=float(ret_1m),
            ret_3m=float(ret_3m),
            max_dd=float(max_dd),
            entry_price=float(entry),
            stop_loss=float(stop),
            benchmark_symbol=benchmark
        )

        return {
            'symbol': symbol,
            'market': profile.market.value,
            'strategy': 'Fund Momentum',
            'direction': 'LONG',
            'entry_mode': 'next_open',
            'signal_date': df.index[-1],
            'entry_price': round(entry, 2),
            'stop_loss': stop,
            'target_1': target_1,
            'target_2': target_2,
            'risk_reward_ratio': 2.0,
            'confidence_score': 80.0,
            'trigger_reasons': exp["trigger_reasons"],
            'failed_checks': exp["failed_checks"],
            'invalidation': exp["invalidation"],
            'market_context': exp["market_context"],
            'risk': exp["risk"],
            'rationale': exp["rationale"],
            'ai_rationale': exp["rationale"]
        }
    return None


def screen_minervini_vcp(df: pd.DataFrame, symbol: str, market: str = "BIST") -> Optional[Dict]:
    """
    Minervini Volatility Contraction Pattern (VCP):
    Identifies institutional accumulation bases where volatility contracts through successive waves
    (e.g., -15% -> -8% -> -3%) on declining volume, followed by a tight pivot breakout.
    """
    if len(df) < 60:
        return None

    profile = get_market_profile(market)
    clean_sym = symbol.replace(".IS", "").upper()
    if profile.market == MarketType.US and clean_sym not in US_GROWTH_MOMENTUM_UNIVERSE:
        return None

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    close = float(last['close'])
    prior_close = float(prev['close'])
    high = float(last.get('high', close))
    low = float(last.get('low', close))
    vol = float(last.get('volume', 0))

    ema_50 = float(last.get('ema_50', 0))
    ema_200 = float(last.get('ema_200', 0))
    vol_ratio = float(last.get('volume_ratio', 1.0))
    atr = float(last.get('atr_14', close * 0.03))

    # 1. Macro Uptrend: Stage 2
    if ema_50 <= 0 or ema_200 <= 0:
        return None
    if not (close > ema_50 and close > ema_200 and ema_50 > ema_200):
        return None

    # Circuit breaker / drop guard
    pct_change = ((close - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
    if pct_change < profile.max_daily_drop_guard_pct or pct_change <= -8.5:
        return None

    # 2. Base Volatility Contraction Detection (Lookback 40 bars)
    base_window = df.iloc[-40:-5]
    if len(base_window) < 20:
        return None

    base_highs = base_window['high'].values if 'high' in base_window.columns else base_window['close'].values
    base_lows = base_window['low'].values if 'low' in base_window.columns else base_window['close'].values

    peak_idx = int(np.argmax(base_highs))
    peak_val = float(base_highs[peak_idx])
    if peak_val <= 0:
        return None

    trough1_val = float(np.min(base_lows[peak_idx:]))
    depth1 = (peak_val - trough1_val) / peak_val

    max_c1_depth = 0.28 if profile.market == MarketType.US else 0.35
    min_c1_depth = 0.06 if profile.market == MarketType.US else 0.08
    if not (min_c1_depth <= depth1 <= max_c1_depth):
        return None

    # 3. Recent Tight Consolidation Pivot (last 5-10 bars)
    recent_window = df.iloc[-10:-1]
    recent_highs = recent_window['high'].values if 'high' in recent_window.columns else recent_window['close'].values
    recent_lows = recent_window['low'].values if 'low' in recent_window.columns else recent_window['close'].values

    pivot_high = float(np.max(recent_highs))
    pivot_low = float(np.min(recent_lows))
    if pivot_high <= 0:
        return None
    depth2 = (pivot_high - pivot_low) / pivot_high

    max_c2_depth = 0.12 if profile.market == MarketType.US else 0.15
    if depth2 >= depth1 * 0.75 or depth2 > max_c2_depth or depth2 < 0.015:
        return None

    # 4. Volume Dry-Up (prior bar below average) & Breakout Trigger
    vol_sma20 = float(df['volume'].tail(20).mean()) if 'volume' in df.columns and len(df) >= 20 else vol
    prior_vol = float(prev.get('volume', 0))
    if prior_vol > 1.15 * vol_sma20:
        return None

    req_breakout_vol = 1.10 if profile.market == MarketType.US else 1.25
    if not (close > pivot_high and vol_ratio >= req_breakout_vol):
        return None

    c_range = high - low
    if c_range > 0 and ((close - low) / c_range) < 0.50:
        return None

    # 5. Risk & Targets
    stop = round(pivot_low * 0.99, 2)
    risk = close - stop
    if risk <= 0:
        return None

    max_risk = profile.max_initial_risk_pct
    if (risk / close) * 100.0 > max_risk:
        stop = round(close * (1.0 - (max_risk / 100.0)), 2)
        risk = close - stop

    target_1 = round(close + (1.5 * risk), 2)
    target_2 = round(close + (2.5 * risk), 2)
    rr = round((target_1 - close) / risk, 2)

    exp = build_minervini_vcp_explanation(
        symbol=symbol,
        market=profile.market.value,
        depth1_pct=depth1 * 100.0,
        depth2_pct=depth2 * 100.0,
        pivot_high=pivot_high,
        vol_ratio=vol_ratio,
        entry_price=close,
        stop_loss=stop,
        atr_14=atr,
        benchmark_symbol=profile.benchmark_symbol,
        regime="BULLISH"
    )

    return {
        'symbol': symbol,
        'market': profile.market.value,
        'strategy': 'Minervini VCP',
        'direction': 'LONG',
        'entry_mode': 'next_open',
        'signal_date': df.index[-1],
        'entry_price': round(close, 2),
        'stop_loss': stop,
        'target_1': target_1,
        'target_2': target_2,
        'risk_reward_ratio': rr,
        'confidence_score': 88.0,
        'trigger_reasons': exp["trigger_reasons"],
        'failed_checks': exp["failed_checks"],
        'invalidation': exp["invalidation"],
        'market_context': exp["market_context"],
        'risk': exp["risk"],
        'rationale': exp["rationale"],
        'ai_rationale': exp["rationale"]
    }


def screen_high_tight_flag(df: pd.DataFrame, symbol: str, market: str = "BIST") -> Optional[Dict]:
    """
    High Tight Flag (O'Neil / Zanger Momentum Blast):
    One of the highest-expectancy continuation patterns.
    Triggers when a stock surges >= 60% over 40 bars, consolidates tightly (<20% depth),
    and breaks out to new highs on volume surge.
    """
    if len(df) < 60:
        return None

    profile = get_market_profile(market)
    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    close = float(last['close'])
    prior_close = float(prev['close'])
    vol_ratio = float(last.get('volume_ratio', 1.0))
    atr = float(last.get('atr_14', close * 0.03))

    # Taban guard
    pct_change = ((close - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
    if pct_change < profile.max_daily_drop_guard_pct or pct_change <= -8.5:
        return None

    # Prior surge window (30-40 sessions)
    window_40 = df['close'].iloc[-40:-10].values
    if len(window_40) < 20:
        return None

    surge_min = float(np.min(window_40))
    surge_max = float(np.max(window_40))
    if surge_min <= 0:
        return None
    surge_pct = ((surge_max - surge_min) / surge_min) * 100.0

    if surge_pct < 60.0:
        return None

    # 10-bar tight flag consolidation
    flag_window = df.iloc[-10:-1]
    flag_highs = flag_window['high'].values if 'high' in flag_window.columns else flag_window['close'].values
    flag_lows = flag_window['low'].values if 'low' in flag_window.columns else flag_window['close'].values

    flag_high = float(np.max(flag_highs))
    flag_low = float(np.min(flag_lows))
    if flag_high <= 0:
        return None

    flag_depth_pct = ((flag_high - flag_low) / flag_high) * 100.0
    if flag_depth_pct > 20.0 or flag_depth_pct < 3.0:
        return None

    # Breakout trigger today
    if not (close > flag_high and vol_ratio >= 1.30):
        return None

    stop = round(flag_low * 0.98, 2)
    risk = close - stop
    if risk <= 0:
        return None

    if (risk / close) * 100.0 > 12.0:
        stop = round(close * 0.88, 2)
        risk = close - stop

    target_1 = round(close + (1.5 * risk), 2)
    target_2 = round(close + (3.0 * risk), 2)
    rr = round((target_1 - close) / risk, 2)

    exp = build_high_tight_flag_explanation(
        symbol=symbol,
        market=profile.market.value,
        surge_pct=surge_pct,
        flag_depth_pct=flag_depth_pct,
        flag_high=flag_high,
        vol_ratio=vol_ratio,
        entry_price=close,
        stop_loss=stop,
        atr_14=atr,
        benchmark_symbol=profile.benchmark_symbol,
        regime="BULLISH"
    )

    return {
        'symbol': symbol,
        'market': profile.market.value,
        'strategy': 'High Tight Flag',
        'direction': 'LONG',
        'entry_mode': 'next_open',
        'signal_date': df.index[-1],
        'entry_price': round(close, 2),
        'stop_loss': stop,
        'target_1': target_1,
        'target_2': target_2,
        'risk_reward_ratio': rr,
        'confidence_score': 90.0,
        'trigger_reasons': exp["trigger_reasons"],
        'failed_checks': exp["failed_checks"],
        'invalidation': exp["invalidation"],
        'market_context': exp["market_context"],
        'risk': exp["risk"],
        'rationale': exp["rationale"],
        'ai_rationale': exp["rationale"]
    }


def screen_connors_rsi2_rebound(df: pd.DataFrame, symbol: str, market: str = "US") -> Optional[Dict]:
    """
    Connors RSI-2 Panic Capitulation Rebound:
    Identifies extreme short-term panic washouts (RSI-2 <= 10.0) occurring inside
    macro Stage-2 uptrends (Price > 200 EMA) for rapid mean-reversion snapbacks.
    """
    if len(df) < 200:
        return None

    profile = get_market_profile(market)
    clean_sym = symbol.replace(".IS", "").upper()
    if profile.market == MarketType.US and clean_sym not in US_GROWTH_MOMENTUM_UNIVERSE:
        return None

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    close = float(last['close'])
    prior_close = float(prev['close'])
    ema_200 = float(last.get('ema_200', 0))
    atr = float(last.get('atr_14', close * 0.03))

    # Macro trend check: Stage 2
    if ema_200 <= 0 or close <= ema_200:
        return None

    # Circuit breaker / drop guard
    pct_change = ((close - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
    if pct_change < profile.max_daily_drop_guard_pct or pct_change <= -8.5:
        return None

    # Calculate 2-period RSI on the fly if not present
    delta = df['close'].diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1/2, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/2, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi_2_series = (100.0 - (100.0 / (1.0 + rs))).fillna(50.0)
    rsi2 = float(rsi_2_series.iloc[-1])

    if rsi2 > 10.0:
        return None

    stop = round(close - (1.5 * atr), 2)
    risk = close - stop
    if risk <= 0:
        return None

    if (risk / close) * 100.0 > 8.0:
        stop = round(close * 0.92, 2)
        risk = close - stop

    target_1 = round(close + (1.25 * risk), 2)
    target_2 = round(close + (2.0 * risk), 2)
    rr = round((target_1 - close) / risk, 2)

    exp = build_connors_rsi2_explanation(
        symbol=symbol,
        market=profile.market.value,
        rsi2_val=rsi2,
        ema200_val=ema_200,
        entry_price=close,
        stop_loss=stop,
        atr_14=atr,
        benchmark_symbol=profile.benchmark_symbol,
        regime="NEUTRAL"
    )

    return {
        'symbol': symbol,
        'market': profile.market.value,
        'strategy': 'Connors RSI-2 Rebound',
        'direction': 'LONG',
        'entry_mode': 'next_open',
        'signal_date': df.index[-1],
        'entry_price': round(close, 2),
        'stop_loss': stop,
        'target_1': target_1,
        'target_2': target_2,
        'risk_reward_ratio': rr,
        'confidence_score': 82.0,
        'trigger_reasons': exp["trigger_reasons"],
        'failed_checks': exp["failed_checks"],
        'invalidation': exp["invalidation"],
        'market_context': exp["market_context"],
        'risk': exp["risk"],
        'rationale': exp["rationale"],
        'ai_rationale': exp["rationale"]
    }


def run_all_screens(asset_data: Dict[str, pd.DataFrame], asset_info: Dict[str, Dict]) -> List[Dict]:
    """Runs verified whitelisted screens per market microstructure."""
    signals = []

    for symbol, df in asset_data.items():
        if df.empty:
            continue

        info = asset_info.get(symbol, {})
        asset_type = info.get('type', 'stock').lower()
        market_val = info.get('market', info.get('Market', 'BIST' if '.IS' in symbol else 'US')).upper()
        is_us = market_val in ['US', 'NASDAQ', 'NYSE']

        if asset_type in ['stock', 'etf', 'crypto']:
            # 1. UNIVERSAL PROVEN CORE: Trend Pullback Reclaim (Top #1 risk-adjusted performer in both markets)
            sig = screen_pullback_reclaim(df, symbol, market=market_val)
            if sig: signals.append(sig)

            # 2. UNIVERSAL PROVEN: Trend Pullback (EMA 50)
            sig = screen_trend_pullback(df, symbol, market=market_val)
            if sig: signals.append(sig)

            # 3. UNIVERSAL PROVEN: Mean Reversion (Oversold)
            sig = screen_mean_reversion(df, symbol, market=market_val)
            if sig: signals.append(sig)

            # 4. TOP TRADER: Minervini Volatility Contraction Pattern (VCP)
            sig = screen_minervini_vcp(df, symbol, market=market_val)
            if sig: signals.append(sig)

            if not is_us:
                # BIST-SPECIFIC POWERHOUSES (+797% Breakouts & +145% Squeezes)
                sig = screen_momentum_breakout(df, symbol, market=market_val)
                if sig: signals.append(sig)

                sig = screen_volatility_squeeze(df, symbol, market=market_val)
                if sig: signals.append(sig)

                # BIST-SPECIFIC TOP TRADER: High Tight Flag (66.7% win rate, 2.89 profit factor)
                sig = screen_high_tight_flag(df, symbol, market=market_val)
                if sig: signals.append(sig)
            else:
                # US-SPECIFIC TOP TRADER: Connors RSI-2 Panic Rebound (53.4% win rate, -15.8% Max DD)
                sig = screen_connors_rsi2_rebound(df, symbol, market=market_val)
                if sig: signals.append(sig)

        if asset_type in ['fund', 'mutual_fund', 'etf']:
            sig = screen_fund_momentum(df, symbol, market=market_val)
            if sig: signals.append(sig)

    return signals

