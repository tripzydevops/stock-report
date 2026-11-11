'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { MarketCatalyst, PortfolioItem } from '../lib/supabaseClient';
import { TradeSignal } from './TradeCard';
import { DateRangeFilter, isDateInRange } from '../lib/dateFilter';
import { useLanguage } from '../context/LanguageContext';
import Pagination from './Pagination';

interface CatalystFeedViewProps {
  catalysts: MarketCatalyst[];
  portfolio: PortfolioItem[];
  signals: TradeSignal[];
  dateFilter?: DateRangeFilter;
  onSelectTicker?: (symbol: string) => void;
  onNavigateToTab?: (tab: any) => void;
}

export default function CatalystFeedView({
  catalysts,
  portfolio,
  signals,
  dateFilter,
  onSelectTicker,
  onNavigateToTab,
}: CatalystFeedViewProps) {
  const { t, language } = useLanguage();
  const [filter, setFilter] = useState<'ALL' | 'PORTFOLIO' | 'SIGNALS' | 'BUYBACK' | 'DIVIDEND' | 'MACRO'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [semanticMatches, setSemanticMatches] = useState<MarketCatalyst[] | null>(null);
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  const portfolioSymbols = new Set(portfolio.map(p => p.symbol.toUpperCase().replace('.IS', '')));
  const signalSymbols = new Set(signals.map(s => s.symbol.toUpperCase().replace('.IS', '')));

  const isDividendCatalyst = (item: MarketCatalyst) => {
    if (item.category === 'KAP_DIVIDEND') return true;
    const text = `${item.title} ${item.details || ''} ${item.aiTakeaway || ''}`.toLowerCase();
    return /(?:temettü|kar payı|kâr payı|dividend|avans kar)/i.test(text);
  };

  // Category Helpers
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'KAP_BUYBACK':
        return { label: language === 'tr' ? 'Hisse Geri Alımı' : 'Share Buyback', icon: '💎', color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
      case 'KAP_DIVIDEND':
        return { label: language === 'tr' ? 'Temettü Bildirimi' : 'Dividend', icon: '💰', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
      case 'KAP_CONTRACT':
        return { label: language === 'tr' ? 'Yeni İş İlişkisi' : 'New Contract', icon: '📜', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'KAP_EARNINGS':
        return { label: language === 'tr' ? 'Finansal Rapor' : 'Financials & Volume', icon: '📊', color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' };
      case 'MACRO_TCMB':
        return { label: language === 'tr' ? 'Merkez Bankası (TCMB)' : 'Central Bank (TCMB)', icon: '🏛️', color: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' };
      case 'MACRO_FED':
        return { label: language === 'tr' ? 'Fed & Küresel Makro' : 'Fed & Global Macro', icon: '🌐', color: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
      default:
        return { label: language === 'tr' ? 'KAP Bildirimi' : 'Disclosure', icon: '📑', color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700' };
    }
  };

  const getVerdictStyle = (verdict: string) => {
    switch (verdict.toLowerCase()) {
      case 'bullish':
        return { bg: 'bg-emerald-500 text-white', text: language === 'tr' ? '🟢 POZİTİF' : '🟢 BULLISH', ring: 'ring-emerald-500/20' };
      case 'bearish':
        return { bg: 'bg-rose-500 text-white', text: language === 'tr' ? '🔴 NEGATİF' : '🔴 BEARISH', ring: 'ring-rose-500/20' };
      default:
        return { bg: 'bg-amber-500 text-white', text: language === 'tr' ? '🟡 NÖTR' : '🟡 NEUTRAL', ring: 'ring-amber-500/20' };
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const isToday = d.toDateString() === new Date().toDateString();
      const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
      return isToday 
        ? (language === 'tr' ? `Bugün ${timeStr}` : `Today ${timeStr}`) 
        : `${dateStr} ${timeStr}`;
    } catch {
      return iso;
    }
  };

  // Debounced Semantic Search using Supabase pgvector API
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 3) {
      setSemanticMatches(null);
      setIsSearchingSemantic(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearchingSemantic(true);
        const res = await fetch(`/api/catalysts?q=${encodeURIComponent(q)}&limit=40`);
        if (res.ok) {
          const json = await res.json();
          if (json.isSemantic && Array.isArray(json.catalysts) && json.catalysts.length > 0) {
            setSemanticMatches(json.catalysts);
          } else {
            setSemanticMatches(null);
          }
        }
      } catch {
        setSemanticMatches(null);
      } finally {
        setIsSearchingSemantic(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter Logic: uses semantic vector matches if active, otherwise original catalysts
  const sourceCatalysts = semanticMatches !== null ? semanticMatches : catalysts;

  const filteredCatalysts = sourceCatalysts.filter(item => {
    const sym = item.symbol.toUpperCase().replace('.IS', '');
    
    // If not using semantic vector search, do substring match
    if (semanticMatches === null && searchQuery.trim() !== '') {
      const matchesSearch = 
        item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.aiTakeaway.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
    }

    if (dateFilter && !isDateInRange(item.publishedAt, dateFilter)) return false;

    if (filter === 'PORTFOLIO') {
      return portfolioSymbols.has(sym);
    }
    if (filter === 'SIGNALS') {
      return signalSymbols.has(sym);
    }
    if (filter === 'BUYBACK') {
      return item.category === 'KAP_BUYBACK';
    }
    if (filter === 'DIVIDEND') {
      return isDividendCatalyst(item);
    }
    if (filter === 'MACRO') {
      return item.category.startsWith('MACRO');
    }
    return true;
  });

  const portfolioCatalystsCount = catalysts.filter(c => portfolioSymbols.has(c.symbol.toUpperCase().replace('.IS', ''))).length;
  const signalCatalystsCount = catalysts.filter(c => signalSymbols.has(c.symbol.toUpperCase().replace('.IS', ''))).length;
  const buybackCatalystsCount = catalysts.filter(c => c.category === 'KAP_BUYBACK').length;
  const dividendCatalysts = catalysts.filter(isDividendCatalyst);
  const dividendCatalystsCount = dividendCatalysts.length;
  const macroCatalystsCount = catalysts.filter(c => c.category.startsWith('MACRO')).length;

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery, dateFilter]);

  const paginatedCatalysts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCatalysts.slice(start, start + pageSize);
  }, [filteredCatalysts, currentPage, pageSize]);

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-x-hidden">
      {/* Top Banner */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 sm:p-6 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">⚡</span>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              {t.catalysts.title}
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {language === 'tr' ? '%100 Sinyal · Sıfır Gürültü' : '100% Signal · Zero Noise'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t.catalysts.subtitle}
          </p>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-72">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'tr' ? 'KAP ara veya semantik soru sor...' : 'Search disclosures or ask AI...'}
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
            <span className="absolute left-2.5 top-2 text-gray-400 text-xs">
              {isSearchingSemantic ? '⚡' : '🔍'}
            </span>
            {semanticMatches !== null && (
              <span className="absolute right-2 top-1.5 px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                pgvector
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dedicated Temettü Bildirimleri & Dağıtım Takvimi Spotlight Header */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/40 dark:via-amber-900/10 dark:to-transparent rounded-3xl p-5 border border-amber-200 dark:border-amber-800/80 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl shrink-0 shadow-sm">
              💰
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white">
                  {language === 'tr' ? 'Temettü & Kâr Payı Bildirimleri' : 'Dividend & Payout Announcements'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                  {dividendCatalystsCount} {language === 'tr' ? 'Bildirim' : 'Disclosures'}
                </span>
                {filter === 'DIVIDEND' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-600 text-white animate-pulse">
                    {language === 'tr' ? '● FİLTRELENDİ' : '● FILTERED'}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {language === 'tr' 
                  ? 'Borsa İstanbul ve ABD piyasalarında kâr payı dağıtım kararları, hak kullanım tarihleri ve nakit ödeme takvimleri.'
                  : 'Borsa Istanbul and US cash dividend distributions, ex-dividend dates, and payout schedules.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
            <button
              onClick={() => setFilter(filter === 'DIVIDEND' ? 'ALL' : 'DIVIDEND')}
              className={`w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                filter === 'DIVIDEND'
                  ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-500/30'
                  : 'bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
            >
              <span>{filter === 'DIVIDEND' ? '✕' : '💰'}</span>
              <span>{filter === 'DIVIDEND' ? (language === 'tr' ? 'Filtreyi Temizle' : 'Clear Filter') : (language === 'tr' ? 'Temettüleri Filtrele' : 'Filter Dividends')}</span>
            </button>

            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('dividend')}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                title={language === 'tr' ? 'Temettü Nakit Akışı Takvimine Git' : 'Go to Dividend Cashflow Calendar'}
              >
                <span>📅</span>
                <span>{language === 'tr' ? 'Nakit Akış Takvimi' : 'Cashflow View'}</span>
                <span className="text-[10px]">➔</span>
              </button>
            )}
          </div>
        </div>

        {/* Recent Dividend Highlights Ticker Strip (if any available) */}
        {dividendCatalysts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-800/40 w-full max-w-full overflow-hidden">
            <div className="flex items-center gap-2 overflow-x-auto touch-pan-x no-scrollbar py-0.5 w-full min-w-0">
              <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <span>🔔</span>
                <span>{language === 'tr' ? 'Son Kararlar:' : 'Latest:'}</span>
              </span>
              <div className="flex items-center gap-2 min-w-0 shrink-0">
                {dividendCatalysts.slice(0, 4).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onSelectTicker?.(d.symbol)}
                    className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-amber-200 dark:border-amber-700/60 text-xs font-bold text-gray-900 dark:text-white hover:border-amber-400 hover:text-amber-600 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="text-amber-600 dark:text-amber-400 font-black">{d.symbol}</span>
                    <span className="text-[10px] text-gray-500 font-normal truncate max-w-[120px] sm:max-w-[200px]">
                      {d.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Touch-Friendly Horizontal Filter Pills */}
      <div className="w-full max-w-full overflow-hidden">
        <div className="flex items-center space-x-2 overflow-x-auto pb-1.5 touch-pan-x no-scrollbar w-full">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
            filter === 'ALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
          }`}
        >
          {t.catalysts.filterAll} ({catalysts.length})
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
          <span>{t.catalysts.filterPortfolio} ({portfolioCatalystsCount})</span>
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
          <span>{t.catalysts.filterSignals} ({signalCatalystsCount})</span>
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
          <span>{t.catalysts.filterBuyback} ({buybackCatalystsCount})</span>
        </button>

        <button
          onClick={() => setFilter('DIVIDEND')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center space-x-1.5 ${
            filter === 'DIVIDEND'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
          }`}
        >
          <span>💰</span>
          <span>{t.catalysts.filterDividend} ({dividendCatalystsCount})</span>
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
          <span>{t.catalysts.filterMacro} ({macroCatalystsCount})</span>
        </button>
        </div>
      </div>

      {/* Feed List */}
      {filteredCatalysts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-12 text-center border border-gray-200 dark:border-gray-700">
          <span className="text-4xl mb-3 block">📭</span>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{t.catalysts.noCatalystsFound}</h3>
          <p className="text-xs text-gray-500 mt-1">
            {language === 'tr' ? 'Filtreyi "Tümü" olarak değiştirmeyi veya arama kelimesini temizlemeyi deneyin.' : 'Try switching to "All Catalysts" or clearing your search term.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {paginatedCatalysts.map((item) => {
            const cat = getCategoryMeta(item.category);
            const verdict = getVerdictStyle(item.aiVerdict);
            const isPortfolioStock = portfolioSymbols.has(item.symbol.toUpperCase().replace('.IS', ''));
            const isScannedStock = signalSymbols.has(item.symbol.toUpperCase().replace('.IS', ''));

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-gray-800 rounded-3xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all flex flex-col justify-between max-w-full min-w-0 overflow-hidden"
              >
                <div className="min-w-0 max-w-full">
                  {/* Top Bar: Stock Tag, Category, Time */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-750">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onSelectTicker?.(item.symbol)}
                        className="font-black text-base text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center space-x-1"
                        title={language === 'tr' ? "Fiyat ve grafiği görüntüleyin" : "Click to view full price chart & indicators"}
                      >
                        <span>{item.symbol}</span>
                        <span className="text-xs text-blue-500 opacity-60">📈</span>
                      </button>

                      {isPortfolioStock && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          💼 {language === 'tr' ? 'PORTFÖY' : 'PORTFOLIO'}
                        </span>
                      )}

                      {isScannedStock && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          🎯 {language === 'tr' ? 'AKTİF SİNYAL' : 'ACTIVE SETUP'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 flex-wrap">
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
                  <div className="py-3 min-w-0 max-w-full">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug break-words">
                      {item.title}
                    </h3>
                    {item.details && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 line-clamp-2 leading-relaxed break-words">
                        {item.details.replace(/<[^>]*>?/gm, '').trim()}
                      </p>
                    )}
                  </div>
                </div>

                {/* AI 1-Line Synthesis Box */}
                <div className="mt-2 pt-3 border-t border-gray-100 dark:border-gray-750 min-w-0 max-w-full">
                  <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-850/80 border border-gray-200/80 dark:border-gray-700/80 space-y-2 min-w-0 max-w-full">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-xs font-black text-gray-700 dark:text-gray-300 flex items-center space-x-1">
                          <span>🤖</span>
                          <span>{language === 'tr' ? 'Yapay Zeka Özeti:' : 'AI Synthesis:'}</span>
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${verdict.bg}`}>
                          {verdict.text}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 text-[11px] font-bold text-gray-500">
                        <span>⚡ {language === 'tr' ? 'Etki Derecesi:' : 'Catalyst Impact:'}</span>
                        <span className="font-mono text-gray-900 dark:text-white">{item.impactScore}/10</span>
                      </div>
                    </div>

                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-normal break-words">
                      {item.aiTakeaway}
                    </p>
                  </div>

                  {/* Card Bottom Links */}
                  <div className="flex flex-wrap justify-between items-center gap-2 pt-3 text-[11px]">
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 font-semibold"
                      >
                        <span>{language === 'tr' ? 'Resmi KAP Bildirimi' : 'Official KAP Disclosure'}</span>
                        <span>↗</span>
                      </a>
                    ) : (
                      <span className="text-gray-400">{language === 'tr' ? 'Resmi Bildirim' : 'Official Filing'}</span>
                    )}

                    <button
                      onClick={() => onSelectTicker?.(item.symbol)}
                      className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition-colors cursor-pointer"
                    >
                      {language === 'tr' ? 'Fiyat Hareketini İncele →' : 'Inspect Price Action →'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {filteredCatalysts.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredCatalysts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}
    </div>
  );
}
