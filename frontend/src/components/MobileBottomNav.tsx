'use client';

import React, { useState } from 'react';
import { TabId } from './NavigationTabs';
import { useLanguage } from '../context/LanguageContext';

interface MobileBottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  catalystsCount?: number;
  isSimpleMode?: boolean;
  onToggleSimpleMode?: () => void;
  onTriggerSync?: (crawler?: boolean) => void;
  isRefreshing?: boolean;
}

export default function MobileBottomNav({
  activeTab,
  onTabChange,
  catalystsCount = 9,
  isSimpleMode = true,
  onToggleSimpleMode,
  onTriggerSync,
  isRefreshing = false,
}: MobileBottomNavProps) {
  const { language } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const secondaryTabs: { id: TabId; labelTr: string; labelEn: string; icon: string; descTr: string; descEn: string; badge?: string; count?: string }[] = [
    {
      id: 'forecast',
      labelTr: 'Kartopu & Projeksiyon',
      labelEn: 'Snowball & Forecast',
      icon: '🔮',
      descTr: 'DRIP simülatörü, kartopu hedefleri ve BIST/Midas ABD hisseleri kıyaslaması',
      descEn: 'DRIP compounding simulator, snowball milestones & BIST/US stock comparator',
      badge: 'YENİ',
    },
    {
      id: 'catalysts',
      labelTr: 'KAP Bildirimleri & Haberler',
      labelEn: 'KAP Catalysts & News',
      icon: '⚡',
      descTr: 'Canlı KAP akışı, şirket haberleri ve anlık katalizörler',
      descEn: 'Real-time corporate filings, news announcements & catalysts',
      count: catalystsCount > 0 ? `${catalystsCount}` : undefined,
    },
    {
      id: 'orb',
      labelTr: 'Açılış Seansı (15dk ORB)',
      labelEn: 'Opening Direction (ORB)',
      icon: '🔔',
      descTr: '15-dk Açılış kırılım yönleri, hacim anormallikleri ve seans yönü',
      descEn: '15-min Opening Range Breakouts & volume anomalies',
    },
    {
      id: 'quant',
      labelTr: 'Kurumsal Quant Hub',
      labelEn: 'Institutional Quant Hub',
      icon: '🏛️',
      descTr: 'Stat-Arb, Eşbütünleşme (Cointegration) ve Z-Score spread arbitrajı',
      descEn: 'Statistical Arbitrage, Cointegration & Z-score pairs',
      badge: 'PRO',
    },
    {
      id: 'scorecard',
      labelTr: 'Strateji Karnesi & Başarı Oranları',
      labelEn: 'Strategy Scorecard & Win Rates',
      icon: '📈',
      descTr: '1,173 geçmiş trade istatistiği, kâr faktörü ve strateji beklenti analizi',
      descEn: '1,173 trade backtest history, profit factors & expectancy metrics',
    },
    {
      id: 'help',
      labelTr: 'Kullanım Rehberi & SSS',
      labelEn: 'User Guide & FAQ',
      icon: '📖',
      descTr: 'Kademeli alım, stop-loss, temettü kartopu ve AI danışmanı rehberi',
      descEn: 'Step-by-step guide for DCA, stop-losses, DRIP compounding and AI advisor',
      badge: 'REHBER',
    },
  ];

  const handleSelectTab = (tab: TabId) => {
    onTabChange(tab);
    setIsMenuOpen(false);
  };

  const isMoreActive = ['forecast', 'catalysts', 'quant', 'scorecard', 'orb', 'help'].includes(activeTab);

  const getActiveMoreLabel = () => {
    switch (activeTab) {
      case 'forecast': return language === 'tr' ? 'Kartopu' : 'Forecast';
      case 'catalysts': return 'KAP';
      case 'orb': return language === 'tr' ? 'Açılış' : 'Opening';
      case 'quant': return 'Quant';
      case 'scorecard': return language === 'tr' ? 'Karne' : 'Scorecard';
      case 'help': return language === 'tr' ? 'Rehber' : 'Guide';
      default: return language === 'tr' ? 'Menü' : 'More';
    }
  };

  const getActiveMoreIcon = () => {
    switch (activeTab) {
      case 'forecast': return '🔮';
      case 'catalysts': return '⚡';
      case 'orb': return '🔔';
      case 'quant': return '🏛️';
      case 'scorecard': return '📈';
      case 'help': return '📖';
      default: return '☰';
    }
  };

  return (
    <>
      {/* Slide-up Bottom Drawer / Action Sheet for "Menü / Diğer" */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto bg-white/95 dark:bg-[#090e1a]/95 backdrop-blur-xl rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl z-50 space-y-4 animate-in slide-in-from-bottom duration-250 pb-8 safe-bottom">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />

            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📱</span>
                  <span>{language === 'tr' ? 'Tüm MarketPulse Sayfaları' : 'All MarketPulse Views'}</span>
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  {language === 'tr' ? 'İstediğiniz analiz sayfasına tek dokunuşla geçin' : 'Instant 1-tap navigation to any analytics view'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Live Sync Card & Pro Mode Switcher in Drawer */}
            <div className="grid grid-cols-2 gap-2">
              {onTriggerSync && (
                <button
                  type="button"
                  onClick={() => onTriggerSync(false)}
                  disabled={isRefreshing}
                  className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-xs active:scale-95 transition-all cursor-pointer"
                >
                  <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>{isRefreshing ? (language === 'tr' ? 'Yenileniyor...' : 'Syncing...') : (language === 'tr' ? 'Canlı Yenile' : 'Sync Now')}</span>
                </button>
              )}

              {onToggleSimpleMode && (
                <button
                  type="button"
                  onClick={onToggleSimpleMode}
                  className="flex items-center justify-center gap-2 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 font-bold text-xs active:scale-95 transition-all cursor-pointer"
                >
                  <span>{isSimpleMode ? '🌱' : '⚡'}</span>
                  <span>{isSimpleMode ? (language === 'tr' ? 'Pro Moda Geç' : 'Switch to Pro') : (language === 'tr' ? 'Basit Moda Geç' : 'Switch to Simple')}</span>
                </button>
              )}
            </div>

            {/* Special Section: Secondary & Institutional Features */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {language === 'tr' ? 'Derin Piyasa & Araştırma' : 'Deep Market & Analytics'}
              </span>
              <div className="grid grid-cols-1 gap-2">
                {secondaryTabs.map((t) => {
                  const isSelected = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTab(t.id)}
                      className={`flex items-start gap-3 p-3 rounded-2xl text-left transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-500/60 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-800/70 border-gray-200 dark:border-gray-750 hover:bg-gray-100 dark:hover:bg-gray-750'
                      }`}
                    >
                      <div className="text-2xl shrink-0 p-2 rounded-xl bg-white dark:bg-gray-900 shadow-xs border border-gray-200/50 dark:border-gray-700">
                        {t.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                            {language === 'tr' ? t.labelTr : t.labelEn}
                          </span>
                          {t.count && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-500 text-white">
                              {t.count}
                            </span>
                          )}
                          {t.badge && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-500 text-white">
                              {t.badge}
                            </span>
                          )}
                          {isSelected && (
                            <span className="ml-auto text-xs font-black text-blue-600 dark:text-blue-400">✓ Aktif</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                          {language === 'tr' ? t.descTr : t.descEn}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick shortcuts to 4 main pages */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-2">
                {language === 'tr' ? 'Ana Sayfalar' : 'Main Pages'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectTab('signals')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    activeTab === 'signals' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <span>🎯</span>
                  <span>{language === 'tr' ? 'Sinyaller' : 'Signals'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTab('assistant')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    activeTab === 'assistant' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <span>🤖</span>
                  <span>{language === 'tr' ? 'AI Asistan' : 'AI Copilot'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTab('portfolio')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    activeTab === 'portfolio' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <span>💼</span>
                  <span>{language === 'tr' ? 'Portföy' : 'Portfolio'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectTab('dividend')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    activeTab === 'dividend' ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <span>💰</span>
                  <span>{language === 'tr' ? 'Temettü' : 'Dividend'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar (Mobile Only: < 768px) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#080d17]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-4px_20px_rgba(0,0,0,0.15)] px-1 py-1 safe-bottom"
      >
        <div className="grid grid-cols-5 items-center justify-around">
          {/* Tab 1: Signals / Picks */}
          <button
            type="button"
            onClick={() => handleSelectTab('signals')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'signals'
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">🎯</span>
            <span className="text-[10px] tracking-tight">{isSimpleMode ? (language === 'tr' ? 'Tavsiye' : 'Picks') : (language === 'tr' ? 'Sinyaller' : 'Signals')}</span>
          </button>

          {/* Tab 2: AI Asistan (Prominently Placed in Bottom Nav!) */}
          <button
            type="button"
            onClick={() => handleSelectTab('assistant')}
            className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'assistant'
                ? 'text-purple-600 dark:text-purple-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <div className="relative">
              <span className="text-lg leading-none mb-0.5">🤖</span>
              <span className="absolute -top-1 -right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
            </div>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'AI Asistan' : 'AI Copilot'}</span>
          </button>

          {/* Tab 3: Portfolio */}
          <button
            type="button"
            onClick={() => handleSelectTab('portfolio')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'portfolio'
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">💼</span>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'Portföy' : 'Portfolio'}</span>
          </button>

          {/* Tab 4: Dividend / Temettü */}
          <button
            type="button"
            onClick={() => handleSelectTab('dividend')}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              activeTab === 'dividend'
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">💰</span>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'Temettü' : 'Dividends'}</span>
          </button>

          {/* Tab 5: Menu / Diğer Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              isMoreActive || isMenuOpen
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">{getActiveMoreIcon()}</span>
            <span className="text-[10px] tracking-tight">{getActiveMoreLabel()}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
