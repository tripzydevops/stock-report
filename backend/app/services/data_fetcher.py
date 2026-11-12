import logging
import yfinance as yf
import pandas as pd
import httpx
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone, timedelta
from app.models.data_contracts import validate_ohlcv_dataframe

logger = logging.getLogger(__name__)

import numpy as np

# Authoritative BIST calendar and trading session resolvers
from app.services.bist_calendar import (
    BIST_MARKET_HOLIDAYS,
    BIST_HALF_DAYS,
    is_bist_holiday,
    is_bist_half_day,
    is_bist_market_open,
    get_bist_trading_session_timestamp as get_bist_trading_session_date
)

def _normalize_ohlcv_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Safely extracts standard OHLCV column names regardless of MultiIndex structure and validates against data contracts."""
    if df.empty:
        return df
    if isinstance(df.columns, pd.MultiIndex):
        l0 = [str(c).lower() for c in df.columns.get_level_values(0)]
        l1 = [str(c).lower() for c in df.columns.get_level_values(1)]
        if any('close' in c for c in l1):
            df.columns = [str(c).lower().replace(' ', '_') for c in df.columns.get_level_values(1)]
        elif any('close' in c for c in l0):
            df.columns = [str(c).lower().replace(' ', '_') for c in df.columns.get_level_values(0)]
        else:
            df.columns = [str(c[-1]).lower().replace(' ', '_') for c in df.columns]
    else:
        df.columns = [str(col).lower().replace(' ', '_') for col in df.columns]
    return validate_ohlcv_dataframe(df, strict=False)

def fetch_us_prices(symbols: List[str], period: str = '1y') -> Dict[str, pd.DataFrame]:
    """
    Fetches daily OHLCV price data for US stocks/ETFs.
    """
    results = {}
    if not symbols:
        return results
        
    try:
        data = yf.download(symbols, period=period, group_by='ticker', auto_adjust=False, threads=True)
        
        if len(symbols) == 1:
            symbol = symbols[0]
            df = _normalize_ohlcv_columns(data.copy())
            if not df.empty and 'close' in df.columns and not df['close'].isna().all():
                results[symbol] = df
        else:
            for symbol in symbols:
                try:
                    if isinstance(data.columns, pd.MultiIndex) and symbol in data.columns.get_level_values(1):
                        df = data.xs(symbol, level=1, axis=1).copy()
                        df = _normalize_ohlcv_columns(df)
                    elif isinstance(data.columns, pd.MultiIndex) and symbol in data.columns.get_level_values(0):
                        df = data[symbol].copy()
                        df = _normalize_ohlcv_columns(df)
                    else:
                        continue
                    if not df.empty and 'close' in df.columns and not df['close'].isna().all():
                        results[symbol] = df
                except Exception:
                    continue
    except Exception as e:
        logger.error(f"Error fetching US prices for {symbols}: {str(e)}")
        
    return results

def fetch_bist_prices_tradingview(symbols: List[str]) -> Dict[str, pd.DataFrame]:
    """
    Fetches delayed BIST price bars from TradingView Turkey Scanner API.
    Acts as an independent fallback provider when Yahoo Finance fails or returns 404.
    """
    results = {}
    if not symbols:
        return results

    clean_map = {sym.replace(".IS", "").upper(): sym for sym in symbols}
    tv_tickers = [f"BIST:{k}" for k in clean_map.keys()]

    url = "https://scanner.tradingview.com/turkey/scan"
    payload = {
        "symbols": {"tickers": tv_tickers},
        "columns": ["close", "open", "high", "low", "volume", "change", "change_abs"]
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
    }

    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(url, json=payload, headers=headers)
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                session_date = get_bist_trading_session_date()
                for item in data:
                    ticker = item.get("s", "").replace("BIST:", "").upper()
                    vals = item.get("d", [])
                    if not ticker or not isinstance(vals, list) or len(vals) < 5:
                        continue
                    close = vals[0]
                    if not isinstance(close, (int, float)) or close <= 0:
                        continue
                    close_val = float(close)
                    # STRICT NULL PRESERVATION - Never fabricate OHLC from close or volume from 0
                    open_p = float(vals[1]) if isinstance(vals[1], (int, float)) and vals[1] > 0 else np.nan
                    high_p = float(vals[2]) if isinstance(vals[2], (int, float)) and vals[2] > 0 else np.nan
                    low_p = float(vals[3]) if isinstance(vals[3], (int, float)) and vals[3] > 0 else np.nan
                    vol = float(vals[4]) if isinstance(vals[4], (int, float)) and vals[4] >= 0 else np.nan

                    has_full_ohlc = not (np.isnan(open_p) or np.isnan(high_p) or np.isnan(low_p))
                    completeness = "full_ohlcv" if has_full_ohlc and not np.isnan(vol) else ("close_only" if np.isnan(open_p) and np.isnan(high_p) and np.isnan(low_p) else "partial_ohlcv")

                    df = pd.DataFrame([{
                        "open": open_p,
                        "high": high_p,
                        "low": low_p,
                        "close": close_val,
                        "adj_close": close_val,
                        "volume": vol,
                        "bar_completeness": completeness,
                    }], index=[session_date])
                    df = validate_ohlcv_dataframe(df, strict=False, allow_partial=True)

                    original_sym = clean_map.get(ticker, ticker)
                    results[original_sym] = df
    except Exception as e:
        logger.warning(f"TradingView scanner fallback error for {symbols}: {e}")

    return results

def fetch_bist_prices(symbols: List[str], period: str = '1y') -> Dict[str, pd.DataFrame]:
    """
    Fetches daily OHLCV price data for Turkish stocks (BIST).
    Automatically appends .IS if missing.
    Fails over to TradingView Scanner API if Yahoo Finance fails for any symbols.
    """
    normalized_symbols = [f"{sym}.IS" if not sym.endswith('.IS') else sym for sym in symbols]
    
    results = {}
    if not normalized_symbols:
        return results
        
    try:
        data = yf.download(normalized_symbols, period=period, group_by='ticker', auto_adjust=False, threads=True)
        
        if len(normalized_symbols) == 1:
            symbol = normalized_symbols[0]
            df = _normalize_ohlcv_columns(data.copy())
            if not df.empty and 'close' in df.columns and not df['close'].isna().all():
                original_sym = symbols[0]
                results[original_sym] = df
        else:
            for i, symbol in enumerate(normalized_symbols):
                try:
                    if isinstance(data.columns, pd.MultiIndex) and symbol in data.columns.get_level_values(1):
                        df = data.xs(symbol, level=1, axis=1).copy()
                        df = _normalize_ohlcv_columns(df)
                    elif isinstance(data.columns, pd.MultiIndex) and symbol in data.columns.get_level_values(0):
                        df = data[symbol].copy()
                        df = _normalize_ohlcv_columns(df)
                    else:
                        continue
                    if not df.empty and 'close' in df.columns and not df['close'].isna().all():
                        original_sym = symbols[i]
                        results[original_sym] = df
                except Exception:
                    continue
    except Exception as e:
        logger.error(f"Error fetching BIST prices for {symbols}: {str(e)}")

    # TradingView Scanner fallback for any missing or failed symbols
    missing = [sym for sym in symbols if sym not in results and sym.replace('.IS', '') not in results]
    if missing:
        try:
            tv_results = fetch_bist_prices_tradingview(missing)
            results.update(tv_results)
        except Exception as tv_e:
            logger.warning(f"TradingView fallback error: {tv_e}")
        
    return results

def fetch_tefas_prices(fund_codes: List[str], start_date: str, end_date: str) -> Dict[str, pd.DataFrame]:
    """
    Fetches mutual fund prices from TEFAS API.
    """
    results = {}
    url = "https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir"
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
    
    with httpx.Client(timeout=15.0) as client:
        for code in fund_codes:
            clean_code = code.upper().strip()
            payload = {
                "fonKodu": clean_code,
                "dil": "TR",
                "periyod": 1
            }
            try:
                response = client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                json_data = response.json()
                
                raw_list = json_data.get("resultList") or json_data.get("data") or []
                if raw_list:
                    df = pd.DataFrame(raw_list)
                    if not df.empty:
                        date_col = 'tarih' if 'tarih' in df.columns else 'TARIH'
                        price_col = 'fiyat' if 'fiyat' in df.columns else 'FIYAT'
                        df['date'] = pd.to_datetime(df[date_col]).dt.tz_localize(None)
                        df['close'] = df[price_col].astype(str).str.replace(',', '.').astype(float)
                        df['open'] = df['close'].shift(1).fillna(df['close'])
                        df['high'] = df[['open', 'close']].max(axis=1)
                        df['low'] = df[['open', 'close']].min(axis=1)
                        df['volume'] = df['PAY_SAYISI'].astype(float) if 'PAY_SAYISI' in df.columns else 0.0
                        df['adj_close'] = df['close']
                        df.set_index('date', inplace=True)
                        results[clean_code] = validate_ohlcv_dataframe(df, strict=False)
            except Exception as e:
                logger.error(f"Error fetching TEFAS prices for {code}: {str(e)}")
                
    return results

def fetch_fx_rate(pair: str = 'USDTRY', period: str = '1y') -> pd.DataFrame:
    """
    Fetches FX rate history from Yahoo Finance.
    """
    ticker = f"{pair}=X"
    try:
        df = yf.download(ticker, period=period, auto_adjust=False)
        return _normalize_ohlcv_columns(df)
    except Exception as e:
        logger.error(f"Error fetching FX rate for {pair}: {str(e)}")
        return pd.DataFrame()

def fetch_all_prices(assets: List[Dict[str, Any]]) -> Dict[str, pd.DataFrame]:
    """
    Master function to fetch prices for a mixed list of assets.
    """
    results = {}
    us_symbols = []
    bist_symbols = []
    tefas_codes = []
    
    for asset in assets:
        symbol = asset.get('symbol')
        market = asset.get('market', '').upper()
        
        if market == 'US':
            us_symbols.append(symbol)
        elif market == 'BIST':
            bist_symbols.append(symbol)
        elif market == 'TEFAS':
            tefas_codes.append(symbol)
            
    if us_symbols:
        results.update(fetch_us_prices(us_symbols))
        
    if bist_symbols:
        results.update(fetch_bist_prices(bist_symbols))
        
    if tefas_codes:
        import datetime
        end_date = datetime.datetime.now().strftime('%d.%m.%Y')
        start_date = (datetime.datetime.now() - datetime.timedelta(days=365)).strftime('%d.%m.%Y')
        results.update(fetch_tefas_prices(tefas_codes, start_date, end_date))
        
    return results
