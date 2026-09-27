'use client';

import React from 'react';
import { OpeningDirectionItem } from '../lib/supabaseClient';

interface OpeningDirectionViewProps {
  items: OpeningDirectionItem[];
}

export default function OpeningDirectionView({ items }: OpeningDirectionViewProps) {
  const bullishCount = items.filter(i => i.bias.includes('Bullish')).length;
  const bearishCount = items.filter(i => i.bias.includes('Bearish')).length;
  const brokenHighCount = items.filter(i => i.orbStatus === 'Broke High').length;

  return (
    <div className="space-y-6">
      {/* Top ORB Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Morning Sentiment Bias</span>
          <div className="mt-2 text-2xl font-black text-emerald-500">
            {bullishCount > bearishCount ? 'Bullish Drift' : 'Cautious / Mixed'}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {bullishCount} Bullish vs {bearishCount} Bearish Gaps
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">15-Min ORB High Breakouts</span>
          <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
            {brokenHighCount} Symbols
          </div>
          <div className="text-xs text-emerald-500 font-semibold mt-1">
            ● Breaking above first 15m candle
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Opening Gap Type Edge</span>
          <div className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400">
            Gap Up & Go
          </div>
          <div className="text-xs text-gray-500 mt-1">
            High continuation probability
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Volume Spike Triggers</span>
          <div className="mt-2 text-2xl font-black text-amber-500">
            {items.filter(i => i.volumeSpike).length} Active
          </div>
          <div className="text-xs text-gray-500 mt-1">
            &gt; 2.0x 30-day average opening volume
          </div>
        </div>
      </div>

      {/* Opening Direction Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Opening Range Breakout (15m ORB) & Gaps</h3>
            <p className="text-xs text-gray-500">Classifies the opening 15-minute price action, directional continuation, and morning gap patterns.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3 text-right">Opening Gap %</th>
                <th className="px-5 py-3 text-center">Gap Classification</th>
                <th className="px-5 py-3 text-center">15m ORB Status</th>
                <th className="px-5 py-3 text-center">Directional Bias</th>
                <th className="px-5 py-3 text-center">Volume Surge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-gray-900 dark:text-white">{row.symbol}</span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {row.market}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className={`font-bold ${row.gapPercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {row.gapPercent >= 0 ? '+' : ''}{row.gapPercent.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      row.gapType === 'Gap Up & Go'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                        : row.gapType === 'Gap & Fade'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {row.gapType}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                      row.orbStatus === 'Broke High'
                        ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-bold'
                        : row.orbStatus === 'Broke Low'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {row.orbStatus}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                      row.bias === 'Strong Bullish'
                        ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                        : row.bias === 'Bullish'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                        : row.bias === 'Bearish'
                        ? 'bg-rose-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {row.bias}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    {row.volumeSpike ? (
                      <span className="inline-flex items-center text-xs font-black text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                        ⚡ 2.4x Vol
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Normal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
