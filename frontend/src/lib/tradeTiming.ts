/**
 * Calculates estimated exit dates and trading days remaining based on trade strategy.
 * Standard time horizons:
 * - Momentum Breakout: 12 trading days (~2.5 weeks)
 * - Volatility Squeeze: 15 trading days (~3 weeks)
 * - Trend Pullback: 20 trading days (~4 weeks)
 * - Core / Dividend: Indefinite (Multi-quarter)
 */

export interface TradeExitInfo {
  maxExitDate: string; // ISO date string YYYY-MM-DD
  maxExitDateFormatted: string; // e.g. "27 Oct 2026"
  tradingDaysTotal: number;
  tradingDaysHeld: number;
  tradingDaysRemaining: number;
  isExpired: boolean;
  isDividend: boolean;
  statusColor: 'green' | 'amber' | 'rose' | 'purple';
  label: string;
}

export function calculateExitDate(
  startDateStr?: string | null,
  strategy: string = 'SWING',
  isDividend: boolean = false
): TradeExitInfo {
  if (isDividend || strategy.toUpperCase().includes('DIVIDEND') || strategy.toUpperCase().includes('CORE')) {
    return {
      maxExitDate: 'Indefinite',
      maxExitDateFormatted: 'Core Compounder',
      tradingDaysTotal: 999,
      tradingDaysHeld: 0,
      tradingDaysRemaining: 999,
      isExpired: false,
      isDividend: true,
      statusColor: 'purple',
      label: 'Core / Indefinite'
    };
  }

  // Determine target trading days based on strategy
  let targetTradingDays = 20; // Default swing
  const stratUpper = (strategy || '').toUpperCase();
  if (stratUpper.includes('BREAKOUT') || stratUpper.includes('MOMENTUM')) {
    targetTradingDays = 12;
  } else if (stratUpper.includes('SQUEEZE')) {
    targetTradingDays = 15;
  } else if (stratUpper.includes('PULLBACK')) {
    targetTradingDays = 20;
  }

  const start = startDateStr ? new Date(startDateStr) : new Date();
  const validStart = isNaN(start.getTime()) ? new Date() : start;

  // Add N business days (skip Saturday & Sunday) to compute maxExitDate
  const cur = new Date(validStart);
  let addedDays = 0;
  while (addedDays < targetTradingDays) {
    cur.setDate(cur.getDate() + 1);
    const dayOfWeek = cur.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0=Sunday, 6=Saturday
      addedDays++;
    }
  }

  const maxExitDate = cur.toISOString().slice(0, 10);
  const maxExitDateFormatted = cur.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Calculate trading days passed from start until today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDay = new Date(validStart);
  startDay.setHours(0, 0, 0, 0);

  let tradingDaysHeld = 0;
  const dIter = new Date(startDay);
  while (dIter < today) {
    dIter.setDate(dIter.getDate() + 1);
    const dayOfWeek = dIter.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      tradingDaysHeld++;
    }
  }

  const tradingDaysRemaining = Math.max(0, targetTradingDays - tradingDaysHeld);
  const isExpired = tradingDaysRemaining === 0 && today > cur;

  let statusColor: 'green' | 'amber' | 'rose' | 'purple' = 'green';
  let label = `${tradingDaysRemaining}d remaining`;

  if (isExpired) {
    statusColor = 'rose';
    label = 'Expired ⏳';
  } else if (tradingDaysRemaining <= 4) {
    statusColor = 'rose';
    label = `${tradingDaysRemaining}d left (Time stop)`;
  } else if (tradingDaysRemaining <= 9) {
    statusColor = 'amber';
    label = `${tradingDaysRemaining}d left`;
  } else {
    statusColor = 'green';
    label = `${tradingDaysRemaining}d left`;
  }

  return {
    maxExitDate,
    maxExitDateFormatted,
    tradingDaysTotal: targetTradingDays,
    tradingDaysHeld,
    tradingDaysRemaining,
    isExpired,
    isDividend: false,
    statusColor,
    label
  };
}
