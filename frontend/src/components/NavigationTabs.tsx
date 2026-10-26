'use client';

import React, { useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RegimeStatus } from './MarketRegimeBanner';

export type TabId = 'signals' | 'portfolio' | 'dividend' | 'forecast' | 'scorecard' | 'orb' | 'catalysts' | 'quant';

interface NavigationTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  catalystsCount?: number;
  usRegime?: RegimeStatus;
  bistRegime?: RegimeStatus;
  usdTryRate?: number;
  onOpenShortcuts?: () => void;
  isSimpleMode?: boolean;
  onToggleSimpleMode?: () => void;
}

export default function NavigationTabs({
  activeTab,
  onTabChange,
  catalystsCount = 9,
  usRegime,
  bistRegime,
  usdTryRate,
  onOpenShortcuts,
  isSimpleMode = true,
  onToggleSimpleMode,
}: NavigationTabsProps) {
  const { t, language } = useLanguage();
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const allTabs: { id: TabId; label: string; icon: string; count?: string; mobileShort: string }[] = [
    { id: 'signals', label: isSimpleMode ? (language === 'tr' ? 'Tavsiyeler' : 'Picks') : t.tabs.signals, icon: '🎯', mobileShort: language === 'tr' ? 'Tavsiye' : 'Picks' },
    { id: 'portfolio', label: t.tabs.portfolio, icon: '💼', mobileShort: language === 'tr' ? 'Portföy' : 'Portfolio' },
    { id: 'dividend', label: t.tabs.dividend, icon: '💰', mobileShort: language === 'tr' ? 'Temettü' : 'Dividend' },
    { id: 'forecast', label: isSimpleMode ? (language === 'tr' ? 'Kartopu Hedefi' : 'Growth Target') : t.tabs.forecast, icon: '🔮', count: isSimpleMode ? undefined : 'DRIP Lab', mobileShort: language === 'tr' ? 'Hedef' : 'Target' },
    { id: 'catalysts', label: t.tabs.catalysts, icon: '⚡', count: `${catalystsCount}`, mobileShort: 'KAP' },
    { id: 'quant', label: t.tabs.quant, icon: '🏛️', count: 'Quant', mobileShort: 'Quant' },
    { id: 'scorecard', label: t.tabs.scorecard, icon: '📈', count: '1,173', mobileShort: language === 'tr' ? 'Karne' : 'Scorecard' },
    { id: 'orb', label: t.tabs.orb, icon: '🔔', mobileShort: language === 'tr' ? 'Açılış' : 'Opening' },
  ];

  const simpleTabIds: TabId[] = ['signals', 'portfolio', 'dividend', 'forecast'];
  const tabs = isSimpleMode ? allTabs.filter(t => simpleTabIds.includes(t.id)) : allTabs;

  // Auto-scroll active tab into view when activeTab changes
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeTab]);

  return (
    <div className="block bg-white/95 dark:bg-[#090e1a]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 sticky top-14 sm:top-16 z-30 shadow-xs">
      <div className="max-w-[1680px] 2xl:max-w-[1720px] mx-auto px-2.5 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Tab Strip with Direct Terminal Key Indices (Swipeable on Mobile) */}
        <div ref={scrollContainerRef} className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto py-1.5 sm:py-2 no-scrollbar scroll-smooth w-full md:w-auto touch-pan-x">
          {tabs.map((tab, idx) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={isActive ? activeTabRef : null}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-2 ring-blue-400/30'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
                title={`Kısayol: [${idx + 1}]`}
              >
                <span className="text-sm shrink-0">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count && (
                  <span
                    className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive
                        ? 'bg-blue-700 text-blue-100'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                <span className={`hidden md:inline text-[9px] font-mono px-1 rounded transition-opacity ${isActive ? 'text-blue-200 bg-blue-700/60' : 'text-slate-400 dark:text-slate-500 opacity-60'}`}>
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right: Embedded Macro Tickers & Keyboard Shortcuts Help */}
        <div className="hidden lg:flex items-center space-x-2 shrink-0 py-2">
          {/* US Regime (SPY) */}
          {usRegime && (
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">🇺🇸 SPY</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">${usRegime.close.toFixed(2)}</span>
              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                usRegime.status === 'Bullish' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                usRegime.status === 'Bearish' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}>
                {usRegime.status === 'Bullish' ? '▲ Bull' : usRegime.status === 'Bearish' ? '▼ Bear' : '▶ Neutral'}
              </span>
            </div>
          )}

          {/* BIST Regime (XU100) */}
          {bistRegime && (
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">🇹🇷 BIST</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{bistRegime.close.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                bistRegime.status === 'Bullish' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                bistRegime.status === 'Bearish' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}>
                {bistRegime.status === 'Bullish' ? '▲ Bull' : bistRegime.status === 'Bearish' ? '▼ Bear' : '▶ Neutral'}
              </span>
            </div>
          )}

          {/* Simple vs Pro Mode Toggle Pill */}
          {onToggleSimpleMode && (
            <button
              type="button"
              onClick={onToggleSimpleMode}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs active:scale-95 ${
                isSimpleMode
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                  : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/25'
              }`}
              title={isSimpleMode ? 'Gelişmiş Pro Görünüme Geç' : 'Sade Başlangıç Görünümüne Geç'}
            >
              <span>{isSimpleMode ? '🌱' : '⚡'}</span>
              <span>
                {isSimpleMode
                  ? (language === 'tr' ? 'Basit Mod' : 'Simple Mode')
                  : (language === 'tr' ? 'Pro Mod' : 'Pro Mode')}
              </span>
            </button>
          )}

          {/* Keyboard Shortcuts Trigger Button */}
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            title="Klavye Kısayolları ([?])"
          >
            <span>⌨️</span>
            <span>[?]</span>
          </button>
        </div>
      </div>
    </div>
  );
}
