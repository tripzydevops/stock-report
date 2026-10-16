import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.core.database import get_supabase_client
import yfinance as yf
from datetime import datetime

client = get_supabase_client()

# Commonly traded US Stocks, REITs, and ETFs on Midas
MIDAS_US_ASSETS = [
    # Top REITs (Real Estate Investment Trusts)
    {
        "symbol": "O",
        "name": "Realty Income Corporation",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Real Estate (Retail/Commercial)",
        "is_active": True
    },
    {
        "symbol": "VICI",
        "name": "VICI Properties Inc.",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Real Estate (Gaming/Experiential)",
        "is_active": True
    },
    {
        "symbol": "PLD",
        "name": "Prologis, Inc.",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Real Estate (Industrial/Logistics)",
        "is_active": True
    },
    {
        "symbol": "AMT",
        "name": "American Tower Corporation",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Real Estate (5G/Telecom Towers)",
        "is_active": True
    },
    {
        "symbol": "EQIX",
        "name": "Equinix, Inc.",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Real Estate (Data Centers/AI)",
        "is_active": True
    },
    {
        "symbol": "STAG",
        "name": "STAG Industrial, Inc.",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Real Estate (Industrial Warehouses)",
        "is_active": True
    },
    {
        "symbol": "SPG",
        "name": "Simon Property Group",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Real Estate (Retail/Malls)",
        "is_active": True
    },

    # Top Dividend & High-Cashflow ETFs
    {
        "symbol": "SCHD",
        "name": "Schwab U.S. Dividend Equity ETF",
        "asset_class": "etf",
        "market": "US",
        "currency": "USD",
        "sector": "Dividend ETF",
        "is_active": True
    },
    {
        "symbol": "JEPI",
        "name": "JPMorgan Equity Premium Income ETF",
        "asset_class": "etf",
        "market": "US",
        "currency": "USD",
        "sector": "High Yield Covered Call ETF",
        "is_active": True
    },
    {
        "symbol": "JEPQ",
        "name": "JPMorgan Nasdaq Equity Premium Income ETF",
        "asset_class": "etf",
        "market": "US",
        "currency": "USD",
        "sector": "High Yield Tech Covered Call ETF",
        "is_active": True
    },
    {
        "symbol": "VOO",
        "name": "Vanguard S&P 500 ETF",
        "asset_class": "etf",
        "market": "US",
        "currency": "USD",
        "sector": "Broad Market Index ETF",
        "is_active": True
    },
    {
        "symbol": "VNQ",
        "name": "Vanguard Real Estate ETF",
        "asset_class": "etf",
        "market": "US",
        "currency": "USD",
        "sector": "Real Estate Benchmark ETF",
        "is_active": True
    },
    {
        "symbol": "VYM",
        "name": "Vanguard High Dividend Yield ETF",
        "asset_class": "etf",
        "market": "US",
        "currency": "USD",
        "sector": "High Dividend Yield ETF",
        "is_active": True
    },
    {
        "symbol": "SMH",
        "name": "VanEck Semiconductor ETF",
        "asset_class": "etf",
        "market": "US",
        "currency": "USD",
        "sector": "Semiconductor Sector ETF",
        "is_active": True
    },

    # Core Dividend Aristocrats & Growth Titans
    {
        "symbol": "KO",
        "name": "The Coca-Cola Company",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Consumer Staples (Dividend King)",
        "is_active": True
    },
    {
        "symbol": "PEP",
        "name": "PepsiCo, Inc.",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Consumer Staples (Dividend King)",
        "is_active": True
    },
    {
        "symbol": "JNJ",
        "name": "Johnson & Johnson",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Healthcare (Dividend King)",
        "is_active": True
    },
    {
        "symbol": "PG",
        "name": "The Procter & Gamble Company",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Consumer Staples (Dividend King)",
        "is_active": True
    },
    {
        "symbol": "MCD",
        "name": "McDonald's Corporation",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Consumer Discretionary (Dividend Aristocrat)",
        "is_active": True
    },
    {
        "symbol": "BRK-B",
        "name": "Berkshire Hathaway Inc. Class B",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Financials / Conglomerate",
        "is_active": True
    },
    {
        "symbol": "AVGO",
        "name": "Broadcom Inc.",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Semiconductors & Software",
        "is_active": True
    },
    {
        "symbol": "COST",
        "name": "Costco Wholesale Corporation",
        "asset_class": "stock",
        "market": "US",
        "currency": "USD",
        "sector": "Consumer Staples",
        "is_active": True
    }
]

