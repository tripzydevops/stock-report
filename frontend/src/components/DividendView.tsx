'use client';

import React, { useState } from 'react';
import { DividendAsset } from '../lib/supabaseClient';

interface DividendViewProps {
  dividendAssets: DividendAsset[];
  usdTryRate: number;
}

export default function DividendView({ dividendAssets, usdTryRate }: DividendViewProps) {
  const [currencyMode, setCurrencyMode] = useState<'TRY' | 'USD'>('TRY');

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
            ● Average monthly dividend dividend
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
            Low dividend cut probability
          </div>
        </div>
      </div>

      {/* Dividend Assets Detailed Breakdown Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
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
                <th className="px-5 py-3 text-right">Annual Payout</th>
                <th className="px-5 py-3 text-right">Monthly Avg</th>
                <th className="px-5 py-3 text-center">Payout Ratio</th>
                <th className="px-5 py-3 text-center">Safety Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {dividendAssets.map((asset, idx) => {
                const yocGain = asset.yieldOnCost - asset.dividendYield;
                return (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-gray-900 dark:text-white">{asset.symbol}</span>
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
                    <td className="px-5 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurr(asset.annualPayout, asset.currency)}
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-blue-600 dark:text-blue-400">
                      {formatCurr(asset.monthlyPayout, asset.currency)}
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
    </div>
  );
}
