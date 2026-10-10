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
    if (s.includes('breakout')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (s.includes('pullback')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
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
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60 mt-1.5 w-fit">
                  <span>🏆</span>
                  <span>{t.tradeCard.target1Hit} <strong>{formatPrice(signal.targetPrice)}</strong> (+{targetGainPct}%) · {t.tradeCard.inTakeProfitZone}</span>
                </div>
              );
            }
            if (isStoppedOut) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800/60 mt-1.5 w-fit">
                  <span>🛑</span>
                  <span>{t.tradeCard.stoppedOut} <strong>{formatPrice(signal.stopLoss)}</strong> · {t.tradeCard.setupInvalidated}</span>
                </div>
              );
            }
            if (signal.isReconfirmed) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/60 mt-1.5 w-fit">
                  <span>🔄</span>
                  <span>{t.tradeCard.activeSetup} <strong>{signal.date}</strong> · {t.tradeCard.holdingInBuyZone}</span>
                </div>
              );
            }
            if (signal.date < new Date().toISOString().slice(0, 10)) {
              return (
                <div className="flex items-center gap-1.5 text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800/60 mt-1.5 w-fit">
                  <span>🗓️</span>
                  <span>{t.tradeCard.activeSwing} <strong>{signal.date}</strong></span>
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
          </div>
        </div>
      </div>
      
      <div className="p-4 flex-grow">
        <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
          <div className="flex flex-col">
            <span className="text-gray-500 dark:text-gray-400 text-xs">{t.tradeCard.entry}</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(signal.entryPrice)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-red-500 dark:text-red-400 text-xs">{t.tradeCard.stopLoss}</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(signal.stopLoss)}</span>
          </div>
          <div className="flex flex-col">
            {(() => {
              const isTargetHit = Boolean(signal.currentPrice && signal.targetPrice && signal.currentPrice >= signal.targetPrice);
              const t2Price = Number((signal.entryPrice + 2 * Math.abs(signal.entryPrice - signal.stopLoss)).toFixed(2));
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
                  {t2Price > signal.targetPrice && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-mono" title={language === 'tr' ? "2.0x Risk:Ödül Koşucu Hedefi" : "Extended 2.0x Risk:Reward Runner Target"}>
                      T2: {formatPrice(t2Price)}
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

        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300">{t.tradeCard.riskReward} ({rrRatio})</span>
          </div>
          <div className="w-full h-2 flex rounded-full overflow-hidden">
            <div className="bg-red-500 h-full" style={{ width: '33%' }}></div>
            <div className="bg-green-500 h-full" style={{ width: '67%' }}></div>
          </div>
        </div>

        <div className="mb-2 flex items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">{t.tradeCard.confidence}:</span>
          <div className="flex">
            {[...Array(10)].map((_, i) => (
              <svg key={i} className={`w-3 h-3 ${i < signal.confidence ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
        </div>

        {/* SCALE-OUT TARGET EXIT PLAN */}
        {(() => {
          const isHolding = Boolean(userHolding && userHolding.shares > 0);
          const t1Shares = isHolding ? Math.max(1, Math.ceil(userHolding!.shares * 0.5)) : 0;
          const t2Shares = isHolding ? userHolding!.shares - t1Shares : 0;
          const isTargetHit = Boolean(signal.currentPrice && signal.targetPrice && signal.currentPrice >= signal.targetPrice);
          const t2Price = Number((signal.entryPrice + 2 * Math.abs(signal.entryPrice - signal.stopLoss)).toFixed(2));

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
                        {language === 'tr' ? 'Hedef 2 Koşucu (%50)' : 'Target 2 Runner (50%)'}
                      </span>
                      <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400">
                        {language === 'tr' ? 'Koşucu' : 'Runner'}
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
                      <span>@ {formatPrice(t2Price)}</span>
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
            <div className="my-2.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700/60 text-[11px] text-gray-600 dark:text-gray-300 flex items-center justify-between">
              <span className="font-bold flex items-center gap-1 text-gray-700 dark:text-gray-200">
                <span>🎯</span> {language === 'tr' ? '50/50 Kısmi Çıkış Kuralı:' : '50/50 Scale-Out Rule:'}
              </span>
              <span className="font-mono text-[10px]">
                {language === 'tr' ? (
                  <><strong>%50</strong> @ {formatPrice(signal.targetPrice)} · <strong>%50</strong> @ {formatPrice(t2Price)}</>
                ) : (
                  <>Sell <strong>50%</strong> @ {formatPrice(signal.targetPrice)} · Sell <strong>50%</strong> @ {formatPrice(t2Price)}</>
                )}
              </span>
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

        {expanded && (
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
            {signal.rationale}
          </div>
        )}

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
                        ⭐ {item.confidence}/10
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
