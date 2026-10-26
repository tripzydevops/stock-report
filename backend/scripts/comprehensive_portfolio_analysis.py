import urllib.request
import json
import yfinance as yf

SUPABASE_URL = "https://erzxltcalghadzfevfjx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyenhsdGNhbGdoYWR6ZmV2Zmp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwODQxMzEsImV4cCI6MjEwNTY2MDEzMX0.dEQ91ShlS9PBWUwF9U6hDuTqZBwlF3_nZNsjqfIifrI"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

# 1. Fetch assets
req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/assets?select=*", headers=headers)
with urllib.request.urlopen(req) as resp:
    assets = json.loads(resp.read().decode())
asset_map = {a['id']: a for a in assets}

# 2. Fetch positions
req2 = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/portfolio_positions?select=*", headers=headers)
with urllib.request.urlopen(req2) as resp:
    positions = json.loads(resp.read().decode())

open_positions = [p for p in positions if p.get('is_open') is not False]

# Collect symbols
symbols = []
for p in open_positions:
    asset = asset_map.get(p.get('asset_id'), {})
    s = asset.get('symbol')
    if s and s not in symbols:
        symbols.append(s)

print(f"Fetching live yfinance data for {len(symbols)} symbols...")
yf_data = yf.download(symbols, period="1mo", progress=False)['Close']
latest_prices = {}
for s in symbols:
    try:
        if len(symbols) == 1:
            latest_prices[s] = float(yf_data.iloc[-1])
        else:
            latest_prices[s] = float(yf_data[s].dropna().iloc[-1])
    except Exception as e:
        print(f"Error getting price for {s}: {e}")

# Also check historical peak / correction for BIST 100
xu100 = yf.download("XU100.IS", period="3mo", progress=False)
if 'Close' in xu100:
    xu100_close = xu100['Close']
    if hasattr(xu100_close, 'squeeze'):
        xu100_close = xu100_close.squeeze()
    peak_xu100 = float(xu100_close.max())
    curr_xu100 = float(xu100_close.iloc[-1])
    xu100_drop = ((curr_xu100 - peak_xu100) / peak_xu100) * 100
    print(f"XU100 Index: Peak={peak_xu100:.2f}, Current={curr_xu100:.2f}, Drawdown={xu100_drop:.2f}%")


portfolio_analysis = []

for p in open_positions:
    asset = asset_map.get(p.get('asset_id'), {})
    sym = asset.get('symbol', 'UNKNOWN')
    name = asset.get('name', 'UNKNOWN')
    curr = latest_prices.get(sym, 0.0)
    avg = float(p.get('avg_entry_price') or 0)
    qty = float(p.get('quantity') or 0)
    sl = float(p.get('stop_loss')) if p.get('stop_loss') is not None else None
    tp = float(p.get('target_price')) if p.get('target_price') is not None else None
    notes = p.get('notes') or ''
    entry_date = p.get('entry_date')
    
    pnl_pct = ((curr - avg) / avg * 100) if avg > 0 else 0
    pnl_tl = (curr - avg) * qty
    invested_tl = avg * qty
    curr_val_tl = curr * qty
    
    # Check stop loss breached
    sl_breached = False
    if sl and curr < sl:
        sl_breached = True

    portfolio_analysis.append({
        'symbol': sym,
        'name': name,
        'qty': qty,
        'entry_price': avg,
        'curr_price': round(curr, 2),
        'invested_tl': round(invested_tl, 2),
        'curr_val_tl': round(curr_val_tl, 2),
        'pnl_pct': round(pnl_pct, 2),
        'pnl_tl': round(pnl_tl, 2),
        'stop_loss': sl,
        'sl_breached': sl_breached,
        'target_price': tp,
        'entry_date': entry_date,
        'notes': notes
    })

# Sort by PnL% ascending
portfolio_analysis.sort(key=lambda x: x['pnl_pct'])

print("\n================== FULL PORTFOLIO PERFORMANCE ==================")
total_invested = sum(x['invested_tl'] for x in portfolio_analysis)
total_current = sum(x['curr_val_tl'] for x in portfolio_analysis)
total_pnl = total_current - total_invested
total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0

print(f"Total Invested: {total_invested:,.2f} TL | Current Value: {total_current:,.2f} TL | Total PnL: {total_pnl_pct:.2f}% ({total_pnl:,.2f} TL)\n")

for x in portfolio_analysis:
    sl_str = f"SL: {x['stop_loss']}" + (" [BREACHED!]" if x['sl_breached'] else " [INTACT]") if x['stop_loss'] else "SL: NONE"
    tag = "[DOWN > 20%]" if x['pnl_pct'] <= -20 else ("[DOWN 10-20%]" if x['pnl_pct'] <= -10 else ("[DOWN 0-10%]" if x['pnl_pct'] < 0 else "[PROFIT]"))
    name_clean = x['name'].encode('ascii', 'replace').decode('ascii')
    print(f"{tag} {x['symbol']} ({name_clean})")

    print(f"   Entry: {x['entry_price']} TL | Curr: {x['curr_price']} TL | PnL: {x['pnl_pct']}% ({x['pnl_tl']} TL) | {sl_str} | Date: {x['entry_date']}")
    print(f"   Notes: {x['notes']}\n")
