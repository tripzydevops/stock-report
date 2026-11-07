import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

interface QuoteResult {
  price: number;
  prevClose?: number;
  high?: number;
  low?: number;
  volume?: number;
}

async function fetchLiveQuote(symbol: string, market: string): Promise<QuoteResult | null> {
  try {
    let querySymbol = symbol.trim().toUpperCase();
    if (market === 'BIST' && !querySymbol.endsWith('.IS')) {
      querySymbol = `${querySymbol}.IS`;
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${querySymbol}?interval=1d&range=2d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
      },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 0 },
    });

    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number') return null;

    return {
      price,
      prevClose: meta?.previousClose || meta?.chartPreviousClose || price,
      high: meta?.regularMarketDayHigh || price,
      low: meta?.regularMarketDayLow || price,
      volume: meta?.regularMarketVolume || 100000,
    };
  } catch (e) {
    console.warn(`Live quote fetch failed for ${symbol}:`, e);
    return null;
  }
}

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
    const url = new URL(request.url);
    const market = url.searchParams.get('market');
    const assetClass = url.searchParams.get('asset_class');
    const q = url.searchParams.get('q');

    let query = supabase
      .from('v_latest_prices')
      .select('id:asset_id, symbol, name, market, asset_class, currency, sector, is_active, latest_price, open, high, low, volume')
      .eq('is_active', true);

    if (market) {
      query = query.eq('market', market.toUpperCase());
    }

    if (assetClass) {
      query = query.eq('asset_class', assetClass.toLowerCase());
    }

    if (q && q.trim()) {
      const term = q.trim();
      query = query.or(`symbol.ilike.%${term}%,name.ilike.%${term}%`);
    }

    const limitParam = url.searchParams.get('limit');
    const maxLimit = limitParam ? Math.min(parseInt(limitParam, 10), 2000) : (q ? 50 : 2000);

    query = query.order('symbol', { ascending: true }).limit(maxLimit);

    const { data, error } = await query;
    if (error) {
      console.error('Assets GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('Assets GET route exception:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = getEffectiveUserId(request, body);

    const rawSymbol = body.symbol;
    if (!rawSymbol || typeof rawSymbol !== 'string' || !rawSymbol.trim()) {
      return NextResponse.json({ error: 'Symbol / Ticker gereklidir' }, { status: 400 });
    }

    const cleanSymbol = rawSymbol.trim().toUpperCase().replace('.IS', '');
    const cleanName = (body.name && typeof body.name === 'string' && body.name.trim()) 
      ? body.name.trim() 
      : cleanSymbol;

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

    const tefasMatched = KNOWN_TEFAS_FUNDS[cleanSymbol];

    // Normalize market
    let rawMarket = (body.market || (tefasMatched ? 'TEFAS' : 'US')).toString().toUpperCase().trim();
    if (rawMarket.includes('BIST') || rawMarket.includes('TURKEY') || rawMarket.includes('TR')) {
      rawMarket = 'BIST';
    } else if (rawMarket.includes('TEFAS') || rawMarket.includes('FON') || tefasMatched) {
      rawMarket = 'TEFAS';
    } else if (rawMarket !== 'BIST' && rawMarket !== 'TEFAS' && rawMarket !== 'GLOBAL') {
      rawMarket = 'US';
    }
    const cleanMarket = rawMarket;

    // Normalize asset class (must match constraint: stock, etf, fund)
    let rawClass = (body.asset_class || (cleanMarket === 'TEFAS' ? 'fund' : 'stock')).toString().toLowerCase().trim();
    if (rawClass === 'etf') {
      rawClass = 'etf';
    } else if (rawClass === 'fund' || rawClass === 'mutual fund' || cleanMarket === 'TEFAS') {
      rawClass = 'fund';
    } else {
      rawClass = 'stock';
    }
    const cleanClass = rawClass;

    // Normalize currency (must match constraint: USD, TRY, EUR)
    let cleanCurrency = body.currency ? body.currency.toUpperCase() : (cleanMarket === 'BIST' || cleanMarket === 'TEFAS' ? 'TRY' : 'USD');
    if (cleanCurrency !== 'USD' && cleanCurrency !== 'TRY' && cleanCurrency !== 'EUR') {
      cleanCurrency = (cleanMarket === 'BIST' || cleanMarket === 'TEFAS') ? 'TRY' : 'USD';
    }

    const resolvedName = tefasMatched 
      ? tefasMatched.name 
      : cleanName;
    const resolvedSector = body.sector || (tefasMatched ? tefasMatched.sector : null);

    // 1. Check if asset already exists in assets table
    const { data: existingAsset } = await supabase
      .from('assets')
      .select('*')
      .or(`symbol.eq.${cleanSymbol},symbol.eq.${cleanSymbol}.IS`)
      .limit(1)
      .maybeSingle();

    let asset = existingAsset;

    if (!asset) {
      // Insert new asset into database
      const { data: insertedAsset, error: insertError } = await supabase
        .from('assets')
        .insert({
          symbol: cleanSymbol,
          name: resolvedName,
          asset_class: cleanClass,
          market: cleanMarket,
          currency: cleanCurrency,
          sector: resolvedSector,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to insert asset:', insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      asset = insertedAsset;
    } else if (tefasMatched && asset.market !== 'TEFAS') {
      // Auto-correct existing asset to TEFAS fund
      const { data: updatedAsset } = await supabase
        .from('assets')
        .update({
          name: resolvedName,
          market: 'TEFAS',
          asset_class: 'fund',
          currency: 'TRY',
          sector: resolvedSector,
        })
        .eq('id', asset.id)
        .select()
        .single();

      if (updatedAsset) {
        asset = updatedAsset;
      }
    }

    // 2. Fetch live price quote from Yahoo Finance & initialize price_history
    const today = new Date().toISOString().slice(0, 10);
    const quote = await fetchLiveQuote(cleanSymbol, cleanMarket);

    if (quote) {
      await supabase.from('price_history').upsert({
        asset_id: asset.id,
        date: today,
        close: quote.price,
        open: quote.prevClose || quote.price,
        high: quote.high || quote.price,
        low: quote.low || quote.price,
        volume: quote.volume || 100000,
      }, { onConflict: 'asset_id,date' });
    } else {
      // Ensure at least 1 baseline price row exists so v_latest_prices doesn't return null
      const { data: priceExists } = await supabase
        .from('price_history')
        .select('id')
        .eq('asset_id', asset.id)
        .limit(1)
        .maybeSingle();

      if (!priceExists) {
        const fallbackPrice = tefasMatched?.defaultPrice || 100.0;
        await supabase.from('price_history').insert({
          asset_id: asset.id,
          date: today,
          close: fallbackPrice,
          open: fallbackPrice * 0.998,
          high: fallbackPrice,
          low: fallbackPrice * 0.998,
          volume: tefasMatched ? 15000000 : 50000,
        });
      }
    }

    // 3. Automatically add to user's Watchlist so it immediately appears in their tracked items
    let addedToWatchlist = false;
    const shouldAddToWatchlist = body.addToWatchlist !== false;

    if (shouldAddToWatchlist && userId) {
      const { data: existingWatchItem } = await supabase
        .from('watchlist_items')
        .select('id')
        .eq('user_id', userId)
        .eq('asset_id', asset.id)
        .maybeSingle();

      if (!existingWatchItem) {
        const { error: watchError } = await supabase
          .from('watchlist_items')
          .insert({
            user_id: userId,
            asset_id: asset.id,
            notes: body.notes || null,
            alert_above: body.alert_above ? Number(body.alert_above) : null,
            alert_below: body.alert_below ? Number(body.alert_below) : null,
            added_at: new Date().toISOString(),
          });

        if (!watchError) {
          addedToWatchlist = true;
        } else {
          console.warn('Could not auto-add to watchlist:', watchError.message);
        }
      } else {
        addedToWatchlist = true;
      }
    }

    return NextResponse.json({
      success: true,
      asset,
      quote: quote ? { price: quote.price, change: quote.prevClose ? ((quote.price - quote.prevClose) / quote.prevClose) * 100 : 0 } : null,
      addedToWatchlist,
      userId,
    }, { status: existingAsset ? 200 : 201 });
  } catch (err: any) {
    console.error('Assets POST route exception:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
