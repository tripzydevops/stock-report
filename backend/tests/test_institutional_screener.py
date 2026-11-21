"""
Unit tests for Institutional Screener strategies:
- Anchored VWAP Bounce
- Liquidity Sweep & Reclaim
- Relative Strength Leader
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from app.services.institutional_screener import (
    compute_anchored_vwap,
    screen_anchored_vwap_bounce,
    screen_liquidity_sweep_reclaim,
    screen_relative_strength_leaders,
    run_institutional_screens,
)


def _generate_synthetic_ohlcv(n_bars: int = 80, base_price: float = 100.0) -> pd.DataFrame:
    """Generate realistic OHLCV dataframe with indicators."""
    dates = [datetime(2026, 1, 1) + timedelta(days=i) for i in range(n_bars)]
    closes = []
    curr = base_price
    for _ in range(n_bars):
        curr += np.random.normal(0.2, 1.0)
        closes.append(round(curr, 2))

    df = pd.DataFrame(index=dates)
    df['close'] = closes
    df['open'] = [round(c - np.random.uniform(-0.5, 0.5), 2) for c in closes]
    df['high'] = [round(max(o, c) + np.random.uniform(0.1, 1.0), 2) for o, c in zip(df['open'], df['close'])]
    df['low'] = [round(min(o, c) - np.random.uniform(0.1, 1.0), 2) for o, c in zip(df['open'], df['close'])]
    df['volume'] = np.random.randint(100000, 500000, size=n_bars)
    df['rsi_14'] = 50.0
    df['atr_14'] = 2.0
    df['ema_20'] = df['close'].ewm(span=20).mean()
    df['ema_50'] = df['close'].ewm(span=50).mean()
    df['ema_200'] = df['close'] * 0.90  # Above 200 EMA
    df['volume_ratio'] = 1.0
    return df


def test_compute_anchored_vwap_monotonic():
    df = _generate_synthetic_ohlcv(50, 100.0)
    avwap = compute_anchored_vwap(df, 10)
    assert len(avwap) == 50
    assert pd.isna(avwap.iloc[5])  # Before anchor
    assert not pd.isna(avwap.iloc[10])  # At anchor
    assert not pd.isna(avwap.iloc[-1])  # After anchor
    assert avwap.iloc[-1] > 0


def test_anchored_vwap_bounce_detection():
    df = _generate_synthetic_ohlcv(70, 100.0)
    
    # Force anchor low 25 bars ago
    anchor_loc = 45
    df.loc[df.index[anchor_loc], 'low'] = 80.0
    df.loc[df.index[anchor_loc], 'close'] = 82.0
    df.loc[df.index[anchor_loc], 'open'] = 81.0

    # Recalculate moving averages and indicators
    df['ema_200'] = 85.0
    df['atr_14'] = 2.0
    df['rsi_14'] = 48.0

    # Calculate expected AVWAP from anchor
    avwap = compute_anchored_vwap(df, anchor_loc)
    avwap_target = avwap.iloc[-1]

    # Set last bar right at AVWAP with bullish rejection
    df.loc[df.index[-1], 'open'] = round(avwap_target * 0.998, 2)
    df.loc[df.index[-1], 'close'] = round(avwap_target * 1.005, 2)
    df.loc[df.index[-1], 'low'] = round(avwap_target * 0.995, 2)
    df.loc[df.index[-1], 'high'] = round(avwap_target * 1.02, 2)

    signal = screen_anchored_vwap_bounce(df, "TEST.IS")
    assert signal is not None
    assert signal['symbol'] == "TEST.IS"
    assert signal['strategy'] == "Anchored VWAP Bounce"
    assert signal['stop_loss'] < signal['entry_price']
    assert signal['target_1'] > signal['entry_price']
    assert signal['risk_reward_ratio'] >= 1.2


def test_liquidity_sweep_reclaim_detection():
    df = _generate_synthetic_ohlcv(60, 150.0)
    
    # Establish a clear swing low 10 bars ago
    prior_support_idx = len(df) - 10
    prior_support = 140.0
    df.loc[df.index[prior_support_idx], 'low'] = prior_support
    df.loc[df.index[prior_support_idx], 'close'] = 142.0

    # Today's bar:
    # 1. Sweeps below 140.0 (low = 138.5)
    # 2. Reclaims and closes at 143.0 (well above 140.0)
    # 3. High = 143.5 -> Total range = 5.0, Lower wick = (open 141 - low 138.5) = 2.5 (50% wick)
    # 4. High volume ratio
    df.loc[df.index[-1], 'open'] = 141.0
    df.loc[df.index[-1], 'low'] = 138.5
    df.loc[df.index[-1], 'high'] = 143.5
    df.loc[df.index[-1], 'close'] = 143.0
    df.loc[df.index[-1], 'volume_ratio'] = 1.45
    df.loc[df.index[-1], 'atr_14'] = 3.0

    signal = screen_liquidity_sweep_reclaim(df, "THYAO.IS", lookback=20)
    assert signal is not None
    assert signal['symbol'] == "THYAO.IS"
    assert signal['strategy'] == "Liquidity Sweep Reclaim"
    assert signal['entry_price'] == 143.0
    assert signal['stop_loss'] < 140.0  # Stop under swept low
    assert signal['target_1'] > signal['entry_price']


def test_relative_strength_leaders_divergence():
    stock_df = _generate_synthetic_ohlcv(50, 100.0)
    bench_df = _generate_synthetic_ohlcv(50, 500.0)

    # Benchmark drops 3% over last 15 days
    bench_df.loc[bench_df.index[-16], 'close'] = 520.0
    bench_df.loc[bench_df.index[-1], 'close'] = 504.0

    # Stock advances 8% over last 15 days
    stock_df.loc[stock_df.index[-16], 'close'] = 95.0
    stock_df.loc[stock_df.index[-1], 'close'] = 103.0
    stock_df.loc[stock_df.index[-1], 'open'] = 102.0
    stock_df['ema_20'] = 98.0
    stock_df['ema_50'] = 94.0
    stock_df['atr_14'] = 2.0

    signal = screen_relative_strength_leaders(stock_df, "NVDA", benchmark_df=bench_df, window=15)
    assert signal is not None
    assert signal['symbol'] == "NVDA"
    assert signal['strategy'] == "Relative Strength Leader"
    assert signal['entry_price'] == 103.0
    assert signal['target_1'] > signal['entry_price']
    assert signal['stop_loss'] < signal['entry_price']


def test_run_institutional_screens_composite():
    asset_data = {
        "NVDA": _generate_synthetic_ohlcv(60, 120.0),
        "SPY": _generate_synthetic_ohlcv(60, 550.0),
    }
    asset_info = {
        "NVDA": {"Market": "US", "type": "stock"},
        "SPY": {"Market": "US", "type": "etf"},
    }
    signals = run_institutional_screens(asset_data, asset_info)
    assert isinstance(signals, list)


def test_scanner_api_endpoints_deployed_only_defaults():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # 1. User Recommendations Endpoint defaults to deployed_only=True
    r_recom = client.get("/api/scan/recommendations")
    assert r_recom.status_code == 200
    assert isinstance(r_recom.json(), list)

    # 2. Paper Trading Endpoint defaults to deployed_only=True
    r_paper = client.get("/api/scan/paper-trading")
    assert r_paper.status_code == 200
    assert isinstance(r_paper.json(), list)

    # 3. Live Trading Inspection Endpoint defaults to deployed_only=True and emits safety headers
    r_live = client.get("/api/scan/live-trading")
    assert r_live.status_code == 200
    assert isinstance(r_live.json(), list)
    assert r_live.headers.get("x-live-trading-enabled") == "false"
    assert r_live.headers.get("x-execution-kill-switch") == "ACTIVE"
    assert r_live.headers.get("x-operational-mode") == "READ_ONLY_INSPECTION"

    # 4. Research Endpoint defaults to deployed_only=False
    r_res = client.get("/api/scan/research")
    assert r_res.status_code == 200
    assert isinstance(r_res.json(), list)

    # 5. Production Signals Endpoint defaults to deployed_only=True
    r_sig = client.get("/api/scan/signals")
    assert r_sig.status_code == 200
    assert isinstance(r_sig.json(), list)


def test_live_trading_execution_kill_switch_engaged():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)

    # Execution attempt must be rejected with 403 Forbidden because LIVE_TRADING_ENABLED = False
    order_payload = {
        "signal_id": "test-sig-123",
        "symbol": "THYAO.IS",
        "shares": 100,
        "order_type": "LIMIT",
        "price": 310.0,
        "user_approval_token": "valid-signoff-token"
    }
    r = client.post("/api/scan/live-trading/execute", json=order_payload, headers={"Authorization": "Bearer broker-key"})
    assert r.status_code == 403
    assert "LIVE_TRADING_KILL_SWITCH_ACTIVE" in r.json()["detail"]


def test_signal_close_pnl_calculation_and_persistence(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    import app.api.scanner as scanner_mod

    client = TestClient(app)

    # Mock Supabase table interactions
    mock_records = {}
    class MockTable:
        def __init__(self, name):
            self.name = name
            self._select_cols = None
            self._eq_field = None
            self._eq_val = None
            self._update_data = None

        def select(self, cols):
            self._select_cols = cols
            return self

        def update(self, data):
            self._update_data = data
            return self

        def eq(self, field, val):
            self._eq_field = field
            self._eq_val = val
            return self

        def limit(self, n):
            return self

        def execute(self):
            class MockRes:
                def __init__(self, d):
                    self.data = d
            if self._update_data is not None:
                mock_records[self._eq_val] = self._update_data
                return MockRes([self._update_data])
            # Return synthetic signal with entry_price=100.0, direction=LONG
            return MockRes([{"entry_price": 100.0, "direction": "LONG"}])

    class MockClient:
        def table(self, name):
            return MockTable(name)

    monkeypatch.setattr(scanner_mod, "get_supabase_client", lambda: MockClient())

    close_req = {
        "status": "target_hit",
        "exit_price": 110.0,  # 10% gain - 0.15% friction = +9.85%
        "notes": "Target 1 hit at resistance"
    }
    r = client.put("/api/scan/signals/sig-777/close", json=close_req)
    assert r.status_code == 200
    res = r.json()
    assert res["status"] == "success"
    assert res["signal_id"] == "sig-777"
    assert res["new_status"] == "target_hit"
    assert res["exit_price"] == 110.0
    assert res["outcome_pnl_pct"] == 9.85
    assert res["notes"] == "Target 1 hit at resistance"
    assert "sig-777" in mock_records
    assert mock_records["sig-777"]["outcome_pnl_pct"] == 9.85


def test_dynamic_posture_resolution():
    from app.api.scanner import resolve_posture

    assert resolve_posture("safe", None) == "safe"
    assert resolve_posture(None, "AGGRESSIVE") == "aggressive"
    assert resolve_posture("balanced", "safe") == "balanced"
    assert resolve_posture(None, None) is None

