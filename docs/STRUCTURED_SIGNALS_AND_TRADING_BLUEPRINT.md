# MarketPulse: Structured Signal Architecture & Trading Blueprint

**Platform:** MarketPulse (Tripzy.travel)  
**Author:** Quantitative Architecture & Engineering Team  
**Date:** October 30, 2026  
**Status:** Deployed in Production (Backend FastAPI + Next.js Frontend)  

---

## 1. Executive Summary & Non-Black-Box Philosophy

In modern algorithmic trading, typical AI and machine-learning recommendation tools behave as opaque "black boxes," delivering numerical probabilities without explaining the underlying structural market thesis. When market conditions shift into volatility or index corrections, traders who do not understand why a position was opened either panic sell at market troughs or fail to honor stop-losses when setups are invalidated.

**MarketPulse** eliminates the black box entirely. Every trade signal generated across our 9 quantitative strategies is backed by:
1. **Verifiable Quantitative Triggers:** An explicit, itemized checklist of exact rules satisfied (e.g. price reclaim, moving average confirmation, volume expansion, wick closure).
2. **Deterministic Invalidation Rules:** The exact technical event that dismantles the setup thesis *before* a hard stop-loss is hit.
3. **Structured Multi-Tier Execution:** A disciplined execution roadmap featuring Next-Open entry, Target 1 (+1.25R) 50% scale-out with stop moved to Breakeven, and Target 2 (+2.25R) trend runner.
4. **Adaptive Market Regimes:** Decoupled risk guards specifically calibrated for the distinct market dynamics of Borsa Istanbul (BIST) vs. US Equities (Midas).

---

## 2. Structured Signal Data Contract

Every strategy signal adheres to the standardized Pydantic data schema defined in `signal_explainer.py`:

```json
{
  "signal_id": "PULLBACK_RECLAIM_ASELS_2026-10-29",
  "symbol": "ASELS",
  "market": "BIST",
  "strategy": "Pullback Reclaim",
  "direction": "LONG",
  "signal_date": "2026-10-29",
  "entry_price": 358.50,
  "entry_mode": "next_open",
  "stop_loss": 341.20,
  "target_1": 393.10,
  "target_2": 427.70,
  "t0_target": 369.25,
  "risk_reward_ratio": 2.0,
  "confidence_score": 85.0,
  "trigger_reasons": [
    "Close 4.2% below 20-day high (controlled pullback depth)",
    "Pullback lasted 2 sessions (ideal 1-5 day consolidation)",
    "Close reclaimed prior-day high (358.50 > 354.00)",
    "Close reclaimed EMA20 (358.50 > 351.20)",
    "Close finished in upper 35% of daily range (strong buyer absorption)",
    "Volume was 1.8x its 20-day average (institutional demand confirmed)"
  ],
  "failed_checks": [],
  "invalidation": "Daily close below EMA20 (351.20) or a break of pullback swing low (341.20) cancels the trade thesis.",
  "market_context": {
    "bist_regime": "Neutral / Sideways (Selective Stock Picking)",
    "trend_alignment": "Stage 2 Bullish (Close > EMA50 > EMA200)",
    "relative_strength": "Outperforming XU100 (+2.4% vs benchmark)",
    "volume_surge": "1.8x 20-day average volume",
    "support_level": 341.20,
    "distance_to_stop": "4.82%"
  },
  "risk": {
    "risk_amount": 17.30,
    "risk_percent": 4.82,
    "atr_14": 9.40,
    "reward_target_1": 34.60,
    "reward_target_2": 69.20
  },
  "rationale": "High-probability pullback reclaim in a Stage 2 uptrend. Buyers defended EMA20 on above-average volume, confirming institutional support."
}
```

---

## 3. The 9 Core Strategy Explainer Builders

