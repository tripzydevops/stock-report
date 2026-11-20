"""
MarketPulse — Multi-Market Walk-Forward Backtesting & Confidence Calibration Runner
===================================================================================
Executes anchored/rolling walk-forward folds across BIST & US historical Parquet archives.
Calibrates strategy confidence scores from empirical out-of-sample performance.
"""

import sys
import os
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
import numpy as np

# Ensure backend root is on path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.models.schemas import BacktestConfig, WalkForwardReport
from app.services.indicators import compute_all_indicators
from app.services.walk_forward_engine import InstitutionalWalkForwardEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("run_walk_forward")


def load_archive_and_prepare(
    parquet_path: Path,
    max_symbols: int = 100,
    min_bars: int = 150
) -> dict[str, pd.DataFrame]:
    """Loads parquet archive, standardizes OHLCV frames, and precomputes technical indicators."""
    logger.info(f"Loading parquet archive from {parquet_path}...")
    if not parquet_path.exists():
        raise FileNotFoundError(f"Parquet archive not found at: {parquet_path}")

    raw_df = pd.read_parquet(parquet_path)
    logger.info(f"Loaded {len(raw_df):,} rows from archive. Preparing asset universes...")

    # Group by symbol
    symbols = raw_df["symbol"].unique()
    clean_history = {}

    # Rank symbols by bar count / volume to pick most liquid and consistent assets
    ranked_symbols = []
    for s in symbols:
        sub = raw_df[raw_df["symbol"] == s]
        if len(sub) >= min_bars:
            ranked_symbols.append((s, len(sub), sub["volume"].mean() if "volume" in sub else 0))

    # Sort by liquidity/bar count
    ranked_symbols.sort(key=lambda x: (x[1], x[2]), reverse=True)
    selected_symbols = [s[0] for s in ranked_symbols[:max_symbols]]
    logger.info(f"Selected top {len(selected_symbols)} most liquid assets (>= {min_bars} bars).")

    for sym in selected_symbols:
        sub = raw_df[raw_df["symbol"] == sym].copy()
        if "date" in sub.columns:
            sub["date"] = pd.to_datetime(sub["date"])
            sub.sort_values("date", inplace=True)
            sub.set_index("date", inplace=True)

        # Standardize columns
        sub.columns = [c.lower() for c in sub.columns]
        req_cols = ["open", "high", "low", "close", "volume"]
        if not all(col in sub.columns for col in req_cols):
            continue

        try:
            enriched = compute_all_indicators(sub)
            clean_history[sym] = enriched
        except Exception as e:
            logger.debug(f"Failed indicators for {sym}: {e}")

    logger.info(f"Successfully computed indicators for {len(clean_history)} active symbols.")
    return clean_history


def run_full_walk_forward(
    market: str = "BIST",
    max_symbols: int = 50,
    train_months: int = 18,
    test_months: int = 6,
    step_months: int = 6,
    tie_breaker: str = "pessimistic"
) -> WalkForwardReport:
    """Executes walk-forward backtest for a specific market archive."""
    data_dir = backend_dir.parent / "data" / "archives"
    file_map = {
        "BIST": data_dir / "bist_daily_5y.parquet",
        "US": data_dir / "us_daily_5y.parquet",
    }

    archive_path = file_map.get(market.upper())
    if not archive_path or not archive_path.exists():
        raise FileNotFoundError(f"Archive not found for {market}: {archive_path}")

    history = load_archive_and_prepare(archive_path, max_symbols=max_symbols)

    config = BacktestConfig(
        initial_capital=100_000.0,
        commission_bps=10.0,  # 0.10% commission per leg
        slippage_bps=5.0,     # 0.05% slippage per leg
        risk_per_trade_pct=1.5,
        max_open_positions=10,
        max_hold_days=20,
        tie_breaker=tie_breaker,
    )

    engine = InstitutionalWalkForwardEngine(config)
    report = engine.run_walk_forward_validation(
        clean_history=history,
        market=market,
        train_months=train_months,
        test_months=test_months,
        step_months=step_months,
    )

    return report


if __name__ == "__main__":
    target_market = sys.argv[1].upper() if len(sys.argv) > 1 else "BIST"
    n_syms = int(sys.argv[2]) if len(sys.argv) > 2 else 40

    logger.info(f"=== Starting Walk-Forward Backtesting for {target_market} ({n_syms} assets) ===")
    wf_report = run_full_walk_forward(market=target_market, max_symbols=n_syms)

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    # Save output to JSON first
    out_dir = backend_dir / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"walk_forward_{target_market.lower()}_report.json"
    with open(out_file, "w", encoding="utf-8") as fp:
        json.dump(wf_report.model_dump(), fp, indent=2)
    logger.info(f"Saved complete walk-forward report to {out_file}")

    print("\n" + "="*80)
    print(f" WALK-FORWARD VALIDATION SUMMARY - {wf_report.market}")
    print("="*80)
    print(f"Total Folds:             {wf_report.total_folds}")
    print(f"Total OOS Trades:        {wf_report.total_oos_trades}")
    print(f"OOS Realized Win Rate:   {wf_report.oos_win_rate:.1f}%")
    print(f"OOS Profit Factor:       {wf_report.oos_profit_factor:.2f}")
    print(f"OOS Trade Expectancy:    TRY {wf_report.oos_expectancy:,.2f}")
    print("-"*80)

    print("\n[ FOLD BREAKDOWN ]")
    for f in wf_report.folds:
        print(f"Fold #{f.fold_id} | Train [{f.train_start} -> {f.train_end}] "
              f"({f.train_trades} trades, {f.train_win_rate:.1f}% WR, PF: {f.train_profit_factor:.2f}) "
              f"--> Test [{f.test_start} -> {f.test_end}] "
              f"({f.test_trades} trades, {f.test_win_rate:.1f}% WR, PF: {f.test_profit_factor:.2f}, Return: {f.test_return_pct:+.1f}%)")

    print("\n[ STRATEGY OUT-OF-SAMPLE PERFORMANCE ]")
    print(f"{'Strategy':<26} | {'Trades':<7} | {'Win Rate':<9} | {'Profit Factor':<13} | {'Avg Return':<10} | {'Total PnL':<12}")
    print("-" * 85)
    for strat, m in wf_report.strategy_metrics.items():
        print(f"{strat:<26} | {m['trades']:<7} | {m['win_rate']:>6.1f}%   | {m['profit_factor']:>10.2f}    | {m['avg_return_pct']:>8.2f}%  | TRY {m['total_pnl']:>10,.2f}")

    print("\n[ CALIBRATED CONFIDENCE SCORES ]")
    print(f"{'Strategy':<28} | {'Calibrated Probability Score':<25}")
    print("-" * 60)
    for strat, conf in wf_report.calibrated_confidence_map.items():
        print(f"{strat:<28} | {conf:>6.1f}%")
    print("="*80 + "\n")

