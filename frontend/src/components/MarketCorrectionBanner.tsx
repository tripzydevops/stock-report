'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { RegimeStatus } from './MarketRegimeBanner';

interface MarketCorrectionBannerProps {
  bistRegime?: RegimeStatus;
  usRegime?: RegimeStatus;
  onNavigateToTab?: (tab: 'portfolio' | 'signals' | 'dividend' | 'help') => void;
}

export default function MarketCorrectionBanner({
  bistRegime,
  usRegime,
  onNavigateToTab,
}: MarketCorrectionBannerProps) {
  const { language } = useLanguage();
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeMarketTab, setActiveMarketTab] = useState<'US' | 'BIST'>('US');

  // Load persistence from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('marketpulse_correction_dismissed');
      setIsDismissed(saved === 'true');
    } catch {
      setIsDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem('marketpulse_correction_dismissed', 'true');
    } catch {
      // Ignore storage errors
    }
  };

  const handleRestore = () => {
    setIsDismissed(false);
    try {
      localStorage.removeItem('marketpulse_correction_dismissed');
    } catch {
      // Ignore storage errors
    }
  };

  // Check if BIST or US is currently in Bearish/Correction
  const isBistCorrection = bistRegime?.status === 'Bearish' || bistRegime?.trend === 'down';
  const isUsCorrection = usRegime?.status === 'Bearish' || usRegime?.trend === 'down';
  const isCorrectionActive = isBistCorrection || isUsCorrection;

  // Auto-select market tab based on which market is actively correcting
  useEffect(() => {
    if (isUsCorrection && !isBistCorrection) {
      setActiveMarketTab('US');
    } else if (isBistCorrection && !isUsCorrection) {
      setActiveMarketTab('BIST');
    }
  }, [isUsCorrection, isBistCorrection]);

  if (!isCorrectionActive) {
    return null;
  }

  if (isDismissed) {
    return (
      <div className="w-full max-w-[1680px] 2xl:max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 pt-3 overflow-hidden">
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚠️</span>
            <span className="font-bold">
              {isUsCorrection
                ? (language === 'tr'
                    ? 'ABD Borsası (S&P 500 / NASDAQ) Son 1 Haftadır Düzeltme Modunda'
                    : 'US Markets (S&P 500 / NASDAQ) 1-Week Pullback Active')
                : (language === 'tr'
                    ? 'Piyasa Düzeltme Modunda'
                    : 'Market in Correction Mode')}
            </span>
          </div>
          <button
            onClick={handleRestore}
            className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
          >
            {language === 'tr' ? 'Rehberi Göster ▼' : 'Show Advice ▼'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1680px] 2xl:max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 pt-3 overflow-hidden">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 shadow-sm p-4 sm:p-5 backdrop-blur-md">
        {/* Glow accent */}
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3">
          {/* Header & Icon */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg sm:text-xl shrink-0 mt-0.5 border border-amber-500/30 shadow-xs">
              ⚠️
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-amber-900 dark:text-amber-200">
                  {activeMarketTab === 'US'
                    ? (language === 'tr'
                        ? `🇺🇸 ABD Borsası (S&P 500 / NASDAQ) ${usRegime?.status === 'Bearish' ? 'Düzeltme Modunda' : 'Piyasa Görünümü'}`
                        : `🇺🇸 US Markets (S&P 500 / NASDAQ) ${usRegime?.status === 'Bearish' ? 'in Pullback' : 'Regime Outlook'}`)
                    : (language === 'tr'
                        ? `🇹🇷 BIST 100 ${bistRegime?.status === 'Bearish' ? 'Düzeltme Modunda' : 'Piyasa Görünümü'}`
                        : `🇹🇷 BIST 100 ${bistRegime?.status === 'Bearish' ? 'in Pullback' : 'Regime Outlook'}`)}
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                  {activeMarketTab === 'US'
                    ? (usRegime?.status ? (language === 'tr' ? `${usRegime.status.toUpperCase()} REJİMİ` : `${usRegime.status.toUpperCase()} REGIME`) : (language === 'tr' ? 'REJİM BİLGİSİ' : 'REGIME DATA'))
                    : (bistRegime?.status ? (language === 'tr' ? `${bistRegime.status.toUpperCase()} REJİMİ` : `${bistRegime.status.toUpperCase()} REGIME`) : (language === 'tr' ? 'REJİM BİLGİSİ' : 'REGIME DATA'))}
                </span>
              </div>

              {/* Dynamic Market Explanation */}
              <p className="text-xs text-amber-800/90 dark:text-amber-300/80 mt-1 leading-relaxed max-w-4xl">
                {activeMarketTab === 'US'
                  ? (language === 'tr'
                      ? (usRegime?.descriptionTr || 'ABD piyasası rejim analizi güncelleniyor. Canlı teknik göstergeler ve EMA trendleri işlenmektedir.')
                      : (usRegime?.descriptionEn || 'US market regime analysis is updating. Live indicators and EMA trends are processing.'))
                  : (language === 'tr'
                      ? (bistRegime?.descriptionTr || 'BIST 100 rejim analizi güncelleniyor. Canlı teknik göstergeler ve EMA trendleri işlenmektedir.')
                      : (bistRegime?.descriptionEn || 'BIST 100 regime analysis is updating. Live indicators and EMA trends are processing.'))}
              </p>

              {/* Market Tab Selector */}
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => setActiveMarketTab('US')}
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    activeMarketTab === 'US'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white/50 dark:bg-slate-800/50 text-amber-900 dark:text-amber-200 border-amber-500/30 hover:bg-amber-500/10'
                  }`}
                >
                  🇺🇸 ABD (SPY / QQQ) {isUsCorrection && '⚠️ Düzeltmede'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMarketTab('BIST')}
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    activeMarketTab === 'BIST'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white/50 dark:bg-slate-800/50 text-amber-900 dark:text-amber-200 border-amber-500/30 hover:bg-amber-500/10'
                  }`}
                >
                  🇹🇷 BIST 100 {!isBistCorrection ? '✅ Tepki / Denge' : '⚠️ Düzeltmede'}
                </button>
              </div>
            </div>
          </div>

          {/* Dismiss Button */}
          <button
            onClick={handleDismiss}
            className="text-amber-700/60 dark:text-amber-400/60 hover:text-amber-900 dark:hover:text-amber-200 text-sm font-bold p-1 rounded-lg hover:bg-amber-500/10 transition-colors shrink-0 cursor-pointer"
            title={language === 'tr' ? 'Kapat (Tekrar Gösterme)' : 'Dismiss'}
          >
            ✕
          </button>
        </div>

        {/* Mobile Expand / Collapse Toggle Button */}
        <div className="sm:hidden mt-2 pt-2 border-t border-amber-500/20 flex justify-between items-center">
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="text-[11px] font-bold text-amber-800 dark:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 flex items-center gap-1 active:scale-95 cursor-pointer"
          >
            <span>{isExpanded ? (language === 'tr' ? '▲ Taktik Rehberini Gizle' : '▲ Hide Tactics') : (language === 'tr' ? '▼ 3 Adımlı Strateji Rehberi' : '▼ 3-Step Strategy Guide')}</span>
          </button>
          <span className="text-[10px] text-amber-700/80 dark:text-amber-300/80 font-semibold">
            {language === 'tr' ? 'DCA & Sabır' : 'DCA & Patience'}
          </span>
        </div>

        {/* 3 Clear Action Cards */}
        <div className={`${isExpanded ? 'grid' : 'hidden sm:grid'} grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5 mt-3.5 pt-3.5 border-t border-amber-500/20`}>
          {activeMarketTab === 'US' ? (
            <>
              <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🛡️</span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {language === 'tr' ? '1. Teknoloji Panik Satışı Yapmayın' : '1. Avoid Tech Panic Selling'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                  {language === 'tr'
                    ? 'NVDA, MSFT ve Apple gibi nakit zengini devlerdeki %4-6 haftalık düşüşler trend bitişi değil, zirve sonrası sağlıklı bir kâr realizasyonudur.'
                    : 'Weekly 4–6% pullbacks in cash-rich giants like NVDA, MSFT, and AAPL represent healthy profit-taking rather than secular trend exhaustion.'}
                </p>
              </div>

              <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">💧</span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {language === 'tr' ? '2. 50 Günlük EMA Kademeli Alım (DCA)' : '2. 50-EMA Dollar Cost Averaging'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                  {language === 'tr'
                    ? 'S&P 500 ve Nasdaq destek bölgelerine yaklaştıkça tüm sermayeyi tek fiyattan bağlamadan, 3 parçalı kademeli alım emirleriyle maliyet düşürün.'
                    : 'Deploy capital in 3 distinct tranches as major indices test 50-day moving averages rather than lump-sum guessing the exact low.'}
                </p>
              </div>

              <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🥤</span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {language === 'tr' ? '3. Temettü Kralları Kalkanı' : '3. Dividend Kings Defense'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                  {language === 'tr'
                    ? 'KO (Coca-Cola), PEP ve MO gibi düzenli döviz temettüsü ödeyen defansif şirketler, teknoloji düzeltmelerinde portföy dalgalanmasını nötrler.'
                    : 'Dividend Aristocrats and Kings like KO, PEP, and MO offer safe-harbor cash flows, softening overall portfolio drawdown during growth rotations.'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">📈</span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {language === 'tr' ? '1. Ana Destek Seviyesi Korunuyor' : '1. Key Structural Support Floor'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                  {language === 'tr'
                    ? 'BIST 100 kritik dip seviyelerinden tepki vermektedir. Panik satışı yerine hacimli açılış yapan sektör öncülerine odaklanın.'
                    : 'BIST 100 is defending key structural support. Focus on volume-confirmed opening leaders rather than capitulation selling.'}
                </p>
              </div>

              <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🏛️</span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {language === 'tr' ? '2. Yüksek Nakit Akışlı Şirketler' : '2. Strong Cash Flow Leaders'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                  {language === 'tr'
                    ? 'TURSG, FROTO ve CCOLA gibi yüksek temettü ve kârlılık büyümesi olan şirketler toparlanma sürecinde ilk primlenen varlıklardır.'
                    : 'Companies with robust cash flow and predictable dividends (TURSG, FROTO, CCOLA) lead market recoveries.'}
                </p>
              </div>

              <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">✂️</span>
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    {language === 'tr' ? '3. Swing Stop Seviyelerine Sadakat' : '3. Discipline on Swing Stops'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                  {language === 'tr'
                    ? 'Kısa vadeli momentum işlemlerinde belirlenen stop noktalarına sadık kalarak kârınızı koruyun ve sermayeyi temettüye yönlendirin.'
                    : 'Honor stop losses on short-term tactical trades to lock in liquidity for long-term compounders.'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`${isExpanded ? 'flex' : 'hidden sm:flex'} items-center justify-between flex-wrap gap-2 mt-3 pt-2 text-[11px]`}>
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium">
            <span>💡</span>
            <span>
              {language === 'tr'
                ? 'Piyasa dalgalanmaları sırasında kural tabanlı sistemler duygusal kararların önüne geçer.'
                : 'Rule-based systems protect portfolios against emotional panic during market drawdowns.'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToTab && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateToTab('help')}
                  className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-200 font-bold transition-all shadow-xs active:scale-95 cursor-pointer border border-amber-300 dark:border-amber-700/80 flex items-center gap-1"
                >
                  <span>📖</span>
                  <span>{language === 'tr' ? 'Rehberi Oku →' : 'Read Guide →'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateToTab('portfolio')}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                >
                  {language === 'tr' ? 'Portföyümü İncele →' : 'Review My Holdings →'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
