import pandas as pd
import numpy as np

df = pd.read_csv("backtest_results_1000tl.csv")

print(f"Total Trades Evaluated: {len(df)}")
print(f"Average Position Allocation: TL {df['allocated_tl'].mean():.2f}")
print(f"Allocation Range: TL {df['allocated_tl'].min():.2f} - TL {df['allocated_tl'].max():.2f}")

wins = df[df["pnl_tl"] > 0]
losses = df[df["pnl_tl"] < 0]
ties = df[df["pnl_tl"] == 0]

total_pnl = df["pnl_tl"].sum()
gross_win = wins["pnl_tl"].sum()
gross_loss = abs(losses["pnl_tl"].sum())
pf = gross_win / gross_loss if gross_loss > 0 else 0

win_rate = (len(wins) / len(df)) * 100
avg_win_pct = wins["pnl_pct"].mean()
avg_loss_pct = losses["pnl_pct"].mean()
avg_trade_pct = df["pnl_pct"].mean()

print("\n" + "="*75)
print("              MARKETPULSE 1-YEAR BACKTEST SUMMARY (1,000 TL ALLOTMENT)")
print("="*75)
print(f"Total Completed & Active Trades : {len(df):,}")
print(f"Winning Trades                  : {len(wins):,} ({win_rate:.2f}%)")
print(f"Losing Trades                   : {len(losses):,} ({(len(losses)/len(df))*100:.2f}%)")
print(f"Scratch / Breakeven Trades      : {len(ties):,}")
print(f"Total Cumulative Profit         : +TL {total_pnl:,.2f}")
print(f"Profit Factor (Gross W / L)     : {pf:.2f}")
print(f"Average Return per Trade        : +{avg_trade_pct:.2f}% (+TL {df['pnl_tl'].mean():.2f})")
print(f"Average Winner                  : +{avg_win_pct:.2f}% (+TL {wins['pnl_tl'].mean():.2f})")
print(f"Average Loser                   : {avg_loss_pct:.2f}% (-TL {abs(losses['pnl_tl'].mean()):.2f})")
print(f"Payoff Ratio (Win / Loss)       : {abs(avg_win_pct / avg_loss_pct):.2f}x")
print(f"Average Holding Time            : {df['days_held'].mean():.1f} trading days")

print("\n" + "="*75)
print("                    PERFORMANCE BY STRATEGY")
print("="*75)
strat_rows = []
for strat, sdf in df.groupby("strategy"):
    s_wins = sdf[sdf["pnl_tl"] > 0]
    s_losses = sdf[sdf["pnl_tl"] < 0]
    s_wr = (len(s_wins) / len(sdf)) * 100
    s_pnl = sdf["pnl_tl"].sum()
    s_gw = s_wins["pnl_tl"].sum()
    s_gl = abs(s_losses["pnl_tl"].sum())
    s_pf = s_gw / s_gl if s_gl > 0 else 0
    strat_rows.append({
        "Strategy": strat,
        "Trades": len(sdf),
        "Win Rate %": round(s_wr, 1),
        "Profit Factor": round(s_pf, 2),
        "Net PnL (TL)": round(s_pnl, 2),
        "Avg Win %": round(s_wins["pnl_pct"].mean(), 1) if len(s_wins) > 0 else 0,
        "Avg Loss %": round(s_losses["pnl_pct"].mean(), 1) if len(s_losses) > 0 else 0,
        "Avg Days": round(sdf["days_held"].mean(), 1)
    })
df_strats = pd.DataFrame(strat_rows).sort_values("Net PnL (TL)", ascending=False)
print(df_strats.to_string(index=False))

print("\n" + "="*75)
print("                    PERFORMANCE BY MARKET")
print("="*75)
market_rows = []
for mkt, mdf in df.groupby("market"):
    m_wins = mdf[mdf["pnl_tl"] > 0]
    m_losses = mdf[mdf["pnl_tl"] < 0]
    m_wr = (len(m_wins) / len(mdf)) * 100
    m_pnl = mdf["pnl_tl"].sum()
    m_gw = m_wins["pnl_tl"].sum()
    m_gl = abs(m_losses["pnl_tl"].sum())
    m_pf = m_gw / m_gl if m_gl > 0 else 0
    market_rows.append({
        "Market": mkt,
        "Trades": len(mdf),
        "Win Rate %": round(m_wr, 1),
        "Profit Factor": round(m_pf, 2),
        "Net PnL (TL)": round(m_pnl, 2),
        "Avg Win %": round(m_wins["pnl_pct"].mean(), 1) if len(m_wins) > 0 else 0,
        "Avg Loss %": round(m_losses["pnl_pct"].mean(), 1) if len(m_losses) > 0 else 0,
        "Avg Days": round(mdf["days_held"].mean(), 1)
    })
df_markets = pd.DataFrame(market_rows).sort_values("Net PnL (TL)", ascending=False)
print(df_markets.to_string(index=False))

print("\n" + "="*75)
print("             CROSS-ANALYSIS: STRATEGY x MARKET")
print("="*75)
cross_rows = []
for (strat, mkt), cm_df in df.groupby(["strategy", "market"]):
    c_wins = cm_df[cm_df["pnl_tl"] > 0]
    c_losses = cm_df[cm_df["pnl_tl"] < 0]
    c_wr = (len(c_wins) / len(cm_df)) * 100
    c_pnl = cm_df["pnl_tl"].sum()
    c_gw = c_wins["pnl_tl"].sum()
    c_gl = abs(c_losses["pnl_tl"].sum())
    c_pf = c_gw / c_gl if c_gl > 0 else 0
    cross_rows.append({
        "Strategy": strat,
        "Market": mkt,
        "Trades": len(cm_df),
        "Win Rate %": round(c_wr, 1),
        "Profit Factor": round(c_pf, 2),
        "Net PnL (TL)": round(c_pnl, 2),
        "Avg Win %": round(c_wins["pnl_pct"].mean(), 1) if len(c_wins) > 0 else 0,
        "Avg Loss %": round(c_losses["pnl_pct"].mean(), 1) if len(c_losses) > 0 else 0,
    })
df_cross = pd.DataFrame(cross_rows).sort_values("Net PnL (TL)", ascending=False)
print(df_cross.to_string(index=False))

print("\n" + "="*75)
print("                    TRADE STATUS BREAKDOWN")
print("="*75)
status_counts = df["status"].value_counts()
for stat, count in status_counts.items():
    pct = (count / len(df)) * 100
    sub_stat = df[df["status"] == stat]
    sub_pnl = sub_stat["pnl_tl"].sum()
    print(f"  {stat:15s}: {count:4d} trades ({pct:5.1f}%) | Net PnL: TL {sub_pnl:10,.2f}")

print("\n" + "="*75)
print("                   TOP 15 BEST PERFORMING TICKERS")
print("="*75)
sym_perf = df.groupby(["symbol", "market"]).agg(
    total_trades=("pnl_tl", "count"),
    wins=("is_win", "sum"),
    total_pnl=("pnl_tl", "sum"),
    avg_pnl_pct=("pnl_pct", "mean")
).reset_index()
sym_perf["win_rate"] = (sym_perf["wins"] / sym_perf["total_trades"]) * 100
top_syms = sym_perf.sort_values("total_pnl", ascending=False).head(15)
print(top_syms.to_string(index=False))

print("\n" + "="*75)
print("                   BOTTOM 5 WORST PERFORMING TICKERS")
print("="*75)
bottom_syms = sym_perf.sort_values("total_pnl", ascending=True).head(5)
print(bottom_syms.to_string(index=False))
