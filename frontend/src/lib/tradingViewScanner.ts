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

    const todayDate = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    for (const item of data) {
      const ticker = item?.s; // e.g. "BIST:THYAO"
      const values = item?.d; // [close, open, high, low, volume, change, change_abs]

      if (!ticker || !Array.isArray(values) || values.length < 5) continue;

      const rawClean = ticker.replace('BIST:', '').toUpperCase();
      const close = typeof values[0] === 'number' && Number.isFinite(values[0]) ? values[0] : null;
      if (close === null || close <= 0) continue;

      const open = typeof values[1] === 'number' && Number.isFinite(values[1]) ? values[1] : close;
      const high = typeof values[2] === 'number' && Number.isFinite(values[2]) ? values[2] : close;
      const low = typeof values[3] === 'number' && Number.isFinite(values[3]) ? values[3] : close;
      const volume = typeof values[4] === 'number' && Number.isFinite(values[4]) ? Math.round(values[4]) : 0;
      const changePct = typeof values[5] === 'number' && Number.isFinite(values[5]) ? values[5] : null;
      const changeAbs = typeof values[6] === 'number' && Number.isFinite(values[6]) ? values[6] : null;

      let prevClose: number | null = null;
      if (changeAbs !== null) {
        prevClose = Number((close - changeAbs).toFixed(2));
      } else if (changePct !== null && (1 + changePct / 100) > 0) {
        prevClose = Number((close / (1 + changePct / 100)).toFixed(2));
      } else {
        prevClose = close;
      }

      const quote: TradingViewQuoteResult = {
        symbol: `${rawClean}.IS`,
        price: close,
        sessionDate: todayDate,
        source: 'tradingview',
        observedAt: nowIso,
        open,
        high,
        low,
        volume,
        prevClose,
        changePct
      };

      resultMap.set(rawClean, quote);
      resultMap.set(`${rawClean}.IS`, quote);
    }
  } catch (err) {
    console.warn('Failed to query TradingView Turkey scanner API:', err);
  }

  return resultMap;
}
