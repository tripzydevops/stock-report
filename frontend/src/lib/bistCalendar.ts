/**
 * Borsa Istanbul (BIST) Authoritative Trading Calendar & Session Resolver.
 * 
 * Single source of truth for BIST holidays, half-days, and trading session schedules.
 * Synchronized with shared/bist_calendar.json
 */
import calendarData from '@/data/bist_calendar.json';

export interface BistMarketHours {
  open: string;
  close: string;
  continuous_auction_close?: string;
}

export interface BistCalendarDefinition {
  version: string;
  exchange: string;
  name: string;
  timezone: string;
  utc_offset_hours: number;
  market_hours: {
    regular: BistMarketHours;
    half_day: BistMarketHours;
  };
  full_holidays: Record<string, string>;
  half_days: Record<string, string>;
}

const calendar = calendarData as unknown as BistCalendarDefinition;

/**
 * Official BIST Exchange Full Holidays (closed all day).
 */
export const BIST_MARKET_HOLIDAYS = new Set<string>(
  Object.keys(calendar.full_holidays || {})
);

/**
 * Official BIST Exchange Half-Days (session closes early at 13:00 TRT).
 */
export const BIST_HALF_DAYS = new Set<string>(
  Object.keys(calendar.half_days || {})
);

/**
 * Returns true if the given YYYY-MM-DD date is a full official BIST closed holiday.
 */
export function isBistHoliday(dateStr: string): boolean {
  return BIST_MARKET_HOLIDAYS.has(dateStr);
}

/**
 * Returns true if the given YYYY-MM-DD date is an official BIST half-day (closes 13:00 TRT).
 */
export function isBistHalfDay(dateStr: string): boolean {
  return BIST_HALF_DAYS.has(dateStr);
}

/**
 * Resolves date components strictly in Europe/Istanbul timezone via Intl DateTimeFormat.
 * Provides timezone-resilient hour, minute, day-of-week, and dateStr regardless of host system configuration.
 */
export function getIstanbulDateParts(now: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(p => [p.type, p.value]));
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);

  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' });
  const dayName = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[dayName] ?? 1;

  return { dateStr, hour, minute, dayOfWeek };
}

/**
 * Checks whether Borsa Istanbul is currently in an active trading session.
 * Regular trading days: 10:00 to 18:10 TRT (UTC+3).
 * Half trading days: 10:00 to 13:00 TRT (UTC+3).
 */
export function isBistMarketOpen(now: Date = new Date()): boolean {
  const { dateStr, hour, minute, dayOfWeek } = getIstanbulDateParts(now);

  if (dayOfWeek === 0 || dayOfWeek === 6 || isBistHoliday(dateStr)) {
    return false;
  }

  const totalMinutes = hour * 60 + minute;
  const marketOpen = 10 * 60; // 10:00
  const marketClose = isBistHalfDay(dateStr) ? 13 * 60 : 18 * 60 + 10; // 13:00 or 18:10

  return totalMinutes >= marketOpen && totalMinutes < marketClose;
}

/**
 * Resolves the latest official BIST trading session date in YYYY-MM-DD format.
 * BIST trading hours: Monday–Friday 10:00–18:10 TRT (UTC+3).
 * If called pre-market (< 10:00 AM TRT), rolls back to the previous session.
 * Automatically rolls back past weekends and official closed market holidays.
 */
export function getBistTradingSessionDate(now: Date = new Date()): string {
  const { dateStr, hour } = getIstanbulDateParts(now);
  const targetDate = new Date(`${dateStr}T12:00:00Z`);

  // If before 10:00 AM TRT, look for previous trading session
  if (hour < 10) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  // Roll back past weekends (0=Sun, 6=Sat) and official BIST market holidays
  while (
    targetDate.getUTCDay() === 0 ||
    targetDate.getUTCDay() === 6 ||
    isBistHoliday(targetDate.toISOString().slice(0, 10))
  ) {
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);
  }

  return targetDate.toISOString().slice(0, 10);
}

/**
 * Resolves the prior official BIST trading session date immediately preceding a given session.
 */
export function getPriorBistSessionDate(fromSession?: string): string {
  const baseDateStr = fromSession || getIstanbulDateParts().dateStr;
  const base = new Date(`${baseDateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - 1);
  while (
    base.getUTCDay() === 0 ||
    base.getUTCDay() === 6 ||
    isBistHoliday(base.toISOString().slice(0, 10))
  ) {
    base.setUTCDate(base.getUTCDate() - 1);
  }
  return base.toISOString().slice(0, 10);
}

/**
 * Validates whether a BIST quote's session date is fresh and market-session-aware.
 * - Accepts if quote session date == current official BIST session date.
 * - Rejects if quote session date > current official session date (future date).
 * - Accepts immediately preceding session if current session hasn't opened yet (< 10:00 AM TRT)
 *   or during the early opening transition (< 10:30 AM TRT) or when the market is closed.
 * - Rejects stale quotes older than the prior session.
 */
export function isValidBistQuoteSession(quoteSessionDate: string, now: Date = new Date()): boolean {
  if (!quoteSessionDate || !/^\d{4}-\d{2}-\d{2}$/.test(quoteSessionDate)) return false;

  const currentSession = getBistTradingSessionDate(now);
  if (quoteSessionDate === currentSession) {
    return true;
  }

  // Reject future-dated quotes
  if (quoteSessionDate > currentSession) {
    return false;
  }

  // Allow immediately preceding session during pre-market, opening auction transition, or closed hours
  const priorSession = getPriorBistSessionDate(currentSession);
  if (quoteSessionDate === priorSession) {
    const { hour, minute } = getIstanbulDateParts(now);
    const totalMin = hour * 60 + minute;
    // Before 10:30 TRT (pre-market + opening auction) or outside market hours (weekend/holiday/evening)
    if (totalMin < 10 * 60 + 30 || !isBistMarketOpen(now)) {
      return true;
    }
  }

  return false;
}
