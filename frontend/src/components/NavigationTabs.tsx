'use client';

import React, { useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RegimeStatus } from './MarketRegimeBanner';

export type TabId = 'signals' | 'watchlist' | 'portfolio' | 'dividend' | 'forecast' | 'scorecard' | 'orb' | 'catalysts' | 'quant' | 'help' | 'assistant';

export type HubKey = 'trade' | 'portfolio' | 'dividend' | 'quant' | 'ai';

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

  // 4-Core Hub Model Definitions
  const hubs: {
    hubKey: HubKey;
    primaryTab: TabId;
    labelTr: string;
    labelEn: string;
    icon: string;
    badge?: string;
    subTabs: { id: TabId; labelTr: string; labelEn: string; icon: string; count?: string }[];
  }[] = [
    {
      hubKey: 'trade',
      primaryTab: 'signals',
      labelTr: 'Al-Sat & Radar',
      labelEn: 'Trade & Radar',
      icon: '🎯',
      subTabs: [
        { id: 'signals', labelTr: 'Sinyaller', labelEn: 'Picks', icon: '🎯' },
        { id: 'orb', labelTr: '15m Açılış (ORB)', labelEn: '15m ORB', icon: '🔔' },
        { id: 'watchlist', labelTr: 'Takip & Radar', labelEn: 'Watchlist', icon: '⭐', count: 'Radar' },
      ],
    },
    {
      hubKey: 'portfolio',
      primaryTab: 'portfolio',
      labelTr: 'Portföyüm',
      labelEn: 'My Portfolio',
      icon: '💼',
      subTabs: [
        { id: 'portfolio', labelTr: 'Varlıklarım', labelEn: 'Holdings', icon: '💼' },
      ],
    },
    {
      hubKey: 'dividend',
      primaryTab: 'dividend',
      labelTr: 'Temettü & Gelir',
      labelEn: 'Dividends & Cash',
      icon: '💧',
      subTabs: [
        { id: 'dividend', labelTr: 'Yağmur Takvimi', labelEn: 'Raindrop Calendar', icon: '💧' },
        { id: 'forecast', labelTr: 'Kartopu Simülatörü', labelEn: 'Snowball DRIP', icon: '🔮', count: 'DRIP' },
      ],
    },
    {
      hubKey: 'quant',
      primaryTab: 'catalysts',
      labelTr: 'Quant & Araştırma',
      labelEn: 'Quant & Intel',
      icon: '🏛️',
      subTabs: [
        { id: 'catalysts', labelTr: 'KAP Akışı', labelEn: 'KAP Filings', icon: '⚡', count: `${catalystsCount}` },
        { id: 'quant', labelTr: 'Pairs Stat-Arb', labelEn: 'Pairs Arbitrage', icon: '🏛️', count: 'PRO' },
        { id: 'scorecard', labelTr: 'Karne (1,173)', labelEn: 'Scorecard', icon: '📈' },
        { id: 'help', labelTr: 'Rehber', labelEn: 'Guide', icon: '📖' },
      ],
    },
    {
      hubKey: 'ai',
      primaryTab: 'assistant',
      labelTr: 'AI Copilot',
      labelEn: 'AI Copilot',
      icon: '🤖',
      badge: 'AI',
      subTabs: [
        { id: 'assistant', labelTr: 'AI Piyasa Asistanı', labelEn: 'Market Copilot', icon: '🤖' },
      ],
    },
  ];

  // Determine active Hub
  const activeHub = hubs.find(h => h.subTabs.some(st => st.id === activeTab)) || hubs[0];

  const handleHubClick = (hub: typeof hubs[0]) => {
    // If current tab is already in this hub, keep it; otherwise switch to hub's primary tab
    const hasCurrent = hub.subTabs.some(st => st.id === activeTab);
    if (!hasCurrent) {
      onTabChange(hub.primaryTab);
    }
  };

  return (
    <div className="block bg-white/95 dark:bg-[#090e1a]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 sticky top-14 sm:top-16 z-30 shadow-xs">
      <div className="max-w-[1720px] mx-auto px-2.5 sm:px-6 lg:px-8">
        {/* ROW 1: The 4 Core Hubs + AI Copilot */}
        <div className="flex items-center justify-between gap-2 sm:gap-4 py-1.5 sm:py-2 border-b border-slate-100 dark:border-slate-800/60">
          {/* Left: 4 Hub Buttons */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto no-scrollbar scroll-smooth w-full md:w-auto touch-pan-x">
            {hubs.map((hub) => {
              const isHubActive = activeHub.hubKey === hub.hubKey;

              return (
                <button
                  key={hub.hubKey}
                  onClick={() => handleHubClick(hub)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    isHubActive
                      ? hub.hubKey === 'ai'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400/40'
                        : 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/40'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="text-sm shrink-0">{hub.icon}</span>
                  <span>{language === 'tr' ? hub.labelTr : hub.labelEn}</span>
                  {hub.badge && (
                    <span
                      className={`ml-1 text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                        isHubActive
                          ? 'bg-purple-700 text-white'
                          : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                      }`}
                    >
                      {hub.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: Embedded Macro Tickers & Tools */}
          <div className="hidden lg:flex items-center space-x-2 shrink-0">
            {/* US Regime (SPY) */}
            {usRegime && (
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">🇺🇸 SPY</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">${usRegime.close.toFixed(2)}</span>
                <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${
                  usRegime.status === 'Bullish' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' :
                  usRegime.status === 'Bearish' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}>
                  {language === 'tr'
                    ? (usRegime.status === 'Bullish' ? '▲ Boğa' : usRegime.status === 'Bearish' ? '▼ Ayı' : '▶ Nötr')
                    : (usRegime.status === 'Bullish' ? '▲ Bull' : usRegime.status === 'Bearish' ? '▼ Bear' : '▶ Neutral')}
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
                  {language === 'tr'
                    ? (bistRegime.status === 'Bullish' ? '▲ Boğa' : bistRegime.status === 'Bearish' ? '▼ Ayı' : '▶ Denge')
                    : (bistRegime.status === 'Bullish' ? '▲ Bull' : bistRegime.status === 'Bearish' ? '▼ Bear' : '▶ Neutral')}
                </span>
              </div>
            )}

            {/* Simple vs Pro Mode */}
            {onToggleSimpleMode && (
              <button
                type="button"
                onClick={onToggleSimpleMode}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs active:scale-95 ${
                  isSimpleMode
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/25'
                }`}
                title={isSimpleMode ? 'Pro Görünüme Geç' : 'Sade Görünüme Geç'}
              >
                <span>{isSimpleMode ? '🌱' : '⚡'}</span>
                <span>{isSimpleMode ? (language === 'tr' ? 'Basit' : 'Simple') : (language === 'tr' ? 'Pro' : 'Pro')}</span>
              </button>
            )}

            {/* Keyboard Shortcuts */}
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

        {/* ROW 2: Active Hub Sub-Navigation Pills (if Hub has more than 1 view) */}
        {activeHub.subTabs.length > 1 && (
          <div className="flex items-center space-x-1.5 py-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1 shrink-0">
              {language === 'tr' ? `${activeHub.labelTr}:` : `${activeHub.labelEn}:`}
            </span>
            {activeHub.subTabs.map((subTab) => {
              const isSubActive = activeTab === subTab.id;

              return (
                <button
                  key={subTab.id}
                  onClick={() => onTabChange(subTab.id)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isSubActive
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="text-xs">{subTab.icon}</span>
                  <span>{language === 'tr' ? subTab.labelTr : subTab.labelEn}</span>
                  {subTab.count && (
                    <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                      isSubActive
                        ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {subTab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
