import logging
import os
import time
from typing import Dict, List, Any
from pydantic import BaseModel, Field
try:
    from google import genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

class TradeCardAnalysis(BaseModel):
    thesis: str = Field(..., description="Why this trade, what's the catalyst")
    risk_assessment: str = Field(..., description="Market regime, volatility, sector conditions")
    conviction_score: int = Field(..., description="Conviction score 1-10", ge=1, le=10)
    recommended_action: str = Field(..., description="Actionable recommendation")
    additional_notes: str = Field(..., description="Any other pertinent information")

def generate_trade_card(signal: Dict, indicators: Dict, regime: Dict, asset_info: Dict) -> Dict:
    """
    Generates AI analysis for a trade setup using Gemini.
    """
    fallback_result = {
        'thesis': f"Technical breakout based on {signal.get('strategy')}",
        'risk_assessment': "Standard risk parameters apply.",
        'conviction_score': 5,
        'recommended_action': "Consider taking the trade with proper sizing.",
        'additional_notes': "AI analysis unavailable."
    }
    
    if not genai:
        logger.warning("google.genai not installed. Returning fallback.")
        return fallback_result

    # Using standard ENV var for Gemini API key, or could import from core.config
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not found. Returning fallback.")
        return fallback_result

    prompt = f"""
    Analyze the following trade setup as an expert quantitative trader:
    
    Asset: {signal.get('symbol')} ({asset_info.get('name', 'Unknown')})
    Market Regime: {regime.get('regime', 'Unknown')}
    Strategy Triggered: {signal.get('strategy')}
    Entry: {signal.get('entry_price')}
    Stop Loss: {signal.get('stop_loss')}
    Target: {signal.get('target_1')}
    
    Recent Indicators:
    RSI: {indicators.get('rsi_14')}
    Volume Ratio: {indicators.get('volume_ratio')}
    Trend (EMA50): {indicators.get('ema_50')}
    
    Provide a structured analysis addressing:
    1. Thesis (Why this trade?)
    2. Risk Assessment (Considering market regime and volatility)
    3. Conviction Score (1-10)
    4. Recommended Action
    5. Additional Notes
    """
    
    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config={
                'response_mime_type': 'application/json',
                'response_schema': TradeCardAnalysis,
            },
        )
        # Parse Pydantic output
        if response.parsed:
            return response.parsed.model_dump()
        else:
            logger.warning("Failed to parse Gemini output.")
            return fallback_result
    except Exception as e:
        logger.error(f"Error calling Gemini: {str(e)}")
        return fallback_result

def batch_analyze_signals(signals: List[Dict], indicators_map: Dict, regime: Dict, assets_map: Dict) -> List[Dict]:
    """Processes multiple signals with rate limiting."""
    results = []
    for signal in signals:
        symbol = signal.get('symbol')
        indicators = indicators_map.get(symbol, {})
        asset_info = assets_map.get(symbol, {})
        
        # Get specific market regime
        market = asset_info.get('market', 'US')
        r = regime.get(market, {})
        
        analysis = generate_trade_card(signal, indicators, r, asset_info)
        
        full_signal = signal.copy()
        full_signal['ai_analysis'] = analysis
        results.append(full_signal)
        
        # Basic rate limiting
        time.sleep(1)
        
    return results
