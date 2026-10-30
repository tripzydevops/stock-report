"""
Unified Signal Persistence & Lifecycle Service
=============================================
Centralized, single source of truth for persisting, reconfirming,
and reconciling trade signals in Supabase.

Ensures:
1. Strict storage-boundary confidence validation:
   - Rejects NaN, +/-inf, and negative numbers.
   - Migrates legacy 0-10 scale (e.g. 8.5 -> 85.0).
   - Strictly bounds confidence to [0.0, 100.0].
   - Distinguishes screener algorithmic setup quality from LLM conviction.
2. Full preservation of structured explainer fields:
   - trigger_reasons, invalidation, market_context, risk, rationale,
     direction, entry_mode, target_1, target_2, risk_reward_ratio.
3. Safe reconfirmations:
   - Never overwrites existing signals with plain-text strings.
   - Appends dated reconfirmation entries without modifying initial entry proof.
   - Safely upgrades legacy unformatted text rows to valid JSON payloads.
4. User portfolio preservation:
   - Protects open positions held by the user from auto-expiration.
"""

import json
import math
import logging
import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
import pandas as pd

logger = logging.getLogger(__name__)


def validate_and_normalize_confidence(raw: Any) -> float:
    """
    Validates and normalizes confidence scores at the storage boundary.
    - Rejects None, NaN, +/-inf, non-numeric, or <= 0 (returns 0.0).
    - Migrates legacy 0-10 scale to 0-100 (e.g., 8.2 -> 82.0).
    - Strictly bounds output to [0.0, 100.0].
    """
    if raw is None:
        return 0.0
    try:
        val = float(raw)
    except (ValueError, TypeError):
        return 0.0

    if math.isnan(val) or math.isinf(val) or val <= 0.0:
        return 0.0

    # Legacy 0-10 scale migration
    if val <= 10.0:
        return min(100.0, max(0.0, round(val * 10.0, 1)))

    return min(100.0, max(0.0, round(val, 1)))


def build_structured_explainer_payload(
    signal: Dict[str, Any],
    ai_analysis: Optional[Dict[str, Any]] = None,
    today_str: Optional[str] = None
) -> Dict[str, Any]:
    """
    Constructs the canonical structured JSON explainer payload from a raw
    screener signal and optional AI analysis dict.
    
    Preserves:
    - trigger_reasons
    - failed_checks
    - invalidation
    - market_context
    - risk
    - rationale
    - target_1 and target_2
    - entry_mode and direction
    - setup_quality_score vs ai_conviction_score
    """
    symbol = str(signal.get("symbol", "")).replace(".IS", "").strip().upper()
    strategy = str(signal.get("strategy", "Unknown"))
    
    # Determine signal date
    raw_date = signal.get("signal_date")
    if hasattr(raw_date, "strftime"):
        sig_date = raw_date.strftime("%Y-%m-%d")
    elif raw_date:
        sig_date = str(raw_date)[:10]
    else:
        sig_date = today_str or datetime.date.today().isoformat()

    # If the signal already carries an ai_rationale string that is JSON, parse as baseline
    existing_payload = {}
    raw_ai_rat = signal.get("ai_rationale") or signal.get("rationale")
    if isinstance(raw_ai_rat, str) and raw_ai_rat.strip().startswith("{") and raw_ai_rat.strip().endswith("}"):
        try:
            existing_payload = json.loads(raw_ai_rat)
        except Exception:
            existing_payload = {}
    elif isinstance(raw_ai_rat, dict):
        existing_payload = raw_ai_rat

    # 1. Trigger Reasons
    trigger_reasons = (
        signal.get("trigger_reasons")
        or existing_payload.get("trigger_reasons")
        or [f"{strategy} algorithmic entry rules confirmed for {symbol}."]
    )
    if isinstance(trigger_reasons, str):
        trigger_reasons = [r.strip() for r in trigger_reasons.split(" | ") if r.strip()]

    # 2. Failed Checks
    failed_checks = signal.get("failed_checks") or existing_payload.get("failed_checks") or []

    # 3. Invalidation
    invalidation = (
        signal.get("invalidation")
        or existing_payload.get("invalidation")
        or f"Daily close below stop loss ({signal.get('stop_loss')}) cancels setup."
    )

    # 4. Market Context
    market_ctx = signal.get("market_context") or existing_payload.get("market_context") or {}
    if not isinstance(market_ctx, dict):
        market_ctx = {"context": str(market_ctx)}
    if "market" not in market_ctx:
        market_ctx["market"] = str(signal.get("market", "BIST"))

    # 5. Risk Info
    risk_info = signal.get("risk") or existing_payload.get("risk") or {}
    if not isinstance(risk_info, dict):
        risk_info = {"note": str(risk_info)}
    if "rr_ratio" not in risk_info and signal.get("risk_reward_ratio") is not None:
        risk_info["rr_ratio"] = float(signal["risk_reward_ratio"])

    # 6. Target 1 and Target 2
    t1 = float(signal.get("target_1") or signal.get("targetPrice") or 0) if (signal.get("target_1") or signal.get("targetPrice")) else None
    t2 = float(signal.get("target_2") or 0) if signal.get("target_2") else None

    # 7. Confidence Scores (Separation of Setup Quality vs AI Conviction)
    setup_score = validate_and_normalize_confidence(signal.get("confidence_score"))
    ai_conviction = 0.0
    ai_thesis = ""
    ai_risk = ""

    if ai_analysis:
        ai_conviction = validate_and_normalize_confidence(ai_analysis.get("conviction_score"))
        ai_thesis = str(ai_analysis.get("thesis", "")).strip()
        ai_risk = str(ai_analysis.get("risk_assessment", "")).strip()

    # Rationale assembly
    base_rationale = (
        signal.get("rationale")
        or existing_payload.get("rationale")
        or f"{strategy} setup identified for {symbol}."
    )
    if ai_thesis:
        full_rationale = f"{base_rationale} | AI Thesis: {ai_thesis}"
    else:
        full_rationale = base_rationale

    payload = {
        "symbol": symbol,
        "strategy": strategy,
        "direction": signal.get("direction", "LONG"),
        "entry_mode": signal.get("entry_mode", "next_open"),
        "signal_date": sig_date,
        "trigger_reasons": trigger_reasons,
        "failed_checks": failed_checks,
        "invalidation": invalidation,
        "market_context": market_ctx,
        "risk": risk_info,
        "rationale": full_rationale,
        "target_1": t1,
        "target_2": t2,
        "setup_quality_score": setup_score,
        "ai_conviction_score": ai_conviction if ai_conviction > 0 else None,
        "ai_thesis": ai_thesis or None,
        "ai_risk_assessment": ai_risk or None,
        "reconfirmations": existing_payload.get("reconfirmations", []),
        "last_reconfirmed_date": existing_payload.get("last_reconfirmed_date"),
        "latest_reconfirmation": existing_payload.get("latest_reconfirmation"),
    }

    return payload


