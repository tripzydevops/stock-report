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
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if BIST or US is currently in Bearish/Correction
  const isBistCorrection = bistRegime?.status === 'Bearish' || bistRegime?.trend === 'down';
  const isUsCorrection = usRegime?.status === 'Bearish' || usRegime?.trend === 'down';
  const isCorrectionActive = isBistCorrection || isUsCorrection;

  if (!isCorrectionActive) {
    return null;
  }

  if (isDismissed) {
    return (
      <div className="w-full max-w-[1680px] 2xl:max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 pt-3">
        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚠️</span>
            <span className="font-bold">
              {language === 'tr'
                ? 'Piyasa Düzeltme Modunda (BIST 100 Satış Baskısı Altında)'
                : 'Market in Correction Mode (BIST 100 Pullback)'}
            </span>
          </div>
          <button
            onClick={() => setIsDismissed(false)}
            className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
          >
            {language === 'tr' ? 'Rehberi Göster ▼' : 'Show Advice ▼'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1680px] 2xl:max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 pt-3">
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
                  {language === 'tr'
                    ? 'Piyasa Düzeltme Modunda: Panik Yapmayın, Stratejiye Sadık Kalın'
                    : 'Market in Correction: Stay Calm & Follow the Strategy'}
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40">
                  {language === 'tr' ? 'DÜZELTME DÖNEMİ' : 'CORRECTION REGIME'}
                </span>
              </div>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/80 mt-1 leading-relaxed max-w-4xl">
                {language === 'tr'
                  ? 'Borsa genelinde (BIST 100) kâr satışları ve düzeltme yaşanıyor. Hisselerinizdeki son düşüşler şirketlerin kötüleşmesinden değil, genel piyasa dalgasından kaynaklanmaktadır. Bu dönemde duygusal panik satışları en büyük kayıp sebebidir.'
                  : 'The broader market (BIST 100) is experiencing an index-wide pullback. Price drops in your holdings reflect broader market sentiment, not broken fundamentals. Emotional panic selling during corrections is the primary cause of retail losses.'}
              </p>
            </div>
          </div>

          {/* Dismiss Button */}
          <button
            onClick={() => setIsDismissed(true)}
            className="text-amber-700/60 dark:text-amber-400/60 hover:text-amber-900 dark:hover:text-amber-200 text-sm font-bold p-1 rounded-lg hover:bg-amber-500/10 transition-colors shrink-0 cursor-pointer"
            title={language === 'tr' ? 'Gizle' : 'Dismiss'}
          >
            ✕
          </button>
        </div>

        {/* 3 Clear Beginner Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5 mt-3.5 pt-3.5 border-t border-amber-500/20">
          <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🛡️</span>
              <span className="text-xs font-black text-slate-900 dark:text-white">
                {language === 'tr' ? '1. Panikle Satış Yapmayın' : '1. Do Not Panic Sell'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              {language === 'tr'
                ? 'TURSG ve ISMEN gibi kârlı, güçlü temettü şirketleri fiyat düşüşlerinde daha yüksek verim sunar. Borsa toparlandığında ilk yükselenler bu şirketlerdir.'
                : 'Dividend compounders like TURSG and ISMEN offer higher dividend yields on dips. These cash generators are the fastest to recover once market stabilizes.'}
            </p>
          </div>

          <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">💧</span>
              <span className="text-xs font-black text-slate-900 dark:text-white">
                {language === 'tr' ? '2. Kademeli Alım (DCA)' : '2. Disciplined DCA'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              {language === 'tr'
                ? 'Elinizdeki tüm nakdi tek seferde yatırmayın. Fiyat düştükçe küçük parçalarla alarak maliyetinizi kademeli olarak aşağı çekin.'
                : 'Never deploy all capital at once. Accumulate in small tranches on deep dips to systematically average down your cost basis.'}
            </p>
          </div>

          <div className="bg-white/60 dark:bg-slate-900/60 rounded-xl p-3 border border-amber-500/20 shadow-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">✂️</span>
              <span className="text-xs font-black text-slate-900 dark:text-white">
                {language === 'tr' ? '3. Stop-Loss Seviyeleri' : '3. Respect Stop Losses'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              {language === 'tr'
                ? 'Kısa vadeli (Swing) hisselerde stop seviyesi aşıldıysa ısrarcı olmayın; piyasa tepki verdiğinde nakite geçip temettü liderlerine geçiş yapın.'
                : 'For short-term swing trades whose stop losses were hit, avoid bagholding. Rebalance capital into durable high-yield compounders on rebounds.'}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium">
            <span>💡</span>
            <span>
              {language === 'tr'
                ? 'Basit Mod aktifken teknik karmaşa gizlenir, sadece anlaşılır tavsiyeler ve portföy durumu gösterilir.'
                : 'In Simple Mode, complex technical formulas are hidden, focusing only on clear guidance and your portfolio.'}
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
