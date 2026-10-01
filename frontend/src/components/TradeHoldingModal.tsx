'use client';

import React, { useState, useEffect } from 'react';
import { PortfolioItem } from '../lib/supabaseClient';

interface TradeHoldingModalProps {
  isOpen: boolean;
  holding: PortfolioItem | null;
  onClose: () => void;
  onBuyMore: (symbol: string, additionalShares: number, buyPrice: number, tradeDate?: string) => void;
  onSell: (symbol: string, sharesToSell: number, sellPrice: number, tradeDate?: string) => void;
}

export default function TradeHoldingModal({
  isOpen,
  holding,
  onClose,
  onBuyMore,
  onSell,
}: TradeHoldingModalProps) {
  const [tab, setTab] = useState<'BUY' | 'SELL'>('BUY');
  const [sharesInput, setSharesInput] = useState<number>(0);
  const [priceInput, setPriceInput] = useState<number>(0);
  const [tradeDate, setTradeDate] = useState<string>(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (holding) {
      setSharesInput(tab === 'BUY' ? Math.round(holding.shares * 0.25) || 10 : Math.round(holding.shares * 0.5) || holding.shares);
      setPriceInput(holding.currentPrice || holding.entryPrice);
      setTradeDate(new Date().toISOString().slice(0, 10));
    }
  }, [holding, tab]);

  if (!isOpen || !holding) return null;

  const currencySymbol = holding.currency === 'USD' ? '$' : '₺';

  // Math for Buy More (Weighted Average)
  const buyAdditionalShares = Number(sharesInput) || 0;
  const buyExecPrice = Number(priceInput) || 0;
  const newTotalShares = holding.shares + buyAdditionalShares;
  const currentTotalCost = holding.shares * holding.entryPrice;
  const additionalCost = buyAdditionalShares * buyExecPrice;
  const newBlendedCost = newTotalShares > 0 ? (currentTotalCost + additionalCost) / newTotalShares : holding.entryPrice;
  const costDiff = newBlendedCost - holding.entryPrice;

  // Math for Sell (Realized P&L & Remaining Shares)
  const sellShares = Math.min(Number(sharesInput) || 0, holding.shares);
  const sellExecPrice = Number(priceInput) || 0;
  const remainingShares = Math.max(0, holding.shares - sellShares);
  const realizedPnl = (sellExecPrice - holding.entryPrice) * sellShares;
  const realizedPnlPct = holding.entryPrice > 0 ? ((sellExecPrice - holding.entryPrice) / holding.entryPrice) * 100 : 0;
  const isFullExit = sellShares >= holding.shares;

  const handleQuickPercent = (pct: number) => {
    const qty = Math.max(1, Math.round((holding.shares * pct) / 100));
    setSharesInput(qty);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'BUY') {
      if (buyAdditionalShares <= 0 || buyExecPrice <= 0) return;
      onBuyMore(holding.symbol, buyAdditionalShares, buyExecPrice, tradeDate);
    } else {
      if (sellShares <= 0 || sellExecPrice <= 0) return;
      onSell(holding.symbol, sellShares, sellExecPrice, tradeDate);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 p-6 z-10 overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-gray-900 dark:text-white">
                {holding.symbol}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {holding.market}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Current Holding: <span className="font-bold text-gray-900 dark:text-white">{holding.shares.toLocaleString()} shares</span> @ avg {currencySymbol}{holding.entryPrice.toFixed(2)} (Mkt: {currencySymbol}{holding.currentPrice.toFixed(2)})
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Tab Toggle: Buy More vs Sell */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-750 rounded-2xl my-4">
          <button
            type="button"
            onClick={() => setTab('BUY')}
            className={`py-2 text-xs font-black rounded-xl transition-all ${
              tab === 'BUY'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            🟢 BUY MORE (DCA / Add Lot)
          </button>
          <button
            type="button"
            onClick={() => setTab('SELL')}
            className={`py-2 text-xs font-black rounded-xl transition-all ${
              tab === 'SELL'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            🔴 SELL SHARES (Partial / Exit)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'BUY' ? (
            /* BUY MORE FLOW */
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Shares to Buy
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={sharesInput}
                    onChange={(e) => setSharesInput(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900 dark:text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Purchase Price ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={priceInput}
                    onChange={(e) => setPriceInput(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  🗓️ Execution Date (Date Bought)
                </label>
                <input
                  type="date"
                  required
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900 dark:text-white font-medium"
                />
              </div>

              {/* Dynamic Blended Average Preview Box */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-600 dark:text-gray-400">New Total Position:</span>
                  <span className="font-bold text-gray-900 dark:text-white">{newTotalShares.toLocaleString()} shares</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Total Purchase Cost:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{currencySymbol}{additionalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800 flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">New Weighted Avg Price:</span>
                  <div className="text-right">
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                      {currencySymbol}{newBlendedCost.toFixed(2)}
                    </span>
                    <span className={`text-[11px] block font-semibold ${costDiff <= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {costDiff <= 0 ? `(${currencySymbol}${Math.abs(costDiff).toFixed(2)} lower cost basis)` : `(+${currencySymbol}${costDiff.toFixed(2)} higher)`}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* SELL SHARES FLOW */
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Shares to Sell
                    </label>
                    <div className="flex space-x-1">
                      {[25, 50, 75, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleQuickPercent(pct)}
                          className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                        >
                          {pct === 100 ? 'MAX' : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={holding.shares}
                    step="any"
                    required
                    value={sharesInput}
                    onChange={(e) => setSharesInput(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none text-gray-900 dark:text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Selling Price ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    value={priceInput}
                    onChange={(e) => setPriceInput(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none text-gray-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  🗓️ Execution Date (Date Sold)
                </label>
                <input
                  type="date"
                  required
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 outline-none text-gray-900 dark:text-white font-medium"
                />
              </div>

              {/* Dynamic Realized P&L Preview Box */}
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Total Proceeds (Cash):</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {currencySymbol}{(sellShares * sellExecPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Remaining Active Shares:</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {isFullExit ? '0 (Full Position Exit)' : `${remainingShares.toLocaleString()} shares @ ${currencySymbol}${holding.entryPrice.toFixed(2)}`}
                  </span>
                </div>
                <div className="pt-2 border-t border-rose-200 dark:border-rose-800 flex justify-between items-center">
                  <span className="text-xs font-bold text-rose-900 dark:text-rose-200">Realized P&L on this Tranche:</span>
                  <div className="text-right">
                    <span className={`text-base font-black ${realizedPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {realizedPnl >= 0 ? '+' : ''}{currencySymbol}{realizedPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-[11px] block font-semibold ${realizedPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      ({realizedPnl >= 0 ? '+' : ''}{realizedPnlPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="pt-3 flex justify-end space-x-3 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-6 py-2 text-xs font-black text-white rounded-xl transition-all shadow-md ${
                tab === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30'
              }`}
            >
              {tab === 'BUY' ? 'Confirm Purchase (DCA Lot)' : isFullExit ? 'Confirm Full Exit' : 'Confirm Partial Sell'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
