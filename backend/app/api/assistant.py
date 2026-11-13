"""
Market Pulse AI Assistant API Router
Provides an open conversational assistant endpoint capable of querying internal Supabase databases,
Opening Range Breakout (ORB) sessions, dividend calendars, and live external financial news.
"""

import logging
from fastapi import APIRouter, HTTPException, Body
from app.services.assistant_agent import (
    AssistantChatRequest,
    AssistantChatResponse,
    run_market_assistant
)
from app.services.multi_agent_pipeline import (
    MultiAgentAnalyzeRequest,
    MultiAgentAnalyzeResponse,
    UserProfileContext,
    run_multi_agent_pipeline
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["assistant"])

@router.post("/chat", response_model=AssistantChatResponse)
async def chat_with_market_assistant(request: AssistantChatRequest = Body(...)):
    """
    Autonomous AI financial analyst endpoint.
    Answers natural language queries about any stock (e.g. TURSG, THYAO),
    morning session dynamics, dividend schedules, or forward-looking scenarios.
    """
    try:
        response = run_market_assistant(request)
        return response
    except Exception as e:
        logger.error(f"Error in assistant chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/multi-agent-analyze", response_model=MultiAgentAnalyzeResponse)
async def analyze_with_multi_agent_pipeline(request: MultiAgentAnalyzeRequest = Body(...)):
    """
    Layer 2 Autonomous Multi-Agent Reasoning Endpoint.
    Orchestrates ScreenerAgent, DividendSafetyAgent, and RiskGuardAgent,
    synthesizing their findings into a transparent, structured Pydantic model
    that explains 'why' a trade/allocation was recommended and solves the Cold-Start challenge.
    """
    try:
        response = run_multi_agent_pipeline(request)
        return response
    except Exception as e:
        logger.error(f"Error in multi-agent pipeline: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/multi-agent-analyze/{symbol}", response_model=MultiAgentAnalyzeResponse)
async def get_multi_agent_analysis_by_symbol(
    symbol: str,
    market: str = "BIST",
    archetype: str = "balanced_compounder",
    risk_tolerance: str = "moderate"
):
    """
    Convenience GET endpoint for multi-agent reasoning on a single symbol.
    """
    try:
        # Map string archetype to valid UserProfileContext
        valid_archetypes = {"passive_cashflow", "momentum_growth", "capital_preserver", "balanced_compounder"}
        safe_arch = archetype if archetype in valid_archetypes else "balanced_compounder"
        valid_risks = {"conservative", "moderate", "aggressive"}
        safe_risk = risk_tolerance if risk_tolerance in valid_risks else "moderate"

        user_profile = UserProfileContext(
            is_cold_start=True,
            risk_tolerance=safe_risk,
            lifestyle_archetype=safe_arch
        )
        req = MultiAgentAnalyzeRequest(
            symbol=symbol,
            user_profile=user_profile,
            market=market
        )
        return run_multi_agent_pipeline(req)
    except Exception as e:
        logger.error(f"Error in multi-agent analysis for {symbol}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
