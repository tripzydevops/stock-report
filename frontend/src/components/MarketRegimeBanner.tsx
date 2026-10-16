'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export interface RegimeStatus {
  status: 'Bullish' | 'Neutral' | 'Bearish';
  close: number;
  trend: 'up' | 'down' | 'flat';
}

interface MarketRegimeBannerProps {
  usRegime?: RegimeStatus;
  bistRegime?: RegimeStatus;
  usdTryRate?: number;
}

export default function MarketRegimeBanner({ usRegime, bistRegime, usdTryRate }: MarketRegimeBannerProps) {
  const { t, language } = useLanguage();

  const getStatusLabel = (status: 'Bullish' | 'Neutral' | 'Bearish') => {
    switch (status) {
      case 'Bullish': return t.regime.bullish;
      case 'Bearish': return t.regime.bearish;
      default: return t.regime.neutral;
    }
  };

  const getBadgeStyle = (status: 'Bullish' | 'Neutral' | 'Bearish') => {
    switch (status) {
      case 'Bullish':
        return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]';
      case 'Bearish':
        return 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.2)]';
      default:
        return 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)]';
    }
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'flat') => {
    switch (trend) {
      case 'up': return '▲';
      case 'down': return '▼';
      default: return '▶';
    }
  };

  return (
    <div className="w-full bg-[#0a0f1d] text-slate-200 border-b border-slate-800/80 backdrop-blur-md px-3 sm:px-6 py-2 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
        {/* Left: Live Pulse Indicator & Title */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 font-mono hidden sm:inline">
            {language === 'tr' ? 'MAKRO PİYASA REJİMİ' : 'MACRO REGIME'}
          </span>
        </div>

        {/* Center / Right: High-Density Ticker Stream */}
        <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar py-0.5 w-full sm:w-auto justify-start sm:justify-end">
          {/* US Regime (SPY) */}
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1 shrink-0">
            <span className="text-[11px] font-bold text-slate-400">🇺🇸 SPY</span>
            {usRegime ? (
              <>
                <span className="font-mono font-semibold text-slate-100">${usRegime.close.toFixed(2)}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getBadgeStyle(usRegime.status)} flex items-center gap-1`}>
                  <span className="text-[8px]">{getTrendIcon(usRegime.trend)}</span>
                  {getStatusLabel(usRegime.status)}
                </span>
              </>
            ) : (
              <span className="text-slate-500 animate-pulse text-[11px]">{t.regime.loading}</span>
            )}
          </div>

          {/* BIST Regime (XU100) */}
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1 shrink-0">
            <span className="text-[11px] font-bold text-slate-400">🇹🇷 BIST 100</span>
            {bistRegime ? (
              <>
                <span className="font-mono font-semibold text-slate-100">{bistRegime.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getBadgeStyle(bistRegime.status)} flex items-center gap-1`}>
                  <span className="text-[8px]">{getTrendIcon(bistRegime.trend)}</span>
                  {getStatusLabel(bistRegime.status)}
                </span>
              </>
            ) : (
              <span className="text-slate-500 animate-pulse text-[11px]">{t.regime.loading}</span>
            )}
          </div>

          {/* USD/TRY Ticker Pill */}
          {usdTryRate !== undefined && usdTryRate > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 rounded-lg px-2.5 py-1 shrink-0">
              <span className="text-[11px] font-bold text-slate-400">USD/TRY:</span>
              <span className="font-mono font-bold text-blue-400">₺{usdTryRate.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
