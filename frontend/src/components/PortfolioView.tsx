'use client';

import React, { useState } from 'react';
import { PortfolioItem, RealizedTrade, ExecutedOrder, CapitalTransfer } from '../lib/supabaseClient';
import { calculateExitDate } from '../lib/tradeTiming';
import { calculateSectorRisk } from '../lib/sectorRisk';
import { useLanguage } from '../context/LanguageContext';

import { TradeSignal } from './TradeCard';

interface PortfolioViewProps {
  portfolio: PortfolioItem[];
  signals?: TradeSignal[];
  realizedTrades?: RealizedTrade[];
  orders?: ExecutedOrder[];
  transfers?: CapitalTransfer[];
  usdTryRate: number;
  cashBalanceTRY?: number;
  onRemoveHolding?: (symbol: string) => void;
  onAddHoldingClick?: () => void;
  onTradeHolding?: (holding: PortfolioItem) => void;
  onAddTransfer?: (transfer: CapitalTransfer) => void;
  onUpdateStopLoss?: (symbol: string, newStopPrice: number) => void;
  onOpenCoPilot?: (holding: PortfolioItem) => void;
  onToggleStrategyType?: (symbol: string) => void;
  onSelectTicker?: (symbol: string) => void;
  onUpdateTargetPrice?: (symbol: string, newTargetPrice: number) => void;
}

