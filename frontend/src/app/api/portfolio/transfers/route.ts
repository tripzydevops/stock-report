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

    // 2. Direct insert with client_order_id column
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
      // 23505 = unique_violation: A concurrent or earlier request already inserted this client_order_id
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
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg || 'Internal Server Error' }, { status: 500 });
  }
}
