# Changelog

All notable changes to the MarketPulse quantitative recommendation engine and user interface will be documented in this file.

## [2026-10-30] - Screener Explainer Pipeline Audit, Reconfirmation Isolation & Confidence Governance

### Added
- **Lossless In-Memory Handoff:** Updated `export_to_spreadsheet.py` and GitHub Actions cron workflow (`market_pulse_cron.yml`) to pass complete `raw_signals=all_trade_signals` directly into `sync_all_to_supabase()`.
- **Full Explainer JSON Excel Column:** Added dedicated JSON serialization in `build_trade_signals_sheet()` ensuring 100% round-trip recovery even when syncing from static spreadsheet files.
- **Dedicated Sync Unit Tests:** Created `backend/tests/test_sync_to_supabase.py` with 7 automated tests covering raw memory ingestion, Excel fallbacks, legacy upgrade schemas, reconfirmation isolation, and confidence scoring.

### Changed
- **Reconfirmation Isolation in Supabase Sync:**
  - Preserved original entry price, stop loss, target 1, and risk-reward ratios for existing setups.
  - Recorded subsequent strategy scans into an append-only `reconfirmations` timeline array and `latest_reconfirmation` block.
  - Prevented today's target 2 or ATR calculations from overwriting historical trade risk plans.
  - Upgraded unparsed legacy signals into structured schemas with `original_explainer_status: "legacy_unstructured"`, cleanly stripping `"RE-CONFIRMED: "` string artifacts.
- **Frontend Strategy Target 2 Precedence:**
  - `TradeCard.tsx` now renders strategy-defined `target2` directly without client-side recalculation.
  - Calculated 2R extension fallbacks are explicitly badged as `(Tahmini / Est.)` across summary strips, quick-look cards, scale-out tables, and expanded trade details.
- **Confidence Score & Star Distribution Standardization:**
  - Standardized incoming confidence metrics at the `page.tsx` boundary to a uniform 0–100 integer scale.
  - Fixed 10-star overflow in `TradeCard.tsx` using `Math.round(conf100 / 10)` (e.g. 80 maps to exactly 8 filled stars).
  - Re-labeled metric to "Güven Skoru: 8/10 (%80) / Setup Quality", clarifying that it measures rule alignment rather than uncalibrated win probability.

### Fixed
- Fixed bug where spreadsheet export discarded structured explainer fields (`trigger_reasons`, `risk`, `market_context`, `invalidation`).
- Fixed bug where Supabase sync substituted generic fallback text when syncing existing signals.
- Fixed 10-star display rendering 10 filled stars for scores like 80/100.
