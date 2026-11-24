import { test, expect } from '@playwright/test';
import {
  calculateAdjustedEntitlement,
  MULTIPLIER_ACTIONS,
  OrderLedgerEntry,
  CorporateActionEntry,
} from '../src/lib/serverlessDividendSync';

test.describe('Corporate Actions & Dividend Entitlement Engine', () => {
  test('1. Forward stock split (2-for-1) doubles entitlement for pre-split purchases', () => {
    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 100, executed_at: '2026-03-01T10:00:00Z' }
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'FROTO', action_type: 'FORWARD_SPLIT', split_ratio: 2.0, effective_date: '2026-04-01' }
    ];
    const exDate = '2026-05-01';

    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'FROTO', exDate);
    expect(entitled).toBe(200);
  });

  test('2. 100% Bedelsiz (BONUS_ISSUE) doubles entitlement for pre-event purchases', () => {
    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 150, executed_at: '2026-03-01T10:00:00Z' }
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'BIMAS', action_type: 'BONUS_ISSUE', split_ratio: 2.0, effective_date: '2026-04-10' }
    ];
    const exDate = '2026-05-01';

    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'BIMAS', exDate);
    expect(entitled).toBe(300);
  });

  test('3. Bedelsiz action type alias (BEDELSIZ) is recognized by MULTIPLIER_ACTIONS', () => {
    expect(MULTIPLIER_ACTIONS.has('BEDELSIZ')).toBe(true);
    expect(MULTIPLIER_ACTIONS.has('BONUS_ISSUE')).toBe(true);

    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 80, executed_at: '2026-02-15T10:00:00Z' }
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'ASELS', action_type: 'BEDELSIZ', split_ratio: 2.0, effective_date: '2026-03-15' }
    ];
    const exDate = '2026-04-01';

    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'ASELS', exDate);
    expect(entitled).toBe(160);
  });

  test('4. Reverse split (1-for-10) scales entitlement to fractional ratio (0.10)', () => {
    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 500, executed_at: '2026-03-01T10:00:00Z' }
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'TSLA', action_type: 'REVERSE_SPLIT', split_ratio: 0.10, effective_date: '2026-04-01' }
    ];
    const exDate = '2026-05-01';

    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'TSLA', exDate);
    expect(entitled).toBe(50);
  });

  test('5. Inverted reverse split data-entry safeguard: split_ratio > 1 is inverted to 1/ratio', () => {
    // Data entry error: user entered 10 instead of 0.10 for a 1-for-10 reverse split
    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 500, executed_at: '2026-03-01T10:00:00Z' }
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'TSLA', action_type: 'REVERSE_SPLIT', split_ratio: 10.0, effective_date: '2026-04-01' }
    ];
    const exDate = '2026-05-01';

    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'TSLA', exDate);
    // Must NOT multiply to 5000; must invert 10 -> 0.10 to yield 50
    expect(entitled).toBe(50);
  });

  test('6. Rights offerings (RIGHTS_OFFERING and BEDELLI) are excluded from automatic share multiplication', () => {
    expect(MULTIPLIER_ACTIONS.has('RIGHTS_OFFERING')).toBe(false);
    expect(MULTIPLIER_ACTIONS.has('BEDELLI')).toBe(false);

    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 100, executed_at: '2026-03-01T10:00:00Z' }
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'THYAO', action_type: 'RIGHTS_OFFERING', split_ratio: 1.5, effective_date: '2026-04-01' },
      { symbol: 'THYAO', action_type: 'BEDELLI', split_ratio: 2.0, effective_date: '2026-04-05' }
    ];
    const exDate = '2026-05-01';

    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'THYAO', exDate);
    // Unchanged: capital subscription required, zero free share expansion
    expect(entitled).toBe(100);
  });

  test('7. Purchase executed on or after split effective date is NOT multiplied', () => {
    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 100, executed_at: '2026-03-01T10:00:00Z' }, // Pre-split
      { side: 'BUY', quantity: 100, executed_at: '2026-04-05T10:00:00Z' }  // Post-split
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'KCHOL', action_type: 'FORWARD_SPLIT', split_ratio: 2.0, effective_date: '2026-04-01' }
    ];
    const exDate = '2026-05-01';

    // First 100 gets 2x = 200; second 100 was bought post-split = 100. Total = 300.
    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'KCHOL', exDate);
    expect(entitled).toBe(300);
  });

  test('8. Split occurring on or after dividend ex-date does NOT multiply prior dividend entitlement', () => {
    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 100, executed_at: '2026-03-01T10:00:00Z' }
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'KO', action_type: 'FORWARD_SPLIT', split_ratio: 2.0, effective_date: '2026-05-10' }
    ];
    const exDate = '2026-05-01'; // Split happens AFTER dividend ex-date

    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'KO', exDate);
    expect(entitled).toBe(100);
  });

  test('9. Buy and sell netting with post-split sales', () => {
    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 200, executed_at: '2026-02-01T10:00:00Z' }, // Pre-split
      { side: 'SELL', quantity: 50, executed_at: '2026-04-10T10:00:00Z' }  // Post-split sell
    ];
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'EREGL', action_type: 'FORWARD_SPLIT', split_ratio: 2.0, effective_date: '2026-03-01' }
    ];
    const exDate = '2026-05-01';

    // BUY 200 * 2 = 400 adjusted. SELL 50 (after split, so not split-adjusted) = 50. Net = 350.
    const entitled = calculateAdjustedEntitlement(orders, corporateActions, 'EREGL', exDate);
    expect(entitled).toBe(350);
  });

  test('10. Dual symbol normalization handles naked and .IS ticker variations', () => {
    const orders: OrderLedgerEntry[] = [
      { side: 'BUY', quantity: 120, executed_at: '2026-03-01T10:00:00Z' }
    ];
    // Corporate action registered with .IS suffix
    const corporateActions: CorporateActionEntry[] = [
      { symbol: 'FROTO.IS', action_type: 'FORWARD_SPLIT', split_ratio: 3.0, effective_date: '2026-04-01' }
    ];
    const exDate = '2026-05-01';

    // Querying with naked FROTO
    const entitledNaked = calculateAdjustedEntitlement(orders, corporateActions, 'FROTO', exDate);
    expect(entitledNaked).toBe(360);

    // Querying with FROTO.IS
    const entitledSuffix = calculateAdjustedEntitlement(orders, corporateActions, 'FROTO.IS', exDate);
    expect(entitledSuffix).toBe(360);
  });
});
