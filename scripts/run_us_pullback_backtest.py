"""
5-Year US Market Backtest: Trend Pullback Reclaim vs. SPY Benchmark
====================================================================
Runs an empirical 5-year simulation (2021-2026) across US equities and ETFs
comparing performance under:
  1. Default BIST Parameters (2.5%-5.8% pullback, 5 sessions max, 2.0x ATR stop)
  2. US-Tuned Parameters (3.0%-8.5% pullback, 8 sessions max, 1.5x ATR stop, 12 sessions hold)
and benchmarks both directly against the S&P 500 (SPY).
"""

import os
import sys
import time
import json
from datetime import datetime, timezone, date
from pathlib import Path
import pandas as pd
import numpy as np

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app.services.data_fetcher import _normalize_ohlcv_columns
from app.models.schemas import BacktestConfig
from app.services.backtesting_engine import InstitutionalBacktestEngine

CACHE_FILE_US = Path(__file__).resolve().parent.parent / "us_5y_history.pkl"

US_SYMBOLS = [
    'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD',
    'AVGO', 'COST', 'KO', 'PEP', 'JNJ', 'PG', 'MCD', 'BRK-B',
    'SMH', 'SCHD', 'JEPI', 'JEPQ', 'VOO', 'VNQ', 'VYM', 'GLD', 'TLT',
    'O', 'VICI', 'PLD', 'AMT', 'EQIX', 'STAG', 'SPG'
]


def load_us_historical_data():
    """Loads 5-year historical data for US symbols, with pickle disk caching."""
    if CACHE_FILE_US.exists():
        print(f"📦 Loading 5-year US price data from local cache ({CACHE_FILE_US.name})...")
        try:
            df_all = pd.read_pickle(CACHE_FILE_US)
            stock_data = {}
            for sym, group in df_all.groupby("symbol"):
                df_sym = group.sort_index()
                if len(df_sym) >= 200:
                    stock_data[sym] = df_sym
            print(f"✓ Loaded {len(stock_data)} US tickers from cache in <0.5s.")
            return stock_data
        except Exception as e:
            print(f"Note on reading cache: {e}, fetching fresh data...")

    import yfinance as yf
    print(f"📡 Fetching 5-year price data for {len(US_SYMBOLS)} US tickers (period: 5y)...")
    raw_df = yf.download(US_SYMBOLS, period="5y", group_by='ticker', auto_adjust=False, progress=False)

    stock_data = {}
    combined_rows = []

    for sym in US_SYMBOLS:
        try:
            if isinstance(raw_df.columns, pd.MultiIndex):
                if sym in raw_df.columns.levels[0]:
                    df_sym = raw_df[sym].copy()
                else:
                    continue
            else:
                df_sym = raw_df.copy()

            df_sym = _normalize_ohlcv_columns(df_sym)
            if df_sym.empty or len(df_sym) < 200 or "close" not in df_sym.columns:
                continue

            df_sym = df_sym.dropna(subset=["close"])
            df_sym["symbol"] = sym
            stock_data[sym] = df_sym
            combined_rows.append(df_sym)
        except Exception as err:
            print(f"⚠️ Error formatting {sym}: {err}")

    if combined_rows:
        try:
            df_combined = pd.concat(combined_rows)
            df_combined.to_pickle(CACHE_FILE_US)
            print(f"💾 Cached 5-year US data to {CACHE_FILE_US.name}.")
        except Exception as err:
            print(f"Note on saving cache: {err}")

    print(f"✓ Formatted {len(stock_data)} US tickers with >= 200 daily bars.")
    return stock_data


def load_spy_benchmark():
    """Loads SPY benchmark data for comparison."""
    import yfinance as yf
    print("📡 Fetching SPY benchmark for 5-year comparative analysis...")
    try:
        df_idx = yf.download("SPY", period="5y", interval="1d", auto_adjust=False, progress=False)
        if isinstance(df_idx.columns, pd.MultiIndex):
            df_idx.columns = df_idx.columns.get_level_values(0)
        df_idx.columns = [c.lower() for c in df_idx.columns]
        df_idx = df_idx.dropna(subset=["close"])
        df_idx.index = pd.to_datetime(df_idx.index).tz_localize(None).date
        print(f"✓ SPY benchmark ready: {len(df_idx):,} bars.")
        return df_idx
    except Exception as e:
        print(f"⚠️ Could not load SPY via yfinance: {e}")
        return None


