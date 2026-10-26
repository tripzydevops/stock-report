import yfinance as yf

ismen = yf.Ticker("ISMEN.IS")
print("ISMEN Recent History:")
print(ismen.history(period="1mo"))