MarketPulse implements dedicated explainer builders in [`backend/app/services/signal_explainer.py`](file:///C:/Users/elif/.gemini/antigravity/scratch/market-pulse/backend/app/services/signal_explainer.py) across all 9 screening engines:

| Strategy | Primary Trigger Criteria | Invalidation Rule |
| :--- | :--- | :--- |
| **1. Pullback Reclaim** | Stage 2 trend, 2.5%–7.0% pullback from 20d high, close reclaims prior-day high & EMA20 on $>1.2\times$ volume with upper 35% close. | Daily close below EMA20 or break of pullback swing low. |
| **2. Momentum Breakout** | Close breaking 20-day high on $\ge 1.8\times$ average volume, RSI between 55 and 75. | Close back inside prior consolidation range or below breakout day low. |
| **3. Trend Pullback (50 EMA)** | Price retesting within 1.5% of rising EMA50, bullish hammer or green candle bounce. | Decisive daily close below EMA50 with rising volume. |
| **4. Mean Reversion** | Extreme oversold RSI ($< 30$), price extended below lower Bollinger Band, bullish reversal bar. | Lower low below panic candle low; circuit breaker floor trap. |
| **5. Volatility Squeeze** | Bollinger Bands contracting inside Keltner Channels for $\ge 5$ bars, momentum histogram turning positive. | Breakout in opposite direction breaking channel opposite band. |
| **6. Fund Momentum** | Heavy net institutional accumulation, CMF $> +0.15$, consecutive days of expanding on-balance volume. | CMF flipping negative ($< -0.05$) with heavy block selling. |
| **7. Anchored VWAP Bounce** | Price bouncing off VWAP anchored from major swing pivot with increasing volume. | Daily close below Anchored VWAP pivot level. |
| **8. Liquidity Sweep** | Intraday stop hunt piercing prior support followed by rapid reclaim closing above support. | Failure to hold swept support line into subsequent session. |
| **9. Relative Strength Leader** | Asset gaining while local benchmark (`XU100` or `SPY`) declines; RS line making new highs. | Breakdown of RS line below its 20-period moving average. |

---

## 4. Multi-Tier Execution & Target Scaling Protocol

Traditional all-or-nothing trading forces investors into emotional dilemmas: sell too early and miss the multi-month runner, or hold too long and watch profits evaporate. MarketPulse enforces a structured 3-stage execution plan:

```mermaid
flowchart LR
    Entry["Next Open Entry\n(100% Position)"] --> T1{"Target 1 (+1.25R)\nHit?"}
    T1 -- Yes --> Scale1["Scale Out 50% Profit\nMove Stop to Breakeven\n(Risk-Free Trade)"]
    Scale1 --> T2{"Target 2 (+2.25R)\nHit?"}
    T2 -- Yes --> Scale2["Sell Remaining 50%\nOr Trail Stop with EMA20"]
    T1 -- No --> StopCheck{"Invalidation / Stop\nTriggered?"}
    StopCheck -- Yes --> CutLoss["Preserve Capital\nExit with Discipline"]
```

### Key Execution Rules:
1. **Entry Mode (`next_open`):**
   - Trades are not chased on intraday spikes. Signals generate after market close and are executed at the opening session auction or via limit order near the prior close.
2. **Target 1 (+1.25R Scale-Out):**
   - At $+1.25R$ (typically $+4.5\%$ to $+8.0\%$ depending on ATR), **50% of the position is closed to lock in guaranteed profit**.
   - Concurrently, the stop-loss on the remaining shares is moved up to the entry price (Breakeven). The trade is now mathematically zero-risk.
3. **Target 2 (+2.25R Runner):**
   - The remaining 50% shares ride the macro trend wave to $+2.25R$ (typically $+10\%$ to $+22\%$), or until price closes below trailing EMA20.
4. **T0 Quick Profit Target (+3.0%):**
   - Short-term swing and day-traders can take partial profits at $+3.0\%$ to rapidly recycle capital into new opportunities.

---

## 5. Adaptive Market Dynamics: BIST vs. US Equities

Market microstructures in Istanbul and New York differ drastically. MarketPulse automatically decouples parameters based on the asset's primary exchange:

| Dynamic Dimension | 🇹🇷 BIST (Borsa İstanbul) | 🇺🇸 US Equities / ETFs (Midas) |
| :--- | :--- | :--- |
| **Daily Price Limits** | Strictly capped at $+/-10\%$ daily circuit breaker bands. | No daily price bands; unlimited daily price volatility. |
| **Stop Loss Sizing** | Dynamic ATR stop ($2.0\times\text{ATR}$ or 4%–6%) placed to prevent lock-limit traps before circuit breakers trigger. | $2.0\times\text{ATR}$ stop with an 8% maximum initial risk cap. |
| **Pullback Duration** | 1 to 5 trading sessions (rapid domestic retail/speculator cycles). | 1 to 6 trading sessions (institutional fund accumulation pace). |
| **Earnings Volatility** | Quarterly disclosures with gradual adjustments. | Binary earnings events with severe overnight gap risk ($> \pm 15\%$). Automated pre-earnings filters suppress setups 5 days prior to earnings. |
| **Target Projections** | Calibrated to single-day ceiling limits (Target 1 within $+6\% \text{ to } +9\%$). | Extended runner targets ($+2.25R \text{ to } +3.5R$) for tech/semiconductor leaders (`NVDA`, `AAPL`, `MSFT`). |
| **Benchmark Reference** | `XU100.IS` for market regime and RS leader filtering. | `SPY` (S&P 500) for market regime and RS leader filtering. |

---

## 6. Frontend Presentation & Help Center Integration

### 6.1 TradeCard Component (`TradeCard.tsx`)
- **Interactive "Why & Plan" Accordion:** Clean, expandable drawer with 1-tap toggle.
- **Why It Fired Checklist:** Visual green checkmark badges displaying each passing rule.
- **Trade Execution Plan:** Step-by-step cards showing Entry Mode, Target 1 (+1.25R scale-out), Target 2 (+2.25R runner), Distance to Stop, and Invalidation Rule.
- **Mobile Responsive:** Zero horizontal overflow across all smartphone displays (Pixel 7, iPhone 14/15/16).

### 6.2 Help Center Knowledge Base (`HelpCenterView.tsx`)
- Dedicated **`🎯 Sinyal & İşlem Planı`** interactive walkthrough tab.
- **3-Pillars Breakdown** of algorithmic reasoning, scale-out execution, and thesis invalidation.
- **Adaptive Regimes Comparison Card** explaining BIST vs. US risk mechanics.
- **Searchable FAQs** answering the top user questions on signals, invalidation rules, and multi-tier exits.

---

## 7. Automated Testing & Verification Suite

- **Backend Pytest:** 107/107 tests passing (`backend/tests/test_signal_explainer.py` covering schema validity, all 9 strategies, edge cases, and zero-history handling).
- **Frontend Next.js Build:** Turbopack production build passing cleanly (`next build`) with strict TypeScript type-checking.
- **Frontend Playwright E2E:** 7/7 mobile tests passing (`tests/mobile-view.spec.ts` & `tests/mobile-tradecard.spec.ts`).
