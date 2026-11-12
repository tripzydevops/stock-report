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
 * Checks whether Borsa Istanbul is currently in an active trading session.
 * Regular trading days: 10:00 to 18:10 TRT (UTC+3).
 * Half trading days: 10:00 to 13:00 TRT (UTC+3).
 */
export function isBistMarketOpen(now: Date = new Date()): boolean {
  const istanbulTimeMs = now.getTime() + 3 * 60 * 60 * 1000;
  const trtDate = new Date(istanbulTimeMs);
  const dayOfWeek = trtDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const dateStr = trtDate.toISOString().slice(0, 10);

  if (dayOfWeek === 0 || dayOfWeek === 6 || isBistHoliday(dateStr)) {
    return false;
  }

  const hour = trtDate.getUTCHours();
  const minute = trtDate.getUTCMinutes();
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
  // Istanbul is UTC+3 (no DST)
  const istanbulTimeMs = now.getTime() + 3 * 60 * 60 * 1000;
  const trtDate = new Date(istanbulTimeMs);
  const hour = trtDate.getUTCHours();

  const targetDate = new Date(trtDate);

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
