'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RegimeStatus } from './MarketRegimeBanner';
import { useAuth } from '../context/AuthContext';

export type TabId = 'signals' | 'portfolio' | 'dividend' | 'forecast' | 'scorecard' | 'orb' | 'catalysts' | 'quant' | 'help';

interface NavItem {
  id: TabId;
  labelTr: string;
  labelEn: string;
  icon: string;
  category: 'core' | 'advanced';
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  // Core Portfolio & Trading
  { id: 'signals', labelTr: 'Sinyaller & Fırsatlar', labelEn: 'Signals & Picks', icon: '🎯', category: 'core' },
  { id: 'portfolio', labelTr: 'Portföyüm', labelEn: 'My Portfolio', icon: '💼', category: 'core' },
  { id: 'dividend', labelTr: 'Temettü Gelirleri', labelEn: 'Dividend Tracker', icon: '💰', category: 'core' },
  { id: 'forecast', labelTr: 'Kartopu & Projeksiyon', labelEn: 'Snowball Forecast', icon: '🔮', category: 'core' },

  // Advanced & Intelligence
  { id: 'catalysts', labelTr: 'KAP Bildirimleri', labelEn: 'KAP Catalysts', icon: '⚡', category: 'advanced' },
  { id: 'quant', labelTr: 'Kurumsal Quant Hub', labelEn: 'Quant Stat-Arb', icon: '🏛️', category: 'advanced', badge: 'PRO' },
  { id: 'scorecard', labelTr: 'Strateji Karnesi', labelEn: 'Strategy Scorecard', icon: '📈', category: 'advanced' },
  { id: 'orb', labelTr: 'Açılış Seansı (ORB)', labelEn: 'Opening Direction', icon: '🔔', category: 'advanced' },
];

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
}

export default function SidebarNav({
  activeTab,
  onTabChange,
  catalystsCount = 9,
  usRegime,
  bistRegime,
  usdTryRate = 48.95,
  isMobileOpen,
  onCloseMobile,
  onTriggerSync,
  isRefreshing = false,
  onOpenSettings,
  onOpenShortcuts,
  onOpenAuthModal,
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
          isMobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Brand & Collapse Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200/80 dark:border-slate-800/80 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30 shrink-0">
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
                    LIVE
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  {language === 'tr' ? 'Otonom Tavsiye & Portföy' : 'Autonomous AI Advisor'}
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

        {/* Scrollable Navigation Items */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-4 px-3 space-y-6">
          {/* Core Section */}
          <div className="space-y-1">
            {(!isCollapsed || isMobileOpen) && (
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 pb-1 block">
                {language === 'tr' ? 'Portföy & Fırsatlar' : 'Core & Portfolio'}
              </span>
            )}
            {NAV_ITEMS.filter(item => item.category === 'core').map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer group ${
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
                  {item.badge && (!isCollapsed || isMobileOpen) && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Advanced Section */}
          <div className="space-y-1">
            {(!isCollapsed || isMobileOpen) && (
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 pb-1 block">
                {language === 'tr' ? 'Gelişmiş Analizler' : 'Advanced Analytics'}
              </span>
            )}
            {NAV_ITEMS.filter(item => item.category === 'advanced').map(item => {
              const isActive = activeTab === item.id;
              const isKap = item.id === 'catalysts';
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer group ${
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
                  {isKap && catalystsCount > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-rose-500 text-white shrink-0">
                      {catalystsCount}
                    </span>
                  )}
                  {item.badge && (!isCollapsed || isMobileOpen) && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Help & Knowledge Base Section */}
          <div className="space-y-1">
            {(!isCollapsed || isMobileOpen) && (
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-3 pb-1 block">
                {language === 'tr' ? 'Rehber & Destek' : 'Guide & Support'}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleSelectTab('help')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer group ${
                activeTab === 'help'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
              title={language === 'tr' ? 'Kullanım Rehberi & SSS' : 'User Guide & FAQ'}
            >
              <span className="text-base shrink-0">📖</span>
              {(!isCollapsed || isMobileOpen) && (
                <span className="truncate flex-1 text-left">
                  {language === 'tr' ? 'Kullanım Rehberi' : 'User Guide'}
                </span>
              )}
              {(!isCollapsed || isMobileOpen) && (
                <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 shrink-0">
                  {language === 'tr' ? 'REHBER' : 'GUIDE'}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Sidebar Footer Utility Dock */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2 shrink-0 bg-slate-50/60 dark:bg-slate-900/40">
          {/* Market Status Widget */}
          {(!isCollapsed || isMobileOpen) ? (
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {language === 'tr' ? 'Piyasa Durumu' : 'Market Status'}
                </span>
                <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
                  ₺{usdTryRate.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700 dark:text-slate-300">🇹🇷 BIST 100</span>
                <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                  bistRegime?.status === 'Bearish'
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {bistRegime?.status === 'Bearish' ? 'Düzeltme' : 'Boğa'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700 dark:text-slate-300">🇺🇸 SPY</span>
                <span className="font-bold px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {usRegime?.status || 'Boğa'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-1 text-center">
              <span className="text-sm" title={`USD/TRY: ₺${usdTryRate.toFixed(2)}`}>💵</span>
              <span className={`w-2.5 h-2.5 rounded-full ${bistRegime?.status === 'Bearish' ? 'bg-rose-500' : 'bg-emerald-500'}`} title="BIST 100 Rejimi" />
            </div>
          )}

          {/* Quick Actions Strip */}
          {isMobileOpen ? (
            <div className="space-y-2">
              <button
                onClick={() => onTriggerSync?.(false)}
                disabled={isRefreshing}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                title="Piyasa Verilerini Canlı Senkronize Et"
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>
                  {isRefreshing
                    ? (language === 'tr' ? 'Veriler Yenileniyor...' : 'Syncing Data...')
                    : (language === 'tr' ? 'Piyasa Verilerini Canlı Yenile' : 'Sync Live Market Data')}
                </span>
              </button>
              <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
                  className="flex-1 py-1.5 rounded-xl hover:bg-slate-200/80 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 text-center transition-all cursor-pointer"
                  title={language === 'tr' ? 'Switch to English' : 'Türkçe Dilini Seç'}
                >
                  {language === 'tr' ? '🇹🇷 Türkçe' : '🇬🇧 English'}
                </button>
                <button
                  onClick={onOpenSettings}
                  className="p-1.5 rounded-xl hover:bg-slate-200/80 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                  title="Ayarlar & Profil"
                >
                  ⚙️
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1">
              {/* Sync Button */}
              <button
                onClick={() => onTriggerSync?.(false)}
                disabled={isRefreshing}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                  isCollapsed
                    ? 'bg-transparent text-slate-500 hover:text-blue-600'
                    : 'bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                }`}
                title="Verileri Canlı Senkronize Et"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {!isCollapsed && <span>{isRefreshing ? '...' : (language === 'tr' ? 'Yenile' : 'Sync')}</span>}
              </button>

              {/* Language Switcher */}
              <button
                onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
                className="p-1.5 rounded-xl hover:bg-slate-200/80 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                title={language === 'tr' ? 'Switch to English' : 'Türkçe Dilini Seç'}
              >
                {language === 'tr' ? '🇹🇷 TR' : '🇬🇧 EN'}
              </button>

              {/* Settings Trigger */}
              <button
                onClick={onOpenSettings}
                className="p-1.5 rounded-xl hover:bg-slate-200/80 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                title="Ayarlar & Profil"
              >
                ⚙️
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
