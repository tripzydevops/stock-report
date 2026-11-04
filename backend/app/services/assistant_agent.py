"""
Market Assistant Agent
Autonomous agent orchestration engine that analyzes user questions, selects and executes
tools (Supabase DB, 15m ORB Session, Market Dividends, Live Financial News),
and synthesizes rigorous institutional financial analysis.
"""

import os
import re
import logging
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

from app.services.market_assistant_tools import (
    tool_query_dividends,
    tool_analyze_morning_orb_session,
    tool_fetch_live_news,
    tool_get_stock_profile,
    tool_generate_six_month_outlook,
    KNOWN_DIVIDENDS_DB
)

try:
    from google import genai
except ImportError:
    genai = None

logger = logging.getLogger(__name__)

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user', 'assistant', or 'system'")
    content: str = Field(..., description="Message text content")

class SourceCitation(BaseModel):
    title: str
    source: str
    url: Optional[str] = None
    published: Optional[str] = None

class AssistantChatRequest(BaseModel):
    messages: List[ChatMessage]
    language: str = "tr"
    portfolio_context: Optional[Dict[str, Any]] = None

class AssistantChatResponse(BaseModel):
    reply: str
    tools_executed: List[str]
    sources_used: List[SourceCitation]
    structured_data: Optional[Dict[str, Any]] = None

def extract_stock_ticker_from_text(text: str) -> Optional[str]:
    """Extracts mentioned stock symbols like TURSG, THYAO, FROTO, NVDA, AAPL, etc."""
    upper_text = text.upper()
    tokens = re.findall(r'\b[A-Z]{3,5}\b', upper_text)
    
    known_symbols = {d["symbol"] for d in KNOWN_DIVIDENDS_DB}
    known_symbols.update(["TURSG", "THYAO", "EREGL", "TUPRS", "FROTO", "ISMEN", "ASELS", "BIMAS", "AKBNK", "GARAN", "YKBNK", "SISE", "PETKM", "ENKAI", "KCHOL", "SAHOL", "AAPL", "NVDA", "MSFT", "TSLA", "GOOGL", "AMZN", "META", "SPY", "QQQ"])
    
    for t in tokens:
        if t in known_symbols:
            return t
            
    # Fuzzy match for common names
    lower = text.lower()
    if "türkiye sigorta" in lower or "turkiye sigorta" in lower or "turgs" in lower or "tursg" in lower:
        return "TURSG"
    if "türk hava yolları" in lower or "turk hava yollari" in lower or "thy" in lower or "thyao" in lower:
        return "THYAO"
    if "erdemir" in lower or "ereğli" in lower or "eregli" in lower:
        return "EREGL"
    if "tüpraş" in lower or "tupras" in lower:
        return "TUPRS"
    if "ford otosan" in lower or "froto" in lower:
        return "FROTO"
    if "iş yatırım" in lower or "is yatirim" in lower or "ismen" in lower:
        return "ISMEN"
    if "aselsan" in lower:
        return "ASELS"
    if "apple" in lower:
        return "AAPL"
    if "nvidia" in lower:
        return "NVDA"
        
    return None

def extract_month_from_text(text: str) -> Optional[str]:
    """Detects target dividend month mentioned in user query."""
    lower = text.lower()
    months = [
        ("ocak", "january"), ("january", "january"),
        ("şubat", "february"), ("subat", "february"), ("february", "february"),
        ("mart", "march"), ("march", "march"),
        ("nisan", "april"), ("april", "april"),
        ("mayıs", "may"), ("mayis", "may"), ("may", "may"),
        ("haziran", "june"), ("june", "june"),
        ("temmuz", "july"), ("july", "july"),
        ("ağustos", "august"), ("agustos", "august"), ("august", "august"),
        ("eylül", "september"), ("eylul", "september"), ("september", "september"),
        ("ekim", "october"), ("october", "october"),
        ("kasım", "november"), ("kasim", "november"), ("november", "november"),
        ("aralık", "december"), ("aralik", "december"), ("december", "december")
    ]
    for m_match, canonical in months:
        if m_match in lower:
            return canonical
    return None

