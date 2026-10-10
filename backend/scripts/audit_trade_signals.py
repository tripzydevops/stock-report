"""
Audit all trade signals in Supabase for holding horizon feasibility,
limit-up reachability under BIST +9.99% daily limits, target inverted order,
and extreme/bogus R:R ratios.
"""
import math
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.database import get_supabase_client

def run_audit():
    sb = get_supabase_client()
    res = sb.table('trade_signals').select('*, assets(symbol, name, market)').execute()
    signals = res.data or []

    anomalies = []
    for s in signals:
        sym = s.get('assets', {}).get('symbol') or s.get('asset_id')
        market = s.get('assets', {}).get('market', 'BIST')
        entry = float(s.get('entry_price') or 0)
        stop = float(s.get('stop_loss') or 0) if s.get('stop_loss') else None
        t1 = float(s.get('target_1') or 0) if s.get('target_1') else None
        t2 = float(s.get('target_2') or 0) if s.get('target_2') else None
        rr = float(s.get('risk_reward_ratio') or 0) if s.get('risk_reward_ratio') else None
        status = s.get('status')
        strategy = s.get('strategy')
        
        issues = []
        if entry <= 0:
            issues.append('Zero/negative entry price')
        if stop and stop >= entry:
            issues.append(f'Stop ({stop}) >= Entry ({entry})')
        if t1 and t1 <= entry:
            issues.append(f'Target 1 ({t1}) <= Entry ({entry})')
        if t1 and t2 and t1 > t2:
            issues.append(f'Target 1 ({t1}) > Target 2 ({t2}) [INVERTED]')
        if rr and rr > 10:
            issues.append(f'Absurd R:R ({rr})')
            
        if entry > 0 and t1 and t1 > entry:
            ratio = t1 / entry
            sessions_needed = math.ceil(math.log(ratio) / math.log(1.0999))
            gain_pct = (ratio - 1) * 100
            
            # Holding horizon for swing trading is <= 20 sessions (1 month)
            # Under BIST +9.99% ceiling rule, any target requiring > 10 sessions of consecutive limit-up is suspicious,
            # and > 15 sessions is virtually impossible.
            if sessions_needed > 10:
                issues.append(f'Unreachable target (+{gain_pct:.1f}%, min {sessions_needed} limit-up sessions)')
            elif gain_pct > 30 and strategy in ['mean_reversion', 'trend_pullback']:
                issues.append(f'{strategy} target too high (+{gain_pct:.1f}%)')
                
        if issues:
            anomalies.append({
                'id': s.get('id'),
                'symbol': sym,
                'strategy': strategy,
                'signal_date': s.get('signal_date'),
                'entry': entry,
                'stop': stop,
                'target_1': t1,
                'target_2': t2,
                'rr': rr,
                'status': status,
                'issues': issues
            })

    print(f"Total trade signals in database: {len(signals)}")
    print(f"Total anomalies flagged: {len(anomalies)}")
    
    open_anomalies = [a for a in anomalies if a['status'] == 'open']
    print(f"Open (Active) anomalies: {len(open_anomalies)}")
    
    for a in anomalies:
        status_tag = f"[{a['status'].upper()}]"
        print("--------------------------------------------------")
        print(f"{status_tag} {a['symbol']} ({a['strategy']}) on {a['signal_date']}")
        print(f"  ID: {a['id']}")
        print(f"  Entry: {a['entry']}, Stop: {a['stop']}, Target 1: {a['target_1']}, T2: {a['target_2']}, R:R: {a['rr']}")
        for iss in a['issues']:
            print(f"  [WARN] {iss}")

if __name__ == '__main__':
    run_audit()
