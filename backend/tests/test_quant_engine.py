"""
Unit tests for Institutional Quant Factor Engine, Pairs Trading, and Risk Sizing.
"""
import pytest
import pandas as pd
import numpy as np
from datetime import date

from app.services.quant_factor_engine import compute_cross_sectional_factors
from app.services.pairs_trading_engine import scan_pairs_opportunities, calculate_half_life
from app.services.risk_manager import (
    calculate_risk_budgeted_size,
    calculate_volatility_targeted_size
)

def _generate_synthetic_stock(base_price: float, drift: float, n_bars: int = 70) -> pd.DataFrame:
    dates = pd.date_range(end=date.today(), periods=n_bars, freq="B")
    t = np.linspace(0, 1, n_bars)
    prices = base_price * (1 + drift * t + np.sin(t * 10) * 0.05)
    volume = np.full(n_bars, 1_000_000.0)
    df = pd.DataFrame({
        "open": prices,
        "high": prices * 1.01,
        "low": prices * 0.99,
        "close": prices,
        "volume": volume,
        "rsi_14": np.full(n_bars, 50.0)
    }, index=dates)
    return df

class TestQuantFactorEngine:
    def test_cross_sectional_z_scoring(self):
        # Create 3 stocks: Leader, Average, Laggard
        data = {
            "LEADER": _generate_synthetic_stock(100.0, drift=0.30),
            "AVERAGE": _generate_synthetic_stock(50.0, drift=0.02),
            "LAGGARD": _generate_synthetic_stock(80.0, drift=-0.25)
        }
        factors = compute_cross_sectional_factors(data)
        assert len(factors) == 3
        assert "LEADER" in factors
        assert "LAGGARD" in factors

        leader = factors["LEADER"]
        laggard = factors["LAGGARD"]

        # Leader should have high composite Z and percentile rank
        assert leader["composite_z"] > laggard["composite_z"]
        assert leader["percentile_rank"] > laggard["percentile_rank"]
        assert leader["ret_1m_pct"] > laggard["ret_1m_pct"]
        assert "Tier-1" in leader["factor_tier"] or "Tier-2" in leader["factor_tier"]

class TestPairsTradingEngine:
    def test_pairs_spread_dislocation(self):
        n = 80
        # Make THYAO surge while PGSUS stays flat -> ratio expands
        thyao = _generate_synthetic_stock(100.0, drift=0.40, n_bars=n)
        pgsus = _generate_synthetic_stock(100.0, drift=-0.10, n_bars=n)

        data = {
            "THYAO.IS": thyao,
            "PGSUS.IS": pgsus
        }
        results = scan_pairs_opportunities(data, lookback=60)
        assert len(results) == 1
        pair = results[0]
        assert pair["leg_a"] == "THYAO"
        assert pair["leg_b"] == "PGSUS"
        assert pair["current_ratio"] > pair["mean_ratio"]
        assert pair["z_score"] > 1.5
        assert pair["direction"] in ["SHORT_SPREAD", "WATCHLIST"]
        assert pair["half_life_days"] > 0

    def test_half_life_calculation(self):
        # Ornstein-Uhlenbeck mean-reverting series
        np.random.seed(42)
        spread = pd.Series(np.exp(-np.linspace(0, 5, 50)) + np.random.normal(0, 0.05, 50))
        hl = calculate_half_life(spread)
        assert 1.0 <= hl <= 45.0

class TestInstitutionalRiskSizing:
    def test_risk_budgeted_allocator(self):
        # Risk budget: ₺150 loss
        # Entry: ₺100, Stop: ₺95 (₺5 risk per share)
        # Should buy exactly 150 / 5 = 30 shares
        res = calculate_risk_budgeted_size(risk_budget_try=150.0, entry_price=100.0, stop_loss=95.0)
        assert res["shares_to_buy"] == 30
        assert res["position_value"] == 3000.0
        assert res["effective_loss_at_stop"] == 150.0

    def test_volatility_targeted_allocator(self):
        # Target vol: 15%, Stock vol: 30% -> Weight = 15/30 = 50% capped at 35%
        res = calculate_volatility_targeted_size(
            account_size=100000.0,
            target_vol_pct=15.0,
            asset_annual_vol_pct=30.0,
            entry_price=50.0
        )
        assert res["weight_pct"] <= 35.0
        assert res["shares_to_buy"] > 0
        assert res["position_value"] == res["shares_to_buy"] * 50.0
