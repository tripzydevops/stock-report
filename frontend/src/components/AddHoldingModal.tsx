'use client';

import React, { useState } from 'react';
import { PortfolioItem } from '../lib/supabaseClient';

interface AddHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddHolding: (holding: PortfolioItem, isDividend: boolean, dividendYield?: number) => void;
}

export default function AddHoldingModal({
  isOpen,
  onClose,
  onAddHolding,
}: AddHoldingModalProps) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [market, setMarket] = useState<'BIST' | 'US'>('BIST');
  const [sharesStr, setSharesStr] = useState<string>('100');
  const [entryPriceStr, setEntryPriceStr] = useState<string>('100');
  const [currentPriceStr, setCurrentPriceStr] = useState<string>('');
  const [entryDate, setEntryDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [stopLossStr, setStopLossStr] = useState<string>('');
  const [isDividend, setIsDividend] = useState(false);
  const [dividendYieldStr, setDividendYieldStr] = useState<string>('5.0');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const sym = symbol.replace('.IS', '').trim().toUpperCase();
    if (!sym) {
      setErrorMsg('Please enter a valid stock symbol (e.g. THYAO or NVDA)');
      return;
    }

    const shares = parseFloat(sharesStr);
    const entryPrice = parseFloat(entryPriceStr);
    const currentPrice = currentPriceStr ? parseFloat(currentPriceStr) : entryPrice;

    if (isNaN(shares) || shares <= 0) {
      setErrorMsg('Please enter a valid positive number of shares.');
      return;
    }
    if (isNaN(entryPrice) || entryPrice <= 0) {
      setErrorMsg('Please enter a valid positive purchase price.');
      return;
    }

    const curr = market === 'US' ? 'USD' : 'TRY';
    const totalCost = shares * entryPrice;
    const curPrice = !isNaN(currentPrice) && currentPrice > 0 ? currentPrice : entryPrice;
    const currentValue = shares * curPrice;
    const pnlAmount = currentValue - totalCost;
    const pnlPercent = totalCost > 0 ? (pnlAmount / totalCost) * 100 : 0;
    
    const stopLoss = stopLossStr ? parseFloat(stopLossStr) : 0;
    const sl = !isNaN(stopLoss) && stopLoss > 0 ? stopLoss : 0;
    const distToStop = sl > 0 && curPrice > 0 ? ((curPrice - sl) / curPrice) * 100 : 0;
    const divYield = isDividend ? (parseFloat(dividendYieldStr) || 5.0) : undefined;

    const newHolding: PortfolioItem = {
      symbol: sym,
      name: name.trim() || sym,
      market: market,
      shares: Number(shares),
      entryPrice: Number(entryPrice),
      currentPrice: Number(curPrice),
      currency: curr,
      totalCost,
      currentValue,
      pnlAmount,
      pnlPercent,
      stopLoss: sl,
      distanceToStop: distToStop,
      isDividend: isDividend,
      dcaZone: isDividend ? 'BUY' : 'HOLD',
      dcaRationale: isDividend ? 'Accumulating on pullback value zones.' : 'Active holding',
      entryDate: entryDate || new Date().toISOString().slice(0, 10),
    };

    onAddHolding(newHolding, isDividend, divYield);
    onClose();

    // Reset fields
    setSymbol('');
    setName('');
    setSharesStr('100');
    setEntryPriceStr('100');
    setCurrentPriceStr('');
    setEntryDate(new Date().toISOString().slice(0, 10));
    setStopLossStr('');
    setIsDividend(false);
  };

  const currencySymbol = market === 'US' ? '$' : '₺';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal Dialog Card */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 flex flex-col max-h-[92dvh] z-10 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        
        {/* Fixed Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>➕</span>
              <span>Add Portfolio Holding</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-gray-500">Record a new stock purchase, entry lot, and track live P&L.</p>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-600 dark:text-rose-400">
                ⚠️ {errorMsg}
              </div>
            )}

            {/* Symbol & Market */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Ticker / Symbol *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={symbol}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setSymbol(val);
                    if (val.endsWith('.IS') || (!['AAPL', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'SPY', 'QQQ'].includes(val) && val.length >= 4 && !val.includes('.'))) {
                      // default bist
                    }
                  }}
                  placeholder="e.g. THYAO, NVDA"
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-black tracking-wide"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Market
                </label>
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value as 'BIST' | 'US')}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-medium"
                >
                  <option value="BIST">🇹🇷 BIST (TRY ₺)</option>
                  <option value="US">🇺🇸 US Market (USD $)</option>
                </select>
              </div>
            </div>

            {/* Company Name & Date Bought */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Türk Hava Yolları"
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  🗓️ Date Bought *
                </label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-medium"
                />
              </div>
            </div>

            {/* Shares, Avg Entry Price, Current Price */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Shares *
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  required
                  min="0.0001"
                  step="any"
                  value={sharesStr}
                  onChange={(e) => setSharesStr(e.target.value)}
                  placeholder="100"
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Buy Price ({currencySymbol}) *
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  required
                  min="0.0001"
                  step="any"
                  value={entryPriceStr}
                  onChange={(e) => setEntryPriceStr(e.target.value)}
                  placeholder="100.00"
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-bold"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Current Price ({currencySymbol})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={currentPriceStr}
                  onChange={(e) => setCurrentPriceStr(e.target.value)}
                  placeholder={entryPriceStr || 'Current Mkt'}
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Stop Loss & Dividend Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Stop Loss ({currencySymbol}) (Optional)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={stopLossStr}
                  onChange={(e) => setStopLossStr(e.target.value)}
                  placeholder="Defaults to 5% trailing"
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex items-center sm:justify-start pt-2 sm:pt-6">
                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isDividend}
                    onChange={(e) => setIsDividend(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    💎 Dividend Compounder
                  </span>
                </label>
              </div>
            </div>

            {/* Dividend Yield input when checked */}
            {isDividend && (
              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-purple-900 dark:text-purple-200">
                    Est. Dividend Yield %
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={dividendYieldStr}
                    onChange={(e) => setDividendYieldStr(e.target.value)}
                    className="w-24 bg-white dark:bg-gray-900 border border-purple-300 dark:border-purple-700 rounded-lg px-2.5 py-1 text-sm font-bold text-right outline-none text-gray-900 dark:text-white"
                  />
                </div>
                <span className="text-[11px] text-purple-700 dark:text-purple-300 block mt-1">
                  Enables DCA Value Zone accumulation alerts instead of forced stop loss.
                </span>
              </div>
            )}

            {/* Real-time Total Cost calculation card */}
            {(() => {
              const s = parseFloat(sharesStr) || 0;
              const p = parseFloat(entryPriceStr) || 0;
              const cost = s * p;
              if (cost <= 0) return null;
              return (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex justify-between items-center">
                  <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                    Total Position Cost:
                  </span>
                  <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">
                    {currencySymbol}{cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              );
            })()}

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
              className="px-6 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition-all shadow-md shadow-blue-500/30 cursor-pointer flex items-center space-x-1"
            >
              <span>💾</span>
              <span>Save Holding</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
