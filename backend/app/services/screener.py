import pandas as pd
from typing import Dict, List, Optional
import numpy as np

def screen_momentum_breakout(df: pd.DataFrame, symbol: str) -> Optional[Dict]:
    """
    Triggers when: close > 20-day high AND volume_ratio > 2.0 AND rsi_14 > 55 AND close > ema_50.
    """
    if len(df) < 50:
        return None
        
    last = df.iloc[-1]
    prev_high_20 = df['high'].shift(1).rolling(20).max().iloc[-1]
    
    if (last['close'] > prev_high_20 and 
        last['volume_ratio'] > 2.0 and 
        last['rsi_14'] > 55 and 
        last['close'] > last['ema_50']):
        
        entry = last['close']
        atr = last['atr_14']
        stop = entry - (2 * atr)
        target = entry + 2 * (entry - stop)
        
        return {
            'symbol': symbol,
            'strategy': 'Momentum Breakout',
            'signal_date': df.index[-1],
            'entry_price': entry,
            'stop_loss': stop,
            'target_1': target,
            'risk_reward_ratio': 2.0
        }
    return None

def screen_trend_pullback(df: pd.DataFrame, symbol: str) -> Optional[Dict]:
    """
    Triggers when: close > ema_200 AND close is within 1.5% of ema_20 or ema_50 AND rsi_14 between 40-55.
    """
    if len(df) < 200:
        return None
        
    last = df.iloc[-1]
    close = last['close']
    ema_20 = last['ema_20']
    ema_50 = last['ema_50']
    
    near_ema_20 = abs(close - ema_20) / ema_20 <= 0.015
    near_ema_50 = abs(close - ema_50) / ema_50 <= 0.015
    
    if (close > last['ema_200'] and 
        (near_ema_20 or near_ema_50) and 
        40 <= last['rsi_14'] <= 55):
        
        entry = close
        stop = min(ema_20, ema_50) * 0.98 # Stop 2% below the EMAs
        target = df['high'].rolling(10).max().iloc[-1]
        
        risk = entry - stop
        reward = target - entry
        rr = reward / risk if risk > 0 else 0
        
        return {
            'symbol': symbol,
            'strategy': 'Trend Pullback',
            'signal_date': df.index[-1],
            'entry_price': entry,
            'stop_loss': stop,
            'target_1': target,
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
        
        # Determine breakout direction using MACD
        if last['macd_histogram'] > 0:
            stop = last['kc_lower']
            target = entry + 2 * (entry - stop)
        else:
            stop = last['kc_upper']
            target = entry - 2 * (stop - entry)
            
        risk = abs(entry - stop)
        reward = abs(target - entry)
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
            
        if asset_type in ['fund', 'mutual_fund', 'etf']:
            sig = screen_fund_momentum(df, symbol)
            if sig: signals.append(sig)
            
    return signals
