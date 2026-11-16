import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

backend_dir = Path(__file__).resolve().parent.parent
scripts_dir = backend_dir / "scripts"
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import sync_bist_intraday
from sync_bist_intraday import fetch_tradingview_bist_batch, main


def test_fetch_tradingview_bist_batch_success():
    fake_tv_response = {
        "data": [
            {
                "s": "BIST:THYAO",
                "d": [310.5, 308.0, 314.0, 306.0, 15000000, 2.1, 6.3]
            },
            {
                "s": "BIST:ASELS",
                "d": [64.2, 64.0, 65.0, 63.5, 8000000, -0.5, -0.3]
            }
        ]
    }
    with patch("httpx.Client.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = fake_tv_response
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        quotes = fetch_tradingview_bist_batch(["THYAO.IS", "ASELS.IS"])
        assert len(quotes) == 2
        assert "THYAO.IS" in quotes
        assert quotes["THYAO.IS"]["close"] == 310.5
        assert quotes["THYAO.IS"]["open"] == 308.0
        assert quotes["THYAO.IS"]["change_pct"] == 2.1


def test_fetch_tradingview_bist_batch_raises_when_zero_quotes():
    fake_tv_response = {"data": []}
    with patch("httpx.Client.post") as mock_post, patch("time.sleep"):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = fake_tv_response
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        with pytest.raises(RuntimeError, match="zero data"):
            fetch_tradingview_bist_batch(["THYAO.IS"], max_retries=2)


def test_main_exits_nonzero_on_price_persistence_failure():
    with patch("sync_bist_intraday.get_supabase_client") as mock_client, \
         patch("sync_bist_intraday.fetch_tradingview_bist_batch") as mock_fetch, \
         patch("sync_bist_intraday.fetch_tradingview_usdtry", return_value=50.0), \
         patch("sync_bist_intraday.upsert_rows") as mock_upsert:

        # Mock assets return
        mock_client.return_value.table.return_value.select.return_value.execute.return_value.data = [
            {"id": "asset-1", "symbol": "THYAO.IS", "market": "BIST", "name": "THY"}
        ]
        # Mock quotes return
        mock_fetch.return_value = {
            "THYAO.IS": {
                "symbol": "THYAO.IS",
                "ticker": "THYAO",
                "close": 310.0,
                "open": 308.0,
                "high": 312.0,
                "low": 305.0,
                "volume": 1000000,
                "session_date": "2026-11-16",
                "prev_close": 306.0
            }
        }

        # Simulate upsert_rows failure on price_history
        def fail_on_price_history(table, chunk, on_conflict):
            if table == "price_history":
                raise Exception("Database connection lost")
            return {}

        mock_upsert.side_effect = fail_on_price_history

        with pytest.raises(SystemExit) as exc_info:
            main()

        assert exc_info.value.code == 1
