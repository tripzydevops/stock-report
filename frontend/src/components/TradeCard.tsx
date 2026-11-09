'use client';

import React, { useState, useEffect } from 'react';
import { calculateExitDate } from '../lib/tradeTiming';
import { supabase, PortfolioItem } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

export interface TriggerHistoryItem {
  id?: string;
  date: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  confidence: number;
  rationale?: string;
}

export interface RecoveryEvent {
  eventType: string;
  eventDate: string;
  referenceLevel: number;
  observedPrice: number;
  sessionsSinceSignal: number;
  sessionsSinceExit: number;
}

export interface RecoveryTracking {
  originalExitDate: string;
  originalExitStatus: 'expired' | 'stopped_out' | string;
  entryReference: number;
  prePullbackLevel?: number | null;
  originalTarget1?: number | null;
  originalTarget2?: number | null;
  trackingStatus: 'ACTIVE' | 'COMPLETED' | string;
  hasRecoveredEntry?: boolean;
  hasRecoveredPrePullback?: boolean;
  hasReachedTargetAfterExit?: boolean;
  events?: RecoveryEvent[];
}

export interface TradeSignal {
  id?: string;
  symbol: string;
  name: string;
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  confidence: number;
  aiConvictionScore?: number;
  rationale: string;
  market: string;
  date: string;
  currency: string;
  status?: string;
  outcomePnlPct?: number | null;
  closedAt?: string | null;
  recoveryTracking?: RecoveryTracking;
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
  const { user } = useAuth();
  const [isStarred, setIsStarred] = useState(false);

  useEffect(() => {
    if (!user?.id && typeof window !== 'undefined') {
      try {
        const guestWatchlist = JSON.parse(localStorage.getItem('marketpulse_guest_watchlist') || '[]');
        if (Array.isArray(guestWatchlist) && guestWatchlist.some((item: any) => item.symbol === signal.symbol)) {
          setIsStarred(true);
        } else {
          const stored = JSON.parse(localStorage.getItem('marketpulse_guest_starred_tickers') || '[]');
          if (Array.isArray(stored) && stored.includes(signal.symbol)) {
            setIsStarred(true);
          }
        }
      } catch {}
    }
  }, [user?.id, signal.symbol]);

