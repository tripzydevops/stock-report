-- Migration: 20261116143000_harden_portfolio_multi_tenant_rls.sql
-- Description: Enforces strict multi-tenant Row Level Security (RLS) on user portfolio tables.
-- - Drops permissive "Allow all" policies on portfolio_positions, portfolio_orders, portfolio_transfers, and watchlist_items.
-- - Model Portfolio (user_id IS NULL or user_id = 'b509e10d-863a-4d3a-9b1d-c1ec13e49dcb') is strictly READ-ONLY for public/anon clients.
-- - User Private Portfolios are strictly isolated to auth.uid() = user_id for SELECT, INSERT, UPDATE, DELETE.
-- - Denies unauthenticated mutations completely, protecting production database from anonymous state corruption.

-- 1. portfolio_positions RLS Hardening
ALTER TABLE public.portfolio_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all portfolio_positions" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Allow all" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Public read portfolio_positions" ON public.portfolio_positions;
DROP POLICY IF EXISTS "User portfolio isolation" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Model portfolio read" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Portfolio positions select policy" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Portfolio positions insert policy" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Portfolio positions update policy" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Portfolio positions delete policy" ON public.portfolio_positions;

CREATE POLICY "Portfolio positions select policy" ON public.portfolio_positions
    FOR SELECT USING (user_id IS NULL OR user_id = 'b509e10d-863a-4d3a-9b1d-c1ec13e49dcb'::uuid OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

CREATE POLICY "Portfolio positions insert policy" ON public.portfolio_positions
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Portfolio positions update policy" ON public.portfolio_positions
    FOR UPDATE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Portfolio positions delete policy" ON public.portfolio_positions
    FOR DELETE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);


-- 2. portfolio_orders RLS Hardening
ALTER TABLE public.portfolio_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all portfolio_orders" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Allow all on portfolio_orders" ON public.portfolio_orders;
DROP POLICY IF EXISTS "User orders isolation" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Portfolio orders select policy" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Portfolio orders insert policy" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Portfolio orders update policy" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Portfolio orders delete policy" ON public.portfolio_orders;

CREATE POLICY "Portfolio orders select policy" ON public.portfolio_orders
    FOR SELECT USING (user_id IS NULL OR user_id = 'b509e10d-863a-4d3a-9b1d-c1ec13e49dcb'::uuid OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

CREATE POLICY "Portfolio orders insert policy" ON public.portfolio_orders
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Portfolio orders update policy" ON public.portfolio_orders
    FOR UPDATE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Portfolio orders delete policy" ON public.portfolio_orders
    FOR DELETE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);


-- 3. portfolio_transfers RLS Hardening
ALTER TABLE public.portfolio_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all portfolio_transfers" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Allow all on portfolio_transfers" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "User transfers isolation" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Portfolio transfers select policy" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Portfolio transfers insert policy" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Portfolio transfers update policy" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Portfolio transfers delete policy" ON public.portfolio_transfers;

CREATE POLICY "Portfolio transfers select policy" ON public.portfolio_transfers
    FOR SELECT USING (user_id IS NULL OR user_id = 'b509e10d-863a-4d3a-9b1d-c1ec13e49dcb'::uuid OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

CREATE POLICY "Portfolio transfers insert policy" ON public.portfolio_transfers
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Portfolio transfers update policy" ON public.portfolio_transfers
    FOR UPDATE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Portfolio transfers delete policy" ON public.portfolio_transfers
    FOR DELETE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);


-- 4. watchlist_items RLS Hardening (user_id is text type)
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Allow all" ON public.watchlist_items;
DROP POLICY IF EXISTS "Watchlist select policy" ON public.watchlist_items;
DROP POLICY IF EXISTS "Watchlist insert policy" ON public.watchlist_items;
DROP POLICY IF EXISTS "Watchlist update policy" ON public.watchlist_items;
DROP POLICY IF EXISTS "Watchlist delete policy" ON public.watchlist_items;

CREATE POLICY "Watchlist select policy" ON public.watchlist_items
    FOR SELECT USING (user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid()::text = user_id));

CREATE POLICY "Watchlist insert policy" ON public.watchlist_items
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid()::text = user_id);

CREATE POLICY "Watchlist update policy" ON public.watchlist_items
    FOR UPDATE USING (auth.uid() IS NOT NULL AND auth.uid()::text = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid()::text = user_id);

CREATE POLICY "Watchlist delete policy" ON public.watchlist_items
    FOR DELETE USING (auth.uid() IS NOT NULL AND auth.uid()::text = user_id);
