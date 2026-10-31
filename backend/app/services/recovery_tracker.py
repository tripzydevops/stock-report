"""
Post-Exit Recovery Tracking Service
===================================
Tracks whether closed trade signals (expired or stopped out) subsequently recover
key reference price levels after trade exit, without altering or inflating the
original trade's immutable outcome.

Architectural Guarantees:
1. Immutable Historical Record:
   - Original trade status stays 'expired' or 'stopped_out'.
   - Win rates and strategy expectancies remain strictly honest and untainted.
2. Chronological Multi-Milestone Tracking:
   - Entry Reference (First touch vs Close confirmed)
   - Pre-Pullback High (First touch vs Close confirmed)
   - Original Targets reached post-exit (Target 1 & Target 2)
3. Idempotent Storage:
   - Unique constraint (signal_id, event_type) guarantees reruns do not duplicate events.
4. Bounded Horizon:
   - Active tracking stops after max_tracking_sessions (default: 45 trading sessions).
"""

import json
import logging
import math
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def extract_pre_pullback_level(ai_rationale_raw: Any, signal_dict: Optional[Dict[str, Any]] = None) -> Optional[float]:
    """
    Extracts the frozen pre-pullback high or reference level from the signal payload.
    """
    if signal_dict and signal_dict.get("pre_pullback_high") is not None:
        try:
            val = float(signal_dict["pre_pullback_high"])
            if math.isfinite(val) and val > 0:
                return round(val, 2)
        except (ValueError, TypeError):
            pass

    payload = {}
    if isinstance(ai_rationale_raw, str) and ai_rationale_raw.strip().startswith("{"):
        try:
            payload = json.loads(ai_rationale_raw)
        except Exception:
            payload = {}
    elif isinstance(ai_rationale_raw, dict):
        payload = ai_rationale_raw

    # Check risk object or top-level payload
    risk_obj = payload.get("risk") or {}
    candidates = [
        payload.get("pre_pullback_high"),
        payload.get("pre_pullback_level"),
        risk_obj.get("pre_pullback_high"),
        risk_obj.get("pre_pullback_level"),
        risk_obj.get("reference_high"),
    ]
    for c in candidates:
        if c is not None:
            try:
                val = float(c)
                if math.isfinite(val) and val > 0:
                    return round(val, 2)
            except (ValueError, TypeError):
                continue

    return None


def initialize_recovery_tracking(
    client: Any,
    signal_row: Dict[str, Any],
    today_str: Optional[str] = None,
    max_tracking_sessions: int = 45
) -> Optional[Dict[str, Any]]:
    """
    Initializes a tracking row in signal_recovery_tracking when a signal closes.
    Idempotent: Uses upsert on conflict (signal_id).
    """
    sig_id = signal_row.get("id")
    if not sig_id:
        return None

    exit_status = signal_row.get("status")
    if exit_status not in ("expired", "stopped_out"):
        return None

    raw_closed = signal_row.get("closed_at")
    if raw_closed:
        exit_date = str(raw_closed)[:10]
    else:
        exit_date = today_str or date.today().isoformat()

    try:
        entry_ref = float(signal_row.get("entry_price") or 0)
    except (ValueError, TypeError):
        return None

    if not math.isfinite(entry_ref) or entry_ref <= 0:
        return None

    t1 = float(signal_row["target_1"]) if signal_row.get("target_1") is not None else None
    t2 = float(signal_row["target_2"]) if signal_row.get("target_2") is not None else None
    pre_pb = extract_pre_pullback_level(signal_row.get("ai_rationale"), signal_row)

    # Estimate end date ~ 65 calendar days (~45 trading sessions)
    try:
        exit_dt = datetime.strptime(exit_date, "%Y-%m-%d").date()
    except Exception:
        exit_dt = date.today()
    end_dt = exit_dt + timedelta(days=int(max_tracking_sessions * 1.5))

    tracking_row = {
        "signal_id": sig_id,
        "asset_id": signal_row.get("asset_id"),
        "original_exit_date": exit_date,
        "original_exit_status": exit_status,
        "entry_reference": entry_ref,
        "pre_pullback_level": pre_pb,
        "original_target_1": t1,
        "original_target_2": t2,
        "tracking_start_date": exit_date,
        "tracking_end_date": end_dt.isoformat(),
        "last_checked_date": exit_date,
        "tracking_status": "ACTIVE",
        "has_recovered_entry": False,
        "has_recovered_pre_pullback": False,
        "has_reached_target_after_exit": False,
    }

    try:
        res = client.table("signal_recovery_tracking").upsert(
            tracking_row,
            on_conflict="signal_id"
        ).execute()
        return tracking_row
    except Exception as e:
        logger.error(f"Failed to initialize recovery tracking for signal {sig_id}: {e}")
        return None


