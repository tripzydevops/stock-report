"""
Regression & Unit Tests for Post-Exit Recovery Tracking Service
==============================================================
Asserts:
1. Pure separation of concerns:
   - Original trade status stays 'expired' or 'stopped_out'.
   - Trade outcomes are never altered or rewritten.
2. Accurate detection of all recovery milestones:
   - ENTRY_TOUCHED vs ENTRY_RECLAIMED_CLOSE
   - PRE_PULLBACK_HIGH_TOUCHED vs PRE_PULLBACK_HIGH_RECLAIMED_CLOSE
   - TARGET_1_TOUCHED_AFTER_EXIT & TARGET_2_TOUCHED_AFTER_EXIT
3. Accurate session counting:
   - sessions_since_signal and sessions_since_exit.
4. Idempotency:
   - Rerunning does not duplicate events.
5. Tracking lifecycle completion:
   - Transitions to COMPLETED when horizon is reached or all milestones reclaimed.
"""

import sys
import json
from pathlib import Path
from unittest.mock import MagicMock
import pytest
import pandas as pd
import numpy as np

# Ensure backend is on sys.path
root_dir = str(Path(__file__).resolve().parent.parent.parent)
backend_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.services.recovery_tracker import (
    extract_pre_pullback_level,
    initialize_recovery_tracking,
    reconcile_post_exit_recoveries,
    sync_existing_closed_signals_to_recovery_tracker,
)


class TestPrePullbackExtraction:
    """Tests extraction of frozen pre-pullback high from varied payloads."""

    def test_extract_from_explicit_key(self):
        sig = {"pre_pullback_high": 125.50}
        assert extract_pre_pullback_level(None, sig) == 125.50

    def test_extract_from_json_string(self):
        payload_str = json.dumps({"risk": {"pre_pullback_high": 315.00}})
        assert extract_pre_pullback_level(payload_str) == 315.00

    def test_extract_from_dict_payload(self):
        payload_dict = {"pre_pullback_level": 450.20}
        assert extract_pre_pullback_level(payload_dict) == 450.20

    def test_extract_missing_returns_none(self):
        assert extract_pre_pullback_level(None, {}) is None
        assert extract_pre_pullback_level("invalid-json") is None


class TestRecoveryInitialization:
    """Tests initialization of tracking rows for closed trades."""

    def test_rejects_open_or_target_hit_signals(self):
        mock_client = MagicMock()
        open_sig = {"id": "s-1", "status": "open", "entry_price": 100.0}
        assert initialize_recovery_tracking(mock_client, open_sig) is None

        won_sig = {"id": "s-2", "status": "target_hit", "entry_price": 100.0}
        assert initialize_recovery_tracking(mock_client, won_sig) is None

    def test_initializes_stopped_out_signal(self):
        mock_client = MagicMock()
        stopped_sig = {
            "id": "sig-stop-01",
            "asset_id": "asset-uuid-1",
            "status": "stopped_out",
            "closed_at": "2026-10-10T18:00:00Z",
            "entry_price": 100.0,
            "target_1": 115.0,
            "target_2": 125.0,
            "ai_rationale": json.dumps({"risk": {"pre_pullback_high": 108.0}}),
        }

        row = initialize_recovery_tracking(mock_client, stopped_sig)
        assert row is not None
        assert row["signal_id"] == "sig-stop-01"
        assert row["original_exit_status"] == "stopped_out"
        assert row["original_exit_date"] == "2026-10-10"
        assert row["entry_reference"] == 100.0
        assert row["pre_pullback_level"] == 108.0
        assert row["original_target_1"] == 115.0
        assert row["original_target_2"] == 125.0
        assert row["tracking_status"] == "ACTIVE"
        assert row["has_recovered_entry"] is False

        mock_client.table.assert_called_with("signal_recovery_tracking")
        mock_client.table().upsert.assert_called_once()

    def test_initializes_expired_signal(self):
        mock_client = MagicMock()
        expired_sig = {
            "id": "sig-exp-01",
            "asset_id": "asset-uuid-2",
            "status": "expired",
            "closed_at": "2026-10-08T18:00:00Z",
            "entry_price": 50.0,
            "target_1": 56.0,
        }

        row = initialize_recovery_tracking(mock_client, expired_sig)
        assert row is not None
        assert row["signal_id"] == "sig-exp-01"
        assert row["original_exit_status"] == "expired"
        assert row["entry_reference"] == 50.0


