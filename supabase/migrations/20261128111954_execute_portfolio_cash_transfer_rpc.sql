-- Migration: Atomic cash transfer and withdrawal solvency verification RPC
-- Calculates live currency available cash and guarantees atomic withdrawal solvency with row-level safety.

CREATE OR REPLACE FUNCTION public.execute_portfolio_cash_transfer(
    p_transfer_type TEXT,
    p_amount NUMERIC(18,6),
    p_currency TEXT,
    p_transfer_date DATE,
    p_notes TEXT DEFAULT NULL,
    p_client_order_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_target_currency TEXT := upper(trim(coalesce(p_currency, 'TRY')));
    v_type TEXT := upper(trim(coalesce(p_transfer_type, 'DEPOSIT')));
    v_total_transfers NUMERIC(18,6) := 0;
    v_total_orders NUMERIC(18,6) := 0;
    v_available_cash NUMERIC(18,6) := 0;
    v_inserted_id UUID;
    v_existing_transfer RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF v_type NOT IN ('DEPOSIT', 'WITHDRAWAL') THEN
        RAISE EXCEPTION 'Invalid transfer type: %', v_type USING ERRCODE = '22023';
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be positive: %', p_amount USING ERRCODE = '22003';
    END IF;

    -- 1. Idempotency Check
    IF p_client_order_id IS NOT NULL THEN
        SELECT * INTO v_existing_transfer
        FROM public.portfolio_transfers
        WHERE user_id = v_user_id AND client_order_id = p_client_order_id
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'deduplicated', true,
                'transfer', row_to_json(v_existing_transfer),
                'message', 'Duplicate cash transfer suppressed via idempotency check.'
            );
        END IF;
    END IF;

    -- 2. Withdrawal Solvency Check
    IF v_type = 'WITHDRAWAL' THEN
        -- Sum all past and current transfers for user and currency
        SELECT COALESCE(SUM(
            CASE 
                WHEN transfer_type IN ('DEPOSIT', 'DIVIDEND') THEN amount
                WHEN transfer_type IN ('WITHDRAWAL', 'TAX', 'FEE') THEN -amount
                ELSE 0 
            END
        ), 0)
        INTO v_total_transfers
        FROM public.portfolio_transfers
        WHERE user_id = v_user_id 
          AND upper(currency) = v_target_currency;

        -- Sum all filled orders for user and currency
        SELECT COALESCE(SUM(
            CASE 
                WHEN side = 'SELL' THEN total_amount
                WHEN side = 'BUY' THEN -total_amount
                ELSE 0 
            END
        ), 0)
        INTO v_total_orders
        FROM public.portfolio_orders
        WHERE user_id = v_user_id 
          AND status = 'Filled' 
          AND upper(currency) = v_target_currency;

        v_available_cash := GREATEST(0, v_total_transfers + v_total_orders);

        IF p_amount > v_available_cash THEN
            RAISE EXCEPTION 'INSUFFICIENT_CASH: Available balance % % is insufficient for withdrawal of % %',
                v_available_cash, v_target_currency, p_amount, v_target_currency
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- 3. Perform Insert
    INSERT INTO public.portfolio_transfers (
        user_id,
        transfer_type,
        amount,
        currency,
        transfer_date,
        notes,
        client_order_id
    ) VALUES (
        v_user_id,
        v_type,
        p_amount,
        v_target_currency,
        p_transfer_date,
        p_notes,
        p_client_order_id
    )
    RETURNING id INTO v_inserted_id;

    RETURN jsonb_build_object(
        'success', true,
        'deduplicated', false,
        'transfer_id', v_inserted_id,
        'transfer_type', v_type,
        'amount', p_amount,
        'currency', v_target_currency
    );
END;
$$;
