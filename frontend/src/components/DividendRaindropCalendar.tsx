'use client';

import React, { useState, useMemo } from 'react';
import { DividendAsset } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';
import { KNOWN_DIVIDEND_TRANCHES } from '../lib/dividendForecastMath';

export interface RaindropItem {
  id: string;
  symbol: string;
  name: string;
  currency: 'TRY' | 'USD';
  shares: number;
  dps: number;
  payoutAmount: number; // in native currency
  payoutAmountTRY: number;
  exDate?: string;
  paymentDate?: string;
  dayOfMonth?: number;
  frequency: string;
  dividendYield: number;
  yieldOnCost: number;
  paymentStatus: 'Estimated' | 'Confirmed' | 'Paid';
  isQuarterlyTranche?: boolean;
  trancheNumber?: number;
}

export interface MonthRaindropBucket {
  monthIndex: number; // 0..11
  monthNameTr: string;
  monthNameEn: string;
  shortNameTr: string;
  shortNameEn: string;
  totalPayoutTRY: number;
  totalPayoutDisplay: number;
  raindrops: RaindropItem[];
}

interface DividendRaindropCalendarProps {
  dividendAssets: DividendAsset[];
  usdTryRate: number;
  currencyMode: 'TRY' | 'USD';
  onSelectTicker?: (symbol: string) => void;
}

const MONTH_NAMES = [
  { tr: 'Ocak', en: 'January', shortTr: 'Oca', shortEn: 'Jan' },
  { tr: 'Şubat', en: 'February', shortTr: 'Şub', shortEn: 'Feb' },
  { tr: 'Mart', en: 'March', shortTr: 'Mar', shortEn: 'Mar' },
  { tr: 'Nisan', en: 'April', shortTr: 'Nis', shortEn: 'Apr' },
  { tr: 'Mayıs', en: 'May', shortTr: 'May', shortEn: 'May' },
  { tr: 'Haziran', en: 'June', shortTr: 'Haz', shortEn: 'Jun' },
  { tr: 'Temmuz', en: 'July', shortTr: 'Tem', shortEn: 'Jul' },
  { tr: 'Ağustos', en: 'August', shortTr: 'Ağu', shortEn: 'Aug' },
  { tr: 'Eylül', en: 'September', shortTr: 'Eyl', shortEn: 'Sep' },
  { tr: 'Ekim', en: 'October', shortTr: 'Eki', shortEn: 'Oct' },
  { tr: 'Kasım', en: 'November', shortTr: 'Kas', shortEn: 'Nov' },
  { tr: 'Aralık', en: 'December', shortTr: 'Ara', shortEn: 'Dec' },
];

function parseMonthFromAsset(asset: DividendAsset, dateBasis: 'payDate' | 'exDate' = 'payDate'): number {
  const targetDateStr = dateBasis === 'payDate' ? (asset.nextPaymentDate || asset.nextExDate) : (asset.nextExDate || asset.nextPaymentDate);
  
  if (targetDateStr) {
    const d = new Date(targetDateStr);
    if (!isNaN(d.getTime())) {
      return d.getMonth();
    }
  }

  // Fallback to payoutMonth text parsing
  const pm = (asset.payoutMonth || '').toLowerCase();
  if (pm.includes('jan') || pm.includes('oca')) return 0;
  if (pm.includes('feb') || pm.includes('şub')) return 1;
  if (pm.includes('mar')) return 2;
  if (pm.includes('apr') || pm.includes('nis')) return 3;
  if (pm.includes('may')) return 4;
  if (pm.includes('jun') || pm.includes('haz')) return 5;
  if (pm.includes('jul') || pm.includes('tem')) return 6;
  if (pm.includes('aug') || pm.includes('ağu')) return 7;
  if (pm.includes('sep') || pm.includes('eyl')) return 8;
  if (pm.includes('oct') || pm.includes('eki')) return 9;
  if (pm.includes('nov') || pm.includes('kas')) return 10;
  if (pm.includes('dec') || pm.includes('ara')) return 11;

  // Default BIST seasonal cluster: March / April
  return asset.currency === 'USD' ? 2 : 3;
}

