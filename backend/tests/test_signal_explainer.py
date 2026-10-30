"""
Tests for Signal Explainer Service & Structured Screener Output
"""
import pytest
import pandas as pd
import numpy as np
from datetime import date

from app.services.signal_explainer import (
    build_pullback_reclaim_explanation,
    build_momentum_breakout_explanation,
    build_trend_pullback_explanation,
    build_mean_reversion_explanation,
    build_volatility_squeeze_explanation,
    build_fund_momentum_explanation,
    build_anchored_vwap_explanation,
    build_liquidity_sweep_explanation,
    build_relative_strength_explanation,
)
from app.models.schemas import TradeSignalCreate, StrategyName


def test_pullback_reclaim_explainer_schema():
    exp = build_pullback_reclaim_explanation(
        symbol="THYAO",
        market="BIST",
        pullback_depth_pct=4.2,
        bars_since_peak=3,
        prior_high=315.0,
        range_position=0.75,
        vol_ratio=1.65,
        stop_loss=295.0,
        atr_14=8.2,
        entry_price=310.0,
        benchmark_symbol="XU100",
        regime="BULLISH"
    )
    assert len(exp["trigger_reasons"]) >= 5
    assert "invalidation" in exp and len(exp["invalidation"]) > 0
    assert exp["market_context"]["benchmark"] == "XU100"
    assert exp["market_context"]["regime"] == "BULLISH"
    assert exp["risk"]["stop_distance_pct"] > 0
    assert exp["risk"]["invalidation_level"] == 295.0
    assert "Trend Pullback Reclaim" in exp["rationale"]


def test_momentum_breakout_explainer_schema():
    exp = build_momentum_breakout_explanation(
        symbol="ASELS",
        market="BIST",
        prev_high_20=65.0,
        vol_ratio=2.1,
        rsi=64.5,
        entry_price=66.0,
        stop_loss=62.0,
        atr_14=2.0,
        has_ema200=True,
        benchmark_symbol="XU100"
    )
    assert len(exp["trigger_reasons"]) >= 4
    assert "invalidation" in exp
    assert exp["market_context"]["benchmark"] == "XU100"
    assert exp["risk"]["invalidation_level"] == 62.0


def test_trend_pullback_explainer_schema():
    exp = build_trend_pullback_explanation(
        symbol="TUPRS",
        market="BIST",
        distance_to_ema=0.8,
        tested_ema="EMA50",
        support_level=162.0,
        rsi=46.5,
        entry_price=164.0,
        stop_loss=158.0,
        atr_14=4.5,
        benchmark_symbol="XU100"
    )
    assert any("EMA50" in r for r in exp["trigger_reasons"])
    assert "invalidation" in exp


def test_mean_reversion_explainer_schema():
    exp = build_mean_reversion_explanation(
        symbol="ISCTR",
        market="BIST",
        rsi=28.5,
        bb_lower=12.4,
        reversal_type="Bullish green candle bounce",
        entry_price=12.8,
        stop_loss=12.1,
        atr_14=0.6,
        target_1=13.6,
        benchmark_symbol="XU100"
    )
    assert any("RSI(14)" in r for r in exp["trigger_reasons"])
    assert "invalidation" in exp


def test_volatility_squeeze_explainer_schema():
    exp = build_volatility_squeeze_explanation(
        symbol="KCHOL",
        market="BIST",
        macd_hist=0.45,
        entry_price=220.0,
        stop_loss=210.0,
        atr_14=5.5,
        benchmark_symbol="XU100"
    )
    assert any("squeeze" in r.lower() for r in exp["trigger_reasons"])
    assert exp["risk"]["invalidation_level"] == 210.0


def test_fund_momentum_explainer_schema():
    exp = build_fund_momentum_explanation(
        symbol="TLY",
        market="BIST",
        ret_1m=0.082,
        ret_3m=0.185,
        max_dd=0.045,
        entry_price=3.45,
        stop_loss=3.10,
        benchmark_symbol="TEFAS"
    )
    assert len(exp["trigger_reasons"]) == 3
    assert exp["market_context"]["benchmark"] == "TEFAS"


def test_institutional_explainers():
    vwap_exp = build_anchored_vwap_explanation(
        symbol="BIMAS",
        market="BIST",
        avwap_val=468.20,
        dist_pct=0.012,
        dipped_and_reclaimed=False,
        rsi=52.0,
        entry_price=472.50,
        stop_loss=458.0,
        atr_14=12.0
    )
    assert any("Anchored VWAP" in r for r in vwap_exp["trigger_reasons"])

    sweep_exp = build_liquidity_sweep_explanation(
        symbol="AAPL",
        market="US",
        prior_low=224.80,
        low_p=223.50,
        wick_ratio=0.45,
        vol_ratio=1.4,
        entry_price=228.40,
        stop_loss=222.0,
        atr_14=4.0
    )
    assert any("Swept" in r for r in sweep_exp["trigger_reasons"])

    rs_exp = build_relative_strength_explanation(
        symbol="NVDA",
        market="US",
        stock_return=0.065,
        bench_return=-0.015,
        rs_ratio=1.08,
        entry_price=125.0,
        stop_loss=118.0,
        atr_14=3.5,
        benchmark_symbol="SPY"
    )
    assert any("Relative Strength" in r for r in rs_exp["trigger_reasons"])


def test_pydantic_schema_validation_with_explainer():
    """Verify that signal dictionaries created with explainers pass TradeSignalCreate validation."""
    exp = build_pullback_reclaim_explanation(
        symbol="THYAO",
        market="BIST",
        pullback_depth_pct=3.5,
        bars_since_peak=2,
        prior_high=315.0,
        range_position=0.8,
        vol_ratio=1.5,
        stop_loss=295.0,
        atr_14=8.0,
        entry_price=310.0,
        benchmark_symbol="XU100"
    )

    signal_payload = {
        "asset_id": "test-uuid-123",
        "strategy": StrategyName.pullback_reclaim,
        "direction": "LONG",
        "entry_mode": "next_open",
        "signal_date": date.today(),
        "entry_price": 310.0,
        "stop_loss": 295.0,
        "target_1": 340.0,
        "target_2": 370.0,
        "risk_reward_ratio": 2.0,
        "confidence_score": 85.0,
        "trigger_reasons": exp["trigger_reasons"],
        "failed_checks": exp["failed_checks"],
        "invalidation": exp["invalidation"],
        "market_context": exp["market_context"],
        "risk": exp["risk"],
        "rationale": exp["rationale"],
        "ai_rationale": exp["rationale"]
    }

    validated = TradeSignalCreate(**signal_payload)
    assert validated.direction == "LONG"
    assert validated.entry_mode == "next_open"
    assert len(validated.trigger_reasons) >= 5
    assert validated.invalidation is not None
    assert validated.market_context["benchmark"] == "XU100"
    assert validated.risk["stop_distance_pct"] > 0
