"""
MarketPulse — Strategy Confidence Calibrator
=============================================
Manages empirical strategy confidence calibration derived from realized walk-forward outcomes.
Converts arbitrary static heuristic conviction labels (e.g. fixed 85.0) into
empirically calibrated posterior win probabilities smoothed with uninformative priors:
    P(Win | Strategy) = (Wins + alpha) / (Trades + alpha + beta)
Scales confidence by realized profit factor and macro market regime.
"""

from typing import Dict, Optional, Any, Set
import numpy as np


class StrategyConfidenceCalibrator:
    """
    Manages empirical strategy confidence calibration derived from realized walk-forward outcomes.
    Explicitly distinguishes between empirically validated strategies and uncalibrated priors.
    """
    # 5 core strategies rigorously validated via 5-year out-of-sample walk-forward backtesting (1,471 trades)
    DEFAULT_EMPIRICAL_STRATEGIES: Set[str] = {
        "Trend Pullback",
        "Momentum Breakout",
        "Mean Reversion",
        "Volatility Squeeze",
        "Connors RSI-2 Rebound",
    }

    # Empirical baseline derived from 1,381 BIST OOS standalone walk-forward trades
    DEFAULT_BIST_CALIBRATION: Dict[str, float] = {
        "Trend Pullback": 57.8,
        "Momentum Breakout": 57.3,
        "Mean Reversion": 48.0,
        "Volatility Squeeze": 71.7,
        "Connors RSI-2 Rebound": 53.8,
        # Uncalibrated priors (retained pending dedicated walk-forward backtests)
        "Fund Momentum": 75.0,
        "Minervini VCP Breakout": 76.0,
        "Anchored VWAP Pullback": 73.0,
        "Liquidity Sweep": 69.0,
        "High Tight Flag": 71.0,
        "Pullback Reclaim": 70.0,
    }

    # Empirical baseline derived from 1,330 US OOS standalone walk-forward trades
    DEFAULT_US_CALIBRATION: Dict[str, float] = {
        "Momentum Breakout": 69.6,
        "Volatility Squeeze": 62.5,
        "Connors RSI-2 Rebound": 50.3,
        "Trend Pullback": 48.2,
        "Mean Reversion": 45.6,
        # Uncalibrated priors
        "Fund Momentum": 75.0,
        "Minervini VCP Breakout": 76.0,
        "Anchored VWAP Pullback": 73.0,
        "Liquidity Sweep": 69.0,
        "High Tight Flag": 71.0,
        "Pullback Reclaim": 70.0,
    }

    # Default fallback
    DEFAULT_CALIBRATION = DEFAULT_BIST_CALIBRATION

    def __init__(
        self,
        bist_map: Optional[Dict[str, float]] = None,
        us_map: Optional[Dict[str, float]] = None
    ):
        self._bist_calibration = dict(self.DEFAULT_BIST_CALIBRATION)
        self._us_calibration = dict(self.DEFAULT_US_CALIBRATION)
        self._calibration = self._bist_calibration
        self._empirical_strategies = set(self.DEFAULT_EMPIRICAL_STRATEGIES)
        if bist_map:
            self._bist_calibration.update(bist_map)
        if us_map:
            self._us_calibration.update(us_map)

    def is_empirical(self, strategy: str) -> bool:
        """Returns True if the strategy confidence is backed by empirical walk-forward backtests."""
        return strategy.strip() in self._empirical_strategies

    def get_calibrated_confidence(
        self,
        strategy: str,
        market: str = "BIST",
        raw_confluence_score: Optional[float] = None,
        market_regime: Optional[str] = None
    ) -> float:
        """
        Returns the calibrated probability score (0-100) for a given strategy.
        Adjusts for market microstructure (US vs BIST), individual technical confluence, and macro regime.
        """
        strat_key = strategy.strip()
        cal_map = self._us_calibration if market.upper() == "US" else self._bist_calibration
        base = cal_map.get(strat_key, 60.0)

        # 1. Technical Confluence Adjustment (+/- 5%)
        if raw_confluence_score is not None and raw_confluence_score > 0:
            fine_tune = (raw_confluence_score - 80.0) * 0.15
            score = base + fine_tune
        else:
            score = base

        # 2. Macro Market Regime Gate
        if market_regime:
            regime_clean = market_regime.lower().strip()
            if regime_clean in ("bearish", "bear"):
                # Breakout / momentum strategies suffer sharp false-breakout rates in bear regimes
                if strat_key in ("Momentum Breakout", "High Tight Flag", "Minervini VCP Breakout"):
                    score *= 0.75  # 25% discount in bear market
                else:
                    score *= 0.88  # 12% discount for pullbacks/mean reversion
            elif regime_clean in ("bullish", "bull"):
                score *= 1.05  # 5% boost in favorable market regime

        return round(float(np.clip(score, 40.0, 95.0)), 1)

    def get_confidence_metadata(
        self,
        strategy: str,
        market: str = "BIST",
        raw_confluence_score: Optional[float] = None,
        market_regime: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Returns complete metadata clarifying empirical calibration vs uncalibrated prior.
        """
        score = self.get_calibrated_confidence(
            strategy=strategy,
            market=market,
            raw_confluence_score=raw_confluence_score,
            market_regime=market_regime
        )
        source = "EMPIRICAL" if self.is_empirical(strategy) else "PRIOR"

        return {
            "confidence_score": score,
            "confidence_source": source,
            "is_calibrated": (source == "EMPIRICAL"),
            "market_regime": market_regime or "neutral",
        }

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
                self._calibration[strat] = round(float(np.clip(calibrated, 45.0, 92.0)), 1)
                self._empirical_strategies.add(strat)

        return dict(self._calibration)

    @property
    def calibration_table(self) -> Dict[str, float]:
        return dict(self._calibration)


# Global singleton instance for system-wide calibration
default_calibrator = StrategyConfidenceCalibrator()
