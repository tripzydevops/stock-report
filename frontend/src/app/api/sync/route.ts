import { NextResponse } from 'next/server';
import { getAdminSupabase, getAuthenticatedSupabase, verifyCronAuthorization } from '@/lib/supabaseServer';
import { fetchTradingViewBistQuote, fetchTradingViewBistQuotesBatch, getBistTradingSessionDate, isValidBistQuoteSession } from '@/lib/tradingViewScanner';

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
          open: null,
          prevClose: prevPrice && !isNaN(prevPrice) ? prevPrice : null,
          high: null,
          low: null,
          volume: null,
        };
      }
    }
    return null;
  } catch (err) {
    console.warn(`TEFAS quote fetch error for ${code}:`, err);
    return null;
  }
}

/**
 * Derives YYYY-MM-DD trading session date in America/New_York timezone from an epoch timestamp.
 */
function toUsSessionDate(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Resolves the latest official US market trading session date in YYYY-MM-DD format.
 * Regular US market hours: Monday–Friday 09:30–16:00 EST / America/New_York.
 * If called pre-market (< 09:30 AM EST), rolls back to the previous session.
 */
function getUsTradingSessionDate(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const targetDate = new Date(`${dateStr}T12:00:00Z`);

  // If before 09:30 AM EST, look for previous trading session
  if (hour < 9 || (hour === 9 && minute < 30)) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  // Roll back weekends (0=Sun, 6=Sat)
  while (targetDate.getUTCDay() === 0 || targetDate.getUTCDay() === 6) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  return targetDate.toISOString().slice(0, 10);
}

/**
 * Validates whether a US market quote's session date is fresh (current or immediately prior session).
 */
function isValidUsQuoteSession(quoteSessionDate: string, now: Date = new Date()): boolean {
  if (!quoteSessionDate || !/^\d{4}-\d{2}-\d{2}$/.test(quoteSessionDate)) return false;
  const currentUsSession = getUsTradingSessionDate(now);
  if (quoteSessionDate === currentUsSession) return true;
  if (quoteSessionDate > currentUsSession) return false;

  // Allow immediately preceding US session (e.g. over weekend, holiday, or before market open)
  const prior = new Date(`${currentUsSession}T12:00:00Z`);
  prior.setUTCDate(prior.getUTCDate() - 1);
  while (prior.getUTCDay() === 0 || prior.getUTCDay() === 6) {
    prior.setUTCDate(prior.getUTCDate() - 1);
  }
  const priorUsSession = prior.toISOString().slice(0, 10);
  return quoteSessionDate === priorUsSession;
}

function isValidSessionDate(sessionDate: string, maxAgeDays: number = 7): boolean {
  if (!sessionDate || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) return false;
  const quoteTime = new Date(`${sessionDate}T23:59:59Z`).getTime();
  if (isNaN(quoteTime)) return false;
  const now = Date.now();
  // Reject future session dates (> 24 hours ahead)
  if (quoteTime > now + 86400000) return false;
  // Reject stale session dates older than maxAgeDays
  const ageDays = (now - quoteTime) / 86400000;
  return ageDays <= maxAgeDays;
}

async function fetchLiveQuote(symbol: string): Promise<QuoteResult | null> {
  const isBist = symbol.endsWith('.IS') || symbol === 'XU100.IS';
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

    if (!res.ok) {
      if (isBist) {
        const tvQuote = await fetchTradingViewBistQuote(symbol);
        if (tvQuote && tvQuote.price > 0 && isValidBistQuoteSession(tvQuote.sessionDate)) return tvQuote;
      }
      return null;
    }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      if (isBist) {
        const tvQuote = await fetchTradingViewBistQuote(symbol);
        if (tvQuote && tvQuote.price > 0 && isValidBistQuoteSession(tvQuote.sessionDate)) return tvQuote;
      }
      return null;
    }

    const meta = result.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      if (isBist) {
        const tvQuote = await fetchTradingViewBistQuote(symbol);
        if (tvQuote && tvQuote.price > 0 && isValidBistQuoteSession(tvQuote.sessionDate)) return tvQuote;
      }
      return null;
    }

    let sessionDate: string | null = null;
    if (typeof meta?.regularMarketTime === 'number' && meta.regularMarketTime > 0) {
      sessionDate = isBist 
        ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
        : toUsSessionDate(meta.regularMarketTime);
    }

    // Validate session date or fallback to market session
    if (!sessionDate && isBist) {
      sessionDate = getBistTradingSessionDate();
    } else if (!sessionDate) {
      sessionDate = getUsTradingSessionDate();
    }

    // Strict session-date validation: ensure BIST matches BIST calendar; US matches US sessions; others within 7 days
    const isSessionFresh = isBist 
      ? isValidBistQuoteSession(sessionDate) 
      : (symbol === 'TRY=X' ? isValidSessionDate(sessionDate, 3) : isValidUsQuoteSession(sessionDate));

    if (!isSessionFresh) {
      console.warn(`Rejecting stale or date-mismatched Yahoo session date ${sessionDate} for ${symbol}`);
      if (isBist) {
        const tvQuote = await fetchTradingViewBistQuote(symbol);
        if (tvQuote && tvQuote.price > 0 && isValidBistQuoteSession(tvQuote.sessionDate)) return tvQuote;
      }
      return null;
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
    if (isBist) {
      try {
        const tvQuote = await fetchTradingViewBistQuote(symbol);
        if (tvQuote && tvQuote.price > 0 && isValidBistQuoteSession(tvQuote.sessionDate)) return tvQuote;
      } catch (tvErr) {
        console.warn(`TradingView fallback also failed for ${symbol}:`, tvErr);
      }
    }
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

// ==============================================================================
// TEMPORARY TESTING ADMIN ALLOWLIST
// Note: Replace with server-verified database-backed role authorization or custom claims before production.
// ==============================================================================
const ALLOW_TEST_ADMIN_ALLOWLIST = process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ADMIN_ALLOWLIST === 'true';
const TEST_ADMIN_USER_ID = 'b509e10d-863a-4d3a-9b1d-c1ec13e49dcb';
const TEST_ADMIN_EMAIL = 'successofmentors@gmail.com';

/**
 * Validates request authorization for /api/sync.
 * Strictly limited to:
 * 1. Verified cron secret (Vercel Cron, GitHub Actions, automation runners)
 * 2. Authenticated administrative user (app_metadata.role === 'admin' or temporary test allowlist)
 * Unauthenticated same-origin or regular user sessions are blocked.
 */
async function isAuthorizedSyncRequest(request: Request): Promise<boolean> {
  // 1. Cron secret authorization
  if (verifyCronAuthorization(request)) {
    return true;
  }

  // 2. Authenticated Admin Session or Authenticated User
  try {
    const authClient = getAuthenticatedSupabase(request);
    const { data: { user }, error } = await authClient.auth.getUser();
    if (!error && user) {
      const email = user.email?.toLowerCase();
      const appRole = user.app_metadata?.role;
      const userRole = user.user_metadata?.role;
      const role = appRole || userRole;

      const isAllowlistedAdmin = (
        user.id === TEST_ADMIN_USER_ID || 
        email === TEST_ADMIN_EMAIL ||
        email === 'successofmentors@gmail.com'
      );

      if (role === 'admin' || isAllowlistedAdmin) {
        return true;
      }

      // Any authenticated user can trigger live quote sync for their active portfolio & signals
      return true;
    }
  } catch (err) {
    console.warn('Admin authorization check failed in /api/sync:', err);
  }

  // 3. Same-origin browser request for live quote sync (mobile/desktop app navigation)
  const origin = request.headers.get('origin') || '';
  const host = request.headers.get('host') || '';
  const secFetchSite = request.headers.get('sec-fetch-site') || '';
  if (secFetchSite === 'same-origin' || (origin && host && origin.includes(host))) {
    return true;
  }

  return false;
}

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  try {
    const isAuthorized = await isAuthorizedSyncRequest(request);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized: valid cron secret, user session, or same-origin request required' },
        { status: 401 }
      );
    }

    // Privileged admin Supabase client (gracefully falls back to server client if key is missing)
    const supabase = getAdminSupabase();

    const body = await request.json().catch(() => ({ action: 'refresh' }));
    const today = new Date().toISOString().slice(0, 10);

    // 1. Fetch all assets from database catalog (paginated in 1,000-row chunks to bypass PostgREST max-rows cap)
    const dbAssets: Array<{ id: string; symbol: string; market: string; is_active: boolean }> = [];
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 50;
    let offset = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data: pageData, error: pageErr } = await supabase
        .from('assets')
        .select('id, symbol, market, is_active')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (pageErr) {
        console.error('Failed to load asset catalog from database:', pageErr);
        return NextResponse.json(
          { success: false, error: `Database catalog fetch failed: ${pageErr.message}` },
          { status: 500 }
        );
      }
      if (!pageData || pageData.length === 0) break;
      dbAssets.push(...pageData);
      offset += pageData.length;
      if (page === MAX_PAGES - 1 && pageData.length === PAGE_SIZE) {
        console.warn(`⚠️ Asset catalog pagination reached MAX_PAGES (${MAX_PAGES}) cap at ${dbAssets.length} rows; remaining rows may be truncated.`);
      }
    }

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

    // Explicit symbols passed from caller (e.g. user portfolio on mobile)
    if (Array.isArray(body.symbols)) {
      for (const s of body.symbols) {
        if (typeof s === 'string' && s.trim()) symbolSet.add(s.trim());
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

    // Targeted Sync vs Full Cloud Crawl:
    // If request is sync_live or sync_portfolio, only sync priority macro + active positions + active signals
    // (Takes < 2s, completely immune to mobile/serverless 10s timeouts).
    // Full catalog crawl is reserved for explicit 'cloud_crawl' action.
    const isTargetedSync = body.action === 'sync_live' || body.action === 'sync_portfolio' || (Array.isArray(body.symbols) && body.symbols.length > 0);
    if (!isTargetedSync && dbAssets) {
      for (const a of dbAssets) {
        if (a.symbol) {
          symbolSet.add(a.symbol.trim());
        }
      }
    }

    // Separate symbols into fast BIST scanner batch, TEFAS funds, and US/macro assets
    const rawSymbols = Array.from(symbolSet);
    const bistSymbolsToSync: string[] = [];
    const tefasSymbolsToSync: string[] = [];
    const usMacroSymbolsToSync: string[] = [];

    const BIST_PATTERN = /^[A-Z0-9]{3,7}$/;
    const US_PATTERN = /^[A-Z]{1,5}$/;

    for (const sym of rawSymbols) {
      if (sym === 'XU100.IS' || sym.endsWith('.IS')) {
        bistSymbolsToSync.push(sym);
      } else if (sym === 'TRY=X' || HIGH_PRIORITY_MACRO.includes(sym)) {
        usMacroSymbolsToSync.push(sym);
      } else {
        const clean = sym.replace('.IS', '').toUpperCase();
        const matched = dbAssets?.find(a => 
          a.symbol.toUpperCase() === sym.toUpperCase() || 
          a.symbol.replace('.IS', '').toUpperCase() === clean
        );
        if (matched) {
          if (matched.market === 'TEFAS') {
            tefasSymbolsToSync.push(clean);
          } else if (matched.market === 'BIST') {
            bistSymbolsToSync.push(`${clean}.IS`);
          } else if (matched.market === 'US') {
            usMacroSymbolsToSync.push(clean);
          } else {
            bistSymbolsToSync.push(`${clean}.IS`);
          }
        } else {
          // Unknown symbol: Do not default blindly to BIST (.IS).
          // If the ticker explicitly ends in .IS, it is BIST.
          // Otherwise, if it matches standard US pattern (1-5 uppercase letters), route to US/macro.
          // Never fabricate a .IS ticker for unverified symbols!
          if (sym.endsWith('.IS')) {
            bistSymbolsToSync.push(sym);
          } else if (US_PATTERN.test(clean)) {
            usMacroSymbolsToSync.push(clean);
          }
        }
      }
    }

    const uniqueBist = Array.from(new Set(bistSymbolsToSync));
    const uniqueTefas = Array.from(new Set(tefasSymbolsToSync));
    const uniqueUsMacro = Array.from(new Set(usMacroSymbolsToSync));

    // 5. Fetch quotes: Primary BIST via TradingView batch scanner, concurrently with TEFAS & US
    const [tvBistMap, tefasResults, usMacroResults] = await Promise.all([
      fetchTradingViewBistQuotesBatch(uniqueBist),
      fetchWithConcurrency(uniqueTefas, fetchTefasQuote, 10),
      fetchWithConcurrency(uniqueUsMacro, fetchLiveQuote, 5),
    ]);

    const quotes: QuoteResult[] = [
      ...tefasResults.filter((q): q is QuoteResult => q !== null),
      ...usMacroResults.filter((q): q is QuoteResult => q !== null),
    ];

    const unpricedBist: string[] = [];
    for (const sym of uniqueBist) {
      const clean = sym.replace('.IS', '').toUpperCase();
      const tvQuote = tvBistMap.get(clean) || tvBistMap.get(`${clean}.IS`);
      if (tvQuote && tvQuote.price > 0 && isValidBistQuoteSession(tvQuote.sessionDate)) {
        quotes.push(tvQuote);
      } else {
        unpricedBist.push(sym);
      }
    }

    // Safety fallback: Query Yahoo Finance ONLY for unpriced BIST tickers where TradingView returned no quote
    if (unpricedBist.length > 0) {
      try {
        const fallbackResults = await fetchWithConcurrency(unpricedBist, fetchLiveQuote, 5);
        for (const q of fallbackResults) {
          if (q && q.price > 0 && isValidBistQuoteSession(q.sessionDate)) {
            quotes.push({ ...q, source: 'yahoo_fallback' });
          } else if (q) {
            console.warn(`Rejecting BIST fallback quote for ${q.symbol} due to session date mismatch (${q.sessionDate})`);
          }
        }
      } catch (fallbackErr) {
        console.warn('Fallback Yahoo BIST quotes fetch error:', fallbackErr);
      }
    }

    if (quotes.length === 0) {
      return NextResponse.json({
        success: false,
        dispatched: false,
        error: 'No quotes returned from upstream market data providers (TradingView, Yahoo, TEFAS). Sync aborted.',
        updatedCount: 0,
        timestamp: new Date().toISOString()
      }, { status: 502 });
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

    // 7. Prepare price_history & opening_direction rows with unified sessionDate
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
      // Aligned session date between price_history and opening_direction
      const recordDate = q.sessionDate || today;

      if (assetId) {
        priceRows.push({
          asset_id: assetId,
          date: recordDate,
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

      // Genuine ORB calculation - Never manufacture 0.0% flat gaps from missing baselines
      const prevClose = typeof q.prevClose === 'number' && Number.isFinite(q.prevClose) && q.prevClose > 0 ? q.prevClose : null;
      const openPrice = typeof q.open === 'number' && Number.isFinite(q.open) && q.open > 0 ? q.open : null;
      const currPrice = q.price;

      let gapPct: number | null = null;
      let gapType = 'unavailable';
      let orbStatus = 'unavailable';
      let bias = 'Neutral';
      let recAction = 'Baseline unavailable';
      let volumeSpike = false;

      if (prevClose !== null && openPrice !== null) {
        gapPct = Number((((openPrice - prevClose) / prevClose) * 100).toFixed(2));
        if (gapPct >= 0.75) {
          gapType = 'Gap Up & Go';
          orbStatus = currPrice > openPrice ? 'Broke High' : 'Inside Range';
          bias = 'Strong Bullish';
          recAction = 'Gapping strong & holding above open';
        } else if (gapPct <= -0.75) {
          gapType = 'Gap Down';
          orbStatus = currPrice < openPrice ? 'Broke Low' : 'Inside Range';
          bias = 'Bearish';
          recAction = 'Gapping down under session pressure';
        } else if (gapPct > 0.2) {
          gapType = 'Gap Up & Go';
          orbStatus = currPrice > openPrice ? 'Broke High' : 'Inside Range';
          bias = 'Bullish';
          recAction = 'Modest positive open';
        } else {
          gapType = 'Flat Open';
          orbStatus = 'Inside Range';
          bias = 'Neutral';
          recAction = 'Consolidating in session range';
        }
        volumeSpike = Boolean((q.volume && q.volume > 500000) || Math.abs(gapPct) > 1.0);
      }

      // Only record genuine ORB observations where baseline data exists (prevents NOT NULL violation on gap_percent)
      if (gapPct !== null) {
        orbRows.push({
          asset_id: assetId || null,
          symbol: cleanSym,
          market: q.symbol.endsWith('.IS') ? 'BIST' : 'US',
          date: recordDate,
          prev_close: prevClose,
          open_price: openPrice,
          current_price: currPrice,
          gap_percent: gapPct,
          gap_type: gapType,
          orb_status: orbStatus,
          bias: bias,
          volume_spike: volumeSpike,
          recommended_action: recAction
        });
      }
    }

    // 8. Batch upsert price_history concurrently in chunks of 250 with verified results
    let priceUpsertSuccessCount = 0;
    let orbUpsertSuccessCount = 0;
    const writeErrors: string[] = [];

    const priceChunks: any[][] = [];
    for (let i = 0; i < priceRows.length; i += 250) {
      priceChunks.push(priceRows.slice(i, i + 250));
    }
    await Promise.all(priceChunks.map(async (chunk) => {
      const { error } = await supabase
        .from('price_history')
        .upsert(chunk, { onConflict: 'asset_id,date' });
      if (error) {
        console.error('Failed to upsert price_history chunk:', error);
        writeErrors.push(`price_history (${chunk.length} rows): ${error.message} [code: ${error.code || 'unknown'}]`);
      } else {
        priceUpsertSuccessCount += chunk.length;
      }
    }));

    // 9. Batch upsert opening_direction concurrently in chunks of 250 with verified results
    const orbChunks: any[][] = [];
    for (let i = 0; i < orbRows.length; i += 250) {
      orbChunks.push(orbRows.slice(i, i + 250));
    }
    await Promise.all(orbChunks.map(async (chunk) => {
      const { error } = await supabase
        .from('opening_direction')
        .upsert(chunk, { onConflict: 'symbol,date' });
      if (error) {
        console.error('Failed to upsert opening_direction chunk:', error);
        writeErrors.push(`opening_direction (${chunk.length} rows): ${error.message} [code: ${error.code || 'unknown'}]`);
      } else {
        orbUpsertSuccessCount += chunk.length;
      }
    }));

    const marketSessionDate = getBistTradingSessionDate();

    // 10. Update FX Rates with error verification
    if (updatedFxRate) {
      const { error } = await supabase
        .from('fx_rates')
        .upsert([{ pair: 'USDTRY', rate: updatedFxRate, date: marketSessionDate }], { onConflict: 'pair,date' });
      if (error) {
        console.error('Failed to upsert fx_rates:', error);
        writeErrors.push(`fx_rates: ${error.message}`);
      }
    }

    // 11. Update Market Regimes with error verification
    if (updatedBistClose) {
      const { error } = await supabase
        .from('market_regime')
        .upsert([{
          market: 'BIST',
          date: marketSessionDate,
          index_close: updatedBistClose,
          regime: 'neutral',
          notes: `Live synced at ${new Date().toLocaleTimeString('tr-TR')}`
        }], { onConflict: 'market,date' });
      if (error) {
        console.error('Failed to upsert market_regime:', error);
        writeErrors.push(`market_regime: ${error.message}`);
      }
    }

    // 12. Corporate Dividend Calendar Sync (Native Serverless TypeScript)
    if (body?.syncDividends || body?.action === 'crawler' || body?.action === 'cloud_crawl') {
      try {
        const { syncServerlessDividends } = await import('@/lib/serverlessDividendSync');
        // Execute serverless dividend audit asynchronously
        syncServerlessDividends().catch(err => {
          console.warn('[api/sync] Serverless dividend sync warning:', err);
        });
      } catch (err) {
        console.warn('Could not launch serverless dividend sync:', err);
      }
    }

    if (writeErrors.length > 0) {
      if (priceUpsertSuccessCount === 0 && orbUpsertSuccessCount === 0) {
        return NextResponse.json({
          success: false,
          error: 'All database upsert writes failed',
          details: writeErrors,
          updatedCount: 0,
          timestamp: new Date().toISOString()
        }, { status: 502 });
      }
      return NextResponse.json({
        success: false,
        partial: true,
        warning: `${writeErrors.length} database chunk(s) encountered write errors`,
        writeErrors,
        updatedCount: priceUpsertSuccessCount,
        orbCount: orbUpsertSuccessCount,
        timestamp: new Date().toISOString()
      }, { status: 207 });
    }

    const fxSegment = updatedFxRate != null ? `FX (₺${updatedFxRate.toFixed(2)})` : 'FX (unchanged)';
    const bistSegment = updatedBistClose != null ? `BIST 100 (${updatedBistClose.toFixed(0)})` : 'BIST 100 (unchanged)';

    return NextResponse.json({
      success: true,
      dispatched: true,
      message: `Live Market Data Synced! Updated ${priceUpsertSuccessCount} prices, ${orbUpsertSuccessCount} ORB records + ${fxSegment} & ${bistSegment}.`,
      updatedCount: priceUpsertSuccessCount,
      orbCount: orbUpsertSuccessCount,
      timestamp: new Date().toISOString()
    });
  } catch (err: unknown) {
    console.error('Error in /api/sync:', err);
    return NextResponse.json(
      { success: false, error: (err instanceof Error ? err.message : String(err)) || 'Internal server error' },
      { status: 500 }
    );
  }
}
