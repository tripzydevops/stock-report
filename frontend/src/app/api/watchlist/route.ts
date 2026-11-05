import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 1. Fetch watchlist items joined with assets and v_latest_prices
    const { data: watchlistData, error: watchlistError } = await supabase
      .from('watchlist_items')
      .select(`
        id,
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

    if (watchlistError) {
      console.error('Error fetching watchlist_items:', watchlistError);
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

    return NextResponse.json({
      items,
      catalog: (allAssets || []).map((a: any) => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        market: a.market,
        assetClass: a.asset_class,
        currency: a.currency,
        sector: a.sector,
        isWatched: items.some((w: any) => w.assetId === a.id),
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

    // Insert or update in watchlist_items
    const { data, error } = await supabase
      .from('watchlist_items')
      .upsert(
        {
          asset_id: assetId,
          notes: notes || null,
          alert_above: alertAbove ? Number(alertAbove) : null,
          alert_below: alertBelow ? Number(alertBelow) : null,
          added_at: new Date().toISOString(),
        },
        { onConflict: 'asset_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Watchlist POST error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data }, { status: 201 });
  } catch (err: any) {
    console.error('Watchlist API POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const assetId = url.searchParams.get('assetId');

    if (!id && !assetId) {
      // Also check json body if present
      const body = await request.json().catch(() => ({}));
      const deleteId = body.id || id;
      const deleteAssetId = body.assetId || assetId;

      if (!deleteId && !deleteAssetId) {
        return NextResponse.json({ error: 'id veya assetId parametresi gereklidir' }, { status: 400 });
      }

      if (deleteId) {
        const { error } = await supabase.from('watchlist_items').delete().eq('id', deleteId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('watchlist_items').delete().eq('asset_id', deleteAssetId);
        if (error) throw error;
      }
      return NextResponse.json({ success: true, message: 'Takip listesinden çıkarıldı' });
    }

    if (id) {
      const { error } = await supabase.from('watchlist_items').delete().eq('id', id);
      if (error) throw error;
    } else if (assetId) {
      const { error } = await supabase.from('watchlist_items').delete().eq('asset_id', assetId);
      if (error) throw error;
    }

    return NextResponse.json({ success: true, message: 'Takip listesinden çıkarıldı' });
  } catch (err: any) {
    console.error('Watchlist API DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
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
      query = query.eq('asset_id', assetId);
    }

    const { data, error } = await query.select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (err: any) {
    console.error('Watchlist API PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
