import sys
from pathlib import Path

# Ensure root repo directory and backend are on sys.path
root_dir = str(Path(__file__).resolve().parent.parent.parent)
backend_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, date
import pandas as pd
import openpyxl

from app.services.report_storage import (
    upload_report_to_storage,
    compute_sha256,
    generate_storage_path,
)
import sync_to_supabase
from sync_to_supabase import sync_all_to_supabase


@pytest.fixture
def sample_excel_file(tmp_path):
    """Creates a minimal valid Excel report workbook for sync testing."""
    file_path = tmp_path / "MarketPulse_TestReport.xlsx"
    with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
        # 1. Dashboard
        pd.DataFrame({
            "Symbol": ["THYAO", "ASELS", "AAPL"],
            "Market": ["BIST", "BIST", "US"],
            "Date": [str(date.today()), str(date.today()), str(date.today())],
            "Close": [312.5, 64.2, 230.0],
            "Price": [312.5, 64.2, 230.0],
            "Change %": [2.1, -0.5, 1.2],
            "Open": [308.0, 64.0, 228.0],
            "High": [314.0, 65.0, 232.0],
            "Low": [306.0, 63.5, 227.0],
            "Volume": [15000000, 8000000, 45000000],
            "RSI (14)": [58.5, 45.0, 62.0],
            "EMA 20": [305.0, 63.0, 225.0],
            "EMA 50": [295.0, 61.5, 220.0],
            "EMA 200": [280.0, 58.0, 205.0],
            "Signal": ["Bullish Breakout", "Neutral", "Momentum"],
        }).to_excel(writer, sheet_name="📊 Dashboard", index=False)

        # 2. Price History
        pd.DataFrame({
            "Date": [str(date.today()), str(date.today())],
            "Symbol": ["THYAO", "AAPL"],
            "Open": [308.0, 228.0],
            "High": [314.0, 232.0],
            "Low": [306.0, 227.0],
            "Close": [312.5, 230.0],
            "Adj Close": [312.5, 230.0],
            "Volume": [15000000, 45000000],
        }).to_excel(writer, sheet_name="📅 Price History", index=False)

        # 3. Trade Signals
        pd.DataFrame({
            "Signal Date": [str(date.today())],
            "Symbol": ["THYAO"],
            "Strategy": ["Momentum Breakout"],
            "Entry Price": [312.5],
            "Stop Loss": [298.0],
            "Target": [345.0],
            "R:R Ratio": [2.24],
        }).to_excel(writer, sheet_name="🎯 Trade Signals", index=False)

        # 4. Opening Direction
        pd.DataFrame({
            "Date": [str(date.today())],
            "Symbol": ["THYAO"],
            "Market": ["BIST"],
            "Prev Close": [306.0],
            "Open Price": [308.0],
            "Current Price": [312.5],
            "Gap %": [0.65],
            "Gap Type": ["Gap Up"],
            "ORB Status": ["Confirmed Breakout"],
            "Bias": ["Bullish"],
            "Volume Spike": [True],
            "Recommended Action": ["Buy pullback to open"],
        }).to_excel(writer, sheet_name="🔔 Opening Direction", index=False)

        # 5. Market Regime
        pd.DataFrame({
            "Market": ["BIST", "US"],
            "Regime": ["Bullish Trend", "Bullish Trend"],
            "Close": [9200.0, 5800.0],
            "EMA 50": [9000.0, 5600.0],
            "EMA 200": [8600.0, 5300.0],
            "Notes": ["Above key moving averages", "Healthy trend"],
        }).to_excel(writer, sheet_name="🚦 Market Regime", index=False)

        # 6. USD-TRY Rate
        pd.DataFrame({
            "Date": [str(date.today())],
            "Close": [34.25],
        }).to_excel(writer, sheet_name="💱 USD-TRY Rate", index=False)

    return file_path


def test_sync_unregistered_report_raises_value_error(sample_excel_file, monkeypatch):
    """Sync must refuse unregistered reports when checksum is not found in report_files."""
    mock_client = MagicMock()
    # Mock assets lookup
    mock_client.table("assets").select("id, symbol").execute.return_value.data = [
        {"id": "uuid-thyao", "symbol": "THYAO"},
        {"id": "uuid-aapl", "symbol": "AAPL"},
    ]
    # Mock report_files returning empty (unregistered)
    mock_report_query = MagicMock()
    mock_report_query.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    mock_client.table.side_effect = lambda t: mock_report_query if t == "report_files" else MagicMock()

    monkeypatch.setattr(sync_to_supabase, "get_supabase_client", lambda: mock_client)

    with pytest.raises(ValueError, match="Refusing to sync unregistered report"):
        sync_all_to_supabase(excel_path=sample_excel_file, report_record=None)


