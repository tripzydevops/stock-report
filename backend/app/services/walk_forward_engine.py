"""
MarketPulse — Institutional Walk-Forward Backtesting & Confidence Calibration Engine
====================================================================================
Architectural Principles:
1. Strict Out-of-Sample (OOS) Walk-Forward Folds:
   - Tests strategy durability across non-overlapping market regimes (bull, bear, sideways).
   - Eliminates curve-fitting and lookahead bias.
2. Realistic Microstructure Friction:
   - Employs InstitutionalBacktestEngine (next-open execution, slippage bps, commissions bps,
     50%/50% dual-target scale-out, gap-aware stops, and intraday tie-breaking).
3. Empirical Bayesian Confidence Calibration:
   - Converts arbitrary static heuristic conviction labels (e.g. fixed 85.0) into
     empirically calibrated posterior win probabilities smoothed with uninformative priors:
     P(Win | Strategy) = (Wins + alpha) / (Trades + alpha + beta)
   - Scales confidence by realized profit factor and expectancy.
"""

import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple, Any
import numpy as np
import pandas as pd

from app.models.schemas import (
    BacktestConfig,
    BacktestResult,
    WalkForwardFoldResult,
    WalkForwardReport,
)
from app.services.backtesting_engine import InstitutionalBacktestEngine
from app.services.indicators import compute_all_indicators
from app.services.confidence_calibrator import StrategyConfidenceCalibrator
from app.services.screener import (
    screen_momentum_breakout,
    screen_trend_pullback,
    screen_volatility_squeeze,
    screen_mean_reversion,
    screen_fund_momentum,
    screen_connors_rsi2_rebound,
)

logger = logging.getLogger("walk_forward_engine")


def compute_deflated_sharpe_ratio(
    trade_pnls: List[float],
    num_trials: int = 5,
    benchmark_sharpe: float = 0.0,
    annual_trades: float = 250.0
) -> Tuple[float, float]:
    """
    Computes Annualized Sharpe Ratio and Marcos López de Prado's Deflated Sharpe Ratio (DSR).
    DSR tests the null hypothesis that true SR <= benchmark_sharpe after adjusting for
    skewness, kurtosis, and selection bias over multiple strategy trials.
    """
    if len(trade_pnls) < 10:
        return 0.0, 0.50
    arr = np.array(trade_pnls, dtype=float)
    mean_pnl = float(np.mean(arr))
    std_pnl = float(np.std(arr, ddof=1))
    if std_pnl < 1e-8:
        return 0.0, 0.50

    # Per-trade Sharpe annualized
    ann_factor = np.sqrt(annual_trades)
    sr = (mean_pnl / std_pnl) * ann_factor

    # Skewness & Kurtosis
    z = (arr - mean_pnl) / std_pnl
    skew = float(np.mean(z ** 3))
    kurt = float(np.mean(z ** 4))

    # Variance of the estimated Sharpe Ratio under non-normality
    n = len(arr)
    var_sr = (1.0 - skew * (sr / ann_factor) + ((kurt - 1.0) / 4.0) * ((sr / ann_factor) ** 2)) / max(1, n - 1)
    std_sr = np.sqrt(max(1e-9, var_sr)) * ann_factor

    # Expected Maximum Sharpe Ratio under null hypothesis given M trials (Euler-Mascheroni constant)
    em = 0.5772156649
    m = max(1, num_trials)
    if m > 1:
        sr_star = benchmark_sharpe + (np.sqrt(2.0 * np.log(m)) + em / np.sqrt(2.0 * np.log(m))) * (std_sr * 0.1)
    else:
        sr_star = benchmark_sharpe

    z_stat = (sr - sr_star) / max(1e-8, std_sr)
    # Standard normal CDF using math.erf
    dsr = 0.5 * (1.0 + math.erf(z_stat / np.sqrt(2.0)))

    return round(float(sr), 2), round(float(np.clip(dsr, 0.0, 1.0)), 4)


