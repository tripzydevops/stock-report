-- Migration: Add client_order_id and unique partial index to portfolio_transfers for durable idempotency
-- Up Migration:
ALTER TABLE public.portfolio_transfers
  ADD COLUMN IF NOT EXISTS client_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_transfers_user_client_order_id
  ON public.portfolio_transfers (user_id, client_order_id)
  WHERE client_order_id IS NOT NULL;
