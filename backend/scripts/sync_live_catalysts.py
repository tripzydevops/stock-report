import os
import sys
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.database import get_supabase_client

# Known Tickers for BIST and Macro
BIST_TICKERS = [
    'THYAO', 'ASELS', 'KCHOL', 'TUPRS', 'EREGL', 'SISE', 'BIMAS', 'FROTO', 'ENKAI', 'SAHOL',
    'GARAN', 'AKBNK', 'ISCTR', 'TURSG', 'ISMEN', 'HALKB', 'VAKBN', 'YKBNK', 'PETKM', 'PGSUS',
    'TAVHL', 'TCELL', 'TTKOM', 'TKFEN', 'TOASO', 'SOKM', 'MGROS', 'MAVI', 'BRSAN', 'ASTOR',
    'EUPWR', 'KONTR', 'SMRTG', 'GESAN', 'CWENE', 'ALARK', 'ODAS', 'CANTE', 'ZOREN', 'AKSA',
    'AKSEN', 'ENJSA', 'SASA', 'HEKTS', 'GUBRF', 'KOZAL', 'KOZAA', 'IPEKE', 'ECILC', 'BERA',
    'KRDMD', 'CIMSA', 'BTCIM', 'BSOKE', 'OYAKC', 'EKGYO', 'KTLEV', 'ODINE', 'BALSU', 'REEDR'
]

MACRO_TICKERS = {
    'TCMB': ['tcmb', 'merkez bankası', 'faiz kararı', 'enflasyon', 'ppk', 'fatih karahan'],
    'FED': ['fed', 'powell', 'faiz indirimi', 'rate cut', 'fomc', 'cpi', 'pce'],
    'XU100': ['bist 100', 'borsa istanbul', 'endeks', 'bist100']
}

def identify_symbol_and_category(title: str, desc: str):
    text = (title + " " + desc).lower()
    
    # 1. Check specific stock ticker in title (word boundary)
    matched_sym = None
    for sym in BIST_TICKERS:
        pattern = r'\b' + re.escape(sym.lower()) + r'\b'
        if re.search(pattern, text):
            matched_sym = sym
            break
            
    # 2. Check Macro
    if not matched_sym:
        for macro_sym, keywords in MACRO_TICKERS.items():
            for kw in keywords:
                if kw in text:
                    matched_sym = macro_sym
                    break
            if matched_sym:
                break
                
    if not matched_sym:
        matched_sym = 'BIST'

    # 3. Category Detection
    category = 'KAP_CONTRACT'
    if 'geri alım' in text or 'buyback' in text or 'pay alım' in text:
        category = 'KAP_BUYBACK'
    elif 'temettü' in text or 'kar payı' in text or 'dividend' in text:
        category = 'KAP_DIVIDEND'
    elif any(k in text for k in ['sözleşme', 'ihale', 'sipariş', 'iş ilişkisi', 'anlaşma', 'teslimat']):
        category = 'KAP_CONTRACT'
    elif any(k in text for k in ['bilanço', 'gelir', 'kar', 'zarar', 'hasılat', 'hacim', 'earnings', 'faaliyet raporu']):
        category = 'KAP_EARNINGS'
    elif matched_sym == 'TCMB' or 'tcmb' in text or 'merkez bankası' in text:
        category = 'MACRO_TCMB'
    elif matched_sym == 'FED' or 'fed' in text or 'powell' in text:
        category = 'MACRO_FED'
        
    # 4. Sentiment / Verdict
    verdict = 'Bullish'
    impact = 7.5
    takeaway = "Şirket için pozitif operasyonel gelişme."
    
    if category == 'KAP_BUYBACK':
        verdict = 'Bullish'
        impact = 8.5
        takeaway = "Şirketin kendi hisselerini piyasadan toplaması taban fiyat ve güven desteği sağlar."
    elif category == 'KAP_DIVIDEND':
        verdict = 'Bullish'
        impact = 8.0
        takeaway = "Nakit temettü verimi yatırımcı ilgisini ve portföy girişlerini destekler."
    elif category == 'KAP_CONTRACT':
        verdict = 'Bullish'
        impact = 8.0
        takeaway = "Yeni iş bağlantısı ve sipariş akışı gelecekteki ciro ve nakit akışını güçlendirir."
    elif 'zarar' in text or 'düşüş' in text or 'soruşturma' in text or 'ceza' in text:
        verdict = 'Bearish'
        impact = 7.0
        takeaway = "Kısa vadeli marj veya regülasyon baskısı hisse üzerinde satış baskısı yaratabilir."
    elif matched_sym in ['TCMB', 'FED']:
        verdict = 'Neutral' if 'beklenti' in text else ('Bullish' if 'faiz indirimi' in text or 'güçlü' in text else 'Bearish')
        impact = 8.0
        takeaway = "Makro likidite ve faiz patikası piyasa genelinde risk iştahını doğrudan etkiler."

    return matched_sym, category, verdict, impact, takeaway

