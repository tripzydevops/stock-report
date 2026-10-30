"""
Signal Explainer Service
=========================
Generates structured, human-readable rationales, explicit trigger checks,
failed/near-miss reasons, invalidation criteria, market context, and risk metrics
for all systematic screening strategies.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel


class SignalExplanation(BaseModel):
    trigger_reasons: List[str]
    failed_checks: List[str] = []
    invalidation: str
    market_context: Dict[str, Any]
    risk: Dict[str, Any]
    rationale: str


def build_pullback_reclaim_explanation(
    symbol: str,
    market: str,
    pullback_depth_pct: float,
    bars_since_peak: int,
    prior_high: float,
    range_position: float,
    vol_ratio: float,
    stop_loss: float,
    atr_14: float,
    entry_price: float,
    benchmark_symbol: str = "XU100",
    regime: str = "BULLISH",
    relative_strength: Optional[float] = None,
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Trend Pullback Reclaim."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0
    upper_pct = 100 - (range_position * 100.0)

    reasons = [
        f"Pulled back {pullback_depth_pct:.1f}% from the 20-day high (controlled retracement)",
        f"Pullback lasted {bars_since_peak} sessions (within max threshold)",
        f"Reclaimed prior-day high at {prior_high:.2f}",
        "Reclaimed EMA20 dynamic trend support",
        f"Closed in the upper {upper_pct:.0f}% of the daily candle range",
        f"Volume was {vol_ratio:.2f}x its 20-day average (accumulation confirmation)"
    ]

    invalidation = f"Close below {stop_loss:.2f} or a new close below the pullback swing low"

    rationale = (
        f"Trend Pullback Reclaim ({market}): {symbol} is in a Stage-2 uptrend and pulled back {pullback_depth_pct:.1f}% "
        f"from its 20-day high over {bars_since_peak} sessions. It reclaimed the prior-day "
        f"high and EMA20 on {vol_ratio:.2f}x average volume, closing in the upper "
        f"portion of its daily range ({100 - upper_pct:.0f}% of range). Benchmarked against {benchmark_symbol}. "
        f"This indicates buyers regained control after a healthy structural pullback."
    )

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": regime,
            "relative_strength_20d": relative_strength
        },
        "risk": {
            "atr_14": round(atr_14, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 1.5,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }


def build_momentum_breakout_explanation(
    symbol: str,
    market: str,
    prev_high_20: float,
    vol_ratio: float,
    rsi: float,
    entry_price: float,
    stop_loss: float,
    atr_14: float,
    has_ema200: bool = True,
    benchmark_symbol: str = "XU100",
    regime: str = "BULLISH",
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Momentum Breakout."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0

    reasons = [
        f"Closed above prior 20-day high at {prev_high_20:.2f} (volatility expansion)",
        f"Volume was {vol_ratio:.2f}x its 20-day average (strong institutional flow)",
        f"RSI(14) was {rsi:.1f}, above the 52 momentum expansion threshold",
        "Price closed above EMA50"
    ]
    if has_ema200:
        reasons.append("Price closed above EMA200 (Stage-2 uptrend confirmed)")

    invalidation = f"Close below {stop_loss:.2f} or failure to hold the breakout level"

    rationale = (
        f"{symbol} broke above its prior 20-day high at {prev_high_20:.2f} "
        f"with {vol_ratio:.2f}x average volume. RSI was {rsi:.1f}, and price held "
        f"above both EMA50 and EMA200, indicating momentum expansion within an established uptrend."
    )

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": regime,
        },
        "risk": {
            "atr_14": round(atr_14, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 1.5,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }


def build_trend_pullback_explanation(
    symbol: str,
    market: str,
    distance_to_ema: float,
    tested_ema: str,
    support_level: float,
    rsi: float,
    entry_price: float,
    stop_loss: float,
    atr_14: float,
    benchmark_symbol: str = "XU100",
    regime: str = "BULLISH",
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Trend Pullback."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0

    reasons = [
        "Price remains in a long-term uptrend above EMA200",
        f"Price pulled back to within {distance_to_ema:.2f}% of {tested_ema} ({support_level:.2f})",
        f"RSI(14) was {rsi:.1f}, within the 40–55 healthy reset zone",
        "Candle showed stabilization or a higher close at dynamic support"
    ]

    invalidation = f"Close below {stop_loss:.2f}, especially below EMA50"

    rationale = (
        f"{symbol} remains above EMA200 and pulled back to {support_level:.2f}, "
        f"near its {tested_ema} support zone. RSI reset to {rsi:.1f}, and the candle "
        f"showed price stabilization, suggesting the pullback is resolving within the primary uptrend."
    )

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": regime,
        },
        "risk": {
            "atr_14": round(atr_14, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 1.5,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }


def build_mean_reversion_explanation(
    symbol: str,
    market: str,
    rsi: float,
    bb_lower: float,
    reversal_type: str,
    entry_price: float,
    stop_loss: float,
    atr_14: float,
    target_1: float,
    benchmark_symbol: str = "XU100",
    regime: str = "NEUTRAL",
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Mean Reversion."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0

    reasons = [
        f"RSI(14) was {rsi:.1f}, in oversold capitulation territory (threshold <= 36)",
        f"Price tested lower Bollinger Band support at {bb_lower:.2f} (2.0σ extreme)",
        f"Candle showed reversal attempt: {reversal_type}",
        "Daily decline remained safely above the 4.5% falling-knife / taban limit guard"
    ]

    invalidation = f"Close below {stop_loss:.2f} or continuation below the recent exhaustion low"

    rationale = (
        f"{symbol} became technically oversold after declining toward its lower Bollinger Band. "
        f"RSI was {rsi:.1f}, and the candle showed a {reversal_type}. The setup targets "
        f"a mean-reversion rebound toward {target_1:.2f}, while the stop protects against continuation lower."
    )

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": regime,
        },
        "risk": {
            "atr_14": round(atr_14, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 1.5,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }


def build_volatility_squeeze_explanation(
    symbol: str,
    market: str,
    macd_hist: float,
    entry_price: float,
    stop_loss: float,
    atr_14: float,
    benchmark_symbol: str = "XU100",
    regime: str = "BULLISH",
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Volatility Squeeze."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0

    reasons = [
        "Volatility squeeze released after prolonged Bollinger/Keltner contraction",
        f"MACD histogram momentum turned positive ({macd_hist:+.3f})",
        "Price closed above EMA50",
        "Price closed above EMA200 (Stage-2 bias)"
    ]

    invalidation = f"Close below {stop_loss:.2f} or failure to hold the squeeze-release level"

    rationale = (
        f"{symbol} released a volatility squeeze after a contraction phase. "
        f"MACD momentum turned positive and price held above its major moving averages, "
        f"suggesting high-probability directional expansion."
    )

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": regime,
        },
        "risk": {
            "atr_14": round(atr_14, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 1.5,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }


def build_fund_momentum_explanation(
    symbol: str,
    market: str,
    ret_1m: float,
    ret_3m: float,
    max_dd: float,
    entry_price: float,
    stop_loss: float,
    benchmark_symbol: str = "TEFAS",
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Fund Momentum."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0

    reasons = [
        f"1-month return was {ret_1m*100:+.1f}% (top-quartile inflow momentum)",
        f"3-month return was positive at {ret_3m*100:+.1f}%",
        f"Maximum drawdown over three months was {max_dd*100:.1f}%, safely below 10%"
    ]

    invalidation = f"Close below {stop_loss:.2f} or loss of positive 3-month momentum"

    rationale = (
        f"{symbol} shows sustained fund momentum: a {ret_1m*100:+.1f}% one-month gain, "
        f"positive three-month performance, and contained drawdown ({max_dd*100:.1f}%). "
        f"The setup follows institutional capital rotation while risk remains controlled."
    )

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": "BULLISH",
        },
        "risk": {
            "atr_14": round(entry_price * 0.02, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 2.0,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }


def build_anchored_vwap_explanation(
    symbol: str,
    market: str,
    avwap_val: float,
    dist_pct: float,
    dipped_and_reclaimed: bool,
    rsi: float,
    entry_price: float,
    stop_loss: float,
    atr_14: float,
    benchmark_symbol: str = "XU100",
    regime: str = "BULLISH",
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Anchored VWAP Bounce."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0

    reasons = [
        f"Tested Anchored VWAP support at {avwap_val:.2f} (institutional volume-weighted cost basis)",
        f"Price retest was within {dist_pct*100:.1f}% of AVWAP" if not dipped_and_reclaimed else f"Intraday low dipped to AVWAP and closed back above at {entry_price:.2f} (institutional absorption wick)",
        f"RSI(14) was {rsi:.1f}, confirming healthy consolidation within support zone",
        "Price closed above key moving average support (macro Stage-2 trend)"
    ]

    invalidation = f"Close below {stop_loss:.2f} or decisive failure to defend AVWAP support ({avwap_val:.2f})"

    rationale = (
        f"{symbol} tested its Anchored VWAP at {avwap_val:.2f} anchored from a key institutional swing pivot. "
        f"Buyers absorbed selling pressure with RSI at {rsi:.1f}, confirming dynamic institutional support. "
        f"The setup targets an expansion move with stop loss anchored below the retest pivot."
    )

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": regime,
        },
        "risk": {
            "atr_14": round(atr_14, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 1.5,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }


def build_liquidity_sweep_explanation(
    symbol: str,
    market: str,
    prior_low: float,
    low_p: float,
    wick_ratio: float,
    vol_ratio: float,
    entry_price: float,
    stop_loss: float,
    atr_14: float,
    benchmark_symbol: str = "SPY",
    regime: str = "BULLISH",
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Liquidity Sweep & Reclaim."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0

    reasons = [
        f"Swept 20-day swing low at {prior_low:.2f} (flushed retail stop-loss liquidity pool)",
        f"Reclaimed support with strong close back above prior swing low at {entry_price:.2f}",
        f"Lower absorption wick comprised {wick_ratio*100:.0f}% of total daily range (smart money demand)",
        f"Volume ratio was {vol_ratio:.2f}x average (institutional accumulation volume)"
    ]

    invalidation = f"Close below {stop_loss:.2f} or a new breakdown below the sweep low at {low_p:.2f}"

    rationale = (
        f"{symbol} executed an institutional stop run: low swept below the 20-day support at {prior_low:.2f} "
        f"before aggressive buying created a {wick_ratio*100:.0f}% lower absorption wick. The bar closed firmly "
        f"above prior support on {vol_ratio:.2f}x volume, confirming liquidity trap and bullish reversal."
    )

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": regime,
        },
        "risk": {
            "atr_14": round(atr_14, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 1.5,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }


def build_relative_strength_explanation(
    symbol: str,
    market: str,
    stock_return: float,
    bench_return: Optional[float],
    rs_ratio: Optional[float],
    entry_price: float,
    stop_loss: float,
    atr_14: float,
    benchmark_symbol: str = "XU100",
    regime: str = "BULLISH",
    failed_checks: Optional[List[str]] = None
) -> Dict[str, Any]:
    """Structured explanation builder for Relative Strength Leader."""
    stop_dist_pct = ((entry_price - stop_loss) / entry_price) * 100.0 if entry_price > 0 else 0.0

    if bench_return is not None and rs_ratio is not None:
        reasons = [
            f"Stock generated {stock_return*100:+.1f}% return over 15 sessions while {benchmark_symbol} was {bench_return*100:+.1f}%",
            f"Relative Strength ratio was {rs_ratio:.2f} (strong institutional divergence)",
            "Price held firmly above rising EMA20 and EMA50 dynamic support",
            "Candle showed positive buying accumulation on trigger day"
        ]
        rationale = (
            f"{symbol} is demonstrating distinct institutional relative strength, advancing {stock_return*100:+.1f}% "
            f"over 15 sessions while {benchmark_symbol} returned {bench_return*100:+.1f}% (RS ratio: {rs_ratio:.2f}). "
            f"The asset remains aligned above both EMA20 and EMA50, signaling leadership during market divergence."
        )
    else:
        reasons = [
            f"Strong momentum advance of {stock_return*100:+.1f}% over 15 sessions",
            "Price held firmly above rising EMA20 and EMA50 dynamic support",
            "Candle confirmed positive buying accumulation on trigger day"
        ]
        rationale = (
            f"{symbol} is exhibiting leadership momentum, advancing {stock_return*100:+.1f}% over 15 sessions "
            f"and trading above key moving averages (EMA20/EMA50) with volume support."
        )

    invalidation = f"Close below {stop_loss:.2f} or trend failure below EMA50"

    return {
        "trigger_reasons": reasons,
        "failed_checks": failed_checks or [],
        "invalidation": invalidation,
        "market_context": {
            "benchmark": benchmark_symbol,
            "regime": regime,
            "relative_strength_20d": round(rs_ratio, 2) if rs_ratio is not None else None
        },
        "risk": {
            "atr_14": round(atr_14, 2),
            "stop_distance_pct": round(stop_dist_pct, 2),
            "max_position_pct": 1.5,
            "invalidation_level": round(stop_loss, 2)
        },
        "rationale": rationale
    }

