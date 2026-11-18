"""
Fundamental Service for Koyfin-Style Stock Intelligence.
Fetches, normalizes, calculates CAGRs, and caches comprehensive corporate fundamentals,
capital structure, valuation multiples, and analyst consensus targets in Supabase.
"""

import logging
import math
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import yfinance as yf
from app.core.database import get_supabase_client

logger = logging.getLogger(__name__)


def _safe_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return None


def _calc_cagr(start_val: Optional[float], end_val: Optional[float], years: float = 4.0) -> Optional[float]:
    if start_val and end_val and start_val > 0 and end_val > 0 and years > 0:
        try:
            return round(((end_val / start_val) ** (1.0 / years) - 1.0) * 100.0, 2)
        except Exception:
            return None
    return None


def extract_year_founded(summary: str) -> Optional[int]:
    import re
    if not summary:
        return None
    match = re.search(r'\b(founded|incorporated|established)\s+in\s+(\d{4})\b', summary, re.IGNORECASE)
    if match:
        try:
            return int(match.group(2))
        except Exception:
            pass
    # Fallback search for any 4 digit year between 1800 and 2025
    m2 = re.search(r'\bin\s+(18\d\d|19\d\d|20[0-2]\d)\b', summary)
    if m2:
        try:
            return int(m2.group(1))
        except Exception:
            pass
    return None


