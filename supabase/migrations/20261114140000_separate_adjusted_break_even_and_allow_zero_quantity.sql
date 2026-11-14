-- Migration: 20261114140000_separate_adjusted_break_even_and_allow_zero_quantity.sql
-- Description: 
-- 1. Add adjusted_break_even column to public.portfolio_positions for "Maliyet Düşürme" net-capital tracking.
-- 2. Update quantity check constraint to permit quantity = 0 when is_open = FALSE (enabling clean full exits).
-- 3. Update execute_portfolio_holding_and_order RPC:
--    - Gate position and cash balance modifications strictly on p_status = 'Filled'.
--    - Non-filled orders (Pending, Cancelled, Rejected) log to portfolio_orders without modifying holdings or cash.
--    - Keep avg_entry_price as unpolluted acquisition cost; store cost reductions in adjusted_break_even.
--    - Use date-aware historical FX rate lookup for USD shortfall auto-deposits.

DO $$
BEGIN
    -- 1. Add adjusted_break_even column if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'portfolio_positions' 
          AND column_name = 'adjusted_break_even'
    ) THEN
        ALTER TABLE public.portfolio_positions 
        ADD COLUMN adjusted_break_even NUMERIC(14,4) NULL;
    END IF;

    -- 2. Update quantity check constraint on portfolio_positions
    ALTER TABLE public.portfolio_positions 
    DROP CONSTRAINT IF EXISTS portfolio_positions_quantity_positive;

    ALTER TABLE public.portfolio_positions 
    DROP CONSTRAINT IF EXISTS portfolio_positions_quantity_valid;

    ALTER TABLE public.portfolio_positions 
    ADD CONSTRAINT portfolio_positions_quantity_valid 
    CHECK (
        (is_open = TRUE AND quantity > 0) OR 
        (is_open = FALSE AND quantity >= 0)
    );

    -- 3. Ensure adjusted_break_even constraint (can be 0 or positive, or NULL)
    ALTER TABLE public.portfolio_positions 
    DROP CONSTRAINT IF EXISTS portfolio_positions_adjusted_break_even_nonnegative;

    ALTER TABLE public.portfolio_positions 
    ADD CONSTRAINT portfolio_positions_adjusted_break_even_nonnegative 
    CHECK (adjusted_break_even IS NULL OR adjusted_break_even >= 0);
END $$;

-- Drop previous overloaded versions
DROP FUNCTION IF EXISTS public.execute_portfolio_holding_and_order(uuid, character varying, numeric, numeric, character varying, character varying, character varying, date, timestamp with time zone, numeric, numeric, text, character varying, character varying, boolean, boolean, numeric);

-- 4. Replace execute_portfolio_holding_and_order RPC
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
    v_fx_rate NUMERIC := 50.0;
    v_total_transfers_try NUMERIC := 0;
    v_total_orders_try NUMERIC := 0;
    v_available_cash_try NUMERIC := 0;
    v_order_cost_try NUMERIC := 0;
    v_shortfall_try NUMERIC := 0;
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
            COALESCE(p_currency, 'TRY'),
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
            'shortfall_deposited_try', 0
        );
    END IF;

    -- 4. Server-Side Auto-Deposit Calculation for FILLED BUYS:
    IF p_side = 'BUY' AND p_auto_fund = TRUE THEN
        -- Date-aware USD/TRY exchange rate lookup
        SELECT COALESCE(
            (SELECT rate FROM public.fx_rates 
             WHERE pair = 'USDTRY' AND date <= COALESCE(p_entry_date, CURRENT_DATE) 
             ORDER BY date DESC LIMIT 1),
            (SELECT rate FROM public.fx_rates 
             WHERE pair = 'USDTRY' 
             ORDER BY date DESC LIMIT 1),
            50.0
        ) INTO v_fx_rate;

        -- Sum of all deposits and withdrawals in TRY
        SELECT COALESCE(SUM(
            CASE 
                WHEN transfer_type = 'DEPOSIT' THEN 
                    CASE WHEN currency = 'USD' THEN amount * v_fx_rate ELSE amount END
                WHEN transfer_type = 'WITHDRAWAL' THEN 
                    CASE WHEN currency = 'USD' THEN -amount * v_fx_rate ELSE -amount END
                ELSE 0 
            END
        ), 0)
        INTO v_total_transfers_try
        FROM public.portfolio_transfers
        WHERE user_id = v_user_id;

        -- Sum of all executed filled orders in TRY
        SELECT COALESCE(SUM(
            CASE 
                WHEN side = 'SELL' THEN 
                    CASE WHEN currency = 'USD' THEN total_amount * v_fx_rate ELSE total_amount END
                WHEN side = 'BUY' THEN 
                    CASE WHEN currency = 'USD' THEN -total_amount * v_fx_rate ELSE -total_amount END
                ELSE 0 
            END
        ), 0)
        INTO v_total_orders_try
        FROM public.portfolio_orders
        WHERE user_id = v_user_id AND status = 'Filled';

        v_available_cash_try := v_total_transfers_try + v_total_orders_try;
        
        -- Compute order cost in TRY
        IF p_currency = 'USD' THEN
            v_order_cost_try := (p_quantity * p_price) * v_fx_rate;
        ELSE
            v_order_cost_try := (p_quantity * p_price);
        END IF;

        -- If available cash cannot cover the order cost, deposit exactly the required shortfall in TRY
        IF v_available_cash_try < v_order_cost_try THEN
            v_shortfall_try := round(v_order_cost_try - v_available_cash_try, 2);

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
                v_shortfall_try,
                'TRY',
                COALESCE(p_entry_date, CURRENT_DATE),
                'Auto-deposit: Funded position ' || trim(upper(p_symbol))
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
        COALESCE(p_currency, 'TRY'),
        COALESCE(p_executed_at, COALESCE(p_entry_date, CURRENT_DATE)::timestamp with time zone),
        p_status,
        COALESCE(p_notes, p_side || ' ' || p_quantity || ' ' || p_symbol || ' @ ' || p_price)
    )
    RETURNING * INTO v_order_record;

    -- 7. Return complete atomic state payload
    RETURN jsonb_build_object(
        'success', TRUE,
        'position', to_jsonb(v_pos_record),
        'order', to_jsonb(v_order_record),
        'transfer', CASE WHEN v_transfer_record IS NOT NULL THEN to_jsonb(v_transfer_record) ELSE NULL END,
        'realized_pnl', v_realized_pnl,
        'shortfall_deposited_try', v_shortfall_try
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_portfolio_holding_and_order TO authenticated;
