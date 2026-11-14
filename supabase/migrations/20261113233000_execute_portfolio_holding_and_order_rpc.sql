-- Migration: 20261113233000_execute_portfolio_holding_and_order_rpc.sql
-- Description: Transactional Postgres RPC for atomic portfolio position, order creation & auto-funding,
--              handling DCA position merging, strict auth.uid() identity derivation, and check constraints.

-- 1. Order status check constraint
ALTER TABLE public.portfolio_orders
    DROP CONSTRAINT IF EXISTS portfolio_orders_status_check;

ALTER TABLE public.portfolio_orders
    ADD CONSTRAINT portfolio_orders_status_check
    CHECK (status IN ('Filled', 'Pending', 'Cancelled', 'Rejected'));

-- 2. Drop older variants to avoid ambiguity
DROP FUNCTION IF EXISTS public.execute_portfolio_holding_and_order(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.execute_portfolio_holding_and_order(UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT, VARCHAR, VARCHAR, NUMERIC);

-- 3. Hardened RPC: Derives user_id exclusively from auth.uid() (no client-supplied userId)
CREATE OR REPLACE FUNCTION public.execute_portfolio_holding_and_order(
    p_asset_id UUID,
    p_symbol VARCHAR(20),
    p_quantity NUMERIC(18,6),
    p_price NUMERIC(18,6),
    p_side VARCHAR(10) DEFAULT 'BUY',
    p_order_type VARCHAR(20) DEFAULT 'Limit',
    p_currency VARCHAR(10) DEFAULT 'TRY',
    p_entry_date DATE DEFAULT CURRENT_DATE,
    p_executed_at TIMESTAMPTZ DEFAULT NOW(),
    p_stop_loss NUMERIC(18,6) DEFAULT NULL,
    p_target_price NUMERIC(18,6) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_order_ref VARCHAR(50) DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'Filled',
    p_auto_deposit_amount NUMERIC(18,6) DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_pos_id UUID;
    v_existing_quantity NUMERIC(18,6);
    v_existing_price NUMERIC(18,6);
    v_new_quantity NUMERIC(18,6);
    v_new_avg_price NUMERIC(18,6);
    v_order_ref VARCHAR(50);
    v_pos_record RECORD;
    v_order_record RECORD;
    v_transfer_record RECORD;
BEGIN
    -- 1. Security Assertion: Caller must be authenticated; identity derived solely from auth.uid()
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: auth.uid() is null';
    END IF;

    -- 2. Strict Input Validation
    IF p_status NOT IN ('Filled', 'Pending', 'Cancelled', 'Rejected') THEN
        RAISE EXCEPTION 'Invalid order status. Allowed: Filled, Pending, Cancelled, Rejected';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity: Must be strictly positive (> 0)';
    END IF;

    IF p_price IS NULL OR p_price <= 0 THEN
        RAISE EXCEPTION 'Invalid price: Must be strictly positive (> 0)';
    END IF;

    IF p_symbol IS NULL OR length(trim(p_symbol)) = 0 THEN
        RAISE EXCEPTION 'Invalid symbol: Symbol string is required';
    END IF;

    -- 3. Atomic Auto-Deposit (if required to cover cash shortfall)
    IF p_auto_deposit_amount IS NOT NULL AND p_auto_deposit_amount > 0 THEN
        INSERT INTO public.portfolio_transfers (
            user_id,
            transfer_type,
            amount,
            currency,
            transfer_date,
            notes
        ) VALUES (
            v_user_id,
            'DEPOSIT',
            p_auto_deposit_amount,
            p_currency,
            COALESCE(p_entry_date, CURRENT_DATE),
            'Auto-deposit: Funded position ' || trim(upper(p_symbol))
        )
        RETURNING * INTO v_transfer_record;
    END IF;

    -- 4. Deterministic / Secure Order Reference
    IF p_order_ref IS NULL OR length(trim(p_order_ref)) = 0 THEN
        v_order_ref := 'ORD-' || to_char(COALESCE(p_executed_at, NOW()), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    ELSE
        v_order_ref := trim(p_order_ref);
    END IF;

    -- 5. Check for existing open position for this user and asset (DCA merging)
    SELECT id, quantity, avg_entry_price
    INTO v_pos_id, v_existing_quantity, v_existing_price
    FROM public.portfolio_positions
    WHERE user_id = v_user_id AND asset_id = p_asset_id AND is_open = TRUE
    FOR UPDATE;

    IF FOUND THEN
        IF p_side = 'BUY' THEN
            v_new_quantity := v_existing_quantity + p_quantity;
            v_new_avg_price := round(((v_existing_quantity * v_existing_price) + (p_quantity * p_price)) / v_new_quantity, 4);
            
            UPDATE public.portfolio_positions
            SET 
                quantity = v_new_quantity,
                avg_entry_price = v_new_avg_price,
                stop_loss = COALESCE(p_stop_loss, stop_loss),
                target_price = COALESCE(p_target_price, target_price),
                notes = COALESCE(p_notes, notes),
                updated_at = NOW()
            WHERE id = v_pos_id
            RETURNING * INTO v_pos_record;
        ELSE
            -- SELL execution: reduce quantity
            v_new_quantity := v_existing_quantity - p_quantity;
            IF v_new_quantity <= 0 THEN
                UPDATE public.portfolio_positions
                SET quantity = 0, is_open = FALSE, updated_at = NOW()
                WHERE id = v_pos_id
                RETURNING * INTO v_pos_record;
            ELSE
                UPDATE public.portfolio_positions
                SET quantity = v_new_quantity, updated_at = NOW()
                WHERE id = v_pos_id
                RETURNING * INTO v_pos_record;
            END IF;
        END IF;
    ELSE
        -- Insert fresh open position
        IF p_side = 'SELL' THEN
            RAISE EXCEPTION 'Cannot execute SELL order on non-existent position';
        END IF;

        INSERT INTO public.portfolio_positions (
            user_id,
            asset_id,
            quantity,
            avg_entry_price,
            entry_date,
            stop_loss,
            target_price,
            notes,
            is_open
        ) VALUES (
            v_user_id,
            p_asset_id,
            p_quantity,
            p_price,
            COALESCE(p_entry_date, CURRENT_DATE),
            p_stop_loss,
            p_target_price,
            p_notes,
            TRUE
        )
        RETURNING * INTO v_pos_record;
    END IF;

    -- 6. Insert corresponding executed order within the same atomic transaction
    INSERT INTO public.portfolio_orders (
        user_id,
        order_ref,
        symbol,
        side,
        order_type,
        quantity,
        price,
        total_amount,
        currency,
        executed_at,
        status,
        notes
    ) VALUES (
        v_user_id,
        v_order_ref,
        trim(upper(p_symbol)),
        p_side,
        p_order_type,
        p_quantity,
        p_price,
        round(p_quantity * p_price, 4),
        p_currency,
        COALESCE(p_executed_at, NOW()),
        p_status,
        p_notes
    )
    RETURNING * INTO v_order_record;

    -- 7. Return combined record
    RETURN jsonb_build_object(
        'success', TRUE,
        'position', to_jsonb(v_pos_record),
        'order', to_jsonb(v_order_record),
        'transfer', CASE WHEN v_transfer_record IS NOT NULL THEN to_jsonb(v_transfer_record) ELSE NULL END
    );
END;
$$;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.execute_portfolio_holding_and_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_portfolio_holding_and_order TO service_role;
