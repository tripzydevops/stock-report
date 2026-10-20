'use client';

import React, { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { MASTER_GROWTH_PROFILES } from '../lib/dividendForecastMath';

export interface BuyLotItem {
  id: string;
  ref: string;
  lotNumber: number;
  isInitial: boolean;
  isLatest: boolean;
  date: string;
  shares: number;
  price: number;
  totalCost: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  note?: string;
  timestamp?: number;
}

interface DcaOffsetEngineProps {
  symbol: string;
  name: string;
  currency?: string;
  totalShares: number;
  avgEntryPrice: number;
  currentPrice: number;
  totalCost: number;
  currentValue: number;
  isDividend?: boolean;
  lots: BuyLotItem[];
  formatCurr: (val: number, curr?: string) => string;
  onTradeHolding?: () => void;
}

export default function DcaOffsetEngine({
  symbol,
  currency = 'TRY',
  totalShares,
  avgEntryPrice,
  currentPrice,
  totalCost,
  currentValue,
  isDividend = false,
  lots,
  formatCurr,
  onTradeHolding,
}: DcaOffsetEngineProps) {
  const { language } = useLanguage();
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  // Clean symbol for lookup (e.g. TURSG.IS -> TURSG)
  const cleanSym = symbol.replace('.IS', '').trim().toUpperCase();
  const growthProfile = MASTER_GROWTH_PROFILES[cleanSym];

  // 1. Identify Key Lots chronologically
  const sortedLots = useMemo(() => {
    return [...lots].sort((a, b) => a.lotNumber - b.lotNumber);
  }, [lots]);

  const initialLot = sortedLots[0] || null;
  const latestLot = sortedLots[sortedLots.length - 1] || null;

  // Lowest purchase price lot (usually the best DCA dip)
  const lowestLot = useMemo(() => {
    if (!sortedLots.length) return null;
    return sortedLots.reduce((min, l) => (l.price < min.price ? l : min), sortedLots[0]);
  }, [sortedLots]);

  // Highest purchase price lot (the biggest drag)
  const highestLot = useMemo(() => {
    if (!sortedLots.length) return null;
    return sortedLots.reduce((max, l) => (l.price > max.price ? l : max), sortedLots[0]);
  }, [sortedLots]);

  // Red and green lots
  const redLots = sortedLots.filter(l => l.pnl < 0);
  const greenLots = sortedLots.filter(l => l.pnl >= 0);

  // 2. Specific Pair Offsetting Mathematics: Lowest Lot (e.g. Lot #7) vs Highest Lot (e.g. Lot #1)
  const pairMetrics = useMemo(() => {
    if (!lowestLot || !highestLot || lowestLot.id === highestLot.id) {
      return null;
    }

    const pairTotalCost = lowestLot.totalCost + highestLot.totalCost;
    const pairTotalShares = lowestLot.shares + highestLot.shares;
    const pairBreakevenPrice = pairTotalShares > 0 ? pairTotalCost / pairTotalShares : 0;

    const lowestProfit = Math.max(0, lowestLot.currentValue - lowestLot.totalCost);
    const highestDeficit = Math.max(0, highestLot.totalCost - highestLot.currentValue);

    const currentOffsetRatioPct = highestDeficit > 0 ? Math.min(100, (lowestProfit / highestDeficit) * 100) : 100;
    const distToPairBreakevenPct = currentPrice > 0 ? ((pairBreakevenPrice - currentPrice) / currentPrice) * 100 : 0;

    return {
      lowestLot,
      highestLot,
      pairTotalShares,
      pairBreakevenPrice,
      lowestProfit,
      highestDeficit,
      currentOffsetRatioPct,
      distToPairBreakevenPct,
    };
  }, [lowestLot, highestLot, currentPrice]);

  // 3. Position-wide Cost Basis Compression
  const compressionMetrics = useMemo(() => {
    if (!initialLot) return null;

    const initialPrice = initialLot.price;
    const savingsPerShare = initialPrice - avgEntryPrice;
    const savingsPct = initialPrice > 0 ? (savingsPerShare / initialPrice) * 100 : 0;

    const rallyNeededWithoutDca = currentPrice > 0 ? ((initialPrice - currentPrice) / currentPrice) * 100 : 0;
    const rallyNeededWithDca = currentPrice > 0 ? ((avgEntryPrice - currentPrice) / currentPrice) * 100 : 0;
    const rallyAdvantagePct = Math.max(0, rallyNeededWithoutDca - rallyNeededWithDca);

    return {
      initialPrice,
      avgEntryPrice,
      savingsPerShare,
      savingsPct,
      rallyNeededWithoutDca,
      rallyNeededWithDca,
      rallyAdvantagePct,
    };
  }, [initialLot, avgEntryPrice, currentPrice]);

  // 4. Dividend Shield Metrics
  const dividendMetrics = useMemo(() => {
    const yieldPct = growthProfile?.currentYield || (isDividend ? 7.09 : 0);
    const annualDivEstimated = totalShares * (currentPrice * (yieldPct / 100));
    const totalDeficit = Math.max(0, totalCost - currentValue);
    const dividendAbsorptionPct = totalDeficit > 0 ? Math.min(100, (annualDivEstimated / totalDeficit) * 100) : 100;
    const divAdjustedBreakeven = totalShares > 0 ? Math.max(0, (totalCost - annualDivEstimated) / totalShares) : avgEntryPrice;

    return {
      yieldPct,
      annualDivEstimated,
      totalDeficit,
      dividendAbsorptionPct,
      divAdjustedBreakeven,
    };
  }, [growthProfile, isDividend, totalShares, currentPrice, totalCost, currentValue, avgEntryPrice]);

  // 5. Interactive Simulation State
  const defaultSimPrice = pairMetrics ? pairMetrics.pairBreakevenPrice : avgEntryPrice;
  const [simPrice, setSimPrice] = useState<number>(Number(defaultSimPrice.toFixed(2)));

  const minSim = Math.min(currentPrice * 0.9, lowestLot ? lowestLot.price * 0.95 : currentPrice * 0.9);
  const maxSim = Math.max(avgEntryPrice * 1.25, highestLot ? highestLot.price * 1.15 : avgEntryPrice * 1.25);

  const simResult = useMemo(() => {
    const simVal = totalShares * simPrice;
    const simPnl = simVal - totalCost;
    const simPnlPct = totalCost > 0 ? (simPnl / totalCost) * 100 : 0;

    const greenCount = sortedLots.filter(l => simPrice >= l.price).length;
    const isPairCovered = pairMetrics ? simPrice >= pairMetrics.pairBreakevenPrice : false;
    const isTotalBreakeven = simPrice >= avgEntryPrice;

    return {
      simVal,
      simPnl,
      simPnlPct,
      greenCount,
      isPairCovered,
      isTotalBreakeven,
    };
  }, [totalShares, simPrice, totalCost, sortedLots, pairMetrics, avgEntryPrice]);

  if (sortedLots.length < 2) {
    return null; // Only meaningful when multiple DCA tranches exist
  }

  return (
    <div className="bg-gradient-to-br from-slate-900/95 via-[#0c1427]/95 to-slate-900/95 text-slate-100 rounded-2xl border border-blue-500/30 p-3.5 sm:p-4 shadow-lg space-y-3.5 animate-in fade-in duration-200">
      {/* Top Banner: Engine Title & Core Ratio */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 text-sm shadow-xs shrink-0">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-tight text-white uppercase">
                {language === 'tr' ? 'DCA Kademeli Mahsuplaşma & Başa Baş Motoru' : 'DCA Tranche Netting & Breakeven Engine'}
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                {sortedLots.length} {language === 'tr' ? 'Kademe' : 'Lots'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {language === 'tr' 
                ? 'Dipten alınan ucuz lotlar, eski pahalı lotların zararını çok daha erken fiyatta nötrler.' 
                : 'Discounted lots offset early high-cost lots at a significantly lower recovery price.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsSimulatorOpen(prev => !prev)}
          className="text-xs font-bold text-blue-400 hover:text-blue-300 bg-blue-950/60 hover:bg-blue-900/60 border border-blue-700/50 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
        >
          <span>{isSimulatorOpen ? '🔼' : '🎮'}</span>
          <span>
            {isSimulatorOpen
              ? (language === 'tr' ? 'Simülatörü Gizle' : 'Hide Simulator')
              : (language === 'tr' ? 'Fiyat Simülatörü' : 'Interactive Simulator')}
          </span>
        </button>
      </div>

      {/* 3 Pillar Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* Card 1: Lot Netting Pair (Lot #7 vs Lot #1) */}
        {pairMetrics && (
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <span>⚡</span>
                <span>{language === 'tr' ? 'Lot Mahsuplaşması' : 'Lot Netting Pair'}</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Lot #{pairMetrics.lowestLot.lotNumber} ➔ Lot #{pairMetrics.highestLot.lotNumber}
              </span>
            </div>

            <div>
              <div className="text-sm font-black font-mono text-white flex items-baseline gap-1.5">
                <span>{formatCurr(pairMetrics.pairBreakevenPrice, currency)}</span>
                <span className="text-[10px] font-bold text-emerald-400">
                  ({pairMetrics.distToPairBreakevenPct >= 0 ? '+' : ''}{pairMetrics.distToPairBreakevenPct.toFixed(1)}%)
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-tight mt-0.5">
                {language === 'tr' ? (
                  <>
                    En ucuz kademeniz (<strong>Lot #{pairMetrics.lowestLot.lotNumber}</strong>, {pairMetrics.lowestLot.shares} lot @ {formatCurr(pairMetrics.lowestLot.price, currency)}), en pahalı alımınızın (<strong>Lot #{pairMetrics.highestLot.lotNumber}</strong> @ {formatCurr(pairMetrics.highestLot.price, currency)}) zararını <strong>{formatCurr(pairMetrics.pairBreakevenPrice, currency)}</strong> seviyesinde tamamen sıfırlar!
                  </>
                ) : (
                  <>
                    Your cheapest tranche (<strong>Lot #{pairMetrics.lowestLot.lotNumber}</strong> @ {formatCurr(pairMetrics.lowestLot.price, currency)}) completely neutralizes your highest tranche (<strong>Lot #{pairMetrics.highestLot.lotNumber}</strong> @ {formatCurr(pairMetrics.highestLot.price, currency)}) at just <strong>{formatCurr(pairMetrics.pairBreakevenPrice, currency)}</strong>!
                  </>
                )}
              </p>
            </div>

            {/* Current Offset Absorption Bar */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>{language === 'tr' ? 'Mevcut Absorbe Oranı' : 'Current Offset Absorbed'}:</span>
                <span className="font-bold text-emerald-400">{pairMetrics.currentOffsetRatioPct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  style={{ width: `${Math.max(4, pairMetrics.currentOffsetRatioPct)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Card 2: Cost Basis Compression */}
        {compressionMetrics && (
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1">
                <span>📉</span>
                <span>{language === 'tr' ? 'Maliyet Sıkıştırması' : 'Basis Compression'}</span>
              </span>
              <span className="text-[10px] font-bold text-emerald-400 font-mono">
                -{compressionMetrics.savingsPct.toFixed(1)}% {language === 'tr' ? 'İndirim' : 'Discount'}
              </span>
            </div>

            <div>
              <div className="text-sm font-black font-mono text-white flex items-baseline gap-1.5">
                <span className="line-through text-slate-400 text-xs">{formatCurr(compressionMetrics.initialPrice, currency)}</span>
                <span>➔</span>
                <span className="text-emerald-400">{formatCurr(compressionMetrics.avgEntryPrice, currency)}</span>
              </div>
              <p className="text-[10px] text-slate-300 leading-tight mt-0.5">
                {language === 'tr' ? (
                  <>
                    İlk alıma göre hisse başı <strong>{formatCurr(compressionMetrics.savingsPerShare, currency)}</strong> maliyet avantajı sağlandı. Başa başa ulaşmak için gereken ralli: <strong>+{compressionMetrics.rallyNeededWithoutDca.toFixed(1)}% yerine sadece +{compressionMetrics.rallyNeededWithDca.toFixed(1)}%</strong>.
                  </>
                ) : (
                  <>
                    Lowered avg cost by <strong>{formatCurr(compressionMetrics.savingsPerShare, currency)}/share</strong>. Rally needed to break even dropped from <strong>+{compressionMetrics.rallyNeededWithoutDca.toFixed(1)}% down to just +{compressionMetrics.rallyNeededWithDca.toFixed(1)}%</strong>.
                  </>
                )}
              </p>
            </div>

            <div className="pt-1 flex items-center gap-1.5 text-[10px] font-semibold text-blue-300">
              <span>🚀</span>
              <span>
                {language === 'tr'
                  ? `%${compressionMetrics.rallyAdvantagePct.toFixed(1)} daha az ralliyle kâra geçiş avantajı`
                  : `Breaks even ${compressionMetrics.rallyAdvantagePct.toFixed(1)}% earlier than initial buy`}
              </span>
            </div>
          </div>
        )}

        {/* Card 3: Dividend Shield */}
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/70 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <span>💰</span>
              <span>{language === 'tr' ? 'Temettü Kalkanı' : 'Dividend Shield'}</span>
            </span>
            <span className="text-[10px] font-bold text-amber-300 font-mono">
              %{dividendMetrics.yieldPct.toFixed(1)} {language === 'tr' ? 'Verim' : 'Yield'}
            </span>
          </div>

          <div>
            <div className="text-sm font-black font-mono text-amber-300 flex items-baseline gap-1.5">
              <span>+{formatCurr(dividendMetrics.annualDivEstimated, currency)}</span>
              <span className="text-[10px] font-bold text-slate-400 font-sans">
                {language === 'tr' ? '/ yıl nakit' : '/ yr cash'}
              </span>
            </div>
            <p className="text-[10px] text-slate-300 leading-tight mt-0.5">
              {language === 'tr' ? (
                <>
                  Toplam <strong>{totalShares.toLocaleString()} lotunuz</strong> sayesinde yıllık gelecek temettü, tüm portföy zararının <strong>%{dividendMetrics.dividendAbsorptionPct.toFixed(1)}'sini</strong> tek başına nakit olarak telafi eder.
                </>
              ) : (
                <>
                  Your <strong>{totalShares.toLocaleString()} accumulated shares</strong> will harvest annual dividend cash that absorbs <strong>{dividendMetrics.dividendAbsorptionPct.toFixed(1)}%</strong> of your total paper drawdown.
                </>
              )}
            </p>
          </div>

          <div className="pt-1 flex items-center justify-between text-[10px] text-slate-300 font-mono border-t border-slate-700/60 pt-1.5">
            <span>{language === 'tr' ? 'Temettü Düzeltilmiş Başa Baş:' : 'Div-Adjusted Breakeven:'}</span>
            <span className="font-bold text-emerald-400">{formatCurr(dividendMetrics.divAdjustedBreakeven, currency)}</span>
          </div>
        </div>
      </div>

      {/* Interactive Recovery Simulator (Collapsible) */}
      {isSimulatorOpen && (
        <div className="bg-slate-950/70 rounded-xl p-3 sm:p-4 border border-blue-500/40 space-y-3 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🎮</span>
              <span className="text-xs font-bold text-white">
                {language === 'tr' ? 'Dinamik Fiyat & Kademeli Mahsuplaşma Simülatörü' : 'Interactive Price & Tranche Netting Simulator'}
              </span>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/50">
              {language === 'tr' ? 'Simüle Fiyat' : 'Simulated Price'}: {formatCurr(simPrice, currency)}
            </span>
          </div>

          {/* Quick Scenario Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">
              {language === 'tr' ? 'Senaryolar:' : 'Scenarios:'}
            </span>
            <button
              type="button"
              onClick={() => setSimPrice(Number(currentPrice.toFixed(2)))}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                Math.abs(simPrice - currentPrice) < 0.02
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              {language === 'tr' ? 'Mevcut' : 'Current'} ({formatCurr(currentPrice, currency)})
            </button>

            {dividendMetrics.divAdjustedBreakeven > 0 && (
              <button
                type="button"
                onClick={() => setSimPrice(Number(dividendMetrics.divAdjustedBreakeven.toFixed(2)))}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                  Math.abs(simPrice - dividendMetrics.divAdjustedBreakeven) < 0.02
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                }`}
              >
                {language === 'tr' ? 'Temettü Başa Baş' : 'Div Breakeven'} ({formatCurr(dividendMetrics.divAdjustedBreakeven, currency)})
              </button>
            )}

            {pairMetrics && (
              <button
                type="button"
                onClick={() => setSimPrice(Number(pairMetrics.pairBreakevenPrice.toFixed(2)))}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                  Math.abs(simPrice - pairMetrics.pairBreakevenPrice) < 0.02
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700'
                }`}
              >
                Lot #{pairMetrics.lowestLot.lotNumber} ➔ #{pairMetrics.highestLot.lotNumber} ({formatCurr(pairMetrics.pairBreakevenPrice, currency)})
              </button>
            )}

            <button
              type="button"
              onClick={() => setSimPrice(Number(avgEntryPrice.toFixed(2)))}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                Math.abs(simPrice - avgEntryPrice) < 0.02
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700'
              }`}
            >
              {language === 'tr' ? 'Tam Başa Baş' : 'Total Breakeven'} ({formatCurr(avgEntryPrice, currency)})
            </button>

            {compressionMetrics && (
              <button
                type="button"
                onClick={() => setSimPrice(Number(compressionMetrics.initialPrice.toFixed(2)))}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition-all cursor-pointer ${
                  Math.abs(simPrice - compressionMetrics.initialPrice) < 0.02
                    ? 'bg-slate-600 text-white shadow-xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                {language === 'tr' ? 'İlk Alış Fiyatı' : 'Initial Price'} ({formatCurr(compressionMetrics.initialPrice, currency)})
              </button>
            )}
          </div>

          {/* Range Slider */}
          <div className="space-y-1 pt-1">
            <input
              type="range"
              min={Number(minSim.toFixed(2))}
              max={Number(maxSim.toFixed(2))}
              step={0.01}
              value={simPrice}
              onChange={(e) => setSimPrice(parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>{formatCurr(minSim, currency)}</span>
              <span>{formatCurr(avgEntryPrice, currency)} (Ort.)</span>
              <span>{formatCurr(maxSim, currency)}</span>
            </div>
          </div>

          {/* Live Outcome Box */}
          <div className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-400">
                {language === 'tr' ? 'Simüle Edilen Toplam Portföy K/Z' : 'Simulated Position P&L'}
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className={`text-lg font-black font-mono ${simResult.simPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {simResult.simPnl >= 0 ? '+' : ''}{formatCurr(simResult.simPnl, currency)}
                </span>
                <span className={`text-xs font-bold font-mono ${simResult.simPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({simResult.simPnl >= 0 ? '+' : ''}{simResult.simPnlPct.toFixed(2)}%)
                </span>
              </div>
              <div className="text-[11px] text-slate-300 mt-1">
                {simResult.isTotalBreakeven ? (
                  <span className="text-emerald-300 font-semibold flex items-center gap-1">
                    <span>🎉</span>
                    <span>
                      {language === 'tr'
                        ? 'Tüm 7 kademeniz kâra geçti! İlk alım fiyatınızın (₺5.99) altında olsanız dahi portföyünüz pozitifte.'
                        : 'Entire position is in net profit, even though price is still below your initial buy!'}
                    </span>
                  </span>
                ) : simResult.isPairCovered ? (
                  <span className="text-blue-300 font-semibold flex items-center gap-1">
                    <span>✅</span>
                    <span>
                      {language === 'tr'
                        ? `Lot #${pairMetrics?.lowestLot.lotNumber} kârı, Lot #${pairMetrics?.highestLot.lotNumber} zararını tamamen sildi!`
                        : `Lot #${pairMetrics?.lowestLot.lotNumber} profit completely wiped out Lot #${pairMetrics?.highestLot.lotNumber} loss!`}
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-400">
                    {language === 'tr'
                      ? `${simResult.greenCount} / ${sortedLots.length} kademe kârda.`
                      : `${simResult.greenCount} of ${sortedLots.length} tranches are currently in profit.`}
                  </span>
                )}
              </div>
            </div>

            {onTradeHolding && (
              <button
                type="button"
                onClick={onTradeHolding}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-sm shadow-blue-500/30 transition-all cursor-pointer whitespace-nowrap self-start sm:self-center"
              >
                + {language === 'tr' ? 'Yeni Kademe Ekle (DCA)' : 'Add New Tranche (DCA)'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