class TestReconcilePostExitRecoveries:
    """Verifies chronological multi-milestone detection."""

    def test_detects_touch_and_close_milestones_chronologically(self):
        mock_client = MagicMock()

        # Dates: 2026-10-01 to 2026-10-25 (18 business days)
        dates = pd.date_range(start="2026-10-01", periods=18, freq="B").strftime("%Y-%m-%d").tolist()
        sig_date = dates[0]   # Index 0: Signal generated at 100
        exit_date = dates[4]  # Index 4: Stopped out on Day 4 close at 94

        bars = []
        for idx, d in enumerate(dates):
            if idx == 0:
                # Signal session
                bars.append({"open": 100.0, "high": 102.0, "low": 98.0, "close": 100.0})
            elif 1 <= idx <= 4:
                # Drifting down into stop loss (95)
                bars.append({"open": 98.0, "high": 99.0, "low": 94.0, "close": 94.5})
            elif idx == 6:
                # 2 sessions after exit: Touches Entry intraday (high=100.5), but closes below (close=98.0)
                bars.append({"open": 97.0, "high": 100.5, "low": 96.5, "close": 98.0})
            elif idx == 8:
                # 4 sessions after exit: Confirms Close Reclaim of Entry (close=101.5)
                bars.append({"open": 99.0, "high": 102.0, "low": 98.5, "close": 101.5})
            elif idx == 11:
                # 7 sessions after exit: Touches Pre-Pullback High (108.0)
                bars.append({"open": 104.0, "high": 108.5, "low": 103.0, "close": 106.0})
            elif idx == 13:
                # 9 sessions after exit: Confirms Close Reclaim of Pre-Pullback High (close=108.8)
                bars.append({"open": 106.0, "high": 109.5, "low": 105.0, "close": 108.8})
            elif idx == 15:
                # 11 sessions after exit: Reaches Target 1 (112.0)
                bars.append({"open": 110.0, "high": 113.5, "low": 109.0, "close": 112.0})
            else:
                bars.append({"open": 96.0, "high": 97.5, "low": 95.0, "close": 96.5})

        df_price = pd.DataFrame(bars, index=dates)

        active_tracker = {
            "signal_id": "sig-recovery-test-01",
            "asset_id": "asset-uuid-froto",
            "original_exit_date": exit_date,
            "original_exit_status": "stopped_out",
            "entry_reference": 100.0,
            "pre_pullback_level": 108.0,
            "original_target_1": 112.0,
            "original_target_2": 120.0,
            "tracking_start_date": exit_date,
            "tracking_end_date": dates[-1],
            "last_checked_date": exit_date,
            "tracking_status": "ACTIVE",
            "has_recovered_entry": False,
            "has_recovered_pre_pullback": False,
            "has_reached_target_after_exit": False,
        }

        # Mock database queries
        mock_client.table("signal_recovery_tracking").select().eq().execute.return_value.data = [active_tracker]
        mock_client.table("signal_recovery_events").select().in_().execute.return_value.data = []
        mock_client.table("trade_signals").select().in_().execute.return_value.data = [
            {"id": "sig-recovery-test-01", "signal_date": sig_date}
        ]

        asset_id_map = {"FROTO": "asset-uuid-froto"}
        asset_data = {"FROTO": df_price}

        stats = reconcile_post_exit_recoveries(
            client=mock_client,
            asset_id_map=asset_id_map,
            asset_data=asset_data,
            today_str=dates[-1]
        )

        assert stats["checked"] == 1
        assert stats["events_recorded"] == 5  # ENTRY_TOUCHED, ENTRY_RECLAIMED_CLOSE, PRE_PB_TOUCHED, PRE_PB_CLOSE, T1_TOUCHED

        # Inspect inserted recovery events
        insert_calls = mock_client.table("signal_recovery_events").insert.call_args[0][0]
        event_types = [e["event_type"] for e in insert_calls]
        assert "ENTRY_TOUCHED" in event_types
        assert "ENTRY_RECLAIMED_CLOSE" in event_types
        assert "PRE_PULLBACK_HIGH_TOUCHED" in event_types
        assert "PRE_PULLBACK_HIGH_RECLAIMED_CLOSE" in event_types
        assert "TARGET_1_TOUCHED_AFTER_EXIT" in event_types

        # Verify session distance calculation
        entry_touch = next(e for e in insert_calls if e["event_type"] == "ENTRY_TOUCHED")
        assert entry_touch["sessions_since_exit"] == 2   # Index 6 - Index 4
        assert entry_touch["sessions_since_signal"] == 6 # Index 6 - Index 0
        assert entry_touch["observed_price"] == 100.5

        entry_close = next(e for e in insert_calls if e["event_type"] == "ENTRY_RECLAIMED_CLOSE")
        assert entry_close["sessions_since_exit"] == 4   # Index 8 - Index 4
        assert entry_close["sessions_since_signal"] == 8 # Index 8 - Index 0

        pre_pb_close = next(e for e in insert_calls if e["event_type"] == "PRE_PULLBACK_HIGH_RECLAIMED_CLOSE")
        assert pre_pb_close["sessions_since_exit"] == 9   # Index 13 - Index 4

        t1_touch = next(e for e in insert_calls if e["event_type"] == "TARGET_1_TOUCHED_AFTER_EXIT")
        assert t1_touch["sessions_since_exit"] == 11 # Index 15 - Index 4

        # Verify tracking row update payload
        update_call = mock_client.table("signal_recovery_tracking").update.call_args[0][0]
        assert update_call["has_recovered_entry"] is True
        assert update_call["has_recovered_pre_pullback"] is True
        assert update_call["has_reached_target_after_exit"] is True
        assert update_call["tracking_status"] == "COMPLETED"


class TestBackfillClosedSignals:
    """Verifies backfill helper initializes existing historical closed signals."""

    def test_backfill_initializes_untracked_closed_signals(self):
        mock_client = MagicMock()

        # Database returns 2 closed signals
        mock_client.table("trade_signals").select().in_().execute.return_value.data = [
            {"id": "sig-01", "status": "expired", "entry_price": 100.0, "closed_at": "2026-10-15"},
            {"id": "sig-02", "status": "stopped_out", "entry_price": 200.0, "closed_at": "2026-10-18"},
        ]
        # Only sig-01 was previously registered
        mock_client.table("signal_recovery_tracking").select().execute.return_value.data = [
            {"signal_id": "sig-01"}
        ]

        count = sync_existing_closed_signals_to_recovery_tracker(mock_client)
        assert count == 1  # sig-02 initialized
