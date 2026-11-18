/**
 * Enhanced Asset & ETF Search and Autocomplete Engine
 * Supports BIST stocks, US equities/ETFs, and TEFAS Mutual & Money Market funds.
 * Includes Turkish diacritic normalization and common alias mappings.
 */

export interface SearchableAsset {
  id?: string;
  symbol: string;
  name: string;
  market?: string;
  assetClass?: string;
  currency?: string;
  sector?: string;
  latestPrice?: number | null;
  dailyChangePercent?: number | null;
  isWatched?: boolean;
}

export const COMMON_ASSET_ALIASES: Record<string, string[]> = {
  // BIST Major Aliases
  THY: ['THYAO'],
  'TURK HAVA YOLLARI': ['THYAO'],
  'TURKISH AIRLINES': ['THYAO'],
  GARANTI: ['GARAN'],
  'GARANTI BBVA': ['GARAN'],
  'GARANTI BANKASI': ['GARAN'],
  ISBANK: ['ISCTR'],
  'IS BANKASI': ['ISCTR'],
  'İŞ BANKASI': ['ISCTR'],
  KOC: ['KCHOL'],
  'KOC HOLDING': ['KCHOL'],
  'KOÇ': ['KCHOL'],
  SABANCI: ['SAHOL'],
  'SABANCI HOLDING': ['SAHOL'],
  TUPRAS: ['TUPRS'],
  'TÜPRAŞ': ['TUPRS'],
  EREGLI: ['EREGL'],
  'EREĞLİ': ['EREGL'],
  ERDEMIR: ['EREGL'],
  BORUSAN: ['BRSAN', 'BRYAT'],
  'BORUSAN MANNESMANN': ['BRSAN'],
  'BORUSAN YATIRIM': ['BRYAT'],
  BRISA: ['BRISA'],
  SISICAM: ['SISE'],
  'ŞİŞECAM': ['SISE'],
  BIM: ['BIMAS'],
  'BİM': ['BIMAS'],
  ASELSAN: ['ASELS'],
  TURKCELL: ['TCELL'],
  'TÜRKCELL': ['TCELL'],
  TURKTELEKOM: ['TTKOM'],
  'TURK TELEKOM': ['TTKOM'],
  'TÜRK TELEKOM': ['TTKOM'],
  TEKFEN: ['TKFEN'],
  ENKA: ['ENKAI'],
  PETKIM: ['PETKM'],
  'PETKİM': ['PETKM'],
  TAV: ['TAVHL'],
  'TAV HAVALIMANLARI': ['TAVHL'],
  MIGROS: ['MGROS'],
  'MİGROS': ['MGROS'],
  SOK: ['SOKM'],
  'ŞOK': ['SOKM'],
  'ŞOK MARKET': ['SOKM'],
  FORD: ['FROTO'],
  'FORD OTOSAN': ['FROTO'],
  TOFAS: ['TOASO'],
  'TOFAŞ': ['TOASO'],
  AKBANK: ['AKBNK'],
  YAPIKREDI: ['YKBNK'],
  'YAPI KREDI': ['YKBNK'],
  'YAPI VE KREDI': ['YKBNK'],
  HALKBANK: ['HALKB'],
  'HALK BANKASI': ['HALKB'],
  VAKIFBANK: ['VAKBN'],
  'VAKIF BANKASI': ['VAKBN'],
  TURSI: ['TURSG'],
  'TURKIYE SIGORTA': ['TURSG'],
  'TÜRKİYE SİGORTA': ['TURSG'],
  ISMEN: ['ISMEN'],
  'IS MENKUL': ['ISMEN'],
  'İŞ MENKUL': ['ISMEN'],
  ASTOR: ['ASTOR'],
  KONTROLMATIK: ['KONTR'],
  HEKTAS: ['HEKTS'],
  GUBREF: ['GUBRF'],
  KOZA: ['KOZAL', 'KOZAA'],
  PETROL: ['TUPRS'],

  // US Stocks & ETFs Aliases
  APPLE: ['AAPL'],
  MICROSOFT: ['MSFT'],
  GOOGLE: ['GOOGL', 'GOOG'],
  ALPHABET: ['GOOGL'],
  AMAZON: ['AMZN'],
  NVIDIA: ['NVDA'],
  TESLA: ['TSLA'],
  META: ['META'],
  FACEBOOK: ['META'],
  BERKSHIRE: ['BRK-B', 'BRK.B', 'BRK-A'],
  BUFFETT: ['BRK-B'],
  NETFLIX: ['NFLX'],
  AMD: ['AMD'],
  INTEL: ['INTC'],
  SP500: ['SPY', 'VOO', 'IVV'],
  'S&P 500': ['SPY', 'VOO', 'IVV'],
  'S&P': ['SPY', 'VOO'],
  NASDAQ: ['QQQ', 'TQQQ'],
  QQQ: ['QQQ'],
  DOW: ['DIA'],
  VANGUARD: ['VOO', 'VTI', 'VGT'],

  // TEFAS Funds Aliases
  'PARA PIYASASI': ['ZBJ', 'TI2', 'PPZ', 'KLU', 'NRK', 'YLY', 'ZPE'],
  'PARA PIYASA': ['ZBJ', 'TI2', 'PPZ'],
  ZIRAAT: ['ZBJ', 'ZPE'],
  'IS PORTFOY': ['TI2', 'TTE', 'IHK', 'IDH', 'TAU'],
  TEKNOLOJI: ['TTE', 'AFT', 'YAY'],
  FON: ['ZBJ', 'TI2', 'PPZ', 'TTE', 'MAC'],
};

