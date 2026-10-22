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
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [isCustomOpen, setIsCustomOpen] = useState(currentFilter.preset === 'CUSTOM');
  const [customStart, setCustomStart] = useState<string>(currentFilter.startDate || '');
  const [customEnd, setCustomEnd] = useState<string>(currentFilter.endDate || '');

  const presets: { id: DateFilterPreset; icon: string; labelTr: string; labelEn: string; shortTr: string; shortEn: string }[] = [
    { id: 'ALL', icon: '🌐', labelTr: 'Tüm Zamanlar', labelEn: 'All Time', shortTr: 'Tümü', shortEn: 'All' },
    { id: 'TODAY', icon: '🔥', labelTr: 'Bugün', labelEn: 'Today', shortTr: 'Bugün', shortEn: 'Today' },
    { id: '7D', icon: '⚡', labelTr: 'Son 7 Gün', labelEn: 'Last 7 Days', shortTr: '7 Gün', shortEn: '7 Days' },
    { id: '30D', icon: '📊', labelTr: 'Son 30 Gün', labelEn: 'Last 30 Days', shortTr: '30 Gün', shortEn: '30 Days' },
    { id: 'THIS_MONTH', icon: '🗓️', labelTr: 'Bu Ay', labelEn: 'This Month', shortTr: 'Bu Ay', shortEn: 'Month' },
    { id: 'CUSTOM', icon: '⚙️', labelTr: 'Özel Aralık', labelEn: 'Custom', shortTr: 'Özel', shortEn: 'Custom' },
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
    <div className={`bg-white/80 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-2.5 sm:p-3.5 shadow-sm space-y-2.5 transition-all ${className}`}>
      {/* Top Header Row with Active Filter Label */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs shadow-xs shrink-0">
            📅
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-gray-900 dark:text-white tracking-tight uppercase">
                {label || (language === 'tr' ? 'Tarih Filtresi' : 'Date Filter')}
              </span>
              {isActive && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800 animate-pulse">
                  {language === 'tr' ? 'Aktif' : 'Active'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 font-medium">
              {formatFilterDisplay(currentFilter, language)}
              {filteredCount !== undefined && totalCount !== undefined && (
                <span className="ml-1 text-gray-400">
                  ({filteredCount}/{totalCount})
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isActive && (
            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1 shadow-xs"
              title={language === 'tr' ? 'Filtreyi Sıfırla' : 'Reset Filter'}
            >
              <span>✕</span>
              <span className="text-[10px] hidden sm:inline">{language === 'tr' ? 'Sıfırla' : 'Reset'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsMobileExpanded(!isMobileExpanded)}
            className="md:hidden px-2.5 py-1 rounded-xl text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>{isMobileExpanded ? '▲' : '▼'}</span>
            <span>{isMobileExpanded ? (language === 'tr' ? 'Kapat' : 'Hide') : (language === 'tr' ? 'Filtrele' : 'Filter')}</span>
          </button>
        </div>
      </div>

      {/* MOBILE ONLY VIEW (< 768px): Expandable 4-Button Grid + Dropdown */}
      {(isMobileExpanded || isCustomOpen) && (
        <div className="md:hidden space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          {/* 4 Primary Touch Chips (No Scrolling Required!) */}
          <div className="grid grid-cols-4 gap-1.5">
            {presets.slice(0, 4).map(p => {
              const isSelected = currentFilter.preset === p.id && !isCustomOpen;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    handleSelectPreset(p.id);
                    setIsMobileExpanded(false);
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-2 ring-blue-400/40'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700/60'
                  }`}
                >
                  <span className="text-sm leading-none mb-0.5">{p.icon}</span>
                  <span className="text-[10px] tracking-tight truncate w-full text-center">
                    {language === 'tr' ? p.shortTr : p.shortEn}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Mobile Dropdown for All Choices including Custom & This Month */}
          <div className="flex items-center gap-2 pt-1">
            <label className="text-[11px] font-bold text-slate-500 shrink-0">
              {language === 'tr' ? 'Daha Fazla:' : 'More:'}
            </label>
            <select
              value={isCustomOpen ? 'CUSTOM' : currentFilter.preset}
              onChange={(e) => {
                const val = e.target.value as DateFilterPreset;
                handleSelectPreset(val);
                if (val !== 'CUSTOM') setIsMobileExpanded(false);
              }}
              className="flex-1 text-xs font-bold py-1.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/90 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {presets.map(p => (
                <option key={p.id} value={p.id}>
                  {p.icon} {language === 'tr' ? p.labelTr : p.labelEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* DESKTOP VIEW (>= 768px): Horizontal Presets Strip */}
      <div className="hidden md:flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar touch-pan-x -mx-1 px-1">
        {presets.map(p => {
          const isSelected = currentFilter.preset === p.id || (p.id === 'CUSTOM' && isCustomOpen);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectPreset(p.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-2 ring-blue-400/40'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700/60'
              }`}
            >
              <span>{p.icon}</span>
              <span>{language === 'tr' ? p.labelTr : p.labelEn}</span>
            </button>
          );
        })}
      </div>

      {/* Expandable Custom Date Range Selector (Both Mobile & Desktop) */}
      {isCustomOpen && (
        <form onSubmit={handleApplyCustom} className="pt-2.5 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-2.5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full sm:w-auto">
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              {language === 'tr' ? 'Başlangıç Tarihi:' : 'Start Date:'}
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer w-full sm:w-auto"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full sm:w-auto">
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              {language === 'tr' ? 'Bitiş Tarihi:' : 'End Date:'}
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-mono font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer w-full sm:w-auto"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto pt-1 sm:pt-0">
            <button
              type="submit"
              className="flex-1 sm:flex-initial px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xs transition-all cursor-pointer text-center"
            >
              ✓ {language === 'tr' ? 'Tarih Aralığını Uygula' : 'Apply Range'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-gray-800 transition-colors cursor-pointer"
            >
              {language === 'tr' ? 'Vazgeç' : 'Cancel'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
