import yfinance as yf

xu100 = yf.Ticker("XU100.IS")
hist = xu100.history(period="1mo")
print(hist[['Open', 'High', 'Low', 'Close', 'Volume']])
