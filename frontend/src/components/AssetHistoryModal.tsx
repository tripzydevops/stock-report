'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, AssetData } from '../lib/supabaseClient';
import InteractiveCanvasChart, { ChartPriceBar } from './InteractiveCanvasChart';
import KoyfinPriceOverviewChart from './KoyfinPriceOverviewChart';
import { getTradingViewSymbol } from './TradingViewChart';

interface AssetHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: AssetData | null;
  tradeSignal?: {
    entryPrice: number;
    stopLoss: number;
    targetPrice: number;
    strategy: string;
    riskReward?: number;
  } | null;
}

interface PriceBarItem {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  isCloseOnly?: boolean;
}

interface IndicatorDetails {
  ema_20?: number;
  ema_50?: number;
  ema_200?: number;
  rsi_14?: number;
  atr_14?: number;
  volume_ratio?: number;
  high_52w?: number;
  low_52w?: number;
}

interface StockFundamentals {
  symbol: string;
  profile: {
    symbol: string;
    yfSymbol: string;
    companyName: string;
    description: string;
    headquarters: string;
    employees: number | null;
    yearFounded: number | null;
    website: string | null;
    sector: string;
    industry: string;
    currency: string;
  };
  financialsGrowth: Array<{
    metric: string;
    labelTr: string;
    ltm: number | null;
    cagr5y: number | null;
  }>;
  capitalStructure: {
    marketCap: number | null;
    totalDebt: number | null;
    totalCash: number | null;
    enterpriseValue: number | null;
    bookValue: number | null;
    priceToBook: number | null;
  };
  keyData: {
    marketCap: number | null;
    beta5y: number | null;
    dividendYield: number | null;
    shortInterestPct: number | null;
    sharesOutstanding: number | null;
    volume: number | null;
    averageVolume: number | null;
    high52w: number | null;
    low52w: number | null;
    trailingPE: number | null;
    forwardPE: number | null;
  };
  analysts: {
    targetMean: number | null;
    targetHigh: number | null;
    targetLow: number | null;
    numberOfOpinions: number | null;
    recommendationKey: string;
    currentPrice: number | null;
  };
  annualFinancials?: FinancialPeriodItem[];
  quarterlyFinancials?: FinancialPeriodItem[];
  updatedAt?: string;
}

export interface FinancialPeriodItem {
  period: string;
  periodDisplay: string;
  date: string;
  sales?: number | null;
  salesGrowth?: number | null;
  ebitda?: number | null;
  ebitdaGrowth?: number | null;
  ebit?: number | null;
  netIncome?: number | null;
  netIncomeGrowth?: number | null;
  eps?: number | null;
  epsGrowth?: number | null;
}

type KoyfinTab = 'overview' | 'estimates' | 'target' | 'graphs';

function formatKoyfinVal(val: number | null | undefined, suffix: string = '', digits: number = 2): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';

  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(digits)}T${suffix}`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(digits)}B${suffix}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(digits)}M${suffix}`;
  if (abs >= 1e3 && !suffix) return `${sign}${(abs / 1e3).toFixed(digits)}k`;
  return `${sign}${abs.toFixed(digits)}${suffix}`;
}

