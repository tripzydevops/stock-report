-- Migration: 20261113230000_harden_portfolio_price_constraints.sql
-- Description: Enforce strictly positive entry price and quantity on portfolio positions and orders.
--              Rejects zero, negative, and invalid prices at the database level.

DO $$
BEGIN
    -- 1. portfolio_positions constraints
    ALTER TABLE public.portfolio_positions 
    DROP CONSTRAINT IF EXISTS portfolio_positions_avg_entry_price_check;

    ALTER TABLE public.portfolio_positions 
    DROP CONSTRAINT IF EXISTS portfolio_positions_avg_entry_price_positive;

    ALTER TABLE public.portfolio_positions 
    ADD CONSTRAINT portfolio_positions_avg_entry_price_positive 
    CHECK (avg_entry_price > 0);

    ALTER TABLE public.portfolio_positions 
    DROP CONSTRAINT IF EXISTS portfolio_positions_quantity_check;

    ALTER TABLE public.portfolio_positions 
    DROP CONSTRAINT IF EXISTS portfolio_positions_quantity_positive;

    ALTER TABLE public.portfolio_positions 
    ADD CONSTRAINT portfolio_positions_quantity_positive 
    CHECK (quantity > 0);

    -- 2. portfolio_orders constraints
    ALTER TABLE public.portfolio_orders 
    DROP CONSTRAINT IF EXISTS portfolio_orders_price_positive;

    ALTER TABLE public.portfolio_orders 
    ADD CONSTRAINT portfolio_orders_price_positive 
    CHECK (price > 0);

    ALTER TABLE public.portfolio_orders 
    DROP CONSTRAINT IF EXISTS portfolio_orders_quantity_positive;

    ALTER TABLE public.portfolio_orders 
    ADD CONSTRAINT portfolio_orders_quantity_positive 
    CHECK (quantity > 0);
END $$;
