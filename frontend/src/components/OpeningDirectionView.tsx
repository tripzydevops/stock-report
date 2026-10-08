'use client';

import React, { useState, useMemo } from 'react';
import { OpeningDirectionItem } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';

interface OpeningDirectionViewProps {
  items: OpeningDirectionItem[];
  onSelectTicker?: (symbol: string) => void;
}

export default function OpeningDirectionView({ items, onSelectTicker }: OpeningDirectionViewProps) {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'BIST' | 'US'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH' | 'BREAKOUT' | 'SPIKE'>('ALL');

  const bullishCount = items.filter(i => i.bias.includes('Bullish')).length;
  const bearishCount = items.filter(i => i.bias.includes('Bearish')).length;
  const brokenHighCount = items.filter(i => i.orbStatus === 'Broke High').length;
  const volumeSpikesCount = items.filter(i => i.volumeSpike).length;

  const filteredItems = useMemo(() => {
    return items.filter(item => {
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
  }, [items, marketFilter, typeFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top ORB Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          onClick={() => setTypeFilter(typeFilter === 'BULLISH' ? 'ALL' : 'BULLISH')}
          className={`bg-white dark:bg-gray-800 rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.02] shadow-sm ${
            typeFilter === 'BULLISH' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t.orb.morningSentiment}</span>
          <div className="mt-2 text-2xl font-black text-emerald-500">
            {bullishCount > bearishCount ? t.orb.bullishDrift : t.orb.cautiousMixed}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {language === 'tr' 
              ? `${bullishCount} Pozitif vs ${bearishCount} Negatif Gap` 
              : `${bullishCount} Bullish vs ${bearishCount} Bearish Gaps`}
          </div>
        </div>

        <div 
          onClick={() => setTypeFilter(typeFilter === 'BREAKOUT' ? 'ALL' : 'BREAKOUT')}
          className={`bg-white dark:bg-gray-800 rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.02] shadow-sm ${
            typeFilter === 'BREAKOUT' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {language === 'tr' ? '15-Dk ORB Zirve Kırılımları' : '15-Min ORB High Breakouts'}
          </span>
          <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
            {brokenHighCount} {language === 'tr' ? 'Hisse' : 'Symbols'}
          </div>
          <div className="text-xs text-emerald-500 font-semibold mt-1">
            {language === 'tr' ? '● İlk 15 dk mumunun üstüne çıkanlar' : '● Breaking above first 15m candle'}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {language === 'tr' ? 'Açılış Boşluk Avantajı' : 'Opening Gap Type Edge'}
          </span>
          <div className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400">
            Gap Up & Go
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {language === 'tr' ? 'Yüksek devam etme olasılığı' : 'High continuation probability'}
          </div>
        </div>

        <div 
          onClick={() => setTypeFilter(typeFilter === 'SPIKE' ? 'ALL' : 'SPIKE')}
          className={`bg-white dark:bg-gray-800 rounded-2xl p-5 border cursor-pointer transition-all hover:scale-[1.02] shadow-sm ${
            typeFilter === 'SPIKE' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t.orb.volumeSpike}</span>
          <div className="mt-2 text-2xl font-black text-amber-500">
            {volumeSpikesCount} {t.common.active}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {language === 'tr' ? '> 1.5x ortalama açılış hacmi' : '> 1.5x average opening volume'}
          </div>
        </div>
      </div>

      {/* Opening Direction Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t.orb.title}</h3>
              <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                {filteredItems.length} {language === 'tr' ? 'Varlık' : (filteredItems.length === 1 ? 'Asset' : 'Assets')}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{t.orb.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-44">
              <input
                type="text"
                placeholder={language === 'tr' ? "Hisse ara..." : "Search symbol..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs px-3 py-1.5 pl-8 rounded-lg bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Market Filter Chips */}
            <div className="flex items-center p-0.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs font-semibold">
              {(['ALL', 'BIST', 'US'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMarketFilter(m)}
                  className={`px-3 py-1 rounded-md transition-colors ${
                    marketFilter === m
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {m === 'ALL' ? t.common.all : m}
                </button>
              ))}
            </div>

            {/* Quick Filter Chips */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTypeFilter(typeFilter === 'BREAKOUT' ? 'ALL' : 'BREAKOUT')}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-colors ${
                  typeFilter === 'BREAKOUT'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                }`}
              >
                ⚡ {language === 'tr' ? 'Kırılımlar' : 'Breakouts'}
              </button>
              <button
                onClick={() => setTypeFilter(typeFilter === 'BULLISH' ? 'ALL' : 'BULLISH')}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-colors ${
                  typeFilter === 'BULLISH'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                }`}
              >
                🟢 {language === 'tr' ? 'Pozitif (Boğa)' : 'Bullish'}
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 backdrop-blur-xs">
              <tr>
                <th className="px-5 py-3">{language === 'tr' ? 'Varlık' : 'Asset'}</th>
                <th className="px-5 py-3 text-right">{t.orb.gapPercent}</th>
                <th className="px-5 py-3 text-center">{language === 'tr' ? 'Gap Sınıfı' : 'Gap Classification'}</th>
                <th className="px-5 py-3 text-center">{language === 'tr' ? '15dk ORB Durumu' : '15m ORB Status'}</th>
                <th className="px-5 py-3 text-center">{t.orb.bias}</th>
                <th className="px-5 py-3 text-center">{language === 'tr' ? 'Hacim Dalgası' : 'Volume Surge'}</th>
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
                    <td className="px-5 py-4">
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
                          : row.gapType === 'Gap Down'
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
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
                        {row.orbStatus === 'Broke High' ? (language === 'tr' ? 'Zirveyi Kırdı' : row.orbStatus) :
                         row.orbStatus === 'Broke Low' ? (language === 'tr' ? 'Dibi Kırdı' : row.orbStatus) :
                         (language === 'tr' ? 'Aralık İçi' : row.orbStatus)}
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
                        {row.bias === 'Strong Bullish' ? (language === 'tr' ? 'Güçlü Boğa' : row.bias) :
                         row.bias === 'Bullish' ? (language === 'tr' ? 'Pozitif (Boğa)' : row.bias) :
                         row.bias === 'Bearish' ? (language === 'tr' ? 'Negatif (Ayı)' : row.bias) :
                         row.bias}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
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
