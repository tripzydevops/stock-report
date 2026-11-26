import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateDividendUpsert } from './dividendPrecedence.mjs';

export interface IncomingDividendRow {
  asset_id?: string | null;
  symbol: string;
  ex_date: string;
  payment_date: string | null;
  amount: number;
  currency: string;
  frequency: string;
  is_confirmed: boolean;
  source: string;
}

export interface UpsertDividendResult {
  action: 'INSERT' | 'UPDATE' | 'SKIP' | 'ERROR';
  reason: string;
  error?: string;
}

/**
 * Centralized dividend persistence boundary.
 * Enforces exact canonical source precedence, gross/net cash-ledger safety,
 * and confirmed-record downgrade protection across all writers.
 */
export async function upsertDividendEvent(
  supabase: SupabaseClient,
  incoming: IncomingDividendRow
): Promise<UpsertDividendResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from('asset_dividends')
    .select('id, is_confirmed, source, amount')
    .eq('symbol', incoming.symbol)
    .eq('ex_date', incoming.ex_date)
    .limit(1);

  if (fetchErr) {
    return { action: 'ERROR', reason: 'fetch_existing_failed', error: fetchErr.message };
  }

  const prev = existing && existing.length > 0 ? existing[0] : null;
  const decision = evaluateDividendUpsert(prev, incoming);

  if (decision.action === 'SKIP') {
    return { action: 'SKIP', reason: decision.reason };
  }

  if (decision.action === 'UPDATE' && prev) {
    const { error: updErr } = await supabase
      .from('asset_dividends')
      .update(decision.payload!)
      .eq('id', prev.id);

    if (updErr) {
      return { action: 'ERROR', reason: 'update_failed', error: updErr.message };
    }
    return { action: 'UPDATE', reason: decision.reason };
  }

  const { error: insErr } = await supabase
    .from('asset_dividends')
    .insert(decision.payload!);

  if (insErr) {
    return { action: 'ERROR', reason: 'insert_failed', error: insErr.message };
  }
  return { action: 'INSERT', reason: decision.reason };
}
