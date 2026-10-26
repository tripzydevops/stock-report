import yfinance as yf

tursg = yf.Ticker("TURSG.IS")
print("Actions:")
print(tursg.actions)
print("\nRecent Splits:")
print(tursg.splits)
print("\nRecent Dividends:")
print(tursg.dividends)
print("\nHistory:")
print(tursg.history(period="1mo"))
