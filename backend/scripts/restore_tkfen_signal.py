import sys
sys.path.insert(0, ".")
import json
from app.core.database import get_supabase_client

client = get_supabase_client()
sig_id = "2b6e3412-27e6-4226-9a56-c2b30f514e55"

res = client.table("trade_signals").select("*").eq("id", sig_id).execute()
if not res.data:
    print(f"Signal {sig_id} not found!")
    sys.exit(1)

sig = res.data[0]
print("Current signal in DB:")
print("  Symbol: TKFEN")
print("  Status:", sig.get("status"))
print("  Closed At:", sig.get("closed_at"))
print("  Outcome PnL:", sig.get("outcome_pnl_pct"))

# Clean resolution from rationale
rat_raw = sig.get("ai_rationale") or "{}"
payload = json.loads(rat_raw) if isinstance(rat_raw, str) else rat_raw
if "resolution" in payload:
    del payload["resolution"]

updated_rat = json.dumps(payload, ensure_ascii=False)

upd = client.table("trade_signals").update({
    "status": "open",
    "outcome_pnl_pct": None,
    "closed_at": None,
    "ai_rationale": updated_rat
}).eq("id", sig_id).execute()

print("\nRestored signal to ACTIVE / OPEN state:")
print(upd.data)

# Also check if signal_recovery_tracking has an orphaned row for this signal and remove it
try:
    rec_del = client.table("signal_recovery_tracking").delete().eq("signal_id", sig_id).execute()
    print("Cleaned up orphaned recovery tracking record:", rec_del.data)
except Exception as e:
    print("Recovery tracking cleanup note:", e)
