import pandas as pd
import numpy as np
from app.models.data_contracts import validate_indicators_dataframe

def compute_ema(series: pd.Series, period: int) -> pd.Series:
    """Computes Exponential Moving Average."""
    return series.ewm(span=period, adjust=False).mean()

def compute_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Computes Relative Strength Index using Wilder's smoothing method."""
    delta = close.diff()
    gain = (delta.where(delta > 0, 0)).fillna(0)
    loss = (-delta.where(delta < 0, 0)).fillna(0)

    avg_gain = gain.ewm(alpha=1/period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    
    # Handle division by zero
    rsi = np.where(avg_loss == 0, 100, rsi)
    return pd.Series(rsi, index=close.index)

def compute_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Computes Average True Range."""
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.ewm(alpha=1/period, adjust=False).mean()

def compute_macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Computes MACD, returning (macd_line, signal_line, histogram)."""
    ema_fast = compute_ema(close, fast)
    ema_slow = compute_ema(close, slow)
    macd_line = ema_fast - ema_slow
    signal_line = compute_ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram

def compute_bollinger_bands(close: pd.Series, period: int = 20, std_dev: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Computes Bollinger Bands, returning (upper, middle, lower)."""
    middle = close.rolling(window=period).mean()
    std = close.rolling(window=period).std()
    upper = middle + (std * std_dev)
    lower = middle - (std * std_dev)
    return upper, middle, lower

def compute_keltner_channels(high: pd.Series, low: pd.Series, close: pd.Series, ema_period: int = 20, atr_period: int = 14, atr_mult: float = 1.5) -> tuple[pd.Series, pd.Series]:
    """Computes Keltner Channels, returning (upper, lower)."""
    middle = compute_ema(close, ema_period)
    atr = compute_atr(high, low, close, atr_period)
    upper = middle + (atr * atr_mult)
    lower = middle - (atr * atr_mult)
    return upper, lower

def compute_volume_ratio(volume: pd.Series, period: int = 20) -> pd.Series:
    """Computes RVOL = volume / SMA(volume, period)."""
    sma_vol = volume.rolling(window=period).mean()
    return volume / sma_vol

def compute_52w_high_low(close: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Computes Rolling 252-day high and low."""
    high_52w = close.rolling(window=252, min_periods=1).max()
    low_52w = close.rolling(window=252, min_periods=1).min()
    return high_52w, low_52w

def compute_supertrend(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    period: int = 10,
    multiplier: float = 3.0,
) -> tuple[pd.Series, pd.Series]:
    """
    Computes SuperTrend indicator and trend direction.
    Returns: (supertrend_series, direction_series: 1 for Bullish, -1 for Bearish)
    """
    atr = compute_atr(high, low, close, period)
    hl2 = (high + low) / 2.0
    basic_upper = hl2 + (multiplier * atr)
    basic_lower = hl2 - (multiplier * atr)

    final_upper = pd.Series(0.0, index=close.index)
    final_lower = pd.Series(0.0, index=close.index)
    supertrend = pd.Series(0.0, index=close.index)
    direction = pd.Series(1, index=close.index)

    for i in range(len(close)):
        if i == 0:
            final_upper.iloc[i] = basic_upper.iloc[i]
            final_lower.iloc[i] = basic_lower.iloc[i]
            supertrend.iloc[i] = basic_lower.iloc[i]
            direction.iloc[i] = 1
            continue

        prev_upper = final_upper.iloc[i-1]
        prev_lower = final_lower.iloc[i-1]
        prev_close = close.iloc[i-1]

        # Upper band ratchet
        if basic_upper.iloc[i] < prev_upper or prev_close > prev_upper:
            final_upper.iloc[i] = basic_upper.iloc[i]
        else:
            final_upper.iloc[i] = prev_upper

        # Lower band ratchet
        if basic_lower.iloc[i] > prev_lower or prev_close < prev_lower:
            final_lower.iloc[i] = basic_lower.iloc[i]
        else:
            final_lower.iloc[i] = prev_lower

        # Direction flip
        prev_supertrend = supertrend.iloc[i-1]
        prev_dir = direction.iloc[i-1]

        if prev_supertrend == prev_upper and close.iloc[i] > final_upper.iloc[i]:
            direction.iloc[i] = 1
            supertrend.iloc[i] = final_lower.iloc[i]
        elif prev_supertrend == prev_lower and close.iloc[i] < final_lower.iloc[i]:
            direction.iloc[i] = -1
            supertrend.iloc[i] = final_upper.iloc[i]
        else:
            direction.iloc[i] = prev_dir
            supertrend.iloc[i] = final_lower.iloc[i] if prev_dir == 1 else final_upper.iloc[i]

    return supertrend, direction

def compute_chaikin_money_flow(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    volume: pd.Series,
    period: int = 20,
) -> pd.Series:
    """Computes Chaikin Money Flow (CMF)."""
    hl_diff = high - low
    # Avoid zero division
    hl_diff = np.where(hl_diff == 0, 1e-8, hl_diff)
    mfm = ((close - low) - (high - close)) / hl_diff
    mfv = mfm * volume
    vol_sum = volume.rolling(window=period).sum()
    vol_sum = np.where(vol_sum == 0, 1e-8, vol_sum)
    cmf = mfv.rolling(window=period).sum() / vol_sum
    return pd.Series(cmf, index=close.index)

def compute_vwap(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    volume: pd.Series,
) -> pd.Series:
    """Computes cumulative Volume Weighted Average Price (VWAP)."""
    typical_price = (high + low + close) / 3.0
    cum_vol = volume.cumsum()
    cum_vol = np.where(cum_vol == 0, 1e-8, cum_vol)
    vwap = (typical_price * volume).cumsum() / cum_vol
    return pd.Series(vwap, index=close.index)

def compute_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Computes and adds all indicators to the DataFrame."""
    if df.empty or 'close' not in df.columns:
        return df

    out = df.copy()
    close = out['close']
    high = out.get('high', close)
    low = out.get('low', close)
    volume = out.get('volume', pd.Series(0, index=out.index))

    out['ema_20'] = compute_ema(close, 20)
    out['ema_50'] = compute_ema(close, 50)
    out['ema_200'] = compute_ema(close, 200)
    
    out['rsi_14'] = compute_rsi(close, 14)
    out['atr_14'] = compute_atr(high, low, close, 14)
    
    out['macd'], out['macd_signal'], out['macd_histogram'] = compute_macd(close)
    
    out['bb_upper'], out['bb_middle'], out['bb_lower'] = compute_bollinger_bands(close)
    
    out['kc_upper'], out['kc_lower'] = compute_keltner_channels(high, low, close)
    
    out['volume_ratio'] = compute_volume_ratio(volume, 20)
    
    out['high_52w'], out['low_52w'] = compute_52w_high_low(close)

    out['supertrend'], out['supertrend_direction'] = compute_supertrend(high, low, close)
    out['cmf_20'] = compute_chaikin_money_flow(high, low, close, volume)
    out['vwap'] = compute_vwap(high, low, close, volume)
    
    return validate_indicators_dataframe(out, strict=False)
