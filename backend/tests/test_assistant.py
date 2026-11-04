"""
Unit and Integration Tests for Market Assistant Agent and API
Tests coverage for:
1. Month-based dividend filtering (e.g. January / Ocak)
2. 15-minute Opening Range Breakout (ORB) session synthesis
3. Live news and stock deep-dive for TURSG with 6-month scenario model
4. FastAPI /api/assistant/chat endpoint
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.market_assistant_tools import (
    tool_query_dividends,
    tool_analyze_morning_orb_session,
    tool_get_stock_profile,
    tool_generate_six_month_outlook
)
from app.services.assistant_agent import (
    AssistantChatRequest,
    ChatMessage,
    run_market_assistant,
    extract_stock_ticker_from_text,
    extract_month_from_text
)

client = TestClient(app)

def test_extract_ticker_and_month():
    assert extract_stock_ticker_from_text("research news on turgs or any stock") == "TURSG"
    assert extract_stock_ticker_from_text("THYAO hissesinde durum ne?") == "THYAO"
    assert extract_stock_ticker_from_text("Türkiye Sigorta için görüşün") == "TURSG"
    
    assert extract_month_from_text("which stocks pay dividends on january") == "january"
    assert extract_month_from_text("Ocak ayında temettü veren hisseler") == "january"
    assert extract_month_from_text("Mart 2027 temettü takvimi") == "march"

def test_tool_query_dividends_january():
    res = tool_query_dividends(month="january")
    assert "assets" in res
    assert res["count"] > 0
    symbols = [a["symbol"] for a in res["assets"]]
    # Should include January payers like O, MAIN, PG, BMY, VZ, etc.
    assert any(s in symbols for s in ["O", "MAIN", "PG", "BMY", "VZ", "PEP"])

def test_tool_analyze_morning_orb_session():
    res = tool_analyze_morning_orb_session()
    assert res["total_scanned_assets"] > 0
    assert "market_bias" in res
    assert len(res["top_volume_movers"]) > 0
    assert "macro_drivers" in res

def test_tool_get_stock_profile_turgs():
    profile = tool_get_stock_profile("TURSG")
    assert profile["name"] == "Türkiye Sigorta A.Ş."
    assert profile["market"] == "BIST"
    assert profile["dividend_yield"] > 0
    assert "Sigortacılık" in profile["sector"]

def test_tool_generate_six_month_outlook_turgs():
    outlook = tool_generate_six_month_outlook("TURSG")
    assert outlook["symbol"] == "TURSG"
    assert "bull_case" in outlook
    assert "base_case" in outlook
    assert "bear_case" in outlook
    assert len(outlook["dca_zones"]) > 0
    assert "invalidation_level" in outlook

def test_agent_run_dividend_query():
    req = AssistantChatRequest(
        messages=[ChatMessage(role="user", content="which stocks pay dividends on january")],
        language="en"
    )
    resp = run_market_assistant(req)
    assert "tool_query_dividends" in resp.tools_executed
    assert len(resp.reply) > 50
    assert any(w in resp.reply.lower() for w in ["dividend", "temettü", "january", "ocak", "yield", "payout"])
    assert len(resp.sources_used) > 0

def test_agent_run_morning_session_query():
    req = AssistantChatRequest(
        messages=[ChatMessage(role="user", content="is there any reason for the morning session to be this positive or negative")],
        language="en"
    )
    resp = run_market_assistant(req)
    assert "tool_analyze_morning_orb_session" in resp.tools_executed
    assert len(resp.reply) > 50
    assert any(w in resp.reply.lower() for w in ["bullish", "positive", "opening", "seans", "açılış", "gap", "orb"])

def test_agent_run_turgs_research_and_six_month_outlook():
    req = AssistantChatRequest(
        messages=[ChatMessage(role="user", content="research news on turgs and give me your analytical opinion on the next 6 months")],
        language="tr"
    )
    resp = run_market_assistant(req)
    assert "tool_get_stock_profile" in resp.tools_executed
    assert len(resp.reply) > 50
    assert any(w in resp.reply.upper() for w in ["TURSG", "TÜRKİYE SİGORTA", "SİGORTA"])
    assert any(w in resp.reply.lower() for w in ["senaryo", "fiyat", "temettü", "faiz", "aylık", "hedef"])

def test_api_chat_endpoint():
    payload = {
        "messages": [
            {"role": "user", "content": "which stocks pay dividends on january"}
        ],
        "language": "en"
    }
    response = client.post("/api/assistant/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "reply" in data
    assert len(data["tools_executed"]) > 0
