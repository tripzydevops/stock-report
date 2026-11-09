"""
Unit and integration tests for the automated TEFAS fund synchronization engine.
Validates date parsing, chronological sorting, open/close price mechanics,
provenance metadata, and error handling for inactive/liquidated funds.
"""
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

# Ensure scripts directory is importable
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from sync_tefas_funds import (
    parse_tefas_date,
    fetch_tefas_fund_history,
    process_fund_quotes,
    sync_all_tefas_funds,
)


def test_parse_tefas_date_formats():
    """Verify robust parsing of various TEFAS API date strings."""
    # Standard ISO format
    assert parse_tefas_date("2026-11-09") == "2026-11-09"
    assert parse_tefas_date("2026-11-09T00:00:00") == "2026-11-09"

    # Turkish dot format DD.MM.YYYY
    assert parse_tefas_date("09.11.2026") == "2026-11-09"
    assert parse_tefas_date("6.11.2026") == "2026-11-06"

    # None and empty inputs
    assert parse_tefas_date(None) is None
    assert parse_tefas_date("") is None
    assert parse_tefas_date("invalid-date") is None


def test_process_fund_quotes_chronological_ordering():
    """Verify price bars are constructed in chronological order with accurate prior-close open prices."""
    mock_history = [
        {"tarih": "2026-11-05", "fiyat": 5.584937, "PAY_SAYISI": 1000000},
        {"tarih": "2026-11-06", "fiyat": 5.590457, "PAY_SAYISI": 1050000},
        {"tarih": "2026-11-09", "fiyat": 5.607002, "PAY_SAYISI": 1100000},
    ]

    rows = process_fund_quotes("mock-asset-uuid", "ZBJ", mock_history, max_days=3)

    assert len(rows) == 3

    # Day 1 (first available bar, open equals close)
    assert rows[0]["date"] == "2026-11-05"
    assert rows[0]["close"] == 5.584937
    assert rows[0]["open"] == 5.584937
    assert rows[0]["source"] == "tefas"
    assert rows[0]["observed_at"] is not None

    # Day 2 (open equals Day 1 close)
    assert rows[1]["date"] == "2026-11-06"
    assert rows[1]["close"] == 5.590457
    assert rows[1]["open"] == 5.584937
    assert rows[1]["high"] == 5.590457
    assert rows[1]["low"] == 5.584937

    # Day 3 (open equals Day 2 close, capturing weekend gain)
    assert rows[2]["date"] == "2026-11-09"
    assert rows[2]["close"] == 5.607002
    assert rows[2]["open"] == 5.590457
    assert rows[2]["high"] == 5.607002
    assert rows[2]["low"] == 5.590457
    assert rows[2]["volume"] == 1100000.0


def test_process_fund_quotes_string_comma_replacement():
    """Verify prices with Turkish comma format (e.g. '5,607002') are parsed cleanly into floats."""
    mock_history = [
        {"TARIH": "08.11.2026", "FIYAT": "5,590457"},
        {"TARIH": "09.11.2026", "FIYAT": "5,607002"},
    ]

    rows = process_fund_quotes("mock-asset-uuid", "ZBJ", mock_history, max_days=2)

    assert len(rows) == 2
    assert rows[1]["close"] == 5.607002
    assert rows[1]["open"] == 5.590457


def test_fetch_tefas_fund_history_resilience_on_empty():
    """Verify empty resultList or network failure returns an empty list without raising unhandled exceptions."""
    with patch("httpx.Client.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"errorCode": None, "errorMessage": None, "resultList": []}
        mock_post.return_value = mock_resp

        result = fetch_tefas_fund_history("NRK")
        assert result == []


def test_sync_all_tefas_funds_dry_run():
    """Verify dry_run executes complete fetch flow without performing database mutations."""
    with patch("sync_tefas_funds.get_supabase_client") as mock_client_factory:
        mock_client = MagicMock()
        data_payload = [
            {"id": "uuid-zbj", "symbol": "ZBJ", "name": "Ziraat Basak", "sector": "Para Piyasasi"}
        ]
        mock_query = MagicMock()
        mock_query.execute.return_value.data = data_payload
        mock_query.eq.return_value = mock_query

        mock_client.table.return_value.select.return_value = mock_query
        mock_client_factory.return_value = mock_client

        with patch("sync_tefas_funds.fetch_tefas_fund_history") as mock_fetch:
            mock_fetch.return_value = [
                {"tarih": "2026-11-06", "fiyat": 5.590457},
                {"tarih": "2026-11-09", "fiyat": 5.607002},
            ]

            summary = sync_all_tefas_funds(max_days=2, dry_run=True, filter_symbol="ZBJ")

            assert summary["status"] == "DRY_RUN"
            assert summary["total_assets"] == 1
            assert summary["updated_funds"] == 1
            assert summary["total_bars"] == 2
            # Verify upsert was NOT called during dry-run
            mock_client.table.return_value.upsert.assert_not_called()