def test_sync_all_to_supabase_mocked_success(sample_excel_file, monkeypatch):
    """End-to-end sync must succeed with upsert semantics, no deletions, and preserved held stocks."""
    mock_client = MagicMock()

    # Assets table mock
    mock_assets = MagicMock()
    mock_assets.select.return_value.execute.return_value.data = [
        {"id": "uuid-thyao", "symbol": "THYAO"},
        {"id": "uuid-asels", "symbol": "ASELS"},
        {"id": "uuid-aapl", "symbol": "AAPL"},
    ]

    # Portfolio positions table mock (THYAO is held in portfolio)
    mock_portfolio = MagicMock()
    mock_portfolio.select.return_value.eq.return_value.gt.return_value.execute.return_value.data = [
        {"asset_id": "uuid-thyao", "quantity": 100, "is_open": True}
    ]
    mock_portfolio.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "pos-1"}
    ]

    # Trade signals mock (existing open trade)
    mock_signals = MagicMock()
    mock_signals.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "id": "sig-1",
            "asset_id": "uuid-thyao",
            "strategy": "momentum_breakout",
            "status": "open",
            "ai_rationale": "Prior trigger",
            "entry_price": 310.0,
            "stop_loss": 298.0,
            "target_1": 345.0,
        }
    ]

    # Generic mock for other tables
    mock_generic = MagicMock()
    mock_generic.select.return_value.execute.return_value.data = []
    mock_generic.upsert.return_value.execute.return_value.data = [{"status": "ok"}]
    mock_generic.insert.return_value.execute.return_value.data = [{"status": "ok"}]
    mock_generic.update.return_value.eq.return_value.execute.return_value.data = [{"status": "ok"}]

    def table_router(table_name):
        if table_name == "assets":
            return mock_assets
        elif table_name == "portfolio_positions":
            return mock_portfolio
        elif table_name == "trade_signals":
            return mock_signals
        return mock_generic

    mock_client.table.side_effect = table_router
    monkeypatch.setattr(sync_to_supabase, "get_supabase_client", lambda: mock_client)

    dummy_report = {
        "id": "report-uuid-1234",
        "storage_path": "2026/10/28/MarketPulse_2026-10-28T12-00-00-000.xlsx",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checksum_sha256": compute_sha256(sample_excel_file),
    }

    results = sync_all_to_supabase(excel_path=sample_excel_file, report_record=dummy_report)

    assert "trade_signals" in results
    assert results["trade_signals"]["status"] == "SUCCESS"
    assert results["trade_signals"]["reconfirmed"] >= 1  # THYAO was reconfirmed
    assert "price_history" in results
    assert results["price_history"]["status"] == "SUCCESS"


def test_sync_critical_error_triggers_runtime_error(sample_excel_file, monkeypatch):
    """A fatal error in a critical section must raise RuntimeError to exit non-zero in CI/cron."""
    mock_client = MagicMock()

    mock_assets = MagicMock()
    mock_assets.select.return_value.execute.return_value.data = [
        {"id": "uuid-thyao", "symbol": "THYAO"}
    ]

    mock_failing_table = MagicMock()
    mock_failing_table.upsert.side_effect = Exception("Fatal database connection timeout")

    def table_router(table_name):
        if table_name == "assets":
            return mock_assets
        elif table_name == "price_history":
            return mock_failing_table
        return MagicMock()

    mock_client.table.side_effect = table_router
    monkeypatch.setattr(sync_to_supabase, "get_supabase_client", lambda: mock_client)

    dummy_report = {
        "id": "report-uuid-1234",
        "storage_path": "2026/10/28/MarketPulse_2026-10-28T12-00-00-000.xlsx",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    with pytest.raises(RuntimeError, match="Supabase synchronization failed with 1 critical errors"):
        sync_all_to_supabase(excel_path=sample_excel_file, report_record=dummy_report)


def test_upload_report_to_storage_mocked_contract(sample_excel_file, monkeypatch):
    """upload_report_to_storage must upload with upsert=False and register immutable report_files row."""
    mock_client = MagicMock()

    # Mock storage bucket
    mock_storage_bucket = MagicMock()
    mock_client.storage.from_.return_value = mock_storage_bucket

    # Mock report_files table
    mock_report_files = MagicMock()
    mock_insert_res = MagicMock()
    mock_insert_res.data = [{
        "id": "new-report-uuid",
        "storage_path": "2026/10/28/MarketPulse_TestReport.xlsx",
        "checksum_sha256": compute_sha256(sample_excel_file),
        "is_latest": True,
    }]
    mock_report_files.insert.return_value.execute.return_value = mock_insert_res
    mock_client.table.return_value = mock_report_files

    result = upload_report_to_storage(
        file_path=sample_excel_file,
        client=mock_client,
        dt=datetime(2026, 10, 28, 12, 0, 0, tzinfo=timezone.utc),
    )

    assert result["id"] == "new-report-uuid"
    assert result["is_latest"] is True
    # Verify immutable upload call (file_options must specify upsert=false)
    mock_storage_bucket.upload.assert_called_once()
    _, kwargs = mock_storage_bucket.upload.call_args
    assert kwargs.get("file_options", {}).get("upsert") == "false"