  const handleToggleStar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextState = !isStarred;
      setIsStarred(nextState);
      if (user?.id) {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        if (nextState) {
          await fetch('/api/watchlist', {
            method: 'POST',
            headers,
            body: JSON.stringify({ symbol: signal.symbol, userId: user.id }),
          });
        } else {
          await fetch(`/api/watchlist?symbol=${encodeURIComponent(signal.symbol)}&userId=${encodeURIComponent(user.id)}`, {
            method: 'DELETE',
            headers,
          });
        }
      } else if (typeof window !== 'undefined') {
        // Unified Guest Watchlist in localStorage
        const guestWatchlist = JSON.parse(localStorage.getItem('marketpulse_guest_watchlist') || '[]');
        let updatedWatchlist = Array.isArray(guestWatchlist) ? [...guestWatchlist] : [];
        if (nextState) {
          if (!updatedWatchlist.some((i: any) => i.symbol === signal.symbol)) {
            updatedWatchlist.push({
              id: `guest_${signal.symbol}`,
              assetId: `guest_asset_${signal.symbol}`,
              symbol: signal.symbol,
              name: (signal as any).name || signal.symbol,
              assetClass: 'stock',
              market: (signal as any).market || 'BIST',
              currency: 'TRY',
              latestPrice: signal.currentPrice || signal.entryPrice,
              openPrice: signal.entryPrice,
              dailyChangePercent: 0,
              addedAt: new Date().toISOString(),
            });
          }
        } else {
          updatedWatchlist = updatedWatchlist.filter((i: any) => i.symbol !== signal.symbol);
        }
        localStorage.setItem('marketpulse_guest_watchlist', JSON.stringify(updatedWatchlist));

        // Keep ticker list in sync
        const stored = JSON.parse(localStorage.getItem('marketpulse_guest_starred_tickers') || '[]');
        const updatedTickers = nextState 
          ? Array.from(new Set([...stored, signal.symbol])) 
          : stored.filter((s: string) => s !== signal.symbol);
        localStorage.setItem('marketpulse_guest_starred_tickers', JSON.stringify(updatedTickers));
        window.dispatchEvent(new CustomEvent('marketpulse:watchlist-updated', { detail: { symbol: signal.symbol } }));
      }
    } catch (err) {
      console.error('Star toggle error:', err);
    }
  };
  
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
          <div 
            onClick={() => onSelectTicker?.(signal.symbol)}
            className="cursor-pointer group/header select-none touch-manipulation"
            title={language === 'tr' ? "Fiyat geçmişi ve indikatörleri görüntüleyin" : "Click to view full price history, daily OHLCV and indicators"}
          >
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTicker?.(signal.symbol);
                }}
                className="font-black text-lg text-gray-900 dark:text-white group-hover/header:text-blue-600 dark:group-hover/header:text-blue-400 flex items-center gap-1.5 transition-colors cursor-pointer text-left py-0.5"
              >
                <span className="group-hover/header:underline underline-offset-2">{signal.symbol}</span>
                <span className="text-xs text-blue-500 opacity-60 group-hover/header:opacity-100 group-hover/header:scale-110 transition-all">📈</span>
              </button>
              <button
                type="button"
                onClick={handleToggleStar}
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-sm transition-transform active:scale-125 cursor-pointer"
                title={isStarred ? (language === 'tr' ? 'Takip listesinden çıkar' : 'Remove from watchlist') : (language === 'tr' ? 'Takip listesine ekle' : 'Add to watchlist')}
              >
                {isStarred ? '⭐' : '☆'}
              </button>
              {signal.currentPrice !== undefined && signal.currentPrice !== null && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTicker?.(signal.symbol);
                  }}
                  className={`text-xs px-2 py-0.5 rounded-md font-mono font-bold border transition-all cursor-pointer hover:ring-2 hover:ring-blue-400 ${
                    (signal.changePercent || 0) >= 0 
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' 
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                  }`}
                  title={language === 'tr' ? "Anlık fiyat — grafiği açmak için tıklayın" : "Current price — click to view price history and live chart"}
                >
                  {formatPrice(signal.currentPrice)} {signal.changePercent !== undefined ? `(${signal.changePercent >= 0 ? '+' : ''}${signal.changePercent.toFixed(2)}%)` : ''}
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">{signal.name}</p>
          </div>
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
                <div suppressHydrationWarning className="flex items-center gap-1.5 text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/60 mt-1.5 max-w-full leading-snug">
                  <span className="shrink-0">🔄</span>
                  <span className="break-words line-clamp-1">{t.tradeCard.activeSetup} <strong>{signal.date}</strong> · {t.tradeCard.holdingInBuyZone}</span>
                </div>
              );
            }
            if (signal.date < new Date().toISOString().slice(0, 10)) {
              return (
                <div suppressHydrationWarning className="flex items-center gap-1.5 text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800/60 mt-1.5 max-w-full leading-snug">
                  <span className="shrink-0">🗓️</span>
                  <span className="break-words line-clamp-1">{t.tradeCard.activeSwing} <strong>{signal.date}</strong></span>
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
              if (signal.status === 'expired') {
                const pnl = signal.outcomePnlPct !== null && signal.outcomePnlPct !== undefined ? signal.outcomePnlPct : null;
                const pnlStr = pnl !== null ? ` (${pnl > 0 ? '+' : ''}${pnl}%)` : '';
                return (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gray-600 text-white shadow-xs flex items-center gap-1">
                    <span>⏱️</span>
                    <span>{language === 'tr' ? `VADESİ DOLDU${pnlStr}` : `EXPIRED${pnlStr}`}</span>
                  </span>
                );
              }
              if (signal.status === 'stopped_out' || isStoppedOut) {
                const pnl = signal.outcomePnlPct !== null && signal.outcomePnlPct !== undefined ? signal.outcomePnlPct : null;
                const pnlStr = pnl !== null ? ` (${pnl > 0 ? '+' : ''}${pnl}%)` : '';
                return (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-xs flex items-center gap-1">
                    <span>🛑</span>
                    <span>{language === 'tr' ? `ZARAR KES OLDU${pnlStr}` : `STOPPED OUT${pnlStr}`}</span>
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
                <span suppressHydrationWarning className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-xs animate-pulse flex items-center gap-0.5">
                  <span>🔥</span>
                  <span>{language === 'tr' ? 'BUGÜN YENİ' : 'NEW TODAY'}</span>
                </span>
              ) : (
                <span suppressHydrationWarning className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  🗓️ {language === 'tr' ? `${signal.date} TARİHİNDEN BERİ` : `SINCE ${signal.date}`}
                </span>
              );
            })()}
            {signal.recoveryTracking && (signal.recoveryTracking.hasRecoveredEntry || signal.recoveryTracking.hasRecoveredPrePullback || signal.recoveryTracking.hasReachedTargetAfterExit) && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-xs flex items-center gap-1 animate-pulse" title={language === 'tr' ? "Çıkış sonrası seviye geri alındı" : "Reclaimed key level after exit"}>
                <span>✨</span>
                <span>{language === 'tr' ? 'TOPARLANDI' : 'RECOVERED'}</span>
              </span>
            )}
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
          // Calculate dynamic bar width strictly proportional to actual risk and reward distances
          // e.g. 1:1 -> 50%/50%, 1:2 -> 33.3%/66.7%, 1:3 -> 25%/75%, 1:10 -> 9.1%/90.9%
          // Using exact proportional calculation with min-width styling rather than artificial 15%/85% clamping
          const totalDistance = risk + reward;
          const exactRiskPct = totalDistance > 0 ? Number(((risk / totalDistance) * 100).toFixed(1)) : 33.3;
          const exactRewardPct = Number((100 - exactRiskPct).toFixed(1));
          const numRr = risk > 0 ? reward / risk : 2.0;

          return (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300">{t.tradeCard.riskReward} ({rrRatio})</span>
                <span className="text-[10px] text-gray-400 font-mono">1R : {numRr.toFixed(2)}R</span>
              </div>
              <div className="w-full h-2 flex rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                <div 
                  className="bg-red-500 h-full transition-all shrink-0" 
                  style={{ width: `${exactRiskPct}%`, minWidth: '4px' }}
                  title={`Risk (1R): %${exactRiskPct}`}
                ></div>
                <div 
                  className="bg-green-500 h-full transition-all shrink-0" 
                  style={{ width: `${exactRewardPct}%`, minWidth: '4px' }}
                  title={`Reward (${numRr.toFixed(2)}R): %${exactRewardPct}`}
                ></div>
              </div>
            </div>
          );
        })()}

        <div className="mb-2 flex items-center justify-between flex-wrap gap-y-1">
          <div className="flex items-center flex-wrap gap-y-1">
            {(() => {
              const rawConf = signal.confidence;
              const isFiniteNumber = typeof rawConf === 'number' && Number.isFinite(rawConf);
              // Strict range validation: clamp to [0, 100] and reject non-finite/NaN/Infinity
              const conf100 = isFiniteNumber ? Math.min(100, Math.max(0, Math.round(rawConf))) : 0;
              const isEvaluated = isFiniteNumber && conf100 > 0;
              // Zero confidence produces 0 stars (no Math.max(1, ...))
              const starCount = isEvaluated ? Math.min(10, Math.max(0, Math.round(conf100 / 10))) : 0;

              return (
                <>
                  <span 
                    className="text-xs text-gray-500 dark:text-gray-400 mr-1.5" 
                    title={language === 'tr' ? 'Algoritmik kural doğrulanma kalitesi (Kazanma olasılığı değildir)' : 'Algorithmic setup quality score (Not calibrated win probability)'}
                  >
                    {language === 'tr' ? 'Kurulum Kalitesi:' : 'Setup Quality:'}
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
          {typeof signal.aiConvictionScore === 'number' && Number.isFinite(signal.aiConvictionScore) && signal.aiConvictionScore > 0 && (
            <div 
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-[11px] font-semibold text-purple-700 dark:text-purple-300 shadow-2xs"
              title={language === 'tr' ? 'Yapay zekâ (LLM) hipotez ve risk değerlendirme kanaat skoru' : 'AI (LLM) thesis conviction score'}
            >
              <span>🤖</span>
              <span>{language === 'tr' ? 'AI Kanaat:' : 'AI Conviction:'}</span>
              <span className="font-bold font-mono">%{Math.min(100, Math.max(0, Math.round(signal.aiConvictionScore)))}</span>
            </div>
          )}
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
          const isBist = signal.market !== 'US';
          const retailCapitalText = isBist ? (language === 'tr' ? 'Bireysel (₺1.000 Sabit):' : 'Retail (₺1,000 Fixed):') : (language === 'tr' ? 'Bireysel ($1,000 Sabit):' : 'Retail ($1,000 Fixed):');
          const quantRiskText = isBist ? (language === 'tr' ? '🏛️ Kurumsal (₺150 Risk):' : '🏛️ Quant (₺150 Risk):') : (language === 'tr' ? '🏛️ Kurumsal ($50 Risk):' : '🏛️ Quant ($50 Risk):');
          const instRiskDollar = isBist ? 150 : 50;
          const instRiskSharesAdjusted = Math.max(1, Math.floor(instRiskDollar / riskPerShare));
          const maxLossText = isBist ? '₺150.00' : '$50.00';

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
                  <span className="text-gray-500 block truncate">{retailCapitalText}</span>
                  <strong className="text-gray-900 dark:text-white">{fixedCapitalShares} Lot</strong>
                  <span className="text-gray-500 block text-[9px] truncate">Stop Zararı: {formatPrice(fixedCapitalShares * riskPerShare)}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-blue-50/80 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800">
                  <span className="text-blue-700 dark:text-blue-300 font-bold block truncate">{quantRiskText}</span>
                  <strong className="text-blue-900 dark:text-blue-200">{instRiskSharesAdjusted} Lot</strong>
                  <span className="text-blue-600 dark:text-blue-400 block text-[9px] font-bold truncate">{language === 'tr' ? 'Kesin Zarar: ' : 'Max Loss: '}{maxLossText}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* POST-EXIT RECOVERY TRACKER CARD SECTION */}
        {signal.recoveryTracking && (signal.status === 'expired' || signal.status === 'stopped_out' || signal.recoveryTracking.hasRecoveredEntry || signal.recoveryTracking.hasRecoveredPrePullback || signal.recoveryTracking.hasReachedTargetAfterExit) && (
          <div className="my-3 p-3 rounded-xl bg-gradient-to-r from-emerald-50/80 via-teal-50/80 to-indigo-50/80 dark:from-emerald-950/40 dark:via-teal-950/40 dark:to-indigo-950/40 border border-emerald-300 dark:border-emerald-800 text-[11px] space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-black text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 text-xs">
                <span>🔄</span>
                <span>{language === 'tr' ? 'Çıkış Sonrası Toparlanma Takibi (Recovery Tracker)' : 'Post-Exit Recovery Tracker'}</span>
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                signal.recoveryTracking.hasReachedTargetAfterExit 
                  ? 'bg-emerald-600 text-white'
                  : signal.recoveryTracking.hasRecoveredPrePullback
                  ? 'bg-teal-600 text-white'
                  : signal.recoveryTracking.hasRecoveredEntry
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
                {signal.recoveryTracking.hasReachedTargetAfterExit 
                  ? (language === 'tr' ? '🏆 Hedef 1 Alındı' : '🏆 Target Reached')
                  : signal.recoveryTracking.hasRecoveredPrePullback
                  ? (language === 'tr' ? '✓ Düşüş Öncesi Zirve Alındı' : '✓ Pre-Dip High Reclaimed')
                  : signal.recoveryTracking.hasRecoveredEntry
                  ? (language === 'tr' ? '✓ Giriş Geri Alındı' : '✓ Entry Reclaimed')
                  : (language === 'tr' ? '⏳ İzleniyor' : '⏳ Monitoring')}
              </span>
            </div>

            <div className="space-y-1.5 font-mono text-[10px] pt-1">
              {/* Entry Reclaim */}
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-emerald-100 dark:border-emerald-900/60">
                <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                  <span className={signal.recoveryTracking.hasRecoveredEntry ? "text-emerald-600 font-bold" : "text-gray-400"}>
                    {signal.recoveryTracking.hasRecoveredEntry ? "✓" : "○"}
                  </span>
                  <span>{language === 'tr' ? 'Orijinal Giriş Seviyesi:' : 'Original Entry Reference:'}</span>
                  <strong>{formatPrice(signal.recoveryTracking.entryReference)}</strong>
                </span>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  {(() => {
                    const closeEv = signal.recoveryTracking?.events?.find(e => e.eventType === 'ENTRY_RECLAIMED_CLOSE');
                    const touchEv = signal.recoveryTracking?.events?.find(e => e.eventType === 'ENTRY_TOUCHED');
                    if (closeEv) return `${language === 'tr' ? 'Kapanış' : 'Closed'}: ${closeEv.eventDate} (+${closeEv.sessionsSinceExit} gün)`;
                    if (touchEv) return `${language === 'tr' ? 'Temas' : 'Touched'}: ${touchEv.eventDate} (+${touchEv.sessionsSinceExit} gün)`;
                    return language === 'tr' ? 'Henüz alınmadı' : 'Not yet reclaimed';
                  })()}
                </span>
              </div>

              {/* Pre-Pullback High */}
              {signal.recoveryTracking.prePullbackLevel && (
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-emerald-100 dark:border-emerald-900/60">
                  <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                    <span className={signal.recoveryTracking.hasRecoveredPrePullback ? "text-emerald-600 font-bold" : "text-gray-400"}>
                      {signal.recoveryTracking.hasRecoveredPrePullback ? "✓" : "○"}
                    </span>
                    <span>{language === 'tr' ? 'Düşüş Öncesi Zirve:' : 'Pre-Dip High:'}</span>
                    <strong>{formatPrice(signal.recoveryTracking.prePullbackLevel)}</strong>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    {(() => {
                      const closeEv = signal.recoveryTracking?.events?.find(e => e.eventType === 'PRE_PULLBACK_HIGH_RECLAIMED_CLOSE');
                      const touchEv = signal.recoveryTracking?.events?.find(e => e.eventType === 'PRE_PULLBACK_HIGH_TOUCHED');
                      if (closeEv) return `${language === 'tr' ? 'Kapanış' : 'Closed'}: ${closeEv.eventDate} (+${closeEv.sessionsSinceExit} gün)`;
                      if (touchEv) return `${language === 'tr' ? 'Temas' : 'Touched'}: ${touchEv.eventDate} (+${touchEv.sessionsSinceExit} gün)`;
                      return language === 'tr' ? 'Henüz alınmadı' : 'Not yet reclaimed';
                    })()}
                  </span>
                </div>
              )}

              {/* Target 1 Post-Exit */}
              {signal.recoveryTracking.originalTarget1 && (
                <div className="flex items-center justify-between p-1.5 rounded-lg bg-white/80 dark:bg-gray-800/80 border border-emerald-100 dark:border-emerald-900/60">
                  <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                    <span className={signal.recoveryTracking.hasReachedTargetAfterExit ? "text-emerald-600 font-bold" : "text-gray-400"}>
                      {signal.recoveryTracking.hasReachedTargetAfterExit ? "🏆" : "○"}
                    </span>
                    <span>{language === 'tr' ? 'Orijinal Hedef 1:' : 'Original Target 1:'}</span>
                    <strong>{formatPrice(signal.recoveryTracking.originalTarget1)}</strong>
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    {(() => {
                      const t1Ev = signal.recoveryTracking?.events?.find(e => e.eventType === 'TARGET_1_TOUCHED_AFTER_EXIT');
                      if (t1Ev) return `${language === 'tr' ? 'Ulaşıldı' : 'Hit'}: ${t1Ev.eventDate} (+${t1Ev.sessionsSinceExit} gün)`;
                      return language === 'tr' ? 'Henüz ulaşılmadı' : 'Not yet hit';
                    })()}
                  </span>
                </div>
              )}
            </div>

            <div className="text-[9px] text-gray-500 dark:text-gray-400 pt-0.5 flex items-center gap-1">
              <span>ℹ️</span>
              <span>
                {language === 'tr' 
                  ? 'Orijinal işlem sonucu değişmez (Performans ve kazanma oranı istatistikleri korunur).' 
                  : 'Original trade outcome remains immutable (Backtest & win-rate metrics preserved).'}
              </span>
            </div>
          </div>
        )}

        {/* Reconfirmation Status if in Buy Zone across multiple sessions */}
        {signal.isReconfirmed && (
          <div className="pt-2 flex items-center justify-between text-[11px] border-t border-gray-100 dark:border-gray-800 mt-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/80 font-bold text-[10px]">
              <span>🔄</span>
              <span>
                {language === 'tr' 
                  ? `${signal.triggerHistory?.length || signal.daysInZone || 2}. Seans Alım Bölgesinde` 
                  : `Session ${signal.triggerHistory?.length || signal.daysInZone || 2} in Buy Zone`}
              </span>
            </span>
          </div>
        )}
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-900 p-3 flex flex-col sm:flex-row sm:justify-between items-stretch sm:items-center gap-2.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2 w-full sm:w-auto">
          <span className="px-2 py-0.5 border border-gray-200 dark:border-gray-600 rounded text-[10px] uppercase font-bold shrink-0">{signal.market}</span>
          {(() => {
            const timing = calculateExitDate(signal.date, signal.strategy);
            return (
              <div className="flex items-center gap-2 text-right font-mono text-[10px]">
                <span className="text-gray-400">📅 {language === 'tr' ? 'Giriş' : 'In'}: {signal.date}</span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className={`font-bold ${
                  timing.statusColor === 'green' ? 'text-blue-600 dark:text-blue-400' :
                  timing.statusColor === 'amber' ? 'text-amber-600 dark:text-amber-400' :
                  'text-rose-600 dark:text-rose-400'
                }`}>
                  {language === 'tr' ? 'Çıkış' : 'Exit'}: {timing.maxExitDate} ({timing.label})
                </span>
              </div>
            );
          })()}
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
          {onOpenCoPilot && (
            <button
              type="button"
              onClick={() => onOpenCoPilot(signal)}
              className="w-full sm:w-auto justify-center px-3 py-2 sm:py-1 rounded-xl text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 transition-all cursor-pointer flex items-center gap-1 active:scale-95 touch-manipulation min-h-[38px] sm:min-h-0"
              title={language === 'tr' ? "Yapay Zeka Analizini ve İşlem Yol Haritasını Aç" : "Open AI Analysis & Trade Blueprint"}
            >
              <span>💡</span>
              <span className="truncate">{t.tradeCard.coPilot}</span>
            </button>
          )}
          <button 
            type="button"
            onClick={() => onCalcSize?.(signal)}
            className="w-full sm:w-auto justify-center px-3 py-2 sm:py-1 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition-all cursor-pointer flex items-center gap-1 active:scale-95 touch-manipulation min-h-[38px] sm:min-h-0"
          >
            <span>🎯</span>
            <span className="truncate">{t.tradeCard.positionSize}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
