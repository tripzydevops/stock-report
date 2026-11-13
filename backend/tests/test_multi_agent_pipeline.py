"""
Unit and Integration Tests for Autonomous Multi-Agent Reasoning Pipeline
========================================================================
Tests the 4-agent reasoning architecture:
1. ScreenerAgent (Stage 2 trend, RSI, volume confirmation, ORB bias).
2. DividendSafetyAgent (KAP schedule verification, payout safety, non-payer handling).
3. RiskGuardAgent (ATR dynamic stop loss, position lot sizing, concentration limits, regime defense).
4. SynthesisAgent (Cold start resolution, cross-domain lifestyle mapping, Pydantic structured output).
5. FastAPI Endpoint Integration (/api/assistant/multi-agent-analyze).
"""

import pytest
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.services.multi_agent_pipeline import (
    AgentScreenerVerdict,
    AgentDividendVerdict,
    AgentRiskVerdict,
    UserProfileContext,
    SynthesizedRecommendation,
    MultiAgentAnalyzeRequest,
    MultiAgentAnalyzeResponse,
    run_screener_agent,
    run_dividend_safety_agent,
    run_risk_guard_agent,
    run_synthesis_agent,
    run_multi_agent_pipeline
)

client = TestClient(app)

# ---------------------------------------------------------------------
# Test Agent 1: ScreenerAgent
# ---------------------------------------------------------------------

def test_screener_agent_stage2_momentum():
    """Verify ScreenerAgent correctly identifies Stage 2 markup with volume surge."""
    # Synthesize 30 bars of upward trending data
    dates = pd.date_range("2026-01-01", periods=30)
    df = pd.DataFrame({
        "open": [100.0 + i for i in range(30)],
        "high": [102.0 + i for i in range(30)],
        "low": [99.0 + i for i in range(30)],
        "close": [101.0 + i for i in range(30)],
        "volume": [1000000] * 29 + [2500000],  # 2.5x volume surge on last day
        "ema_50": [95.0 + (i * 0.5) for i in range(30)],
        "ema_200": [90.0 + (i * 0.2) for i in range(30)],
        "rsi_14": [55.0] * 30,
        "volume_ratio": [1.0] * 29 + [1.8],
    }, index=dates)

    verdict = run_screener_agent(symbol="FROTO", df=df)
    assert isinstance(verdict, AgentScreenerVerdict)
    assert verdict.symbol == "FROTO"
    assert verdict.passed is True
    assert "Stage 2" in verdict.trend_stage
    assert verdict.volume_confirmed is True
    assert verdict.confidence_score >= 0.60
    assert len(verdict.technical_reasons) > 0


def test_screener_agent_downtrend_rejection():
    """Verify ScreenerAgent flags Stage 4 downtrend when price is below moving averages."""
    dates = pd.date_range("2026-01-01", periods=30)
    df = pd.DataFrame({
        "open": [100.0 - i for i in range(30)],
        "high": [101.0 - i for i in range(30)],
        "low": [98.0 - i for i in range(30)],
        "close": [99.0 - i for i in range(30)],
        "volume": [1000000] * 30,
        "ema_50": [110.0] * 30,
        "ema_200": [120.0] * 30,
        "rsi_14": [28.0] * 30,
        "volume_ratio": [0.8] * 30,
    }, index=dates)

    verdict = run_screener_agent(symbol="DUMMY", df=df)
    assert verdict.passed is False
    assert "Stage 4" in verdict.trend_stage
    assert verdict.confidence_score < 0.55


# ---------------------------------------------------------------------
# Test Agent 2: DividendSafetyAgent
# ---------------------------------------------------------------------

