-- Migration: 20261118170000_purge_phantom_transfers_and_validate.sql
-- Description: Permanently purge any legacy phantom transfers (such as ID 6f01774d-c3cc-46bc-aef9-de6bbc33af95 or amount 20323.14)
-- and add a check constraint requiring strictly positive finite transfer amounts.

DELETE FROM portfolio_transfers
WHERE id = '6f01774d-c3cc-46bc-aef9-de6bbc33af95'
   OR amount = 20323.14;

-- Enforce positive amount constraint on future inserts/updates if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_portfolio_transfers_positive_amount'
  ) THEN
    ALTER TABLE portfolio_transfers
    ADD CONSTRAINT chk_portfolio_transfers_positive_amount
    CHECK (amount > 0 AND amount < 1000000000);
  END IF;
END $$;
