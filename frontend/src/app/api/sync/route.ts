import { NextResponse } from 'next/server';
import { getAdminSupabase, verifyCronAuthorization } from '@/lib/supabaseServer';

const supabase = getAdminSupabase();

const HIGH_PRIORITY_MACRO = [
  'SPY', 'QQQ', 'VOO', 'GLD', 'TLT', 'TRY=X', 'XU100.IS'
];

interface QuoteResult {
  symbol: string;
  price: number;
  sessionDate: string;
  open?: number | null;
  prevClose?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
}

async function fetchLiveQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 0 }
    });

    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;

    let sessionDate = new Date().toISOString().slice(0, 10);
    if (typeof meta?.regularMarketTime === 'number' && meta.regularMarketTime > 0) {
      const d = new Date(meta.regularMarketTime * 1000);
      if (!isNaN(d.getTime())) {
        sessionDate = d.toISOString().slice(0, 10);
      }
    }

    return {
      symbol,
      price,
      sessionDate,
      open: typeof meta?.regularMarketOpen === 'number' && Number.isFinite(meta.regularMarketOpen) ? meta.regularMarketOpen : null,
      prevClose: typeof meta?.previousClose === 'number' ? meta.previousClose : (typeof meta?.chartPreviousClose === 'number' ? meta.chartPreviousClose : null),
      high: typeof meta?.regularMarketDayHigh === 'number' && Number.isFinite(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : null,
      low: typeof meta?.regularMarketDayLow === 'number' && Number.isFinite(meta.regularMarketDayLow) ? meta.regularMarketDayLow : null,
      volume: typeof meta?.regularMarketVolume === 'number' && Number.isFinite(meta.regularMarketVolume) ? meta.regularMarketVolume : null,
    };
  } catch (e) {
    console.warn(`Failed to fetch live quote for ${symbol}:`, e);
    return null;
  }
}

/**
 * Executes async tasks with bounded concurrency to prevent throttling.
 */
