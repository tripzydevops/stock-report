import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

// Comprehensive registry of popular TEFAS Mutual & Money Market (Para Piyasası) Funds
const KNOWN_TEFAS_FUNDS: Record<string, { name: string; sector: string; defaultPrice: number }> = {
  ZBJ: { name: 'Ziraat Portföy Başak Para Piyasası Fonu', sector: 'Para Piyasası (TL)', defaultPrice: 5.5925 },
  PPZ: { name: 'Azimut Portföy Para Piyasası Fonu', sector: 'Para Piyasası (TL)', defaultPrice: 6.8520 },
  KLU: { name: 'Kalyon Portföy Para Piyasası Fonu', sector: 'Para Piyasası (TL)', defaultPrice: 4.1200 },
  NRK: { name: 'Nurol Portföy Para Piyasası Fonu', sector: 'Para Piyasası (TL)', defaultPrice: 3.4500 },
  YLY: { name: 'Yapı Kredi Portföy Para Piyasası Fonu', sector: 'Para Piyasası (TL)', defaultPrice: 5.2010 },
  TI2: { name: 'İş Portföy İki Para Piyasası Fonu', sector: 'Para Piyasası (TL)', defaultPrice: 8.4200 },
  ZPE: { name: 'Ziraat Portföy Katılım Para Piyasası Fonu', sector: 'Katılım Para Piyasası', defaultPrice: 4.9015 },
  TTE: { name: 'İş Portföy BIST Teknoloji Fonu', sector: 'Hisse Senedi Fonu', defaultPrice: 1.1540 },
  MAC: { name: 'Marmara Capital Portföy Hisse Fonu', sector: 'Hisse Senedi Fonu', defaultPrice: 12.8500 },
  AFT: { name: 'Ak Portföy Yeni Teknolojiler Yabancı Hisse', sector: 'Yabancı Hisse Fonu', defaultPrice: 0.6520 },
  YAY: { name: 'Yapı Kredi Portföy Yabancı Teknoloji Fonu', sector: 'Yabancı Hisse Fonu', defaultPrice: 2.3040 },
  TCD: { name: 'Tacirler Portföy Değişken Fon', sector: 'Değişken Fon', defaultPrice: 7.2010 },
  BIO: { name: 'Ak Portföy Sağlık Sektörü Yabancı Hisse', sector: 'Yabancı Hisse Fonu', defaultPrice: 0.4520 },
  IHK: { name: 'İş Portföy İhracatçı Şirketler Hisse Fonu', sector: 'Hisse Senedi Fonu', defaultPrice: 1.8540 },
  HKH: { name: 'Hedef Portföy Birinci Hisse Senedi Fonu', sector: 'Hisse Senedi Fonu', defaultPrice: 3.2500 },
  IDH: { name: 'İş Portföy BIST Temettü 25 Fonu', sector: 'Temettü Hisse Fonu', defaultPrice: 2.1020 },
  IIH: { name: 'İstanbul Portföy Üçüncü Hisse Fonu', sector: 'Hisse Senedi Fonu', defaultPrice: 4.5030 },
  TAU: { name: 'İş Portföy BIST Banka Endeksi Fonu', sector: 'Banka Hisse Fonu', defaultPrice: 1.7520 },
  GMR: { name: 'Inveo Portföy İkinci Hisse Senedi Fonu', sector: 'Hisse Senedi Fonu', defaultPrice: 5.8010 },
  ST1: { name: 'Strateji Portföy Birinci Hisse Senedi Fonu', sector: 'Hisse Senedi Fonu', defaultPrice: 9.1020 },
  KRS: { name: 'Kare Portföy Döviz Serbest Fon', sector: 'Serbest Fon', defaultPrice: 2.4050 },
  IPB: { name: 'İstanbul Portföy Birinci Değişken Fon', sector: 'Değişken Fon', defaultPrice: 8.9020 },
};

function getEffectiveUserId(request: NextRequest, body?: any): string {
  const url = new URL(request.url);
  const qUserId = url.searchParams.get('userId');
  if (qUserId && qUserId !== 'undefined' && qUserId !== 'null' && qUserId.trim()) {
    return qUserId.trim();
  }

  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId && headerUserId !== 'undefined' && headerUserId !== 'null' && headerUserId.trim()) {
    return headerUserId.trim();
  }

  if (body && body.userId && body.userId !== 'undefined' && body.userId !== 'null' && String(body.userId).trim()) {
    return String(body.userId).trim();
  }

  return 'default_user';
}

