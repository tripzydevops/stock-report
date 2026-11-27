/**
 * Single Source of Truth for Dividend Source Precedence & Confirmation Rules.
 * Shared across Next.js TypeScript routes/libs and Node (.mjs) Playwright scrapers.
 */

export const AUTHORITATIVE_CONFIRMED_SOURCES = new Set([
  'KAP_OFFICIAL',
  'FINTABLES_DIVIDEND_CALENDAR',
  'ISYATIRIM_CORPORATE_ACTIONS',
]);

export const AUTHORITATIVE_UNCONFIRMED_SOURCES = new Set([
  'FINTABLES_DIVIDEND_CALENDAR_GROSS_ONLY_UNCONFIRMED',
  'ISYATIRIM_CORPORATE_ACTIONS_GROSS_ONLY_UNCONFIRMED',
]);

export const YAHOO_ESTIMATE_SOURCES = new Set([
  'YAHOO_ESTIMATED',
  'YAHOO_LAST_DIVIDEND_VALUE',
  'YAHOO_ANNUALIZED_ESTIMATE',
  'YAHOO_LIVE',
]);

export const YAHOO_SOURCE_RANK = {
  YAHOO_LIVE: 3,
  YAHOO_LAST_DIVIDEND_VALUE: 2,
  YAHOO_ANNUALIZED_ESTIMATE: 1,
  YAHOO_ESTIMATED: 0,
};

export function isExactAuthoritativeSource(source) {
  const norm = String(source || '').trim().toUpperCase();
  return AUTHORITATIVE_CONFIRMED_SOURCES.has(norm) || AUTHORITATIVE_UNCONFIRMED_SOURCES.has(norm);
}

export function isYahooEstimateSource(source) {
  const norm = String(source || '').trim().toUpperCase();
  return YAHOO_ESTIMATE_SOURCES.has(norm);
}

export function normalizeBistSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/\.IS$/i, '') + '.IS';
}

/**
 * Pure decision function for whether an incoming dividend upsert should insert,
 * update, or be skipped to protect confirmed/authoritative dividend records.
 *
 * @param {object|null} existing - Existing asset_dividends row (id, is_confirmed, source, amount)
 * @param {object} incoming - Incoming row (symbol, ex_date, payment_date, amount, currency, frequency, is_confirmed, source)
 * @returns {{ action: 'INSERT'|'UPDATE'|'SKIP', reason: string, payload?: object }}
 */
export function evaluateDividendUpsert(existing, incoming) {
  const incomingSource = String(incoming.source || '').trim().toUpperCase();
  const isIncomingYahoo = isYahooEstimateSource(incomingSource);

  // Yahoo proxies can NEVER self-promote to confirmed
  const safeIsConfirmed = isIncomingYahoo ? false : Boolean(incoming.is_confirmed);

  // Gross-only / unconfirmed BIST records must carry amount = 0 for cash-ledger safety
  const safeAmount =
    !safeIsConfirmed && isExactAuthoritativeSource(incomingSource)
      ? 0
      : Number(incoming.amount) > 0
      ? Number(incoming.amount)
      : 0;

  if (!existing) {
    return {
      action: 'INSERT',
      reason: 'new_record',
      payload: {
        ...incoming,
        amount: safeAmount,
        is_confirmed: safeIsConfirmed,
        source: incomingSource,
      },
    };
  }

  const prevConfirmed = existing.is_confirmed === true;
  const prevSource = String(existing.source || '').trim().toUpperCase();
  const prevIsAuthoritative = isExactAuthoritativeSource(prevSource);

  // Rule 1: Yahoo estimates can NEVER overwrite a confirmed record or any authoritative BIST/KAP record
  if (isIncomingYahoo && (prevConfirmed || prevIsAuthoritative)) {
    return {
      action: 'SKIP',
      reason: prevConfirmed ? 'protected_confirmed_from_yahoo' : 'protected_authoritative_from_yahoo',
    };
  }

  // Rule 2: An unconfirmed scrape can NEVER downgrade an already confirmed record
  if (!safeIsConfirmed && prevConfirmed) {
    return {
      action: 'SKIP',
      reason: 'protected_confirmed_from_unconfirmed_downgrade',
    };
  }

  // Rule 3: Lower-precedence Yahoo estimate must NOT overwrite a higher-precedence Yahoo estimate
  if (isIncomingYahoo && isYahooEstimateSource(prevSource)) {
    const incomingRank = YAHOO_SOURCE_RANK[incomingSource] ?? 0;
    const prevRank = YAHOO_SOURCE_RANK[prevSource] ?? 0;
    if (incomingRank < prevRank) {
      return {
        action: 'SKIP',
        reason: 'protected_higher_precedence_yahoo_estimate',
      };
    }
  }

  // Rule 4: Confirmed authoritative record explicitly upgrades an earlier unconfirmed placeholder
  const isConfirmedUpgrade = safeIsConfirmed && !prevConfirmed && isExactAuthoritativeSource(incomingSource);

  const nextAmount =
    !safeIsConfirmed && isExactAuthoritativeSource(incomingSource)
      ? 0
      : Number(incoming.amount) > 0
      ? Number(incoming.amount)
      : Number(existing.amount) || 0;

  return {
    action: 'UPDATE',
    reason: isConfirmedUpgrade ? 'confirmed_upgrades_unconfirmed_placeholder' : 'safe_update',
    payload: {
      payment_date: incoming.payment_date,
      amount: nextAmount,
      is_confirmed: safeIsConfirmed,
      source: incomingSource,
      updated_at: new Date().toISOString(),
    },
  };
}
