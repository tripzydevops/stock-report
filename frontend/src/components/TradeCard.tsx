'use client';

import React, { useState } from 'react';
import { calculateExitDate } from '../lib/tradeTiming';
import { PortfolioItem } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';

export interface TriggerHistoryItem {
  id?: string;
  date: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  confidence: number;
  rationale?: string;
}

export interface TradeSignal {
  symbol: string;
  name: string;
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  confidence: number;
  rationale: string;
  market: string;
  date: string;
  currency: string;
  currentPrice?: number;
  changePercent?: number;
  isReconfirmed?: boolean;
  lastConfirmedDate?: string;
  daysInZone?: number;
  triggerHistory?: TriggerHistoryItem[];
  direction?: 'LONG' | 'SHORT' | string;
  entryMode?: string;
  target1?: number;
  target2?: number;
  triggerReasons?: string[];
  failedChecks?: string[];
  invalidation?: string;
  marketContext?: {
    benchmark?: string;
    regime?: string;
    relative_strength_20d?: number | null;
    [key: string]: any;
  };
  risk?: {
    atr_14?: number;
    stop_distance_pct?: number;
    max_position_pct?: number;
    invalidation_level?: number;
    [key: string]: any;
  };
  riskReward?: number;
  riskMetrics?: any;
}

interface TradeCardProps {
  signal: TradeSignal;
  userHolding?: PortfolioItem | null;
  onSelectTicker?: (symbol: string) => void;
  onCalcSize?: (signal: TradeSignal) => void;
  onOpenCoPilot?: (signal: TradeSignal) => void;
  onTradeHolding?: (holding: PortfolioItem) => void;
}