export default function PortfolioView({
  portfolio,
  signals = [],
  realizedTrades = [],
  orders = [],
  transfers = [],
  usdTryRate,
  cashBalanceTRY = 2952.26,
  onRemoveHolding,
  onAddHoldingClick,
  onTradeHolding,
  onAddTransfer,
  onUpdateStopLoss,
  onUpdateTargetPrice,
  onOpenCoPilot,
  onToggleStrategyType,
  onSelectTicker,
}: PortfolioViewProps) {
  const { t, language } = useLanguage();
  const [currencyMode, setCurrencyMode] = useState<'TRY' | 'USD'>('TRY');
  const [showRealized, setShowRealized] = useState(true);
  const [showTransfers, setShowTransfers] = useState(false);
  const [showSectorRisk, setShowSectorRisk] = useState(true);
  const [orderSideFilter, setOrderSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [orderAssetFilter, setOrderAssetFilter] = useState<string>('ALL');
  const [editingStopSymbol, setEditingStopSymbol] = useState<string | null>(null);
  const [editStopValue, setEditStopValue] = useState<string>('');
  const [editingTargetSymbol, setEditingTargetSymbol] = useState<string | null>(null);
  const [editTargetValue, setEditTargetValue] = useState<string>('');
  const [expandedLots, setExpandedLots] = useState<{ [symbol: string]: boolean }>({});
  const toggleLots = (sym: string) => {
    setExpandedLots(prev => ({ ...prev, [sym]: !prev[sym] }));
  };

  const getBuyLotsForHolding = (item: PortfolioItem) => {
    const cleanSym = item.symbol.replace('.IS', '').trim().toUpperCase();
    const buyOrders = orders
      .filter(o => o.side === 'BUY' && o.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym)
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    if (buyOrders.length > 0) {
      return buyOrders.map((bo, idx) => {
        const lotValue = bo.quantity * item.currentPrice;
        const lotCost = bo.quantity * bo.price;
        const lotPnl = lotValue - lotCost;
        const lotPnlPct = lotCost > 0 ? (lotPnl / lotCost) * 100 : 0;
        return {
          id: bo.id,
          ref: bo.ref,
          lotNumber: idx + 1,
          isInitial: idx === 0,
          date: bo.dateTime,
          shares: bo.quantity,
          price: bo.price,
          totalCost: lotCost,
          currentValue: lotValue,
          pnl: lotPnl,
          pnlPct: lotPnlPct,
          note: bo.dcaNote || (idx === 0 ? 'Initial Position Outlay' : `DCA Accumulation Tranche #${idx + 1}`)
        };
      });
    }

    const lotCost = item.shares * item.entryPrice;
    const lotValue = item.shares * item.currentPrice;
    const lotPnl = lotValue - lotCost;
    const lotPnlPct = lotCost > 0 ? (lotPnl / lotCost) * 100 : 0;
    return [{
      id: `lot-init-${item.symbol}`,
      ref: `#INIT-${cleanSym}`,
      lotNumber: 1,
      isInitial: true,
      date: item.entryDate 
        ? new Date(item.entryDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'Initial',
      shares: item.shares,
      price: item.entryPrice,
      totalCost: lotCost,
      currentValue: lotValue,
      pnl: lotPnl,
      pnlPct: lotPnlPct,
      note: 'Initial Position Base'
    }];
  };

  // Sector concentration and risk profile
  const sectorRisk = calculateSectorRisk(portfolio, usdTryRate);

  // Deposit modal state
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [modalTransferType, setModalTransferType] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [modalAmount, setModalAmount] = useState('');
  const [modalDate, setModalDate] = useState(new Date().toISOString().slice(0, 10));
  const [modalNotes, setModalNotes] = useState('');

  // Active portfolio calculations
  const totalCostTRY = portfolio.reduce((acc, item) => {
    return acc + (item.currency === 'USD' ? item.totalCost * usdTryRate : item.totalCost);
  }, 0);

  const totalStockValTRY = portfolio.reduce((acc, item) => {
    return acc + (item.currency === 'USD' ? item.currentValue * usdTryRate : item.currentValue);
  }, 0);

  // Capital Deposited (Principal Funded) calculations
  const recordedDepositsTRY = transfers.length > 0
    ? transfers.reduce((acc, t) => acc + (t.transferType === 'DEPOSIT' ? t.amount : -t.amount), 0)
    : 17000.00;

  // USER RULE: When adding a new holding without adding cash, assume cash was added (do NOT assume it came from profit)
  // If total cost of open positions exceeds recorded deposits, the excess was funded by new cash injection:
  const autoInjectedCapitalTRY = Math.max(0, totalCostTRY - recordedDepositsTRY);
  const totalDepositedTRY = recordedDepositsTRY + autoInjectedCapitalTRY;

  // Realized profit calculation
  const totalRealizedPnlTRY = realizedTrades.reduce((acc, trade) => {
    return acc + (trade.currency === 'USD' ? trade.realizedPnl * usdTryRate : trade.realizedPnl);
  }, 0);

  // Dynamic Cash Balance Calculation:
  // Liquid cash includes unallocated capital from deposits/exits plus realized profits from closed trades, minus brokerage fees.
  const totalBrokerageFeesTRY = 11.89; // Verified broker commission & BSMV
  const unallocatedCapitalCash = Math.max(0, totalDepositedTRY - totalCostTRY);
  const computedCashTRY = Math.max(0, unallocatedCapitalCash + totalRealizedPnlTRY - totalBrokerageFeesTRY);
  const cashValTRY = computedCashTRY;
  const totalValTRY = totalStockValTRY + cashValTRY;

  const totalPnlTRY = totalStockValTRY - totalCostTRY;
  const totalPnlPct = totalCostTRY > 0 ? (totalPnlTRY / totalCostTRY) * 100 : 0;

  // True Lifetime Return: Total Account Value vs Total Money Put In (Total Deposited)
  // Reflects real market gains on invested principal without distorting new stock additions as profit
  const trueRoiAmountTRY = totalValTRY - totalDepositedTRY;
  const trueRoiPercent = totalDepositedTRY > 0 ? (trueRoiAmountTRY / totalDepositedTRY) * 100 : 0;

  const totalValDisplay = currencyMode === 'USD' ? (totalValTRY / usdTryRate) : totalValTRY;
  const totalStockDisplay = currencyMode === 'USD' ? (totalStockValTRY / usdTryRate) : totalStockValTRY;
  const totalCostDisplay = currencyMode === 'USD' ? (totalCostTRY / usdTryRate) : totalCostTRY;
  const totalRealizedDisplay = currencyMode === 'USD' ? (totalRealizedPnlTRY / usdTryRate) : totalRealizedPnlTRY;
  const cashDisplay = currencyMode === 'USD' ? (cashValTRY / usdTryRate) : cashValTRY;
  const totalDepositedDisplay = currencyMode === 'USD' ? (totalDepositedTRY / usdTryRate) : totalDepositedTRY;
  const trueRoiDisplay = currencyMode === 'USD' ? (trueRoiAmountTRY / usdTryRate) : trueRoiAmountTRY;

  const formatCurr = (val: number, curr?: string) => {
    const c = curr || currencyMode;
    const symbol = c === 'USD' ? '$' : '₺';
    return `${symbol}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleRemove = (symbol: string) => {
    if (window.confirm(`Are you sure you want to remove ${symbol} from your portfolio?`)) {
      onRemoveHolding?.(symbol);
    }
  };

  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(modalAmount);
    if (!parsed || parsed <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    const newTrans: CapitalTransfer = {
      id: `trans-${Date.now()}`,
      transferType: modalTransferType,
      amount: parsed,
      currency: 'TRY',
      transferDate: modalDate,
      notes: modalNotes || (modalTransferType === 'DEPOSIT' ? 'Brokerage capital deposit' : 'Brokerage capital withdrawal')
    };
    onAddTransfer?.(newTrans);
    setIsDepositModalOpen(false);
    setModalAmount('');
    setModalNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Top Portfolio Summary KPI Cards (5 Pillars of Wealth) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Account Value */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>{language === 'tr' ? 'Toplam Portföy Değeri' : 'Total Account Value'}</span>
              <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
                <button
                  onClick={() => setCurrencyMode('TRY')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md ${currencyMode === 'TRY' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
                >
                  TRY
                </button>
                <button
                  onClick={() => setCurrencyMode('USD')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md ${currencyMode === 'USD' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
                >
                  USD
                </button>
              </div>
            </div>
            <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
              {formatCurr(totalValDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750">
            {language === 'tr' ? 'Hisseler:' : 'Equity:'} <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurr(totalStockDisplay)}</span> • {language === 'tr' ? 'Nakit:' : 'Cash:'} {formatCurr(cashDisplay)}
          </div>
        </div>

        {/* Card 2: Net Capital Deposited (Principal Put In) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>{language === 'tr' ? 'Yatırılan Ana Para' : 'Total Deposited'}</span>
              <button
                onClick={() => setIsDepositModalOpen(true)}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                title={language === 'tr' ? "Sermaye girişi veya çekimi kaydet" : "Record new capital deposit or withdrawal"}
              >
                <span>{language === 'tr' ? '+ Para Yatır' : '+ Deposit'}</span>
              </button>
            </div>
            <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
              {formatCurr(totalDepositedDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750 flex justify-between items-center">
            <span>
              {autoInjectedCapitalTRY > 0 
                ? (language === 'tr' ? `Aktarılan (+${formatCurr(currencyMode === 'USD' ? autoInjectedCapitalTRY / usdTryRate : autoInjectedCapitalTRY)})` : `Injected (+${formatCurr(currencyMode === 'USD' ? autoInjectedCapitalTRY / usdTryRate : autoInjectedCapitalTRY)} funded)`)
                : (language === 'tr' ? 'Net Sermaye Girişi' : 'Capital Injected')}
            </span>
            <button
              onClick={() => setShowTransfers(!showTransfers)}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showTransfers ? (language === 'tr' ? 'Girişleri Gizle' : 'Hide Inflows') : (language === 'tr' ? 'Girişleri Gör' : 'View Inflows')}
            </button>
          </div>
        </div>

        {/* Card 3: True Lifetime Return (All-Time ROI vs Money Put In) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>{language === 'tr' ? 'Toplam Net Getiri' : 'All-Time Net ROI'}</span>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                trueRoiAmountTRY >= 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400'
              }`}>
                {trueRoiPercent >= 0 ? '▲ +' : '▼ '}{trueRoiPercent.toFixed(2)}%
              </span>
            </div>
            <div className={`mt-2 text-2xl font-black ${trueRoiAmountTRY >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {trueRoiAmountTRY >= 0 ? '+' : ''}{formatCurr(trueRoiDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750">
            {language === 'tr' ? 'Yatırılan ana para: ' : 'vs '}<span>{formatCurr(totalDepositedDisplay)}</span>
          </div>
        </div>

        {/* Card 4: Dry Powder / Cash Balance */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>{language === 'tr' ? 'Nakit Bakiye (Boşta)' : 'Cash Balance'}</span>
              <span className="text-[10px] bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 font-bold px-1.5 py-0.5 rounded">
                {language === 'tr' ? 'Boşta' : 'Dry Powder'}
              </span>
            </div>
            <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400">
              {formatCurr(cashDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750">
            {totalValTRY > 0 ? ((cashValTRY / totalValTRY) * 100).toFixed(1) : 0}% {language === 'tr' ? 'likit alıma hazır sermaye' : 'liquid capital ready for DCA'}
          </div>
        </div>

        {/* Card 5: Realized Profit / Losses */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>{language === 'tr' ? 'Kapatılan Kârlar' : 'Realized Gains'}</span>
              <button
                onClick={() => setShowRealized(!showRealized)}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-bold"
              >
                {showRealized ? (language === 'tr' ? 'Gizle' : 'Hide Log') : (language === 'tr' ? 'Geçmişi Gör' : 'View History')}
              </button>
            </div>
            <div className={`mt-2 text-2xl font-black ${totalRealizedPnlTRY > 0 ? 'text-emerald-500' : totalRealizedPnlTRY < 0 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}`}>
              {totalRealizedPnlTRY > 0 ? '+' : ''}{formatCurr(totalRealizedDisplay)}
            </div>
          </div>
          <div className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750">
            {realizedTrades.length > 0 
              ? (language === 'tr' ? `${realizedTrades.length} İşlem Kapatıldı` : `${realizedTrades.length} Trade Locked In`) 
              : (language === 'tr' ? 'Henüz Kapatılan İşlem Yok' : 'No Closed Trades Yet')}
          </div>
        </div>
      </div>

      {/* Sector Concentration & Risk Matrix */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>📊</span>
                <span>Sector Risk & Concentration Matrix</span>
              </h3>
              {sectorRisk.isHighConcentration ? (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-800 animate-pulse">
                  ⚠️ High Sector Concentration
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                  ✅ Balanced Exposure
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Risk control threshold: single sector exposure exceeding 35% of total invested capital.
            </p>
          </div>
          <button
            onClick={() => setShowSectorRisk(!showSectorRisk)}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showSectorRisk ? 'Collapse Matrix' : 'Expand Matrix'}
          </button>
        </div>

        {showSectorRisk && (
          <div className="space-y-4 pt-1">
            {sectorRisk.isHighConcentration && sectorRisk.highestSector && (
              <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs flex items-start gap-2.5">
                <span className="text-base">⚠️</span>
                <div className="text-amber-900 dark:text-amber-200 leading-relaxed">
                  <span className="font-bold">Portfolio Concentration Alert: </span>
                  Your holdings in <span className="font-black text-amber-950 dark:text-white underline">{sectorRisk.highestSector.sector}</span> represent <span className="font-black text-rose-600 dark:text-rose-400">{sectorRisk.highestSector.weightPercent.toFixed(1)}%</span> of total portfolio equity ({sectorRisk.highestSector.symbols.join(', ')}). A systemic rate or policy shock causes synchronized portfolio drawdown. Consider reallocating cash toward non-correlated sectors (e.g., BIMAS, THYAO, ASELS, TUPRS).
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sectorRisk.profiles.map((sec, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200/70 dark:border-gray-700 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white text-xs block">
                         {sec.sector}
                       </span>
                       <div className="text-[10px] text-gray-400 flex flex-wrap gap-1 mt-0.5">
                         {sec.symbols.map((sym, sIdx) => (
                           <button
                             key={sIdx}
                             onClick={() => onSelectTicker?.(sym)}
                             className="hover:text-blue-500 hover:underline cursor-pointer transition-colors"
                             title={`Click to view ${sym} chart & indicators`}
                           >
                             {sym}{sIdx < sec.symbols.length - 1 ? ' ·' : ''}
                           </button>
                         ))}
                       </div>
                    </div>
                    <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
                      sec.isOverweight
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 font-black'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-bold'
                    }`}>
                      {sec.weightPercent.toFixed(1)}%
                    </span>
                  </div>

                  <div className="space-y-1 mt-1">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, sec.weightPercent)}%`,
                          backgroundColor: sec.color
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>Allocation Basis:</span>
                      <span className="font-mono font-semibold">{formatCurr(currencyMode === 'USD' ? sec.totalMarketValTRY / usdTryRate : sec.totalMarketValTRY)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Holdings & DCA Accumulation Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 flex flex-row justify-between items-center gap-2">
          <div>
            <h3 className="text-sm sm:text-lg font-bold text-gray-900 dark:text-white">
              {t.portfolio.title}
            </h3>
            <p className="text-[11px] sm:text-xs text-gray-500 hidden sm:block">
              {t.portfolio.subtitle}
            </p>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 hidden md:inline-block">
              🟢 {language === 'tr' ? 'Çoklu Dilim Takibi Aktif' : 'Multi-Lot Tracking Active'}
            </span>
            {onAddHoldingClick && (
              <button
                onClick={onAddHoldingClick}
                className="px-3.5 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-xl transition-all shadow-md shadow-blue-500/30 flex items-center space-x-1 cursor-pointer shrink-0"
              >
                <span>➕</span>
                <span>{language === 'tr' ? '+ Pozisyon Ekle' : '+ Add Holding'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3">{t.portfolio.holdingsTable.symbol}</th>
                <th className="px-4 py-3 text-center">{language === 'tr' ? 'Alış Tarihi' : 'Date Bought'}</th>
                <th className="px-5 py-3 text-right">{t.portfolio.holdingsTable.shares}</th>
                <th className="px-5 py-3 text-right">{t.portfolio.holdingsTable.entryPrice}</th>
                <th className="px-5 py-3 text-right">{t.portfolio.holdingsTable.currentPrice}</th>
                <th className="px-5 py-3 text-right">{t.portfolio.holdingsTable.currentValue}</th>
                <th className="px-5 py-3 text-right">{t.portfolio.holdingsTable.pnl}</th>
                <th className="px-5 py-3 text-center">{language === 'tr' ? 'Zarar Kes / Mod' : 'Stop Loss / Mode'}</th>
                <th className="px-5 py-3 text-center">{language === 'tr' ? 'Hedef / Çıkış' : 'Target / Exit Price'}</th>
                <th className="px-5 py-3 text-center">{language === 'tr' ? 'Tahmini Çıkış / Vade' : 'Est. Exit / Horizon'}</th>
                <th className="px-5 py-3 text-center">{t.portfolio.holdingsTable.statusDca}</th>
                <th className="px-4 py-3 text-center">{t.portfolio.holdingsTable.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {portfolio.map((item, idx) => {
                const isProfit = item.pnlPercent >= 0;
                const formattedBoughtDate = item.entryDate 
                  ? new Date(item.entryDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '24.09.2026';
                const daysHeld = item.entryDate
                  ? Math.max(1, Math.round((Date.now() - new Date(item.entryDate).getTime()) / (1000 * 60 * 60 * 24)))
                  : null;

                return (
                  <React.Fragment key={item.symbol || idx}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onSelectTicker?.(item.symbol)}
                            className="font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer text-left transition-colors group"
                            title={`Click to view ${item.symbol} chart & indicators`}
                          >
                            <span className="group-hover:underline">{item.symbol}</span>
                            <span className="text-[10px] text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                          </button>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {item.market}
                          </span>
                          {item.isDividend && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                              DIV
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center space-x-1.5 mt-0.5 flex-wrap gap-1">
                          <span>{item.name}</span>
                          <span className="md:hidden text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1 py-0.2 rounded">
                            🗓️ {formattedBoughtDate}
                          </span>
                          {(() => {
                            const cleanSym = item.symbol.replace('.IS', '').trim().toUpperCase();
                            const matchedSig = signals?.find(s => s.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym);
                            const defaultStop = item.stopLoss > 0 ? item.stopLoss : Number((item.entryPrice * 0.95).toFixed(2));
                            const calcT2 = Number((item.entryPrice + 2 * Math.abs(item.entryPrice - defaultStop)).toFixed(2));
                            const effT2 = item.targetPrice && item.targetPrice > 0 ? item.targetPrice : calcT2;
                            const effT1 = matchedSig && matchedSig.targetPrice > 0 ? matchedSig.targetPrice : null;
                            const t1Shares = Math.max(1, Math.ceil(item.shares * 0.5));
                            const t2Shares = Math.max(0, item.shares - t1Shares);

                            return (
                              <div className="lg:hidden text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 flex-wrap">
                                <span>🎯 T1: Sell {t1Shares} shs {effT1 ? `(${formatCurr(effT1, item.currency)})` : ''}</span>
                                <span>·</span>
                                <span>T2: Sell {t2Shares > 0 ? t2Shares : item.shares} shs ({formatCurr(effT2, item.currency)})</span>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {(() => {
                            const lots = getBuyLotsForHolding(item);
                            const isExpanded = !!expandedLots[item.symbol];
                            return (
                              <button
                                type="button"
                                onClick={() => toggleLots(item.symbol)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border transition-all cursor-pointer shadow-xs ${
                                  isExpanded
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border-blue-200 dark:border-blue-800'
                                }`}
                                title="Click to view all purchase lots, execution dates, and fill prices"
                              >
                                <span>📦</span>
                                <span>{isExpanded ? 'Hide Lots' : `${lots.length} Buy Lot${lots.length > 1 ? 's' : ''}`}</span>
                                <svg className={`w-2.5 h-2.5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            );
                          })()}
                        </div>
                      <div className="flex items-center gap-1.5 mt-2 lg:hidden">
                        <button
                          type="button"
                          onClick={() => onTradeHolding?.(item)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          <span>⚡ Trade / Buy</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenCoPilot?.(item)}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1 cursor-pointer"
                        >
                          <span>💡 Co-Pilot</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-xs shadow-sm">
                        <span>🗓️</span>
                        <span>{formattedBoughtDate}</span>
                      </span>
                      {daysHeld && (
                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                          {daysHeld}d held
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-gray-900 dark:text-white">
                      {item.shares.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right text-gray-600 dark:text-gray-400">
                      {formatCurr(item.entryPrice, item.currency)}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-gray-900 dark:text-white">
                      {formatCurr(item.currentPrice, item.currency)}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-900 dark:text-white">
                      {formatCurr(item.currentValue, item.currency)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className={`font-bold ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isProfit ? '+' : ''}{formatCurr(item.pnlAmount, item.currency)}
                      </div>
                      <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded mt-0.5 ${
                        isProfit ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                      }`}>
                        {isProfit ? '▲ +' : '▼ '}{item.pnlPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {editingStopSymbol === item.symbol ? (
                        <div className="inline-flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-lg border border-blue-400 dark:border-blue-600 shadow-md">
                          <span className="text-[10px] text-gray-500 font-bold">{item.currency === 'USD' ? '$' : '₺'}</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editStopValue}
                            onChange={(e) => setEditStopValue(e.target.value)}
                            className="w-16 px-1 py-0.5 text-xs text-center border rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = parseFloat(editStopValue);
                                if (!isNaN(val) && val >= 0) {
                                  onUpdateStopLoss?.(item.symbol, val);
                                }
                                setEditingStopSymbol(null);
                              } else if (e.key === 'Escape') {
                                setEditingStopSymbol(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = parseFloat(editStopValue);
                              if (!isNaN(val) && val >= 0) {
                                onUpdateStopLoss?.(item.symbol, val);
                              }
                              setEditingStopSymbol(null);
                            }}
                            className="px-1.5 py-0.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded cursor-pointer"
                            title="Save Stop Loss"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingStopSymbol(null)}
                            className="px-1.5 py-0.5 text-xs font-black text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded cursor-pointer"
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : item.isDividend ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 flex items-center gap-1 shadow-sm">
                            <span>💎</span>
                            <span>DCA Mode</span>
                          </span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                            Accumulate on Dips
                          </span>
                          {item.currentPrice > item.entryPrice && (
                            <button
                              type="button"
                              onClick={() => onUpdateStopLoss?.(item.symbol, item.entryPrice)}
                              className="mt-1 px-2 py-0.5 rounded text-[10px] font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 transition-colors shadow-sm block mx-auto cursor-pointer"
                              title="Set stop loss to entry price to eliminate risk (Free Trade)"
                            >
                              🛡️ Breakeven
                            </button>
                          )}
                        </div>
                      ) : item.stopLoss >= item.entryPrice ? (
                        <div className="inline-flex flex-col items-center">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <span>🛡️</span>
                              <span>{formatCurr(item.stopLoss, item.currency)}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStopSymbol(item.symbol);
                                setEditStopValue(item.stopLoss.toString());
                              }}
                              className="text-gray-400 hover:text-blue-500 text-[10px] p-0.5 cursor-pointer"
                              title="Edit stop loss price manually"
                            >
                              ✏️
                            </button>
                          </div>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 mt-0.5 shadow-sm">
                            FREE TRADE
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateStopLoss?.(item.symbol, Number((item.entryPrice * 0.95).toFixed(2)))}
                            className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700 shadow-xs cursor-pointer flex items-center gap-0.5"
                            title="Revert stop loss back to original technical level (5% below entry)"
                          >
                            <span>↺ Revert Stop ({formatCurr(item.entryPrice * 0.95, item.currency)})</span>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              {item.stopLoss > 0 ? formatCurr(item.stopLoss, item.currency) : 'Trailing'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStopSymbol(item.symbol);
                                setEditStopValue(item.stopLoss > 0 ? item.stopLoss.toString() : (item.entryPrice * 0.95).toFixed(2));
                              }}
                              className="text-gray-400 hover:text-blue-500 text-[10px] p-0.5 cursor-pointer"
                              title="Edit stop loss price manually"
                            >
                              ✏️
                            </button>
                          </div>
                          {item.currentPrice > item.entryPrice ? (
                            <button
                              type="button"
                              onClick={() => onUpdateStopLoss?.(item.symbol, item.entryPrice)}
                              className="mt-1 px-2 py-0.5 rounded text-[10px] font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 transition-colors shadow-sm block mx-auto cursor-pointer"
                              title="Set stop loss to entry price to eliminate risk (Free Trade)"
                            >
                              🛡️ Breakeven
                            </button>
                          ) : item.distanceToStop < 3 && item.stopLoss > 0 ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white animate-pulse block mt-0.5">
                              ⚠️ AT STOP RISK
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-500 block mt-0.5">
                              {item.distanceToStop > 0 ? `+${item.distanceToStop.toFixed(1)}% buffer` : 'Safe'}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      {editingTargetSymbol === item.symbol ? (
                        <div className="inline-flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-lg border border-blue-400 dark:border-blue-600 shadow-md">
                          <span className="text-[10px] text-gray-500 font-bold">{item.currency === 'USD' ? '$' : '₺'}</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editTargetValue}
                            onChange={(e) => setEditTargetValue(e.target.value)}
                            className="w-16 px-1 py-0.5 text-xs text-center border rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = parseFloat(editTargetValue);
                                if (!isNaN(val) && val >= 0) {
                                  onUpdateTargetPrice?.(item.symbol, val);
                                }
                                setEditingTargetSymbol(null);
                              } else if (e.key === 'Escape') {
                                setEditingTargetSymbol(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = parseFloat(editTargetValue);
                              if (!isNaN(val) && val >= 0) {
                                onUpdateTargetPrice?.(item.symbol, val);
                              }
                              setEditingTargetSymbol(null);
                            }}
                            className="px-1.5 py-0.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded cursor-pointer"
                            title="Save Target Exit Price"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTargetSymbol(null)}
                            className="px-1.5 py-0.5 text-xs font-black text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded cursor-pointer"
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : item.isDividend ? (
                        <div className="inline-flex flex-col items-center">
                          {item.targetPrice && item.targetPrice > 0 ? (
                            <>
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-purple-700 dark:text-purple-300 font-mono">
                                  🎯 {formatCurr(item.targetPrice, item.currency)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTargetSymbol(item.symbol);
                                    setEditTargetValue(item.targetPrice!.toString());
                                  }}
                                  className="text-gray-400 hover:text-blue-500 text-[10px] p-0.5 cursor-pointer"
                                  title="Edit target exit price"
                                >
                                  ✏️
                                </button>
                              </div>
                              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
                                +{(((item.targetPrice - item.entryPrice) / item.entryPrice) * 100).toFixed(1)}% target
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 flex items-center gap-1 shadow-xs">
                                <span>💎</span>
                                <span>Yield / Core</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTargetSymbol(item.symbol);
                                  setEditTargetValue(item.entryPrice > 0 ? (item.entryPrice * 1.25).toFixed(2) : '');
                                }}
                                className="text-[10px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:underline mt-0.5 cursor-pointer"
                                title="Set an optional take-profit target for this compounder"
                              >
                                + Set Exit Target
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        (() => {
                          const cleanSym = item.symbol.replace('.IS', '').trim().toUpperCase();
                          const matchedSig = signals?.find(s => s.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym);

                          const effTarget = item.targetPrice && item.targetPrice > 0
                            ? item.targetPrice
                            : (item.stopLoss > 0 && item.entryPrice > item.stopLoss
                                ? Number((item.entryPrice + 2 * (item.entryPrice - item.stopLoss)).toFixed(2))
                                : Number((item.entryPrice * 1.10).toFixed(2)));
                          const upsidePct = item.entryPrice > 0 ? ((effTarget - item.entryPrice) / item.entryPrice) * 100 : 0;
                          const distFromCurr = item.currentPrice > 0 ? ((effTarget - item.currentPrice) / item.currentPrice) * 100 : 0;
                          const hasT1 = Boolean(matchedSig && matchedSig.targetPrice > 0 && Math.abs(matchedSig.targetPrice - effTarget) > 0.05);
                          const isT1Hit = Boolean(hasT1 && item.currentPrice >= matchedSig!.targetPrice);

                          return (
                            <div className="inline-flex flex-col items-center">
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                                  <span>🎯 {hasT1 ? 'T2:' : ''}</span>
                                  <span>{formatCurr(effTarget, item.currency)}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTargetSymbol(item.symbol);
                                    setEditTargetValue(effTarget.toString());
                                  }}
                                  className="text-gray-400 hover:text-blue-500 text-[10px] p-0.5 cursor-pointer"
                                  title="Edit target exit price"
                                >
                                  ✏️
                                </button>
                              </div>

                              {hasT1 && (
                                <div className="text-[10px] flex items-center gap-1 mt-0.5">
                                  <span className="text-gray-500 dark:text-gray-400 font-medium">T1: {formatCurr(matchedSig!.targetPrice, item.currency)}</span>
                                  {isT1Hit ? (
                                    <span className="px-1 py-0.2 rounded text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                      ✓ Hit
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 text-[9px]">
                                      ({((matchedSig!.targetPrice - item.currentPrice) / item.currentPrice * 100).toFixed(1)}%)
                                    </span>
                                  )}
                                </div>
                              )}

                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800 mt-0.5 shadow-xs">
                                +{upsidePct.toFixed(1)}% {hasT1 ? 'T2 runner' : 'target'} {distFromCurr > 0 ? `(${distFromCurr >= 0 ? '+' : ''}${distFromCurr.toFixed(1)}% left)` : '🎯 Target Hit!'}
                              </span>

                              {/* Scale-Out Exit Shares Specification */}
                              {(() => {
                                const t1Shares = Math.max(1, Math.ceil(item.shares * 0.5));
                                const t2Shares = Math.max(0, item.shares - t1Shares);

                                return (
                                  <div className="mt-1 text-[10px] bg-gray-50 dark:bg-gray-900/60 px-2 py-1 rounded-md border border-gray-200 dark:border-gray-700/60 text-center w-full">
                                    <div className="text-[9px] font-semibold text-gray-500 dark:text-gray-400">Scale-Out ({item.shares} shs):</div>
                                    <div className="flex items-center justify-center gap-1.5 font-mono mt-0.5">
                                      <span className={isT1Hit ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-gray-700 dark:text-gray-300"}>
                                        T1: <strong>{t1Shares}</strong> shs {isT1Hit && '✓'}
                                      </span>
                                      <span className="text-gray-400">|</span>
                                      <span className="text-purple-600 dark:text-purple-400 font-medium">
                                        T2: <strong>{t2Shares > 0 ? t2Shares : item.shares}</strong> shs
                                      </span>
                                    </div>
                                    {isT1Hit && (
                                      <button
                                        type="button"
                                        onClick={() => onTradeHolding?.(item)}
                                        className="mt-1 w-full px-1.5 py-0.5 rounded text-[9px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-700 transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1"
                                        title={`Target 1 reached! Take profit on ${t1Shares} shares`}
                                      >
                                        <span>⚡ Sell T1 ({t1Shares} shs)</span>
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}

                              {isT1Hit && (
                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  🛡️ Trail Stop to Breakeven
                                </span>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      {(() => {
                        const timing = calculateExitDate(item.entryDate, item.strategyType || 'SWING', item.isDividend);
                        return timing.isDividend ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800 shadow-xs">
                              💎 Core Compounder
                            </span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                              Indefinite · Yield Focus
                            </span>
                            <button
                              type="button"
                              onClick={() => onToggleStrategyType?.(item.symbol)}
                              className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/70 dark:hover:bg-blue-900/70 border border-blue-200 dark:border-blue-800 transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                              title="Switch position to normal swing trade mode (with stop loss & target exit date)"
                            >
                              <span>⚡</span>
                              <span>Make Swing Trade</span>
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-xs font-mono font-bold text-gray-900 dark:text-white">
                              {timing.maxExitDateFormatted}
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full mt-0.5 ${
                              timing.statusColor === 'green'
                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                : timing.statusColor === 'amber'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse'
                            }`}>
                              ⏳ {timing.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => onToggleStrategyType?.(item.symbol)}
                              className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-gray-400 hover:text-purple-600 dark:text-gray-500 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors cursor-pointer flex items-center gap-0.5"
                              title="Promote to Core Dividend Compounder (DCA accumulation mode)"
                            >
                              <span>💎</span>
                              <span>Make Compounder</span>
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {item.dcaZone === 'BUY' ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-500 text-white shadow-sm shadow-emerald-500/30">
                            🎯 PRIME BUY ZONE
                          </span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">{item.dcaRationale}</span>
                        </div>
                      ) : item.dcaZone === 'PAUSE' ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-500 text-white">
                            ⚠️ OVERBOUGHT (Pause)
                          </span>
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">{item.dcaRationale}</span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          HOLD / ACCUMULATE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <div className="inline-flex items-center space-x-1.5">
                        <button
                          onClick={() => onOpenCoPilot?.(item)}
                          className="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-600 dark:text-purple-300 transition-colors border border-purple-200 dark:border-purple-800 flex items-center space-x-1 cursor-pointer"
                          title="Open AI Trade Co-Pilot Analysis & Blueprint"
                        >
                          <span>💡 Co-Pilot</span>
                        </button>
                        <button
                          onClick={() => onTradeHolding?.(item)}
                          className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 transition-colors border border-blue-200 dark:border-blue-800 flex items-center space-x-1"
                          title="Buy more lots or sell shares"
                        >
                          <span>⚡ Trade</span>
                        </button>
                        <button
                          onClick={() => handleRemove(item.symbol)}
                          className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                          title={`Remove ${item.symbol} from portfolio`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedLots[item.symbol] && (
                    <tr key={`${item.symbol}-lots`} className="bg-blue-50/25 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/40">
                      <td colSpan={12} className="px-3 py-3 sm:px-5">
                        <div className="bg-white dark:bg-gray-850 rounded-xl p-3 sm:p-4 border border-blue-200 dark:border-blue-800/70 shadow-xs space-y-3">
                          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-100 dark:border-gray-750 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                                <span>📦</span>
                                <span>Purchase Tranches & Buy Lots Breakdown: <span className="text-blue-600 dark:text-blue-400 font-mono">{item.symbol}</span></span>
                              </span>
                              <span className="text-[11px] text-gray-500">
                                Total: <strong className="text-gray-900 dark:text-white">{item.shares.toLocaleString()} shares</strong> @ avg <strong className="text-gray-900 dark:text-white">{formatCurr(item.entryPrice, item.currency)}</strong>
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onTradeHolding?.(item)}
                              className="text-[11px] font-black text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>+ Buy More / Scale In</span>
                            </button>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-750">
                                <tr>
                                  <th className="py-1.5 px-2">Tranche / Lot</th>
                                  <th className="py-1.5 px-2">Execution Date</th>
                                  <th className="py-1.5 px-2 text-right">Shares</th>
                                  <th className="py-1.5 px-2 text-right">Fill Price</th>
                                  <th className="py-1.5 px-2 text-right">Cost Outlay</th>
                                  <th className="py-1.5 px-2 text-right">Current Value</th>
                                  <th className="py-1.5 px-2 text-right">Tranche P&L</th>
                                  <th className="py-1.5 px-2">DCA Note / Purpose</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {getBuyLotsForHolding(item).map((lot) => {
                                  const isLotProfit = lot.pnl >= 0;
                                  return (
                                    <tr key={lot.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/20 transition-colors">
                                      <td className="py-2 px-2 whitespace-nowrap">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black ${
                                          lot.isInitial
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                                            : 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300'
                                        }`}>
                                          <span>{lot.isInitial ? '🟢' : '🎯'}</span>
                                          <span>Lot #{lot.lotNumber} {lot.isInitial ? '(Initial)' : '(DCA Tranche)'}</span>
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 whitespace-nowrap font-mono text-gray-600 dark:text-gray-300 text-[11px]">
                                        {lot.date}
                                      </td>
                                      <td className="py-2 px-2 text-right font-bold text-gray-900 dark:text-white">
                                        +{lot.shares.toLocaleString()}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono font-semibold text-gray-800 dark:text-gray-200">
                                        {formatCurr(lot.price, item.currency)}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono text-gray-600 dark:text-gray-400">
                                        {formatCurr(lot.totalCost, item.currency)}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono font-bold text-gray-900 dark:text-white">
                                        {formatCurr(lot.currentValue, item.currency)}
                                      </td>
                                      <td className="py-2 px-2 text-right whitespace-nowrap">
                                        <span className={`font-mono font-bold ${isLotProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                          {isLotProfit ? '+' : ''}{formatCurr(lot.pnl, item.currency)}
                                        </span>
                                        <span className={`ml-1 text-[10px] font-bold px-1 py-0.2 rounded ${
                                          isLotProfit ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                        }`}>
                                          {isLotProfit ? '+' : ''}{lot.pnlPct.toFixed(2)}%
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 text-gray-500 dark:text-gray-400 text-[11px] truncate max-w-xs">
                                        {lot.note}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {portfolio.length === 0 && (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  <p className="text-base font-semibold">No active holdings in portfolio.</p>
                  <p className="text-xs mt-1">Use the "+ Add Position" button above to add positions.</p>
                </td>
              </tr>
            )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Realized Trades & Closed Positions History (Collapsible / Toggleable) */}
      {(showRealized || realizedTrades.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in duration-200">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-850">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                <span>🏆</span>
                <span>Realized Gains & Closed Tranches Log</span>
              </h3>
              <p className="text-xs text-gray-500">Every executed sale locks in realized profit and is recorded here for lifetime performance tracking.</p>
            </div>
            <div className="text-right">
              <span className={`text-sm font-black ${totalRealizedPnlTRY > 0 ? 'text-emerald-500' : totalRealizedPnlTRY < 0 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}`}>
                {totalRealizedPnlTRY > 0 ? '+' : ''}{formatCurr(totalRealizedDisplay)} Total Realized
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-5 py-3">Asset</th>
                  <th className="px-5 py-3 text-right">Shares Sold</th>
                  <th className="px-5 py-3 text-right">Cost Basis</th>
                  <th className="px-5 py-3 text-right">Execution Sell Price</th>
                  <th className="px-5 py-3 text-right">Realized P&L</th>
                  <th className="px-5 py-3 text-right">Return %</th>
                  <th className="px-5 py-3 text-center">Date Sold / Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {realizedTrades.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-gray-500 dark:text-gray-400">
                      <p className="font-semibold text-sm">No executed sales or closed tranches yet.</p>
                      <p className="text-xs mt-1">When you sell or trim shares via the ⚡ Trade button, your executed sales and realized P&L will be tracked here.</p>
                    </td>
                  </tr>
                ) : (
                  realizedTrades.map((trade) => {
                  const isProfit = trade.realizedPnl >= 0;
                  return (
                    <tr key={trade.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onSelectTicker?.(trade.symbol)}
                            className="font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer text-left transition-colors group"
                            title={`Click to view ${trade.symbol} chart & indicators`}
                          >
                            <span className="group-hover:underline">{trade.symbol}</span>
                            <span className="text-[10px] text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                          </button>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {trade.market}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">{trade.name}</div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-gray-900 dark:text-white">
                        {trade.sharesSold.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-600 dark:text-gray-400">
                        {formatCurr(trade.entryPrice, trade.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-gray-900 dark:text-white">
                        {formatCurr(trade.exitPrice, trade.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-black">
                        <span className={isProfit ? 'text-emerald-500' : 'text-rose-500'}>
                          {isProfit ? '+' : ''}{formatCurr(trade.realizedPnl, trade.currency)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded ${
                          isProfit ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                        }`}>
                          {isProfit ? '▲ +' : '▼ '}{trade.realizedPnlPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold text-xs border border-emerald-200 dark:border-emerald-800/50 shadow-sm">
                          <span>🗓️</span>
                          <span>{trade.closeDate}</span>
                        </span>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Executed Orders & Broker Trade History */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50 dark:bg-gray-850">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <span>📜</span>
              <span>Executed Orders & DCA Accumulation Log</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400">
                {orders.length} Executed
              </span>
            </h3>
            <p className="text-xs text-gray-500">Live synchronization with your brokerage executed orders, showing fills, timestamps, ref IDs, and DCA tranches.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Side filter */}
            <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 text-xs">
              {(['ALL', 'BUY', 'SELL'] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => setOrderSideFilter(side)}
                  className={`px-2.5 py-1 font-bold rounded-md transition-all ${
                    orderSideFilter === side
                      ? side === 'BUY'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : side === 'SELL'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                  }`}
                >
                  {side === 'ALL' ? 'All Sides' : side === 'BUY' ? 'Buys' : 'Sells'}
                </button>
              ))}
            </div>

            {/* Asset filter */}
            <div className="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 text-xs">
              {['ALL', 'ISMEN', 'TURSG', 'AKBNK'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setOrderAssetFilter(sym)}
                  className={`px-2 py-1 font-semibold rounded-md transition-all ${
                    orderAssetFilter === sym
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm font-bold'
                      : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3 text-center">Side / Order</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Quantity</th>
                <th className="px-5 py-3 text-right">Realzd. Price</th>
                <th className="px-5 py-3 text-right">Total Amount</th>
                <th className="px-5 py-3">DCA Note / Purpose</th>
                <th className="px-5 py-3 text-right">Date & Time</th>
                <th className="px-5 py-3 text-right">Ref ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {orders
                .filter(ord => {
                  const matchesSide = orderSideFilter === 'ALL' || ord.side === orderSideFilter;
                  const matchesAsset = orderAssetFilter === 'ALL' || ord.symbol === orderAssetFilter;
                  return matchesSide && matchesAsset;
                })
                .map((ord) => {
                  const isBuy = ord.side === 'BUY';
                  return (
                    <tr key={ord.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => onSelectTicker?.(ord.symbol)}
                            className="font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer text-left transition-colors group"
                            title={`Click to view ${ord.symbol} chart & indicators`}
                          >
                            <span className="group-hover:underline">{ord.symbol}</span>
                            <span className="text-[10px] text-blue-500 opacity-60 group-hover:opacity-100">📈</span>
                          </button>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {ord.market}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">{ord.name}</div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-black ${
                          isBuy 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800' 
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-400 border border-purple-300 dark:border-purple-800'
                        }`}>
                          {isBuy ? 'BUY' : 'SELL'} {ord.orderType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                          ✓ {ord.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-medium text-gray-900 dark:text-white">
                        {ord.quantity.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-bold text-gray-900 dark:text-white">
                        ₺{ord.price.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right font-bold text-gray-900 dark:text-white">
                        ₺{ord.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-300">
                        {ord.dcaNote || '-'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right">
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-900/50 font-bold text-xs font-mono shadow-sm">
                          <span>🗓️</span>
                          <span>{ord.dateTime}</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-xs font-mono text-gray-400">
                        {ord.ref}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Capital Transfers & Funding Inflows History */}
      {showTransfers && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in duration-200">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-850">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                <span>💸</span>
                <span>Capital Deposits & Transfers History</span>
              </h3>
              <p className="text-xs text-gray-500">Every bank transfer into or out of your brokerage account to track true lifetime ROI.</p>
            </div>
            <button
              onClick={() => setIsDepositModalOpen(true)}
              className="px-3 py-1.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/20"
            >
              + Record Transfer
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-5 py-3">Transfer Type</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Notes / Purpose</th>
                  <th className="px-5 py-3 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-gray-500">
                      No transfers recorded yet.
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                          t.transferType === 'DEPOSIT'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400'
                        }`}>
                          {t.transferType === 'DEPOSIT' ? '↓ DEPOSIT (Cash In)' : '↑ WITHDRAWAL (Cash Out)'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-gray-900 dark:text-white">
                        {t.transferType === 'DEPOSIT' ? '+' : '-'}₺{t.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-gray-300">
                        {t.notes || 'Brokerage funding'}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-xs border border-gray-200 dark:border-gray-600 shadow-sm font-mono">
                          <span>🗓️</span>
                          <span>{t.transferDate}</span>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Deposit Modal */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 shadow-2xl relative">
            <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>💸</span>
                <span>Record Capital Transfer</span>
              </h3>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Transfer Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalTransferType('DEPOSIT')}
                    className={`py-2 text-xs font-bold rounded-xl transition-all border ${
                      modalTransferType === 'DEPOSIT'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent'
                    }`}
                  >
                    ↓ Deposit (Cash In)
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTransferType('WITHDRAWAL')}
                    className={`py-2 text-xs font-bold rounded-xl transition-all border ${
                      modalTransferType === 'WITHDRAWAL'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent'
                    }`}
                  >
                    ↑ Withdrawal (Cash Out)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Amount (₺ TRY)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 5000.00"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Transfer Date</label>
                <input
                  type="date"
                  required
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Notes / Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly salary savings top-up"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="flex-1 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20"
                >
                  Save Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
