import urllib.request
import json

import os
import sys

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://erzxltcalghadzfevfjx.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
if not SUPABASE_KEY:
    print("[check_positions_with_assets] Error: SUPABASE_KEY or SUPABASE_SERVICE_KEY environment variable required.", file=sys.stderr)
    sys.exit(1)

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
