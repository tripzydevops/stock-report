import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
from app.core.database import get_supabase_client, upsert_rows

# Load BIST 100 constituents
with open("bist100_constituents.json", "r", encoding="utf-8") as f:
    bist100 = json.load(f)

print(f"Loaded {len(bist100)} BIST constituents")

# US Top stocks & ETFs
us_assets = [
    {"symbol": "AAPL", "name": "Apple Inc.", "asset_class": "stock", "market": "US", "currency": "USD", "sector": "Technology"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "asset_class": "stock", "market": "US", "currency": "USD", "sector": "Technology"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "asset_class": "stock", "market": "US", "currency": "USD", "sector": "Semiconductors"},
    {"symbol": "GOOGL", "name": "Alphabet Inc.", "asset_class": "stock", "market": "US", "currency": "USD", "sector": "Communication"},
    {"symbol": "AMZN", "name": "Amazon.com Inc.", "asset_class": "stock", "market": "US", "currency": "USD", "sector": "Consumer Discretionary"},
    {"symbol": "META", "name": "Meta Platforms Inc.", "asset_class": "stock", "market": "US", "currency": "USD", "sector": "Communication"},
    {"symbol": "TSLA", "name": "Tesla Inc.", "asset_class": "stock", "market": "US", "currency": "USD", "sector": "Automotive"},
    {"symbol": "AMD", "name": "Advanced Micro Devices", "asset_class": "stock", "market": "US", "currency": "USD", "sector": "Semiconductors"},
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "asset_class": "etf", "market": "US", "currency": "USD", "sector": "Index ETF"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust", "asset_class": "etf", "market": "US", "currency": "USD", "sector": "Index ETF"},
    {"symbol": "GLD", "name": "SPDR Gold Shares", "asset_class": "etf", "market": "US", "currency": "USD", "sector": "Commodity ETF"},
    {"symbol": "TLT", "name": "iShares 20+ Year Treasury Bond ETF", "asset_class": "etf", "market": "US", "currency": "USD", "sector": "Bond ETF"},
]

# Convert BIST to asset records
bist_rows = []
for item in bist100:
    sym = item["symbol"]
    name = item.get("name", sym)
    # yfinance symbol for BIST uses .IS
    bist_rows.append({
        "symbol": f"{sym}.IS",
        "name": name,
        "asset_class": "stock",
        "market": "BIST",
        "currency": "TRY",
        "is_active": True
    })

all_to_insert = us_assets + bist_rows

client = get_supabase_client()
print(f"Upserting {len(all_to_insert)} assets into Supabase...")

# Batch upsert in chunks of 50
chunk_size = 50
inserted_count = 0
for i in range(0, len(all_to_insert), chunk_size):
    chunk = all_to_insert[i:i + chunk_size]
    try:
        res = client.table("assets").upsert(chunk, on_conflict="symbol").execute()
        inserted_count += len(chunk)
        print(f"Inserted batch {i//chunk_size + 1} ({len(chunk)} assets)")
    except Exception as e:
        print(f"Error inserting batch {i}: {e}")

print(f"✅ Successfully registered {inserted_count} assets into Supabase database!")
