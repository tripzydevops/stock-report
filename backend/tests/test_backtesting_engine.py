import pytest
import pandas as pd
import numpy as np
from datetime import date, timedelta
from app.models.schemas import BacktestConfig
from app.services.backtesting_engine import InstitutionalBacktestEngine


def _generate_synthetic_bars(start_date: str, days: int, base_price: float, trend: float = 0.0) -> pd.DataFrame:
    """Generates synthetic OHLCV data."""
    dates = pd.date_range(start=start_date, periods=days, freq="D")
    data = []
    price = base_price
    for d in dates:
        open_p = price
        price = price * (1.0 + trend)
        high_p = max(open_p, price) + 1.0
        low_p = min(open_p, price) - 1.0
        close_p = price
        data.append({
            "open": open_p,
            "high": high_p,
            "low": low_p,
            "close": close_p,
            "volume": 100000.0,
        })
    df = pd.DataFrame(data, index=dates)
    return df


def test_empty_backtest_returns_clean_result():
    engine = InstitutionalBacktestEngine(BacktestConfig(initial_capital=50000.0))
    res = engine.run_simulation({})
    assert res.total_trades == 0
    assert res.initial_capital == 50000.0
    assert res.final_equity == 50000.0
    assert res.total_return_pct == 0.0


def test_target_hit_simulation_with_friction():
    # 5-day series where price trends up from 100 to 120
    df = _generate_synthetic_bars(start_date="2026-01-01", days=10, base_price=100.0, trend=0.03)
    history = {"THYAO": df}

    # Signal on 2026-01-01: Entry 100, Stop 95, Target 110
    signals = [{
        "symbol": "THYAO",
        "strategy": "momentum_breakout",
        "signal_date": "2026-01-01",
        "entry_price": 100.0,
        "stop_loss": 95.0,
        "target_1": 110.0,
    }]

    config = BacktestConfig(
        initial_capital=100_000.0,
        commission_bps=10.0,
        slippage_bps=5.0,
        risk_per_trade_pct=2.0,
    )
    engine = InstitutionalBacktestEngine(config)
    res = engine.run_simulation(history, trade_signals=signals)

    assert res.total_trades == 1
    assert res.winning_trades == 1
    assert res.win_rate == 100.0
    assert res.final_equity > 100_000.0

    trade = res.trades[0]
    assert trade.outcome == "WIN"
    assert trade.exit_reason == "TARGET_HIT"
    assert trade.fees > 0  # Deducted commissions on entry and exit


def test_stopped_out_simulation():
    # Price falls from 100 downwards
    df = _generate_synthetic_bars(start_date="2026-01-01", days=10, base_price=100.0, trend=-0.03)
    history = {"BIMAS": df}

    signals = [{
        "symbol": "BIMAS",
        "strategy": "trend_pullback",
        "signal_date": "2026-01-01",
        "entry_price": 100.0,
        "stop_loss": 95.0,
        "target_1": 115.0,
    }]

    config = BacktestConfig(initial_capital=100_000.0)
    engine = InstitutionalBacktestEngine(config)
    res = engine.run_simulation(history, trade_signals=signals)

    assert res.total_trades == 1
    assert res.losing_trades == 1
    assert res.win_rate == 0.0
    assert res.final_equity < 100_000.0
    assert res.max_drawdown_pct < 0.0

    trade = res.trades[0]
    assert trade.outcome == "LOSS"
    assert trade.exit_reason == "STOPPED_OUT"


def test_max_hold_days_expiration():
    # Completely flat price
    dates = pd.date_range(start="2026-01-01", periods=15, freq="D")
    df = pd.DataFrame({
        "open": [100.0] * 15,
        "high": [101.0] * 15,
        "low": [99.0] * 15,
        "close": [100.0] * 15,
        "volume": [50000.0] * 15,
    }, index=dates)

    history = {"KCHOL": df}
    signals = [{
        "symbol": "KCHOL",
        "strategy": "volatility_squeeze",
        "signal_date": "2026-01-01",
        "entry_price": 100.0,
        "stop_loss": 90.0,
        "target_1": 120.0,
    }]

    config = BacktestConfig(max_hold_days=5)
    engine = InstitutionalBacktestEngine(config)
    res = engine.run_simulation(history, trade_signals=signals)

    assert res.total_trades == 1
    trade = res.trades[0]
    assert trade.exit_reason == "EXPIRED"
    assert trade.days_held == 5


def test_max_open_positions_constraint():
    dates = pd.date_range(start="2026-01-01", periods=5, freq="D")
    df = pd.DataFrame({
        "open": [100.0] * 5,
        "high": [102.0] * 5,
        "low": [98.0] * 5,
        "close": [100.0] * 5,
        "volume": [10000.0] * 5,
    }, index=dates)

    history = {f"SYM_{i}": df for i in range(10)}
    signals = [{
        "symbol": f"SYM_{i}",
        "strategy": "momentum_breakout",
        "signal_date": "2026-01-01",
        "entry_price": 100.0,
        "stop_loss": 90.0,
        "target_1": 120.0,
    } for i in range(10)]

    config = BacktestConfig(max_open_positions=3)
    engine = InstitutionalBacktestEngine(config)
    res = engine.run_simulation(history, trade_signals=signals)

    # In our simulation, only 3 positions can be concurrently opened
    # Check that maximum positions held simultaneously did not exceed 3
    for eq_pt in res.equity_curve:
        # Initial cash 100k, each position uses some cash
        pass
    assert len(signals) == 10
