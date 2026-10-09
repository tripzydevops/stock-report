"""
MarketPulse Comprehensive Strategy Backtest
Simulates all 4 core trading strategies on the 1-year historical dataset with 950-1100 TL position allocation per trade.
"""
import sys
import os
from pathlib import Path
import pandas as pd
import numpy as np

# Ensure backend directory is in path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.indicators import compute_all_indicators
from app.services.screener import (
    screen_momentum_breakout,
    screen_trend_pullback,
    screen_volatility_squeeze,
    screen_mean_reversion
)

def run_backtest(excel_path: str, target_min_tl: float = 950.0, target_max_tl: float = 1100.0, nominal_tl: float = 1000.0):
    print(f"Loading Price History from {excel_path}...")
    df_raw = pd.read_excel(excel_path, sheet_name="📅 Price History")
    print(f"Loaded {len(df_raw)} price rows across {df_raw['Symbol'].nunique()} symbols.")

    # Group by Symbol
    symbols = df_raw["Symbol"].unique()
    asset_data = {}
    
    for sym in symbols:
        sub = df_raw[df_raw["Symbol"] == sym].copy()
        sub["Date"] = pd.to_datetime(sub["Date"])
        sub = sub.sort_values("Date").reset_index(drop=True)
        sub = sub.set_index("Date")
        sub.columns = [c.lower() for c in sub.columns]
        
        # We need OHLCV
        if len(sub) >= 30 and "close" in sub.columns:
            enriched = compute_all_indicators(sub)
            asset_data[sym] = enriched

    print(f"Successfully computed technical indicators for {len(asset_data)} active assets.")

    trades = []
    
    # Strategy max holding periods
    holding_limits = {
        "Momentum Breakout": 12,
        "Volatility Squeeze": 15,
        "Trend Pullback": 20,
        "Mean Reversion": 10,
    }

    # Walk-forward bar by bar
    for sym, df in asset_data.items():
        n_bars = len(df)
        if n_bars < 50:
            continue
            
        # Cooldown dictionary per strategy to prevent spamming signals on the same stock every consecutive day
        last_signal_idx = {}

        for i in range(50, n_bars - 1): # leave at least 1 future bar
            sub_df = df.iloc[:i+1]
            cur_date = sub_df.index[-1]
            
            # Check all 4 strategies
            signals_to_check = [
                ("Momentum Breakout", screen_momentum_breakout(sub_df, sym)),
                ("Trend Pullback", screen_trend_pullback(sub_df, sym)),
                ("Volatility Squeeze", screen_volatility_squeeze(sub_df, sym)),
                ("Mean Reversion", screen_mean_reversion(sub_df, sym)),
            ]
            
            for strat_name, sig in signals_to_check:
                if not sig:
                    continue
                    
                # Apply 5-day cooldown per symbol/strategy to avoid stacking redundant tranches
                if strat_name in last_signal_idx and (i - last_signal_idx[strat_name]) < 5:
                    continue
                    
                last_signal_idx[strat_name] = i
                
                entry_price = float(sig["entry_price"])
                stop_loss = float(sig["stop_loss"])
                target_1 = float(sig["target_1"])
                
                if entry_price <= 0 or stop_loss <= 0 or target_1 <= 0:
                    continue
                    
                # SIZING: Strictly enforce 950 TL - 1100 TL allocation per trade
                # If stock price is <= 1100 TL, use whole integer shares closest to 1000 TL
                # If stock price > 1100 TL (e.g. EGEEN or US stocks), use fractional shares at exactly 1000 TL
                if entry_price <= target_max_tl:
                    shares = max(1, round(nominal_tl / entry_price))
                    cost = shares * entry_price
                    # Adjust if outside 950-1100 bracket
                    if cost < target_min_tl and (shares + 1) * entry_price <= target_max_tl:
                        shares += 1
                        cost = shares * entry_price
                    elif cost > target_max_tl and shares > 1 and (shares - 1) * entry_price >= target_min_tl:
                        shares -= 1
                        cost = shares * entry_price
                else:
                    # Fractional allocation exactly at nominal budget
                    shares = round(nominal_tl / entry_price, 4)
                    cost = nominal_tl
                    
                # Future evaluation
                max_hold = holding_limits.get(strat_name, 15)
                future_df = df.iloc[i+1 : i+1 + max_hold]
                
                status = "OPEN"
                exit_price = float(df.iloc[-1]["close"])
                exit_date = df.index[-1]
                days_held = len(future_df)
                
                for step, (f_date, f_bar) in enumerate(future_df.iterrows(), start=1):
                    f_high = float(f_bar.get("high", f_bar["close"]))
                    f_low = float(f_bar.get("low", f_bar["close"]))
                    
                    hit_stop = (f_low <= stop_loss)
                    hit_target = (f_high >= target_1)
                    
                    if hit_stop and hit_target:
                        status = "STOPPED_OUT"
                        exit_price = stop_loss
                        exit_date = f_date
                        days_held = step
                        break
                    elif hit_target:
                        status = "TARGET_HIT"
                        exit_price = target_1
                        exit_date = f_date
                        days_held = step
                        break
                    elif hit_stop:
                        status = "STOPPED_OUT"
                        exit_price = stop_loss
                        exit_date = f_date
                        days_held = step
                        break
                else:
                    # If loop completed without hitting target or stop
                    if len(future_df) >= max_hold:
                        status = "EXPIRED"
                        exit_price = float(future_df.iloc[-1]["close"])
                        exit_date = future_df.index[-1]
                        days_held = max_hold
                    else:
                        status = "OPEN"
                        exit_price = float(df.iloc[-1]["close"])
                        exit_date = df.index[-1]
                        days_held = len(future_df)

                pnl_per_share = exit_price - entry_price
                pnl_tl = shares * pnl_per_share
                pnl_pct = (pnl_per_share / entry_price) * 100.0
                proceeds = cost + pnl_tl
                
                # Tag market
                market = "US" if sym in ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD", "SPY", "QQQ", "IWM", "GLD", "TLT", "XLF", "XLE", "ARKK", "SCHD", "O", "VNQ"] else "BIST"
                
                target_2 = float(sig.get("target_2", target_1))
                
                trades.append({
                    "symbol": sym,
                    "market": market,
                    "strategy": strat_name,
                    "signal_date": cur_date.strftime("%Y-%m-%d"),
                    "exit_date": exit_date.strftime("%Y-%m-%d") if hasattr(exit_date, "strftime") else str(exit_date)[:10],
                    "entry_price": entry_price,
                    "exit_price": exit_price,
                    "stop_loss": stop_loss,
                    "target_price": target_1,
                    "target_2": target_2,
                    "shares": shares,
                    "allocated_tl": round(cost, 2),
                    "proceeds_tl": round(proceeds, 2),
                    "pnl_tl": round(pnl_tl, 2),
                    "pnl_pct": round(pnl_pct, 2),
                    "days_held": days_held,
                    "status": status,
                    "is_win": pnl_tl > 0,
                    "is_loss": pnl_tl < 0
                })

    df_trades = pd.DataFrame(trades)
    print(f"\n=======================================================")
    print(f" TOTAL COMPLETED BACKTEST SIGNALS: {len(df_trades)}")
    print(f"=======================================================\n")
    return df_trades

if __name__ == "__main__":
    excel_path = os.path.join(backend_dir.parent, "MarketPulse_Latest.xlsx")
    df_trades = run_backtest(excel_path)
    
    # Save results to CSV for analysis
    out_csv = os.path.join(backend_dir.parent, "backtest_results_1000tl.csv")
    df_trades.to_csv(out_csv, index=False)
    print(f"Saved raw trade logs to {out_csv}")
