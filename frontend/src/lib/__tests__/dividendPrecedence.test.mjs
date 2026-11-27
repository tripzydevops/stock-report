import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDividendUpsert,
  isExactAuthoritativeSource,
  isYahooEstimateSource,
  normalizeBistSymbol,
} from '../dividendPrecedence.mjs';

test('normalizeBistSymbol ensures exactly one .IS suffix', () => {
  assert.equal(normalizeBistSymbol('froto'), 'FROTO.IS');
  assert.equal(normalizeBistSymbol('FROTO.IS'), 'FROTO.IS');
  assert.equal(normalizeBistSymbol('  tuprs.is  '), 'TUPRS.IS');
});

test('exact canonical source matching rejects malformed prefix strings', () => {
  assert.equal(isExactAuthoritativeSource('KAP_OFFICIAL'), true);
  assert.equal(isExactAuthoritativeSource('FINTABLES_DIVIDEND_CALENDAR'), true);
  assert.equal(isExactAuthoritativeSource('FINTABLES_DIVIDEND_CALENDAR_GROSS_ONLY_UNCONFIRMED'), true);
  assert.equal(isExactAuthoritativeSource('FINTABLES_TEST'), false);
  assert.equal(isExactAuthoritativeSource('KAP_FAKE'), false);
  assert.equal(isYahooEstimateSource('YAHOO_LAST_DIVIDEND_VALUE'), true);
});

test('Yahoo estimate cannot overwrite an existing confirmed KAP dividend', () => {
  const existing = {
    id: 'row-1',
    is_confirmed: true,
    source: 'KAP_OFFICIAL',
    amount: 3.07,
  };
  const incomingYahoo = {
    symbol: 'FROTO.IS',
    ex_date: '2026-11-26',
    payment_date: '2026-11-30',
    amount: 3.64,
    currency: 'TRY',
    frequency: 'Semi-Annual',
    is_confirmed: true, // even if caller tries to pass true
    source: 'YAHOO_LAST_DIVIDEND_VALUE',
  };

  const decision = evaluateDividendUpsert(existing, incomingYahoo);
  assert.equal(decision.action, 'SKIP');
  assert.equal(decision.reason, 'protected_confirmed_from_yahoo');
});

test('Yahoo estimate cannot promote or overwrite an unconfirmed authoritative BIST record', () => {
  const existing = {
    id: 'row-2',
    is_confirmed: false,
    source: 'FINTABLES_DIVIDEND_CALENDAR_GROSS_ONLY_UNCONFIRMED',
    amount: 0,
  };
  const incomingYahoo = {
    symbol: 'ISMEN.IS',
    ex_date: '2026-12-05',
    payment_date: '2026-12-09',
    amount: 2.15,
    currency: 'TRY',
    frequency: 'Annual',
    is_confirmed: false,
    source: 'YAHOO_ANNUALIZED_ESTIMATE',
  };

  const decision = evaluateDividendUpsert(existing, incomingYahoo);
  assert.equal(decision.action, 'SKIP');
  assert.equal(decision.reason, 'protected_authoritative_from_yahoo');
});

test('Gross-only scraper record cannot downgrade an existing confirmed dividend', () => {
  const existing = {
    id: 'row-3',
    is_confirmed: true,
    source: 'FINTABLES_DIVIDEND_CALENDAR',
    amount: 4.5,
  };
  const incomingGrossOnly = {
    symbol: 'TUPRS.IS',
    ex_date: '2026-09-28',
    payment_date: '2026-09-30',
    amount: 5.0, // even if non-zero passed, gross-only must not downgrade
    currency: 'TRY',
    frequency: 'Semi-Annual',
    is_confirmed: false,
    source: 'ISYATIRIM_CORPORATE_ACTIONS_GROSS_ONLY_UNCONFIRMED',
  };

  const decision = evaluateDividendUpsert(existing, incomingGrossOnly);
  assert.equal(decision.action, 'SKIP');
  assert.equal(decision.reason, 'protected_confirmed_from_unconfirmed_downgrade');
});

