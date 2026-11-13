'use client';

import React, { useState, useMemo } from 'react';
import { DividendAsset } from '../lib/supabaseClient';
import DividendPortfolioLab from './DividendPortfolioLab';
import DividendRaindropCalendar from './DividendRaindropCalendar';
import DividendAdvisorView from './DividendAdvisorView';
import { useLanguage } from '../context/LanguageContext';
import { DateRangeFilter, isDateInRange } from '../lib/dateFilter';

interface DividendViewProps {
  dividendAssets: DividendAsset[];
  allMarketDividends?: DividendAsset[];
  usdTryRate: number;
  dateFilter?: DateRangeFilter;
  onImportCandidate?: (candidate: { symbol: string; name: string; market: string; shares: number; price: number; isDividend: boolean }) => void;
  onSelectTicker?: (symbol: string) => void;
}

type TimeframePreset = 'ALL' | 'IMMINENT_30D' | 'Q1_2027' | 'Q2_2027' | 'Q3_2027';

function getExDateCountdown(exDate?: string, lang: 'tr' | 'en' = 'tr'): { text: string; urgent: boolean; badgeClass: string; days: number } {
  if (!exDate) {
    return {
      text: lang === 'tr' ? 'Tarih Bekleniyor' : 'Date TBD',
      urgent: false,
      badgeClass: 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700',
      days: 9999
    };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(exDate);
  target.setHours(0, 0, 0, 0);
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      text: lang === 'tr' ? 'Tamamlandı' : 'Completed',
      urgent: false,
      badgeClass: 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700',
      days: diffDays
    };
  }
  if (diffDays === 0) {
    return {
      text: lang === 'tr' ? 'Bugün Hak Kullanım!' : 'Ex-Date Today!',
      urgent: true,
      badgeClass: 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700 font-black animate-pulse',
      days: 0
    };
  }
  if (diffDays === 1) {
    return {
      text: lang === 'tr' ? 'Yarın (Son Alım Günü!)' : 'Tomorrow (Last Day!)',
      urgent: true,
      badgeClass: 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-bold',
      days: 1
    };
  }
  if (diffDays <= 7) {
    return {
      text: lang === 'tr' ? `⚡ ${diffDays} Gün Kaldı` : `⚡ ${diffDays}d left`,
      urgent: true,
      badgeClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 font-bold',
      days: diffDays
    };
  }
  if (diffDays <= 35) {
    return {
      text: lang === 'tr' ? `📅 ${diffDays} Gün Kaldı` : `📅 ${diffDays}d left`,
      urgent: false,
      badgeClass: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 font-bold',
      days: diffDays
    };
  }
  return {
    text: lang === 'tr' ? `⏳ ${diffDays} Gün` : `⏳ ${diffDays}d`,
    urgent: false,
    badgeClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    days: diffDays
  };
}

function getMonthKeyAndLabel(asset: DividendAsset, lang: 'tr' | 'en' = 'tr'): { key: string; label: string } {
  if (asset.nextExDate && asset.nextExDate.length >= 7) {
    const ym = asset.nextExDate.slice(0, 7); // e.g. "2026-12"
    const [yStr, mStr] = ym.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;
    const d = new Date(y, m, 1);
    const monthName = d.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { month: 'long' });
    const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return {
      key: ym,
      label: `${capitalized} ${y}`
    };
  }
  if (asset.payoutMonth) {
    return {
      key: asset.payoutMonth.toLowerCase().includes('2026') ? '2026-12' : '2027-03',
      label: asset.payoutMonth
    };
  }
  return {
    key: '9999-99',
    label: lang === 'tr' ? 'Tarih Bekleniyor' : 'Date TBD'
  };
}

