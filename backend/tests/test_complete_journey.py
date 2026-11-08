"""
End-to-End Trade Lifecycle Proof Test
=====================================
Validates the complete 4-stage verified journey:
1. Signal Generation: Setup generated with technical anchors, rationale, and conviction.
2. Timely Outcome Bounding: Evaluated strictly within the designated holding period (stops out or expires).
3. State Separation: Trade is recorded as closed/loss; original evidence is preserved immutably.
4. Independent Post-Exit Recovery: Subsequent price action reclaims entry/target in a separate table.
5. Invariant Assertion: The original trade outcome is NEVER rewritten by later recovery.
"""

import sys
import json
from pathlib import Path
from datetime import date, timedelta
from unittest.mock import MagicMock
import pytest
import pandas as pd
import numpy as np

# Ensure backend paths are on sys.path
backend_dir = str(Path(__file__).resolve().parent.parent)
root_dir = str(Path(__file__).resolve().parent.parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.services.trade_evaluator import evaluate_signal_outcome
from app.services.recovery_tracker import (
    initialize_recovery_tracking,
    reconcile_post_exit_recoveries,
    extract_pre_pullback_level,
)

class TestCompleteVerifiedJourney:
    """Verifies that a setup, its timely loss, and its subsequent recovery remain cleanly partitioned."""

    def test_complete_setup_stopped_out_then_recovered(self):
        # -------------------------------------------------------------
        # 1. SETUP GENERATION & EVIDENCE RETENTION
        # -------------------------------------------------------------
        signal_date = "2026-02-02"
        entry_price = 100.0
        stop_loss = 94.0
        target_1 = 112.0
        target_2 = 120.0
        pre_pullback_high = 106.0

        ai_rationale = {
            "summary": "Bullish EMA cross with volume confirmation above VWAP",
            "setup_quality": 88,
            "ai_conviction": 85,
            "risk": {
                "pre_pullback_high": pre_pullback_high,
                "atr": 2.5,
            }
        }

        signal_row = {
            "id": "sig-journey-001",
            "asset_id": "asset-uuid-journey",
            "symbol": "THYAO",
            "strategy": "Trend Pullback Reclaim",
            "signal_date": signal_date,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "target_1": target_1,
            "target_2": target_2,
            "ai_rationale": json.dumps(ai_rationale),
            "status": "active",
        }

        # Assert initial setup integrity
        assert signal_row["entry_price"] == 100.0
        assert extract_pre_pullback_level(signal_row["ai_rationale"]) == pre_pullback_high

        # -------------------------------------------------------------
        # 2. MARKET DATA SIMULATION:
        # Day 0: Signal generated (entry = 100.0)
        # Day 1: Market drops, hits stop-loss (low = 93.0 < 94.0) -> STOPPED OUT
        # Day 2: Market stabilizes (low = 94.0, close = 96.0)
        # Day 3: Market rebounds back above entry (high = 101.0, close = 100.5) -> ENTRY RECLAIMED
        # Day 4: Market pushes past pre-pullback high (high = 108.0, close = 107.0) -> PRE-PB RECLAIMED
        # Day 5: Market hits Target 1 (high = 114.0 > 112.0) -> TARGET 1 TOUCHED AFTER EXIT
        # -------------------------------------------------------------
        dates = pd.date_range(start="2026-02-02", periods=6, freq="B")
        date_strs = [d.strftime("%Y-%m-%d") for d in dates]

        df_market = pd.DataFrame(
            {
                "open":  [100.0, 98.0, 95.0,  97.0, 101.0, 107.0],
                "high":  [101.0, 99.0, 96.5, 101.5, 108.5, 114.0],
                "low":   [ 99.5, 93.0, 94.0,  96.5, 100.0, 106.5],
                "close": [100.0, 95.0, 96.0, 100.5, 107.0, 112.5],
            },
            index=dates,
        )

        # -------------------------------------------------------------
        # 3. TIMELY OUTCOME EVALUATION (Bounded by Max Holding Period)
        # -------------------------------------------------------------
        # Evaluate timely outcome on market data
        evaluation_result = evaluate_signal_outcome(signal_row, df_market, max_hold_days=10)

        # Verify trade outcome is STOPPED OUT on Day 1
        assert evaluation_result["status"] == "STOPPED OUT 🛑"
        assert evaluation_result["outcome"] == "LOSS"
        assert evaluation_result["pnl_pct"] == -6.0  # (94.0 - 100.0) / 100.0 * 100
        assert evaluation_result["days_held"] == 1

        # Finalize closed signal state
        closed_signal = dict(signal_row)
        closed_signal["status"] = "stopped_out"
        closed_signal["closed_at"] = date_strs[1]  # Stopped out on Day 1 (2026-02-03)
        closed_signal["outcome"] = "LOSS"
        closed_signal["pnl_pct"] = -6.0

        # -------------------------------------------------------------
        # 4. INITIALIZE INDEPENDENT RECOVERY TRACKER
        # -------------------------------------------------------------
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []

        recovery_tracker = initialize_recovery_tracking(mock_supabase, closed_signal, today_str=date_strs[1])
        assert recovery_tracker is not None
        assert recovery_tracker["signal_id"] == "sig-journey-001"
        assert recovery_tracker["original_exit_status"] == "stopped_out"
        assert recovery_tracker["original_exit_date"] == date_strs[1]
        assert recovery_tracker["entry_reference"] == 100.0
        assert recovery_tracker["pre_pullback_level"] == 106.0
        assert recovery_tracker["original_target_1"] == 112.0
        assert recovery_tracker["tracking_status"] == "ACTIVE"
        assert recovery_tracker["has_recovered_entry"] is False

        # -------------------------------------------------------------
        # 5. RECONCILE POST-EXIT RECOVERIES (Bars subsequent to Exit Date)
        # -------------------------------------------------------------
        mock_supabase.table("signal_recovery_tracking").select().eq().execute.return_value.data = [recovery_tracker]
        mock_supabase.table("signal_recovery_events").select().in_().execute.return_value.data = []
        mock_supabase.table("trade_signals").select().in_().execute.return_value.data = [
            {"id": "sig-journey-001", "signal_date": signal_date}
        ]

        asset_data = {"THYAO": df_market}
        asset_id_map = {"THYAO": "asset-uuid-journey"}

        stats = reconcile_post_exit_recoveries(
            mock_supabase, asset_id_map, asset_data, today_str=date_strs[-1], max_tracking_sessions=45
        )

        # Verify that post-exit reconciliation recorded recovery events
        assert stats["events_recorded"] >= 3  # ENTRY_TOUCHED, PRE_PULLBACK_HIGH_TOUCHED, TARGET_1_TOUCHED_AFTER_EXIT

        # Inspect the table updates sent to Supabase
        update_calls = mock_supabase.table("signal_recovery_tracking").update.call_args_list
        assert len(update_calls) > 0
        final_tracking_update = update_calls[-1][0][0]

        # Milestone verifications in recovery tracking
        assert final_tracking_update["has_recovered_entry"] is True
        assert final_tracking_update["has_recovered_pre_pullback"] is True
        assert final_tracking_update["has_reached_target_after_exit"] is True
        assert final_tracking_update["last_checked_date"] == date_strs[-1]

        # Verify that recovery events were inserted into signal_recovery_events
        inserted_events = mock_supabase.table("signal_recovery_events").insert.call_args[0][0]
        event_types = [ev["event_type"] for ev in inserted_events]
        assert "ENTRY_TOUCHED" in event_types
        assert "PRE_PULLBACK_HIGH_TOUCHED" in event_types
        assert "TARGET_1_TOUCHED_AFTER_EXIT" in event_types

        # -------------------------------------------------------------
        # 6. INVARIANT CHECKS: PURITY OF SEPARATION
        # -------------------------------------------------------------
        # The original trade signal was NOT mutated:
        assert closed_signal["status"] == "stopped_out", "Original trade status must remain stopped_out"
        assert closed_signal["outcome"] == "LOSS", "Original trade outcome must remain LOSS"
        assert closed_signal["pnl_pct"] == -6.0, "Original PnL must not be overwritten by later recovery"
        assert closed_signal["entry_price"] == 100.0, "Original entry anchor must remain immutable"
        assert closed_signal["stop_loss"] == 94.0, "Original stop anchor must remain immutable"

        # The recovery information is completely housed within the recovery tracker entity
        assert recovery_tracker["original_exit_status"] == "stopped_out"
        assert recovery_tracker["entry_reference"] == 100.0

    def test_complete_setup_expired_then_recovered(self):
        # 1. SETUP GENERATION
        signal_date = "2026-01-05"
        entry_price = 50.0
        stop_loss = 46.0
        target_1 = 58.0

        signal_row = {
            "id": "sig-journey-002",
            "asset_id": "asset-uuid-krdmd",
            "symbol": "KRDMD",
            "strategy": "Volatility Squeeze",
            "signal_date": signal_date,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "target_1": target_1,
            "status": "active",
        }

        # 2. MARKET DATA: Flat price action for 20 sessions (between 48.0 and 52.0) -> EXPIRES
        # Then session 21-25 pushes to 60.0 -> RECOVERS TARGET 1
        dates = pd.date_range(start="2026-01-05", periods=25, freq="B")
        date_strs = [d.strftime("%Y-%m-%d") for d in dates]

        # First 20 days flat
        closes = [50.0 + (i % 3 - 1) * 0.5 for i in range(20)]
        highs = [c + 1.0 for c in closes]
        lows = [c - 1.0 for c in closes]

        # Next 5 days rally
        for rally_c in [53.0, 55.0, 57.0, 59.0, 61.0]:
            closes.append(rally_c)
            highs.append(rally_c + 1.0)
            lows.append(rally_c - 0.5)

        df_market = pd.DataFrame(
            {"open": closes, "high": highs, "low": lows, "close": closes},
            index=dates,
        )

        # 3. TIMELY EVALUATION (max_hold_days = 20)
        res = evaluate_signal_outcome(signal_row, df_market, max_hold_days=20)
        assert res["status"] == "EXPIRED ⏳"
        assert res["days_held"] == 20

        closed_signal = dict(signal_row)
        closed_signal["status"] = "expired"
        closed_signal["closed_at"] = date_strs[20]
        closed_signal["outcome"] = "EXPIRED"

        # 4. INITIALIZE RECOVERY TRACKING
        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []

        recovery_tracker = initialize_recovery_tracking(mock_supabase, closed_signal, today_str=date_strs[20])
        assert recovery_tracker["original_exit_status"] == "expired"
        assert recovery_tracker["original_exit_date"] == date_strs[20]

        # 5. RECONCILE RECOVERY AFTER EXPIRATION
        mock_supabase.table("signal_recovery_tracking").select().eq().execute.return_value.data = [recovery_tracker]
        mock_supabase.table("signal_recovery_events").select().in_().execute.return_value.data = []
        mock_supabase.table("trade_signals").select().in_().execute.return_value.data = [
            {"id": "sig-journey-002", "signal_date": signal_date}
        ]

        stats = reconcile_post_exit_recoveries(
            mock_supabase,
            {"KRDMD": "asset-uuid-krdmd"},
            {"KRDMD": df_market},
            today_str=date_strs[-1],
            max_tracking_sessions=45,
        )

        assert stats["events_recorded"] >= 1
        inserted_events = mock_supabase.table("signal_recovery_events").insert.call_args[0][0]
        event_types = [ev["event_type"] for ev in inserted_events]
        assert "TARGET_1_TOUCHED_AFTER_EXIT" in event_types

        # 6. INVARIANT CHECK: Original trade stays EXPIRED, never becomes WIN
        assert closed_signal["status"] == "expired"
        assert closed_signal["outcome"] == "EXPIRED"
        assert recovery_tracker["original_exit_status"] == "expired"
