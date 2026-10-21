import { ExecutedOrder, CapitalTransfer } from './supabaseClient';

export interface LedgerCashResult {
  availableCashTRY: number;
  totalDepositsTRY: number;
  totalBuysTRY: number;
  totalSellsTRY: number;
}

export function parseOrderTimestamp(order: ExecutedOrder): number {
  if (order.executedAt) {
    const t = new Date(order.executedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (order.dateTime) {
    const parts = order.dateTime.split('-');
    if (parts.length >= 1) {
      const dParts = parts[0].trim().split('.');
      if (dParts.length === 3) {
        const iso = `${dParts[2]}-${dParts[1]}-${dParts[0]}T10:00:00Z`;
        const t = new Date(iso).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
    }
  }
  return 0;
}

/**
 * Computes cash strictly as: (All Deposits + All Sells - All Buys).
 * Follows chronological event execution. When a buy order exceeds available cash,
 * the shortfall is funded via new capital injection (deposit), ensuring no unbacked negative cash.
 */
export function calculateLedgerCash(
  orders: ExecutedOrder[] = [],
  transfers: CapitalTransfer[] = [],
  usdTryRate: number = 48.95,
  initialBaseDepositTRY: number = 17000.00
): LedgerCashResult {
  interface TimelineEvent {
    type: 'TRANSFER' | 'ORDER';
    timestamp: number;
    transferType?: 'DEPOSIT' | 'WITHDRAWAL';
    side?: 'BUY' | 'SELL';
    amountTRY: number;
    ref?: string;
  }

  const events: TimelineEvent[] = [];

  // 1. Process Transfers
  if (transfers.length > 0) {
    for (const t of transfers) {
      const ts = t.transferDate ? new Date(t.transferDate + 'T00:00:00Z').getTime() : 0;
      const amountTRY = t.currency === 'USD' ? t.amount * usdTryRate : t.amount;
      events.push({
        type: 'TRANSFER',
        timestamp: ts,
        transferType: t.transferType,
        amountTRY,
        ref: t.id
      });
    }
  } else {
    // Seed initial deposit baseline
    events.push({
      type: 'TRANSFER',
      timestamp: new Date('2026-09-16T00:00:00Z').getTime(),
      transferType: 'DEPOSIT',
      amountTRY: initialBaseDepositTRY,
      ref: 'init-deposit'
    });
  }

  // 2. Process Executed Orders
  for (const o of orders) {
    const ts = parseOrderTimestamp(o);
    const val = o.totalValue || (o.quantity * o.price);
    const valTRY = o.currency === 'USD' ? val * usdTryRate : val;
    events.push({
      type: 'ORDER',
      timestamp: ts,
      side: o.side,
      amountTRY: valTRY,
      ref: o.id || o.ref
    });
  }

  // 3. Sort chronologically ascending
  events.sort((a, b) => a.timestamp - b.timestamp);

  // 4. Chronological Ledger Execution
  let runningCashTRY = 0;
  let totalDepositsTRY = 0;
  let totalBuysTRY = 0;
  let totalSellsTRY = 0;

  for (const ev of events) {
    if (ev.type === 'TRANSFER') {
      if (ev.transferType === 'DEPOSIT') {
        runningCashTRY += ev.amountTRY;
        totalDepositsTRY += ev.amountTRY;
      } else {
        runningCashTRY = Math.max(0, runningCashTRY - ev.amountTRY);
        totalDepositsTRY = Math.max(0, totalDepositsTRY - ev.amountTRY);
      }
    } else if (ev.type === 'ORDER') {
      if (ev.side === 'SELL') {
        runningCashTRY += ev.amountTRY;
        totalSellsTRY += ev.amountTRY;
      } else if (ev.side === 'BUY') {
        totalBuysTRY += ev.amountTRY;
        if (ev.amountTRY > runningCashTRY) {
          const shortfall = ev.amountTRY - runningCashTRY;
          totalDepositsTRY += shortfall; // Injected capital to fund position
          runningCashTRY = 0;
        } else {
          runningCashTRY -= ev.amountTRY;
        }
      }
    }
  }

  return {
    availableCashTRY: Number(runningCashTRY.toFixed(2)),
    totalDepositsTRY: Number(totalDepositsTRY.toFixed(2)),
    totalBuysTRY: Number(totalBuysTRY.toFixed(2)),
    totalSellsTRY: Number(totalSellsTRY.toFixed(2))
  };
}
