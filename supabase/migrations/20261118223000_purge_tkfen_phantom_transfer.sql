-- Migration: 20261118223000_purge_tkfen_phantom_transfer.sql
-- Description: Permanently purges phantom auto-deposit 674657b0-106e-4f0a-a1ac-66501e537989 (₺1,144.20 for TKFEN 6 shares @ 190.70)
-- and any legacy 20323.14 transfer to ensure clean, deterministic, reproducible migrations.

BEGIN;

DELETE FROM portfolio_transfers
WHERE id IN (
  '674657b0-106e-4f0a-a1ac-66501e537989',
  '6f01774d-c3cc-46bc-aef9-de6bbc33af95'
) OR amount = 20323.14;

COMMIT;
