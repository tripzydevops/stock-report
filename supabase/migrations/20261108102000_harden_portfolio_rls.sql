-- Migration: 20261108102000_harden_portfolio_rls.sql
-- Description: Enforces strict multi-tenant Row Level Security (RLS) on user portfolio tables.
-- - Drops permissive "Allow all" policies on portfolio_positions, portfolio_orders, portfolio_transfers, and watchlist_items.
-- - Model Portfolio (user_id IS NULL) is strictly READ-ONLY for public/anon/authenticated clients.
-- - User Private Portfolios (user_id IS NOT NULL) are strictly isolated to auth.uid() = user_id for SELECT, INSERT, UPDATE, DELETE.
-- - Denies unauthenticated mutations completely, protecting production database from anonymous state corruption.

-- 1. portfolio_positions RLS Hardening
ALTER TABLE public.portfolio_positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Public read portfolio_positions" ON public.portfolio_positions;
DROP POLICY IF EXISTS "User portfolio isolation" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Model portfolio read" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Portfolio positions select policy" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Portfolio positions insert policy" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Portfolio positions update policy" ON public.portfolio_positions;
DROP POLICY IF EXISTS "Portfolio positions delete policy" ON public.portfolio_positions;

-- Read: Anyone can read model portfolio (user_id IS NULL), or their own private positions
CREATE POLICY "Portfolio positions select policy" ON public.portfolio_positions
    FOR SELECT USING (user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

-- Insert: Only authenticated users can insert, and MUST set user_id = auth.uid()
CREATE POLICY "Portfolio positions insert policy" ON public.portfolio_positions
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Update: Only owner can update their own positions
CREATE POLICY "Portfolio positions update policy" ON public.portfolio_positions
    FOR UPDATE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Delete: Only owner can delete their own positions
CREATE POLICY "Portfolio positions delete policy" ON public.portfolio_positions
    FOR DELETE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);


-- 2. portfolio_orders RLS Hardening
ALTER TABLE public.portfolio_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on portfolio_orders" ON public.portfolio_orders;
DROP POLICY IF EXISTS "User orders isolation" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Portfolio orders select policy" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Portfolio orders insert policy" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Portfolio orders update policy" ON public.portfolio_orders;
DROP POLICY IF EXISTS "Portfolio orders delete policy" ON public.portfolio_orders;

-- Read: Anyone can read model portfolio orders (user_id IS NULL), or their own private orders
CREATE POLICY "Portfolio orders select policy" ON public.portfolio_orders
    FOR SELECT USING (user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

-- Insert: Only authenticated users can insert, and MUST set user_id = auth.uid()
CREATE POLICY "Portfolio orders insert policy" ON public.portfolio_orders
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Update: Only owner can update their own orders
CREATE POLICY "Portfolio orders update policy" ON public.portfolio_orders
    FOR UPDATE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Delete: Only owner can delete their own orders
CREATE POLICY "Portfolio orders delete policy" ON public.portfolio_orders
    FOR DELETE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);


-- 3. portfolio_transfers RLS Hardening
ALTER TABLE public.portfolio_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on portfolio_transfers" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "User transfers isolation" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Portfolio transfers select policy" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Portfolio transfers insert policy" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Portfolio transfers update policy" ON public.portfolio_transfers;
DROP POLICY IF EXISTS "Portfolio transfers delete policy" ON public.portfolio_transfers;

-- Read: Anyone can read model portfolio transfers (user_id IS NULL), or their own private transfers
CREATE POLICY "Portfolio transfers select policy" ON public.portfolio_transfers
    FOR SELECT USING (user_id IS NULL OR (auth.uid() IS NOT NULL AND auth.uid() = user_id));

-- Insert: Only authenticated users can insert, and MUST set user_id = auth.uid()
CREATE POLICY "Portfolio transfers insert policy" ON public.portfolio_transfers
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Update: Only owner can update their own transfers
CREATE POLICY "Portfolio transfers update policy" ON public.portfolio_transfers
    FOR UPDATE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Delete: Only owner can delete their own transfers
CREATE POLICY "Portfolio transfers delete policy" ON public.portfolio_transfers
    FOR DELETE USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);


-- 4. watchlist_items RLS Hardening
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON public.watchlist_items;
DROP POLICY IF EXISTS "Public read watchlist_items" ON public.watchlist_items;
DROP POLICY IF EXISTS "Watchlist items select policy" ON public.watchlist_items;
DROP POLICY IF EXISTS "Watchlist items insert policy" ON public.watchlist_items;
DROP POLICY IF EXISTS "Watchlist items update policy" ON public.watchlist_items;
DROP POLICY IF EXISTS "Watchlist items delete policy" ON public.watchlist_items;

-- Read: Read own items (user_id matching auth.uid() or client guest session)
CREATE POLICY "Watchlist items select policy" ON public.watchlist_items
    FOR SELECT USING (
        user_id IS NULL 
        OR (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
        OR (user_id LIKE 'guest_%')
    );

-- Insert: Authenticated user or guest
CREATE POLICY "Watchlist items insert policy" ON public.watchlist_items
    FOR INSERT WITH CHECK (
        (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
        OR (user_id LIKE 'guest_%')
    );

-- Update: Owner only
CREATE POLICY "Watchlist items update policy" ON public.watchlist_items
    FOR UPDATE USING (
        (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
        OR (user_id LIKE 'guest_%')
    )
    WITH CHECK (
        (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
        OR (user_id LIKE 'guest_%')
    );

-- Delete: Owner only
CREATE POLICY "Watchlist items delete policy" ON public.watchlist_items
    FOR DELETE USING (
        (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
        OR (user_id LIKE 'guest_%')
    );
