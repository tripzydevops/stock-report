"""
Empirical Analysis: Ex-Dividend Tax Arbitrage in Borsa Istanbul (BIST)
Tests the strategy of:
  1. Selling 100% of shares at T-1 Close (before Ex-Date)
  2. Buying back 100% of shares at X-Date Open (or X-Date Close)
  3. Comparing Wealth vs Buy & Hold (receiving Net Dividend after 10% withholding tax / stopaj)
"""

import sys
from pathlib import Path
import yfinance as yf
import pandas as pd
import numpy as np

def analyze_dividend_arbitrage(symbols=None):
    if symbols is None:
        symbols = [
            "FROTO.IS", "TUPRS.IS", "ISMEN.IS", "EREGL.IS", 
            "AKBNK.IS", "TOASO.IS", "BIMAS.IS", "TTRAK.IS",
            "TURSG.IS", "CCOLA.IS"
        ]
    
    print("=" * 80)
    print("BIST EX-DIVIDEND TAX ARBITRAGE EMPIRICAL STUDY")
    print("Strategy: Sell at T-1 Close (Tax-Free Capital Gain) -> Rebuy at X-Date Open")
    print("=" * 80)

    results = []

    for sym in symbols:
        clean_sym = sym.replace(".IS", "")
        print(f"\nAnalyzing {clean_sym}...")
        try:
            ticker = yf.Ticker(sym)
            divs = ticker.dividends
            if divs is None or divs.empty:
                print(f"  No dividend history found for {clean_sym}")
                continue

            # Fetch unadjusted price history to see real trading prices around ex-dates
            # Note: auto_adjust=False provides unadjusted raw prices
            hist = ticker.history(period="10y", auto_adjust=False)
            if hist.empty:
                print(f"  No history found for {clean_sym}")
                continue

            # Strip timezone for clean matching
            hist.index = pd.to_datetime(hist.index.date)
            divs.index = pd.to_datetime(divs.index.date)

            # Analyze each dividend event in the last 6 years (2019-2025)
            div_dates = divs[divs.index >= '2019-01-01']
            
            for ex_date, gross_div in div_dates.items():
                if gross_div <= 0:
                    continue
                
                # In Turkey, stopaj was 15% before 22 Dec 2021, and 10% thereafter
                tax_rate = 0.10 if ex_date >= pd.to_datetime('2021-12-22') else 0.15
                net_div = gross_div * (1.0 - tax_rate)

                # Locate T-1 date (last trading day before ex_date)
                prior_dates = hist.index[hist.index < ex_date]
                if len(prior_dates) == 0:
                    continue
                t_minus_1 = prior_dates[-1]

                # Check if ex_date exists in hist
                if ex_date not in hist.index:
                    continue

                t_minus_1_row = hist.loc[t_minus_1]
                ex_date_row = hist.loc[ex_date]

                # Extract prices
                p_close_prior = float(t_minus_1_row['Close'])
                p_open_ex = float(ex_date_row['Open'])
                p_close_ex = float(ex_date_row['Close'])
                p_low_ex = float(ex_date_row['Low'])
                p_high_ex = float(ex_date_row['High'])

                # Theoretical reference price (Borsa Istanbul officially deducts gross div from prior close)
                p_ref = p_close_prior - gross_div
                div_yield = (gross_div / p_close_prior) * 100

                # 1. Price drop at open vs gross dividend
                actual_drop_at_open = p_close_prior - p_open_ex
                drop_ratio = actual_drop_at_open / gross_div if gross_div > 0 else 0

                # 2. Strategy A (Hold & Receive Net Dividend):
                # Initial: 100 shares
                # At Open: 100 shares * p_open_ex + 100 * net_div cash
                wealth_hold_open = 100 * p_open_ex + 100 * net_div
                # At Close: 100 shares * p_close_ex + 100 * net_div cash
                wealth_hold_close = 100 * p_close_ex + 100 * net_div

                # 3. Strategy B (Sell T-1 Close, Rebuy at X-Date Open):
                # Cash on T-1 Close: 100 * p_close_prior
                # Rebuy 100 shares at p_open_ex:
                # Remaining Cash: 100 * (p_close_prior - p_open_ex)
                # Total wealth at open: 100 * p_open_ex + 100 * (p_close_prior - p_open_ex) = 100 * p_close_prior
                wealth_arb_open = 100 * p_close_prior
                # Total wealth at close (holding those 100 shares to close):
                wealth_arb_close = 100 * p_close_ex + 100 * (p_close_prior - p_open_ex)

                # Arbitrage Net Alpha at Open:
                # delta = wealth_arb_open - wealth_hold_open
                #       = 100 * (p_close_prior - p_open_ex - net_div)
                alpha_tl_open = wealth_arb_open - wealth_hold_open
                alpha_pct_open = (alpha_tl_open / (100 * p_close_prior)) * 100

                # Arbitrage Net Alpha at Close:
                alpha_tl_close = wealth_arb_close - wealth_hold_close
                alpha_pct_close = (alpha_tl_close / (100 * p_close_prior)) * 100

                # Theoretical tax savings alone (if stock opened exactly at p_ref):
                # 100 * (gross_div - net_div)
                tax_saved_tl = 100 * (gross_div - net_div)
                tax_saved_pct = (tax_saved_tl / (100 * p_close_prior)) * 100

                # Additional shares acquired if full cash is reinvested at open:
                shares_hold = 100 + (100 * net_div) / p_open_ex
                shares_arb = (100 * p_close_prior) / p_open_ex
                extra_shares = shares_arb - shares_hold

                results.append({
                    "symbol": clean_sym,
                    "ex_date": ex_date.strftime("%Y-%m-%d"),
                    "gross_div": round(gross_div, 4),
                    "net_div": round(net_div, 4),
                    "div_yield": round(div_yield, 2),
                    "p_prior_close": round(p_close_prior, 2),
                    "p_ref": round(p_ref, 2),
                    "p_open": round(p_open_ex, 2),
                    "p_close": round(p_close_ex, 2),
                    "drop_ratio": round(drop_ratio, 2),
                    "alpha_tl_open": round(alpha_tl_open, 2),
                    "alpha_pct_open": round(alpha_pct_open, 2),
                    "extra_shares": round(extra_shares, 2),
                    "tax_saved_tl": round(tax_saved_tl, 2),
                    "arb_won_open": alpha_tl_open > 0
                })
        except Exception as e:
            print(f"Error analyzing {clean_sym}: {e}")

    df = pd.DataFrame(results)
    if df.empty:
        print("No valid distribution events found.")
        return

    print("\n" + "=" * 80)
    print("DETAILED RESULTS (Sample Events)")
    print("=" * 80)
    sample_cols = ["symbol", "ex_date", "div_yield", "p_prior_close", "gross_div", "p_open", "drop_ratio", "alpha_pct_open", "extra_shares", "arb_won_open"]
    print(df[sample_cols].to_string(index=False))

    print("\n" + "=" * 80)
    print("AGGREGATE EMPIRICAL SUMMARY")
    print("=" * 80)
    total_events = len(df)
    won_events = df["arb_won_open"].sum()
    win_rate = (won_events / total_events) * 100
    avg_alpha_pct = df["alpha_pct_open"].mean()
    median_alpha_pct = df["alpha_pct_open"].median()
    avg_drop_ratio = df["drop_ratio"].mean()
    median_drop_ratio = df["drop_ratio"].median()
    avg_div_yield = df["div_yield"].mean()
    avg_extra_shares = df["extra_shares"].mean()

    print(f"Total Dividend Distributions Analyzed: {total_events}")
    print(f"Tax Arbitrage Win Rate (Open > Ref + Net Div): {won_events}/{total_events} ({win_rate:.1f}%)")
    print(f"Average Dividend Yield: {avg_div_yield:.2f}%")
    print(f"Average Dividend Drop-Off Ratio at Open: {avg_drop_ratio:.2f} (Theoretical = 1.00)")
    print(f"Median Dividend Drop-Off Ratio at Open: {median_drop_ratio:.2f}")
    print(f"Average Alpha per Event: +{avg_alpha_pct:.2f}% (or {avg_alpha_pct:+.2f}%)")
    print(f"Median Alpha per Event: +{median_alpha_pct:.2f}%")
    print(f"Average Extra Shares Gained (per 100 shares held): +{avg_extra_shares:.2f} shares")

    # Group by Symbol
    print("\n" + "=" * 80)
    print("PERFORMANCE BY STOCK")
    print("=" * 80)
    stock_grp = df.groupby("symbol").agg(
        Events=("ex_date", "count"),
        WinRate=("arb_won_open", lambda x: f"{(x.sum()/len(x))*100:.0f}%"),
        AvgYield=("div_yield", "mean"),
        AvgAlpha=("alpha_pct_open", "mean"),
        AvgDropRatio=("drop_ratio", "mean"),
        AvgExtraShares=("extra_shares", "mean")
    ).reset_index()
    print(stock_grp.to_string(index=False))

    return df

if __name__ == "__main__":
    analyze_dividend_arbitrage()
