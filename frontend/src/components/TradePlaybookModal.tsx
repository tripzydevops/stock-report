'use client';

import React, { useState, useEffect } from 'react';
import { PortfolioItem } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';

interface TradePlaybookModalProps {
  isOpen: boolean;
  onClose: () => void;
  holding: PortfolioItem | null;
  onUpdateStopLoss?: (symbol: string, newStop: number) => void;
  onSelectTicker?: (symbol: string) => void;
}

export default function TradePlaybookModal({
  isOpen,
  onClose,
  holding,
  onUpdateStopLoss,
  onSelectTicker,
}: TradePlaybookModalProps) {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [loading, setLoading] = useState(false);
  const [playbookData, setPlaybookData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [breakevenApplied, setBreakevenApplied] = useState(false);

  useEffect(() => {
    if (!isOpen || !holding) {
      setPlaybookData(null);
      setBreakevenApplied(false);
      return;
    }

    const fetchPlaybook = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/assistant/playbook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: holding.symbol,
            shares: holding.shares,
            entryPrice: holding.entryPrice,
            currentPrice: holding.currentPrice,
            stopLoss: holding.stopLoss,
            targetPrice: holding.targetPrice,
            currency: holding.currency,
            isDividend: holding.isDividend,
            pnlPercent: holding.pnlPercent,
            strategyType: holding.strategyType || 'SWING',
            language,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          setPlaybookData(json);
        }
      } catch (err) {
        console.error('Failed to load trade playbook:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaybook();
  }, [isOpen, holding, language]);

  if (!isOpen || !holding) return null;

  const currSym = holding.currency === 'USD' ? '$' : '₺';
  const isProfit = holding.pnlPercent >= 0;

  const handleApplyBreakeven = () => {
    if (!holding || !onUpdateStopLoss) return;
    onUpdateStopLoss(holding.symbol, holding.entryPrice);
    setBreakevenApplied(true);
  };

  const handleCopy = () => {
    if (!playbookData) return;
    const text = `📋 [MarketPulse Trade Playbook - ${playbookData.symbol}]
- Posture: ${playbookData.posture.title} (${playbookData.rMultiple}R)
- Entry: ${currSym}${playbookData.entryPrice} | Current: ${currSym}${playbookData.currentPrice} (${isProfit ? '+' : ''}${playbookData.pnlPercent.toFixed(2)}%)
- Invalidation Stop: ${currSym}${playbookData.invalidation.stopLossPrice} (${playbookData.invalidation.distancePct}% buffer)
- Tranche 1 (50% Scale-Out): Sell ${playbookData.executionTranches.tranche1.sharesToSell} shs @ ${currSym}${playbookData.executionTranches.tranche1.targetPrice} (Unlocks ${currSym}${playbookData.executionTranches.tranche1.proceeds})
- Tranche 2 (Runner): Ride remaining ${playbookData.executionTranches.tranche2.sharesToSell} shs to ${currSym}${playbookData.executionTranches.tranche2.targetPrice}
- Buyback Zone: Re-accumulate @ ${currSym}${playbookData.buybackBlueprint.supportMin} - ${currSym}${playbookData.buybackBlueprint.supportMax} (~${playbookData.buybackBlueprint.potentialRebuyShares} shares)
- AI Plan: ${playbookData.aiSynthesis}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="bg-white dark:bg-gray-850 w-full max-w-2xl rounded-3xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="p-5 border-b border-gray-100 dark:border-gray-750 flex items-center justify-between gap-3 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-850 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-xl shadow-md shadow-blue-500/20 shrink-0">
              📋
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onSelectTicker?.(holding.symbol)}
                  className="text-lg font-black text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1"
                >
                  <span>{holding.symbol}</span>
                  <span className="text-xs text-blue-500 opacity-60">↗</span>
                </button>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {holding.market}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  {holding.strategyType || 'SWING'}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate max-w-xs sm:max-w-md">
                {holding.name} · {holding.shares} {isEn ? 'shares held' : 'adet hisse'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-750 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-1 cursor-pointer"
              title={isEn ? 'Copy playbook to clipboard' : 'Planı panoya kopyala'}
            >
              <span>{copied ? '✓' : '📄'}</span>
              <span className="hidden sm:inline">{copied ? (isEn ? 'Copied' : 'Kopyalandı') : (isEn ? 'Copy Plan' : 'Kopyala')}</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-750 text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
                {isEn ? 'Calculating institutional execution roadmap...' : 'Kurumsal işlem planı ve geri alım desteği hesaplanıyor...'}
              </p>
              <p className="text-xs text-gray-400">
                {isEn ? 'Evaluating ATR volatility, scale-out tranches, and vector catalysts' : 'ATR volatilitesi, kademeli kâr hedefleri ve KAP bildirimleri analiz ediliyor'}
              </p>
            </div>
          ) : playbookData ? (
            <>
              {/* Posture & Price Summary Card */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      {isEn ? 'Trade Posture:' : 'Pozisyon Durumu:'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${playbookData.posture.color}`}>
                      {playbookData.posture.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-sm pt-0.5">
                    <div>
                      <span className="text-[10px] text-gray-400 block">{isEn ? 'Entry' : 'Maliyet'}</span>
                      <span className="font-bold text-gray-900 dark:text-white">{currSym}{playbookData.entryPrice.toFixed(2)}</span>
                    </div>
                    <span className="text-gray-300">➔</span>
                    <div>
                      <span className="text-[10px] text-gray-400 block">{isEn ? 'Current' : 'Cari'}</span>
                      <span className="font-bold text-gray-900 dark:text-white">{currSym}{playbookData.currentPrice.toFixed(2)}</span>
                    </div>
                    <span className={`font-bold text-xs px-2 py-0.5 rounded-md ${isProfit ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                      {isProfit ? '▲ +' : '▼ '}{playbookData.pnlPercent.toFixed(2)}% ({playbookData.rMultiple}R)
                    </span>
                  </div>
                </div>

                {playbookData.morningOrb && (
                  <div className="px-3 py-2 rounded-xl bg-white dark:bg-gray-750 border border-gray-200/80 dark:border-gray-650 shrink-0 text-right">
                    <div className="text-[10px] font-bold text-gray-400 uppercase">
                      {isEn ? '10:00 AM Open:' : 'Bugünkü Açılış:'}
                    </div>
                    <div className="font-bold text-xs text-gray-900 dark:text-white flex items-center justify-end gap-1">
                      <span>{playbookData.morningOrb.gapPercent >= 0 ? '🟢' : '🔴'}</span>
                      <span>{playbookData.morningOrb.gapType} ({playbookData.morningOrb.gapPercent >= 0 ? '+' : ''}{playbookData.morningOrb.gapPercent}%)</span>
                    </div>
                    <div className="text-[10px] text-gray-500 font-medium">
                      {playbookData.morningOrb.orbStatus}
                    </div>
                  </div>
                )}
              </div>

              {/* Visual Execution Roadmap */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🛣️</span>
                  <span>{isEn ? 'Institutional Multi-Tier Roadmap' : 'Kurumsal Çok Kademeli Yol Haritası'}</span>
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Stop Loss */}
                  <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 block">
                        🛡️ {isEn ? 'Invalidation Stop' : 'Geçersizlik Stopu'}
                      </span>
                      <span className="font-mono text-sm font-black text-rose-900 dark:text-rose-200 mt-1 block">
                        {currSym}{playbookData.invalidation.stopLossPrice.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[10px] text-rose-600 dark:text-rose-400 mt-1">
                      {playbookData.invalidation.distancePct}% {isEn ? 'buffer' : 'mesafe'}
                    </span>
                  </div>

                  {/* Breakeven Level */}
                  <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 block">
                        ⚓ {isEn ? 'Breakeven Shield' : 'Maliyet Kalkanı'}
                      </span>
                      <span className="font-mono text-sm font-black text-blue-900 dark:text-blue-200 mt-1 block">
                        {currSym}{playbookData.invalidation.breakevenPrice.toFixed(2)}
                      </span>
                    </div>
                    {playbookData.currentPrice > playbookData.entryPrice && onUpdateStopLoss && !breakevenApplied ? (
                      <button
                        onClick={handleApplyBreakeven}
                        className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors shadow-xs"
                      >
                        {isEn ? 'Raise Stop Now' : 'Stopu Maliyete Çek'}
                      </button>
                    ) : (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
                        {breakevenApplied ? '✓ Aktif Edildi' : (isEn ? 'Free Trade Level' : 'Risksiz İşlem Seviyesi')}
                      </span>
                    )}
                  </div>

                  {/* Tranche 1 (Scale-Out 50%) */}
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 block">
                        🎯 {isEn ? 'Hedef 1 (Scale-Out 50%)' : 'Hedef 1 (%50 Kâr Satışı)'}
                      </span>
                      <span className="font-mono text-sm font-black text-emerald-900 dark:text-emerald-200 mt-1 block">
                        {currSym}{playbookData.executionTranches.tranche1.targetPrice.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                      {playbookData.executionTranches.tranche1.sharesToSell} shs ({currSym}{playbookData.executionTranches.tranche1.profitAmount > 0 ? `+${playbookData.executionTranches.tranche1.profitAmount}` : ''})
                    </span>
                  </div>

                  {/* Tranche 2 (Runner) */}
                  <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 block">
                        🚀 {isEn ? 'Hedef 2 (Runner %50)' : 'Hedef 2 (Koşucu %50)'}
                      </span>
                      <span className="font-mono text-sm font-black text-purple-900 dark:text-purple-200 mt-1 block">
                        {currSym}{playbookData.executionTranches.tranche2.targetPrice.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold mt-1">
                      {playbookData.executionTranches.tranche2.sharesToSell} shs (Trend Sür)
                    </span>
                  </div>
                </div>
              </div>

              {/* The "Buy Back Cheaper" Pullback Re-accumulation Blueprint */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/60 dark:from-indigo-950/40 dark:via-gray-800 dark:to-blue-950/30 border border-indigo-200 dark:border-indigo-800/80 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                    <span>🔄</span>
                    <span>{isEn ? 'Pullback & Re-accumulation Blueprint (The Buyback Plan)' : 'Düzeltme & Geri Alım Planı (Kârla Alttan Yerine Koyma)'}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700">
                    %{playbookData.buybackBlueprint.projectedDiscountPct} {isEn ? 'Discount' : 'İskonto Bölgesi'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-indigo-100 dark:border-indigo-900 space-y-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                      {isEn ? 'Expected Pullback Pocket:' : 'Beklenen Düzeltme Destek Bandı:'}
                    </span>
                    <div className="font-mono text-sm font-black text-indigo-900 dark:text-indigo-200">
                      {currSym}{playbookData.buybackBlueprint.supportMin.toFixed(2)} – {currSym}{playbookData.buybackBlueprint.supportMax.toFixed(2)}
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      {isEn ? 'Corresponds to EMA20 dynamic support and 38.2% Fibonacci retracement.' : 'Yükselen 20-günlük EMA desteği ve %38.2 Fibonacci geri çekilme cebine tekabül eder.'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-indigo-100 dark:border-indigo-900 space-y-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                      {isEn ? 'Re-accumulation Power:' : 'Geri Alınabilecek Lot Gücü:'}
                    </span>
                    <div className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                      ~{playbookData.buybackBlueprint.potentialRebuyShares} {isEn ? 'Shares with unlocked T1 cash' : 'Adet Hisse (Kâr Nakdi ile)'}
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      {isEn ? 'Zero external capital needed. Locked-in T1 proceeds fund the dip buy.' : 'Cebinizden ilave tek kuruş koymadan, Hedef 1\'de kilitlenen nakitle dipten geri alınır.'}
                    </p>
                  </div>
                </div>

                <p className="text-[11px] text-indigo-900/90 dark:text-indigo-200 font-medium leading-relaxed bg-white/60 dark:bg-gray-800/60 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/60">
                  {playbookData.buybackBlueprint.guideline}
                </p>
              </div>

              {/* AI Autonomous Synthesis */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-base">🤖</span>
                  <span className="font-black text-xs text-gray-900 dark:text-white">
                    {isEn ? 'Autonomous Copilot Execution Verdict:' : 'Yapay Zeka Karar ve Uygulama Özeti:'}
                  </span>
                </div>
                <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed font-medium">
                  {playbookData.aiSynthesis}
                </p>
              </div>

              {/* Recent Catalysts for Symbol */}
              {playbookData.recentCatalysts && playbookData.recentCatalysts.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">
                    {isEn ? 'Recent Company Catalysts (KAP & News):' : 'İlgili Şirket Katalizörleri & KAP Bildirimleri:'}
                  </span>
                  <div className="space-y-1.5">
                    {playbookData.recentCatalysts.map((cat: any, cIdx: number) => (
                      <div key={cIdx} className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200/80 dark:border-gray-750 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-gray-900 dark:text-white block truncate">
                            {cat.title}
                          </span>
                          <span className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">
                            {cat.ai_takeaway}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                          cat.ai_verdict === 'Bullish' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-800'
                        }`}>
                          {cat.ai_verdict}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-gray-500">
              {isEn ? 'Failed to formulate trade playbook. Please try again.' : 'İşlem planı oluşturulamadı. Lütfen tekrar deneyin.'}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-750 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
          <span className="text-[10px] text-gray-400">
            {isEn ? 'Deterministic execution framework powered by pgvector & ATR risk models.' : 'pgvector ve ATR risk modelleriyle desteklenen deterministik icra planı.'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-black bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            {isEn ? 'Close Playbook' : 'Planı Kapat'}
          </button>
        </div>
      </div>
    </div>
  );
}
