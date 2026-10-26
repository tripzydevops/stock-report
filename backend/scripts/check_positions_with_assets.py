import urllib.request
import json

SUPABASE_URL = "https://erzxltcalghadzfevfjx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

# Fetch assets
req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/assets?select=*", headers=headers)
with urllib.request.urlopen(req) as resp:
    assets = json.loads(resp.read().decode())
    print("Assets count:", len(assets))
    if assets:
        print("Sample asset:", json.dumps(assets[0], indent=2))

asset_map = {a['id']: a for a in assets}

# Fetch positions
req2 = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/portfolio_positions?select=*", headers=headers)
with urllib.request.urlopen(req2) as resp:
    positions = json.loads(resp.read().decode())
    print("Positions count:", len(positions))

open_positions = [p for p in positions if p.get('is_open') is not False]
print("Open positions count:", len(open_positions))

for p in open_positions:
    asset = asset_map.get(p.get('asset_id'), {})
    sym = asset.get('symbol', 'UNKNOWN')
    name = asset.get('name', 'UNKNOWN')
    curr = asset.get('current_price') or 0
    avg = p.get('avg_entry_price') or 0
    qty = p.get('quantity') or 0
    sl = p.get('stop_loss')
    tp = p.get('target_price')
    notes = p.get('notes')
    entry_date = p.get('entry_date')
    
    pnl_pct = ((float(curr) - float(avg)) / float(avg) * 100) if float(avg) > 0 else 0
    pnl_tl = (float(curr) - float(avg)) * float(qty)
    print(f"[{sym}] {name} | Qty: {qty} | Entry: {avg} | Curr: {curr} | PnL: {round(pnl_pct, 2)}% ({round(pnl_tl, 2)} TL) | Stop: {sl} | TP: {tp} | Date: {entry_date}")
    if notes:
        print(f"   Notes: {notes}")
