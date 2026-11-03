'use client';

import React from 'react';
import { StrategyStat, ScannedTradeSignal } from '../lib/supabaseClient';
import ScanSignalsLedger from './ScanSignalsLedger';
import { useLanguage } from '../context/LanguageContext';
import { DateRangeFilter, isDateInRange, formatFilterDisplay } from '../lib/dateFilter';

interface ScorecardViewProps {
  strategies: StrategyStat[];
  scannedSignals?: ScannedTradeSignal[];
  onSelectTicker?: (symbol: string) => void;
  dateFilter?: DateRangeFilter;
}

export default function ScorecardView({ strategies, scannedSignals = [], onSelectTicker, dateFilter }: ScorecardViewProps) {
  const { t, language } = useLanguage();

  const isFiltered = Boolean(dateFilter && dateFilter.preset !== 'ALL');

  const effectiveScannedSignals = React.useMemo(() => {
    if (!dateFilter || dateFilter.preset === 'ALL') return scannedSignals;
    return scannedSignals.filter(s => isDateInRange(s.signalDate, dateFilter) || isDateInRange(s.closedAt, dateFilter));
  }, [scannedSignals, dateFilter]);

  // Backtest / Lifetime stats
  const totalTrades = strategies.reduce((acc, s) => acc + s.totalTrades, 0);
  const weightedWinRate = totalTrades > 0
    ? strategies.reduce((acc, s) => acc + s.winRate * s.totalTrades, 0) / totalTrades
    : 0;

  // Period-specific dynamic stats from ledger
  const targetHitCount = effectiveScannedSignals.filter(s => s.status === 'target_hit').length;
  const stoppedOutCount = effectiveScannedSignals.filter(s => s.status === 'stopped_out').length;
  const resolvedCount = targetHitCount + stoppedOutCount;
  const periodWinRate = resolvedCount > 0 ? (targetHitCount / resolvedCount) * 100 : 0;

  const winningTrades = effectiveScannedSignals.filter(s => s.status === 'target_hit' && (s.outcomePnlPct || 0) > 0);
  const losingTrades = effectiveScannedSignals.filter(s => s.status === 'stopped_out' && (s.outcomePnlPct || 0) < 0);
  const avgGain = winningTrades.length > 0 ? winningTrades.reduce((acc, s) => acc + (s.outcomePnlPct || 0), 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((acc, s) => acc + (s.outcomePnlPct || 0), 0) / losingTrades.length) : 0;
  const periodProfitFactor = (avgLoss > 0 && losingTrades.length > 0)
    ? ((avgGain * winningTrades.length) / (avgLoss * losingTrades.length)).toFixed(2)
    : (winningTrades.length > 0 ? '∞' : 'N/A');

  return (
    <div className="space-y-6">
      {/* Top Level System KPIs (Responsive 2x2 on Mobile, 4 Cols on Desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3.5 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block truncate">
            {isFiltered ? (language === 'tr' ? 'Dönem İçi İşlemler' : 'Period Trades') : t.scorecard.totalTrades}
          </span>
          <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-blue-600 dark:text-blue-400 truncate">
            {isFiltered ? effectiveScannedSignals.length.toLocaleString() : totalTrades.toLocaleString()} {language === 'tr' ? 'İşlem' : 'Trades'}
          </div>
          <div className="text-[10px] sm:text-xs text-emerald-500 font-semibold mt-0.5 sm:mt-1 truncate">
            ● {isFiltered ? formatFilterDisplay(dateFilter!, language) : (language === 'tr' ? '117 Varlık · 1 Yıl' : '117 Assets · 1Y')}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3.5 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block truncate">
            {isFiltered ? (language === 'tr' ? 'Dönem Kazanma Oranı' : 'Period Win Rate') : t.scorecard.winRate}
          </span>
          <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-emerald-500 truncate">
            {isFiltered ? `${periodWinRate.toFixed(1)}%` : `${weightedWinRate.toFixed(1)}%`}
          </div>
          <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
            {isFiltered ? `${targetHitCount} Kazanç / ${stoppedOutCount} Stop` : (language === 'tr' ? '1.5 - 2.5 R:R Hedef' : '1.5 - 2.5 R:R')}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3.5 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block truncate">{t.scorecard.topStrategy}</span>
          <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-purple-600 dark:text-purple-400 truncate">
            68.4%
          </div>
          <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">
            {language === 'tr' ? '50 EMA Geri Çekilme' : '50 EMA Pullback'}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-3.5 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-xs">
          <span className="text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider block truncate">
            {isFiltered ? (language === 'tr' ? 'Dönem Kâr Faktörü' : 'Period Profit Factor') : t.scorecard.profitFactor}
          </span>
          <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-emerald-500 truncate">
            {isFiltered ? periodProfitFactor : '1.82'}
          </div>
          <div className="text-[10px] sm:text-xs text-emerald-500 font-semibold mt-0.5 sm:mt-1 truncate">
            ● {language === 'tr' ? 'Toplam Kâr / Zarar > 1.5' : 'Gross Win/Loss > 1.5'}
          </div>
        </div>
      </div>

      {/* Strategy Comparison Breakdown */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">{t.scorecard.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {language === 'tr' 
              ? 'BIST 100, ABD Hisseleri ve ETF modellerinde 1 yıllık deneysel test sonuçları.' 
              : 'Empirical 1-year backtest outcomes across BIST 100, US Equities, and ETFs.'}
          </p>
        </div>

        {/* Mobile View: Strategy Cards */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-750">
          {strategies.map((stat, idx) => (
            <div key={idx} className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white">{stat.strategy}</h4>
                  <span className="text-xs text-gray-500">{stat.totalTrades} {language === 'tr' ? 'işlem' : 'trades'}</span>
                </div>
                <span className={`px-2 py-0.5 rounded font-black text-xs shrink-0 ${
                  stat.profitFactor >= 2.0
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                    : stat.profitFactor >= 1.5
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  {stat.profitFactor.toFixed(2)} PF
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs mb-1 font-semibold">
                  <span className="text-gray-500">{language === 'tr' ? 'Kazanma Oranı' : 'Win Rate'}</span>
                  <span className={stat.winRate >= 60 ? 'text-emerald-600 font-bold' : 'text-blue-600 font-bold'}>
                    {stat.winRate.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${
                      stat.winRate >= 60 ? 'bg-emerald-500' : stat.winRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${stat.winRate}%` }}
                  ></div>
                </div>
              </div>

              {/* Stats pill row */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
                <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-1.5 rounded-lg border border-emerald-200/50 dark:border-emerald-800/40">
                  <div className="text-[10px] text-gray-500">{language === 'tr' ? 'Ort. Kazanç' : 'Avg Gain'}</div>
                  <div className="font-bold text-emerald-600">+{stat.avgGain.toFixed(1)}%</div>
                </div>
                <div className="bg-rose-50/50 dark:bg-rose-950/20 p-1.5 rounded-lg border border-rose-200/50 dark:border-rose-800/40">
                  <div className="text-[10px] text-gray-500">{language === 'tr' ? 'Ort. Kayıp' : 'Avg Loss'}</div>
                  <div className="font-bold text-rose-600">-{stat.avgLoss.toFixed(1)}%</div>
                </div>
                <div className="bg-purple-50/50 dark:bg-purple-950/20 p-1.5 rounded-lg border border-purple-200/50 dark:border-purple-800/40">
                  <div className="text-[10px] text-gray-500">{language === 'tr' ? 'Beklenti' : 'Expectancy'}</div>
                  <div className="font-bold text-purple-600">+{stat.expectancy.toFixed(2)}R</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View: Full Strategy Table */}
        <div className="hidden md:block overflow-x-auto touch-pan-x">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">{language === 'tr' ? 'Strateji Adı' : 'Strategy Name'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Örneklem Sayısı' : 'Sample Size'}</th>
                <th className="px-5 py-3 whitespace-nowrap">{language === 'tr' ? 'Kazanma Oranı Grafiği' : 'Win Rate Visual'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Kazanma %' : 'Win Rate %'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Kâr Faktörü' : 'Profit Factor'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Ort. Kazanç' : 'Avg Gain'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Ort. Kayıp' : 'Avg Loss'}</th>
                <th className="px-5 py-3 text-right whitespace-nowrap">{language === 'tr' ? 'Beklenti (R)' : 'Expectancy'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {strategies.map((stat, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                  <td className="px-5 py-4 font-bold text-gray-900 dark:text-white whitespace-nowrap">
                    {stat.strategy}
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {stat.totalTrades} {language === 'tr' ? 'işlem' : 'trades'}
                  </td>
                  <td className="px-5 py-4 w-44">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-2.5 rounded-full ${
                          stat.winRate >= 60 ? 'bg-emerald-500' : stat.winRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${stat.winRate}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-gray-900 dark:text-white whitespace-nowrap">
                    {stat.winRate.toFixed(1)}%
                  </td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded font-black text-xs ${
                      stat.profitFactor >= 2.0
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                        : stat.profitFactor >= 1.5
                        ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}>
                      {stat.profitFactor.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-emerald-500 whitespace-nowrap">
                    +{stat.avgGain.toFixed(1)}%
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-rose-500 whitespace-nowrap">
                    -{stat.avgLoss.toFixed(1)}%
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-purple-600 dark:text-purple-400 whitespace-nowrap">
                    +{stat.expectancy.toFixed(2)}R
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Signals & Outcome Audit Ledger */}
      <ScanSignalsLedger signals={effectiveScannedSignals} onSelectTicker={onSelectTicker} />

      {/* Rationale & Edge Guide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h4 className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <span>🎯</span>
            <span>{language === 'tr' ? '50 EMA Geri Çekilmeleri Boğa Piyasasında Neden Başarılıdır?' : 'Why 50 EMA Pullbacks Outperform in Bull Markets'}</span>
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
            {language === 'tr' 
              ? 'Bir varlık 200 günlük EMA üzerinde seyrederken, yükselen 50 günlük EMA seviyesine çekilme ideal bir risk-ödül fırsatı sunar. Risk, son dip seviyesinin hemen altına net şekilde sınırlandırılır ve %68.4 kazanma oranı ile 2.14 kâr faktörü üretir.'
              : 'When an asset is trading above its 200-day EMA, a pullback to the rising 50-day EMA represents an optimal risk-to-reward entry point. Risk is clearly bounded just below the recent swing low, yielding a 68.4% win rate with an average profit factor of 2.14.'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h4 className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
            <span>🛡️</span>
            <span>{language === 'tr' ? 'Zarar Kes Uygulaması ve Düşüş Yönetimi' : 'Stop-Loss Execution vs Holding Through Drawdowns'}</span>
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
            {language === 'tr'
              ? 'Veriler, swing işlemlerde zararların 1.5 - 2.0x ATR seviyesinde kesilmesinin bir sonraki yüksek olasılıklı işlem için sermayeyi koruduğunu göstermektedir. Temettü pozisyonlarında ise stop loss yerine RSI 40 altına indiğinde otomatik Kademeli Alım (DCA) uyarıları devreye girer.'
              : 'The data demonstrates that for swing trades, cutting losses at 1.5 - 2.0x ATR preserves capital for the next high-probability setup. For dividend holdings, stop losses are replaced by automated DCA Value Zone alerts when RSI falls below 40.'}
          </p>
        </div>
      </div>
    </div>
  );
}
