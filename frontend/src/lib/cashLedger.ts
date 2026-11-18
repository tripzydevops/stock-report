import { ExecutedOrder, CapitalTransfer } from './supabaseClient';

export interface LedgerCashResult {
  availableCashTRY: number;
  availableCashUSD: number;
  totalDepositsTRY: number;
  totalDepositsUSD: number;
  totalWithdrawalsTRY: number;
  totalWithdrawalsUSD: number;
  netDepositsTRY: number;
  netDepositsUSD: number;
  totalBuysTRY: number;
  totalBuysUSD: number;
  totalSellsTRY: number;
  totalSellsUSD: number;
  consolidatedCashTRY: number;
  consolidatedCashUSD: number;
  inferredFundingTRY: number;
  inferredFundingUSD: number;
  hasRecordHistory: boolean;
  isLedgerEmpty: boolean;
  hasUsdActivity: boolean;
}

export function isValidTransfer(t: CapitalTransfer | any): boolean {
  if (!t) return false;
  const amt = Number(t.amount);
  if (!Number.isFinite(amt) || amt <= 0) return false;
  const type = (t.transferType || t.transfer_type)?.toUpperCase();
  return type === 'DEPOSIT' || type === 'WITHDRAWAL';
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
 * - TRY Wallet: (All TRY Deposits + All TRY Sells - All TRY Buys - All TRY Withdrawals)
 * - USD Wallet: (All USD Deposits + All USD Sells - All USD Buys - All USD Withdrawals)
 * 
 * Follows chronological event execution. When a buy order exceeds available native cash,
 * the shortfall is funded via new capital injection in that native currency (no arbitrary cross-FX distortion).
 * Withdrawals decrease available cash but do not reduce gross lifetime deposited capital.
 */
export function calculateLedgerCash(
  orders: ExecutedOrder[] = [],
  transfers: CapitalTransfer[] = [],
  usdTryRate: number = 50.43,
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

  // 1. Process Transfers (defensively validate positive finite amount and valid transfer type)
  const cleanTransfers = (transfers || []).filter(isValidTransfer);

  if (cleanTransfers.length > 0) {
    for (const t of cleanTransfers) {
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

  // 2. Process Executed Orders (Strictly filter for filled orders so Pending/Cancelled/Rejected orders do not mutate cash)
  const filledOrders = orders.filter(
    (order) => !order.status || order.status.trim().toLowerCase() === 'filled'
  );

  for (const o of filledOrders) {
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
  let totalWithdrawalsTRY = 0;
  let totalWithdrawalsUSD = 0;
  let totalBuysTRY = 0;
  let totalBuysUSD = 0;
  let totalSellsTRY = 0;
  let totalSellsUSD = 0;
  let inferredFundingTRY = 0;
  let inferredFundingUSD = 0;

  for (const ev of events) {
    if (ev.currency === 'USD') {
      if (ev.type === 'TRANSFER') {
        if (ev.transferType === 'DEPOSIT') {
          runningCashUSD += ev.amount;
          totalDepositsUSD += ev.amount;
        } else if (ev.transferType === 'WITHDRAWAL') {
          runningCashUSD = Math.max(0, runningCashUSD - ev.amount);
          totalWithdrawalsUSD += ev.amount;
        }
      } else if (ev.type === 'ORDER') {
        if (ev.side === 'SELL') {
          runningCashUSD += ev.amount;
          totalSellsUSD += ev.amount;
        } else if (ev.side === 'BUY') {
          totalBuysUSD += ev.amount;
          if (ev.amount > runningCashUSD) {
            const shortfall = ev.amount - runningCashUSD;
            totalDepositsUSD += shortfall; // Inferred auto-fund native USD shortfall
            inferredFundingUSD += shortfall;
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
        } else if (ev.transferType === 'WITHDRAWAL') {
          runningCashTRY = Math.max(0, runningCashTRY - ev.amount);
          totalWithdrawalsTRY += ev.amount;
        }
      } else if (ev.type === 'ORDER') {
        if (ev.side === 'SELL') {
          runningCashTRY += ev.amount;
          totalSellsTRY += ev.amount;
        } else if (ev.side === 'BUY') {
          totalBuysTRY += ev.amount;
          if (ev.amount > runningCashTRY) {
            const shortfall = ev.amount - runningCashTRY;
            totalDepositsTRY += shortfall; // Inferred auto-fund native TRY shortfall
            inferredFundingTRY += shortfall;
            runningCashTRY = 0;
          } else {
            runningCashTRY -= ev.amount;
          }
        }
      }
    }
  }

  const isLedgerEmpty = filledOrders.length === 0 && cleanTransfers.length === 0 && initialBaseDepositTRY === 0;
  const hasRecordHistory = cleanTransfers.length > 0;
  const hasUsdActivity = runningCashUSD > 0 || totalDepositsUSD > 0 || totalBuysUSD > 0 || totalSellsUSD > 0;

  const validFxRate = Number.isFinite(usdTryRate) && usdTryRate > 0 ? usdTryRate : 50.0;
  const consolidatedCashTRY = Number((runningCashTRY + (runningCashUSD * validFxRate)).toFixed(2));
  const consolidatedCashUSD = Number(((runningCashTRY / validFxRate) + runningCashUSD).toFixed(2));

  const netDepositsTRY = Math.max(0, totalDepositsTRY - totalWithdrawalsTRY);
  const netDepositsUSD = Math.max(0, totalDepositsUSD - totalWithdrawalsUSD);

  return {
    availableCashTRY: Number(runningCashTRY.toFixed(2)),
    availableCashUSD: Number(runningCashUSD.toFixed(2)),
    totalDepositsTRY: Number(totalDepositsTRY.toFixed(2)),
    totalDepositsUSD: Number(totalDepositsUSD.toFixed(2)),
    totalWithdrawalsTRY: Number(totalWithdrawalsTRY.toFixed(2)),
    totalWithdrawalsUSD: Number(totalWithdrawalsUSD.toFixed(2)),
    netDepositsTRY: Number(netDepositsTRY.toFixed(2)),
    netDepositsUSD: Number(netDepositsUSD.toFixed(2)),
    totalBuysTRY: Number(totalBuysTRY.toFixed(2)),
    totalBuysUSD: Number(totalBuysUSD.toFixed(2)),
    totalSellsTRY: Number(totalSellsTRY.toFixed(2)),
    totalSellsUSD: Number(totalSellsUSD.toFixed(2)),
    consolidatedCashTRY,
    consolidatedCashUSD,
    inferredFundingTRY: Number(inferredFundingTRY.toFixed(2)),
    inferredFundingUSD: Number(inferredFundingUSD.toFixed(2)),
    hasRecordHistory,
    isLedgerEmpty,
    hasUsdActivity
  };
}
