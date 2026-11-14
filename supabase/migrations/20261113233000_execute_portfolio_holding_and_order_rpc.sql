-- Migration: 20261113233000_execute_portfolio_holding_and_order_rpc.sql
-- Description: Transactional Postgres RPC for atomic portfolio position, order creation & server-calculated auto-funding,
--              handling DCA position merging, sell executions, strict auth.uid() identity derivation, and check constraints.

-- 1. Order status check constraint
ALTER TABLE public.portfolio_orders
    DROP CONSTRAINT IF EXISTS portfolio_orders_status_check;

ALTER TABLE public.portfolio_orders
    ADD CONSTRAINT portfolio_orders_status_check
    CHECK (status IN ('Filled', 'Pending', 'Cancelled', 'Rejected'));

-- 2. Drop older variants to avoid ambiguity
DROP FUNCTION IF EXISTS public.execute_portfolio_holding_and_order(UUID, UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.execute_portfolio_holding_and_order(UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT, VARCHAR, VARCHAR, NUMERIC);
DROP FUNCTION IF EXISTS public.execute_portfolio_holding_and_order(UUID, VARCHAR, NUMERIC, NUMERIC, VARCHAR, VARCHAR, VARCHAR, DATE, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT, VARCHAR, VARCHAR, BOOLEAN, BOOLEAN, NUMERIC);

-- 3. Hardened RPC: Derives user_id exclusively from auth.uid() (no client-supplied userId)
--    Calculates cash shortfall server-side from actual ledger (never trusts client-supplied deposit amounts)
--    Supports both BUY (DCA merging) and SELL (quantity reduction/exit with realized P&L & cost basis reduction)
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
    p_auto_fund BOOLEAN DEFAULT TRUE,
    p_reduce_cost_basis BOOLEAN DEFAULT FALSE,
    p_cost_basis NUMERIC(18,6) DEFAULT NULL
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
    
    -- Cash ledger and auto-funding calculation
    v_fx_rate NUMERIC(18,6) := 50.0;
    v_total_transfers_try NUMERIC(18,6) := 0;
    v_total_orders_try NUMERIC(18,6) := 0;
    v_available_cash_try NUMERIC(18,6) := 0;
    v_order_cost_try NUMERIC(18,6) := 0;
    v_shortfall_try NUMERIC(18,6) := 0;
    
    -- Sell P&L calculation
    v_effective_cost_basis NUMERIC(18,6);
    v_realized_pnl NUMERIC(18,6) := 0;
    v_remaining_cost NUMERIC(18,6) := 0;
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

    IF p_side NOT IN ('BUY', 'SELL') THEN
        RAISE EXCEPTION 'Invalid order side. Allowed: BUY, SELL';
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

    -- 3. Deterministic / Secure Order Reference
    IF p_order_ref IS NULL OR length(trim(p_order_ref)) = 0 THEN
        v_order_ref := 'ORD-' || to_char(COALESCE(p_executed_at, NOW()), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    ELSE
        v_order_ref := trim(p_order_ref);
    END IF;

    -- 4. Server-Side Cash Shortfall Calculation & Auto-Funding (For BUY orders)
    IF p_side = 'BUY' AND p_auto_fund = TRUE AND p_status = 'Filled' THEN
        -- Fetch latest USD/TRY exchange rate
        SELECT COALESCE(
            (SELECT rate FROM public.fx_rates WHERE pair = 'USDTRY' ORDER BY date DESC LIMIT 1),
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

        -- Sum of all executed orders (sells add cash, buys consume cash) in TRY
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
    SELECT id, quantity, avg_entry_price
    INTO v_pos_id, v_existing_quantity, v_existing_price
    FROM public.portfolio_positions
    WHERE user_id = v_user_id AND asset_id = p_asset_id AND is_open = TRUE
    FOR UPDATE;

    IF p_side = 'BUY' THEN
        IF FOUND THEN
            -- DCA Merging
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
            -- New open position
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
    ELSE
        -- SELL execution
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cannot execute SELL order: No open position found for asset %', p_symbol;
        END IF;

        IF v_existing_quantity < p_quantity THEN
            RAISE EXCEPTION 'Cannot execute SELL order: Insufficient quantity (holding: %, requested: %)', v_existing_quantity, p_quantity;
        END IF;

        v_effective_cost_basis := COALESCE(p_cost_basis, v_existing_price);
        v_realized_pnl := round((p_price - v_effective_cost_basis) * p_quantity, 2);

        v_new_quantity := v_existing_quantity - p_quantity;
        IF v_new_quantity <= 0.000001 THEN
            -- Full exit
            UPDATE public.portfolio_positions
            SET quantity = 0, is_open = FALSE, updated_at = NOW()
            WHERE id = v_pos_id
            RETURNING * INTO v_pos_record;
        ELSE
            -- Partial sell
            IF p_reduce_cost_basis AND v_realized_pnl > 0 THEN
                v_remaining_cost := (v_existing_quantity * v_existing_price) - (p_quantity * v_effective_cost_basis) - v_realized_pnl;
                IF v_remaining_cost < 0 THEN
                    v_remaining_cost := 0;
                END IF;
                v_new_avg_price := round(v_remaining_cost / v_new_quantity, 4);
            ELSE
                v_new_avg_price := v_existing_price;
            END IF;

            UPDATE public.portfolio_positions
            SET quantity = v_new_quantity, avg_entry_price = v_new_avg_price, updated_at = NOW()
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
        'transfer', CASE WHEN v_transfer_record IS NOT NULL THEN to_jsonb(v_transfer_record) ELSE NULL END,
        'realized_pnl', v_realized_pnl,
        'shortfall_deposited_try', v_shortfall_try
    );
END;
$$;

-- Grant execution strictly to authenticated users (not service_role)
GRANT EXECUTE ON FUNCTION public.execute_portfolio_holding_and_order TO authenticated;
