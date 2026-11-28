import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

const ALLOWED_TRANSFER_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'TAX', 'FEE'] as const;

/**
 * Server-side validated cash transfers (deposit/withdraw) endpoint with idempotency support.
 */
export async function POST(request: NextRequest) {
  try {
    const authSupabase = getAuthenticatedSupabase(request);

    // 1. Session Auth Guard
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Please log in to manage cash transfers.' },
        { status: 401 }
      );
    }

    const idempotencyHeader = request.headers.get('Idempotency-Key') || request.headers.get('x-idempotency-key');
    const body = await request.json().catch(() => ({}));

    // 2. Strict Input Validation
    const rawType = String(body.transferType || body.type || '').trim().toUpperCase();
    if (!['DEPOSIT', 'WITHDRAWAL'].includes(rawType)) {
      return NextResponse.json(
        { error: `Invalid transfer type '${rawType}'. Allowed types: DEPOSIT, WITHDRAWAL.` },
        { status: 400 }
      );
    }
    const resolvedType = rawType as 'DEPOSIT' | 'WITHDRAWAL';

    const rawAmount = Number(body.amount);
    const MAX_TRANSFER_AMOUNT = 1_000_000_000; // 1 Billion ceiling
    if (!Number.isFinite(rawAmount) || rawAmount <= 0 || rawAmount > MAX_TRANSFER_AMOUNT) {
      return NextResponse.json(
        { error: `Transfer amount must be a positive number up to ${MAX_TRANSFER_AMOUNT.toLocaleString()}.` },
        { status: 400 }
      );
    }

    const currency = String(body.currency || 'TRY').trim().toUpperCase();
    if (!['TRY', 'USD', 'EUR'].includes(currency)) {
      return NextResponse.json(
        { error: `Invalid currency '${currency}'. Allowed currencies: TRY, USD, EUR.` },
        { status: 400 }
      );
    }

    const rawDate = body.transferDate ? String(body.transferDate).trim() : new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json(
        { error: `Invalid transfer date format '${rawDate}'. Expected ISO YYYY-MM-DD format.` },
        { status: 400 }
      );
    }
    const parsedDate = new Date(`${rawDate}T00:00:00Z`);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: `Invalid calendar date '${rawDate}'.` },
        { status: 400 }
      );
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    if (rawDate > todayIso) {
      return NextResponse.json(
        { error: `Future transfer date '${rawDate}' is not allowed. Transfers must be today or earlier.` },
        { status: 400 }
      );
    }
    const transferDate = rawDate;

    const rawClientOrderId = body.client_order_id || idempotencyHeader || null;
    const clientOrderId = rawClientOrderId ? String(rawClientOrderId).trim() : null;
    if (clientOrderId && clientOrderId.length > 128) {
      return NextResponse.json(
        { error: 'client_order_id exceeds maximum permitted length of 128 characters.' },
        { status: 400 }
      );
    }

    const rawNotes = typeof body.notes === 'string' ? body.notes.trim() : null;
    if (rawNotes && rawNotes.length > 500) {
      return NextResponse.json(
        { error: 'notes exceeds maximum permitted length of 500 characters.' },
        { status: 400 }
      );
    }
    const notes = rawNotes;

    // 3. Atomic Execution via RPC (with direct insert fallback)
    const { data: rpcResult, error: rpcError } = await authSupabase.rpc('execute_portfolio_cash_transfer', {
      p_transfer_type: resolvedType,
      p_amount: rawAmount,
      p_currency: currency,
      p_transfer_date: transferDate,
      p_notes: notes,
      p_client_order_id: clientOrderId,
    });

    if (rpcError) {
      if (rpcError.message?.includes('INSUFFICIENT_CASH')) {
        return NextResponse.json(
          { error: rpcError.message, code: 'INSUFFICIENT_CASH' },
          { status: 400 }
        );
      }

      // If function is not yet created in remote DB, fallback to validated direct insert
      if (rpcError.message?.includes('function') && rpcError.message?.includes('does not exist')) {
        // Enforce application-level solvency pre-check if withdrawing
        if (resolvedType === 'WITHDRAWAL') {
          const { data: allTransfers } = await authSupabase
            .from('portfolio_transfers')
            .select('amount, transfer_type, currency')
            .eq('user_id', user.id);
          const { data: allOrders } = await authSupabase
            .from('portfolio_orders')
            .select('total_amount, side, currency, status')
            .eq('user_id', user.id)
            .eq('status', 'Filled');

          let runningCash = 0;
          for (const t of allTransfers || []) {
            if (t.currency?.toUpperCase() === currency) {
              if (['DEPOSIT', 'DIVIDEND'].includes(t.transfer_type)) runningCash += Number(t.amount);
              else if (['WITHDRAWAL', 'TAX', 'FEE'].includes(t.transfer_type)) runningCash -= Number(t.amount);
            }
          }
          for (const o of allOrders || []) {
            if (o.currency?.toUpperCase() === currency) {
              if (o.side === 'SELL') runningCash += Number(o.total_amount);
              else if (o.side === 'BUY') runningCash -= Number(o.total_amount);
            }
          }

          if (rawAmount > runningCash) {
            return NextResponse.json(
              {
                error: `INSUFFICIENT_CASH: Available balance (${Math.max(0, runningCash).toFixed(2)} ${currency}) is insufficient for withdrawal of ${rawAmount.toFixed(2)} ${currency}.`,
                code: 'INSUFFICIENT_CASH',
                availableCash: Math.max(0, runningCash),
              },
              { status: 400 }
            );
          }
        }

        const { data: insertedTransfer, error: insertError } = await authSupabase
          .from('portfolio_transfers')
          .insert([
            {
              user_id: user.id,
              transfer_type: resolvedType,
              amount: rawAmount,
              currency,
              transfer_date: transferDate,
              notes,
              client_order_id: clientOrderId,
            },
          ])
          .select('*')
          .single();

        if (insertError) {
          const isUniqueViolation =
            insertError.code === '23505' ||
            insertError.message?.includes('duplicate key') ||
            insertError.message?.includes('idx_portfolio_transfers_user_client_order_id');

          if (isUniqueViolation && clientOrderId) {
            const { data: existingTransfer } = await authSupabase
              .from('portfolio_transfers')
              .select('*')
              .eq('user_id', user.id)
              .eq('client_order_id', clientOrderId)
              .maybeSingle();

            if (existingTransfer) {
              return NextResponse.json(
                {
                  success: true,
                  deduplicated: true,
                  transfer: existingTransfer,
                  message: 'Duplicate cash transfer suppressed via database unique constraint.',
                },
                { status: 200 }
              );
            }
          }
          return NextResponse.json(
            { error: `Failed to record cash transfer: ${insertError.message}` },
            { status: 500 }
          );
        }

        return NextResponse.json(
          {
            success: true,
            transfer: insertedTransfer,
            transferType: resolvedType,
            amount: rawAmount,
            currency,
          },
          { status: 201 }
        );
      }

      return NextResponse.json(
        { error: `Cash transfer transaction failed: ${rpcError.message}` },
        { status: 500 }
      );
    }

    if (rpcResult?.deduplicated === true) {
      return NextResponse.json(
        {
          success: true,
          deduplicated: true,
          transfer: rpcResult.transfer,
          message: rpcResult.message || 'Duplicate cash transfer suppressed via database idempotency.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        transferId: rpcResult?.transfer_id,
        transferType: resolvedType,
        amount: rawAmount,
        currency,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Internal Server Error' }, { status: 500 });
  }
}
