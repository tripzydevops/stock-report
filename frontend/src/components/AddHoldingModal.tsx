'use client';

import React, { useState } from 'react';
import { PortfolioItem, DividendAsset } from '../lib/supabaseClient';

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
  const [shares, setShares] = useState<number>(100);
  const [entryPrice, setEntryPrice] = useState<number>(100);
  const [currentPrice, setCurrentPrice] = useState<number>(100);
  const [stopLoss, setStopLoss] = useState<number | ''>('');
  const [isDividend, setIsDividend] = useState(false);
  const [dividendYield, setDividendYield] = useState<number>(5.0);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol) return;

    const sym = symbol.toUpperCase().trim();
    const curr = market === 'US' ? 'USD' : 'TRY';
    const totalCost = shares * entryPrice;
    const curPrice = currentPrice || entryPrice;
    const currentValue = shares * curPrice;
    const pnlAmount = currentValue - totalCost;
    const pnlPercent = totalCost > 0 ? (pnlAmount / totalCost) * 100 : 0;
    const sl = typeof stopLoss === 'number' && stopLoss > 0 ? stopLoss : 0;
    const distToStop = sl > 0 && curPrice > 0 ? ((curPrice - sl) / curPrice) * 100 : 0;

    const newHolding: PortfolioItem = {
      symbol: sym,
      name: name || sym,
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
      dcaRationale: isDividend ? 'Accumulating on pullback value zones.' : 'Active holding'
    };

    onAddHolding(newHolding, isDividend, isDividend ? Number(dividendYield) : undefined);
    onClose();

    // Reset fields
    setSymbol('');
    setName('');
    setShares(100);
    setEntryPrice(100);
    setCurrentPrice(100);
    setStopLoss('');
    setIsDividend(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 p-6 z-10">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">Add Portfolio Holding</h2>
            <p className="text-xs text-gray-500">Track real-time P&L, stop-loss risks, and DCA accumulation zones.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Symbol / Ticker</label>
              <input
                type="text"
                required
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="e.g. THYAO or NVDA"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Market</label>
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value as 'BIST' | 'US')}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
              >
                <option value="BIST">BIST (TRY ₺)</option>
                <option value="US">US Market (USD $)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Company / Asset Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Türk Hava Yolları"
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Shares Count</label>
              <input
                type="number"
                required
                min="0.01"
                step="any"
                value={shares}
                onChange={(e) => setShares(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Avg Entry ({market === 'US' ? '$' : '₺'})
              </label>
              <input
                type="number"
                required
                min="0.01"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Current Price ({market === 'US' ? '$' : '₺'})
              </label>
              <input
                type="number"
                step="any"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Stop Loss (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value ? parseFloat(e.target.value) : '')}
                placeholder="Trailing if empty"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center space-x-2.5 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={isDividend}
                  onChange={(e) => setIsDividend(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Track in Dividend Portfolio
                </span>
              </label>
            </div>
          </div>

          {isDividend && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 animate-in fade-in duration-150">
              <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                Estimated Dividend Yield %
              </label>
              <input
                type="number"
                step="0.1"
                value={dividendYield}
                onChange={(e) => setDividendYield(parseFloat(e.target.value) || 0)}
                className="w-32 bg-white dark:bg-gray-900 border border-amber-300 dark:border-amber-700 rounded-lg px-2.5 py-1 text-sm outline-none text-gray-900 dark:text-white"
              />
              <span className="text-[11px] text-amber-700 dark:text-amber-300 block mt-1">
                Enables automatic DCA Value Zone buy alerts instead of forced stop-loss triggers.
              </span>
            </div>
          )}

          <div className="pt-4 flex justify-end space-x-3 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/30"
            >
              Save Holding
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