def test_dividend_safety_agent_confirmed_payer():
    """Verify DividendSafetyAgent scores confirmed KAP dividend payer (FROTO)."""
    verdict = run_dividend_safety_agent("FROTO")
    assert isinstance(verdict, AgentDividendVerdict)
    assert verdict.symbol == "FROTO"
    assert verdict.is_dividend_payer is True
    assert verdict.annual_yield_pct is not None
    assert verdict.annual_yield_pct > 0.0
    assert verdict.payout_safety_score >= 70.0
    assert verdict.distribution_status in ["Confirmed", "Estimated"]
    assert any("temettü" in r.lower() or "kap" in r.lower() for r in verdict.dividend_reasons)


def test_dividend_safety_agent_non_payer_growth():
    """Verify DividendSafetyAgent handles non-paying / CapEx growth stock (THYAO)."""
    verdict = run_dividend_safety_agent("THYAO")
    assert verdict.symbol == "THYAO"
    assert verdict.is_dividend_payer is False
    assert verdict.annual_yield_pct is None
    assert verdict.payout_safety_score == 0.0
    assert verdict.distribution_status == "No Payout (CapEx Growth)"
    assert any("büyüme" in r.lower() or "capex" in r.lower() for r in verdict.dividend_reasons)


# ---------------------------------------------------------------------
# Test Agent 3: RiskGuardAgent
# ---------------------------------------------------------------------

def test_risk_guard_agent_dynamic_stop_and_sizing():
    """Verify RiskGuardAgent calculates ATR stops, sizing, and concentration limits."""
    user_prof = UserProfileContext(
        is_cold_start=True,
        account_size_try=500000.0,
        risk_tolerance="moderate",
        lifestyle_archetype="balanced_compounder"
    )

    verdict = run_risk_guard_agent(
        symbol="TUPRS",
        current_price=160.0,
        atr=5.0,
        user_profile=user_prof,
        regime="bullish"
    )

    assert isinstance(verdict, AgentRiskVerdict)
    assert verdict.symbol == "TUPRS"
    # Stop loss must be strictly below current price
    assert verdict.suggested_stop_loss < 160.0
    # Stop loss distance should be within realistic 3% - 8% range
    assert 3.0 <= verdict.stop_loss_pct <= 8.5
    # Target price must offer >= 1.5x R:R
    assert verdict.target_price > 160.0
    assert verdict.risk_reward_ratio >= 1.5
    # Position sizing must not violate 20% concentration ceiling (₺100,000 for ₺500,000 account)
    assert verdict.suggested_position_value <= 100000.0 * 1.05
    assert verdict.suggested_position_shares > 0
    assert verdict.regime_approved is True


def test_risk_guard_agent_bearish_regime_defense():
    """Verify RiskGuardAgent reduces position sizing during Bearish regimes."""
    user_prof = UserProfileContext(account_size_try=200000.0)

    verdict_bull = run_risk_guard_agent(
        symbol="ASELS",
        current_price=60.0,
        atr=2.0,
        user_profile=user_prof,
        regime="bullish"
    )

    verdict_bear = run_risk_guard_agent(
        symbol="ASELS",
        current_price=60.0,
        atr=2.0,
        user_profile=user_prof,
        regime="bearish"
    )

    assert verdict_bear.regime_approved is False
    assert "Defensive" in verdict_bear.regime_alignment
    # Defensive shares should be roughly half of bullish shares
    assert verdict_bear.suggested_position_shares <= verdict_bull.suggested_position_shares


# ---------------------------------------------------------------------
# Test Agent 4: SynthesisAgent & Cold Start Resolution
# ---------------------------------------------------------------------