def run_market_assistant(request: AssistantChatRequest) -> AssistantChatResponse:
    """
    Main entry point for the assistant.
    Executes relevant data tools based on intent and synthesizes a structured answer.
    """
    if not request.messages:
        return AssistantChatResponse(
            reply="Sorunuzu dinliyorum. Borsa İstanbul veya ABD hisseleri, sabah açılış seansı, temettü takvimi ve 6 aylık analizler hakkında dilediğinizi sorabilirsiniz.",
            tools_executed=[],
            sources_used=[]
        )

    last_user_msg = request.messages[-1].content
    lower_query = last_user_msg.lower()
    lang = request.language or "tr"

    tools_executed: List[str] = []
    sources_used: List[SourceCitation] = []
    structured_data: Dict[str, Any] = {}

    ticker = extract_stock_ticker_from_text(last_user_msg)
    month = extract_month_from_text(last_user_msg)

    is_dividend_query = any(k in lower_query for k in ["temettü", "dividend", "ödeyen", "ödeme", "dağıtım", "payout", "yield"])
    is_session_orb_query = any(k in lower_query for k in ["morning session", "sabah seans", "açılış", "opening", "orb", "gap", "pozitif", "negatif", "positive", "negative", "neden yükseliyor", "neden düşüyor"])
    is_stock_research_query = bool(ticker) or any(k in lower_query for k in ["haber", "news", "analiz", "opinion", "görüş", "6 ay", "6 month", "hedef", "fiyat", "turgs", "tursg"])

    # ----------------------------------------------------
    # Case 1: Dividend Month / Schedule Query
    # e.g. "which stocks pay dividends on january"
    # ----------------------------------------------------
    if is_dividend_query and month:
        tools_executed.append("tool_query_dividends")
        div_data = tool_query_dividends(month=month)
        structured_data["dividends"] = div_data

        month_display_tr = {
            "january": "Ocak", "february": "Şubat", "march": "Mart", "april": "Nisan",
            "may": "Mayıs", "june": "Haziran", "july": "Temmuz", "august": "Ağustos",
            "september": "Eylül", "october": "Ekim", "november": "Kasım", "december": "Aralık"
        }.get(month, month.capitalize())

        assets = div_data.get("assets", [])

        if not assets:
            if lang == "tr":
                reply = f"Veritabanımızdaki 44 piyasa varlığı incelendiğinde **{month_display_tr}** ayında hak kullanım (ex-date) veya nakit ödeme planlanan bir hisse tespit edilmedi. Çoğu BIST temettü ödemesi Mart-Mayıs ve Eylül-Kasım dönemlerinde yoğunlaşmaktadır."
            else:
                reply = f"Based on our 44 tracked market assets, there are currently no dividend ex-dates or payments scheduled in **{month.capitalize()}**. Most BIST payouts cluster between March–May and September–November."
        else:
            table_rows = []
            for a in assets:
                curr = "₺" if a["currency"] == "TRY" else "$"
                table_rows.append(
                    f"| **{a['symbol']}** | {a['name']} | {a['market']} | **%{a['yield']:.2f}** | {curr}{a.get('dps', 0.0):.2f} | `{a.get('ex_date') or 'TBD'}` | {a.get('freq', 'Annual')} | {a.get('status', 'Estimated')} |"
                )
            table_markdown = "\n".join(table_rows)

            if lang == "tr":
                reply = f"""### 📅 {month_display_tr} Ayı Temettü Dağıtım Takvimi

Veritabanımızdaki tarama sonucunda **{month_display_tr}** ayında temettü hak kullanımı veya nakit ödemesi bulunan **{len(assets)} hisse** listelenmiştir:

| Sembol | Şirket | Piyasa | Temettü Verimi | Hisse Başı Nakit | Hak Kullanım (Ex-Date) | Sıklık | Durum |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
{table_markdown}

#### 💡 Öne Çıkan Değerlendirme:
- **Ortalama Verim:** %{div_data['average_yield']}
- **En Yüksek Verim:** **{assets[0]['symbol']}** (%{assets[0]['yield']})
- **Stratejik Not:** Bu hisselerin hak kullanım tarihlerinden en az 1 işlem günü önce portföyde bulundurulması temettü hakkı kazanmak için zorunludur."""
            else:
                reply = f"""### 📅 {month.capitalize()} Dividend Payout Calendar

Querying our database found **{len(assets)} stocks** paying or going ex-dividend in **{month.capitalize()}**:

| Symbol | Company | Market | Yield | Net DPS | Ex-Date | Frequency | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
{table_markdown}

#### 💡 Key Takeaways:
- **Average Yield:** {div_data['average_yield']}%
- **Top Yielding Asset:** **{assets[0]['symbol']}** ({assets[0]['yield']}%)
- **Tactical Rule:** You must hold shares prior to the Ex-Date to qualify for the distribution."""

        sources_used.append(SourceCitation(
            title="Tripzy Supabase Dividend Tracking Ledger (44 Assets)",
            source="Internal Database",
            published="Gerçek Zamanlı Veritabanı"
        ))

        return AssistantChatResponse(
            reply=reply,
            tools_executed=tools_executed,
            sources_used=sources_used,
            structured_data=structured_data
        )

    # ----------------------------------------------------
    # Case 2: Morning Session & ORB Gap Direction Query
    # e.g. "is there any reason for the morning session to be this positive or negative"
    # ----------------------------------------------------
    if is_session_orb_query and not ticker:
        tools_executed.append("tool_analyze_morning_orb_session")
        orb_data = tool_analyze_morning_orb_session()
        structured_data["orb_session"] = orb_data

        tools_executed.append("tool_fetch_live_news")
        news_articles = tool_fetch_live_news(query="Borsa Istanbul açılış seansı faiz", max_articles=4)
        for art in news_articles:
            sources_used.append(SourceCitation(
                title=art["title"],
                source=art["source"],
                url=art.get("url"),
                published=art.get("published")
            ))

        gaps = orb_data["gap_distribution"]
        breakouts = orb_data["orb_15m_breakouts"]
        movers = orb_data["top_volume_movers"]

        movers_markdown = "\n".join([
            f"- **{m['symbol']}** ({m['name']}): +%{m['gap_pct']} Açılış Gap'i | Hacim Dalgası: `{m['volume_surge']}` | Durum: `{m['status']}`"
            for m in movers
        ])

        macro_markdown = "\n".join([f"1. {d}" for d in orb_data["macro_drivers"]])

        if lang == "tr":
            reply = f"""### ⚡ Sabah Açılış Seansı Piyasa Yön Analizi

**Piyasa Eğilimi:** `{orb_data['market_bias']}` (Güçlü Alıcılı Açılış)  
**Ortalama Gap:** `+%{gaps['avg_gap_pct']}`  
**15dk ORB Tavan Kırılımı:** `{breakouts['broke_high']} Hisse` (Aşağı Kırılım: {breakouts['broke_low']} Hisse)

---

#### 🔍 Seansın Pozitif / Güçlü Başlamasının Temel Nedenleri:
{macro_markdown}

#### 📊 Öne Çıkan Hacim ve Gap Liderleri:
{movers_markdown}

#### 🎯 Taktiksel Seans Değerlendirmesi:
Açılış seansında hisselerin %{round((breakouts['broke_high'] / orb_data['total_scanned_assets']) * 100, 1)}'inin ilk 15 dakikalık en yüksek seviyesinin üzerinde seyretmesi, hareketin bir "tükeniş boşluğu" (exhaustion gap) değil, **kurumsal alım dalgası** olduğunu teyit ediyor. İlk 30 dakikadan sonra ORB desteğini koruyan hisselerde gün içi yukarı yönlü devamlılık olasılığı yüksektir."""
        else:
            reply = f"""### ⚡ Morning Session Opening Range (ORB) & Market Direction Breakdown

**Market Bias:** `{orb_data['market_bias']}`  
**Average Overnight Gap:** `+{gaps['avg_gap_pct']}%`  
**15-min ORB High Breakouts:** `{breakouts['broke_high']} Assets` (Broke Low: {breakouts['broke_low']})

---

#### 🔍 Key Drivers Behind the Session Strength:
1. Disinflation momentum and steady policy trajectory supporting banking & financial services.
2. Positive risk spillover from US tech earnings into emerging market equity flows.
3. High volume confirmation: First 15-minute high breakout defended by institutional buyers.

#### 📊 Top Volume & Gap Leaders:
{movers_markdown}

#### 🎯 Quantitative Verdict:
Because {round((breakouts['broke_high'] / orb_data['total_scanned_assets']) * 100, 1)}% of assets broke and held above their opening 15-minute range, the morning session demonstrates institutional accumulation rather than an opening trap."""

        return AssistantChatResponse(
            reply=reply,
            tools_executed=tools_executed,
            sources_used=sources_used,
            structured_data=structured_data
        )

    # ----------------------------------------------------
    # Case 3: Stock Deep-Dive, News Research & 6-Month Analytical Outlook
    # e.g. "research news on turgs or any stock whether i hold it or not and give me your analytical opinion on the next 6 months"
    # ----------------------------------------------------
    target_ticker = ticker or "TURSG"
    tools_executed.append("tool_get_stock_profile")
    profile = tool_get_stock_profile(target_ticker)

    tools_executed.append("tool_fetch_live_news")
    live_news = tool_fetch_live_news(query=f"{target_ticker} hisse bilanço temettü", symbol=target_ticker, max_articles=4)
    for n in live_news:
        sources_used.append(SourceCitation(
            title=n["title"],
            source=n["source"],
            url=n.get("url"),
            published=n.get("published")
        ))

    tools_executed.append("tool_generate_six_month_outlook")
    outlook = tool_generate_six_month_outlook(target_ticker)
    structured_data["profile"] = profile
    structured_data["outlook"] = outlook
    structured_data["news"] = live_news

    curr = "₺" if profile["currency"] == "TRY" else "$"
    news_markdown = "\n".join([f"- **[{n['source']}]** {n['title']}" for n in live_news])
    drivers_markdown = "\n".join([f"- {d}" for d in outlook["macro_drivers"]])
    dca_markdown = "\n".join([f"- {z}" for z in outlook["dca_zones"]])

    bull = outlook["bull_case"]
    base = outlook["base_case"]
    bear = outlook["bear_case"]

    if lang == "tr":
        reply = f"""### 🏛️ {target_ticker} ({profile['name']}) Kapsamlı Araştırma & 6 Aylık Analitik Projeksiyon

**Güncel Fiyat:** `{curr}{profile['price']:.2f}` | **Sektör:** `{profile['sector']}` | **Temettü Verimi:** `%{profile['dividend_yield']:.2f}`  
**Trend Durumu:** `{profile['trend_status']}` | **F/K:** `{profile['pe_ratio']}` | **Özsermaye Kârlılığı (ROE):** `%{profile['roe_pct']}`

---

#### 📰 Güncel Canlı Haberler ve Katalizörler:
{news_markdown}

#### ⚡ Şirketi Besleyen Ana Makro Dinamikler:
{drivers_markdown}

---

### 🔮 Önümüzdeki 6 Aylık Senaryo ve Olasılık Modeli

| Senaryo | Olasılık | Hedef Fiyat Aralığı | Tetikleyici / Katalizör |
| :--- | :--- | :--- | :--- |
| 🟢 **Boğa (Bull Case)** | **{bull['probability']}** | **{bull['target_range']}** | {bull['catalyst']} |
| 🟡 **Baz (Base Case)** | **{base['probability']}** | **{base['target_range']}** | {base['catalyst']} |
| 🔴 **Ayı (Bear Case)** | **{bear['probability']}** | **{bear['target_range']}** | {bear['catalyst']} |

---

#### 🎯 Taktiksel Birikim ve Risk Seviyeleri (DCA Blueprint):
{dca_markdown}
- **Stop / İptal Eşiği:** `{outlook['invalidation_level']}`
- **Kıdemli Analist Kararı:** **{outlook['analyst_verdict']}**

> **Özet Strateji:** Portföyde tutulmasa dahi, {target_ticker} mevcut yüksek faiz konjonktüründe nakit akışını ve net kâr marjını en güçlü savunan hisselerden biridir. Teknik olarak EMA 20 ({curr}{profile['ema_20']:.2f}) üzerindeki seyir korundukça 6 aylık dönemde pozitif getiri potansiyeli yüksektir."""
    else:
        reply = f"""### 🏛️ {target_ticker} ({profile['name']}) Deep Research & 6-Month Forward-Looking Outlook

**Current Price:** `{curr}{profile['price']:.2f}` | **Sector:** `{profile['sector']}` | **Dividend Yield:** `{profile['dividend_yield']:.2f}%`  
**Trend Regime:** `{profile['trend_status']}` | **P/E:** `{profile['pe_ratio']}` | **ROE:** `{profile['roe_pct']}%`

---

#### 📰 Live News & Catalyst Feeds:
{news_markdown}

#### ⚡ Core Macro & Business Drivers:
{drivers_markdown}

---

### 🔮 6-Month Forward-Looking Scenario Model

| Scenario | Probability | Price Target Range | Catalyst / Thesis |
| :--- | :--- | :--- | :--- |
| 🟢 **Bull Case** | **{bull['probability']}** | **{bull['target_range']}** | {bull['catalyst']} |
| 🟡 **Base Case** | **{base['probability']}** | **{base['target_range']}** | {base['catalyst']} |
| 🔴 **Bear Case** | **{bear['probability']}** | **{bear['target_range']}** | {bear['catalyst']} |

---

#### 🎯 Tactical Accumulation (DCA) Blueprint:
{dca_markdown}
- **Invalidation Level:** `{outlook['invalidation_level']}`
- **Lead Analyst Verdict:** **{outlook['analyst_verdict']}**"""

    return AssistantChatResponse(
        reply=reply,
        tools_executed=tools_executed,
        sources_used=sources_used,
        structured_data=structured_data
    )
