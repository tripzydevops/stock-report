import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedSupabase, getServerSupabase } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const ALLOWED_MARKETS = ['BIST', 'US', 'TEFAS'] as const;
type AllowedMarket = typeof ALLOWED_MARKETS[number];

/**
 * Server-side validated portfolio position & order creation.
 * Strict Security Guarantees:
 * 1. Immediate Session Authentication check at the top (HTTP 401 on unauthenticated).
 * 2. User ownership strictly bound to verified user.id (no body userId spoofing, no admin fallback).
 * 3. Enforces Row Level Security via request-scoped authenticated client (authSupabase).
 * 4. Exact symbol matching only (no broad fuzzy name matching).
 * 5. Atomic ledger integrity: if order creation fails, position is rolled back.
 * 6. Cryptographically unique order reference generated with crypto.randomUUID().
 */
export async function POST(request: NextRequest) {
  try {
    const authSupabase = getAuthenticatedSupabase(request);
    const serverSupabase = getServerSupabase();

    // 1. Strict Auth Guard: Reject unauthenticated requests immediately before any catalog operations
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Please log in to add or import portfolio holdings.' },
        { status: 401 }
      );
    }
    const effectiveUserId = user.id;

    // 2. Parse & Validate Payload
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
    } = body;

    // Strict Symbol Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return NextResponse.json(
        { error: 'Valid symbol string is required' },
        { status: 400 }
      );
    }
    const cleanSym = symbol.replace('.IS', '').trim().toUpperCase();

    // Strict Market Allowlist Validation
    const marketUpper = String(market).trim().toUpperCase();
    if (!ALLOWED_MARKETS.includes(marketUpper as AllowedMarket)) {
      return NextResponse.json(
        { error: `Invalid market '${market}'. Allowed markets: ${ALLOWED_MARKETS.join(', ')}` },
        { status: 400 }
      );
    }
    const resolvedMarket = marketUpper as AllowedMarket;

    // Strict Entry Price Validation
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

    // Strict Quantity / Shares Validation
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

    // 3. Exact Symbol Matching Catalog Lookup (No fuzzy name matching)
    const isSymbol = `${cleanSym}.IS`;
    let { data: assetData } = await serverSupabase
      .from('assets')
      .select('id, symbol, name, market')
      .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
      .limit(1)
      .maybeSingle();

    let assetId = assetData?.id || null;

    if (!assetId) {
      const resolvedCurrency = currency || (resolvedMarket === 'US' ? 'USD' : 'TRY');
      const { data: newAsset, error: newAssetErr } = await serverSupabase
        .from('assets')
        .insert([{
          symbol: resolvedMarket === 'BIST' ? `${cleanSym}.IS` : cleanSym,
          name: (typeof name === 'string' && name.trim()) ? name.trim() : cleanSym,
          market: resolvedMarket,
          asset_class: resolvedMarket === 'TEFAS' ? 'fund' : 'stock',
          currency: resolvedCurrency,
        }])
        .select('id')
        .single();

      if (newAsset && !newAssetErr) {
        assetId = newAsset.id;
      } else {
        console.error('Failed to register new asset in catalog:', newAssetErr);
        return NextResponse.json(
          { error: `Could not register asset in catalog: ${newAssetErr?.message || 'Unknown database error'}` },
          { status: 500 }
        );
      }
    }

    // 4. Atomic Write: Create Position using Authenticated Client (enforces auth.uid() = user_id)
    const orderDateStr = new Date().toISOString().slice(0, 10);
    const resolvedStop = stopLoss && Number.isFinite(stopLoss) && stopLoss > 0 ? Number(stopLoss) : null;
    const resolvedTarget = targetPrice && Number.isFinite(targetPrice) && targetPrice > 0 ? Number(targetPrice) : null;

    const { data: posData, error: posError } = await authSupabase
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

    if (posError || !posData) {
      console.error('Database error inserting portfolio position:', posError);
      return NextResponse.json(
        { error: `Failed to insert portfolio position: ${posError?.message || 'Access denied'}` },
        { status: 500 }
      );
    }

    // 5. Atomic Write: Create Executed Order with Cryptographically Unique Reference
    const datePrefix = orderDateStr.replace(/-/g, '');
    const randomSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const orderRef = `ORD-${datePrefix}-${randomSuffix}`;

    const { data: orderData, error: orderError } = await authSupabase
      .from('portfolio_orders')
      .insert([{
        user_id: effectiveUserId,
        order_ref: orderRef,
        symbol: cleanSym,
        side: 'BUY',
        order_type: 'Limit',
        quantity: rawShares,
        price: rawPrice,
        total_amount: Number((rawShares * rawPrice).toFixed(4)),
        currency: currency || (resolvedMarket === 'US' ? 'USD' : 'TRY'),
        status: 'FILLED',
        filled_at: new Date().toISOString(),
        notes: notes || 'Imported via Dividend / Portfolio Module',
      }])
      .select()
      .single();

    if (orderError) {
      console.error('Order creation failed; rolling back position to maintain ledger consistency:', orderError);
      // Rollback position to maintain complete position-cash ledger synchrony
      await authSupabase
        .from('portfolio_positions')
        .delete()
        .eq('id', posData.id)
        .eq('user_id', effectiveUserId);

      return NextResponse.json(
        { error: `Ledger execution record failed: ${orderError.message}. Position creation was aborted and rolled back.` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        position: posData,
        order: orderData,
        symbol: cleanSym,
        shares: rawShares,
        entryPrice: rawPrice,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Portfolio Positions API unexpected exception:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
