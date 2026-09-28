'use client';

import React, { useState } from 'react';
import { PortfolioItem } from '../lib/supabaseClient';

interface PortfolioViewProps {
  portfolio: PortfolioItem[];
  usdTryRate: number;
  onRemoveHolding?: (symbol: string) => void;
  onAddHoldingClick?: () => void;
}

export default function PortfolioView({
  portfolio,
  usdTryRate,
  onRemoveHolding,
  onAddHoldingClick,
}: PortfolioViewProps) {
  const [currencyMode, setCurrencyMode] = useState<'TRY' | 'USD'>('TRY');

  const totalCostTRY = portfolio.reduce((acc, item) => {
    return acc + (item.currency === 'USD' ? item.totalCost * usdTryRate : item.totalCost);
  }, 0);

  const totalValTRY = portfolio.reduce((acc, item) => {
    return acc + (item.currency === 'USD' ? item.currentValue * usdTryRate : item.currentValue);
  }, 0);

  const totalPnlTRY = totalValTRY - totalCostTRY;
  const totalPnlPct = totalCostTRY > 0 ? (totalPnlTRY / totalCostTRY) * 100 : 0;

  const totalValDisplay = currencyMode === 'USD' ? (totalValTRY / usdTryRate) : totalValTRY;
  const totalCostDisplay = currencyMode === 'USD' ? (totalCostTRY / usdTryRate) : totalCostTRY;
  const totalPnlDisplay = currencyMode === 'USD' ? (totalPnlTRY / usdTryRate) : totalPnlTRY;

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

  return (
    <div className="space-y-6">
      {/* Top Portfolio Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>Total Portfolio Value</span>
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
          <div className="text-xs text-gray-500 mt-1">
            Cost Basis: {formatCurr(totalCostDisplay)}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Unrealized P&L</span>
          <div className={`mt-2 text-2xl font-black ${totalPnlTRY >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {totalPnlTRY >= 0 ? '+' : ''}{formatCurr(totalPnlDisplay)}
          </div>
          <div className="text-xs mt-1">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-bold ${
              totalPnlPct >= 0 ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
            }`}>
              {totalPnlPct >= 0 ? '▲ +' : '▼ '}{totalPnlPct.toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Holdings</span>
          <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
            {portfolio.length} Assets
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {portfolio.filter(p => p.market === 'BIST').length} BIST • {portfolio.filter(p => p.market === 'US').length} US
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">USD/TRY FX Benchmark</span>
          <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
            ₺{usdTryRate.toFixed(2)}
          </div>
          <div className="text-xs text-emerald-500 font-semibold mt-1">
            ● Real-Time FX Multiplier
          </div>
        </div>
      </div>

      {/* Holdings & DCA Accumulation Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Active Portfolio Holdings & DCA Zones</h3>
            <p className="text-xs text-gray-500">Live position tracker with risk stop-loss monitors and Dividend DCA accumulation signals.</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
              🟢 Value DCA Buy Zone Active
            </span>
            {onAddHoldingClick && (
              <button
                onClick={onAddHoldingClick}
                className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center space-x-1"
              >
                <span>+ Add Holding</span>
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
                <th className="px-4 py-3 text-center">Action</th>
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
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleRemove(item.symbol)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                        title={`Remove ${item.symbol} from portfolio`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {portfolio.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <p className="text-base font-semibold">No active holdings in portfolio.</p>
                    <p className="text-xs mt-1">Use the "+ Add Holding" button above to add positions.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
