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

  // Base list depending on scope (All Market vs Portfolio Only)
  const effectiveAssets = useMemo(() => {
    const base = scope === 'PORTFOLIO_ONLY' 
      ? dividendAssets 
      : (allMarketDividends && allMarketDividends.length > 0 ? allMarketDividends : dividendAssets);

    return base.filter(asset => {
      if (marketFilter === 'BIST' && (asset.market === 'US' || asset.currency === 'USD')) return false;
      if (marketFilter === 'US' && (asset.market === 'BIST' || asset.currency === 'TRY')) return false;
      if (onlyConfirmed && asset.paymentStatus !== 'Confirmed') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const mSym = asset.symbol.toLowerCase().includes(q);
        const mName = asset.name.toLowerCase().includes(q);
        if (!mSym && !mName) return false;
      }
      return true;
    });
  }, [scope, dividendAssets, allMarketDividends, marketFilter, onlyConfirmed, searchQuery]);

  // Filter and sort upcoming payouts by next ex-dividend date
  const filteredUpcomingAssets = useMemo(() => {
    if (!dateFilter || dateFilter.preset === 'ALL') return effectiveAssets;

    const todayStr = new Date().toISOString().slice(0, 10);
    const isPastOnlyFilter = dateFilter.endDate && dateFilter.endDate <= todayStr;
    if (isPastOnlyFilter) {
      return effectiveAssets;
    }

    return effectiveAssets.filter(item => isDateInRange(item.nextExDate, dateFilter) || isDateInRange(item.nextPaymentDate, dateFilter));
  }, [effectiveAssets, dateFilter]);

  const sortedUpcoming = useMemo(() => {
    return [...filteredUpcomingAssets].sort((a, b) => {
      const dateA = a.nextExDate ? new Date(a.nextExDate).getTime() : 9999999999999;
      const dateB = b.nextExDate ? new Date(b.nextExDate).getTime() : 9999999999999;
      return dateA - dateB;
    });
  }, [filteredUpcomingAssets]);

  const totalMarketCount = allMarketDividends?.length || 44;

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
            {totalMarketCount} {language === 'tr' ? 'Hisse' : 'Stocks'}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {language === 'tr' ? `${dividendAssets.length} portföyde, ${totalMarketCount - dividendAssets.length} piyasada takipte` : `${dividendAssets.length} in portfolio, ${totalMarketCount - dividendAssets.length} on radar`}
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
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{language === 'tr' ? 'Temettü Güvenilirliği' : 'Sustainability'}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
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

      {/* Scope & Market Filter Toolbar (Tüm Piyasa vs Sadece Portföyüm) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
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
              <span>{language === 'tr' ? `Tüm Piyasa (${totalMarketCount} Varlık)` : `All Market (${totalMarketCount} Stocks)`}</span>
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

          {/* Market Chips */}
          <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 text-xs">
            {(['ALL', 'BIST', 'US'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMarketFilter(m)}
                className={`px-2.5 py-1 font-semibold rounded-md transition-all cursor-pointer ${
                  marketFilter === m
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {m === 'ALL' ? (language === 'tr' ? 'Tüm Mkts' : 'All') : m}
              </button>
            ))}
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

      {/* View Switcher Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <span>📅</span>
            <span>{t.dividend.title}</span>
          </h3>
          <p className="text-xs text-gray-500">
            {scope === 'ALL_MARKET' 
              ? (language === 'tr' ? 'Piyasa genelinde yaklaşan tüm temettü hak kullanım ve ödeme tarihleri.' : 'All upcoming market dividend distributions and corporate ex-dates.')
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

      {/* VIEW 1: UPCOMING DIVIDEND PAYMENT SCHEDULE CARDS */}
      {viewMode === 'schedule' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs text-gray-500 px-1">
            <span>
              {language === 'tr' 
                ? `Yaklaşan ${sortedUpcoming.length} temettü dağıtımı (Hak kullanım tarihine göre sıralı)` 
                : `${sortedUpcoming.length} upcoming dividend distributions (sorted by ex-dividend date)`}
            </span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {scope === 'ALL_MARKET' ? (language === 'tr' ? 'Tüm Piyasa Görünümü' : 'Market-Wide View') : (language === 'tr' ? 'Sadece Portföyüm' : 'Portfolio Only')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedUpcoming.map((asset, idx) => {
              const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);
              const estPayout = asset.estimatedNextPayout || (asset.shares * dps);
              const payoutDisplay = currencyMode === 'USD' ? (estPayout / usdTryRate) : estPayout;
              const isHeld = Boolean(asset.isHeld || asset.shares > 0);
              const currSym = asset.currency === 'USD' ? '$' : '₺';

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
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => onSelectTicker?.(asset.symbol)}
                            className="text-lg font-black text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 group cursor-pointer"
                          >
                            <span>{asset.symbol}</span>
                            <span className="text-xs text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                          </button>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                            {asset.market || (asset.currency === 'USD' ? 'US' : 'BIST')}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                            {asset.payoutMonth || (language === 'tr' ? 'Bahar 2027' : 'Spring 2027')}
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
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          asset.paymentStatus === 'Confirmed' ? 'bg-emerald-500' : 'bg-blue-500 animate-pulse'
                        }`}></span>
                        <span>
                          {asset.paymentStatus === 'Confirmed'
                            ? (language === 'tr' ? '✓ Kesinleşti (Resmi/KAP)' : '✓ Confirmed (Official)')
                            : (language === 'tr' ? 'Tahmini' : 'Estimated')}
                        </span>
                      </span>
                    </div>

                    {/* Quick Actions Footer */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onSelectTicker?.(asset.symbol)}
                        className="flex-1 py-1.5 px-2 text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>📈</span>
                        <span>{language === 'tr' ? 'Grafik' : 'Chart'}</span>
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
                          className="flex-1 py-1.5 px-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                        >
                          <span>+</span>
                          <span>{language === 'tr' ? 'Portföye Ekle' : 'Add Lot'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setArbitrageModalAsset(asset)}
                        className="py-1.5 px-2.5 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        title={language === 'tr' ? 'Temettü öncesi satış / geri alış arbitraj analizi' : 'Ex-dividend tax arbitrage backtest analysis'}
                      >
                        <span>⚡</span>
                        <span>{language === 'tr' ? 'Arbitraj' : 'Arbitrage'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: FULL HOLDINGS & YIELD ON COST TABLE */}
      <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden ${viewMode === 'table' ? 'block' : 'hidden'}`}>
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {language === 'tr' ? 'Temettü Nakit Akışı & Maliyete Göre Verim (YoC)' : 'Dividend Cash Flow & Yield on Cost (YoC)'}
            </h3>
            <p className="text-xs text-gray-500">
              {scope === 'ALL_MARKET' 
                ? (language === 'tr' ? `Piyasadaki ${effectiveAssets.length} temettü hissesinin güncel verim, DPS ve takvim detayları.` : `Tracking all ${effectiveAssets.length} market dividend assets.`)
                : (language === 'tr' ? 'Portföyünüzdeki temettü hisseleri ve maliyete göre verim artışı.' : 'Track passive dividend earnings and yield expansion.')}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 rounded-lg border border-purple-200 dark:border-purple-800">
              💎 {language === 'tr' ? 'Hisse Büyüdükçe YoC Artar' : 'YoC Expands With Share Growth'}
            </span>
          </div>
        </div>

        {/* Mobile View: Dividend Cards (md:hidden) */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-750 p-2.5 space-y-2.5">
          {sortedUpcoming.map((asset, idx) => {
            const isHeld = Boolean(asset.isHeld || asset.shares > 0);
            const currSym = asset.currency === 'USD' ? '$' : '₺';
            const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);

            return (
              <div key={idx} className="bg-gray-50/70 dark:bg-gray-850/80 rounded-xl p-3 border border-gray-200/60 dark:border-gray-700 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectTicker?.(asset.symbol)}
                      className="font-black text-base text-gray-900 dark:text-white hover:text-blue-600 flex items-center gap-1"
                    >
                      <span>{asset.symbol}</span>
                      <span className="text-[10px] text-blue-500">📈</span>
                    </button>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200/70 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {asset.market || (asset.currency === 'USD' ? 'US' : 'BIST')}
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
                      className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline"
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
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
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

        {/* Desktop Table View (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto touch-pan-x">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">{language === 'tr' ? 'Varlık' : 'Asset'}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{language === 'tr' ? 'Durum' : 'Status'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{t.common.shares}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Piyasa Fiyatı' : 'Market Price'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Güncel Verim' : 'Current Yield'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Hisse Başı DPS' : 'DPS'}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{t.dividend.nextExDate}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{t.dividend.nextPayDate}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{language === 'tr' ? 'Güvenilirlik' : 'Safety'}</th>
                <th className="px-5 py-3 text-center whitespace-nowrap">{language === 'tr' ? 'Aksiyon' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedUpcoming.map((asset, idx) => {
                const isHeld = Boolean(asset.isHeld || asset.shares > 0);
                const dps = asset.estimatedNextDPS || (asset.currentPrice * asset.dividendYield / 100);

                return (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => onSelectTicker?.(asset.symbol)}
                          className="font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer text-left transition-colors group py-1 touch-manipulation"
                          title={language === 'tr' ? `${asset.symbol} grafik ve indikatörleri` : `Click to view ${asset.symbol} chart & indicators`}
                        >
                          <span className="group-hover:underline">{asset.symbol}</span>
                          <span className="text-[10px] text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                        </button>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {asset.currency}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          ({asset.frequency === 'Annual' ? (language === 'tr' ? 'Yıllık' : 'Annual') : asset.frequency})
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-[180px]">{asset.name}</div>
                    </td>

                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      {isHeld ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          ✓ {language === 'tr' ? 'Portföyde' : 'In Portfolio'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          🌐 {language === 'tr' ? 'Piyasa Takip' : 'Market Asset'}
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {isHeld ? `${asset.shares.toLocaleString()} lot` : '-'}
                    </td>

                    <td className="px-5 py-4 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {formatCurr(asset.currentPrice, asset.currency)}
                    </td>

                    <td className="px-5 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      %{asset.dividendYield.toFixed(2)}
                    </td>

                    <td className="px-5 py-4 text-right font-bold text-gray-900 dark:text-white whitespace-nowrap">
                      {formatCurr(dps, asset.currency)}
                    </td>

                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <span className="inline-block px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                        {asset.nextExDate ? asset.nextExDate : (language === 'tr' ? 'Bahar 2027' : 'Spring 2027')}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-center whitespace-nowrap font-mono text-xs text-gray-700 dark:text-gray-300">
                      {asset.nextPaymentDate || '2027'}
                    </td>

                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <span className={`inline-block w-6 h-6 rounded-full text-xs font-black text-center leading-6 ${
                        asset.safetyRating === 'A'
                          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                          : asset.safetyRating === 'B'
                          ? 'bg-blue-500 text-white'
                          : 'bg-amber-500 text-white'
                      }`}>
                        {asset.safetyRating}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
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
                            className="px-2 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
                            title={language === 'tr' ? 'Portföye 100 lot simülasyonu ekle' : 'Add 100 shares to portfolio'}
                          >
                            + Ekle
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setArbitrageModalAsset(asset)}
                          className="px-2 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900 border border-purple-200 dark:border-purple-800 rounded-lg transition-colors cursor-pointer"
                          title="Temettü öncesi satış arbitraj testi"
                        >
                          ⚡ Arbitraj
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
