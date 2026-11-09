-- Migration: 20261108220000_forward_hardening_rls_and_price_metadata.sql
-- Description: Forward migration adding provenance metadata (source, observed_at) to price_history
--              and confirming idempotent RLS policy enforcement.

-- 1. Add provenance metadata columns to price_history table
ALTER TABLE public.price_history 
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'unknown';

ALTER TABLE public.price_history 
ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ DEFAULT NOW();

-- Create index on source for audit queries
CREATE INDEX IF NOT EXISTS idx_price_history_source ON public.price_history (source);

-- 2. Confirm RLS is enabled on public.price_history
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'price_history' AND policyname = 'Price history select policy'
    ) THEN
        CREATE POLICY "Price history select policy" 
        ON public.price_history FOR SELECT 
        USING (true);
    END IF;
END $$;
