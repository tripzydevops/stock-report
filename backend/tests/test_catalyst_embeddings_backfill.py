import pytest
import time
from unittest.mock import MagicMock
from scripts.backfill_catalyst_embeddings import (
    generate_embedding,
    run_embedding_backfill
)


def test_generate_embedding_empty_text():
    """Verify empty text or missing API key returns None immediately."""
    assert generate_embedding("", "fake-key") is None
    assert generate_embedding("hello", "") is None
    assert generate_embedding("   ", "fake-key") is None


def test_generate_embedding_mock_success():
    """Verify successful 384-dimensional response parsing."""
    mock_values = [0.05] * 384
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"embedding": {"values": mock_values}}

    mock_client = MagicMock()
    mock_client.post.return_value = mock_resp

    res = generate_embedding("THYAO: Record Q3 Revenue Growth", "valid-key", client=mock_client)
    assert res is not None
    assert len(res) == 384
    assert res[0] == 0.05


def test_run_embedding_backfill_successful_batch():
    """Verify standard happy-path batch processing and DB update."""
    mock_records = [
        {"id": "cat-1", "symbol": "THYAO", "title": "Fleet expansion", "details": "Purchased 10 A350s", "ai_takeaway": "Bullish"},
        {"id": "cat-2", "symbol": "ASELS", "title": "Radar contract", "details": "Signed defense deal", "ai_takeaway": "Revenue catalyst"},
    ]

    mock_client = MagicMock()
    # 1st query returns 2 records, 2nd query returns empty to break loop
    mock_table = MagicMock()
    mock_select = MagicMock()
    mock_is = MagicMock()
    mock_range = MagicMock()
    
    mock_exec_1 = MagicMock()
    mock_exec_1.data = mock_records
    mock_exec_2 = MagicMock()
    mock_exec_2.data = []

    mock_range.execute.side_effect = [mock_exec_1, mock_exec_2]
    mock_is.range.return_value = mock_range
    mock_select.is_.return_value = mock_is
    mock_table.select.return_value = mock_select
    mock_client.table.return_value = mock_table

    mock_embed = lambda txt: [0.1] * 384

    report = run_embedding_backfill(
        client=mock_client,
        api_key="mock-api-key",
        batch_size=10,
        embed_fn=mock_embed
    )

    assert report["status"] == "success"
    assert report["total_embedded"] == 2
    assert report["quarantined_count"] == 0
    assert mock_table.update.call_count == 2


def test_run_embedding_backfill_quarantines_poison_row():
    """
    CRITICAL: Verify that when a corrupt row fails embedding repeatedly,
    it is quarantined after max_retries and does NOT loop infinitely.
    """
    # Cat-1 persistently fails embedding generation (returns None)
    mock_records = [
        {"id": "cat-poison", "symbol": "FAIL", "title": "Corrupt row", "details": "", "ai_takeaway": ""},
    ]

    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_select = MagicMock()
    mock_is = MagicMock()
    mock_range = MagicMock()

    mock_exec = MagicMock()
    mock_exec.data = mock_records

    # Even if DB always returns this poison record when queried
    mock_range.execute.return_value = mock_exec
    mock_is.range.return_value = mock_range
    mock_select.is_.return_value = mock_is
    mock_table.select.return_value = mock_select
    mock_client.table.return_value = mock_table

    mock_embed = lambda txt: None  # Always fails

    # Run with max_retries=2, max_consecutive_empty=2
    report = run_embedding_backfill(
        client=mock_client,
        api_key="mock-api-key",
        batch_size=5,
        max_retries=2,
        max_consecutive_empty=2,
        max_runtime_seconds=10,
        embed_fn=mock_embed
    )

    assert report["status"] == "success"
    assert report["total_embedded"] == 0
    assert report["quarantined_count"] == 1
    assert report["quarantined"][0]["id"] == "cat-poison"
    assert report["quarantined"][0]["symbol"] == "FAIL"


def test_run_embedding_backfill_runtime_guard():
    """Verify script halts cleanly when max_runtime_seconds expires."""
    mock_records = [
        {"id": "cat-slow", "symbol": "SLOW", "title": "Slow op", "details": "", "ai_takeaway": ""},
    ]

    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_select = MagicMock()
    mock_is = MagicMock()
    mock_range = MagicMock()

    mock_exec = MagicMock()
    mock_exec.data = mock_records
    mock_range.execute.return_value = mock_exec
    mock_is.range.return_value = mock_range
    mock_select.is_.return_value = mock_is
    mock_table.select.return_value = mock_select
    mock_client.table.return_value = mock_table

    def slow_embed(txt):
        time.sleep(0.15)
        return [0.2] * 384

    # Max runtime of 0.2s will trigger timeout after 1-2 records
    report = run_embedding_backfill(
        client=mock_client,
        api_key="mock-api-key",
        batch_size=1,
        max_runtime_seconds=0.2,
        embed_fn=slow_embed
    )

    assert report["status"] == "success"
    assert report["duration_seconds"] >= 0.15