def generate_us_signals(
    stock_data,
    pullback_min_pct: float = 3.0,
    pullback_max_pct: float = 8.5,
    max_pullback_bars: int = 8,
    atr_stop_multiplier: float = 1.5,
    rr_target: float = 2.0,
    strategy_label: str = "US_Tuned"
):
    """Generates signals with parameterized market dynamics."""
    signals = []

    for sym, df in stock_data.items():
        if len(df) < 205:
            continue

        c = df["close"].values
        h = df["high"].values if "high" in df.columns else c
        l = df["low"].values if "low" in df.columns else c
        v = df["volume"].values if "volume" in df.columns else np.zeros(len(c))

        # Vectorized Indicators
        ema20 = pd.Series(c).ewm(span=20, adjust=False).mean().values
        ema50 = pd.Series(c).ewm(span=50, adjust=False).mean().values
        ema200 = pd.Series(c).ewm(span=200, adjust=False).mean().values
        vol_sma20 = pd.Series(v).rolling(20).mean().values

        # ATR 14
        tr = np.maximum(
            h[1:] - l[1:],
            np.maximum(
                np.abs(h[1:] - c[:-1]),
                np.abs(l[1:] - c[:-1])
            )
        )
        tr = np.insert(tr, 0, h[0] - l[0])
        atr14 = pd.Series(tr).rolling(14).mean().values

        dates = [d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10] for d in df.index]

        for i in range(200, len(c)):
            close_i = c[i]
            high_i = h[i]
            low_i = l[i]
            vol_i = v[i]
            atr_i = atr14[i]

            # 1. Trend Filter: Stage 2 Bull
            if not (close_i > ema50[i] and close_i > ema200[i] and ema50[i] > ema200[i]):
                continue

            # 2. Pullback from 20-day High
            lookback_start = max(0, i - 19)
            recent_highs = h[lookback_start:i+1]
            recent_peak = np.max(recent_highs)
            peak_offset = len(recent_highs) - 1 - int(np.argmax(recent_highs))
            bars_since_peak = peak_offset + 1

            if not (1 <= bars_since_peak <= max_pullback_bars):
                continue

            pullback_trough = np.min(l[max(0, i - bars_since_peak):i+1])
            pullback_depth_pct = ((recent_peak - pullback_trough) / recent_peak) * 100.0

            if not (pullback_min_pct <= pullback_depth_pct <= pullback_max_pct):
                continue

            # 3. Reclaim Trigger
            prior_high = h[i-1]
            prior_close = c[i-1]

            if not (close_i > prior_high and close_i > ema20[i]):
                continue

            candle_range = high_i - low_i
            if candle_range <= 0:
                continue
            range_position = (close_i - low_i) / candle_range
            if range_position < 0.55:  # Slightly more permissive than BIST (0.55 vs 0.60)
                continue

            # 4. Volume Confirmation (1.1x volume for US vs 1.2x for BIST due to darker liquidity)
            avg_vol = vol_sma20[i]
            if np.isnan(avg_vol) or avg_vol <= 0:
                continue
            if not (vol_i > 1.1 * avg_vol):
                continue

            # 5. Risk Guards
            daily_change_pct = ((close_i - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
            if daily_change_pct < -5.0:  # US allows slightly wider single-day gap down on morning open
                continue

            # ATR stop
            stop_loss_atr = close_i - (atr_stop_multiplier * atr_i)
            stop_loss_swing = pullback_trough * 0.995
            stop_loss = min(stop_loss_atr, stop_loss_swing)

            risk_dist = close_i - stop_loss
            if risk_dist <= 0:
                continue
            risk_pct = (risk_dist / close_i) * 100.0
            if risk_pct > 8.0:  # Cap US max risk at 8% (tighter than BIST 10%)
                stop_loss = close_i * 0.92
                risk_dist = close_i - stop_loss

            target_1 = close_i + (rr_target * risk_dist)

            signals.append({
                "symbol": sym,
                "strategy": strategy_label,
                "signal_date": dates[i],
                "entry_price": round(close_i, 2),
                "stop_loss": round(stop_loss, 2),
                "target_1": round(target_1, 2),
                "risk_reward_ratio": rr_target,
                "confidence_score": 8.0,
            })

    return signals


def run_us_comparative_backtest():
    start_time = time.time()
    print("=" * 75)
    print("  INSTITUTIONAL US EQUITIES 5-YEAR BACKTEST (2021-2026)")
    print("=" * 75)

    stock_data = load_us_historical_data()
    spy_df = load_spy_benchmark()

    if not stock_data:
        print("❌ Error loading US stock data.")
        return

    # Scenario A: BIST Original Tuning on US stocks (Strict 2.5-5.8%, 2.0x ATR, 20-day hold)
    print("\n🔍 Running Scenario A: BIST-Tuned Rules on US Equities...")
    signals_bist_rules = generate_us_signals(
        stock_data,
        pullback_min_pct=2.5,
        pullback_max_pct=5.8,
        max_pullback_bars=5,
        atr_stop_multiplier=2.0,
        rr_target=2.0,
        strategy_label="BIST_Rules_on_US"
    )
    print(f"  • Generated {len(signals_bist_rules)} signals under BIST rules.")

    config_a = BacktestConfig(
        initial_capital=100_000.0,
        commission_bps=2.0,   # US brokers (IBKR / retail) have very low/zero commissions (~2 bps effective)
        slippage_bps=2.0,     # Deep US liquidity (2 bps slippage)
        risk_per_trade_pct=1.5,
        max_open_positions=10,
        max_hold_days=20,
    )
    engine_a = InstitutionalBacktestEngine(config=config_a)
    res_a = engine_a.run_simulation(historical_data=stock_data, trade_signals=signals_bist_rules)

    # Scenario B: US Market-Tuned (Deeper 3.0-8.5%, 8 sessions max, 1.5x ATR, 12-day hold)
    print("\n🔍 Running Scenario B: US-Tuned Dynamic Rules (Deeper Pullback, Shorter Hold)...")
    signals_us_tuned = generate_us_signals(
        stock_data,
        pullback_min_pct=3.0,
        pullback_max_pct=8.5,
        max_pullback_bars=8,
        atr_stop_multiplier=1.5,
        rr_target=1.8,
        strategy_label="US_Optimized"
    )
    print(f"  • Generated {len(signals_us_tuned)} signals under US-tuned rules.")

    config_b = BacktestConfig(
        initial_capital=100_000.0,
        commission_bps=2.0,
        slippage_bps=2.0,
        risk_per_trade_pct=1.5,
        max_open_positions=10,
        max_hold_days=12,  # Faster capital turnover
    )
    engine_b = InstitutionalBacktestEngine(config=config_b)
    res_b = engine_b.run_simulation(historical_data=stock_data, trade_signals=signals_us_tuned)

    # Compute SPY Benchmark return
    spy_return_pct = 0.0
    spy_cagr = 0.0
    spy_max_dd = 0.0
    spy_sharpe = 0.0

    if spy_df is not None and len(res_b.equity_curve) > 1:
        s_date = datetime.strptime(res_b.equity_curve[0].date, "%Y-%m-%d").date()
        e_date = datetime.strptime(res_b.equity_curve[-1].date, "%Y-%m-%d").date()
        spy_slice = spy_df.loc[(spy_df.index >= s_date) & (spy_df.index <= e_date)]
        if len(spy_slice) > 1:
            spy_start = spy_slice["close"].iloc[0]
            spy_end = spy_slice["close"].iloc[-1]
            spy_return_pct = ((spy_end - spy_start) / spy_start) * 100.0
            years = max(0.1, len(spy_slice) / 252.0)
            spy_cagr = (((spy_end / spy_start) ** (1.0 / years)) - 1.0) * 100.0

            # SPY Max Drawdown
            roll_max = spy_slice["close"].cummax()
            dd_series = (spy_slice["close"] - roll_max) / roll_max * 100.0
            spy_max_dd = abs(dd_series.min())

            # SPY Sharpe
            spy_ret = spy_slice["close"].pct_change().dropna()
            if len(spy_ret) > 1 and spy_ret.std() > 0:
                spy_sharpe = (spy_ret.mean() / spy_ret.std()) * np.sqrt(252)

    # Display Side-by-Side Comparison
    print("\n" + "=" * 80)
    print("🏆 5-YEAR US EQUITIES SCORECARD: BIST RULES vs. US-TUNED vs. SPY BENCHMARK")
    print("=" * 80)
    print(f"{'Performance Metric':<30} | {'BIST Rules on US':<16} | {'US-Tuned Engine':<16} | {'SPY S&P 500':<12}")
    print("-" * 80)
    print(f"{'Total Return':<30} | {res_a.total_return_pct:>14.2f}% | {res_b.total_return_pct:>14.2f}% | {spy_return_pct:>10.2f}%")
    print(f"{'Annualized Return (CAGR)':<30} | {res_a.cagr_pct:>14.2f}% | {res_b.cagr_pct:>14.2f}% | {spy_cagr:>10.2f}%")
    print(f"{'Sharpe Ratio':<30} | {res_a.sharpe_ratio:>14.2f}  | {res_b.sharpe_ratio:>14.2f}  | {spy_sharpe:>10.2f} ")
    print(f"{'Sortino Ratio':<30} | {res_a.sortino_ratio:>14.2f}  | {res_b.sortino_ratio:>14.2f}  | {'N/A':>10} ")
    print(f"{'Maximum Drawdown':<30} | {res_a.max_drawdown_pct:>14.2f}% | {res_b.max_drawdown_pct:>14.2f}% | {-spy_max_dd:>10.2f}%")
    print(f"{'Ending Equity ($100k start)':<30} | ${res_a.final_equity:>13,.2f}  | ${res_b.final_equity:>13,.2f}  | ${100000*(1+spy_return_pct/100):>9,.2f} ")
    print("-" * 80)
    print(f"{'Trade Quality & Execution':<30} |")
    print(f"{'  Total Closed Trades':<30} | {res_a.total_trades:>14}  | {res_b.total_trades:>14}  | {'Buy & Hold':>12}")
    print(f"{'  Win Rate (%)':<30} | {res_a.win_rate:>14.2f}% | {res_b.win_rate:>14.2f}% | {'N/A':>12}")
    print(f"{'  Profit Factor':<30} | {res_a.profit_factor:>14.2f}  | {res_b.profit_factor:>14.2f}  | {'N/A':>12}")
    print(f"{'  Expectancy per Trade (%)':<30} | {res_a.expectancy:>14.2f}% | {res_b.expectancy:>14.2f}% | {'N/A':>12}")
    print(f"{'  Average Holding Period':<30} | {res_a.avg_holding_days:>14.1f}d | {res_b.avg_holding_days:>14.1f}d | {'5.0 yrs':>12}")
    print("-" * 80)
    print(f"{'Alpha vs. SPY':<30} | {res_a.total_return_pct - spy_return_pct:>+14.2f}% | {res_b.total_return_pct - spy_return_pct:>+14.2f}% | {'0.00%':>12}")
    print("=" * 80)

    # Save CSV outputs
    output_trades_path = Path(__file__).resolve().parent.parent / "us_backtest_trades.csv"
    if res_b.trades:
        pd.DataFrame([t.model_dump() for t in res_b.trades]).to_csv(output_trades_path, index=False)
        print(f"\n📁 Saved {len(res_b.trades)} US-tuned trade logs to {output_trades_path.name}")

    print(f"\n⏱️ Completed US empirical backtest in {time.time() - start_time:.1f} seconds.")


if __name__ == "__main__":
    run_us_comparative_backtest()
