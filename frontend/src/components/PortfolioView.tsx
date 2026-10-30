'use client';

import React, { useState } from 'react';
import { PortfolioItem, RealizedTrade, ExecutedOrder, CapitalTransfer } from '../lib/supabaseClient';
import { calculateExitDate } from '../lib/tradeTiming';
import { calculateSectorRisk } from '../lib/sectorRisk';
import { useLanguage } from '../context/LanguageContext';

import { TradeSignal } from './TradeCard';
import { DateRangeFilter, isDateInRange, formatFilterDisplay } from '../lib/dateFilter';
import DcaOffsetEngine from './DcaOffsetEngine';
import PortfolioBriefModal from './PortfolioBriefModal';
import { calculateLedgerCash } from '../lib/cashLedger';
import { deriveDividendsFromPortfolio } from '../lib/dividendForecastMath';

interface PortfolioViewProps {
  portfolio: PortfolioItem[];
  signals?: TradeSignal[];
  realizedTrades?: RealizedTrade[];
  orders?: ExecutedOrder[];
  transfers?: CapitalTransfer[];
  usdTryRate: number;
  cashBalanceTRY?: number;
  dateFilter?: DateRangeFilter;
  onRemoveHolding?: (symbol: string) => void;
  onAddHoldingClick?: () => void;
  onTradeHolding?: (holding: PortfolioItem) => void;
  onAddTransfer?: (transfer: CapitalTransfer) => void;
  onUpdateStopLoss?: (symbol: string, newStopPrice: number) => void;
  onOpenCoPilot?: (holding: PortfolioItem) => void;
  onToggleStrategyType?: (symbol: string) => void;
  onSelectTicker?: (symbol: string) => void;
  onUpdateTargetPrice?: (symbol: string, newTargetPrice: number) => void;
  isSimpleMode?: boolean;
}

