---
name: backtesting
description: Quantitative backtesting standard for trading strategies and signals. Enforces fee modeling, slippage, out-of-sample testing, position sizing, and maximum adverse excursion (MAE/MFE) attribution. Use whenever designing, testing, or auditing trading strategies.
---

# Quantitative Backtesting Standard Operating Procedure

## Purpose
Guarantees institutional rigor in strategy development. Eliminates lookahead bias, survivorship bias, and curve-fitting by enforcing realistic execution mechanics, market frictions, and statistical validation.

---

## 1. Cardinal Backtesting Rules
1. **Never Evaluate Signals on In-Sample Live Data Alone:**
   A strategy must be validated against multi-year historical daily bars spanning at least 2 distinct market regimes (bull market, bear trend, and sideways consolidation).
2. **Account for Realistic Market Frictions:**
   - **Borsa Istanbul (BIST):**
     - Brokerage Commission: `0.20%` (20 bps) each way (entry + exit).
     - Banking and Insurance Transaction Tax (BSMV): `5%` on the brokerage commission.
     - Total Round-Trip Friction: $\approx 0.42\%$.
   - **US Equities:**
     - Commission: `$0.00` (zero-commission broker) or `$1.00` flat.
     - SEC fee: `0.00278%` on sell orders.
   - **Execution Slippage:** Model `0.10%` to `0.25%` slippage on market orders and breakout triggers.
3. **Limit-Down / Circuit Breaker Guard:**
   - On BIST, limit-down (-10%) days lock trading volume. Backtests must assume zero liquidity / impossible entry on taban days.

---

## 2. Realistic Position Sizing & Risk Budgeting
Every simulated trade must size based on capital risk, not arbitrary static share counts:
$$\text{Shares} = \left\lfloor \frac{\text{Account Capital} \times \text{Risk \%}}{|\text{Entry Price} - \text{Stop Loss}|} \right\rfloor$$
- Max Portfolio Allocation: Cap single-stock exposure at `20%` to `25%` of total portfolio equity.
- Cash Drag: Account for uninvested cash earning risk-free rate (or 0%).

---

## 3. Required Institutional Performance Metrics
Every backtest output must report:
1. **Total Trades & Win Rate (%):** $\frac{\text{Wins}}{\text{Total Trades}} \times 100$.
2. **Profit Factor:** $\frac{\sum \text{Gross Profits}}{\sum |\text{Gross Losses}|}$ (must be $\ge 1.50$ for viable strategies).
3. **Expectancy Ratio:** Average win $\times$ Win Rate $-$ Average loss $\times$ Loss Rate.
4. **Max Drawdown (MDD %):** Peak-to-trough decline in portfolio equity.
5. **Sharpe Ratio & Sortino Ratio:** Risk-adjusted returns against benchmark.
6. **MAE / MFE Analysis:**
   - Maximum Adverse Excursion (how far against us the trade went before recovery).
   - Maximum Favorable Excursion (how much profit was left on the table).

---

## 4. Train / Test Split (Out-of-Sample Validation)
- Minimum `70%` in-sample training / parameter tuning.
- Minimum `30%` out-of-sample blind testing period.
- Parameters must never be tuned on the out-of-sample period.
