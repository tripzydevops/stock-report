import { getServerSupabase } from './supabaseServer';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export function toIstanbulCalendarDate(val: string | Date): string {
  try {
    const d = new Date(val);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
  } catch {
    return String(val).slice(0, 10);
  }
}

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
  dueDividendsSettled?: DividendCreditSummary;
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
        modules: ['calendarEvents', 'summaryDetail', 'defaultKeyStatistics']
      });

      const cal = summary?.calendarEvents;
      const detail = summary?.summaryDetail;
      const stats = summary?.defaultKeyStatistics;

      const exDateObj = cal?.exDividendDate || detail?.exDividendDate;
      const exDateStr = exDateObj ? new Date(exDateObj).toISOString().slice(0, 10) : null;

      const payDateObj = cal?.dividendDate;
      let payDateStr = payDateObj ? new Date(payDateObj).toISOString().slice(0, 10) : null;

      // If exDate is upcoming (>= today)
      if (exDateStr && exDateStr >= todayStr) {
        // Determine frequency and payout divisor
        const isMonthlyUS = ['O', 'JEPI', 'JEPQ', 'MAIN'].includes(cleanSym);
        const frequency = isBist ? 'Semi-Annual' : (isMonthlyUS ? 'Monthly' : 'Quarterly');
        const freqDiv = isBist ? 2 : (isMonthlyUS ? 12 : 4);

        // If payDate is missing:
        if (!payDateStr) {
          const d = new Date(exDateStr);
          if (isBist) {
            // T+2 business days for BIST Takasbank settlement
            const dayOfWeek = d.getDay(); // 0 is Sun, 4 is Thu, 5 is Fri
            const addDays = (dayOfWeek === 4) ? 4 : (dayOfWeek === 5) ? 4 : 2;
            d.setDate(d.getDate() + addDays);
          } else {
            // US dividends typically pay ~14-21 days after ex-date
            d.setDate(d.getDate() + 14);
          }
          payDateStr = d.toISOString().slice(0, 10);
        }

        // Priority 7: Use the provider's declared single cash distribution whenever available
        // (defaultKeyStatistics.lastDividendValue represents the actual single cash payout per share)
        let dps: number | null = null;
        let isConfirmed = false;

        if (stats?.lastDividendValue && stats.lastDividendValue > 0) {
          dps = Number(Number(stats.lastDividendValue).toFixed(4));
          isConfirmed = Boolean(payDateObj);
        } else if (detail?.dividendRate && detail.dividendRate > 0) {
          // Fallback: estimate single payment from annualized forward rate
          dps = Number((detail.dividendRate / freqDiv).toFixed(4));
          isConfirmed = false; // Mark estimated: do not fabricate certainty from an annualized aggregate
        }

        const assetId = assetIdMap.get(cleanSym) || assetIdMap.get(tickerSym) || null;

        rowsToUpsert.push({
          asset_id: assetId,
          symbol: tickerSym,
          ex_date: exDateStr,
          payment_date: payDateStr,
          amount: dps || 0,
          currency: currency,
          frequency: frequency,
          is_confirmed: isConfirmed,
          source: isConfirmed ? 'YAHOO_CONFIRMED' : 'YAHOO_ESTIMATED'
        });

        upcomingEvents.push({
          symbol: cleanSym,
          exDate: exDateStr,
          paymentDate: payDateStr,
          rate: dps,
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

  // 5. Automatically credit any due dividends directly to cash ledger
  let dueDividendsSettled: DividendCreditSummary | undefined;
  try {
    dueDividendsSettled = await processDueDividendsToCashLedger();
  } catch (settleErr: any) {
    errors.push(`Auto-credit dividends warning: ${settleErr.message}`);
  }

  return {
    success: true,
    auditedCount: targetSymbols.length,
    upcomingCount: upcomingEvents.length,
    upsertedCount,
    upcomingEvents,
    dueDividendsSettled,
    errors,
    durationMs: Date.now() - startTime
  };
}

export interface DividendCreditSummary {
  processedCount: number;
  creditedCount: number;
  creditedTransfers: Array<{
    userId: string;
    symbol: string;
    shares: number;
    amountPerShare: number;
    totalAmount: number;
    currency: string;
    paymentDate: string;
  }>;
  skippedCount: number;
  errors: string[];
}

/**
 * Idempotently evaluates all open portfolio positions against confirmed asset_dividends.
 * If payment_date <= today and the user held the stock on ex_date, credits cash directly
 * as a 'DIVIDEND' transfer into portfolio_transfers without altering invested capital.
 */
export async function processDueDividendsToCashLedger(): Promise<DividendCreditSummary> {
  const supabase = getServerSupabase();
  const todayStr = new Date().toISOString().slice(0, 10);
  const summary: DividendCreditSummary = {
    processedCount: 0,
    creditedCount: 0,
    creditedTransfers: [],
    skippedCount: 0,
    errors: []
  };

  try {
    // 1. Fetch all open positions with positive quantity
    const { data: positions, error: posErr } = await supabase
      .from('portfolio_positions')
      .select('id, user_id, portfolio_id, asset_id, quantity, entry_date, is_open, assets(id, symbol)')
      .eq('is_open', true)
      .gt('quantity', 0);

    if (posErr || !positions || positions.length === 0) {
      if (posErr) summary.errors.push(`Positions fetch error: ${posErr.message}`);
      return summary;
    }

    // 2. Fetch all dividends where payment_date <= todayStr
    const { data: dividends, error: divErr } = await supabase
      .from('asset_dividends')
      .select('id, asset_id, symbol, ex_date, payment_date, amount, currency, is_confirmed')
      .lte('payment_date', todayStr)
      .gt('amount', 0);

    if (divErr || !dividends || dividends.length === 0) {
      if (divErr) summary.errors.push(`Dividends fetch error: ${divErr.message}`);
      return summary;
    }

    // 3. Fetch existing DIVIDEND transfers to guarantee idempotency
    const { data: existingTransfers, error: transErr } = await supabase
      .from('portfolio_transfers')
      .select('id, user_id, notes, transfer_date')
      .eq('transfer_type', 'DIVIDEND');

    if (transErr) {
      summary.errors.push(`Transfers fetch error: ${transErr.message}`);
      return summary;
    }

    const existingTags = new Set<string>();
    if (existingTransfers) {
      for (const t of existingTransfers) {
        if (t.notes) {
          // Parse 3-part tag: [DIVIDEND:<portfolio_id>:<symbol>:<ex_date>]
          const match3 = t.notes.match(/\[DIVIDEND:([A-Za-z0-9._-]+):([A-Za-z0-9._]+):([0-9-]+)\]/);
          if (match3) {
            existingTags.add(`${t.user_id}:${match3[1]}:${match3[2].toUpperCase()}:${match3[3]}`);
          } else {
            // Parse legacy 2-part tag: [DIVIDEND:<symbol>:<ex_date>]
            const match2 = t.notes.match(/\[DIVIDEND:([A-Za-z0-9._]+):([0-9-]+)\]/);
            if (match2) {
              existingTags.add(`${t.user_id}:${match2[1].toUpperCase()}:${match2[2]}`);
              existingTags.add(`${t.user_id}:default:${match2[1].toUpperCase()}:${match2[2]}`);
            }
          }
        }
      }
    }

    // 3.1 Fetch corporate actions for positions to dynamically adjust historical order quantities
    const distinctSymbols = Array.from(new Set(
      positions.map(p => ((p as any)?.assets?.symbol || '').replace('.IS', '').toUpperCase()).filter(Boolean)
    ));
    const { data: corporateActions } = await supabase
      .from('corporate_actions')
      .select('symbol, action_type, split_ratio, effective_date')
      .in('symbol', distinctSymbols);

    // 4. Match positions against due dividends
    for (const pos of positions) {
      summary.processedCount++;
      const posSymbol = ((pos as any)?.assets?.symbol || '').toUpperCase();
      const cleanSym = posSymbol.replace('.IS', '');
      const userId = pos.user_id;
      const portfolioKey = pos.portfolio_id || 'default';

      const matchingDivs = dividends.filter(d => {
        const dSym = (d.symbol || '').replace('.IS', '').toUpperCase();
        return (d.asset_id && d.asset_id === pos.asset_id) || (cleanSym && dSym === cleanSym);
      });

      for (const div of matchingDivs) {
        const divCleanSym = (div.symbol || cleanSym).replace('.IS', '').toUpperCase();
        const exDate = div.ex_date;
        const payDate = div.payment_date || todayStr;
        const tagKey = `${userId}:${portfolioKey}:${divCleanSym}:${exDate}`;

        // Rule A: Check if already credited (also check legacy un-scoped key if default/null portfolio)
        if (existingTags.has(tagKey) || (!pos.portfolio_id && existingTags.has(`${userId}:${divCleanSym}:${exDate}`))) {
          summary.skippedCount++;
          continue;
        }

        // Rule B: Calculate exact entitled shares on ex-date with Istanbul timezone normalization:
        // Sum of all Filled BUYs executed before ex-date minus sum of all Filled SELLs executed before ex-date,
        // dynamically adjusted for any forward/reverse splits or bonus share issuances occurring between order and ex-date.
        let orderQuery = supabase
          .from('portfolio_orders')
          .select('side, quantity, executed_at, portfolio_id')
          .eq('user_id', userId)
          .eq('symbol', divCleanSym)
          .eq('status', 'Filled');

        if (pos.portfolio_id) {
          orderQuery = orderQuery.eq('portfolio_id', pos.portfolio_id);
        }

        const { data: userOrders } = await orderQuery.order('executed_at', { ascending: true });

        let entitledShares = 0;
        const hasAnyOrderHistory = Boolean(userOrders && userOrders.length > 0);

        if (hasAnyOrderHistory) {
          // Strict ledger calculation: when order history exists, it is the sole source of truth.
          for (const ord of userOrders!) {
            const ordDateIstanbul = toIstanbulCalendarDate(ord.executed_at);
            // In BIST and NYSE, shares must be purchased and settled before ex-date
            if (ordDateIstanbul < exDate) {
              let adjustedQty = Number(ord.quantity) || 0;

              // Apply Corporate Actions Engine adjustment formula: q_i* = q_i * product(R_k)
              if (corporateActions && corporateActions.length > 0) {
                for (const ca of corporateActions) {
                  if (ca.symbol === divCleanSym && ca.effective_date >= ordDateIstanbul && ca.effective_date < exDate) {
                    const ratio = Number(ca.split_ratio) || 1.0;
                    adjustedQty *= ratio;
                  }
                }
              }

              if (ord.side === 'BUY') entitledShares += adjustedQty;
              else if (ord.side === 'SELL') entitledShares -= adjustedQty;
            }
          }
        } else {
          // Legacy position fallback: ONLY used when zero order history exists for this symbol/user
          const entryDateStr = pos.entry_date ? toIstanbulCalendarDate(pos.entry_date) : '';
          if (!entryDateStr || entryDateStr < exDate) {
            entitledShares = Number(pos.quantity) || 0;
          }
        }

        entitledShares = Math.max(0, Number(entitledShares.toFixed(4)));
        if (entitledShares <= 0) {
          summary.skippedCount++;
          continue;
        }

        const rate = Number(div.amount) || 0;
        const totalAmount = Number((entitledShares * rate).toFixed(2));

        if (totalAmount <= 0) {
          summary.skippedCount++;
          continue;
        }

        const currency = div.currency || (divCleanSym.endsWith('.IS') || div.symbol?.endsWith('.IS') ? 'TRY' : 'USD');
        const noteTag = `[DIVIDEND:${portfolioKey}:${divCleanSym}:${exDate}]`;

        const { error: insErr } = await supabase
          .from('portfolio_transfers')
          .insert({
            user_id: userId,
            portfolio_id: pos.portfolio_id || null,
            transfer_type: 'DIVIDEND',
            amount: totalAmount,
            currency: currency,
            transfer_date: payDate,
            notes: `Nakit Temettü: ${divCleanSym} (${entitledShares} adet @ ₺${rate}) ${noteTag}`
          });

        if (insErr) {
          // If already credited in database (unique index on user_id + dividend tag), count as skipped
          if (insErr.message.includes('portfolio_transfers_user_dividend_tag_idx') || insErr.message.includes('duplicate key')) {
            summary.skippedCount++;
            existingTags.add(tagKey);
            continue;
          }
          summary.errors.push(`Failed to insert dividend transfer for ${divCleanSym}: ${insErr.message}`);
        } else {
          existingTags.add(tagKey);
          summary.creditedCount++;
          summary.creditedTransfers.push({
            userId,
            symbol: divCleanSym,
            shares: entitledShares,
            amountPerShare: rate,
            totalAmount,
            currency,
            paymentDate: payDate
          });
        }
      }
    }
  } catch (err: any) {
    summary.errors.push(`Unexpected error: ${err.message || String(err)}`);
  }

  return summary;
}
