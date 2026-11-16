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


def test_next_open_entry_and_gap_down_stop_fill():
    # Signal date is Day 0 (close: 100.0, stop: 95.0, target: 110.0)
    # Day 1: Next open gaps up to 102.0 (entry filled at 102.0, NOT signal close 100.0!)
    # Day 2: Next session gaps down to 90.0 (below stop 95.0).
    # Exit MUST fill at open print 90.0, NOT at the theoretical stop price 95.0!
    dates = pd.date_range(start="2026-01-01", periods=5, freq="B")
    open_p = [100.0, 102.0, 90.0, 89.0, 88.0]
    high_p = [101.0, 104.0, 91.0, 90.0, 89.0]
    low_p =  [99.0,  101.0, 88.0, 87.0, 86.0]
    close_p= [100.0, 103.0, 89.0, 88.0, 87.0]

    df = pd.DataFrame({"open": open_p, "high": high_p, "low": low_p, "close": close_p}, index=dates)

    sig = {
        "symbol": "THYAO.IS",
        "strategy": "Momentum Breakout",
        "entry_mode": "next_open",
        "signal_date": dates[0].date(),
        "entry_price": 100.0,
        "stop_loss": 95.0,
        "target_1": 110.0
    }

    res = evaluate_signal_outcome(sig, df)

    # 1. Next-open entry: filled at Day 1 open (102.0)
    assert res["entry_price"] == 102.0
    # 2. Gap stop fill: filled at actual Day 2 open print (90.0), NOT at stop (95.0)
    assert res["exit_price"] == 90.0
    assert res["status"] == "STOPPED OUT (GAP) 🛑"
    assert res["exit_reason"] == "STOPPED_OUT_GAP"
    assert res["outcome"] == "LOSS"
    # PnL % = (90 - 102) / 102 * 100 = -11.76% (realistic gap loss, not capped at -5%)
    assert res["pnl_pct"] == pytest.approx(-11.76, abs=0.1)


def test_gap_up_target_fill():
    # Day 0: Close 100.0, Target 110.0
    # Day 1: Next open 100.0
    # Day 2: Gaps up to 115.0 on open (exceeding target 110.0) -> fill at 115.0!
    dates = pd.date_range(start="2026-01-01", periods=5, freq="B")
    open_p = [100.0, 100.0, 115.0, 116.0, 117.0]
    high_p = [101.0, 102.0, 118.0, 119.0, 120.0]
    low_p =  [99.0,  99.0,  114.0, 115.0, 116.0]
    close_p= [100.0, 101.0, 116.0, 117.0, 118.0]

    df = pd.DataFrame({"open": open_p, "high": high_p, "low": low_p, "close": close_p}, index=dates)

    sig = {
        "symbol": "AAPL",
        "strategy": "Trend Pullback",
        "signal_date": dates[0].date(),
        "entry_price": 100.0,
        "stop_loss": 95.0,
        "target_1": 110.0
    }

    res = evaluate_signal_outcome(sig, df)
    assert res["entry_price"] == 100.0
    assert res["exit_price"] == 115.0 # Filled at gap open!
    assert res["status"] == "TARGET HIT (GAP) 🏆"
    assert res["exit_reason"] == "TARGET_HIT_GAP"
    assert res["outcome"] == "WIN"
    assert res["pnl_pct"] == 15.0


def test_profit_factor_when_no_losses_is_not_raw_dollar():
    winning_trades = [
        {"status": "TARGET HIT 🏆", "outcome": "WIN", "pnl_pct": 12.0, "days_held": 3, "strategy": "Breakout"},
        {"status": "TARGET HIT 🏆", "outcome": "WIN", "pnl_pct": 18.0, "days_held": 5, "strategy": "Breakout"},
    ]
    kpis, strat = calculate_performance_summary(winning_trades)
    pf_row = kpis[kpis["Metric"].str.contains("Profit Factor")]["Value"].values[0]
    # Must NOT substitute raw dollar profit (e.g. 30.0) as profit factor ratio!
    assert "No Losses" in pf_row or "999" in pf_row

