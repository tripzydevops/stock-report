import urllib.request
import json
import sys

# Ensure UTF-8 output if possible
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

SUPABASE_URL = "https://erzxltcalghadzfevfjx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/portfolio_positions?select=*", headers=headers)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print(f"Total positions found: {len(data)}")
        
        results = []
        for p in data:
            symbol = p.get('symbol')
            avg_price = float(p.get('avg_entry_price') or 0)
            curr_price = float(p.get('current_price') or 0)
            qty = float(p.get('quantity') or 0)
            stop_loss = float(p.get('stop_loss') or 0)
            target_price = float(p.get('target_price') or 0)
            strat = p.get('strategy_type')
            is_div = p.get('is_dividend')
            dca_zone = p.get('dca_zone')
            dca_rationale = p.get('dca_rationale')
            
            pnl_pct = ((curr_price - avg_price) / avg_price * 100) if avg_price > 0 else 0
            pnl_val = (curr_price - avg_price) * qty
            
            results.append({
                'symbol': symbol,
                'name': p.get('name'),
                'qty': qty,
                'avg_price': avg_price,
                'curr_price': curr_price,
                'pnl_pct': round(pnl_pct, 2),
                'pnl_val': round(pnl_val, 2),
                'stop_loss': stop_loss,
                'target_price': target_price,
                'strat': strat,
                'is_dividend': is_div,
                'dca_zone': dca_zone,
                'dca_rationale': dca_rationale
            })

        results.sort(key=lambda x: x['pnl_pct'])

        print("\n--- ALL HOLDINGS RANKED BY PNL% ---")
        for r in results:
            tag = "[CRITICAL DROP <= -15%]" if r['pnl_pct'] <= -15 else ("[DRAWDOWN]" if r['pnl_pct'] < 0 else "[PROFIT]")
            print(f"{tag} [{r['symbol']}] PnL: {r['pnl_pct']}% | Avg: {r['avg_price']} -> Curr: {r['curr_price']} | Stop: {r['stop_loss']} | Target: {r['target_price']} | Qty: {r['qty']} | Div: {r['is_dividend']} | Strat: {r['strat']}")
            if r['dca_zone']:
                print(f"   DCA Zone: {r['dca_zone']} | Rationale: {r['dca_rationale']}")
except Exception as e:
    import traceback
    traceback.print_exc()
