import pytest
import pandas as pd
import numpy as np
from datetime import date, timedelta

import sys
sys.path.insert(0, "..")
from app.services.trade_evaluator import evaluate_signal_outcome, calculate_performance_summary

def test_target_hit_outcome():
    dates = pd.date_range(start="2026-01-01", periods=10, freq="B")
    # Entry 100, Target 110, Stop 95
    # Day 3 high hits 112 -> TARGET HIT
    high = [101, 102, 112, 105, 106, 107, 108, 109, 110, 111]
    low =  [99,  98,  99,  97,  98,  99,  98,  99,  98,  99]
    close = [100, 101, 110, 104, 105, 106, 107, 108, 109, 110]
    
    df = pd.DataFrame({"high": high, "low": low, "close": close}, index=dates)
    
    sig = {
        "symbol": "TEST",
        "strategy": "Momentum Breakout",
        "signal_date": dates[0].date(),
        "entry_price": 100.0,
        "stop_loss": 95.0,
        "target_1": 110.0
    }
    
    res = evaluate_signal_outcome(sig, df)
    assert res["status"] == "TARGET HIT 🏆"
    assert res["pnl_pct"] == 10.0
    assert res["outcome"] == "WIN"
    assert res["days_held"] == 2 # 2 bars after day 0

def test_stopped_out_outcome():
    dates = pd.date_range(start="2026-01-01", periods=10, freq="B")
    # Entry 100, Target 110, Stop 95
    # Day 2 low dips to 94 -> STOPPED OUT
    high = [101, 102, 98, 97, 96, 95, 94, 93, 92, 91]
    low =  [99,  94,  93, 92, 91, 90, 89, 88, 87, 86]
    close = [100, 96,  94, 93, 92, 91, 90, 89, 88, 87]
    
    df = pd.DataFrame({"high": high, "low": low, "close": close}, index=dates)
    
    sig = {
        "symbol": "TEST",
        "strategy": "Trend Pullback",
        "signal_date": dates[0].date(),
        "entry_price": 100.0,
        "stop_loss": 95.0,
        "target_1": 110.0
    }
    
    res = evaluate_signal_outcome(sig, df)
    assert res["status"] == "STOPPED OUT 🛑"
    assert res["pnl_pct"] == -5.0
    assert res["outcome"] == "LOSS"

def test_expired_time_stop():
    dates = pd.date_range(start="2026-01-01", periods=25, freq="B")
    # Flat price that never hits target or stop
    close = [102.0] * 25
    df = pd.DataFrame({"high": [103.0]*25, "low": [101.0]*25, "close": close}, index=dates)
    
    sig = {
        "symbol": "TEST",
        "strategy": "Volatility Squeeze",
        "signal_date": dates[0].date(),
        "entry_price": 100.0,
        "stop_loss": 95.0,
        "target_1": 110.0
    }
    
    res = evaluate_signal_outcome(sig, df, max_hold_days=20)
    assert res["status"] == "EXPIRED ⏳"
    assert res["days_held"] == 20
    assert res["pnl_pct"] == 2.0 # (102 - 100) / 100 * 100

def test_performance_kpi_summary():
    sample_trades = [
        {"status": "TARGET HIT 🏆", "outcome": "WIN", "pnl_pct": 10.0, "days_held": 5, "strategy": "Breakout"},
        {"status": "TARGET HIT 🏆", "outcome": "WIN", "pnl_pct": 8.0, "days_held": 4, "strategy": "Breakout"},
        {"status": "STOPPED OUT 🛑", "outcome": "LOSS", "pnl_pct": -4.0, "days_held": 2, "strategy": "Breakout"},
        {"status": "ACTIVE 🟢", "outcome": "OPEN", "pnl_pct": 1.5, "days_held": 1, "strategy": "Breakout"},
    ]
    kpis, strat = calculate_performance_summary(sample_trades)
    assert not kpis.empty
    # Win rate should be 2 / 3 = 66.7%
    win_row = kpis[kpis["Metric"].str.contains("Win Rate")]["Value"].values[0]
    assert "66.7%" in win_row
