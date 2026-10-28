"""
Institutional-Grade Strategy Backtesting & Simulation Engine.
Implements realistic portfolio simulation with commissions, slippage,
position sizing, cash management, risk-adjusted returns (Sharpe, Sortino, Calmar),
and peak-to-trough drawdown analysis.
"""

import math
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, date
import pandas as pd
import numpy as np

from app.models.schemas import (
    BacktestConfig,
    BacktestTradeLog,
    BacktestEquityPoint,
    BacktestResult,
)
from app.services.trade_evaluator import backtest_all_historical_signals

logger = logging.getLogger(__name__)


class InstitutionalBacktestEngine:
    """
    Simulates portfolio execution across multiple assets and strategies
    with realistic institutional frictions and risk management constraints.
    """

    def __init__(self, config: Optional[BacktestConfig] = None):
        self.config = config or BacktestConfig()

    def run_simulation(
        self,
        historical_data: Dict[str, pd.DataFrame],
        trade_signals: Optional[List[Dict[str, Any]]] = None,
    ) -> BacktestResult:
        """
        Executes a chronologically aligned portfolio backtest.
        If trade_signals is None, automatically generates signals across historical_data.
        """
        if trade_signals is None:
            trade_signals = backtest_all_historical_signals(historical_data, lookback_bars=120)

        if not historical_data:
            return self._empty_result()

        # 1. Align and collect all unique trading dates across all assets
        date_set = set()
        clean_history = {}
        for sym, df in historical_data.items():
            if df.empty or "close" not in df.columns:
                continue
            # Ensure index has timezone-naive dates
            df_norm = df.copy()
            df_norm.index = pd.to_datetime(df_norm.index).tz_localize(None).date
            clean_history[sym] = df_norm
            date_set.update(df_norm.index)

        all_dates = sorted(list(date_set))
        if not all_dates:
            return self._empty_result()

        # Index signals by signal_date for fast chronological lookup
        signals_by_date: Dict[date, List[Dict[str, Any]]] = {}
        for sig in trade_signals:
            try:
                s_date_str = str(sig.get("signal_date", ""))[:10]
                s_date = datetime.strptime(s_date_str, "%Y-%m-%d").date()
                signals_by_date.setdefault(s_date, []).append(sig)
            except Exception:
                continue

        # Simulation State
        cash = float(self.config.initial_capital)
        peak_equity = float(self.config.initial_capital)
        open_positions: List[Dict[str, Any]] = []
        completed_trades: List[BacktestTradeLog] = []
        equity_curve: List[BacktestEquityPoint] = []
        daily_returns: List[float] = []

        comm_rate = self.config.commission_bps / 10_000.0
        slip_rate = self.config.slippage_bps / 10_000.0

        prev_day_equity = cash

        # 2. Chronological Daily Simulation Loop
        for current_date in all_dates:
            date_str = current_date.strftime("%Y-%m-%d")

            # A. Evaluate & Close Existing Open Positions
            positions_to_keep = []
            for pos in open_positions:
                sym = pos["symbol"]
                sym_df = clean_history.get(sym)

                if sym_df is None or current_date not in sym_df.index:
                    # No bar for symbol today, hold position
                    positions_to_keep.append(pos)
                    continue

                bar = sym_df.loc[current_date]
                # If there are multiple rows for the same date, take the latest
                if isinstance(bar, pd.DataFrame):
                    bar = bar.iloc[-1]

                high = float(bar.get("high", bar["close"]))
                low = float(bar.get("low", bar["close"]))
                close = float(bar["close"])

                pos["days_held"] += 1
                pos["current_close"] = close

                target = pos["target"]
                stop = pos["stop_loss"]
                entry = pos["entry_price"]
                shares = pos["shares"]

                hit_target = target is not None and high >= target
                hit_stop = stop is not None and low <= stop
                expired = pos["days_held"] >= self.config.max_hold_days

                closed = False
                exit_price = close
                outcome = "OPEN"
                exit_reason = "ACTIVE"

                if hit_stop and hit_target:
                    # Conservative tie-breaker: assumed stopped out
                    exit_price = max(0.01, stop * (1.0 - slip_rate))
                    outcome = "LOSS"
                    exit_reason = "STOPPED_OUT"
                    closed = True
                elif hit_target:
                    exit_price = target * (1.0 - slip_rate)
                    outcome = "WIN"
                    exit_reason = "TARGET_HIT"
                    closed = True
                elif hit_stop:
                    exit_price = max(0.01, stop * (1.0 - slip_rate))
                    outcome = "LOSS"
                    exit_reason = "STOPPED_OUT"
                    closed = True
                elif expired:
                    exit_price = close * (1.0 - slip_rate)
                    outcome = "WIN" if exit_price > entry else "LOSS"
                    exit_reason = "EXPIRED"
                    closed = True

                if closed:
                    gross_proceeds = shares * exit_price
                    exit_commission = gross_proceeds * comm_rate
                    net_proceeds = gross_proceeds - exit_commission
                    cash += net_proceeds

                    pnl = net_proceeds - pos["total_cost"]
                    pnl_pct = (pnl / pos["total_cost"]) * 100.0 if pos["total_cost"] > 0 else 0.0
                    total_fees = pos["entry_commission"] + exit_commission

                    completed_trades.append(
                        BacktestTradeLog(
                            symbol=sym,
                            strategy=pos["strategy"],
                            entry_date=pos["entry_date"],
                            entry_price=round(pos["effective_entry"], 2),
                            exit_date=date_str,
                            exit_price=round(exit_price, 2),
                            shares=shares,
                            position_value=round(pos["total_cost"], 2),
                            pnl=round(pnl, 2),
                            pnl_pct=round(pnl_pct, 2),
                            fees=round(total_fees, 2),
                            days_held=pos["days_held"],
                            outcome=outcome,
                            exit_reason=exit_reason,
                        )
                    )
                else:
                    positions_to_keep.append(pos)

            open_positions = positions_to_keep

            # B. Process New Trade Signals for Current Date
            if current_date in signals_by_date:
                pending_signals = signals_by_date[current_date]
                for sig in pending_signals:
                    if len(open_positions) >= self.config.max_open_positions:
                        break  # Max positions reached

                    sym = sig.get("symbol", "")
                    # Prevent duplicate positions in the same symbol
                    if any(p["symbol"] == sym for p in open_positions):
                        continue

                    raw_entry = float(sig.get("entry_price", 0))
                    raw_stop = float(sig.get("stop_loss", 0)) if sig.get("stop_loss") else None
                    raw_target = float(sig.get("target_1", 0)) if sig.get("target_1") else None

                    if raw_entry <= 0 or not raw_stop or raw_stop >= raw_entry:
                        continue

                    # Apply entry slippage
                    effective_entry = raw_entry * (1.0 + slip_rate)

                    # Position sizing based on fixed fractional risk
                    current_port_equity = cash + sum(
                        p["shares"] * p.get("current_close", p["effective_entry"]) for p in open_positions
                    )
                    risk_amount = current_port_equity * (self.config.risk_per_trade_pct / 100.0)
                    risk_per_share = max(0.01, effective_entry - raw_stop)
                    desired_shares = int(risk_amount / risk_per_share)

                    if desired_shares <= 0:
                        continue

                    # Ensure we have enough cash to cover cost + commission
                    cost_per_share_with_comm = effective_entry * (1.0 + comm_rate)
                    max_affordable_shares = int((cash * 0.98) / cost_per_share_with_comm)
                    shares = min(desired_shares, max_affordable_shares)

                    if shares <= 0:
                        continue

                    entry_gross = shares * effective_entry
                    entry_comm = entry_gross * comm_rate
                    total_entry_cost = entry_gross + entry_comm

                    if cash >= total_entry_cost:
                        cash -= total_entry_cost
                        open_positions.append({
                            "symbol": sym,
                            "strategy": sig.get("strategy", "unknown"),
                            "entry_date": date_str,
                            "raw_entry": raw_entry,
                            "effective_entry": effective_entry,
                            "entry_price": raw_entry,
                            "stop_loss": raw_stop,
                            "target": raw_target,
                            "shares": shares,
                            "entry_commission": entry_comm,
                            "total_cost": total_entry_cost,
                            "days_held": 0,
                            "current_close": effective_entry,
                        })

            # C. End-of-Day Portfolio Valuation & Drawdown
            positions_value = sum(
                p["shares"] * p.get("current_close", p["effective_entry"]) for p in open_positions
            )
            total_equity = cash + positions_value
            peak_equity = max(peak_equity, total_equity)
            drawdown_pct = ((total_equity - peak_equity) / peak_equity) * 100.0

            daily_ret = (total_equity - prev_day_equity) / prev_day_equity if prev_day_equity > 0 else 0.0
            daily_returns.append(daily_ret)
            prev_day_equity = total_equity

            equity_curve.append(
                BacktestEquityPoint(
                    date=date_str,
                    equity=round(total_equity, 2),
                    cash=round(cash, 2),
                    positions_value=round(positions_value, 2),
                    drawdown_pct=round(drawdown_pct, 2),
                )
            )

        # 3. Compute Risk-Adjusted Analytics & Strategy Breakdown
        return self._build_analytics(
            completed_trades=completed_trades,
            equity_curve=equity_curve,
            daily_returns=daily_returns,
            final_equity=prev_day_equity,
            num_trading_days=len(all_dates),
        )

    def _build_analytics(
        self,
        completed_trades: List[BacktestTradeLog],
        equity_curve: List[BacktestEquityPoint],
        daily_returns: List[float],
        final_equity: float,
        num_trading_days: int,
    ) -> BacktestResult:
        """Computes institutional metrics: Sharpe, Sortino, Calmar, MaxDD, Win Rate, Expectancy."""
        init_cap = self.config.initial_capital
        total_ret_pct = ((final_equity - init_cap) / init_cap) * 100.0

        # CAGR
        years = max(0.1, num_trading_days / 252.0)
        cagr_pct = ((max(0.01, final_equity) / init_cap) ** (1.0 / years) - 1.0) * 100.0 if init_cap > 0 else 0.0

        # Max Drawdown
        max_dd_pct = min([pt.drawdown_pct for pt in equity_curve]) if equity_curve else 0.0

        # Sharpe & Sortino (Annualized with 252 trading days)
        rf_daily = (1.0 + self.config.risk_free_rate) ** (1.0 / 252.0) - 1.0
        returns_arr = np.array(daily_returns) if daily_returns else np.array([0.0])
        excess_returns = returns_arr - rf_daily

        std_dev = np.std(returns_arr)
        sharpe = (np.mean(excess_returns) / std_dev * math.sqrt(252.0)) if std_dev > 1e-8 else 0.0

        downside_returns = excess_returns[excess_returns < 0]
        downside_std = np.std(downside_returns) if len(downside_returns) > 0 else 0.0
        sortino = (np.mean(excess_returns) / downside_std * math.sqrt(252.0)) if downside_std > 1e-8 else 0.0

        calmar = (cagr_pct / abs(max_dd_pct)) if abs(max_dd_pct) > 0.1 else (cagr_pct if cagr_pct > 0 else 0.0)

        # Trade metrics
        total_trades = len(completed_trades)
        wins = [t for t in completed_trades if t.outcome == "WIN"]
        losses = [t for t in completed_trades if t.outcome == "LOSS"]

        win_count = len(wins)
        loss_count = len(losses)
        win_rate = (win_count / total_trades * 100.0) if total_trades > 0 else 0.0

        gross_profit = sum(t.pnl for t in wins)
        gross_loss = abs(sum(t.pnl for t in losses))
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0.0)

        avg_win_pct = (sum(t.pnl_pct for t in wins) / win_count) if win_count > 0 else 0.0
        avg_loss_pct = abs(sum(t.pnl_pct for t in losses) / loss_count) if loss_count > 0 else 0.0
        expectancy = ((win_rate / 100.0) * avg_win_pct) - ((1.0 - (win_rate / 100.0)) * avg_loss_pct)

        avg_pnl_pct = sum(t.pnl_pct for t in completed_trades) / total_trades if total_trades > 0 else 0.0
        avg_hold = sum(t.days_held for t in completed_trades) / total_trades if total_trades > 0 else 0.0

        # Strategy breakdown
        strat_map: Dict[str, Dict[str, Any]] = {}
        for t in completed_trades:
            st = strat_map.setdefault(t.strategy, {"total": 0, "wins": 0, "pnl": 0.0})
            st["total"] += 1
            if t.outcome == "WIN":
                st["wins"] += 1
            st["pnl"] += t.pnl

        breakdown = {}
        for s_name, data in strat_map.items():
            tot = data["total"]
            w = data["wins"]
            breakdown[s_name] = {
                "total_trades": tot,
                "wins": w,
                "win_rate_pct": round((w / tot * 100.0), 1) if tot > 0 else 0.0,
                "net_pnl": round(data["pnl"], 2),
            }

        return BacktestResult(
            config=self.config,
            total_trades=total_trades,
            winning_trades=win_count,
            losing_trades=loss_count,
            win_rate=round(win_rate, 1),
            profit_factor=round(profit_factor, 2),
            expectancy=round(expectancy, 2),
            initial_capital=round(init_cap, 2),
            final_equity=round(final_equity, 2),
            total_return_pct=round(total_ret_pct, 2),
            cagr_pct=round(cagr_pct, 2),
            max_drawdown_pct=round(max_dd_pct, 2),
            sharpe_ratio=round(sharpe, 2),
            sortino_ratio=round(sortino, 2),
            calmar_ratio=round(calmar, 2),
            avg_trade_pnl_pct=round(avg_pnl_pct, 2),
            avg_holding_days=round(avg_hold, 1),
            equity_curve=equity_curve,
            trades=completed_trades,
            strategy_breakdown=breakdown,
        )

    def _empty_result(self) -> BacktestResult:
        init_cap = self.config.initial_capital
        return BacktestResult(
            config=self.config,
            total_trades=0,
            winning_trades=0,
            losing_trades=0,
            win_rate=0.0,
            profit_factor=0.0,
            expectancy=0.0,
            initial_capital=init_cap,
            final_equity=init_cap,
            total_return_pct=0.0,
            cagr_pct=0.0,
            max_drawdown_pct=0.0,
            sharpe_ratio=0.0,
            sortino_ratio=0.0,
            calmar_ratio=0.0,
            avg_trade_pnl_pct=0.0,
            avg_holding_days=0.0,
            equity_curve=[],
            trades=[],
            strategy_breakdown={},
        )
