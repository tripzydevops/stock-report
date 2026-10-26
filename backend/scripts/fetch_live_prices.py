import urllib.request
import json
import yfinance as yf

# Symbols to check
symbols = [
    "ISMEN.IS", "CCOLA.IS", "TURSG.IS", "BRSAN.IS", "AKBNK.IS",
    "HALKB.IS", "KCHOL.IS", "YKBNK.IS", "VAKBN.IS", "AEFES.IS",
    "PETKM.IS", "KRDMD.IS", "AGHOL.IS", "TCELL.IS", "BIMAS.IS", "TRGYO.IS"
]

print("Fetching live prices via yfinance...")
data = yf.download(symbols, period="5d", progress=False)['Close']
latest_prices = data.iloc[-1].to_dict()
for s, p in latest_prices.items():
    print(f"{s}: {p}")
