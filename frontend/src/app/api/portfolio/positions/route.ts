import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedSupabase, getServerSupabase } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const ALLOWED_MARKETS = ['BIST', 'US', 'TEFAS'] as const;
type AllowedMarket = typeof ALLOWED_MARKETS[number];

const ALLOWED_ORDER_STATUSES = ['Filled', 'Pending', 'Cancelled', 'Rejected'] as const;
type AllowedOrderStatus = typeof ALLOWED_ORDER_STATUSES[number];

const ALLOWED_SIDES = ['BUY', 'SELL'] as const;
type AllowedSide = typeof ALLOWED_SIDES[number];

/**
 * Server-side validated, genuinely transactional portfolio position & order creation/execution.
 * Strict Architecture Guarantees:
 * 1. Immediate Session Authentication check at the very top (HTTP 401 on unauthenticated).
 * 2. User ownership strictly derived inside PostgreSQL RPC via auth.uid() (zero client-side spoofing).
 * 3. Enforces Row Level Security via request-scoped authenticated client (authSupabase).
 * 4. Exact symbol matching only (no fuzzy name matching).
 * 5. Atomic ledger integrity via PostgreSQL transaction function (execute_portfolio_holding_and_order).
 * 6. Server-Side Cash Shortfall Calculation: Database computes required deposit from user's live ledger; client-injected amounts are ignored.
 * 7. Dual Side Support: Atomically handles BUY (DCA position merge) and SELL (balance validation, exit/reduction, cost netting).
 * 8. Explicit Order Status: Requires explicit status for live orders; defaults to 'Filled' only when isHistoricalImport is true.
 */