def merge_reconfirmation(
    orig_row: Dict[str, Any],
    new_signal: Dict[str, Any],
    today_str: str,
    new_payload: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Appends a dated reconfirmation to an existing open trade signal WITHOUT
    destroying the initial trade's trigger reasons, risk parameters, or targets.
    
    Safely upgrades legacy unformatted plain-text rationales to structured JSON.
    """
    orig_rat = orig_row.get("ai_rationale") or ""
    orig_sym = str(orig_row.get("symbol") or new_signal.get("symbol", "")).replace(".IS", "").strip().upper()
    orig_strat = orig_row.get("strategy") or new_signal.get("strategy", "Unknown")
    orig_date = str(orig_row.get("signal_date", ""))[:10]

    reconf_entry = {
        "date": today_str,
        "reconfirmed_price": float(new_signal.get("entry_price") or 0),
        "reconfirmed_stop": float(new_signal.get("stop_loss") or 0) if new_signal.get("stop_loss") else None,
        "reconfirmed_target_1": float(new_signal.get("target_1") or 0) if new_signal.get("target_1") else None,
        "reconfirmed_target_2": float(new_signal.get("target_2") or 0) if new_signal.get("target_2") else None,
        "scan_risk": new_payload.get("risk", {}),
        "trigger_reasons": new_payload.get("trigger_reasons", []),
        "market_context": new_payload.get("market_context", {}),
        "rationale": new_payload.get("rationale", ""),
    }

    is_structured = orig_rat.strip().startswith("{") and orig_rat.strip().endswith("}")
    update_fields: Dict[str, Any] = {}

    if is_structured:
        try:
            payload = json.loads(orig_rat)
            reconf_list = payload.get("reconfirmations", [])
            reconf_dates = [r.get("date") if isinstance(r, dict) else r for r in reconf_list]
            if today_str not in reconf_dates:
                reconf_list.append(reconf_entry)
                payload["reconfirmations"] = reconf_list

            payload["last_reconfirmed_date"] = today_str
            payload["latest_reconfirmation"] = reconf_entry
            
            # Incorporate fresh AI analysis if available
            if new_payload.get("ai_thesis"):
                payload["latest_ai_thesis"] = new_payload["ai_thesis"]
            if new_payload.get("ai_conviction_score"):
                payload["ai_conviction_score"] = new_payload["ai_conviction_score"]

            update_fields["ai_rationale"] = json.dumps(payload, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Error appending reconfirmation to structured signal {orig_row.get('id')}: {e}")
            is_structured = False

    if not is_structured:
        # Upgrade legacy unformatted plain-text signal safely
        clean_legacy_text = orig_rat.replace("RE-CONFIRMED: ", "").strip()
        orig_entry_val = float(orig_row.get("entry_price") or 0)
        orig_stop_val = float(orig_row.get("stop_loss") or 0) if orig_row.get("stop_loss") else None
        orig_t1_val = float(orig_row.get("target_1") or 0) if orig_row.get("target_1") else None
        orig_t2_val = float(orig_row.get("target_2") or 0) if orig_row.get("target_2") else None
        orig_rr_val = float(orig_row.get("risk_reward_ratio") or 2.0) if orig_row.get("risk_reward_ratio") else 2.0

        upgraded_payload = {
            "symbol": orig_sym,
            "strategy": orig_strat,
            "direction": "LONG",
            "entry_mode": "original_scan",
            "signal_date": orig_date,
            "original_explainer_status": "legacy_unstructured" if clean_legacy_text else "not_recorded",
            "original_rationale": clean_legacy_text if clean_legacy_text else None,
            "rationale": clean_legacy_text if clean_legacy_text else f"Original {orig_strat} signal recorded prior to structured explainer engine.",
            "trigger_reasons": [clean_legacy_text] if clean_legacy_text else ["Original trigger conditions recorded prior to explainer upgrade."],
            "failed_checks": [],
            "invalidation": f"Daily close below original trade stop ({orig_stop_val}) cancels trade setup.",
            "market_context": {"note": "Historical scan context preserved from original signal date."},
            "risk": {
                "original_entry": orig_entry_val,
                "original_stop": orig_stop_val,
                "original_target_1": orig_t1_val,
                "original_target_2": orig_t2_val,
                "risk_reward_ratio": orig_rr_val,
            },
            "reconfirmations": [reconf_entry],
            "last_reconfirmed_date": today_str,
            "latest_reconfirmation": reconf_entry,
        }
        update_fields["ai_rationale"] = json.dumps(upgraded_payload, ensure_ascii=False)

    # Standardize confidence score
    orig_conf = float(orig_row.get("confidence_score") or 0)
    new_conf = validate_and_normalize_confidence(new_signal.get("confidence_score"))
    if new_conf > 0 and (orig_conf == 0 or validate_and_normalize_confidence(orig_conf) != orig_conf):
        update_fields["confidence_score"] = new_conf
    elif orig_conf > 0:
        update_fields["confidence_score"] = validate_and_normalize_confidence(orig_conf)

    return update_fields


def persist_trade_signals(
    client,
    signals: List[Dict[str, Any]],
    asset_id_map: Dict[str, str],
    today_str: Optional[str] = None
) -> Dict[str, int]:
    """
    Unified entry point for persisting trade signals.
    Used by cron_daily_job.py, export_to_spreadsheet.py, and sync scripts.
    
    Returns:
        Dict with count of inserted and reconfirmed signals.
    """
    if not signals:
        return {"inserted": 0, "reconfirmed": 0}

    today = today_str or datetime.date.today().isoformat()

    # Load existing open signals and keys for deduplication
    try:
        res = client.table("trade_signals").select("id, asset_id, signal_date, strategy, status, ai_rationale, confidence_score, entry_price, stop_loss, target_1, target_2, risk_reward_ratio").execute()
        existing_rows = res.data or []
        existing_keys = {
            (
                r.get("asset_id"),
                str(r.get("signal_date"))[:10],
                str(r.get("strategy", "")).lower().replace(" ", "_")
            )
            for r in existing_rows
        }
        open_signals_map = {
            (
                r.get("asset_id"),
                str(r.get("strategy", "")).lower().replace(" ", "_")
            ): r
            for r in existing_rows
            if r.get("status") == "open"
        }
    except Exception as e:
        logger.error(f"Error querying existing signals in persist_trade_signals: {e}")
        existing_keys = set()
        open_signals_map = {}

    rows_to_insert = []
    reconfirmed_count = 0

    for sig in signals:
        sym = str(sig.get("symbol", "")).replace(".IS", "").strip().upper()
        asset_id = asset_id_map.get(sym) or asset_id_map.get(f"{sym}.IS")
        if not asset_id:
            logger.warning(f"No asset_id found for symbol {sym}; skipping signal.")
            continue

        raw_date = sig.get("signal_date")
        if hasattr(raw_date, "strftime"):
            date_str = raw_date.strftime("%Y-%m-%d")
        elif raw_date:
            date_str = str(raw_date)[:10]
        else:
            date_str = today

        strat_key = str(sig.get("strategy", "unknown")).lower().replace(" ", "_")
        ai_analysis = sig.get("ai_analysis")

        # 1. Build canonical structured explainer payload
        structured_payload = build_structured_explainer_payload(
            signal=sig,
            ai_analysis=ai_analysis,
            today_str=date_str
        )

        # 2. Check for exact duplicate on the same date
        if (asset_id, date_str, strat_key) in existing_keys:
            logger.info(f"Skipping exact duplicate signal for {sym} on {date_str} ({sig.get('strategy')})")
            continue

        # 3. CONTINUATION / RECONFIRMATION CHECK: Is there an existing open signal from an earlier date?
        open_sig = open_signals_map.get((asset_id, strat_key))
        if open_sig and str(open_sig.get("signal_date"))[:10] < date_str:
            update_fields = merge_reconfirmation(
                orig_row=open_sig,
                new_signal=sig,
                today_str=date_str,
                new_payload=structured_payload
            )
            if update_fields:
                try:
                    client.table("trade_signals").update(update_fields).eq("id", open_sig["id"]).execute()
                    reconfirmed_count += 1
                    logger.info(f"Re-confirmed existing open signal {open_sig['id']} for {sym} on {date_str} (structured JSON preserved)")
                except Exception as upd_err:
                    logger.error(f"Failed to update reconfirmation for {open_sig['id']}: {upd_err}")
            continue

        # 4. Prepare new signal row for insertion
        setup_conf = validate_and_normalize_confidence(sig.get("confidence_score"))
        ai_conf = validate_and_normalize_confidence(ai_analysis.get("conviction_score")) if ai_analysis else 0.0
        final_conf = ai_conf if ai_conf > 0 else setup_conf

        entry_val = float(sig.get("entry_price") or 0)
        stop_val = float(sig.get("stop_loss") or 0) if sig.get("stop_loss") else None
        t1_val = float(sig.get("target_1") or 0) if sig.get("target_1") else None
        t2_val = float(sig.get("target_2") or 0) if sig.get("target_2") else None
        rr_val = float(sig.get("risk_reward_ratio") or 0) if sig.get("risk_reward_ratio") else None

        rows_to_insert.append({
            "asset_id": asset_id,
            "strategy": sig.get("strategy", "unknown"),
            "signal_date": date_str,
            "entry_price": entry_val,
            "stop_loss": stop_val,
            "target_1": t1_val,
            "target_2": t2_val,
            "risk_reward_ratio": rr_val,
            "confidence_score": final_conf,
            "ai_rationale": json.dumps(structured_payload, ensure_ascii=False),
            "status": "open",
        })
        existing_keys.add((asset_id, date_str, strat_key))

    inserted_count = 0
    if rows_to_insert:
        try:
            for i in range(0, len(rows_to_insert), 50):
                chunk = rows_to_insert[i:i + 50]
                client.table("trade_signals").insert(chunk).execute()
                inserted_count += len(chunk)
            logger.info(f"Successfully inserted {inserted_count} new trade signals with full structured explainers.")
        except Exception as insert_err:
            logger.error(f"Error inserting trade_signals: {insert_err}")

    return {"inserted": inserted_count, "reconfirmed": reconfirmed_count}


def reconcile_open_signals_lifecycle(
    client,
    asset_id_map: Dict[str, str],
    asset_data: Dict[str, pd.DataFrame],
    held_asset_ids: Optional[Set[str]] = None,
    today_str: Optional[str] = None
) -> Dict[str, int]:
    """
    Evaluates open prospective signals against daily price progression.
    Protects user-held portfolio assets from auto-archival or expiration.
    Evaluates subsequent bars (bar_date > signal_date) strictly to avoid
    same-day morning dip false stop-outs.
    """
    today = today_str or datetime.date.today().isoformat()
    held_ids = held_asset_ids or set()

    # Query open portfolio positions if not provided
    if not held_ids:
        try:
            held_res = client.table("portfolio_positions").select("asset_id, quantity, is_open").eq("is_open", True).gt("quantity", 0).execute()
            if held_res.data:
                for p in held_res.data:
                    if p.get("asset_id"):
                        held_ids.add(p["asset_id"])
        except Exception as e:
            logger.warning(f"Could not check held portfolio assets: {e}")

    try:
        res = client.table("trade_signals").select("*").eq("status", "open").execute()
        open_signals = res.data or []
    except Exception as e:
        logger.error(f"Error fetching open signals for lifecycle evaluation: {e}")
        return {"stopped_out": 0, "target_hit": 0, "expired": 0}

    id_to_symbol = {v: k for k, v in asset_id_map.items()}
    stopped_count = 0
    target_count = 0
    expired_count = 0

    for sig in open_signals:
        aid = sig.get("asset_id")
        
        # USER CONSTRAINT: If user holds this stock, DO NOT AUTO-RESOLVE OR EXPIRE IT
        if aid in held_ids:
            continue

        symbol = id_to_symbol.get(aid)
        if not symbol or symbol not in asset_data:
            clean_sym = symbol.replace(".IS", "") if symbol else ""
            if clean_sym in asset_data:
                df = asset_data[clean_sym]
            elif f"{clean_sym}.IS" in asset_data:
                df = asset_data[f"{clean_sym}.IS"]
            else:
                continue
        else:
            df = asset_data[symbol]

        if df.empty:
            continue

        sig_date_str = str(sig.get("signal_date", ""))[:10]
        if not sig_date_str:
            continue

        try:
            sig_date_obj = datetime.date.fromisoformat(sig_date_str)
        except Exception:
            continue

        dates = []
        for idx in df.index:
            ts = pd.to_datetime(idx)
            if getattr(ts, "tzinfo", None) is not None:
                ts = ts.tz_localize(None)
            dates.append(ts.date())

        # Strict future check: only evaluate on bars AFTER the signal date
        future_indices = [i for i, d in enumerate(dates) if d > sig_date_obj]
        if not future_indices:
            continue

        entry = float(sig.get("entry_price") or 0)
        stop = float(sig.get("stop_loss") or 0) if sig.get("stop_loss") else None
        target = float(sig.get("target_1") or 0) if sig.get("target_1") else None

        if entry <= 0:
            continue

        strat_lower = str(sig.get("strategy", "")).lower()
        max_days = 20
        if "breakout" in strat_lower or "momentum" in strat_lower:
            max_days = 12
        elif "squeeze" in strat_lower:
            max_days = 15
        elif "reversion" in strat_lower:
            max_days = 7

        resolved = False
        for i in future_indices:
            bar = df.iloc[i]
            bar_date = dates[i]
            high = float(bar.get("high", bar["close"]))
            low = float(bar.get("low", bar["close"]))

            hit_stop = (stop is not None and low <= stop)
            hit_target = (target is not None and high >= target)

            if hit_stop and hit_target:
                pnl = ((stop - entry) / entry) * 100
                client.table("trade_signals").update({
                    "status": "stopped_out",
                    "outcome_pnl_pct": round(pnl, 2),
                    "closed_at": f"{bar_date}T18:00:00Z",
                }).eq("id", sig["id"]).execute()
                stopped_count += 1
                resolved = True
                break
            elif hit_target:
                pnl = ((target - entry) / entry) * 100
                client.table("trade_signals").update({
                    "status": "target_hit",
                    "outcome_pnl_pct": round(pnl, 2),
                    "closed_at": f"{bar_date}T18:00:00Z",
                }).eq("id", sig["id"]).execute()
                target_count += 1
                resolved = True
                break
            elif hit_stop:
                pnl = ((stop - entry) / entry) * 100
                client.table("trade_signals").update({
                    "status": "stopped_out",
                    "outcome_pnl_pct": round(pnl, 2),
                    "closed_at": f"{bar_date}T18:00:00Z",
                }).eq("id", sig["id"]).execute()
                stopped_count += 1
                resolved = True
                break

        if not resolved and len(future_indices) >= max_days:
            # Expiration
            bar_exp = df.iloc[future_indices[max_days - 1]]
            bar_date_exp = dates[future_indices[max_days - 1]]
            exit_price = float(bar_exp["close"])
            pnl = ((exit_price - entry) / entry) * 100
            client.table("trade_signals").update({
                "status": "expired",
                "outcome_pnl_pct": round(pnl, 2),
                "closed_at": f"{bar_date_exp}T18:00:00Z",
            }).eq("id", sig["id"]).execute()
            expired_count += 1

    return {"stopped_out": stopped_count, "target_hit": target_count, "expired": expired_count}
