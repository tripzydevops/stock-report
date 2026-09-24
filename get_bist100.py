import httpx
from bs4 import BeautifulSoup
import re
import json

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
url = "https://uzmanpara.milliyet.com.tr/canli-borsa/bist-100-hisseleri/"

r = httpx.get(url, headers=headers, timeout=15)
soup = BeautifulSoup(r.text, "html.parser")

tickers = []
for a in soup.find_all("a", href=True):
    href = a['href']
    if "/borsa/hisse-senetleri/" in href:
        # Ticker is the token right before the trailing slash
        # e.g. /borsa/hisse-senetleri/akbank-akbnk/ -> akbnk
        clean = href.strip('/')
        parts = clean.split('-')
        if parts:
            sym = parts[-1].upper()
            title = a.text.strip()
            # Verify sym is an alphabetic ticker code (usually 4-5 characters)
            if re.match(r'^[A-Z0-9]{4,6}$', sym):
                tickers.append({"symbol": sym, "name": title})

# Deduplicate preserving order
seen = set()
unique_tickers = []
for t in tickers:
    if t["symbol"] not in seen:
        seen.add(t["symbol"])
        unique_tickers.append(t)

print(f"Total BIST 100 tickers extracted: {len(unique_tickers)}")
print("All symbols:", [t["symbol"] for t in unique_tickers])

with open("bist100_constituents.json", "w", encoding="utf-8") as f:
    json.dump(unique_tickers, f, ensure_ascii=False, indent=2)

symbols_only = [t["symbol"] for t in unique_tickers]
with open("bist100_symbols.json", "w", encoding="utf-8") as f:
    json.dump(symbols_only, f, indent=2)

print("Saved to bist100_constituents.json and bist100_symbols.json successfully.")
