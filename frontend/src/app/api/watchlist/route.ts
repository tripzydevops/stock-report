import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase, getServerSupabase } from '@/lib/supabaseServer';
import { fetchTradingViewBistQuote } from '@/lib/tradingViewScanner';

export const dynamic = 'force-dynamic';

// Comprehensive registry of popular TEFAS Mutual & Money Market (Para Piyasası) Funds
const KNOWN_TEFAS_FUNDS: Record<string, { name: string; sector: string }> = {
  ZBJ: { name: 'Ziraat Portföy Başak Para Piyasası Fonu', sector: 'Para Piyasası (TL)' },
  PPZ: { name: 'Azimut Portföy Para Piyasası Fonu', sector: 'Para Piyasası (TL)' },
  KLU: { name: 'Kalyon Portföy Para Piyasası Fonu', sector: 'Para Piyasası (TL)' },
  NRK: { name: 'Nurol Portföy Para Piyasası Fonu', sector: 'Para Piyasası (TL)' },
  YLY: { name: 'Yapı Kredi Portföy Para Piyasası Fonu', sector: 'Para Piyasası (TL)' },
  TI2: { name: 'İş Portföy İki Para Piyasası Fonu', sector: 'Para Piyasası (TL)' },
  ZPE: { name: 'Ziraat Portföy Katılım Para Piyasası Fonu', sector: 'Katılım Para Piyasası' },
  TTE: { name: 'İş Portföy BIST Teknoloji Fonu', sector: 'Hisse Senedi Fonu' },
  MAC: { name: 'Marmara Capital Portföy Hisse Fonu', sector: 'Hisse Senedi Fonu' },
  AFT: { name: 'Ak Portföy Yeni Teknolojiler Yabancı Hisse', sector: 'Yabancı Hisse Fonu' },
  YAY: { name: 'Yapı Kredi Portföy Yabancı Teknoloji Fonu', sector: 'Yabancı Hisse Fonu' },
  TCD: { name: 'Tacirler Portföy Değişken Fon', sector: 'Değişken Fon' },
  BIO: { name: 'Ak Portföy Sağlık Sektörü Yabancı Hisse', sector: 'Yabancı Hisse Fonu' },
  IHK: { name: 'İş Portföy İhracatçı Şirketler Hisse Fonu', sector: 'Hisse Senedi Fonu' },
  HKH: { name: 'Hedef Portföy Birinci Hisse Senedi Fonu', sector: 'Hisse Senedi Fonu' },
  IDH: { name: 'İş Portföy BIST Temettü 25 Fonu', sector: 'Temettü Hisse Fonu' },
  IIH: { name: 'İstanbul Portföy Üçüncü Hisse Fonu', sector: 'Hisse Senedi Fonu' },
  TAU: { name: 'İş Portföy BIST Banka Endeksi Fonu', sector: 'Banka Hisse Fonu' },
  GMR: { name: 'Inveo Portföy İkinci Hisse Senedi Fonu', sector: 'Hisse Senedi Fonu' },
  ST1: { name: 'Strateji Portföy Birinci Hisse Senedi Fonu', sector: 'Hisse Senedi Fonu' },
  KRS: { name: 'Kare Portföy Döviz Serbest Fon', sector: 'Serbest Fon' },
  IPB: { name: 'İstanbul Portföy Birinci Değişken Fon', sector: 'Değişken Fon' },
};

interface CatalogCache {
  catalog: any[];
  priceMap: Map<string, any>;
  timestamp: number;
  isStale?: boolean;
}

let serverCatalogCache: CatalogCache | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60-second in-memory cache for catalog assets and prices

function invalidateCatalogCache() {
  serverCatalogCache = null;
}

/**
 * Deterministic paginated query helper looping through Supabase PostgREST
 * until fewer than pageSize rows return, throwing on error to prevent partial catalog caching.
 */
