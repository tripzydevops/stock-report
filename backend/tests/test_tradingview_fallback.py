"""
Unit and Integration Tests for TradingView BIST Pricing Fallback
Verifies that delayed Turkish stock pricing functions independently of Yahoo Finance.
"""
import pytest
import pandas as pd
from app.services.data_fetcher import fetch_bist_prices_tradingview, fetch_bist_prices

def test_tradingview_scanner_direct_fetch():
    """Verify TradingView Turkey Scanner API returns real OHLCV data for BIST stocks."""
    symbols = ["THYAO", "GARAN", "TRALT"]
    results = fetch_bist_prices_tradingview(symbols)
    
    assert len(results) > 0
    for sym in ["THYAO", "GARAN", "TRALT"]:
        assert sym in results, f"Expected {sym} in TradingView results"
        df = results[sym]
        assert isinstance(df, pd.DataFrame)
        assert not df.empty
        assert "close" in df.columns
        assert "open" in df.columns
        assert "high" in df.columns
        assert "low" in df.columns
        assert "volume" in df.columns
        
        last = df.iloc[-1]
        assert float(last["close"]) > 0
        assert float(last["high"]) >= float(last["low"])
        assert int(last["volume"]) >= 0

def test_tradingview_scanner_handles_empty_and_unknown():
    """Verify graceful handling for empty inputs and unknown tickers."""
    res_empty = fetch_bist_prices_tradingview([])
    assert res_empty == {}
    
    res_unknown = fetch_bist_prices_tradingview(["NONEXISTENT_TICKER_XYZ999"])
    assert res_unknown == {}

def test_fetch_bist_prices_with_tradingview_failover(monkeypatch):
    """Verify that fetch_bist_prices automatically fails over to TradingView when yfinance yields no data."""
    # Force yfinance to return an empty DataFrame to simulate a Yahoo Finance outage
    import yfinance as yf
    def mock_download(*args, **kwargs):
        return pd.DataFrame()
    monkeypatch.setattr(yf, "download", mock_download)
    
    symbols = ["THYAO", "TRALT"]
    results = fetch_bist_prices(symbols)
    
    # Even though yfinance was completely mocked to fail, TradingView recovered the prices
    assert len(results) >= 2
    assert "THYAO" in results or "THYAO.IS" in results
    assert "TRALT" in results or "TRALT.IS" in results
