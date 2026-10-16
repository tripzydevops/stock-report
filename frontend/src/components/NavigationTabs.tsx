'use client';

import React, { useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

export type TabId = 'signals' | 'portfolio' | 'dividend' | 'forecast' | 'scorecard' | 'orb' | 'catalysts' | 'quant';

interface NavigationTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  catalystsCount?: number;
}

export default function NavigationTabs({ activeTab, onTabChange, catalystsCount = 9 }: NavigationTabsProps) {
  const { t, language } = useLanguage();
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const tabs: { id: TabId; label: string; icon: string; count?: string; mobileShort: string }[] = [
    { id: 'signals', label: t.tabs.signals, icon: '🎯', mobileShort: language === 'tr' ? 'Sinyaller' : 'Signals' },
    { id: 'catalysts', label: t.tabs.catalysts, icon: '⚡', count: `${catalystsCount}`, mobileShort: 'KAP' },
    { id: 'quant', label: t.tabs.quant, icon: '🏛️', count: 'Quant', mobileShort: 'Quant' },
    { id: 'portfolio', label: t.tabs.portfolio, icon: '💼', mobileShort: language === 'tr' ? 'Portföy' : 'Portfolio' },
    { id: 'dividend', label: t.tabs.dividend, icon: '💰', mobileShort: language === 'tr' ? 'Temettü' : 'Dividend' },
    { id: 'forecast', label: t.tabs.forecast, icon: '🔮', count: 'DRIP Lab', mobileShort: language === 'tr' ? 'Projeksiyon' : 'Forecast' },
    { id: 'scorecard', label: t.tabs.scorecard, icon: '📈', count: '1,173', mobileShort: language === 'tr' ? 'Karne' : 'Scorecard' },
    { id: 'orb', label: t.tabs.orb, icon: '🔔', mobileShort: language === 'tr' ? 'Açılış' : 'Opening' },
  ];

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

  const currentActiveTabObj = tabs.find(t => t.id === activeTab) || tabs[0];

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-14 sm:top-16 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* MOBILE VIEW (< 640px): Prominent Full-Page Dropdown Selector */}
        <div className="sm:hidden pt-2.5 pb-1">
          <div className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800/80 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
            <div className="flex items-center gap-1.5 pl-1 shrink-0">
              <span className="text-sm">{currentActiveTabObj.icon}</span>
              <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">
                {language === 'tr' ? 'Sayfa:' : 'Page:'}
              </span>
            </div>
            <select
              value={activeTab}
              onChange={(e) => onTabChange(e.target.value as TabId)}
              className="flex-1 text-xs font-black py-1 px-2.5 rounded-lg bg-white dark:bg-gray-750 text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-600 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.icon} {tab.label} {tab.count ? `(${tab.count})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* HORIZONTAL SWIPEABLE TABS WITH VISUAL OVERFLOW HINTS */}
        <div className="relative">
          {/* Left subtle fade */}
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-white dark:from-gray-900 to-transparent pointer-events-none z-10 sm:hidden" />
          
          {/* Scrollable tab strip */}
          <div
            ref={scrollContainerRef}
            className="flex space-x-1.5 sm:space-x-3 overflow-x-auto py-2 sm:py-2.5 no-scrollbar scroll-smooth"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={isActive ? activeTabRef : null}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-2 ring-blue-400/30'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:white hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="text-sm">{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.count && (
                    <span
                      className={`ml-1 text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-blue-700 text-blue-100'
                          : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right subtle fade indicating horizontal scroll available on mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-5 bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none z-10 sm:hidden" />
        </div>
      </div>
    </div>
  );
}
