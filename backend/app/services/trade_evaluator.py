"""
MarketPulse Trade Outcome & Performance Evaluation Engine
Tracks historical and live trade setups, checks whether targets or stop losses were hit,
and computes hedge-fund grade performance analytics (Win Rate, Profit Factor, Expectancy).
"""
import pandas as pd
import numpy as np
from datetime import datetime, date, timedelta
from typing import Dict, List, Tuple, Any

from app.services.screener import (
    screen_momentum_breakout,
    screen_trend_pullback,
    screen_volatility_squeeze
)

def evaluate_signal_outcome(signal: Dict, price_df: pd.DataFrame, max_hold_days: int = 20) -> Dict:
    """
    Evaluates a single trade signal against subsequent price bars.
    
    Rules:
    1. Looks at bars strictly AFTER signal_date.
    2. If High >= target_1 -> TARGET HIT (Win).
    3. If Low <= stop_loss -> STOPPED OUT (Loss).
    4. If both touched on the same day -> conservative rule marks as STOPPED OUT.
    5. If neither hit after max_hold_days -> EXPIRED (closed at day N close).
    6. If still within max_hold_days and neither hit -> ACTIVE (Open).
    """
    symbol = signal.get("symbol", "")
    strategy = signal.get("strategy", "")
    sig_date = signal.get("signal_date")
    sig_ts = pd.to_datetime(sig_date)
    if getattr(sig_ts, "tzinfo", None) is not None:
        sig_ts = sig_ts.tz_localize(None)
    sig_date_obj = sig_ts.date()
        
    entry = float(signal.get("entry_price", 0))
    stop = float(signal.get("stop_loss", 0)) if signal.get("stop_loss") else None
    target = float(signal.get("target_1", 0)) if signal.get("target_1") else None
    
    result = {
        "symbol": symbol,
        "strategy": strategy,
        "signal_date": str(sig_date_obj),
        "entry_price": entry,
        "stop_loss": stop,
        "target": target,
        "status": "ACTIVE 🟢",
        "pnl_pct": 0.0,
        "exit_price": entry,
        "exit_date": None,
        "days_held": 0,
        "outcome": "OPEN"
    }
    
    if price_df.empty or not stop or not target or entry <= 0:
        return result

    # Normalize dates on price_df index to pure date objects
    dates = []
    for idx in price_df.index:
        ts = pd.to_datetime(idx)
        if getattr(ts, "tzinfo", None) is not None:
            ts = ts.tz_localize(None)
        dates.append(ts.date())
    
    # Filter bars after signal date
    future_indices = [i for i, d in enumerate(dates) if d > sig_date_obj]
    if not future_indices:
        # Trade just triggered today
        latest_close = float(price_df["close"].iloc[-1])
        unrealized_pnl = ((latest_close - entry) / entry) * 100
        result["pnl_pct"] = round(unrealized_pnl, 2)
        result["exit_price"] = round(latest_close, 2)
        return result
        
    for count, idx in enumerate(future_indices, start=1):
        bar = price_df.iloc[idx]
        bar_date = dates[idx]
        high = float(bar.get("high", bar["close"]))
        low = float(bar.get("low", bar["close"]))
        close = float(bar["close"])
        
        hit_stop = (low <= stop)
        hit_target = (high >= target)
        
        if hit_stop and hit_target:
            # Conservative tie-breaker: assumed stopped out
            pnl = ((stop - entry) / entry) * 100
            result.update({
                "status": "STOPPED OUT 🛑",
                "pnl_pct": round(pnl, 2),
                "exit_price": round(stop, 2),
                "exit_date": str(bar_date),
                "days_held": count,
                "outcome": "LOSS"
            })
            return result
        elif hit_target:
            pnl = ((target - entry) / entry) * 100
            result.update({
                "status": "TARGET HIT 🏆",
                "pnl_pct": round(pnl, 2),
                "exit_price": round(target, 2),
                "exit_date": str(bar_date),
                "days_held": count,
                "outcome": "WIN"
            })
            return result
        elif hit_stop:
            pnl = ((stop - entry) / entry) * 100
            result.update({
                "status": "STOPPED OUT 🛑",
                "pnl_pct": round(pnl, 2),
                "exit_price": round(stop, 2),
                "exit_date": str(bar_date),
                "days_held": count,
                "outcome": "LOSS"
            })
            return result
            
        if count >= max_hold_days:
            # Time stop expired
            pnl = ((close - entry) / entry) * 100
            outcome_type = "WIN" if pnl > 0 else "LOSS"
            result.update({
                "status": "EXPIRED ⏳",
                "pnl_pct": round(pnl, 2),
                "exit_price": round(close, 2),
                "exit_date": str(bar_date),
                "days_held": count,
                "outcome": outcome_type
            })
            return result

    # If loop ends, trade is still active
    latest_close = float(price_df["close"].iloc[-1])
    unrealized_pnl = ((latest_close - entry) / entry) * 100
    result.update({
        "status": "ACTIVE 🟢",
        "pnl_pct": round(unrealized_pnl, 2),
        "exit_price": round(latest_close, 2),
        "days_held": len(future_indices),
        "outcome": "OPEN"
    })
    return result


