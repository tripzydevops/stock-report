# Corporate Actions & Portfolio Durability Architecture

## 1. Overview & Architectural Scope

This document specifies the durability contracts, dividend entitlement rules, and the mathematical framework for handling corporate actions (forward stock splits, reverse splits, bonus share issues, rights offerings, and ticker renames) within **Tripzy / MarketPulse**.

---

## 2. Established Lifecycle Contracts (Commits `5693e41` & `b3e9dcf`)

| Scenario | Architectural Contract | Enforcement Layer |
| :--- | :--- | :--- |
| **Identical Idempotency Key** | At most one order is executed. Repeat calls return `{ success: true, deduplicated: true }` with HTTP 200. Zero duplicate positions or cash debits. | PostgreSQL partial unique index `(user_id, order_ref)` + RPC `execute_portfolio_holding_and_order` atomic check. |
| **Distinct Idempotency Keys** | Distinct legitimate orders execute immediately without arbitrary time gating (no 30s similarity window). | Direct transactional execution in PostgreSQL. |
| **Dividend Sync Repeats** | Repeat executions credit 0 additional transfers once credited. | PostgreSQL partial unique index `portfolio_transfers_user_dividend_tag_idx` on `(user_id, [DIVIDEND:<symbol>:<ex_date>])`. |
| **Dividend Entitlement** | If order rows exist for the symbol, the order ledger is the **sole source of truth**. Orders with `executed_at < ex_date` (normalized to `Europe/Istanbul`) net buys against sells. Position quantity fallback is strictly reserved for legacy rows with zero order history. | `frontend/src/lib/serverlessDividendSync.ts` |
| **Transient Failures (429, 5xx)** | Exponential backoff across 4 tiers: `[1m, 5m, 15m, 1h]`, capped at `MAX_MUTATION_RETRIES = 4`. Automated 60-second scheduler drains due mutations while online. | `frontend/src/app/page.tsx` lifecycle hook. |
| **Permanent Failures (4xx)** | Deterministic errors (e.g. `Insufficient shares`, `Invalid price`) are marked `FAILED`, saved to `marketpulse_failed_mutations`, and rendered in a persistent, actionable portfolio banner with `[Retry]` and `[Discard]`. | `frontend/src/components/PortfolioView.tsx` |

---

## 3. Corporate Actions: Known Limitations & Roadmap

### 3.1 The Split / Dividend Interaction Edge Case
Currently, dividend entitlement is computed by summing filled buys minus sells before the ex-date:
$$\text{Entitled Shares} = \sum_{\substack{\text{BUY} \\ t < t_{\text{ex}}}} q_i - \sum_{\substack{\text{SELL} \\ t < t_{\text{ex}}}} q_j$$

**Current Known Limitation:**
If a corporate action (e.g., a 2-for-1 forward stock split or a 100% *bedelsiz sermaye artırımı*) occurs between an order execution date and the dividend ex-date:
- Historical orders record pre-split quantities (e.g., 100 shares @ ₺200).
- The corporate action multiplies held shares (e.g., to 200 shares @ ₺100).
- The dividend per share ($DPS$) announced by the exchange reflects post-split capital.
- Without a corporate action adjustment layer, raw order summation produces an unadjusted share count (100 shares instead of 200 shares).

---

## 4. Mathematical Specification for Corporate Actions Engine

To maintain pure ledger immutability (never rewriting historical orders), corporate actions are modeled as **cumulative split factor adjustments** per symbol and effective date.

### 4.1 Split Factor Definition
For a corporate action event on date $t_{\text{split}}$ with split ratio $R = \frac{N_{\text{new}}}{N_{\text{old}}}$:

| Action Type | Example Ratio $R$ | Effect on Share Count | Effect on Cost Basis |
| :--- | :--- | :--- | :--- |
| **Forward Split (US)** | 2-for-1 $\implies R = 2.0$ | $q_{\text{adj}} = q \times 2.0$ | $P_{\text{adj}} = \frac{P}{2.0}$ |
| **Bedelsiz Sermaye Artırımı (BIST)** | %100 Bedelsiz $\implies R = 2.0$ | $q_{\text{adj}} = q \times (1 + 1.0) = 2.0$ | $P_{\text{adj}} = \frac{P}{2.0}$ |
| **Reverse Split (US)** | 1-for-10 $\implies R = 0.10$ | $q_{\text{adj}} = q \times 0.10$ | $P_{\text{adj}} = P \times 10.0$ |

### 4.2 Adjusted Dividend Entitlement Formula
Let $\mathcal{C}_{\text{sym}}$ be the set of corporate action split ratios $R_k$ occurring at dates $t_k$ such that $t_{\text{order}} \le t_k < t_{\text{ex}}$.

