'use client';

import React, { useState, useEffect, useRef } from 'react';
import { TabId, CORE_HUBS, AI_COPILOT_ITEM } from '../config/navigation';
import { useLanguage } from '../context/LanguageContext';

interface MobileBottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  catalystsCount?: number;
  isSimpleMode?: boolean;
  onToggleSimpleMode?: () => void;
  onTriggerSync?: (crawler?: boolean) => void;
  isRefreshing?: boolean;
  onOpenSettings?: () => void;
  onOpenAuthModal?: () => void;
}

export default function MobileBottomNav({
  activeTab,
  onTabChange,
  catalystsCount = 9,
  isSimpleMode = true,
  onToggleSimpleMode,
  onTriggerSync,
  isRefreshing = false,
  onOpenSettings,
  onOpenAuthModal,
}: MobileBottomNavProps) {
  const { language, setLanguage } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Background scroll locking, initial focus, focus trapping, focus restoration & Escape dismissal
  useEffect(() => {
    if (isMenuOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const rafId = requestAnimationFrame(() => {
        closeBtnRef.current?.focus();
      });

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsMenuOpen(false);
          return;
        }
        if (e.key === 'Tab' && dialogRef.current) {
          const focusable = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter(el => el.offsetParent !== null);
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        cancelAnimationFrame(rafId);
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
        previousFocusRef.current?.focus();
      };
    }
  }, [isMenuOpen]);

  const handleSelectTab = (tab: TabId) => {
    onTabChange(tab);
    setIsMenuOpen(false);
  };

  const isTradeActive = ['signals', 'orb', 'watchlist'].includes(activeTab);
  const isPortfolioActive = activeTab === 'portfolio';
  const isDividendActive = ['dividend', 'forecast'].includes(activeTab);
  const isQuantActive = ['catalysts', 'quant', 'scorecard', 'help'].includes(activeTab);

  return (
    <>
      {/* Accessible Slide-up Bottom Drawer / Navigation & Settings Sheet */}
      {isMenuOpen && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={language === 'tr' ? 'MarketPulse Gezinti ve Ayarlar Menüsü' : 'MarketPulse Navigation & Settings Menu'}
          className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />

          <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto bg-white/95 dark:bg-[#090e1a]/95 backdrop-blur-xl rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl z-50 space-y-4 animate-in slide-in-from-bottom duration-250 pb-8 safe-bottom">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />

            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📱</span>
                  <span>{language === 'tr' ? 'MarketPulse Menü & Ayarlar' : 'Navigation & Settings Menu'}</span>
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  {language === 'tr' ? 'Tüm finansal araçlara ve ayarlara hızlı erişim' : 'Instant access to all financial hubs & platform settings'}
                </p>
              </div>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer"
                aria-label={language === 'tr' ? 'Menüyü Kapat' : 'Close Menu'}
              >
                ✕
              </button>
            </div>

            {/* AI Copilot Utility Highlight Banner */}
            <button
              type="button"
              onClick={() => handleSelectTab('assistant')}
              className="w-full text-left p-3.5 rounded-2xl bg-gradient-to-r from-purple-600/15 via-indigo-600/15 to-blue-600/15 border border-purple-300 dark:border-purple-800 flex items-center justify-between cursor-pointer hover:border-purple-400 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center text-xl shadow-md shadow-purple-500/30">
                  🤖
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-purple-950 dark:text-purple-200">
                      {language === 'tr' ? 'AI Piyasa & Portföy Asistanı' : 'AI Market & Portfolio Copilot'}
                    </span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-purple-600 text-white">
                      PRO
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-800/80 dark:text-purple-300/80">
                    {language === 'tr' ? 'Risk analizleri, kademeli alım ve portföy check-up' : 'Risk diagnostics, DCA planning, portfolio check-up'}
                  </p>
                </div>
              </div>
              <span className="text-purple-600 dark:text-purple-400 text-sm font-bold">➔</span>
            </button>

            {/* Hub Directory Sections */}
            <div className="space-y-4">
              {CORE_HUBS.map((hub) => (
                <div key={hub.hubKey} className="space-y-1.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                      {hub.icon} {language === 'tr' ? hub.labelTr : hub.labelEn}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {hub.subTabs.length} {language === 'tr' ? 'ekran' : 'views'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {hub.subTabs.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectTab(item.id)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all cursor-pointer ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400'
                              : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <span className="text-xl shrink-0">{item.icon}</span>
                            <div className="truncate">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm">
                                  {language === 'tr' ? item.labelTr : item.labelEn}
                                </span>
                                {item.badge && (
                                  <span
                                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                      isActive
                                        ? 'bg-white/20 text-white'
                                        : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                                {item.id === 'catalysts' && catalystsCount > 0 && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                                    {catalystsCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className={`text-xs ${isActive ? 'text-white' : 'text-slate-400'}`}>➔</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Platform Controls & Quick Actions (Accessible Settings Replacement) */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-1">
                ⚙️ {language === 'tr' ? 'Platform Kontrolleri' : 'Platform Controls'}
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Cloud Sync Button */}
                {onTriggerSync && (
                  <button
                    type="button"
                    onClick={() => {
                      onTriggerSync();
                      setIsMenuOpen(false);
                    }}
                    disabled={isRefreshing}
                    className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    <span className={isRefreshing ? 'animate-spin' : ''}>🔄</span>
                    <span>{isRefreshing ? (language === 'tr' ? 'Eşitleniyor...' : 'Syncing...') : (language === 'tr' ? 'Bulut Eşitle' : 'Cloud Sync')}</span>
                  </button>
                )}

                {/* Simple / Pro Mode Toggle */}
                {onToggleSimpleMode && (
                  <button
                    type="button"
                    onClick={onToggleSimpleMode}
                    className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl font-bold transition-all cursor-pointer ${
                      isSimpleMode
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                    }`}
                  >
                    <span>{isSimpleMode ? '🌱' : '⚡'}</span>
                    <span>{isSimpleMode ? (language === 'tr' ? 'Sade Mod: Açık' : 'Simple Mode: On') : (language === 'tr' ? 'Pro Mod: Açık' : 'Pro Mode: On')}</span>
                  </button>
                )}

                {/* Language Switcher */}
                <button
                  type="button"
                  onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
                  className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                >
                  <span>{language === 'tr' ? '🇺🇸' : '🇹🇷'}</span>
                  <span>{language === 'tr' ? 'Switch to English' : 'Türkçe\'ye Geç'}</span>
                </button>

                {/* Auth / Account Trigger */}
                {onOpenAuthModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAuthModal();
                      setIsMenuOpen(false);
                    }}
                    className="flex items-center justify-center gap-1.5 p-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all cursor-pointer shadow-xs"
                  >
                    <span>☁️</span>
                    <span>{language === 'tr' ? 'Giriş / Hesap' : 'Sign In / Cloud'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5-Button Mobile Bottom Bar */}
      <nav 
        aria-label={language === 'tr' ? 'Mobil Alt Menü' : 'Mobile Bottom Navigation'}
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#090e1a]/95 backdrop-blur-lg border-t border-gray-200 dark:border-gray-800 safe-bottom shadow-lg"
      >
        <div className="grid grid-cols-5 h-14 max-w-lg mx-auto px-1">
          {/* Destination 1: Al-Sat (Signals / ORB / Watchlist) */}
          <button
            type="button"
            onClick={() => handleSelectTab(isTradeActive ? activeTab : 'signals')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              isTradeActive
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">🎯</span>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'Al-Sat' : 'Trade'}</span>
          </button>

          {/* Destination 2: Portföy (Portfolio & Wealth) */}
          <button
            type="button"
            onClick={() => handleSelectTab('portfolio')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              isPortfolioActive
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">💼</span>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'Portföy' : 'Portfolio'}</span>
          </button>

          {/* Destination 3: Temettü (Dividends & Income) */}
          <button
            type="button"
            onClick={() => handleSelectTab(isDividendActive ? activeTab : 'dividend')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              isDividendActive
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">💧</span>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'Temettü' : 'Dividends'}</span>
          </button>

          {/* Destination 4: Quant (Research & Intel) */}
          <button
            type="button"
            onClick={() => handleSelectTab(isQuantActive ? activeTab : 'catalysts')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              isQuantActive
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">🏛️</span>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'Quant' : 'Quant'}</span>
          </button>

          {/* Destination 5: Menü (Action Sheet with Hub Directory, AI & Controls) */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isMenuOpen}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              isMenuOpen
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">☰</span>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'Menü' : 'Menu'}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
