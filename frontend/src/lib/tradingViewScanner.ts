/**
 * TradingView Turkey Scanner API Service
 * 
 * Provides delayed Borsa Istanbul (BIST) prices independent of Yahoo Finance.
 * Queries https://scanner.tradingview.com/turkey/scan
 */

export interface TradingViewQuoteResult {
  symbol: string;
  price: number;
  sessionDate: string;
  source: 'tradingview';
  observedAt: string;
  open: number | null;
  prevClose: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  changePct?: number | null;
  barCompleteness?: 'full_ohlcv' | 'partial_ohlcv' | 'close_only';
}

// Official Borsa Istanbul (BIST) Exchange Holidays (Closed Sessions) for 2025, 2026, and 2027
export const BIST_MARKET_HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-03-31", "2025-04-01", "2025-04-23", "2025-05-01",
  "2025-05-19", "2025-06-06", "2025-06-09", "2025-07-15", "2025-10-29",
  // 2026
  "2026-01-01", "2026-03-20", "2026-04-23", "2026-05-01", "2026-05-19",
  "2026-05-27", "2026-05-28", "2026-05-29", "2026-07-15", "2026-10-29",
  // 2027
  "2027-01-01", "2027-03-10", "2027-03-11", "2027-03-12", "2027-04-23",
  "2027-05-17", "2027-05-18", "2027-05-19", "2027-07-15", "2027-10-29",
]);

export function getBistTradingSessionDate(now: Date = new Date()): string {
  // Istanbul is UTC+3 (no DST since 2016)
  const istanbulTimeMs = now.getTime() + 3 * 60 * 60 * 1000;
  const trtDate = new Date(istanbulTimeMs);
  const hour = trtDate.getUTCHours();

  const targetDate = new Date(trtDate);

  // If before 10:00 AM TRT, look for previous trading session
  if (hour < 10) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  // Roll back past weekends (0=Sun, 6=Sat) and official BIST market holidays
  while (
    targetDate.getUTCDay() === 0 ||
    targetDate.getUTCDay() === 6 ||
    BIST_MARKET_HOLIDAYS.has(targetDate.toISOString().slice(0, 10))
  ) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  return targetDate.toISOString().slice(0, 10);
}

function normalizeToTvTicker(symbol: string): string {
  const clean = symbol.replace('.IS', '').trim().toUpperCase();
  return `BIST:${clean}`;
}

export async function fetchTradingViewBistQuote(symbol: string): Promise<TradingViewQuoteResult | null> {
  const results = await fetchTradingViewBistQuotesBatch([symbol]);
  return results.get(symbol.toUpperCase()) || results.get(symbol.replace('.IS', '').toUpperCase()) || null;
}

export async function fetchTradingViewBistQuotesBatch(
  symbols: string[]
): Promise<Map<string, TradingViewQuoteResult>> {
  const resultMap = new Map<string, TradingViewQuoteResult>();
  if (!symbols || symbols.length === 0) return resultMap;

  const validSymbols = symbols.filter(s => s && s.trim().length > 0);
  const tvTickers = validSymbols.map(normalizeToTvTicker);
  const uniqueTickers = Array.from(new Set(tvTickers));

  try {
    const res = await fetch('https://scanner.tradingview.com/turkey/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        symbols: { tickers: uniqueTickers },
        columns: ['close', 'open', 'high', 'low', 'volume', 'change', 'change_abs']
      }),
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 }
    });

    if (!res.ok) {
      console.warn(`TradingView scanner responded with status ${res.status}`);
      return resultMap;
    }

    const json = await res.json();
    const data = json?.data;
    if (!Array.isArray(data)) return resultMap;

    const sessionDate = getBistTradingSessionDate();
    const nowIso = new Date().toISOString();

    for (const item of data) {
      const ticker = item?.s; // e.g. "BIST:THYAO"
      const values = item?.d; // [close, open, high, low, volume, change, change_abs]

      if (!ticker || !Array.isArray(values) || values.length < 5) continue;

      const rawClean = ticker.replace('BIST:', '').toUpperCase();
      const close = typeof values[0] === 'number' && Number.isFinite(values[0]) ? values[0] : null;
      if (close === null || close <= 0) continue;

      // STRICT NULL PRESERVATION - Never fabricate OHLC from close or volume from 0
      const open = typeof values[1] === 'number' && Number.isFinite(values[1]) ? values[1] : null;
      const high = typeof values[2] === 'number' && Number.isFinite(values[2]) ? values[2] : null;
      const low = typeof values[3] === 'number' && Number.isFinite(values[3]) ? values[3] : null;
      const volume = typeof values[4] === 'number' && Number.isFinite(values[4]) ? Math.round(values[4]) : null;
      const changePct = typeof values[5] === 'number' && Number.isFinite(values[5]) ? values[5] : null;
      const changeAbs = typeof values[6] === 'number' && Number.isFinite(values[6]) ? values[6] : null;

      // Compute prevClose ONLY if real delta exists; otherwise leave as null
      let prevClose: number | null = null;
      if (changeAbs !== null) {
        prevClose = Number((close - changeAbs).toFixed(2));
      } else if (changePct !== null && (1 + changePct / 100) > 0) {
        prevClose = Number((close / (1 + changePct / 100)).toFixed(2));
      }

      const hasFullOhlc = open !== null && high !== null && low !== null;
      const barCompleteness: 'full_ohlcv' | 'partial_ohlcv' | 'close_only' =
        hasFullOhlc && volume !== null
          ? 'full_ohlcv'
          : (open === null && high === null && low === null ? 'close_only' : 'partial_ohlcv');

      const quote: TradingViewQuoteResult = {
        symbol: `${rawClean}.IS`,
        price: close,
        sessionDate,
        source: 'tradingview',
        observedAt: nowIso,
        open,
        high,
        low,
        volume,
        prevClose,
        changePct,
        barCompleteness,
      };

      resultMap.set(rawClean, quote);
      resultMap.set(`${rawClean}.IS`, quote);
    }
  } catch (err) {
    console.warn('Failed to query TradingView Turkey scanner API:', err);
  }

  return resultMap;
}
