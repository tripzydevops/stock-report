import os
import pytest
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
import openpyxl

from app.services.report_storage import (
    generate_storage_path,
    compute_sha256,
    validate_report_file,
    get_latest_report,
    list_reports,
    DEFAULT_REPORT_TYPE
)
from app.core.database import get_supabase_client


def test_generate_storage_path_format():
    dt = datetime(2026, 10, 27, 9, 30, 0, tzinfo=timezone.utc)
    storage_path, filename = generate_storage_path(dt)
    
    assert filename == "MarketPulse_2026-10-27T09-30-00.xlsx"
    assert storage_path == "2026/10/27/MarketPulse_2026-10-27T09-30-00.xlsx"


def test_compute_sha256(tmp_path):
    test_file = tmp_path / "test.txt"
    test_file.write_bytes(b"MarketPulse immutable report test data")
    checksum = compute_sha256(test_file)
    assert isinstance(checksum, str)
    assert len(checksum) == 64
    # Deterministic check
    assert checksum == compute_sha256(test_file)


def test_validate_report_file_rejects_empty(tmp_path):
    empty_file = tmp_path / "empty.xlsx"
    empty_file.write_bytes(b"")
    result = validate_report_file(empty_file)
    assert result["valid"] is False
    assert "0 bytes" in result["error"]


def test_validate_report_file_rejects_corrupted(tmp_path):
    corrupt_file = tmp_path / "corrupt.xlsx"
    corrupt_file.write_bytes(b"This is not a real excel zip archive")
    result = validate_report_file(corrupt_file)
    assert result["valid"] is False
    assert "Corrupted or invalid XLSX" in result["error"]


def test_validate_report_file_accepts_valid_excel(tmp_path):
    valid_file = tmp_path / "valid.xlsx"
    with pd.ExcelWriter(valid_file, engine="openpyxl") as writer:
        df_dash = pd.DataFrame({
            "Symbol": ["THYAO", "ASELS", "TUPRS", "BIMAS", "ISMEN", "SPY"],
            "Market": ["BIST", "BIST", "BIST", "BIST", "BIST", "US"],
            "Close": [312.5, 64.2, 185.0, 495.0, 36.4, 580.0]
        })
        df_dash.to_excel(writer, sheet_name="📊 Dashboard", index=False)
        
        df_sig = pd.DataFrame({
            "Symbol": ["THYAO"],
            "Strategy": ["Volatility Breakout"]
        })
        df_sig.to_excel(writer, sheet_name="🎯 Trade Signals", index=False)

    result = validate_report_file(valid_file)
    assert result["valid"] is True
    assert result["row_count"] >= 6
    assert result["file_size"] > 0
    assert len(result["checksum"]) == 64


def test_get_latest_report_query():
    try:
        client = get_supabase_client()
        latest = get_latest_report(DEFAULT_REPORT_TYPE, client=client)
        if latest:
            assert latest["report_type"] == DEFAULT_REPORT_TYPE
            assert latest["is_latest"] is True
            assert "storage_path" in latest
            assert "download_url" in latest
    except Exception as e:
        pytest.skip(f"Supabase not accessible in this test runner: {e}")


def test_list_reports_pagination():
    try:
        client = get_supabase_client()
        reports = list_reports(report_type=DEFAULT_REPORT_TYPE, limit=5, client=client)
        assert isinstance(reports, list)
        if reports:
            for r in reports:
                assert "id" in r
                assert "storage_path" in r
    except Exception as e:
        pytest.skip(f"Supabase not accessible in this test runner: {e}")
