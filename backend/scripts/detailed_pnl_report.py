import pandas as pd
import numpy as np

df = pd.read_csv("backtest_results_1000tl.csv")
df["signal_date"] = pd.to_datetime(df["signal_date"])
df["exit_date"] = pd.to_datetime(df["exit_date"])
df["month"] = df["exit_date"].dt.to_period("M")

# Filter closed trades (status != 'OPEN')
closed = df[df["status"] != "OPEN"].copy()

wins = closed[closed["pnl_tl"] > 0]
losses = closed[closed["pnl_tl"] < 0]
breakevens = closed[closed["pnl_tl"] == 0]

gross_profit = wins["pnl_tl"].sum()
gross_loss = abs(losses["pnl_tl"].sum())
net_profit = gross_profit - gross_loss
profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0

total_closed = len(closed)
win_count = len(wins)
loss_count = len(losses)
be_count = len(breakevens)

win_rate = (win_count / total_closed) * 100
loss_rate = (loss_count / total_closed) * 100

avg_win_tl = wins["pnl_tl"].mean()
avg_win_pct = wins["pnl_pct"].mean()

avg_loss_tl = abs(losses["pnl_tl"].mean())
avg_loss_pct = abs(losses["pnl_pct"].mean())

payoff_ratio = avg_win_pct / avg_loss_pct if avg_loss_pct > 0 else 0

best_trade = closed.sort_values("pnl_tl", ascending=False).iloc[0]
worst_trade = closed.sort_values("pnl_tl", ascending=True).iloc[0]

print("="*75)
print("       ANNUAL PROFIT & LOSS REPORT (LAST 1 YEAR - CURRENT SETUPS)")
print("="*75)
print(f"Per-Trade Allocation       : TL 950 - TL 1,100 (Avg: TL {closed['allocated_tl'].mean():.2f})")
print(f"Total Closed Trades        : {total_closed:,}")
print(f"Currently Open Trades      : {len(df[df['status'] == 'OPEN']):,}")
print("-"*75)
print(f"Total Gross Profit         : +TL {gross_profit:,.2f}")
print(f"Total Gross Loss           : -TL {gross_loss:,.2f}")
print(f"Net Realized Profit/Loss   : +TL {net_profit:,.2f}")
print(f"Profit Factor              : {profit_factor:.2f}")
print("-"*75)
print(f"Winning Trades             : {win_count:,} ({win_rate:.1f}%)")
print(f"Losing Trades              : {loss_count:,} ({loss_rate:.1f}%)")
print(f"Breakeven Trades           : {be_count:,} ({(be_count/total_closed)*100:.1f}%)")
print(f"Average Winning Trade      : +TL {avg_win_tl:.2f} (+{avg_win_pct:.2f}%)")
print(f"Average Losing Trade       : -TL {avg_loss_tl:.2f} (-{avg_loss_pct:.2f}%)")
print(f"Payoff Ratio (Win/Loss)    : {payoff_ratio:.2f}x")
print(f"Best Single Trade          : {best_trade['symbol']} ({best_trade['strategy']}) +TL {best_trade['pnl_tl']:.2f} (+{best_trade['pnl_pct']:.1f}%)")
print(f"Worst Single Trade         : {worst_trade['symbol']} ({worst_trade['strategy']}) -TL {abs(worst_trade['pnl_tl']):.2f} ({worst_trade['pnl_pct']:.1f}%)")

print("\n" + "="*75)
print("                     MONTH-BY-MONTH P&L BREAKDOWN")
print("="*75)
monthly_summary = []
for m, mdf in closed.groupby("month"):
    m_wins = mdf[mdf["pnl_tl"] > 0]
    m_losses = mdf[mdf["pnl_tl"] < 0]
    m_gp = m_wins["pnl_tl"].sum()
    m_gl = abs(m_losses["pnl_tl"].sum())
    m_net = m_gp - m_gl
    m_wr = (len(m_wins) / len(mdf)) * 100 if len(mdf) > 0 else 0
    m_pf = m_gp / m_gl if m_gl > 0 else 0
    monthly_summary.append({
        "Month": str(m),
        "Trades": len(mdf),
        "Wins": len(m_wins),
        "Losses": len(m_losses),
        "Win Rate %": round(m_wr, 1),
        "Gross Profit (TL)": round(m_gp, 2),
        "Gross Loss (TL)": round(m_gl, 2),
        "Net PnL (TL)": round(m_net, 2),
        "Profit Factor": round(m_pf, 2)
    })

df_month = pd.DataFrame(monthly_summary).sort_values("Month")
print(df_month.to_string(index=False))

print("\n" + "="*75)
print("                 PERFORMANCE BY STRATEGY (CURRENT SETUPS)")
print("="*75)
strat_summary = []
for strat, sdf in closed.groupby("strategy"):
    s_wins = sdf[sdf["pnl_tl"] > 0]
    s_losses = sdf[sdf["pnl_tl"] < 0]
    s_gp = s_wins["pnl_tl"].sum()
    s_gl = abs(s_losses["pnl_tl"].sum())
    s_net = s_gp - s_gl
    s_wr = (len(s_wins) / len(sdf)) * 100 if len(sdf) > 0 else 0
    s_pf = s_gp / s_gl if s_gl > 0 else 0
    strat_summary.append({
        "Strategy": strat,
        "Trades": len(sdf),
        "Wins": len(s_wins),
        "Losses": len(s_losses),
        "Win Rate %": round(s_wr, 1),
        "Gross Profit": round(s_gp, 2),
        "Gross Loss": round(s_gl, 2),
        "Net PnL (TL)": round(s_net, 2),
        "Profit Factor": round(s_pf, 2)
    })

df_strat = pd.DataFrame(strat_summary).sort_values("Net PnL (TL)", ascending=False)
print(df_strat.to_string(index=False))

# Portfolio Drawdown & Max Concurrent Positions
closed_sorted = closed.sort_values("exit_date").reset_index(drop=True)
closed_sorted["cum_pnl"] = closed_sorted["pnl_tl"].cumsum()
closed_sorted["peak"] = closed_sorted["cum_pnl"].cummax()
closed_sorted["drawdown"] = closed_sorted["cum_pnl"] - closed_sorted["peak"]
max_dd_tl = abs(closed_sorted["drawdown"].min())

print("\n" + "="*75)
print("                   CAPITAL & DRAWDOWN METRICS")
print("="*75)
print(f"Max Cumulative P&L Drawdown : -TL {max_dd_tl:,.2f}")
print(f"Peak Cumulative P&L         : +TL {closed_sorted['cum_pnl'].max():,.2f}")
print(f"Ending Cumulative P&L       : +TL {closed_sorted['cum_pnl'].iloc[-1]:,.2f}")
