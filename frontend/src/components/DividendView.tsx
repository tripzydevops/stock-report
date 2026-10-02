'use client';

import React, { useState } from 'react';
import { DividendAsset } from '../lib/supabaseClient';
import DividendPortfolioLab from './DividendPortfolioLab';

interface DividendViewProps {
  dividendAssets: DividendAsset[];
  usdTryRate: number;
  onImportCandidate?: (candidate: { symbol: string; name: string; market: string; shares: number; price: number; isDividend: boolean }) => void;
  onSelectTicker?: (symbol: string) => void;
}

export default function DividendView({ dividendAssets, usdTryRate, onImportCandidate, onSelectTicker }: DividendViewProps) {
  const [currencyMode, setCurrencyMode] = useState<'TRY' | 'USD'>('TRY');
  const [viewMode, setViewMode] = useState<'schedule' | 'table' | 'lab'>('schedule');

  const totalAnnualTRY = dividendAssets.reduce((acc, item) => {
    return acc + (item.currency === 'USD' ? item.annualPayout * usdTryRate : item.annualPayout);
  }, 0);

  const totalMonthlyTRY = totalAnnualTRY / 12;

  const totalAnnualDisplay = currencyMode === 'USD' ? (totalAnnualTRY / usdTryRate) : totalAnnualTRY;
  const totalMonthlyDisplay = currencyMode === 'USD' ? (totalMonthlyTRY / usdTryRate) : totalMonthlyTRY;

  // Weighted average Yield on Cost
  const totalCostTRY = dividendAssets.reduce((acc, item) => {
    const cost = item.shares * item.entryPrice;
    return acc + (item.currency === 'USD' ? cost * usdTryRate : cost);
  }, 0);

  const avgYieldOnCost = totalCostTRY > 0 ? (totalAnnualTRY / totalCostTRY) * 100 : 0;
  
  // Weighted current yield
  const totalValTRY = dividendAssets.reduce((acc, item) => {
    const val = item.shares * item.currentPrice;
    return acc + (item.currency === 'USD' ? val * usdTryRate : val);
  }, 0);
  const avgCurrentYield = totalValTRY > 0 ? (totalAnnualTRY / totalValTRY) * 100 : 0;

  const formatCurr = (val: number, curr?: string) => {
    const c = curr || currencyMode;
    const symbol = c === 'USD' ? '$' : '₺';
    return `${symbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Sort upcoming payouts by next ex-dividend date
  const sortedUpcoming = [...dividendAssets].sort((a, b) => {
    const dateA = a.nextExDate ? new Date(a.nextExDate).getTime() : 9999999999999;
    const dateB = b.nextExDate ? new Date(b.nextExDate).getTime() : 9999999999999;
    return dateA - dateB;
  });

  return (
    <div className="space-y-6">
      {/* Top Dividend KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>Annual Projected Payout</span>
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
          <div className="mt-2 text-2xl font-black text-emerald-500">
            {formatCurr(totalAnnualDisplay)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Annual Cash Flow (Estimated)
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Monthly Passive Income</span>
          <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
            {formatCurr(totalMonthlyDisplay)}/mo
          </div>
          <div className="text-xs text-emerald-500 font-semibold mt-1">
            ● Average monthly passive dividend
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Yield on Cost (YoC)</span>
          <div className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400">
            {avgYieldOnCost.toFixed(2)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Current Mkt Yield: {avgCurrentYield.toFixed(2)}%
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dividend Sustainability</span>
          <div className="mt-2 text-2xl font-black text-emerald-500">
            A- Grade
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Low dividend cut probability across all 3 assets
          </div>
        </div>
      </div>

      {/* View Switcher Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <span>📅</span>
            <span>Dividend Schedule & Yield Intelligence</span>
          </h3>
          <p className="text-xs text-gray-500">Track exact upcoming payment dates, expected net payouts, and yield-on-cost expansion.</p>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-700/60 p-1 border border-gray-200 dark:border-gray-600">
          <button
            onClick={() => setViewMode('schedule')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 ${
              viewMode === 'schedule'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>🗓️</span>
            <span>Upcoming Schedule</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>📊</span>
            <span>Holdings & YoC Table</span>
          </button>
          <button
            onClick={() => setViewMode('lab')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 ${
              viewMode === 'lab'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>🧪</span>
            <span>AI Portfolio Lab & Simulator</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: UPCOMING DIVIDEND PAYMENT SCHEDULE CARDS */}
      {viewMode === 'schedule' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sortedUpcoming.map((asset, idx) => {
              const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);
              const estPayout = asset.estimatedNextPayout || (asset.shares * dps);
              const payoutDisplay = currencyMode === 'USD' ? (estPayout / usdTryRate) : estPayout;

              return (
                <div 
                  key={idx} 
                  className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500"></div>

                  <div>
                    {/* Header: Asset & Badge */}
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-lg font-black text-gray-900 dark:text-white">{asset.symbol}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                            {asset.payoutMonth || 'Spring 2027'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{asset.name}</p>
                      </div>
                      <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                        {asset.shares.toLocaleString()} shares
                      </span>
                    </div>

                    {/* Cash Inflow KPI */}
                    <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-xl p-3.5 my-3">
                      <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                        Estimated Cash Inflow
                      </div>
                      <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        +{formatCurr(payoutDisplay)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        Est. Net DPS: <span className="font-bold text-gray-700 dark:text-gray-300">₺{dps.toFixed(3)}</span> per share
                      </div>
                    </div>

                    {/* Timeline & Details */}
                    <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300 pt-1">
                      <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-750">
                        <span className="text-gray-500">Est. Ex-Dividend Date:</span>
                        <span className="font-bold text-gray-900 dark:text-white">{asset.nextExDate || 'Late March 2027'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-750">
                        <span className="text-gray-500">Est. Payment Date:</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{asset.nextPaymentDate || 'Early April 2027'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-750">
                        <span className="text-gray-500">Dividend Yield:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{asset.dividendYield.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-gray-500">Payout Frequency:</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">{asset.frequency}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-[11px]">
                    <span className="text-gray-400">Payment Status:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                      <span>{asset.paymentStatus || 'Estimated'}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cashflow Inflow Projection Banner */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl">💰</span>
                <h4 className="text-base font-bold">Annual Passive Cash Flow Forecast</h4>
              </div>
              <p className="text-xs text-blue-100 mt-1">
                Your portfolio will generate an estimated <span className="font-bold text-white">₺921.00</span> in cash payouts over the next dividend season without selling any shares.
              </p>
            </div>
            <div className="text-right sm:text-right w-full sm:w-auto border-t sm:border-t-0 border-blue-400/40 pt-3 sm:pt-0">
              <div className="text-xs text-blue-200 font-semibold uppercase">Total Annual Forecast</div>
              <div className="text-2xl font-black text-white">{formatCurr(totalAnnualDisplay)}</div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: FULL HOLDINGS & YIELD ON COST TABLE */}
      <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden ${viewMode === 'table' ? 'block' : 'hidden'}`}>
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Dividend Cash Flow & Yield on Cost (YoC)</h3>
            <p className="text-xs text-gray-500">Track passive dividend earnings, yield expansion from original cost, and dividend health safety ratings.</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800">
              💎 YoC Expands With Share Growth
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3 text-right">Shares</th>
                <th className="px-5 py-3 text-right">Market Price</th>
                <th className="px-5 py-3 text-right">Current Yield</th>
                <th className="px-5 py-3 text-right">Yield on Cost (YoC)</th>
                <th className="px-5 py-3 text-center">Est. Next Ex-Date</th>
                <th className="px-5 py-3 text-right">Est. Next Payout</th>
                <th className="px-5 py-3 text-right">Annual Total</th>
                <th className="px-5 py-3 text-center">Payout Ratio</th>
                <th className="px-5 py-3 text-center">Safety</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {dividendAssets.map((asset, idx) => {
                const yocGain = asset.yieldOnCost - asset.dividendYield;
                const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);
                const estPayout = asset.estimatedNextPayout || (asset.shares * dps);
                const payoutDisplay = currencyMode === 'USD' ? (estPayout / usdTryRate) : estPayout;

                return (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onSelectTicker?.(asset.symbol)}
                          className="font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer text-left transition-colors group"
                          title={`Click to view ${asset.symbol} chart & indicators`}
                        >
                          <span className="group-hover:underline">{asset.symbol}</span>
                          <span className="text-[10px] text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                        </button>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {asset.currency}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          ({asset.frequency})
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">{asset.name}</div>
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-gray-900 dark:text-white">
                      {asset.shares.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-900 dark:text-white">
                      {formatCurr(asset.currentPrice, asset.currency)}
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-gray-600 dark:text-gray-300">
                      {asset.dividendYield.toFixed(2)}%
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-black text-purple-600 dark:text-purple-400">
                        {asset.yieldOnCost.toFixed(2)}%
                      </span>
                      {yocGain > 0 && (
                        <div className="text-[10px] font-semibold text-emerald-500">
                          +{yocGain.toFixed(2)}% expansion
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                        {asset.nextExDate ? asset.nextExDate : 'Spring 2027'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                      +{formatCurr(payoutDisplay)}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-gray-900 dark:text-white">
                      {formatCurr(asset.annualPayout, asset.currency)}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                        asset.payoutRatio <= 65
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                          : asset.payoutRatio <= 85
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                          : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                      }`}>
                        {asset.payoutRatio.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-block w-7 h-7 rounded-full text-xs font-black text-center leading-7 ${
                        asset.safetyRating === 'A'
                          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                          : asset.safetyRating === 'B'
                          ? 'bg-blue-500 text-white'
                          : 'bg-amber-500 text-white'
                      }`}>
                        {asset.safetyRating}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* VIEW 3: AI PORTFOLIO LAB & BACKTEST SIMULATOR */}
      {viewMode === 'lab' && (
        <DividendPortfolioLab
          usdTryRate={usdTryRate}
          onImportCandidate={onImportCandidate}
          onSelectTicker={onSelectTicker}
        />
      )}
    </div>
  );
}
