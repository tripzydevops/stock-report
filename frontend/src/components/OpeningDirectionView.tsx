'use client';

import React, { useState, useMemo } from 'react';
import { OpeningDirectionItem } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';
import { DateRangeFilter, formatFilterDisplay } from '../lib/dateFilter';

interface OpeningDirectionViewProps {
  items: OpeningDirectionItem[];
  onSelectTicker?: (symbol: string) => void;
  dateFilter?: DateRangeFilter;
}

export type OrbSortColumn = 'symbol' | 'gapPercent' | 'gapType' | 'orbStatus' | 'bias' | 'volumeSpike';
export type SortDirection = 'asc' | 'desc';

const gapTypeRanks: Record<string, number> = {
  'Gap Up & Go': 4,
  'Gap & Fade': 3,
  'Flat Open': 2,
  'Gap Down': 1,
};

const orbStatusRanks: Record<string, number> = {
  'Broke High': 3,
  'Inside Range': 2,
  'Broke Low': 1,
};

const biasRanks: Record<string, number> = {
  'Strong Bullish': 4,
  'Bullish': 3,
  'Neutral': 2,
  'Bearish': 1,
};

export default function OpeningDirectionView({ items, onSelectTicker, dateFilter }: OpeningDirectionViewProps) {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'BIST' | 'US'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH' | 'BREAKOUT' | 'SPIKE'>('ALL');
  const [sortColumn, setSortColumn] = useState<OrbSortColumn>('gapPercent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const bullishCount = items.filter(i => i.bias.includes('Bullish')).length;
  const bearishCount = items.filter(i => i.bias.includes('Bearish')).length;
  const brokenHighCount = items.filter(i => i.orbStatus === 'Broke High').length;
  const volumeSpikesCount = items.filter(i => i.volumeSpike).length;

  const handleSort = (col: OrbSortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection(col === 'symbol' ? 'asc' : 'desc');
    }
  };

  const renderSortHeader = (col: OrbSortColumn, label: string, align: 'left' | 'right' | 'center' = 'center') => {
    const isActive = sortColumn === col;
    const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';
    const justifyClass = align === 'left' ? 'justify-start' : align === 'right' ? 'justify-end' : 'justify-center';

    return (
      <th
        scope="col"
        onClick={() => handleSort(col)}
        className={`px-5 py-3 cursor-pointer select-none transition-colors hover:text-blue-600 dark:hover:text-blue-400 group whitespace-nowrap ${alignClass} ${
          isActive ? 'text-blue-600 dark:text-blue-400 font-bold bg-blue-50/60 dark:bg-blue-950/30' : ''
        }`}
        title={language === 'tr' ? `${label} sütununa göre sıralamak için tıklayın` : `Click to sort by ${label}`}
      >
        <div className={`inline-flex items-center gap-1.5 ${justifyClass}`}>
          <span>{label}</span>
          <span className={`text-[11px] transition-all ${isActive ? 'text-blue-600 dark:text-blue-400 font-bold scale-110' : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'}`}>
            {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </div>
      </th>
    );
  };

  const filteredItems = useMemo(() => {
    const filtered = items.filter(item => {
      // Market filter
      if (marketFilter !== 'ALL' && item.market !== marketFilter) return false;

      // Type filter
      if (typeFilter === 'BULLISH' && !item.bias.includes('Bullish')) return false;
      if (typeFilter === 'BEARISH' && !item.bias.includes('Bearish')) return false;
      if (typeFilter === 'BREAKOUT' && item.orbStatus !== 'Broke High') return false;
      if (typeFilter === 'SPIKE' && !item.volumeSpike) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toUpperCase();
        if (!item.symbol.toUpperCase().includes(query)) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      let diff = 0;
      switch (sortColumn) {
        case 'symbol':
          diff = a.symbol.localeCompare(b.symbol);
          break;
        case 'gapPercent':
          diff = a.gapPercent - b.gapPercent;
          break;
        case 'gapType':
          diff = (gapTypeRanks[a.gapType] || 0) - (gapTypeRanks[b.gapType] || 0);
          break;
        case 'orbStatus':
          diff = (orbStatusRanks[a.orbStatus] || 0) - (orbStatusRanks[b.orbStatus] || 0);
          break;
        case 'bias':
          diff = (biasRanks[a.bias] || 0) - (biasRanks[b.bias] || 0);
          break;
        case 'volumeSpike':
          diff = (a.volumeSpike ? 1 : 0) - (b.volumeSpike ? 1 : 0);
          break;
        default:
          diff = 0;
      }
      return sortDirection === 'asc' ? diff : -diff;
    });
  }, [items, marketFilter, typeFilter, searchQuery, sortColumn, sortDirection]);

  return (
    <div className="space-y-6">
      {dateFilter && dateFilter.preset !== 'ALL' && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl p-3 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>📅</span>
            <span><strong>{formatFilterDisplay(dateFilter, language)}:</strong> {language === 'tr' ? 'Açılış Yönü (ORB) verileri güncel seans kırılımlarını listeler.' : 'Opening Direction (ORB) displays live breakout triggers for the current session.'}</span>
          </div>
        </div>
      )}

      {/* Top ORB Summary Cards (Responsive 2x2 on Mobile, 4 Cols on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div 
          onClick={() => setTypeFilter(typeFilter === 'BULLISH' ? 'ALL' : 'BULLISH')}
          className={`bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-5 border cursor-pointer transition-all hover:scale-[1.01] shadow-xs ${
            typeFilter === 'BULLISH' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block truncate">{t.orb.morningSentiment}</span>
          <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-emerald-500 truncate">
            {bullishCount > bearishCount ? t.orb.bullishDrift : t.orb.cautiousMixed}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
            {language === 'tr' 
              ? `${bullishCount} Pozitif · ${bearishCount} Negatif` 
              : `${bullishCount} Bullish · ${bearishCount} Bearish`}
          </div>
        </div>

        <div 
          onClick={() => setTypeFilter(typeFilter === 'BREAKOUT' ? 'ALL' : 'BREAKOUT')}
          className={`bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-5 border cursor-pointer transition-all hover:scale-[1.01] shadow-xs ${
            typeFilter === 'BREAKOUT' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block truncate">
            {language === 'tr' ? '15-Dk ORB Kırılımı' : '15-Min ORB High'}
          </span>
          <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-blue-600 dark:text-blue-400 truncate">
            {brokenHighCount} {language === 'tr' ? 'Hisse' : 'Symbols'}
          </div>
          <div className="text-[10px] sm:text-xs text-emerald-500 font-semibold mt-0.5 sm:mt-1 truncate">
            {language === 'tr' ? '● Zirveyi kıranlar' : '● Breaking 15m high'}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block truncate">
            {language === 'tr' ? 'Açılış Boşluğu' : 'Opening Gap Edge'}
          </span>
          <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-purple-600 dark:text-purple-400 truncate">
            Gap Up & Go
          </div>
          <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
            {language === 'tr' ? 'Yüksek devam olasılığı' : 'High continuation'}
          </div>
        </div>

        <div 
          onClick={() => setTypeFilter(typeFilter === 'SPIKE' ? 'ALL' : 'SPIKE')}
          className={`bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-5 border cursor-pointer transition-all hover:scale-[1.01] shadow-xs ${
            typeFilter === 'SPIKE' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block truncate">{t.orb.volumeSpike}</span>
          <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-amber-500 truncate">
            {volumeSpikesCount} {t.common.active}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
            {language === 'tr' ? '> 1.5x açılış hacmi' : '> 1.5x opening volume'}
          </div>
        </div>
      </div>

      {/* Opening Direction Table / Card View */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">{t.orb.title}</h3>
                <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                  {filteredItems.length} {language === 'tr' ? 'Varlık' : (filteredItems.length === 1 ? 'Asset' : 'Assets')}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{t.orb.subtitle}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            {/* Search Input */}
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={language === 'tr' ? "Hisse ara (örn: THYAO, NVDA)..." : "Search symbol..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs px-3 py-2 pl-8 rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Chips Toolbar - Horizontal scrollable on mobile */}
            <div className="flex items-center gap-2 overflow-x-auto touch-pan-x no-scrollbar py-0.5 w-full sm:w-auto shrink-0">
              {/* Market Filter Chips */}
              <div className="flex items-center p-0.5 bg-gray-100 dark:bg-gray-700 rounded-xl text-xs font-semibold shrink-0">
                {(['ALL', 'BIST', 'US'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMarketFilter(m)}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                      marketFilter === m
                        ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {m === 'ALL' ? t.common.all : m}
                  </button>
                ))}
              </div>

              {/* Quick Filter Chips */}
              <button
                onClick={() => setTypeFilter(typeFilter === 'BREAKOUT' ? 'ALL' : 'BREAKOUT')}
                className={`text-xs px-2.5 py-1 rounded-xl font-bold border transition-colors shrink-0 cursor-pointer ${
                  typeFilter === 'BREAKOUT'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                }`}
              >
                ⚡ {language === 'tr' ? 'Kırılımlar' : 'Breakouts'}
              </button>
              <button
                onClick={() => setTypeFilter(typeFilter === 'BULLISH' ? 'ALL' : 'BULLISH')}
                className={`text-xs px-2.5 py-1 rounded-xl font-bold border transition-colors shrink-0 cursor-pointer ${
                  typeFilter === 'BULLISH'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                }`}
              >
                🟢 {language === 'tr' ? 'Pozitif (Boğa)' : 'Bullish'}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile View: Clean Touch Cards with Quick Sort */}
        <div className="md:hidden">
          {/* Mobile Quick Sort Selector */}
          <div className="px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between gap-2 text-xs">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider shrink-0">
              {language === 'tr' ? 'Sırala:' : 'Sort:'}
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto touch-pan-x no-scrollbar py-0.5">
              {[
                { col: 'gapPercent', label: 'Gap %' },
                { col: 'symbol', label: language === 'tr' ? 'Varlık' : 'Asset' },
                { col: 'gapType', label: language === 'tr' ? 'Gap Sınıfı' : 'Type' },
                { col: 'orbStatus', label: language === 'tr' ? '15dk ORB' : 'ORB' },
                { col: 'bias', label: language === 'tr' ? 'Yön' : 'Bias' },
                { col: 'volumeSpike', label: language === 'tr' ? 'Hacim' : 'Vol' },
              ].map(({ col, label }) => {
                const isActive = sortColumn === col;
                return (
                  <button
                    key={col}
                    onClick={() => handleSort(col as OrbSortColumn)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-[10px]">
                      {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs">
              {language === 'tr' ? 'Seçilen kriterlere uygun varlık bulunamadı.' : 'No matching assets found.'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-750">
              {filteredItems.map((row, idx) => (
                <div
                  key={idx}
                  onClick={() => onSelectTicker?.(row.symbol)}
                  className="p-3.5 hover:bg-gray-50 dark:hover:bg-gray-750 active:bg-gray-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-1">
                        {row.symbol}
                        <span className="text-[10px] text-blue-500 opacity-60">📈</span>
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {row.market}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {row.volumeSpike && (
                        <span className="inline-flex items-center text-[10px] font-black text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                          ⚡ 2.4x {language === 'tr' ? 'Hacim' : 'Vol'}
                        </span>
                      )}
                      <span className={`text-sm font-black ${row.gapPercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {row.gapPercent >= 0 ? '+' : ''}{row.gapPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      row.gapType === 'Gap Up & Go'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                        : row.gapType === 'Gap & Fade'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                        : row.gapType === 'Gap Down'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {row.gapType}
                    </span>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      row.orbStatus === 'Broke High'
                        ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-bold'
                        : row.orbStatus === 'Broke Low'
                        ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {row.orbStatus === 'Broke High' ? (language === 'tr' ? 'Zirveyi Kırdı' : row.orbStatus) :
                       row.orbStatus === 'Broke Low' ? (language === 'tr' ? 'Dibi Kırdı' : row.orbStatus) :
                       (language === 'tr' ? 'Aralık İçi' : row.orbStatus)}
                    </span>

                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      row.bias === 'Strong Bullish'
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : row.bias === 'Bullish'
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                        : row.bias === 'Bearish'
                        ? 'bg-rose-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {row.bias === 'Strong Bullish' ? (language === 'tr' ? 'Güçlü Boğa' : row.bias) :
                       row.bias === 'Bullish' ? (language === 'tr' ? 'Pozitif (Boğa)' : row.bias) :
                       row.bias === 'Bearish' ? (language === 'tr' ? 'Negatif (Ayı)' : row.bias) :
                       row.bias}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desktop View: Full Sortable Table */}
        <div className="hidden md:block overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 backdrop-blur-xs">
              <tr>
                {renderSortHeader('symbol', language === 'tr' ? 'Varlık' : 'Asset', 'left')}
                {renderSortHeader('gapPercent', t.orb.gapPercent, 'right')}
                {renderSortHeader('gapType', language === 'tr' ? 'Gap Sınıfı' : 'Gap Classification', 'center')}
                {renderSortHeader('orbStatus', language === 'tr' ? '15dk ORB Durumu' : '15m ORB Status', 'center')}
                {renderSortHeader('bias', t.orb.bias, 'center')}
                {renderSortHeader('volumeSpike', language === 'tr' ? 'Hacim Dalgası' : 'Volume Surge', 'center')}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                    {language === 'tr' ? 'Seçilen kriterlere uygun varlık bulunamadı.' : 'No matching assets found for current filter criteria.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => onSelectTicker?.(row.symbol)}
                          className="font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer text-left transition-colors group"
                          title={language === 'tr' ? `${row.symbol} grafik ve indikatörlerini görüntüleyin` : `Click to view ${row.symbol} chart & indicators`}
                        >
                          <span className="group-hover:underline">{row.symbol}</span>
                          <span className="text-[10px] text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                        </button>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {row.market}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <span className={`font-bold ${row.gapPercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {row.gapPercent >= 0 ? '+' : ''}{row.gapPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        row.gapType === 'Gap Up & Go'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                          : row.gapType === 'Gap & Fade'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                          : row.gapType === 'Gap Down'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {row.gapType}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                        row.orbStatus === 'Broke High'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 font-bold'
                          : row.orbStatus === 'Broke Low'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {row.orbStatus === 'Broke High' ? (language === 'tr' ? 'Zirveyi Kırdı' : row.orbStatus) :
                         row.orbStatus === 'Broke Low' ? (language === 'tr' ? 'Dibi Kırdı' : row.orbStatus) :
                         (language === 'tr' ? 'Aralık İçi' : row.orbStatus)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black ${
                        row.bias === 'Strong Bullish'
                          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                          : row.bias === 'Bullish'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                          : row.bias === 'Bearish'
                          ? 'bg-rose-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {row.bias === 'Strong Bullish' ? (language === 'tr' ? 'Güçlü Boğa' : row.bias) :
                         row.bias === 'Bullish' ? (language === 'tr' ? 'Pozitif (Boğa)' : row.bias) :
                         row.bias === 'Bearish' ? (language === 'tr' ? 'Negatif (Ayı)' : row.bias) :
                         row.bias}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      {row.volumeSpike ? (
                        <span className="inline-flex items-center text-xs font-black text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                          ⚡ 2.4x {language === 'tr' ? 'Hacim' : 'Vol'}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{language === 'tr' ? 'Normal' : 'Normal'}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
