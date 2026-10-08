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
  const [sharesStr, setSharesStr] = useState<string>('0');
  const [priceStr, setPriceStr] = useState<string>('0');
  const [tradeDate, setTradeDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (holding) {
      const defaultShares = tab === 'BUY' 
        ? Math.round(holding.shares * 0.25) || 10 
        : Math.round(holding.shares * 0.5) || holding.shares;
      setSharesStr(String(defaultShares));
      setPriceStr(String(holding.currentPrice || holding.entryPrice));
      setTradeDate(new Date().toISOString().slice(0, 10));
      setErrorMsg(null);
    }
  }, [holding, tab]);

  if (!isOpen || !holding) return null;

  const currencySymbol = holding.currency === 'USD' ? '$' : '₺';
  const sharesInput = parseFloat(sharesStr) || 0;
  const priceInput = parseFloat(priceStr) || 0;

  // Math for Buy More (Weighted Average)
  const buyAdditionalShares = sharesInput;
  const buyExecPrice = priceInput;
  const newTotalShares = holding.shares + buyAdditionalShares;
  const currentTotalCost = holding.shares * holding.entryPrice;
  const additionalCost = buyAdditionalShares * buyExecPrice;
  const newBlendedCost = newTotalShares > 0 ? (currentTotalCost + additionalCost) / newTotalShares : holding.entryPrice;
  const costDiff = newBlendedCost - holding.entryPrice;

  // Math for Sell (Realized P&L & Remaining Shares)
  const sellShares = Math.min(sharesInput, holding.shares);
  const sellExecPrice = priceInput;
  const remainingShares = Math.max(0, holding.shares - sellShares);
  const realizedPnl = (sellExecPrice - holding.entryPrice) * sellShares;
  const realizedPnlPct = holding.entryPrice > 0 ? ((sellExecPrice - holding.entryPrice) / holding.entryPrice) * 100 : 0;
  const isFullExit = sellShares >= holding.shares;

  const handleQuickPercent = (pct: number) => {
    const qty = Math.max(1, Math.round((holding.shares * pct) / 100));
    setSharesStr(String(qty));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (tab === 'BUY') {
      if (buyAdditionalShares <= 0 || buyExecPrice <= 0) {
        setErrorMsg('Please specify a positive number of shares and purchase price.');
        return;
      }
      onBuyMore(holding.symbol, buyAdditionalShares, buyExecPrice, tradeDate);
    } else {
      if (sellShares <= 0 || sellExecPrice <= 0) {
        setErrorMsg('Please specify a valid number of shares to sell and sell price.');
        return;
      }
      onSell(holding.symbol, sellShares, sellExecPrice, tradeDate);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal Card */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-[92dvh] z-10 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        
        {/* Fixed Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
                {holding.symbol}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {holding.market}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
              Holding: <span className="font-bold text-gray-900 dark:text-white">{holding.shares.toLocaleString()} shares</span> @ avg {currencySymbol}{holding.entryPrice.toFixed(2)} (Mkt: {currencySymbol}{holding.currentPrice.toFixed(2)})
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Tab Toggle: Buy More vs Sell */}
        <div className="px-5 pt-3 shrink-0">
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-750 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('BUY')}
              className={`py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                tab === 'BUY'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              🟢 BUY MORE (DCA)
            </button>
            <button
              type="button"
              onClick={() => setTab('SELL')}
              className={`py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                tab === 'SELL'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              🔴 SELL SHARES
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-600 dark:text-rose-400">
                ⚠️ {errorMsg}
              </div>
            )}

            {tab === 'BUY' ? (
              /* BUY MORE FLOW */
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Shares to Buy *
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.0001"
                      step="any"
                      required
                      value={sharesStr}
                      onChange={(e) => setSharesStr(e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900 dark:text-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Purchase Price ({currencySymbol}) *
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.0001"
                      step="any"
                      required
                      value={priceStr}
                      onChange={(e) => setPriceStr(e.target.value)}
                      placeholder={holding.currentPrice.toFixed(2)}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900 dark:text-white font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    🗓️ Execution Date (Date Bought)
                  </label>
                  <input
                    type="date"
                    required
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900 dark:text-white font-medium"
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
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">New Blended Avg Price:</span>
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
                {/* Institutional Scale-Out Tranches Quick Selector */}
                {(() => {
                  const t1Shares = Math.max(1, Math.ceil(holding.shares * 0.5));
                  const t2Shares = Math.max(0, holding.shares - t1Shares);
                  const defaultStop = holding.stopLoss > 0 ? holding.stopLoss : Number((holding.entryPrice * 0.95).toFixed(2));
                  const calcT2 = Number((holding.entryPrice + 2 * Math.abs(holding.entryPrice - defaultStop)).toFixed(2));
                  const t2Price = holding.targetPrice && holding.targetPrice > 0 ? holding.targetPrice : calcT2;
                  const t1Price = holding.targetPrice && holding.targetPrice > 0 && holding.targetPrice < t2Price
                    ? holding.targetPrice
                    : Number((holding.entryPrice + Math.abs(holding.entryPrice - defaultStop)).toFixed(2));

                  const isT1Hit = Boolean(holding.currentPrice >= t1Price);

                  return (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/80 rounded-2xl p-3.5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                          <span>🎯</span>
                          <span>Target Exit Tranches ({holding.shares} shs held):</span>
                        </span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">
                          50/50 Scale-Out Rule
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Target 1 Tranche Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setSharesStr(String(t1Shares));
                            setPriceStr(String(holding.currentPrice >= t1Price ? holding.currentPrice : t1Price));
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer shadow-xs ${
                            isT1Hit
                              ? 'bg-emerald-500/10 border-emerald-400 dark:border-emerald-600 hover:bg-emerald-500/20'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-600'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                              Target 1 (50%)
                            </span>
                            {isT1Hit && (
                              <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-600 text-white animate-pulse">
                                ✓ IN ZONE
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-black text-gray-900 dark:text-white mt-1">
                            Sell {t1Shares} shares
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                            @ {currencySymbol}{t1Price.toFixed(2)} target
                          </div>
                        </button>

                        {/* Target 2 Tranche Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const exitQty = t2Shares > 0 ? t2Shares : holding.shares;
                            setSharesStr(String(exitQty));
                            setPriceStr(String(holding.currentPrice >= t2Price ? holding.currentPrice : t2Price));
                          }}
                          className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-600 text-left transition-all cursor-pointer shadow-xs"
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                              Target 2 (50%)
                            </span>
                            <span className="text-[9px] font-bold text-gray-400">
                              Runner
                            </span>
                          </div>
                          <div className="text-sm font-black text-gray-900 dark:text-white mt-1">
                            Sell {t2Shares > 0 ? t2Shares : holding.shares} shares
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                            @ {currencySymbol}{t2Price.toFixed(2)} runner
                          </div>
                        </button>
                      </div>

                      <p className="text-[10px] text-blue-700 dark:text-blue-300">
                        💡 <em>Tip: Selling Target 1 locks in gains. Always trail stop to breakeven ({currencySymbol}{holding.entryPrice.toFixed(2)}) on remaining shares.</em>
                      </p>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        Shares to Sell *
                      </label>
                      <div className="flex space-x-1">
                        {[25, 50, 100].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => handleQuickPercent(pct)}
                            className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                          >
                            {pct === 100 ? 'MAX' : `${pct}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.0001"
                      max={holding.shares}
                      step="any"
                      required
                      value={sharesStr}
                      onChange={(e) => setSharesStr(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none text-gray-900 dark:text-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Selling Price ({currencySymbol}) *
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.0001"
                      step="any"
                      required
                      value={priceStr}
                      onChange={(e) => setPriceStr(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none text-gray-900 dark:text-white font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                    🗓️ Execution Date (Date Sold)
                  </label>
                  <input
                    type="date"
                    required
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 outline-none text-gray-900 dark:text-white font-medium"
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
                    <span className="text-xs font-bold text-rose-900 dark:text-rose-200">Realized P&L:</span>
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

          </div>

          {/* Fixed Footer Buttons (Always Visible on Mobile) */}
          <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-900/60 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end space-x-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-6 py-2.5 text-xs font-black text-white rounded-xl transition-all shadow-md cursor-pointer active:scale-95 ${
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
