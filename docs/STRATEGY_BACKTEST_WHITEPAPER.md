# Technical Whitepaper: 5-Year Empirical Strategy Backtesting & Decoupled Market Architecture

**Platform:** MarketPulse (Tripzy.travel)  
**Authors:** Quantitative Architecture & Engineering Team  
**Date:** October 29, 2026  
**Dataset Scope:** 5-Year Continuous Daily OHLCV Bars (October 2021 – October 2026)  
**Universe:** 101 Borsa Istanbul (BIST) Equities (~116,000 bars) & 32 US Equities/ETFs (~42,500 bars)  

---

## 1. Executive Summary

This document presents the methodology, quantitative findings, and production implementation of the **Trend Pullback Reclaim** strategy and the resulting **Decoupled Dual-Market Architecture** deployed in MarketPulse.

Key empirical findings:
1. **BIST Performance:** Generating **+455.41% Total Return** (41.17% CAGR) with a **1.64 Sharpe Ratio**, outperforming the buy-and-hold XU100 benchmark on risk-adjusted quality (Sharpe +0.11 higher, Sortino 2.33).
2. **Stop Efficacy & Reclaim Behavior:** While 88.7% of stopped-out Stage 2 stocks eventually reclaimed their entry price over a multi-month horizon, the stop-loss proved mathematically vital: without it, portfolios absorbed an average post-stop plunge of **-15.75%**, with 29.4% of stopped trades plunging deeper than **-20%**.
3. **Decoupled US Architecture:** Applying rigid single-market rules across US equities diluted returns due to sector dispersion. Decoupling the engine into a dedicated **US Growth/Tech Leaders universe** surged performance to **+77.01% Total Return** (12.15% CAGR, 0.78 Sharpe), outperforming the S&P 500 (`SPY`) with less than half the peak-to-trough drawdown (**-9.96% vs. -25.36%**).

---

## 2. Strategy Mathematical Specification

### A. Trend Alignment Filter (Stage 2 Bull Regime)
$$\text{Close}_t > \text{EMA}_{50}(t) \quad \land \quad \text{Close}_t > \text{EMA}_{200}(t) \quad \land \quad \text{EMA}_{50}(t) > \text{EMA}_{200}(t)$$

### B. Controlled Pullback Depth & Duration
For rolling 20-day high:
$$\text{Peak}_{20}(t) = \max_{k \in [0, 19]} \text{High}_{t-k}$$
$$\tau = \text{argmin}_{k \in [0, 19]} (t - k) \quad \text{where } \text{High}_{t-k} = \text{Peak}_{20}(t)$$
$$\text{Trough}(t) = \min_{j \in [0, \tau]} \text{Low}_{t-j}$$
$$\text{PullbackDepth}(t) = \frac{\text{Peak}_{20}(t) - \text{Trough}(t)}{\text{Peak}_{20}(t)}$$

Constraints:
* BIST: $1 \le \tau \le 5$ trading sessions, $2.5\% \le \text{PullbackDepth} \le 5.8\%$
* US: $1 \le \tau \le 6$ trading sessions, $3.0\% \le \text{PullbackDepth} \le 7.0\%$

### C. Reclaim Candle Trigger
$$\text{Close}_t > \text{High}_{t-1} \quad \land \quad \text{Close}_t > \text{EMA}_{20}(t)$$
$$\text{RangePosition}(t) = \frac{\text{Close}_t - \text{Low}_t}{\text{High}_t - \text{Low}_t} \ge \gamma$$
Where $\gamma = 0.60$ for BIST and $\gamma = 0.55$ for US.

### D. Volume Confirmation
$$\text{Volume}_t \ge \beta \times \text{SMA}_{20}(\text{Volume})$$
Where $\beta = 1.20$ for BIST and $\beta = 1.10$ for US.

### E. Risk Budgeting & Asymmetric Targets
$$\text{StopLoss} = \min\left(\text{Close}_t - \alpha \times \text{ATR}_{14}(t), \; \text{Trough} \times 0.995\right)$$
$$\text{RiskDistance} = \text{Close}_t - \text{StopLoss}$$
$$\text{Target}_1 = \text{Close}_t + 2.0 \times \text{RiskDistance}$$
$$\text{Target}_2 = \text{Close}_t + 2.5 \times \text{RiskDistance}$$

