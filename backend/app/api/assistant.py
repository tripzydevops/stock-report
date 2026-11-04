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
