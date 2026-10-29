"""
Institutional Backtest: Trend Pullback Reclaim Strategy vs. XU100 Benchmark (5-Year Horizon)

Strategy Specification:
1. Pullback:
   - 3% to 5% decline from 20-day high (with practical market buffer 2.5% - 5.5%)
   - 20-day high occurred within the last 5 sessions (1 <= bars_since_high <= 5)
2. Trend:
   - Close > EMA 50
   - Close > EMA 200
   - EMA 50 > EMA 200 (Stage 2 Uptrend)
3. Reclaim:
   - Close > Prior Day High
   - Close > EMA 20
   - Close in upper 40% of daily candle range: (Close - Low) / (High - Low) >= 0.60
4. Volume:
   - Volume > 1.2 * 20-day Volume SMA
5. Risk Guards:
   - Daily change > -4.5% (no flash dumps on signal candle)
   - Skip if closed near limit-down (daily return <= -8.5%)
   - Wide ATR stop: Entry - 2.0 * ATR14 (or pullback swing low, whichever is wider)
   - Target 1: 1:2 R:R (Entry + 2.0 * Risk)
   - Max holding period: 15 trading sessions
   - Execution frictions: 10 bps commission + 5 bps slippage
6. Benchmark Comparison:
   - Full risk-adjusted comparison against XU100 (BIST 100 Index)
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
from app.services.data_fetcher import fetch_bist_prices, _normalize_ohlcv_columns
from app.models.schemas import BacktestConfig
from app.services.backtesting_engine import InstitutionalBacktestEngine

CACHE_FILE = Path(__file__).resolve().parent.parent / "bist_5y_history.pkl"


def load_bist_symbols():
    symbols_file = Path(__file__).resolve().parent.parent / "bist100_symbols.json"
    if symbols_file.exists():
        with open(symbols_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return ['THYAO', 'ASELS', 'TUPRS', 'BIMAS', 'AKBNK', 'GARAN', 'ISCTR', 'YKBNK', 'SISE', 'EREGL', 'KCHOL', 'SAHOL', 'PGSUS', 'ENKAI', 'FROTO', 'TOASO', 'MGROS', 'TCELL', 'TTKOM', 'PETKM']


def load_bist_historical_data():
    """Loads 5-year historical data for BIST, with pickle disk caching for lightning-fast runs."""
    symbols = load_bist_symbols()

    if CACHE_FILE.exists():
        print(f"📦 Loading 5-year BIST price data from local cache ({CACHE_FILE.name})...")
        try:
            df_all = pd.read_pickle(CACHE_FILE)
            stock_data = {}
            for sym, group in df_all.groupby("symbol"):
                df_sym = group.sort_index()
                if len(df_sym) >= 200:
                    stock_data[sym] = df_sym
            print(f"✓ Loaded {len(stock_data)} BIST stocks from cache in <0.5s.")
            return stock_data
        except Exception as e:
            print(f"Note on reading cache: {e}, fetching fresh data...")

    print(f"📡 Fetching 5-year price data for {len(symbols)} BIST stocks (period: 5y)...")
    raw_data = fetch_bist_prices(symbols, period="5y")

    stock_data = {}
    combined_rows = []

    for sym, df in raw_data.items():
        if df.empty or len(df) < 200 or "close" not in df.columns:
            continue
        clean_sym = sym.replace(".IS", "")
        df_clean = df.copy()
        df_clean["symbol"] = clean_sym
        stock_data[clean_sym] = df_clean
        combined_rows.append(df_clean)

    if combined_rows:
        try:
            df_combined = pd.concat(combined_rows)
            df_combined.to_pickle(CACHE_FILE)
            print(f"💾 Cached 5-year data to {CACHE_FILE.name} for instant repeat analysis.")
        except Exception as err:
            print(f"Note on saving cache: {err}")

    print(f"✓ Formatted {len(stock_data)} BIST stocks with >= 200 daily bars.")
    return stock_data


def load_xu100_benchmark():
    """Loads XU100 benchmark data for comparison."""
    import yfinance as yf
    print("📡 Fetching XU100.IS benchmark for 5-year comparative analysis...")
    try:
        df_idx = yf.download("XU100.IS", period="5y", interval="1d", auto_adjust=False, progress=False)
        if isinstance(df_idx.columns, pd.MultiIndex):
            df_idx.columns = df_idx.columns.get_level_values(0)
        df_idx.columns = [c.lower() for c in df_idx.columns]
        df_idx = df_idx.dropna(subset=["close"])
        df_idx.index = pd.to_datetime(df_idx.index).tz_localize(None).date
        print(f"✓ XU100 benchmark ready: {len(df_idx):,} bars.")
        return df_idx
    except Exception as e:
        print(f"⚠️ Could not load XU100 via yfinance: {e}")
        return None


def generate_pullback_reclaim_signals(stock_data):
    """
    Evaluates every bar of every stock against the Trend Pullback Reclaim rules.
    """
    print("\n🔍 Scanning for 'Trend Pullback Reclaim' setups across 5 years...")
    signals = []

    for sym, df in stock_data.items():
        if len(df) < 205:
            continue

        c = df["close"].values
        h = df["high"].values
        l = df["low"].values
        o = df["open"].values
        v = df["volume"].values
        dates = [d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10] for d in df.index]

        # Indicators
        s_close = pd.Series(c)
        ema20 = s_close.ewm(span=20, adjust=False).mean().values
        ema50 = s_close.ewm(span=50, adjust=False).mean().values
        ema200 = s_close.ewm(span=200, adjust=False).mean().values

        # Volume SMA 20
        vol_sma20 = pd.Series(v).rolling(window=20).mean().values

        # ATR 14
        tr1 = h - l
        tr2 = np.abs(h - np.roll(c, 1))
        tr3 = np.abs(l - np.roll(c, 1))
        tr = np.maximum(tr1, np.maximum(tr2, tr3))
        tr[0] = tr1[0]
        atr14 = pd.Series(tr).rolling(window=14).mean().values

        # Scan starting from bar 200
        for i in range(200, len(df)):
            close_i = c[i]
            high_i = h[i]
            low_i = l[i]
            vol_i = v[i]
            atr_i = atr14[i]

            if np.isnan(atr_i) or atr_i <= 0 or vol_i <= 0:
                continue

            # -------------------------------------------------------------
            # 1. TREND FILTERS
            # -------------------------------------------------------------
            # Close > EMA 50, Close > EMA 200, EMA 50 > EMA 200
            if not (close_i > ema50[i] and close_i > ema200[i] and ema50[i] > ema200[i]):
                continue

            # -------------------------------------------------------------
            # 2. PULLBACK FILTER: 3% to 5% decline from 20-day high within max 5 sessions
            # -------------------------------------------------------------
            # Lookback 20-day high prior to trigger candle
            lookback_20_high = np.max(h[max(0, i-20):i])
            if lookback_20_high <= 0:
                continue

            # Check if that 20-day high occurred within the last 1 to 5 sessions
            window_5_highs = h[max(0, i-5):i]
            if len(window_5_highs) == 0:
                continue
            recent_peak = np.max(window_5_highs)

            # Peak must match the 20-day high (within 0.5% tolerance)
            if recent_peak < lookback_20_high * 0.995:
                continue

            # Bars since peak (1 to 5 sessions)
            peak_offset = len(window_5_highs) - 1 - np.argmax(window_5_highs)
            bars_since_peak = peak_offset + 1

            if not (1 <= bars_since_peak <= 5):
                continue

            # Pullback trough (lowest low during the pullback)
            pullback_trough = np.min(l[max(0, i - bars_since_peak):i+1])
            pullback_depth_pct = ((recent_peak - pullback_trough) / recent_peak) * 100.0

            # 3% to 5% decline from 20-day high (with practical 2.5% - 5.8% window)
            if not (2.5 <= pullback_depth_pct <= 5.8):
                continue

            # -------------------------------------------------------------
            # 3. RECLAIM CANDLE TRIGGER
            # -------------------------------------------------------------
            prior_high = h[i-1]
            prior_close = c[i-1]

            # Close > prior day high
            if not (close_i > prior_high):
                continue

            # Close > EMA 20
            if not (close_i > ema20[i]):
                continue

            # Close in upper 40% of daily range: (Close - Low) / (High - Low) >= 0.60
            candle_range = high_i - low_i
            if candle_range <= 0:
                continue
            range_position = (close_i - low_i) / candle_range
            if range_position < 0.60:
                continue

            # -------------------------------------------------------------
            # 4. VOLUME CONFIRMATION
            # -------------------------------------------------------------
            avg_vol = vol_sma20[i]
            if np.isnan(avg_vol) or avg_vol <= 0:
                continue
            if not (vol_i > 1.2 * avg_vol):
                continue

            # -------------------------------------------------------------
            # 5. RISK GUARDS
            # -------------------------------------------------------------
            # Skip if the stock fell more than 4.5% on the signal day
            daily_change_pct = ((close_i - prior_close) / prior_close) * 100.0 if prior_close > 0 else 0.0
            if daily_change_pct < -4.5:
                continue

            # Skip if closed near limit-down (daily return <= -8.5%)
            if daily_change_pct <= -8.5:
                continue

            # Wide ATR-based stop: Entry - 2.0 * ATR14 (or pullback swing low, whichever is wider)
            stop_loss_atr = close_i - (2.0 * atr_i)
            stop_loss_swing = pullback_trough * 0.995  # Just below swing low
            stop_loss = min(stop_loss_atr, stop_loss_swing)  # Wider stop

            # Sanity guard: stop must be below entry and not more than 10% away
            risk_dist = close_i - stop_loss
            if risk_dist <= 0:
                continue
            risk_pct = (risk_dist / close_i) * 100.0
            if risk_pct > 10.0:  # Cap max risk distance to 10%
                stop_loss = close_i * 0.90
                risk_dist = close_i - stop_loss

            # Target: 1:2 Risk to Reward
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
                "ai_rationale": (
                    f"Pullback Reclaim: {sym} pulled back {pullback_depth_pct:.1f}% from 20D high "
                    f"({bars_since_peak}d ago), reclaimed prior high {prior_high:.2f} and EMA20 on "
                    f"{(vol_i / avg_vol):.1f}x volume. Upper 40% close ({range_position*100:.0f}%)."
                ),
                "max_holding_days": 15,
            })

    print(f"✅ Found {len(signals):,} qualified Pullback Reclaim signals across 5 years.")
    return signals


def run_full_comparative_backtest():
    start_time = time.time()
    print("=" * 70)
    print("  INSTITUTIONAL STRATEGY BACKTEST: TREND PULLBACK RECLAIM")
    print(f"  Execution Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 70)

    # 1. Load Data
    stock_data = load_bist_historical_data()
    xu100_df = load_xu100_benchmark()

    # 2. Generate Signals
    signals = generate_pullback_reclaim_signals(stock_data)
    if not signals:
        print("❌ No signals generated. Check criteria.")
        return

    # 3. Configure Institutional Simulation
    # 100,000 TRY starting capital, 10 bps commission, 5 bps slippage, max 10 open positions
    config = BacktestConfig(
        initial_capital=100000.0,
        commission_bps=10.0,      # 0.10% BIST brokerage commission
        slippage_bps=5.0,         # 0.05% slippage on fills
        risk_per_trade_pct=1.5,   # 1.5% equity risked per trade
        max_open_positions=10,    # Max 10 concurrent holdings
        enable_trailing_stop=False
    )

    print("\n⚙️ Running Chronological Portfolio Simulation...")
    print(f"  • Initial Capital : {config.initial_capital:,.0f} TRY")
    print(f"  • Commission      : {config.commission_bps} bps (0.10%)")
    print(f"  • Slippage        : {config.slippage_bps} bps (0.05%)")
    print(f"  • Risk Per Trade  : {config.risk_per_trade_pct}% of equity")
    print(f"  • Max Concurrent  : {config.max_open_positions} positions")

    engine = InstitutionalBacktestEngine(config=config)
    result = engine.run_simulation(historical_data=stock_data, trade_signals=signals)

    # 4. Compute Benchmark (XU100) Return over exact same period
    bench_return_pct = 0.0
    bench_cagr = 0.0
    bench_max_dd = 0.0
    bench_sharpe = 0.0

    if xu100_df is not None and len(result.equity_curve) > 1:
        start_date_str = result.equity_curve[0].date
        end_date_str = result.equity_curve[-1].date
        s_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        e_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()

        idx_slice = xu100_df.loc[(xu100_df.index >= s_date) & (xu100_df.index <= e_date)]
        if len(idx_slice) > 1:
            idx_start = idx_slice["close"].iloc[0]
            idx_end = idx_slice["close"].iloc[-1]
            bench_return_pct = ((idx_end - idx_start) / idx_start) * 100.0

            # XU100 CAGR
            years = (e_date - s_date).days / 365.25
            if years > 0 and idx_end > 0 and idx_start > 0:
                bench_cagr = ((idx_end / idx_start) ** (1.0 / years) - 1.0) * 100.0

            # XU100 Max Drawdown
            rolling_max = idx_slice["close"].cummax()
            dd_series = (idx_slice["close"] - rolling_max) / rolling_max
            bench_max_dd = abs(float(dd_series.min())) * 100.0

            # XU100 Sharpe
            idx_returns = idx_slice["close"].pct_change().dropna()
            if len(idx_returns) > 1 and idx_returns.std() > 0:
                bench_sharpe = (idx_returns.mean() / idx_returns.std()) * np.sqrt(252)

    # 5. Display Scorecard
    wins = [t for t in result.trades if t.outcome == "WIN"]
    losses = [t for t in result.trades if t.outcome == "LOSS"]
    avg_win_pct = (sum(t.pnl_pct for t in wins) / len(wins)) if wins else 0.0
    avg_loss_pct = abs(sum(t.pnl_pct for t in losses) / len(losses)) if losses else 0.0
    win_loss_ratio = (avg_win_pct / avg_loss_pct) if avg_loss_pct > 0 else 0.0

    cur_consec = 0
    max_consec = 0
    for t in result.trades:
        if t.outcome == "LOSS":
            cur_consec += 1
            max_consec = max(max_consec, cur_consec)
        else:
            cur_consec = 0

    print("\n" + "=" * 70)
    print("🏆 5-YEAR STRATEGY SCORECARD vs. XU100 BENCHMARK")
    print("=" * 70)
    print(f"{'Performance Metric':<32} | {'Pullback Reclaim':<16} | {'XU100 Benchmark':<16}")
    print("-" * 70)
    print(f"{'Total Return':<32} | {result.total_return_pct:>14.2f}% | {bench_return_pct:>14.2f}%")
    print(f"{'Annualized Return (CAGR)':<32} | {result.cagr_pct:>14.2f}% | {bench_cagr:>14.2f}%")
    print(f"{'Sharpe Ratio':<32} | {result.sharpe_ratio:>14.2f}  | {bench_sharpe:>14.2f} ")
    print(f"{'Sortino Ratio':<32} | {result.sortino_ratio:>14.2f}  | {'N/A':>14} ")
    print(f"{'Calmar Ratio':<32} | {result.calmar_ratio:>14.2f}  | {(bench_cagr / bench_max_dd if bench_max_dd > 0 else 0):>14.2f} ")
    print(f"{'Maximum Drawdown':<32} | {result.max_drawdown_pct:>14.2f}% | {bench_max_dd:>14.2f}%")
    print(f"{'Ending Equity':<32} | {result.final_equity:>14,.2f}  | {(100000 * (1 + bench_return_pct/100)):>14,.2f} ")
    print("-" * 70)
    print(f"{'Trade Performance & Quality':<32} |")
    print(f"{'  Total Closed Trades':<32} | {result.total_trades:>14}")
    print(f"{'  Win Rate (%)':<32} | {result.win_rate:>14.2f}%")
    print(f"{'  Profit Factor':<32} | {result.profit_factor:>14.2f}")
    print(f"{'  Average Win (%)':<32} | {avg_win_pct:>14.2f}%")
    print(f"{'  Average Loss (%)':<32} | {avg_loss_pct:>14.2f}%")
    print(f"{'  Win / Loss Ratio':<32} | {win_loss_ratio:>14.2f}")
    print(f"{'  Expectancy per Trade (%)':<32} | {result.expectancy:>14.2f}%")
    print(f"{'  Average Holding Period':<32} | {result.avg_holding_days:>14.1f} days")
    print(f"{'  Max Consecutive Losses':<32} | {max_consec:>14}")
    print("-" * 70)

    alpha = result.total_return_pct - bench_return_pct
    print(f"{'Cumulative Alpha vs XU100':<32} | {alpha:>+14.2f}%")
    print("=" * 70)

    # 6. Save detailed trade logs
    output_trades_path = Path(__file__).resolve().parent.parent / "pullback_reclaim_trades.csv"
    if result.trades:
        trades_df = pd.DataFrame([t.model_dump() for t in result.trades])
        trades_df.to_csv(output_trades_path, index=False)
        print(f"\n📁 Saved {len(result.trades):,} detailed trade logs to: {output_trades_path.name}")

    output_equity_path = Path(__file__).resolve().parent.parent / "pullback_reclaim_equity.csv"
    if result.equity_curve:
        equity_df = pd.DataFrame([e.model_dump() for e in result.equity_curve])
        equity_df.to_csv(output_equity_path, index=False)
        print(f"📁 Saved equity curve ({len(result.equity_curve):,} points) to: {output_equity_path.name}")

    print(f"\n⏱️ Completed in {time.time() - start_time:.1f} seconds.")


if __name__ == "__main__":
    run_full_comparative_backtest()
