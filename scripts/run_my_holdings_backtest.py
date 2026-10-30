"""
5-Year Portfolio Holdings Backtest: Trend Pullback Reclaim Strategy
===================================================================
Simulates the Trend Pullback Reclaim strategy specifically across the user's
portfolio holdings:
  1. Primary Portfolio Holdings: AKBNK, ISMEN, TURSG, TRGYO
  2. Full Account History (All historical holdings from database/orders):
     CCOLA, HALKB, KCHOL, YKBNK, VAKBN, AEFES, PETKM, AGHOL, TCELL, BIMAS, BRSAN, KRDMD
  3. Comparative analysis vs XU100 Benchmark and Buy & Hold of the holdings.
"""

import sys
import time
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np
import yfinance as yf

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.services.data_fetcher import _normalize_ohlcv_columns
from app.models.schemas import BacktestConfig
from app.services.backtesting_engine import InstitutionalBacktestEngine

CACHE_BIST = Path(__file__).resolve().parent.parent / "bist_5y_history.pkl"

PRIMARY_HOLDINGS = ['AKBNK', 'ISMEN', 'TURSG', 'TRGYO']
EXTENDED_HOLDINGS = [
    'AKBNK', 'ISMEN', 'TURSG', 'TRGYO',
    'CCOLA', 'KCHOL', 'YKBNK', 'HALKB', 'VAKBN', 'AEFES',
    'PETKM', 'AGHOL', 'TCELL', 'BIMAS', 'BRSAN', 'KRDMD'
]


def load_holdings_data(symbols):
    """Loads 5-year historical daily bars for the specified symbols."""
    stock_data = {}
    missing_symbols = []

    if CACHE_BIST.exists():
        df_all = pd.read_pickle(CACHE_BIST)
        for sym in symbols:
            sub = df_all[df_all['symbol'] == sym]
            if len(sub) >= 200:
                stock_data[sym] = sub.sort_index()
            else:
                missing_symbols.append(sym)
    else:
        missing_symbols = symbols

    if missing_symbols:
        print(f"📡 Downloading fresh historical data for {missing_symbols} via Yahoo Finance...")
        tickers = [f"{s}.IS" if not s.endswith(".IS") else s for s in missing_symbols]
        raw = yf.download(tickers, period="5y", group_by='ticker', auto_adjust=False, progress=False)

        for sym, ticker in zip(missing_symbols, tickers):
            try:
                if len(tickers) == 1:
                    df_sym = raw.copy()
                elif isinstance(raw.columns, pd.MultiIndex):
                    df_sym = raw[ticker].copy() if ticker in raw.columns.levels[0] else pd.DataFrame()
                else:
                    df_sym = raw.copy()

                df_sym = _normalize_ohlcv_columns(df_sym)
                if not df_sym.empty and len(df_sym) >= 200 and "close" in df_sym.columns:
                    df_sym = df_sym.dropna(subset=["close"])
                    df_sym["symbol"] = sym
                    stock_data[sym] = df_sym
            except Exception as e:
                print(f"⚠️ Error downloading {sym}: {e}")

    print(f"✓ Formatted {len(stock_data)} holding symbols with full 5-year daily history.")
    return stock_data


def load_xu100():
    print("📡 Loading XU100.IS benchmark...")
    df_idx = yf.download("XU100.IS", period="5y", interval="1d", auto_adjust=False, progress=False)
    if isinstance(df_idx.columns, pd.MultiIndex):
        df_idx.columns = df_idx.columns.get_level_values(0)
    df_idx.columns = [c.lower() for c in df_idx.columns]
    df_idx = df_idx.dropna(subset=["close"])
    df_idx.index = pd.to_datetime(df_idx.index).tz_localize(None).date
    return df_idx


