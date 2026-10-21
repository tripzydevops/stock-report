'use client';

import React, { useState, useMemo } from 'react';
import { PortfolioItem, RealizedTrade, ExecutedOrder, CapitalTransfer } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';
import { calculateSectorRisk } from '../lib/sectorRisk';
import { deriveDividendsFromPortfolio } from '../lib/dividendForecastMath';

interface PortfolioBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolio: PortfolioItem[];
  realizedTrades?: RealizedTrade[];
  orders?: ExecutedOrder[];
  transfers?: CapitalTransfer[];
  usdTryRate: number;
  cashBalanceTRY?: number;
  onSelectTicker?: (symbol: string) => void;
}

export default function PortfolioBriefModal({
  isOpen,
  onClose,
  portfolio,
  realizedTrades = [],
  orders = [],
  transfers = [],
  usdTryRate,
  cashBalanceTRY,
  onSelectTicker,
}: PortfolioBriefModalProps) {
  const { language } = useLanguage();
  const [currencyMode, setCurrencyMode] = useState<'TRY' | 'USD'>('TRY');
  const [isCopied, setIsCopied] = useState(false);

  // Currency Formatter
  const formatVal = (val: number, customCurr?: 'TRY' | 'USD') => {
    const mode = customCurr || currencyMode;
    const symbol = mode === 'USD' ? '$' : '₺';
    return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Convert TRY to active currency
  const toCurr = (valTRY: number) => {
    return currencyMode === 'USD' ? valTRY / usdTryRate : valTRY;
  };

  // 1. Portfolio Value & Cost Math
  const totalCostTRY = useMemo(() => {
    return portfolio.reduce((acc, item) => {
      return acc + (item.currency === 'USD' ? item.totalCost * usdTryRate : item.totalCost);
    }, 0);
  }, [portfolio, usdTryRate]);

  const totalStockValTRY = useMemo(() => {
    return portfolio.reduce((acc, item) => {
      return acc + (item.currency === 'USD' ? item.currentValue * usdTryRate : item.currentValue);
    }, 0);
  }, [portfolio, usdTryRate]);

  // Closed trades cost basis & proceeds
  const totalRealizedCostTRY = useMemo(() => {
    return realizedTrades.reduce((acc, trade) => {
      const tradeCost = trade.sharesSold * trade.entryPrice;
      return acc + (trade.currency === 'USD' ? tradeCost * usdTryRate : tradeCost);
    }, 0);
  }, [realizedTrades, usdTryRate]);

  const totalRealizedPnlTRY = useMemo(() => {
    return realizedTrades.reduce((acc, trade) => {
      return acc + (trade.currency === 'USD' ? trade.realizedPnl * usdTryRate : trade.realizedPnl);
    }, 0);
  }, [realizedTrades, usdTryRate]);

  // Peak capital ever funded
  const recordedDepositsTRY = useMemo(() => {
    return transfers.length > 0
      ? transfers.reduce((acc, t) => acc + (t.transferType === 'DEPOSIT' ? t.amount : -t.amount), 0)
      : 17000.00;
  }, [transfers]);

  const peakInvestedCapitalTRY = totalCostTRY + totalRealizedCostTRY;
  const autoInjectedCapitalTRY = Math.max(0, peakInvestedCapitalTRY - recordedDepositsTRY);
  const totalDepositedTRY = recordedDepositsTRY + autoInjectedCapitalTRY;

  // Liquid Cash
  const totalBrokerageFeesTRY = 11.89;
  const unallocatedCapitalCash = Math.max(0, totalDepositedTRY - totalCostTRY);
  const computedCashTRY = Math.max(0, unallocatedCapitalCash + totalRealizedPnlTRY - totalBrokerageFeesTRY);
  const liquidCashTRY = cashBalanceTRY !== undefined && cashBalanceTRY > computedCashTRY ? cashBalanceTRY : computedCashTRY;

  // Net Portfolio Value
  const totalNetWorthTRY = totalStockValTRY + liquidCashTRY;
  const trueLifetimeRoiTRY = totalNetWorthTRY - totalDepositedTRY;
  const trueLifetimeRoiPct = totalDepositedTRY > 0 ? (trueLifetimeRoiTRY / totalDepositedTRY) * 100 : 0;
  const unrealizedPnlTRY = totalStockValTRY - totalCostTRY;
  const unrealizedPnlPct = totalCostTRY > 0 ? (unrealizedPnlTRY / totalCostTRY) * 100 : 0;
  const cashBufferPct = totalNetWorthTRY > 0 ? (liquidCashTRY / totalNetWorthTRY) * 100 : 0;
  const equityWeightPct = totalNetWorthTRY > 0 ? (totalStockValTRY / totalNetWorthTRY) * 100 : 0;

  // 2. Dividend Stream Forecast
  const dividendAssets = useMemo(() => {
    return deriveDividendsFromPortfolio(portfolio);
  }, [portfolio]);

  const annualDividendTRY = useMemo(() => {
    return dividendAssets.reduce((acc, d) => {
      const payoutTRY = d.currency === 'USD' ? d.annualPayout * usdTryRate : d.annualPayout;
      return acc + payoutTRY;
    }, 0);
  }, [dividendAssets, usdTryRate]);

  const monthlyDividendTRY = annualDividendTRY / 12;
  const blendedDividendYieldPct = totalStockValTRY > 0 ? (annualDividendTRY / totalStockValTRY) * 100 : 0;
  const dividendYieldOnCostPct = totalCostTRY > 0 ? (annualDividendTRY / totalCostTRY) * 100 : 0;

  // 3. Sector Diversification
  const sectorRisk = useMemo(() => {
    return calculateSectorRisk(portfolio, usdTryRate);
  }, [portfolio, usdTryRate]);

  // 4. Performance Diagnostics: Winner, Drag, and T0 (+3-4% TP) Alerts
  const sortedByPnl = useMemo(() => {
    return [...portfolio].sort((a, b) => b.pnlPercent - a.pnlPercent);
  }, [portfolio]);

  const topWinner = sortedByPnl.length > 0 && sortedByPnl[0].pnlPercent > 0 ? sortedByPnl[0] : null;
  const biggestDrag = sortedByPnl.length > 0 && sortedByPnl[sortedByPnl.length - 1].pnlPercent < 0
    ? sortedByPnl[sortedByPnl.length - 1]
    : null;

  // Holdings in Personal Take-Profit Zone (+3% to +4% or higher)
  const personalTpHitHoldings = useMemo(() => {
    return portfolio.filter(p => p.pnlPercent >= 3.0);
  }, [portfolio]);

  // Multi-lot holding diagnostics (e.g. TURSG)
  const multiLotHoldings = useMemo(() => {
    return portfolio.map(item => {
      const cleanSym = item.symbol.replace('.IS', '').trim().toUpperCase();
      const buyOrders = orders.filter(o => o.side === 'BUY' && o.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym);
      return {
        item,
        buyCount: buyOrders.length,
        hasMultipleBuys: buyOrders.length > 1,
      };
    }).filter(m => m.hasMultipleBuys);
  }, [portfolio, orders]);

  // Strategy split: Core Dividend vs Tactical Swing
  const coreDivCostTRY = portfolio.filter(p => p.strategyType === 'CORE_DIVIDEND' || p.isDividend)
    .reduce((acc, p) => acc + (p.currency === 'USD' ? p.totalCost * usdTryRate : p.totalCost), 0);
  const swingCostTRY = totalCostTRY - coreDivCostTRY;
  const coreDivPct = totalCostTRY > 0 ? (coreDivCostTRY / totalCostTRY) * 100 : 0;
  const swingPct = totalCostTRY > 0 ? (swingCostTRY / totalCostTRY) * 100 : 0;

  // Copy Executive Brief to Clipboard
  const handleCopyBrief = () => {
    const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const briefMarkdown = `# 📊 TRIPZY EXECUTIVE PORTFOLIO BRIEF
**Report Date:** ${dateStr}
**Reporting Currency:** ${currencyMode} (USD/TRY Rate: ₺${usdTryRate.toFixed(2)})

## 1. EXECUTIVE SUMMARY & PORTFOLIO VITALS
• **Total Portfolio Net Worth:** ${formatVal(toCurr(totalNetWorthTRY))}
• **Total Invested Capital (Principal Put In):** ${formatVal(toCurr(totalDepositedTRY))}
• **True Lifetime Return:** ${trueLifetimeRoiTRY >= 0 ? '+' : ''}${formatVal(toCurr(trueLifetimeRoiTRY))} (${trueLifetimeRoiPct >= 0 ? '+' : ''}${trueLifetimeRoiPct.toFixed(2)}%)
• **Liquid Cash Reserve:** ${formatVal(toCurr(liquidCashTRY))} (${cashBufferPct.toFixed(1)}% of portfolio)
• **Active Equities Market Value:** ${formatVal(toCurr(totalStockValTRY))} (${equityWeightPct.toFixed(1)}% of portfolio)
• **Unrealized Position P&L:** ${unrealizedPnlTRY >= 0 ? '+' : ''}${formatVal(toCurr(unrealizedPnlTRY))} (${unrealizedPnlPct >= 0 ? '+' : ''}${unrealizedPnlPct.toFixed(2)}%)
• **Realized Trading Profit Banked:** ${totalRealizedPnlTRY >= 0 ? '+' : ''}${formatVal(toCurr(totalRealizedPnlTRY))}

## 2. PASSIVE INCOME & DIVIDEND ENGINE
• **Projected Annual Dividend Cashflow:** ${formatVal(toCurr(annualDividendTRY))}/year
• **Monthly Run-Rate Income:** ${formatVal(toCurr(monthlyDividendTRY))}/month
• **Blended Market Dividend Yield:** %${blendedDividendYieldPct.toFixed(2)}
• **Effective Yield on Cost (YoC):** %${dividendYieldOnCostPct.toFixed(2)}
• **Strategy Split:** Core Dividend Compounders: %${coreDivPct.toFixed(1)} | Tactical Swings: %${swingPct.toFixed(1)}

## 3. SECTOR ALLOCATION & CONCENTRATION RISK
${sectorRisk.profiles.map(s => `• **${s.sector}:** ${s.weightPercent.toFixed(1)}% (${formatVal(toCurr(s.totalMarketValTRY))})`).join('\n')}
• **Diversification Status:** ${sectorRisk.isHighConcentration ? '⚠️ High Concentration Alert in ' + (sectorRisk.highestSector?.sector || 'leading sector') : '🟢 Well Diversified across liquid sectors'}

## 4. POSITION DIAGNOSTICS & ALPHA HIGHLIGHTS
• **Alpha Leader (Top Winner):** ${topWinner ? `${topWinner.symbol} (+${topWinner.pnlPercent.toFixed(2)}% | +${formatVal(toCurr(topWinner.pnlAmount * (topWinner.currency === 'USD' ? usdTryRate : 1)))})` : 'All positions in consolidation'}
• **Biggest Drag / Recovery Watch:** ${biggestDrag ? `${biggestDrag.symbol} (${biggestDrag.pnlPercent.toFixed(2)}% | ${formatVal(toCurr(biggestDrag.pnlAmount * (biggestDrag.currency === 'USD' ? usdTryRate : 1)))})` : 'No negative positions'}
• **Personal Quick Take-Profit Alert (+3-4%):** ${personalTpHitHoldings.length > 0 ? personalTpHitHoldings.map(h => `${h.symbol} (+${h.pnlPercent.toFixed(2)}%)`).join(', ') : 'None currently in +3-4% window'}

## 5. EXECUTIVE AI DIRECTIVE & ACTION CHECKLIST
1. **Cash Management:** Maintain ${cashBufferPct.toFixed(1)}% liquid buffer (${formatVal(toCurr(liquidCashTRY))}) as dry powder for high-probability pullback opportunities.
2. **Profit Recycling:** ${personalTpHitHoldings.length > 0 ? `Harvest 50-100% of profits on ${personalTpHitHoldings.map(h => h.symbol).join(', ')} to lock in velocity gains.` : 'Hold profitable swing runners with trailing stops at breakeven.'}
3. **DCA Netting Plan:** For multi-tranche holdings (e.g. TURSG), continue accumulating lower lots below average cost. Every lower tranche lowers the blended breakeven and increases forward dividend yield.
4. **Dividend Compounding:** Reinvest projected ${formatVal(toCurr(annualDividendTRY))} annual payouts into high-conviction dividend compounders.

--------------------------------------------------
*Generated by Tripzy.travel Autonomous Recommendation & Portfolio Engine*
`;
    navigator.clipboard.writeText(briefMarkdown);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-850 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-750 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-purple-50/70 dark:from-gray-800 dark:via-gray-800/90 dark:to-gray-800 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-md shadow-blue-500/20">
              📊
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">
                  {language === 'tr' ? 'Portföy Yönetici Özeti (Executive Brief)' : 'Executive Portfolio Brief'}
                </h2>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  AI Institutional Health
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {language === 'tr' 
                  ? 'Bütünsel sermaye dağılımı, temettü projeksiyonu, risk konsantrasyonu ve aksiyon planı'
                  : 'Holistic capital allocation, dividend cashflow trajectory, risk exposure & AI action plan'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Currency Switcher */}
            <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-700/80 p-0.5 border border-gray-200 dark:border-gray-650">
              <button
                type="button"
                onClick={() => setCurrencyMode('TRY')}
                className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all ${
                  currencyMode === 'TRY'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
              >
                ₺ TRY
              </button>
              <button
                type="button"
                onClick={() => setCurrencyMode('USD')}
                className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all ${
                  currencyMode === 'USD'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
              >
                $ USD
              </button>
            </div>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopyBrief}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 border border-gray-200 dark:border-gray-700 shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all"
              title="Copy markdown report to clipboard"
            >
              <span>{isCopied ? '✓' : '📋'}</span>
              <span>{isCopied ? (language === 'tr' ? 'Kopyalandı!' : 'Copied!') : (language === 'tr' ? 'Özeti Kopyala' : 'Copy Brief')}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-750 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-300 flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-gray-800 dark:text-gray-200">
          
          {/* 1. Six Financial Vitals (KPI Grid) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-blue-950/40 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-900/50">
              <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 block">
                {language === 'tr' ? 'Toplam Portföy Değeri' : 'Total Net Worth'}
              </span>
              <p className="text-lg font-black text-gray-900 dark:text-white mt-1 font-mono">
                {formatVal(toCurr(totalNetWorthTRY))}
              </p>
              <span className="text-[10px] text-gray-500 block mt-0.5">
                {language === 'tr' ? 'Hisse + Likit Nakit' : 'Equity + Liquid Cash'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 block">
                {language === 'tr' ? 'Yatırılan Ana Para' : 'Total Deposited'}
              </span>
              <p className="text-lg font-black text-gray-900 dark:text-white mt-1 font-mono">
                {formatVal(toCurr(totalDepositedTRY))}
              </p>
              <span className="text-[10px] text-gray-500 block mt-0.5">
                {language === 'tr' ? 'Giriş Yapılan Sermaye' : 'Net Funded Capital'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 block">
                {language === 'tr' ? 'Gerçek Ömür Boyu ROI' : 'True Lifetime ROI'}
              </span>
              <p className={`text-lg font-black mt-1 font-mono ${trueLifetimeRoiTRY >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {trueLifetimeRoiTRY >= 0 ? '+' : ''}{formatVal(toCurr(trueLifetimeRoiTRY))}
              </p>
              <span className={`text-[10px] font-black block mt-0.5 ${trueLifetimeRoiTRY >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {trueLifetimeRoiPct >= 0 ? '▲ +' : '▼ '}{trueLifetimeRoiPct.toFixed(2)}%
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
              <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 block">
                {language === 'tr' ? 'Kullanılabilir Nakit' : 'Cash Available'}
              </span>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
                {formatVal(toCurr(liquidCashTRY))}
              </p>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                %{cashBufferPct.toFixed(1)} {language === 'tr' ? 'Nakit Tamponu' : 'Cash Buffer'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50">
              <span className="text-[10px] font-bold uppercase text-purple-800 dark:text-purple-300 block">
                {language === 'tr' ? 'Yıllık Temettü Akışı' : 'Annual Dividend Run'}
              </span>
              <p className="text-lg font-black text-purple-700 dark:text-purple-300 mt-1 font-mono">
                {formatVal(toCurr(annualDividendTRY))}
              </p>
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block mt-0.5">
                {formatVal(toCurr(monthlyDividendTRY))}/{language === 'tr' ? 'ay' : 'mo'} · %{blendedDividendYieldPct.toFixed(1)}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 block">
                {language === 'tr' ? 'Realize Kâr (Kasada)' : 'Banked Profit'}
              </span>
              <p className={`text-lg font-black mt-1 font-mono ${totalRealizedPnlTRY >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {totalRealizedPnlTRY >= 0 ? '+' : ''}{formatVal(toCurr(totalRealizedPnlTRY))}
              </p>
              <span className="text-[10px] text-gray-500 block mt-0.5">
                {realizedTrades.length} {language === 'tr' ? 'kapalı işlem' : 'closed trades'}
              </span>
            </div>
          </div>

          {/* 2. Asset Allocation Progress & Sector Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* Allocation Bar & Strategic Posture */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                  <span>⚖️</span>
                  <span>{language === 'tr' ? 'Varlık Dağılımı & Nakit Dengeleme' : 'Asset Allocation & Cash Cushion'}</span>
                </span>
                <span className="text-[11px] font-bold text-gray-500">
                  {portfolio.length} {language === 'tr' ? 'hisse senedi' : 'holdings'}
                </span>
              </div>

              {/* Progress Bar: Equity vs Cash */}
              <div className="space-y-1">
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex shadow-inner">
                  <div
                    style={{ width: `${Math.min(100, Math.max(0, equityWeightPct))}%` }}
                    className="bg-blue-600 h-full transition-all duration-500 flex items-center justify-center text-[9px] font-black text-white"
                  >
                    {equityWeightPct > 15 ? `${equityWeightPct.toFixed(0)}% Equities` : ''}
                  </div>
                  <div
                    style={{ width: `${Math.min(100, Math.max(0, cashBufferPct))}%` }}
                    className="bg-emerald-500 h-full transition-all duration-500 flex items-center justify-center text-[9px] font-black text-white"
                  >
                    {cashBufferPct > 15 ? `${cashBufferPct.toFixed(0)}% Cash` : ''}
                  </div>
                </div>
                <div className="flex justify-between text-[11px] text-gray-500 pt-0.5">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                    <span>{language === 'tr' ? 'Hisse Portföyü' : 'Equities'}: <strong>{formatVal(toCurr(totalStockValTRY))}</strong> (%{equityWeightPct.toFixed(1)})</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                    <span>{language === 'tr' ? 'Likit Nakit' : 'Liquid Cash'}: <strong>{formatVal(toCurr(liquidCashTRY))}</strong> (%{cashBufferPct.toFixed(1)})</span>
                  </span>
                </div>
              </div>

              {/* Strategy Split: Core Dividend vs Tactical Swings */}
              <div className="p-3 rounded-xl bg-white dark:bg-gray-750 border border-gray-200 dark:border-gray-700 flex justify-between items-center text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">{language === 'tr' ? 'Strateji Dengesi' : 'Strategy Posture'}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-bold text-purple-600 dark:text-purple-400">💎 %{coreDivPct.toFixed(0)} Core Div</span>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">⚡ %{swingPct.toFixed(0)} Swings</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 font-bold uppercase block">{language === 'tr' ? 'Temettü Maliyet Verimi (YoC)' : 'Yield on Cost (YoC)'}</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 font-mono">%{dividendYieldOnCostPct.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Sector Diversification Grid */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                  <span>🏢</span>
                  <span>{language === 'tr' ? 'Sektör Dağılımı & Risk Konsantrasyonu' : 'Sector Diversification & Risk'}</span>
                </span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  sectorRisk.isHighConcentration
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                }`}>
                  {sectorRisk.isHighConcentration ? '⚠️ Concentration Alert' : '🟢 Well Diversified'}
                </span>
              </div>

              <div className="space-y-2">
                {sectorRisk.profiles.slice(0, 5).map(sec => (
                  <div key={sec.sector} className="space-y-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sec.color }}></span>
                        <span>{sec.sector}</span>
                      </span>
                      <span className="font-mono text-gray-900 dark:text-white font-bold">
                        {formatVal(toCurr(sec.totalMarketValTRY))} (%{sec.weightPercent.toFixed(1)})
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, sec.weightPercent)}%`, backgroundColor: sec.color }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Deep Diagnostics: Winner, Laggard DCA Netting, and T0 TP Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Top Winner Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/40 dark:from-emerald-950/30 dark:via-gray-800 dark:to-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                  <span>🏆</span>
                  <span>{language === 'tr' ? 'En Çok Kazandıran (Alpha)' : 'Alpha Winner'}</span>
                </span>
                {topWinner && (
                  <button
                    type="button"
                    onClick={() => onSelectTicker?.(topWinner.symbol)}
                    className="text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    View Chart →
                  </button>
                )}
              </div>
              {topWinner ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-black text-gray-900 dark:text-white font-mono">{topWinner.symbol}</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      +{topWinner.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold mt-0.5">
                    +{formatVal(toCurr(topWinner.pnlAmount * (topWinner.currency === 'USD' ? usdTryRate : 1)))} profit
                  </p>
                  <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                    {language === 'tr'
                      ? 'Lider pozisyon kârlılıkla sürüyor. +%3-4 hedefi aşıldıysa kısmi kâr realizasyonu planlanabilir.'
                      : 'Leading the portfolio. If above the +3-4% personal TP zone, scale out partially to reload cash.'}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500 text-xs italic py-2">
                  {language === 'tr' ? 'Şu anda kârda olan pozisyon yok.' : 'No positions currently in positive territory.'}
                </p>
              )}
            </div>

            {/* Laggard & Multi-Lot DCA Netting Plan */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 dark:from-amber-950/30 dark:via-gray-800 dark:to-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                  <span>🛡️</span>
                  <span>{language === 'tr' ? 'DCA Kurtarma & Lot Mahsuplaşma' : 'DCA Netting & Recovery'}</span>
                </span>
                {biggestDrag && (
                  <button
                    type="button"
                    onClick={() => onSelectTicker?.(biggestDrag.symbol)}
                    className="text-[10px] font-bold text-blue-600 hover:underline"
                  >
                    View Chart →
                  </button>
                )}
              </div>
              {biggestDrag ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-black text-gray-900 dark:text-white font-mono">{biggestDrag.symbol}</span>
                    <span className="text-sm font-black text-rose-600 dark:text-rose-400 font-mono">
                      {biggestDrag.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-bold mt-0.5">
                    {formatVal(toCurr(biggestDrag.pnlAmount * (biggestDrag.currency === 'USD' ? usdTryRate : 1)))}
                  </p>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
                    {biggestDrag.isDividend
                      ? (language === 'tr' 
                          ? `Ana temettü hissesi. Düşük fiyattan yapılan alımlar maliyeti aşağı çekerek başabaş noktasını hızlandırıyor.`
                          : `Core dividend asset. Lower DCA tranches offset the high initial buy, accelerating breakeven convergence.`)
                      : (language === 'tr'
                          ? `Swing pozisyonu. Zarar kes seviyesi (${formatVal(biggestDrag.stopLoss, biggestDrag.currency as any)}) takip edilmelidir.`
                          : `Tactical swing. Monitor stop loss (${formatVal(biggestDrag.stopLoss, biggestDrag.currency as any)}) strictly.`)}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500 text-xs italic py-2">
                  {language === 'tr' ? 'Ekside pozisyon bulunmuyor.' : 'No lagging positions detected.'}
                </p>
              )}
            </div>

            {/* Personal TP Target T0 Alert */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50/70 via-white to-indigo-50/40 dark:from-purple-950/30 dark:via-gray-800 dark:to-indigo-950/20 border border-purple-200 dark:border-purple-800/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1">
                  <span>⚡</span>
                  <span>{language === 'tr' ? 'Kişisel Hedef (+%3-4) Fırsatları' : 'Personal TP (+3-4%) Alerts'}</span>
                </span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                  {personalTpHitHoldings.length} {language === 'tr' ? 'hazır' : 'ready'}
                </span>
              </div>
              {personalTpHitHoldings.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  {personalTpHitHoldings.map(h => (
                    <div key={h.symbol} className="p-2 rounded-xl bg-white dark:bg-gray-750 border border-purple-100 dark:border-purple-900/40 flex justify-between items-center">
                      <span className="font-black text-gray-900 dark:text-white font-mono">{h.symbol}</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        +{h.pnlPercent.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] text-gray-500 pt-1">
                    {language === 'tr'
                      ? 'Bu hisseler hedeflenen kâr aralığında. Kısmi satışla nakit havuzuna sermaye çekilebilir.'
                      : 'These holdings reached the target window. Scale out 50% to reload your cash buffer.'}
                  </p>
                </div>
              ) : (
                <p className="text-gray-500 text-xs italic py-2">
                  {language === 'tr' ? 'Şu an %3-4 kâr penceresine giren hisse yok.' : 'No holdings currently in the +3-4% TP zone.'}
                </p>
              )}
            </div>

          </div>

          {/* 4. AI Strategic Directives (Checklist) */}
          <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <h3 className="font-black text-gray-900 dark:text-white text-sm">
                {language === 'tr' ? 'Yapay Zeka Portföy Direktifleri & Eylem Planı' : 'AI Executive Directive & Tactical Action Plan'}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/40 space-y-1">
                <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                  <span>1.</span>
                  <span>{language === 'tr' ? 'Likit Nakit & Alım Gücü' : 'Cash Buffer Management'}</span>
                </span>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[11px]">
                  {language === 'tr'
                    ? `Mevcut %${cashBufferPct.toFixed(1)} likit nakit (${formatVal(toCurr(liquidCashTRY))}) sağlıklı seviyede. TCMB faiz kararları ve BIST düzeltmelerinde kademeli alım (DCA) için hazır tutulmalı.`
                    : `Current ${cashBufferPct.toFixed(1)}% cash cushion (${formatVal(toCurr(liquidCashTRY))}) provides great flexibility. Preserve as dry powder for volatility pullbacks.`}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/40 space-y-1">
                <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                  <span>2.</span>
                  <span>{language === 'tr' ? 'Kâr Realizasyonu & Hızlı Döngü' : 'Profit-Taking & Capital Recycling'}</span>
                </span>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[11px]">
                  {personalTpHitHoldings.length > 0
                    ? (language === 'tr'
                        ? `${personalTpHitHoldings.map(h => h.symbol).join(', ')} hisselerinde %3-4 kâr gerçekleşti. %50'lik dilim satılarak kâr realize edilebilir ve stop maliyete çekilebilir.`
                        : `Target reached on ${personalTpHitHoldings.map(h => h.symbol).join(', ')}. Harvest 50% profits and move stop loss to breakeven.`)
                    : (language === 'tr'
                        ? 'Salınım (Swing) işlemlerinde pozisyonlar hedeflere doğru taşınıyor. Stop seviyelerine sadık kalınmalı.'
                        : 'Swing positions are trending toward targets. Respect stop protection strictly.')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/40 space-y-1">
                <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                  <span>3.</span>
                  <span>{language === 'tr' ? 'DCA Mahsuplaşma & Maliyet Düşürme' : 'DCA Netting Strategy'}</span>
                </span>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[11px]">
                  {multiLotHoldings.length > 0
                    ? (language === 'tr'
                        ? `Çoklu alım yapılan hisselerde (örn. ${multiLotHoldings.map(m => m.item.symbol).join(', ')}), son eklenen düşük fiyatlı lotlar kâra geçtiğinde ilk pahalı lotların zararını sıfırlar.`
                        : `For multi-lot holdings (${multiLotHoldings.map(m => m.item.symbol).join(', ')}), newer profitable tranches offset earlier high buys, accelerating breakeven.`)
                    : (language === 'tr'
                        ? 'Temettü hisselerinde destek seviyelerine geri çekilmeler yeni kademe ekleme fırsatıdır.'
                        : 'On core dividend stocks, pullbacks into support offer prime tranche accumulation opportunities.')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/40 space-y-1">
                <span className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                  <span>4.</span>
                  <span>{language === 'tr' ? 'Temettü Bileşik Getiri (DRIP)' : 'Dividend Reinvestment (DRIP)'}</span>
                </span>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-[11px]">
                  {language === 'tr'
                    ? `Öngörülen yıllık ${formatVal(toCurr(annualDividendTRY))} temettü geliri, ödeme tarihlerinde doğrudan yüksek temettü verimli hisselere yeniden yatırılarak kartopu etkisi yaratılmalıdır.`
                    : `Projected annual payout of ${formatVal(toCurr(annualDividendTRY))} should be reinvested on payment dates into high-yielding assets to compound long-term wealth.`}
                </p>
              </div>
            </div>
          </div>

          {/* 5. Complete Holdings Overview Table */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-black text-gray-900 dark:text-white text-sm flex items-center gap-1.5">
                <span>📋</span>
                <span>{language === 'tr' ? 'Portföy Varlıkları Detay Tablosu' : 'Portfolio Holdings Table'}</span>
              </span>
              <span className="text-[11px] text-gray-500">
                {language === 'tr' ? 'Toplam:' : 'Total:'} <strong>{portfolio.length} {language === 'tr' ? 'pozisyon' : 'positions'}</strong>
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">Hisse / Varlık</th>
                    <th className="px-4 py-2.5">Strateji</th>
                    <th className="px-4 py-2.5 text-right">Adet (Lot)</th>
                    <th className="px-4 py-2.5 text-right">Ort. Maliyet</th>
                    <th className="px-4 py-2.5 text-right">Son Fiyat</th>
                    <th className="px-4 py-2.5 text-right">Piyasa Değeri</th>
                    <th className="px-4 py-2.5 text-right">Ağırlık</th>
                    <th className="px-4 py-2.5 text-right">Kâr / Zarar</th>
                    <th className="px-4 py-2.5 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-850">
                  {portfolio.map(item => {
                    const isProfit = item.pnlPercent >= 0;
                    const itemValTRY = item.currency === 'USD' ? item.currentValue * usdTryRate : item.currentValue;
                    const weightPct = totalStockValTRY > 0 ? (itemValTRY / totalStockValTRY) * 100 : 0;
                    const isT0 = item.pnlPercent >= 3.0;

                    return (
                      <tr key={item.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 font-black text-gray-900 dark:text-white">
                          <button
                            type="button"
                            onClick={() => onSelectTicker?.(item.symbol)}
                            className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 font-mono"
                          >
                            <span>{item.symbol}</span>
                            <span className="text-[10px] text-gray-400 font-normal">({item.market})</span>
                          </button>
                          <span className="text-[10px] text-gray-400 block font-normal truncate max-w-[140px]">{item.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.strategyType === 'CORE_DIVIDEND' || item.isDividend
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          }`}>
                            {item.strategyType === 'CORE_DIVIDEND' || item.isDividend ? '💎 Core Div' : '⚡ Swing'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold">{item.shares.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatVal(toCurr(item.entryPrice * (item.currency === 'USD' ? usdTryRate : 1)))}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">{formatVal(toCurr(item.currentPrice * (item.currency === 'USD' ? usdTryRate : 1)))}</td>
                        <td className="px-4 py-3 text-right font-mono font-black">{formatVal(toCurr(itemValTRY))}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-500">%{weightPct.toFixed(1)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-black ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isProfit ? '+' : ''}{item.pnlPercent.toFixed(2)}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            isT0
                              ? 'bg-emerald-500 text-white animate-pulse'
                              : isProfit
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : item.isDividend
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {isT0 ? '⚡ T0 TP (%3-4)' : isProfit ? '🟢 Profit' : item.isDividend ? '💎 DCA Zone' : '⚠️ Stop Watch'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-750 bg-gray-50 dark:bg-gray-800/80 flex flex-wrap justify-between items-center text-xs text-gray-500">
          <div>
            <span>Tripzy Autonomous Recommendation Engine · Real-time Supabase Architecture</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyBrief}
              className="px-3 py-1.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer transition-colors"
            >
              {isCopied ? '✓ Copied' : '📋 Copy Executive Brief'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl font-bold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-650 text-gray-800 dark:text-gray-200 cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
