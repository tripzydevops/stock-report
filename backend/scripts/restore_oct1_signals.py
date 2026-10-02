import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import get_supabase_client

client = get_supabase_client()

# 1. Duplicate lowercase IDs to remove
duplicate_ids = [
    '9d28e191-7e32-43b2-b18a-6e4d6e83175a',
    '0bf989e5-c127-46c0-a0a4-6d2f820111b2',
    'f0fc93a8-3565-4b40-99df-0f569910d463',
    '0d16cdda-3f9c-4063-b8ef-695150d9bfbd',
    '26811da0-1c1f-4758-adb5-aaa7e68dda3f',
    'c9bdf8f3-71b6-425c-bab6-03809381d6df',
    '37e5de10-130c-4ea9-b63e-2faf1e975d27',
]

for dup_id in duplicate_ids:
    res = client.table("trade_signals").delete().eq("id", dup_id).execute()
    print(f"Deleted duplicate signal: {dup_id}")

# 2. Official signals to restore to 'open'
official_ids = [
    '59771bed-65d9-4321-af6a-fbd2684004b8', # ASELS.IS
    'c274cace-00f5-40f1-9fa6-5b01ecb1d6e0', # BRSAN.IS
    '26bead13-be40-4020-92ec-52ec2aca62d1', # ENJSA.IS
    '6265a22a-20fc-4fc3-86c8-88e97bc43ab1', # KCHOL.IS
    '5e4622a6-82e2-4842-ae33-fc1c09d89877', # MPARK.IS
    'e9618f35-6408-4c72-85a3-505f7b2b758d', # SOKM.IS
    'edad2256-d742-41aa-aaed-30270f235a72', # VAKBN.IS
]

for off_id in official_ids:
    res = client.table("trade_signals").update({
        "status": "open",
        "outcome_pnl_pct": None,
        "closed_at": None
    }).eq("id", off_id).execute()
    print(f"Restored signal {off_id} to open")

# 3. Fix CCOLA if entry_price is 0
ccola_sig = client.table("trade_signals").select("*").eq("id", "d6209bfe-38c7-4bad-9ca4-c505d2f1ac87").execute()
if ccola_sig.data and ccola_sig.data[0].get("entry_price") == 0:
    # get latest ccola price
    ccola_asset_id = ccola_sig.data[0]["asset_id"]
    ph = client.table("price_history").select("close").eq("asset_id", ccola_asset_id).order("date", desc=True).limit(1).execute()
    if ph.data:
        latest_c = float(ph.data[0]["close"])
        client.table("trade_signals").update({"entry_price": latest_c}).eq("id", "d6209bfe-38c7-4bad-9ca4-c505d2f1ac87").execute()
        print(f"Updated CCOLA entry price to {latest_c}")

print("Database restoration complete!")