The adjusted order quantity $q_i^*$ on ex-date $t_{\text{ex}}$ is:
$$q_i^* = q_i \times \prod_{\substack{k \in \mathcal{C}_{\text{sym}} \\ t_i \le t_k < t_{\text{ex}}}} R_k$$

The final entitlement on $t_{\text{ex}}$ is:
$$\text{Entitled Shares}^* = \sum_{\substack{\text{BUY} \\ t_i < t_{\text{ex}}}} q_i^* - \sum_{\substack{\text{SELL} \\ t_j < t_{\text{ex}}}} q_j^*$$

### 4.3 Reverse-Split Ratio Validation & Data-Entry Safeguard
A reverse stock split consolidates existing shares into fewer shares.
- Example: A 1-for-10 reverse split must be stored with fractional multiplier $R = 0.10$.
- **Database CHECK Constraint:** PostgreSQL strictly enforces:
  ```sql
  CONSTRAINT corporate_actions_reverse_split_ratio_check 
  CHECK (action_type != 'REVERSE_SPLIT' OR split_ratio < 1.0)
  ```
- **Application Safeguard:** If an inverted ratio ($R > 1.0$, such as $10.0$ entered instead of $0.10$) is detected during runtime evaluation, `calculateAdjustedEntitlement` automatically logs a warning and sanitizes the ratio to $\frac{1.0}{R}$ ($0.10$), preventing an accidental 10x multiplication of user holdings.

---

## 5. Schema Specification for `corporate_actions`

```sql
CREATE TABLE IF NOT EXISTS public.corporate_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL,
    action_type VARCHAR(32) NOT NULL CHECK (action_type IN ('FORWARD_SPLIT', 'REVERSE_SPLIT', 'STOCK_SPLIT', 'BONUS_ISSUE', 'RIGHTS_OFFERING', 'TICKER_CHANGE')),
    split_ratio NUMERIC NOT NULL CHECK (split_ratio > 0),
    record_date DATE NOT NULL,
    effective_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT corporate_actions_symbol_date_key UNIQUE (symbol, effective_date, action_type),
    CONSTRAINT corporate_actions_reverse_split_ratio_check CHECK (action_type != 'REVERSE_SPLIT' OR split_ratio < 1.0)
);

CREATE INDEX IF NOT EXISTS corporate_actions_symbol_date_idx 
ON public.corporate_actions (symbol, effective_date);
```

---

## 6. Legacy Dividend Transfer Tag Tradeoff & Planned Migration

### 6.1 The Legacy Tag Tradeoff
The dividend sync engine enforces deduplication via:
```typescript
if (existingTags.has(tagKey) || existingTags.has(legacyTagKey)) {
  summary.skippedCount++;
  continue;
}
```
- **Why this rule is conservative & safe:** Legacy unscoped transfer tags (`[DIVIDEND:<symbol>:<ex_date>]`) predate the introduction of `portfolio_id`. If a user previously received a dividend transfer before portfolio scoping was introduced, blocking new credits across all portfolios prevents duplicate cash payouts.
- **Known Migration Limitation:** If a user subsequently creates multiple separate portfolios and the legacy credit belonged to only one of them, another portfolio holding the same asset could be skipped / under-credited by the legacy tag guard.
- **Planned One-Time Migration:** To cleanly resolve this limitation without sacrificing idempotency, a database migration script will:
  1. Inspect legacy transfers with notes matching `[DIVIDEND:<symbol>:<ex_date>]`.
  2. Resolve the original position's `portfolio_id` based on user holding records.
  3. Rewrite the tag note into the scoped format `[DIVIDEND:<portfolio_id>:<symbol>:<ex_date>]` and populate `portfolio_transfers.portfolio_id`.

---

## 7. Paper Trading Readiness Checklist

- [x] Database-enforced atomic order idempotency (`portfolio_orders_user_order_ref_idx`).
- [x] Idempotent dividend credits via unique tag constraints (`portfolio_transfers_user_dividend_tag_idx`).
- [x] Timezone-normalized Europe/Istanbul calendar date resolution.
- [x] Multi-portfolio future-proofing with `portfolio_id` columns on positions and orders.
- [x] Offline queue with exponential backoff (`1m, 5m, 15m, 1h`) and 60-second auto-retry scheduler.
- [x] Persistent actionable failed-action banner with `[Retry]` and `[Discard]`.
- [x] 100% test teardown restoring positions and auto-deposits cleanly.
- [x] Corporate action roadmap, reverse-split ratio validation, and mathematical adjustment formulas formalized.
- [x] Documented legacy-tag deduplication tradeoff and planned migration path.
