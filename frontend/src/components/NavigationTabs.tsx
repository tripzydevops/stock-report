'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export type TabId = 'signals' | 'portfolio' | 'dividend' | 'scorecard' | 'orb' | 'catalysts';

interface NavigationTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  catalystsCount?: number;
}

export default function NavigationTabs({ activeTab, onTabChange, catalystsCount = 9 }: NavigationTabsProps) {
  const { t } = useLanguage();

  const tabs: { id: TabId; label: string; icon: string; count?: string }[] = [
    { id: 'signals', label: t.tabs.signals, icon: '🎯' },
    { id: 'catalysts', label: t.tabs.catalysts, icon: '📢', count: `${catalystsCount}` },
    { id: 'portfolio', label: t.tabs.portfolio, icon: '💼' },
    { id: 'dividend', label: t.tabs.dividend, icon: '💰' },
    { id: 'scorecard', label: t.tabs.scorecard, icon: '📈', count: '1,173' },
    { id: 'orb', label: t.tabs.orb, icon: '🔔' },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto py-2.5 no-scrollbar">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count && (
                  <span
                    className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
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
        </nav>
      </div>
    </div>
  );
}
