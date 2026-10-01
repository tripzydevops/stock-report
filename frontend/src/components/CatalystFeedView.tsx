'use client';

import React, { useState } from 'react';
import { MarketCatalyst, PortfolioItem } from '../lib/supabaseClient';
import { TradeSignal } from './TradeCard';

interface CatalystFeedViewProps {
  catalysts: MarketCatalyst[];
  portfolio: PortfolioItem[];
  signals: TradeSignal[];
  onSelectTicker?: (symbol: string) => void;
}

export default function CatalystFeedView({
  catalysts,
  portfolio,
  signals,
  onSelectTicker,
}: CatalystFeedViewProps) {
  const [filter, setFilter] = useState<'ALL' | 'PORTFOLIO' | 'SIGNALS' | 'BUYBACK' | 'MACRO'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const portfolioSymbols = new Set(portfolio.map(p => p.symbol.toUpperCase().replace('.IS', '')));
  const signalSymbols = new Set(signals.map(s => s.symbol.toUpperCase().replace('.IS', '')));

  // Category Helpers
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'KAP_BUYBACK':
        return { label: 'Share Buyback (Geri Alım)', icon: '💎', color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
      case 'KAP_DIVIDEND':
        return { label: 'Dividend (Temettü)', icon: '💰', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
      case 'KAP_CONTRACT':
        return { label: 'New Contract (Yeni İş)', icon: '📜', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'KAP_EARNINGS':
        return { label: 'Financials & Volume', icon: '📊', color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' };
      case 'MACRO_TCMB':
        return { label: 'Central Bank (TCMB)', icon: '🏛️', color: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' };
      case 'MACRO_FED':
        return { label: 'Fed & Global Macro', icon: '🌐', color: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
      default:
        return { label: 'Disclosure', icon: '📑', color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700' };
    }
  };

  const getVerdictStyle = (verdict: string) => {
    switch (verdict.toLowerCase()) {
      case 'bullish':
        return { bg: 'bg-emerald-500 text-white', text: '🟢 BULLISH', ring: 'ring-emerald-500/20' };
      case 'bearish':
        return { bg: 'bg-rose-500 text-white', text: '🔴 BEARISH', ring: 'ring-rose-500/20' };
      default:
        return { bg: 'bg-amber-500 text-white', text: '🟡 NEUTRAL', ring: 'ring-amber-500/20' };
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const isToday = d.toDateString() === new Date().toDateString();
      const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
      return isToday ? `Today ${timeStr}` : `${dateStr} ${timeStr}`;
    } catch {
      return iso;
    }
  };

  // Filter Logic
  const filteredCatalysts = catalysts.filter(item => {
    const sym = item.symbol.toUpperCase().replace('.IS', '');
    const matchesSearch = searchQuery === '' || 
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.aiTakeaway.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filter === 'PORTFOLIO') {
      return portfolioSymbols.has(sym);
    }
    if (filter === 'SIGNALS') {
      return signalSymbols.has(sym);
    }
    if (filter === 'BUYBACK') {
      return item.category === 'KAP_BUYBACK';
    }
    if (filter === 'MACRO') {
      return item.category.startsWith('MACRO');
    }
    return true;
  });

  const portfolioCatalystsCount = catalysts.filter(c => portfolioSymbols.has(c.symbol.toUpperCase().replace('.IS', ''))).length;
  const signalCatalystsCount = catalysts.filter(c => signalSymbols.has(c.symbol.toUpperCase().replace('.IS', ''))).length;
  const buybackCatalystsCount = catalysts.filter(c => c.category === 'KAP_BUYBACK').length;
  const macroCatalystsCount = catalysts.filter(c => c.category.startsWith('MACRO')).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">⚡</span>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              KAP Disclosures & AI Catalyst Feed
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              100% Signal · Zero Noise
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Official regulatory disclosures (KAP / SEC) & central bank events synthesized into 1-line actionable takeaways.
          </p>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-64">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticker, buyback, etc..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
            <span className="absolute left-2.5 top-2 text-gray-400 text-xs">🔍</span>
          </div>
        </div>
      </div>

      {/* Touch-Friendly Horizontal Filter Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1.5 touch-pan-x -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            filter === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }`}
        >
          All Catalysts ({catalysts.length})
        </button>

        <button
          onClick={() => setFilter('PORTFOLIO')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
            filter === 'PORTFOLIO'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100'
          }`}
        >
          <span>💼</span>
          <span>My Portfolio ({portfolioCatalystsCount})</span>
        </button>

        <button
          onClick={() => setFilter('SIGNALS')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
            filter === 'SIGNALS'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
          }`}
        >
          <span>🎯</span>
          <span>Today's Setups ({signalCatalystsCount})</span>
        </button>

        <button
          onClick={() => setFilter('BUYBACK')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
            filter === 'BUYBACK'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
          }`}
        >
          <span>💎</span>
          <span>Share Buybacks ({buybackCatalystsCount})</span>
        </button>

        <button
          onClick={() => setFilter('MACRO')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
            filter === 'MACRO'
              ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }`}
        >
          <span>🏛️</span>
          <span>Central Bank & Macro ({macroCatalystsCount})</span>
        </button>
      </div>

      {/* Feed List */}
      {filteredCatalysts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-200 dark:border-gray-700">
          <span className="text-4xl mb-3 block">📭</span>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">No Disclosures Match Current Filter</h3>
          <p className="text-xs text-gray-500 mt-1">Try switching to "All Catalysts" or clearing your search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCatalysts.map((item) => {
            const cat = getCategoryMeta(item.category);
            const verdict = getVerdictStyle(item.aiVerdict);
            const isPortfolioStock = portfolioSymbols.has(item.symbol.toUpperCase().replace('.IS', ''));
            const isScannedStock = signalSymbols.has(item.symbol.toUpperCase().replace('.IS', ''));

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar: Stock Tag, Category, Time */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-750">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onSelectTicker?.(item.symbol)}
                        className="font-black text-base text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center space-x-1"
                        title="Click to view full price chart & indicators"
                      >
                        <span>{item.symbol}</span>
                        <span className="text-xs text-blue-500 opacity-60">📈</span>
                      </button>

                      {isPortfolioStock && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          💼 PORTFOLIO
                        </span>
                      )}

                      {isScannedStock && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          🎯 ACTIVE SETUP
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border flex items-center space-x-1 ${cat.color}`}>
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </span>

                      <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        🗓️ {formatTimestamp(item.publishedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Disclosure Title & Official Text */}
                  <div className="py-3">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">
                      {item.title}
                    </h3>
                    {item.details && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 line-clamp-2 leading-relaxed">
                        {item.details}
                      </p>
                    )}
                  </div>
                </div>

                {/* AI 1-Line Synthesis Box */}
                <div className="mt-2 pt-3 border-t border-gray-100 dark:border-gray-750">
                  <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-850/80 border border-gray-200/80 dark:border-gray-700/80 space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-black text-gray-700 dark:text-gray-300 flex items-center space-x-1">
                          <span>🤖</span>
                          <span>AI Synthesis:</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${verdict.bg}`}>
                          {verdict.text}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 text-[11px] font-bold text-gray-500">
                        <span>⚡ Catalyst Impact:</span>
                        <span className="font-mono text-gray-900 dark:text-white">{item.impactScore}/10</span>
                      </div>
                    </div>

                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-normal">
                      {item.aiTakeaway}
                    </p>
                  </div>

                  {/* Card Bottom Links */}
                  <div className="flex justify-between items-center pt-3 text-[11px]">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 font-semibold"
                      >
                        <span>Official KAP Disclosure</span>
                        <span>↗</span>
                      </a>
                    ) : (
                      <span className="text-gray-400">Official Filing</span>
                    )}

                    <button
                      onClick={() => onSelectTicker?.(item.symbol)}
                      className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors"
                    >
                      Inspect Price Action →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
