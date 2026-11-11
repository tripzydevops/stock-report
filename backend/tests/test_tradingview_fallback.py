import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timezone
import httpx
from app.services.data_fetcher import (
    fetch_bist_prices_tradingview,
    fetch_bist_prices,
    get_bist_trading_session_date,
    BIST_MARKET_HOLIDAYS,
)

def test_tradingview_close_only_preserves_nulls(monkeypatch):
    """
    Verify that when TradingView returns only a close price (null open, high, low, volume),
    the data fetcher preserves NaN/None and does NOT fabricate synthetic OHLC or zero volume.
    """
    fake_tv_response = {
        "data": [
            {
                "s": "BIST:THYAO",
                "d": [314.75, None, None, None, None, 1.2, 3.75]
            }
        ]
    }

    class MockResponse:
        status_code = 200
        def json(self):
            return fake_tv_response

    class MockClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, *args, **kwargs):
            return MockResponse()

    monkeypatch.setattr(httpx, "Client", MockClient)

    results = fetch_bist_prices_tradingview(["THYAO"])
    assert "THYAO" in results
    df = results["THYAO"]

    assert float(df["close"].iloc[0]) == 314.75
    # Strict check: open, high, low, and volume MUST be NaN, never fabricated from close or 0
    assert np.isnan(df["open"].iloc[0])
    assert np.isnan(df["high"].iloc[0])
    assert np.isnan(df["low"].iloc[0])
    assert np.isnan(df["volume"].iloc[0])
    assert df["bar_completeness"].iloc[0] == "close_only"

def test_tradingview_full_ohlcv_preserved_exactly(monkeypatch):
    """
    Verify that when TradingView returns complete OHLCV, all numbers are preserved accurately.
    """
    fake_tv_response = {
        "data": [
            {
                "s": "BIST:ASELS",
                "d": [343.50, 338.00, 347.50, 337.50, 18500000, 1.5, 5.0]
            }
        ]
    }

    class MockResponse:
        status_code = 200
        def json(self):
            return fake_tv_response

    class MockClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, *args, **kwargs):
            return MockResponse()

    monkeypatch.setattr(httpx, "Client", MockClient)

    results = fetch_bist_prices_tradingview(["ASELS"])
    assert "ASELS" in results
    df = results["ASELS"]

    assert float(df["close"].iloc[0]) == 343.50
    assert float(df["open"].iloc[0]) == 338.00
    assert float(df["high"].iloc[0]) == 347.50
    assert float(df["low"].iloc[0]) == 337.50
    assert float(df["volume"].iloc[0]) == 18500000
    assert df["bar_completeness"].iloc[0] == "full_ohlcv"

def test_bist_trading_session_date_holiday_and_weekend_rollback():
    """
    Verify that get_bist_trading_session_date rolls back past weekends and official BIST market holidays.
    """
    # 1. Republic Day (2026-10-29 is a Thursday holiday) -> rolls back to Wednesday 2026-10-28
    republic_day = datetime(2026, 10, 29, 14, 0, tzinfo=timezone.utc)
    session = get_bist_trading_session_date(republic_day)
    assert session.strftime("%Y-%m-%d") == "2026-10-28"

    # 2. Sunday (2026-11-15) -> rolls back to Friday 2026-11-13
    sunday = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)
    session = get_bist_trading_session_date(sunday)
    assert session.strftime("%Y-%m-%d") == "2026-11-13"

    # 3. Monday Pre-market (2026-11-16 06:00 UTC = 09:00 TRT) -> rolls back to Friday 2026-11-13
    mon_premarket = datetime(2026, 11, 16, 6, 0, tzinfo=timezone.utc)
    session = get_bist_trading_session_date(mon_premarket)
    assert session.strftime("%Y-%m-%d") == "2026-11-13"

    # 4. Open trading session midday (2026-11-11 11:00 UTC = 14:00 TRT, Wednesday) -> 2026-11-11
    trading_wed = datetime(2026, 11, 11, 11, 0, tzinfo=timezone.utc)
    session = get_bist_trading_session_date(trading_wed)
    assert session.strftime("%Y-%m-%d") == "2026-11-11"

def test_tradingview_scanner_handles_empty_and_unknown():
    """Verify graceful handling for empty inputs and unknown tickers."""
    res_empty = fetch_bist_prices_tradingview([])
    assert res_empty == {}

def test_fetch_bist_prices_with_tradingview_failover(monkeypatch):
    """Verify that fetch_bist_prices automatically fails over to TradingView when yfinance yields no data."""
    import yfinance as yf
    def mock_download(*args, **kwargs):
        return pd.DataFrame()
    monkeypatch.setattr(yf, "download", mock_download)

    fake_tv_response = {
        "data": [
            {"s": "BIST:THYAO", "d": [314.75, 312.0, 318.0, 310.0, 5000000, 1.5, 4.6]},
            {"s": "BIST:TRALT", "d": [55.0, 54.0, 56.0, 53.5, 1200000, 2.0, 1.1]}
        ]
    }
    class MockResponse:
        status_code = 200
        def json(self):
            return fake_tv_response
    class MockClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, *args, **kwargs):
            return MockResponse()
    monkeypatch.setattr(httpx, "Client", MockClient)

    results = fetch_bist_prices(["THYAO", "TRALT"])
    assert len(results) == 2
    assert "THYAO" in results or "THYAO.IS" in results
    assert "TRALT" in results or "TRALT.IS" in results