export async function GET(request: NextRequest) {
  try {
    const userId = getEffectiveUserId(request);

    // 1. Fetch watchlist items for this specific user
    // (If the user is default_user or requested, filter by user_id)
    let query = supabase
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
      .order('added_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: watchlistData, error: watchlistError } = await query;

    if (watchlistError) {
      console.error('Error fetching watchlist_items for user:', userId, watchlistError);
      return NextResponse.json({ error: watchlistError.message }, { status: 500 });
    }

    // 2. Fetch latest prices for all assets to enrich watchlist
    const { data: latestPrices, error: pricesError } = await supabase
      .from('v_latest_prices')
      .select('asset_id, latest_price, open, high, low, high_52w, low_52w, volume, rsi_14')
      .limit(2000);

    if (pricesError) {
      console.warn('Warning: Could not fetch v_latest_prices:', pricesError.message);
    }

    const priceMap = new Map<string, any>();
    if (latestPrices) {
      for (const p of latestPrices) {
        priceMap.set(p.asset_id, p);
      }
    }

    // 3. Format watchlist items with combined data
    const items = (watchlistData || []).map((item: any) => {
      const asset = item.assets || {};
      const priceInfo = priceMap.get(item.asset_id) || {};
      const latestPrice = Number(priceInfo.latest_price) || 0;
      const openPrice = Number(priceInfo.open) || latestPrice;
      const dailyChange = openPrice > 0 ? ((latestPrice - openPrice) / openPrice) * 100 : 0;

      return {
        id: item.id,
        userId: item.user_id,
        assetId: item.asset_id,
        symbol: asset.symbol || 'UNKNOWN',
        name: asset.name || asset.symbol || 'Bilinmeyen Varlık',
        assetClass: asset.asset_class || 'stock',
        market: asset.market || 'BIST',
        currency: asset.currency || (asset.market === 'US' ? 'USD' : 'TRY'),
        sector: asset.sector || '',
        notes: item.notes || '',
        alertAbove: item.alert_above ? Number(item.alert_above) : null,
        alertBelow: item.alert_below ? Number(item.alert_below) : null,
        addedAt: item.added_at,
        latestPrice,
        openPrice,
        dailyChangePercent: Number(dailyChange.toFixed(2)),
        high52w: priceInfo.high_52w ? Number(priceInfo.high_52w) : null,
        low52w: priceInfo.low_52w ? Number(priceInfo.low_52w) : null,
        volume: priceInfo.volume ? Number(priceInfo.volume) : null,
        rsi14: priceInfo.rsi_14 ? Number(priceInfo.rsi_14) : null,
      };
    });

    // 4. Also fetch active catalog of assets for search/autocomplete
    const { data: allAssets, error: allAssetsError } = await supabase
      .from('assets')
      .select('id, symbol, name, market, asset_class, currency, sector')
      .eq('is_active', true)
      .order('symbol', { ascending: true })
      .limit(2000);

    if (allAssetsError) {
      console.warn('Warning: Could not fetch all assets:', allAssetsError.message);
    }

    const watchedAssetIds = new Set(items.map(i => i.assetId));

    return NextResponse.json({
      userId,
      items,
      catalog: (allAssets || []).map((a: any) => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        market: a.market,
        assetClass: a.asset_class,
        currency: a.currency,
        sector: a.sector,
        isWatched: watchedAssetIds.has(a.id),
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Watchlist API GET error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = getEffectiveUserId(request, body);
    let { assetId, symbol, notes, alertAbove, alertBelow } = body;

    // Resolve assetId if only symbol provided
    if (!assetId && symbol) {
      const cleanSym = String(symbol).trim().toUpperCase().replace('.IS', '');
      const { data: assetData } = await supabase
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
          await supabase
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

        const { data: newAsset, error: insertError } = await supabase
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

          if (market === 'TEFAS' && tefasInfo?.defaultPrice) {
            // Seed TEFAS fund initial unit price
            await supabase.from('price_history').insert({
              asset_id: assetId,
              date: new Date().toISOString().slice(0, 10),
              close: tefasInfo.defaultPrice,
              open: tefasInfo.defaultPrice * 0.998,
              high: tefasInfo.defaultPrice,
              low: tefasInfo.defaultPrice * 0.998,
              volume: 15000000,
            });
          } else {
            // Attempt to seed live price from Yahoo Finance
            try {
              const yfSym = market === 'BIST' ? `${cleanSym}.IS` : cleanSym;
              const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yfSym}?interval=1d&range=2d`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(4000),
              });
              if (res.ok) {
                const j = await res.json();
                const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
                if (typeof p === 'number') {
                  await supabase.from('price_history').insert({
                    asset_id: assetId,
                    date: new Date().toISOString().slice(0, 10),
                    close: p,
                    open: p,
                    high: p,
                    low: p,
                    volume: 100000,
                  });
                }
              }
            } catch (e) {
              console.warn('Initial price fetch error:', e);
            }
          }
        }
      }
    }

    if (!assetId) {
      return NextResponse.json({ error: 'assetId veya geçerli bir symbol gereklidir' }, { status: 400 });
    }

    // Check if item already exists for this user
    const { data: existing } = await supabase
      .from('watchlist_items')
      .select('id')
      .eq('user_id', userId)
      .eq('asset_id', assetId)
      .maybeSingle();

    let resultData;
    if (existing) {
      // Update existing item
      const { data, error } = await supabase
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
      // Insert new item for this user
      const { data, error } = await supabase
        .from('watchlist_items')
        .insert({
          user_id: userId,
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

    return NextResponse.json({ success: true, item: resultData, userId }, { status: 201 });
  } catch (err: any) {
    console.error('Watchlist API POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = getEffectiveUserId(request);
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
      const { data: assetData } = await supabase
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

    let query = supabase.from('watchlist_items').delete();

    if (id) {
      query = query.eq('id', id);
    } else if (assetId) {
      query = query.eq('asset_id', assetId);
      if (userId) {
        query = query.eq('user_id', userId);
      }
    }

    const { error } = await query;
    if (error) {
      console.error('Watchlist DELETE error:', error);
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Takip listesinden çıkarıldı', userId });
  } catch (err: any) {
    console.error('Watchlist API DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = getEffectiveUserId(request, body);
    const { id, assetId, notes, alertAbove, alertBelow } = body;

    if (!id && !assetId) {
      return NextResponse.json({ error: 'id veya assetId gereklidir' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (notes !== undefined) updates.notes = notes;
    if (alertAbove !== undefined) updates.alert_above = alertAbove ? Number(alertAbove) : null;
    if (alertBelow !== undefined) updates.alert_below = alertBelow ? Number(alertBelow) : null;

    let query = supabase.from('watchlist_items').update(updates);
    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('asset_id', assetId).eq('user_id', userId);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, item: data, userId });
  } catch (err: any) {
    console.error('Watchlist API PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