class InstitutionalWalkForwardEngine:
    """
    Executes walk-forward cross-validation across multi-year historical data.
    """

    def __init__(self, config: Optional[BacktestConfig] = None):
        self.config = config or BacktestConfig()
        self.calibrator = StrategyConfidenceCalibrator()

    @staticmethod
    def generate_walk_forward_windows(
        all_dates: List[pd.Timestamp],
        train_months: int = 18,
        test_months: int = 6,
        step_months: int = 6
    ) -> List[Tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp, pd.Timestamp]]:
        """
        Generates rolling / anchored (train_start, train_end, test_start, test_end) date tuples.
        """
        if len(all_dates) == 0:
            return []

        start_date = all_dates[0]
        end_date = all_dates[-1]

        windows = []
        current_train_start = start_date

        while True:
            train_end = current_train_start + pd.DateOffset(months=train_months)
            test_start = train_end + pd.DateOffset(days=1)
            test_end = test_start + pd.DateOffset(months=test_months)

            if test_start >= end_date:
                break

            # Bound test_end by the latest available date
            if test_end > end_date:
                test_end = end_date

            # Ensure we have data points in both intervals
            train_points = [d for d in all_dates if current_train_start <= d <= train_end]
            test_points = [d for d in all_dates if test_start <= d <= test_end]

            if len(train_points) >= 30 and len(test_points) >= 15:
                windows.append((train_points[0], train_points[-1], test_points[0], test_points[-1]))

            # Advance rolling window
            current_train_start = current_train_start + pd.DateOffset(months=step_months)
            if current_train_start >= end_date:
                break

        return windows

    def scan_historical_signals_on_dates(
        self,
        clean_history: Dict[str, pd.DataFrame],
        dates_to_scan: List[pd.Timestamp],
        asset_info: Optional[Dict[str, Dict]] = None,
        market: str = "BIST"
    ) -> List[Dict[str, Any]]:
        """
        Evaluates whitelisted screeners across each historical session strictly using data up to that day.
        Guarantees zero future lookahead.
        """
        signals = []
        cooldown: Dict[Tuple[str, str], int] = {}  # (symbol, strategy) -> last bar index seen

        # Standard screening strategies to evaluate
        strategies_to_run = [
            ("Trend Pullback", screen_trend_pullback),
            ("Momentum Breakout", screen_momentum_breakout),
            ("Mean Reversion", screen_mean_reversion),
            ("Volatility Squeeze", screen_volatility_squeeze),
            ("Connors RSI-2 Rebound", screen_connors_rsi2_rebound),
        ]

        # Scan day by day with dynamic market regime detection
        for scan_date in dates_to_scan:
            date_str = scan_date.strftime("%Y-%m-%d")

            # 1. Macro Market Regime Assessment (Cross-sectional breadth: % of universe above 50 EMA)
            advancing = 0
            total_active = 0
            for s, d in clean_history.items():
                if scan_date in d.index and 'close' in d.columns and 'ema_50' in d.columns:
                    c = d.loc[scan_date, 'close']
                    e = d.loc[scan_date, 'ema_50']
                    if pd.notna(c) and pd.notna(e):
                        total_active += 1
                        if float(c) > float(e):
                            advancing += 1

            breadth = (advancing / total_active) if total_active >= 5 else 0.50
            if breadth >= 0.50:
                current_regime = "bullish"
            elif breadth < 0.35:
                current_regime = "bearish"
            else:
                current_regime = "neutral"

            for sym, df in clean_history.items():
                if df.empty or scan_date not in df.index:
                    continue

                # Locate current bar integer index
                locs = df.index.get_indexer([scan_date])
                if len(locs) == 0 or locs[0] < 50:
                    continue
                bar_idx = locs[0]

                # Strictly slice trailing operational window (up to 260 bars) ending at current bar
                sub_df = df.iloc[max(0, bar_idx - 260) : bar_idx + 1]

                for strat_name, screener_fn in strategies_to_run:
                    # In a Bearish market regime, pause aggressive long breakouts (crash shield)
                    if current_regime == "bearish" and strat_name in ("Momentum Breakout", "High Tight Flag", "Minervini VCP Breakout"):
                        continue

                    cd_key = (sym, strat_name)
                    if cd_key in cooldown and (bar_idx - cooldown[cd_key]) < 5:
                        continue  # 5-bar cooldown between repeated signals on the same symbol

                    try:
                        sig = screener_fn(sub_df, sym, market=market)
                        if sig and float(sig.get("entry_price", 0)) > 0:
                            sig["signal_date"] = date_str
                            sig["entry_mode"] = "next_open"
                            sig["market"] = market
                            sig["market_regime"] = current_regime
                            sig["confidence_source"] = "EMPIRICAL" if self.calibrator.is_empirical(strat_name) else "PRIOR"
                            # Re-calibrate confidence with regime awareness
                            sig["confidence_score"] = self.calibrator.get_calibrated_confidence(
                                strategy=strat_name,
                                market=market,
                                raw_confluence_score=float(sig.get("confidence_score", 75.0)),
                                market_regime=current_regime
                            )
                            signals.append(sig)
                            cooldown[cd_key] = bar_idx
                    except Exception as e:
                        logger.debug(f"Screener exception on {sym} ({strat_name}) at {date_str}: {e}")

        return signals

    def run_walk_forward_validation(
        self,
        clean_history: Dict[str, pd.DataFrame],
        market: str = "BIST",
        train_months: int = 18,
        test_months: int = 6,
        step_months: int = 6
    ) -> WalkForwardReport:
        """
        Runs comprehensive walk-forward validation across all available historical bars.
        """
        # Collect and sort union of all trading dates
        date_set = set()
        for df in clean_history.values():
            if df is not None and not df.empty:
                date_set.update(df.index)

        all_dates = sorted(list(date_set))
        if len(all_dates) < 100:
            logger.warning("Insufficient dates for walk-forward validation.")
            return WalkForwardReport(
                market=market,
                total_folds=0,
                total_oos_trades=0,
                oos_win_rate=0.0,
                oos_profit_factor=0.0,
                oos_expectancy=0.0,
            )

        windows = self.generate_walk_forward_windows(
            all_dates,
            train_months=train_months,
            test_months=test_months,
            step_months=step_months
        )

        logger.info(f"Generated {len(windows)} walk-forward folds for market {market}.")

        fold_results: List[WalkForwardFoldResult] = []
        fold_sim_tests: List[BacktestResult] = []
        all_oos_trades = []
        strategy_stats_acc: Dict[str, Dict[str, Any]] = {}

        for fold_idx, (tr_start, tr_end, te_start, te_end) in enumerate(windows, start=1):
            logger.info(f"--- FOLD {fold_idx}/{len(windows)}: Train [{tr_start.date()} -> {tr_end.date()}] | Test [{te_start.date()} -> {te_end.date()}] ---")

            # 1. Train Period (In-Sample Standalone Simulation)
            train_dates = [d for d in all_dates if tr_start <= d <= tr_end]
            train_signals = self.scan_historical_signals_on_dates(clean_history, train_dates, market=market)
            engine_train = InstitutionalBacktestEngine(self.config)
            res_train = engine_train.run_simulation(
                clean_history,
                trade_signals=train_signals,
                start_date=tr_start.strftime("%Y-%m-%d"),
                end_date=tr_end.strftime("%Y-%m-%d"),
            )

            # 2. Test Period (Out-of-Sample Standalone Simulation)
            test_dates = [d for d in all_dates if te_start <= d <= te_end]
            test_signals = self.scan_historical_signals_on_dates(clean_history, test_dates, market=market)
            engine_test = InstitutionalBacktestEngine(self.config)
            res_test = engine_test.run_simulation(
                clean_history,
                trade_signals=test_signals,
                start_date=te_start.strftime("%Y-%m-%d"),
                end_date=te_end.strftime("%Y-%m-%d"),
            )

            fold_res = WalkForwardFoldResult(
                fold_id=fold_idx,
                train_start=tr_start.strftime("%Y-%m-%d"),
                train_end=tr_end.strftime("%Y-%m-%d"),
                test_start=te_start.strftime("%Y-%m-%d"),
                test_end=te_end.strftime("%Y-%m-%d"),
                train_trades=res_train.total_trades,
                train_win_rate=res_train.win_rate,
                train_profit_factor=res_train.profit_factor,
                test_trades=res_test.total_trades,
                test_win_rate=res_test.win_rate,
                test_profit_factor=res_test.profit_factor,
                test_return_pct=res_test.total_return_pct,
                test_max_drawdown_pct=res_test.max_drawdown_pct,
            )
            fold_results.append(fold_res)
            fold_sim_tests.append(res_test)

            # Accumulate out-of-sample trades
            for t in res_test.trades:
                all_oos_trades.append(t)
                s_name = t.strategy
                if s_name not in strategy_stats_acc:
                    strategy_stats_acc[s_name] = {
                        "trades": 0, "wins": 0, "losses": 0,
                        "gross_profit": 0.0, "gross_loss": 0.0,
                        "total_pnl": 0.0, "pnl_pct_sum": 0.0,
                    }
                s_dict = strategy_stats_acc[s_name]
                s_dict["trades"] += 1
                s_dict["total_pnl"] += t.pnl
                s_dict["pnl_pct_sum"] += t.pnl_pct
                if t.outcome == "WIN":
                    s_dict["wins"] += 1
                    s_dict["gross_profit"] += max(0.0, t.pnl)
                else:
                    s_dict["losses"] += 1
                    s_dict["gross_loss"] += abs(min(0.0, t.pnl))

        # Overall OOS metrics
        total_oos = len(all_oos_trades)
        wins_oos = sum(1 for t in all_oos_trades if t.outcome == "WIN")
        gross_profit_oos = sum(t.pnl for t in all_oos_trades if t.pnl > 0)
        gross_loss_oos = abs(sum(t.pnl for t in all_oos_trades if t.pnl < 0))

        overall_win_rate = round((wins_oos / total_oos * 100.0), 2) if total_oos > 0 else 0.0
        overall_pf = round((gross_profit_oos / gross_loss_oos), 2) if gross_loss_oos > 0 else (9.99 if gross_profit_oos > 0 else 0.0)
        overall_exp = round((sum(t.pnl for t in all_oos_trades) / total_oos), 2) if total_oos > 0 else 0.0

        # Concurrency & Turnover across OOS folds
        peak_concurrency = max([r.max_concurrent_positions for r in fold_sim_tests]) if fold_sim_tests else 0
        mean_turnover = round(float(np.mean([r.turnover_ratio for r in fold_sim_tests])), 2) if fold_sim_tests else 0.0

        # Build strategy metrics summary
        strategy_summary = {}
        for s_name, s_data in strategy_stats_acc.items():
            n = s_data["trades"]
            w = s_data["wins"]
            gp = s_data["gross_profit"]
            gl = s_data["gross_loss"]
            wr = round(w / n * 100.0, 2) if n > 0 else 0.0
            pf = round(gp / gl, 2) if gl > 0 else (9.99 if gp > 0 else 0.0)
            avg_ret = round(s_data["pnl_pct_sum"] / n, 2) if n > 0 else 0.0
            strategy_summary[s_name] = {
                "trades": n,
                "wins": w,
                "losses": s_data["losses"],
                "win_rate": wr,
                "profit_factor": pf,
                "avg_return_pct": avg_ret,
                "total_pnl": round(s_data["total_pnl"], 2),
            }

        # Calibrate confidence map from OOS realized stats
        calibrated_map = self.calibrator.update_from_backtest(strategy_summary)

        # Annualized Sharpe & Deflated Sharpe Ratio (DSR)
        trade_pnls = [t.pnl for t in all_oos_trades]
        ann_sr, dsr = compute_deflated_sharpe_ratio(
            trade_pnls=trade_pnls,
            num_trials=len(strategy_summary),
            benchmark_sharpe=0.0
        )

        deployed_strats = self.calibrator.get_deployed_strategies(market)

        report = WalkForwardReport(
            market=market,
            total_folds=len(fold_results),
            total_oos_trades=total_oos,
            oos_win_rate=overall_win_rate,
            oos_profit_factor=overall_pf,
            oos_expectancy=overall_exp,
            annualized_sharpe=ann_sr,
            deflated_sharpe_ratio=dsr,
            max_concurrent_positions=peak_concurrency,
            turnover_ratio=mean_turnover,
            active_deployment_strategies=deployed_strats,
            calibrated_confidence_map=calibrated_map,
            strategy_metrics=strategy_summary,
            folds=fold_results,
        )

        return report