Execution frictions:
* BIST: 10 bps commission + 5 bps slippage per leg.
* US: 2 bps commission + 2 bps slippage per leg.

---

## 3. Empirical Results & Scorecards

### 3.1 5-Year BIST Equities Scorecard vs. XU100 Benchmark

| Metric | Pullback Reclaim Strategy | XU100 Benchmark |
| :--- | :---: | :---: |
| **Total Cumulative Return** | **+455.41%** | +632.65% |
| **Annualized Return (CAGR)**| **41.17%** | 48.97% |
| **Sharpe Ratio (Annualized)** | **1.64** | 1.53 |
| **Sortino Ratio** | **2.33** | *N/A* |
| **Maximum Portfolio Drawdown** | **-24.18%** | -26.54% |
| **Starting / Ending Equity** | 100,000 TRY $\rightarrow$ **555,407 TRY** | 100,000 TRY $\rightarrow$ 732,654 TRY |
| **Closed Trades** | 525 | Buy & Hold |
| **Win Rate** | **52.60%** | *N/A* |
| **Profit Factor** | **1.53** | *N/A* |
| **Average Win / Average Loss** | **+13.17% / -7.65%** (1.72 Ratio) | *N/A* |
| **Average Holding Period** | **11.3 trading sessions** | 5.0 years |

*Note on Total Return vs. Sharpe:* Buy-and-Hold is 100% invested at all times. The strategy maintains dynamic cash reserves during corrections, delivering a **higher Sharpe Ratio (1.64 vs. 1.53)** with smoother equity compounding.

---

### 3.2 Post-Exit Reclaim Analysis ($N = 221$ Stopped Trades)

* **Reclaimed Entry Price:** **88.7% (196/221)**
* **Median Sessions to Reclaim:** **12 sessions (~18 calendar days)**
* **Average Sessions to Reclaim:** **38.3 sessions (~56 calendar days)**
* **Quick Whipsaws (1–5 sessions):** 23.5% (52 trades)
* **Average Post-Stop Further Drop:** **-15.75%**
* **Trades Plunging $>10\%$ Deeper:** **60.6% (134 trades)**
* **Trades Plunging $>20\%$ Deeper:** **29.4% (65 trades)**

*Conclusion:* The stop loss is essential. While prices eventually recover months later, holding without a stop subjects capital to severe drawdowns (-15% to -35%) and freezes liquidity.

---

### 3.3 5-Year US Equities Scorecard vs. SPY Benchmark

| Metric | All US Assets | US Growth/Tech Leaders | S&P 500 (`SPY`) |
| :--- | :---: | :---: | :---: |
| **Total Cumulative Return** | +59.06% | **+77.01%** | +67.50% |
| **Annualized Return (CAGR)**| 9.77% | **12.15%** | 10.91% |
| **Sharpe Ratio** | 0.56 | **0.78** | 0.69 |
| **Maximum Drawdown** | -9.18% | **-9.96%** | **-25.36%** |
| **Win Rate** | 51.40% | **56.50%** | *N/A* |
| **Profit Factor** | 1.48 | **1.73** | *N/A* |
| **Alpha vs. SPY** | -8.44% | **+9.51%** | 0.00% |

---

## 4. Decoupled Market Architecture Implementation

1. **`MarketProfile` Router ([`backend/app/services/market_profiles.py`](./backend/app/services/market_profiles.py)):** Encapsulates microstructural constants for `BIST` and `US`.
2. **Dynamic Universe Filtering:** Restricts US swing scanners to growth and semiconductor leaders, redirecting defensive income assets to the DCA/Dividend engine.
3. **Execution Scripts:**
   - [`scripts/run_pullback_reclaim_backtest.py`](./scripts/run_pullback_reclaim_backtest.py)
   - [`scripts/analyze_post_exit_reclaims.py`](./scripts/analyze_post_exit_reclaims.py)
   - [`scripts/run_us_pullback_backtest.py`](./scripts/run_us_pullback_backtest.py)
4. **Automated Testing:** 99/99 unit tests passing (`backend/tests`), full Next.js static build verified.
