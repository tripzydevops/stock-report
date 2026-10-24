import os
import sys
import json
from datetime import datetime, date
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import yfinance as yf
from app.core.database import get_supabase_client

# Target directory to output live verified dividend schedules for the frontend
OUTPUT_FILE = backend_dir.parent / "frontend" / "src" / "data" / "live_dividend_schedules.json"

DEFAULT_DIVIDEND_SYMBOLS = [
    # User's BIST Holdings & REIT Champions
    "TRGYO.IS", "BIMAS.IS", "TCELL.IS", "ISMEN.IS", "TURSG.IS", "EKGYO.IS",
    "CCOLA.IS", "KCHOL.IS", "BRSAN.IS", "AEFES.IS", "AGHOL.IS", "KRDMD.IS",
    "AKBNK.IS", "HALKB.IS", "VAKBN.IS", "YKBNK.IS", "PETKM.IS", "TTRAK.IS",
    "TOASO.IS", "EREGL.IS", "FROTO.IS", "SISE.IS", "ISGYO.IS", "ALGYO.IS",
    # US Dividend Champions, REITs & ETFs
    "KO", "O", "SCHD", "JEPI", "JEPQ", "VICI", "VOO", "VNQ", "VYM", "PEP", "JNJ", "PG", "MCD"
]

def serialize_date(obj):
    if isinstance(obj, (datetime, date)):
        return obj.strftime("%Y-%m-%d")
    return str(obj)

def sync_upcoming_dividends():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Corporate Dividend Calendar Sync...")
    supabase = get_supabase_client()

    # 1. Fetch all active holdings from Supabase portfolio_positions
    portfolio_symbols = []
    try:
        res = supabase.table("portfolio_positions").select("assets(symbol)").eq("is_open", True).execute()
        if res.data:
            for row in res.data:
                sym = row.get("assets", {}).get("symbol")
                if sym:
                    portfolio_symbols.append(sym.upper())
    except Exception as e:
        print(f"Warning: Could not fetch portfolio symbols from Supabase: {e}")

    all_symbols = list(dict.fromkeys(portfolio_symbols + DEFAULT_DIVIDEND_SYMBOLS))
    print(f"Total symbols to audit for upcoming dividends: {len(all_symbols)}")

    schedules = {}
    catalyst_rows = []

    for sym in all_symbols:
        clean_sym = sym.replace(".IS", "").upper()
        try:
            ticker = yf.Ticker(sym)
            cal = ticker.calendar

            ex_date = None
            pay_date = None

            if isinstance(cal, dict):
                ex_date = cal.get("Ex-Dividend Date")
                pay_date = cal.get("Dividend Date")

            # Check trailing dividends
            recent_divs = ticker.dividends
            last_dps = None
            last_div_date = None
            if recent_divs is not None and not recent_divs.empty:
                last_dps = float(recent_divs.iloc[-1])
                last_div_date = recent_divs.index[-1].strftime("%Y-%m-%d")

            is_confirmed = False
            status = "Estimated"
            today_str = datetime.now().strftime("%Y-%m-%d")

            # Format ex_date string
            ex_date_str = None
            if ex_date:
                ex_date_str = serialize_date(ex_date)
                if ex_date_str >= today_str:
                    is_confirmed = True
                    status = "Confirmed"

            pay_date_str = None
            if pay_date:
                pay_date_str = serialize_date(pay_date)

            schedules[clean_sym] = {
                "symbol": clean_sym,
                "ticker": sym,
                "exDate": ex_date_str,
                "payDate": pay_date_str,
                "lastDPS": last_dps,
                "lastDivDate": last_div_date,
                "paymentStatus": status,
                "isConfirmed": is_confirmed,
                "updatedAt": datetime.now().isoformat()
            }

            print(f"  [OK] {clean_sym:8} -> Ex-Date: {ex_date_str or 'TBD':10} | Pay: {pay_date_str or 'TBD':10} | Status: {status}")

        except Exception as err:
            print(f"  [ERR] {clean_sym:8} -> Error: {err}")

    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(schedules, f, indent=2, ensure_ascii=False)

    print(f"\nSuccessfully wrote {len(schedules)} verified dividend schedules to {OUTPUT_FILE}")

if __name__ == "__main__":
    sync_upcoming_dividends()