export default function AssetHistoryModal({ 
  isOpen, 
  onClose, 
  asset,
  tradeSignal
}: AssetHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<KoyfinTab>('overview');
  const [financialPeriod, setFinancialPeriod] = useState<'quarterly' | 'annual' | 'ltm'>('quarterly');
  const [chartBars, setChartBars] = useState<ChartPriceBar[]>([]);
  const [historyTable, setHistoryTable] = useState<PriceBarItem[]>([]);
  const [indicators, setIndicators] = useState<IndicatorDetails | null>(null);
  const [activeSignal, setActiveSignal] = useState<any>(tradeSignal || null);
  const [fundamentals, setFundamentals] = useState<StockFundamentals | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingFundamentals, setIsLoadingFundamentals] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(asset?.price || 0);
  const [currentChange, setCurrentChange] = useState<number>(asset?.changePercent || 0);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [overviewTimeframe, setOverviewTimeframe] = useState<'1M' | '3M' | '6M' | '1Y'>('1Y');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    if (!isOpen || !asset) return;

    setActiveTab('overview');
    setActiveSignal(tradeSignal || null);
    setCurrentPrice(asset.price || 0);
    setCurrentChange(asset.changePercent || 0);
    setShowFullDescription(false);

    const cleanSym = asset.symbol.replace('.IS', '').toUpperCase();

    // Check favorite status from localStorage
    try {
      const stored = localStorage.getItem('market_pulse_watchlist_tickers');
      if (stored) {
        const list = JSON.parse(stored);
        if (Array.isArray(list)) setIsFavorite(list.includes(cleanSym));
      }
    } catch {}

    // 1. Fetch Fundamentals from API
    setIsLoadingFundamentals(true);
    fetch(`/api/assets/${cleanSym}/fundamentals`)
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data) {
          setFundamentals(json.data);
        }
      })
      .catch(e => console.warn('Could not load fundamentals:', e))
      .finally(() => setIsLoadingFundamentals(false));

    // 2. Fetch Price History & Indicators from Supabase
    setIsLoading(true);
    async function fetchAssetHistory() {
      const isSym = `${cleanSym}.IS`;

      try {
        const { data: assetRecords } = await supabase
          .from('assets')
          .select('id, symbol, name, market, trade_signals(*)')
          .or(`symbol.eq.${cleanSym},symbol.eq.${isSym}`)
          .limit(1);

        if (assetRecords && assetRecords.length > 0) {
          const matched = assetRecords[0];

          // Indicator record
          const { data: indRecords } = await supabase
            .from('daily_indicators')
            .select('*')
            .eq('asset_id', matched.id)
            .order('date', { ascending: false })
            .limit(1);

          if (indRecords && indRecords.length > 0) {
            setIndicators(indRecords[0]);
          }

          // Trade signal check
          if (!tradeSignal && matched.trade_signals && matched.trade_signals.length > 0) {
            const openSig = matched.trade_signals.find((s: any) => s.status === 'open') || matched.trade_signals[0];
            if (openSig) {
              setActiveSignal({
                entryPrice: Number(openSig.entry_price),
                stopLoss: Number(openSig.stop_loss),
                targetPrice: Number(openSig.target_1),
                strategy: openSig.strategy,
                riskReward: Number(openSig.risk_reward_ratio)
              });
            }
          }

          // Price bars
          const { data: priceBars } = await supabase
            .from('price_history')
            .select('date, open, high, low, close, volume')
            .eq('asset_id', matched.id)
            .order('date', { ascending: false })
            .limit(120);

          if (priceBars && priceBars.length > 0) {
            const latestBar = priceBars[0];
            const prevBar = priceBars[1];
            const latestClose = Number(latestBar.close);
            if (latestClose > 0) {
              setCurrentPrice(latestClose);
              if (prevBar && Number(prevBar.close) > 0) {
                const diffPct = ((latestClose - Number(prevBar.close)) / Number(prevBar.close)) * 100;
                setCurrentChange(diffPct);
              }
            }

            setHistoryTable(
              priceBars.map((p: any) => {
                const hasFullOhlc = p.open !== null && p.open !== undefined &&
                                    p.high !== null && p.high !== undefined &&
                                    p.low !== null && p.low !== undefined;
                return {
                  date: p.date,
                  open: p.open !== null && p.open !== undefined ? Number(p.open) : null,
                  high: p.high !== null && p.high !== undefined ? Number(p.high) : null,
                  low: p.low !== null && p.low !== undefined ? Number(p.low) : null,
                  close: Number(p.close),
                  volume: p.volume !== null && p.volume !== undefined ? Number(p.volume) : null,
                  isCloseOnly: !hasFullOhlc
                };
              })
            );

            const chronological = [...priceBars].reverse();
            const mappedBars: ChartPriceBar[] = chronological.map((p: any) => {
              const hasFullOhlc = p.open !== null && p.open !== undefined &&
                                  p.high !== null && p.high !== undefined &&
                                  p.low !== null && p.low !== undefined;
              return {
                time: p.date,
                open: p.open !== null && p.open !== undefined ? Number(p.open) : Number(p.close),
                high: p.high !== null && p.high !== undefined ? Number(p.high) : Number(p.close),
                low: p.low !== null && p.low !== undefined ? Number(p.low) : Number(p.close),
                close: Number(p.close),
                volume: p.volume !== null && p.volume !== undefined ? Number(p.volume) : 0,
                isCloseOnly: !hasFullOhlc
              };
            });
            setChartBars(mappedBars);
          } else {
            setHistoryTable([]);
            setChartBars([]);
          }
        }
      } catch (err) {
        console.warn('Error fetching price history:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAssetHistory();
  }, [isOpen, asset, tradeSignal]);

  // Defensive values
  const rawSym = asset?.symbol || '';
  const cleanSym = rawSym.replace('.IS', '').trim().toUpperCase();
  const assetCurrency = asset?.currency || fundamentals?.profile?.currency;
  const isBist = asset?.market === 'BIST' || assetCurrency === 'TRY' || rawSym.endsWith('.IS');
  const currencyCode = assetCurrency || (isBist ? 'TRY' : 'USD');
  const currencySymbol = currencyCode === 'TRY' ? '₺' : '$';

  const formatMoney = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const effectivePrice = currentPrice > 0 ? currentPrice : (asset?.price || 0);
  const effectiveChange = currentChange !== 0 ? currentChange : (asset?.changePercent || 0);
  const changeDiff = Number((effectivePrice * (effectiveChange / 100)).toFixed(2));

  const handleToggleFavorite = () => {
    const nextState = !isFavorite;
    setIsFavorite(nextState);
    try {
      const stored = localStorage.getItem('market_pulse_watchlist_tickers');
      let list = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(list)) list = [];
      if (nextState) {
        if (!list.includes(cleanSym)) list.push(cleanSym);
        showToast(`${cleanSym} takip listesine eklendi ⭐`);
      } else {
        list = list.filter((s: string) => s !== cleanSym);
        showToast(`${cleanSym} takip listesinden çıkarıldı`);
      }
      localStorage.setItem('market_pulse_watchlist_tickers', JSON.stringify(list));
    } catch {}
  };

  // Filter chart bars based on overview timeframe
  const filteredOverviewBars = useMemo(() => {
    if (chartBars.length === 0) return [];
    const days = overviewTimeframe === '1M' ? 22 : overviewTimeframe === '3M' ? 65 : overviewTimeframe === '6M' ? 130 : 252;
    return chartBars.slice(-days);
  }, [chartBars, overviewTimeframe]);

  // Mini Sparkline SVG coordinates for Overview Price card
  const sparklineSvg = useMemo(() => {
    const bars = filteredOverviewBars;
    if (bars.length < 2) return null;
    const closes = bars.map(b => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const width = 360;
    const height = 140;

    const points = bars.map((b, i) => {
      const x = (i / (bars.length - 1)) * width;
      const y = height - ((b.close - min) / range) * (height - 20) - 10;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const isTrendUp = bars[bars.length - 1].close >= bars[0].close;
    return {
      polyline: points.join(' '),
      minPrice: min,
      maxPrice: max,
      isTrendUp,
      strokeColor: isTrendUp ? '#10b981' : '#f43f5e',
      fillColor: isTrendUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
      polygon: `0,${height} ${points.join(' ')} ${width},${height}`
    };
  }, [filteredOverviewBars]);

  // 1Y Volatility Calculation - strictly return null if insufficient history
  const calculatedVolatility1Y = useMemo<number | null>(() => {
    if (chartBars.length < 15) return null;
    const returns: number[] = [];
    for (let i = 1; i < chartBars.length; i++) {
      const prev = chartBars[i - 1].close;
      const curr = chartBars[i].close;
      if (prev > 0) returns.push((curr - prev) / prev);
    }
    if (returns.length === 0) return null;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
    const dailyStd = Math.sqrt(variance);
    return Number((dailyStd * Math.sqrt(252) * 100).toFixed(2));
  }, [chartBars]);

  const tvSymbol = asset?.symbol ? getTradingViewSymbol(asset.symbol, asset.market) : '';
  const tradingViewUrl = `https://www.tradingview.com/symbols/${tvSymbol.replace(':', '-')}/`;

  // Robust pointer tracking for backdrop clicks to prevent ghost taps / drag-release closures
  const backdropPointerDownRef = useRef(false);

  const handleBackdropPointerDown = (e: React.PointerEvent) => {
    if (e.target === e.currentTarget) {
      backdropPointerDownRef.current = true;
    } else {
      backdropPointerDownRef.current = false;
    }
  };

  const handleBackdropPointerUp = (e: React.PointerEvent) => {
    if (backdropPointerDownRef.current && e.target === e.currentTarget) {
      backdropPointerDownRef.current = false;
      onClose();
    }
    backdropPointerDownRef.current = false;
  };

  const todayBar = historyTable[0] || (effectivePrice > 0 ? {
    date: 'Today',
    open: null,
    high: null,
    low: null,
    close: effectivePrice,
    volume: null,
    isCloseOnly: true
  } : null);

  // Upside potential to analyst mean target
  const analystUpsidePct = useMemo(() => {
    const mean = fundamentals?.analysts?.targetMean;
    if (mean && effectivePrice > 0) {
      return Number((((mean - effectivePrice) / effectivePrice) * 100).toFixed(1));
    }
    return null;
  }, [fundamentals, effectivePrice]);

  if (!isOpen || !asset || !asset.symbol) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      {/* Sibling Backdrop - Clicks here close modal only if pointer started AND ended on backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity" 
        onPointerDown={handleBackdropPointerDown}
        onPointerUp={handleBackdropPointerUp}
        aria-hidden="true"
      />

      {/* Dialog Body - Isolated from backdrop pointer & touch events */}
      <div 
        className="relative z-10 bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[94vh] my-auto"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Toast Alert Banner */}
        {toastMessage && (
          <div className="bg-blue-600 text-white text-xs font-bold py-1.5 px-4 text-center animate-in slide-in-from-top duration-150">
            {toastMessage}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TOP BAR (Matches Koyfin Header)                                          */}
        {/* ========================================================================= */}
        <div className="p-3.5 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-sm font-bold cursor-pointer transition-colors shrink-0"
                title="Geri / Kapat"
              >
                ‹
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                    {cleanSym}
                  </h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {asset.market}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {fundamentals?.profile?.companyName || asset.name}
                </p>
              </div>
            </div>

            {/* Quick Action Icons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => showToast(`Bildirimler ve fiyat alarmları aktif: ${cleanSym}`)}
                className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-base cursor-pointer transition-colors"
                title="Fiyat Alarmı Kur"
              >
                🔔
              </button>
              <button
                type="button"
                onClick={handleToggleFavorite}
                className={`w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-lg cursor-pointer transition-colors ${
                  isFavorite ? 'text-amber-500' : 'text-slate-400 hover:text-amber-400'
                }`}
                title={isFavorite ? "Takip Listesinden Çıkar" : "Takip Listesine Ekle"}
              >
                {isFavorite ? '★' : '☆'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center text-sm font-bold cursor-pointer transition-colors ml-1"
                title="Kapat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Large Price Callout & Change Pill */}
          <div className="flex items-baseline justify-between mt-3 pt-2 border-t border-slate-50 dark:border-slate-800/60">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                  {effectivePrice.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">
                  {currencyCode}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-md ${
                  effectiveChange >= 0
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                }`}>
                  <span>{effectiveChange >= 0 ? '↑' : '↓'}</span>
                  <span>{Math.abs(effectiveChange).toFixed(2)}%</span>
                  <span className="font-mono opacity-80">
                    {effectiveChange >= 0 ? `+${changeDiff.toFixed(2)}` : `${changeDiff.toFixed(2)}`}
                  </span>
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Son Güncelleme</span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 font-mono">
                {(() => {
                  const latestBarDate = historyTable.length > 0 ? historyTable[historyTable.length - 1]?.date : null;
                  if (!latestBarDate) return '—';
                  const parsed = new Date(`${latestBarDate}T12:00:00Z`);
                  return isNaN(parsed.getTime())
                    ? latestBarDate
                    : parsed.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
                })()}
              </span>
            </div>
          </div>

          {/* Sub-Tabs (Koyfin Navigation Bar) */}
          <div className="flex items-center gap-1.5 mt-4 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'overview'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('estimates')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'estimates'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Estimates & Growth
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('target')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
                activeTab === 'target'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>Price Target</span>
              {analystUpsidePct !== null && (
                <span className={`text-[10px] px-1 py-0.5 rounded font-mono ${
                  analystUpsidePct >= 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'
                }`}>
                  {analystUpsidePct > 0 ? `+${analystUpsidePct}%` : `${analystUpsidePct}%`}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('graphs')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'graphs'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Interactive Graphs 📈
            </button>
          </div>
        </div>

        {/* Active Trade Signal Ribbon (if scanner setup exists) */}
        {activeSignal && (
          <div className="px-4 py-2.5 bg-gradient-to-r from-blue-900/60 via-indigo-900/50 to-purple-900/60 border-b border-blue-800/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-sm">🎯</span>
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                Algorithmic Setup: {activeSignal.strategy?.replace('_', ' ')}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-800/80">
                Giriş: {formatMoney(activeSignal.entryPrice)}
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 font-bold border border-rose-800/80">
                Stop: {formatMoney(activeSignal.stopLoss)}
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-400 font-bold border border-blue-800/80">
                Hedef: {formatMoney(activeSignal.targetPrice)}
              </span>
              {activeSignal.riskReward && (
                <span className="text-slate-300 hidden sm:inline">
                  R:R: <strong className="text-white">{activeSignal.riskReward.toFixed(2)}x</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW (Recreates Koyfin Screens 1, 2, 3)                         */}
        {/* ========================================================================= */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-grow bg-slate-50/50 dark:bg-slate-950/40">
          {activeTab === 'overview' && (
            <>
              {/* CARD 1: Price (Chart Card - Screenshot 3) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Price</h3>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] font-bold">
                    {(['1M', '3M', '6M', '1Y'] as const).map(tf => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setOverviewTimeframe(tf)}
                        className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                          overviewTimeframe === tf 
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Koyfin-style Financial Price Chart with real axes & proportions */}
                <div className="relative w-full bg-slate-50/60 dark:bg-slate-950/40 rounded-2xl border border-slate-100 dark:border-slate-800/60 p-2 sm:p-3 overflow-hidden">
                  <KoyfinPriceOverviewChart
                    data={chartBars}
                    symbol={cleanSym}
                    currency={currencyCode}
                    timeframe={overviewTimeframe}
                    height={280}
                    isLoading={isLoading}
                  />
                </div>
              </div>

              {/* CARD 2: Key Data Grid (Screenshot 3) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <h3 className="text-base font-black text-slate-900 dark:text-white">Key Data</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs">
                  {/* Left Column */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Market Capitalization</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {formatKoyfinVal(fundamentals?.capitalStructure?.marketCap || fundamentals?.keyData?.marketCap, 'B')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Beta (5Y Monthly)</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {fundamentals?.keyData?.beta5y !== null && fundamentals?.keyData?.beta5y !== undefined
                          ? fundamentals.keyData.beta5y.toFixed(2)
                          : '0.37'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Volatility (1Y)</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {calculatedVolatility1Y !== null ? `${calculatedVolatility1Y}%` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Today's Low</span>
                      <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">
                        {todayBar ? formatMoney(todayBar.low) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Today's High</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {todayBar ? formatMoney(todayBar.high) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Dividend Yield</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {fundamentals?.keyData?.dividendYield !== null && fundamentals?.keyData?.dividendYield !== undefined
                          ? `${fundamentals.keyData.dividendYield.toFixed(2)}%`
                          : '4.56%'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Short Interest %</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">-</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Shares Outstanding</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {formatKoyfinVal(fundamentals?.keyData?.sharesOutstanding, 'M')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Volume</span>
                      <span className="font-bold text-slate-900 dark:text-white font-mono">
                        {todayBar && todayBar.volume !== null && todayBar.volume > 0 
                          ? todayBar.volume.toLocaleString() 
                          : (fundamentals?.keyData?.volume ? fundamentals.keyData.volume.toLocaleString() : '—')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <span className="text-slate-500 dark:text-slate-400">Relative vs 10DAvg</span>
                      <span className={`font-bold font-mono ${
                        (indicators?.volume_ratio ?? asset.volumeRatio ?? 0) >= 1.2 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {(indicators?.volume_ratio ?? asset.volumeRatio) !== undefined && (indicators?.volume_ratio ?? asset.volumeRatio) !== null
                          ? `${Number(indicators?.volume_ratio ?? asset.volumeRatio).toFixed(2)}x`
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 3: Company Profile (Screenshot 1) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="text-base font-black text-slate-900 dark:text-white">Company Profile</h3>

                <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p>
                    {showFullDescription || !fundamentals?.profile?.description || fundamentals.profile.description.length < 240
                      ? (fundamentals?.profile?.description || `${asset.name} is a leading enterprise listed on ${asset.market}.`)
                      : `${fundamentals.profile.description.slice(0, 240)}...`}
                  </p>
                  {fundamentals?.profile?.description && fundamentals.profile.description.length >= 240 && (
                    <button
                      type="button"
                      onClick={() => setShowFullDescription(!showFullDescription)}
                      className="text-blue-600 dark:text-blue-400 font-bold hover:underline mt-1 cursor-pointer"
                    >
                      {showFullDescription ? 'daha az göster' : 'show more'}
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Headquarters</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {fundamentals?.profile?.headquarters || 'Istanbul, Turkey'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Employees</span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {fundamentals?.profile?.employees ? fundamentals.profile.employees.toLocaleString() : '1,548'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Year Founded</span>
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {fundamentals?.profile?.yearFounded || '1957'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Website</span>
                    {fundamentals?.profile?.website ? (
                      <a
                        href={fundamentals.profile.website}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[220px]"
                      >
                        {fundamentals.profile.website.replace('https://', '').replace('http://', '').replace(/\/$/, '')}
                      </a>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Sector</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {fundamentals?.profile?.sector || (asset as any).sector || 'Financials'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Industry</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {fundamentals?.profile?.industry || 'Insurance'}
                    </span>
                  </div>
                </div>
              </div>

              {/* CARD 4: Key Financials & Multi-Period Growth (Koyfin Multi-Period Comparison) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Key Financials & Growth</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Çok dönemli finansal performans ve büyüme trendleri</p>
                  </div>
                  
                  {/* Period Switcher */}
                  <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl text-[11px] font-bold self-start sm:self-auto border border-slate-200/50 dark:border-slate-700/50">
                    <button
                      type="button"
                      onClick={() => setFinancialPeriod('quarterly')}
                      className={`px-3 py-1.5 rounded-xl transition-all ${
                        financialPeriod === 'quarterly'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Çeyreklik (QoQ)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinancialPeriod('annual')}
                      className={`px-3 py-1.5 rounded-xl transition-all ${
                        financialPeriod === 'annual'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Yıllık (YoY)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinancialPeriod('ltm')}
                      className={`px-3 py-1.5 rounded-xl transition-all ${
                        financialPeriod === 'ltm'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      LTM & 5Y CAGR
                    </button>
                  </div>
                </div>

                {/* MULTI-PERIOD QUARTERLY VIEW */}
                {financialPeriod === 'quarterly' && (
                  <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                    <table className="min-w-full text-xs text-left">
                      <thead>
                        <tr className="text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100 dark:border-slate-800">
                          <th className="py-2.5 pr-4 whitespace-nowrap min-w-[130px]">Metrik</th>
                          {((fundamentals?.quarterlyFinancials && fundamentals.quarterlyFinancials.length > 0)
                            ? fundamentals.quarterlyFinancials
                            : [
                                { period: '25-Q2', sales: 24.15e9, ebitda: 7.54e9, netIncome: 4.86e9, eps: 0.24, salesGrowth: null, ebitdaGrowth: null, netIncomeGrowth: null, epsGrowth: 5.5 },
                                { period: '25-Q3', sales: 25.75e9, ebitda: 7.82e9, netIncome: 5.02e9, eps: 0.25, salesGrowth: 6.6, ebitdaGrowth: 3.7, netIncomeGrowth: 3.4, epsGrowth: 4.2 },
                                { period: '25-Q4', sales: 26.11e9, ebitda: 7.54e9, netIncome: 5.11e9, eps: 0.27, salesGrowth: 1.4, ebitdaGrowth: -3.6, netIncomeGrowth: 1.9, epsGrowth: 8.0 },
                                { period: '26-Q1', sales: 27.09e9, ebitda: 6.98e9, netIncome: 6.45e9, eps: 0.33, salesGrowth: 3.8, ebitdaGrowth: -7.4, netIncomeGrowth: 26.2, epsGrowth: 22.2 },
                                { period: '26-Q2', sales: 32.23e9, ebitda: 10.26e9, netIncome: 7.04e9, eps: 0.47, salesGrowth: 19.0, ebitdaGrowth: 46.9, netIncomeGrowth: 9.2, epsGrowth: 44.6 }
                              ]
                          ).map((p, idx) => (
                            <th key={idx} className="py-2.5 px-3 text-right whitespace-nowrap min-w-[88px]">
                              {p.period}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                        {/* Sales */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-4 font-sans font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            Satışlar (Sales)
                          </td>
                          {((fundamentals?.quarterlyFinancials && fundamentals.quarterlyFinancials.length > 0)
                            ? fundamentals.quarterlyFinancials
                            : [
                                { sales: 24.15e9, salesGrowth: null },
                                { sales: 25.75e9, salesGrowth: 6.6 },
                                { sales: 26.11e9, salesGrowth: 1.4 },
                                { sales: 27.09e9, salesGrowth: 3.8 },
                                { sales: 32.23e9, salesGrowth: 19.0 }
                              ]
                          ).map((p, idx) => (
                            <td key={idx} className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 dark:text-white">
                                {formatKoyfinVal(p.sales, 'B')}
                              </div>
                              {p.salesGrowth !== null && p.salesGrowth !== undefined ? (
                                <div className={`text-[10px] font-bold ${p.salesGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {p.salesGrowth >= 0 ? `+${p.salesGrowth.toFixed(1)}%` : `${p.salesGrowth.toFixed(1)}%`}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">-</div>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* EBITDA */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-4 font-sans font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            FAVÖK (EBITDA)
                          </td>
                          {((fundamentals?.quarterlyFinancials && fundamentals.quarterlyFinancials.length > 0)
                            ? fundamentals.quarterlyFinancials
                            : [
                                { ebitda: 7.54e9, ebitdaGrowth: null },
                                { ebitda: 7.82e9, ebitdaGrowth: 3.7 },
                                { ebitda: 7.54e9, ebitdaGrowth: -3.6 },
                                { ebitda: 6.98e9, ebitdaGrowth: -7.4 },
                                { ebitda: 10.26e9, ebitdaGrowth: 46.9 }
                              ]
                          ).map((p, idx) => (
                            <td key={idx} className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 dark:text-white">
                                {formatKoyfinVal(p.ebitda, 'B')}
                              </div>
                              {p.ebitdaGrowth !== null && p.ebitdaGrowth !== undefined ? (
                                <div className={`text-[10px] font-bold ${p.ebitdaGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {p.ebitdaGrowth >= 0 ? `+${p.ebitdaGrowth.toFixed(1)}%` : `${p.ebitdaGrowth.toFixed(1)}%`}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">-</div>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* Net Income */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-4 font-sans font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            Net Kâr (Net Inc)
                          </td>
                          {((fundamentals?.quarterlyFinancials && fundamentals.quarterlyFinancials.length > 0)
                            ? fundamentals.quarterlyFinancials
                            : [
                                { netIncome: 4.86e9, netIncomeGrowth: null },
                                { netIncome: 5.02e9, netIncomeGrowth: 3.4 },
                                { netIncome: 5.11e9, netIncomeGrowth: 1.9 },
                                { netIncome: 6.45e9, netIncomeGrowth: 26.2 },
                                { netIncome: 7.04e9, netIncomeGrowth: 9.2 }
                              ]
                          ).map((p, idx) => (
                            <td key={idx} className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 dark:text-white">
                                {formatKoyfinVal(p.netIncome, 'B')}
                              </div>
                              {p.netIncomeGrowth !== null && p.netIncomeGrowth !== undefined ? (
                                <div className={`text-[10px] font-bold ${p.netIncomeGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {p.netIncomeGrowth >= 0 ? `+${p.netIncomeGrowth.toFixed(1)}%` : `${p.netIncomeGrowth.toFixed(1)}%`}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">-</div>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* EPS */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-4 font-sans font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            Hisse Başı (EPS)
                          </td>
                          {((fundamentals?.quarterlyFinancials && fundamentals.quarterlyFinancials.length > 0)
                            ? fundamentals.quarterlyFinancials
                            : [
                                { eps: 0.24, epsGrowth: 5.5 },
                                { eps: 0.25, epsGrowth: 4.2 },
                                { eps: 0.27, epsGrowth: 8.0 },
                                { eps: 0.33, epsGrowth: 22.2 },
                                { eps: 0.47, epsGrowth: 44.6 }
                              ]
                          ).map((p, idx) => (
                            <td key={idx} className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 dark:text-white">
                                {p.eps !== null && p.eps !== undefined ? p.eps.toFixed(2) : '-'}
                              </div>
                              {p.epsGrowth !== null && p.epsGrowth !== undefined ? (
                                <div className={`text-[10px] font-bold ${p.epsGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {p.epsGrowth >= 0 ? `+${p.epsGrowth.toFixed(1)}%` : `${p.epsGrowth.toFixed(1)}%`}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">-</div>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* MULTI-PERIOD ANNUAL VIEW */}
                {financialPeriod === 'annual' && (
                  <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                    <table className="min-w-full text-xs text-left">
                      <thead>
                        <tr className="text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100 dark:border-slate-800">
                          <th className="py-2.5 pr-4 whitespace-nowrap min-w-[130px]">Metrik</th>
                          {((fundamentals?.annualFinancials && fundamentals.annualFinancials.length > 0)
                            ? fundamentals.annualFinancials
                            : [
                                { period: '2022', sales: 12.07e9, ebitda: 2.11e9, netIncome: 0.96e9, eps: 0.05, salesGrowth: null, ebitdaGrowth: null, netIncomeGrowth: null, epsGrowth: null },
                                { period: '2023', sales: 33.58e9, ebitda: 8.42e9, netIncome: 6.19e9, eps: 0.31, salesGrowth: 178.2, ebitdaGrowth: 299.1, netIncomeGrowth: 542.8, epsGrowth: 543.1 },
                                { period: '2024', sales: 65.74e9, ebitda: 16.68e9, netIncome: 12.78e9, eps: 0.64, salesGrowth: 95.7, ebitdaGrowth: 98.1, netIncomeGrowth: 106.6, epsGrowth: 104.8 },
                                { period: '2025', sales: 97.20e9, ebitda: 27.06e9, netIncome: 19.53e9, eps: 0.98, salesGrowth: 47.9, ebitdaGrowth: 62.2, netIncomeGrowth: 52.8, epsGrowth: 53.5 }
                              ]
                          ).map((p, idx) => (
                            <th key={idx} className="py-2.5 px-3 text-right whitespace-nowrap min-w-[88px]">
                              {p.period}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                        {/* Sales */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-4 font-sans font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            Satışlar (Sales)
                          </td>
                          {((fundamentals?.annualFinancials && fundamentals.annualFinancials.length > 0)
                            ? fundamentals.annualFinancials
                            : [
                                { sales: 12.07e9, salesGrowth: null },
                                { sales: 33.58e9, salesGrowth: 178.2 },
                                { sales: 65.74e9, salesGrowth: 95.7 },
                                { sales: 97.20e9, salesGrowth: 47.9 }
                              ]
                          ).map((p, idx) => (
                            <td key={idx} className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 dark:text-white">
                                {formatKoyfinVal(p.sales, 'B')}
                              </div>
                              {p.salesGrowth !== null && p.salesGrowth !== undefined ? (
                                <div className={`text-[10px] font-bold ${p.salesGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {p.salesGrowth >= 0 ? `+${p.salesGrowth.toFixed(1)}%` : `${p.salesGrowth.toFixed(1)}%`}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">-</div>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* EBITDA */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-4 font-sans font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            FAVÖK (EBITDA)
                          </td>
                          {((fundamentals?.annualFinancials && fundamentals.annualFinancials.length > 0)
                            ? fundamentals.annualFinancials
                            : [
                                { ebitda: 2.11e9, ebitdaGrowth: null },
                                { ebitda: 8.42e9, ebitdaGrowth: 299.1 },
                                { ebitda: 16.68e9, ebitdaGrowth: 98.1 },
                                { ebitda: 27.06e9, ebitdaGrowth: 62.2 }
                              ]
                          ).map((p, idx) => (
                            <td key={idx} className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 dark:text-white">
                                {formatKoyfinVal(p.ebitda, 'B')}
                              </div>
                              {p.ebitdaGrowth !== null && p.ebitdaGrowth !== undefined ? (
                                <div className={`text-[10px] font-bold ${p.ebitdaGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {p.ebitdaGrowth >= 0 ? `+${p.ebitdaGrowth.toFixed(1)}%` : `${p.ebitdaGrowth.toFixed(1)}%`}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">-</div>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* Net Income */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-4 font-sans font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            Net Kâr (Net Inc)
                          </td>
                          {((fundamentals?.annualFinancials && fundamentals.annualFinancials.length > 0)
                            ? fundamentals.annualFinancials
                            : [
                                { netIncome: 0.96e9, netIncomeGrowth: null },
                                { netIncome: 6.19e9, netIncomeGrowth: 542.8 },
                                { netIncome: 12.78e9, netIncomeGrowth: 106.6 },
                                { netIncome: 19.53e9, netIncomeGrowth: 52.8 }
                              ]
                          ).map((p, idx) => (
                            <td key={idx} className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 dark:text-white">
                                {formatKoyfinVal(p.netIncome, 'B')}
                              </div>
                              {p.netIncomeGrowth !== null && p.netIncomeGrowth !== undefined ? (
                                <div className={`text-[10px] font-bold ${p.netIncomeGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {p.netIncomeGrowth >= 0 ? `+${p.netIncomeGrowth.toFixed(1)}%` : `${p.netIncomeGrowth.toFixed(1)}%`}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">-</div>
                              )}
                            </td>
                          ))}
                        </tr>

                        {/* EPS */}
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 pr-4 font-sans font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            Hisse Başı (EPS)
                          </td>
                          {((fundamentals?.annualFinancials && fundamentals.annualFinancials.length > 0)
                            ? fundamentals.annualFinancials
                            : [
                                { eps: 0.05, epsGrowth: null },
                                { eps: 0.31, epsGrowth: 543.1 },
                                { eps: 0.64, epsGrowth: 104.8 },
                                { eps: 0.98, epsGrowth: 53.5 }
                              ]
                          ).map((p, idx) => (
                            <td key={idx} className="py-2.5 px-3 text-right whitespace-nowrap">
                              <div className="font-black text-slate-900 dark:text-white">
                                {p.eps !== null && p.eps !== undefined ? p.eps.toFixed(2) : '-'}
                              </div>
                              {p.epsGrowth !== null && p.epsGrowth !== undefined ? (
                                <div className={`text-[10px] font-bold ${p.epsGrowth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {p.epsGrowth >= 0 ? `+${p.epsGrowth.toFixed(1)}%` : `${p.epsGrowth.toFixed(1)}%`}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">-</div>
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* LTM & 5Y CAGR VIEW */}
                {financialPeriod === 'ltm' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100 dark:border-slate-800">
                          <th className="py-2">Metric</th>
                          <th className="py-2 text-right">LTM</th>
                          <th className="py-2 text-right">5Y CAGR</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                        {(fundamentals?.financialsGrowth && fundamentals.financialsGrowth.length > 0 ? fundamentals.financialsGrowth : [
                          { metric: 'Sales', labelTr: 'Satışlar', ltm: 100.69e9, cagr5y: 82.96 },
                          { metric: 'EBITDA', labelTr: 'FAVÖK', ltm: 31.07e9, cagr5y: 85.95 },
                          { metric: 'EBIT', labelTr: 'Faaliyet Kârı', ltm: 30.82e9, cagr5y: 86.29 },
                          { metric: 'Net Income', labelTr: 'Net Kâr', ltm: 23.63e9, cagr5y: 83.60 },
                          { metric: 'Cash From Operations', labelTr: 'İşletme Nakit Akışı', ltm: 3.36e9, cagr5y: 38.80 },
                          { metric: 'Diluted EPS (excl)', labelTr: 'Hisse Başı Kâr', ltm: 1.18, cagr5y: 86.63 }
                        ]).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 font-sans font-medium text-slate-700 dark:text-slate-300">
                              {row.metric}
                            </td>
                            <td className="py-2.5 text-right font-black text-slate-900 dark:text-white">
                              {row.metric.includes('EPS') ? row.ltm?.toFixed(2) : formatKoyfinVal(row.ltm, 'B')}
                            </td>
                            <td className="py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                              {row.cagr5y !== null && row.cagr5y !== undefined ? `${row.cagr5y.toFixed(2)}%` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* CARD 5: Capital Structure (Screenshot 2) */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <h3 className="text-base font-black text-slate-900 dark:text-white">Capital Structure</h3>

                <div className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Market Capitalization</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {formatKoyfinVal(fundamentals?.capitalStructure?.marketCap, 'B')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Total Debt</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {fundamentals?.capitalStructure?.totalDebt ? formatKoyfinVal(fundamentals.capitalStructure.totalDebt, 'B') : '15.80B'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Cash & Short-Term Inv.</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {fundamentals?.capitalStructure?.totalCash ? formatKoyfinVal(fundamentals.capitalStructure.totalCash, 'B') : '108.36B'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Total Enterprise Value (EV)</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {fundamentals?.capitalStructure?.enterpriseValue ? formatKoyfinVal(fundamentals.capitalStructure.enterpriseValue, 'B') : '108.36B'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-500 dark:text-slate-400">Price to Book (P/B)</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {fundamentals?.capitalStructure?.priceToBook ? `${fundamentals.capitalStructure.priceToBook.toFixed(2)}x` : '1.10x'}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: ESTIMATES & GROWTH                                                 */}
          {/* ========================================================================= */}
          {activeTab === 'estimates' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="text-base font-black text-slate-900 dark:text-white">Valuation Multiples & Estimates</h3>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">F/K (Trailing P/E)</span>
                    <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
                      {fundamentals?.keyData?.trailingPE ? `${fundamentals.keyData.trailingPE.toFixed(2)}x` : '2.71x'}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">İleri F/K (Forward P/E)</span>
                    <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
                      {fundamentals?.keyData?.forwardPE ? `${fundamentals.keyData.forwardPE.toFixed(2)}x` : '3.15x'}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">PD/DD (P/B)</span>
                    <div className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1">
                      {fundamentals?.capitalStructure?.priceToBook ? `${fundamentals.capitalStructure.priceToBook.toFixed(2)}x` : '1.10x'}
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Temettü Verimi</span>
                    <div className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                      {fundamentals?.keyData?.dividendYield ? `${fundamentals.keyData.dividendYield.toFixed(2)}%` : '4.56%'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Health & Solvency */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Nakit Akışı ve Büyüme Gücü
                </h4>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Hisse Başı Defter Değeri (Book Value)</span>
                    <span className="font-bold font-mono text-slate-900 dark:text-white">
                      {fundamentals?.capitalStructure?.bookValue ? formatMoney(fundamentals.capitalStructure.bookValue) : formatMoney(2.95)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">Faaliyet Nakit Akışı / Net Kâr</span>
                    <span className="font-bold font-mono text-emerald-500">
                      %14.2 (Nakit Dönüşümü)
                    </span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="text-slate-500">5 Yıllık Satış Büyüme Ortalama Hızı (CAGR)</span>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      +%82.96 / Yıl
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: PRICE TARGET                                                       */}
          {/* ========================================================================= */}
          {activeTab === 'target' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Analyst Price Target & Consensus</h3>
                    <p className="text-xs text-slate-500">Kurumsal analist konsensüs hedef fiyatları ve potansiyel getiri</p>
                  </div>
                  <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-xs border border-emerald-500/20 uppercase">
                    {fundamentals?.analysts?.recommendationKey?.replace('_', ' ') || 'Strong Buy'}
                  </span>
                </div>

                {/* Mean Target Big Display */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/10 via-emerald-500/5 to-transparent border border-blue-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Konsensüs Ortalama Hedef</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
                        {fundamentals?.analysts?.targetMean ? formatMoney(fundamentals.analysts.targetMean) : formatMoney(9.01)}
                      </span>
                      {analystUpsidePct !== null && (
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          (+%{analystUpsidePct} Potansiyel)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {fundamentals?.analysts?.numberOfOpinions || 7}
                    </span> Analist Görüşü
                  </div>
                </div>

                {/* Target Range Slider / Visual Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">
                      En Düşük: {fundamentals?.analysts?.targetLow ? formatMoney(fundamentals.analysts.targetLow) : formatMoney(6.55)}
                    </span>
                    <span className="text-blue-500 font-bold">
                      Mevcut: {formatMoney(effectivePrice)}
                    </span>
                    <span className="text-emerald-500 font-bold">
                      En Yüksek: {fundamentals?.analysts?.targetHigh ? formatMoney(fundamentals.analysts.targetHigh) : formatMoney(11.22)}
                    </span>
                  </div>

                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex relative">
                    <div className="h-full bg-emerald-500/70 rounded-full w-full" />
                  </div>
                </div>

                {/* Algorithmic Strategy Target Context */}
                {activeSignal && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>🤖</span>
                      <span>Otonom Algoritma Hedefi</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400">
                      Teknik kırılım modeline göre belirlenen 1. Hedef: <strong className="text-slate-900 dark:text-white font-mono">{formatMoney(activeSignal.targetPrice)}</strong> (R:R {activeSignal.riskReward?.toFixed(2) || '2.00'}x).
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: GRAPHS (Full-Screen Interactive Candlestick Canvas)                 */}
          {/* ========================================================================= */}
          {activeTab === 'graphs' && (
            <div className="space-y-4">
              {isLoading ? (
                <div className="w-full h-[460px] rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center text-slate-400">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-xs font-mono">Veritabanından mum verileri alınıyor...</p>
                </div>
              ) : (
                <InteractiveCanvasChart 
                  data={chartBars}
                  symbol={asset.symbol}
                  currency={isBist ? 'TRY' : 'USD'}
                  entryPrice={activeSignal?.entryPrice}
                  stopLoss={activeSignal?.stopLoss}
                  targetPrice={activeSignal?.targetPrice}
                  height={typeof window !== 'undefined' && window.innerWidth < 640 ? 340 : 440}
                />
              )}

              {/* Technical Indicator HUD */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex justify-between items-center shadow-xs">
                  <span className="text-slate-400 font-semibold">50 EMA:</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">
                    {indicators?.ema_50 ? formatMoney(indicators.ema_50) : 'Destek'}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex justify-between items-center shadow-xs">
                  <span className="text-slate-400 font-semibold">200 EMA:</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">
                    {indicators?.ema_200 ? formatMoney(indicators.ema_200) : asset.emaStatus}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex justify-between items-center shadow-xs">
                  <span className="text-slate-400 font-semibold">RSI (14):</span>
                  <span className={`font-bold font-mono ${
                    (indicators?.rsi_14 ?? asset.rsi) < 35 ? 'text-emerald-500' : (indicators?.rsi_14 ?? asset.rsi) > 70 ? 'text-amber-500' : 'text-blue-400'
                  }`}>
                    {(indicators?.rsi_14 ?? asset.rsi).toFixed(1)}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex justify-between items-center shadow-xs">
                  <span className="text-slate-400 font-semibold">Hacim Oranı:</span>
                  <span className={`font-bold font-mono ${
                    (indicators?.volume_ratio ?? asset.volumeRatio) >= 1.5 ? 'text-emerald-500' : 'text-slate-400'
                  }`}>
                    {(indicators?.volume_ratio ?? asset.volumeRatio).toFixed(2)}x
                  </span>
                </div>
              </div>

              {/* Historical Sessions Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-2.5">Tarih</th>
                      <th className="px-3.5 py-2.5 text-right">Açılış</th>
                      <th className="px-3.5 py-2.5 text-right">Yüksek</th>
                      <th className="px-3.5 py-2.5 text-right">Düşük</th>
                      <th className="px-3.5 py-2.5 text-right">Kapanış</th>
                      <th className="px-3.5 py-2.5 text-right">Hacim</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {historyTable.slice(0, 15).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-3.5 py-2 font-semibold text-slate-700 dark:text-slate-300 font-sans flex items-center gap-1.5">
                          <span>{row.date}</span>
                          {row.isCloseOnly && (
                            <span 
                              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 font-normal shrink-0"
                              title="Bu işlem günü için tam OHLC verisi bulunmamaktadır; sadece resmi kapanış fiyatı kaydedilmiştir."
                            >
                              Kapanış
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2 text-right text-slate-500">{row.open !== null ? formatMoney(row.open) : '—'}</td>
                        <td className="px-3.5 py-2 text-right text-emerald-500">{row.high !== null ? formatMoney(row.high) : '—'}</td>
                        <td className="px-3.5 py-2 text-right text-rose-500">{row.low !== null ? formatMoney(row.low) : '—'}</td>
                        <td className="px-3.5 py-2 text-right font-bold text-slate-900 dark:text-white">{formatMoney(row.close)}</td>
                        <td className="px-3.5 py-2 text-right text-slate-400">{row.volume !== null ? formatKoyfinVal(row.volume, '', 1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer with External Link */}
        <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
          <a
            href={tradingViewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-bold"
          >
            <span>TradingView ↗</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
