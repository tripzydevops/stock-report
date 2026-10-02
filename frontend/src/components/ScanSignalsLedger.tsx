'use client';

import React, { useState } from 'react';
import { ScannedTradeSignal } from '../lib/supabaseClient';
import { calculateExitDate } from '../lib/tradeTiming';

interface ScanSignalsLedgerProps {
  signals: ScannedTradeSignal[];
  onSelectTicker?: (symbol: string) => void;
}

export default function ScanSignalsLedger({ signals, onSelectTicker }: ScanSignalsLedgerProps) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'target_hit' | 'stopped_out' | 'open'>('ALL');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'BIST' | 'US'>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeModalSignal, setActiveModalSignal] = useState<ScannedTradeSignal | null>(null);

  // Metrics calculations
  const totalSignals = signals.length;
  const targetHitCount = signals.filter(s => s.status === 'target_hit').length;
  const stoppedOutCount = signals.filter(s => s.status === 'stopped_out').length;
  const openCount = signals.filter(s => s.status === 'open').length;

  const closedSignals = signals.filter(s => s.status === 'target_hit' || s.status === 'stopped_out');
  const winRate = closedSignals.length > 0 ? (targetHitCount / closedSignals.length) * 100 : 0;

  const winningTrades = signals.filter(s => s.status === 'target_hit' && (s.outcomePnlPct || 0) > 0);
  const losingTrades = signals.filter(s => s.status === 'stopped_out' && (s.outcomePnlPct || 0) < 0);

  const avgGain = winningTrades.length > 0 
    ? winningTrades.reduce((acc, s) => acc + (s.outcomePnlPct || 0), 0) / winningTrades.length 
    : 0;

  const avgLoss = losingTrades.length > 0 
    ? Math.abs(losingTrades.reduce((acc, s) => acc + (s.outcomePnlPct || 0), 0) / losingTrades.length) 
    : 0;

  const profitFactor = (avgLoss > 0 && losingTrades.length > 0)
    ? ((avgGain * winningTrades.length) / (avgLoss * losingTrades.length)).toFixed(2)
    : 'N/A';

  // Extract distinct strategies for filter dropdown
  const uniqueStrategies = ['ALL', ...Array.from(new Set(signals.map(s => s.strategy)))];

  // Filtering
  const filteredSignals = signals.filter(s => {
    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    const matchesMarket = marketFilter === 'ALL' || s.market === marketFilter;
    const matchesStrategy = strategyFilter === 'ALL' || s.strategy === strategyFilter;
    const matchesSearch = searchTerm === '' || 
      s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesMarket && matchesStrategy && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'target_hit':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
            <span>🎯</span>
            <span>HIT TARGET</span>
          </span>
        );
      case 'stopped_out':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400 border border-rose-300 dark:border-rose-800">
            <span>🛑</span>
            <span>STOPPED OUT</span>
          </span>
        );
      case 'open':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-400 border border-blue-300 dark:border-blue-800">
            <span>⏳</span>
            <span>ACTIVE / IN PROGRESS</span>
          </span>
        );
    }
  };

  const getStrategyName = (strat: string) => {
    return strat
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Live System Metrics */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-100 dark:border-gray-750">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>🔬</span>
              <span>Scanner Trade Signals & Outcome Audit Ledger</span>
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Complete historical log of every trade setup identified by our autonomous scan, verified against entry triggers, profit targets, and stop-losses.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Autonomous Verification Active
            </span>
          </div>
        </div>

        {/* 4 Summary Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="bg-gray-50 dark:bg-gray-750 p-3.5 rounded-xl border border-gray-200/70 dark:border-gray-700">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Scanned</span>
            <div className="text-xl font-black text-gray-900 dark:text-white mt-1">
              {totalSignals} Setups
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">{openCount} currently in progress</div>
          </div>

          <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-200/70 dark:border-emerald-800">
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">🎯 Hit Target (Success)</span>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {targetHitCount} Wins ({winRate.toFixed(1)}%)
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">Avg Gain: +{avgGain.toFixed(2)}%</div>
          </div>

          <div className="bg-rose-50/60 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-200/70 dark:border-rose-800">
            <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 uppercase tracking-wider">🛑 Stopped Out (Failed)</span>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {stoppedOutCount} Losses ({(100 - winRate).toFixed(1)}%)
            </div>
            <div className="text-[10px] text-rose-700 dark:text-rose-400 mt-0.5">Avg Loss: -{avgLoss.toFixed(2)}%</div>
          </div>

          <div className="bg-blue-50/60 dark:bg-blue-950/30 p-3.5 rounded-xl border border-blue-200/70 dark:border-blue-800">
            <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">System Profit Factor</span>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {profitFactor}x
            </div>
            <div className="text-[10px] text-blue-700 dark:text-blue-400 mt-0.5">Gross Win / Gross Loss</div>
          </div>
        </div>
      </div>

      {/* 2. Interactive Filter Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
        {/* Status Buttons */}
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-700 p-1 text-xs">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
              statusFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
            }`}
          >
            All ({totalSignals})
          </button>
          <button
            onClick={() => setStatusFilter('target_hit')}
            className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
              statusFilter === 'target_hit'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
            }`}
          >
            🎯 Hit Target ({targetHitCount})
          </button>
          <button
            onClick={() => setStatusFilter('stopped_out')}
            className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
              statusFilter === 'stopped_out'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
            }`}
          >
            🛑 Stopped Out ({stoppedOutCount})
          </button>
          <button
            onClick={() => setStatusFilter('open')}
            className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
              statusFilter === 'open'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
            }`}
          >
            ⏳ Active ({openCount})
          </button>
        </div>

        {/* Dropdowns & Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Market filter */}
          <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 text-xs">
            {(['ALL', 'BIST', 'US'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMarketFilter(m)}
                className={`px-2.5 py-1 font-semibold rounded-md transition-all ${
                  marketFilter === m
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {m === 'ALL' ? 'All Mkts' : m}
              </button>
            ))}
          </div>

          {/* Strategy dropdown */}
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-650 text-gray-900 dark:text-white focus:outline-none"
          >
            {uniqueStrategies.map(strat => (
              <option key={strat} value={strat}>
                {strat === 'ALL' ? 'All Strategies' : getStrategyName(strat)}
              </option>
            ))}
          </select>

          {/* Search box */}
          <input
            type="text"
            placeholder="Search symbol..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-650 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none w-32 sm:w-40"
          />
        </div>
      </div>

      {/* 3. Detailed Trade Audit Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3">Strategy</th>
                <th className="px-5 py-3 text-center">Outcome Status</th>
                <th className="px-5 py-3 text-right">Entry Price</th>
                <th className="px-5 py-3 text-right">Stop Loss</th>
                <th className="px-5 py-3 text-right">Target 1</th>
                <th className="px-5 py-3 text-right">R:R Ratio</th>
                <th className="px-5 py-3 text-right">Return %</th>
                <th className="px-5 py-3 text-right">Trigger Date</th>
                <th className="px-5 py-3 text-right">Closed / Est. Exit</th>
                <th className="px-5 py-3 text-center">AI Thesis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredSignals.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-gray-500 dark:text-gray-400">
                    No trade signals match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredSignals.map((sig) => {
                  const currSym = sig.currency === 'USD' ? '$' : '₺';
                  const isWin = sig.status === 'target_hit';
                  const isLoss = sig.status === 'stopped_out';
                  const isOpen = sig.status === 'open';

                  return (
                    <tr 
                      key={sig.id} 
                      className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors cursor-pointer group"
                      onClick={() => setActiveModalSignal(sig)}
                    >
                      {/* Asset */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectTicker?.(sig.symbol);
                            }}
                            className="font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer text-left transition-colors"
                            title={`Click to view ${sig.symbol} chart & indicators`}
                          >
                            <span>{sig.symbol}</span>
                            <span className="text-[10px] text-blue-500 opacity-60 hover:opacity-100">📈</span>
                          </button>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {sig.market}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 max-w-[140px] truncate">{sig.name}</div>
                      </td>

                      {/* Strategy */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                          {getStrategyName(sig.strategy)}
                        </span>
                      </td>

                      {/* Outcome Status */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        {getStatusBadge(sig.status)}
                      </td>

                      {/* Entry Price */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-bold text-gray-900 dark:text-white">
                        {currSym}{sig.entryPrice.toFixed(2)}
                      </td>

                      {/* Stop Loss */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-rose-600 dark:text-rose-400 font-semibold">
                        {currSym}{sig.stopLoss.toFixed(2)}
                        <span className="text-[10px] text-gray-400 block">
                          -{(((sig.entryPrice - sig.stopLoss) / sig.entryPrice) * 100).toFixed(1)}%
                        </span>
                      </td>

                      {/* Target 1 */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        {currSym}{sig.targetPrice.toFixed(2)}
                        <span className="text-[10px] text-gray-400 block">
                          +{(((sig.targetPrice - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1)}%
                        </span>
                      </td>

                      {/* R:R Ratio */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono font-bold text-xs text-gray-700 dark:text-gray-300">
                        {sig.riskReward > 0 ? `${sig.riskReward.toFixed(2)}x` : '-'}
                      </td>

                      {/* Return % */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-black">
                        {isWin && sig.outcomePnlPct !== null && (
                          <span className="text-emerald-500">
                            ▲ +{sig.outcomePnlPct?.toFixed(2)}%
                          </span>
                        )}
                        {isLoss && sig.outcomePnlPct !== null && (
                          <span className="text-rose-500">
                            ▼ {sig.outcomePnlPct?.toFixed(2)}%
                          </span>
                        )}
                        {isOpen && (
                          <span className="text-xs font-semibold text-blue-500 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded">
                            Open
                          </span>
                        )}
                      </td>

                      {/* Trigger Date */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-xs text-gray-500 font-mono">
                        {sig.signalDate}
                      </td>

                      {/* Closed / Est. Exit Date */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-xs font-mono">
                        {sig.closedAt ? (
                          <span className="text-gray-500 dark:text-gray-400">{sig.closedAt.slice(0, 10)}</span>
                        ) : (
                          (() => {
                            const timing = calculateExitDate(sig.signalDate, sig.strategy);
                            return (
                              <div className="inline-flex flex-col items-end">
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {timing.maxExitDate}
                                </span>
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded mt-0.5 ${
                                  timing.statusColor === 'green'
                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                    : timing.statusColor === 'amber'
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse'
                                }`}>
                                  ⏳ {timing.label}
                                </span>
                              </div>
                            );
                          })()
                        )}
                      </td>

                      {/* AI Thesis Details */}
                      <td className="px-5 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveModalSignal(sig);
                          }}
                          className="px-2 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Detailed Signal Modal Dialog */}
      {activeModalSignal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 border border-gray-200 dark:border-gray-700 shadow-2xl relative">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    onSelectTicker?.(activeModalSignal.symbol);
                    setActiveModalSignal(null);
                  }}
                  className="text-xl font-black text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1.5 cursor-pointer text-left transition-colors group"
                  title={`Click to view ${activeModalSignal.symbol} full chart & indicators`}
                >
                  <span className="group-hover:underline">{activeModalSignal.symbol}</span>
                  <span className="text-xs text-blue-500 opacity-70 group-hover:opacity-100">📈</span>
                </button>
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  {activeModalSignal.market}
                </span>
                {getStatusBadge(activeModalSignal.status)}
              </div>
              <button
                onClick={() => setActiveModalSignal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <span className="text-xs text-gray-500">Company Name</span>
                <p className="font-bold text-gray-900 dark:text-white">{activeModalSignal.name}</p>
              </div>

              {/* Levels grid */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200/60 dark:border-gray-700 text-center">
                <div>
                  <span className="text-[10px] text-gray-500 uppercase font-semibold">Entry Price</span>
                  <p className="font-black text-gray-900 dark:text-white mt-0.5">
                    {activeModalSignal.currency === 'USD' ? '$' : '₺'}{activeModalSignal.entryPrice.toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-rose-500 uppercase font-semibold">Stop Loss</span>
                  <p className="font-black text-rose-600 dark:text-rose-400 mt-0.5">
                    {activeModalSignal.currency === 'USD' ? '$' : '₺'}{activeModalSignal.stopLoss.toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-500 uppercase font-semibold">Target 1</span>
                  <p className="font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {activeModalSignal.currency === 'USD' ? '$' : '₺'}{activeModalSignal.targetPrice.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Result callout */}
              <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800">
                <div>
                  <span className="text-xs text-gray-500">Trade Outcome:</span>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {activeModalSignal.status === 'target_hit' && 'Target Reached (Successful Trade)'}
                    {activeModalSignal.status === 'stopped_out' && 'Stop Loss Hit (Risk Protected)'}
                    {activeModalSignal.status === 'open' && 'Active / Running Trade'}
                  </p>
                </div>
                {activeModalSignal.outcomePnlPct !== null && activeModalSignal.outcomePnlPct !== undefined && (
                  <div className={`text-lg font-black ${activeModalSignal.outcomePnlPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {activeModalSignal.outcomePnlPct >= 0 ? '+' : ''}{activeModalSignal.outcomePnlPct.toFixed(2)}%
                  </div>
                )}
              </div>

              {/* AI Rationale */}
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Autonomous AI Thesis & Scan Rationale
                </span>
                <p className="text-xs text-gray-700 dark:text-gray-300 bg-blue-50/50 dark:bg-blue-950/30 p-3 rounded-xl border border-blue-200/50 dark:border-blue-900/40 leading-relaxed">
                  {activeModalSignal.aiRationale}
                </p>
              </div>

              <div className="text-[11px] text-gray-400 flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                <span>Trigger Date: {activeModalSignal.signalDate}</span>
                <span>
                  {activeModalSignal.closedAt 
                    ? `Resolved: ${activeModalSignal.closedAt.slice(0, 10)}` 
                    : (() => {
                        const timing = calculateExitDate(activeModalSignal.signalDate, activeModalSignal.strategy);
                        return `Est. Max Exit: ${timing.maxExitDate} (${timing.label})`;
                      })()
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
