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

  // Hub grouping for drawer sheet
  const hubDrawerSections = [
    {
      titleTr: '🎯 Al-Sat & Radar',
      titleEn: '🎯 Trade & Radar',
      items: [
        { id: 'signals' as TabId, labelTr: 'Sinyaller & Fırsatlar', labelEn: 'Signals & Picks', icon: '🎯', descTr: 'Kademeli alım, pullback ve trend kırılım fırsatları', descEn: 'DCA dips, pullbacks and breakouts' },
        { id: 'orb' as TabId, labelTr: '15-dk Açılış (ORB)', labelEn: '15-min Opening (ORB)', icon: '🔔', descTr: 'Açılış seansı yön kırılımları ve hacim patlamaları', descEn: 'Opening range breakouts and volume anomalies' },
        { id: 'watchlist' as TabId, labelTr: 'Takip Listem & Radar', labelEn: 'Watchlist & Alerts', icon: '⭐', descTr: 'BIST, ABD ve TEFAS fonları takip listesi ve alarmlar', descEn: 'Independent watchlist and price alerts', badge: 'RADAR' },
      ],
    },
    {
      titleTr: '💼 Portföyüm',
      titleEn: '💼 My Portfolio',
      items: [
        { id: 'portfolio' as TabId, labelTr: 'Canlı Portföy & Kasa', labelEn: 'Live Portfolio & Ledger', icon: '💼', descTr: 'Pozisyonlar, nakit kasa defteri ve gerçekleşen kâr/zarar', descEn: 'Holdings, cash ledger and realized PnL' },
      ],
    },
    {
      titleTr: '💧 Temettü & Gelir',
      titleEn: '💧 Dividends & Cashflow',
      items: [
        { id: 'dividend' as TabId, labelTr: 'Yağmur Takvimi (12-Ay)', labelEn: 'Raindrop Calendar', icon: '💧', descTr: 'KAP tescilli kesinleşenler ve tahmini döngüler', descEn: 'Confirmed corporate payouts and forecast cycles' },
        { id: 'forecast' as TabId, labelTr: 'Kartopu Simülatörü (DRIP)', labelEn: 'Snowball DRIP Lab', icon: '🔮', descTr: 'Bileşik temettü büyümesi ve hisse kıyaslayıcı', descEn: 'Dividend compounding simulator and stock comparator', badge: 'DRIP' },
      ],
    },
    {
      titleTr: '🏛️ Quant & Araştırma',
      titleEn: '🏛️ Quant & Research',
      items: [
        { id: 'catalysts' as TabId, labelTr: 'KAP Bildirimleri', labelEn: 'KAP Catalysts', icon: '⚡', descTr: 'Şirket haberleri, temettü bildirimleri ve genel kurul', descEn: 'Real-time filings and catalysts', count: catalystsCount > 0 ? `${catalystsCount}` : undefined },
        { id: 'quant' as TabId, labelTr: 'Pairs Stat-Arb', labelEn: 'Pairs Arbitrage', icon: '🏛️', descTr: 'Eşbütünleşme (Cointegration) ve Z-Score arbitrajı', descEn: 'Statistical Arbitrage and Z-score spread', badge: 'PRO' },
        { id: 'scorecard' as TabId, labelTr: 'Strateji Karnesi', labelEn: 'Strategy Scorecard', icon: '📈', descTr: '1,173 geçmiş trade istatistiği ve başarı oranları', descEn: 'Historical backtest trade stats' },
        { id: 'help' as TabId, labelTr: 'Kullanım Rehberi & SSS', labelEn: 'User Guide & FAQ', icon: '📖', descTr: 'Kademeli alım kuralları, stop-loss ve platform rehberi', descEn: 'Platform guide and beginner safety rules' },
      ],
    },
  ];

  const handleSelectTab = (tab: TabId) => {
    onTabChange(tab);
    setIsMenuOpen(false);
  };

  const isTradeActive = ['signals', 'orb', 'watchlist'].includes(activeTab);
  const isPortfolioActive = activeTab === 'portfolio';
  const isDividendActive = ['dividend', 'forecast'].includes(activeTab);
  const isQuantActive = ['catalysts', 'quant', 'scorecard', 'help'].includes(activeTab);
  const isAiActive = activeTab === 'assistant';

  return (
    <>
      {/* Slide-up Bottom Drawer / Action Sheet */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMenuOpen(false)}
          />

          <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto bg-white/95 dark:bg-[#090e1a]/95 backdrop-blur-xl rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl z-50 space-y-4 animate-in slide-in-from-bottom duration-250 pb-8 safe-bottom">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />

            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📱</span>
                  <span>{language === 'tr' ? 'MarketPulse Finansal Merkezleri' : 'MarketPulse Financial Hubs'}</span>
                </h3>
                <p className="text-xs text-gray-500 font-medium">
                  {language === 'tr' ? '4 ana finansal hub arasında tek dokunuşla geçin' : 'Instant 1-tap navigation across 4 financial hubs'}
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

            <div className="space-y-4">
              {hubDrawerSections.map((sec, idx) => (
                <div key={idx} className="space-y-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-1">
                    {language === 'tr' ? sec.titleTr : sec.titleEn}
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {sec.items.map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectTab(item.id)}
                          className={`w-full text-left p-2.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/60 text-slate-900 dark:text-white'
                          }`}
                        >
                          <span className="text-xl shrink-0">{item.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-xs">{language === 'tr' ? item.labelTr : item.labelEn}</span>
                              {item.badge && (
                                <span className={`text-[8px] font-black px-1.5 py-0.2 rounded-full ${isActive ? 'bg-white text-blue-700' : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'}`}>
                                  {item.badge}
                                </span>
                              )}
                              {item.count && (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-rose-500 text-white">
                                  {item.count}
                                </span>
                              )}
                            </div>
                            <p className={`text-[10px] truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                              {language === 'tr' ? item.descTr : item.descEn}
                            </p>
                          </div>
                          <span className="text-xs opacity-60">→</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4-Core Hub Mobile Bottom Navigation Bar */}
      <nav
        aria-label={language === 'tr' ? 'Mobil Gezinme Çubuğu' : 'Mobile Navigation Bar'}
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#070b13]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 md:hidden shadow-lg safe-bottom"
      >
        <div className="grid grid-cols-5 h-14 max-w-lg mx-auto px-1 items-center">
          {/* Tab 1: Al-Sat (Trade & Radar) */}
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

          {/* Tab 2: Portföy (Portfolio) */}
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

          {/* Center Tab: AI Copilot */}
          <button
            type="button"
            onClick={() => handleSelectTab('assistant')}
            className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              isAiActive
                ? 'text-purple-600 dark:text-purple-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <div className="relative -mt-3.5 w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/40">
              <span className="text-lg">🤖</span>
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">{language === 'tr' ? 'AI' : 'Copilot'}</span>
          </button>

          {/* Tab 4: Temettü (Dividends) */}
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

          {/* Tab 5: Quant & Menü Drawer */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className={`flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all cursor-pointer ${
              isQuantActive || isMenuOpen
                ? 'text-blue-600 dark:text-blue-400 font-black'
                : 'text-gray-500 dark:text-gray-400 font-semibold hover:text-gray-800'
            }`}
          >
            <span className="text-lg leading-none mb-0.5">🏛️</span>
            <span className="text-[10px] tracking-tight">{language === 'tr' ? 'Quant' : 'Quant'}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
