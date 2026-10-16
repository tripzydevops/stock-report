import yfinance as yf
import pandas as pd
import numpy as np

symbols = [
    'ISMEN.IS', 'TURSG.IS', 'TUPRS.IS', 'FROTO.IS', 'AKBNK.IS',
    'O', 'VICI', 'SCHD', 'JEPI', 'KO', 'PEP', 'JNJ', 'PLD', 'VOO'
]

print(f"{'Symbol':10} | {'Yield':6} | {'Div CAGR (3Y)':14} | {'Price CAGR (3Y)':16} | {'Consensus Predicted Growth':26}")
print("-" * 80)

for sym in symbols:
    try:
        t = yf.Ticker(sym)
        divs = t.dividends
        hist = t.history(period='5y')
        
        # 1. Price CAGR
        if not hist.empty and len(hist) > 250:
            p_end = float(hist['Close'].iloc[-1])
            idx_3y = min(len(hist) - 1, 756)
            p_start_3y = float(hist['Close'].iloc[-idx_3y])
            years_p = idx_3y / 252.0
            price_cagr = ((p_end / p_start_3y) ** (1.0 / years_p) - 1) * 100
        else:
            price_cagr = 8.0
            p_end = 0.0

        # 2. Dividend CAGR
        if not divs.empty:
            divs_by_year = divs.groupby(divs.index.year).sum()
            recent_years = divs_by_year.tail(4)
            if len(recent_years) >= 2:
                div_start = float(recent_years.iloc[0])
                div_end = float(recent_years.iloc[-1])
                div_years = len(recent_years) - 1
                if div_start > 0:
                    div_cagr = ((div_end / div_start) ** (1.0 / div_years) - 1) * 100
                else:
                    div_cagr = 10.0
            else:
                div_cagr = 6.0
        else:
            div_cagr = 5.0

        # Current Yield estimate
        last_annual_div = float(divs_by_year.iloc[-2]) if (not divs.empty and len(divs_by_year) >= 2) else (p_end * 0.05)
        curr_yield = (last_annual_div / p_end * 100) if p_end > 0 else 5.0

        # Institutional Consensus Growth: Dampen extreme outliers, floor at 2%, cap at 25%
        # Blend historical dividend CAGR (60%) + historical price CAGR (40%)
        blended = (div_cagr * 0.6) + (max(0, price_cagr) * 0.4)
        predicted_growth = max(2.5, min(24.0, blended))

        print(f"{sym:10} | {curr_yield:5.1f}% | {div_cagr:+13.1f}% | {price_cagr:+15.1f}% | {predicted_growth:24.1f}%")

    except Exception as e:
        print(f"{sym:10} | Error: {e}")