def test_synthesis_agent_cold_start_passive_cashflow():
    """Verify SynthesisAgent resolves Cold-Start for passive cashflow preference."""
    user_prof = UserProfileContext(
        is_cold_start=True,
        account_size_try=300000.0,
        lifestyle_archetype="passive_cashflow"
    )

    screener = run_screener_agent("FROTO")
    dividend = run_dividend_safety_agent("FROTO")
    risk = run_risk_guard_agent("FROTO", current_price=1050.0, atr=30.0, user_profile=user_prof)

    synth = run_synthesis_agent(
        symbol="FROTO",
        screener=screener,
        dividend=dividend,
        risk=risk,
        user_profile=user_prof
    )

    assert isinstance(synth, SynthesizedRecommendation)
    assert synth.symbol == "FROTO"
    assert synth.overall_verdict in ["STRONG_BUY", "BUY", "ACCUMULATE"]
    assert synth.conviction_score >= 5
    assert synth.cold_start_resolved is True
    # Explanations must address cold start and dividend cashflow
    assert any("cold-start" in exp.lower() or "yaşam tarzı" in exp.lower() for exp in synth.why_recommended)
    assert any("temettü" in exp.lower() for exp in synth.why_recommended)
    assert len(synth.key_risks) > 0
    assert "stop_loss" in synth.actionable_plan


def test_synthesis_agent_cold_start_momentum_growth():
    """Verify SynthesisAgent prioritizes breakout momentum for growth archetype."""
    user_prof = UserProfileContext(
        is_cold_start=True,
        lifestyle_archetype="momentum_growth"
    )

    screener = run_screener_agent("THYAO")
    dividend = run_dividend_safety_agent("THYAO")
    risk = run_risk_guard_agent("THYAO", current_price=310.0, atr=10.0, user_profile=user_prof)

    synth = run_synthesis_agent(
        symbol="THYAO",
        screener=screener,
        dividend=dividend,
        risk=risk,
        user_profile=user_prof
    )

    assert synth.symbol == "THYAO"
    assert "Momentum" in synth.time_horizon or "Swing" in synth.time_horizon
    assert synth.actionable_plan["symbol"] == "THYAO"


# ---------------------------------------------------------------------
# Test Master Pipeline & FastAPI Endpoint Integration
# ---------------------------------------------------------------------

def test_run_multi_agent_pipeline_full_flow():
    """Test full execution of master pipeline function."""
    req = MultiAgentAnalyzeRequest(
        symbol="TURSG",
        user_profile=UserProfileContext(is_cold_start=True, lifestyle_archetype="balanced_compounder"),
        market="BIST"
    )
    res = run_multi_agent_pipeline(req)
    assert isinstance(res, MultiAgentAnalyzeResponse)
    assert res.recommendation.symbol == "TURSG"
    assert res.recommendation.screener_agent.symbol == "TURSG"
    assert res.recommendation.dividend_agent.symbol == "TURSG"
    assert res.recommendation.risk_agent.symbol == "TURSG"
    assert res.latency_ms is not None and res.latency_ms >= 0


def test_fastapi_multi_agent_analyze_post_endpoint():
    """Verify POST /api/assistant/multi-agent-analyze endpoint."""
    payload = {
        "symbol": "ISMEN",
        "user_profile": {
            "is_cold_start": True,
            "account_size_try": 250000.0,
            "lifestyle_archetype": "passive_cashflow",
            "risk_tolerance": "moderate"
        },
        "market": "BIST"
    }
    response = client.post("/api/assistant/multi-agent-analyze", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "recommendation" in data
    rec = data["recommendation"]
    assert rec["symbol"] == "ISMEN"
    assert rec["overall_verdict"] in ["STRONG_BUY", "BUY", "ACCUMULATE", "HOLD", "AVOID"]
    assert len(rec["why_recommended"]) > 0
    assert rec["screener_agent"]["symbol"] == "ISMEN"
    assert rec["dividend_agent"]["symbol"] == "ISMEN"
    assert rec["risk_agent"]["symbol"] == "ISMEN"


def test_fastapi_multi_agent_analyze_get_endpoint():
    """Verify GET /api/assistant/multi-agent-analyze/{symbol} endpoint."""
    response = client.get("/api/assistant/multi-agent-analyze/FROTO?archetype=passive_cashflow")
    assert response.status_code == 200
    data = response.json()
    assert data["recommendation"]["symbol"] == "FROTO"
    assert data["recommendation"]["cold_start_resolved"] is True
