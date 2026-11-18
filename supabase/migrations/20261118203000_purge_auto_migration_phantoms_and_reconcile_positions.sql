-- Migration: 20261118203000_purge_auto_migration_phantoms_and_reconcile_positions.sql
-- Description: Purges phantom duplicate orders and auto-deposits created by rogue auto-migrate routine,
-- ensures closed positions (CCOLA, TKFEN) are marked closed, and aligns position quantities with authentic executed order lots.

BEGIN;

-- 1. Delete phantom duplicate/migrated orders
DELETE FROM portfolio_orders
WHERE id IN (
  '03448bec-040a-4949-ae50-3577401f803a',
  '02cd7196-9137-4f68-85ec-eb3c6f76828b',
  '3a3830b0-7351-45d1-bdfc-cf9c6988221f',
  '73bf3d61-9f40-4713-8bed-b60150723d94',
  '0749bea8-d47d-402b-8526-8cf78a06d089',
  '1a688a15-22ea-4c1b-abd8-206955dd3208',
  '5f267994-071f-4d8b-9edf-b7f9fef1f449',
  '5693b63e-9d02-41c2-8513-35362cd30de9',
  '42b2859c-d3b4-4e34-9a7b-77a2e7f12d39',
  '207c7aed-0793-4192-afee-59ba51683d45',
  '482599e4-6a9d-4a79-805e-742503dbf809'
);

-- 2. Delete corresponding phantom auto-deposits
DELETE FROM portfolio_transfers
WHERE id IN (
  'abfe5501-dca3-450e-a8f9-0a6cc376b1bd',
  'c4904fe1-e969-4436-bbe5-53df700ccdfc',
  '433aa497-3ee2-4826-8d2e-0475ed472ce9',
  '5cfb2c9c-3135-432c-bfb7-4a44ad45ce44',
  '9c8c79ab-5e03-48db-b4e2-cf54e7aae7ff',
  'c9cdc374-7483-437f-a826-2139ab909b91',
  'b7778416-a96a-4f3b-8c55-81bb8688fd48',
  'f2f8516e-bf6d-4144-8629-132f5a1912de',
  'c5891617-9a69-417f-b9a6-0b96df4cc5e2',
  '397413e0-7bb3-47dc-8826-3a085556d66c',
  '83777ec6-3ce1-4a75-bc6e-99990fcf9cff'
);

-- 3. Delete duplicate phantom open positions for CCOLA and TKFEN
DELETE FROM portfolio_positions
WHERE id IN (
  '2d60d98f-6dff-4af2-906f-4784d2dbe278',
  'fb56cc10-baf4-4288-9b97-4422944f5ad3'
);

-- Ensure previous closed positions remain closed
UPDATE portfolio_positions
SET is_open = false, quantity = 0
WHERE id IN (
  'f6b284ec-008f-4058-8f4b-e9a8d42968e3',
  '0b391b00-1d6a-492b-a817-41c21b4baeab'
);

-- 4. Correct position quantities and average entry prices to match real user orders
UPDATE portfolio_positions
SET quantity = 3471.000000, avg_entry_price = 4.622273, notes = 'DCA tranche: added 650 shares @ ₺3.23', updated_at = NOW()
WHERE id = 'c40d6542-b9c8-497d-8511-dfd51d2635db';

UPDATE portfolio_positions
SET quantity = 298.000000, avg_entry_price = 30.198255, notes = 'DCA tranche: added 40 shares @ ₺26.90', updated_at = NOW()
WHERE id = '2c18bc67-489a-4117-9765-c10b1afc1bd6';

UPDATE portfolio_positions
SET quantity = 35.000000, avg_entry_price = 71.200000, notes = 'Position initiation @ 50 EMA', updated_at = NOW()
WHERE id = 'be6fbb12-e5b7-4d98-a187-a9710b946d1d';

UPDATE portfolio_positions
SET quantity = 21.000000, avg_entry_price = 45.440000, notes = 'Banking value accumulation', updated_at = NOW()
WHERE id = 'bfa33649-e2ae-40cd-8f30-032efdf054a8';

UPDATE portfolio_positions
SET quantity = 4.000000, avg_entry_price = 212.000000, notes = 'Active holding', updated_at = NOW()
WHERE id = '3125b317-fed4-4849-bc1d-fd0d26913a8d';

UPDATE portfolio_positions
SET quantity = 29.000000, avg_entry_price = 33.700000, notes = 'Active holding', updated_at = NOW()
WHERE id = '2103d27b-e8a5-423a-99bf-dea69fc7fa75';

UPDATE portfolio_positions
SET quantity = 53.000000, avg_entry_price = 18.430000, notes = 'Active holding', updated_at = NOW()
WHERE id = 'dad977b9-98e6-45d1-a372-68b661682b0d';

UPDATE portfolio_positions
SET quantity = 108.000000, avg_entry_price = 18.221100, notes = 'DCA tranche: added 60 shares @ ₺16.67', updated_at = NOW()
WHERE id = 'd0fb6551-da6c-4873-b9c6-a0d39efea720';

COMMIT;
