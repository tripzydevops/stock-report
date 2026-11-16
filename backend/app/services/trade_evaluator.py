"""
MarketPulse Trade Outcome & Performance Evaluation Engine
Tracks historical and live trade setups, checks whether targets or stop losses were hit,
and computes hedge-fund grade performance analytics (Win Rate, Profit Factor, Expectancy).
"""
import pandas as pd
import numpy as np
from datetime import datetime, date, timedelta
from typing import Dict, List, Tuple, Any

from app.services.market_profiles import US_GROWTH_MOMENTUM_UNIVERSE, MarketType, get_market_profile
from app.services.screener import (
    screen_momentum_breakout,
    screen_trend_pullback,
    screen_pullback_reclaim,
    screen_volatility_squeeze,
    screen_mean_reversion,
    screen_minervini_vcp,
    screen_high_tight_flag,
    screen_connors_rsi2_rebound,
    screen_fund_momentum,
)

def infer_market_for_symbol(symbol: str) -> str:
    """Derives market type ('BIST' or 'US') from ticker convention and universe memberships."""
    s = symbol.strip().upper().replace(".IS", "")
    if symbol.strip().upper().endswith(".IS"):
        return "BIST"
    if s in US_GROWTH_MOMENTUM_UNIVERSE:
        return "US"
    if "." not in s and s.isalpha() and len(s) <= 5:
        return "US"
    return "BIST"

def evaluate_signal_outcome(signal: Dict, price_df: pd.DataFrame, max_hold_days: int = 20) -> Dict:
    """
    Evaluates a single trade signal against subsequent price bars with institutional realism:
    1. Realistic Execution: Entry is filled at the next bar's OPEN print (addressing next_open mode),
       rather than retroactively assuming fill at the signal bar's close.
    2. Opening Gap Stops: If session opens below stop_loss, fill price is the OPEN print, not the stop price.
    3. Opening Gap Targets: If session opens above target, fill price is the OPEN print.
    4. Conservative Intraday Tie-Breaker: If both stop and target touched intraday, assumed stopped out.
    5. Net Financial Outcome: Outcome is WIN if net pnl > 0, else LOSS.
    6. Expiry: If neither hit after max_hold_days, closed at final bar close.
    """
    symbol = signal.get("symbol", "")
    strategy = signal.get("strategy", "")
    sig_date = signal.get("signal_date")
    sig_ts = pd.to_datetime(sig_date)
    if getattr(sig_ts, "tzinfo", None) is not None:
        sig_ts = sig_ts.tz_localize(None)
    sig_date_obj = sig_ts.date()
        
    ref_entry = float(signal.get("entry_price", 0))
    stop = float(signal.get("stop_loss", 0)) if signal.get("stop_loss") else None
    target = float(signal.get("target_1", 0)) if signal.get("target_1") else None
    target_2 = float(signal.get("target_2", 0)) if signal.get("target_2") else None
    
    result = {
        "symbol": symbol,
        "strategy": strategy,
        "signal_date": str(sig_date_obj),
        "entry_price": ref_entry,
        "stop_loss": stop,
        "target": target,
        "target_2": target_2,
        "status": "ACTIVE 🟢",
        "pnl_pct": 0.0,
        "exit_price": ref_entry,
        "exit_date": None,
        "days_held": 0,
        "outcome": "OPEN",
        "exit_reason": "ACTIVE",
    }
    
    if price_df.empty or not stop or not target or ref_entry <= 0:
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
        # Trade just triggered today, still open
        latest_close = float(price_df["close"].iloc[-1])
        unrealized_pnl = ((latest_close - ref_entry) / ref_entry) * 100
        result["pnl_pct"] = round(unrealized_pnl, 2)
        result["exit_price"] = round(latest_close, 2)
        return result

    # Entry is filled on the next bar's OPEN if signal specifies 'entry_mode': 'next_open' and open column is present
    first_future_bar = price_df.iloc[future_indices[0]]
    has_open_col = "open" in first_future_bar and pd.notna(first_future_bar["open"])
    entry_mode = signal.get("entry_mode")
    if entry_mode == "next_open" and has_open_col:
        entry = float(first_future_bar["open"])
    else:
        entry = ref_entry
    if entry <= 0:
        entry = ref_entry
    result["entry_price"] = round(entry, 2)
        
    for count, idx in enumerate(future_indices, start=1):
        bar = price_df.iloc[idx]
        bar_date = dates[idx]
        has_bar_open = "open" in bar and pd.notna(bar["open"])
        bar_open = float(bar["open"]) if has_bar_open else None
        high = float(bar.get("high", bar["close"]))
        low = float(bar.get("low", bar["close"]))
        close = float(bar["close"])

        # 1. Opening Gap Checks (evaluated only if explicit open price is available)
        if has_bar_open and bar_open is not None:
            if bar_open <= stop:
                # Gapped down below stop on open: fill at actual open print!
                pnl = ((bar_open - entry) / entry) * 100
                result.update({
                    "status": "STOPPED OUT (GAP) 🛑",
                    "pnl_pct": round(pnl, 2),
                    "exit_price": round(bar_open, 2),
                    "exit_date": str(bar_date),
                    "days_held": count,
                    "outcome": "LOSS",
                    "exit_reason": "STOPPED_OUT_GAP"
                })
                return result
            elif bar_open >= target:
                # Gapped up above target on open: fill at actual open print!
                pnl = ((bar_open - entry) / entry) * 100
                result.update({
                    "status": "TARGET HIT (GAP) 🏆",
                    "pnl_pct": round(pnl, 2),
                    "exit_price": round(bar_open, 2),
                    "exit_date": str(bar_date),
                    "days_held": count,
                    "outcome": "WIN" if pnl > 0 else "LOSS",
                    "exit_reason": "TARGET_HIT_GAP"
                })
                return result
            
        # 2. Intraday Checks
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
                "outcome": "LOSS",
                "exit_reason": "STOPPED_OUT"
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
                "outcome": "WIN" if pnl > 0 else "LOSS",
                "exit_reason": "TARGET_HIT"
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
                "outcome": "LOSS",
                "exit_reason": "STOPPED_OUT"
            })
            return result
            
        if count >= max_hold_days:
            # Time stop expired
            pnl = ((close - entry) / entry) * 100
            result.update({
                "status": "EXPIRED ⏳",
                "pnl_pct": round(pnl, 2),
                "exit_price": round(close, 2),
                "exit_date": str(bar_date),
                "days_held": count,
                "outcome": "WIN" if pnl > 0 else "LOSS",
                "exit_reason": "EXPIRED"
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
        "outcome": "OPEN",
        "exit_reason": "ACTIVE"
    })
    return result