def reconcile_post_exit_recoveries(
    client: Any,
    asset_id_map: Dict[str, str],
    asset_data: Dict[str, pd.DataFrame],
    today_str: Optional[str] = None,
    max_tracking_sessions: int = 45
) -> Dict[str, int]:
    """
    Evaluates active closed signals against chronological daily price bars
    subsequent to exit date.
    
    Detects and logs:
    - ENTRY_TOUCHED & ENTRY_RECLAIMED_CLOSE
    - PRE_PULLBACK_HIGH_TOUCHED & PRE_PULLBACK_HIGH_RECLAIMED_CLOSE
    - TARGET_1_TOUCHED_AFTER_EXIT & TARGET_2_TOUCHED_AFTER_EXIT
    
    Returns:
        Dict with count of trackers checked, events recorded, and completed tracking rows.
    """
    today = today_str or date.today().isoformat()

    try:
        res = client.table("signal_recovery_tracking").select("*").eq("tracking_status", "ACTIVE").execute()
        active_trackers = res.data or []
    except Exception as e:
        logger.error(f"FATAL: Database query failed in reconcile_post_exit_recoveries: {e}")
        raise RuntimeError(f"Database query failed in reconcile_post_exit_recoveries: {e}") from e

    if not active_trackers:
        return {"checked": 0, "events_recorded": 0, "completed": 0}

    # Fetch existing recorded events to avoid redundant writes
    sig_ids = [t["signal_id"] for t in active_trackers]
    recorded_events_set: Set[Tuple[str, str]] = set()
    try:
        res_ev = client.table("signal_recovery_events").select("signal_id, event_type").in_("signal_id", sig_ids).execute()
        for ev in (res_ev.data or []):
            recorded_events_set.add((ev["signal_id"], ev["event_type"]))
    except Exception as ev_err:
        logger.warning(f"Could not preload existing recovery events: {ev_err}")

    # Fetch original signal dates for session distance calculation
    sig_dates_map: Dict[str, str] = {}
    try:
        res_sig = client.table("trade_signals").select("id, signal_date").in_("id", sig_ids).execute()
        for s in (res_sig.data or []):
            sig_dates_map[s["id"]] = str(s["signal_date"])[:10]
    except Exception as sig_err:
        logger.warning(f"Could not load signal_dates for recovery trackers: {sig_err}")

    id_to_symbol = {v: k for k, v in asset_id_map.items()}
    events_recorded_count = 0
    completed_count = 0

    for tracker in active_trackers:
        sig_id = tracker["signal_id"]
        asset_id = tracker.get("asset_id")
        sym = id_to_symbol.get(asset_id) if asset_id else None

        if not sym or sym not in asset_data:
            # Try matching clean symbol without .IS
            clean_sym = sym.replace(".IS", "") if sym else None
            if clean_sym and clean_sym in asset_data:
                sym = clean_sym
            else:
                continue

        df = asset_data[sym]
        if df.empty or len(df) < 5:
            continue

        raw_dates = [d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10] for d in df.index]
        exit_date = tracker["original_exit_date"]
        sig_date = sig_dates_map.get(sig_id, exit_date)

        # Locate signal index and exit index
        signal_indices = [idx for idx, d in enumerate(raw_dates) if d == sig_date]
        exit_indices = [idx for idx, d in enumerate(raw_dates) if d == exit_date]

        if not exit_indices:
            # Fallback to closest date <= exit_date
            prior_indices = [idx for idx, d in enumerate(raw_dates) if d <= exit_date]
            if not prior_indices:
                continue
            exit_idx = prior_indices[-1]
        else:
            exit_idx = exit_indices[0]

        signal_idx = signal_indices[0] if signal_indices else max(0, exit_idx - 7)

        # Chronological bars strictly subsequent to exit_idx
        subsequent_indices = [idx for idx in range(exit_idx + 1, len(df))]
        if not subsequent_indices:
            continue

        # Slice to max allowed tracking sessions
        eval_indices = subsequent_indices[:max_tracking_sessions]

        entry_ref = float(tracker["entry_reference"])
        pre_pb = float(tracker["pre_pullback_level"]) if tracker.get("pre_pullback_level") is not None else None
        t1 = float(tracker["original_target_1"]) if tracker.get("original_target_1") is not None else None
        t2 = float(tracker["original_target_2"]) if tracker.get("original_target_2") is not None else None

        has_rec_entry = bool(tracker.get("has_recovered_entry"))
        has_rec_pre_pb = bool(tracker.get("has_recovered_pre_pullback"))
        has_rec_target = bool(tracker.get("has_reached_target_after_exit"))

        new_events_to_insert = []
        last_eval_date = tracker.get("last_checked_date") or exit_date

        for i in eval_indices:
            bar = df.iloc[i]
            bar_date = raw_dates[i]
            high = float(bar.get("high", bar["close"]))
            close = float(bar["close"])
            last_eval_date = bar_date

            sessions_since_signal = i - signal_idx
            sessions_since_exit = i - exit_idx

            # 1. Entry Recovery
            if (sig_id, "ENTRY_TOUCHED") not in recorded_events_set and high >= entry_ref:
                new_events_to_insert.append({
                    "signal_id": sig_id,
                    "event_type": "ENTRY_TOUCHED",
                    "event_date": bar_date,
                    "reference_level": entry_ref,
                    "observed_price": round(high, 2),
                    "sessions_since_signal": sessions_since_signal,
                    "sessions_since_exit": sessions_since_exit,
                })
                recorded_events_set.add((sig_id, "ENTRY_TOUCHED"))

            if (sig_id, "ENTRY_RECLAIMED_CLOSE") not in recorded_events_set and close >= entry_ref:
                new_events_to_insert.append({
                    "signal_id": sig_id,
                    "event_type": "ENTRY_RECLAIMED_CLOSE",
                    "event_date": bar_date,
                    "reference_level": entry_ref,
                    "observed_price": round(close, 2),
                    "sessions_since_signal": sessions_since_signal,
                    "sessions_since_exit": sessions_since_exit,
                })
                recorded_events_set.add((sig_id, "ENTRY_RECLAIMED_CLOSE"))
                has_rec_entry = True

            # 2. Pre-Pullback High Recovery
            if pre_pb is not None:
                if (sig_id, "PRE_PULLBACK_HIGH_TOUCHED") not in recorded_events_set and high >= pre_pb:
                    new_events_to_insert.append({
                        "signal_id": sig_id,
                        "event_type": "PRE_PULLBACK_HIGH_TOUCHED",
                        "event_date": bar_date,
                        "reference_level": pre_pb,
                        "observed_price": round(high, 2),
                        "sessions_since_signal": sessions_since_signal,
                        "sessions_since_exit": sessions_since_exit,
                    })
                    recorded_events_set.add((sig_id, "PRE_PULLBACK_HIGH_TOUCHED"))

                if (sig_id, "PRE_PULLBACK_HIGH_RECLAIMED_CLOSE") not in recorded_events_set and close >= pre_pb:
                    new_events_to_insert.append({
                        "signal_id": sig_id,
                        "event_type": "PRE_PULLBACK_HIGH_RECLAIMED_CLOSE",
                        "event_date": bar_date,
                        "reference_level": pre_pb,
                        "observed_price": round(close, 2),
                        "sessions_since_signal": sessions_since_signal,
                        "sessions_since_exit": sessions_since_exit,
                    })
                    recorded_events_set.add((sig_id, "PRE_PULLBACK_HIGH_RECLAIMED_CLOSE"))
                    has_rec_pre_pb = True

            # 3. Target Reached Post-Exit
            if t1 is not None and (sig_id, "TARGET_1_TOUCHED_AFTER_EXIT") not in recorded_events_set and high >= t1:
                new_events_to_insert.append({
                    "signal_id": sig_id,
                    "event_type": "TARGET_1_TOUCHED_AFTER_EXIT",
                    "event_date": bar_date,
                    "reference_level": t1,
                    "observed_price": round(high, 2),
                    "sessions_since_signal": sessions_since_signal,
                    "sessions_since_exit": sessions_since_exit,
                })
                recorded_events_set.add((sig_id, "TARGET_1_TOUCHED_AFTER_EXIT"))
                has_rec_target = True

            if t2 is not None and (sig_id, "TARGET_2_TOUCHED_AFTER_EXIT") not in recorded_events_set and high >= t2:
                new_events_to_insert.append({
                    "signal_id": sig_id,
                    "event_type": "TARGET_2_TOUCHED_AFTER_EXIT",
                    "event_date": bar_date,
                    "reference_level": t2,
                    "observed_price": round(high, 2),
                    "sessions_since_signal": sessions_since_signal,
                    "sessions_since_exit": sessions_since_exit,
                })
                recorded_events_set.add((sig_id, "TARGET_2_TOUCHED_AFTER_EXIT"))

        # Batch insert new milestone events if any
        if new_events_to_insert:
            try:
                client.table("signal_recovery_events").insert(new_events_to_insert).execute()
                events_recorded_count += len(new_events_to_insert)
            except Exception as ins_err:
                logger.error(f"Failed inserting recovery events for signal {sig_id}: {ins_err}")
                raise RuntimeError(f"Database insertion failed for recovery events: {ins_err}") from ins_err

        # Check if tracking reached max horizon or all targets reclaimed
        is_completed = False
        total_sessions_after_exit = len(subsequent_indices)
        if total_sessions_after_exit >= max_tracking_sessions:
            is_completed = True
        elif has_rec_entry and (pre_pb is None or has_rec_pre_pb) and has_rec_target:
            is_completed = True

        update_payload = {
            "has_recovered_entry": has_rec_entry,
            "has_recovered_pre_pullback": has_rec_pre_pb,
            "has_reached_target_after_exit": has_rec_target,
            "last_checked_date": last_eval_date,
        }
        if is_completed:
            update_payload["tracking_status"] = "COMPLETED"
            completed_count += 1

        try:
            client.table("signal_recovery_tracking").update(update_payload).eq("signal_id", sig_id).execute()
        except Exception as upd_err:
            logger.error(f"Failed updating recovery tracking row for signal {sig_id}: {upd_err}")
            raise RuntimeError(f"Database update failed for recovery tracking: {upd_err}") from upd_err

    return {
        "checked": len(active_trackers),
        "events_recorded": events_recorded_count,
        "completed": completed_count,
    }


def sync_existing_closed_signals_to_recovery_tracker(client: Any) -> int:
    """
    Backfills signal_recovery_tracking for any existing 'expired' or 'stopped_out'
    trade signals that have not yet been registered.
    """
    try:
        res = client.table("trade_signals").select("*").in_("status", ["expired", "stopped_out"]).execute()
        closed_signals = res.data or []
    except Exception as e:
        logger.error(f"Failed to query closed signals for recovery backfill: {e}")
        return 0

    if not closed_signals:
        return 0

    # Query already registered signal_ids
    try:
        res_existing = client.table("signal_recovery_tracking").select("signal_id").execute()
        registered_ids = {r["signal_id"] for r in (res_existing.data or [])}
    except Exception as ex_err:
        logger.warning(f"Could not query existing recovery tracker IDs: {ex_err}")
        registered_ids = set()

    initialized_count = 0
    for sig in closed_signals:
        sig_id = sig.get("id")
        if sig_id and sig_id not in registered_ids:
            res_init = initialize_recovery_tracking(client, sig)
            if res_init:
                initialized_count += 1
                registered_ids.add(sig_id)

    logger.info(f"Initialized recovery tracking for {initialized_count} historical closed signals.")
    return initialized_count
