-- Migration: 20261118210000_harden_portfolio_rpc_reopen_and_prevent_duplicates.sql
-- Description: Updates execute_portfolio_holding_and_order RPC to re-open existing closed positions on BUY instead of inserting duplicate rows,
-- and reconciles initial BIMAS position lot tracking.

BEGIN;

CREATE OR REPLACE FUNCTION public.execute_portfolio_holding_and_order(
    p_asset_id uuid,
    p_symbol character varying,
    p_quantity numeric,
    p_price numeric,
    p_side character varying DEFAULT 'BUY'::character varying,
    p_order_type character varying DEFAULT 'Limit'::character varying,
    p_currency character varying DEFAULT 'TRY'::character varying,
    p_entry_date date DEFAULT NULL::date,
    p_executed_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_stop_loss numeric DEFAULT NULL::numeric,
    p_target_price numeric DEFAULT NULL::numeric,
    p_notes text DEFAULT NULL::text,
    p_order_ref character varying DEFAULT NULL::character varying,
    p_status character varying DEFAULT 'Filled'::character varying,
    p_auto_fund boolean DEFAULT true,
    p_reduce_cost_basis boolean DEFAULT false,
    p_cost_basis numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_pos_id UUID;
    v_existing_quantity NUMERIC;
    v_existing_price NUMERIC;
    v_existing_adjusted_break_even NUMERIC;
    v_existing_is_open BOOLEAN;
    v_new_quantity NUMERIC;
    v_new_avg_price NUMERIC;
    v_new_adjusted_break_even NUMERIC;
    v_base_cost_per_share NUMERIC;
    v_effective_cost_basis NUMERIC;
    v_realized_pnl NUMERIC := 0;
    v_remaining_cost NUMERIC;
    v_order_ref VARCHAR;
    v_pos_record RECORD;
    v_order_record RECORD;
    v_transfer_record RECORD;
    v_total_transfers NUMERIC := 0;
    v_total_orders NUMERIC := 0;
    v_available_cash NUMERIC := 0;
    v_order_cost NUMERIC := 0;
    v_shortfall NUMERIC := 0;
    v_target_currency VARCHAR;
    v_order_timestamp TIMESTAMPTZ;
BEGIN
    -- 1. Security Guard: Strictly verify caller identity via auth.uid()
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: auth.uid() is null';
    END IF;

    -- 2. Validate basic input parameters
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be strictly positive';
    END IF;

    IF p_price IS NULL OR p_price <= 0 THEN
        RAISE EXCEPTION 'Price must be strictly positive';
    END IF;

    IF p_side NOT IN ('BUY', 'SELL') THEN
        RAISE EXCEPTION 'Side must be either BUY or SELL';
    END IF;

    IF p_status NOT IN ('Filled', 'Pending', 'Cancelled', 'Rejected') THEN
        RAISE EXCEPTION 'Invalid order status: %', p_status;
    END IF;

    v_target_currency := upper(trim(COALESCE(p_currency, 'TRY')));
    IF v_target_currency NOT IN ('TRY', 'USD') THEN
        v_target_currency := 'TRY';
    END IF;

    v_order_timestamp := COALESCE(p_executed_at, COALESCE(p_entry_date, CURRENT_DATE)::timestamp with time zone);

    -- Generate order reference if not provided
    v_order_ref := COALESCE(p_order_ref, 'ORD-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 6)));

    -- 3. Non-Filled Orders (Pending, Cancelled, Rejected):
    IF p_status != 'Filled' THEN
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
            upper(trim(p_symbol)),
            p_side,
            COALESCE(p_order_type, 'Limit'),
            p_quantity,
            p_price,
            round(p_quantity * p_price, 2),
            v_target_currency,
            v_order_timestamp,
            p_status,
            COALESCE(p_notes, p_status || ' ' || p_side || ' order for ' || p_symbol)
        )
        RETURNING * INTO v_order_record;

        RETURN jsonb_build_object(
            'success', TRUE,
            'position', NULL,
            'order', to_jsonb(v_order_record),
            'transfer', NULL,
            'realized_pnl', 0,
            'shortfall_deposited', 0,
            'currency', v_target_currency
        );
    END IF;

    -- 4. Server-Side Auto-Deposit Calculation for FILLED BUYS:
    IF p_side = 'BUY' AND p_auto_fund = TRUE THEN
        SELECT COALESCE(SUM(
            CASE 
                WHEN transfer_type = 'DEPOSIT' THEN amount
                WHEN transfer_type = 'WITHDRAWAL' THEN -amount
                ELSE 0 
            END
        ), 0)
        INTO v_total_transfers
        FROM public.portfolio_transfers
        WHERE user_id = v_user_id 
          AND upper(currency) = v_target_currency
          AND transfer_date <= v_order_timestamp::date;

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
          AND upper(currency) = v_target_currency
          AND executed_at <= v_order_timestamp;

        v_available_cash := GREATEST(0, v_total_transfers + v_total_orders);
        v_order_cost := round(p_quantity * p_price, 2);

        IF v_available_cash < v_order_cost THEN
            v_shortfall := LEAST(v_order_cost, round(v_order_cost - v_available_cash, 2));

            IF v_shortfall > 0 THEN
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
                    v_shortfall,
                    v_target_currency,
                    COALESCE(p_entry_date, CURRENT_DATE),
                    'Auto-deposit (' || v_target_currency || '): Funded position ' || trim(upper(p_symbol))
                )
                RETURNING * INTO v_transfer_record;
            END IF;
        END IF;
    END IF;

    -- 5. Position Management: Find existing position (prioritizing open ones)
    SELECT id, quantity, avg_entry_price, adjusted_break_even, is_open
    INTO v_pos_id, v_existing_quantity, v_existing_price, v_existing_adjusted_break_even, v_existing_is_open
    FROM public.portfolio_positions
    WHERE user_id = v_user_id AND asset_id = p_asset_id
    ORDER BY is_open DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF p_side = 'BUY' THEN
        IF FOUND AND v_existing_is_open = TRUE THEN
            -- DCA Merging into open position
            v_new_quantity := v_existing_quantity + p_quantity;
            v_new_avg_price := round(((v_existing_quantity * v_existing_price) + (p_quantity * p_price)) / v_new_quantity, 4);
            
            IF v_existing_adjusted_break_even IS NOT NULL THEN
                v_new_adjusted_break_even := round(((v_existing_quantity * v_existing_adjusted_break_even) + (p_quantity * p_price)) / v_new_quantity, 4);
            ELSE
                v_new_adjusted_break_even := NULL;
            END IF;

            UPDATE public.portfolio_positions
            SET 
                quantity = v_new_quantity,
                avg_entry_price = v_new_avg_price,
                adjusted_break_even = v_new_adjusted_break_even,
                stop_loss = COALESCE(p_stop_loss, stop_loss),
                target_price = COALESCE(p_target_price, target_price),
                notes = COALESCE(p_notes, notes),
                updated_at = NOW()
            WHERE id = v_pos_id
            RETURNING * INTO v_pos_record;
        ELSIF FOUND AND v_existing_is_open = FALSE THEN
            -- Re-opening previously closed position on same row
            UPDATE public.portfolio_positions
            SET
                quantity = p_quantity,
                avg_entry_price = p_price,
                adjusted_break_even = NULL,
                entry_date = COALESCE(p_entry_date, CURRENT_DATE),
                stop_loss = p_stop_loss,
                target_price = p_target_price,
                notes = p_notes,
                is_open = TRUE,
                updated_at = NOW()
            WHERE id = v_pos_id
            RETURNING * INTO v_pos_record;
        ELSE
            -- New position insertion
            INSERT INTO public.portfolio_positions (
                user_id,
                asset_id,
                quantity,
                avg_entry_price,
                adjusted_break_even,
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
                NULL,
                COALESCE(p_entry_date, CURRENT_DATE),
                p_stop_loss,
                p_target_price,
                p_notes,
                TRUE
            )
            RETURNING * INTO v_pos_record;
        END IF;
    ELSE
        -- SELL execution
        IF NOT FOUND OR v_existing_is_open = FALSE THEN
            RAISE EXCEPTION 'Cannot execute SELL order: No open position found for asset %', p_symbol;
        END IF;

        IF v_existing_quantity < p_quantity THEN
            RAISE EXCEPTION 'Cannot execute SELL order: Insufficient quantity (holding: %, requested: %)', v_existing_quantity, p_quantity;
        END IF;

        v_effective_cost_basis := COALESCE(p_cost_basis, v_existing_price);
        v_realized_pnl := round((p_price - v_effective_cost_basis) * p_quantity, 2);

        v_new_quantity := v_existing_quantity - p_quantity;
        IF v_new_quantity <= 0.000001 THEN
            -- Full exit: position closed
            UPDATE public.portfolio_positions
            SET quantity = 0, is_open = FALSE, updated_at = NOW()
            WHERE id = v_pos_id
            RETURNING * INTO v_pos_record;
        ELSE
            -- Partial sell
            IF p_cost_basis IS NOT NULL AND p_cost_basis > 0 AND p_cost_basis != v_existing_price THEN
                v_remaining_cost := (v_existing_quantity * v_existing_price) - (p_quantity * v_effective_cost_basis);
                IF v_remaining_cost > 0 THEN
                    v_new_avg_price := round(v_remaining_cost / v_new_quantity, 4);
                ELSE
                    v_new_avg_price := v_existing_price;
                END IF;
            ELSE
                v_new_avg_price := v_existing_price;
            END IF;

            IF p_reduce_cost_basis AND v_realized_pnl > 0 THEN
                v_base_cost_per_share := COALESCE(v_existing_adjusted_break_even, v_new_avg_price);
                v_remaining_cost := (v_existing_quantity * v_base_cost_per_share) - (p_quantity * v_effective_cost_basis) - v_realized_pnl;
                IF v_remaining_cost < 0 THEN
                    v_remaining_cost := 0;
                END IF;
                v_new_adjusted_break_even := round(v_remaining_cost / v_new_quantity, 4);
            ELSE
                v_new_adjusted_break_even := v_existing_adjusted_break_even;
            END IF;

            UPDATE public.portfolio_positions
            SET 
                quantity = v_new_quantity, 
                avg_entry_price = v_new_avg_price,
                adjusted_break_even = v_new_adjusted_break_even,
                updated_at = NOW()
            WHERE id = v_pos_id
            RETURNING * INTO v_pos_record;
        END IF;
    END IF;

    -- 6. Insert executed order record in the same atomic transaction
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
        upper(trim(p_symbol)),
        p_side,
        COALESCE(p_order_type, 'Limit'),
        p_quantity,
        p_price,
        round(p_quantity * p_price, 2),
        v_target_currency,
        v_order_timestamp,
        p_status,
        COALESCE(p_notes, p_side || ' ' || p_quantity || ' ' || p_symbol || ' @ ' || p_price || ' ' || v_target_currency)
    )
    RETURNING * INTO v_order_record;

    -- 7. Return complete atomic state payload
    RETURN jsonb_build_object(
        'success', TRUE,
        'position', to_jsonb(v_pos_record),
        'order', to_jsonb(v_order_record),
        'transfer', CASE WHEN v_transfer_record IS NOT NULL THEN to_jsonb(v_transfer_record) ELSE NULL END,
        'realized_pnl', v_realized_pnl,
        'shortfall_deposited', v_shortfall,
        'currency', v_target_currency
    );
END;
$function$;

COMMIT;
