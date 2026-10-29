"""
Analyze Post-Exit Reclaims for Stopped-Out & Expired Trades
===========================================================
Investigates whether positions that were stopped out or exited at the trade date
limit (20-day max holding limit) subsequently reclaimed their entry price or target,
and quantifies exactly how long it took in trading sessions and calendar days.
"""

import sys
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

# UTF-8 stdout configuration for Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

TRADES_CSV = Path(__file__).resolve().parent.parent / "pullback_reclaim_trades.csv"
CACHE_FILE = Path(__file__).resolve().parent.parent / "bist_5y_history.pkl"


def analyze_reclaims():
    if not TRADES_CSV.exists():
        print(f"Error: {TRADES_CSV} not found. Run backtest first.")
        return

    if not CACHE_FILE.exists():
        print(f"Error: {CACHE_FILE} not found.")
        return

    print("=" * 75)
    print("  POST-STOP & POST-DATE-LIMIT RECLAIM ANALYSIS")
    print("=" * 75)

    # 1. Load trades and historical data
    trades_df = pd.read_csv(TRADES_CSV)
    print(f"✓ Loaded {len(trades_df)} total closed trades.")

    bist_history = pd.read_pickle(CACHE_FILE)
    print(f"✓ Loaded price history for {bist_history['symbol'].nunique()} symbols.")

    # Organize historical data by symbol for rapid lookups
    history_by_sym = {}
    for sym, group in bist_history.groupby("symbol"):
        df_sym = group.copy()
        if not isinstance(df_sym.index, pd.DatetimeIndex):
            if "date" in df_sym.columns:
                df_sym.index = pd.to_datetime(df_sym["date"])
            else:
                df_sym.index = pd.to_datetime(df_sym.index)
        df_sym.index = df_sym.index.tz_localize(None)
        df_sym = df_sym.sort_index()
        history_by_sym[sym] = df_sym

    # Filter to Stopped Out trades and Expired trades
    stopped_trades = trades_df[trades_df["exit_reason"] == "STOPPED_OUT"].copy()
    expired_trades = trades_df[trades_df["exit_reason"] == "EXPIRED"].copy()

    print(f"  • Stopped Out Trades : {len(stopped_trades)} ({len(stopped_trades)/len(trades_df)*100:.1f}%)")
    print(f"  • Expired Trades     : {len(expired_trades)} ({len(expired_trades)/len(trades_df)*100:.1f}%)")
    print(f"  • Target Hit Trades  : {len(trades_df[trades_df['exit_reason'] == 'TARGET_HIT'])} ({len(trades_df[trades_df['exit_reason'] == 'TARGET_HIT'])/len(trades_df)*100:.1f}%)")

    # 2. Detailed Tracking Function
    def track_post_exit_behavior(sub_df, category_name):
        results = []
        for _, trade in sub_df.iterrows():
            sym = trade["symbol"]
            entry_price = float(trade["entry_price"])
            exit_price = float(trade["exit_price"])
            exit_date = pd.to_datetime(trade["exit_date"])
            days_held = int(trade["days_held"])
            pnl_pct = float(trade["pnl_pct"])

            # Reconstruct stop distance and 1:2 target
            # PnL pct on stop out reflects the stop distance
            implied_risk = entry_price - exit_price if exit_price < entry_price else entry_price * 0.08
            target_price = entry_price + (2.0 * implied_risk)

            if sym not in history_by_sym:
                continue

            df = history_by_sym[sym]
            # Future bars strictly after exit_date
            future_bars = df[df.index > exit_date]

            if future_bars.empty:
                continue

            # Check next 60 trading bars
            eval_window = future_bars.iloc[:60]

            # 1. Reclaimed Entry (High >= entry_price)
            reclaimed_entry_high = False
            sessions_to_reclaim_entry = None
            cal_days_to_reclaim_entry = None
            reclaim_date_entry = None

            # 2. Reclaimed Entry on Close
            reclaimed_entry_close = False

            # 3. Reclaimed Target (High >= target_price)
            reclaimed_target = False
            sessions_to_reclaim_target = None

            # 4. Maximum Adverse Excursion post-exit (how much deeper did it fall?)
            min_post_exit_low = eval_window["low"].min() if "low" in eval_window.columns else eval_window["close"].min()
            post_exit_max_drop_pct = ((min_post_exit_low - exit_price) / exit_price) * 100.0

            # Scan chronological bars
            for session_idx, (bar_date, row) in enumerate(future_bars.iterrows(), start=1):
                high_val = row.get("high", row["close"])
                close_val = row["close"]

                if not reclaimed_entry_high and high_val >= entry_price:
                    reclaimed_entry_high = True
                    sessions_to_reclaim_entry = session_idx
                    cal_days_to_reclaim_entry = (bar_date - exit_date).days
                    reclaim_date_entry = bar_date.strftime("%Y-%m-%d")

                if not reclaimed_entry_close and close_val >= entry_price:
                    reclaimed_entry_close = True

                if not reclaimed_target and high_val >= target_price:
                    reclaimed_target = True
                    sessions_to_reclaim_target = session_idx

                # Stop scanning beyond 120 sessions for performance
                if session_idx >= 120 and reclaimed_entry_high:
                    break

            results.append({
                "symbol": sym,
                "entry_date": trade["entry_date"],
                "entry_price": entry_price,
                "exit_date": trade["exit_date"],
                "exit_price": exit_price,
                "days_held": days_held,
                "pnl_pct": pnl_pct,
                "reclaimed_entry": reclaimed_entry_high,
                "reclaimed_entry_close": reclaimed_entry_close,
                "sessions_to_reclaim_entry": sessions_to_reclaim_entry,
                "cal_days_to_reclaim_entry": cal_days_to_reclaim_entry,
                "reclaim_date_entry": reclaim_date_entry,
                "reclaimed_target": reclaimed_target,
                "sessions_to_reclaim_target": sessions_to_reclaim_target,
                "post_exit_max_drop_pct": post_exit_max_drop_pct,
                "reclaimed_within_5d": sessions_to_reclaim_entry is not None and sessions_to_reclaim_entry <= 5,
                "reclaimed_within_10d": sessions_to_reclaim_entry is not None and sessions_to_reclaim_entry <= 10,
                "reclaimed_within_20d": sessions_to_reclaim_entry is not None and sessions_to_reclaim_entry <= 20,
                "reclaimed_within_trade_limit": sessions_to_reclaim_entry is not None and (days_held + sessions_to_reclaim_entry) <= 20,
            })

        return pd.DataFrame(results)

    # 3. Run Analysis for STOPPED_OUT
    print("\n" + "=" * 75)
    print("📊 1. STOPPED-OUT TRADES: POST-EXIT RECLAIM ANALYSIS")
    print("=" * 75)
    stop_res = track_post_exit_behavior(stopped_trades, "STOPPED_OUT")

    total_stops = len(stop_res)
    reclaimed_stops = stop_res[stop_res["reclaimed_entry"]]
    never_reclaimed_stops = stop_res[~stop_res["reclaimed_entry"]]

    reclaim_rate = len(reclaimed_stops) / total_stops * 100.0 if total_stops > 0 else 0
    target_reclaim_rate = stop_res["reclaimed_target"].sum() / total_stops * 100.0 if total_stops > 0 else 0

    print(f"Total Stopped-Out Trades Evaluated : {total_stops}")
    print(f"  • Reclaimed Entry Price (Ever)   : {len(reclaimed_stops)} ({reclaim_rate:.1f}%)")
    print(f"  • NEVER Reclaimed Entry Price    : {len(never_reclaimed_stops)} ({100 - reclaim_rate:.1f}%)")
    print(f"  • Reached Original 2R Target     : {stop_res['reclaimed_target'].sum()} ({target_reclaim_rate:.1f}%)")

    print("\n⏱️ Time to Reclaim Entry (For Trades That Reclaimed):")
    if len(reclaimed_stops) > 0:
        mean_sessions = reclaimed_stops["sessions_to_reclaim_entry"].mean()
        median_sessions = reclaimed_stops["sessions_to_reclaim_entry"].median()
        mean_cal_days = reclaimed_stops["cal_days_to_reclaim_entry"].mean()
        median_cal_days = reclaimed_stops["cal_days_to_reclaim_entry"].median()
        min_sessions = reclaimed_stops["sessions_to_reclaim_entry"].min()
        max_sessions = reclaimed_stops["sessions_to_reclaim_entry"].max()

        print(f"  • Average Sessions to Reclaim    : {mean_sessions:.1f} trading sessions (~{mean_cal_days:.1f} calendar days)")
        print(f"  • Median Sessions to Reclaim     : {median_sessions:.0f} trading sessions (~{median_cal_days:.0f} calendar days)")
        print(f"  • Min / Max Sessions             : {min_sessions} sessions / {max_sessions} sessions")

    print("\n⏳ Reclaim Speed Distribution (Post-Exit Horizon):")
    w5 = stop_res["reclaimed_within_5d"].sum()
    w10 = stop_res["reclaimed_within_10d"].sum()
    w20 = stop_res["reclaimed_within_20d"].sum()
    within_original_limit = stop_res["reclaimed_within_trade_limit"].sum()

    print(f"  • Quick Whipsaws (within 1–5 sessions)    : {w5:>3} trades ({w5/total_stops*100:>5.1f}%)")
    print(f"  • Short-term (within 6–10 sessions)        : {w10 - w5:>3} trades ({(w10-w5)/total_stops*100:>5.1f}%)")
    print(f"  • Medium-term (within 11–20 sessions)      : {w20 - w10:>3} trades ({(w20-w10)/total_stops*100:>5.1f}%)")
    print(f"  • Slow Reclaim (> 20 sessions / months)    : {len(reclaimed_stops) - w20:>3} trades ({(len(reclaimed_stops)-w20)/total_stops*100:>5.1f}%)")
    print(f"  • Reclaimed within Original 20-Day Limit   : {within_original_limit:>3} trades ({within_original_limit/total_stops*100:>5.1f}%)")

    print("\n🛡️ Capital Protection Analysis (Did the Stop Save Capital?):")
    avg_further_drop = stop_res["post_exit_max_drop_pct"].mean()
    severe_drops = stop_res[stop_res["post_exit_max_drop_pct"] <= -10.0]
    catastrophic_drops = stop_res[stop_res["post_exit_max_drop_pct"] <= -20.0]

    print(f"  • Average Further Drop After Stop-Out      : {avg_further_drop:.2f}%")
    print(f"  • Trades that fell > 10% further           : {len(severe_drops)} ({len(severe_drops)/total_stops*100:.1f}%)")
    print(f"  • Trades that fell > 20% further (Disasters) : {len(catastrophic_drops)} ({len(catastrophic_drops)/total_stops*100:.1f}%)")
    if len(never_reclaimed_stops) > 0:
        print(f"  • Avg Post-Exit Drawdown of Non-Reclaimers : {never_reclaimed_stops['post_exit_max_drop_pct'].mean():.2f}%")

    # 4. Analysis for EXPIRED Trades (Exited at the 20-Day Limit)
    print("\n" + "=" * 75)
    print("📊 2. EXPIRED TRADES (20-DAY TIME LIMIT): POST-EXIT RECLAIM")
    print("=" * 75)
    exp_res = track_post_exit_behavior(expired_trades, "EXPIRED")
    total_exp = len(exp_res)

    if total_exp > 0:
        # Split expired into winning expirations and losing expirations
        losing_exp = exp_res[exp_res["pnl_pct"] < 0]
        reclaimed_losing_exp = losing_exp[losing_exp["reclaimed_entry"]]

        print(f"Total Expired Trades (Reached 20-Day Limit) : {total_exp}")
        print(f"  • Expired with Gain (Small profit)        : {len(exp_res[exp_res['pnl_pct'] >= 0])}")
        print(f"  • Expired with Loss (Under water at limit): {len(losing_exp)}")
        if len(losing_exp) > 0:
            print(f"  • Of Underwater Expirations, Reclaimed    : {len(reclaimed_losing_exp)} ({len(reclaimed_losing_exp)/len(losing_exp)*100:.1f}%)")
            if len(reclaimed_losing_exp) > 0:
                print(f"  • Average Sessions to Reclaim Post-Limit  : {reclaimed_losing_exp['sessions_to_reclaim_entry'].mean():.1f} sessions")
                print(f"  • Median Sessions to Reclaim Post-Limit   : {reclaimed_losing_exp['sessions_to_reclaim_entry'].median():.0f} sessions")

    # 5. Save detailed CSV
    output_path = Path(__file__).resolve().parent.parent / "post_exit_reclaim_analysis.csv"
    combined_res = pd.concat([stop_res.assign(exit_reason="STOPPED_OUT"), exp_res.assign(exit_reason="EXPIRED")])
    combined_res.to_csv(output_path, index=False)
    print(f"\n💾 Saved complete breakdown ({len(combined_res)} records) to: {output_path.name}")
    print("=" * 75)


if __name__ == "__main__":
    analyze_reclaims()
