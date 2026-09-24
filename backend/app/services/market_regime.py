import pandas as pd
from typing import Dict, Optional
from .data_fetcher import fetch_us_prices, fetch_bist_prices
from .indicators import compute_all_indicators

def evaluate_regime(index_df: pd.DataFrame) -> Dict:
    """
    Evaluates market regime based on index data.
    """
    if index_df.empty or len(index_df) < 200:
        return {'regime': 'Unknown', 'notes': 'Insufficient data'}
        
    df = compute_all_indicators(index_df)
    last = df.iloc[-1]
    
    close = last['close']
    ema_50 = last['ema_50']
    ema_200 = last['ema_200']
    
    if close > ema_50 and ema_50 > ema_200:
        regime = 'Bullish'
    elif close < ema_200 and ema_50 < ema_200:
        regime = 'Bearish'
    else:
        regime = 'Neutral'
        
    return {
        'regime': regime,
        'index_close': close,
        'ema_50': ema_50,
        'ema_200': ema_200,
        'notes': f"Price: {close:.2f}, EMA50: {ema_50:.2f}, EMA200: {ema_200:.2f}"
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
