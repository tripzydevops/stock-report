---
name: market-data-ingestion
description: Standard operating procedure for fetching, normalizing, validating, and cleaning OHLCV market data across Borsa Istanbul (.IS) and US assets. Use whenever adding data sources, fetching asset histories, or computing technical indicators.
---

# Market Data Ingestion Standard Operating Procedure

## Purpose
Enforces consistent retrieval, column standardization, cleaning, and validation of price data across all MarketPulse backend services and scripts.

---

## 1. Symbol Normalization Guidelines
- **Borsa Istanbul Equities:**
  - Standard symbol in database & display: `THYAO`, `ASELS`, `ISMEN`, `TURSG`.
  - External Yahoo Finance query string: Append `.IS` (e.g. `THYAO.IS`).
  - Always clean symbols: `clean_sym = symbol.replace(".IS", "").strip().upper()`.
- **US Equities & ETFs:**
  - Query ticker directly (e.g. `SPY`, `QQQ`, `AAPL`).
  - Asset class tagged as `etf` or `stock`.
- **Foreign Exchange:**
  - USD/TRY currency pair formatted as `USDTRY=X` on Yahoo Finance, mapped to pair `USDTRY` in database.

---

## 2. Column Normalization Standard
All data fetching functions (`yfinance`, Bloomberg, KAP, or custom scrapers) must output DataFrames with lowercased, single-level columns:
- Required columns: `open`, `high`, `low`, `close`, `volume`.
- Optional columns: `adj_close`.
- Index: `pd.DatetimeIndex` sorted chronologically ascending (`sort_index()`).

### Standard Normalization Routine
```python
def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize multi-index or varying-case OHLCV columns to lower-case standard."""
    if df.empty:
        return df
        
    # Flatten MultiIndex columns (e.g., from yfinance bulk download)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
        
    df.columns = [str(c).lower().replace(" ", "_") for c in df.columns]
    
    # Ensure standard column aliases map correctly
    mapping = {
        "adj_close": "adj_close",
        "adjclose": "adj_close",
        "vol": "volume",
    }
    df = df.rename(columns=mapping)
    
    # Ensure numeric types and drop invalid rows
    required = ["open", "high", "low", "close", "volume"]
    for col in required:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            
    df = df.dropna(subset=["close"])
    df = df[df["close"] > 0]
    return df.sort_index()
```

---

## 3. Data Quality & Sanity Gates
Before feeding data into screeners or storing in Supabase:
1. **Minimum Bar Count:** Must have at least `20` trading days for short-term indicators (RSI, ATR), and `200` days for long-term moving averages (EMA 200). Reject or flag under-sampled assets.
2. **Infinite & NaN Stripping:** Replace `inf` / `-inf` with `None` or `np.nan`.
3. **Limit Down / Taban Safeguard:** For Borsa Istanbul equities, verify if today's change is around `-9.9%` to `-10.0%` with volume dry-up (Taban limit down). Never issue long breakout or pullback triggers on stocks locked in limit-down circuit breakers.
4. **Timezone Uniformity:** All historical and snapshot timestamps must be UTC or timezone-naive normalized dates (`YYYY-MM-DD`).
