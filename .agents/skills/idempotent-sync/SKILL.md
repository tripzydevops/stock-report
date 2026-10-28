---
name: idempotent-sync
description: Standard procedure for persisting normalized financial data into Supabase PostgreSQL with conflict keys, batch chunking, non-destructive signal reconciliation, and strict error reporting. Use whenever writing sync pipelines or database ingestors.
---

# Idempotent Database Sync Standard Operating Procedure

## Purpose
Ensures all data ingestion routines into Supabase PostgreSQL are idempotent, batch-chunked, mathematically consistent, non-destructive to active user holdings, and fail-safe.

---

## 1. Conflict Keys & Upsert Semantics
Every table insert must declare an explicit `on_conflict` constraint key so re-running jobs is completely safe and creates zero duplicates:

| Table | Conflict Key | Notes |
| :--- | :--- | :--- |
| `price_history` | `asset_id,date` | Preserves daily historical OHLCV bars. |
| `daily_indicators` | `asset_id,date` | Keeps daily technical indicator snapshots. |
| `price_snapshots` | `asset_id,snapshot_time` | Point-in-time intraday captures tied to report timestamp. |
| `stock_movements` | `asset_id,movement_time` | Analytical movement logs with indicator metadata. |
| `market_regime` | `market,date` | Macro regime status per market. |
| `fx_rates` | `pair,date` | Currency conversion rates. |

---

## 2. Mandatory Report Record Binding
- **Never sync without a registered report:**
  - `sync_all_to_supabase()` must link `report_file_id` and `snapshot_time` directly to an existing `report_files` entry.
  - If `report_record` is not passed, lookup by SHA-256 checksum first. If missing, abort immediately with `ValueError`.

---

## 3. Mathematical Consistency for Changes
- `change_pct` is close-to-previous-close: `(Close - PrevClose) / PrevClose * 100`.
- `change_amount` on `stock_movements` must reflect the identical period:
  ```python
  if chg_pct is not None and chg_pct != -100.0:
      prev_close = c / (1.0 + (chg_pct / 100.0))
      daily_chg_amt = round(c - prev_close, 4)
  ```
- Intraday change (`Close - Open`) must be preserved in the `metadata` JSONB column as `"intraday_change_amount"`.

---

## 4. Safe Non-Destructive Trade Signal Lifecycle
**CRITICAL RULE:** Never execute `client.table("trade_signals").delete().eq("status", "open")`.

1. **Key by Composite `(asset_id, strategy)`:**
   Allows multiple independent strategies to trigger for the same stock without collision.
2. **Held Stock Protection:**
   Check `portfolio_positions` for active holdings (`quantity > 0` and `is_open = true`). If a stock is held, **NEVER** archive or close its open trade signal.
3. **Re-confirmed Signals:**
   If an open signal re-triggers, keep the existing database row and initial `signal_date`. Only update `ai_rationale` with `"RE-CONFIRMED"`.
4. **Target / Stop Resolution:**
   When an unowned signal reaches its target price, stop-loss, or maximum holding days, update the existing row directly:
   `status = "target_hit" | "stopped_out"`, with `outcome_pnl_pct` and `closed_at`.
5. **New Signals:**
   Batch insert brand new triggers with chunking (e.g. 50 rows per batch).

---

## 5. Batch Chunking & Error Accountability
- Chunk all bulk inserts/upserts into batches of 100 to avoid payload timeouts.
- Define critical vs non-critical sections:
  - Critical: `price_history`, `daily_indicators`, `price_snapshots`, `stock_movements`, `trade_signals`.
- Track errors across chunks. If any critical section fails, print a summary table and raise `RuntimeError` so scheduled jobs and CI runners exit with non-zero status.
