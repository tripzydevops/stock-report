import json

with open("bist100_constituents.json", "r", encoding="utf-8") as f:
    bist100 = json.load(f)

us_assets = [
    ("AAPL", "Apple Inc.", "stock", "US", "USD", "Technology"),
    ("MSFT", "Microsoft Corporation", "stock", "US", "USD", "Technology"),
    ("NVDA", "NVIDIA Corporation", "stock", "US", "USD", "Semiconductors"),
    ("GOOGL", "Alphabet Inc.", "stock", "US", "USD", "Communication"),
    ("AMZN", "Amazon.com Inc.", "stock", "US", "USD", "Consumer Discretionary"),
    ("META", "Meta Platforms Inc.", "stock", "US", "USD", "Communication"),
    ("TSLA", "Tesla Inc.", "stock", "US", "USD", "Automotive"),
    ("AMD", "Advanced Micro Devices", "stock", "US", "USD", "Semiconductors"),
    ("SPY", "SPDR S&P 500 ETF Trust", "etf", "US", "USD", "Index ETF"),
    ("QQQ", "Invesco QQQ Trust", "etf", "US", "USD", "Index ETF"),
    ("GLD", "SPDR Gold Shares", "etf", "US", "USD", "Commodity ETF"),
    ("TLT", "iShares 20+ Year Treasury Bond ETF", "etf", "US", "USD", "Bond ETF"),
]

values = []
for sym, name, a_class, market, curr, sec in us_assets:
    clean_name = name.replace("'", "''")
    values.append(f"('{sym}', '{clean_name}', '{a_class}', '{market}', '{curr}', '{sec}')")

for item in bist100:
    sym = item["symbol"]
    name = item.get("name", sym).replace("'", "''")
    values.append(f"('{sym}.IS', '{name}', 'stock', 'BIST', 'TRY', 'BIST 100')")

sql = f"""
INSERT INTO assets (symbol, name, asset_class, market, currency, sector)
VALUES 
{','.join(values)}
ON CONFLICT (symbol) DO UPDATE SET 
    name = EXCLUDED.name,
    sector = EXCLUDED.sector,
    is_active = TRUE;
"""

with open("seed_assets.sql", "w", encoding="utf-8") as f:
    f.write(sql)

print(f"Generated seed_assets.sql with {len(values)} assets")