export default function TradeCard({ signal, userHolding, onSelectTicker, onCalcSize, onOpenCoPilot, onTradeHolding }: TradeCardProps) {
  const { t, language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  const risk = Math.abs(signal.entryPrice - signal.stopLoss);
  const reward = Math.abs(signal.targetPrice - signal.entryPrice);
  const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : 'N/A';
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
      style: 'currency',
      currency: signal.currency
    }).format(price);
  };

  const getStrategyColor = (strategy: string) => {
    const s = strategy.toLowerCase();
    if (s.includes('vcp') || s.includes('minervini')) return 'bg-violet-100 text-violet-800 dark:bg-violet-900/80 dark:text-violet-200 border border-violet-300 dark:border-violet-700 font-bold';
    if (s.includes('flag') || s.includes('htf')) return 'bg-rose-100 text-rose-800 dark:bg-rose-900/80 dark:text-rose-200 border border-rose-300 dark:border-rose-700 font-bold';
    if (s.includes('connors') || s.includes('rsi-2') || s.includes('rsi2')) return 'bg-teal-100 text-teal-800 dark:bg-teal-900/80 dark:text-teal-200 border border-teal-300 dark:border-teal-700 font-bold';
    if (s.includes('vwap')) return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/80 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-700 font-bold';
    if (s.includes('sweep')) return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/80 dark:text-cyan-200 border border-cyan-300 dark:border-cyan-700 font-bold';
    if (s.includes('strength') || s.includes('relative')) return 'bg-amber-100 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-bold';
    if (s.includes('breakout')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (s.includes('pullback') || s.includes('reclaim')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/80 dark:text-purple-200 border border-purple-300 dark:border-purple-700 font-bold';
    if (s.includes('squeeze')) return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    if (s.includes('reversion') || s.includes('mean')) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col transition-all duration-200 hover:shadow-xl">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-wrap sm:flex-nowrap justify-between items-start gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onSelectTicker?.(signal.symbol)}
              className="font-black text-lg text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1.5 transition-colors group cursor-pointer text-left"
              title={language === 'tr' ? "Fiyat geçmişi ve indikatörleri görüntüleyin" : "Click to view full price history, daily OHLCV and indicators"}
            >
              <span className="group-hover:underline underline-offset-2">{signal.symbol}</span>
              <span className="text-xs text-blue-500 opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all">📈</span>
            </button>
            {signal.currentPrice !== undefined && signal.currentPrice !== null && (
              <button
                onClick={() => onSelectTicker?.(signal.symbol)}
                className={`text-xs px-2 py-0.5 rounded-md font-mono font-bold border transition-all cursor-pointer hover:ring-2 hover:ring-blue-400 ${
                  (signal.changePercent || 0) >= 0 
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                }`}
                title={language === 'tr' ? "Anlık fiyat — grafiği açmak için tıklayın" : "Current price — click to view price history & live chart"}
              >
                {formatPrice(signal.currentPrice)} {signal.changePercent !== undefined ? `(${signal.changePercent >= 0 ? '+' : ''}${signal.changePercent.toFixed(2)}%)` : ''}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">{signal.name}</p>
          {(() => {
            const isTargetHit = Boolean(signal.currentPrice && signal.targetPrice && signal.currentPrice >= signal.targetPrice);
            const isStoppedOut = Boolean(signal.currentPrice && signal.stopLoss && signal.currentPrice <= signal.stopLoss);
            const targetGainPct = signal.entryPrice > 0 ? (((signal.targetPrice - signal.entryPrice) / signal.entryPrice) * 100).toFixed(1) : '0';

            if (isTargetHit) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60 mt-1.5 max-w-full leading-snug">
                  <span className="shrink-0">🏆</span>
                  <span className="truncate">{t.tradeCard.target1Hit} <strong>{formatPrice(signal.targetPrice)}</strong> (+{targetGainPct}%) · {t.tradeCard.inTakeProfitZone}</span>
                </div>
              );
            }
            if (isStoppedOut) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800/60 mt-1.5 max-w-full leading-snug">
                  <span className="shrink-0">🛑</span>
                  <span className="truncate">{t.tradeCard.stoppedOut} <strong>{formatPrice(signal.stopLoss)}</strong> · {t.tradeCard.setupInvalidated}</span>
                </div>
              );
            }
            if (signal.isReconfirmed) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/60 mt-1.5 max-w-full leading-snug">
                  <span className="shrink-0">🔄</span>
                  <span className="truncate">{t.tradeCard.activeSetup} <strong>{signal.date}</strong> · {t.tradeCard.holdingInBuyZone}</span>
                </div>
              );
            }
            if (signal.date < new Date().toISOString().slice(0, 10)) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800/60 mt-1.5 max-w-full leading-snug">
                  <span className="shrink-0">🗓️</span>
                  <span className="truncate">{t.tradeCard.activeSwing} <strong>{signal.date}</strong></span>
                </div>
              );
            }
            return null;
          })()}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5">
            {(() => {
              const isTargetHit = Boolean(signal.currentPrice && signal.targetPrice && signal.currentPrice >= signal.targetPrice);
              const isStoppedOut = Boolean(signal.currentPrice && signal.stopLoss && signal.currentPrice <= signal.stopLoss);
              const currentGainPct = signal.entryPrice > 0 && signal.currentPrice ? (((signal.currentPrice - signal.entryPrice) / signal.entryPrice) * 100).toFixed(1) : '0';

              if (isTargetHit) {
                return (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs animate-pulse flex items-center gap-1">
                    <span>🏆</span>
                    <span>{language === 'tr' ? `HEDEF ALINDI (+%${currentGainPct})` : `TARGET HIT (+${currentGainPct}%)`}</span>
                  </span>
                );
              }
              if (isStoppedOut) {
                return (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-xs flex items-center gap-1">
                    <span>🛑</span>
                    <span>{language === 'tr' ? 'ZARAR KES OLDU' : 'STOPPED OUT'}</span>
                  </span>
                );
              }
              const isT0Hit = signal.entryPrice > 0 && signal.currentPrice && Number(currentGainPct) >= 3.0;
              if (isT0Hit) {
                return (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 dark:bg-amber-600 text-white shadow-xs animate-pulse flex items-center gap-1" title={language === 'tr' ? "Kişisel Hızlı Kâr Bölgeniz (+%3-%4) Alındı" : "Your Personal Quick TP Target (+3% to +4%) Reached"}>
                    <span>🎯</span>
                    <span>{language === 'tr' ? `KİŞİSEL TP (+%${currentGainPct})` : `PERSONAL TP (+${currentGainPct}%)`}</span>
                  </span>
                );
              }
              if (signal.isReconfirmed || (signal.daysInZone && signal.daysInZone > 1)) {
                return (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-600 text-white shadow-xs flex items-center gap-1">
                    <span>🔄</span>
                    <span>{language === 'tr' ? `AKTİF (${signal.daysInZone || 2}. GÜN)` : `ACTIVE (DAY ${signal.daysInZone || 2})`}</span>
                  </span>
                );
              }
              const todayStr = new Date().toISOString().slice(0, 10);
              const isToday = signal.date === todayStr;
              return isToday ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-xs animate-pulse flex items-center gap-0.5">
                  <span>🔥</span>
                  <span>{language === 'tr' ? 'BUGÜN YENİ' : 'NEW TODAY'}</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  🗓️ {language === 'tr' ? `${signal.date} TARİHİNDEN BERİ` : `SINCE ${signal.date}`}
                </span>
              );
            })()}
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getStrategyColor(signal.strategy)}`}>
              {signal.strategy}
            </span>
            {(() => {
              const strat = signal.strategy.toLowerCase();
              if (strat.includes('vwap')) {
                return (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100/90 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 flex items-center gap-1 shadow-2xs" title={language === 'tr' ? "Kurumsal Hacim Ağırlıklı Ortalama Fiyat (AVWAP) Desteği" : "Institutional Anchored Volume-Weighted Average Price support"}>
                    <span>🏛️</span>
                    <span>{language === 'tr' ? 'Kurumsal AVWAP' : 'Inst. AVWAP'}</span>
                  </span>
                );
              }
              if (strat.includes('sweep')) {
                return (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-100/90 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 flex items-center gap-1 shadow-2xs" title={language === 'tr' ? "Stop Patlatma ve Akıllı Para Likidite Geri Alımı" : "Stop hunt flush absorbed by smart money"}>
                    <span>🧲</span>
                    <span>{language === 'tr' ? 'Likidite Avı' : 'Liquidity Sweep'}</span>
                  </span>
                );
              }
              if (strat.includes('strength') || strat.includes('relative')) {
                return (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100/90 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1 shadow-2xs" title={language === 'tr' ? "Piyasa Düşerken Yükselen Kurumsal Güç Lideri" : "Leader advancing while benchmark struggles"}>
                    <span>💎</span>
                    <span>{language === 'tr' ? 'Göreceli Güç' : 'Relative Strength'}</span>
                  </span>
                );
              }
              if (strat.includes('mean reversion') || strat.includes('reversion')) {
                return (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100/90 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 flex items-center gap-1 shadow-2xs" title={language === 'tr' ? "Alt Bollinger Bandı (2.0σ) tepkisi ve aşırı satım dönüşü" : "Lower Bollinger Band (2.0σ) oversold rebound"}>
                    <span>📊</span>
                    <span>{language === 'tr' ? 'Alt Bollinger' : 'Lower BB'}</span>
                  </span>
                );
              }
              if (strat.includes('squeeze')) {
                return (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100/90 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 flex items-center gap-1 shadow-2xs" title={language === 'tr' ? "Bollinger Bandı sıkışması ve hacimli patlama" : "Bollinger Band squeeze release & volume surge"}>
                    <span>⚡</span>
                    <span>{language === 'tr' ? 'Bollinger Sıkışması' : 'BB Squeeze'}</span>
                  </span>
                );
              }
              if (strat.includes('pullback')) {
                return (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100/90 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 flex items-center gap-1 shadow-2xs" title={language === 'tr' ? "20/50 EMA dinamik destek testi" : "20/50 EMA dynamic support test"}>
                    <span>📉</span>
                    <span>{language === 'tr' ? 'EMA Desteği' : 'EMA Support'}</span>
                  </span>
                );
              }
              if (strat.includes('breakout')) {
                return (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1 shadow-2xs" title={language === 'tr' ? "Direnç ve hacim kırılımı" : "Resistance & volume breakout"}>
                    <span>🚀</span>
                    <span>{language === 'tr' ? 'Kırılım' : 'Breakout'}</span>
                  </span>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>
      
      <div className="p-4 flex-grow">
        <div className="grid grid-cols-3 gap-2 mb-4 text-sm items-start">
          <div className="flex flex-col min-w-0">
            <span className="text-gray-500 dark:text-gray-400 text-xs truncate">{t.tradeCard.entry}</span>
            <span className="font-semibold text-gray-900 dark:text-white truncate">{formatPrice(signal.entryPrice)}</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-red-500 dark:text-red-400 text-xs truncate">{t.tradeCard.stopLoss}</span>
            <span className="font-semibold text-gray-900 dark:text-white truncate">{formatPrice(signal.stopLoss)}</span>
          </div>
          <div className="flex flex-col min-w-0">
            {(() => {
              const isTargetHit = Boolean(signal.currentPrice && signal.targetPrice && signal.currentPrice >= signal.targetPrice);
              const t0Price = Number((signal.entryPrice * 1.03).toFixed(2));
              const isT0Hit = Boolean(signal.currentPrice && signal.currentPrice >= t0Price);
              const hasStrategyT2 = typeof signal.target2 === 'number' && signal.target2 > 0;
              const strategyT2Price = hasStrategyT2 ? signal.target2! : null;
              const estimatedFallbackT2 = Number((signal.entryPrice + 2 * Math.abs(signal.entryPrice - signal.stopLoss)).toFixed(2));
              const t2Price = strategyT2Price ?? estimatedFallbackT2;
              const isBist = signal.market === 'BIST' || signal.currency === 'TRY';
              const tavanCeiling = isBist ? Number((signal.entryPrice * 1.0999).toFixed(2)) : null;
              const isWithinSingleDayCeiling = tavanCeiling ? signal.targetPrice <= tavanCeiling : false;
              const minSessionsNeeded = isBist && signal.entryPrice > 0 && signal.targetPrice > signal.entryPrice
                ? Math.ceil(Math.log(signal.targetPrice / signal.entryPrice) / Math.log(1.0999))
                : 1;
              const isUnreachable = isBist && minSessionsNeeded > 15;

              return (
                <>
                  <span className="text-green-500 dark:text-green-400 text-xs flex items-center gap-1">
                    <span>{t.tradeCard.target1}</span>
                    {isTargetHit && <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 px-1 rounded font-bold">✓ {language === 'tr' ? 'Alındı' : 'Hit'}</span>}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(signal.targetPrice)}</span>
                  
                  {/* User Personal Quick Target T0 */}
                  <div className="mt-1 pt-0.5">
                    <span 
                      className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        isT0Hit 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' 
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                      }`}
                      title={language === 'tr' ? "Kişisel Hedef: +%3.0 seviyesinde hızlı kâr realizasyonu başlar (%3-%4 bölgesi)" : "Personal Target: Quick profit realization begins at +3.0% (+3% to +4% zone)"}
                    >
                      <span>⚡ T0 (+%3 Bölgesi): {formatPrice(t0Price)}</span>
                      {isT0Hit && <span className="text-emerald-600 dark:text-emerald-400">✓</span>}
                    </span>
                  </div>

                  {t2Price > signal.targetPrice && (
                    <span 
                      className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-mono" 
                      title={hasStrategyT2 
                        ? (language === 'tr' ? "Strateji Hedefi 2 (Koşucu)" : "Strategy Defined Target 2") 
                        : (language === 'tr' ? "Tahmini 2.0x Risk:Ödül Koşucu Hedefi" : "Extended 2.0x Risk:Reward Estimated Target")}
                    >
                      T2: {formatPrice(t2Price)} {hasStrategyT2 ? '' : (language === 'tr' ? '(Tahmini)' : '(Est.)')}
                    </span>
                  )}
                  {isBist && tavanCeiling && (
                    <span 
                      className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 font-mono flex items-center gap-1"
                      title={language === 'tr' 
                        ? `BIST Günlük Maksimum Tavan (+%9.99). Bu hedefe tavan serisi ile minimum ${minSessionsNeeded} seansta ulaşılabilir.` 
                        : `Borsa Istanbul Daily +9.99% Ceiling. Min ${minSessionsNeeded} consecutive ceiling sessions needed.`}
                    >
                      <span>⚡ Tavan: {formatPrice(tavanCeiling)}</span>
                      <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                        isUnreachable
                          ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                          : isWithinSingleDayCeiling 
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' 
                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      }`}>
                        {isUnreachable 
                          ? (language === 'tr' ? `⚠️ >${minSessionsNeeded} Seans` : `⚠️ >${minSessionsNeeded} Days`)
                          : isWithinSingleDayCeiling 
                            ? (language === 'tr' ? '⚡ 1 Seans' : '⚡ 1 Day') 
                            : (language === 'tr' ? `🗓️ ~${minSessionsNeeded} Seans` : `🗓️ ~${minSessionsNeeded} Days`)}
                      </span>
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {(() => {
          // Calculate dynamic bar width from actual risk and reward distances
          // e.g. 1:1 -> 50%/50%, 1:2 -> 33%/67%, 1:3 -> 25%/75%
          // Clamped between 15% and 85% to ensure both zones remain visually distinguishable
          const totalDistance = risk + reward;
          const rawRiskPct = totalDistance > 0 ? (risk / totalDistance) * 100 : 33.3;
          const riskBarPct = Math.min(85, Math.max(15, Math.round(rawRiskPct)));
          const rewardBarPct = 100 - riskBarPct;
          const numRr = risk > 0 ? reward / risk : 2.0;

          return (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300">{t.tradeCard.riskReward} ({rrRatio})</span>
                <span className="text-[10px] text-gray-400 font-mono">1R : {numRr.toFixed(2)}R</span>
              </div>
              <div className="w-full h-2 flex rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                <div 
                  className="bg-red-500 h-full transition-all" 
                  style={{ width: `${riskBarPct}%` }}
                  title={`Risk (1R): %${riskBarPct}`}
                ></div>
                <div 
                  className="bg-green-500 h-full transition-all" 
                  style={{ width: `${rewardBarPct}%` }}
                  title={`Reward (${numRr.toFixed(2)}R): %${rewardBarPct}`}
                ></div>
              </div>
            </div>
          );
        })()}

        <div className="mb-2 flex items-center flex-wrap gap-y-1">
          {(() => {
            const hasRawConf = typeof signal.confidence === 'number' && !isNaN(signal.confidence);
            const conf100 = hasRawConf ? Math.round(signal.confidence) : 0;
            const isEvaluated = hasRawConf && conf100 > 0;
            // Zero confidence produces 0 stars (no Math.max(1, ...))
            const starCount = isEvaluated ? Math.min(10, Math.max(0, Math.round(conf100 / 10))) : 0;

            return (
              <>
                <span 
                  className="text-xs text-gray-500 dark:text-gray-400 mr-1.5" 
                  title={language === 'tr' ? 'Algoritmik kural doğrulanma kalitesi (Kazanma olasılığı değildir)' : 'Algorithmic setup quality score (Not calibrated win probability)'}
                >
                  {language === 'tr' ? 'Güven Skoru:' : 'Setup Quality:'}
                </span>
                {isEvaluated ? (
                  <>
                    <div className="flex" title={`${starCount}/10 (%${conf100})`}>
                      {[...Array(10)].map((_, i) => (
                        <svg key={i} className={`w-3 h-3 ${i < starCount ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-1.5 font-mono">
                      {starCount}/10 (%{conf100})
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                    {language === 'tr' ? 'Değerlendirilmedi' : 'Not Evaluated'}
                  </span>
                )}
              </>
            );
          })()}
        </div>

        {/* SCALE-OUT TARGET EXIT PLAN */}
        {(() => {
          const isHolding = Boolean(userHolding && userHolding.shares > 0);
          const t1Shares = isHolding ? Math.max(1, Math.ceil(userHolding!.shares * 0.5)) : 0;
          const t2Shares = isHolding ? userHolding!.shares - t1Shares : 0;
          const isTargetHit = Boolean(signal.currentPrice && signal.targetPrice && signal.currentPrice >= signal.targetPrice);
          const t0Price = Number((signal.entryPrice * 1.03).toFixed(2));
          const hasStrategyT2 = typeof signal.target2 === 'number' && signal.target2 > 0;
          const strategyT2Price = hasStrategyT2 ? signal.target2! : null;
          const estimatedFallbackT2 = Number((signal.entryPrice + 2 * Math.abs(signal.entryPrice - signal.stopLoss)).toFixed(2));
          const t2Price = strategyT2Price ?? estimatedFallbackT2;

          if (isHolding) {
            return (
              <div className="my-3 p-3 rounded-xl bg-gradient-to-r from-blue-50/90 to-indigo-50/90 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800/70">
                <div className="flex justify-between items-center mb-1.5">
                  <div className="text-xs font-black text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <span>💼</span>
                    <span>
                      {language === 'tr' ? (
                        <>Mevcut Pozisyonunuz: <strong>{userHolding!.shares} adet</strong> (Ort. {formatPrice(userHolding!.entryPrice)})</>
                      ) : (
                        <>Your Position: <strong>{userHolding!.shares} shares</strong> held (@ avg {formatPrice(userHolding!.entryPrice)})</>
                      )}
                    </span>
                  </div>
                  {onTradeHolding && (
                    <button
                      type="button"
                      onClick={() => onTradeHolding(userHolding!)}
                      className="px-2 py-0.5 rounded text-[10px] font-black text-blue-700 dark:text-blue-300 bg-white dark:bg-gray-800 hover:bg-blue-100 border border-blue-300 dark:border-blue-700 shadow-xs cursor-pointer"
                    >
                      {t.tradeCard.tradeSell} ⚡
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`p-2 rounded-lg border ${
                    isTargetHit 
                      ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-700' 
                      : 'bg-white/90 dark:bg-gray-800/90 border-blue-100 dark:border-blue-900/60'
                  }`}>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-gray-600 dark:text-gray-300">
                        {language === 'tr' ? 'Hedef 1 Çıkışı (%50)' : 'Target 1 Exit (50%)'}
                      </span>
                      {isTargetHit && (
                        <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                          {language === 'tr' ? '✓ Bölgede' : '✓ In Zone'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-black text-gray-900 dark:text-white mt-0.5">
                      {language === 'tr' ? (
                        <><strong>{t1Shares}</strong> adet sat</>
                      ) : (
                        <>Sell <strong>{t1Shares}</strong> shares</>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5 flex justify-between">
                      <span>@ {formatPrice(signal.targetPrice)}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        +{formatPrice((signal.targetPrice - userHolding!.entryPrice) * t1Shares)}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-blue-100 dark:border-blue-900/60">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-gray-600 dark:text-gray-300">
                        {hasStrategyT2
                          ? (language === 'tr' ? 'Hedef 2 Koşucu (%50)' : 'Target 2 Runner (50%)')
                          : (language === 'tr' ? 'Hedef 2 Tahmini (2R Koşucu)' : 'Target 2 Est. (2R Runner)')}
                      </span>
                      <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400">
                        {hasStrategyT2 ? (language === 'tr' ? 'Strateji Hedefi' : 'Strategy Target') : (language === 'tr' ? 'Tahmini 2R' : 'Estimated 2R')}
                      </span>
                    </div>
                    <div className="text-sm font-black text-gray-900 dark:text-white mt-0.5">
                      {language === 'tr' ? (
                        <><strong>{t2Shares > 0 ? t2Shares : userHolding!.shares}</strong> adet sat</>
                      ) : (
                        <>Sell <strong>{t2Shares > 0 ? t2Shares : userHolding!.shares}</strong> shares</>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5 flex justify-between">
                      <span>@ {formatPrice(t2Price)} {hasStrategyT2 ? '' : '*'}</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        +{formatPrice((t2Price - userHolding!.entryPrice) * (t2Shares > 0 ? t2Shares : userHolding!.shares))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div className="my-2.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/60 text-[11px] text-gray-600 dark:text-gray-300 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="font-bold flex items-center gap-1 text-gray-700 dark:text-gray-200">
                <span>🎯</span> {language === 'tr' ? 'Kademeli Hedef & Çıkış Planı:' : 'Tiered Target & Exit Plan:'}
              </span>
              <span className="font-mono text-[10px]">
                {language === 'tr' ? (
                  <><strong>⚡ T0 (+%3):</strong> {formatPrice(t0Price)} · <strong>T1:</strong> {formatPrice(signal.targetPrice)} · <strong>T2:</strong> {formatPrice(t2Price)} {hasStrategyT2 ? '' : '(Tahmini)'}</>
                ) : (
                  <><strong>⚡ T0 (+3%):</strong> {formatPrice(t0Price)} · <strong>T1:</strong> {formatPrice(signal.targetPrice)} · <strong>T2:</strong> {formatPrice(t2Price)} {hasStrategyT2 ? '' : '(Est.)'}</>
                )}
              </span>
            </div>
          );
        })()}

        {/* INSTITUTIONAL SIZING & ALLOCATION COMPARISON */}
        {(() => {
          const riskPerShare = Math.max(0.01, Math.abs(signal.entryPrice - signal.stopLoss));
          const fixedCapitalShares = signal.entryPrice > 0 ? Math.floor(1000 / signal.entryPrice) : 0;
          const instRiskShares = Math.floor(150 / riskPerShare);

          return (
            <div className="my-2.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
              <div className="flex justify-between items-center text-gray-500 dark:text-gray-400 font-bold">
                <span className="flex items-center gap-1 text-slate-800 dark:text-slate-200">
                  <span>🏛️</span> {language === 'tr' ? 'Pozisyon Boyutlandırma Rehberi:' : 'Position Sizing Guide:'}
                </span>
                <span className="font-mono text-[10px]">Risk/Hisse: {formatPrice(riskPerShare)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[10px]">
                <div className="p-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 block">{language === 'tr' ? 'Bireysel (₺1.000 Sabit):' : 'Retail (₺1,000 Fixed):'}</span>
                  <strong className="text-gray-900 dark:text-white">{fixedCapitalShares} Lot</strong>
                  <span className="text-gray-500 block text-[9px]">Stop Zararı: {formatPrice(fixedCapitalShares * riskPerShare)}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800">
                  <span className="text-blue-700 dark:text-blue-300 font-bold block">{language === 'tr' ? '🏛️ Kurumsal (₺150 Risk):' : '🏛️ Quant (₺150 Risk):'}</span>
                  <strong className="text-blue-900 dark:text-blue-200">{instRiskShares} Lot</strong>
                  <span className="text-blue-600 dark:text-blue-400 block text-[9px] font-bold">Kesin Zarar: ₺150.00</span>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button 
            onClick={() => setExpanded(!expanded)} 
            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 flex items-center cursor-pointer"
          >
            {expanded 
              ? (language === 'tr' ? 'Gerekçeyi Gizle' : 'Hide Rationale') 
              : (language === 'tr' ? 'Yapay Zeka Analizini Göster' : 'Show AI Rationale')}
            <svg className={`w-3 h-3 ml-1 transform transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>

          {(signal.isReconfirmed || (signal.triggerHistory && signal.triggerHistory.length > 1)) && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>🕒 {showHistory 
                ? (language === 'tr' ? 'Tarama Geçmişini Gizle' : 'Hide Scan History') 
                : (language === 'tr' ? `Günlük Taramaları Gör (${signal.triggerHistory?.length || signal.daysInZone || 2})` : `View Daily Scans (${signal.triggerHistory?.length || signal.daysInZone || 2})`)}</span>
              <svg className={`w-3 h-3 transform transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {expanded && (() => {
          let reasons = signal.triggerReasons || [];
          let failedChecks = signal.failedChecks || [];
          let invalidationRule = signal.invalidation;
          let marketCtx = signal.marketContext;
          let riskData = signal.risk || signal.riskMetrics;
          let displayNarrative = signal.rationale;
          let entryModeStr = signal.entryMode || 'next_open';
          let directionStr = signal.direction || 'LONG';

          // Auto-parse if rationale was saved as JSON string
          if ((!reasons || reasons.length === 0) && signal.rationale && signal.rationale.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(signal.rationale);
              if (Array.isArray(parsed.trigger_reasons)) reasons = parsed.trigger_reasons;
              if (Array.isArray(parsed.failed_checks)) failedChecks = parsed.failed_checks;
              if (parsed.invalidation) invalidationRule = parsed.invalidation;
              if (parsed.market_context) marketCtx = parsed.market_context;
              if (parsed.risk) riskData = parsed.risk;
              if (parsed.rationale) displayNarrative = parsed.rationale;
              if (parsed.entry_mode) entryModeStr = parsed.entry_mode;
              if (parsed.direction) directionStr = parsed.direction;
            } catch (e) {}
          }

          const stopDist = riskData?.stop_distance_pct ?? (
            signal.entryPrice > 0 && signal.stopLoss > 0
              ? Number((((signal.entryPrice - signal.stopLoss) / signal.entryPrice) * 100).toFixed(2))
              : null
          );
          const hasStrategyT2 = typeof signal.target2 === 'number' && signal.target2 > 0;
          const t1Val = signal.target1 || signal.targetPrice;
          const t2Val = hasStrategyT2
            ? signal.target2!
            : Number((signal.entryPrice + 2 * Math.abs(signal.entryPrice - signal.stopLoss)).toFixed(2));

          return (
            <div className="mt-3 text-xs bg-gray-50 dark:bg-gray-900/90 p-3 rounded-xl border border-gray-200 dark:border-gray-800 space-y-3.5 animate-in fade-in duration-200">
              {/* Context Badges Bar */}
              <div className="flex flex-wrap items-center gap-1.5 pb-2.5 border-b border-gray-200 dark:border-gray-800 text-[11px]">
                <span className="font-black px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  {directionStr}
                </span>
                <span className="font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                  <span>⏱️</span>
                  <span>
                    {language === 'tr'
                      ? (entryModeStr === 'next_open' ? 'Giriş: Açılış Seansı (MOO)' : entryModeStr)
                      : (entryModeStr === 'next_open' ? 'Entry: Next Open (MOO)' : entryModeStr)}
                  </span>
                </span>
                {marketCtx?.benchmark && (
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">
                    📍 {marketCtx.benchmark} ({marketCtx.regime || 'BULLISH'})
                  </span>
                )}
                {marketCtx?.relative_strength_20d && (
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-mono text-[10px]">
                    ⚡ RS: {marketCtx.relative_strength_20d}x
                  </span>
                )}
              </div>

              {/* Reconfirmed Signal Notice if applicable */}
              {signal.isReconfirmed && signal.lastConfirmedDate && (
                <div className="p-2 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-[11px] flex-wrap gap-1">
                  <div className="flex items-center gap-1.5 text-indigo-900 dark:text-indigo-200 font-bold">
                    <span>🔄</span>
                    <span>{language === 'tr' ? 'Son Yeniden Teyit:' : 'Last Reconfirmed:'}</span>
                    <span className="font-mono text-indigo-700 dark:text-indigo-300 font-black">{signal.lastConfirmedDate}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                    {language === 'tr' ? 'Orijinal işlem planı ve risk seviyeleri korunmuştur' : 'Original trade plan & risk preserved'}
                  </span>
                </div>
              )}

              {/* WHY: Trigger Conditions Passed */}
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-gray-800 dark:text-gray-200 mb-1.5 flex items-center gap-1.5">
                  <span className="text-emerald-500">🎯</span>
                  <span>{language === 'tr' ? 'Neden Tetiklendi? (Onaylanan Koşullar)' : 'Why It Fired (Trigger Conditions Passed)'}</span>
                </div>
                {reasons && reasons.length > 0 ? (
                  <ul className="space-y-1.5 pl-0.5">
                    {reasons.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-[11px] text-gray-700 dark:text-gray-300 leading-snug">
                        <span className="shrink-0 text-emerald-500 dark:text-emerald-400 font-bold">✓</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[11px] text-gray-600 dark:text-gray-400 italic">
                    {language === 'tr' ? 'Tüm teknik filtre ve momentum eşik onayları sağlandı.' : 'All technical filter & momentum threshold conditions confirmed.'}
                  </div>
                )}

                {/* Near-miss or Failed Checks if present */}
                {failedChecks && failedChecks.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-800">
                    <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>{language === 'tr' ? 'Yakın Reddedilen / Başarısız Kontroller' : 'Near-Miss / Failed Checks'}</span>
                    </div>
                    <ul className="space-y-1 pl-0.5">
                      {failedChecks.map((fCheck, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-1.5 text-[10px] text-amber-800 dark:text-amber-300">
                          <span className="shrink-0 font-bold">✕</span>
                          <span>{fCheck}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* PLAN: Execution, Scale-Out Targets & Invalidation */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                <div className="text-[11px] font-black uppercase tracking-wider text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-1.5">
                  <span className="text-blue-500">📋</span>
                  <span>{language === 'tr' ? 'İşlem Planı & Risk Yönetimi' : 'Execution Plan & Risk Management'}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-[11px] mb-2.5">
                  <div className="p-2 rounded-lg bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold">
                      {language === 'tr' ? 'Hedef 1 (+1.25R / %50 Satış)' : 'Target 1 (+1.25R / 50% Exit)'}
                    </span>
                    <span className="font-mono font-black text-gray-900 dark:text-white text-xs mt-0.5">
                      {formatPrice(t1Val)}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">
                      {hasStrategyT2
                        ? (language === 'tr' ? 'Hedef 2 (Strateji Koşucusu)' : 'Target 2 (Strategy Runner)')
                        : (language === 'tr' ? 'Hedef 2 (Tahmini +2R Koşucu)' : 'Target 2 (Estimated +2R Runner)')}
                    </span>
                    <span className="font-mono font-black text-gray-900 dark:text-white text-xs mt-0.5">
                      {formatPrice(t2Val)} {hasStrategyT2 ? '' : '*'}
                    </span>
                  </div>
                </div>

                {/* Invalidation Box */}
                <div className="p-2 rounded-lg bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 mb-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-rose-700 dark:text-rose-300">
                    <span>🛑</span>
                    <span>{language === 'tr' ? 'Geçersizlik Kuralı (Stop Invalidation):' : 'Invalidation Rule:'}</span>
                  </div>
                  <p className="text-[11px] text-rose-900 dark:text-rose-200 font-mono mt-0.5">
                    {invalidationRule || (language === 'tr' 
                      ? `${formatPrice(signal.stopLoss)} altı günlük kapanış kurulumu geçersiz kılar.` 
                      : `Daily close below ${formatPrice(signal.stopLoss)} invalidates this setup.`)}
                  </p>
                </div>

                {/* Sizing & ATR Metrics */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono text-gray-600 dark:text-gray-400 px-1">
                  {stopDist !== null && (
                    <span>
                      {language === 'tr' ? 'Stop Mesafesi:' : 'Stop Dist:'} <strong className="text-gray-900 dark:text-gray-200">-%{stopDist}%</strong>
                    </span>
                  )}
                  {riskData?.atr_14 && (
                    <span>
                      ATR(14): <strong className="text-gray-900 dark:text-gray-200">{formatPrice(riskData.atr_14)}</strong>
                    </span>
                  )}
                  <span>
                    {language === 'tr' ? 'Maks Risk Payı:' : 'Max Risk Sizing:'} <strong className="text-blue-600 dark:text-blue-400">%{riskData?.max_position_pct || 1.5}</strong>
                  </span>
                </div>
              </div>

              {/* RATIONALE NARRATIVE */}
              {displayNarrative && (
                <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
                  <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    {language === 'tr' ? 'Yapay Zeka Mantıksal Özeti' : 'AI Strategic Narrative'}
                  </div>
                  <div className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed italic bg-white/60 dark:bg-gray-800/60 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                    "{displayNarrative}"
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {showHistory && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-xs space-y-2 animate-in fade-in duration-150">
            <div className="text-[10px] font-black uppercase tracking-wider text-purple-800 dark:text-purple-300 flex justify-between items-center">
              <span>{language === 'tr' 
                ? `Tarama Zaman Çizelgesi (Alım Bölgesinde ${signal.triggerHistory?.length || signal.daysInZone || 2} Seans)` 
                : `Scan Timeline (${signal.triggerHistory?.length || signal.daysInZone || 2} Sessions in Buy Zone)`}</span>
              <span className="text-[9px] font-semibold text-purple-600 dark:text-purple-400">
                {language === 'tr' ? 'Tüm Alım Tetikleyicileri' : 'All Buy Triggers'}
              </span>
            </div>
            <div className="space-y-1.5 divide-y divide-purple-100 dark:divide-purple-900/40">
              {signal.triggerHistory && signal.triggerHistory.length > 1 ? (
                signal.triggerHistory.map((item, i) => (
                  <div key={item.id || i} className="pt-1.5 first:pt-0 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                        i === 0 
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                          : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                      }`}>
                        {i === 0 
                          ? (language === 'tr' ? '1. Gün (Tetik)' : 'Day 1 (Trigger)') 
                          : (language === 'tr' ? `${i + 1}. Gün (Onay)` : `Day ${i + 1} (Re-confirm)`)}
                      </span>
                      <span className="font-mono text-gray-700 dark:text-gray-300 text-[11px] font-semibold">{item.date}</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-mono text-[11px]">
                      <span className="text-gray-900 dark:text-white font-bold">
                        {t.tradeCard.entry}: {formatPrice(item.entryPrice)}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 text-[10px] hidden sm:inline">
                        SL: {formatPrice(item.stopLoss)}
                      </span>
                      <span className="text-amber-500 font-bold text-[10px]">
                        ⭐ {item.confidence > 0 ? `${Math.round(item.confidence <= 10 ? item.confidence : item.confidence / 10)}/10` : '—'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                        {language === 'tr' ? '1. Gün (İlk Kurulum)' : 'Day 1 (Initial Setup)'}
                      </span>
                      <span className="font-mono text-gray-700 dark:text-gray-300 text-[11px] font-semibold">{signal.date}</span>
                    </div>
                    <span className="text-gray-900 dark:text-white font-bold font-mono text-[11px]">
                      {t.tradeCard.entry}: {formatPrice(signal.entryPrice)}
                    </span>
                  </div>
                  <div className="pt-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                        {language === 'tr' ? `${signal.daysInZone || 2}. Gün (Yeniden Doğrulandı)` : `Day ${signal.daysInZone || 2} (Re-confirmed)`}
                      </span>
                      <span className="font-mono text-gray-700 dark:text-gray-300 text-[11px] font-semibold">{signal.lastConfirmedDate || signal.date}</span>
                    </div>
                    <span className="text-purple-600 dark:text-purple-300 font-bold text-[10px]">
                      {language === 'tr' ? '20/50 EMA Alım Bölgesinde Güçleniyor' : 'Consolidating in 20/50 EMA Buy Zone'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-900 p-3 flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
        <span className="px-2 py-0.5 border border-gray-200 dark:border-gray-600 rounded text-[10px] uppercase font-bold">{signal.market}</span>
        {(() => {
          const timing = calculateExitDate(signal.date, signal.strategy);
          return (
            <div className="flex flex-col text-right font-mono">
              <span className="text-[10px] text-gray-400">📅 {language === 'tr' ? 'Giriş' : 'In'}: {signal.date}</span>
              <span className={`text-[10px] font-bold ${
                timing.statusColor === 'green' ? 'text-blue-600 dark:text-blue-400' :
                timing.statusColor === 'amber' ? 'text-amber-600 dark:text-amber-400' :
                'text-rose-600 dark:text-rose-400'
              }`}>
                {language === 'tr' ? 'Çıkış' : 'Exit'}: {timing.maxExitDate} ({timing.label})
              </span>
            </div>
          );
        })()}
        <div className="flex items-center gap-2">
          {onOpenCoPilot && (
            <button
              onClick={() => onOpenCoPilot(signal)}
              className="px-2 py-0.5 rounded text-[11px] font-black text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 border border-purple-200 dark:border-purple-800 transition-colors cursor-pointer"
              title={language === 'tr' ? "Yapay Zeka İşlem Planı ve Yol Haritası" : "Open AI Trade Co-Pilot Blueprint"}
            >
              💡 {t.tradeCard.coPilot}
            </button>
          )}
          <button 
            onClick={() => onCalcSize?.(signal)}
            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer"
          >
            {t.tradeCard.positionSize} →
          </button>
        </div>
      </div>
    </div>
  );
}
