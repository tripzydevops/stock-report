# MarketPulse: Live Dividend & Real-Time Pricing Architecture

**Platform:** MarketPulse (Tripzy.travel)  
**Author:** Lead System Architect & Senior Quantitative Developer  
**Status:** In Production (FastAPI Backend + Next.js 16 Frontend + Supabase PostgreSQL)  
**Last Updated:** November 2026  
**Verification Status:** 100% Tests Passing (147 Backend Pytest Tests, Playwright Desktop & Mobile E2E)  

---

## 1. Executive Summary & Root Cause Resolution

### 1.1 The Pricing Inaccuracy Problem
During catalog expansion to **1,303 active assets** (covering all BIST equities, TEFAS mutual and money market funds, and US equities/ETFs), users observed price inaccuracies on the Portfolio and Watchlist views:
1. **PostgREST 1,000-Row Hard Cap:** `@supabase/supabase-js` `.limit(N)` is constrained by the Supabase PostgREST server-side ceiling of 1,000 rows per single HTTP request. Because the catalog contained 1,303 assets, 303 assets were silently omitted, causing them to fall back to `100.00` or the position entry price (`avg_entry_price`), distorting P&L to 0.00%.
2. **Opening Direction Anomaly:** Corrupted ratio records on `2026-11-07` in `public.opening_direction` (e.g. `KONTR=2.67`, `FENER=2.08`, `ALTNY=10.7`) previously overwrote historical closing prices when joined naively on client load.
3. **TEFAS Mutual & Money Market Fund Pricing:** TEFAS funds lacked daily pricing due to legacy HTML endpoint deprecations.

### 1.2 The Dividend Data Gap
Previously, dividend metrics were estimated from static dictionaries limited to 44 assets. This lacked:
- Verified historical cash dividend corporate action logs.
- Dynamic trailing 12-month dividend yields based on real price movements.
- Confirmed Ex-Dividend (`ex_date`) and Payment (`payment_date`) calendar schedules for Turkish (KAP) and US corporate distributions.

---

## 2. System Architecture & Database Schema

The pipeline is integrated directly into the platform's PostgreSQL database on **Supabase** (`erzxltcalghadzfevfjx`).

```mermaid
flowchart TD
    subgraph Ingestion["Data Ingestion Engine"]
        YahooDiv["Yahoo Finance Corporate Actions API (events=div)"]
        TEFAS["TEFAS Official JSON API (/api/funds/fonFiyatBilgiGetir)"]
        YahooQuote["Yahoo Finance Real-time Quotes"]
        SyncDivScript["scripts/sync_live_dividends.mjs"]
        SyncTefasScript["scripts/sync_tefas_funds.mjs"]
        SyncBistScript["scripts/sync_missing_bist.mjs"]
        
        YahooDiv --> SyncDivScript
        TEFAS --> SyncTefasScript
        YahooQuote --> SyncBistScript
    end

    subgraph Database["Supabase PostgreSQL (Layer 3)"]
        AssetTable[("assets (1,303 active tickers)")]
        PriceTable[("price_history")]
        DivTable[("asset_dividends (11,076 verified events)")]
        PriceView[("v_latest_prices (100% price coverage)")]
        DivView[("v_dividend_summary (713 dividend payers)")]

        SyncDivScript --> DivTable
        SyncTefasScript --> PriceTable
        SyncBistScript --> PriceTable

        AssetTable --> PriceView
        PriceTable --> PriceView
        DivTable --> DivView
        PriceView --> DivView
    end

    subgraph BackendAPI["Next.js API & Services (Layer 2)"]
        DivAPI["/api/dividends (symbol / portfolio / summary)"]
        AssetsAPI["/api/assets (paginated range 0-1999)"]
        WatchlistAPI["/api/watchlist"]

        DivView --> DivAPI
        PriceView --> AssetsAPI
        PriceView --> WatchlistAPI
    end

    subgraph ClientLayer["Frontend Application (Layer 1)"]
        Page["src/app/page.tsx (Parallel Range Fetching)"]
        DivMath["src/lib/dividendForecastMath.ts"]
        DivViewUI["src/components/DividendView.tsx"]
        PortViewUI["src/components/PortfolioView.tsx"]

        AssetsAPI --> Page
        DivAPI --> Page
        Page --> DivMath
        DivMath --> DivViewUI
        DivMath --> PortViewUI
    end
```

---

## 3. Database Implementation

