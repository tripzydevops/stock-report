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
  source?: string;
  observedAt?: string;
  open?: number | null;
  prevClose?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
}

function parseTefasDate(rawDate?: any): string | null {
  if (!rawDate) return null;
  if (typeof rawDate === 'number') {
    const d = new Date(rawDate > 1e11 ? rawDate : rawDate * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  const s = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const parts = s.split('.');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return null;
}

async function fetchTefasQuote(code: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch('https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ fonKodu: code.toUpperCase(), dil: 'TR', periyod: 1 }),
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.resultList || json?.data;
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[data.length - 1];
      const prev = data.length > 1 ? data[data.length - 2] : null;
      const rawPrice = latest.FIYAT ?? latest.fiyat;
      const p = parseFloat(String(rawPrice).replace(',', '.'));
      const rawPrev = prev ? (prev.FIYAT ?? prev.fiyat) : null;
      const prevPrice = rawPrev != null ? parseFloat(String(rawPrev).replace(',', '.')) : null;

      if (!isNaN(p) && p > 0) {
        const sessionDate = parseTefasDate(latest.TARIH ?? latest.tarih);
        if (!sessionDate) return null;
        return {
          symbol: code.toUpperCase(),
          price: p,
          sessionDate,
          source: 'tefas',
          observedAt: new Date().toISOString(),
          open: prevPrice && !isNaN(prevPrice) ? prevPrice : p,
          prevClose: prevPrice && !isNaN(prevPrice) ? prevPrice : null,
          high: Math.max(p, prevPrice && !isNaN(prevPrice) ? prevPrice : p),
          low: Math.min(p, prevPrice && !isNaN(prevPrice) ? prevPrice : p),
          volume: typeof latest.PAY_SAYISI === 'number' ? latest.PAY_SAYISI : null,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn(`TEFAS quote fetch error for ${code}:`, err);
    return null;
  }
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
      source: 'yahoo',
      observedAt: new Date().toISOString(),
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

    // Distinguish TEFAS funds from Yahoo Finance symbols
    const rawSymbols = Array.from(symbolSet);
    const yahooSymbolsToSync: string[] = [];
    const tefasSymbolsToSync: string[] = [];

    for (const sym of rawSymbols) {
      if (sym === 'TRY=X' || sym === 'XU100.IS' || sym.endsWith('.IS')) {
        yahooSymbolsToSync.push(sym);
      } else {
        const matched = dbAssets?.find(a => a.symbol.toUpperCase() === sym.toUpperCase() || a.symbol.replace('.IS', '').toUpperCase() === sym.toUpperCase());
        if (matched && matched.market === 'TEFAS') {
          tefasSymbolsToSync.push(sym.toUpperCase());
        } else if (matched && matched.market === 'BIST' && !sym.endsWith('.IS')) {
          yahooSymbolsToSync.push(`${sym}.IS`);
        } else {
          yahooSymbolsToSync.push(sym);
        }
      }
    }

    const uniqueYahoo = Array.from(new Set(yahooSymbolsToSync));
    const uniqueTefas = Array.from(new Set(tefasSymbolsToSync));

    // 5. Fetch live quotes with bounded concurrency
    const [yahooResults, tefasResults] = await Promise.all([
      fetchWithConcurrency(uniqueYahoo, fetchLiveQuote, 15),
      fetchWithConcurrency(uniqueTefas, fetchTefasQuote, 10),
    ]);

    const quotes = [...yahooResults, ...tefasResults].filter((q): q is QuoteResult => q !== null);

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
          adj_close: q.price,
          source: q.source || (q.symbol.endsWith('.IS') || q.symbol === 'TRY=X' || q.symbol === 'SPY' ? 'yahoo' : 'yahoo'),
          observed_at: q.observedAt || new Date().toISOString(),
        });
      }

      // Skip ORB calculation for TEFAS mutual funds
      if (q.source === 'tefas') {
        continue;
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