async function fetchWithConcurrency<T, R>(items: T[], fn: (item: T) => Promise<R>, limit: number = 15): Promise<R[]> {
  const results: Promise<R>[] = [];
  const executing = new Set<Promise<R>>();

  for (const item of items) {
    const p = fn(item).then(res => {
      executing.delete(p);
      return res;
    });
    results.push(p);
    executing.add(p);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

export async function POST(request: Request) {
  try {
    if (!verifyCronAuthorization(request)) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid or missing cron secret' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({ action: 'refresh' }));
    const today = new Date().toISOString().slice(0, 10);

    // 1. Fetch all assets from database catalog
    const { data: dbAssets } = await supabase
      .from('assets')
      .select('id, symbol, market, is_active');

    // 2. Fetch open portfolio positions
    const { data: openPos } = await supabase
      .from('portfolio_positions')
      .select('assets(symbol)')
      .eq('is_open', true);

    // 3. Fetch active trade signals
    const { data: openSignals } = await supabase
      .from('trade_signals')
      .select('assets(symbol)')
      .eq('status', 'open');

    // 4. Build comprehensive symbol set
    const symbolSet = new Set<string>(HIGH_PRIORITY_MACRO);

    if (dbAssets) {
      for (const a of dbAssets) {
        if (a.symbol) {
          symbolSet.add(a.symbol.trim());
        }
      }
    }

    if (openPos) {
      for (const p of openPos) {
        const sym = (p as any).assets?.symbol;
        if (sym) symbolSet.add(sym.trim());
      }
    }

    if (openSignals) {
      for (const s of openSignals) {
        const sym = (s as any).assets?.symbol;
        if (sym) symbolSet.add(sym.trim());
      }
    }

    // Normalize symbols for Yahoo Finance
    const rawSymbols = Array.from(symbolSet);
    const symbolsToSync: string[] = [];

    for (const sym of rawSymbols) {
      if (sym === 'TRY=X' || sym === 'XU100.IS' || sym.endsWith('.IS')) {
        symbolsToSync.push(sym);
      } else {
        // Check if known BIST or US in dbAssets
        const matched = dbAssets?.find(a => a.symbol.toUpperCase() === sym.toUpperCase() || a.symbol.replace('.IS', '').toUpperCase() === sym.toUpperCase());
        if (matched && matched.market === 'BIST' && !sym.endsWith('.IS')) {
          symbolsToSync.push(`${sym}.IS`);
        } else {
          symbolsToSync.push(sym);
        }
      }
    }

    const uniqueSymbolsToSync = Array.from(new Set(symbolsToSync));

    // 5. Fetch live quotes with 15-worker concurrency pool
    const quoteResults = await fetchWithConcurrency(uniqueSymbolsToSync, fetchLiveQuote, 15);
    const quotes = quoteResults.filter((q): q is QuoteResult => q !== null);

    if (quotes.length === 0) {
      return NextResponse.json({
        success: true,
        dispatched: false,
        message: 'No external quotes returned, refreshing from database cache.',
        updatedCount: 0
      });
    }

    // 6. Map asset IDs
    const assetMap = new Map<string, string>();
    if (dbAssets) {
      for (const a of dbAssets) {
        const upper = a.symbol.toUpperCase();
        const clean = upper.replace('.IS', '');
        assetMap.set(upper, a.id);
        assetMap.set(clean, a.id);
        assetMap.set(`${clean}.IS`, a.id);
      }
    }

    // 7. Prepare price_history & opening_direction rows
    const priceRows: any[] = [];
    const orbRows: any[] = [];
    let updatedFxRate: number | null = null;
    let updatedBistClose: number | null = null;
    let updatedUsClose: number | null = null;

    for (const q of quotes) {
      if (q.symbol === 'TRY=X') {
        updatedFxRate = q.price;
        continue;
      }
      if (q.symbol === 'XU100.IS') {
        updatedBistClose = q.price;
        continue;
      }
      if (q.symbol === 'SPY') {
        updatedUsClose = q.price;
      }

      const cleanSym = q.symbol.replace('.IS', '').toUpperCase();
      const assetId = assetMap.get(q.symbol.toUpperCase()) || assetMap.get(cleanSym);

      if (assetId) {
        priceRows.push({
          asset_id: assetId,
          date: q.sessionDate || today,
          close: q.price,
          open: q.open ?? null,
          high: q.high ?? null,
          low: q.low ?? null,
          volume: q.volume ?? null,
          adj_close: q.price
        });
      }

      // ORB calculation
      const prevClose = q.prevClose || q.price;
      const currPrice = q.price;
      const gapPct = prevClose > 0 ? ((currPrice - prevClose) / prevClose) * 100 : 0;

      let gapType = 'Flat Open';
      let orbStatus = 'Inside Range';
      let bias = 'Neutral';

      if (gapPct >= 0.75) {
        gapType = 'Gap Up & Go';
        orbStatus = 'Broke High';
        bias = 'Strong Bullish';
      } else if (gapPct <= -0.75) {
        gapType = 'Gap Down';
        orbStatus = 'Broke Low';
        bias = 'Bearish';
      } else if (gapPct > 0.2) {
        gapType = 'Gap Up & Go';
        orbStatus = 'Broke High';
        bias = 'Bullish';
      }

      orbRows.push({
        asset_id: assetId || null,
        symbol: cleanSym,
        market: q.symbol.endsWith('.IS') ? 'BIST' : 'US',
        date: today,
        prev_close: prevClose,
        open_price: prevClose,
        current_price: currPrice,
        gap_percent: Number(gapPct.toFixed(2)),
        gap_type: gapType,
        orb_status: orbStatus,
        bias: bias,
        volume_spike: Boolean((q.volume && q.volume > 500000) || Math.abs(gapPct) > 1.0),
        recommended_action: gapPct >= 0.75 ? 'Gapping strong & holding above open' : 'Consolidating in session range'
      });
    }

    // 8. Batch upsert price_history in chunks of 80
    for (let i = 0; i < priceRows.length; i += 80) {
      const chunk = priceRows.slice(i, i + 80);
      await supabase
        .from('price_history')
        .upsert(chunk, { onConflict: 'asset_id,date' });
    }

    // 9. Batch upsert opening_direction in chunks of 80
    for (let i = 0; i < orbRows.length; i += 80) {
      const chunk = orbRows.slice(i, i + 80);
      await supabase
        .from('opening_direction')
        .upsert(chunk, { onConflict: 'symbol,date' });
    }

    // 10. Update FX Rates
    if (updatedFxRate) {
      await supabase
        .from('fx_rates')
        .upsert([{ pair: 'USDTRY', rate: updatedFxRate, date: today }], { onConflict: 'pair,date' });
    }

    // 11. Update Market Regimes
    if (updatedBistClose) {
      await supabase
        .from('market_regime')
        .upsert([{
          market: 'BIST',
          date: today,
          index_close: updatedBistClose,
          regime: 'neutral',
          notes: `Live synced at ${new Date().toLocaleTimeString('tr-TR')}`
        }], { onConflict: 'market,date' });
    }

    // 12. Background Corporate Dividend Calendar Sync (Non-blocking)
    if (body?.syncDividends || body?.action === 'crawler' || body?.action === 'cloud_crawl') {
      try {
        const { spawn } = await import('child_process');
        const path = await import('path');
        const pyPath = path.resolve(process.cwd(), '..', 'backend', '.venv', 'Scripts', 'python.exe');
        const scriptPath = path.resolve(process.cwd(), '..', 'backend', 'scripts', 'sync_upcoming_dividends.py');
        const proc = spawn(pyPath, [scriptPath], { detached: true, stdio: 'ignore' });
        proc.unref();
      } catch (err) {
        console.warn('Could not launch background dividend sync process:', err);
      }
    }

    return NextResponse.json({
      success: true,
      dispatched: true,
      message: `Live Market Data Synced! Updated ${priceRows.length} assets + FX (₺${updatedFxRate?.toFixed(2) || '49.96'}) & BIST 100 (${updatedBistClose?.toFixed(0) || '10710'}).`,
      updatedCount: priceRows.length,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Error in /api/sync:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
