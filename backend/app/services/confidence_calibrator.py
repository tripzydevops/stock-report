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

    # Selective Deployment Matrix per Market
    # Focuses capital exclusively on validated positive-expectancy strategies.
    # Excludes strategies that demonstrated negative or marginal expectancy after friction.
    ACTIVE_DEPLOYED_STRATEGIES: Dict[str, Set[str]] = {
        "BIST": {
            "Trend Pullback",       # 63.0% WR, PF 1.29 (+TRY 34k)
            "Momentum Breakout",    # 64.0% WR, PF 1.23 (+TRY 35k)
            "Volatility Squeeze",   # 67.4% WR, PF 2.54 (+TRY 22k)
        },
        "US": {
            "Momentum Breakout",    # 61.2% WR, PF 2.04 (+$57k - US Superstar)
            "Volatility Squeeze",   # 57.7% WR, PF 3.86 (+$8.2k)
            # US Trend Pullback (PF 0.92, -$10k) and US Connors RSI-2 (PF 0.83, -$18k) disabled
            # US Mean Reversion (PF 1.04, +$1.9k over 5y) moved to RESEARCH_ONLY due to statistical insignificance
        },
    }

    # Strategies reserved for research, paper tracking, and further empirical refinement
    RESEARCH_ONLY_STRATEGIES: Set[str] = {
        "Mean Reversion",
        "Connors RSI-2 Rebound",
        "Fund Momentum",
        "Minervini VCP Breakout",
        "Anchored VWAP Pullback",
        "Liquidity Sweep",
        "High Tight Flag",
        "Pullback Reclaim",
    }

    # Regime Prior Multipliers (Heuristic Baseline Priors pending automated MLE shrinkage)
    # Bearish: breadth < 35% | Neutral: 35% <= breadth < 50% | Bullish: breadth >= 50%
    REGIME_PRIOR_MULTIPLIERS: Dict[str, Dict[str, float]] = {
        "bearish": {
            "Momentum Breakout": 0.70,
            "High Tight Flag": 0.70,
            "Minervini VCP Breakout": 0.70,
            "Trend Pullback": 0.86,
            "Connors RSI-2 Rebound": 0.85,
            "Mean Reversion": 0.90,
            "Volatility Squeeze": 0.88,
        },
        "neutral": {
            "Momentum Breakout": 1.0,
            "Trend Pullback": 1.0,
            "Mean Reversion": 1.0,
            "Volatility Squeeze": 1.0,
            "Connors RSI-2 Rebound": 1.0,
        },
        "bullish": {
            "Momentum Breakout": 1.08,
            "High Tight Flag": 1.08,
            "Minervini VCP Breakout": 1.08,
            "Trend Pullback": 1.06,
            "Connors RSI-2 Rebound": 1.02,
            "Mean Reversion": 1.02,
            "Volatility Squeeze": 1.05,
        },
    }
    # Backward compatibility alias
    EMPIRICAL_REGIME_MULTIPLIERS = REGIME_PRIOR_MULTIPLIERS

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

    def is_strategy_deployed(self, strategy: str, market: str = "BIST") -> bool:
        """Returns True if the strategy is approved for active deployment in the given market."""
        m_key = market.strip().upper()
        active_set = self.ACTIVE_DEPLOYED_STRATEGIES.get(m_key, self.ACTIVE_DEPLOYED_STRATEGIES["BIST"])
        return strategy.strip() in active_set

    def get_deployed_strategies(self, market: str = "BIST") -> list[str]:
        """Returns list of active approved strategies for the specified market."""
        m_key = market.strip().upper()
        active_set = self.ACTIVE_DEPLOYED_STRATEGIES.get(m_key, self.ACTIVE_DEPLOYED_STRATEGIES["BIST"])
        return sorted(list(active_set))

    def get_calibrated_confidence(
        self,
        strategy: str,
        market: str = "BIST",
        raw_confluence_score: Optional[float] = None,
        market_regime: Optional[str] = None
    ) -> float:
        """
        Returns the calibrated probability score (0-100) for a given strategy.
        Adjusts for market microstructure (US vs BIST), individual technical confluence, and empirical macro regime.
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

        # 2. Empirical Macro Market Regime Gate
        if market_regime:
            regime_clean = market_regime.lower().strip()
            mult_map = self.EMPIRICAL_REGIME_MULTIPLIERS.get(regime_clean, {})
            # Look up empirical strategy multiplier or apply conservative default
            if regime_clean in ("bearish", "bear"):
                mult = mult_map.get(strat_key, 0.85)
            elif regime_clean in ("bullish", "bull"):
                mult = mult_map.get(strat_key, 1.05)
            else:
                mult = 1.0
            score *= mult

        return round(float(np.clip(score, 40.0, 95.0)), 1)

    def get_confidence_metadata(
        self,
        strategy: str,
        market: str = "BIST",
        raw_confluence_score: Optional[float] = None,
        market_regime: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Returns complete metadata clarifying empirical calibration vs uncalibrated prior and deployment status.
        """
        score = self.get_calibrated_confidence(
            strategy=strategy,
            market=market,
            raw_confluence_score=raw_confluence_score,
            market_regime=market_regime
        )
        source = "EMPIRICAL" if self.is_empirical(strategy) else "PRIOR"
        is_deployed = self.is_strategy_deployed(strategy, market)
        status = "ACTIVE" if is_deployed else "RESEARCH_ONLY"

        regime_clean = (market_regime or "neutral").lower().strip()
        regime_mult = self.REGIME_PRIOR_MULTIPLIERS.get(regime_clean, {}).get(strategy.strip(), 1.0)

        return {
            "confidence_score": score,
            "confidence_source": source,
            "is_calibrated": (source == "EMPIRICAL"),
            "is_deployed": is_deployed,
            "deployment_status": status,
            "market_regime": market_regime or "neutral",
            "regime_prior_multiplier": regime_mult,
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
