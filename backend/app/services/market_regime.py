import pandas as pd
from typing import Dict, Optional
from .data_fetcher import fetch_us_prices, fetch_bist_prices
from .indicators import compute_all_indicators

def evaluate_regime(index_df: pd.DataFrame) -> Dict:
    """
    Evaluates dynamic market regime based on multi-timeframe quantitative metrics:
    - Retracement from 20-day high (Drawdown)
    - 5-day rate of change
    - EMA 20, EMA 50, EMA 200 trend alignment
    """
    if index_df.empty or len(index_df) < 30:
        return {'regime': 'Unknown', 'notes': 'Insufficient data'}
        
    df = compute_all_indicators(index_df)
    last = df.iloc[-1]
    
    close = float(last['close'])
    ema_20 = float(last.get('ema_20', close))
    ema_50 = float(last.get('ema_50', close))
    ema_200 = float(last.get('ema_200', close))
    
    high_20 = float(df['high'].tail(20).max()) if 'high' in df.columns else float(df['close'].tail(20).max())
    drawdown_pct = ((close - high_20) / high_20) * 100 if high_20 > 0 else 0.0
    
    close_5d = float(df['close'].iloc[-6]) if len(df) >= 6 else close
    return_5d = ((close - close_5d) / close_5d) * 100 if close_5d > 0 else 0.0

    # Dynamic Classification:
    if drawdown_pct <= -2.2 or (return_5d < -1.0 and close < ema_20):
        regime = 'Bearish'
        trend = 'down' if return_5d < 0 else 'flat'
        notes = f"Correction Mode: Drawdown {drawdown_pct:.1f}% from 20d peak; 5d return {return_5d:.1f}%"
    elif close > ema_20 and return_5d >= 1.0 and drawdown_pct > -1.5:
        regime = 'Bullish'
        trend = 'up'
        notes = f"Bullish Trend: Above EMA20 ({ema_20:.2f}); 5d return +{return_5d:.1f}%"
    else:
        regime = 'Neutral'
        trend = 'up' if return_5d > 0.5 else 'flat'
        notes = f"Consolidation / Rebound: 5d return {return_5d:.1f}%, EMA50: {ema_50:.2f}"
        
    return {
        'regime': regime,
        'trend': trend,
        'index_close': close,
        'drawdown_from_peak': drawdown_pct,
        'return_5d': return_5d,
        'ema_50': ema_50,
        'ema_200': ema_200,
        'notes': notes
    }

def get_us_regime(period: str = '1y') -> Dict:
    """Fetches SPY data and evaluates."""
    data = fetch_us_prices(['SPY'], period=period)
    df = data.get('SPY', pd.DataFrame())
    return evaluate_regime(df)

def get_bist_regime(period: str = '1y') -> Dict:
    """Fetches XU100.IS data and evaluates."""
    data = fetch_bist_prices(['XU100'], period=period)
    df = data.get('XU100', pd.DataFrame())
    return evaluate_regime(df)

def get_all_regimes() -> Dict[str, Dict]:
    """Returns both US and BIST regimes."""
    return {
        'US': get_us_regime(),
        'BIST': get_bist_regime()
    }
