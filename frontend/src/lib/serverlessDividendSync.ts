import { getServerSupabase } from './supabaseServer';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const DEFAULT_DIVIDEND_CHAMPIONS = [
  // BIST Dividend Champions & REITs
  'FROTO.IS', 'BIMAS.IS', 'TCELL.IS', 'ISMEN.IS', 'TURSG.IS', 'TTRAK.IS',
  'DOAS.IS', 'CCOLA.IS', 'KCHOL.IS', 'BRSAN.IS', 'AKBNK.IS', 'EREGL.IS',
  'SISE.IS', 'TRGYO.IS', 'EKGYO.IS', 'AEFES.IS', 'AGHOL.IS', 'KRDMD.IS',
  'HALKB.IS', 'VAKBN.IS', 'YKBNK.IS', 'PETKM.IS', 'TOASO.IS', 'ASELS.IS',
  'ALGYO.IS', 'ISGYO.IS', 'MGROS.IS', 'SOKM.IS',
  // US High-Yield, Monthly & Dividend Growth Champions
  'KO', 'O', 'SCHD', 'JEPI', 'JEPQ', 'VICI', 'VOO', 'VNQ', 'VYM', 'PEP', 'JNJ', 'PG', 'MCD', 'MAIN', 'AAPL', 'MSFT'
];

export interface DividendSyncResult {
  success: boolean;
  auditedCount: number;
  upcomingCount: number;
  upsertedCount: number;
  upcomingEvents: Array<{
    symbol: string;
    exDate: string;
    paymentDate: string | null;
    rate: number | null;
    currency: string;
  }>;
  errors: string[];
  durationMs: number;
}

export async function syncServerlessDividends(customSymbols?: string[]): Promise<DividendSyncResult> {
  const startTime = Date.now();
  const supabase = getServerSupabase();
  const errors: string[] = [];

  // 1. Collect all active portfolio symbols from database
  const activeSymbols = new Set<string>();
  try {
    const { data: posData } = await supabase
      .from('portfolio_positions')
      .select('assets(symbol)')
      .eq('is_open', true);

    if (posData) {
      for (const row of posData) {
        const sym = (row as any)?.assets?.symbol;
        if (sym) {
          activeSymbols.add(sym.toUpperCase());
        }
      }
    }
  } catch (err: any) {
    console.warn('[DividendSync] Could not fetch portfolio positions:', err.message);
  }

  // 2. Fetch assets table map for ID resolution
  const assetIdMap = new Map<string, string>();
  try {
    const { data: assets } = await supabase
      .from('assets')
      .select('id, symbol');
    if (assets) {
      for (const a of assets) {
        const clean = a.symbol.replace('.IS', '').toUpperCase();
        assetIdMap.set(clean, a.id);
        assetIdMap.set(a.symbol.toUpperCase(), a.id);
      }
    }
  } catch (err: any) {
    console.warn('[DividendSync] Could not fetch assets map:', err.message);
  }

  // Combine targets
  const targetSymbols = customSymbols && customSymbols.length > 0
    ? customSymbols
    : Array.from(new Set([...Array.from(activeSymbols), ...DEFAULT_DIVIDEND_CHAMPIONS]));

  const todayStr = new Date().toISOString().slice(0, 10);
  const rowsToUpsert: any[] = [];
  const upcomingEvents: any[] = [];

  // 3. Query Yahoo Finance quoteSummary for calendarEvents and summaryDetail
  for (const sym of targetSymbols) {
    const cleanSym = sym.replace('.IS', '').toUpperCase();
    const isBist = sym.endsWith('.IS') || sym.length === 5;
    const tickerSym = isBist && !sym.endsWith('.IS') ? `${sym}.IS` : sym;
    const currency = isBist ? 'TRY' : 'USD';

    try {
      const summary = await yf.quoteSummary(tickerSym, {
        modules: ['calendarEvents', 'summaryDetail']
      });

      const cal = summary?.calendarEvents;
      const detail = summary?.summaryDetail;

      const exDateObj = cal?.exDividendDate || detail?.exDividendDate;
      const exDateStr = exDateObj ? new Date(exDateObj).toISOString().slice(0, 10) : null;

      const payDateObj = cal?.dividendDate;
      let payDateStr = payDateObj ? new Date(payDateObj).toISOString().slice(0, 10) : null;

      // If exDate is upcoming (>= today)
      if (exDateStr && exDateStr >= todayStr) {
        // If payDate is missing, default to T+2 business days
        if (!payDateStr) {
          const d = new Date(exDateStr);
          d.setDate(d.getDate() + 2);
          payDateStr = d.toISOString().slice(0, 10);
        }

        const rate = detail?.dividendRate || null;
        const assetId = assetIdMap.get(cleanSym) || assetIdMap.get(tickerSym) || null;

        rowsToUpsert.push({
          asset_id: assetId,
          symbol: tickerSym,
          ex_date: exDateStr,
          payment_date: payDateStr,
          amount: rate || 0,
          currency: currency,
          frequency: isBist ? 'Semi-Annual' : 'Quarterly',
          is_confirmed: true,
          source: 'YAHOO_LIVE'
        });

        upcomingEvents.push({
          symbol: cleanSym,
          exDate: exDateStr,
          paymentDate: payDateStr,
          rate: rate,
          currency: currency
        });
      }
    } catch (err: any) {
      // Non-critical: some symbols may lack dividend calendar entries
      errors.push(`${tickerSym}: ${err.message || 'fetch_failed'}`);
    }
  }

  // 4. Batch upsert into asset_dividends in Supabase
  let upsertedCount = 0;
  if (rowsToUpsert.length > 0) {
    try {
      // Upsert using (symbol, ex_date) conflict key if available, or check existing
      for (const row of rowsToUpsert) {
        const { data: existing } = await supabase
          .from('asset_dividends')
          .select('id')
          .eq('symbol', row.symbol)
          .eq('ex_date', row.ex_date)
          .limit(1);

        if (existing && existing.length > 0) {
          await supabase
            .from('asset_dividends')
            .update({
              payment_date: row.payment_date,
              amount: row.amount > 0 ? row.amount : undefined,
              is_confirmed: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing[0].id);
          upsertedCount++;
        } else {
          const { error: insErr } = await supabase
            .from('asset_dividends')
            .insert(row);
          if (!insErr) upsertedCount++;
        }
      }
    } catch (dbErr: any) {
      errors.push(`Database upsert error: ${dbErr.message}`);
    }
  }

  return {
    success: true,
    auditedCount: targetSymbols.length,
    upcomingCount: upcomingEvents.length,
    upsertedCount,
    upcomingEvents,
    errors,
    durationMs: Date.now() - startTime
  };
}
