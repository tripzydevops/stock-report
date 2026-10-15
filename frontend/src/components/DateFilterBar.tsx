'use client';

import React, { useState } from 'react';
import { DateFilterPreset, DateRangeFilter, getDateRangeFromPreset, formatFilterDisplay } from '../lib/dateFilter';
import { useLanguage } from '../context/LanguageContext';

interface DateFilterBarProps {
  currentFilter: DateRangeFilter;
  onChange: (newFilter: DateRangeFilter) => void;
  filteredCount?: number;
  totalCount?: number;
  label?: string;
  className?: string;
}

export default function DateFilterBar({
  currentFilter,
  onChange,
  filteredCount,
  totalCount,
  label,
  className = '',
}: DateFilterBarProps) {
  const { language } = useLanguage();
  const [isCustomOpen, setIsCustomOpen] = useState(currentFilter.preset === 'CUSTOM');
  const [customStart, setCustomStart] = useState<string>(currentFilter.startDate || '');
  const [customEnd, setCustomEnd] = useState<string>(currentFilter.endDate || '');

  const presets: { id: DateFilterPreset; icon: string; labelTr: string; labelEn: string }[] = [
    { id: 'ALL', icon: '🌐', labelTr: 'Tüm Zamanlar', labelEn: 'All Time' },
    { id: 'TODAY', icon: '🔥', labelTr: 'Bugün', labelEn: 'Today' },
    { id: '7D', icon: '⚡', labelTr: 'Son 7 Gün', labelEn: 'Last 7 Days' },
    { id: '30D', icon: '📊', labelTr: 'Son 30 Gün', labelEn: 'Last 30 Days' },
    { id: 'THIS_MONTH', icon: '🗓️', labelTr: 'Bu Ay', labelEn: 'This Month' },
    { id: 'CUSTOM', icon: '⚙️', labelTr: 'Özel Aralık', labelEn: 'Custom' },
  ];

  const handleSelectPreset = (preset: DateFilterPreset) => {
    if (preset === 'CUSTOM') {
      setIsCustomOpen(true);
      return;
    }
    setIsCustomOpen(false);
    const newRange = getDateRangeFromPreset(preset);
    onChange(newRange);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart && !customEnd) return;
    const newRange: DateRangeFilter = {
      preset: 'CUSTOM',
      startDate: customStart || null,
      endDate: customEnd || null,
    };
    onChange(newRange);
  };

  const handleReset = () => {
    setIsCustomOpen(false);
    setCustomStart('');
    setCustomEnd('');
    onChange(getDateRangeFromPreset('ALL'));
  };

  const isActive = currentFilter.preset !== 'ALL';

  return (
    <div className={`bg-white dark:bg-gray-850/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-gray-800 p-3 sm:p-4 shadow-sm space-y-3 transition-all ${className}`}>
      {/* Top Header Row with Presets */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm shadow-xs">
            📅
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-gray-900 dark:text-white tracking-tight uppercase">
                {label || (language === 'tr' ? 'Tarih Filtresi' : 'Date Filter')}
              </span>
              {isActive && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800 animate-pulse">
                  {language === 'tr' ? 'Filtre Aktif' : 'Filtered'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              {formatFilterDisplay(currentFilter, language)}
              {filteredCount !== undefined && totalCount !== undefined && (
                <span className="ml-1 text-gray-400">
                  ({filteredCount}/{totalCount} {language === 'tr' ? 'öğe' : 'items'})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Quick Presets Horizontal Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar touch-pan-x -mx-1 px-1">
          {presets.map(p => {
            const isSelected = currentFilter.preset === p.id || (p.id === 'CUSTOM' && isCustomOpen);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-2 ring-blue-400/40'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent'
                }`}
              >
                <span>{p.icon}</span>
                <span>{language === 'tr' ? p.labelTr : p.labelEn}</span>
              </button>
            );
          })}

          {isActive && (
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 transition-colors whitespace-nowrap cursor-pointer ml-1"
              title={language === 'tr' ? 'Filtreyi Sıfırla' : 'Reset Filter'}
            >
              ✕ {language === 'tr' ? 'Sıfırla' : 'Reset'}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Custom Date Range Selector */}
      {isCustomOpen && (
        <form onSubmit={handleApplyCustom} className="pt-2.5 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-2.5 animate-in fade-in duration-200">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              {language === 'tr' ? 'Başlangıç:' : 'From:'}
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              {language === 'tr' ? 'Bitiş:' : 'To:'}
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              className="px-3 py-1 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors cursor-pointer"
            >
              ✓ {language === 'tr' ? 'Uygula' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 transition-colors cursor-pointer"
            >
              {language === 'tr' ? 'Vazgeç' : 'Cancel'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
