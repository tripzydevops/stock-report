import { ExecutedOrder, CapitalTransfer } from './supabaseClient';

export interface LedgerCashResult {
  availableCashTRY: number;
  availableCashUSD: number;
  totalDepositsTRY: number;
  totalDepositsUSD: number;
  totalBuysTRY: number;
  totalBuysUSD: number;
  totalSellsTRY: number;
  totalSellsUSD: number;
  consolidatedCashTRY: number;
  consolidatedCashUSD: number;
  hasRecordHistory: boolean;
  isLedgerEmpty: boolean;
  hasUsdActivity: boolean;
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
 * Computes native segregated cash ledgers:
 * - TRY Wallet: (All TRY Deposits + All TRY Sells - All TRY Buys)
 * - USD Wallet: (All USD Deposits + All USD Sells - All USD Buys)
 * 
 * Follows chronological event execution. When a buy order exceeds available native cash,
 * the shortfall is funded via new capital injection in that native currency (no arbitrary cross-FX distortion).
 */
export function calculateLedgerCash(
  orders: ExecutedOrder[] = [],
  transfers: CapitalTransfer[] = [],
  usdTryRate: number = 48.95,
  initialBaseDepositTRY: number = 0
): LedgerCashResult {
  interface TimelineEvent {
    type: 'TRANSFER' | 'ORDER';
    timestamp: number;
    currency: 'TRY' | 'USD';
    transferType?: 'DEPOSIT' | 'WITHDRAWAL';
    side?: 'BUY' | 'SELL';
    amount: number;
    ref?: string;
  }

  const events: TimelineEvent[] = [];

  // 1. Process Transfers
  if (transfers.length > 0) {
    for (const t of transfers) {
      const ts = t.transferDate ? new Date(t.transferDate + 'T00:00:00Z').getTime() : 0;
      const curr: 'TRY' | 'USD' = t.currency?.toUpperCase() === 'USD' ? 'USD' : 'TRY';
      events.push({
        type: 'TRANSFER',
        timestamp: ts,
        currency: curr,
        transferType: t.transferType,
        amount: Number(t.amount) || 0,
        ref: t.id
      });
    }
  } else if (initialBaseDepositTRY > 0) {
    // Seed initial deposit baseline only if explicitly provided > 0
    events.push({
      type: 'TRANSFER',
      timestamp: new Date('2026-09-16T00:00:00Z').getTime(),
      currency: 'TRY',
      transferType: 'DEPOSIT',
      amount: initialBaseDepositTRY,
      ref: 'init-deposit'
    });
  }

  // 2. Process Executed Orders
  for (const o of orders) {
    const ts = parseOrderTimestamp(o);
    const val = Number(o.totalValue) || (Number(o.quantity) * Number(o.price)) || 0;
    const curr: 'TRY' | 'USD' = o.currency?.toUpperCase() === 'USD' ? 'USD' : 'TRY';
    events.push({
      type: 'ORDER',
      timestamp: ts,
      currency: curr,
      side: o.side,
      amount: val,
      ref: o.id || o.ref
    });
  }

  // 3. Sort chronologically ascending
  events.sort((a, b) => a.timestamp - b.timestamp);

  // 4. Chronological Ledger Execution for Dual Wallets
  let runningCashTRY = 0;
  let runningCashUSD = 0;
  let totalDepositsTRY = 0;
  let totalDepositsUSD = 0;
  let totalBuysTRY = 0;
  let totalBuysUSD = 0;
  let totalSellsTRY = 0;
  let totalSellsUSD = 0;

  for (const ev of events) {
    if (ev.currency === 'USD') {
      if (ev.type === 'TRANSFER') {
        if (ev.transferType === 'DEPOSIT') {
          runningCashUSD += ev.amount;
          totalDepositsUSD += ev.amount;
        } else {
          runningCashUSD = Math.max(0, runningCashUSD - ev.amount);
          totalDepositsUSD = Math.max(0, totalDepositsUSD - ev.amount);
        }
      } else if (ev.type === 'ORDER') {
        if (ev.side === 'SELL') {
          runningCashUSD += ev.amount;
          totalSellsUSD += ev.amount;
        } else if (ev.side === 'BUY') {
          totalBuysUSD += ev.amount;
          if (ev.amount > runningCashUSD) {
            const shortfall = ev.amount - runningCashUSD;
            totalDepositsUSD += shortfall; // Auto-fund native USD shortfall
            runningCashUSD = 0;
          } else {
            runningCashUSD -= ev.amount;
          }
        }
      }
    } else {
      // TRY Wallet
      if (ev.type === 'TRANSFER') {
        if (ev.transferType === 'DEPOSIT') {
          runningCashTRY += ev.amount;
          totalDepositsTRY += ev.amount;
        } else {
          runningCashTRY = Math.max(0, runningCashTRY - ev.amount);
          totalDepositsTRY = Math.max(0, totalDepositsTRY - ev.amount);
        }
      } else if (ev.type === 'ORDER') {
        if (ev.side === 'SELL') {
          runningCashTRY += ev.amount;
          totalSellsTRY += ev.amount;
        } else if (ev.side === 'BUY') {
          totalBuysTRY += ev.amount;
          if (ev.amount > runningCashTRY) {
            const shortfall = ev.amount - runningCashTRY;
            totalDepositsTRY += shortfall; // Auto-fund native TRY shortfall
            runningCashTRY = 0;
          } else {
            runningCashTRY -= ev.amount;
          }
        }
      }
    }
  }

  const isLedgerEmpty = orders.length === 0 && transfers.length === 0 && initialBaseDepositTRY === 0;
  const hasRecordHistory = transfers.length > 0;
  const hasUsdActivity = runningCashUSD > 0 || totalDepositsUSD > 0 || totalBuysUSD > 0 || totalSellsUSD > 0;

  const validFxRate = Number.isFinite(usdTryRate) && usdTryRate > 0 ? usdTryRate : 50.0;
  const consolidatedCashTRY = Number((runningCashTRY + (runningCashUSD * validFxRate)).toFixed(2));
  const consolidatedCashUSD = Number(((runningCashTRY / validFxRate) + runningCashUSD).toFixed(2));

  return {
    availableCashTRY: Number(runningCashTRY.toFixed(2)),
    availableCashUSD: Number(runningCashUSD.toFixed(2)),
    totalDepositsTRY: Number(totalDepositsTRY.toFixed(2)),
    totalDepositsUSD: Number(totalDepositsUSD.toFixed(2)),
    totalBuysTRY: Number(totalBuysTRY.toFixed(2)),
    totalBuysUSD: Number(totalBuysUSD.toFixed(2)),
    totalSellsTRY: Number(totalSellsTRY.toFixed(2)),
    totalSellsUSD: Number(totalSellsUSD.toFixed(2)),
    consolidatedCashTRY,
    consolidatedCashUSD,
    hasRecordHistory,
    isLedgerEmpty,
    hasUsdActivity
  };
}
