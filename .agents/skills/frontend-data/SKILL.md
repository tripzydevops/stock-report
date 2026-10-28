---
name: frontend-data
description: Next.js and React data layer standard for MarketPulse. Enforces TypeScript types, Supabase client scoping, dual-source fallback, optimistic updates, date-range filtering, and mobile-first responsive layout. Use whenever building or editing React components, hooks, or pages.
---

# Frontend Data Layer & UI Standard Operating Procedure

## Purpose
Enforces high-performance, strictly typed, mobile-responsive, and resilient data handling across the Next.js and React frontend of MarketPulse.

---

## 1. Multi-Tenant User Scoping & Model Portfolio Fallback
In [`frontend/src/app/page.tsx`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/frontend/src/app/page.tsx) and all components:
1. **Authenticated Users:**
   - Scope queries strictly to `user_id = user.id`.
2. **Demo / Unauthenticated / Cold Start Users:**
   - Query the default Model Portfolio where `user_id IS NULL`.
   - Never show an empty screen or blank portfolio to a new user; gracefully fall back to the Model Portfolio.

```typescript
let query = supabase
  .from('portfolio_positions')
  .select('*, assets(symbol, name, market)')
  .eq('is_open', true)
  .order('created_at', { ascending: true });

if (user && !isDemoMode) {
  query = query.eq('user_id', user.id);
} else {
  query = query.is('user_id', null);
}
```

---

## 2. Dynamic Cash Calculation Rule
**User Rule:** Never hardcode cash balances. Calculate available cash strictly via the dynamic ledger:
$$\text{Available Cash} = \sum \text{Deposits} + \sum \text{Sells} - \sum \text{Buys} - \sum \text{Withdrawals}$$
Always use `calculateLedgerCash(orders, transfers, usdTryRate)`.

---

## 3. Date Filtering Standard
All historical views (Trade Signals, Outcomes, Orders, Transfers, Scorecards) must integrate with [`DateRangeFilter`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/frontend/src/lib/dateFilter.ts):
- Presets: `ALL`, `TODAY`, `7D`, `30D`, `90D`, `YTD`, or Custom Date Range.
- Always filter using `isDateInRange(itemDate, dateFilter)` before rendering.

---

## 4. UI/UX & Responsive Layout Rules
1. **Tailwind CSS Only:** No raw inline CSS styles or un-themed classes.
2. **Mobile-First Design:**
   - Navigation collapses into `MobileBottomNav` and drawer for screen width $< 768px$.
   - Tables horizontally scrollable on mobile (`overflow-x-auto`).
   - Cards flex-fluid: Use `flex-1 min-w-0` rather than rigid column widths to prevent squishing when sidebars collapse.
3. **Optimistic Updates & Feedback:**
   - When user triggers a trade, toggle, or transfer, immediately update local React state.
   - Show clear feedback toasts with error recovery if the Supabase RPC/REST call fails.
4. **Strict TypeScript:**
   - Never use `any` unless mapping raw untyped Supabase payloads.
   - Run `npx tsc --noEmit` before committing any frontend code.
