"""
Tests for Walk-Forward Backtesting Engine & Strategy Confidence Calibrator.
"""
import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from app.models.schemas import BacktestConfig, WalkForwardReport
from app.services.walk_forward_engine import InstitutionalWalkForwardEngine
from app.services.confidence_calibrator import StrategyConfidenceCalibrator
from app.services.indicators import compute_all_indicators


def _generate_multi_year_bars(start_date: str = "2022-01-01", days: int = 600) -> pd.DataFrame:
    """Generates synthetic multi-year daily OHLCV series."""
    dates = pd.date_range(start=start_date, periods=days, freq="B")
    np.random.seed(42)
    # Price random walk with slight upward drift
    returns = np.random.normal(loc=0.0008, scale=0.015, size=days)
    price = 100.0 * np.cumprod(1.0 + returns)

    high = price * (1.0 + np.random.uniform(0.005, 0.02, size=days))
    low = price * (1.0 - np.random.uniform(0.005, 0.02, size=days))
    open_p = (high + low) / 2.0
    volume = np.random.uniform(100_000, 500_000, size=days)

    df = pd.DataFrame({
        "open": open_p,
        "high": high,
        "low": low,
        "close": price,
        "adj_close": price,
        "volume": volume,
    }, index=dates)

    return compute_all_indicators(df)


class TestStrategyConfidenceCalibrator:
    def test_default_calibration(self):
        calibrator = StrategyConfidenceCalibrator()
        assert calibrator.get_calibrated_confidence("Trend Pullback") == 57.8
        assert calibrator.get_calibrated_confidence("Momentum Breakout") == 57.3

    def test_confluence_fine_tuning(self):
        calibrator = StrategyConfidenceCalibrator()
        # High raw score (>80) lifts confidence slightly
        boosted = calibrator.get_calibrated_confidence("Trend Pullback", raw_confluence_score=95.0)
        assert boosted > 57.8

        # Low raw score (<80) shades confidence slightly down
        shaded = calibrator.get_calibrated_confidence("Trend Pullback", raw_confluence_score=60.0)
        assert shaded < 57.8

    def test_bayesian_update_from_backtest(self):
        calibrator = StrategyConfidenceCalibrator()
        mock_stats = {
            "Trend Pullback": {
                "trades": 40,
                "wins": 30,  # 75% win rate
                "profit_factor": 2.2,
            },
            "Mean Reversion": {
                "trades": 30,
                "wins": 10,  # 33% win rate
                "profit_factor": 0.8,
            }
        }
        updated = calibrator.update_from_backtest(mock_stats)

        # High win-rate, high-PF strategy should be calibrated higher
        assert updated["Trend Pullback"] > 70.0
        # Low win-rate strategy should be calibrated lower
        assert updated["Mean Reversion"] < 65.0

    def test_selective_deployment_matrix(self):
        calibrator = StrategyConfidenceCalibrator()
        # BIST approves Trend Pullback, Momentum Breakout, Volatility Squeeze
        assert calibrator.is_strategy_deployed("Trend Pullback", "BIST") is True
        assert calibrator.is_strategy_deployed("Momentum Breakout", "BIST") is True
        assert calibrator.is_strategy_deployed("Volatility Squeeze", "BIST") is True

        # US approves Momentum Breakout and Volatility Squeeze
        assert calibrator.is_strategy_deployed("Momentum Breakout", "US") is True
        assert calibrator.is_strategy_deployed("Volatility Squeeze", "US") is True

        # Both markets exclude negative/marginal strategies from active deployment
        assert calibrator.is_strategy_deployed("Trend Pullback", "US") is False
        assert calibrator.is_strategy_deployed("Connors RSI-2 Rebound", "US") is False
        assert calibrator.is_strategy_deployed("Mean Reversion", "US") is False
        assert calibrator.is_strategy_deployed("Mean Reversion", "BIST") is False

        assert calibrator.get_deployed_strategies("BIST") == ["Momentum Breakout", "Trend Pullback", "Volatility Squeeze"]
        assert calibrator.get_deployed_strategies("US") == ["Momentum Breakout", "Volatility Squeeze"]

    def test_regime_prior_multiplier(self):
        calibrator = StrategyConfidenceCalibrator()
        # Neutral baseline
        score_neutral = calibrator.get_calibrated_confidence("Momentum Breakout", market="US", market_regime="neutral")
        # Bearish regime discount (0.70x for Breakouts)
        score_bear = calibrator.get_calibrated_confidence("Momentum Breakout", market="US", market_regime="bearish")
        assert score_bear < score_neutral
        # Bullish regime boost (1.08x for Breakouts)
        score_bull = calibrator.get_calibrated_confidence("Momentum Breakout", market="US", market_regime="bullish")
        assert score_bull > score_neutral


