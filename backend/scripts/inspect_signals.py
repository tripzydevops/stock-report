import sys
import os

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import get_supabase_client

client = get_supabase_client()

# 1. Fetch assets
assets_res = client.table("assets").select("id, symbol").execute()
assets = {a["id"]: a["symbol"] for a in assets_res.data}

# 2. Fetch all trade_signals
signals_res = client.table("trade_signals").select("*").execute()
signals = signals_res.data

print(f"Total signals in DB: {len(signals)}")
oct1_signals = [s for s in signals if "2026-10-01" in str(s.get("signal_date"))]
for s in signals:
    sym = assets.get(s["asset_id"], "UNKNOWN")
    print(f"ID: {s['id']} | Sym: {sym:8} | Strategy: {s['strategy']:18} | Date: {s['signal_date']} | Entry: {s['entry_price']} | SL: {s['stop_loss']} | Status: {s['status']} | Closed: {s['closed_at']}")
