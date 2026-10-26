import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.core.database import get_supabase_client

client = get_supabase_client()
candidate_tables = [
    'daily_bars', 'portfolio', 'portfolio_holdings', 'market_data', 
    'indicators', 'dividends', 'market_regime', 'assets', 'trade_signals'
]

for t in candidate_tables:
    try:
        r = client.table(t).select('*').limit(1).execute()
        cols = list(r.data[0].keys()) if r.data else "empty"
        print(f"Table '{t}': EXISTS -> {cols}")
    except Exception as e:
        print(f"Table '{t}': ERROR -> {e}")