def run():
    print(f"Adding/Updating {len(MIDAS_US_ASSETS)} Midas US Assets in Supabase...")
    
    # 1. Upsert into assets table
    upsert_res = client.table("assets").upsert(MIDAS_US_ASSETS, on_conflict="symbol").execute()
    print(f"Successfully upserted {len(upsert_res.data)} assets into 'assets' table.")
    
    # 2. Get asset ID mapping
    asset_id_map = {a["symbol"]: a["id"] for a in upsert_res.data}
    
    # 3. Fetch latest market quotes and upsert into price_history
    today = datetime.now().strftime("%Y-%m-%d")
    price_rows = []
    indicator_rows = []
    
    print("\nFetching real-time quotes via yfinance...")
    for item in MIDAS_US_ASSETS:
        sym = item["symbol"]
        asset_id = asset_id_map.get(sym)
        if not asset_id:
            continue
            
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="1mo")
            if hist.empty:
                print(f"No history for {sym}")
                continue
                
            last_close = float(hist["Close"].iloc[-1])
            prev_close = float(hist["Close"].iloc[-2]) if len(hist) > 1 else last_close
            high_val = float(hist["High"].iloc[-1])
            low_val = float(hist["Low"].iloc[-1])
            open_val = float(hist["Open"].iloc[-1])
            vol_val = int(hist["Volume"].iloc[-1])
            
            # Simple RSI calculation
            deltas = hist["Close"].diff()
            gains = deltas.where(deltas > 0, 0.0)
            losses = -deltas.where(deltas < 0, 0.0)
            avg_gain = gains.tail(14).mean()
            avg_loss = losses.tail(14).mean()
            rs = (avg_gain / avg_loss) if avg_loss != 0 else 1.0
            rsi = 100 - (100 / (1 + rs))
            
            # 52-week approx from history
            high_52w = float(hist["High"].max())
            low_52w = float(hist["Low"].min())
            
            price_rows.append({
                "asset_id": asset_id,
                "date": today,
                "close": round(last_close, 2),
                "open": round(open_val, 2),
                "high": round(high_val, 2),
                "low": round(low_val, 2),
                "volume": vol_val,
                "adj_close": round(last_close, 2)
            })
            
            indicator_rows.append({
                "asset_id": asset_id,
                "date": today,
                "rsi_14": round(rsi, 1),
                "volume_ratio": round(vol_val / (hist["Volume"].mean() or 1), 2),
                "high_52w": round(high_52w, 2),
                "low_52w": round(low_52w, 2)
            })
            
            pct = ((last_close - prev_close) / prev_close) * 100
            print(f"  {sym:6} | ${last_close:7.2f} ({pct:+.2f}%) | RSI: {rsi:4.1f} | {item['name']}")
            
        except Exception as e:
            print(f"  Error fetching {sym}: {e}")

    # Upsert prices
    if price_rows:
        client.table("price_history").upsert(price_rows, on_conflict="asset_id,date").execute()
        print(f"\nUpserted {len(price_rows)} price rows into 'price_history'.")
        
    # Upsert daily_indicators
    if indicator_rows:
        client.table("daily_indicators").upsert(indicator_rows, on_conflict="asset_id,date").execute()
        print(f"Upserted {len(indicator_rows)} indicator rows into 'daily_indicators'.")

    print("\nSUCCESS! All Midas US Stocks, REITs, and ETFs are now live in the database.")

if __name__ == "__main__":
    run()
