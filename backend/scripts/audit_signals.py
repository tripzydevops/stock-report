import sys
sys.path.insert(0, ".")
import json
from app.core.database import get_supabase_client

client = get_supabase_client()
res = client.table('trade_signals').select('id, asset_id, strategy, signal_date, entry_price, stop_loss, target_1, status, outcome_pnl_pct, closed_at, ai_rationale, assets(symbol, name)').eq('status', 'stopped_out').execute()

print(f"Total stopped_out signals: {len(res.data or [])}")
for r in (res.data or []):
    sym = (r.get('assets') or {}).get('symbol')
    rat = r.get('ai_rationale') or ''
    reason = ''
    if '{' in rat:
        try:
            p = json.loads(rat)
            reason = p.get('resolution', {}).get('exit_reason', '')
        except Exception:
            pass
    closed = str(r.get('closed_at') or '')[:10]
    print(f"ID: {r.get('id')} | {sym} | sig: {r.get('signal_date')} | closed: {closed} | entry: {r.get('entry_price')} | stop: {r.get('stop_loss')} | pnl: {r.get('outcome_pnl_pct')}% | reason: {reason}")