class TestInstitutionalWalkForwardEngine:
    def test_generate_walk_forward_windows(self):
        dates = pd.date_range(start="2022-01-01", periods=500, freq="B")
        windows = InstitutionalWalkForwardEngine.generate_walk_forward_windows(
            dates, train_months=12, test_months=4, step_months=4
        )
        assert len(windows) >= 1
        for tr_s, tr_e, te_s, te_e in windows:
            assert tr_s < tr_e
            assert tr_e < te_s
            assert te_s < te_e

    def test_inv_norm_cdf_accuracy(self):
        from app.services.walk_forward_engine import inv_norm_cdf
        # Standard analytical reference values
        assert abs(inv_norm_cdf(0.975) - 1.960) < 0.005
        assert abs(inv_norm_cdf(0.950) - 1.645) < 0.005
        assert abs(inv_norm_cdf(0.500) - 0.000) < 0.001

    def test_canonical_deflated_sharpe_ratio(self):
        from app.services.walk_forward_engine import compute_deflated_sharpe_ratio, compute_bootstrap_sharpe_ci
        # Case 1: Low Sharpe series tested across M=50 trials should be penalized (DSR < 0.5)
        np.random.seed(42)
        low_daily = list(np.random.normal(loc=0.0002, scale=0.012, size=500))
        sr_low, star_low, dsr_low = compute_deflated_sharpe_ratio(low_daily, num_trials=50)
        assert star_low > sr_low
        assert dsr_low < 0.50

        # Case 2: High Sharpe series (e.g. SR ~ 2.5) across M=50 trials should hold high confidence (DSR > 0.85)
        high_daily = list(np.random.normal(loc=0.0018, scale=0.011, size=500))
        sr_high, star_high, dsr_high = compute_deflated_sharpe_ratio(high_daily, num_trials=50)
        assert sr_high > star_high
        assert dsr_high > 0.85

        # Case 3: Bootstrap confidence interval
        ci = compute_bootstrap_sharpe_ci(high_daily, n_boot=200, ci_pct=95.0)
        assert len(ci) == 2
        assert ci[0] < ci[1]
        assert ci[0] > 0.0  # Entire 95% CI is strictly positive

    def test_circular_block_bootstrap(self):
        from app.services.walk_forward_engine import compute_block_bootstrap_sharpe_ci
        # When sample < 20 bars, returns [0.0, 0.0]
        assert compute_block_bootstrap_sharpe_ci([0.01] * 15) == [0.0, 0.0]

        # Valid series with block_size=10
        np.random.seed(42)
        returns = list(np.random.normal(loc=0.001, scale=0.01, size=100))
        ci = compute_block_bootstrap_sharpe_ci(returns, block_size=10, n_boot=200)
        assert len(ci) == 2
        assert ci[0] <= ci[1]

    def test_tefas_deployment_and_screener_default(self):
        from app.services.confidence_calibrator import StrategyConfidenceCalibrator
        import inspect
        from app.services.screener import run_all_screens

        calibrator = StrategyConfidenceCalibrator()
        assert calibrator.is_strategy_deployed("Fund Momentum", "TEFAS") is True
        assert calibrator.get_deployed_strategies("TEFAS") == ["Fund Momentum"]
        assert calibrator.is_strategy_deployed("Trend Pullback", "TEFAS") is False

        # Verify run_all_screens signature defaults deployed_only to True
        sig = inspect.signature(run_all_screens)
        assert sig.parameters["deployed_only"].default is True

    def test_walk_forward_run_on_synthetic_data(self):
        df = _generate_multi_year_bars(days=500)
        history = {"SYN1": df, "SYN2": df.copy()}

        engine = InstitutionalWalkForwardEngine(BacktestConfig(initial_capital=50_000.0, risk_posture="safe"))
        report = engine.run_walk_forward_validation(
            clean_history=history,
            market="BIST",
            train_months=12,
            test_months=4,
            step_months=4
        )

        assert isinstance(report, WalkForwardReport)
        assert report.market == "BIST"
        assert report.total_folds >= 1
        assert "calibrated_confidence_map" in report.model_dump()
        assert report.active_deployment_strategies == ["Momentum Breakout", "Trend Pullback", "Volatility Squeeze"]
        assert report.deflated_sharpe_ratio is not None
        assert report.annualized_sharpe is not None
        assert report.sharpe_bootstrap_ci_95 is not None
        assert report.round_trip_notional >= 0.0
        assert report.annualized_turnover >= 0.0
        assert len(report.equity_curve) > 0
        assert report.oos_total_return_pct is not None
        assert report.oos_max_drawdown_pct <= 0.0