export default function PortfolioView({
  portfolio,
  signals = [],
  realizedTrades = [],
  orders = [],
  transfers = [],
  usdTryRate,
  cashBalanceTRY = 2952.26,
  dateFilter,
  onRemoveHolding,
  onAddHoldingClick,
  onTradeHolding,
  onAddTransfer,
  onUpdateStopLoss,
  onUpdateTargetPrice,
  onOpenCoPilot,
  onToggleStrategyType,
  onSelectTicker,
  isSimpleMode = false,
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
  const [lotSortOrder, setLotSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isCompactTable, setIsCompactTable] = useState<boolean>(true);
  const [isPortfolioBriefOpen, setIsPortfolioBriefOpen] = useState(false);
  const toggleLots = (sym: string) => {
    setExpandedLots(prev => ({ ...prev, [sym]: !prev[sym] }));
  };

  const parseOrderTimestamp = (order: ExecutedOrder): number => {
    if (order.executedAt) {
      const t = new Date(order.executedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (order.dateTime) {
      const direct = new Date(order.dateTime).getTime();
      if (!isNaN(direct) && direct > 0) return direct;

      // Match 'DD.MM.YY - HH:mm' or 'DD.MM.YYYY HH:mm'
      const match = order.dateTime.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[^\d]+(\d{1,2}):(\d{1,2}))?/);
      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        let year = parseInt(match[3], 10);
        if (year < 100) year += 2000;
        const hour = match[4] ? parseInt(match[4], 10) : 0;
        const min = match[5] ? parseInt(match[5], 10) : 0;
        return new Date(year, month, day, hour, min).getTime();
      }
    }
    return 0;
  };

  const getTranchesForHolding = (item: PortfolioItem) => {
    const cleanSym = item.symbol.replace('.IS', '').trim().toUpperCase();

    // 1. Sort all BUY orders by timestamp ASCENDING (oldest to newest)
    const allBuys = orders
      .filter(o => o.side === 'BUY' && o.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym)
      .sort((a, b) => parseOrderTimestamp(a) - parseOrderTimestamp(b));

    // 2. Sort all SELL orders by timestamp ASCENDING
    const allSells = orders
      .filter(o => o.side === 'SELL' && o.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym)
      .sort((a, b) => parseOrderTimestamp(a) - parseOrderTimestamp(b));

    const buyTrackers = allBuys.map(bo => ({
      order: bo,
      activeShares: bo.quantity,
    }));

    const closedLots: {
      id: string;
      date: string;
      shares: number;
      buyPrice: number;
      sellPrice: number;
      realizedPnl: number;
      realizedPnlPct: number;
      note: string;
    }[] = [];
    const unmatchedSells: ExecutedOrder[] = [];

    // Phase 1: Specific Tranche Identification & Intraday Scalp Matching
    for (const so of allSells) {
      let matched = false;

      // Check if sell note explicitly refers to a tranche buy: e.g. "Tranche Buy: 151 @ ₺3.07"
      const trancheMatch = so.dcaNote?.match(/tranche buy:\s*(\d+(?:\.\d+)?)\s*@\s*₺?([\d\.]+)/i);
      if (trancheMatch) {
        const targetShares = parseFloat(trancheMatch[1]);
        const targetPrice = parseFloat(trancheMatch[2]);
        const targetBuy = buyTrackers.find(b => 
          b.activeShares >= targetShares && Math.abs(b.order.price - targetPrice) < 0.05
        );
        if (targetBuy) {
          targetBuy.activeShares -= targetShares;
          const pnl = (so.price - targetBuy.order.price) * targetShares;
          const pnlPct = targetBuy.order.price > 0 ? (pnl / (targetBuy.order.price * targetShares)) * 100 : 0;
          closedLots.push({
            id: `closed-${so.id}`,
            date: so.dateTime,
            shares: targetShares,
            buyPrice: targetBuy.order.price,
            sellPrice: so.price,
            realizedPnl: pnl,
            realizedPnlPct: pnlPct,
            note: so.dcaNote || 'Specific Tranche Scalp Matched'
          });
          matched = true;
        }
      }

      // Check for same-day scalp round-trip (same execution date, same quantity)
      if (!matched) {
        const soDate = so.dateTime.slice(0, 10);
        const intradayBuy = buyTrackers.find(b => 
          b.order.dateTime.slice(0, 10) === soDate && b.activeShares === so.quantity
        );
        if (intradayBuy) {
          intradayBuy.activeShares -= so.quantity;
          const pnl = (so.price - intradayBuy.order.price) * so.quantity;
          const pnlPct = intradayBuy.order.price > 0 ? (pnl / (intradayBuy.order.price * so.quantity)) * 100 : 0;
          closedLots.push({
            id: `closed-${so.id}`,
            date: so.dateTime,
            shares: so.quantity,
            buyPrice: intradayBuy.order.price,
            sellPrice: so.price,
            realizedPnl: pnl,
            realizedPnlPct: pnlPct,
            note: so.dcaNote || 'Intraday Scalp Matched'
          });
          matched = true;
        }
      }

      if (!matched) {
        unmatchedSells.push(so);
      }
    }

    // Phase 2: Standard FIFO consumption for general position reductions
    for (const so of unmatchedSells) {
      let remainingToSell = so.quantity;
      for (const b of buyTrackers) {
        if (b.activeShares <= 0) continue;
        const take = Math.min(b.activeShares, remainingToSell);
        b.activeShares -= take;
        remainingToSell -= take;
        const pnl = (so.price - b.order.price) * take;
        const pnlPct = b.order.price > 0 ? (pnl / (b.order.price * take)) * 100 : 0;
        closedLots.push({
          id: `closed-fifo-${so.id}-${b.order.id}`,
          date: so.dateTime,
          shares: take,
          buyPrice: b.order.price,
          sellPrice: so.price,
          realizedPnl: pnl,
          realizedPnlPct: pnlPct,
          note: so.dcaNote || `FIFO matched against Lot @ ${formatCurr(b.order.price, item.currency)}`
        });
        if (remainingToSell <= 0) break;
      }
    }

    // Phase 3: Active buys mapping
    const activeBuys = buyTrackers.filter(b => b.activeShares > 0);
    if (activeBuys.length > 0) {
      const mappedLots = activeBuys.map((entry, idx) => {
        const bo = entry.order;
        const lotShares = entry.activeShares;
        const lotValue = lotShares * item.currentPrice;
        const lotCost = lotShares * bo.price;
        const lotPnl = lotValue - lotCost;
        const lotPnlPct = lotCost > 0 ? (lotPnl / lotCost) * 100 : 0;
        const isInitial = idx === 0;
        const isLatest = idx === activeBuys.length - 1 && activeBuys.length > 1;

        return {
          id: bo.id,
          ref: bo.ref,
          lotNumber: idx + 1,
          isInitial: isInitial,
          isLatest: isLatest,
          date: bo.dateTime,
          shares: lotShares,
          price: bo.price,
          totalCost: lotCost,
          currentValue: lotValue,
          pnl: lotPnl,
          pnlPct: lotPnlPct,
          note: bo.dcaNote || (isInitial ? 'Initial Position Outlay' : `DCA Accumulation Tranche #${idx + 1}`),
          timestamp: parseOrderTimestamp(bo)
        };
      });

      const sortedActive = lotSortOrder === 'desc' ? [...mappedLots].reverse() : mappedLots;
      return { activeLots: sortedActive, closedLots };
    }

    const lotCost = item.shares * item.entryPrice;
    const lotValue = item.shares * item.currentPrice;
    const lotPnl = lotValue - lotCost;
    const lotPnlPct = lotCost > 0 ? (lotPnl / lotCost) * 100 : 0;
    return {
      activeLots: [{
        id: `lot-init-${item.symbol}`,
        ref: `#INIT-${cleanSym}`,
        lotNumber: 1,
        isInitial: true,
        isLatest: false,
        date: item.entryDate 
          ? new Date(item.entryDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'Initial',
        shares: item.shares,
        price: item.entryPrice,
        totalCost: lotCost,
        currentValue: lotValue,
        pnl: lotPnl,
        pnlPct: lotPnlPct,
        note: 'Core Holding Outlay',
        timestamp: 0
      }],
      closedLots
    };
  };

  const getBuyLotsForHolding = (item: PortfolioItem) => getTranchesForHolding(item).activeLots;
  const getClosedLotsForHolding = (item: PortfolioItem) => getTranchesForHolding(item).closedLots;

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

  // User Rule: Compute cash strictly as (All Deposits + All Sells - All Buys)
  const ledgerCash = React.useMemo(() => {
    return calculateLedgerCash(orders, transfers, usdTryRate);
  }, [orders, transfers, usdTryRate]);

  const totalDepositedTRY = ledgerCash.totalDepositsTRY;
  const cashValTRY = ledgerCash.availableCashTRY;
  const totalValTRY = totalStockValTRY + cashValTRY;

  const recordedDepositsTRY = React.useMemo(() => {
    return transfers.length > 0
      ? transfers.reduce((acc, t) => acc + (t.transferType === 'DEPOSIT' ? t.amount : -t.amount), 0)
      : 17000.00;
  }, [transfers]);
  const autoInjectedCapitalTRY = Math.max(0, totalDepositedTRY - recordedDepositsTRY);

  // Active Portfolio Dividend Stream & Annual Income Run-Rate
  const dividendAssets = React.useMemo(() => {
    return deriveDividendsFromPortfolio(portfolio);
  }, [portfolio]);

  // Cumulative swing gains per symbol from realized trades (used for Maliyet Düşürme / House Money tracking)
  const swingGainsBySymbol = React.useMemo(() => {
    const map: { [sym: string]: number } = {};
    (realizedTrades || []).forEach(rt => {
      const sym = rt.symbol.replace('.IS', '').trim().toUpperCase();
      map[sym] = (map[sym] || 0) + (rt.realizedPnl || 0);
    });
    return map;
  }, [realizedTrades]);

  const totalAnnualDivTRY = React.useMemo(() => {
    return dividendAssets.reduce((acc, d) => {
      const p = d.currency === 'USD' ? d.annualPayout * usdTryRate : d.annualPayout;
      return acc + p;
    }, 0);
  }, [dividendAssets, usdTryRate]);

  const totalAnnualDivDisplay = currencyMode === 'USD' ? (totalAnnualDivTRY / usdTryRate) : totalAnnualDivTRY;

  // Realized profit calculation
  const totalRealizedPnlTRY = realizedTrades.reduce((acc, trade) => {
    return acc + (trade.currency === 'USD' ? trade.realizedPnl * usdTryRate : trade.realizedPnl);
  }, 0);

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

  // Date-filtered collections
  const effectiveRealizedTrades = React.useMemo(() => {
    if (!dateFilter || dateFilter.preset === 'ALL') return realizedTrades;
    return realizedTrades.filter(t => isDateInRange(t.closeDate, dateFilter));
  }, [realizedTrades, dateFilter]);

  const effectiveOrders = React.useMemo(() => {
    if (!dateFilter || dateFilter.preset === 'ALL') return orders;
    return orders.filter(o => isDateInRange(o.executedAt, dateFilter));
  }, [orders, dateFilter]);

  const effectiveTransfers = React.useMemo(() => {
    if (!dateFilter || dateFilter.preset === 'ALL') return transfers;
    return transfers.filter(t => isDateInRange(t.transferDate, dateFilter));
  }, [transfers, dateFilter]);

  // Counterfactual & Execution Discipline Metrics (Filtered by Date if active)
  const totalTargetPnlTRY = effectiveRealizedTrades.reduce((acc, trade) => {
    const tPnl = trade.targetPnl !== undefined ? trade.targetPnl : trade.realizedPnl;
    return acc + (trade.currency === 'USD' ? tPnl * usdTryRate : tPnl);
  }, 0);

  const totalCapitalProtectedTRY = effectiveRealizedTrades.reduce((acc, trade) => {
    if ((trade.leftOnTableAmount || 0) < 0) {
      const saved = Math.abs(trade.leftOnTableAmount || 0);
      return acc + (trade.currency === 'USD' ? saved * usdTryRate : saved);
    }
    return acc;
  }, 0);

  const totalMissedGainsTRY = effectiveRealizedTrades.reduce((acc, trade) => {
    if ((trade.leftOnTableAmount || 0) > 0) {
      const missed = trade.leftOnTableAmount || 0;
      return acc + (trade.currency === 'USD' ? missed * usdTryRate : missed);
    }
    return acc;
  }, 0);

  const totalPeriodRealizedPnlTRY = effectiveRealizedTrades.reduce((acc, trade) => {
    return acc + (trade.currency === 'USD' ? trade.realizedPnl * usdTryRate : trade.realizedPnl);
  }, 0);
  const totalPeriodRealizedDisplay = currencyMode === 'USD' ? (totalPeriodRealizedPnlTRY / usdTryRate) : totalPeriodRealizedPnlTRY;

  const avgDisciplineCapturePct = effectiveRealizedTrades.length > 0 && totalTargetPnlTRY > 0
    ? Math.max(0, Math.min(150, (totalPeriodRealizedPnlTRY / totalTargetPnlTRY) * 100))
    : 100;

  const totalTargetDisplay = currencyMode === 'USD' ? (totalTargetPnlTRY / usdTryRate) : totalTargetPnlTRY;
  const totalMissedDisplay = currencyMode === 'USD' ? (totalMissedGainsTRY / usdTryRate) : totalMissedGainsTRY;
  const totalProtectedDisplay = currencyMode === 'USD' ? (totalCapitalProtectedTRY / usdTryRate) : totalCapitalProtectedTRY;

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
      {/* Top Portfolio Summary KPI Cards (5 Pillars of Wealth) - Compact 2-Col Grid on Mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {/* Card 1: Total Account Value (Full Width on Mobile) */}
        <div className="col-span-2 lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>{language === 'tr' ? 'Toplam Portföy Değeri' : 'Total Account Value'}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPortfolioBriefOpen(true)}
                  className="px-2 py-0.5 text-[10px] font-black rounded-md bg-purple-100 hover:bg-purple-200 dark:bg-purple-950 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors flex items-center gap-1 cursor-pointer"
                  title="View Whole Portfolio Executive Brief"
                >
                  <span>📊</span>
                  <span>Brief</span>
                </button>
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
            </div>
            <div className="mt-1.5 sm:mt-2 text-2xl font-black text-gray-900 dark:text-white">
              {formatCurr(totalValDisplay)}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100 dark:border-gray-750 flex flex-wrap items-center justify-between gap-1">
            <div>
              {language === 'tr' ? 'Hisseler:' : 'Equity:'} <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurr(totalStockDisplay)}</span> • {language === 'tr' ? 'Nakit:' : 'Cash:'} {formatCurr(cashDisplay)}
            </div>
            {totalAnnualDivTRY > 0 && (
              <div className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1" title={language === 'tr' ? 'Öngörülen 12 Aylık Net Temettü Nakit Akışı' : 'Projected 12-Month Net Passive Dividend Income'}>
                <span>💰</span>
                <span>+{formatCurr(totalAnnualDivDisplay)}/{language === 'tr' ? 'yıl temettü' : 'yr div'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Net Capital Deposited (Principal Put In) */}
        <div className="col-span-1 bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span className="truncate">{language === 'tr' ? 'Yatırılan Para' : 'Total Deposited'}</span>
              <button
                onClick={() => setIsDepositModalOpen(true)}
                className="text-[10px] sm:text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                title={language === 'tr' ? "Sermaye girişi veya çekimi kaydet" : "Record new capital deposit or withdrawal"}
              >
                <span>+ Yatır</span>
              </button>
            </div>
            <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-gray-900 dark:text-white truncate">
              {formatCurr(totalDepositedDisplay)}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-100 dark:border-gray-750 flex justify-between items-center">
            <span className="truncate">
              {autoInjectedCapitalTRY > 0 
                ? (language === 'tr' ? `+${formatCurr(currencyMode === 'USD' ? autoInjectedCapitalTRY / usdTryRate : autoInjectedCapitalTRY)}` : `+${formatCurr(currencyMode === 'USD' ? autoInjectedCapitalTRY / usdTryRate : autoInjectedCapitalTRY)}`)
                : (language === 'tr' ? 'Net Ana Para' : 'Capital')}
            </span>
            <button
              onClick={() => setShowTransfers(!showTransfers)}
              className="text-[9px] sm:text-[10px] text-blue-600 dark:text-blue-400 hover:underline shrink-0"
            >
              {showTransfers ? (language === 'tr' ? 'Gizle' : 'Hide') : (language === 'tr' ? 'Gör' : 'Inflows')}
            </button>
          </div>
        </div>

        {/* Card 3: True Lifetime Return (All-Time ROI vs Money Put In) */}
        <div className="col-span-1 bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span className="truncate">{language === 'tr' ? 'Net Getiri' : 'Net ROI'}</span>
              <span className={`text-[9px] sm:text-[10px] font-black px-1 sm:px-1.5 py-0.5 rounded shrink-0 ${
                trueRoiAmountTRY >= 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-400' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-400'
              }`}>
                {trueRoiPercent >= 0 ? '+' : ''}{trueRoiPercent.toFixed(1)}%
              </span>
            </div>
            <div className={`mt-1 sm:mt-2 text-base sm:text-2xl font-black truncate ${trueRoiAmountTRY >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {trueRoiAmountTRY >= 0 ? '+' : ''}{formatCurr(trueRoiDisplay)}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-100 dark:border-gray-750 truncate">
            {language === 'tr' ? 'Yatırılan: ' : 'vs '}<span className="font-semibold">{formatCurr(totalDepositedDisplay)}</span>
          </div>
        </div>

        {/* Card 4: Dry Powder / Cash Balance */}
        <div className="col-span-1 bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span className="truncate">{language === 'tr' ? 'Nakit (Boşta)' : 'Cash Balance'}</span>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(true)}
                className="text-[10px] sm:text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
                title={language === 'tr' ? "Nakit yatır veya çek" : "Transfer cash"}
              >
                <span>+ Transfer</span>
              </button>
            </div>
            <div className="mt-1 sm:mt-2 text-base sm:text-2xl font-black text-blue-600 dark:text-blue-400 truncate">
              {formatCurr(cashDisplay)}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-100 dark:border-gray-750 flex justify-between items-center">
            <span>
              {totalValTRY > 0 ? ((cashValTRY / totalValTRY) * 100).toFixed(0) : 0}% {language === 'tr' ? 'likit' : 'liquid'}
            </span>
            <span className="text-[9px] text-gray-400 font-mono">
              ₺1.09k
            </span>
          </div>
        </div>

        {/* Card 5: Realized Profit / Losses */}
        <div className="col-span-1 bg-white dark:bg-gray-800 rounded-2xl p-3 sm:p-5 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center text-[10px] sm:text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span className="truncate">{language === 'tr' ? 'Kapatılan Kâr' : 'Realized'}</span>
              <button
                onClick={() => {
                  setShowRealized(true);
                  setTimeout(() => {
                    document.getElementById('realized-trades-section')?.scrollIntoView({ behavior: 'smooth' });
                  }, 50);
                }}
                className="text-[10px] sm:text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-bold cursor-pointer shrink-0"
              >
                {showRealized ? (language === 'tr' ? 'Gizle' : 'Hide') : (language === 'tr' ? 'Geçmiş' : 'History')}
              </button>
            </div>
            <div className={`mt-1 sm:mt-2 text-base sm:text-2xl font-black truncate ${totalRealizedPnlTRY > 0 ? 'text-emerald-500' : totalRealizedPnlTRY < 0 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}`}>
              {totalRealizedPnlTRY > 0 ? '+' : ''}{formatCurr(totalRealizedDisplay)}
            </div>
          </div>
          <div className="text-[10px] sm:text-[11px] text-gray-500 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-gray-100 dark:border-gray-750 truncate">
            {realizedTrades.length > 0 
              ? (language === 'tr' ? `${realizedTrades.length} İşlem Kapatıldı` : `${realizedTrades.length} Trades Locked`) 
              : (language === 'tr' ? 'İşlem Yok' : 'None Yet')}
          </div>
        </div>
      </div>

      {/* Beginner Mode Friendly Guide Card */}
      {isSimpleMode && (
        <div className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs flex items-start gap-3 shadow-xs">
          <span className="text-xl shrink-0">💡</span>
          <div className="space-y-1">
            <div className="font-black text-blue-900 dark:text-blue-200 text-sm">
              {language === 'tr' ? 'Yeni Başlayanlar İçin Portföy Özeti' : 'Beginner Portfolio Guide'}
            </div>
            <p className="text-blue-800/90 dark:text-blue-300/90 leading-relaxed">
              {language === 'tr'
                ? 'Portföyünüzdeki geçici düşüşler borsa geneli (BIST 100) düzeltmesinden kaynaklanmaktadır. TURSG ve ISMEN gibi hisseleriniz düzenli nakit temettü üretir. Bu hisselerde panik satışı yapmayın; fiyat düştükçe temettü verimi artar ve kademeli alım (DCA) fırsatı doğar. Stop-loss seviyesini aşan al-sat hisselerinde ise piyasa tepki verdiğinde çıkış düşünülebilir.'
                : 'Short-term portfolio drawdowns reflect the broader BIST 100 index correction. Strong dividend payers like TURSG and ISMEN continue to generate cash. Never panic sell dividend compounders on dips; as prices drop, dividend yields expand.'}
            </p>
          </div>
        </div>
      )}

      {/* Sector Concentration & Risk Matrix (Pro Mode Only) */}
      {!isSimpleMode && (
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
      )}

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
            {/* View Mode Toggle: Compact vs Detailed */}
            <div className="inline-flex p-0.5 rounded-xl bg-gray-100 dark:bg-gray-700/80 border border-gray-200 dark:border-gray-600">
              <button
                type="button"
                onClick={() => setIsCompactTable(true)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  isCompactTable
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
                title="Kompakt görünüm: Yatay kaydırmayı önler, sabit hisse kolonu ve birleştirilmiş metrikler sunar"
              >
                <span>⚡</span>
                <span className="hidden sm:inline">{language === 'tr' ? 'Kompakt' : 'Compact'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCompactTable(false)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  !isCompactTable
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
                title="Detaylı görünüm: 12 kolonlu geniş görünüm"
              >
                <span>📋</span>
                <span className="hidden sm:inline">{language === 'tr' ? 'Geniş' : 'Detailed'}</span>
              </button>
            </div>

            {/* Whole Portfolio Executive Brief Button */}
            <button
              type="button"
              onClick={() => setIsPortfolioBriefOpen(true)}
              className="px-3.5 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md shadow-purple-500/25 active:scale-95 shrink-0"
              title={language === 'tr' ? 'Bütünsel portföy yönetici özeti ve AI değerlendirmesi' : 'Whole-portfolio executive brief & AI health analysis'}
            >
              <span>📊</span>
              <span>{language === 'tr' ? 'Portföy Özeti' : 'Portfolio Brief'}</span>
            </button>

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

        {/* Mobile View: Dedicated Card List (< 768px, eliminates horizontal scroll completely) */}
        <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
          {portfolio.map((item, idx) => {
            const isProfit = item.pnlPercent >= 0;
            const formattedBoughtDate = item.entryDate 
              ? new Date(item.entryDate).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : '24.09.2026';
            const daysHeld = item.entryDate
              ? Math.max(1, Math.round((Date.now() - new Date(item.entryDate).getTime()) / (1000 * 60 * 60 * 24)))
              : null;
            const lots = getBuyLotsForHolding(item);
            const isExpanded = !!expandedLots[item.symbol];
            const cleanSym = item.symbol.replace('.IS', '').trim().toUpperCase();
            const symbolSwingGains = swingGainsBySymbol[cleanSym] || 0;
            const isHouseMoney = item.entryPrice <= 0.05 || (item.shares > 0 && symbolSwingGains > 0 && (item.shares * item.entryPrice) <= symbolSwingGains);
            const matchedSig = signals?.find(s => s.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym);
            const effTarget = item.targetPrice && item.targetPrice > 0
              ? item.targetPrice
              : (item.stopLoss > 0 && item.entryPrice > item.stopLoss
                  ? Number((item.entryPrice + 2 * (item.entryPrice - item.stopLoss)).toFixed(2))
                  : Number((item.entryPrice * 1.10).toFixed(2)));
            const timing = calculateExitDate(item.entryDate, item.strategyType || 'SWING', item.isDividend);

            return (
              <div key={`m-${item.symbol || idx}`} className="p-4 space-y-3 bg-white dark:bg-gray-800">
                {/* Header: Symbol, Market, Date & Total Value */}
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => onSelectTicker?.(item.symbol)}
                        className="font-black text-base text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1"
                      >
                        <span>{item.symbol}</span>
                        <span className="text-xs text-blue-500">📈</span>
                      </button>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {item.market}
                      </span>
                      {/* Interactive Strategy Mode Toggle: Dividend (DCA) ⟷ Swing Trade */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStrategyType?.(item.symbol);
                        }}
                        className={`text-[10px] font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs ${
                          item.isDividend
                            ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                            : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/70 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                        }`}
                        title={
                          item.isDividend
                            ? (language === 'tr' ? "Şu an Temettü (DCA) modunda. Swing Trade'e çevirmek için dokunun" : "Currently Dividend (DCA). Tap to switch to Swing Trade")
                            : (language === 'tr' ? "Şu an Swing Trade modunda. Temettü (DCA)'ye çevirmek için dokunun" : "Currently Swing Trade. Tap to switch to Dividend (DCA)")
                        }
                      >
                        <span>{item.isDividend ? '💰 Temettü' : '⚡ Trade'}</span>
                        <span className="text-[9px] opacity-60">⇄</span>
                      </button>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                      <span className="truncate max-w-[150px]">{item.name}</span>
                      <span>·</span>
                      <span className="text-gray-400 font-mono text-[11px]">{formattedBoughtDate} {daysHeld ? `(${daysHeld}g)` : ''}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base font-black text-gray-900 dark:text-white font-mono">
                      {formatCurr(item.currentValue, item.currency)}
                    </div>
                    <div className="text-xs font-bold text-gray-500">
                      {item.shares.toLocaleString()} lot
                    </div>
                  </div>
                </div>

                {/* Metrics Grid: Fiyat/Maliyet & Net K/Z */}
                <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-750/70 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-gray-400">Güncel / Maliyet</div>
                    <div className="font-bold text-gray-900 dark:text-white mt-0.5">
                      {formatCurr(item.currentPrice, item.currency)}
                    </div>
                    <div className="text-[11px] text-gray-500 flex items-center gap-1 flex-wrap">
                      <span>Mal: {formatCurr(item.entryPrice, item.currency)}</span>
                      {symbolSwingGains > 0 && (
                        <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-200 dark:border-emerald-800" title={language === 'tr' ? 'Kâr İndirimi ile Düşürülmüş Maliyet' : 'Cost reduced by realized swing gains'}>
                          (-{formatCurr(symbolSwingGains, item.currency)})
                        </span>
                      )}
                    </div>
                    {isHouseMoney && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse mt-0.5">
                        👑 Bedava Hisse (House Money)
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase font-bold text-gray-400">Net Kâr / Zarar</div>
                    <div className={`font-black mt-0.5 ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {isProfit ? '+' : ''}{formatCurr(item.pnlAmount, item.currency)}
                    </div>
                    <span className={`inline-block text-[10px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                      isProfit ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                    }`}>
                      {isProfit ? '▲ +' : '▼ '}{item.pnlPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Risk & Target Badges */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs pt-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Stop Loss status */}
                    {item.isDividend ? (
                      <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                        💎 DCA Modu
                      </span>
                    ) : item.stopLoss >= item.entryPrice ? (
                      <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                        🛡️ Stop: {formatCurr(item.stopLoss, item.currency)} (Free)
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        item.distanceToStop < 3 && item.stopLoss > 0
                          ? 'bg-rose-500 text-white border-rose-600 animate-pulse'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                      }`}>
                        🛑 Stop: {item.stopLoss > 0 ? formatCurr(item.stopLoss, item.currency) : 'Trailing'}
                      </span>
                    )}

                    {/* Target */}
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 font-mono">
                      🎯 {formatCurr(effTarget, item.currency)}
                    </span>

                    {/* Personal TP Target T0 */}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
                      item.pnlPercent >= 3.0 && item.pnlPercent <= 5.0
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-700 animate-pulse'
                        : item.pnlPercent > 5.0
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60'
                    }`} title="Kişisel Hızlı Kâr Hedefi (+%3-%4)">
                      ⚡ T0 (%3-4): {formatCurr(item.entryPrice * 1.035, item.currency)}
                      {item.pnlPercent >= 3.0 && <span className="ml-0.5">✓</span>}
                    </span>

                    {/* Effective R:R Badge */}
                    {(() => {
                      const effRisk = item.stopLoss > 0 && item.entryPrice > item.stopLoss ? (item.entryPrice - item.stopLoss) : 0;
                      const effReward = effTarget > item.entryPrice ? (effTarget - item.entryPrice) : 0;
                      const effectiveRR = effRisk > 0 ? (effReward / effRisk).toFixed(1) : null;
                      if (!effectiveRR || item.isDividend) return null;
                      return (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded border bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                          ⚡ R:R {effectiveRR}x
                        </span>
                      );
                    })()}
                  </div>

                  {/* Vade / DCA Zone Badge */}
                  <div>
                    {item.dcaZone === 'BUY' ? (
                      <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                        🎯 ALIM BÖLGESİ
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 rounded">
                        ⏳ {timing.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mobile Action Buttons & Lot Accordion */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-gray-750">
                  <button
                    type="button"
                    onClick={() => toggleLots(item.symbol)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 cursor-pointer py-1"
                  >
                    <span>📦 {lots.length} Lot</span>
                    <svg className={`w-3 h-3 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onTradeHolding?.(item)}
                      className="px-3 py-1.5 rounded-lg text-xs font-black bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>⚡ Trade / DCA</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenCoPilot?.(item)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1 cursor-pointer"
                      title="Detaylı Brifing & Pozisyon Analizi"
                    >
                      <span>📋</span>
                      <span>Brief</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleStrategyType?.(item.symbol)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs ${
                        item.isDividend
                          ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                          : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                      }`}
                      title={item.isDividend ? (language === 'tr' ? "Swing Trade moduna çevir" : "Switch to Swing Trade") : (language === 'tr' ? "Temettü (DCA) moduna çevir" : "Switch to Dividend")}
                    >
                      <span>⇄</span>
                      <span>{item.isDividend ? (language === 'tr' ? 'Trade' : 'Swing') : (language === 'tr' ? 'Temettü' : 'Div')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.symbol)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg cursor-pointer"
                      title="Sil"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Mobile Expanded Lots View */}
                {isExpanded && (
                  <div className="bg-blue-50/40 dark:bg-blue-950/30 p-2.5 rounded-xl border border-blue-200 dark:border-blue-900/60 space-y-2 mt-2">
                    <div className="text-xs font-black text-gray-800 dark:text-gray-200 flex justify-between items-center">
                      <span>📦 {language === 'tr' ? 'Alım Kademeleri & Lot Dağılımı' : 'Purchase Tranches Breakdown'}</span>
                      <button
                        type="button"
                        onClick={() => onTradeHolding?.(item)}
                        className="text-[11px] text-blue-600 font-bold hover:underline"
                      >
                        + {language === 'tr' ? 'Yeni Kademe' : 'New Tranche'}
                      </button>
                    </div>

                    {/* Mobile DCA Offset & Breakeven Engine */}
                    {lots.length > 1 && (
                      <DcaOffsetEngine
                        symbol={item.symbol}
                        name={item.name}
                        currency={item.currency}
                        totalShares={item.shares}
                        avgEntryPrice={item.entryPrice}
                        currentPrice={item.currentPrice}
                        totalCost={item.totalCost}
                        currentValue={item.currentValue}
                        isDividend={item.isDividend}
                        lots={lots}
                        formatCurr={formatCurr}
                        onTradeHolding={() => onTradeHolding?.(item)}
                      />
                    )}

                    <div className="space-y-1.5">
                      {lots.map(lot => (
                        <div key={lot.id} className="bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700 flex justify-between items-center text-[11px]">
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white">
                              Lot #{lot.lotNumber}: +{lot.shares} lot @ {formatCurr(lot.price, item.currency)}
                            </div>
                            <div className="text-gray-400 text-[10px]">{lot.date}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold font-mono">{formatCurr(lot.currentValue, item.currency)}</div>
                            <div className={`font-bold ${lot.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {lot.pnl >= 0 ? '+' : ''}{lot.pnlPct.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Mobile Closed Lots / Realized Scalps Section */}
                    {(() => {
                      const closedLots = getClosedLotsForHolding(item);
                      if (!closedLots || closedLots.length === 0) return null;
                      return (
                        <div className="mt-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
                          <div className="flex justify-between items-center text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            <span className="flex items-center gap-1">
                              <span>🏷️</span>
                              <span>{language === 'tr' ? 'Kapatılan Satışlar / Scalp' : 'Closed Sells / Scalps'}</span>
                            </span>
                            <span className="text-[10px] text-emerald-600 font-mono">
                              {closedLots.length} {language === 'tr' ? 'İşlem' : 'Trades'}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {closedLots.map((cLot, cIdx) => (
                              <div key={cIdx} className="bg-white dark:bg-gray-800 p-2 rounded border border-gray-100 dark:border-gray-700 flex justify-between items-center text-[10px]">
                                <div>
                                  <div className="font-bold text-gray-900 dark:text-white">
                                    {cLot.shares} lot: Alış {formatCurr(cLot.buyPrice, item.currency)} ➔ Satış {formatCurr(cLot.sellPrice, item.currency)}
                                  </div>
                                  <div className="text-gray-400 text-[9px]">{cLot.date} · {cLot.note}</div>
                                </div>
                                <div className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  +{formatCurr(cLot.realizedPnl, item.currency)} (+{cLot.realizedPnlPct.toFixed(1)}%)
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          {portfolio.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <p className="font-semibold text-sm">Portföyde aktif pozisyon bulunmuyor.</p>
            </div>
          )}
        </div>

        {/* Desktop / Tablet Table View (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              {isCompactTable ? (
                /* Ultra-Compact 8-Column Layout */
                <tr>
                  <th className="px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-r border-r border-gray-200 dark:border-gray-800">
                    {t.portfolio.holdingsTable.symbol}
                  </th>
                  <th className="px-4 py-3 text-right">Değer / Adet</th>
                  <th className="px-4 py-3 text-right">Fiyat / Maliyet</th>
                  <th className="px-4 py-3 text-right">{t.portfolio.holdingsTable.pnl}</th>
                  <th className="px-4 py-3 text-center">{language === 'tr' ? 'Stop / Mod' : 'Stop / Mode'}</th>
                  <th className="px-4 py-3 text-center">{language === 'tr' ? 'Hedef & Vade' : 'Target & Horizon'}</th>
                  <th className="px-4 py-3 text-center">{t.portfolio.holdingsTable.statusDca}</th>
                  <th className="px-4 py-3 text-center">{t.portfolio.holdingsTable.actions}</th>
                </tr>
              ) : (
                /* Detailed 12-Column Layout */
                <tr>
                  <th className="px-5 py-3 sticky left-0 bg-gray-50 dark:bg-gray-900 z-10">{t.portfolio.holdingsTable.symbol}</th>
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
              )}
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
                const cleanSym = item.symbol.replace('.IS', '').trim().toUpperCase();
                const symbolSwingGains = swingGainsBySymbol[cleanSym] || 0;
                const isHouseMoney = item.entryPrice <= 0.05 || (item.shares > 0 && symbolSwingGains > 0 && (item.shares * item.entryPrice) <= symbolSwingGains);
                const matchedSig = signals?.find(s => s.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym);
                const defaultStop = item.stopLoss > 0 ? item.stopLoss : Number((item.entryPrice * 0.95).toFixed(2));
                const calcT2 = Number((item.entryPrice + 2 * Math.abs(item.entryPrice - defaultStop)).toFixed(2));
                const effT2 = item.targetPrice && item.targetPrice > 0 ? item.targetPrice : calcT2;
                const effT1 = matchedSig && matchedSig.targetPrice > 0 ? matchedSig.targetPrice : null;
                const t1Shares = Math.max(1, Math.ceil(item.shares * 0.5));
                const t2Shares = Math.max(0, item.shares - t1Shares);
                const effTarget = effT2;
                const upsidePct = item.entryPrice > 0 ? ((effTarget - item.entryPrice) / item.entryPrice) * 100 : 0;
                const distFromCurr = item.currentPrice > 0 ? ((effTarget - item.currentPrice) / item.currentPrice) * 100 : 0;
                const hasT1 = Boolean(matchedSig && matchedSig.targetPrice > 0 && Math.abs(matchedSig.targetPrice - effTarget) > 0.05);
                const isT1Hit = Boolean(hasT1 && item.currentPrice >= matchedSig!.targetPrice);
                const lots = getBuyLotsForHolding(item);
                const isExpanded = !!expandedLots[item.symbol];
                const timing = calculateExitDate(item.entryDate, item.strategyType || 'SWING', item.isDividend);

                return (
                  <React.Fragment key={item.symbol || idx}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      {/* Column 1: Symbol & Info (STICKY LEFT in Compact Mode) */}
                      <td className={`px-4 py-3.5 ${isCompactTable ? 'sticky left-0 bg-white dark:bg-gray-800 z-10 border-r border-gray-100 dark:border-gray-800 shadow-xs' : 'px-5 py-4'}`}>
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
                          {/* Strategy Mode Toggle Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleStrategyType?.(item.symbol);
                            }}
                            className={`text-[10px] font-black px-2 py-0.5 rounded-lg border flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-xs ${
                              item.isDividend
                                ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/70 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                            }`}
                            title={
                              item.isDividend
                                ? (language === 'tr' ? "Şu an Temettü (DCA) modunda. Swing Trade'e çevirmek için tıklayın" : "Currently Dividend Mode. Click to switch to Swing Trade")
                                : (language === 'tr' ? "Şu an Swing Trade modunda. Temettü (DCA)'ye çevirmek için tıklayın" : "Currently Swing Trade. Click to switch to Dividend Mode")
                            }
                          >
                            <span>{item.isDividend ? '💰 Temettü' : '⚡ Trade'}</span>
                            <span className="text-[9px] opacity-60">⇄</span>
                          </button>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center space-x-1.5 mt-0.5 flex-wrap gap-1">
                          <span className="truncate max-w-[120px]">{item.name}</span>
                          {isCompactTable && (
                            <span className="text-[10px] font-mono text-gray-400">
                              · {formattedBoughtDate} {daysHeld ? `(${daysHeld}g)` : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => toggleLots(item.symbol)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black border transition-all cursor-pointer shadow-xs ${
                              isExpanded
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border-blue-200 dark:border-blue-800'
                            }`}
                            title="Tüm alım kademelerini göster/gizle"
                          >
                            <span>📦</span>
                            <span>{isExpanded ? (language === 'tr' ? 'Gizle' : 'Hide') : (language === 'tr' ? `${lots.length} Lot` : `${lots.length} Lots`)}</span>
                            <svg className={`w-2.5 h-2.5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </td>

                      {/* Compact Mode Streamlined Columns */}
                      {isCompactTable ? (
                        <>
                          {/* Col 2: Değer / Adet (Value & Shares) */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="font-bold text-gray-900 dark:text-white font-mono">
                              {formatCurr(item.currentValue, item.currency)}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                              {item.shares.toLocaleString()} lot
                            </div>
                          </td>

                          {/* Col 3: Fiyat / Maliyet (Price & Cost) */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="font-bold text-gray-900 dark:text-white font-mono">
                              {formatCurr(item.currentPrice, item.currency)}
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono flex items-center justify-end gap-1">
                              <span>Mal: {formatCurr(item.entryPrice, item.currency)}</span>
                              {symbolSwingGains > 0 && (
                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-200 dark:border-emerald-800" title={language === 'tr' ? 'Kâr İndirimi ile Düşürülmüş Maliyet' : 'Cost reduced by realized swing gains'}>
                                  (-{formatCurr(symbolSwingGains, item.currency)})
                                </span>
                              )}
                            </div>
                            {isHouseMoney && (
                              <div className="mt-0.5">
                                <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse">
                                  👑 Bedava Hisse (House Money)
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Col 4: Net K/Z (P&L) */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className={`font-bold font-mono ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {isProfit ? '+' : ''}{formatCurr(item.pnlAmount, item.currency)}
                            </div>
                            <span className={`inline-block text-[10px] font-black px-1.5 py-0.2 rounded mt-0.5 ${
                              isProfit ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                            }`}>
                              {isProfit ? '▲ +' : '▼ '}{item.pnlPercent.toFixed(2)}%
                            </span>
                          </td>

                          {/* Col 5: Stop / Mod */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
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
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingStopSymbol(null)}
                                  className="px-1.5 py-0.5 text-xs font-black text-gray-600 hover:bg-gray-200 rounded cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : item.isDividend ? (
                              <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                                💎 DCA Modu
                              </span>
                            ) : item.stopLoss >= item.entryPrice ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                                  🛡️ {formatCurr(item.stopLoss, item.currency)}
                                </span>
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 mt-0.5">
                                  FREE TRADE
                                </span>
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
                                    title="Stop loss fiyatını düzenle"
                                  >
                                    ✏️
                                  </button>
                                </div>
                                {item.currentPrice > item.entryPrice ? (
                                  <button
                                    type="button"
                                    onClick={() => onUpdateStopLoss?.(item.symbol, item.entryPrice)}
                                    className="mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 cursor-pointer"
                                  >
                                    🛡️ Breakeven
                                  </button>
                                ) : item.distanceToStop < 3 && item.stopLoss > 0 ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500 text-white animate-pulse block mt-0.5">
                                    ⚠️ STOP RİSKİ
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-400 block mt-0.5">
                                    {item.distanceToStop > 0 ? `+${item.distanceToStop.toFixed(1)}%` : 'Safe'}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Col 6: Hedef & Vade / Temettü Nakit Akışı */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            {item.isDividend ? (
                              <div className="inline-flex flex-col items-center">
                                {(() => {
                                  const cleanSymUpper = item.symbol.replace('.IS', '').trim().toUpperCase();
                                  const divItem = dividendAssets.find(d => d.symbol.replace('.IS', '').trim().toUpperCase() === cleanSymUpper);
                                  return (
                                    <>
                                      <span className="text-xs font-black text-purple-700 dark:text-purple-300 font-mono bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 flex items-center gap-1 shadow-xs">
                                        <span>💎</span>
                                        <span>{divItem ? `+${formatCurr(divItem.annualPayout, item.currency)}/yıl` : 'Temettü'}</span>
                                      </span>
                                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                                        {divItem ? `%${divItem.dividendYield.toFixed(1)} Verim` : 'Core DCA'}
                                      </span>
                                      <span className="text-[9px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                                        {divItem?.payoutMonth || 'Mayıs 2027'}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              <>
                                <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                                  <span>🎯 {formatCurr(effTarget, item.currency)}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTargetSymbol(item.symbol);
                                      setEditTargetValue(effTarget.toString());
                                    }}
                                    className="text-gray-400 hover:text-blue-500 text-[10px] p-0.5 cursor-pointer"
                                  >
                                    ✏️
                                  </button>
                                </div>
                                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 flex items-center justify-center gap-1">
                                  <span>{timing.maxExitDateFormatted}</span>
                                  <span className="font-bold">({timing.label})</span>
                                </div>

                                {/* Personal TP Target T0 */}
                                <div className="mt-1 pt-0.5">
                                  <span 
                                    className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                                      item.pnlPercent >= 3.0 && item.pnlPercent <= 5.0
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-700 animate-pulse'
                                        : item.pnlPercent > 5.0
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60'
                                    }`}
                                    title="Kişisel Hızlı Kâr Hedefiniz (+%3-%4)"
                                  >
                                    <span>⚡ T0 (%3-4): {formatCurr(item.entryPrice * 1.035, item.currency)}</span>
                                    {item.pnlPercent >= 3.0 && <span>✓</span>}
                                  </span>
                                </div>
                                {(() => {
                                  const effRisk = item.stopLoss > 0 && item.entryPrice > item.stopLoss ? (item.entryPrice - item.stopLoss) : 0;
                                  const effReward = effTarget > item.entryPrice ? (effTarget - item.entryPrice) : 0;
                                  const effectiveRR = effRisk > 0 ? (effReward / effRisk).toFixed(1) : null;
                                  if (!effectiveRR) return null;
                                  return (
                                    <span className={`inline-block mt-0.5 text-[9px] font-black px-1.5 py-0.2 rounded border ${
                                      Number(effectiveRR) >= 3.0
                                        ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                    }`} title={`Risk: ₺${effRisk.toFixed(2)} | Hedef: ₺${effReward.toFixed(2)} (R:R ${effectiveRR}x)`}>
                                      ⚡ R:R {effectiveRR}x {Number(effectiveRR) >= 3.0 ? '🔥' : ''}
                                    </span>
                                  );
                                })()}
                              </>
                            )}
                          </td>

                          {/* Col 7: DCA Durumu */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            {item.dcaZone === 'BUY' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white shadow-xs">
                                🎯 ALIM BÖLGESİ
                              </span>
                            ) : item.dcaZone === 'PAUSE' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">
                                ⚠️ BEKLE
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                TUT
                              </span>
                            )}
                          </td>

                          {/* Col 8: İşlemler (Actions) */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <div className="inline-flex items-center space-x-1.5">
                              <button
                                onClick={() => onTradeHolding?.(item)}
                                className="px-2 py-1 rounded-lg text-xs font-black bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                                title="Al veya Sat"
                              >
                                <span>⚡</span>
                                <span>Trade</span>
                              </button>
                              <button
                                onClick={() => onOpenCoPilot?.(item)}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 transition-colors border border-purple-200 dark:border-purple-800 cursor-pointer flex items-center gap-1 shadow-2xs"
                                title="Detaylı Brifing & Pozisyon Analizi"
                              >
                                <span>📋</span>
                                <span>Brief</span>
                              </button>
                              <button
                                onClick={() => onToggleStrategyType?.(item.symbol)}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 active:scale-95 shadow-xs ${
                                  item.isDividend
                                    ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                    : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                }`}
                                title={item.isDividend ? (language === 'tr' ? "Swing Trade moduna çevir" : "Switch to Swing Trade") : (language === 'tr' ? "Temettü (DCA) moduna çevir" : "Switch to Dividend")}
                              >
                                <span>⇄</span>
                                <span>{item.isDividend ? (language === 'tr' ? 'Trade' : 'Swing') : (language === 'tr' ? 'Temettü' : 'Div')}</span>
                              </button>
                              <button
                                onClick={() => handleRemove(item.symbol)}
                                className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Sil"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        /* Detailed 12-Column Layout (Existing) */
                        <>
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
                                ) : item.stopLoss > 0 && item.currentPrice <= item.stopLoss ? (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white animate-pulse block mt-0.5" title={language === 'tr' ? "Fiyat stop seviyesini kırdı — pozisyon portföyünüzde korunmaktadır" : "Price breached stop loss — position remains protected in your portfolio"}>
                                    {language === 'tr' ? '⚠️ STOP DELİNDİ' : '⚠️ STOP BREACHED'}
                                  </span>
                                ) : item.distanceToStop < 3 && item.stopLoss > 0 ? (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500 text-white animate-pulse block mt-0.5">
                                    {language === 'tr' ? '⚠️ STOP RİSKİ' : '⚠️ STOP RISK'}
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
                                    {(() => {
                                      const cleanSymUpper = item.symbol.replace('.IS', '').trim().toUpperCase();
                                      const divItem = dividendAssets.find(d => d.symbol.replace('.IS', '').trim().toUpperCase() === cleanSymUpper);
                                      return (
                                        <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 flex items-center gap-1 shadow-xs" title={language === 'tr' ? 'Tahmini yıllık temettü nakit akışı' : 'Estimated annual dividend payout'}>
                                          <span>💎</span>
                                          <span>{divItem ? `%${divItem.dividendYield.toFixed(1)} (+${formatCurr(divItem.annualPayout, item.currency)}/yıl)` : 'Yield / Core'}</span>
                                        </span>
                                      );
                                    })()}
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
                                    >
                                      <span>⚡ Sell T1 ({t1Shares} shs)</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center whitespace-nowrap">
                            {timing.isDividend ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800 shadow-xs">
                                  💎 Core Compounder
                                </span>
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                                  Indefinite · Yield Focus
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleStrategyType?.(item.symbol);
                                  }}
                                  className="mt-1 text-[10px] font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center gap-1 mx-auto cursor-pointer underline transition-colors"
                                  title="Swing Trade moduna çevir"
                                >
                                  <span>⇄ {language === 'tr' ? "Trade'e Çevir" : 'Switch to Trade'}</span>
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleStrategyType?.(item.symbol);
                                  }}
                                  className="mt-1 text-[10px] font-bold text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 flex items-center justify-center gap-1 mx-auto cursor-pointer underline transition-colors"
                                  title="Temettü (DCA) moduna çevir"
                                >
                                  <span>⇄ {language === 'tr' ? "Temettü'ye Çevir" : 'Switch to Dividend'}</span>
                                </button>
                              </div>
                            )}
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
                                onClick={() => onToggleStrategyType?.(item.symbol)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center space-x-1 active:scale-95 shadow-xs ${
                                  item.isDividend
                                    ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                    : 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                }`}
                                title={item.isDividend ? (language === 'tr' ? "Swing Trade moduna çevir" : "Switch to Swing Trade") : (language === 'tr' ? "Temettü (DCA) moduna çevir" : "Switch to Dividend")}
                              >
                                <span>⇄</span>
                                <span>{item.isDividend ? (language === 'tr' ? 'Trade' : 'Swing') : (language === 'tr' ? 'Temettü' : 'Div')}</span>
                              </button>
                              <button
                                onClick={() => handleRemove(item.symbol)}
                                className="p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title={`Remove ${item.symbol} from portfolio`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>

                    {/* Expanded Buy Lots breakdown row */}
                    {isExpanded && (
                      <tr key={`${item.symbol}-lots`} className="bg-blue-50/25 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900/40">
                        <td colSpan={isCompactTable ? 8 : 12} className="px-3 py-3 sm:px-5">
                          <div className="bg-white dark:bg-gray-850 rounded-xl p-3 sm:p-4 border border-blue-200 dark:border-blue-800/70 shadow-xs space-y-3">
                            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-100 dark:border-gray-750 pb-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                                  <span>📦</span>
                                  <span>{language === 'tr' ? 'Alım Kademeleri & Lot Dağılımı' : 'Purchase Tranches & Buy Lots Breakdown'}: <span className="text-blue-600 dark:text-blue-400 font-mono">{item.symbol}</span></span>
                                </span>
                                <span className="text-[11px] text-gray-500">
                                  {language === 'tr' ? 'Toplam' : 'Total'}: <strong className="text-gray-900 dark:text-white">{item.shares.toLocaleString()} {language === 'tr' ? 'lot' : 'shares'}</strong> @ {language === 'tr' ? 'ort.' : 'avg'} <strong className="text-gray-900 dark:text-white">{formatCurr(item.entryPrice, item.currency)}</strong>
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => setLotSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                  className="text-[10px] font-bold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 bg-gray-100 dark:bg-gray-750 hover:bg-gray-200 dark:hover:bg-gray-700 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 flex items-center gap-1 cursor-pointer transition-colors"
                                  title={language === 'tr' ? 'Sıralamayı değiştir' : 'Change sort order'}
                                >
                                  <span>{lotSortOrder === 'asc' ? '⬆️' : '⬇️'}</span>
                                  <span>
                                    {language === 'tr'
                                      ? (lotSortOrder === 'asc' ? 'Kronolojik (İlk Alım Üstte)' : 'En Yeni Alım Üstte')
                                      : (lotSortOrder === 'asc' ? 'Chronological (Oldest First)' : 'Newest First')
                                    }
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onTradeHolding?.(item)}
                                  className="text-[11px] font-black text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <span>+ {language === 'tr' ? 'Kademeli Ekle / Al' : 'Buy More / Scale In'}</span>
                                </button>
                              </div>
                            </div>

                            {/* DCA Offset & Breakeven Compression Engine */}
                            {lots.length > 1 && (
                              <DcaOffsetEngine
                                symbol={item.symbol}
                                name={item.name}
                                currency={item.currency}
                                totalShares={item.shares}
                                avgEntryPrice={item.entryPrice}
                                currentPrice={item.currentPrice}
                                totalCost={item.totalCost}
                                currentValue={item.currentValue}
                                isDividend={item.isDividend}
                                lots={lots}
                                formatCurr={formatCurr}
                                onTradeHolding={() => onTradeHolding?.(item)}
                              />
                            )}

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-750">
                                  <tr>
                                    <th className="py-1.5 px-2">{language === 'tr' ? 'Kademe / Lot' : 'Tranche / Lot'}</th>
                                    <th className="py-1.5 px-2">{language === 'tr' ? 'İşlem Tarihi' : 'Execution Date'}</th>
                                    <th className="py-1.5 px-2 text-right">{language === 'tr' ? 'Lot Adedi' : 'Shares'}</th>
                                    <th className="py-1.5 px-2 text-right">{language === 'tr' ? 'Alış Fiyatı' : 'Fill Price'}</th>
                                    <th className="py-1.5 px-2 text-right">{language === 'tr' ? 'Maliyet Tutarı' : 'Cost Outlay'}</th>
                                    <th className="py-1.5 px-2 text-right">{language === 'tr' ? 'Güncel Değer' : 'Current Value'}</th>
                                    <th className="py-1.5 px-2 text-right">{language === 'tr' ? 'Kademe K/Z' : 'Tranche P&L'}</th>
                                    <th className="py-1.5 px-2">{language === 'tr' ? 'DCA Notu / Gerekçe' : 'DCA Note / Purpose'}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                  {lots.map((lot) => {
                                    const isLotProfit = lot.pnl >= 0;
                                    return (
                                      <tr key={lot.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/20 transition-colors">
                                        <td className="py-2 px-2 whitespace-nowrap">
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black ${
                                            lot.isInitial
                                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                                              : lot.isLatest
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300'
                                          }`}>
                                            <span>{lot.isInitial ? '🟢' : lot.isLatest ? '⚡' : '🎯'}</span>
                                            <span>
                                              Lot #{lot.lotNumber} {
                                                lot.isInitial
                                                  ? (language === 'tr' ? '(İlk Alım)' : '(Initial)')
                                                  : lot.isLatest
                                                  ? (language === 'tr' ? '(Son Kademeli Alım)' : '(Latest DCA)')
                                                  : (language === 'tr' ? '(Kademeli Alım)' : '(DCA Tranche)')
                                              }
                                            </span>
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

                            {/* Closed Tranches & Realized Sells Section */}
                            {(() => {
                              const closedLots = getClosedLotsForHolding(item);
                              if (!closedLots || closedLots.length === 0) return null;
                              return (
                                <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                                  <div className="flex items-center justify-between text-xs font-black text-slate-800 dark:text-slate-200">
                                    <span className="flex items-center gap-1.5">
                                      <span>🏷️</span>
                                      <span>{language === 'tr' ? 'Satışlar & Kapatılan Mahsuplaşma Kademeleri' : 'Executed Sells & Closed Tranches'}</span>
                                    </span>
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                                      {closedLots.length} {language === 'tr' ? 'İşlem' : 'Trades'}
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-800">
                                        <tr>
                                          <th className="py-1 px-2">{language === 'tr' ? 'İşlem Türü' : 'Type'}</th>
                                          <th className="py-1 px-2">{language === 'tr' ? 'Tarih' : 'Date'}</th>
                                          <th className="py-1 px-2 text-right">{language === 'tr' ? 'Lot Adedi' : 'Shares'}</th>
                                          <th className="py-1 px-2 text-right">{language === 'tr' ? 'Alış Fiyatı' : 'Buy Price'}</th>
                                          <th className="py-1 px-2 text-right">{language === 'tr' ? 'Satış Fiyatı' : 'Sell Price'}</th>
                                          <th className="py-1 px-2 text-right">{language === 'tr' ? 'Net Kâr' : 'Realized P&L'}</th>
                                          <th className="py-1 px-2">{language === 'tr' ? 'Mahsuplaşma Notu' : 'Netting Note'}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {closedLots.map((cLot, cIdx) => (
                                          <tr key={cIdx} className="hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20">
                                            <td className="py-1.5 px-2">
                                              <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                                                ⚡ {language === 'tr' ? 'Kapatılan Scalp' : 'Closed Scalp'}
                                              </span>
                                            </td>
                                            <td className="py-1.5 px-2 font-mono text-[11px] text-gray-600 dark:text-gray-300">{cLot.date}</td>
                                            <td className="py-1.5 px-2 text-right font-bold text-gray-900 dark:text-white font-mono">{cLot.shares}</td>
                                            <td className="py-1.5 px-2 text-right font-mono text-gray-600 dark:text-gray-400">{formatCurr(cLot.buyPrice, item.currency)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurr(cLot.sellPrice, item.currency)}</td>
                                            <td className="py-1.5 px-2 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                                              +{formatCurr(cLot.realizedPnl, item.currency)} (+{cLot.realizedPnlPct.toFixed(2)}%)
                                            </td>
                                            <td className="py-1.5 px-2 text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-xs">{cLot.note}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {portfolio.length === 0 && (
                <tr>
                  <td colSpan={isCompactTable ? 8 : 12} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
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
        <div id="realized-trades-section" className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden animate-in fade-in duration-200">
          {/* Card Header */}
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50/50 dark:bg-gray-850">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                <span>🏆</span>
                <span>{language === 'tr' ? 'Gerçekleşen İşlemler & Erken Çıkış Denetimi' : 'Realized Trades & Discipline Audit'}</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {language === 'tr' 
                  ? 'Erken kâr alımlarınızı AI sistem hedefleriyle karşılaştırın, masada kalan kârları ve düşüşten korunan sermayeyi denetleyin.' 
                  : 'Compare your realized exits against AI system targets to track money left on the table and pullbacks avoided.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className={`text-base font-black ${totalRealizedPnlTRY > 0 ? 'text-emerald-500' : totalRealizedPnlTRY < 0 ? 'text-rose-500' : 'text-gray-900 dark:text-white'}`}>
                  {totalRealizedPnlTRY > 0 ? '+' : ''}{formatCurr(totalRealizedDisplay)}
                </span>
                <div className="text-[10px] text-gray-400 font-medium">
                  {language === 'tr' ? 'Toplam Kilitlenen Kâr' : 'Total Realized'}
                </div>
              </div>
              <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block" />
              <div className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800/50 text-right hidden sm:block">
                <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                  %{avgDisciplineCapturePct.toFixed(1)}
                </span>
                <div className="text-[10px] text-blue-500/80 font-medium">
                  {language === 'tr' ? 'Hedef Yakalama' : 'Target Capture'}
                </div>
              </div>
            </div>
          </div>

          {/* Execution Discipline KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-gray-50/70 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 text-xs">
            <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-xs">
              <div className="text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1.5">
                <span>💰</span>
                <span>{language === 'tr' ? 'Kilitlenen Net Kâr' : 'Actual Realized Profit'}</span>
              </div>
              <div className={`text-base sm:text-lg font-black mt-1 ${totalRealizedPnlTRY >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {totalRealizedPnlTRY > 0 ? '+' : ''}{formatCurr(totalRealizedDisplay)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {realizedTrades.length} {language === 'tr' ? 'kapalı işlem' : 'closed trades'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-xs">
              <div className="text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1.5">
                <span>🎯</span>
                <span>{language === 'tr' ? 'AI Sistem Hedef Kârı' : 'AI Target Potential'}</span>
              </div>
              <div className="text-base sm:text-lg font-black mt-1 text-blue-600 dark:text-blue-400">
                {totalTargetPnlTRY > 0 ? '+' : ''}{formatCurr(totalTargetDisplay)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {language === 'tr' ? 'Hedefe kadar beklenseydi' : 'If held to full targets'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-xs">
              <div className="text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{language === 'tr' ? 'Masada Kalan Kâr' : 'Left on the Table'}</span>
              </div>
              <div className="text-base sm:text-lg font-black mt-1 text-amber-500 dark:text-amber-400">
                {totalMissedGainsTRY > 0 ? `-${formatCurr(totalMissedDisplay)}` : '₺0.00'}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {language === 'tr' ? 'Erken çıkış fırsat maliyeti' : 'Opportunity cost from exit'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700 shadow-xs">
              <div className="text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1.5">
                <span>🛡️</span>
                <span>{language === 'tr' ? 'Korunan Sermaye' : 'Drawdown Protected'}</span>
              </div>
              <div className="text-base sm:text-lg font-black mt-1 text-emerald-500 dark:text-emerald-400">
                +{formatCurr(totalProtectedDisplay)}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {language === 'tr' ? 'Düşüş öncesi kâr kilitleme' : 'Gains saved before pullback'}
              </div>
            </div>
          </div>

          {effectiveRealizedTrades.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-500 dark:text-gray-400">
              <p className="font-semibold text-sm">
                {dateFilter && dateFilter.preset !== 'ALL'
                  ? (language === 'tr' ? 'Seçilen tarih aralığında kapatılmış işlem bulunmuyor.' : 'No closed trades in the selected date window.')
                  : (language === 'tr' ? 'Henüz kapatılan işlem yok.' : 'No executed sales or closed tranches yet.')}
              </p>
              <p className="text-xs mt-1">
                {dateFilter && dateFilter.preset !== 'ALL'
                  ? (language === 'tr' ? 'Tüm işlemleri görmek için tarih filtresini sıfırlayabilirsiniz.' : 'Reset date filter to view all historical closed trades.')
                  : (language === 'tr' ? 'Hisse sattığınızda gerçekleşen kâr ve AI hedef analizleri burada listelenir.' : 'When you sell or trim shares via the ⚡ Trade button, your executed sales and realized P&L will be tracked here.')}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-5 py-3">Asset</th>
                      <th className="px-4 py-3 text-right">Shares & Entry</th>
                      <th className="px-4 py-3 text-right">Exit Price</th>
                      <th className="px-4 py-3 text-right">Your Realized P&L</th>
                      <th className="px-4 py-3 text-center">AI Target & Potential</th>
                      <th className="px-4 py-3 text-right">Current Market</th>
                      <th className="px-5 py-3 text-center">Discipline & Left-on-Table</th>
                      <th className="px-4 py-3 text-center">Date Closed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {effectiveRealizedTrades.map((trade) => {
                      const isProfit = trade.realizedPnl >= 0;
                      const hasTarget = Boolean(trade.recommendedTargetPrice && trade.recommendedTargetPrice > 0);
                      const targetPotentialPnl = trade.targetPnl !== undefined ? trade.targetPnl : 0;
                      const targetPotentialPct = trade.targetPnlPercent !== undefined ? trade.targetPnlPercent : 0;
                      const leftAmount = trade.leftOnTableAmount || 0;
                      const livePrice = trade.currentPrice || trade.exitPrice;
                      const priceDiff = livePrice - trade.exitPrice;
                      const priceDiffPct = trade.exitPrice > 0 ? (priceDiff / trade.exitPrice) * 100 : 0;

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
                            <div className="text-xs text-gray-500 truncate max-w-[140px]">{trade.name}</div>
                          </td>

                          <td className="px-4 py-3.5 text-right font-medium">
                            <div className="text-gray-900 dark:text-white font-bold">{trade.sharesSold.toLocaleString()} lot</div>
                            <div className="text-xs text-gray-400">@ {formatCurr(trade.entryPrice, trade.currency)}</div>
                          </td>

                          <td className="px-4 py-3.5 text-right font-black text-gray-900 dark:text-white">
                            {formatCurr(trade.exitPrice, trade.currency)}
                          </td>

                          <td className="px-4 py-3.5 text-right font-black">
                            <div className={isProfit ? 'text-emerald-500' : 'text-rose-500'}>
                              {isProfit ? '+' : ''}{formatCurr(trade.realizedPnl, trade.currency)}
                            </div>
                            <span className={`inline-block text-[11px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                              isProfit ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                            }`}>
                              {isProfit ? '▲ +' : '▼ '}{trade.realizedPnlPercent.toFixed(2)}%
                            </span>
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            {hasTarget ? (
                              <div className="inline-block text-left bg-blue-50/60 dark:bg-blue-950/40 px-2.5 py-1 rounded-xl border border-blue-200/60 dark:border-blue-800/40">
                                <div className="text-xs font-black text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                  <span>🎯</span>
                                  <span>{formatCurr(trade.recommendedTargetPrice || 0, trade.currency)}</span>
                                </div>
                                <div className="text-[10px] text-blue-500 font-semibold">
                                  +{formatCurr(targetPotentialPnl, trade.currency)} (+{targetPotentialPct.toFixed(1)}%)
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-right font-medium">
                            <div className="text-gray-900 dark:text-white font-bold">{formatCurr(livePrice, trade.currency)}</div>
                            <div className={`text-[10px] font-semibold ${priceDiff >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {priceDiff >= 0 ? '+' : ''}{formatCurr(priceDiff, trade.currency)} ({priceDiff >= 0 ? '+' : ''}{priceDiffPct.toFixed(1)}%)
                            </div>
                          </td>

                          <td className="px-5 py-3.5 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {trade.executionVerdict === 'TARGET_HIT' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                  <span>⚠️ Masada:</span>
                                  <span>-{formatCurr(Math.abs(leftAmount), trade.currency)}</span>
                                </span>
                              )}
                              {trade.executionVerdict === 'PULLBACK_PROTECTED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                  <span>🛡️ Korundu:</span>
                                  <span>+{formatCurr(Math.abs(leftAmount), trade.currency)}</span>
                                </span>
                              )}
                              {trade.executionVerdict === 'RUNNING' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                                  <span>⏳ Ralli Sürüyor</span>
                                  {leftAmount > 0 && <span className="text-[10px]">(-{formatCurr(leftAmount, trade.currency)})</span>}
                                </span>
                              )}
                              {trade.disciplineCapturePct !== undefined && trade.disciplineCapturePct > 0 && (
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold">
                                  {language === 'tr' ? 'Hedef Yakalama' : 'Capture'}: %{trade.disciplineCapturePct.toFixed(0)}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs border border-gray-200 dark:border-gray-700">
                              <span>🗓️</span>
                              <span>{trade.closeDate}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View (< 768px) */}
              <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
                {effectiveRealizedTrades.map((trade) => {
                  const isProfit = trade.realizedPnl >= 0;
                  const hasTarget = Boolean(trade.recommendedTargetPrice && trade.recommendedTargetPrice > 0);
                  const targetPotentialPnl = trade.targetPnl !== undefined ? trade.targetPnl : 0;
                  const leftAmount = trade.leftOnTableAmount || 0;
                  const livePrice = trade.currentPrice || trade.exitPrice;

                  return (
                    <div key={trade.id} className="p-4 space-y-3 bg-white dark:bg-gray-800">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => onSelectTicker?.(trade.symbol)}
                              className="font-bold text-gray-900 dark:text-white hover:text-blue-600 text-base flex items-center gap-1"
                            >
                              <span>{trade.symbol}</span>
                              <span className="text-[10px] text-blue-500">📈</span>
                            </button>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                              {trade.market}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{trade.name}</div>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-black ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {isProfit ? '+' : ''}{formatCurr(trade.realizedPnl, trade.currency)}
                          </span>
                          <div className={`text-xs font-bold ${isProfit ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isProfit ? '▲ +' : '▼ '}{trade.realizedPnlPercent.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      {/* Trade Execution vs AI Target Comparison */}
                      <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-xl border border-gray-100 dark:border-gray-750">
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-semibold">
                            {language === 'tr' ? 'Satış İşleminiz' : 'Your Execution'}
                          </span>
                          <span className="font-bold text-gray-900 dark:text-white">
                            {trade.sharesSold.toLocaleString()} lot @ {formatCurr(trade.exitPrice, trade.currency)}
                          </span>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {language === 'tr' ? 'Maliyet' : 'Cost'}: {formatCurr(trade.entryPrice, trade.currency)}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px] uppercase font-semibold">
                            {language === 'tr' ? 'AI Sistem Hedefi' : 'AI System Target'}
                          </span>
                          {hasTarget ? (
                            <>
                              <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                <span>🎯</span>
                                <span>{formatCurr(trade.recommendedTargetPrice || 0, trade.currency)}</span>
                              </span>
                              <div className="text-[11px] text-blue-500/90 mt-0.5 font-medium">
                                +{formatCurr(targetPotentialPnl, trade.currency)} ({language === 'tr' ? 'Potansiyel' : 'Target'})
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </div>
                      </div>

                      {/* Live Market & Discipline Audit Pill */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <div className="text-xs">
                          <span className="text-gray-400 mr-1">{language === 'tr' ? 'Güncel:' : 'Live:'}</span>
                          <span className="font-bold text-gray-900 dark:text-white">{formatCurr(livePrice, trade.currency)}</span>
                        </div>

                        <div>
                          {trade.executionVerdict === 'TARGET_HIT' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                              <span>⚠️ Masada:</span>
                              <strong>-{formatCurr(Math.abs(leftAmount), trade.currency)}</strong>
                            </span>
                          )}
                          {trade.executionVerdict === 'PULLBACK_PROTECTED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              <span>🛡️ Korundu:</span>
                              <strong>+{formatCurr(Math.abs(leftAmount), trade.currency)}</strong>
                            </span>
                          )}
                          {trade.executionVerdict === 'RUNNING' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                              <span>⏳ Ralli Sürüyor</span>
                              {leftAmount > 0 && <span className="text-[10px]">(-{formatCurr(leftAmount, trade.currency)})</span>}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-750">
                        <span>🗓️ {trade.closeDate}</span>
                        {trade.disciplineCapturePct !== undefined && trade.disciplineCapturePct > 0 && (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {language === 'tr' ? 'Hedef Yakalama' : 'Target Capture'}: %{trade.disciplineCapturePct.toFixed(0)}
                          </span>
                        )}
                      </div>

                      {trade.aiTargetNote && (
                        <div className="text-[11px] text-gray-500 italic bg-gray-50/60 dark:bg-gray-850 p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                          💡 {trade.aiTargetNote}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
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
                {effectiveOrders.length} Executed
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
              {effectiveOrders
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
                {effectiveTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-gray-500">
                      No transfers recorded yet.
                    </td>
                  </tr>
                ) : (
                  effectiveTransfers.map((t) => (
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

      {/* Whole-Portfolio Executive Brief Modal */}
      <PortfolioBriefModal
        isOpen={isPortfolioBriefOpen}
        onClose={() => setIsPortfolioBriefOpen(false)}
        portfolio={portfolio}
        realizedTrades={realizedTrades}
        orders={orders}
        transfers={transfers}
        usdTryRate={usdTryRate}
        cashBalanceTRY={cashValTRY}
        onSelectTicker={onSelectTicker}
      />
    </div>
  );
}
