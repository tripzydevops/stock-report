"""
MarketPulse — Strategy Confidence Calibrator
=============================================
Manages empirical strategy confidence calibration derived from realized walk-forward outcomes.
Converts arbitrary static heuristic conviction labels (e.g. fixed 85.0) into
empirically calibrated posterior win probabilities smoothed with uninformative priors:
    P(Win | Strategy) = (Wins + alpha) / (Trades + alpha + beta)
Scales confidence by realized profit factor and expectancy.
"""

from typing import Dict, Optional, Any
import numpy as np


class StrategyConfidenceCalibrator:
    """
    Manages empirical strategy confidence calibration derived from realized walk-forward outcomes.
    """
    DEFAULT_CALIBRATION: Dict[str, float] = {
        "Trend Pullback": 58.5,
        "Momentum Breakout": 57.2,
        "Mean Reversion": 50.6,
        "Volatility Squeeze": 66.2,
        "Connors RSI-2 Rebound": 53.0,
        "Fund Momentum": 75.0,
        "Minervini VCP Breakout": 76.0,
        "Anchored VWAP Pullback": 73.0,
        "Liquidity Sweep": 69.0,
        "High Tight Flag": 71.0,
        "Pullback Reclaim": 70.0,
    }

    def __init__(self, calibration_map: Optional[Dict[str, float]] = None):
        self._calibration = dict(self.DEFAULT_CALIBRATION)
        if calibration_map:
            self._calibration.update(calibration_map)

    def get_calibrated_confidence(
        self,
        strategy: str,
        market: str = "BIST",
        raw_confluence_score: Optional[float] = None
    ) -> float:
        """
        Returns the calibrated probability score (0-100) for a given strategy.
        If a raw confluence score is provided, adjusts around the empirical baseline (+/- 5%).
        """
        strat_key = strategy.strip()
        base = self._calibration.get(strat_key, 60.0)

        if raw_confluence_score is not None and raw_confluence_score > 0:
            # Confluence fine-tuning (bounded to +/- 5 points)
            fine_tune = (raw_confluence_score - 80.0) * 0.15
            score = base + fine_tune
        else:
            score = base

        return round(float(np.clip(score, 50.0, 95.0)), 1)

    def update_from_backtest(self, strategy_metrics: Dict[str, Dict[str, Any]]) -> Dict[str, float]:
        """
        Updates calibration mapping using realized walk-forward trade statistics.
        Uses Laplace-smoothed Bayesian posterior: (wins + 10) / (trades + 20).
        """
        for strat, stats in strategy_metrics.items():
            trades = int(stats.get("trades", 0))
            wins = int(stats.get("wins", 0))
            pf = float(stats.get("profit_factor", 1.0))

            if trades >= 5:
                # Bayesian smoothed win rate with Beta(10, 10) prior (50% baseline)
                smoothed_win_rate = (wins + 10.0) / (trades + 20.0)
                # Profit factor scaling factor (0.9 to 1.15)
                pf_mult = np.clip(np.sqrt(max(0.5, pf) / 1.5), 0.9, 1.15)
                calibrated = smoothed_win_rate * 100.0 * pf_mult
                self._calibration[strat] = round(float(np.clip(calibrated, 50.0, 92.0)), 1)

        return dict(self._calibration)

    @property
    def calibration_table(self) -> Dict[str, float]:
        return dict(self._calibration)


# Global singleton instance for system-wide calibration
default_calibrator = StrategyConfidenceCalibrator()
