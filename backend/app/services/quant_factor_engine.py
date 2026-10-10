"""
MarketPulse Institutional Cross-Sectional Factor Engine
Computes multi-factor alpha scores (Momentum, Volume Surge, Trend Quality, Mean Reversion Dislocation)
standardized as cross-sectional Z-scores across the asset universe.
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional

def compute_cross_sectional_factors(asset_data: Dict[str, pd.DataFrame]) -> Dict[str, Dict]:
    """
    Computes cross-sectional factor scores and percentile ranks across all available assets.
    Returns: Dict[symbol, factor_dict]
    """
    raw_factors = {}
    
    for symbol, df in asset_data.items():
        if df.empty or len(df) < 22:
            continue
            
        close = df['close']
        volume = df.get('volume', pd.Series(dtype=float))
        
        # 1. Momentum Factor: 1-month (21 days) return
        ret_1m = (close.iloc[-1] / close.iloc[-21]) - 1.0 if len(close) >= 21 else 0.0
        
        # 2. Medium-term Momentum: 3-month (63 days) return
        ret_3m = (close.iloc[-1] / close.iloc[-63]) - 1.0 if len(close) >= 63 else ret_1m
        
        # 3. Volume Surge Factor: Current volume vs 20-day SMA volume
        if not volume.empty and len(volume) >= 20 and volume.tail(20).mean() > 0:
            vol_surge = float(volume.iloc[-1] / volume.tail(20).mean())
        else:
            vol_surge = 1.0
            
        # 4. Trend Quality (Consistency): 20-day return divided by 20-day realized volatility
        daily_ret = close.pct_change().dropna()
        realized_vol_20d = float(daily_ret.tail(20).std() * np.sqrt(252)) if len(daily_ret) >= 20 else 0.25
        if realized_vol_20d < 0.05:
            realized_vol_20d = 0.05
        trend_quality = float(ret_1m / realized_vol_20d) if realized_vol_20d > 0 else 0.0
        
        # 5. Mean Reversion Dislocation: Distance from 20-day SMA in standard deviations
        rolling_mean = close.tail(20).mean()
        rolling_std = close.tail(20).std()
        if rolling_std and rolling_std > 0:
            bb_z_score = float((close.iloc[-1] - rolling_mean) / rolling_std)
        else:
            bb_z_score = 0.0
            
        rsi = float(df['rsi_14'].iloc[-1]) if 'rsi_14' in df.columns and pd.notna(df['rsi_14'].iloc[-1]) else 50.0

        raw_factors[symbol] = {
            'symbol': symbol,
            'ret_1m': ret_1m,
            'ret_3m': ret_3m,
            'vol_surge': vol_surge,
            'trend_quality': trend_quality,
            'bb_z_score': bb_z_score,
            'rsi': rsi,
            'realized_vol': realized_vol_20d
        }
        
    if not raw_factors:
        return {}
        
    df_factors = pd.DataFrame.from_dict(raw_factors, orient='index')
    
    # Standardize cross-sectionally: Z = (X - mean) / std
    for col in ['ret_1m', 'ret_3m', 'vol_surge', 'trend_quality']:
        col_std = df_factors[col].std()
        if col_std and col_std > 0:
            df_factors[f'{col}_z'] = (df_factors[col] - df_factors[col].mean()) / col_std
        else:
            df_factors[f'{col}_z'] = 0.0
            
    # Composite Institutional Alpha Score:
    # 40% 1M Momentum Z + 20% 3M Momentum Z + 20% Volume Surge Z + 20% Trend Quality Z
    df_factors['composite_z'] = (
        0.40 * df_factors['ret_1m_z'] +
        0.20 * df_factors['ret_3m_z'] +
        0.20 * df_factors['vol_surge_z'] +
        0.20 * df_factors['trend_quality_z']
    )
    
    # Percentile ranking (0.0 to 100.0)
    df_factors['percentile_rank'] = df_factors['composite_z'].rank(pct=True) * 100.0
    
    # Format results
    results = {}
    for sym, row in df_factors.iterrows():
        pct = float(row['percentile_rank'])
        comp_z = float(row['composite_z'])
        
        # Categorize factor tier
        if pct >= 90:
            tier = "Tier-1 Top Decile (Institutional Accumulation)"
        elif pct >= 75:
            tier = "Tier-2 Outperforming Momentum"
        elif pct <= 15:
            tier = "Tier-5 Deep Laggard / Capitulation"
        else:
            tier = "Tier-3 Neutral Core"
            
        results[sym] = {
            'symbol': sym,
            'percentile_rank': round(pct, 1),
            'composite_z': round(comp_z, 2),
            'ret_1m_pct': round(float(row['ret_1m']) * 100, 2),
            'ret_3m_pct': round(float(row['ret_3m']) * 100, 2),
            'vol_surge': round(float(row['vol_surge']), 2),
            'realized_vol_pct': round(float(row['realized_vol']) * 100, 1),
            'bb_z_score': round(float(row['bb_z_score']), 2),
            'rsi': round(float(row['rsi']), 1),
            'factor_tier': tier
        }
        
    return results