def backtest_all_historical_signals(all_enriched: Dict[str, pd.DataFrame], lookback_bars: int = 120) -> List[Dict]:
    """
    Scans the past N trading sessions across all stocks to identify historical trade signals,
    then evaluates their outcomes through to today.
    Provides a comprehensive performance track record.
    """
    evaluated_trades = []
    
    for symbol, df in all_enriched.items():
        if df.empty or len(df) < 50:
            continue
            
        start_idx = max(50, len(df) - lookback_bars)
        
        # Test windows
        for i in range(start_idx, len(df)):
            sub_df = df.iloc[:i+1]
            sub_date = sub_df.index[-1]
            
            # Check Breakout
            sig_bo = screen_momentum_breakout(sub_df, symbol)
            if sig_bo:
                evaluated_trades.append(evaluate_signal_outcome(sig_bo, df))
                
            # Check Pullback
            sig_pb = screen_trend_pullback(sub_df, symbol)
            if sig_pb:
                evaluated_trades.append(evaluate_signal_outcome(sig_pb, df))
                
            # Check Squeeze
            sig_sq = screen_volatility_squeeze(sub_df, symbol)
            if sig_sq:
                evaluated_trades.append(evaluate_signal_outcome(sig_sq, df))

    # Deduplicate closely spaced duplicate signals for same symbol and strategy
    unique_trades = []
    seen = set()
    for t in evaluated_trades:
        key = (t["symbol"], t["strategy"], t["signal_date"])
        if key not in seen:
            seen.add(key)
            unique_trades.append(t)
            
    # Sort by signal date descending
    unique_trades.sort(key=lambda x: x["signal_date"], reverse=True)
    return unique_trades


def calculate_performance_summary(trades: List[Dict]) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Computes summary KPI metrics and strategy-level performance tables.
    """
    if not trades:
        return pd.DataFrame(), pd.DataFrame()
        
    df = pd.DataFrame(trades)
    
    closed = df[df["status"] != "ACTIVE 🟢"]
    total_trades = len(df)
    closed_trades = len(closed)
    
    if closed_trades > 0:
        wins = closed[closed["outcome"] == "WIN"]
        losses = closed[closed["outcome"] == "LOSS"]
        
        win_count = len(wins)
        loss_count = len(losses)
        win_rate = (win_count / closed_trades) * 100 if closed_trades > 0 else 0
        
        avg_win_pct = wins["pnl_pct"].mean() if not wins.empty else 0
        avg_loss_pct = abs(losses["pnl_pct"].mean()) if not losses.empty else 0
        
        gross_profit = wins["pnl_pct"].sum() if not wins.empty else 0
        gross_loss = abs(losses["pnl_pct"].sum()) if not losses.empty else 0
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0)
        
        total_pnl = closed["pnl_pct"].sum()
        avg_hold_days = closed["days_held"].mean()
        expectancy = ((win_rate / 100) * avg_win_pct) - ((1 - (win_rate / 100)) * avg_loss_pct)
    else:
        win_count = loss_count = 0
        win_rate = avg_win_pct = avg_loss_pct = profit_factor = total_pnl = avg_hold_days = expectancy = 0

    kpi_rows = [
        {"Metric": "🎯 Total Trades Evaluated", "Value": str(total_trades)},
        {"Metric": "✅ Closed (Resolved) Trades", "Value": str(closed_trades)},
        {"Metric": "🟢 Active (Open) Trades", "Value": str(total_trades - closed_trades)},
        {"Metric": "🏆 Win Rate %", "Value": f"{win_rate:.1f}%"},
        {"Metric": "💰 Total Cumulative Realized P&L", "Value": f"{total_pnl:+.1f}%"},
        {"Metric": "⚖️ Profit Factor (Gross Wins / Gross Losses)", "Value": f"{profit_factor:.2f}"},
        {"Metric": "📈 Average Win", "Value": f"+{avg_win_pct:.1f}%"},
        {"Metric": "📉 Average Loss", "Value": f"-{avg_loss_pct:.1f}%"},
        {"Metric": "🎲 Trade Expectancy (Per Trade)", "Value": f"{expectancy:+.2f}%"},
        {"Metric": "⏱️ Average Holding Period", "Value": f"{avg_hold_days:.1f} days"},
    ]
    kpi_df = pd.DataFrame(kpi_rows)
    
    # Strategy breakdown
    strat_rows = []
    for strat, group in df.groupby("strategy"):
        c_group = group[group["status"] != "ACTIVE 🟢"]
        c_len = len(c_group)
        w_len = len(c_group[c_group["outcome"] == "WIN"])
        wr = (w_len / c_len * 100) if c_len > 0 else 0
        net_pnl = c_group["pnl_pct"].sum() if c_len > 0 else 0
        strat_rows.append({
            "Strategy": strat,
            "Total Trades": len(group),
            "Closed Trades": c_len,
            "Wins": w_len,
            "Win Rate %": f"{wr:.1f}%",
            "Cumulative PnL %": f"{net_pnl:+.1f}%"
        })
    strat_df = pd.DataFrame(strat_rows)
    
    return kpi_df, strat_df
