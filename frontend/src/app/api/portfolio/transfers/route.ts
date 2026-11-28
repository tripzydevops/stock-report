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

    const rawType = String(body.transferType || body.type || 'DEPOSIT').trim().toUpperCase();
    const resolvedType = ALLOWED_TRANSFER_TYPES.includes(rawType as any) ? rawType : 'DEPOSIT';

    const rawAmount = Number(body.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return NextResponse.json(
        { error: 'Transfer amount must be a positive number.' },
        { status: 400 }
      );
    }

    const currency = String(body.currency || 'TRY').trim().toUpperCase();
    if (!['TRY', 'USD', 'EUR'].includes(currency)) {
      return NextResponse.json(
        { error: `Invalid currency '${currency}'. Allowed: TRY, USD, EUR.` },
        { status: 400 }
      );
    }

    const transferDate = body.transferDate || new Date().toISOString().slice(0, 10);
    const clientOrderId = body.client_order_id || idempotencyHeader || null;
    const notes = body.notes || (clientOrderId ? `[IDEM:${clientOrderId}] Cash transfer` : 'Cash transfer');

    // 2. Idempotency Check: Avoid duplicate transfers with identical clientOrderId tag
    if (clientOrderId) {
      const { data: existingTransfer } = await authSupabase
        .from('portfolio_transfers')
        .select('*')
        .eq('user_id', user.id)
        .ilike('notes', `%[IDEM:${clientOrderId}]%`)
        .maybeSingle();

      if (existingTransfer) {
        return NextResponse.json(
          {
            success: true,
            deduplicated: true,
            transfer: existingTransfer,
            message: 'Duplicate cash transfer suppressed via idempotency check.',
          },
          { status: 200 }
        );
      }
    }

    // 3. Insert into Supabase
    const taggedNotes = clientOrderId && !notes.includes(`[IDEM:${clientOrderId}]`)
      ? `[IDEM:${clientOrderId}] ${notes}`
      : notes;

    const { data: insertedTransfer, error: insertError } = await authSupabase
      .from('portfolio_transfers')
      .insert([
        {
          user_id: user.id,
          transfer_type: resolvedType,
          amount: rawAmount,
          currency,
          transfer_date: transferDate,
          notes: taggedNotes,
        },
      ])
      .select('*')
      .single();

    if (insertError) {
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
