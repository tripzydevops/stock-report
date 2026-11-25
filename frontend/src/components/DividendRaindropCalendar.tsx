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
  grossDps?: number;
  payoutAmount: number; // in native currency
  payoutAmountTRY: number;
  exDate?: string;
  paymentDate?: string;
  settlementDate?: string;
  dayOfMonth?: number;
  frequency: string;
  dividendYield: number | null;
  yieldOnCost: number | null;
  paymentStatus: 'Estimated' | 'Confirmed' | 'Paid';
  isQuarterlyTranche?: boolean;
  trancheNumber?: number;
  totalTranches?: number;
  trancheLabel?: string;
  source?: string;
}

export interface MonthRaindropBucket {
  monthIndex: number; // 0..11
  monthNameTr: string;
  monthNameEn: string;
  shortNameTr: string;
  shortNameEn: string;
  totalPayoutTRY: number;
  totalPayoutDisplay: number;
  confirmedPayoutTRY: number;
  confirmedPayoutDisplay: number;
  estimatedPayoutTRY: number;
  estimatedPayoutDisplay: number;
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CONFIRMED' | 'ESTIMATED'>('ALL');
  const [showMethodologyInfo, setShowMethodologyInfo] = useState<boolean>(false);

  const formatCurr = (val: number, curr?: string) => {
    const c = curr || currencyMode;
    const symbol = c === 'USD' ? '$' : '₺';
    return `${symbol}${val.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Build the 12 Monthly Raindrop Buckets with Verified vs Estimated Granularity
  const monthlyBuckets = useMemo<MonthRaindropBucket[]>(() => {
    const buckets: MonthRaindropBucket[] = MONTH_NAMES.map((m, idx) => ({
      monthIndex: idx,
      monthNameTr: m.tr,
      monthNameEn: m.en,
      shortNameTr: m.shortTr,
      shortNameEn: m.shortEn,
      totalPayoutTRY: 0,
      totalPayoutDisplay: 0,
      confirmedPayoutTRY: 0,
      confirmedPayoutDisplay: 0,
      estimatedPayoutTRY: 0,
      estimatedPayoutDisplay: 0,
      raindrops: [],
    }));

    for (const asset of dividendAssets) {
      if (asset.shares <= 0) continue;

      const baseMonth = parseMonthFromAsset(asset, dateBasis);
      const isUsd = asset.currency === 'USD';
      const yieldPct = asset.dividendYield || 0;
      const annualAmount = asset.annualPayout || (asset.shares * (asset.currentPrice || 0) * (yieldPct / 100));
      if (!annualAmount || annualAmount <= 0) continue;

      const cleanSym = asset.symbol.replace('.IS', '').trim().toUpperCase();
      const customTranche = KNOWN_DIVIDEND_TRANCHES[cleanSym];
      const isAssetConfirmed = asset.paymentStatus === 'Confirmed';

      if (customTranche) {
        // Multi-tranche exact seasonal distribution (e.g., BIMAS in Jun, Sep, Dec; FROTO in Mar, Nov)
        const totalTranches = customTranche.months.length;

        for (let t = 0; t < totalTranches; t++) {
          const targetMonth = customTranche.months[t];
          const ratio = customTranche.ratios[t] || (1 / totalTranches);
          const trancheAmount = annualAmount * ratio;
          const trancheTRY = isUsd ? trancheAmount * usdTryRate : trancheAmount;
          const dps = ((asset.currentPrice || 0) * (yieldPct / 100)) * ratio;
          const trancheLabel = customTranche.monthLabels[t];
          const trancheDate = customTranche.dates[t];

          let parsedDay = 18;
          if (trancheDate) {
            const d = new Date(trancheDate);
            if (!isNaN(d.getTime())) parsedDay = d.getDate();
          }

          // A tranche is confirmed if the overall asset is confirmed AND its target date aligns with the confirmed payout
          let trancheConfirmed = false;
          if (isAssetConfirmed) {
            const assetDateStr = asset.nextPaymentDate || asset.nextExDate;
            if (assetDateStr) {
              const ad = new Date(assetDateStr);
              if (!isNaN(ad.getTime()) && ad.getMonth() === targetMonth) {
                trancheConfirmed = true;
              }
            } else if (t === 0) {
              trancheConfirmed = true;
            }
          }

          const raindropItem: RaindropItem = {
            id: `${asset.symbol}-tranche-${t}`,
            symbol: asset.symbol,
            name: `${asset.name} (${trancheLabel})`,
            currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
            shares: asset.shares,
            dps: Number(dps.toFixed(4)),
            payoutAmount: trancheAmount,
            payoutAmountTRY: trancheTRY,
            exDate: trancheDate,
            paymentDate: trancheConfirmed ? (asset.nextPaymentDate || trancheDate) : trancheDate,
            settlementDate: trancheConfirmed ? (asset.nextPaymentDate || trancheDate) : undefined,
            dayOfMonth: parsedDay,
            frequency: asset.frequency,
            dividendYield: asset.dividendYield,
            yieldOnCost: asset.yieldOnCost,
            paymentStatus: trancheConfirmed ? 'Confirmed' : 'Estimated',
            isQuarterlyTranche: true,
            trancheNumber: t + 1,
            totalTranches,
            trancheLabel,
            source: trancheConfirmed ? 'KAP Resmî Bildirim (T+2 Takasbank)' : 'Algoritmik Mevsimsel Döngü',
          };

          buckets[targetMonth].raindrops.push(raindropItem);
          buckets[targetMonth].totalPayoutTRY += trancheTRY;
          if (trancheConfirmed) {
            buckets[targetMonth].confirmedPayoutTRY += trancheTRY;
          } else {
            buckets[targetMonth].estimatedPayoutTRY += trancheTRY;
          }
        }
      } else if (asset.frequency === 'Monthly') {
        // 12 monthly raindrops
        const perMonthAmount = annualAmount / 12;
        const perMonthTRY = isUsd ? perMonthAmount * usdTryRate : perMonthAmount;
        const dps = asset.estimatedNextDPS || ((asset.currentPrice || 0) * (yieldPct / 100) / 12);

        for (let m = 0; m < 12; m++) {
          const isCurrentConfirmedMonth = isAssetConfirmed && m === baseMonth;

          const raindropItem: RaindropItem = {
            id: `${asset.symbol}-monthly-${m}`,
            symbol: asset.symbol,
            name: asset.name,
            currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
            shares: asset.shares,
            dps: Number(dps.toFixed(4)),
            payoutAmount: perMonthAmount,
            payoutAmountTRY: perMonthTRY,
            exDate: asset.nextExDate,
            paymentDate: asset.nextPaymentDate,
            settlementDate: isCurrentConfirmedMonth ? asset.nextPaymentDate : undefined,
            dayOfMonth: 15,
            frequency: asset.frequency,
            dividendYield: asset.dividendYield,
            yieldOnCost: asset.yieldOnCost,
            paymentStatus: isCurrentConfirmedMonth ? 'Confirmed' : 'Estimated',
            isQuarterlyTranche: false,
            source: isCurrentConfirmedMonth ? 'Resmî Bildirim' : 'Aylık Dağıtım Tahmini',
          };

          buckets[m].raindrops.push(raindropItem);
          buckets[m].totalPayoutTRY += perMonthTRY;
          if (isCurrentConfirmedMonth) {
            buckets[m].confirmedPayoutTRY += perMonthTRY;
          } else {
            buckets[m].estimatedPayoutTRY += perMonthTRY;
          }
        }
      } else if (asset.frequency === 'Quarterly') {
        // 4 quarterly raindrops spaced every 3 months
        const perQuarterAmount = annualAmount / 4;
        const perQuarterTRY = isUsd ? perQuarterAmount * usdTryRate : perQuarterAmount;
        const dps = asset.estimatedNextDPS || ((asset.currentPrice || 0) * (yieldPct / 100) / 4);

        for (let q = 0; q < 4; q++) {
          const targetMonth = (baseMonth + q * 3) % 12;
          const isQuarterConfirmed = isAssetConfirmed && q === 0;

          const raindropItem: RaindropItem = {
            id: `${asset.symbol}-q-${q}`,
            symbol: asset.symbol,
            name: asset.name,
            currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
            shares: asset.shares,
            dps: Number(dps.toFixed(4)),
            payoutAmount: perQuarterAmount,
            payoutAmountTRY: perQuarterTRY,
            exDate: asset.nextExDate,
            paymentDate: asset.nextPaymentDate,
            settlementDate: isQuarterConfirmed ? asset.nextPaymentDate : undefined,
            dayOfMonth: 20,
            frequency: asset.frequency,
            dividendYield: asset.dividendYield,
            yieldOnCost: asset.yieldOnCost,
            paymentStatus: isQuarterConfirmed ? 'Confirmed' : 'Estimated',
            isQuarterlyTranche: true,
            trancheNumber: q + 1,
            totalTranches: 4,
            source: isQuarterConfirmed ? 'SEC/KAP Resmî Bildirim' : 'Çeyreklik Döngü Tahmini',
          };

          buckets[targetMonth].raindrops.push(raindropItem);
          buckets[targetMonth].totalPayoutTRY += perQuarterTRY;
          if (isQuarterConfirmed) {
            buckets[targetMonth].confirmedPayoutTRY += perQuarterTRY;
          } else {
            buckets[targetMonth].estimatedPayoutTRY += perQuarterTRY;
          }
        }
      } else if (asset.frequency === 'Semi-Annual') {
        // 2 semi-annual raindrops spaced 6 months
        const perHalfAmount = annualAmount / 2;
        const perHalfTRY = isUsd ? perHalfAmount * usdTryRate : perHalfAmount;
        const dps = asset.estimatedNextDPS || ((asset.currentPrice || 0) * (yieldPct / 100) / 2);

        for (let h = 0; h < 2; h++) {
          const targetMonth = (baseMonth + h * 6) % 12;
          const isSemiConfirmed = isAssetConfirmed && h === 0;

          const raindropItem: RaindropItem = {
            id: `${asset.symbol}-semi-${h}`,
            symbol: asset.symbol,
            name: asset.name,
            currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
            shares: asset.shares,
            dps: Number(dps.toFixed(4)),
            payoutAmount: perHalfAmount,
            payoutAmountTRY: perHalfTRY,
            exDate: asset.nextExDate,
            paymentDate: asset.nextPaymentDate,
            settlementDate: isSemiConfirmed ? asset.nextPaymentDate : undefined,
            dayOfMonth: 25,
            frequency: asset.frequency,
            dividendYield: asset.dividendYield,
            yieldOnCost: asset.yieldOnCost,
            paymentStatus: isSemiConfirmed ? 'Confirmed' : 'Estimated',
            isQuarterlyTranche: false,
            source: isSemiConfirmed ? 'Resmî Bildirim' : '6 Aylık Döngü Tahmini',
          };

          buckets[targetMonth].raindrops.push(raindropItem);
          buckets[targetMonth].totalPayoutTRY += perHalfTRY;
          if (isSemiConfirmed) {
            buckets[targetMonth].confirmedPayoutTRY += perHalfTRY;
          } else {
            buckets[targetMonth].estimatedPayoutTRY += perHalfTRY;
          }
        }
      } else {
        // Annual single raindrop (typical BIST)
        const dps = asset.estimatedNextDPS || ((asset.currentPrice || 0) * (yieldPct / 100));
        const payout = asset.estimatedNextPayout || (asset.shares * dps);
        const payoutTRY = isUsd ? payout * usdTryRate : payout;

        let parsedDay = 28;
        if (asset.nextPaymentDate) {
          const d = new Date(asset.nextPaymentDate);
          if (!isNaN(d.getTime())) parsedDay = d.getDate();
        }

        const raindropItem: RaindropItem = {
          id: `${asset.symbol}-annual`,
          symbol: asset.symbol,
          name: asset.name,
          currency: (asset.currency === 'USD' ? 'USD' : 'TRY') as 'TRY' | 'USD',
          shares: asset.shares,
          dps: Number(dps.toFixed(4)),
          payoutAmount: payout,
          payoutAmountTRY: payoutTRY,
          exDate: asset.nextExDate,
          paymentDate: asset.nextPaymentDate,
          settlementDate: isAssetConfirmed ? asset.nextPaymentDate : undefined,
          dayOfMonth: parsedDay,
          frequency: asset.frequency,
          dividendYield: asset.dividendYield,
          yieldOnCost: asset.yieldOnCost,
          paymentStatus: isAssetConfirmed ? 'Confirmed' : 'Estimated',
          isQuarterlyTranche: false,
          source: isAssetConfirmed ? 'KAP Resmî Bildirim' : 'Yıllık Döngü Tahmini',
        };

        buckets[baseMonth].raindrops.push(raindropItem);
        buckets[baseMonth].totalPayoutTRY += payoutTRY;
        if (isAssetConfirmed) {
          buckets[baseMonth].confirmedPayoutTRY += payoutTRY;
        } else {
          buckets[baseMonth].estimatedPayoutTRY += payoutTRY;
        }
      }
    }

    // Sort raindrops inside each month by dayOfMonth and calculate display amounts
    for (const b of buckets) {
      b.raindrops.sort((a, b) => (a.dayOfMonth || 15) - (b.dayOfMonth || 15));
      b.totalPayoutDisplay = currencyMode === 'USD' ? b.totalPayoutTRY / usdTryRate : b.totalPayoutTRY;
      b.confirmedPayoutDisplay = currencyMode === 'USD' ? b.confirmedPayoutTRY / usdTryRate : b.confirmedPayoutTRY;
      b.estimatedPayoutDisplay = currencyMode === 'USD' ? b.estimatedPayoutTRY / usdTryRate : b.estimatedPayoutTRY;
    }

    return buckets;
  }, [dividendAssets, usdTryRate, currencyMode, dateBasis]);

  // Aggregate Intelligence Statistics
  const totals = useMemo(() => {
    let totalRainTRY = 0;
    let confirmedRainTRY = 0;
    let estimatedRainTRY = 0;
    let confirmedCount = 0;
    let estimatedCount = 0;

    for (const b of monthlyBuckets) {
      totalRainTRY += b.totalPayoutTRY;
      confirmedRainTRY += b.confirmedPayoutTRY;
      estimatedRainTRY += b.estimatedPayoutTRY;
      for (const d of b.raindrops) {
        if (d.paymentStatus === 'Confirmed') {
          confirmedCount++;
        } else {
          estimatedCount++;
        }
      }
    }

    return {
      totalAnnualRainTRY: totalRainTRY,
      totalAnnualRainDisplay: currencyMode === 'USD' ? totalRainTRY / usdTryRate : totalRainTRY,
      confirmedRainTRY,
      confirmedRainDisplay: currencyMode === 'USD' ? confirmedRainTRY / usdTryRate : confirmedRainTRY,
      estimatedRainTRY,
      estimatedRainDisplay: currencyMode === 'USD' ? estimatedRainTRY / usdTryRate : estimatedRainTRY,
      confirmedCount,
      estimatedCount,
      totalCount: confirmedCount + estimatedCount,
    };
  }, [monthlyBuckets, currencyMode, usdTryRate]);

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

  // Next upcoming raindrop calculation (properly filter >= today)
  const nextRaindrop = useMemo(() => {
    const todayTimestamp = new Date().setHours(0, 0, 0, 0);
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
    const upcomingDrops = allDrops.filter(d => d.dateSort >= todayTimestamp);
    upcomingDrops.sort((a, b) => a.dateSort - b.dateSort);
    return upcomingDrops.length > 0 ? upcomingDrops[0] : (allDrops.length > 0 ? allDrops[0] : null);
  }, [monthlyBuckets, language]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. EXECUTIVE INTELLIGENCE RIBBON: CONFIRMED VS ESTIMATED BREAKDOWN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Total Annual Rain */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-600/10 via-cyan-500/5 to-emerald-500/10 dark:from-blue-950/40 dark:via-cyan-950/20 dark:to-emerald-950/30 border border-blue-200/80 dark:border-blue-800/80 backdrop-blur-md shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {language === 'tr' ? '💧 Toplam Temettü Yağmuru' : '💧 Annual Dividend Rain'}
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
              {formatCurr(totals.totalAnnualRainDisplay)}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === 'tr' ? '12 aylık toplam pasif nakit girişi' : '12-month projected passive cashflow'}
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl shrink-0">
            🌧️
          </div>
        </div>

        {/* Metric 2: Confirmed vs Estimated Breakdown */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-600/10 via-teal-500/5 to-violet-500/10 dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-violet-950/30 border border-emerald-200/80 dark:border-emerald-800/80 backdrop-blur-md shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {language === 'tr' ? '✓ Kesinleşen vs ⏳ Tahmini' : '✓ Confirmed vs ⏳ Estimated'}
            </span>
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400" title="KAP/Genel Kurul Onaylı">
                {formatCurr(totals.confirmedRainDisplay)}
              </span>
              <span className="text-xs text-slate-400">/</span>
              <span className="text-sm font-bold text-violet-600 dark:text-violet-400" title="Model Tahmini">
                {formatCurr(totals.estimatedRainDisplay)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ {totals.confirmedCount} {language === 'tr' ? 'KAP Bildirimi' : 'Confirmed'}</span>
              <span>•</span>
              <span className="text-violet-600 dark:text-violet-400 font-bold">⏳ {totals.estimatedCount} {language === 'tr' ? 'Döngü' : 'Cycles'}</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl shrink-0">
            🛡️
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
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{nextRaindrop ? nextRaindrop.symbol : '—'}</span>
              {nextRaindrop && (
                <>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    +{formatCurr(currencyMode === 'USD' ? nextRaindrop.payoutAmountTRY / usdTryRate : nextRaindrop.payoutAmountTRY)}
                  </span>
                  {nextRaindrop.paymentStatus === 'Confirmed' ? (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                      ✓ KAP
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border border-violet-300 dark:border-violet-700">
                      Tahmin
                    </span>
                  )}
                </>
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

      {/* 2. CONTROL STRIP & FILTER CHIPS */}
      <div className="bg-white/80 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">💧</span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-slate-900 dark:text-white">
                  {language === 'tr' ? '12 Aylık Temettü Yağmuru Takvimi' : '12-Month Dividend Raindrop Matrix'}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowMethodologyInfo(!showMethodologyInfo)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5 font-medium"
                >
                  <span>ℹ️</span>
                  <span>{language === 'tr' ? 'KAP vs Tahmini Nedir?' : 'Guide'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {language === 'tr'
                  ? 'KAP onaylı kesinleşen nakit girişleri ile ileriye dönük döngüsel model tahminlerini ayırt edin.'
                  : 'Distinguish confirmed corporate KAP payouts from algorithmic forward cycle estimates.'}
              </p>
            </div>
          </div>

          {/* Date Basis Toggle: Pay Date vs Ex-Date */}
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
                {language === 'tr' ? 'Ödeme Tarihi (T+2)' : 'Pay Date (T+2)'}
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

        {/* Status Filter Chips: All, Confirmed Only, Estimated Only */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 shrink-0">
            {language === 'tr' ? 'Filtrele:' : 'Filter:'}
          </span>

          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span>🌧️</span>
            <span>{language === 'tr' ? `Tüm Akış (${totals.totalCount})` : `All Inflows (${totals.totalCount})`}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('CONFIRMED')}
            className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'CONFIRMED'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800/60 hover:bg-emerald-100'
            }`}
          >
            <span>✓</span>
            <span>{language === 'tr' ? `Yalnızca Kesinleşenler (KAP) (${totals.confirmedCount})` : `Confirmed (KAP Verified) (${totals.confirmedCount})`}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('ESTIMATED')}
            className={`px-3 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
              statusFilter === 'ESTIMATED'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300 border border-violet-300/60 dark:border-violet-800/60 hover:bg-violet-100'
            }`}
          >
            <span>⏳</span>
            <span>{language === 'tr' ? `Tahmini Döngüler (${totals.estimatedCount})` : `Estimated Cycles (${totals.estimatedCount})`}</span>
          </button>
        </div>

        {/* Expandable Methodology Guide */}
        {showMethodologyInfo && (
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs space-y-2 animate-in fade-in duration-200">
            <div className="flex justify-between items-center">
              <span className="font-black text-slate-800 dark:text-slate-200">
                📌 {language === 'tr' ? 'Temettü Doğruluk & Güvenlik Prensipleri' : 'Dividend Data Integrity Principles'}
              </span>
              <button
                type="button"
                onClick={() => setShowMethodologyInfo(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-600 dark:text-slate-300">
              <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60 space-y-1">
                <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <span>✓</span>
                  <span>{language === 'tr' ? 'Kesinleşen Temettü (KAP / Takasbank Onaylı)' : 'Confirmed Dividend (KAP / Settlement Approved)'}</span>
                </span>
                <p>
                  {language === 'tr'
                    ? 'Genel Kurul veya Yönetim Kurulu tarafından net DPS tutarı ve Takasbank T+2 nakit hesaba geçiş tarihi tescil edilmiş resmi bildirimlerdir. Yeşil düz çizgi ve ✓ rozeti ile gösterilir.'
                    : 'Officially declared corporate actions with verified net DPS and Takasbank settlement date. Rendered in solid emerald.'}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/80 dark:border-violet-900/60 space-y-1">
                <span className="font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1">
                  <span>⏳</span>
                  <span>{language === 'tr' ? 'Tahmini Döngü (Model Öngörüsü)' : 'Estimated Cycle (Algorithmic Projection)'}</span>
                </span>
                <p>
                  {language === 'tr'
                    ? 'Şirketin geçmiş yıllardaki mevsimsel ödeme takvimine ve taksit alışkanlıklarına göre hesaplanan projeksiyonlardır. Kesik çizgili (dashed) mor kartlarla gösterilir.'
                    : 'Forward projections derived from historical seasonality and multi-tranche patterns. Rendered with dashed violet borders.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. 12-MONTH HORIZONTAL RAINDROP WATERFALL MATRIX */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-12 gap-3">
        {monthlyBuckets.map((bucket) => {
          const visibleDrops = bucket.raindrops.filter((d) => {
            if (statusFilter === 'CONFIRMED') return d.paymentStatus === 'Confirmed';
            if (statusFilter === 'ESTIMATED') return d.paymentStatus === 'Estimated';
            return true;
          });

          const hasRain = visibleDrops.length > 0;
          const isSelected = selectedMonth === bucket.monthIndex;

          const confirmedRatio = maxMonthTRY > 0 ? bucket.confirmedPayoutTRY / maxMonthTRY : 0;
          const estimatedRatio = maxMonthTRY > 0 ? bucket.estimatedPayoutTRY / maxMonthTRY : 0;

          // Compute displayed total for this month depending on active filter
          let monthDisplayTotal = bucket.totalPayoutDisplay;
          if (statusFilter === 'CONFIRMED') monthDisplayTotal = bucket.confirmedPayoutDisplay;
          if (statusFilter === 'ESTIMATED') monthDisplayTotal = bucket.estimatedPayoutDisplay;

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
              {/* Raindrop Dual-Density Gauge Bar: Confirmed (Emerald) + Estimated (Violet) */}
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 flex overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, confirmedRatio * 100))}%` }}
                  title={`Kesinleşen: ${formatCurr(bucket.confirmedPayoutDisplay)}`}
                />
                <div
                  className="h-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, estimatedRatio * 100))}%` }}
                  title={`Tahmini: ${formatCurr(bucket.estimatedPayoutDisplay)}`}
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
                    {hasRain ? `💧 ${visibleDrops.length}` : '☁️ 0'}
                  </span>
                </div>

                {/* Month Cumulative Inflow */}
                <div className="mt-1">
                  <div className={`text-sm font-black font-mono ${
                    hasRain
                      ? statusFilter === 'CONFIRMED'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : statusFilter === 'ESTIMATED'
                        ? 'text-violet-600 dark:text-violet-400'
                        : 'text-slate-900 dark:text-white'
                      : 'text-slate-400 dark:text-slate-600'
                  }`}>
                    {hasRain ? `+${formatCurr(monthDisplayTotal)}` : '₺0.00'}
                  </div>
                </div>
              </div>

              {/* Raindrop Droplets Container */}
              <div className="p-2 flex-1 space-y-2 min-h-[140px] flex flex-col justify-start">
                {hasRain ? (
                  visibleDrops.map((drop) => {
                    const dropDisplay = currencyMode === 'USD' ? drop.payoutAmountTRY / usdTryRate : drop.payoutAmountTRY;
                    const isConfirmed = drop.paymentStatus === 'Confirmed';

                    return (
                      <div
                        key={drop.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTicker?.(drop.symbol);
                        }}
                        className={`group relative p-2 rounded-xl transition-all hover:scale-[1.02] cursor-pointer shadow-2xs ${
                          isConfirmed
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-400/80 dark:border-emerald-700/80 hover:border-emerald-500'
                            : 'bg-violet-50/40 dark:bg-violet-950/20 border border-dashed border-violet-300/80 dark:border-violet-700/70 hover:border-violet-400'
                        }`}
                        title={`${drop.symbol} · ${isConfirmed ? '✓ KAP Kesinleşti' : '⏳ Tahmini Döngü'} · ${drop.shares} lot · ${formatCurr(dropDisplay)}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className={`text-xs shrink-0 ${isConfirmed ? 'text-emerald-500' : 'text-violet-500'}`}>
                              {isConfirmed ? '💧' : '⏳'}
                            </span>
                            <span className="font-black text-xs text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate">
                              {drop.symbol}
                            </span>
                            {drop.trancheNumber && (
                              <span
                                className="text-[8px] font-black px-1 py-0.2 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 shrink-0"
                                title={`${drop.trancheNumber}. Taksit Dağıtımı`}
                              >
                                T{drop.trancheNumber}
                              </span>
                            )}
                          </div>
                          {isConfirmed ? (
                            <span
                              className="text-[8px] font-black px-1 py-0.2 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/90 dark:text-emerald-300 shrink-0 border border-emerald-300/60 dark:border-emerald-700/60"
                              title="KAP / Takasbank Net Tescilli"
                            >
                              ✓ KAP
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              {drop.dayOfMonth ? `~${drop.dayOfMonth}` : ''}
                            </span>
                          )}
                        </div>

                        {/* Amount */}
                        <div className={`text-xs font-black font-mono mt-1 ${isConfirmed ? 'text-emerald-600 dark:text-emerald-400' : 'text-violet-600 dark:text-violet-400'}`}>
                          +{formatCurr(dropDisplay)}
                        </div>

                        {/* Micro Details: Net DPS & Settlement Timing */}
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center justify-between mt-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span>{drop.shares.toLocaleString()} lot</span>
                          <span className={`font-mono font-bold ${isConfirmed ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>
                            {drop.dps > 0 ? `₺${drop.dps.toFixed(2)}${isConfirmed ? ' Net' : ''}` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-4 text-slate-300 dark:text-slate-700">
                    <span className="text-xl opacity-60">☁️</span>
                    <span className="text-[10px] font-bold mt-1">
                      {statusFilter === 'CONFIRMED'
                        ? (language === 'tr' ? 'Kesinleşen Yok' : 'None Confirmed')
                        : statusFilter === 'ESTIMATED'
                        ? (language === 'tr' ? 'Tahmini Yok' : 'No Estimates')
                        : (language === 'tr' ? 'Temettüsüz Ay' : 'Dry Month')}
                    </span>
                  </div>
                )}
              </div>

              {/* Month Footer */}
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-850/60 border-t border-slate-100 dark:border-slate-800 text-[10px] font-mono text-center text-slate-400">
                {hasRain && totals.totalAnnualRainTRY > 0
                  ? `%${((bucket.totalPayoutTRY / totals.totalAnnualRainTRY) * 100).toFixed(1)} ${language === 'tr' ? 'pay' : 'share'}`
                  : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. SELECTED MONTH COMPREHENSIVE DETAIL MODAL / DRAWER */}
      {selectedMonth !== null && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 shadow-xl space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex justify-between items-start sm:items-center pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">💧</span>
              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>
                    {language === 'tr'
                      ? `${monthlyBuckets[selectedMonth].monthNameTr} Ayı Temettü Yağmuru Raporu`
                      : `${monthlyBuckets[selectedMonth].monthNameEn} Dividend Raindrop Report`}
                  </span>
                  <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">
                    {monthlyBuckets[selectedMonth].raindrops.length} {language === 'tr' ? 'Dağıtım' : 'Payouts'}
                  </span>
                </h4>
                <p className="text-xs text-slate-500">
                  {language === 'tr'
                    ? 'KAP tescilli net nakit ödemeleri ile mevsimsel model projeksiyonlarının detaylı kırılımı.'
                    : 'Granular breakdown of corporate KAP distributions versus algorithmic forecast cycles.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {language === 'tr' ? 'Ay Toplamı' : 'Month Total'}
                </span>
                <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                  +{formatCurr(monthlyBuckets[selectedMonth].totalPayoutDisplay)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Sub-totals Strip in Modal */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  ✓ {language === 'tr' ? 'Kesinleşen KAP Tutarı' : 'Confirmed KAP Total'}
                </span>
                <div className="text-base font-black text-emerald-700 dark:text-emerald-300 font-mono mt-0.5">
                  {formatCurr(monthlyBuckets[selectedMonth].confirmedPayoutDisplay)}
                </div>
              </div>
              <span className="text-lg">🛡️</span>
            </div>

            <div className="p-3 rounded-xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/80 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">
                  ⏳ {language === 'tr' ? 'Tahmini Döngü Tutarı' : 'Estimated Cycle Total'}
                </span>
                <div className="text-base font-black text-violet-700 dark:text-violet-300 font-mono mt-0.5">
                  {formatCurr(monthlyBuckets[selectedMonth].estimatedPayoutDisplay)}
                </div>
              </div>
              <span className="text-lg">🔮</span>
            </div>
          </div>

          {/* Detailed Cards Grid */}
          {monthlyBuckets[selectedMonth].raindrops.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
              {monthlyBuckets[selectedMonth].raindrops.map((drop) => {
                const dropDisplay = currencyMode === 'USD' ? drop.payoutAmountTRY / usdTryRate : drop.payoutAmountTRY;
                const isConfirmed = drop.paymentStatus === 'Confirmed';

                return (
                  <div
                    key={drop.id}
                    onClick={() => onSelectTicker?.(drop.symbol)}
                    className={`p-4 rounded-xl border space-y-3 cursor-pointer transition-all hover:scale-[1.01] ${
                      isConfirmed
                        ? 'bg-gradient-to-br from-emerald-50/50 to-teal-50/30 dark:from-slate-800/90 dark:to-emerald-950/30 border-emerald-300 dark:border-emerald-700 shadow-xs'
                        : 'bg-gradient-to-br from-slate-50 to-violet-50/30 dark:from-slate-800/80 dark:to-violet-950/20 border-dashed border-violet-300 dark:border-violet-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-base text-slate-900 dark:text-white">{drop.symbol}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {drop.frequency}
                          </span>
                          {drop.trancheNumber && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                              {drop.trancheNumber}/{drop.totalTranches || 2} {language === 'tr' ? 'Taksit' : 'Tranche'}
                            </span>
                          )}
                          {isConfirmed ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                              ✓ {language === 'tr' ? 'KAP Kesinleşti' : 'Confirmed'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border border-dashed border-violet-300 dark:border-violet-700">
                              ⏳ {language === 'tr' ? 'Tahmini Döngü' : 'Estimated Cycle'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate max-w-[220px] mt-0.5">{drop.name}</p>
                      </div>

                      <div className="text-right">
                        <div className={`text-base font-black font-mono ${isConfirmed ? 'text-emerald-600 dark:text-emerald-400' : 'text-violet-600 dark:text-violet-400'}`}>
                          +{formatCurr(dropDisplay)}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ₺{drop.dps.toFixed(4)} / lot {isConfirmed ? '(Net)' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Metadata Specs */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">{language === 'tr' ? 'Portföy Adedi' : 'Shares'}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{drop.shares.toLocaleString()} lot</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">{language === 'tr' ? 'Verim (Yield)' : 'Yield'}</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {drop.dividendYield !== null && drop.dividendYield !== undefined ? `%${drop.dividendYield.toFixed(2)}` : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">
                          {isConfirmed
                            ? (language === 'tr' ? 'Takasbank (T+2)' : 'Settlement')
                            : (language === 'tr' ? 'Tahmini Tarih' : 'Est. Date')}
                        </span>
                        <span className={`font-bold font-mono ${isConfirmed ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}>
                          {drop.paymentDate || drop.exDate || (language === 'tr' ? 'Belirlenmedi' : 'TBD')}
                        </span>
                      </div>
                    </div>

                    {/* Provenance Footer */}
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>{drop.source || (isConfirmed ? 'KAP Resmî Bildirim' : 'Mevsimsel Projeksiyon')}</span>
                      <span className="text-blue-500 group-hover:underline">Detayı Gör →</span>
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
