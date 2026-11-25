'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RegimeStatus } from './MarketRegimeBanner';
import { useAuth } from '../context/AuthContext';

export type TabId = 'signals' | 'watchlist' | 'portfolio' | 'dividend' | 'forecast' | 'scorecard' | 'orb' | 'catalysts' | 'quant' | 'help' | 'assistant';

interface NavItem {
  id: TabId;
  labelTr: string;
  labelEn: string;
  icon: string;
  badge?: string;
  count?: number;
}

interface HubGroup {
  id: string;
  labelTr: string;
  labelEn: string;
  icon: string;
  items: NavItem[];
}

interface SidebarNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  catalystsCount?: number;
  usRegime?: RegimeStatus;
  bistRegime?: RegimeStatus;
  usdTryRate?: number;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onTriggerSync?: (crawler?: boolean) => void;
  isRefreshing?: boolean;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
  onOpenAuthModal?: () => void;
  onOpenReports?: () => void;
}

export default function SidebarNav({
  activeTab,
  onTabChange,
  catalystsCount = 9,
  usRegime,
  bistRegime,
  usdTryRate = 50.43,
  isMobileOpen,
  onCloseMobile,
  onTriggerSync,
  isRefreshing = false,
  onOpenSettings,
  onOpenShortcuts,
  onOpenAuthModal,
  onOpenReports,
}: SidebarNavProps) {
  const { language, setLanguage } = useLanguage();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('marketpulse_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('marketpulse_sidebar_collapsed', String(next));
      }
      return next;
    });
  };

  const handleSelectTab = (tab: TabId) => {
    onTabChange(tab);
    onCloseMobile();
  };

  // 4-Core Hub Organization
  const hubGroups: HubGroup[] = [
    {
      id: 'trade',
      labelTr: 'Al-Sat & Radar',
      labelEn: 'Trade & Radar',
      icon: '🎯',
      items: [
        { id: 'signals', labelTr: 'Sinyaller & Fırsatlar', labelEn: 'Signals & Picks', icon: '🎯' },
        { id: 'orb', labelTr: '15-dk Açılış (ORB)', labelEn: '15-min Opening (ORB)', icon: '🔔' },
        { id: 'watchlist', labelTr: 'Takip Listem & Radar', labelEn: 'Watchlist & Alerts', icon: '⭐', badge: 'RADAR' },
      ],
    },
    {
      id: 'portfolio',
      labelTr: 'Portföy & Kasa',
      labelEn: 'Portfolio & Wealth',
      icon: '💼',
      items: [
        { id: 'portfolio', labelTr: 'Canlı Portföyüm', labelEn: 'My Portfolio', icon: '💼' },
      ],
    },
    {
      id: 'dividend',
      labelTr: 'Temettü & Gelir',
      labelEn: 'Dividends & Cashflow',
      icon: '💧',
      items: [
        { id: 'dividend', labelTr: 'Yağmur Takvimi (12-Ay)', labelEn: 'Raindrop Calendar', icon: '💧' },
        { id: 'forecast', labelTr: 'Kartopu Simülatörü', labelEn: 'Snowball Forecast', icon: '🔮', badge: 'DRIP' },
      ],
    },
    {
      id: 'quant',
      labelTr: 'Quant & Araştırma',
      labelEn: 'Quant & Research',
      icon: '🏛️',
      items: [
        { id: 'catalysts', labelTr: 'KAP Bildirimleri', labelEn: 'KAP Catalysts', icon: '⚡', count: catalystsCount },
        { id: 'quant', labelTr: 'Pairs Stat-Arb', labelEn: 'Pairs Stat-Arb', icon: '🏛️', badge: 'PRO' },
        { id: 'scorecard', labelTr: 'Strateji Karnesi', labelEn: 'Strategy Scorecard', icon: '📈' },
        { id: 'help', labelTr: 'Kullanım Rehberi & SSS', labelEn: 'Guide & FAQ', icon: '📖' },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs md:hidden transition-opacity"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-60 h-screen flex flex-col bg-white dark:bg-[#070b13] border-r border-slate-200/80 dark:border-slate-800/80 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:w-20' : 'md:w-64'
        } ${
          isMobileOpen
            ? 'translate-x-0 w-72 shadow-2xl pointer-events-auto visible'
            : '-translate-x-full md:translate-x-0 pointer-events-none md:pointer-events-auto invisible md:visible'
        }`}
      >
        {/* Brand & Collapse Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-base tracking-tight text-slate-900 dark:text-white truncate">
                    MarketPulse
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shrink-0">
                    4-HUB
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  {language === 'tr' ? 'Otonom Finans Platformu' : 'Autonomous Financial OS'}
                </p>
              </div>
            )}
          </div>

          {/* Desktop Collapse Button */}
          <button
            type="button"
            onClick={toggleCollapse}
            className="hidden md:flex w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 items-center justify-center transition-all cursor-pointer"
            title={isCollapsed ? 'Menüyü Genişlet' : 'Menüyü Daralt'}
          >
            <span className="text-xs">{isCollapsed ? '▶' : '◀'}</span>
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-base font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* AI Co-Pilot Highlight Card / Trigger */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => handleSelectTab('assistant')}
            className={`w-full p-2.5 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer shadow-xs ${
              activeTab === 'assistant'
                ? 'bg-purple-600 text-white border-purple-500 shadow-purple-500/30 ring-2 ring-purple-400/40'
                : 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-200/80 dark:border-purple-800/60 hover:bg-purple-100/80 text-purple-900 dark:text-purple-200'
            }`}
            title="AI Market Copilot"
          >
            <div className="relative shrink-0">
              <span className="text-xl">🤖</span>
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <div className="text-left min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs">AI Copilot</span>
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-purple-200/80 dark:bg-purple-900 text-purple-800 dark:text-purple-300">
                    PRO
                  </span>
                </div>
                <p className="text-[10px] opacity-80 truncate">
                  {language === 'tr' ? 'Otonom Piyasa & Portföy Danışmanı' : 'Autonomous Portfolio Intelligence'}
                </p>
              </div>
            )}
          </button>
        </div>

        {/* Scrollable Hub Groups */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-3 px-3 space-y-4">
          {hubGroups.map((hub) => {
            const isHubActive = hub.items.some(item => item.id === activeTab);

            return (
              <div key={hub.id} className="space-y-1">
                {(!isCollapsed || isMobileOpen) && (
                  <div className="flex items-center justify-between px-2.5 py-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <span>{hub.icon}</span>
                      <span>{language === 'tr' ? hub.labelTr : hub.labelEn}</span>
                    </span>
                    {isHubActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </div>
                )}

                {hub.items.map((item) => {
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      data-tab={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer group ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                      }`}
                      title={language === 'tr' ? item.labelTr : item.labelEn}
                    >
                      <span className="text-base shrink-0">{item.icon}</span>
                      {(!isCollapsed || isMobileOpen) && (
                        <span className="truncate flex-1 text-left">
                          {language === 'tr' ? item.labelTr : item.labelEn}
                        </span>
                      )}
                      {item.count !== undefined && item.count > 0 && (
                        <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-rose-500 text-white shrink-0">
                          {item.count}
                        </span>
                      )}
                      {item.badge && (!isCollapsed || isMobileOpen) && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer with Market Regimes & Tools */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2 shrink-0">
          {(!isCollapsed || isMobileOpen) ? (
            <div className="space-y-2">
              {/* Macro Regime Mini Pills */}
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {bistRegime && (
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 flex items-center justify-between">
                    <span className="font-bold text-slate-500">🇹🇷 BIST</span>
                    <span className={`font-black ${bistRegime.status === 'Bullish' ? 'text-emerald-500' : bistRegime.status === 'Bearish' ? 'text-rose-500' : 'text-amber-500'}`}>
                      {bistRegime.status === 'Bullish' ? '▲ Boğa' : bistRegime.status === 'Bearish' ? '▼ Ayı' : '▶ Nötr'}
                    </span>
                  </div>
                )}
                {usRegime && (
                  <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 flex items-center justify-between">
                    <span className="font-bold text-slate-500">🇺🇸 SPY</span>
                    <span className={`font-black ${usRegime.status === 'Bullish' ? 'text-emerald-500' : usRegime.status === 'Bearish' ? 'text-rose-500' : 'text-amber-500'}`}>
                      {usRegime.status === 'Bullish' ? '▲ Boğa' : usRegime.status === 'Bearish' ? '▼ Ayı' : '▶ Nötr'}
                    </span>
                  </div>
                )}
              </div>

              {/* Utility Action Buttons */}
              <div className="flex items-center justify-between pt-1 text-slate-400">
                <button
                  type="button"
                  onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
                  className="px-2 py-1 rounded text-xs font-bold hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  🌐 {language === 'tr' ? 'EN' : 'TR'}
                </button>
                <button
                  type="button"
                  onClick={onOpenShortcuts}
                  className="px-2 py-1 rounded text-xs font-mono font-bold hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title="Kısayollar"
                >
                  ⌨️ [?]
                </button>
                <button
                  type="button"
                  onClick={onOpenReports}
                  className="px-2 py-1 rounded text-xs font-bold hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  title="Raporlar"
                >
                  📄
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center justify-center cursor-pointer"
              >
                🌐
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
