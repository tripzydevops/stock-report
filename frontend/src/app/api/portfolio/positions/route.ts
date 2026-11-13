import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase, getServerSupabase, getAdminSupabase } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const ADMIN_USER_ID = 'e9ec6b95-cb41-4712-8716-eec5eb85b1bc';

/**
 * Server-side validation and persistence for portfolio positions / imports.
 * Rejects missing, zero, negative, or nonfinite prices and shares.
 */
export async function POST(request: NextRequest) {
  try {
    const authSupabase = getAuthenticatedSupabase(request);
    const { data: { user } } = await authSupabase.auth.getUser();

    const body = await request.json().catch(() => ({}));
    const {
      symbol,
      shares,
      quantity,
      price,
      entryPrice,
      stopLoss,
      targetPrice,
      market = 'BIST',
      name,
      currency,
      notes,
      isDividend,
      userId: bodyUserId,
    } = body;

    // 1. Strict Server-Side Validation: Symbol
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return NextResponse.json(
        { error: 'Valid symbol string is required' },
        { status: 400 }
      );
    }
    const cleanSym = symbol.replace('.IS', '').trim().toUpperCase();

    // 2. Strict Server-Side Validation: Entry Price
    // Must be a finite, strictly positive number (reject null, undefined, 0, negative, NaN, Infinity)
    const rawPrice = price ?? entryPrice;
    if (
      rawPrice === null ||
      rawPrice === undefined ||
      typeof rawPrice !== 'number' ||
      !Number.isFinite(rawPrice) ||
      rawPrice <= 0
    ) {
      return NextResponse.json(
        {
          error: 'Invalid price: entry price must be a finite, strictly positive number (> 0). Zero, negative, and missing prices are rejected.',
          receivedPrice: rawPrice,
        },
        { status: 400 }
      );
    }

    // 3. Strict Server-Side Validation: Shares / Quantity
    // Must be a finite, strictly positive number
    const rawShares = shares ?? quantity;
    if (
      rawShares === null ||
      rawShares === undefined ||
      typeof rawShares !== 'number' ||
      !Number.isFinite(rawShares) ||
      rawShares <= 0
    ) {
      return NextResponse.json(
        {
          error: 'Invalid shares: quantity must be a finite, strictly positive number (> 0). Zero, negative, and missing quantities are rejected.',
          receivedShares: rawShares,
        },
        { status: 400 }
      );
    }

    const effectiveUserId = user?.id || (bodyUserId && bodyUserId !== 'default_user' ? bodyUserId : ADMIN_USER_ID);
    const serverSupabase = getAdminSupabase() || getServerSupabase();

    // 4. Resolve or create asset in catalog
    const isSymbol = `${cleanSym}.IS`;
    let { data: assetData } = await serverSupabase
      .from('assets')
      .select('id, symbol, name, market')
      .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol},name.ilike.%${cleanSym}%`)
      .limit(1);

    let assetId = assetData && assetData.length > 0 ? assetData[0].id : null;
    if (!assetId) {
      const resolvedMarket = market || (cleanSym.length <= 4 && !cleanSym.endsWith('.IS') ? 'BIST' : 'US');
      const { data: newAsset, error: newAssetErr } = await serverSupabase
        .from('assets')
        .insert([{
          symbol: resolvedMarket === 'BIST' ? `${cleanSym}.IS` : cleanSym,
          name: name || cleanSym,
          market: resolvedMarket,
          asset_class: 'stock',
          currency: currency || (resolvedMarket === 'US' ? 'USD' : 'TRY'),
        }])
        .select('id')
        .single();

      if (newAsset && !newAssetErr) {
        assetId = newAsset.id;
      } else {
        console.error('Failed to auto-create asset in portfolio positions API:', newAssetErr);
      }
    }

    if (!assetId) {
      return NextResponse.json(
        { error: 'Could not resolve or register asset for symbol: ' + cleanSym },
        { status: 500 }
      );
    }

    // 5. Persist position into portfolio_positions
    const orderDateStr = new Date().toISOString().slice(0, 10);
    const resolvedStop = stopLoss && Number.isFinite(stopLoss) && stopLoss > 0 ? Number(stopLoss) : null;
    const resolvedTarget = targetPrice && Number.isFinite(targetPrice) && targetPrice > 0 ? Number(targetPrice) : null;

    const { data: posData, error: posError } = await serverSupabase
      .from('portfolio_positions')
      .insert([{
        user_id: effectiveUserId,
        asset_id: assetId,
        quantity: rawShares,
        avg_entry_price: rawPrice,
        stop_loss: resolvedStop,
        target_price: resolvedTarget,
        is_open: true,
        entry_date: orderDateStr,
        notes: notes || (isDividend ? 'Strategy: CORE_DIVIDEND' : 'Active holding'),
      }])
      .select()
      .single();

    if (posError) {
      console.error('Database error creating portfolio position:', posError);
      return NextResponse.json({ error: posError.message }, { status: 500 });
    }

    // 6. Record order in portfolio_orders
    const refCode = `#000${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    try {
      await serverSupabase.from('portfolio_orders').insert([{
        user_id: effectiveUserId,
        order_ref: refCode,
        symbol: cleanSym,
        side: 'BUY',
        order_type: 'Limit',
        quantity: rawShares,
        price: rawPrice,
        total_amount: rawShares * rawPrice,
        currency: currency || (market === 'US' ? 'USD' : 'TRY'),
        status: 'FILLED',
        filled_at: new Date().toISOString(),
        notes: notes || 'Imported via Dividend / Portfolio Module',
      }]);
    } catch (ordErr) {
      console.warn('Could not record order history:', ordErr);
    }

    return NextResponse.json(
      {
        success: true,
        position: posData,
        symbol: cleanSym,
        shares: rawShares,
        entryPrice: rawPrice,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Portfolio Positions API error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
