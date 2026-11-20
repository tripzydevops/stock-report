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
        assert calibrator.get_calibrated_confidence("Trend Pullback") == 58.5
        assert calibrator.get_calibrated_confidence("Momentum Breakout") == 57.2

    def test_confluence_fine_tuning(self):
        calibrator = StrategyConfidenceCalibrator()
        # High raw score (>80) lifts confidence slightly
        boosted = calibrator.get_calibrated_confidence("Trend Pullback", raw_confluence_score=95.0)
        assert boosted > 58.5

        # Low raw score (<80) shades confidence slightly down
        shaded = calibrator.get_calibrated_confidence("Trend Pullback", raw_confluence_score=60.0)
        assert shaded < 58.5

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

    def test_walk_forward_run_on_synthetic_data(self):
        df = _generate_multi_year_bars(days=500)
        history = {"SYN1": df, "SYN2": df.copy()}

        engine = InstitutionalWalkForwardEngine(BacktestConfig(initial_capital=50_000.0))
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