export default function DividendRaindropCalendar({
  dividendAssets,
  usdTryRate,
  currencyMode,
  onSelectTicker,
}: DividendRaindropCalendarProps) {
  const { language } = useLanguage();
  const [dateBasis, setDateBasis] = useState<'payDate' | 'exDate'>('payDate');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const formatCurr = (val: number, curr?: string) => {
    const c = curr || currencyMode;
    const symbol = c === 'USD' ? '$' : '₺';
    return `${symbol}${val.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Build the 12 Monthly Raindrop Buckets
  const monthlyBuckets = useMemo<MonthRaindropBucket[]>(() => {
    const buckets: MonthRaindropBucket[] = MONTH_NAMES.map((m, idx) => ({
      monthIndex: idx,
      monthNameTr: m.tr,
      monthNameEn: m.en,
      shortNameTr: m.shortTr,
      shortNameEn: m.shortEn,
      totalPayoutTRY: 0,
      totalPayoutDisplay: 0,
      raindrops: [],
    }));

    for (const asset of dividendAssets) {
      if (asset.shares <= 0) continue;

      const baseMonth = parseMonthFromAsset(asset, dateBasis);
      const isUsd = asset.currency === 'USD';
      const annualAmount = asset.annualPayout || (asset.shares * asset.currentPrice * (asset.dividendYield / 100));

      const cleanSym = asset.symbol.replace('.IS', '').trim().toUpperCase();
      const customTranche = KNOWN_DIVIDEND_TRANCHES[cleanSym];

      if (customTranche) {
        // Multi-tranche exact seasonal distribution (e.g., BIMAS in Jun, Sep, Dec; TCELL in Jun, Dec)
        for (let t = 0; t < customTranche.months.length; t++) {
          const targetMonth = customTranche.months[t];
          const ratio = customTranche.ratios[t] || (1 / customTranche.months.length);
          const trancheAmount = annualAmount * ratio;
          const trancheTRY = isUsd ? trancheAmount * usdTryRate : trancheAmount;
          const dps = (asset.currentPrice * (asset.dividendYield / 100)) * ratio;
          const trancheLabel = customTranche.monthLabels[t];
          const trancheDate = customTranche.dates[t];

          let parsedDay = 18;
          if (trancheDate) {
            const d = new Date(trancheDate);
            if (!isNaN(d.getTime())) parsedDay = d.getDate();
          }

          buckets[targetMonth].raindrops.push({
            id: `${asset.symbol}-tranche-${t}`,
            symbol: asset.symbol,
            name: `${asset.name} (${trancheLabel})`,
            currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
            shares: asset.shares,
            dps: Number(dps.toFixed(3)),
            payoutAmount: trancheAmount,
            payoutAmountTRY: trancheTRY,
            exDate: trancheDate,
            paymentDate: trancheDate,
            dayOfMonth: parsedDay,
            frequency: asset.frequency,
            dividendYield: asset.dividendYield,
            yieldOnCost: asset.yieldOnCost,
            paymentStatus: asset.paymentStatus || 'Estimated',
            isQuarterlyTranche: true,
            trancheNumber: t + 1,
          });
          buckets[targetMonth].totalPayoutTRY += trancheTRY;
        }
      } else if (asset.frequency === 'Monthly') {
        // 12 monthly raindrops
        const perMonthAmount = annualAmount / 12;
        const perMonthTRY = isUsd ? perMonthAmount * usdTryRate : perMonthAmount;
        const dps = asset.estimatedNextDPS || (asset.currentPrice * (asset.dividendYield / 100) / 12);

        for (let m = 0; m < 12; m++) {
          buckets[m].raindrops.push({
            id: `${asset.symbol}-monthly-${m}`,
            symbol: asset.symbol,
            name: asset.name,
            currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
            shares: asset.shares,
            dps: Number(dps.toFixed(3)),
            payoutAmount: perMonthAmount,
            payoutAmountTRY: perMonthTRY,
            exDate: asset.nextExDate,
            paymentDate: asset.nextPaymentDate,
            dayOfMonth: 15,
            frequency: asset.frequency,
            dividendYield: asset.dividendYield,
            yieldOnCost: asset.yieldOnCost,
            paymentStatus: asset.paymentStatus || 'Estimated',
            isQuarterlyTranche: false,
          });
          buckets[m].totalPayoutTRY += perMonthTRY;
        }
      } else if (asset.frequency === 'Quarterly') {
        // 4 quarterly raindrops spaced every 3 months
        const perQuarterAmount = annualAmount / 4;
        const perQuarterTRY = isUsd ? perQuarterAmount * usdTryRate : perQuarterAmount;
        const dps = asset.estimatedNextDPS || (asset.currentPrice * (asset.dividendYield / 100) / 4);

        for (let q = 0; q < 4; q++) {
          const targetMonth = (baseMonth + q * 3) % 12;
          buckets[targetMonth].raindrops.push({
            id: `${asset.symbol}-q-${q}`,
            symbol: asset.symbol,
            name: asset.name,
            currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
            shares: asset.shares,
            dps: Number(dps.toFixed(3)),
            payoutAmount: perQuarterAmount,
            payoutAmountTRY: perQuarterTRY,
            exDate: asset.nextExDate,
            paymentDate: asset.nextPaymentDate,
            dayOfMonth: 20,
            frequency: asset.frequency,
            dividendYield: asset.dividendYield,
            yieldOnCost: asset.yieldOnCost,
            paymentStatus: asset.paymentStatus || 'Estimated',
            isQuarterlyTranche: true,
            trancheNumber: q + 1,
          });
          buckets[targetMonth].totalPayoutTRY += perQuarterTRY;
        }
      } else if (asset.frequency === 'Semi-Annual') {
        // 2 semi-annual raindrops spaced 6 months
        const perHalfAmount = annualAmount / 2;
        const perHalfTRY = isUsd ? perHalfAmount * usdTryRate : perHalfAmount;
        const dps = asset.estimatedNextDPS || (asset.currentPrice * (asset.dividendYield / 100) / 2);

        for (let h = 0; h < 2; h++) {
          const targetMonth = (baseMonth + h * 6) % 12;
          buckets[targetMonth].raindrops.push({
            id: `${asset.symbol}-semi-${h}`,
            symbol: asset.symbol,
            name: asset.name,
            currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
            shares: asset.shares,
            dps: Number(dps.toFixed(3)),
            payoutAmount: perHalfAmount,
            payoutAmountTRY: perHalfTRY,
            exDate: asset.nextExDate,
            paymentDate: asset.nextPaymentDate,
            dayOfMonth: 25,
            frequency: asset.frequency,
            dividendYield: asset.dividendYield,
            yieldOnCost: asset.yieldOnCost,
            paymentStatus: asset.paymentStatus || 'Estimated',
            isQuarterlyTranche: false,
          });
          buckets[targetMonth].totalPayoutTRY += perHalfTRY;
        }
      } else {
        // Annual single raindrop (typical BIST)
        const dps = asset.estimatedNextDPS || (asset.currentPrice * (asset.dividendYield / 100));
        const payout = asset.estimatedNextPayout || (asset.shares * dps);
        const payoutTRY = isUsd ? payout * usdTryRate : payout;

        let parsedDay = 28;
        if (asset.nextPaymentDate) {
          const d = new Date(asset.nextPaymentDate);
          if (!isNaN(d.getTime())) parsedDay = d.getDate();
        }

        buckets[baseMonth].raindrops.push({
          id: `${asset.symbol}-annual`,
          symbol: asset.symbol,
          name: asset.name,
          currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
          shares: asset.shares,
          dps: Number(dps.toFixed(3)),
          payoutAmount: payout,
          payoutAmountTRY: payoutTRY,
          exDate: asset.nextExDate,
          paymentDate: asset.nextPaymentDate,
          dayOfMonth: parsedDay,
          frequency: asset.frequency,
          dividendYield: asset.dividendYield,
          yieldOnCost: asset.yieldOnCost,
          paymentStatus: asset.paymentStatus || 'Estimated',
          isQuarterlyTranche: false,
        });
        buckets[baseMonth].totalPayoutTRY += payoutTRY;
      }
    }

    // Sort raindrops inside each month by dayOfMonth and calculate display amounts
    for (const b of buckets) {
      b.raindrops.sort((a, b) => (a.dayOfMonth || 15) - (b.dayOfMonth || 15));
      b.totalPayoutDisplay = currencyMode === 'USD' ? b.totalPayoutTRY / usdTryRate : b.totalPayoutTRY;
    }

    return buckets;
  }, [dividendAssets, usdTryRate, currencyMode, dateBasis]);

  // Aggregate Intelligence Statistics
  const totalAnnualRainTRY = useMemo(() => {
    return monthlyBuckets.reduce((sum, b) => sum + b.totalPayoutTRY, 0);
  }, [monthlyBuckets]);

  const totalAnnualRainDisplay = currencyMode === 'USD' ? totalAnnualRainTRY / usdTryRate : totalAnnualRainTRY;
  const activeMonthsCount = monthlyBuckets.filter(b => b.raindrops.length > 0).length;

  const peakMonth = useMemo(() => {
    let best = monthlyBuckets[0];
    for (const b of monthlyBuckets) {
      if (b.totalPayoutTRY > best.totalPayoutTRY) {
        best = b;
      }
    }
    return best;
  }, [monthlyBuckets]);

  const maxMonthTRY = peakMonth?.totalPayoutTRY || 1;

  // Next upcoming raindrop calculation
  const nextRaindrop = useMemo(() => {
    const allDrops: Array<RaindropItem & { dateSort: number; monthName: string }> = [];
    for (const b of monthlyBuckets) {
      for (const d of b.raindrops) {
        const rawDate = d.paymentDate || d.exDate || `2027-${String(b.monthIndex + 1).padStart(2, '0')}-${String(d.dayOfMonth || 15).padStart(2, '0')}`;
        const timestamp = new Date(rawDate).getTime();
        allDrops.push({
          ...d,
          dateSort: isNaN(timestamp) ? 9999999999999 : timestamp,
          monthName: language === 'tr' ? b.monthNameTr : b.monthNameEn,
        });
      }
    }
    allDrops.sort((a, b) => a.dateSort - b.dateSort);
    return allDrops.length > 0 ? allDrops[0] : null;
  }, [monthlyBuckets, language]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Raindrop Executive Intelligence Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Annual Total Rain Inflow */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-600/10 via-cyan-500/5 to-emerald-500/10 dark:from-blue-950/40 dark:via-cyan-950/20 dark:to-emerald-950/30 border border-blue-200/80 dark:border-blue-800/80 backdrop-blur-md shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {language === 'tr' ? '💧 Toplam Temettü Yağmuru' : '💧 Annual Dividend Rain'}
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
              {formatCurr(totalAnnualRainDisplay)}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === 'tr' ? '12 aylık toplam pasif nakit girişi' : '12-month projected passive cashflow'}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl shrink-0">
            🌧️
          </div>
        </div>

        {/* Metric 2: Peak Rain Month */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-600/10 via-teal-500/5 to-blue-500/10 dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-blue-950/30 border border-emerald-200/80 dark:border-emerald-800/80 backdrop-blur-md shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {language === 'tr' ? '⚡ En Yağmurlu Ay (Zirve)' : '⚡ Peak Dividend Month'}
            </span>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
              {peakMonth.totalPayoutTRY > 0
                ? `${language === 'tr' ? peakMonth.monthNameTr : peakMonth.monthNameEn} · ${formatCurr(peakMonth.totalPayoutDisplay)}`
                : '—'}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {peakMonth.raindrops.length > 0
                ? `${peakMonth.raindrops.map(r => r.symbol).join(', ')}`
                : (language === 'tr' ? 'Henüz temettü dağıtımı yok' : 'No payouts')}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl shrink-0">
            🌊
          </div>
        </div>

        {/* Metric 3: Rain Coverage Across Year */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-600/10 via-indigo-500/5 to-blue-500/10 dark:from-purple-950/40 dark:via-indigo-950/20 dark:to-blue-950/30 border border-purple-200/80 dark:border-purple-800/80 backdrop-blur-md shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
              {language === 'tr' ? '☔ Yağmurlu Ay Kapsamı' : '☔ Cashflow Regularity'}
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
                {activeMonthsCount} / 12
              </span>
              <span className="text-xs font-bold text-slate-500">
                (%{((activeMonthsCount / 12) * 100).toFixed(0)})
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {activeMonthsCount >= 10
                ? (language === 'tr' ? 'Mükemmel 12-ay kesintisiz gelir' : 'All-weather monthly income')
                : (language === 'tr' ? `${12 - activeMonthsCount} ayda nakit girişi boşluğu var` : `${12 - activeMonthsCount} dry months without payout`)}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl shrink-0">
            ☂️
          </div>
        </div>

        {/* Metric 4: Next Incoming Raindrop */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-600/10 via-orange-500/5 to-rose-500/10 dark:from-amber-950/40 dark:via-orange-950/20 dark:to-rose-950/30 border border-amber-200/80 dark:border-amber-800/80 backdrop-blur-md shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {language === 'tr' ? '⏳ İlk Beklenen Damla' : '⏳ Next Incoming Raindrop'}
            </span>
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5 flex items-center gap-1.5">
              <span>{nextRaindrop ? nextRaindrop.symbol : '—'}</span>
              {nextRaindrop && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  +{formatCurr(currencyMode === 'USD' ? nextRaindrop.payoutAmountTRY / usdTryRate : nextRaindrop.payoutAmountTRY)}
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {nextRaindrop
                ? `${nextRaindrop.paymentDate || nextRaindrop.exDate || nextRaindrop.monthName} (${nextRaindrop.shares} lot)`
                : (language === 'tr' ? 'Bekleyen ödeme yok' : 'No pending payout')}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl shrink-0">
            💧
          </div>
        </div>
      </div>

      {/* Control Strip: Basis Selection & Quick Insight */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white/80 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-base">💧</span>
          <div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">
              {language === 'tr' ? '12 Aylık Temettü Yağmuru Takvimi' : '12-Month Dividend Raindrop Matrix'}
            </h4>
            <p className="text-[11px] text-slate-500">
              {language === 'tr'
                ? 'Hangi ayda hangi hisseden ne kadar net nakit temettü yağacağını anlık izleyin.'
                : 'Visualize exactly which stock pays how much dividend rain across every month of the year.'}
            </p>
          </div>
        </div>

        {/* Date Basis Toggle: Ödeme Tarihi vs Hak Kullanım (Ex-Date) */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <span className="text-[11px] font-bold text-slate-500">
            {language === 'tr' ? 'Tarih Bazı:' : 'Basis:'}
          </span>
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 text-xs">
            <button
              type="button"
              onClick={() => setDateBasis('payDate')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                dateBasis === 'payDate'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {language === 'tr' ? 'Ödeme Tarihi' : 'Pay Date'}
            </button>
            <button
              type="button"
              onClick={() => setDateBasis('exDate')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                dateBasis === 'exDate'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {language === 'tr' ? 'Hak Kullanımı (Ex)' : 'Ex-Dividend Date'}
            </button>
          </div>
        </div>
      </div>

      {/* 12-MONTH HORIZONTAL RAINDROP WATERFALL MATRIX */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-12 gap-3">
        {monthlyBuckets.map((bucket) => {
          const hasRain = bucket.raindrops.length > 0;
          const fillRatio = maxMonthTRY > 0 ? bucket.totalPayoutTRY / maxMonthTRY : 0;
          const isSelected = selectedMonth === bucket.monthIndex;

          return (
            <div
              key={bucket.monthIndex}
              onClick={() => setSelectedMonth(isSelected ? null : bucket.monthIndex)}
              className={`rounded-2xl border transition-all flex flex-col justify-between overflow-hidden cursor-pointer ${
                hasRain
                  ? isSelected
                    ? 'bg-blue-50/90 dark:bg-blue-950/80 border-blue-500 ring-2 ring-blue-400 shadow-md scale-[1.02]'
                    : 'bg-white/90 dark:bg-slate-900/80 hover:bg-blue-50/40 dark:hover:bg-slate-850/80 border-blue-200/60 dark:border-blue-900/50 shadow-xs'
                  : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-200/50 dark:border-slate-800/50 opacity-70 hover:opacity-100'
              }`}
            >
              {/* Raindrop Density Gauge Bar at top of month card */}
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    hasRain
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-xs'
                      : 'bg-transparent'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, fillRatio * 100))}%` }}
                />
              </div>

              {/* Month Header */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    {language === 'tr' ? bucket.monthNameTr : bucket.monthNameEn}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    hasRain
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                  }`}>
                    {hasRain ? `💧 ${bucket.raindrops.length}` : '☁️ 0'}
                  </span>
                </div>

                {/* Month Cumulative Inflow */}
                <div className="mt-1">
                  <div className={`text-sm font-black font-mono ${
                    hasRain ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-600'
                  }`}>
                    {hasRain ? `+${formatCurr(bucket.totalPayoutDisplay)}` : '₺0.00'}
                  </div>
                </div>
              </div>

              {/* Raindrop Droplets Container */}
              <div className="p-2.5 flex-1 space-y-2 min-h-[140px] flex flex-col justify-start">
                {hasRain ? (
                  bucket.raindrops.map((drop) => {
                    const dropDisplay = currencyMode === 'USD' ? drop.payoutAmountTRY / usdTryRate : drop.payoutAmountTRY;

                    return (
                      <div
                        key={drop.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTicker?.(drop.symbol);
                        }}
                        className="group relative p-2 rounded-xl bg-gradient-to-br from-blue-50/80 to-cyan-50/50 dark:from-slate-800/90 dark:to-blue-950/40 border border-blue-200/70 dark:border-blue-800/60 hover:border-blue-400 dark:hover:border-blue-600 shadow-2xs transition-all hover:scale-[1.02] cursor-pointer"
                        title={`${drop.symbol} · ${drop.shares} lot · ${formatCurr(dropDisplay)} · Grafiği açmak için tıklayın`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-xs text-blue-500 animate-bounce duration-1000">💧</span>
                            <span className="font-black text-xs text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                              {drop.symbol}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {drop.dayOfMonth ? `${drop.dayOfMonth}` : ''}
                          </span>
                        </div>

                        {/* Amount */}
                        <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                          +{formatCurr(dropDisplay)}
                        </div>

                        {/* Micro Info */}
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center justify-between mt-1 pt-1 border-t border-blue-100/60 dark:border-slate-750">
                          <span>{drop.shares.toLocaleString()} lot</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">%{drop.dividendYield.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-4 text-slate-300 dark:text-slate-700">
                    <span className="text-xl opacity-60">☁️</span>
                    <span className="text-[10px] font-bold mt-1">
                      {language === 'tr' ? 'Temettüsüz Ay' : 'Dry Month'}
                    </span>
                  </div>
                )}
              </div>

              {/* Month Footer */}
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-850/60 border-t border-slate-100 dark:border-slate-800 text-[10px] font-mono text-center text-slate-400">
                {hasRain ? `%${((bucket.totalPayoutTRY / totalAnnualRainTRY) * 100).toFixed(1)} ${language === 'tr' ? 'pay' : 'share'}` : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Month Detail Modal / Drawer Strip */}
      {selectedMonth !== null && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 shadow-lg space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xl">💧</span>
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {language === 'tr'
                    ? `${monthlyBuckets[selectedMonth].monthNameTr} Ayı Temettü Yağmuru Detayı`
                    : `${monthlyBuckets[selectedMonth].monthNameEn} Dividend Raindrop Breakdown`}
                </h4>
                <p className="text-xs text-slate-500">
                  {monthlyBuckets[selectedMonth].raindrops.length > 0
                    ? `${monthlyBuckets[selectedMonth].raindrops.length} ${language === 'tr' ? 'farklı hisseden net nakit temettü girişi' : 'distinct dividend payouts scheduled'}`
                    : (language === 'tr' ? 'Bu ay için planlanmış temettü ödemesi bulunmuyor.' : 'No dividend payouts scheduled in this month.')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                {formatCurr(monthlyBuckets[selectedMonth].totalPayoutDisplay)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {monthlyBuckets[selectedMonth].raindrops.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {monthlyBuckets[selectedMonth].raindrops.map((drop) => {
                const dropDisplay = currencyMode === 'USD' ? drop.payoutAmountTRY / usdTryRate : drop.payoutAmountTRY;

                return (
                  <div
                    key={drop.id}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-base text-slate-900 dark:text-white">{drop.symbol}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {drop.frequency}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{drop.name}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          +{formatCurr(dropDisplay)}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ₺{drop.dps.toFixed(3)} / lot
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">{language === 'tr' ? 'Lot Adedi' : 'Shares'}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{drop.shares.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{language === 'tr' ? 'Temettü Verimi' : 'Yield'}</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">%{drop.dividendYield.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{language === 'tr' ? 'Tahmini Tarih' : 'Est. Date'}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{drop.paymentDate || drop.exDate || '2027'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60">
              💡 {language === 'tr'
                ? 'Bu ayda temettü akışı sağlamak için portföye her çeyrek temettü dağıtan global hisseler (KO, SCHD) veya her ay ödeyen (O) ekleyebilirsiniz.'
                : 'To fill this income gap, consider adding quarterly dividend leaders (KO, SCHD) or monthly payers (O).'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