# Strategy registry mapping strategy names to scanner implementations
STRATEGY_REGISTRY = [
    ("Momentum Breakout", screen_momentum_breakout),
    ("Trend Pullback", screen_trend_pullback),
    ("Pullback Reclaim", screen_pullback_reclaim),
    ("Volatility Squeeze", screen_volatility_squeeze),
    ("Mean Reversion", screen_mean_reversion),
    ("Minervini VCP", screen_minervini_vcp),
    ("High Tight Flag", screen_high_tight_flag),
    ("Connors RSI-2", screen_connors_rsi2_rebound),
    ("Fund Momentum", screen_fund_momentum),
]


def backtest_all_historical_signals(
    all_enriched: Dict[str, pd.DataFrame], 
    lookback_bars: int = 120,
    asset_markets: Optional[Dict[str, str]] = None
) -> List[Dict]:
    """
    Scans the past N trading sessions across all assets with market-specific parameters,
    then evaluates their outcomes through to today using realistic next-open fills and gap handling.
    """
    evaluated_trades = []
    
    for symbol, df in all_enriched.items():
        if df.empty or len(df) < 50:
            continue
            
        market = (asset_markets or {}).get(symbol) or infer_market_for_symbol(symbol)
        start_idx = max(50, len(df) - lookback_bars)
        
        # Test windows
        for i in range(start_idx, len(df)):
            sub_df = df.iloc[:i+1]
            
            for strat_name, strat_func in STRATEGY_REGISTRY:
                try:
                    sig = strat_func(sub_df, symbol, market=market)
                    if sig:
                        evaluated_trades.append(evaluate_signal_outcome(sig, df))
                except Exception:
                    continue

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
    Win/loss outcome is strictly driven by financial pnl > 0.
    """
    if not trades:
        return pd.DataFrame(), pd.DataFrame()
        
    df = pd.DataFrame(trades)
    
    closed = df[df["status"] != "ACTIVE 🟢"]
    total_trades = len(df)
    closed_trades = len(closed)
    
    if closed_trades > 0:
        # Strict financial outcome derivation
        wins = closed[closed["pnl_pct"] > 0]
        losses = closed[closed["pnl_pct"] <= 0]
        
        win_count = len(wins)
        loss_count = len(losses)
        win_rate = (win_count / closed_trades) * 100 if closed_trades > 0 else 0
        
        avg_win_pct = wins["pnl_pct"].mean() if not wins.empty else 0
        avg_loss_pct = abs(losses["pnl_pct"].mean()) if not losses.empty else 0
        
        gross_profit = wins["pnl_pct"].sum() if not wins.empty else 0
        gross_loss = abs(losses["pnl_pct"].sum()) if not losses.empty else 0
        
        # Avoid substituting raw profit dollar amounts as profit factor when no losses exist
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (999.99 if gross_profit > 0 else 0.0)
        
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
        {"Metric": "⚖️ Profit Factor (Gross Wins / Gross Losses)", "Value": f"{profit_factor:.2f}" if profit_factor < 999.0 else "∞ (No Losses)"},
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
        w_len = len(c_group[c_group["pnl_pct"] > 0])
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

