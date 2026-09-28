'use client';

import React, { useState } from 'react';
import { PortfolioItem, RealizedTrade, ExecutedOrder, CapitalTransfer } from '../lib/supabaseClient';

interface PortfolioViewProps {
  portfolio: PortfolioItem[];
  realizedTrades?: RealizedTrade[];
  orders?: ExecutedOrder[];
  transfers?: CapitalTransfer[];
  usdTryRate: number;
  cashBalanceTRY?: number;
  onRemoveHolding?: (symbol: string) => void;
  onAddHoldingClick?: () => void;
  onTradeHolding?: (holding: PortfolioItem) => void;
  onAddTransfer?: (transfer: CapitalTransfer) => void;
}

export default function PortfolioView({
  portfolio,
  realizedTrades = [],
  orders = [],
  transfers = [],
  usdTryRate,
  cashBalanceTRY = 2952.26,
  onRemoveHolding,
  onAddHoldingClick,
  onTradeHolding,
  onAddTransfer,
}: PortfolioViewProps) {
  const [currencyMode, setCurrencyMode] = useState<'TRY' | 'USD'>('TRY');
  const [showRealized, setShowRealized] = useState(true);
  const [showTransfers, setShowTransfers] = useState(false);
  const [orderSideFilter, setOrderSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [orderAssetFilter, setOrderAssetFilter] = useState<string>('ALL');

  // Deposit modal state
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [modalTransferType, setModalTransferType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [modalAmount, setModalAmount] = useState('');
  const [modalDate, setModalDate] = useState(new Date().toISOString().slice(0, 10));
  const [modalNotes, setModalNotes] = useState('');

  // Active portfolio calculations
  const totalCostTRY = portfolio.reduce((acc, item) => {
    return acc + (item.currency === 'USD' ? item.totalCost * usdTryRate : item.totalCost);
  }, 0);

  const totalStockValTRY = portfolio.reduce((acc, item) => {
    return acc + (item.currency === 'USD' ? item.currentValue * usdTryRate : item.currentValue);
  }, 0);

  const cashValTRY = cashBalanceTRY || 0;
  const totalValTRY = totalStockValTRY + cashValTRY;

  const totalPnlTRY = totalStockValTRY - totalCostTRY;
  const totalPnlPct = totalCostTRY > 0 ? (totalPnlTRY / totalCostTRY) * 100 : 0;

  // Realized profit calculation
  const totalRealizedPnlTRY = realizedTrades.reduce((acc, trade) => {
    return acc + (trade.currency === 'USD' ? trade.realizedPnl * usdTryRate : trade.realizedPnl);
  }, 0);

  // Capital Deposited (Principal Funded) calculations
  const totalDepositedTRY = transfers.length > 0
    ? transfers.reduce((acc, t) => acc + (t.transferType === 'DEPOSIT' ? t.amount : -t.amount), 0)
    : 17000.00;

  // True Lifetime Return: Total Account Value vs Total Money Put In
  const trueRoiAmountTRY = totalValTRY - totalDepositedTRY;
  const trueRoiPercent = totalDepositedTRY > 0 ? (trueRoiAmountTRY / totalDepositedTRY) * 100 : 0;

  const totalValDisplay = currencyMode === 'USD' ? (totalValTRY / usdTryRate) : totalValTRY;
  const totalStockDisplay = currencyMode === 'USD' ? (totalStockValTRY / usdTryRate) : totalStockValTRY;
  const totalCostDisplay = currencyMode === 'USD' ? (totalCostTRY / usdTryRate) : totalCostTRY;
  const totalRealizedDisplay = currencyMode === 'USD' ? (totalRealizedPnlTRY / usdTryRate) : totalRealizedPnlTRY;
  const cashDisplay = currencyMode === 'USD' ? (cashValTRY / usdTryRate) : cashValTRY;
  const totalDepositedDisplay = currencyMode === 'USD' ? (totalDepositedTRY / usdTryRate) : totalDepositedTRY;
  const trueRoiDisplay = currencyMode === 'USD' ? (trueRoiAmountTRY / usdTryRate) : trueRoiAmountTRY;

  const formatCurr = (val: number, curr?: string) => {
    const c = curr || currencyMode;
    const symbol = c === 'USD' ? '$' : '₺';
    return `${symbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleRemove = (symbol: string) => {
    if (window.confirm(`Are you sure you want to remove ${symbol} from your portfolio?`)) {
      onRemoveHolding?.(symbol);
    }
  };

  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(modalAmount);
    if (!parsed || parsed <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    const newTrans: CapitalTransfer = {
      id: `trans-${Date.now()}`,
      transferType: modalTransferType,
      amount: parsed,
      currency: 'TRY',
      transferDate: modalDate,
      notes: modalNotes || (modalTransferType === 'DEPOSIT' ? 'Brokerage capital deposit' : 'Brokerage capital withdrawal')
    };
    onAddTransfer?.(newTrans);
    setIsDepositModalOpen(false);
    setModalAmount('');
    setModalNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Top Portfolio Summary KPI Cards (5 Pillars of Wealth) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Account Value */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Total Account Value</span>
              <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
                <button
                  onClick={() => setCurrencyMode('TRY')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md ${currencyMode === 'TRY' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
                >
                  TRY
                </button>
                <button
                  onClick={() => setCurrencyMode('USD')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md ${currencyMode === 'USD' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
                >
                  USD
                </button>
              </div>
            </div>
            <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
              {formatCurr(totalValDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750">
            Equity: <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurr(totalStockDisplay)}</span> • Cash: {formatCurr(cashDisplay)}
          </div>
        </div>

        {/* Card 2: Net Capital Deposited (Principal Put In) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Total Deposited</span>
              <button
                onClick={() => setIsDepositModalOpen(true)}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                title="Record new capital deposit or withdrawal"
              >
                <span>+ Deposit</span>
              </button>
            </div>
            <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
              {formatCurr(totalDepositedDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750 flex justify-between items-center">
            <span>Capital Injected</span>
            <button
              onClick={() => setShowTransfers(!showTransfers)}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showTransfers ? 'Hide Inflows' : 'View Inflows'}
            </button>
          </div>
        </div>

        {/* Card 3: True Lifetime Return (All-Time ROI vs Money Put In) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>All-Time Net ROI</span>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                trueRoiAmountTRY >= 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400'
              }`}>
                {trueRoiPercent >= 0 ? '▲ +' : '▼ '}{trueRoiPercent.toFixed(2)}%
              </span>
            </div>
            <div className={`mt-2 text-2xl font-black ${trueRoiAmountTRY >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {trueRoiAmountTRY >= 0 ? '+' : ''}{formatCurr(trueRoiDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750">
            vs <span>{formatCurr(totalDepositedDisplay)}</span> principal put in
          </div>
        </div>

        {/* Card 4: Dry Powder / Cash Balance */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Cash Balance</span>
              <span className="text-[10px] bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 font-bold px-1.5 py-0.5 rounded">
                Dry Powder
              </span>
            </div>
            <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
              {formatCurr(cashDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750">
            {totalValTRY > 0 ? ((cashValTRY / totalValTRY) * 100).toFixed(1) : 0}% liquid capital ready for DCA
          </div>
        </div>

        {/* Card 5: Realized Profit / Losses */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Realized Gains</span>
              <button
                onClick={() => setShowRealized(!showRealized)}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-bold"
              >
                {showRealized ? 'Hide Log' : 'View History'}
              </button>
            </div>
            <div className={`mt-2 text-2xl font-black ${totalRealizedPnlTRY > 0 ? 'text-emerald-500' : totalRealizedPnlTRY < 0 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}`}>
              {totalRealizedPnlTRY > 0 ? '+' : ''}{formatCurr(totalRealizedDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750">
            {realizedTrades.length > 0 ? `${realizedTrades.length} Trade Locked In` : 'No Closed Trades Yet'}
          </div>
        </div>
      </div>

      {/* Holdings & DCA Accumulation Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Active Portfolio Holdings & DCA Zones</h3>
            <p className="text-xs text-gray-500">Buy additional lots (DCA), sell tranches at different prices, or manage stop-loss risk.</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 hidden md:inline-block">
              🟢 Multi-Lot Tracking Active
            </span>
            {onAddHoldingClick && (
              <button
                onClick={onAddHoldingClick}
                className="px-3.5 py-1.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/30 flex items-center space-x-1"
              >
                <span>+ Add Position</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3 text-right">Shares</th>
                <th className="px-5 py-3 text-right">Avg Entry</th>
                <th className="px-5 py-3 text-right">Current Price</th>
                <th className="px-5 py-3 text-right">Market Value</th>
                <th className="px-5 py-3 text-right">Unrealized P&L</th>
                <th className="px-5 py-3 text-center">Stop Loss</th>
                <th className="px-5 py-3 text-center">DCA Accumulation Zone</th>
                <th className="px-4 py-3 text-center">Trade / Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {portfolio.map((item, idx) => {
                const isProfit = item.pnlPercent >= 0;
                return (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-gray-900 dark:text-white">{item.symbol}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {item.market}
                        </span>
                        {item.isDividend && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                            DIV
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{item.name}</div>
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-gray-900 dark:text-white">
                      {item.shares.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-600 dark:text-gray-400">
                      {formatCurr(item.entryPrice, item.currency)}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-gray-900 dark:text-white">
                      {formatCurr(item.currentPrice, item.currency)}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-900 dark:text-white">
                      {formatCurr(item.currentValue, item.currency)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className={`font-bold ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isProfit ? '+' : ''}{formatCurr(item.pnlAmount, item.currency)}
                      </div>
                      <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded mt-0.5 ${
                        isProfit ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                      }`}>
                        {isProfit ? '▲ +' : '▼ '}{item.pnlPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {item.stopLoss > 0 ? formatCurr(item.stopLoss, item.currency) : 'Trailing'}
                      </div>
                      {item.distanceToStop < 3 && item.stopLoss > 0 ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white animate-pulse">
                          ⚠️ AT STOP RISK
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500">
                          {item.distanceToStop > 0 ? `+${item.distanceToStop.toFixed(1)}% buffer` : 'Safe'}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {item.dcaZone === 'BUY' ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500 text-white shadow-sm shadow-emerald-500/30">
                            🎯 PRIME BUY ZONE
                          </span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">{item.dcaRationale}</span>
                        </div>
                      ) : item.dcaZone === 'PAUSE' ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-500 text-white">
                            ⚠️ OVERBOUGHT (Pause)
                          </span>
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">{item.dcaRationale}</span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          HOLD / ACCUMULATE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <div className="inline-flex items-center space-x-1.5">
                        <button
                          onClick={() => onTradeHolding?.(item)}
                          className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 transition-colors border border-blue-200 dark:border-blue-800 flex items-center space-x-1"
                          title="Buy more lots or sell shares"
                        >
                          <span>⚡ Trade</span>
                        </button>
                        <button
                          onClick={() => handleRemove(item.symbol)}
                          className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                          title={`Remove ${item.symbol} from portfolio`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {portfolio.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <p className="text-base font-semibold">No active holdings in portfolio.</p>
                    <p className="text-xs mt-1">Use the "+ Add Position" button above to add positions.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Realized Trades & Closed Positions History (Collapsible / Toggleable) */}
      {(showRealized || realizedTrades.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in duration-200">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-850">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                <span>🏆</span>
                <span>Realized Gains & Closed Tranches Log</span>
              </h3>
              <p className="text-xs text-gray-500">Every executed sale locks in realized profit and is recorded here for lifetime performance tracking.</p>
            </div>
            <div className="text-right">
              <span className={`text-sm font-black ${totalRealizedPnlTRY > 0 ? 'text-emerald-500' : totalRealizedPnlTRY < 0 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}`}>
                {totalRealizedPnlTRY > 0 ? '+' : ''}{formatCurr(totalRealizedDisplay)} Total Realized
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-5 py-3">Asset</th>
                  <th className="px-5 py-3 text-right">Shares Sold</th>
                  <th className="px-5 py-3 text-right">Cost Basis</th>
                  <th className="px-5 py-3 text-right">Execution Sell Price</th>
                  <th className="px-5 py-3 text-right">Realized P&L</th>
                  <th className="px-5 py-3 text-right">Return %</th>
                  <th className="px-5 py-3 text-center">Execution Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {realizedTrades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-gray-500 dark:text-gray-400">
                      <p className="font-semibold text-sm">No executed sales or closed tranches yet.</p>
                      <p className="text-xs mt-1">When you sell or trim shares via the ⚡ Trade button, your executed sales and realized P&L will be tracked here.</p>
                    </td>
                  </tr>
                ) : (
                  realizedTrades.map((trade) => {
                  const isProfit = trade.realizedPnl >= 0;
                  return (
                    <tr key={trade.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-gray-900 dark:text-white">{trade.symbol}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {trade.market}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">{trade.name}</div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-900 dark:text-white">
                        {trade.sharesSold.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-600 dark:text-gray-400">
                        {formatCurr(trade.entryPrice, trade.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-gray-900 dark:text-white">
                        {formatCurr(trade.exitPrice, trade.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-black">
                        <span className={isProfit ? 'text-emerald-500' : 'text-rose-500'}>
                          {isProfit ? '+' : ''}{formatCurr(trade.realizedPnl, trade.currency)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded ${
                          isProfit ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                        }`}>
                          {isProfit ? '▲ +' : '▼ '}{trade.realizedPnlPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center text-xs text-gray-500">
                        {trade.closeDate}
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Executed Orders & Broker Trade History */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50 dark:bg-gray-850">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <span>📜</span>
              <span>Executed Orders & DCA Accumulation Log</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
                {orders.length} Executed
              </span>
            </h3>
            <p className="text-xs text-gray-500">Live synchronization with your brokerage executed orders, showing fills, timestamps, ref IDs, and DCA tranches.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Side filter */}
            <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 text-xs">
              {(['ALL', 'BUY', 'SELL'] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setOrderSideFilter(side)}
                  className={`px-2.5 py-1 font-bold rounded-md transition-all ${
                    orderSideFilter === side
                      ? side === 'BUY'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : side === 'SELL'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                  }`}
                >
                  {side === 'ALL' ? 'All Sides' : side === 'BUY' ? 'Buys' : 'Sells'}
                </button>
              ))}
            </div>

            {/* Asset filter */}
            <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 text-xs">
              {['ALL', 'ISMEN', 'TURSG', 'AKBNK'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setOrderAssetFilter(sym)}
                  className={`px-2 py-1 font-semibold rounded-md transition-all ${
                    orderAssetFilter === sym
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm font-bold'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3 text-center">Side / Order</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Quantity</th>
                <th className="px-5 py-3 text-right">Realzd. Price</th>
                <th className="px-5 py-3 text-right">Total Amount</th>
                <th className="px-5 py-3">DCA Note / Purpose</th>
                <th className="px-5 py-3 text-right">Date & Time</th>
                <th className="px-5 py-3 text-right">Ref ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {orders
                .filter(ord => {
                  const matchesSide = orderSideFilter === 'ALL' || ord.side === orderSideFilter;
                  const matchesAsset = orderAssetFilter === 'ALL' || ord.symbol === orderAssetFilter;
                  return matchesSide && matchesAsset;
                })
                .map((ord) => {
                  const isBuy = ord.side === 'BUY';
                  return (
                    <tr key={ord.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-gray-900 dark:text-white">{ord.symbol}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {ord.market}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">{ord.name}</div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black ${
                          isBuy 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800' 
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-400 border border-purple-300 dark:border-purple-800'
                        }`}>
                          {isBuy ? 'BUY' : 'SELL'} {ord.orderType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                          ✓ {ord.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-medium text-gray-900 dark:text-white">
                        {ord.quantity.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-bold text-gray-900 dark:text-white">
                        ₺{ord.price.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-bold text-gray-900 dark:text-white">
                        ₺{ord.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-300">
                        {ord.dcaNote || '-'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-xs text-gray-500 font-mono">
                        {ord.dateTime}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-xs font-mono text-gray-400">
                        {ord.ref}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Capital Transfers & Funding Inflows History */}
      {showTransfers && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in duration-200">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-850">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                <span>💸</span>
                <span>Capital Deposits & Transfers History</span>
              </h3>
              <p className="text-xs text-gray-500">Every bank transfer into or out of your brokerage account to track true lifetime ROI.</p>
            </div>
            <button
              onClick={() => setIsDepositModalOpen(true)}
              className="px-3 py-1.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/20"
            >
              + Record Transfer
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-5 py-3">Transfer Type</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Notes / Purpose</th>
                  <th className="px-5 py-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-gray-500">
                      No transfers recorded yet.
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                          t.transferType === 'DEPOSIT'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400'
                        }`}>
                          {t.transferType === 'DEPOSIT' ? '↓ DEPOSIT (Cash In)' : '↑ WITHDRAWAL (Cash Out)'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-gray-900 dark:text-white">
                        {t.transferType === 'DEPOSIT' ? '+' : '-'}₺{t.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-300">
                        {t.notes || 'Brokerage funding'}
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs text-gray-500 font-mono">
                        {t.transferDate}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 shadow-2xl relative">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>💸</span>
                <span>Record Capital Transfer</span>
              </h3>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Transfer Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalTransferType('DEPOSIT')}
                    className={`py-2 text-xs font-bold rounded-xl transition-all border ${
                      modalTransferType === 'DEPOSIT'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent'
                    }`}
                  >
                    ↓ Deposit (Cash In)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTransferType('WITHDRAWAL')}
                    className={`py-2 text-xs font-bold rounded-xl transition-all border ${
                      modalTransferType === 'WITHDRAWAL'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent'
                    }`}
                  >
                    ↑ Withdrawal (Cash Out)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Amount (₺ TRY)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 5000.00"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Transfer Date</label>
                <input
                  type="date"
                  required
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes / Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly salary savings top-up"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="flex-1 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20"
                >
                  Save Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