def generate_pullback_signals(stock_data):
    """Generates signals based on the exact Trend Pullback Reclaim rules."""
    signals = []

    for sym, df in stock_data.items():
        if len(df) < 205:
            continue

        c = df["close"].values
        h = df["high"].values if "high" in df.columns else c
        l = df["low"].values if "low" in df.columns else c
        v = df["volume"].values if "volume" in df.columns else np.zeros(len(c))

        ema20 = pd.Series(c).ewm(span=20, adjust=False).mean().values
        ema50 = pd.Series(c).ewm(span=50, adjust=False).mean().values
        ema200 = pd.Series(c).ewm(span=200, adjust=False).mean().values
        vol_sma20 = pd.Series(v).rolling(20).mean().values

        tr = np.maximum(h[1:] - l[1:], np.maximum(np.abs(h[1:] - c[:-1]), np.abs(l[1:] - c[:-1])))
        tr = np.insert(tr, 0, h[0] - l[0])
        atr14 = pd.Series(tr).rolling(14).mean().values

        dates = [d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10] for d in df.index]

        for i in range(200, len(c)):
            close_i = c[i]
            high_i = h[i]
            low_i = l[i]
            vol_i = v[i]
            atr_i = atr14[i]

            # 1. Trend Filter: Stage 2
            if not (close_i > ema50[i] and close_i > ema200[i] and ema50[i] > ema200[i]):
                continue

            # 2. Pullback from 20-day High (2.5% to 5.8% within 1-5 sessions)
            lookback_start = max(0, i - 19)
            recent_highs = h[lookback_start:i+1]
            recent_peak = np.max(recent_highs)
            peak_offset = len(recent_highs) - 1 - int(np.argmax(recent_highs))
            bars_since_peak = peak_offset + 1

            if not (1 <= bars_since_peak <= 5):
                continue

            pullback_trough = np.min(l[max(0, i - bars_since_peak):i+1])
            pullback_depth_pct = ((recent_peak - pullback_trough) / recent_peak) * 100.0

            if not (2.5 <= pullback_depth_pct <= 5.8):
                continue

            # 3. Reclaim Candle Trigger
            prior_high = h[i-1]
            prior_close = c[i-1]

            if not (close_i > prior_high and close_i > ema20[i]):
                continue

            candle_range = high_i - low_i
            if candle_range <= 0:
                continue
            range_position = (close_i - low_i) / candle_range
            if range_position < 0.60:
                continue

            # 4. Volume Confirmation
            avg_vol = vol_sma20[i]
            if np.isnan(avg_vol) or avg_vol <= 0:
                continue
            if not (vol_i > 1.2 * avg_vol):
                continue

            # 5. Risk Guards
            daily_change_pct = ((close_i - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
            if daily_change_pct < -4.5 or daily_change_pct <= -8.5:
                continue

            stop_loss_atr = close_i - (2.0 * atr_i)
            stop_loss_swing = pullback_trough * 0.995
            stop_loss = min(stop_loss_atr, stop_loss_swing)

            risk_dist = close_i - stop_loss
            if risk_dist <= 0:
                continue
            risk_pct = (risk_dist / close_i) * 100.0
            if risk_pct > 10.0:
                stop_loss = close_i * 0.90
                risk_dist = close_i - stop_loss

            target_1 = close_i + (2.0 * risk_dist)

            signals.append({
                "symbol": sym,
                "strategy": "pullback_reclaim",
                "signal_date": dates[i],
                "entry_price": round(close_i, 2),
                "stop_loss": round(stop_loss, 2),
                "target_1": round(target_1, 2),
                "risk_reward_ratio": 2.0,
                "confidence_score": 8.5,
            })

    return signals


def run_portfolio_backtest():
    start_time = time.time()
    print("=" * 80)
    print("  5-YEAR PULLBACK RECLAIM BACKTEST: USER HOLDINGS (2021-2026)")
    print("=" * 80)

    # 1. Primary Holdings Backtest (AKBNK, ISMEN, TURSG, TRGYO)
    print(f"\n📁 Step 1: Testing Active Core Holdings: {PRIMARY_HOLDINGS}")
    primary_data = load_holdings_data(PRIMARY_HOLDINGS)
    primary_signals = generate_pullback_signals(primary_data)
    print(f"  • Signals Found: {len(primary_signals)} setups across the 4 core holdings.")

    config_core = BacktestConfig(
        initial_capital=100_000.0,
        commission_bps=10.0,
        slippage_bps=5.0,
        risk_per_trade_pct=2.5,   # Slightly higher allocation per trade for concentrated portfolio
        max_open_positions=4,     # Max 4 holdings simultaneously
        max_hold_days=20,
    )
    engine_core = InstitutionalBacktestEngine(config=config_core)
    res_core = engine_core.run_simulation(historical_data=primary_data, trade_signals=primary_signals)

    # 2. Extended Holdings Backtest (All 16 assets in account history)
    print(f"\n📁 Step 2: Testing Full Account Universe (16 Assets): {EXTENDED_HOLDINGS}")
    ext_data = load_holdings_data(EXTENDED_HOLDINGS)
    ext_signals = generate_pullback_signals(ext_data)
    print(f"  • Signals Found: {len(ext_signals)} setups across all 16 portfolio assets.")

    config_ext = BacktestConfig(
        initial_capital=100_000.0,
        commission_bps=10.0,
        slippage_bps=5.0,
        risk_per_trade_pct=1.5,
        max_open_positions=8,
        max_hold_days=20,
    )
    engine_ext = InstitutionalBacktestEngine(config=config_ext)
    res_ext = engine_ext.run_simulation(historical_data=ext_data, trade_signals=ext_signals)

    # 3. Benchmark Metrics
    xu100_df = load_xu100()
    bench_return_pct = 0.0
    bench_cagr = 0.0
    bench_max_dd = 0.0
    bench_sharpe = 0.0

    if xu100_df is not None and len(res_core.equity_curve) > 1:
        s_date = datetime.strptime(res_core.equity_curve[0].date, "%Y-%m-%d").date()
        e_date = datetime.strptime(res_core.equity_curve[-1].date, "%Y-%m-%d").date()
        idx_slice = xu100_df.loc[(xu100_df.index >= s_date) & (xu100_df.index <= e_date)]
        if len(idx_slice) > 1:
            idx_start = idx_slice["close"].iloc[0]
            idx_end = idx_slice["close"].iloc[-1]
            bench_return_pct = ((idx_end - idx_start) / idx_start) * 100.0
            years = max(0.1, len(idx_slice) / 252.0)
            bench_cagr = (((idx_end / idx_start) ** (1.0 / years)) - 1.0) * 100.0

            roll_max = idx_slice["close"].cummax()
            dd_series = (idx_slice["close"] - roll_max) / roll_max * 100.0
            bench_max_dd = abs(dd_series.min())

            idx_returns = idx_slice["close"].pct_change().dropna()
            if len(idx_returns) > 1 and idx_returns.std() > 0:
                bench_sharpe = (idx_returns.mean() / idx_returns.std()) * np.sqrt(252)

    # 4. Display Comparative Scorecard
    print("\n" + "=" * 80)
    print("🏆 5-YEAR STRATEGY SCORECARD: USER HOLDINGS vs. FULL UNIVERSE vs. XU100")
    print("=" * 80)
    print(f"{'Performance Metric':<30} | {'Active Holdings (4)':<18} | {'Account Universe (16)':<20} | {'XU100 Index':<12}")
    print("-" * 80)
    print(f"{'Total Return':<30} | {res_core.total_return_pct:>16.2f}% | {res_ext.total_return_pct:>18.2f}% | {bench_return_pct:>10.2f}%")
    print(f"{'Annualized Return (CAGR)':<30} | {res_core.cagr_pct:>16.2f}% | {res_ext.cagr_pct:>18.2f}% | {bench_cagr:>10.2f}%")
    print(f"{'Sharpe Ratio':<30} | {res_core.sharpe_ratio:>16.2f}  | {res_ext.sharpe_ratio:>18.2f}  | {bench_sharpe:>10.2f} ")
    print(f"{'Sortino Ratio':<30} | {res_core.sortino_ratio:>16.2f}  | {res_ext.sortino_ratio:>18.2f}  | {'N/A':>10} ")
    print(f"{'Maximum Drawdown':<30} | {res_core.max_drawdown_pct:>16.2f}% | {res_ext.max_drawdown_pct:>18.2f}% | {-bench_max_dd:>10.2f}%")
    print(f"{'Ending Equity (100k TRY)':<30} | {res_core.final_equity:>16,.2f} ₺| {res_ext.final_equity:>18,.2f} ₺| {100000*(1+bench_return_pct/100):>9,.2f} ₺")
    print("-" * 80)
    print(f"{'Trade Quality & Stats':<30} |")
    print(f"{'  Total Closed Trades':<30} | {res_core.total_trades:>16}  | {res_ext.total_trades:>18}  | {'Buy & Hold':>12}")
    print(f"{'  Win Rate (%)':<30} | {res_core.win_rate:>16.2f}% | {res_ext.win_rate:>18.2f}% | {'N/A':>12}")
    print(f"{'  Profit Factor':<30} | {res_core.profit_factor:>16.2f}  | {res_ext.profit_factor:>18.2f}  | {'N/A':>12}")
    print(f"{'  Expectancy per Trade (%)':<30} | {res_core.expectancy:>16.2f}% | {res_ext.expectancy:>18.2f}% | {'N/A':>12}")
    print(f"{'  Average Holding Period':<30} | {res_core.avg_holding_days:>15.1f}d | {res_ext.avg_holding_days:>17.1f}d | {'5.0 yrs':>12}")
    print("-" * 80)

    # Breakdown per asset
    print("\n🔍 Individual Holding Breakdown (Under Pullback Reclaim):")
    for sym in PRIMARY_HOLDINGS:
        trades = [t for t in res_core.trades if t.symbol == sym]
        if trades:
            wins = [t for t in trades if t.outcome == "WIN"]
            wr = len(wins) / len(trades) * 100.0
            pnl_sum = sum(t.pnl for t in trades)
            print(f"  • {sym:<6}: {len(trades):>2} trades | Win Rate: {wr:>5.1f}% | Net PnL: {pnl_sum:>+10,.2f} ₺ | Avg Win: {sum(t.pnl_pct for t in wins)/len(wins):>5.1f}%")
        else:
            print(f"  • {sym:<6}: 0 qualifying trades")

    print("\n" + "=" * 80)
    print(f"⏱️ Finished backtest simulation in {time.time() - start_time:.1f} seconds.")


if __name__ == "__main__":
    run_portfolio_backtest()
