import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedSupabase, getServerSupabase } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const ALLOWED_MARKETS = ['BIST', 'US', 'TEFAS'] as const;
type AllowedMarket = typeof ALLOWED_MARKETS[number];

/**
 * Server-side validated, genuinely transactional portfolio position & order creation.
 * Strict Architecture Guarantees:
 * 1. Immediate Session Authentication check at the very top (HTTP 401 on unauthenticated).
 * 2. User ownership strictly bound to verified user.id (no body userId spoofing, no admin fallback).
 * 3. Enforces Row Level Security via request-scoped authenticated client (authSupabase).
 * 4. Exact symbol matching only (no fuzzy name matching).
 * 5. Atomic ledger integrity via PostgreSQL transaction function (execute_portfolio_holding_and_order).
 * 6. DCA Position Merging: If an open position exists for the asset, merges quantity and recomputes weighted entry price.
 * 7. Preserves execution date and order status (distinguishing historical imports from live orders).
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
      entryDate,
      orderDate,
      orderType = 'Limit',
      status = 'Filled',
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

    // 4. Execution Date & Order Reference
    const executionDateStr = entryDate || orderDate || new Date().toISOString().slice(0, 10);
    const executionIso = executionDateStr
      ? new Date(executionDateStr + 'T10:00:00Z').toISOString()
      : new Date().toISOString();
    const datePrefix = executionDateStr.replace(/-/g, '');
    const randomSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const orderRef = `ORD-${datePrefix}-${randomSuffix}`;

    const resolvedStop = stopLoss && Number.isFinite(stopLoss) && stopLoss > 0 ? Number(stopLoss) : null;
    const resolvedTarget = targetPrice && Number.isFinite(targetPrice) && targetPrice > 0 ? Number(targetPrice) : null;
    const resolvedCurrency = currency || (resolvedMarket === 'US' ? 'USD' : 'TRY');

    // 5. Genuinely Atomic Transaction: Call PostgreSQL RPC Function
    // Inserts or merges position and records executed order in a single ACID transaction
    const { data: rpcResult, error: rpcError } = await authSupabase.rpc(
      'execute_portfolio_holding_and_order',
      {
        p_user_id: effectiveUserId,
        p_asset_id: assetId,
        p_symbol: cleanSym,
        p_quantity: rawShares,
        p_price: rawPrice,
        p_side: 'BUY',
        p_order_type: orderType || 'Limit',
        p_currency: resolvedCurrency,
        p_entry_date: executionDateStr,
        p_executed_at: executionIso,
        p_stop_loss: resolvedStop,
        p_target_price: resolvedTarget,
        p_notes: notes || (isDividend ? 'Strategy: CORE_DIVIDEND' : 'Active holding'),
        p_order_ref: orderRef,
        p_status: status || 'Filled',
      }
    );

    if (rpcError) {
      console.error('PostgreSQL transaction RPC error in execute_portfolio_holding_and_order:', rpcError);
      return NextResponse.json(
        { error: `Database transaction failed: ${rpcError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        position: rpcResult?.position,
        order: rpcResult?.order,
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