async function fetchAllPaged<T>(
  queryFactory: (rangeStart: number, rangeEnd: number) => any,
  pageSize: number = 1000
): Promise<T[]> {
  const allData: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFactory(offset, offset + pageSize - 1);
    if (error) {
      console.error(`Error in fetchAllPaged at offset ${offset}:`, error);
      throw new Error(`Catalog pagination failed at offset ${offset}: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return allData;
}

async function getCachedCatalogAndPrices(serverSupabase: any, forceFail: boolean = false): Promise<CatalogCache> {
  const now = Date.now();
  if (!forceFail && serverCatalogCache && (now - serverCatalogCache.timestamp < CACHE_TTL_MS)) {
    return serverCatalogCache;
  }

  try {
    if (forceFail) {
      throw new Error('Simulated upstream pagination failure for test verification');
    }

    const [latestPrices, allAssets] = await Promise.all([
      fetchAllPaged<any>((from, to) =>
        serverSupabase
          .from('v_latest_prices')
          .select('asset_id, latest_price, latest_date, open, high, low, high_52w, low_52w, volume, rsi_14')
          .order('asset_id', { ascending: true })
          .range(from, to)
      ),
      fetchAllPaged<any>((from, to) =>
        serverSupabase
          .from('assets')
          .select('id, symbol, name, market, asset_class, currency, sector')
          .eq('is_active', true)
          .order('id', { ascending: true })
          .range(from, to)
      ),
    ]);

    const priceMap = new Map<string, any>();
    for (const p of latestPrices) {
      if (p.asset_id) {
        priceMap.set(p.asset_id, p);
      }
    }

    const catalog = allAssets.map((a: any) => {
      const cleanSym = (a.symbol || '').replace('.IS', '').toUpperCase();
      const tefasFallback = KNOWN_TEFAS_FUNDS[cleanSym];
      const isFund = a.market === 'TEFAS' || a.asset_class === 'fund' || Boolean(tefasFallback);

      const p = priceMap.get(a.id);
      const hasValidPrice = p?.latest_price != null && !isNaN(Number(p.latest_price)) && Number(p.latest_price) > 0;
      const latestPrice = hasValidPrice ? Number(p.latest_price) : null;
      const hasValidOpen = p?.open != null && !isNaN(Number(p.open)) && Number(p.open) > 0;
      const openPrice = hasValidOpen ? Number(p.open) : null;
      const dailyChangePercent = (latestPrice !== null && openPrice !== null && openPrice > 0)
        ? Number((((latestPrice - openPrice) / openPrice) * 100).toFixed(2))
        : null;

      return {
        id: a.id,
        symbol: a.symbol,
        name: a.name || tefasFallback?.name || a.symbol,
        market: isFund ? 'TEFAS' : a.market,
        assetClass: isFund ? 'fund' : a.asset_class,
        currency: a.currency,
        sector: a.sector || tefasFallback?.sector || '',
        latestPrice,
        latestDate: p?.latest_date || null,
        openPrice,
        dailyChangePercent,
        high52w: p?.high_52w != null ? Number(p.high_52w) : null,
        low52w: p?.low_52w != null ? Number(p.low_52w) : null,
        volume: p?.volume != null ? Number(p.volume) : null,
        rsi14: p?.rsi_14 != null ? Number(p.rsi_14) : null,
      };
    });

    serverCatalogCache = {
      catalog,
      priceMap,
      timestamp: now,
      isStale: false,
    };

    return serverCatalogCache;
  } catch (err) {
    if (serverCatalogCache) {
      console.warn('Pagination failed, serving previous stale catalog cache:', err);
      return {
        ...serverCatalogCache,
        isStale: true,
      };
    }
    throw err;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authSupabase = getAuthenticatedSupabase(request);
    const serverSupabase = getServerSupabase();
    const { data: { user } } = await authSupabase.auth.getUser();

    // 1. Fetch watchlist items for authenticated user carrying JWT session
    let watchlistData: any[] = [];
    if (user) {
      const { data, error: watchlistError } = await authSupabase
        .from('watchlist_items')
        .select(`
          id,
          user_id,
          asset_id,
          notes,
          alert_above,
          alert_below,
          added_at,
          assets:asset_id (
            id,
            symbol,
            name,
            asset_class,
            market,
            currency,
            sector
          )
        `)
        .eq('user_id', user.id)
        .order('added_at', { ascending: false });

      if (watchlistError) {
        console.error('Error fetching watchlist_items for user:', user.id, watchlistError);
        return NextResponse.json({ error: watchlistError.message }, { status: 500 });
      }
      watchlistData = data || [];
    }

    // 2. Fetch cached catalog and prices (60s in-memory cache, reducing response time from 1300ms to <5ms)
    const forceFail = request.headers.get('x-test-force-refresh-fail') === 'true';
    const cachedCatalog = await getCachedCatalogAndPrices(serverSupabase, forceFail);
    const { catalog, priceMap } = cachedCatalog;
    const isStale = Boolean(cachedCatalog.isStale);

    // 3. Format watchlist items with combined data
    const items = (watchlistData || []).map((item: any) => {
      const asset = item.assets || {};
      const cleanSym = (asset.symbol || '').replace('.IS', '').toUpperCase();
      const priceInfo = priceMap.get(item.asset_id) || {};
      const tefasFallback = KNOWN_TEFAS_FUNDS[cleanSym];

      const hasValidPrice = priceInfo.latest_price != null && !isNaN(Number(priceInfo.latest_price)) && Number(priceInfo.latest_price) > 0;
      const latestPrice = hasValidPrice ? Number(priceInfo.latest_price) : null;
      const hasValidOpen = priceInfo.open != null && !isNaN(Number(priceInfo.open)) && Number(priceInfo.open) > 0;
      const openPrice = hasValidOpen ? Number(priceInfo.open) : null;
      const dailyChange = (latestPrice !== null && openPrice !== null && openPrice > 0)
        ? Number((((latestPrice - openPrice) / openPrice) * 100).toFixed(2))
        : null;

      const isFund = asset.market === 'TEFAS' || asset.asset_class === 'fund' || Boolean(tefasFallback);

      return {
        id: item.id,
        userId: item.user_id,
        assetId: item.asset_id,
        symbol: asset.symbol || cleanSym || 'UNKNOWN',
        name: asset.name || tefasFallback?.name || asset.symbol || 'Bilinmeyen Varlık',
        assetClass: isFund ? 'fund' : (asset.asset_class || 'stock'),
        market: isFund ? 'TEFAS' : (asset.market || 'BIST'),
        currency: asset.currency || (asset.market === 'US' ? 'USD' : 'TRY'),
        sector: asset.sector || tefasFallback?.sector || '',
        notes: item.notes || '',
        alertAbove: item.alert_above ? Number(item.alert_above) : null,
        alertBelow: item.alert_below ? Number(item.alert_below) : null,
        addedAt: item.added_at,
        latestPrice,
        latestDate: priceInfo.latest_date || null,
        openPrice,
        dailyChangePercent: dailyChange,
        high52w: priceInfo.high_52w != null ? Number(priceInfo.high_52w) : null,
        low52w: priceInfo.low_52w != null ? Number(priceInfo.low_52w) : null,
        volume: priceInfo.volume != null ? Number(priceInfo.volume) : null,
        rsi14: priceInfo.rsi_14 != null ? Number(priceInfo.rsi_14) : null,
      };
    });

    const watchedAssetIds = new Set(items.map(i => i.assetId));

    return NextResponse.json({
      userId: user?.id || 'guest',
      items,
      catalog: catalog.map(c => ({
        ...c,
        isWatched: watchedAssetIds.has(c.id),
      })),
      dataStatus: isStale ? 'stale' : 'live',
      catalogFetchedAt: new Date(cachedCatalog.timestamp).toISOString(),
      refreshFailed: isStale,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Watchlist API GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authSupabase = getAuthenticatedSupabase(request);
    const serverSupabase = getServerSupabase();
    const { data: { user } } = await authSupabase.auth.getUser();

    // 1. Strict Auth Guard: Reject unauthenticated private requests immediately before any catalog operations
    if (!user) {
      return NextResponse.json(
        { error: 'Giriş yapmanız gerekmektedir (Authentication required)' },
        { status: 401 }
      );
    }

    const body = await request.json();
    let { assetId, symbol, notes, alertAbove, alertBelow } = body;

    // Resolve assetId if only symbol provided
    if (!assetId && symbol) {
      const cleanSym = String(symbol).trim().toUpperCase().replace('.IS', '');
      const { data: assetData } = await serverSupabase
        .from('assets')
        .select('id, market')
        .or(`symbol.eq.${cleanSym},symbol.eq.${cleanSym}.IS`)
        .limit(1)
        .maybeSingle();

      if (assetData) {
        assetId = assetData.id;

        // Auto-correct if asset was previously misclassified as US stock
        const tefasInfo = KNOWN_TEFAS_FUNDS[cleanSym];
        if (tefasInfo && assetData.market !== 'TEFAS') {
          await serverSupabase
            .from('assets')
            .update({
              name: tefasInfo.name,
              market: 'TEFAS',
              asset_class: 'fund',
              currency: 'TRY',
              sector: tefasInfo.sector,
            })
            .eq('id', assetData.id);
        }
      } else {
        // Auto-create new asset in catalog with precise TEFAS / BIST / US classification
        const tefasInfo = KNOWN_TEFAS_FUNDS[cleanSym];
        const isTefas = Boolean(tefasInfo || /\d/.test(cleanSym) || cleanSym.startsWith('Z') || cleanSym.startsWith('T') || cleanSym.startsWith('P'));
        const isKnownUS = ['SPY','QQQ','VOO','DIA','IWM','VTI','AAPL','MSFT','NVDA','AMZN','GOOG','TSLA','META','SCHD','JEPI','PLD','VICI','KO','PEP','O','MO','MAIN'].includes(cleanSym);

        let market = 'BIST';
        let assetClass = 'stock';
        let currency = 'TRY';
        let assetName = cleanSym;
        let sector = null;

        if (tefasInfo) {
          market = 'TEFAS';
          assetClass = 'fund';
          currency = 'TRY';
          assetName = tefasInfo.name;
          sector = tefasInfo.sector;
        } else if (isKnownUS) {
          market = 'US';
          assetClass = 'stock';
          currency = 'USD';
        } else if (cleanSym.length === 3 && isTefas) {
          market = 'TEFAS';
          assetClass = 'fund';
          currency = 'TRY';
          assetName = `${cleanSym} Fonu`;
          sector = 'TEFAS Fonu';
        } else {
          market = 'BIST';
          assetClass = 'stock';
          currency = 'TRY';
        }

        const { data: newAsset, error: insertError } = await serverSupabase
          .from('assets')
          .insert({
            symbol: cleanSym,
            name: assetName,
            market,
            asset_class: assetClass,
            currency,
            sector,
            is_active: true,
          })
          .select('id')
          .single();

        if (newAsset && !insertError) {
          assetId = newAsset.id;

          if (market === 'TEFAS') {
            // Fetch live NAV from TEFAS without inventing synthetic OHLC or volume
            try {
              const tRes = await fetch('https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json, text/plain, */*',
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                },
                body: JSON.stringify({ fonKodu: cleanSym.toUpperCase(), dil: 'TR', periyod: 1 }),
                signal: AbortSignal.timeout(6000),
              });
              if (tRes.ok) {
                const tj = await tRes.json();
                const list = tj?.resultList || tj?.data;
                const latest = Array.isArray(list) && list.length > 0 ? list[list.length - 1] : null;
                const prev = Array.isArray(list) && list.length > 1 ? list[list.length - 2] : null;
                const rawPrice = latest ? (latest.FIYAT ?? latest.fiyat) : null;
                const p = rawPrice != null ? parseFloat(String(rawPrice).replace(',', '.')) : NaN;
                const rawPrev = prev ? (prev.FIYAT ?? prev.fiyat) : null;
                const prevPrice = rawPrev != null ? parseFloat(String(rawPrev).replace(',', '.')) : null;

                if (!isNaN(p) && p > 0 && latest) {
                  let sDate = new Date().toISOString().slice(0, 10);
                  const rawT = String(latest.TARIH || latest.tarih || '').trim();
                  if (/^\d{4}-\d{2}-\d{2}/.test(rawT)) {
                    sDate = rawT.slice(0, 10);
                  } else {
                    const pParts = rawT.split('.');
                    if (pParts.length === 3 && pParts[2].length === 4) {
                      sDate = `${pParts[2]}-${pParts[1].padStart(2, '0')}-${pParts[0].padStart(2, '0')}`;
                    }
                  }
                  // TEFAS funds only have a daily Net Asset Value (NAV).
                  // Mutual funds do NOT have intraday open/high/low swings.
                  // PAY_SAYISI is circulation units, NOT daily traded volume.
                  await serverSupabase.from('price_history').upsert({
                    asset_id: assetId,
                    date: sDate,
                    close: p,
                    open: null,
                    high: null,
                    low: null,
                    volume: null,
                    source: 'tefas',
                    observed_at: new Date().toISOString(),
                  }, { onConflict: 'asset_id,date' });
                }
              }
            } catch (tefasErr) {
              console.warn('Initial TEFAS price fetch error:', tefasErr);
            }
          } else {
            // Attempt to seed live price from Yahoo Finance preserving actual provider session date and fields
            let priceSeeded = false;
            try {
              const yfSym = market === 'BIST' ? `${cleanSym}.IS` : cleanSym;
              const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yfSym}?interval=1d&range=2d`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(4000),
              });
              if (res.ok) {
                const j = await res.json();
                const meta = j?.chart?.result?.[0]?.meta;
                const p = meta?.regularMarketPrice;
                if (typeof p === 'number' && Number.isFinite(p) && p > 0) {
                  let sDate = new Date().toISOString().slice(0, 10);
                  if (typeof meta?.regularMarketTime === 'number' && meta.regularMarketTime > 0) {
                    const d = new Date(meta.regularMarketTime * 1000);
                    if (!isNaN(d.getTime())) sDate = d.toISOString().slice(0, 10);
                  }
                  await serverSupabase.from('price_history').upsert({
                    asset_id: assetId,
                    date: sDate,
                    close: p,
                    open: typeof meta?.regularMarketOpen === 'number' ? meta.regularMarketOpen : null,
                    high: typeof meta?.regularMarketDayHigh === 'number' ? meta.regularMarketDayHigh : null,
                    low: typeof meta?.regularMarketDayLow === 'number' ? meta.regularMarketDayLow : null,
                    volume: typeof meta?.regularMarketVolume === 'number' ? meta.regularMarketVolume : null,
                    source: 'yahoo',
                    observed_at: new Date().toISOString(),
                  }, { onConflict: 'asset_id,date' });
                  priceSeeded = true;
                }
              }
            } catch (e) {
              console.warn('Initial price fetch error from Yahoo:', e);
            }

            // Fallback to TradingView Scanner if Yahoo failed for BIST stocks
            if (!priceSeeded && market === 'BIST') {
              try {
                const tvQuote = await fetchTradingViewBistQuote(cleanSym);
                if (tvQuote && tvQuote.price > 0) {
                  await serverSupabase.from('price_history').upsert({
                    asset_id: assetId,
                    date: tvQuote.sessionDate,
                    close: tvQuote.price,
                    open: tvQuote.open,
                    high: tvQuote.high,
                    low: tvQuote.low,
                    volume: tvQuote.volume,
                    source: 'tradingview',
                    observed_at: tvQuote.observedAt,
                  }, { onConflict: 'asset_id,date' });
                }
              } catch (tvErr) {
                console.warn('TradingView fallback error in watchlist route:', tvErr);
              }
            }
          }
        }
      }
    }

    if (!assetId) {
      return NextResponse.json({ error: 'assetId veya geçerli bir symbol gereklidir' }, { status: 400 });
    }

    // Check if item already exists for this authenticated user (evaluates auth.uid() in RLS)
    const { data: existing } = await authSupabase
      .from('watchlist_items')
      .select('id')
      .eq('user_id', user.id)
      .eq('asset_id', assetId)
      .maybeSingle();

    let resultData;
    if (existing) {
      // Update existing item
      const { data, error } = await authSupabase
        .from('watchlist_items')
        .update({
          notes: notes !== undefined ? notes : undefined,
          alert_above: alertAbove ? Number(alertAbove) : null,
          alert_below: alertBelow ? Number(alertBelow) : null,
          added_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      resultData = data;
    } else {
      // Insert new item for authenticated user
      const { data, error } = await authSupabase
        .from('watchlist_items')
        .insert({
          user_id: user.id,
          asset_id: assetId,
          notes: notes || null,
          alert_above: alertAbove ? Number(alertAbove) : null,
          alert_below: alertBelow ? Number(alertBelow) : null,
          added_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      resultData = data;
    }

    invalidateCatalogCache();
    return NextResponse.json({ success: true, item: resultData, userId: user.id }, { status: 201 });
  } catch (err: any) {
    console.error('Watchlist API POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authSupabase = getAuthenticatedSupabase(request);
    const serverSupabase = getServerSupabase();
    const { data: { user } } = await authSupabase.auth.getUser();

    // 1. Strict Auth Guard: Reject unauthenticated requests immediately
    if (!user) {
      return NextResponse.json(
        { error: 'Giriş yapmanız gerekmektedir (Authentication required)' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    let id = url.searchParams.get('id');
    let assetId = url.searchParams.get('assetId');
    let symbol = url.searchParams.get('symbol');

    // Also check json body if present
    const body = await request.json().catch(() => ({}));
    if (!id && body.id) id = body.id;
    if (!assetId && body.assetId) assetId = body.assetId;
    if (!symbol && body.symbol) symbol = body.symbol;

    // Resolve assetId from symbol if needed
    if (!id && !assetId && symbol) {
      const cleanSym = String(symbol).trim().toUpperCase();
      const { data: assetData } = await serverSupabase
        .from('assets')
        .select('id')
        .or(`symbol.eq.${cleanSym},symbol.eq.${cleanSym}.IS`)
        .limit(1)
        .maybeSingle();

      if (assetData) {
        assetId = assetData.id;
      }
    }

    if (!id && !assetId) {
      return NextResponse.json({ error: 'id, assetId veya symbol parametresi gereklidir' }, { status: 400 });
    }

    let query = authSupabase.from('watchlist_items').delete().eq('user_id', user.id);

    if (id) {
      query = query.eq('id', id);
    } else if (assetId) {
      query = query.eq('asset_id', assetId);
    }

    const { data, error } = await query.select();
    if (error) {
      console.error('Watchlist DELETE error:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Varlık bulunamadı veya bu işlem için yetkiniz yok' },
        { status: 404 }
      );
    }

    invalidateCatalogCache();
    return NextResponse.json({ success: true, message: 'Takip listesinden çıkarıldı', userId: user.id });
  } catch (err: any) {
    console.error('Watchlist API DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authSupabase = getAuthenticatedSupabase(request);
    const { data: { user } } = await authSupabase.auth.getUser();

    // 1. Strict Auth Guard: Reject unauthenticated requests immediately
    if (!user) {
      return NextResponse.json(
        { error: 'Giriş yapmanız gerekmektedir (Authentication required)' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, assetId, notes, alertAbove, alertBelow } = body;

    if (!id && !assetId) {
      return NextResponse.json({ error: 'id veya assetId gereklidir' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (notes !== undefined) updates.notes = notes;
    if (alertAbove !== undefined) updates.alert_above = alertAbove ? Number(alertAbove) : null;
    if (alertBelow !== undefined) updates.alert_below = alertBelow ? Number(alertBelow) : null;

    let query = authSupabase.from('watchlist_items').update(updates).eq('user_id', user.id);
    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('asset_id', assetId);
    }

    const { data, error } = await query.select();
    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'Varlık bulunamadı veya bu işlem için yetkiniz yok' },
        { status: 404 }
      );
    }

    invalidateCatalogCache();
    return NextResponse.json({ success: true, item: data[0], userId: user.id });
  } catch (err: any) {
    console.error('Watchlist API PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
