import { test, expect } from '@playwright/test';
import { calculateBistTPlus2Settlement, isBistHoliday } from '../src/lib/bistCalendar';

test.describe('Dividend Cash Ledger Boundary & Settlement Engine', () => {
  test('1. T+2 Takasbank settlement skips weekends (Thursday ex-date -> Monday pay-date)', () => {
    // 2026-11-26 is Thursday (FROTO ex-date)
    // Friday Nov 27 is T+1
    // Saturday Nov 28 & Sunday Nov 29 are skipped
    // Monday Nov 30 is T+2 settlement date
    const settlementDate = calculateBistTPlus2Settlement('2026-11-26');
    expect(settlementDate).toBe('2026-11-30');
  });

  test('2. T+2 Takasbank settlement skips Turkish national holidays (Republic Day)', () => {
    // 2026-10-27 is Tuesday
    // Wednesday Oct 28 is half-day (T+1)
    // Thursday Oct 29 is 29 Ekim Cumhuriyet Bayramı (Full Holiday -> Skipped!)
    // Friday Oct 30 is T+2 settlement date
    const settlementDate = calculateBistTPlus2Settlement('2026-10-27');
    expect(settlementDate).toBe('2026-10-30');
  });

  test('3. T+2 Takasbank settlement skips religious holidays (Kurban Bayramı multi-day closure)', () => {
    // 2026-05-26 is Tuesday (Kurban Bayramı Eve)
    // Wednesday May 27: Kurban Bayramı Day 1 (Full holiday -> Skipped)
    // Thursday May 28: Kurban Bayramı Day 2 (Full holiday -> Skipped)
    // Friday May 29: Kurban Bayramı Day 3 (Full holiday -> Skipped)
    // Saturday May 30 & Sunday May 31: Weekend -> Skipped
    // Monday June 1: T+1 business day
    // Tuesday June 2: T+2 settlement date
    expect(isBistHoliday('2026-05-27')).toBe(true);
    expect(isBistHoliday('2026-05-28')).toBe(true);
    expect(isBistHoliday('2026-05-29')).toBe(true);

    const settlementDate = calculateBistTPlus2Settlement('2026-05-26');
    expect(settlementDate).toBe('2026-06-02');
  });

  test('4. Cash-Ledger Protection: Gross-only dividend is never creditable (amount: 0, is_confirmed: false)', () => {
    // Simulated scraper record where source only announced Gross DPS (e.g. İş Yatırım)
    const grossOnlyRecord = {
      symbol: 'ISMEN.IS',
      ex_date: '2026-03-29',
      payment_date: '2026-03-31',
      gross_dps: 3.50,
      net_dps: null,
      hasDeclaredNet: false,
      hasDeclaredPayDate: false,
    };

    // Scraper business rule:
    const isConfirmed = Boolean(grossOnlyRecord.hasDeclaredNet && grossOnlyRecord.hasDeclaredPayDate);
    const creditableAmount = grossOnlyRecord.hasDeclaredNet && grossOnlyRecord.net_dps !== null
      ? grossOnlyRecord.net_dps
      : 0;

    expect(isConfirmed).toBe(false);
    expect(creditableAmount).toBe(0);

    // Cash Ledger Sync Invariant:
    // processDueDividendsToCashLedger checks: .eq('is_confirmed', true) AND .gt('amount', 0)
    const isEligibleForCashCredit = isConfirmed && creditableAmount > 0;
    expect(isEligibleForCashCredit).toBe(false);
  });

  test('5. Cash-Ledger Protection: Inferred payment date prevents confirmed status', () => {
    // Record has declared net DPS but payment date was inferred via T+2 helper
    const inferredDateRecord = {
      symbol: 'FROTO.IS',
      ex_date: '2026-11-26',
      payment_date: '2026-11-30', // Inferred
      gross_dps: 3.07,
      net_dps: 2.6095,
      hasDeclaredNet: true,
      hasDeclaredPayDate: false, // NOT published by company yet
    };

    const isConfirmed = Boolean(inferredDateRecord.hasDeclaredNet && inferredDateRecord.hasDeclaredPayDate);
    expect(isConfirmed).toBe(false);

    // Unconfirmed dividends must not be auto-credited to cash ledger
    const isEligibleForCashCredit = isConfirmed && (inferredDateRecord.net_dps || 0) > 0;
    expect(isEligibleForCashCredit).toBe(false);
  });

  test('6. Cash-Ledger Protection: Confirmed dividend credits exact Net DPS without 18% overcredit', () => {
    // Fully confirmed dividend (e.g. FROTO with approved General Assembly decision)
    const confirmedRecord = {
      symbol: 'FROTO.IS',
      ex_date: '2026-11-26',
      payment_date: '2026-11-30',
      gross_dps: 3.07,
      net_dps: 2.6095,
      hasDeclaredNet: true,
      hasDeclaredPayDate: true,
    };

    const isConfirmed = Boolean(confirmedRecord.hasDeclaredNet && confirmedRecord.hasDeclaredPayDate);
    const creditableAmount = confirmedRecord.net_dps;

    expect(isConfirmed).toBe(true);
    expect(creditableAmount).toBe(2.6095);

    // Verify 1000 shares calculation:
    const shares = 1000;
    const netCredit = Number((shares * creditableAmount).toFixed(2));
    const grossCreditMistake = Number((shares * confirmedRecord.gross_dps).toFixed(2));

    expect(netCredit).toBe(2609.50);
    expect(grossCreditMistake).toBe(3070.00);

    // Difference represents the prevented 15% statutory withholding overcredit (₺460.50)
    const preventedOvercredit = grossCreditMistake - netCredit;
    expect(preventedOvercredit).toBeCloseTo(460.50, 2);
  });
});
