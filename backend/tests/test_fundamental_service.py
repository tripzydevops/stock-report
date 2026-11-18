import pandas as pd
from datetime import datetime
from app.services.fundamental_service import (
    _calc_pct_change,
    _calc_cagr,
    _extract_multi_period_financials,
    extract_year_founded
)


def test_calc_pct_change():
    assert _calc_pct_change(100.0, 120.0) == 20.0
    assert _calc_pct_change(100.0, 80.0) == -20.0
    assert _calc_pct_change(None, 100.0) is None
    assert _calc_pct_change(0.0, 100.0) is None


def test_calc_cagr():
    # 100 -> 144 in 2 years is approx 20%
    cagr = _calc_cagr(100.0, 144.0, years=2.0)
    assert cagr == 20.0
    assert _calc_cagr(None, 100.0) is None
    assert _calc_cagr(100.0, None) is None
    assert _calc_cagr(-50.0, 100.0) is None


def test_extract_year_founded():
    assert extract_year_founded("The company was founded in 1957 in Istanbul.") == 1957
    assert extract_year_founded("Incorporated in 1993, this tech company...") == 1993
    assert extract_year_founded("Established in 2008 as a subsidiary...") == 2008
    assert extract_year_founded("") is None


def test_extract_multi_period_financials():
    # Create mock financial DataFrame
    d1 = datetime(2024, 12, 31)
    d2 = datetime(2025, 12, 31)
    df = pd.DataFrame(
        {
            d1: [1000000.0, 200000.0, 100000.0, 2.5],
            d2: [1500000.0, 300000.0, 150000.0, 3.75]
        },
        index=['Total Revenue', 'EBITDA', 'Net Income', 'Diluted EPS']
    )

    annual_res = _extract_multi_period_financials(df, is_quarterly=False)
    assert len(annual_res) == 2
    assert annual_res[0]['period'] == '2024'
    assert annual_res[1]['period'] == '2025'
    assert annual_res[1]['sales'] == 1500000.0
    assert annual_res[1]['salesGrowth'] == 50.0
    assert annual_res[1]['netIncomeGrowth'] == 50.0
    assert annual_res[1]['epsGrowth'] == 50.0


def test_extract_multi_period_quarterly():
    q1 = datetime(2025, 3, 31)
    q2 = datetime(2025, 6, 30)
    df = pd.DataFrame(
        {
            q1: [200000.0, 50000.0, 1.0],
            q2: [250000.0, 75000.0, 1.5]
        },
        index=['Total Revenue', 'Net Income', 'Diluted EPS']
    )

    q_res = _extract_multi_period_financials(df, is_quarterly=True)
    assert len(q_res) == 2
    assert q_res[0]['period'] == '25-Q1'
    assert q_res[1]['period'] == '25-Q2'
    assert q_res[1]['salesGrowth'] == 25.0
    assert q_res[1]['netIncomeGrowth'] == 50.0
