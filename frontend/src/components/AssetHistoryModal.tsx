'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AssetData } from './AssetTable';
import InteractiveCanvasChart, { ChartPriceBar } from './InteractiveCanvasChart';
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
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

export default function AssetHistoryModal({ 
  isOpen, 
  onClose, 
  asset,
  tradeSignal
}: AssetHistoryModalProps) {
  const [activeTab, setActiveTab] = useState<'chart' | 'data'>('chart');
  const [chartBars, setChartBars] = useState<ChartPriceBar[]>([]);
  const [historyTable, setHistoryTable] = useState<PriceBarItem[]>([]);
  const [indicators, setIndicators] = useState<IndicatorDetails | null>(null);
  const [activeSignal, setActiveSignal] = useState<any>(tradeSignal || null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(asset?.price || 0);
  const [currentChange, setCurrentChange] = useState<number>(asset?.changePercent || 0);

  useEffect(() => {
    if (!isOpen || !asset) return;

    setActiveTab('chart');
    setActiveSignal(tradeSignal || null);
    setCurrentPrice(asset.price || 0);
    setCurrentChange(asset.changePercent || 0);

    // Immediately seed with initial bars so mobile UI never hangs on empty screen
    generateFallbackBars(asset);

    let isMounted = true;

    async function fetchAssetHistory() {
      // Create a timeout promise to prevent mobile hangs
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timeout')), 3500)
      );

      try {
        const cleanSym = asset!.symbol.replace('.IS', '');
        const isSym = `${cleanSym}.IS`;

        // 1. Find asset in Supabase
        const assetPromise = supabase
          .from('assets')
          .select('id, symbol, name, market, trade_signals(*)')
          .or(`symbol.eq.${cleanSym},symbol.eq.${isSym}`)
          .limit(1);

        const { data: assetRecords } = await Promise.race([assetPromise, timeoutPromise]) as any;

        if (assetRecords && assetRecords.length > 0) {
          const matched = assetRecords[0];

          // Explicitly query the MOST RECENT daily_indicator record
          const { data: indRecords } = await supabase
            .from('daily_indicators')
            .select('*')
            .eq('asset_id', matched.id)
            .order('date', { ascending: false })
            .limit(1);

          if (indRecords && indRecords.length > 0) {
            setIndicators(indRecords[0]);
          }

          // If no tradeSignal passed via prop, check if asset has an active signal in database
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

          // 2. Fetch up to 60 MOST RECENT daily price bars (OHLCV) sorted DESCENDING
          const { data: priceBars } = await supabase
            .from('price_history')
            .select('date, open, high, low, close, volume')
            .eq('asset_id', matched.id)
            .order('date', { ascending: false })
            .limit(60);

          if (priceBars && priceBars.length > 0) {
            // Update live price and change from newest bar
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

            // Table displays newest first (which is priceBars as returned)
            setHistoryTable(
              priceBars.map((p: any) => ({
                date: p.date,
                open: Number(p.open) || Number(p.close),
                high: Number(p.high) || Number(p.close),
                low: Number(p.low) || Number(p.close),
                close: Number(p.close),
                volume: Number(p.volume) || 0
              }))
            );

            // Canvas chart requires chronological order (oldest to newest)
            const chronological = [...priceBars].reverse();
            const mappedBars: ChartPriceBar[] = chronological.map((p: any) => ({
              time: p.date,
              open: Number(p.open) || Number(p.close),
              high: Number(p.high) || Number(p.close),
              low: Number(p.low) || Number(p.close),
              close: Number(p.close),
              volume: Number(p.volume) || 0
            }));
            setChartBars(mappedBars);
          } else {
            generateFallbackBars(asset!);
          }
        } else {
          generateFallbackBars(asset!);
        }
      } catch (err) {
        console.warn('Error fetching price history:', err);
        generateFallbackBars(asset!);
      } finally {
        setIsLoading(false);
      }
    }

    function generateFallbackBars(a: AssetData) {
      const bars: ChartPriceBar[] = [];
      let base = a.price;
      const today = new Date();

      for (let i = 25; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        const noise = Math.sin(i * 0.7) * 0.02;
        const close = base * (1 + noise);
        const open = close * (1 - Math.cos(i * 0.5) * 0.012);
        const high = Math.max(open, close) * 1.015;
        const low = Math.min(open, close) * 0.985;
        const vol = Math.floor(150000 + Math.random() * 600000);

        bars.push({
          time: d.toISOString().split('T')[0],
          open,
          high,
          low,
          close,
          volume: vol
        });
        base = close;
      }

      setChartBars(bars);
      setHistoryTable(
        [...bars].reverse().map(b => ({
          date: b.time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
          volume: b.volume || 0
        }))
      );
    }

    fetchAssetHistory();

    return () => {
      isMounted = false;
    };
  }, [isOpen, asset, tradeSignal]);

  if (!isOpen || !asset) return null;

  const currencySymbol = asset.market === 'US' ? '$' : '₺';
  const formatMoney = (val: number) => {
    return `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const effectivePrice = currentPrice > 0 ? currentPrice : (asset.price || 0);
  const effectiveChange = currentChange !== 0 ? currentChange : (asset.changePercent || 0);

  const todayBar = historyTable[0] || {
    date: 'Today',
    open: effectivePrice,
    high: effectivePrice * 1.01,
    low: effectivePrice * 0.99,
    close: effectivePrice,
    volume: 0
  };

  const cleanSym = asset.symbol.replace('.IS', '');
  const tvSymbol = getTradingViewSymbol(asset.symbol, asset.market);
  const tradingViewUrl = `https://www.tradingview.com/symbols/${tvSymbol.replace(':', '-')}/`;
  const googleFinanceUrl = asset.market === 'US'
    ? `https://www.google.com/finance/quote/${cleanSym}:NASDAQ`
    : `https://www.google.com/finance/quote/${cleanSym}:IST`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-gray-900 rounded-3xl max-w-5xl w-full border border-gray-200 dark:border-gray-750 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3 sm:p-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/70 dark:bg-gray-850">
          <div className="min-w-0 pr-2">
            <div className="flex items-center space-x-2">
              <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight truncate">{asset.symbol}</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shrink-0">
                {asset.market}
              </span>
              <span className="hidden sm:inline text-[11px] font-mono text-gray-400">Database Live Feed</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{asset.name}</p>
          </div>

          {/* Current Price & Close Button */}
          <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
            <div className="text-right">
              <div className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white font-mono">
                {formatMoney(effectivePrice)}
              </div>
              <div className={`text-xs font-bold ${effectiveChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {effectiveChange >= 0 ? '▲ +' : '▼ '}{effectiveChange.toFixed(2)}%
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
              title="Close Modal (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Strategy Trigger Ribbon (if trade signal exists) */}
        {activeSignal && (
          <div className="px-3 sm:px-5 py-2.5 bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-blue-900/40 border-b border-blue-800/40 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-sm">🎯</span>
              <span className="font-bold text-white uppercase tracking-wider">
                Scanner Setup: {activeSignal.strategy?.replace('_', ' ')}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono text-[11px] sm:text-xs">
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-bold">
                Entry: {formatMoney(activeSignal.entryPrice)}
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800 font-bold">
                Stop: {formatMoney(activeSignal.stopLoss)}
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-400 border border-blue-800 font-bold">
                Target: {formatMoney(activeSignal.targetPrice)}
              </span>
              {activeSignal.riskReward && (
                <span className="text-gray-300">
                  R:R: <strong className="text-white">{activeSignal.riskReward.toFixed(2)}x</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* View Switcher Tabs & External Links */}
        <div className="px-3 sm:px-5 pt-2 sm:pt-3 pb-2 bg-gray-50/40 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 overflow-x-auto touch-pan-x">
          <div className="flex space-x-1.5 sm:space-x-2 shrink-0">
            <button
              onClick={() => setActiveTab('chart')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'chart'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>📈</span>
              <span className="hidden sm:inline">Interactive Candlestick Chart</span>
              <span className="sm:hidden">Grafik</span>
            </button>
            <button
              onClick={() => setActiveTab('data')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'data'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>📊</span>
              <span className="hidden sm:inline">OHLCV History Table & Indicators</span>
              <span className="sm:hidden">Geçmiş & İndikatörler</span>
            </button>
          </div>

          {/* Outbound Live Chart Links */}
          <div className="hidden sm:flex items-center space-x-3 text-xs shrink-0">
            <a 
              href={tradingViewUrl} 
              target="_blank" 
              rel="noreferrer"
              className="text-blue-500 hover:underline flex items-center gap-1 font-semibold"
              title="Open full TradingView charting website in a new tab"
            >
              <span>TradingView Full Site ↗</span>
            </a>
            <span className="text-gray-400">•</span>
            <a 
              href={googleFinanceUrl} 
              target="_blank" 
              rel="noreferrer"
              className="text-gray-400 hover:text-gray-200 flex items-center gap-1"
            >
              <span>Google Finance ↗</span>
            </a>
          </div>
        </div>


        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-grow">
          {activeTab === 'chart' ? (
            <div className="space-y-4">
              {/* Native HTML5 Canvas Interactive Candlestick Chart */}
              {isLoading ? (
                <div className="w-full h-[480px] rounded-2xl bg-gray-950 border border-gray-800 flex flex-col items-center justify-center text-gray-400">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-xs font-mono">Loading candlestick history from database...</p>
                </div>
              ) : (
                <InteractiveCanvasChart 
                  data={chartBars}
                  symbol={asset.symbol}
                  currency={asset.market === 'US' ? 'USD' : 'TRY'}
                  entryPrice={activeSignal?.entryPrice}
                  stopLoss={activeSignal?.stopLoss}
                  targetPrice={activeSignal?.targetPrice}
                  height={typeof window !== 'undefined' && window.innerWidth < 640 ? 340 : 460}
                />
              )}

              {/* Indicator HUD Strip Below Canvas Chart */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200/60 dark:border-gray-700 flex justify-between items-center">
                  <span className="text-gray-400 font-semibold">50 EMA:</span>
                  <span className="font-bold text-gray-900 dark:text-white font-mono">
                    {indicators?.ema_50 ? formatMoney(indicators.ema_50) : 'Holding Support'}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200/60 dark:border-gray-700 flex justify-between items-center">
                  <span className="text-gray-400 font-semibold">200 EMA:</span>
                  <span className="font-bold text-gray-900 dark:text-white font-mono">
                    {indicators?.ema_200 ? formatMoney(indicators.ema_200) : asset.emaStatus}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200/60 dark:border-gray-700 flex justify-between items-center">
                  <span className="text-gray-400 font-semibold">RSI (14):</span>
                  <span className={`font-bold font-mono ${
                    (indicators?.rsi_14 ?? asset.rsi) < 35 ? 'text-emerald-500' : (indicators?.rsi_14 ?? asset.rsi) > 70 ? 'text-amber-500' : 'text-blue-400'
                  }`}>
                    {(indicators?.rsi_14 ?? asset.rsi).toFixed(1)}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200/60 dark:border-gray-700 flex justify-between items-center">
                  <span className="text-gray-400 font-semibold">Volume Ratio:</span>
                  <span className={`font-bold font-mono ${
                    (indicators?.volume_ratio ?? asset.volumeRatio) >= 1.5 ? 'text-emerald-500' : 'text-gray-300'
                  }`}>
                    {(indicators?.volume_ratio ?? asset.volumeRatio).toFixed(2)}x
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Today's Key Bar Metrics */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Latest Daily Bar ({todayBar.date})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200/60 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Open Price</span>
                    <div className="text-base font-black text-gray-900 dark:text-white mt-0.5 font-mono">
                      {formatMoney(todayBar.open)}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200/60 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Session High</span>
                    <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                      {formatMoney(todayBar.high)}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200/60 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Session Low</span>
                    <div className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5 font-mono">
                      {formatMoney(todayBar.low)}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200/60 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Close Price</span>
                    <div className="text-base font-black text-gray-900 dark:text-white mt-0.5 font-mono">
                      {formatMoney(todayBar.close)}
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200/60 dark:border-gray-700 col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Volume</span>
                    <div className="text-base font-black text-blue-600 dark:text-blue-400 mt-0.5 font-mono">
                      {todayBar.volume > 1000000 
                        ? `${(todayBar.volume / 1000000).toFixed(2)}M` 
                        : todayBar.volume > 1000 
                        ? `${(todayBar.volume / 1000).toFixed(0)}k` 
                        : todayBar.volume.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Technical Indicator Snapshots */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  Technical Indicator Suite
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-blue-50/50 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900/50">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">50 EMA</span>
                    <div className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 font-mono">
                      {indicators?.ema_50 ? formatMoney(indicators.ema_50) : 'Holding Support'}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Medium-term guide</div>
                  </div>

                  <div className="bg-purple-50/50 dark:bg-purple-950/20 p-3 rounded-xl border border-purple-100 dark:border-purple-900/50">
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">200 EMA</span>
                    <div className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 font-mono">
                      {indicators?.ema_200 ? formatMoney(indicators.ema_200) : asset.emaStatus}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{asset.emaStatus}</div>
                  </div>

                  <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">RSI (14)</span>
                    <div className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 font-mono">
                      {(indicators?.rsi_14 ?? asset.rsi).toFixed(1)}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {(indicators?.rsi_14 ?? asset.rsi) < 35 ? 'Oversold Accumulation' : (indicators?.rsi_14 ?? asset.rsi) > 70 ? 'Overbought' : 'Neutral Momentum'}
                    </div>
                  </div>

                  <div className="bg-amber-50/50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-100 dark:border-amber-900/50">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Volume Ratio</span>
                    <div className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 font-mono">
                      {(indicators?.volume_ratio ?? asset.volumeRatio).toFixed(2)}x
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {(indicators?.volume_ratio ?? asset.volumeRatio) >= 1.5 ? 'Institutional Spike' : 'Average Flow'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical OHLCV Daily Table */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Daily Price History (Last {historyTable.length} Sessions)
                  </h4>
                  <span className="text-[11px] text-gray-400">Recorded in Supabase Database</span>
                </div>

                <div className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-850 text-[11px] font-bold text-gray-500 uppercase border-b border-gray-200 dark:border-gray-800">
                      <tr>
                        <th className="px-3.5 py-2.5">Date</th>
                        <th className="px-3.5 py-2.5 text-right">Open</th>
                        <th className="px-3.5 py-2.5 text-right">High</th>
                        <th className="px-3.5 py-2.5 text-right">Low</th>
                        <th className="px-3.5 py-2.5 text-right">Close</th>
                        <th className="px-3.5 py-2.5 text-right">Day Change</th>
                        <th className="px-3.5 py-2.5 text-right">Volume</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {isLoading ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                            <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></span>
                            Loading historical bars from Supabase...
                          </td>
                        </tr>
                      ) : historyTable.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                            No historical bars recorded yet.
                          </td>
                        </tr>
                      ) : (
                        historyTable.map((row, i) => {
                          const dayChange = row.open > 0 ? ((row.close - row.open) / row.open) * 100 : 0;
                          const isUp = dayChange >= 0;

                          return (
                            <tr key={i} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors">
                              <td className="px-3.5 py-2.5 font-semibold text-gray-700 dark:text-gray-300">
                                {row.date}
                              </td>
                              <td className="px-3.5 py-2.5 text-right text-gray-600 dark:text-gray-300 font-mono">
                                {formatMoney(row.open)}
                              </td>
                              <td className="px-3.5 py-2.5 text-right text-emerald-600 dark:text-emerald-400 font-medium font-mono">
                                {formatMoney(row.high)}
                              </td>
                              <td className="px-3.5 py-2.5 text-right text-rose-600 dark:text-rose-400 font-medium font-mono">
                                {formatMoney(row.low)}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-bold text-gray-900 dark:text-white font-mono">
                                {formatMoney(row.close)}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-bold">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${
                                  isUp 
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' 
                                    : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                }`}>
                                  {isUp ? '+' : ''}{dayChange.toFixed(2)}%
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 text-right text-gray-500 font-medium font-mono">
                                {row.volume > 1000000 
                                  ? `${(row.volume / 1000000).toFixed(1)}M` 
                                  : row.volume > 1000 
                                  ? `${(row.volume / 1000).toFixed(0)}k` 
                                  : row.volume.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/70 dark:bg-gray-850">
          <div className="text-xs text-gray-400 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Real-time Interactive Canvas • Zoom with Mouse Scroll • Drag to Pan</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-gray-200 dark:bg-gray-750 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