/**
 * Normalizes text for lenient fuzzy Turkish and English character matching.
 */
export function normalizeSearchText(text: string = ''): string {
  return text
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Filters and ranks assets based on user query string.
 * High-performance, memory-safe, returns top N matches.
 */
export function searchAssets<T extends SearchableAsset>(
  assets: T[],
  rawQuery: string,
  limit: number = 8
): T[] {
  const qTrim = rawQuery.trim();
  if (!qTrim) return [];

  const qUpper = qTrim.toUpperCase().replace(/\.IS$/i, '');
  const qNorm = normalizeSearchText(qTrim);

  // Check if query matches any known alias list
  const aliasSymbols = new Set<string>();
  for (const [aliasKey, targetSymbols] of Object.entries(COMMON_ASSET_ALIASES)) {
    const aliasNorm = normalizeSearchText(aliasKey);
    if (aliasNorm.includes(qNorm) || qNorm.includes(aliasNorm)) {
      targetSymbols.forEach(s => aliasSymbols.add(s.toUpperCase()));
    }
  }

  const scored: Array<{ asset: T; score: number }> = [];

  for (const asset of assets) {
    if (!asset || !asset.symbol) continue;

    const rawSym = asset.symbol.toUpperCase();
    const cleanSym = rawSym.replace(/\.IS$/i, '');
    const cleanSymNorm = normalizeSearchText(cleanSym);
    const nameNorm = normalizeSearchText(asset.name || '');
    const sectorNorm = normalizeSearchText(asset.sector || '');

    let score = 0;

    // 1. Exact match on clean ticker
    if (cleanSym === qUpper) {
      score = 200;
    }
    // 2. Exact match via alias
    else if (aliasSymbols.has(cleanSym)) {
      score = 150;
    }
    // 3. Ticker starts with query
    else if (cleanSym.startsWith(qUpper) || cleanSymNorm.startsWith(qNorm)) {
      score = 120 - (cleanSym.length - qUpper.length);
    }
    // 4. Name starts with query
    else if (nameNorm.startsWith(qNorm)) {
      score = 100;
    }
    // 5. Ticker contains query
    else if (cleanSym.includes(qUpper) || cleanSymNorm.includes(qNorm)) {
      score = 80;
    }
    // 6. Name contains query
    else if (nameNorm.includes(qNorm)) {
      score = 60;
    }
    // 7. Sector contains query
    else if (sectorNorm.includes(qNorm)) {
      score = 40;
    }

    if (score > 0) {
      // Bonus: If it has live price data or volume
      if (asset.latestPrice && asset.latestPrice > 0) {
        score += 5;
      }
      scored.push({ asset, score });
    }
  }

  // Sort descending by score, then alphabetically
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.asset.symbol.localeCompare(b.asset.symbol);
  });

  return scored.slice(0, limit).map(s => s.asset);
}

/**
 * Resolves an alias only if it maps to a single, unambiguous ticker symbol.
 * If an alias maps to multiple possible instruments (e.g. BORUSAN -> BRSAN vs BRYAT),
 * it returns null, making ambiguous aliases suggestion-only rather than blindly auto-selected.
 */
export function resolveUnambiguousAlias(rawQuery: string): string | null {
  if (!rawQuery || !rawQuery.trim()) return null;
  const qNorm = normalizeSearchText(rawQuery.trim());
  for (const [aliasKey, targets] of Object.entries(COMMON_ASSET_ALIASES)) {
    if (normalizeSearchText(aliasKey) === qNorm) {
      if (targets.length === 1) {
        return targets[0];
      }
      // Ambiguous multi-target alias: suggestion-only!
      return null;
    }
  }
  return null;
}
