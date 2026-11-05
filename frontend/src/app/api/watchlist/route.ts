import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

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
      .select('asset_id, latest_price, open, high, low, high_52w, low_52w, volume, rsi_14');

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
      .order('symbol', { ascending: true });

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