test('Gross-only scraper insert forces amount = 0 and is_confirmed = false', () => {
  const incomingGrossOnly = {
    symbol: 'TUPRS.IS',
    ex_date: '2026-12-15',
    payment_date: '2026-12-17',
    amount: 5.0,
    currency: 'TRY',
    frequency: 'Semi-Annual',
    is_confirmed: false,
    source: 'FINTABLES_DIVIDEND_CALENDAR_GROSS_ONLY_UNCONFIRMED',
  };

  const decision = evaluateDividendUpsert(null, incomingGrossOnly);
  assert.equal(decision.action, 'INSERT');
  assert.equal(decision.payload.amount, 0);
  assert.equal(decision.payload.is_confirmed, false);
});

test('Yahoo insert forces is_confirmed = false even if caller attempts true', () => {
  const incomingYahoo = {
    symbol: 'AAPL',
    ex_date: '2026-11-10',
    payment_date: '2026-11-14',
    amount: 0.25,
    currency: 'USD',
    frequency: 'Quarterly',
    is_confirmed: true,
    source: 'YAHOO_LAST_DIVIDEND_VALUE',
  };

  const decision = evaluateDividendUpsert(null, incomingYahoo);
  assert.equal(decision.action, 'INSERT');
  assert.equal(decision.payload.is_confirmed, false);
});

test('Yahoo update on existing Yahoo estimate preserves prior amount if new amount is 0', () => {
  const existing = {
    id: 'row-4',
    is_confirmed: false,
    source: 'YAHOO_ESTIMATED',
    amount: 0.25,
  };
  const incomingYahoo = {
    symbol: 'AAPL',
    ex_date: '2026-11-10',
    payment_date: '2026-11-14',
    amount: 0,
    currency: 'USD',
    frequency: 'Quarterly',
    is_confirmed: false,
    source: 'YAHOO_LAST_DIVIDEND_VALUE',
  };

  const decision = evaluateDividendUpsert(existing, incomingYahoo);
  assert.equal(decision.action, 'UPDATE');
  assert.equal(decision.payload.amount, 0.25);
  assert.equal(decision.payload.is_confirmed, false);
});

test('Confirmed Fintables record upgrades an earlier gross-only placeholder', () => {
  const existing = {
    id: 'row-5',
    is_confirmed: false,
    source: 'FINTABLES_DIVIDEND_CALENDAR_GROSS_ONLY_UNCONFIRMED',
    amount: 0,
  };
  const incomingConfirmed = {
    symbol: 'TUPRS.IS',
    ex_date: '2026-12-15',
    payment_date: '2026-12-17',
    amount: 4.25,
    currency: 'TRY',
    frequency: 'Semi-Annual',
    is_confirmed: true,
    source: 'FINTABLES_DIVIDEND_CALENDAR',
  };

  const decision = evaluateDividendUpsert(existing, incomingConfirmed);
  assert.equal(decision.action, 'UPDATE');
  assert.equal(decision.reason, 'confirmed_upgrades_unconfirmed_placeholder');
  assert.equal(decision.payload.is_confirmed, true);
  assert.equal(decision.payload.amount, 4.25);
  assert.equal(decision.payload.source, 'FINTABLES_DIVIDEND_CALENDAR');
});

test('Lower-precedence YAHOO_ANNUALIZED_ESTIMATE cannot overwrite YAHOO_LAST_DIVIDEND_VALUE', () => {
  const existing = {
    id: 'row-6',
    is_confirmed: false,
    source: 'YAHOO_LAST_DIVIDEND_VALUE',
    amount: 0.25,
  };
  const incomingLower = {
    symbol: 'AAPL',
    ex_date: '2026-11-10',
    payment_date: '2026-11-14',
    amount: 0.21,
    currency: 'USD',
    frequency: 'Quarterly',
    is_confirmed: false,
    source: 'YAHOO_ANNUALIZED_ESTIMATE',
  };

  const decision = evaluateDividendUpsert(existing, incomingLower);
  assert.equal(decision.action, 'SKIP');
  assert.equal(decision.reason, 'protected_higher_precedence_yahoo_estimate');
});
