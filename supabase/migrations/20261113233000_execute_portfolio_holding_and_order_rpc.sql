-- Migration: 20261113233000_execute_portfolio_holding_and_order_rpc.sql
-- Description: Transactional Postgres RPC for atomic portfolio position & order creation,
--              handling DCA position merging and enforcing user authorization.

CREATE OR REPLACE FUNCTION public.execute_portfolio_holding_and_order(
    p_user_id UUID,
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
    p_status VARCHAR(20) DEFAULT 'Filled'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pos_id UUID;
    v_existing_quantity NUMERIC(18,6);
    v_existing_price NUMERIC(18,6);
    v_new_quantity NUMERIC(18,6);
    v_new_avg_price NUMERIC(18,6);
    v_order_ref VARCHAR(50);
    v_pos_record RECORD;
    v_order_record RECORD;
BEGIN
    -- 1. Security Assertion: caller must match p_user_id unless superuser or internal service
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Authorization violation: Cannot write holding for another user';
    END IF;

    -- 2. Strict Input Validation
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity: Must be strictly positive (> 0)';
    END IF;

    IF p_price IS NULL OR p_price <= 0 THEN
        RAISE EXCEPTION 'Invalid price: Must be strictly positive (> 0)';
    END IF;

    IF p_symbol IS NULL OR length(trim(p_symbol)) = 0 THEN
        RAISE EXCEPTION 'Invalid symbol: Symbol string is required';
    END IF;

    -- 3. Deterministic / Secure Order Reference
    IF p_order_ref IS NULL OR length(trim(p_order_ref)) = 0 THEN
        v_order_ref := 'ORD-' || to_char(COALESCE(p_executed_at, NOW()), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    ELSE
        v_order_ref := trim(p_order_ref);
    END IF;

    -- 4. Check for existing open position for this user and asset (DCA merging)
    SELECT id, quantity, avg_entry_price
    INTO v_pos_id, v_existing_quantity, v_existing_price
    FROM public.portfolio_positions
    WHERE user_id = p_user_id AND asset_id = p_asset_id AND is_open = TRUE
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
            p_user_id,
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

    -- 5. Insert corresponding executed order within the same atomic transaction
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
        p_user_id,
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

    -- 6. Return combined record
    RETURN jsonb_build_object(
        'success', TRUE,
        'position', to_jsonb(v_pos_record),
        'order', to_jsonb(v_order_record)
    );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.execute_portfolio_holding_and_order TO authenticated;
