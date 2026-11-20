"""
Unit tests for the Hot / Cold Tiering Parquet Archiving Engine (market_data_archive.py).
Validates Parquet compression, PyArrow serialization, predicate pushdown filtering,
and hot-tier operational window formatting.
"""

import io
from pathlib import Path
from datetime import datetime, date
from unittest.mock import MagicMock
import pandas as pd
import numpy as np
import pytest

from app.services.market_data_archive import (
    export_dataframe_to_parquet,
    query_parquet_archive,
    upsert_hot_tier_to_database,
    upload_parquet_archive_to_supabase
)


def test_export_dataframe_to_parquet_compression(tmp_path):
    """Verify that multi-row price data compresses cleanly into a valid Parquet archive."""
    dates = pd.date_range("2021-01-01", periods=100, freq="B")
    data = []
    for d in dates:
        data.append({
            "symbol": "THYAO",
            "market": "BIST",
            "date": d.strftime("%Y-%m-%d"),
            "open": 250.0,
            "high": 255.0,
            "low": 248.0,
            "close": 253.0,
            "adj_close": 253.0,
            "volume": 1500000.0,
            "source": "yahoo"
        })
    df = pd.DataFrame(data)

    target_file = tmp_path / "test_thyao.parquet"
    raw_bytes = export_dataframe_to_parquet(df, file_path=target_file)

    assert target_file.exists()
    assert len(raw_bytes) > 0
    # Parquet header magic bytes check
    assert raw_bytes[:4] == b"PAR1"
    assert len(raw_bytes) < 15000  # Should be heavily compressed under 15 KB


def test_query_parquet_archive_with_predicate_pushdown(tmp_path):
    """Verify fast projection and predicate filtering directly on Parquet files."""
    data = [
        {"symbol": "THYAO", "market": "BIST", "date": "2026-01-10", "close": 250.0, "volume": 1000},
        {"symbol": "THYAO", "market": "BIST", "date": "2026-02-15", "close": 260.0, "volume": 1200},
        {"symbol": "GARAN", "market": "BIST", "date": "2026-02-15", "close": 110.0, "volume": 3000},
        {"symbol": "AAPL", "market": "US", "date": "2026-02-15", "close": 230.0, "volume": 50000},
    ]
    df = pd.DataFrame(data)
    target_file = tmp_path / "multi_symbol.parquet"
    export_dataframe_to_parquet(df, file_path=target_file)

    # Query 1: Filter by symbol
    res_thyao = query_parquet_archive(target_file, symbol="THYAO")
    assert len(res_thyao) == 2
    assert set(res_thyao["symbol"].unique()) == {"THYAO"}

    # Query 2: Filter by symbol and date
    res_thyao_date = query_parquet_archive(target_file, symbol="THYAO", start_date="2026-02-01")
    assert len(res_thyao_date) == 1
    assert res_thyao_date.iloc[0]["close"] == 260.0

    # Query 3: Filter by US symbol
    res_aapl = query_parquet_archive(target_file, symbol="AAPL")
    assert len(res_aapl) == 1
    assert res_aapl.iloc[0]["market"] == "US"


def test_empty_dataframe_raises_value_error():
    """Verify serialization gracefully rejects empty DataFrames."""
    with pytest.raises(ValueError, match="Cannot serialize empty DataFrame"):
        export_dataframe_to_parquet(pd.DataFrame())


def test_upsert_hot_tier_to_database_formatting():
    """Verify hot tier takes strictly the latest 252 bars and batches upserts."""
    dates = pd.date_range("2025-01-01", periods=300, freq="D")
    data = []
    for d in dates:
        data.append({
            "symbol": "THYAO",
            "market": "BIST",
            "date": d,
            "open": 250.0,
            "high": 255.0,
            "low": 248.0,
            "close": 253.0,
            "adj_close": 253.0,
            "volume": 100000,
            "source": "yahoo"
        })
    df = pd.DataFrame(data)

    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_upsert = MagicMock()
    mock_client.table.return_value = mock_table
    mock_table.upsert.return_value = mock_upsert
    mock_upsert.execute.return_value = MagicMock(data=[])

    asset_id_map = {"THYAO": "uuid-thyao-123"}
    count = upsert_hot_tier_to_database(
        df,
        asset_id_map=asset_id_map,
        max_hot_bars=252,
        chunk_size=100,
        client=mock_client
    )

    # 300 rows input, but hot tier should cap at 252
    assert count == 252
    assert mock_table.upsert.call_count == 3  # 100 + 100 + 52
