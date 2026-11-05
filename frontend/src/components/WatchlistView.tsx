'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

export interface WatchlistItemData {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  assetClass: 'stock' | 'etf' | 'fund' | string;
  market: 'BIST' | 'US' | 'TEFAS' | string;
  currency: 'TRY' | 'USD' | string;
  sector?: string;
  notes?: string;
  alertAbove?: number | null;
  alertBelow?: number | null;
  addedAt: string;
  latestPrice: number;
  openPrice: number;
  dailyChangePercent: number;
  high52w?: number | null;
  low52w?: number | null;
  volume?: number | null;
  rsi14?: number | null;
}

export interface CatalogAsset {
  id: string;
  symbol: string;
  name: string;
  market: string;
  assetClass: string;
  currency: string;
  sector: string;
  isWatched: boolean;
}

interface WatchlistViewProps {
  onAddToPortfolio?: (asset: { symbol: string; name: string; market: string; currentPrice: number; currency: string }) => void;
}

export default function WatchlistView({ onAddToPortfolio }: WatchlistViewProps) {
  const { language } = useLanguage();
  const [items, setItems] = useState<WatchlistItemData[]>([]);
  const [catalog, setCatalog] = useState<CatalogAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'BIST' | 'US' | 'TEFAS' | 'ALERTS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [sortField, setSortField] = useState<'symbol' | 'change' | 'price' | 'date'>('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Modals & Forms
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [selectedAssetForAdd, setSelectedAssetForAdd] = useState<CatalogAsset | null>(null);
  const [addNotes, setAddNotes] = useState('');
  const [addAlertAbove, setAddAlertAbove] = useState('');
  const [addAlertBelow, setAddAlertBelow] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Note / Alert Edit State
  const [editingItem, setEditingItem] = useState<WatchlistItemData | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editAlertAbove, setEditAlertAbove] = useState('');
  const [editAlertBelow, setEditAlertBelow] = useState('');

  // Fetch watchlist data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/watchlist');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setItems(data.items || []);
      setCatalog(data.catalog || []);
    } catch (err: any) {
      console.error('Watchlist fetch error:', err);
      setError(err.message || 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Remove item
  const handleRemove = async (id: string, symbol: string) => {
    if (!confirm(`${symbol} takip listenizden çıkarılsın mı?`)) return;
    try {
      const res = await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
      } else {
        alert('Kaldırılamadı');
      }
    } catch (err) {
      console.error('Remove error:', err);
      alert('İşlem başarısız');
    }
  };

  // Add Item
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetForAdd) return;

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: selectedAssetForAdd.id,
          symbol: selectedAssetForAdd.symbol,
          notes: addNotes.trim() || undefined,
          alertAbove: addAlertAbove ? parseFloat(addAlertAbove) : undefined,
          alertBelow: addAlertBelow ? parseFloat(addAlertBelow) : undefined,
        }),
      });

      if (res.ok) {
        setIsAddModalOpen(false);
        setSelectedAssetForAdd(null);
        setAddNotes('');
        setAddAlertAbove('');
        setAddAlertBelow('');
        setModalSearch('');
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Eklenemedi');
      }
    } catch (err) {
      console.error('Add submit error:', err);
      alert('Bağlantı hatası');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit / Update Alert & Note
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      setIsSubmitting(true);
      const res = await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingItem.id,
          notes: editNotes.trim(),
          alertAbove: editAlertAbove ? parseFloat(editAlertAbove) : null,
          alertBelow: editAlertBelow ? parseFloat(editAlertBelow) : null,
        }),
      });

      if (res.ok) {
        setEditingItem(null);
        await fetchData();
      } else {
        alert('Güncellenemedi');
      }
    } catch (err) {
      console.error('Edit submit error:', err);
      alert('Hata oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Starter Packs (Cold-Start Resolution)
  const handleAddStarterPack = async (packType: 'BIST' | 'TEFAS' | 'US') => {
    let symbolsToFind: string[] = [];
    if (packType === 'BIST') symbolsToFind = ['THYAO', 'TURSG', 'FROTO', 'ASELS', 'AKBNK'];
    if (packType === 'TEFAS') symbolsToFind = ['TI2', 'TTE', 'AFT', 'MAC', 'YAY'];
    if (packType === 'US') symbolsToFind = ['NVDA', 'AAPL', 'SPY', 'QQQ', 'MSFT'];

    setIsSubmitting(true);
    try {
      for (const sym of symbolsToFind) {
        await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: sym }),
        });
      }
      await fetchData();
    } catch (err) {
      console.error('Starter pack add error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    return items
      .filter(item => {
        // Market filter
        if (marketFilter === 'BIST' && item.market !== 'BIST') return false;
        if (marketFilter === 'US' && item.market !== 'US') return false;
        if (marketFilter === 'TEFAS' && item.market !== 'TEFAS') return false;
        if (marketFilter === 'ALERTS' && !item.alertAbove && !item.alertBelow) return false;

        // Search text
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchSym = item.symbol.toLowerCase().includes(q);
          const matchName = item.name.toLowerCase().includes(q);
          const matchNotes = (item.notes || '').toLowerCase().includes(q);
          if (!matchSym && !matchName && !matchNotes) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let valA: any = a.addedAt;
        let valB: any = b.addedAt;

        if (sortField === 'symbol') {
          valA = a.symbol;
          valB = b.symbol;
        } else if (sortField === 'change') {
          valA = a.dailyChangePercent;
          valB = b.dailyChangePercent;
        } else if (sortField === 'price') {
          valA = a.latestPrice;
          valB = b.latestPrice;
        }

        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [items, marketFilter, searchQuery, sortField, sortAsc]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalCount = items.length;
    if (totalCount === 0) return { totalCount: 0, avgChange: 0, topGainer: null, activeAlertsCount: 0 };

    const avgChange = items.reduce((acc, i) => acc + i.dailyChangePercent, 0) / totalCount;
    const sortedByGain = [...items].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent);
    const topGainer = sortedByGain[0] || null;
    const activeAlertsCount = items.filter(i => i.alertAbove || i.alertBelow).length;

    return { totalCount, avgChange, topGainer, activeAlertsCount };
  }, [items]);

  // Format currency
  const formatPrice = (val: number, cur: string) => {
    const symbol = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
    if (val >= 100) return `${symbol}${val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (val >= 1) return `${symbol}${val.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
    return `${symbol}${val.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  };

  // Sparkline micro-path generator
  const renderSparkline = (changePct: number) => {
    const isPositive = changePct >= 0;
    const color = isPositive ? '#10b981' : '#ef4444';
    // Simplified 5-point realistic mini spline
    const points = isPositive
      ? '0,18 12,16 24,12 36,8 48,2'
      : '0,4 12,6 24,14 36,12 48,18';
    return (
      <svg className="w-14 h-6 overflow-visible shrink-0" viewBox="0 0 48 20">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  // 52-Week Range Gauge Bar
  const renderRangeBar = (curr: number, low?: number | null, high?: number | null) => {
    if (!low || !high || high <= low) {
      return (
        <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">
          {language === 'tr' ? 'Aralık yok' : 'No range'}
        </div>
      );
    }
    const clampedCurr = Math.min(Math.max(curr, low), high);
    const pct = Math.round(((clampedCurr - low) / (high - low)) * 100);

    return (
      <div className="w-full space-y-1">
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>{low.toFixed(1)}</span>
          <span className="font-bold text-slate-700 dark:text-slate-300">{pct}%</span>
          <span>{high.toFixed(1)}</span>
        </div>
        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700/80 rounded-full relative overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-12">
      {/* 1. Header & Summary Stats Bar */}
      <div className="bg-gradient-to-r from-blue-900/10 via-indigo-900/10 to-purple-900/10 dark:from-blue-950/40 dark:via-indigo-950/40 dark:to-purple-950/40 border border-blue-200/60 dark:border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">⭐</span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {language === 'tr' ? 'Takip Ettiklerim & Radar' : 'Watchlist & Favorites'}
              </h1>
              <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                {items.length} {language === 'tr' ? 'Varlık' : 'Assets'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              {language === 'tr'
                ? 'Portföyünüzden bağımsız BIST hisseleri, ABD hisse ve ETF’leri ile TEFAS yatırım fonlarını tek ekranda takip edin, hedef fiyat alarmları kurun.'
                : 'Monitor BIST equities, US stocks/ETFs, and TEFAS mutual funds independently from your portfolio holdings.'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-sm shadow-blue-500/25 transition-all cursor-pointer active:scale-95"
            >
              <span>+</span>
              <span>{language === 'tr' ? 'Varlık Ekle' : 'Add Symbol'}</span>
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              title="Yenile"
              className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Aggregate Metrics Ribbon */}
        {items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-800/60">
            <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                {language === 'tr' ? 'Toplam Takip' : 'Total Tracked'}
              </span>
              <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
                {stats.totalCount}
              </span>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                {language === 'tr' ? 'Ortalama Günlük Fark' : 'Average 1D Change'}
              </span>
              <span className={`text-base sm:text-lg font-black font-mono ${stats.avgChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {stats.avgChange >= 0 ? '+' : ''}{stats.avgChange.toFixed(2)}%
              </span>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                {language === 'tr' ? 'Günün Lideri' : 'Top Gainer'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                  {stats.topGainer ? stats.topGainer.symbol.replace('.IS', '') : '-'}
                </span>
                {stats.topGainer && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    +{stats.topGainer.dailyChangePercent.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xs p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
              <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 block">
                {language === 'tr' ? 'Fiyat Alarmları' : 'Price Alerts'}
              </span>
              <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 font-mono flex items-center gap-1">
                <span>🔔</span>
                <span>{stats.activeAlertsCount} {language === 'tr' ? 'Aktif' : 'Active'}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Filter Pills & Search & View Mode Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Market Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'ALL', label: language === 'tr' ? '🌟 Tümü' : '🌟 All', count: items.length },
              { id: 'BIST', label: '🇹🇷 BIST Hisseleri', count: items.filter(i => i.market === 'BIST').length },
              { id: 'US', label: '🇺🇸 ABD Hisse & ETF', count: items.filter(i => i.market === 'US').length },
              { id: 'TEFAS', label: '🏦 TEFAS Fonları', count: items.filter(i => i.market === 'TEFAS').length },
              { id: 'ALERTS', label: '🔔 Alarmlı', count: items.filter(i => i.alertAbove || i.alertBelow).length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setMarketFilter(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  marketFilter === tab.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${marketFilter === tab.id ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 dark:bg-slate-700'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* View Mode & Sort */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
                title="Kart Görünümü"
              >
                🗂️ {language === 'tr' ? 'Kart' : 'Cards'}
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
                title="Tablo Görünümü"
              >
                ☷ {language === 'tr' ? 'Tablo' : 'Table'}
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={`${sortField}-${sortAsc}`}
              onChange={e => {
                const [f, a] = e.target.value.split('-');
                setSortField(f as any);
                setSortAsc(a === 'true');
              }}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 py-1.5 px-2.5 focus:outline-hidden"
            >
              <option value="date-false">{language === 'tr' ? 'Son Eklenenler' : 'Recently Added'}</option>
              <option value="change-false">{language === 'tr' ? 'En Çok Yükselen' : 'Top Gainers'}</option>
              <option value="change-true">{language === 'tr' ? 'En Çok Düşen' : 'Top Losers'}</option>
              <option value="symbol-true">{language === 'tr' ? 'Sembol (A-Z)' : 'Symbol (A-Z)'}</option>
              <option value="price-false">{language === 'tr' ? 'Fiyat (Yüksek-Düşük)' : 'Price (High-Low)'}</option>
            </select>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={language === 'tr' ? 'Takip listesinde sembol, şirket adı veya not ara (örn: THYAO, NVDA, TEFAS, Fon)...' : 'Search watchlist by symbol, name, or thesis note...'}
            className="w-full bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 pl-9 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. Empty State & Cold-Start Onboarding */}
      {filteredItems.length === 0 && !loading && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-10 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-3xl mx-auto">
            ⭐
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {searchQuery ? (language === 'tr' ? 'Eşleşen varlık bulunamadı' : 'No matching assets found') : (language === 'tr' ? 'Takip listeniz henüz boş' : 'Your watchlist is currently empty')}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {searchQuery
                ? (language === 'tr' ? 'Arama teriminizi değiştirin veya yeni bir varlık ekleyin.' : 'Try a different search query or add a new asset.')
                : (language === 'tr' ? 'Portföyünüzden bağımsız olarak izlemek istediğiniz hisse ve fonları ekleyebilir veya aşağıdaki hazır popüler koleksiyonları tek tıkla yükleyebilirsiniz.' : 'Add assets you wish to monitor independently or seed from starter packs below.')}
            </p>
          </div>

          {/* Quick Starter Packs (Zero-History Cold-Start Feature) */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 max-w-xl mx-auto">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
              {language === 'tr' ? '⚡ Hızlı Başlangıç Koleksiyonları (Tek Tıkla Ekle)' : '⚡ Starter Packs (1-Click Add)'}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => handleAddStarterPack('BIST')}
                disabled={isSubmitting}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all text-left space-y-1 cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white group-hover:text-blue-600">
                  <span>🇹🇷</span>
                  <span>BIST 30 Lokomotif</span>
                </div>
                <p className="text-[10px] text-slate-500">THYAO, TURSG, FROTO, ASELS, AKBNK</p>
              </button>

              <button
                onClick={() => handleAddStarterPack('TEFAS')}
                disabled={isSubmitting}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all text-left space-y-1 cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white group-hover:text-blue-600">
                  <span>🏦</span>
                  <span>TEFAS Yıldız Fonlar</span>
                </div>
                <p className="text-[10px] text-slate-500">TI2, TTE, AFT, MAC, YAY</p>
              </button>

              <button
                onClick={() => handleAddStarterPack('US')}
                disabled={isSubmitting}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all text-left space-y-1 cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white group-hover:text-blue-600">
                  <span>🇺🇸</span>
                  <span>ABD Devleri & ETF</span>
                </div>
                <p className="text-[10px] text-slate-500">NVDA, AAPL, SPY, QQQ, MSFT</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Card View (Mobile-First Thumb Friendly) */}
      {viewMode === 'cards' && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredItems.map(item => {
            const isPositive = item.dailyChangePercent >= 0;
            const cleanSym = item.symbol.replace('.IS', '');
            const flag = item.market === 'BIST' ? '🇹🇷' : item.market === 'US' ? '🇺🇸' : '🏦';
            const badgeType = item.assetClass === 'fund' ? 'TEFAS Fon' : item.assetClass === 'etf' ? 'ETF' : 'Hisse';

            // Distance to alert calculations
            let alertBelowDistance: number | null = null;
            if (item.alertBelow && item.latestPrice > 0) {
              alertBelowDistance = ((item.latestPrice - item.alertBelow) / item.latestPrice) * 100;
            }

            let alertAboveDistance: number | null = null;
            if (item.alertAbove && item.latestPrice > 0) {
              alertAboveDistance = ((item.alertAbove - item.latestPrice) / item.latestPrice) * 100;
            }

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700/60 transition-all flex flex-col justify-between space-y-3 group"
              >
                {/* Card Top: Asset Identity & Price Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg font-black shrink-0 border border-slate-200/50 dark:border-slate-700/50">
                      {flag}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                          {cleanSym}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {badgeType}
                        </span>
                        {item.sector && (
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 truncate max-w-[100px]">
                            {item.sector}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]" title={item.name}>
                        {item.name}
                      </p>
                    </div>
                  </div>

                  {/* Price & Change Pill */}
                  <div className="text-right shrink-0">
                    <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
                      {formatPrice(item.latestPrice, item.currency)}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-0.5">
                      {renderSparkline(item.dailyChangePercent)}
                      <span
                        className={`text-xs font-black px-2 py-0.5 rounded-lg font-mono ${
                          isPositive
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {isPositive ? '+' : ''}{item.dailyChangePercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* 52-Week Range Bar */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 mb-1">
                    <span>{language === 'tr' ? '52-Haftalık Aralık' : '52-Week Range'}</span>
                    {item.rsi14 && <span>RSI: {item.rsi14.toFixed(1)}</span>}
                  </div>
                  {renderRangeBar(item.latestPrice, item.low52w, item.high52w)}
                </div>

                {/* Alert Thresholds Display */}
                {(item.alertBelow || item.alertAbove) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.alertBelow && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          alertBelowDistance !== null && alertBelowDistance <= 0
                            ? 'bg-emerald-500 text-white font-black animate-pulse'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                        }`}
                        title="Alt Destek / Dip Hedefi"
                      >
                        <span>🎯 {language === 'tr' ? 'Alış Hedefi' : 'Entry Target'}:</span>
                        <span className="font-mono">{formatPrice(item.alertBelow, item.currency)}</span>
                        {alertBelowDistance !== null && (
                          <span className="text-[9px] opacity-80">
                            ({alertBelowDistance <= 0 ? 'HEDEFE GİRDİ! 🚀' : `-%${alertBelowDistance.toFixed(1)} kaldı`})
                          </span>
                        )}
                      </span>
                    )}

                    {item.alertAbove && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          alertAboveDistance !== null && alertAboveDistance <= 0
                            ? 'bg-purple-600 text-white font-black animate-pulse'
                            : 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30'
                        }`}
                        title="Üst Direnç / Çıkış Hedefi"
                      >
                        <span>🚀 {language === 'tr' ? 'Kırılım Hedefi' : 'Breakout'}:</span>
                        <span className="font-mono">{formatPrice(item.alertAbove, item.currency)}</span>
                        {alertAboveDistance !== null && (
                          <span className="text-[9px] opacity-80">
                            ({alertAboveDistance <= 0 ? 'AŞILDI! 💥' : `+%${alertAboveDistance.toFixed(1)}`})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}

                {/* User Thesis Notes */}
                {item.notes ? (
                  <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700/50 rounded-xl p-2.5 text-xs text-slate-700 dark:text-slate-300 italic flex items-start gap-1.5">
                    <span className="shrink-0 text-slate-400 not-italic">📝</span>
                    <span className="line-clamp-2">{item.notes}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingItem(item);
                      setEditNotes(item.notes || '');
                      setEditAlertAbove(item.alertAbove ? String(item.alertAbove) : '');
                      setEditAlertBelow(item.alertBelow ? String(item.alertBelow) : '');
                    }}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer self-start"
                  >
                    <span>+</span>
                    <span>{language === 'tr' ? 'Not & Hedef Alarmı Ekle' : 'Add Note & Target'}</span>
                  </button>
                )}

                {/* Card Actions Bottom Strip */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingItem(item);
                        setEditNotes(item.notes || '');
                        setEditAlertAbove(item.alertAbove ? String(item.alertAbove) : '');
                        setEditAlertBelow(item.alertBelow ? String(item.alertBelow) : '');
                      }}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                      title="Alarm & Not Düzenle"
                    >
                      <span>🔔</span>
                      <span className="text-[10px] hidden sm:inline">{language === 'tr' ? 'Alarm/Not' : 'Alert'}</span>
                    </button>

                    {onAddToPortfolio && (
                      <button
                        onClick={() =>
                          onAddToPortfolio({
                            symbol: item.symbol,
                            name: item.name,
                            market: item.market,
                            currentPrice: item.latestPrice,
                            currency: item.currency,
                          })
                        }
                        className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        title="Bu varlığı gerçek portföyüne taşı"
                      >
                        <span>💼</span>
                        <span className="text-[10px]">{language === 'tr' ? 'Portföye Al' : 'To Portfolio'}</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleRemove(item.id, cleanSym)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs transition-colors cursor-pointer"
                    title="Takip Listesinden Kaldır"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Dense Table View (Desktop High-Density Grid) */}
      {viewMode === 'table' && filteredItems.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">{language === 'tr' ? 'Varlık / Sembol' : 'Symbol / Asset'}</th>
                  <th className="py-3 px-4">{language === 'tr' ? 'Son Fiyat' : 'Price'}</th>
                  <th className="py-3 px-4">{language === 'tr' ? 'Günlük Fark' : '1D Change'}</th>
                  <th className="py-3 px-4 min-w-[140px]">{language === 'tr' ? '52-Haftalık Aralık' : '52W Range'}</th>
                  <th className="py-3 px-4">{language === 'tr' ? 'Fiyat Hedefleri' : 'Alerts / Targets'}</th>
                  <th className="py-3 px-4">{language === 'tr' ? 'Yatırım Tezi / Not' : 'Thesis Note'}</th>
                  <th className="py-3 px-4 text-right">{language === 'tr' ? 'İşlemler' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {filteredItems.map(item => {
                  const isPositive = item.dailyChangePercent >= 0;
                  const cleanSym = item.symbol.replace('.IS', '');
                  const flag = item.market === 'BIST' ? '🇹🇷' : item.market === 'US' ? '🇺🇸' : '🏦';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm shrink-0">{flag}</span>
                          <div>
                            <div className="font-black text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
                              <span>{cleanSym}</span>
                              <span className="text-[9px] px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {item.assetClass}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                              {item.name}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                        {formatPrice(item.latestPrice, item.currency)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {renderSparkline(item.dailyChangePercent)}
                          <span
                            className={`font-black font-mono px-2 py-0.5 rounded-lg text-xs ${
                              isPositive
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {isPositive ? '+' : ''}{item.dailyChangePercent.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {renderRangeBar(item.latestPrice, item.low52w, item.high52w)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {item.alertBelow && (
                            <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <span>🎯 Dip:</span>
                              <span className="font-bold">{formatPrice(item.alertBelow, item.currency)}</span>
                            </div>
                          )}
                          {item.alertAbove && (
                            <div className="text-[10px] font-mono text-purple-600 dark:text-purple-400 flex items-center gap-1">
                              <span>🚀 Kırılım:</span>
                              <span className="font-bold">{formatPrice(item.alertAbove, item.currency)}</span>
                            </div>
                          )}
                          {!item.alertBelow && !item.alertAbove && (
                            <span className="text-slate-400 text-[11px] italic">-</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-slate-600 dark:text-slate-300 italic truncate block max-w-[200px]" title={item.notes}>
                          {item.notes || '-'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setEditNotes(item.notes || '');
                              setEditAlertAbove(item.alertAbove ? String(item.alertAbove) : '');
                              setEditAlertBelow(item.alertBelow ? String(item.alertBelow) : '');
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                            title="Düzenle"
                          >
                            🔔
                          </button>
                          {onAddToPortfolio && (
                            <button
                              onClick={() =>
                                onAddToPortfolio({
                                  symbol: item.symbol,
                                  name: item.name,
                                  market: item.market,
                                  currentPrice: item.latestPrice,
                                  currency: item.currency,
                                })
                              }
                              className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950/50 text-emerald-600 transition-colors cursor-pointer"
                              title="Portföye Al"
                            >
                              💼
                            </button>
                          )}
                          <button
                            onClick={() => handleRemove(item.id, cleanSym)}
                            className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-500 transition-colors cursor-pointer"
                            title="Kaldır"
                          >
                            ✕
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
      )}

      {/* 6. Modal: Add New Symbol to Watchlist */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>⭐</span>
                <span>{language === 'tr' ? 'Takip Listesine Varlık Ekle' : 'Add Symbol to Watchlist'}</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {/* Asset Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {language === 'tr' ? 'Varlık / Şirket / Fon Ara:' : 'Search Asset / Symbol / TEFAS:'}
                </label>
                <input
                  type="text"
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  placeholder={language === 'tr' ? 'Örn: THYAO, TURSG, NVDA, SPY, TI2, TTE...' : 'e.g. THYAO, NVDA, SPY, TI2...'}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />

                {/* Autocomplete Dropdown */}
                {modalSearch.trim().length > 0 && !selectedAssetForAdd && (
                  <div className="mt-1 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700 shadow-lg">
                    {catalog
                      .filter(
                        c =>
                          c.symbol.toLowerCase().includes(modalSearch.toLowerCase()) ||
                          c.name.toLowerCase().includes(modalSearch.toLowerCase())
                      )
                      .slice(0, 8)
                      .map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedAssetForAdd(c);
                            setModalSearch(c.symbol);
                          }}
                          className="w-full text-left p-2.5 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{c.market === 'BIST' ? '🇹🇷' : c.market === 'US' ? '🇺🇸' : '🏦'}</span>
                              <span>{c.symbol}</span>
                              <span className="text-[10px] text-slate-400 font-normal">({c.assetClass})</span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-[280px]">{c.name}</div>
                          </div>
                          {c.isWatched && (
                            <span className="text-[10px] bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold px-1.5 py-0.5 rounded">
                              {language === 'tr' ? 'Ekli' : 'Added'}
                            </span>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {selectedAssetForAdd && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">
                      {selectedAssetForAdd.market === 'BIST' ? '🇹🇷' : selectedAssetForAdd.market === 'US' ? '🇺🇸' : '🏦'}
                    </span>
                    <div>
                      <span className="font-black text-sm text-slate-900 dark:text-white">{selectedAssetForAdd.symbol}</span>
                      <p className="text-xs text-slate-500">{selectedAssetForAdd.name}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssetForAdd(null);
                      setModalSearch('');
                    }}
                    className="text-xs text-blue-600 hover:underline font-bold"
                  >
                    {language === 'tr' ? 'Değiştir' : 'Change'}
                  </button>
                </div>
              )}

              {/* Target Price Alerts */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    🎯 {language === 'tr' ? 'Alış / Dip Hedefi (₺ / $)' : 'Dip Target (Below)'}:
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={addAlertBelow}
                    onChange={e => setAddAlertBelow(e.target.value)}
                    placeholder="Örn: 280.00"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400">
                    {language === 'tr' ? 'Fiyat bu seviyeye veya altına inerse uyar' : 'Alert when price touches or drops below'}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    🚀 {language === 'tr' ? 'Direnç / Kırılım (₺ / $)' : 'Breakout (Above)'}:
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={addAlertAbove}
                    onChange={e => setAddAlertAbove(e.target.value)}
                    placeholder="Örn: 320.00"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden"
                  />
                  <span className="text-[10px] text-slate-400">
                    {language === 'tr' ? 'Fiyat bu seviyeyi aşarsa uyar' : 'Alert when price exceeds'}
                  </span>
                </div>
              </div>

              {/* Investment Thesis Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  📝 {language === 'tr' ? 'Takip Notu / Yatırım Tezi:' : 'Watch Thesis / Note:'}
                </label>
                <textarea
                  rows={2}
                  value={addNotes}
                  onChange={e => setAddNotes(e.target.value)}
                  placeholder={language === 'tr' ? 'Neden takip ediyorsunuz? (örn: 50 günlük ortalamadan tepki alımı planlanıyor, temettü verimi yüksek)...' : 'Why are you watching this asset?...'}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 cursor-pointer"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={!selectedAssetForAdd || isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                >
                  {isSubmitting ? (language === 'tr' ? 'Ekleniyor...' : 'Adding...') : (language === 'tr' ? 'Takip Listesine Ekle' : 'Add to Watchlist')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal: Edit Alerts & Notes */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>🔔</span>
                <span>{editingItem.symbol.replace('.IS', '')} {language === 'tr' ? 'Alarmları & Notları' : 'Alerts & Notes'}</span>
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    🎯 {language === 'tr' ? 'Alış Hedefi' : 'Entry Target'}:
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editAlertBelow}
                    onChange={e => setEditAlertBelow(e.target.value)}
                    placeholder="Seviye"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    🚀 {language === 'tr' ? 'Kırılım Hedefi' : 'Breakout Target'}:
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editAlertAbove}
                    onChange={e => setEditAlertAbove(e.target.value)}
                    placeholder="Seviye"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  📝 {language === 'tr' ? 'Strateji Notu:' : 'Strategy Note:'}
                </label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Yatırım planı..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400"
                >
                  {language === 'tr' ? 'İptal' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs"
                >
                  {isSubmitting ? (language === 'tr' ? 'Kaydediliyor...' : 'Saving...') : (language === 'tr' ? 'Kaydet' : 'Save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
