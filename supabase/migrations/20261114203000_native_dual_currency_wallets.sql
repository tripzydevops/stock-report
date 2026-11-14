-- Migration: 20261114203000_native_dual_currency_wallets.sql
-- Description:
-- Support segregated TRY and USD wallets in execute_portfolio_holding_and_order RPC.
-- US assets (currency = 'USD') auto-fund and settle strictly in native USD.
-- BIST assets (currency = 'TRY') auto-fund and settle strictly in native TRY.

CREATE OR REPLACE FUNCTION public.execute_portfolio_holding_and_order(
    p_asset_id UUID,
    p_symbol VARCHAR,
    p_quantity NUMERIC,
    p_price NUMERIC,
    p_side VARCHAR DEFAULT 'BUY',
    p_order_type VARCHAR DEFAULT 'Limit',
    p_currency VARCHAR DEFAULT 'TRY',
    p_entry_date DATE DEFAULT NULL,
    p_executed_at TIMESTAMPTZ DEFAULT NULL,
    p_stop_loss NUMERIC DEFAULT NULL,
    p_target_price NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_order_ref VARCHAR DEFAULT NULL,
    p_status VARCHAR DEFAULT 'Filled',
    p_auto_fund BOOLEAN DEFAULT TRUE,
    p_reduce_cost_basis BOOLEAN DEFAULT FALSE,
    p_cost_basis NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_pos_id UUID;
    v_existing_quantity NUMERIC;
    v_existing_price NUMERIC;
    v_existing_adjusted_break_even NUMERIC;
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

    -- Generate order reference if not provided
    v_order_ref := COALESCE(p_order_ref, 'ORD-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 6)));

    -- 3. Non-Filled Orders (Pending, Cancelled, Rejected):
    -- Record order for tracking/auditing, but DO NOT modify positions or cash ledger.
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
            COALESCE(p_executed_at, COALESCE(p_entry_date, CURRENT_DATE)::timestamp with time zone),
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

    -- 4. Server-Side Auto-Deposit Calculation for FILLED BUYS (Native Currency Segregated):
    IF p_side = 'BUY' AND p_auto_fund = TRUE THEN
        -- Sum of all deposits and withdrawals in the target currency (TRY or USD)
        SELECT COALESCE(SUM(
            CASE 
                WHEN transfer_type = 'DEPOSIT' THEN amount
                WHEN transfer_type = 'WITHDRAWAL' THEN -amount
                ELSE 0 
            END
        ), 0)
        INTO v_total_transfers
        FROM public.portfolio_transfers
        WHERE user_id = v_user_id AND upper(currency) = v_target_currency;

        -- Sum of all executed filled orders in the target currency (TRY or USD)
        SELECT COALESCE(SUM(
            CASE 
                WHEN side = 'SELL' THEN total_amount
                WHEN side = 'BUY' THEN -total_amount
                ELSE 0 
            END
        ), 0)
        INTO v_total_orders
        FROM public.portfolio_orders
        WHERE user_id = v_user_id AND status = 'Filled' AND upper(currency) = v_target_currency;

        v_available_cash := v_total_transfers + v_total_orders;
        v_order_cost := (p_quantity * p_price);

        -- If available cash cannot cover the order cost in native currency, deposit the shortfall in that currency
        IF v_available_cash < v_order_cost THEN
            v_shortfall := round(v_order_cost - v_available_cash, 2);

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

    -- 5. Position Management: BUY (Insert / DCA Merge) or SELL (Deduce / Exit)
    SELECT id, quantity, avg_entry_price, adjusted_break_even
    INTO v_pos_id, v_existing_quantity, v_existing_price, v_existing_adjusted_break_even
    FROM public.portfolio_positions
    WHERE user_id = v_user_id AND asset_id = p_asset_id AND is_open = TRUE
    FOR UPDATE;

    IF p_side = 'BUY' THEN
        IF FOUND THEN
            -- DCA Merging
            v_new_quantity := v_existing_quantity + p_quantity;
            v_new_avg_price := round(((v_existing_quantity * v_existing_price) + (p_quantity * p_price)) / v_new_quantity, 4);
            
            -- Blend adjusted break-even if active
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
        ELSE
            -- New open position
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
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cannot execute SELL order: No open position found for asset %', p_symbol;
        END IF;

        IF v_existing_quantity < p_quantity THEN
            RAISE EXCEPTION 'Cannot execute SELL order: Insufficient quantity (holding: %, requested: %)', v_existing_quantity, p_quantity;
        END IF;

        -- Calculate Realized PnL using true original purchase cost or explicit tranche cost basis
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
            -- Partial sell: preserve true acquisition cost in avg_entry_price; calculate adjusted_break_even if enabled
            v_new_avg_price := v_existing_price;

            IF p_reduce_cost_basis AND v_realized_pnl > 0 THEN
                v_base_cost_per_share := COALESCE(v_existing_adjusted_break_even, v_existing_price);
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
        COALESCE(p_executed_at, COALESCE(p_entry_date, CURRENT_DATE)::timestamp with time zone),
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
$$;

GRANT EXECUTE ON FUNCTION public.execute_portfolio_holding_and_order TO authenticated;