export async function POST(request: NextRequest) {
  try {
    const authSupabase = getAuthenticatedSupabase(request);
    const serverSupabase = getServerSupabase();

    // 1. Strict Auth Guard: Reject unauthenticated requests immediately before any catalog operations
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Please log in to add, sell, or import portfolio holdings.' },
        { status: 401 }
      );
    }

    // 2. Parse & Validate Payload
    const idempotencyHeader = request.headers.get('Idempotency-Key') || request.headers.get('x-idempotency-key');
    const body = await request.json().catch(() => ({}));
    const {
      symbol,
      shares,
      quantity,
      price,
      entryPrice,
      side = 'BUY',
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
      status,
      isHistoricalImport,
      autoFund = true,
      reduceCostBasis = false,
      costBasis,
      client_order_id,
      idempotency_key,
    } = body;

    const rawIdempotency = idempotencyHeader || idempotency_key || client_order_id;
    const sanitizedIdempotencyKey = rawIdempotency && typeof rawIdempotency === 'string'
      ? rawIdempotency.trim().slice(0, 64)
      : null;

    // Strict Market Allowlist Validation
    const marketUpper = String(market).trim().toUpperCase();
    if (!ALLOWED_MARKETS.includes(marketUpper as AllowedMarket)) {
      return NextResponse.json(
        { error: `Invalid market '${market}'. Allowed markets: ${ALLOWED_MARKETS.join(', ')}` },
        { status: 400 }
      );
    }
    const resolvedMarket = marketUpper as AllowedMarket;

    // Strict Symbol Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      return NextResponse.json(
        { error: 'Valid symbol string is required' },
        { status: 400 }
      );
    }
    const cleanSym = symbol.replace(/\.IS$/i, '').trim().toUpperCase();
    const DISALLOWED_SYMBOLS = new Set([
      'UNKNOWN', 'UNDEFINED', 'NULL', 'NONE', 'N/A', 'NA', 'TBD', 'TEST', 'STOCK', 'EMPTY', 'INVALID'
    ]);
    if (DISALLOWED_SYMBOLS.has(cleanSym)) {
      return NextResponse.json(
        { error: `Invalid symbol '${symbol}'. Placeholders and generic labels are not allowed.` },
        { status: 400 }
      );
    }

    if (resolvedMarket === 'BIST') {
      if (!/^[A-Z0-9]{3,7}$/.test(cleanSym)) {
        return NextResponse.json(
          { error: `Invalid BIST symbol format '${symbol}'. Expected 3-7 alphanumeric characters (e.g., THYAO, TKFEN, ISMEN).` },
          { status: 400 }
        );
      }
    } else if (resolvedMarket === 'US') {
      if (!/^[A-Z]{1,5}$/.test(cleanSym)) {
        return NextResponse.json(
          { error: `Invalid US symbol format '${symbol}'. Expected 1-5 letters (e.g., AAPL, NVDA, SPY).` },
          { status: 400 }
        );
      }
    } else if (resolvedMarket === 'TEFAS') {
      if (!/^[A-Z0-9]{3,5}$/.test(cleanSym)) {
        return NextResponse.json(
          { error: `Invalid TEFAS fund code format '${symbol}'. Expected 3-5 alphanumeric characters (e.g., ZBJ, TI2).` },
          { status: 400 }
        );
      }
    }

    // Strict Side Validation
    const sideUpper = String(side).trim().toUpperCase();
    if (!ALLOWED_SIDES.includes(sideUpper as AllowedSide)) {
      return NextResponse.json(
        { error: `Invalid side '${side}'. Allowed sides: ${ALLOWED_SIDES.join(', ')}` },
        { status: 400 }
      );
    }
    const resolvedSide = sideUpper as AllowedSide;

    // Strict Order Status Validation:
    // Live orders must explicitly declare status (e.g. 'Filled' or 'Pending').
    // Only historical imports default to 'Filled' if omitted.
    let resolvedStatus: string;
    if (status && typeof status === 'string' && status.trim()) {
      resolvedStatus = status.trim();
    } else if (isHistoricalImport === true) {
      resolvedStatus = 'Filled';
    } else {
      return NextResponse.json(
        { error: 'Order status is required for live orders (e.g. Filled, Pending).' },
        { status: 400 }
      );
    }

    if (!ALLOWED_ORDER_STATUSES.includes(resolvedStatus as AllowedOrderStatus)) {
      return NextResponse.json(
        { error: `Invalid status '${resolvedStatus}'. Allowed statuses: ${ALLOWED_ORDER_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

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
          error: 'Invalid price: price must be a finite, strictly positive number (> 0). Zero, negative, and missing prices are rejected.',
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

    // 4. Execution Date & Order Reference (with Idempotency Protection)
    if (sanitizedIdempotencyKey) {
      const { data: existingOrder } = await serverSupabase
        .from('portfolio_orders')
        .select('*')
        .eq('user_id', user.id)
        .eq('order_ref', sanitizedIdempotencyKey)
        .maybeSingle();

      if (existingOrder) {
        console.log(JSON.stringify({
          event: 'portfolio_order_deduplicated',
          userId: user.id,
          orderRef: sanitizedIdempotencyKey,
          symbol: existingOrder.symbol,
          side: existingOrder.side,
          quantity: existingOrder.quantity,
          price: existingOrder.price,
        }));

        return NextResponse.json(
          {
            success: true,
            deduplicated: true,
            order: existingOrder,
            symbol: existingOrder.symbol,
            shares: Number(existingOrder.quantity),
            entryPrice: Number(existingOrder.price),
            side: existingOrder.side,
            currency: existingOrder.currency,
            message: 'Duplicate order suppressed via idempotency key.',
          },
          { status: 200 }
        );
      }
    }

    const executionDateStr = entryDate || orderDate || new Date().toISOString().slice(0, 10);
    const executionIso = executionDateStr
      ? new Date(executionDateStr + 'T10:00:00Z').toISOString()
      : new Date().toISOString();
    const datePrefix = executionDateStr.replace(/-/g, '');
    const randomSuffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const orderRef = sanitizedIdempotencyKey || `ORD-${datePrefix}-${randomSuffix}`;

    const resolvedStop = stopLoss && Number.isFinite(stopLoss) && stopLoss > 0 ? Number(stopLoss) : null;
    const resolvedTarget = targetPrice && Number.isFinite(targetPrice) && targetPrice > 0 ? Number(targetPrice) : null;
    const resolvedCurrency = currency || (resolvedMarket === 'US' ? 'USD' : 'TRY');
    const resolvedCostBasis = typeof costBasis === 'number' && Number.isFinite(costBasis) && costBasis > 0 ? Number(costBasis) : null;
    // Strict Guard against Trial Admin / Model Portfolio simulated injections
    if (notes && typeof notes === 'string') {
      const lowerNotes = notes.toLowerCase();
      if (lowerNotes.includes('trial admin') || lowerNotes.includes('eklenen pozisyon (trial admin)')) {
        return NextResponse.json(
          { error: 'Trial Admin simulated positions cannot be persisted to user accounts.' },
          { status: 400 }
        );
      }
    }

    // Strict Guard for Historical Imports (Guest Migration):
    // Never allow a historical re-import to overwrite or duplicate an asset the user already has (open or closed).
    if (isHistoricalImport === true && assetId) {
      const { data: existingPos } = await serverSupabase
        .from('portfolio_positions')
        .select('id, is_open')
        .eq('user_id', user.id)
        .eq('asset_id', assetId)
        .limit(1)
        .maybeSingle();

      if (existingPos) {
        return NextResponse.json(
          { error: `Asset '${cleanSym}' already exists in user portfolio (${existingPos.is_open ? 'open' : 'closed'}). Historical import skipped.` },
          { status: 409 }
        );
      }
    }

    // 5. Genuinely Atomic Transaction: Call PostgreSQL RPC Function
    // Inserts or merges position, records executed order, and calculates required auto-funding
    // entirely server-side in a single ACID transaction. Identity derived via auth.uid().
    const { data: rpcResult, error: rpcError } = await authSupabase.rpc(
      'execute_portfolio_holding_and_order',
      {
        p_asset_id: assetId,
        p_symbol: cleanSym,
        p_quantity: rawShares,
        p_price: rawPrice,
        p_side: resolvedSide,
        p_order_type: orderType || 'Limit',
        p_currency: resolvedCurrency,
        p_entry_date: executionDateStr,
        p_executed_at: executionIso,
        p_stop_loss: resolvedStop,
        p_target_price: resolvedTarget,
        p_notes: notes || (isDividend ? 'Strategy: CORE_DIVIDEND' : `${resolvedSide} order`),
        p_order_ref: orderRef,
        p_status: resolvedStatus,
        p_auto_fund: autoFund !== false,
        p_reduce_cost_basis: Boolean(reduceCostBasis),
        p_cost_basis: resolvedCostBasis,
      }
    );

    if (rpcError) {
      console.error(JSON.stringify({
        event: 'portfolio_mutation_failed',
        userId: user.id,
        symbol: cleanSym,
        side: resolvedSide,
        orderRef,
        error: rpcError.message,
      }));
      return NextResponse.json(
        { error: `Database transaction failed: ${rpcError.message}` },
        { status: 500 }
      );
    }

    console.log(JSON.stringify({
      event: 'portfolio_order_created',
      userId: user.id,
      symbol: cleanSym,
      side: resolvedSide,
      shares: rawShares,
      price: rawPrice,
      orderRef,
      status: resolvedStatus,
    }));

    return NextResponse.json(
      {
        success: true,
        position: rpcResult?.position,
        order: rpcResult?.order,
        transfer: rpcResult?.transfer,
        realizedPnl: rpcResult?.realized_pnl,
        shortfallDeposited: rpcResult?.shortfall_deposited,
        shortfallDepositedTRY: rpcResult?.currency === 'TRY' ? rpcResult?.shortfall_deposited : undefined,
        shortfallDepositedUSD: rpcResult?.currency === 'USD' ? rpcResult?.shortfall_deposited : undefined,
        currency: rpcResult?.currency || resolvedCurrency,
        symbol: cleanSym,
        shares: rawShares,
        entryPrice: rawPrice,
        side: resolvedSide,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error(JSON.stringify({
      event: 'portfolio_mutation_exception',
      error: err?.message || 'Internal Server Error',
    }));
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