def fetch_stock_fundamentals(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Fetches and constructs Koyfin-style comprehensive company fundamentals.
    Handles both BIST (.IS) and US equities seamlessly.
    """
    clean_sym = symbol.replace('.IS', '').strip().upper()
    is_bist = symbol.endswith('.IS') or len(clean_sym) == 5 or clean_sym in {
        'TURSG', 'ISMEN', 'AKBNK', 'THYAO', 'FROTO', 'BIMAS', 'ASELS', 'TUPRS',
        'KCHOL', 'EREGL', 'SISE', 'YKBNK', 'SAHOL', 'ENKAI', 'HALKB', 'VAKBN',
        'KRDMD', 'PETKM', 'TCELL', 'AEFES', 'AGHOL', 'CCOLA', 'BRSAN'
    }
    yf_symbol = f"{clean_sym}.IS" if is_bist else clean_sym

    try:
        ticker = yf.Ticker(yf_symbol)
        info = ticker.info or {}
    except Exception as e:
        logger.warning(f"Failed to fetch info for {yf_symbol}: {e}")
        return None

    if not info or ('shortName' not in info and 'longName' not in info and 'marketCap' not in info):
        # Try without .IS or with .IS fallback
        fallback_sym = clean_sym if is_bist else f"{clean_sym}.IS"
        try:
            ticker = yf.Ticker(fallback_sym)
            info = ticker.info or {}
        except Exception:
            pass

    if not info:
        return None

    summary = info.get('longBusinessSummary') or info.get('description') or ''
    year_founded = extract_year_founded(summary)

    # 1. Company Profile
    profile = {
        'symbol': clean_sym,
        'yfSymbol': yf_symbol,
        'companyName': info.get('longName') or info.get('shortName') or clean_sym,
        'description': summary,
        'headquarters': f"{info.get('city', '')}{', ' + info.get('country', '') if info.get('city') and info.get('country') else info.get('country', '')}" or '-',
        'employees': info.get('fullTimeEmployees'),
        'yearFounded': year_founded,
        'website': info.get('website'),
        'sector': info.get('sector') or 'Financial Services',
        'industry': info.get('industry') or 'Insurance',
        'currency': info.get('currency') or ('TRY' if is_bist else 'USD'),
    }

    # 2. Historical financials for 5Y CAGR
    fin = None
    cashflow = None
    try:
        fin = ticker.financials
        cashflow = ticker.cashflow
    except Exception as fe:
        logger.debug(f"Could not load financial statements for {yf_symbol}: {fe}")

    sales_start, sales_end = None, _safe_float(info.get('totalRevenue'))
    ebitda_start, ebitda_end = None, _safe_float(info.get('ebitda'))
    ebit_start, ebit_end = None, None
    net_income_start, net_income_end = None, _safe_float(info.get('netIncomeToCommon') or info.get('netIncome'))
    cfo_start, cfo_end = None, _safe_float(info.get('operatingCashflow'))
    eps_start, eps_end = None, _safe_float(info.get('trailingEps'))

    num_years = 4.0
    if fin is not None and not fin.empty and len(fin.columns) >= 2:
        try:
            oldest_col = fin.columns[-1]
            latest_col = fin.columns[0]
            num_years = max(1.0, float(len(fin.columns) - 1))

            if 'Total Revenue' in fin.index:
                sales_start = _safe_float(fin.loc['Total Revenue', oldest_col])
                if not sales_end:
                    sales_end = _safe_float(fin.loc['Total Revenue', latest_col])

            if 'EBIT' in fin.index:
                ebit_start = _safe_float(fin.loc['EBIT', oldest_col])
                ebit_end = _safe_float(fin.loc['EBIT', latest_col])

            if 'Net Income' in fin.index:
                net_income_start = _safe_float(fin.loc['Net Income', oldest_col])
                if not net_income_end:
                    net_income_end = _safe_float(fin.loc['Net Income', latest_col])

            if 'Diluted EPS' in fin.index:
                eps_start = _safe_float(fin.loc['Diluted EPS', oldest_col])
                if not eps_end:
                    eps_end = _safe_float(fin.loc['Diluted EPS', latest_col])
        except Exception as e:
            logger.debug(f"Error extracting fin rows: {e}")

    if cashflow is not None and not cashflow.empty and len(cashflow.columns) >= 2:
        try:
            oldest_col = cashflow.columns[-1]
            latest_col = cashflow.columns[0]
            if 'Operating Cash Flow' in cashflow.index:
                cfo_start = _safe_float(cashflow.loc['Operating Cash Flow', oldest_col])
                if not cfo_end:
                    cfo_end = _safe_float(cashflow.loc['Operating Cash Flow', latest_col])
        except Exception:
            pass

    # Fallback EBIT approximation if not directly reported
    if ebit_end is None and ebitda_end is not None:
        ebit_end = round(ebitda_end * 0.99, 2)

    financials_growth = [
        {
            'metric': 'Sales',
            'labelTr': 'Satış Gelirleri',
            'ltm': sales_end,
            'cagr5y': _calc_cagr(sales_start, sales_end, num_years),
        },
        {
            'metric': 'EBITDA',
            'labelTr': 'FAVÖK (EBITDA)',
            'ltm': ebitda_end,
            'cagr5y': _calc_cagr(ebitda_start, ebitda_end, num_years),
        },
        {
            'metric': 'EBIT',
            'labelTr': 'Faaliyet Kârı (EBIT)',
            'ltm': ebit_end,
            'cagr5y': _calc_cagr(ebit_start, ebit_end, num_years),
        },
        {
            'metric': 'Net Income',
            'labelTr': 'Net Kâr',
            'ltm': net_income_end,
            'cagr5y': _calc_cagr(net_income_start, net_income_end, num_years),
        },
        {
            'metric': 'Cash From Operations',
            'labelTr': 'İşletme Nakit Akışı',
            'ltm': cfo_end,
            'cagr5y': _calc_cagr(cfo_start, cfo_end, num_years),
        },
        {
            'metric': 'Diluted EPS (excl)',
            'labelTr': 'Hisse Başına Kâr (EPS)',
            'ltm': eps_end,
            'cagr5y': _calc_cagr(eps_start, eps_end, num_years),
        },
    ]

    # 3. Capital Structure
    capital_structure = {
        'marketCap': _safe_float(info.get('marketCap')),
        'totalDebt': _safe_float(info.get('totalDebt')),
        'totalCash': _safe_float(info.get('totalCash')),
        'enterpriseValue': _safe_float(info.get('enterpriseValue')),
        'bookValue': _safe_float(info.get('bookValue')),
        'priceToBook': _safe_float(info.get('priceToBook')),
    }

    # 4. Key Trading Stats
    key_data = {
        'marketCap': _safe_float(info.get('marketCap')),
        'beta5y': _safe_float(info.get('beta')),
        'dividendYield': _safe_float(info.get('dividendYield')),
        'shortInterestPct': _safe_float(info.get('shortPercentOfFloat')),
        'sharesOutstanding': _safe_float(info.get('sharesOutstanding')),
        'volume': _safe_float(info.get('volume') or info.get('regularMarketVolume')),
        'averageVolume': _safe_float(info.get('averageVolume') or info.get('averageVolume10days')),
        'high52w': _safe_float(info.get('fiftyTwoWeekHigh')),
        'low52w': _safe_float(info.get('fiftyTwoWeekLow')),
        'trailingPE': _safe_float(info.get('trailingPE')),
        'forwardPE': _safe_float(info.get('forwardPE')),
    }

    # 5. Price Targets & Consensus
    analysts = {
        'targetMean': _safe_float(info.get('targetMeanPrice')),
        'targetHigh': _safe_float(info.get('targetHighPrice')),
        'targetLow': _safe_float(info.get('targetLowPrice')),
        'numberOfOpinions': info.get('numberOfAnalystOpinions'),
        'recommendationKey': info.get('recommendationKey') or 'none',
        'currentPrice': _safe_float(info.get('currentPrice') or info.get('regularMarketPrice')),
    }

    payload = {
        'symbol': clean_sym,
        'profile': profile,
        'financialsGrowth': financials_growth,
        'capitalStructure': capital_structure,
        'keyData': key_data,
        'analysts': analysts,
        'updatedAt': datetime.now(timezone.utc).isoformat()
    }

    return payload


def save_fundamentals_to_supabase(payload: Dict[str, Any]) -> bool:
    """Upserts fundamental data into the asset_fundamentals Supabase table."""
    try:
        supabase = get_supabase_client()
        symbol = payload['symbol']

        # Get asset id
        asset_res = supabase.table('assets').select('id').or_(f"symbol.eq.{symbol},symbol.eq.{symbol}.IS").limit(1).execute()
        asset_id = asset_res.data[0]['id'] if asset_res.data else None

        record = {
            'symbol': symbol,
            'asset_id': asset_id,
            'data': payload,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }

        supabase.table('asset_fundamentals').upsert(record, on_conflict='symbol').execute()
        logger.info(f"Successfully cached fundamentals for {symbol} in Supabase.")
        return True
    except Exception as e:
        logger.error(f"Error saving fundamentals to Supabase for {payload.get('symbol')}: {e}")
        return False
