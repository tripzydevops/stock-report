import pandas as pd
from typing import Dict, List, Optional
import numpy as np

def screen_momentum_breakout(df: pd.DataFrame, symbol: str) -> Optional[Dict]:
    """
    Momentum Breakout:
    Triggers when: close > 20-day high AND volume_ratio >= 1.35 AND rsi_14 > 52 AND close > ema_50.
    Calibrated volume hurdle (1.35x vs previous 2.0x) allows strong institutional breakouts
    to trigger without requiring unrealistic volume outliers.
    """
    if len(df) < 50:
        return None
        
    last = df.iloc[-1]
    prev_high_20 = df['high'].shift(1).rolling(20).max().iloc[-1]
    
    vol_ratio = last.get('volume_ratio', 1.0)
    rsi = last.get('rsi_14', 50)
    ema_50 = last.get('ema_50', 0)
    
    if (last['close'] > prev_high_20 and 
        vol_ratio >= 1.35 and 
        rsi > 52 and 
        last['close'] > ema_50):
        
        entry = last['close']
        atr = last.get('atr_14', entry * 0.03)
        stop = round(entry - (2 * atr), 2)
        target = round(entry + 2 * (entry - stop), 2)
        
        return {
            'symbol': symbol,
            'strategy': 'Momentum Breakout',
            'signal_date': df.index[-1],
            'entry_price': round(entry, 2),
            'stop_loss': stop,
            'target_1': target,
            'risk_reward_ratio': 2.0
        }
    return None

def screen_trend_pullback(df: pd.DataFrame, symbol: str) -> Optional[Dict]:
    """
    Trend Pullback:
    Triggers when:
    1. Macro uptrend: close > ema_200.
    2. Retracement: close is within 1.5% of ema_20 or ema_50.
    3. RSI between 40-55.
    4. Candle stabilization confirmation: green/neutral candle or RSI holding support,
       avoiding stocks free-falling through moving averages.
    """
    if len(df) < 200:
        return None
        
    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    close = last['close']
    open_p = last.get('open', close)
    ema_20 = last.get('ema_20', close)
    ema_50 = last.get('ema_50', close)
    ema_200 = last.get('ema_200', close)
    rsi = last.get('rsi_14', 50)
    
    near_ema_20 = abs(close - ema_20) / ema_20 <= 0.015
    near_ema_50 = abs(close - ema_50) / ema_50 <= 0.015
    
    # Candle stabilization: close not crashing below open, or bouncing from previous bar
    is_stabilizing = (close >= open_p * 0.998) or (close >= prev['close']) or (rsi >= prev.get('rsi_14', rsi) - 0.5)
    
    if (close > ema_200 and 
        (near_ema_20 or near_ema_50) and 
        40 <= rsi <= 55 and
        is_stabilizing):
        
        entry = close
        stop = round(min(ema_20, ema_50) * 0.98, 2) # Stop 2% below the EMAs
        target = df['high'].rolling(10).max().iloc[-1]
        
        # Ensure minimum 1.5:1 reward to risk
        if target <= entry * 1.03:
            target = entry + 2.0 * (entry - stop)
            
        risk = entry - stop
        reward = target - entry
        rr = reward / risk if risk > 0 else 0
        
        if rr >= 1.5 and stop < entry:
            return {
                'symbol': symbol,
                'strategy': 'Trend Pullback',
                'signal_date': df.index[-1],
                'entry_price': round(entry, 2),
                'stop_loss': stop,
                'target_1': round(target, 2),
                'risk_reward_ratio': round(rr, 2)
            }
    return None

def screen_mean_reversion(df: pd.DataFrame, symbol: str) -> Optional[Dict]:
    """
    Mean Reversion (Oversold Dip-Buy / Exhaustion Rebound):
    Triggers when:
    1. Asset is technically oversold: RSI(14) <= 36 OR price is touching/below the lower Bollinger Band.
    2. Reversal confirmation: green candle (close >= open) OR close > prev_close (bounce initiated).
    3. Target: Mean reversion back towards the 20-day EMA (minimum 1.5:1 R:R).
    4. Stop Loss: Placed below recent swing low / lower band.
    """
    if len(df) < 30:
        return None

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last

    close = last['close']
    open_p = last.get('open', close)
    low_p = last.get('low', close)
    high_p = last.get('high', close)
    rsi = last.get('rsi_14', 50)
    bb_lower = last.get('bb_lower', 0)
    ema_20 = last.get('ema_20', close)
    atr = last.get('atr_14', close * 0.03)

    is_oversold = (rsi <= 36) or (bb_lower > 0 and close <= bb_lower * 1.015) or (low_p <= bb_lower and close > low_p)

    # Reversal confirmation: green candle or higher close or hammer rejection wick
    has_bounce = (close >= open_p) or (close > prev['close']) or ((close - low_p) >= (high_p - close) * 1.5)

    if is_oversold and has_bounce and close > 0:
        entry = close
        recent_low = min(low_p, prev.get('low', low_p))
        stop = max(recent_low * 0.98, entry - (1.5 * atr))
        
        # Target: Mean reversion to 20 EMA
        target = max(ema_20, entry + (2.0 * (entry - stop)))
        
        risk = entry - stop
        reward = target - entry
        rr = reward / risk if risk > 0 else 0

        if rr >= 1.5 and stop < entry:
            return {
                'symbol': symbol,
                'strategy': 'Mean Reversion',
                'signal_date': df.index[-1],
                'entry_price': round(entry, 2),
                'stop_loss': round(stop, 2),
                'target_1': round(target, 2),
                'risk_reward_ratio': round(rr, 2)
            }
    return None

