-- ====================================================================
-- MarketPulse Migration: Report Files, Snapshots, Movements & Catalysts
-- File: supabase/migrations/20261027000000_report_files_and_movements.sql
-- ====================================================================

-- 1. Report Files (Immutable XLSX Storage Registry)
CREATE TABLE IF NOT EXISTS public.report_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    trading_date DATE NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    file_size_bytes BIGINT,
    row_count INTEGER,
    checksum_sha256 TEXT,
    is_latest BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_files_type_latest ON public.report_files (report_type, is_latest);
CREATE INDEX IF NOT EXISTS idx_report_files_trading_date ON public.report_files (trading_date DESC);

-- 2. Price Snapshots (Intraday Point-in-time Price Captures)
CREATE TABLE IF NOT EXISTS public.price_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    snapshot_time TIMESTAMPTZ NOT NULL,
    open NUMERIC(18,6),
    high NUMERIC(18,6),
    low NUMERIC(18,6),
    close NUMERIC(18,6),
    volume BIGINT,
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_asset_time ON public.price_snapshots (asset_id, snapshot_time DESC);

-- 3. Stock Movements (Granular Tick/Event Signal Logs)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
    movement_time TIMESTAMPTZ NOT NULL,
    direction TEXT,
    change_amount NUMERIC(18,6),
    change_pct NUMERIC(10,4),
    signal TEXT,
    score NUMERIC(8,4),
    metadata JSONB DEFAULT '{}'::jsonb,
    report_file_id UUID REFERENCES public.report_files(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_asset_time ON public.stock_movements (asset_id, movement_time DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_report_file ON public.stock_movements (report_file_id);

-- 4. Opening Direction (ORB Gap Scans)
CREATE TABLE IF NOT EXISTS public.opening_direction (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    market TEXT NOT NULL,
    date DATE NOT NULL,
    prev_close NUMERIC(18,6),
    open_price NUMERIC(18,6),
    current_price NUMERIC(18,6),
    gap_percent NUMERIC(8,4) NOT NULL,
    gap_type TEXT NOT NULL,
    orb_status TEXT NOT NULL,
    bias TEXT NOT NULL,
    volume_spike BOOLEAN NOT NULL DEFAULT FALSE,
    recommended_action TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opening_direction_date ON public.opening_direction (date DESC);
CREATE INDEX IF NOT EXISTS idx_opening_direction_symbol ON public.opening_direction (symbol);

-- 5. Market Catalysts (KAP Disclosures & Macro News)
CREATE TABLE IF NOT EXISTS public.market_catalysts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    market VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    details TEXT,
    ai_verdict VARCHAR(20) NOT NULL,
    ai_takeaway TEXT NOT NULL,
    impact_score NUMERIC(5,2),
    source_url TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_catalysts_published ON public.market_catalysts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_catalysts_symbol ON public.market_catalysts (symbol);

-- 6. Portfolio Orders (User Trade Executions)
CREATE TABLE IF NOT EXISTS public.portfolio_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_ref VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    order_type VARCHAR(20) DEFAULT 'Limit',
    quantity NUMERIC(18,6) NOT NULL,
    price NUMERIC(18,6) NOT NULL,
    total_amount NUMERIC(18,6) NOT NULL,
    currency VARCHAR(10) DEFAULT 'TRY',
    executed_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'Filled',
    notes TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_orders_user ON public.portfolio_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_orders_symbol ON public.portfolio_orders (symbol);

-- 7. Portfolio Transfers (Cash Ledger Deposits & Withdrawals)
CREATE TABLE IF NOT EXISTS public.portfolio_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_type VARCHAR(20) NOT NULL CHECK (transfer_type IN ('DEPOSIT', 'WITHDRAWAL')),
    amount NUMERIC(18,6) NOT NULL,
    currency VARCHAR(10) DEFAULT 'TRY',
    transfer_date DATE NOT NULL,
    notes TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_transfers_user ON public.portfolio_transfers (user_id);

-- Row Level Security (RLS) Configuration
ALTER TABLE public.report_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_direction ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_catalysts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_transfers ENABLE ROW LEVEL SECURITY;

-- Public Market Intelligence Policies (Readable by authenticated & anon)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read report_files' AND tablename = 'report_files') THEN
        CREATE POLICY "Public read report_files" ON public.report_files FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read price_snapshots' AND tablename = 'price_snapshots') THEN
        CREATE POLICY "Public read price_snapshots" ON public.price_snapshots FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read stock_movements' AND tablename = 'stock_movements') THEN
        CREATE POLICY "Public read stock_movements" ON public.stock_movements FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read opening_direction' AND tablename = 'opening_direction') THEN
        CREATE POLICY "Public read opening_direction" ON public.opening_direction FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read market_catalysts' AND tablename = 'market_catalysts') THEN
        CREATE POLICY "Public read market_catalysts" ON public.market_catalysts FOR SELECT USING (true);
    END IF;
END $$;

-- Multi-Tenant User Isolation Policies
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'User orders isolation' AND tablename = 'portfolio_orders') THEN
        CREATE POLICY "User orders isolation" ON public.portfolio_orders
            FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'User transfers isolation' AND tablename = 'portfolio_transfers') THEN
        CREATE POLICY "User transfers isolation" ON public.portfolio_transfers
            FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
END $$;
