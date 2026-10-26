import os
import sys
import pandas as pd
import numpy as np
from pathlib import Path

backend_dir = Path("backend")
sys.path.insert(0, str(backend_dir))

from app.services.indicators import compute_all_indicators

def run_tests():
    excel_path = "MarketPulse_Latest.xlsx"
    df_raw = pd.read_excel(excel_path, sheet_name="📅 Price History")
    df_raw["Date"] = pd.to_datetime(df_raw["Date"])
    
    asset_data = {}
    for sym, sub in df_raw.groupby("Symbol"):
        sub = sub.sort_values("Date").reset_index(drop=True)
        sub = sub.set_index("Date")
        sub.columns = [c.lower() for c in sub.columns]
        if len(sub) >= 30 and "close" in sub.columns:
            asset_data[sym] = compute_all_indicators(sub)
            
    print(f"Loaded {len(asset_data)} assets.")
    
    # We will test 4 distinct models:
    # Model 1: BASELINE (All 4 strategies with standard stops)
    # Model 2: NO_MEAN_REVERSION (Only Momentum Breakout + Volatility Squeeze + Trend Pullback)
    # Model 3: STAGE2_ONLY (Breakout + Squeeze + Pullback, only when stock is in Stage 2 Uptrend: close > ema_50 & close > ema_200)
    # Model 4: CALIBRATED_TARGETS (Conservative Target 1 at 1.25x R:R so it hits much more frequently, raising win rate)
    
    models = ["BASELINE", "NO_MEAN_REVERSION", "STAGE2_UPTREND", "CONSERVATIVE_TARGET"]
    
    results = {}
    
    for model_name in models:
        trades = []
        for sym, df in asset_data.items():
            n_bars = len(df)
            if n_bars < 50:
                continue
                
            for i in range(50, n_bars - 1):
                sub_df = df.iloc[:i+1]
                last = sub_df.iloc[-1]
                close = last['close']
                atr = last.get('atr_14', close * 0.03)
                ema_50 = last.get('ema_50', 0)
                ema_200 = last.get('ema_200', 0)
                
                signals = []
                
                # Breakout
                prev_high_20 = sub_df['high'].shift(1).rolling(20).max().iloc[-1]
                vol_ratio = last.get('volume_ratio', 1.0)
                rsi = last.get('rsi_14', 50)
                
                is_stage2 = (ema_200 == 0 or close > ema_200) and (ema_50 == 0 or close > ema_50)
                
                if close > prev_high_20 and vol_ratio >= 1.35 and rsi > 52 and close > ema_50:
                    if model_name != "STAGE2_UPTREND" or is_stage2:
                        stop = round(close - (1.8 * atr), 2)
                        target_mult = 1.25 if model_name == "CONSERVATIVE_TARGET" else 2.0
                        target = round(close + target_mult * (close - stop), 2)
                        signals.append(("Momentum Breakout", close, stop, target, 12))
                        
                # Volatility Squeeze
                squeeze = (sub_df['bb_upper'] < sub_df['kc_upper']) & (sub_df['bb_lower'] > sub_df['kc_lower'])
                if len(squeeze) >= 2 and squeeze.iloc[-2] and not squeeze.iloc[-1]:
                    if last.get('macd_histogram', 0) > 0:
                        if model_name != "STAGE2_UPTREND" or is_stage2:
                            stop = last['kc_lower']
                            if stop >= close:
                                stop = close * 0.95
                            target_mult = 1.25 if model_name == "CONSERVATIVE_TARGET" else 2.0
                            target = round(close + target_mult * (close - stop), 2)
                            signals.append(("Volatility Squeeze", close, stop, target, 15))
                            
                # Trend Pullback
                if len(sub_df) >= 200:
                    prev = sub_df.iloc[-2]
                    near_20 = abs(close - last.get('ema_20', close)) / last.get('ema_20', close) <= 0.015
                    near_50 = abs(close - last.get('ema_50', close)) / last.get('ema_50', close) <= 0.015
                    is_stab = (close >= last.get('open', close) * 0.998) or (close >= prev['close'])
                    if close > ema_200 and (near_20 or near_50) and 40 <= rsi <= 55 and is_stab:
                        stop = round(min(last.get('ema_20', close), last.get('ema_50', close)) - (1.0 * atr), 2)
                        target = sub_df['high'].rolling(10).max().iloc[-1]
                        if target <= close * 1.03:
                            target = close + 1.8 * (close - stop)
                        if (target - close) / max(0.01, close - stop) >= 1.3 and stop < close:
                            signals.append(("Trend Pullback", close, stop, target, 20))
                            
                # Mean Reversion
                if model_name == "BASELINE":
                    bb_lower = last.get('bb_lower', 0)
                    is_oversold = (rsi <= 36) or (bb_lower > 0 and close <= bb_lower * 1.015)
                    has_bounce = (close >= last.get('open', close)) or (close > sub_df.iloc[-2]['close'])
                    if is_oversold and has_bounce and close > 0:
                        recent_low = min(last.get('low', close), sub_df.iloc[-2].get('low', close))
                        stop = max(recent_low * 0.98, close - (1.5 * atr))
                        target = max(last.get('ema_20', close), close + (2.0 * (close - stop)))
                        if (target - close) / max(0.01, close - stop) >= 1.5 and stop < close:
                            signals.append(("Mean Reversion", close, stop, target, 10))
                            
                for strat_name, entry_price, stop_loss, target_1, max_hold in signals:
                    future_df = df.iloc[i+1 : i+1 + max_hold]
                    if len(future_df) == 0:
                        continue
                        
                    nominal = 1000.0
                    shares = max(1, int(nominal / entry_price)) if entry_price <= 1100 else (nominal / entry_price)
                    
                    status = "EXPIRED"
                    exit_price = float(future_df.iloc[-1]["close"])
                    
                    for step, (f_date, f_bar) in enumerate(future_df.iterrows(), start=1):
                        f_high = float(f_bar.get("high", f_bar["close"]))
                        f_low = float(f_bar.get("low", f_bar["close"]))
                        
                        hit_stop = (f_low <= stop_loss)
                        hit_target = (f_high >= target_1)
                        
                        if hit_stop and hit_target:
                            status = "STOPPED_OUT"
                            exit_price = stop_loss
                            break
                        elif hit_target:
                            status = "TARGET_HIT"
                            exit_price = target_1
                            break
                        elif hit_stop:
                            status = "STOPPED_OUT"
                            exit_price = stop_loss
                            break
                            
                    pnl_tl = shares * (exit_price - entry_price)
                    pnl_pct = (exit_price - entry_price) / entry_price * 100.0
                    
                    trades.append({
                        "strategy": strat_name,
                        "pnl_tl": pnl_tl,
                        "pnl_pct": pnl_pct,
                        "is_win": pnl_tl > 0,
                        "status": status
                    })
                    
        df_res = pd.DataFrame(trades)
        wins = df_res[df_res["pnl_tl"] > 0]
        losses = df_res[df_res["pnl_tl"] < 0]
        wr = (len(wins) / len(df_res)) * 100
        total_pnl = df_res["pnl_tl"].sum()
        gw = wins["pnl_tl"].sum()
        gl = abs(losses["pnl_tl"].sum())
        pf = gw / gl if gl > 0 else 0
        
        print("\n" + "="*65)
        print(f" MODEL: {model_name}")
        print("="*65)
        print(f"Total Trades       : {len(df_res):,}")
        print(f"Win Rate           : {wr:.1f}% ({len(wins):,} wins / {len(losses):,} losses)")
        print(f"Target Hit Rate    : {(df_res['status']=='TARGET_HIT').mean()*100:.1f}%")
        print(f"Total Net PnL (TL) : +TL {total_pnl:,.2f}")
        print(f"Profit Factor      : {pf:.2f}")
        print(f"Avg Win %          : +{wins['pnl_pct'].mean():.2f}%")
        print(f"Avg Loss %         : {losses['pnl_pct'].mean():.2f}%")
        print(f"Payoff Ratio       : {abs(wins['pnl_pct'].mean() / losses['pnl_pct'].mean()):.2f}x")
        
        for strat, sdf in df_res.groupby("strategy"):
            s_w = sdf[sdf["pnl_tl"] > 0]
            s_l = sdf[sdf["pnl_tl"] < 0]
            s_wr = (len(s_w) / len(sdf)) * 100
            s_pf = s_w["pnl_tl"].sum() / abs(s_l["pnl_tl"].sum()) if len(s_l) > 0 and abs(s_l["pnl_tl"].sum()) > 0 else 0
            print(f"  {strat:20s}: {len(sdf):4d} trades | WR: {s_wr:5.1f}% | PF: {s_pf:4.2f} | Net PnL: TL {sdf['pnl_tl'].sum():8,.2f}")

if __name__ == "__main__":
    run_tests()