### 3.1 `public.asset_dividends` Table
Created to house historical and scheduled corporate cash dividends:
```sql
CREATE TABLE IF NOT EXISTS public.asset_dividends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL,
    ex_date DATE NOT NULL,
    payment_date DATE,
    record_date DATE,
    amount NUMERIC(15, 6) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
    frequency VARCHAR(20) DEFAULT 'Annual',
    is_confirmed BOOLEAN DEFAULT true,
    source VARCHAR(50) DEFAULT 'YAHOO_LIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_asset_dividend UNIQUE (asset_id, ex_date)
);

CREATE INDEX IF NOT EXISTS idx_asset_dividends_asset_id ON public.asset_dividends(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_dividends_symbol ON public.asset_dividends(symbol);
CREATE INDEX IF NOT EXISTS idx_asset_dividends_ex_date ON public.asset_dividends(ex_date DESC);
```

### 3.2 `public.v_dividend_summary` Analytical View
Computes dynamic trailing metrics, annualized yields, and most recent cash distribution per share:
```sql
CREATE OR REPLACE VIEW public.v_dividend_summary AS
WITH latest_div AS (
    SELECT DISTINCT ON (asset_id)
        asset_id,
        amount AS latest_dps,
        ex_date AS latest_ex_date,
        currency AS dividend_currency,
        frequency
    FROM public.asset_dividends
    ORDER BY asset_id, ex_date DESC
),
annual_div AS (
    SELECT
        asset_id,
        SUM(amount) AS last_365d_dividend,
        COUNT(id) AS total_dividend_events
    FROM public.asset_dividends
    WHERE ex_date >= CURRENT_DATE - INTERVAL '365 days'
    GROUP BY asset_id
)
SELECT
    a.id AS asset_id,
    a.symbol,
    a.name,
    a.market,
    a.currency,
    lp.latest_price,
    ld.latest_dps,
    ld.latest_ex_date,
    COALESCE(ad.last_365d_dividend, 0) AS last_365d_dividend,
    CASE 
        WHEN lp.latest_price > 0 AND COALESCE(ad.last_365d_dividend, 0) > 0 
        THEN ROUND((ad.last_365d_dividend / lp.latest_price * 100)::numeric, 2)
        ELSE 0
    END AS trailing_yield_pct,
    COALESCE(ad.total_dividend_events, 0) AS total_dividend_events
FROM public.assets a
LEFT JOIN public.v_latest_prices lp ON a.id = lp.asset_id
LEFT JOIN latest_div ld ON a.id = ld.asset_id
LEFT JOIN annual_div ad ON a.id = ad.asset_id
WHERE a.is_active = true 
  AND (ld.latest_dps IS NOT NULL OR ad.last_365d_dividend IS NOT NULL);
```

**Dataset Statistics:**
- Total Dividend Events Stored: **11,076 records**
- Total Dividend-Paying Assets Indexed: **713 assets**
- BIST Top Verified Payers: DOAS (22.26%), HLGYO (15.31%), FROTO (13.25%), BRYAT (12.67%), ISMEN (11.57%), ANHYT (8.63%).
- US Top Verified Payers: SOXS (16.75%), IIPR (13.86%), JEPQ (10.75%), ARCC (10.04%), VICI (7.30%), JEPI (6.87%), PFE (7.32%).

---

## 4. Ingestion Pipelines & Feed Automation

### 4.1 Official TEFAS JSON API Feed
Replaced HTML scrapers with TEFAS's official JSON API:
- **Endpoint:** `POST https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir`
- **Payload:** `{"fonKodu": "ZBJ", "dil": "TR", "periyod": 1}`
- **Coverage:** 75 mutual and money market funds indexed (`PPZ: ₺7.0998`, `KLU: ₺5.2123`, `ZBJ: ₺5.5905`, `TTE: ₺1.0077`, `MAC: ₺0.6418`, `AFT: ₺0.8799`).
- **Script:** [`frontend/scripts/sync_tefas_funds.mjs`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/frontend/scripts/sync_tefas_funds.mjs).

### 4.2 Open-Source Dividend Feed (Yahoo Finance Corporate Events)
- **Endpoint:** `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}?events=div&interval=1mo&range=5y`
- **Parsing:** Unix epoch seconds mapped to ISO `YYYY-MM-DD` strings, matching payments to `public.assets` by symbol or `.IS` suffix.
- **Batch Script:** [`frontend/scripts/sync_live_dividends.mjs`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/frontend/scripts/sync_live_dividends.mjs).

---

## 5. API Endpoint Specifications: `/api/dividends`

The Next.js dynamic API route [`frontend/src/app/api/dividends/route.ts`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/frontend/src/app/api/dividends/route.ts) provides three operational modes:

### Mode 1: Single Symbol Historical Log
- **Request:** `GET /api/dividends?symbol=KO`
- **Response:**
```json
{
  "symbol": "KO",
  "count": 20,
  "dividends": [
    {
      "id": "d7f7271e-06aa-4a37-97a9-8344fb040550",
      "symbol": "KO",
      "ex_date": "2026-09-15",
      "payment_date": "2026-09-15",
      "amount": 0.53,
      "currency": "USD",
      "frequency": "Quarterly",
      "is_confirmed": true,
      "source": "YAHOO_LIVE"
    }
  ]
}
```

### Mode 2: User Portfolio Dividend Run-Rate
- **Request:** `GET /api/dividends?portfolio=true`
- **Response:**
```json
{
  "userId": "default_user",
  "items": [
    {
      "assetId": "74174510-...",
      "symbol": "FROTO",
      "name": "Ford Otosan",
      "market": "BIST",
      "currency": "TRY",
      "shares": 50,
      "annualDps": 9.69,
      "totalAnnualIncome": 484.50,
      "latestExDate": "2026-03-16",
      "latestDps": 3.64,
      "frequency": "Semi-Annual"
    }
  ],
  "totalProjectedAnnualIncomeTRY": 12850.40,
  "totalProjectedAnnualIncomeUSD": 450.25
}
```

### Mode 3: Market-Wide Dividend Summary & Yield Rankings
- **Request:** `GET /api/dividends?summary=true&market=BIST`
- **Response:** Sorted array of assets with verified trailing yields and DPS values.

---

## 6. PostgREST 1,000-Row Pagination Workaround

Because Supabase's PostgREST enforces a server-side limit of 1,000 rows per single HTTP request, querying `.limit(2000)` silently truncates at 1,000 rows.

### The Solution:
In both [`frontend/src/app/page.tsx`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/frontend/src/app/page.tsx) and [`frontend/src/app/api/assets/route.ts`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/frontend/src/app/api/assets/route.ts), queries requesting >1,000 items execute two parallel ranged requests:
```typescript
const [p1Res, p2Res] = await Promise.all([
  supabase.from('v_latest_prices').select('...').range(0, 999),
  supabase.from('v_latest_prices').select('...').range(1000, 1999)
]);
const latestPricesData = [...(p1Res.data || []), ...(p2Res.data || [])];
```
This guarantees **100% of the 1,303 assets** are loaded into memory and client state without truncation.

---

## 7. Automated Test Verification & Quality Assurance

All verification suites have been executed and passed without errors:

| Suite | Runner | Test Count | Result |
| :--- | :--- | :--- | :--- |
| **Backend Quantitative Engines, Risk Models & Signal Lifecycles** | Pytest (`backend/tests/`) | **153 tests** | **153 Passed (100%)** |
| **Dividend Pipeline, Filter Integrity & Pricing Accuracy** | Playwright E2E (`dividend-and-prices.spec.ts`) | **4 tests** | **4 Passed (100%)** |
| **Desktop Viewport & Layout Integrity** | Playwright E2E (`desktop-view.spec.ts`) | **4 tests** | **4 Passed (100%)** |
| **Mobile Multi-Tab Layout Audit** | Playwright E2E (`mobile-all-tabs.spec.ts`) | **2 projects** (Pixel 7 & iPhone 14) | **2 Passed (100%)** |
| **Next.js Production Build** | Next.js 16.3.5 Turbopack | **13 routes** | **Compiled Successfully (Exit 0)** |

### Specific Verified Invariants:
1. `GET /api/dividends?symbol=KO`: Returns 20 historical cash distributions with positive amount and valid dates.
2. `GET /api/dividends?symbol=FROTO`: Returns 10 semi-annual payments in TRY currency.
3. `GET /api/assets?limit=2000`: Returns 1,303 assets.
   - TEFAS fund `ZBJ`: `₺5.5925` (valid range ₺4.00 - ₺10.00, not 100.00 fallback).
   - Equity `EREGL`: `₺31.06` (valid range ₺25.00 - ₺50.00).
   - Equity `AAPL`: `$342.37` (valid range >$200.00).
4. `GET /api/assets?market=BIST&limit=2000`: Returns 100% BIST assets across both page 1 and page 2 (0 filter leaks, 0 US/crypto items).
5. `DividendView.tsx`: Switches between `Portföyüm` (holding-derived payouts) and `Tüm Piyasa` (713 dividend payers) cleanly.

---

## 8. Correctness, Data Integrity & Recovery Tracking Remediation

Following an exhaustive source-code review, 8 concrete architectural and data-integrity vulnerabilities were systematically remediated:

### 8.1 Elimination of Synthetic Price Fabrication
- **Vulnerability:** `POST /api/assets` previously fabricated synthetic prices (`close: 100.0`, `volume: 100000`, invented OHLC) and inserted them into `price_history` when live quote lookup failed.
- **Remediation:** Removed synthetic price insertion entirely. When quote lookup fails, zero rows are inserted into `price_history` and the API responds with `price_status: 'unavailable'`.
- **TEFAS Quote Integration:** Integrated the official TEFAS JSON endpoint (`fetchTefasQuote`) to obtain real net asset value (NAV) prices for mutual and money market funds upon creation.

### 8.2 Deterministic Pagination & Multi-Page Filter Preservation
- **Vulnerability:** In `GET /api/assets`, requests with `limit > 1000` applied `market`, `asset_class`, and `q` search filters only to Page 1 (`range(0, 999)`), dropping filters on Page 2 (`range(1000, maxLimit - 1)`). Furthermore, `r2.error` was unhandled, and `limit` was unvalidated.
- **Remediation:** Built a centralized query constructor (`buildFilteredQuery`) that guarantees identical filter application across both pagination ranges. Added strict integer and range validation for `limit` (rejecting negative, non-integer, or non-finite inputs with HTTP 400). Handled both `r1.error` and `r2.error`.
- **Deterministic Ordering:** Applied `.order('symbol', { ascending: true })` across both pages in `/api/assets` and frontend `page.tsx` to guarantee deterministic paging across boundary lines.

### 8.3 Post-Exit Recovery Tracking Hardening
- **Target 2 Lifecycle:** Previously, trackers completed prematurely upon hitting Target 1 even when Target 2 was defined. The tracker now requires BOTH Target 1 and Target 2 to be reached before completing on milestones, keeping tracking active up to 45 sessions.
- **Initialization Idempotency:** Added a pre-existence check before tracker creation in `initialize_recovery_tracking`, preventing subsequent runs from overwriting active status or resetting milestone flags (`has_recovered_entry`, etc.).
- **Session Duration Integrity:** Eliminated the fallback fabrication of 7 sessions when the signal date is missing from price history. When the signal index cannot be resolved, `sessions_since_signal` is recorded as `None`.
- **Fail-Fast Error Handling:** Changed tracker queries in `sync_existing_closed_signals_to_recovery_tracker` to raise an explicit `RuntimeError` rather than continuing silently with incomplete tracker sets.

### 8.4 Strict Trade Geometry Validation
- **Storage Boundary Checks:** In `validate_trade_geometry`, strictly verified that `entry_price`, `stop_loss`, and `target_1` are mandatory, finite, and positive numbers.
- **LONG Invariants:** Verified `0 < stop_loss < entry_price < target_1` (and `target_2 > target_1` if defined).
- **SHORT Invariants:** Verified `0 < target_1 < entry_price < stop_loss` (and `0 < target_2 < target_1` if defined).
- **Direction Rejection:** Rejected unsupported trade directions (e.g., FLAT, NEUTRAL) with descriptive errors.

### 8.5 Mobile AbortSignal Combination Safety
- **Network Timeout Preservation:** In `supabaseClient.ts`, replaced the logic that ignored the 9-second timeout when an external `options.signal` was passed. Used `AbortSignal.any` (with a backwards-compatible event listener fallback) to trigger cancellation whenever either the mobile timeout OR the caller's cancellation signal fires.

### 8.6 Automated Daily Sync Engine for All 75 TEFAS Funds
- **Vulnerability:** Previously, mutual funds on TEFAS (e.g. `ZBJ`, `PPZ`, `KLU`) were not updated automatically by daily jobs because Yahoo Finance returns 404 for TEFAS tickers, and TEFAS platform migrated from legacy endpoints to `/api/funds/fonFiyatBilgiGetir` returning an ascending `resultList` structure.
- **Remediation Engine ([`scripts/sync_tefas_funds.py`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/scripts/sync_tefas_funds.py)):**
  - Concurrently queries the official TEFAS endpoint across all 75 indexed funds using bounded thread workers.
  - Correctly sorts chronologically ascending records, establishing previous-close as session open, and computing high, low, and volume.
  - Upserts price history bars to `public.price_history` in Supabase with `source: 'tefas'` and `observed_at: NOW()`.
  - Integrated into [`run_scheduled_job.ps1`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/run_scheduled_job.ps1) and standalone runner [`run_tefas_sync.ps1`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/run_tefas_sync.ps1).
  - Validated with dedicated Pytest test suite ([`backend/tests/test_tefas_sync.py`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/backend/tests/test_tefas_sync.py)) covering date parsing, chronological ordering, and dry-run safety (160/160 passing).