def screen_volatility_squeeze(df: pd.DataFrame, symbol: str) -> Optional[Dict]:
    """
    Triggers when: squeeze just released (previous bar was squeezed, current bar is not).
    Squeeze: bb_upper < kc_upper AND bb_lower > kc_lower.
    """
    if len(df) < 20:
        return None
        
    # Check squeeze condition
    squeeze = (df['bb_upper'] < df['kc_upper']) & (df['bb_lower'] > df['kc_lower'])
    
    prev_squeeze = squeeze.iloc[-2]
    curr_squeeze = squeeze.iloc[-1]
    
    if prev_squeeze and not curr_squeeze:
        last = df.iloc[-1]
        entry = last['close']
        
        # Spot equities are Long-only. Only trigger on bullish breakout (positive momentum)
        if last['macd_histogram'] > 0:
            stop = last['kc_lower']
            if stop >= entry:
                stop = entry * 0.95  # Fallback 5% stop if Keltner lower is at or above entry
            target = entry + 2 * (entry - stop)
            
            risk = entry - stop
            reward = target - entry
            rr = reward / risk if risk > 0 else 0
            
            return {
                'symbol': symbol,
                'strategy': 'Volatility Squeeze',
                'signal_date': df.index[-1],
                'entry_price': entry,
                'stop_loss': stop,
                'target_1': target,
                'risk_reward_ratio': round(rr, 2)
            }
        # If MACD histogram <= 0, it is a bearish breakdown (short setup).
        # We reject short setups since spot equities do not support short-selling.
        return None
    return None

def screen_fund_momentum(df: pd.DataFrame, symbol: str) -> Optional[Dict]:
    """
    For funds/ETFs: 1-month return in top decile, positive 3-month return, max drawdown < 10%.
    Note: Top decile requires cross-sectional data, here we simplify to absolute thresholds:
    1-month return > 5%, 3-month return > 0, MDD < 10%.
    """
    if len(df) < 63: # Approx 3 months of trading days
        return None
        
    close = df['close']
    ret_1m = (close.iloc[-1] / close.iloc[-21]) - 1 if len(close) >= 21 else 0
    ret_3m = (close.iloc[-1] / close.iloc[-63]) - 1
    
    # Calculate Max Drawdown over last 63 days
    rolling_max = close.tail(63).cummax()
    drawdown = (close.tail(63) - rolling_max) / rolling_max
    max_dd = abs(drawdown.min())
    
    if ret_1m > 0.05 and ret_3m > 0 and max_dd < 0.10:
        entry = close.iloc[-1]
        stop = entry * 0.90 # 10% trailing stop
        target = entry * 1.20
        
        return {
            'symbol': symbol,
            'strategy': 'Fund Momentum',
            'signal_date': df.index[-1],
            'entry_price': entry,
            'stop_loss': stop,
            'target_1': target,
            'risk_reward_ratio': 2.0
        }
    return None

def run_all_screens(asset_data: Dict[str, pd.DataFrame], asset_info: Dict[str, Dict]) -> List[Dict]:
    """Runs all applicable screens on each asset and returns combined list of signals."""
    signals = []
    
    for symbol, df in asset_data.items():
        if df.empty:
            continue
            
        info = asset_info.get(symbol, {})
        asset_type = info.get('type', 'stock').lower()
        
        if asset_type in ['stock', 'etf', 'crypto']:
            sig = screen_momentum_breakout(df, symbol)
            if sig: signals.append(sig)
            
            sig = screen_trend_pullback(df, symbol)
            if sig: signals.append(sig)
            
            sig = screen_volatility_squeeze(df, symbol)
            if sig: signals.append(sig)
            
            sig = screen_mean_reversion(df, symbol)
            if sig: signals.append(sig)
            
        if asset_type in ['fund', 'mutual_fund', 'etf']:
            sig = screen_fund_momentum(df, symbol)
            if sig: signals.append(sig)
            
    return signals
