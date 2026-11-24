import urllib.request
import json

import os
import sys

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://erzxltcalghadzfevfjx.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
if not SUPABASE_KEY:
    print("[check_columns] Error: SUPABASE_KEY or SUPABASE_SERVICE_KEY environment variable required.", file=sys.stderr)
    sys.exit(1)

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/portfolio_positions?limit=2", headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    print("Keys in sample row:", list(data[0].keys()) if data else "Empty")
    if data:
        print("Sample row:", json.dumps(data[0], indent=2))
