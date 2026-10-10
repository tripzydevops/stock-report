"""
Remediate all flagged signals in Supabase:
1. Invalidate crash/taban signals (assets falling >= 4.5% or locked at taban on signal date).
2. Fix unfeasible targets using strict holding horizon reachability logic.
3. Clean up corrupted entries (e.g., TCELL with 0.0 entry).
"""
import sys
import os
import math
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.database import get_supabase_client

def remediate():
    sb = get_supabase_client()
    res = sb.table('trade_signals').select('*, assets(symbol, name, market)').execute()
    signals = res.data or []

    remediated_count = 0
    invalidated_count = 0

    for s in signals:
        sid = s.get('id')
        sym = s.get('assets', {}).get('symbol') or ''
        status = s.get('status')
        strategy = s.get('strategy')
        entry = float(s.get('entry_price') or 0)
        stop = float(s.get('stop_loss') or 0) if s.get('stop_loss') else None
        t1 = float(s.get('target_1') or 0) if s.get('target_1') else None
        t2 = float(s.get('target_2') or 0) if s.get('target_2') else None
        rr = float(s.get('risk_reward_ratio') or 0) if s.get('risk_reward_ratio') else None
        asset_id = s.get('asset_id')
        sig_date = s.get('signal_date')

        # Case 1: Corrupted entry price <= 0
        if entry <= 0:
            print(f"[INVALIDATING] {sym}: Invalid entry {entry}")
            sb.table('trade_signals').update({
                'status': 'invalidated',
                'closed_at': datetime.now(timezone.utc).isoformat(),
                'ai_rationale': 'SETUP INVALIDATED: Corrupted zero/negative entry price.'
            }).eq('id', sid).execute()
            invalidated_count += 1
            continue

        # Case 2: Fetch price history around signal date to check if it was crashing/taban
        p_res = sb.table('price_history').select('*').eq('asset_id', asset_id).lte('date', sig_date).order('date', desc=True).limit(2).execute()
        p_data = p_res.data or []
        
        is_crash = False
        pct_change = 0.0
        if len(p_data) >= 2:
            curr_bar = p_data[0]
            prev_bar = p_data[1]
            if prev_bar.get('close', 0) > 0:
                pct_change = ((curr_bar['close'] - prev_bar['close']) / prev_bar['close']) * 100
                rng = curr_bar.get('high', curr_bar['close']) - curr_bar.get('low', curr_bar['close'])
                # Locked at taban (limit-down) or circuit breaker dump <= -4.5%
                if pct_change <= -4.5 or (pct_change < 0 and rng == 0):
                    is_crash = True

        if is_crash and status == 'open':
            print(f"[INVALIDATING CRASH] {sym} on {sig_date}: Daily change {pct_change:.2f}% (Circuit breaker / Taban lock).")
            sb.table('trade_signals').update({
                'status': 'invalidated',
                'closed_at': datetime.now(timezone.utc).isoformat(),
                'ai_rationale': f'SETUP INVALIDATED: Asset plunged {pct_change:.2f}% on signal date (circuit breaker / limit-down). Mean reversion is prohibited during active crashes.'
            }).eq('id', sid).execute()
            invalidated_count += 1
            continue

        # Case 3: Fix targets for valid open setups that had detached lagging EMA targets
        needs_fix = False
        if entry > 0 and t1:
            ratio = t1 / entry
            sessions_needed = math.ceil(math.log(ratio) / math.log(1.0999))
            gain_pct = (ratio - 1) * 100
            
            if sessions_needed > 10 or (strategy == 'mean_reversion' and gain_pct > 25) or (rr and rr > 10):
                needs_fix = True

        if needs_fix and stop and stop < entry and status == 'open':
            risk = entry - stop
            # Realistic feasible swing targets under BIST +9.99% limits:
            # Target 1: 1.5x risk, capped at +15%
            new_t1 = round(min(entry * 1.15, entry + (1.5 * risk)), 2)
            # Target 2: 2.25x risk, capped at +25%
            new_t2 = round(min(entry * 1.25, max(new_t1 * 1.04, entry + (2.25 * risk))), 2)
            new_rr = round((new_t1 - entry) / risk, 2)

            print(f"[REMEDIATING TARGETS] {sym} ({strategy}): T1 {t1} -> {new_t1} (+{((new_t1/entry)-1)*100:.1f}%), T2 -> {new_t2}, R:R {rr} -> {new_rr}")
            sb.table('trade_signals').update({
                'target_1': new_t1,
                'target_2': new_t2,
                'risk_reward_ratio': new_rr,
                'ai_rationale': f'TARGET RE-ALIGNED: Calibrated to feasible holding horizon (+9.99% BIST ceiling). Target 1: {new_t1}, Target 2: {new_t2}, R:R: {new_rr}.'
            }).eq('id', sid).execute()
            remediated_count += 1

    print("==================================================")
    print(f"Remediation Complete! Invalidated: {invalidated_count}, Target Re-aligned: {remediated_count}")

if __name__ == '__main__':
    remediate()
