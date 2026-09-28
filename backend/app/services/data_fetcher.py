import logging
import yfinance as yf
import pandas as pd
import httpx
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

def _normalize_ohlcv_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Safely extracts standard OHLCV column names regardless of MultiIndex structure."""
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
    return df

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

def fetch_bist_prices(symbols: List[str], period: str = '1y') -> Dict[str, pd.DataFrame]:
    """
    Fetches daily OHLCV price data for Turkish stocks (BIST).
    Automatically appends .IS if missing.
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
        
    return results

def fetch_tefas_prices(fund_codes: List[str], start_date: str, end_date: str) -> Dict[str, pd.DataFrame]:
    """
    Fetches mutual fund prices from TEFAS API.
    """
    results = {}
    url = "https://www.tefas.gov.tr/api/DB/BindHistoryInfo"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0"
    }
    
    with httpx.Client(timeout=10.0) as client:
        for code in fund_codes:
            data = {
                "fontip": "YAT",
                "sfontip": "",
                "fonkod": code.upper(),
                "fongrup": "",
                "bastarih": start_date,
                "bittarih": end_date,
                "fonturkod": "",
                "fonunvankod": ""
            }
            try:
                response = client.post(url, data=data, headers=headers)
                response.raise_for_status()
                json_data = response.json()
                
                if json_data and 'data' in json_data:
                    df = pd.DataFrame(json_data['data'])
                    if not df.empty:
                        # Map TEFAS columns to standard OHLCV
                        # TARIH, FIYAT, KISI_SAYISI, PAY_SAYISI
                        df['date'] = pd.to_datetime(df['TARIH'], format='%d.%m.%Y').dt.tz_localize(None)
                        df['close'] = df['FIYAT'].astype(float)
                        df['open'] = df['close']
                        df['high'] = df['close']
                        df['low'] = df['close']
                        df['volume'] = df['PAY_SAYISI'].astype(float) if 'PAY_SAYISI' in df.columns else 0.0
                        df['adj_close'] = df['close']
                        df.set_index('date', inplace=True)
                        results[code] = df
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