def fetch_and_sync_news():
    print("Fetching live news & KAP regulatory feeds...")
    rss_urls = [
        "https://news.google.com/rss/search?q=Borsa+Istanbul+KAP+hisse+sirket&hl=tr&gl=TR&ceid=TR:tr",
        "https://news.google.com/rss/search?q=BIST+100+hisseleri+KAP+bildirimi&hl=tr&gl=TR&ceid=TR:tr",
        "https://news.google.com/rss/search?q=TCMB+faiz+piyasalar+borsa&hl=tr&gl=TR&ceid=TR:tr"
    ]
    
    raw_articles = []
    seen_titles = set()
    
    for url in rss_urls:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                xml_data = resp.read()
                tree = ET.fromstring(xml_data)
                for item in tree.findall('.//item'):
                    title_elem = item.find('title')
                    link_elem = item.find('link')
                    pub_elem = item.find('pubDate')
                    desc_elem = item.find('description')
                    
                    title = title_elem.text.strip() if title_elem is not None and title_elem.text else ""
                    link = link_elem.text.strip() if link_elem is not None and link_elem.text else ""
                    pub_str = pub_elem.text.strip() if pub_elem is not None and pub_elem.text else ""
                    desc = desc_elem.text.strip() if desc_elem is not None and desc_elem.text else ""
                    
                    # Clean title (remove trailing source like "- Bloomberg HT")
                    clean_title = re.sub(r'\s*-\s*[^-]+$', '', title)
                    
                    if clean_title and clean_title not in seen_titles:
                        seen_titles.add(clean_title)
                        
                        try:
                            dt = parsedate_to_datetime(pub_str)
                        except Exception:
                            dt = datetime.now(timezone.utc)
                            
                        raw_articles.append({
                            'title': clean_title,
                            'link': link,
                            'date': dt,
                            'desc': desc
                        })
        except Exception as e:
            print(f"Error fetching RSS {url}: {e}")

    print(f"Total parsed raw articles: {len(raw_articles)}")
    
    # Filter for relevant articles
    catalysts_to_insert = []
    for art in raw_articles:
        sym, category, verdict, impact, takeaway = identify_symbol_and_category(art['title'], art['desc'])
        
        # Only keep if symbol is specific or category is meaningful
        if sym in BIST_TICKERS or sym in ['TCMB', 'FED', 'XU100']:
            market = 'US' if sym == 'FED' else 'BIST'
            catalysts_to_insert.append({
                'symbol': sym,
                'market': market,
                'category': category,
                'title': art['title'],
                'details': art['desc'] if len(art['desc']) > 10 else f"{sym} için son KAP ve piyasa gelişmesi.",
                'ai_verdict': verdict,
                'ai_takeaway': takeaway,
                'impact_score': impact,
                'source_url': art['link'],
                'published_at': art['date'].isoformat()
            })

    # Sort descending by published date and take top 25
    catalysts_to_insert.sort(key=lambda x: x['published_at'], reverse=True)
    top_catalysts = catalysts_to_insert[:25]
    print(f"Selected {len(top_catalysts)} high-quality recent catalysts.")
    
    client = get_supabase_client()
    
    # Check existing titles in db to prevent duplicates
    existing = client.table('market_catalysts').select('title').execute()
    existing_titles = {r['title'] for r in existing.data} if existing.data else set()
    
    inserted_count = 0
    for cat in top_catalysts:
        if cat['title'] not in existing_titles:
            try:
                res = client.table('market_catalysts').insert(cat).execute()
                inserted_count += 1
                print(f"  + Added: [{cat['published_at'][:10]}] {cat['symbol']} | {cat['category']} | {cat['title'][:60]}")
            except Exception as e:
                print(f"  ! Error inserting {cat['symbol']}: {e}")
                
    print(f"\nSuccessfully synchronized {inserted_count} fresh catalysts into Supabase!")
    
if __name__ == "__main__":
    fetch_and_sync_news()