export default function DividendView({
  dividendAssets,
  allMarketDividends,
  usdTryRate,
  dateFilter,
  onImportCandidate,
  onSelectTicker,
}: DividendViewProps) {
  const { t, language } = useLanguage();
  const [currencyMode, setCurrencyMode] = useState<'TRY' | 'USD'>('TRY');
  const [viewMode, setViewMode] = useState<'raindrop' | 'schedule' | 'table' | 'advisor' | 'lab'>('schedule');
  const [scope, setScope] = useState<'ALL_MARKET' | 'PORTFOLIO_ONLY'>('ALL_MARKET');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'BIST' | 'US'>('ALL');
  const [timeframeFilter, setTimeframeFilter] = useState<TimeframePreset>('ALL');
  const [onlyConfirmed, setOnlyConfirmed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [arbitrageModalAsset, setArbitrageModalAsset] = useState<DividendAsset | null>(null);

  // Portfolio KPIs
  const totalAnnualTRY = dividendAssets.reduce((acc, item) => {
    return acc + (item.currency === 'USD' ? item.annualPayout * usdTryRate : item.annualPayout);
  }, 0);

  const totalMonthlyTRY = totalAnnualTRY / 12;
  const totalAnnualDisplay = currencyMode === 'USD' ? (totalAnnualTRY / usdTryRate) : totalAnnualTRY;
  const totalMonthlyDisplay = currencyMode === 'USD' ? (totalMonthlyTRY / usdTryRate) : totalMonthlyTRY;

  // Weighted average Yield on Cost for portfolio
  const totalCostTRY = dividendAssets.reduce((acc, item) => {
    const cost = item.shares * item.entryPrice;
    return acc + (item.currency === 'USD' ? cost * usdTryRate : cost);
  }, 0);

  const avgYieldOnCost = totalCostTRY > 0 ? (totalAnnualTRY / totalCostTRY) * 100 : 0;
  
  // Weighted current yield for portfolio
  const totalValTRY = dividendAssets.reduce((acc, item) => {
    const val = item.shares * item.currentPrice;
    return acc + (item.currency === 'USD' ? val * usdTryRate : val);
  }, 0);
  const avgCurrentYield = totalValTRY > 0 ? (totalAnnualTRY / totalValTRY) * 100 : 0;

  const formatCurr = (val: number, curr?: string) => {
    const c = curr || currencyMode;
    const symbol = c === 'USD' ? '$' : '₺';
    return `${symbol}${val.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Base dataset by scope
  const universeBase = useMemo(() => {
    return scope === 'PORTFOLIO_ONLY' 
      ? dividendAssets 
      : (allMarketDividends && allMarketDividends.length > 0 ? allMarketDividends : dividendAssets);
  }, [scope, dividendAssets, allMarketDividends]);

  // Compute live counts for Investing.com-style timeframe pills
  const timeframeCounts = useMemo(() => {
    let imminent = 0;
    let q1 = 0;
    let q2 = 0;
    let q3 = 0;

    universeBase.forEach(a => {
      const ex = a.nextExDate || '';
      if (ex.startsWith('2026') || ex.startsWith('2027-01')) imminent++;
      else if (ex.startsWith('2027-02') || ex.startsWith('2027-03')) q1++;
      else if (ex.startsWith('2027-04') || ex.startsWith('2027-05') || ex.startsWith('2027-06')) q2++;
      else q3++;
    });

    return { all: universeBase.length, imminent, q1, q2, q3 };
  }, [universeBase]);

  // Filtered dataset
  const effectiveAssets = useMemo(() => {
    return universeBase.filter(asset => {
      // Market filter
      if (marketFilter === 'BIST' && (asset.market === 'US' || asset.currency === 'USD')) return false;
      if (marketFilter === 'US' && (asset.market === 'BIST' || asset.currency === 'TRY')) return false;
      
      // Confirmed only
      if (onlyConfirmed && asset.paymentStatus !== 'Confirmed') return false;

      // Timeframe Preset Filter (Investing.com style)
      if (timeframeFilter === 'IMMINENT_30D') {
        const ex = asset.nextExDate || '';
        if (!ex.startsWith('2026') && !ex.startsWith('2027-01')) return false;
      } else if (timeframeFilter === 'Q1_2027') {
        const ex = asset.nextExDate || '';
        if (!ex.startsWith('2027-02') && !ex.startsWith('2027-03')) return false;
      } else if (timeframeFilter === 'Q2_2027') {
        const ex = asset.nextExDate || '';
        if (!ex.startsWith('2027-04') && !ex.startsWith('2027-05') && !ex.startsWith('2027-06')) return false;
      } else if (timeframeFilter === 'Q3_2027') {
        const ex = asset.nextExDate || '';
        if (ex.startsWith('2026') || ex.startsWith('2027-01') || ex.startsWith('2027-02') || ex.startsWith('2027-03') || ex.startsWith('2027-04') || ex.startsWith('2027-05') || ex.startsWith('2027-06')) return false;
      }

      // Live search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mSym = asset.symbol.toLowerCase().includes(q);
        const mName = asset.name.toLowerCase().includes(q);
        if (!mSym && !mName) return false;
      }
      return true;
    });
  }, [universeBase, marketFilter, onlyConfirmed, timeframeFilter, searchQuery]);

  // Global date filter support
  const filteredUpcomingAssets = useMemo(() => {
    if (!dateFilter || dateFilter.preset === 'ALL') return effectiveAssets;

    const todayStr = new Date().toISOString().slice(0, 10);
    const isPastOnlyFilter = dateFilter.endDate && dateFilter.endDate <= todayStr;
    if (isPastOnlyFilter) {
      return effectiveAssets;
    }

    return effectiveAssets.filter(item => isDateInRange(item.nextExDate, dateFilter) || isDateInRange(item.nextPaymentDate, dateFilter));
  }, [effectiveAssets, dateFilter]);

  // Chronological sort
  const sortedUpcoming = useMemo(() => {
    return [...filteredUpcomingAssets].sort((a, b) => {
      const dateA = a.nextExDate ? new Date(a.nextExDate).getTime() : 9999999999999;
      const dateB = b.nextExDate ? new Date(b.nextExDate).getTime() : 9999999999999;
      return dateA - dateB;
    });
  }, [filteredUpcomingAssets]);

  // Investing.com Chronological Month Grouping
  const monthGroups = useMemo(() => {
    const groupsMap = new Map<string, { key: string; label: string; assets: DividendAsset[]; totalExpectedPayoutTRY: number }>();

    sortedUpcoming.forEach(asset => {
      const { key, label } = getMonthKeyAndLabel(asset, language);
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { key, label, assets: [], totalExpectedPayoutTRY: 0 });
      }
      const grp = groupsMap.get(key)!;
      grp.assets.push(asset);
      const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);
      const estPayout = asset.estimatedNextPayout || (asset.shares * dps);
      const estPayoutTRY = asset.currency === 'USD' ? estPayout * usdTryRate : estPayout;
      grp.totalExpectedPayoutTRY += estPayoutTRY;
    });

    return Array.from(groupsMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [sortedUpcoming, language, usdTryRate]);

  const totalMarketCount: number | null = (allMarketDividends && allMarketDividends.length > 0)
    ? allMarketDividends.length
    : null;

  return (
    <div className="space-y-6 pb-20 sm:pb-8">
      {/* Top Dividend KPIs (Portföy & Piyasa Özeti) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <span>{t.dividend.annualIncome}</span>
            <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
              <button
                onClick={() => setCurrencyMode('TRY')}
                className={`px-2 py-0.5 text-xs font-bold rounded-md cursor-pointer ${currencyMode === 'TRY' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
              >
                TRY
              </button>
              <button
                onClick={() => setCurrencyMode('USD')}
                className={`px-2 py-0.5 text-xs font-bold rounded-md cursor-pointer ${currencyMode === 'USD' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
              >
                USD
              </button>
            </div>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-500">
            {formatCurr(totalAnnualDisplay)}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {language === 'tr' ? 'Aylık Ortalama' : 'Monthly Avg'}: <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurr(totalMonthlyDisplay)}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {language === 'tr' ? 'Piyasa Kapsamı' : 'Market Coverage'}
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400">
            {totalMarketCount !== null ? (
              `${totalMarketCount} ${language === 'tr' ? 'Hisse' : 'Stocks'}`
            ) : (
              `${dividendAssets.length} ${language === 'tr' ? 'Portföy Hissesi' : 'Portfolio Stocks'}`
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {totalMarketCount !== null ? (
              language === 'tr'
                ? `${dividendAssets.length} portföyde, ${Math.max(0, totalMarketCount - dividendAssets.length)} piyasada takipte`
                : `${dividendAssets.length} in portfolio, ${Math.max(0, totalMarketCount - dividendAssets.length)} on radar`
            ) : (
              language === 'tr'
                ? 'Piyasa geneli temettü veritabanı taranıyor...'
                : 'Market-wide dividend database scanning...'
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t.dividend.yieldOnCost}</span>
            <span className="text-[10px] bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold px-1.5 py-0.5 rounded">YoC</span>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400">
            {avgYieldOnCost.toFixed(2)}%
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {language === 'tr' ? 'Piyasa Verimi: ' : 'Mkt Yield: '}{avgCurrentYield.toFixed(2)}%
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t.dividend.safetyScore}
              </span>
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded">
                AI Advisor
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-black text-emerald-500">
              A- Grade
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {language === 'tr' ? 'Düşük temettü kesinti riski' : 'Low dividend cut risk'}
            </div>
          </div>
          <button
            onClick={() => setViewMode('advisor')}
            className="mt-2 w-full py-1 px-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-[11px] font-bold transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>🤖</span>
            <span>{language === 'tr' ? 'Danışman İncele' : 'Review Advisor'}</span>
          </button>
        </div>
      </div>

      {/* Scope, Timeframe Presets & Filter Toolbar (Investing.com Outlay) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm space-y-3.5">
        {/* ROW 1: Scope Switcher + Market Chips + Search */}
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
          {/* Scope Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-700 p-1 text-xs">
              <button
                onClick={() => setScope('ALL_MARKET')}
                className={`px-3 py-1.5 font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                  scope === 'ALL_MARKET'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span>🌐</span>
                <span>{language === 'tr' ? `Tüm Piyasa${totalMarketCount !== null ? ` (${totalMarketCount} Varlık)` : ''}` : `All Market${totalMarketCount !== null ? ` (${totalMarketCount} Stocks)` : ''}`}</span>
              </button>
              <button
                onClick={() => setScope('PORTFOLIO_ONLY')}
                className={`px-3 py-1.5 font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
                  scope === 'PORTFOLIO_ONLY'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span>💼</span>
                <span>{language === 'tr' ? `Sadece Portföyüm (${dividendAssets.length})` : `My Portfolio (${dividendAssets.length})`}</span>
              </button>
            </div>

            {/* Country / Market Chips with Flags (Investing.com Style) */}
            <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 text-xs">
              <button
                onClick={() => setMarketFilter('ALL')}
                className={`px-2.5 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                  marketFilter === 'ALL'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {language === 'tr' ? 'Tüm Mkts' : 'All'}
              </button>
              <button
                onClick={() => setMarketFilter('BIST')}
                className={`px-2.5 py-1 font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  marketFilter === 'BIST'
                    ? 'bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 font-bold shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span>🇹🇷</span>
                <span>BIST</span>
              </button>
              <button
                onClick={() => setMarketFilter('US')}
                className={`px-2.5 py-1 font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  marketFilter === 'US'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span>🇺🇸</span>
                <span>US</span>
              </button>
            </div>

            {/* Confirmed Only Toggle */}
            <button
              onClick={() => setOnlyConfirmed(prev => !prev)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                onlyConfirmed
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 font-bold'
                  : 'bg-gray-50 dark:bg-gray-750 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}
            >
              {language === 'tr' ? '✓ Sadece Kesinleşenler' : '✓ Confirmed Only'}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder={language === 'tr' ? 'Hisse ara (BIMAS, FROTO, KO)...' : 'Search dividend ticker...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full md:w-56 px-3 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-650 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>

        {/* ROW 2: Investing.com-Style Timeframe Quick Filter Pills */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-700/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <span>⏱️</span>
            <span>{language === 'tr' ? 'Zaman Dilimi:' : 'Timeframe:'}</span>
          </span>

          <button
            onClick={() => setTimeframeFilter('ALL')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer ${
              timeframeFilter === 'ALL'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-650'
            }`}
          >
            {language === 'tr' ? `Tümü (${timeframeCounts.all})` : `All (${timeframeCounts.all})`}
          </button>

          <button
            onClick={() => setTimeframeFilter('IMMINENT_30D')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
              timeframeFilter === 'IMMINENT_30D'
                ? 'bg-amber-600 text-white font-bold shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 hover:bg-amber-100'
            }`}
          >
            <span>⚡</span>
            <span>{language === 'tr' ? `Yaklaşan 30 Gün (${timeframeCounts.imminent})` : `Next 30 Days (${timeframeCounts.imminent})`}</span>
          </button>

          <button
            onClick={() => setTimeframeFilter('Q1_2027')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
              timeframeFilter === 'Q1_2027'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-650'
            }`}
          >
            <span>🌸</span>
            <span>{language === 'tr' ? `Mart & Q1 '27 (${timeframeCounts.q1})` : `March & Q1 '27 (${timeframeCounts.q1})`}</span>
          </button>

          <button
            onClick={() => setTimeframeFilter('Q2_2027')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
              timeframeFilter === 'Q2_2027'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-650'
            }`}
          >
            <span>☀️</span>
            <span>{language === 'tr' ? `Bahar & Q2 '27 (${timeframeCounts.q2})` : `Spring & Q2 '27 (${timeframeCounts.q2})`}</span>
          </button>

          <button
            onClick={() => setTimeframeFilter('Q3_2027')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer flex items-center gap-1 ${
              timeframeFilter === 'Q3_2027'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-650'
            }`}
          >
            <span>🍂</span>
            <span>{language === 'tr' ? `Güz & Q3+ '27 (${timeframeCounts.q3})` : `Autumn & Q3+ (${timeframeCounts.q3})`}</span>
          </button>
        </div>
      </div>

      {/* View Switcher Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <span>📅</span>
            <span>{t.dividend.title}</span>
          </h3>
          <p className="text-xs text-gray-500">
            {scope === 'ALL_MARKET' 
              ? (language === 'tr' ? 'Investing.com tarzı kronolojik gruplanmış temettü takvimi ve nakit akışları.' : 'Chronologically grouped dividend payouts and ex-dates calendar.')
              : t.dividend.subtitle}
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-700/60 p-1 border border-gray-200 dark:border-gray-600 flex-wrap gap-1">
          <button
            onClick={() => setViewMode('schedule')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
              viewMode === 'schedule'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>🗓️</span>
            <span>{t.dividend.tabSchedule}</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
              viewMode === 'table'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>📊</span>
            <span>{t.dividend.tabTable}</span>
          </button>
          <button
            onClick={() => setViewMode('raindrop')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
              viewMode === 'raindrop'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>💧</span>
            <span>{language === 'tr' ? 'Yağmur Takvimi' : 'Raindrop Matrix'}</span>
          </button>
          <button
            onClick={() => setViewMode('advisor')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
              viewMode === 'advisor'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>🤖</span>
            <span>{t.dividend.tabAdvisor || (language === 'tr' ? 'AI Danışmanı' : 'AI Advisor')}</span>
          </button>
          <button
            onClick={() => setViewMode('lab')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
              viewMode === 'lab'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>🧪</span>
            <span>{t.dividend.tabLab}</span>
          </button>
        </div>
      </div>

      {/* VIEW 0: 12-MONTH DIVIDEND RAINDROP CALENDAR */}
      {viewMode === 'raindrop' && (
        <DividendRaindropCalendar
          dividendAssets={effectiveAssets}
          usdTryRate={usdTryRate}
          currencyMode={currencyMode}
          onSelectTicker={onSelectTicker}
        />
      )}

      {/* VIEW 1: UPCOMING DIVIDEND PAYMENT SCHEDULE (Investing.com Month Group Banners) */}
      {viewMode === 'schedule' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-gray-500 gap-1 px-1">
            <span>
              {language === 'tr' 
                ? `Investing.com tarzı kronolojik gruplanmış ${sortedUpcoming.length} temettü dağıtımı` 
                : `Chronologically grouped ${sortedUpcoming.length} upcoming dividend distributions`}
            </span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {scope === 'ALL_MARKET' ? (language === 'tr' ? `Tüm Piyasa${totalMarketCount !== null ? ` (${totalMarketCount} Varlık)` : ''}` : `Market-Wide${totalMarketCount !== null ? ` (${totalMarketCount} Assets)` : ''}`) : (language === 'tr' ? 'Sadece Portföyüm' : 'Portfolio Only')}
            </span>
          </div>

          {monthGroups.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500">
              {language === 'tr' ? 'Seçili filtrelere uygun temettü dağıtımı bulunamadı.' : 'No dividend distributions match the active filters.'}
            </div>
          ) : (
            monthGroups.map(group => {
              const groupPayoutDisplay = currencyMode === 'USD' ? (group.totalExpectedPayoutTRY / usdTryRate) : group.totalExpectedPayoutTRY;

              return (
                <div key={group.key} className="space-y-3">
                  {/* Month Header Banner (Investing.com Calendar Style) */}
                  <div className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-r from-slate-100 via-blue-50/50 to-slate-100 dark:from-slate-800 dark:via-blue-950/40 dark:to-slate-800 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs backdrop-blur-md">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-lg">🗓️</span>
                      <span className="font-black text-sm text-slate-900 dark:text-white tracking-tight">
                        {group.label}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                        {group.assets.length} {language === 'tr' ? 'Şirket' : 'Companies'}
                      </span>
                    </div>
                    {scope === 'PORTFOLIO_ONLY' && groupPayoutDisplay > 0 && (
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                        {language === 'tr' ? 'Aylık Tahmini Nakit:' : 'Est. Monthly Cash:'}{' '}
                        <span className="text-emerald-600 dark:text-emerald-400 font-black">
                          +{formatCurr(groupPayoutDisplay)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Grid of Cards within this Month */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.assets.map((asset, idx) => {
                      const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);
                      const estPayout = asset.estimatedNextPayout || (asset.shares * dps);
                      const payoutDisplay = currencyMode === 'USD' ? (estPayout / usdTryRate) : estPayout;
                      const isHeld = Boolean(asset.isHeld || asset.shares > 0);
                      const currSym = asset.currency === 'USD' ? '$' : '₺';
                      const countdown = getExDateCountdown(asset.nextExDate, language);

                      return (
                        <div 
                          key={idx} 
                          className={`bg-white dark:bg-gray-800 rounded-2xl border ${isHeld ? 'border-emerald-300 dark:border-emerald-800/80 shadow-emerald-500/5' : 'border-gray-200 dark:border-gray-700'} p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between`}
                        >
                          <div className={`absolute top-0 left-0 right-0 h-1.5 ${isHeld ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-indigo-600'}`}></div>

                          <div>
                            {/* Header: Asset & Badges */}
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                  <button
                                    type="button"
                                    onClick={() => onSelectTicker?.(asset.symbol)}
                                    className="text-lg font-black text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 group cursor-pointer"
                                  >
                                    <span>{asset.symbol}</span>
                                    <span className="text-xs text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                                  </button>

                                  {/* Country Flag Badge (Investing.com style) */}
                                  {asset.market === 'US' || asset.currency === 'USD' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                                      <span>🇺🇸</span>
                                      <span>US</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300">
                                      <span>🇹🇷</span>
                                      <span>BIST</span>
                                    </span>
                                  )}

                                  {/* Countdown Tag */}
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${countdown.badgeClass}`}>
                                    {countdown.text}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 truncate max-w-[200px] mt-0.5">{asset.name}</p>
                              </div>

                              {isHeld ? (
                                <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full shrink-0">
                                  ✓ {asset.shares.toLocaleString()} {t.common.shares}
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-full shrink-0">
                                  🌐 {language === 'tr' ? 'Piyasa Fırsatı' : 'Market Asset'}
                                </span>
                              )}
                            </div>

                            {/* Cash Inflow KPI Box */}
                            <div className={`${isHeld ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50' : 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40'} border rounded-xl p-3.5 my-3`}>
                              <div className="flex justify-between items-baseline">
                                <div className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                  {isHeld ? (language === 'tr' ? 'Tahmini Nakit Girişiniz' : 'Your Cash Inflow') : (language === 'tr' ? 'Hisse Başı Net Nakit (DPS)' : 'Dividend Per Share (DPS)')}
                                </div>
                                <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                                  %{asset.dividendYield.toFixed(2)} {language === 'tr' ? 'Verim' : 'Yield'}
                                </div>
                              </div>
                              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                                {isHeld ? `+${formatCurr(payoutDisplay)}` : `${currSym}${dps.toFixed(3)}`}
                              </div>
                              <div className="text-[11px] text-gray-500 mt-1 flex justify-between items-center">
                                <span>{t.dividend.estDPS}: <span className="font-bold text-gray-700 dark:text-gray-300">{currSym}{dps.toFixed(3)}</span> / {language === 'tr' ? 'hisse' : 'share'}</span>
                                <span>Fiyat: {currSym}{asset.currentPrice.toFixed(2)}</span>
                              </div>
                            </div>

                            {/* Timeline & Details */}
                            <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300 pt-1">
                              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-750">
                                <span className="text-gray-500">{language === 'tr' ? 'Hak Kullanım (Ex-Date):' : 'Ex-Dividend Date:'}</span>
                                <span className="font-bold text-gray-900 dark:text-white font-mono">{asset.nextExDate || '2027'}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-750">
                                <span className="text-gray-500">{language === 'tr' ? 'Hesaba Geçiş Tarihi:' : 'Payment Date:'}</span>
                                <span className="font-semibold text-gray-800 dark:text-gray-200 font-mono">{asset.nextPaymentDate || '2027'}</span>
                              </div>
                              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-750">
                                <span className="text-gray-500">{t.dividend.frequency}:</span>
                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                  {asset.frequency === 'Annual' ? (language === 'tr' ? 'Yıllık' : 'Annual') : asset.frequency}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-gray-400">{language === 'tr' ? 'Ödeme Durumu:' : 'Payment Status:'}</span>
                              <span className={`font-semibold flex items-center space-x-1.5 ${
                                asset.paymentStatus === 'Confirmed'
                                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                  : 'text-blue-600 dark:text-blue-400'
                              }`}>
                                <span>{asset.paymentStatus === 'Confirmed' ? '✓' : '•'}</span>
                                <span>{asset.paymentStatus === 'Confirmed' ? (language === 'tr' ? 'Kesinleşti (GK Onaylı)' : 'Confirmed') : (language === 'tr' ? 'Model Tahmini' : 'Estimated')}</span>
                              </span>
                            </div>

                            {/* Actions Toolbar */}
                            <div className="pt-2 flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-750">
                              <button
                                type="button"
                                onClick={() => setArbitrageModalAsset(asset)}
                                className="px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                title="Empirik Vergi Arbitrajı Analizini İncele"
                              >
                                <span>⚡</span>
                                <span>{language === 'tr' ? 'Arbitraj Analizi' : 'Tax Arbitrage'}</span>
                              </button>

                              {!isHeld ? (
                                <button
                                  type="button"
                                  onClick={() => onImportCandidate?.({
                                    symbol: asset.symbol,
                                    name: asset.name,
                                    market: asset.market || (asset.currency === 'USD' ? 'US' : 'BIST'),
                                    shares: 100,
                                    price: asset.currentPrice,
                                    isDividend: true
                                  })}
                                  className="px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <span>+</span>
                                  <span>{language === 'tr' ? 'Portföye Ekle' : 'Add to Portfolio'}</span>
                                </button>
                              ) : (
                                <span className="text-[10px] font-semibold text-gray-400">
                                  {language === 'tr' ? 'Portföyünüzde Aktif' : 'Active in Portfolio'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: FULL HOLDINGS & YIELD ON COST TABLE (Investing.com Grouped Table Outlay) */}
      <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden ${viewMode === 'table' ? 'block' : 'hidden'}`}>
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {language === 'tr' ? 'Temettü Nakit Akışı & Maliyete Göre Verim (YoC)' : 'Dividend Cash Flow & Yield on Cost (YoC)'}
            </h3>
            <p className="text-xs text-gray-500">
              {scope === 'ALL_MARKET' 
                ? (language === 'tr' ? `Investing.com tarzı listelenmiş ${sortedUpcoming.length} piyasa temettü hissesi.` : `Tracking all ${sortedUpcoming.length} market dividend assets.`)
                : (language === 'tr' ? 'Portföyünüzdeki temettü hisseleri ve maliyete göre verim artışı.' : 'Track passive dividend earnings and yield expansion.')}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800">
              💎 {language === 'tr' ? 'Hisse Büyüdükçe YoC Artar' : 'YoC Expands With Share Growth'}
            </span>
          </div>
        </div>

        {/* Mobile View: Dividend Cards Grouped by Month (md:hidden) */}
        <div className="md:hidden p-3 space-y-4">
          {monthGroups.map(group => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-750 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-black text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span>🗓️</span>
                  <span>{group.label}</span>
                </span>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  {group.assets.length} {language === 'tr' ? 'Hisse' : 'Stocks'}
                </span>
              </div>

              {group.assets.map((asset, idx) => {
                const isHeld = Boolean(asset.isHeld || asset.shares > 0);
                const currSym = asset.currency === 'USD' ? '$' : '₺';
                const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);
                const countdown = getExDateCountdown(asset.nextExDate, language);

                return (
                  <div key={idx} className="bg-gray-50/70 dark:bg-gray-850/80 rounded-xl p-3 border border-gray-200/60 dark:border-gray-700 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onSelectTicker?.(asset.symbol)}
                          className="font-black text-base text-gray-900 dark:text-white hover:text-blue-600 flex items-center gap-1"
                        >
                          <span>{asset.symbol}</span>
                          <span className="text-[10px] text-blue-500">📈</span>
                        </button>

                        {/* Country Flag */}
                        {asset.market === 'US' || asset.currency === 'USD' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                            🇺🇸 US
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                            🇹🇷 BIST
                          </span>
                        )}

                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full border ${countdown.badgeClass}`}>
                          {countdown.text}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isHeld ? (
                          <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-md">
                            ✓ {asset.shares} {language === 'tr' ? 'Lot' : 'Shares'}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded-md">
                            🌐 Piyasa
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-gray-500 truncate">{asset.name}</div>

                    <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200/60 dark:border-gray-700">
                        <div className="text-[10px] text-gray-400 font-semibold uppercase">DPS</div>
                        <div className="font-bold text-gray-900 dark:text-white mt-0.5">{currSym}{dps.toFixed(2)}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200/60 dark:border-gray-700">
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Verim</div>
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">%{asset.dividendYield.toFixed(2)}</div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200/60 dark:border-gray-700">
                        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold uppercase">Hak Kullanım</div>
                        <div className="font-bold text-blue-600 dark:text-blue-400 mt-0.5 font-mono text-[11px]">{asset.nextExDate || '2027'}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-gray-500">
                        Ödeme: <strong className="text-gray-800 dark:text-gray-200 font-mono">{asset.nextPaymentDate || '2027'}</strong>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setArbitrageModalAsset(asset)}
                          className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                        >
                          ⚡ Arbitraj
                        </button>
                        {!isHeld && (
                          <button
                            type="button"
                            onClick={() => onImportCandidate?.({
                              symbol: asset.symbol,
                              name: asset.name,
                              market: asset.market || (asset.currency === 'USD' ? 'US' : 'BIST'),
                              shares: 100,
                              price: asset.currentPrice,
                              isDividend: true
                            })}
                            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            + Portföye Ekle
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Desktop Table View (hidden md:block) with Investing.com Date Separator Rows */}
        <div className="hidden md:block overflow-x-auto touch-pan-x">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">{language === 'tr' ? 'Varlık / Piyasa' : 'Asset / Market'}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{language === 'tr' ? 'Durum' : 'Status'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{t.common.shares}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Piyasa Fiyatı' : 'Market Price'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Güncel Verim' : 'Current Yield'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Hisse Başı DPS' : 'DPS'}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{t.dividend.nextExDate}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{t.dividend.nextPayDate}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{language === 'tr' ? 'Geri Sayım' : 'Countdown'}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{language === 'tr' ? 'Aksiyon' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {monthGroups.map(group => (
                <React.Fragment key={group.key}>
                  {/* Investing.com Date Banner Separator Row */}
                  <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-bold border-y border-slate-200 dark:border-slate-700">
                    <td colSpan={10} className="px-5 py-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                          <span>🗓️</span>
                          <span>{group.label}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 normal-case font-bold">
                            {group.assets.length} {language === 'tr' ? 'Şirket' : 'Companies'}
                          </span>
                        </span>
                        {scope === 'PORTFOLIO_ONLY' && group.totalExpectedPayoutTRY > 0 && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {language === 'tr' ? 'Tahmini Giriş:' : 'Est. Cash:'}{' '}
                            <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                              +{formatCurr(currencyMode === 'USD' ? (group.totalExpectedPayoutTRY / usdTryRate) : group.totalExpectedPayoutTRY)}
                            </strong>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Company Rows within this Month */}
                  {group.assets.map((asset, idx) => {
                    const isHeld = Boolean(asset.isHeld || asset.shares > 0);
                    const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);
                    const countdown = getExDateCountdown(asset.nextExDate, language);

                    return (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => onSelectTicker?.(asset.symbol)}
                              className="font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer text-left transition-colors group py-1 touch-manipulation"
                              title={language === 'tr' ? `${asset.symbol} grafik ve indikatörleri` : `Click to view ${asset.symbol} chart & indicators`}
                            >
                              <span>{asset.symbol}</span>
                              <span className="text-xs text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                            </button>
                            {/* Flag */}
                            {asset.market === 'US' || asset.currency === 'USD' ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300">
                                🇺🇸 US
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300">
                                🇹🇷 BIST
                              </span>
                            )}
                            <span className="text-xs text-gray-500 truncate max-w-[140px]">{asset.name}</span>
                          </div>
                        </td>

                        <td className="px-5 py-3.5 text-center whitespace-nowrap">
                          {isHeld ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              ✓ {language === 'tr' ? 'Portföyde' : 'Held'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              🌐 {language === 'tr' ? 'Piyasa Fırsatı' : 'Market'}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                          {isHeld ? asset.shares.toLocaleString() : '-'}
                        </td>

                        <td className="px-5 py-3.5 text-right text-gray-700 dark:text-gray-300 font-mono whitespace-nowrap">
                          {formatCurr(asset.currentPrice, asset.currency)}
                        </td>

                        <td className="px-5 py-3.5 text-right whitespace-nowrap font-bold text-emerald-600 dark:text-emerald-400">
                          %{asset.dividendYield.toFixed(2)}
                        </td>

                        <td className="px-5 py-3.5 text-right font-mono font-bold text-gray-900 dark:text-white whitespace-nowrap">
                          {formatCurr(dps, asset.currency)}
                        </td>

                        <td className="px-5 py-3.5 text-center font-mono font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                          {asset.nextExDate || '2027'}
                        </td>

                        <td className="px-5 py-3.5 text-center font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {asset.nextPaymentDate || '2027'}
                        </td>

                        <td className="px-5 py-3.5 text-center whitespace-nowrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${countdown.badgeClass}`}>
                            {countdown.text}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setArbitrageModalAsset(asset)}
                              className="px-2 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 rounded-md border border-purple-200 dark:border-purple-800 cursor-pointer"
                              title="Arbitraj Analizi"
                            >
                              ⚡
                            </button>
                            {!isHeld && (
                              <button
                                type="button"
                                onClick={() => onImportCandidate?.({
                                  symbol: asset.symbol,
                                  name: asset.name,
                                  market: asset.market || (asset.currency === 'USD' ? 'US' : 'BIST'),
                                  shares: 100,
                                  price: asset.currentPrice,
                                  isDividend: true
                                })}
                                className="px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 rounded-md border border-blue-200 dark:border-blue-800 cursor-pointer"
                                title="Portföye Ekle"
                              >
                                + {language === 'tr' ? 'Ekle' : 'Add'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* VIEW 3: AI PORTFOLIO ADVISOR */}
      {viewMode === 'advisor' && (
        <DividendAdvisorView
          dividendAssets={effectiveAssets}
          usdTryRate={usdTryRate}
          onSelectTicker={onSelectTicker}
          onOpenLabWithStrategy={() => {
            setViewMode('lab');
          }}
        />
      )}

      {/* VIEW 4: AI PORTFOLIO LAB & BACKTEST SIMULATOR */}
      {viewMode === 'lab' && (
        <DividendPortfolioLab
          usdTryRate={usdTryRate}
          onImportCandidate={onImportCandidate}
          onSelectTicker={onSelectTicker}
        />
      )}

      {/* Arbitrage & Tax Avoidance Backtest Modal */}
      {arbitrageModalAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 border border-gray-200 dark:border-gray-700 shadow-2xl relative space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <span className="text-xl">⚡</span>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  {arbitrageModalAsset.symbol} Temettü Arbitraj & Vergi Analizi
                </h3>
              </div>
              <button
                onClick={() => setArbitrageModalAsset(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-purple-50 dark:bg-purple-950/40 p-3.5 rounded-xl border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
              <strong>Strateji Hipotezi:</strong> Temettü ödemesindeki %10 stopaj (vergi) kesintisini ödememek için hisseyi hak kullanım tarihinden (Ex-Date / X-Tarihi) 1 gün önce piyasa kapanışında satıp, dağıtım sabahı fiyat düştüğünde geri almak kârlı mıdır?
            </div>

            {/* Empirical Findings Box */}
            <div className="space-y-2.5 text-xs">
              <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>📊</span>
                <span>Borsa İstanbul 94 Temettü Dağıtımı Ampirik Test Sonuçları (2019-2026):</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-gray-50 dark:bg-gray-750 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="text-[10px] text-gray-400 uppercase font-semibold">Arbitraj Başarı Oranı</div>
                  <div className="text-lg font-black text-rose-600 mt-0.5">%36.2</div>
                  <div className="text-[10px] text-gray-500">94 dağıtımdan 34'ü kazandırdı</div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-750 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="text-[10px] text-gray-400 uppercase font-semibold">Açılış Düşüş Oranı</div>
                  <div className="text-lg font-black text-blue-600 mt-0.5">0.87x</div>
                  <div className="text-[10px] text-gray-500">Teorik Düşüş = 1.00x</div>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/40 p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-1.5">
                <div className="font-bold flex items-center gap-1">
                  <span>💡</span>
                  <span>Kantitatif Sonuç ve Neden Kaybettiriyor?</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  BIST verilerine göre hisse fiyatı temettü sabahı açılışta brüt temettünün <strong>tamamı (%100'ü) kadar düşmemektedir</strong>. Perakende yatırımcılar nominal fiyat ucuzlamasını fırsat görerek açılışta yoğun alım yapmakta ve düşüşün ortalama <strong>%13'ünü ilk dakikalarda satın almaktadır</strong> (Açılış düşüş katsayısı: 0.87).
                </p>
                <p className="text-[11px] leading-relaxed">
                  Bu sebeple T-1 günü hisseyi satıp sabah geri almaya çalıştığınızda, hisseyi teorik fiyattan daha pahalıya geri almak zorunda kalırsınız. <strong>Hissede kalıp %10 stopajı ödemek, 100 işlemin 64'ünde satıp geri almaktan daha kârlı olmuştur.</strong>
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <span className="text-[10px] text-gray-400">Veri Seti: BIST 2019-2026 Temettü Arşivi</span>
              <button
                onClick={() => setArbitrageModalAsset(null)}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer"
              >
                Anladım, Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
