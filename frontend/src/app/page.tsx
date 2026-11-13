'use client';

import React, { useState, useEffect, useMemo } from 'react';
import NavigationTabs, { TabId } from '../components/NavigationTabs';
import SidebarNav from '../components/SidebarNav';
import MarketRegimeBanner, { RegimeStatus } from '../components/MarketRegimeBanner';
import MarketCorrectionBanner from '../components/MarketCorrectionBanner';
import TradeCard, { TradeSignal } from '../components/TradeCard';
import AssetTable, { AssetData } from '../components/AssetTable';
import PositionCalculator from '../components/PositionCalculator';
import PositionCalculatorModal from '../components/PositionCalculatorModal';
import AddAssetModal from '../components/AddAssetModal';
import AddHoldingModal from '../components/AddHoldingModal';
import TradeHoldingModal from '../components/TradeHoldingModal';
import PortfolioView from '../components/PortfolioView';
import DividendView from '../components/DividendView';
import DividendForecastView from '../components/DividendForecastView';
import ScorecardView from '../components/ScorecardView';
import OpeningDirectionView from '../components/OpeningDirectionView';
import CatalystFeedView from '../components/CatalystFeedView';
import QuantHubView from '../components/QuantHubView';
import HelpCenterView from '../components/HelpCenterView';
import AiAssistantView from '../components/AiAssistantView';
import WatchlistView from '../components/WatchlistView';
import AssetHistoryModal from '../components/AssetHistoryModal';
import AiTradeCoPilotModal, { CoPilotAssetContext } from '../components/AiTradeCoPilotModal';
import { AuthModal } from '../components/AuthModal';
import DateFilterBar from '../components/DateFilterBar';
import MobileBottomNav from '../components/MobileBottomNav';
import KeyboardShortcutsModal from '../components/KeyboardShortcutsModal';
import ReportsArchiveModal from '../components/ReportsArchiveModal';
import { DateRangeFilter, getDateRangeFromPreset, isDateInRange, formatFilterDisplay } from '../lib/dateFilter';
import { useLanguage } from '../context/LanguageContext';
import { useAuth, ADMIN_USER_ID } from '../context/AuthContext';
import {
  supabase,
  PortfolioItem,
  DividendAsset,
  StrategyStat,
  OpeningDirectionItem,
  RealizedTrade,
  ExecutedOrder,
  CapitalTransfer,
  ScannedTradeSignal,
  MarketCatalyst,
} from '../lib/supabaseClient';
import {
  deriveDividendsFromPortfolio,
  deriveAllMarketDividends,
  generateMarketDividendCatalysts,
  MASTER_GROWTH_PROFILES,
  KNOWN_DIVIDEND_LIST
} from '../lib/dividendForecastMath';
import { calculateLedgerCash } from '../lib/cashLedger';
import { calculateExitDate } from '../lib/tradeTiming';

const TAB_TITLES: Record<TabId, { icon: string; tr: string; en: string }> = {
  signals: { icon: '🎯', tr: 'Sinyaller', en: 'Signals' },
  assistant: { icon: '🤖', tr: 'AI Asistan', en: 'AI Copilot' },
  watchlist: { icon: '⭐', tr: 'Takip Listem & Radar', en: 'Watchlist & Favorites' },
  catalysts: { icon: '⚡', tr: 'KAP', en: 'KAP' },
  quant: { icon: '🏛️', tr: 'Quant', en: 'Quant' },
  portfolio: { icon: '💼', tr: 'Portföy', en: 'Portfolio' },
  dividend: { icon: '💰', tr: 'Temettü', en: 'Dividend' },
  forecast: { icon: '🔮', tr: 'Projeksiyon', en: 'Forecast' },
  scorecard: { icon: '📈', tr: 'Karne', en: 'Scorecard' },
  orb: { icon: '🔔', tr: 'Açılış', en: 'Opening' },
  help: { icon: '📖', tr: 'Rehber & SSS', en: 'Guide & FAQ' },
};

const INITIAL_SIGNALS: TradeSignal[] = [
  {
    symbol: 'THYAO', name: 'Türk Hava Yolları', strategy: 'Volatility Breakout',
    entryPrice: 310.50, stopLoss: 295.00, targetPrice: 350.00,
    confidence: 80, rationale: 'Price broke above 20-day high with 2x average volume. RSI showing strong momentum without being overbought.',
    market: 'BIST', date: new Date().toISOString().slice(0, 10), currency: 'TRY',
    direction: 'LONG', entryMode: 'next_open', target1: 330.00, target2: 350.00,
    triggerReasons: [
      'Close broke above prior 20-day swing high at ₺308.20',
      'Volume was 2.1x its 20-day average (strong institutional flow)',
      'RSI(14) was 63.5, confirming momentum expansion without being overbought',
      'Price closed above EMA50 and EMA200 (Stage-2 uptrend confirmed)'
    ],
    failedChecks: [],
    invalidation: 'Close below ₺295.00 or failure to defend breakout level',
    marketContext: { benchmark: 'XU100', regime: 'BULLISH' },
    risk: { atr_14: 8.20, stop_distance_pct: 4.99, max_position_pct: 1.5, invalidation_level: 295.00 }
  },
  {
    symbol: 'NVDA', name: 'NVIDIA Corp', strategy: 'EMA Pullback',
    entryPrice: 125.40, stopLoss: 118.00, targetPrice: 145.00,
    confidence: 75, rationale: 'Retracement to 50-day EMA in confirmed uptrend. Bullish divergence on MACD with volume stabilization.',
    market: 'US', date: new Date().toISOString().slice(0, 10), currency: 'USD',
    direction: 'LONG', entryMode: 'next_open', target1: 135.00, target2: 145.00,
    triggerReasons: [
      'Retracement to 50-day EMA ($124.50) dynamic trend support',
      'RSI(14) reset to 47.5, within healthy bounce territory',
      'Bullish momentum turn on MACD histogram',
      'Candle confirmed lower wick buying absorption at support'
    ],
    failedChecks: [],
    invalidation: 'Close below $118.00 or loss of EMA50 support',
    marketContext: { benchmark: 'SPY', regime: 'BULLISH' },
    risk: { atr_14: 3.80, stop_distance_pct: 5.90, max_position_pct: 1.5, invalidation_level: 118.00 }
  },
  {
    symbol: 'TUPRS', name: 'Tüpraş', strategy: 'Pullback Reclaim',
    entryPrice: 165.20, stopLoss: 158.00, targetPrice: 182.00,
    confidence: 82, rationale: 'Trend Pullback Reclaim (BIST): Pulled back 3.8% from 20-day high over 3 sessions, reclaimed prior-day high (₺164.50) and EMA20 with upper range close.',
    market: 'BIST', date: new Date().toISOString().slice(0, 10), currency: 'TRY',
    direction: 'LONG', entryMode: 'next_open', target1: 174.20, target2: 182.00,
    triggerReasons: [
      'Controlled 3.8% pullback from 20-day high over 3 sessions',
      'Reclaimed prior-day high at ₺164.50',
      'Reclaimed EMA20 dynamic trend support',
      'Closed in upper 25% of daily candle range',
      'Volume was 1.6x its 20-day average'
    ],
    failedChecks: [],
    invalidation: 'Close below ₺158.00 or new low below the pullback swing low',
    marketContext: { benchmark: 'XU100', regime: 'BULLISH' },
    risk: { atr_14: 4.20, stop_distance_pct: 4.36, max_position_pct: 1.5, invalidation_level: 158.00 }
  },
  {
    symbol: 'SCHD', name: 'Schwab US Dividend Equity', strategy: 'Mean Reversion',
    entryPrice: 82.10, stopLoss: 79.50, targetPrice: 88.00,
    confidence: 88, rationale: 'RSI rebounded from oversold territory (RSI 32). Lower Bollinger Band tested and defended with hammer bounce.',
    market: 'US', date: new Date().toISOString().slice(0, 10), currency: 'USD',
    direction: 'LONG', entryMode: 'next_open', target1: 85.50, target2: 88.00,
    triggerReasons: [
      'RSI(14) was 32.1, in oversold capitulation territory (threshold <= 36)',
      'Tested lower Bollinger Band (2.0σ) support at $81.60',
      'Candle showed hammer rejection wick and green bounce',
      'Daily drop remained within safe limit thresholds'
    ],
    failedChecks: [],
    invalidation: 'Close below $79.50 or continuation below exhaustion low',
    marketContext: { benchmark: 'SPY', regime: 'NEUTRAL' },
    risk: { atr_14: 1.20, stop_distance_pct: 3.17, max_position_pct: 2.0, invalidation_level: 79.50 }
  },
  {
    symbol: 'BIMAS', name: 'BİM Birleşik Mağazalar', strategy: 'Anchored VWAP Bounce',
    entryPrice: 368.50, stopLoss: 356.00, targetPrice: 395.00,
    confidence: 90, rationale: 'Institutional retest and bullish absorption bounce at Quarter-to-Date Anchored VWAP (₺365.20). Low breached and quickly reclaimed with strong institutional buying wick.',
    market: 'BIST', date: new Date().toISOString().slice(0, 10), currency: 'TRY',
    direction: 'LONG', entryMode: 'next_open', target1: 382.00, target2: 395.00,
    triggerReasons: [
      'Tested Anchored VWAP support at ₺365.20 anchored from institutional pivot low',
      'Intraday low dipped to AVWAP and closed back above at ₺368.50 (absorption wick)',
      'RSI(14) was 52.0, confirming consolidation support',
      'Price closed above key moving averages (macro Stage-2 trend)'
    ],
    failedChecks: [],
    invalidation: 'Close below ₺356.00 or decisive loss of AVWAP support (₺365.20)',
    marketContext: { benchmark: 'XU100', regime: 'BULLISH' },
    risk: { atr_14: 9.50, stop_distance_pct: 3.39, max_position_pct: 1.5, invalidation_level: 356.00 }
  },
  {
    symbol: 'AAPL', name: 'Apple Inc.', strategy: 'Liquidity Sweep Reclaim',
    entryPrice: 338.50, stopLoss: 329.00, targetPrice: 358.00,
    confidence: 84, rationale: 'Flushed retail stop loss pool below 20-day swing low ($332.80) with a 45% absorption wick and reclaimed previous support on high volume.',
    market: 'US', date: new Date().toISOString().slice(0, 10), currency: 'USD',
    direction: 'LONG', entryMode: 'next_open', target1: 350.00, target2: 358.00,
    triggerReasons: [
      'Swept 20-day swing low at $332.80 (flushed retail stop pool)',
      'Reclaimed support with strong close back above prior swing low at $338.50',
      'Lower absorption wick comprised 45% of total daily range',
      'Volume ratio was 1.35x average (institutional accumulation flow)'
    ],
    failedChecks: [],
    invalidation: 'Close below $329.00 or new breakdown below sweep low ($330.50)',
    marketContext: { benchmark: 'SPY', regime: 'BULLISH' },
    risk: { atr_14: 4.80, stop_distance_pct: 2.81, max_position_pct: 1.5, invalidation_level: 329.00 }
  },
  {
    symbol: 'ASELS', name: 'Aselsan', strategy: 'Relative Strength Leader',
    entryPrice: 64.80, stopLoss: 61.50, targetPrice: 72.00,
    confidence: 89, rationale: 'Demonstrating significant Relative Strength (+6.2% vs XU100 -2.4% over 15 days). Holding firmly above 20 and 50 EMAs with institutional volume accumulation.',
    market: 'BIST', date: new Date().toISOString().slice(0, 10), currency: 'TRY',
    direction: 'LONG', entryMode: 'next_open', target1: 69.50, target2: 72.00,
    triggerReasons: [
      'Stock gained +6.2% over 15 sessions while XU100 index fell -2.4%',
      'Relative Strength ratio reached 1.09 (strong market divergence leader)',
      'Price held firmly above rising EMA20 and EMA50 dynamic support',
      'Candle showed positive buying accumulation on high turnover'
    ],
    failedChecks: [],
    invalidation: 'Close below ₺61.50 or trend failure below EMA50',
    marketContext: { benchmark: 'XU100', regime: 'BULLISH', relative_strength_20d: 1.09 },
    risk: { atr_14: 1.85, stop_distance_pct: 5.09, max_position_pct: 1.5, invalidation_level: 61.50 }
  }
];

const INITIAL_PORTFOLIO: PortfolioItem[] = [
  {
    symbol: 'AKBNK', name: 'Akbank T.A.Ş.', market: 'BIST',
    shares: 35, entryPrice: 71.20, currentPrice: 66.90, currency: 'TRY',
    totalCost: 2492.00, currentValue: 2341.50, pnlAmount: -150.50, pnlPercent: -6.04,
    stopLoss: 67.50, targetPrice: 82.00, distanceToStop: -0.9, isDividend: false,
    dcaZone: 'PAUSE', dcaRationale: 'Stop loss level (₺67.50) breached on index selloff; pause new buying.',
    entryDate: '2026-09-24', strategyType: 'SWING'
  },
  {
    symbol: 'ISMEN', name: 'İş Yatırım Menkul', market: 'BIST',
    shares: 215, entryPrice: 31.09, currentPrice: 28.78, currency: 'TRY',
    totalCost: 6684.68, currentValue: 6187.70, pnlAmount: -496.98, pnlPercent: -7.43,
    stopLoss: 0, targetPrice: 38.00, distanceToStop: 0, isDividend: true,
    dcaZone: 'BUY', dcaRationale: 'Flash discount below ₺29.00; Forward dividend yield surges to 8.55%. Prime DCA accumulation tranche.',
    entryDate: '2026-09-18', strategyType: 'CORE_DIVIDEND'
  },
  {
    symbol: 'TURSG', name: 'Türkiye Sigorta', market: 'BIST',
    shares: 1771, entryPrice: 5.62, currentPrice: 5.15, currency: 'TRY',
    totalCost: 9951.53, currentValue: 9120.65, pnlAmount: -830.88, pnlPercent: -8.35,
    stopLoss: 0, targetPrice: 7.00, distanceToStop: 0, isDividend: true,
    dcaZone: 'BUY', dcaRationale: 'Deep index dip to ₺5.15; Net forward dividend yield jumps to 7.09%. Prime DCA accumulation tranche.',
    entryDate: '2026-09-18', strategyType: 'CORE_DIVIDEND'
  },
  {
    symbol: 'TRGYO', name: 'Torunlar GYO', market: 'BIST',
    shares: 15, entryPrice: 84.50, currentPrice: 86.70, currency: 'TRY',
    totalCost: 1267.50, currentValue: 1300.50, pnlAmount: 33.00, pnlPercent: 2.60,
    stopLoss: 0, targetPrice: undefined, distanceToStop: 0, isDividend: true,
    dcaZone: 'HOLD', dcaRationale: 'Torunlar GYO Prime Core Dividend Compounder; high rental cash generation.',
    entryDate: '2026-10-22', strategyType: 'CORE_DIVIDEND'
  }
];

const INITIAL_DIVIDENDS: DividendAsset[] = [
  {
    symbol: 'AKBNK', name: 'Akbank T.A.Ş.', shares: 35,
    entryPrice: 71.20, currentPrice: 66.90, currency: 'TRY',
    dividendYield: 4.73, yieldOnCost: 4.45, annualPayout: 110.80, monthlyPayout: 9.23,
    payoutRatio: 28.5, safetyRating: 'A', frequency: 'Annual',
    nextExDate: '2027-03-26', nextPaymentDate: '2027-03-30',
    estimatedNextDPS: 3.165, estimatedNextPayout: 110.80,
    payoutMonth: 'March 2027', paymentStatus: 'Estimated'
  },
  {
    symbol: 'ISMEN', name: 'İş Yatırım Menkul', shares: 215,
    entryPrice: 31.09, currentPrice: 28.78, currency: 'TRY',
    dividendYield: 8.55, yieldOnCost: 7.92, annualPayout: 529.27, monthlyPayout: 44.11,
    payoutRatio: 58.4, safetyRating: 'A', frequency: 'Annual',
    nextExDate: '2027-03-29', nextPaymentDate: '2027-04-02',
    estimatedNextDPS: 2.462, estimatedNextPayout: 529.33,
    payoutMonth: 'March / April 2027', paymentStatus: 'Estimated'
  },
  {
    symbol: 'TURSG', name: 'Türkiye Sigorta', shares: 1771,
    entryPrice: 5.62, currentPrice: 5.15, currency: 'TRY',
    dividendYield: 7.09, yieldOnCost: 6.50, annualPayout: 646.65, monthlyPayout: 53.89,
    payoutRatio: 52.1, safetyRating: 'A', frequency: 'Annual',
    nextExDate: '2027-08-25', nextPaymentDate: '2027-08-27',
    estimatedNextDPS: 0.3647, estimatedNextPayout: 645.88,
    payoutMonth: 'August 2027', paymentStatus: 'Estimated'
  },
  {
    symbol: 'TRGYO', name: 'Torunlar GYO', shares: 15,
    entryPrice: 84.50, currentPrice: 86.70, currency: 'TRY',
    dividendYield: 5.20, yieldOnCost: 5.34, annualPayout: 67.63, monthlyPayout: 5.64,
    payoutRatio: 52.0, safetyRating: 'A', frequency: 'Annual',
    nextExDate: '2027-05-21', nextPaymentDate: '2027-05-25',
    estimatedNextDPS: 4.508, estimatedNextPayout: 67.63,
    payoutMonth: 'Mayıs 2027', paymentStatus: 'Estimated'
  }
];

const INITIAL_STRATEGIES: StrategyStat[] = [
  { strategy: '50 EMA Pullback in Uptrend', totalTrades: 382, winRate: 68.4, profitFactor: 2.14, avgGain: 6.8, avgLoss: 2.9, expectancy: 0.85 },
  { strategy: 'Volatility Breakout (20D High + 2x Vol)', totalTrades: 426, winRate: 59.2, profitFactor: 1.86, avgGain: 8.4, avgLoss: 3.8, expectancy: 0.72 },
  { strategy: 'Anchored VWAP Bounce', totalTrades: 194, winRate: 71.1, profitFactor: 2.38, avgGain: 7.9, avgLoss: 2.7, expectancy: 0.96 },
  { strategy: 'Liquidity Sweep Reclaim', totalTrades: 168, winRate: 67.8, profitFactor: 2.22, avgGain: 9.1, avgLoss: 3.2, expectancy: 0.89 },
  { strategy: 'Relative Strength Leader', totalTrades: 142, winRate: 69.7, profitFactor: 2.45, avgGain: 10.4, avgLoss: 3.6, expectancy: 1.05 },
  { strategy: 'Mean Reversion (RSI < 30)', totalTrades: 215, winRate: 56.8, profitFactor: 1.62, avgGain: 5.2, avgLoss: 3.1, expectancy: 0.48 },
  { strategy: '200 EMA Trend Following', totalTrades: 150, winRate: 54.0, profitFactor: 1.58, avgGain: 11.2, avgLoss: 5.4, expectancy: 0.65 }
];

const INITIAL_ORB: OpeningDirectionItem[] = [
  { symbol: 'THYAO', market: 'BIST', gapPercent: 1.45, gapType: 'Gap Up & Go', orbStatus: 'Broke High', bias: 'Strong Bullish', volumeSpike: true },
  { symbol: 'ASELS', market: 'BIST', gapPercent: 0.85, gapType: 'Gap Up & Go', orbStatus: 'Broke High', bias: 'Bullish', volumeSpike: true },
  { symbol: 'TUPRS', market: 'BIST', gapPercent: -0.40, gapType: 'Flat Open', orbStatus: 'Inside Range', bias: 'Neutral', volumeSpike: false },
  { symbol: 'NVDA', market: 'US', gapPercent: 1.80, gapType: 'Gap Up & Go', orbStatus: 'Broke High', bias: 'Strong Bullish', volumeSpike: true },
  { symbol: 'SPY', market: 'US', gapPercent: 0.35, gapType: 'Flat Open', orbStatus: 'Broke High', bias: 'Bullish', volumeSpike: false },
  { symbol: 'QQQ', market: 'US', gapPercent: 0.55, gapType: 'Gap Up & Go', orbStatus: 'Broke High', bias: 'Bullish', volumeSpike: false },
  { symbol: 'ISMEN', market: 'BIST', gapPercent: -0.15, gapType: 'Flat Open', orbStatus: 'Inside Range', bias: 'Neutral', volumeSpike: false }
];

const INITIAL_REALIZED_TRADES: RealizedTrade[] = [
  {
    id: 'trade-000cr0',
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    currency: 'TRY',
    sharesSold: 153,
    entryPrice: 32.56,
    exitPrice: 35.02,
    realizedPnl: 376.38,
    realizedPnlPercent: 7.56,
    closeDate: '2026-09-17',
    recommendedTargetPrice: 38.50,
    targetPnl: 908.82,
    targetPnlPercent: 18.24,
    currentPrice: 36.40,
    leftOnTableAmount: 211.14,
    disciplineCapturePct: 41.4,
    executionVerdict: 'RUNNING',
    aiTargetNote: "Hisse hedefe doğru ilerliyor (Güncel: ₺36.40). Kârın %41.4'ü erken realize edildi."
  }
];

const INITIAL_ORDERS: ExecutedOrder[] = [
  {
    id: 'ord-0006RC',
    ref: '#0006RC',
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 20,
    price: 29.20,
    totalValue: 584.00,
    currency: 'TRY',
    dateTime: '08.10.26 - 13:15',
    status: 'Filled',
    dcaNote: 'DCA Accumulation Tranche - Filled @ ₺29.20'
  },
  {
    id: 'ord-0006RA',
    ref: '#0006RA',
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 20,
    price: 29.30,
    totalValue: 586.00,
    currency: 'TRY',
    dateTime: '08.10.26 - 13:14',
    status: 'Filled',
    dcaNote: 'DCA Accumulation Tranche - Filled @ ₺29.30'
  },
  {
    id: 'ord-0003I3',
    ref: '#0003I3',
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 66,
    price: 31.08,
    totalValue: 2051.28,
    currency: 'TRY',
    dateTime: '28.09.26 - 11:37',
    status: 'Filled',
    dcaNote: 'DCA Tranche 2 - Lowered avg cost to ₺31.89'
  },
  {
    id: 'ord-0003FZ',
    ref: '#0003FZ',
    symbol: 'TURSG',
    name: 'Türkiye Sigorta',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 186,
    price: 5.40,
    totalValue: 1004.40,
    currency: 'TRY',
    dateTime: '28.09.26 - 11:31',
    status: 'Filled',
    dcaNote: 'DCA Tranche 4 - Lowered avg cost to ₺5.85'
  },
  {
    id: 'ord-000F7P',
    ref: '#000F7P',
    symbol: 'TURSG',
    name: 'Türkiye Sigorta',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 4,
    price: 5.90,
    totalValue: 23.60,
    currency: 'TRY',
    dateTime: '24.09.26 - 17:32',
    status: 'Filled',
    dcaNote: 'Odd-lot accumulation'
  },
  {
    id: 'ord-000B95',
    ref: '#000B95',
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 76,
    price: 32.60,
    totalValue: 2477.60,
    currency: 'TRY',
    dateTime: '24.09.26 - 14:35',
    status: 'Filled',
    dcaNote: 'Tranche 1 - Position initiation'
  },
  {
    id: 'ord-000B8L',
    ref: '#000B8L',
    symbol: 'AKBNK',
    name: 'Akbank T.A.Ş.',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 35,
    price: 71.20,
    totalValue: 2492.00,
    currency: 'TRY',
    dateTime: '24.09.26 - 14:34',
    status: 'Filled',
    dcaNote: 'Position initiation at 50 EMA support'
  },
  {
    id: 'ord-0005ZE',
    ref: '#0005ZE',
    symbol: 'TURSG',
    name: 'Türkiye Sigorta',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 906,
    price: 5.92,
    totalValue: 5363.52,
    currency: 'TRY',
    dateTime: '18.09.26 - 12:00',
    status: 'Filled',
    dcaNote: 'Core position build'
  },
  {
    id: 'ord-000CTC',
    ref: '#000CTC',
    symbol: 'TURSG',
    name: 'Türkiye Sigorta',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 167,
    price: 5.99,
    totalValue: 1000.33,
    currency: 'TRY',
    dateTime: '17.09.26 - 16:09',
    status: 'Filled',
    dcaNote: 'Initial breakout entry tranche'
  },
  {
    id: 'ord-000CR0',
    ref: '#000CR0',
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    side: 'SELL',
    orderType: 'Limit',
    quantity: 153,
    price: 35.02,
    totalValue: 5358.06,
    currency: 'TRY',
    dateTime: '17.09.26 - 16:00',
    status: 'Filled',
    dcaNote: 'Full swing profit taking (+₺376.38 / +7.56%)'
  },
  {
    id: 'ord-0009YP',
    ref: '#0009YP',
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    side: 'BUY',
    orderType: 'Limit',
    quantity: 153,
    price: 32.56,
    totalValue: 4981.68,
    currency: 'TRY',
    dateTime: '16.09.26 - 15:42',
    status: 'Filled',
    dcaNote: 'Swing trade entry tranche'
  }
];

const INITIAL_TRANSFERS: CapitalTransfer[] = [
  {
    id: 'trans-001',
    transferType: 'DEPOSIT',
    amount: 17000.00,
    currency: 'TRY',
    transferDate: '2026-09-16',
    notes: 'Account capital funding & deposit'
  }
];

const INITIAL_SCANNED_SIGNALS: ScannedTradeSignal[] = [
  {
    id: 'sig-thyao-01',
    symbol: 'THYAO',
    name: 'Türk Hava Yolları',
    market: 'BIST',
    strategy: 'volatility_breakout',
    signalDate: '2026-09-15',
    entryPrice: 310.50,
    stopLoss: 295.00,
    targetPrice: 350.00,
    confidence: 8.5,
    riskReward: 2.55,
    aiRationale: 'Volatility breakout trigger above 20-day high with 2.4x volume surge.',
    status: 'target_hit',
    outcomePnlPct: 12.72,
    closedAt: '2026-09-24',
    currency: 'TRY'
  },
  {
    id: 'sig-nvda-01',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    market: 'US',
    strategy: 'ema_pullback',
    signalDate: '2026-09-16',
    entryPrice: 125.40,
    stopLoss: 118.00,
    targetPrice: 145.00,
    confidence: 9.0,
    riskReward: 2.65,
    aiRationale: 'Retracement to 50 EMA support in confirmed bull regime with MACD turn.',
    status: 'target_hit',
    outcomePnlPct: 15.63,
    closedAt: '2026-09-26',
    currency: 'USD'
  },
  {
    id: 'sig-pgsus-01',
    symbol: 'PGSUS',
    name: 'Pegasus',
    market: 'BIST',
    strategy: 'volatility_breakout',
    signalDate: '2026-09-12',
    entryPrice: 144.40,
    stopLoss: 138.20,
    targetPrice: 158.00,
    confidence: 8.0,
    riskReward: 2.19,
    aiRationale: 'Consolidation breakout with expanding ATR and bullish momentum.',
    status: 'target_hit',
    outcomePnlPct: 9.42,
    closedAt: '2026-09-22',
    currency: 'TRY'
  },
  {
    id: 'sig-tuprs-01',
    symbol: 'TUPRS',
    name: 'Tüpraş',
    market: 'BIST',
    strategy: 'mean_reversion',
    signalDate: '2026-09-11',
    entryPrice: 168.00,
    stopLoss: 161.00,
    targetPrice: 182.00,
    confidence: 7.5,
    riskReward: 2.00,
    aiRationale: 'RSI oversold rebound setup. Breakdown through support triggered disciplined stop loss.',
    status: 'stopped_out',
    outcomePnlPct: -4.17,
    closedAt: '2026-09-17',
    currency: 'TRY'
  },
  {
    id: 'sig-bimas-01',
    symbol: 'BIMAS',
    name: 'BİM Mağazalar',
    market: 'BIST',
    strategy: 'trend_following',
    signalDate: '2026-09-08',
    entryPrice: 472.00,
    stopLoss: 455.00,
    targetPrice: 510.00,
    confidence: 8.5,
    riskReward: 2.24,
    aiRationale: 'Supermarket compounder holding above 200 EMA with accumulation volume.',
    status: 'target_hit',
    outcomePnlPct: 8.05,
    closedAt: '2026-09-21',
    currency: 'TRY'
  },
  {
    id: 'sig-aapl-01',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    market: 'US',
    strategy: 'trend_pullback',
    signalDate: '2026-09-14',
    entryPrice: 228.50,
    stopLoss: 222.00,
    targetPrice: 242.00,
    confidence: 8.0,
    riskReward: 2.08,
    aiRationale: 'Pullback to rising 20 EMA in strong US tech rally.',
    status: 'target_hit',
    outcomePnlPct: 5.91,
    closedAt: '2026-09-25',
    currency: 'USD'
  },
  {
    id: 'sig-sise-01',
    symbol: 'SISE',
    name: 'Şişecam',
    market: 'BIST',
    strategy: 'mean_reversion',
    signalDate: '2026-09-18',
    entryPrice: 46.20,
    stopLoss: 44.50,
    targetPrice: 50.00,
    confidence: 7.0,
    riskReward: 2.24,
    aiRationale: 'Oversold bounce failed to sustain above 20 EMA, executed risk mitigation stop.',
    status: 'stopped_out',
    outcomePnlPct: -3.68,
    closedAt: '2026-09-23',
    currency: 'TRY'
  },
  {
    id: 'sig-asels-01',
    symbol: 'ASELS',
    name: 'Aselsan',
    market: 'BIST',
    strategy: 'volatility_breakout',
    signalDate: '2026-09-15',
    entryPrice: 355.00,
    stopLoss: 342.00,
    targetPrice: 385.00,
    confidence: 8.5,
    riskReward: 2.31,
    aiRationale: 'Defense sector contract momentum breaking multi-week resistance on high volume.',
    status: 'target_hit',
    outcomePnlPct: 8.45,
    closedAt: '2026-09-26',
    currency: 'TRY'
  },
  {
    id: 'sig-krdmd-01',
    symbol: 'KRDMD',
    name: 'Kardemir D',
    market: 'BIST',
    strategy: '50_ema_pullback',
    signalDate: '2026-09-24',
    entryPrice: 43.76,
    stopLoss: 41.50,
    targetPrice: 45.24,
    confidence: 8.2,
    riskReward: 2.10,
    aiRationale: 'Clean bounce off 50-day EMA support in confirmed uptrend. Reached target tranche.',
    status: 'target_hit',
    outcomePnlPct: 3.38,
    closedAt: '2026-10-02',
    currency: 'TRY'
  },
  {
    id: 'sig-akbnk-01',
    symbol: 'AKBNK',
    name: 'Akbank T.A.Ş.',
    market: 'BIST',
    strategy: '50_ema_pullback',
    signalDate: '2026-09-10',
    entryPrice: 66.50,
    stopLoss: 63.80,
    targetPrice: 72.00,
    confidence: 8.4,
    riskReward: 2.04,
    aiRationale: 'Banking sector leadership with institutional accumulation at 50 EMA.',
    status: 'target_hit',
    outcomePnlPct: 8.27,
    closedAt: '2026-09-22',
    currency: 'TRY'
  },
  {
    id: 'sig-kchol-01',
    symbol: 'KCHOL',
    name: 'Koç Holding',
    market: 'BIST',
    strategy: 'trend_following',
    signalDate: '2026-09-09',
    entryPrice: 204.00,
    stopLoss: 196.00,
    targetPrice: 220.00,
    confidence: 8.1,
    riskReward: 2.00,
    aiRationale: 'Blue-chip conglomerate consolidation breakout above 20 EMA.',
    status: 'target_hit',
    outcomePnlPct: 7.84,
    closedAt: '2026-09-23',
    currency: 'TRY'
  },
  {
    id: 'sig-sahol-01',
    symbol: 'SAHOL',
    name: 'Sabancı Holding',
    market: 'BIST',
    strategy: '50_ema_pullback',
    signalDate: '2026-09-14',
    entryPrice: 92.50,
    stopLoss: 88.70,
    targetPrice: 100.00,
    confidence: 8.0,
    riskReward: 1.97,
    aiRationale: 'Healthy pullback to support with strong NAV discount catalyst.',
    status: 'target_hit',
    outcomePnlPct: 8.11,
    closedAt: '2026-09-25',
    currency: 'TRY'
  },
  {
    id: 'sig-eregl-01',
    symbol: 'EREGL',
    name: 'Erdemir',
    market: 'BIST',
    strategy: 'mean_reversion',
    signalDate: '2026-09-05',
    entryPrice: 48.20,
    stopLoss: 46.00,
    targetPrice: 52.80,
    confidence: 7.8,
    riskReward: 2.09,
    aiRationale: 'Steel cycle rebound from multi-month support channel.',
    status: 'target_hit',
    outcomePnlPct: 9.54,
    closedAt: '2026-09-19',
    currency: 'TRY'
  },
  {
    id: 'sig-froto-01',
    symbol: 'FROTO',
    name: 'Ford Otosan',
    market: 'BIST',
    strategy: 'trend_following',
    signalDate: '2026-09-03',
    entryPrice: 1040.00,
    stopLoss: 990.00,
    targetPrice: 1150.00,
    confidence: 8.8,
    riskReward: 2.20,
    aiRationale: 'Automotive export volume surge reaching all-time resistance breakout.',
    status: 'target_hit',
    outcomePnlPct: 10.58,
    closedAt: '2026-09-18',
    currency: 'TRY'
  },
  {
    id: 'sig-arclk-01',
    symbol: 'ARCLK',
    name: 'Arçelik',
    market: 'BIST',
    strategy: 'mean_reversion',
    signalDate: '2026-09-16',
    entryPrice: 165.00,
    stopLoss: 158.00,
    targetPrice: 178.00,
    confidence: 7.2,
    riskReward: 1.86,
    aiRationale: 'Reversal failed to hold above short-term pivot, executed risk limit.',
    status: 'stopped_out',
    outcomePnlPct: -4.24,
    closedAt: '2026-09-21',
    currency: 'TRY'
  },
  {
    id: 'sig-enkai-01',
    symbol: 'ENKAI',
    name: 'Enka İnşaat',
    market: 'BIST',
    strategy: '50_ema_pullback',
    signalDate: '2026-09-11',
    entryPrice: 42.40,
    stopLoss: 40.50,
    targetPrice: 46.20,
    confidence: 7.9,
    riskReward: 2.00,
    aiRationale: 'Net cash balance sheet defensive accumulation setup.',
    status: 'target_hit',
    outcomePnlPct: 8.96,
    closedAt: '2026-09-24',
    currency: 'TRY'
  },
  {
    id: 'sig-petkm-01',
    symbol: 'PETKM',
    name: 'Petkim',
    market: 'BIST',
    strategy: 'mean_reversion',
    signalDate: '2026-09-17',
    entryPrice: 22.80,
    stopLoss: 21.80,
    targetPrice: 24.80,
    confidence: 6.9,
    riskReward: 2.00,
    aiRationale: 'Petrochemical margin squeeze triggered protective stop exit.',
    status: 'stopped_out',
    outcomePnlPct: -4.39,
    closedAt: '2026-09-22',
    currency: 'TRY'
  },
  {
    id: 'sig-ykbnk-01',
    symbol: 'YKBNK',
    name: 'Yapı Kredi',
    market: 'BIST',
    strategy: 'volatility_breakout',
    signalDate: '2026-09-08',
    entryPrice: 28.40,
    stopLoss: 27.00,
    targetPrice: 31.50,
    confidence: 8.6,
    riskReward: 2.21,
    aiRationale: 'Banking momentum surge with heavy foreign institutional flows.',
    status: 'target_hit',
    outcomePnlPct: 10.92,
    closedAt: '2026-09-20',
    currency: 'TRY'
  },
  {
    id: 'sig-garan-01',
    symbol: 'GARAN',
    name: 'Garanti BBVA',
    market: 'BIST',
    strategy: 'trend_following',
    signalDate: '2026-09-10',
    entryPrice: 114.00,
    stopLoss: 108.50,
    targetPrice: 125.00,
    confidence: 8.7,
    riskReward: 2.00,
    aiRationale: 'Consistent outperformer holding expanding 20-day moving average.',
    status: 'target_hit',
    outcomePnlPct: 9.65,
    closedAt: '2026-09-23',
    currency: 'TRY'
  },
  {
    id: 'sig-msft-01',
    symbol: 'MSFT',
    name: 'Microsoft Corp',
    market: 'US',
    strategy: 'trend_following',
    signalDate: '2026-09-11',
    entryPrice: 428.00,
    stopLoss: 415.00,
    targetPrice: 455.00,
    confidence: 8.4,
    riskReward: 2.08,
    aiRationale: 'Cloud AI recurring revenue expansion holding 50 EMA trend support.',
    status: 'target_hit',
    outcomePnlPct: 6.31,
    closedAt: '2026-09-25',
    currency: 'USD'
  },
  {
    id: 'sig-amzn-01',
    symbol: 'AMZN',
    name: 'Amazon.com Inc',
    market: 'US',
    strategy: 'volatility_breakout',
    signalDate: '2026-09-09',
    entryPrice: 182.50,
    stopLoss: 175.00,
    targetPrice: 198.00,
    confidence: 8.3,
    riskReward: 2.07,
    aiRationale: 'E-commerce and cloud margins breakout above Q2 earnings gap.',
    status: 'target_hit',
    outcomePnlPct: 8.49,
    closedAt: '2026-09-24',
    currency: 'USD'
  },
  {
    id: 'sig-googl-01',
    symbol: 'GOOGL',
    name: 'Alphabet Inc',
    market: 'US',
    strategy: '50_ema_pullback',
    signalDate: '2026-09-15',
    entryPrice: 161.20,
    stopLoss: 155.00,
    targetPrice: 174.00,
    confidence: 8.1,
    riskReward: 2.06,
    aiRationale: 'Testing support following valuation reset, RSI turned up from 41.',
    status: 'target_hit',
    outcomePnlPct: 7.94,
    closedAt: '2026-09-28',
    currency: 'USD'
  },
  {
    id: 'sig-meta-01',
    symbol: 'META',
    name: 'Meta Platforms',
    market: 'US',
    strategy: 'volatility_breakout',
    signalDate: '2026-09-08',
    entryPrice: 512.00,
    stopLoss: 492.00,
    targetPrice: 560.00,
    confidence: 9.1,
    riskReward: 2.40,
    aiRationale: 'Ad monetization efficiency reaching clean all-time high expansion.',
    status: 'target_hit',
    outcomePnlPct: 9.38,
    closedAt: '2026-09-22',
    currency: 'USD'
  },
  {
    id: 'sig-tsla-01',
    symbol: 'TSLA',
    name: 'Tesla Inc',
    market: 'US',
    strategy: 'volatility_breakout',
    signalDate: '2026-09-18',
    entryPrice: 245.00,
    stopLoss: 232.00,
    targetPrice: 275.00,
    confidence: 6.8,
    riskReward: 2.31,
    aiRationale: 'Delivery volatility triggered disciplined stop loss at 232.',
    status: 'stopped_out',
    outcomePnlPct: -5.31,
    closedAt: '2026-09-23',
    currency: 'USD'
  },
  {
    id: 'sig-spy-01',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF',
    market: 'US',
    strategy: 'trend_following',
    signalDate: '2026-09-10',
    entryPrice: 552.00,
    stopLoss: 542.00,
    targetPrice: 574.00,
    confidence: 8.9,
    riskReward: 2.20,
    aiRationale: 'Macro benchmark maintaining disciplined bull channel above 20 EMA.',
    status: 'target_hit',
    outcomePnlPct: 3.99,
    closedAt: '2026-09-27',
    currency: 'USD'
  },
  {
    id: 'sig-qqq-01',
    symbol: 'QQQ',
    name: 'Invesco QQQ Trust',
    market: 'US',
    strategy: 'trend_following',
    signalDate: '2026-09-10',
    entryPrice: 472.00,
    stopLoss: 461.00,
    targetPrice: 496.00,
    confidence: 8.8,
    riskReward: 2.18,
    aiRationale: 'Tech index expansion confirming higher lows on daily chart.',
    status: 'target_hit',
    outcomePnlPct: 5.08,
    closedAt: '2026-09-26',
    currency: 'USD'
  }
];

const VALID_TABS: TabId[] = ['signals', 'assistant', 'watchlist', 'portfolio', 'dividend', 'forecast', 'scorecard', 'orb', 'catalysts', 'quant', 'help'];

export default function Home() {
  const { language, setLanguage, t } = useLanguage();
  const { user, isDemoMode, signOut } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('signals');
  const [geminiApiKey, setGeminiApiKey] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setGeminiApiKey(localStorage.getItem('gemini_api_key') || '');
      const params = new URLSearchParams(window.location.search);
      const queryTab = params.get('tab')?.trim().toLowerCase() as TabId;
      const hash = window.location.hash.replace('#', '').trim().toLowerCase() as TabId;
      if (VALID_TABS.includes(queryTab)) {
        setActiveTab(queryTab);
      } else if (VALID_TABS.includes(hash)) {
        setActiveTab(hash);
      } else {
        const savedTab = localStorage.getItem('market_pulse_active_tab') as TabId;
        if (VALID_TABS.includes(savedTab)) {
          setActiveTab(savedTab);
        }
      }

      const handleHashChange = () => {
        const hash = window.location.hash.replace('#', '').trim().toLowerCase() as TabId;
        if (VALID_TABS.includes(hash)) {
          setActiveTab(hash);
        }
      };
      window.addEventListener('hashchange', handleHashChange);
      window.addEventListener('popstate', handleHashChange);
      return () => {
        window.removeEventListener('hashchange', handleHashChange);
        window.removeEventListener('popstate', handleHashChange);
      };
    }
  }, []);

  const handleTabChange = (newTab: TabId) => {
    setActiveTab(newTab);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('market_pulse_active_tab', newTab);
        if (window.location.hash.replace('#', '').trim().toLowerCase() !== newTab) {
          window.history.replaceState(null, '', `#${newTab}`);
        }
      } catch (e) {
        // Ignore
      }
    }
  };

  const [usRegime, setUsRegime] = useState<RegimeStatus | undefined>({
    status: 'Bearish', close: 766.81, trend: 'down'
  });
  const [bistRegime, setBistRegime] = useState<RegimeStatus | undefined>({
    status: 'Neutral', close: 11591.54, trend: 'up'
  });
  const [signals, setSignals] = useState<TradeSignal[]>(INITIAL_SIGNALS);
  const [signalFilter, setSignalFilter] = useState<'ALL' | 'TODAY' | 'BUY_ZONE' | 'TARGET_HIT' | 'RECOVERED' | 'BIST' | 'US'>('ALL');
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState<string>('ALL');
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(INITIAL_PORTFOLIO);
  const [dividends, setDividends] = useState<DividendAsset[]>(INITIAL_DIVIDENDS);
  const [dividendSummaries, setDividendSummaries] = useState<any[]>([]);

  const dividendSummaryMap = useMemo(() => {
    const map = new Map<string, any>();
    dividendSummaries.forEach(d => {
      const sym = (d.symbol || '').replace('.IS', '').trim().toUpperCase();
      if (sym) {
        map.set(sym, d);
        map.set(`${sym}.IS`, d);
      }
    });
    return map;
  }, [dividendSummaries]);
  const [strategies, setStrategies] = useState<StrategyStat[]>(INITIAL_STRATEGIES);
  const [orbItems, setOrbItems] = useState<OpeningDirectionItem[]>(INITIAL_ORB);
  const [usdTryRate, setUsdTryRate] = useState<number>(48.95);
  const [cashBalance, setCashBalance] = useState<number>(() => calculateLedgerCash(INITIAL_ORDERS, INITIAL_TRANSFERS, 48.95).availableCashTRY);

  const totalPortfolioValueTRY = useMemo(() => {
    const validHoldings = (portfolio || []).filter(item => item && Number(item.shares) > 0 && Number(item.currentValue) > 0);
    const stockVal = validHoldings.reduce((acc, item) => {
      const val = Number(item.currentValue);
      return acc + (item.currency === 'USD' ? val * usdTryRate : val);
    }, 0);
    return stockVal + (cashBalance > 0 ? cashBalance : 0);
  }, [portfolio, usdTryRate, cashBalance]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHoldingModalOpen, setIsHoldingModalOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<PortfolioItem | null>(null);
  const [selectedAssetForHistory, setSelectedAssetForHistory] = useState<AssetData | null>(null);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>(INITIAL_REALIZED_TRADES);
  const [executedOrders, setExecutedOrders] = useState<ExecutedOrder[]>(INITIAL_ORDERS);
  const [transfers, setTransfers] = useState<CapitalTransfer[]>(INITIAL_TRANSFERS);
  const [scannedSignals, setScannedSignals] = useState<ScannedTradeSignal[]>(INITIAL_SCANNED_SIGNALS);
  const [catalysts, setCatalysts] = useState<MarketCatalyst[]>(() => generateMarketDividendCatalysts());
  const [calcTrade, setCalcTrade] = useState<{ entryPrice: number; stopLoss: number; targetPrice?: number; currency: 'USD' | 'TRY'; symbol?: string } | null>(null);
  const [isCalcModalOpen, setIsCalcModalOpen] = useState<boolean>(false);
  const [coPilotAsset, setCoPilotAsset] = useState<CoPilotAssetContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !navigator.onLine;
    }
    return false;
  });
  const [turmoilGuard, setTurmoilGuard] = useState<boolean>(false);
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>(getDateRangeFromPreset('ALL'));
  const [isDateFilterExpanded, setIsDateFilterExpanded] = useState<boolean>(false);
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isSimpleMode, setIsSimpleMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('marketpulse_simple_mode');
      return saved !== null ? saved === 'true' : true; // Default to true for beginners
    }
    return true;
  });

  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('marketpulse_right_panel_open');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const handleToggleRightPanel = () => {
    setIsRightPanelOpen(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('marketpulse_right_panel_open', String(next));
      }
      return next;
    });
  };

  const handleToggleSimpleMode = () => {
    setIsSimpleMode(prev => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('marketpulse_simple_mode', String(next));
      }
      return next;
    });
  };

  const handleDateFilterChange = (newFilter: DateRangeFilter) => {
    setDateFilter(newFilter);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('market_pulse_date_preset', newFilter.preset);
        if (newFilter.startDate) localStorage.setItem('market_pulse_date_start', newFilter.startDate);
        else localStorage.removeItem('market_pulse_date_start');
        if (newFilter.endDate) localStorage.setItem('market_pulse_date_end', newFilter.endDate);
        else localStorage.removeItem('market_pulse_date_end');
      } catch (e) {
        // Ignore
      }
    }
  };

  // Keep Dividend Cashflow automatically and 100% synchronized with live portfolio holdings
  useEffect(() => {
    setDividends(prev => deriveDividendsFromPortfolio(portfolio, prev, dividendSummaryMap));
  }, [portfolio, dividendSummaryMap]);

  // Derive market-wide dividend universe cross-referenced with live database records and portfolio holdings
  const allMarketDividends = useMemo(() => {
    const livePrices: Record<string, number> = {};
    assets.forEach(a => {
      if (a.price && a.price > 0) livePrices[a.symbol.replace('.IS', '').toUpperCase()] = a.price;
    });
    portfolio.forEach(p => {
      if (p.currentPrice && p.currentPrice > 0) livePrices[p.symbol.replace('.IS', '').toUpperCase()] = p.currentPrice;
    });
    return deriveAllMarketDividends(portfolio, livePrices, dividendSummaries);
  }, [portfolio, assets, dividendSummaries]);

  const handleSelectTicker = (symbol: string) => {
    const clean = symbol.replace('.IS', '').toUpperCase();
    const matched = assets.find(a => a.symbol.replace('.IS', '').toUpperCase() === clean);
    const portItem = portfolio.find(p => p.symbol.replace('.IS', '').toUpperCase() === clean);
    const sigItem = signals.find(s => s.symbol.replace('.IS', '').toUpperCase() === clean);

    const price = (matched?.price && matched.price > 0)
      ? matched.price
      : (portItem?.currentPrice && portItem.currentPrice > 0)
        ? portItem.currentPrice
        : (sigItem?.currentPrice && sigItem.currentPrice > 0)
          ? sigItem.currentPrice
          : (portItem?.entryPrice || 0);

    const changePct = matched?.changePercent !== undefined && matched.changePercent !== 0
      ? matched.changePercent
      : sigItem?.changePercent !== undefined
        ? sigItem.changePercent
        : (portItem?.pnlPercent || 0);

    const name = matched?.name || portItem?.name || sigItem?.name || clean;
    const market = matched?.market || portItem?.market || sigItem?.market || (clean.length === 5 || symbol.endsWith('.IS') ? 'BIST' : 'US');

    setSelectedAssetForHistory({
      id: matched?.id || symbol,
      symbol: clean,
      name: name,
      market: market,
      price: price,
      changePercent: changePct,
      rsi: matched?.rsi || 50,
      emaStatus: matched?.emaStatus || 'Active Signal',
      volumeRatio: matched?.volumeRatio || 1.0,
      high52w: matched?.high52w,
      low52w: matched?.low52w
    });
  };

  // Fetch real data from Supabase
  const loadData = async (isManualSync: boolean = false) => {
    try {
      if (isManualSync) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      // 1. Fetch Dynamic Real-Time Market Regimes via dedicated /api/market/regime with Supabase fallback
      try {
        const regimeApiRes = await fetch('/api/market/regime', {
          headers: { 'Content-Type': 'application/json' },
        });
        if (regimeApiRes.ok) {
          const regData = await regimeApiRes.json();
          if (regData.us) {
            setUsRegime({
              status: regData.us.status,
              close: Number(regData.us.close),
              trend: regData.us.trend,
              changePct: regData.us.changePct,
              return5d: regData.us.return5d,
              descriptionTr: regData.us.descriptionTr,
              descriptionEn: regData.us.descriptionEn,
              isCorrection: regData.us.isCorrection,
            });
          }
          if (regData.bist) {
            setBistRegime({
              status: regData.bist.status,
              close: Number(regData.bist.close),
              trend: regData.bist.trend,
              changePct: regData.bist.changePct,
              return5d: regData.bist.return5d,
              descriptionTr: regData.bist.descriptionTr,
              descriptionEn: regData.bist.descriptionEn,
              isCorrection: regData.bist.isCorrection,
            });
          }
        } else {
          throw new Error('API returned non-200');
        }
      } catch (err) {
        // Fallback: Read from Supabase market_regime table
        const [usRes, bistRes] = await Promise.all([
          supabase.from('market_regime').select('*').eq('market', 'US').order('date', { ascending: false }).limit(1),
          supabase.from('market_regime').select('*').eq('market', 'BIST').order('date', { ascending: false }).limit(1),
        ]);
        if (usRes.data && usRes.data.length > 0) {
          const us = usRes.data[0];
          const usStatus = us.regime === 'bullish' ? 'Bullish' : us.regime === 'bearish' ? 'Bearish' : 'Neutral';
          setUsRegime({
            status: usStatus,
            close: Number(us.index_close) || 735.29,
            trend: us.regime === 'bullish' ? 'up' : us.regime === 'bearish' ? 'down' : 'flat',
            descriptionTr: us.notes || (usStatus === 'Bearish' ? 'Düzeltme ve kâr satışı modu' : 'Dengeleme ve toparlanma'),
            descriptionEn: us.notes || (usStatus === 'Bearish' ? 'Correction & pullback mode' : 'Consolidation & recovery'),
            isCorrection: usStatus === 'Bearish',
          });
        }
        if (bistRes.data && bistRes.data.length > 0) {
          const bist = bistRes.data[0];
          const bistStatus = bist.regime === 'bullish' ? 'Bullish' : bist.regime === 'bearish' ? 'Bearish' : 'Neutral';
          setBistRegime({
            status: bistStatus,
            close: Number(bist.index_close) || 11530.18,
            trend: bist.regime === 'bullish' ? 'up' : bist.regime === 'bearish' ? 'down' : 'flat',
            descriptionTr: bist.notes || (bistStatus === 'Bearish' ? 'Düzeltme ve kâr satışı modu' : 'Dengeleme ve toparlanma'),
            descriptionEn: bist.notes || (bistStatus === 'Bearish' ? 'Correction & pullback mode' : 'Consolidation & recovery'),
            isCorrection: bistStatus === 'Bearish',
          });
        }
      }

      // 1.1 Fetch FX rate
      try {
        const fxRes = await supabase.from('fx_rates').select('rate').eq('pair', 'USDTRY').order('date', { ascending: false }).limit(1);
        if (fxRes.data && fxRes.data.length > 0 && fxRes.data[0].rate) {
          setUsdTryRate(Number(fxRes.data[0].rate));
        }
      } catch {
        // Ignore FX error
      }

        // 2. Fetch Assets & Indicators & Live Price Feeds directly from verified v_latest_prices
        // (Fetch in two 1,000-row ranges to bypass PostgREST max-rows cap)
        const [
          p1Res,
          p2Res,
          { data: orbRecords },
          { data: divSummaryData, error: divSummaryErr }
        ] = await Promise.all([
          supabase
            .from('v_latest_prices')
            .select(`
              asset_id, symbol, name, market, currency, sector,
              latest_price, latest_date, open, high, low, volume,
              rsi_14, volume_ratio, high_52w, low_52w, ema_200
            `)
            .order('symbol', { ascending: true })
            .range(0, 999),
          supabase
            .from('v_latest_prices')
            .select(`
              asset_id, symbol, name, market, currency, sector,
              latest_price, latest_date, open, high, low, volume,
              rsi_14, volume_ratio, high_52w, low_52w, ema_200
            `)
            .order('symbol', { ascending: true })
            .range(1000, 1999),
          supabase
            .from('opening_direction')
            .select('symbol, current_price, prev_close, gap_percent, gap_type, orb_status, bias, volume_spike, date')
            .order('date', { ascending: false })
            .limit(600),
          supabase
            .from('v_dividend_summary')
            .select('*')
            .limit(2000)
        ]);

        const latestPricesData = [...(p1Res.data || []), ...(p2Res.data || [])];
        const pricesFetchErr = p1Res.error || p2Res.error;

        if (divSummaryData && divSummaryData.length > 0) {
          setDividendSummaries(divSummaryData);
        }

        if (pricesFetchErr) {
          console.warn('Warning: Could not fetch v_latest_prices in page.tsx:', pricesFetchErr.message);
        }

        const orbBySymbol = new Map<string, { currentPrice: number; prevClose: number; changePercent: number; date: string }>();
        if (orbRecords) {
          for (const orb of orbRecords) {
            const sym = (orb.symbol || '').replace('.IS', '').toUpperCase();
            if (!orbBySymbol.has(sym)) {
              const curr = Number(orb.current_price) || 0;
              const prev = Number(orb.prev_close) || curr;
              const chg = typeof orb.gap_percent === 'number' ? orb.gap_percent : (prev > 0 ? ((curr - prev) / prev) * 100 : 0);
              orbBySymbol.set(sym, {
                currentPrice: curr,
                prevClose: prev,
                changePercent: chg,
                date: orb.date
              });
            }
          }
        }

        let loadedAssets: AssetData[] = [];
        if (latestPricesData && latestPricesData.length > 0) {
          const mapped: AssetData[] = latestPricesData.map((p: any) => {
            const cleanSym = (p.symbol || '').replace('.IS', '').toUpperCase();
            const latestPrice = Number(p.latest_price) || 0;
            const openPrice = Number(p.open) || latestPrice;
            const changePct = openPrice > 0 ? ((latestPrice - openPrice) / openPrice) * 100 : 0;
            const ema200 = Number(p.ema_200) || latestPrice;
            const emaStatus = latestPrice >= ema200 ? 'Above 200 EMA' : 'Below 200 EMA';

            return {
              id: p.asset_id,
              symbol: cleanSym,
              name: p.name || cleanSym,
              market: (p.market || 'BIST') as any,
              price: latestPrice,
              changePercent: Number(changePct.toFixed(2)),
              rsi: Number(p.rsi_14) || 50,
              emaStatus: emaStatus as any,
              volumeRatio: Number(p.volume_ratio) || 1.0,
              high52w: p.high_52w ? Number(p.high_52w) : undefined,
              low52w: p.low_52w ? Number(p.low_52w) : undefined
            };
          });
          loadedAssets = mapped;
          setAssets(mapped);
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('market_pulse_cached_assets', JSON.stringify(mapped));
            }
          } catch (e) {}
        } else {
          generateFallbackAssets();
        }

        let allSignalsRegistry: ScannedTradeSignal[] = [...INITIAL_SCANNED_SIGNALS];

        // 3. Fetch All Trade Signals (Open + Resolved Audit Ledger) & Recovery Tracking Data
        const [
          { data: allSigData },
          { data: recoveryTrackingData },
          { data: recoveryEventsData }
        ] = await Promise.all([
          supabase.from('trade_signals').select('*, assets(symbol, name, market)').order('signal_date', { ascending: false }),
          supabase.from('signal_recovery_tracking').select('*'),
          supabase.from('signal_recovery_events').select('*'),
        ]);

        const eventsBySignal: Record<string, any[]> = (recoveryEventsData || []).reduce((acc: any, ev: any) => {
          if (!acc[ev.signal_id]) acc[ev.signal_id] = [];
          acc[ev.signal_id].push({
            eventType: ev.event_type,
            eventDate: ev.event_date,
            referenceLevel: Number(ev.reference_level),
            observedPrice: Number(ev.observed_price),
            sessionsSinceSignal: Number(ev.sessions_since_signal),
            sessionsSinceExit: Number(ev.sessions_since_exit),
          });
          return acc;
        }, {});

        const trackingBySignal: Record<string, any> = (recoveryTrackingData || []).reduce((acc: any, tr: any) => {
          acc[tr.signal_id] = {
            originalExitDate: tr.original_exit_date,
            originalExitStatus: tr.original_exit_status,
            entryReference: Number(tr.entry_reference),
            prePullbackLevel: tr.pre_pullback_level ? Number(tr.pre_pullback_level) : null,
            originalTarget1: tr.original_target_1 ? Number(tr.original_target_1) : null,
            originalTarget2: tr.original_target_2 ? Number(tr.original_target_2) : null,
            trackingStatus: tr.tracking_status,
            hasRecoveredEntry: Boolean(tr.has_recovered_entry),
            hasRecoveredPrePullback: Boolean(tr.has_recovered_pre_pullback),
            hasReachedTargetAfterExit: Boolean(tr.has_reached_target_after_exit),
            events: eventsBySignal[tr.signal_id] || [],
          };
          return acc;
        }, {});

        if (allSigData && allSigData.length > 0) {
          const mappedAll: ScannedTradeSignal[] = allSigData.map((s: any) => {
            const cleanSym = s.assets?.symbol?.replace('.IS', '') || 'ASSET';
            const matchedAsset = loadedAssets.find((a: AssetData) => a.symbol.replace('.IS', '').toUpperCase() === cleanSym.toUpperCase());
            const safeEntry = Number(s.entry_price) > 0 ? Number(s.entry_price) : (matchedAsset ? matchedAsset.price : 81.15);
            const safeStop = Number(s.stop_loss) > 0 ? Number(s.stop_loss) : Number((safeEntry * 0.95).toFixed(2));
            const safeTarget = Number(s.target_1) > 0 ? Number(s.target_1) : Number((safeEntry + 2 * Math.abs(safeEntry - safeStop)).toFixed(2));

            let triggerReasons: string[] = s.trigger_reasons || [];
            let failedChecks: string[] = s.failed_checks || [];
            let invalidationRule: string | undefined = s.invalidation;
            let marketContextObj = s.market_context;
            let riskObj = s.risk;
            let displayRationale = s.ai_rationale || 'Autonomous strategy trigger confirmed.';
            let entryModeStr = s.entry_mode || 'next_open';
            let directionStr = s.direction || 'LONG';
            let isReconfirmed = false;
            let lastConfirmedDate: string | undefined = undefined;

            let aiConvictionVal: number | undefined = undefined;

            if (s.ai_rationale && s.ai_rationale.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(s.ai_rationale);
                if (Array.isArray(parsed.trigger_reasons)) triggerReasons = parsed.trigger_reasons;
                if (Array.isArray(parsed.failed_checks)) failedChecks = parsed.failed_checks;
                if (parsed.invalidation) invalidationRule = parsed.invalidation;
                if (parsed.market_context) marketContextObj = parsed.market_context;
                if (parsed.risk) riskObj = parsed.risk;
                if (parsed.rationale) displayRationale = parsed.rationale;
                if (parsed.entry_mode) entryModeStr = parsed.entry_mode;
                if (parsed.direction) directionStr = parsed.direction;
                if (parsed.last_reconfirmed_date) {
                  isReconfirmed = true;
                  lastConfirmedDate = parsed.last_reconfirmed_date;
                }
                if (parsed.ai_conviction_score !== undefined && parsed.ai_conviction_score !== null) {
                  const num = Number(parsed.ai_conviction_score);
                  if (Number.isFinite(num) && num > 0) {
                    aiConvictionVal = Math.min(100, Math.max(0, Math.round(num)));
                  }
                }
              } catch (e) {}
            }

            // Confidence score is standardized to 0-100 in database storage
            // Represents algorithmic Setup Quality ONLY.
            // Strict range validation with Number.isFinite(): reject NaN/Infinity/negative and clamp to [0, 100]
            const rawConf = s.confidence_score !== null && s.confidence_score !== undefined ? Number(s.confidence_score) : 0;
            const standardizedConf = typeof rawConf === 'number' && Number.isFinite(rawConf)
              ? Math.min(100, Math.max(0, Math.round(rawConf)))
              : 0;

            return {
              id: s.id,
              symbol: cleanSym,
              name: s.assets?.name || s.assets?.symbol || cleanSym,
              market: s.assets?.market || 'BIST',
              strategy: s.strategy,
              signalDate: s.signal_date,
              entryPrice: safeEntry,
              stopLoss: safeStop,
              targetPrice: safeTarget,
              riskReward: Number(s.risk_reward_ratio) || 2.0,
              confidence: standardizedConf,
              aiConvictionScore: aiConvictionVal,
              status: s.status,
              outcomePnlPct: s.outcome_pnl_pct !== null && s.outcome_pnl_pct !== undefined ? Number(s.outcome_pnl_pct) : null,
              closedAt: s.closed_at,
              recoveryTracking: trackingBySignal[s.id] || undefined,
              aiRationale: displayRationale,
              currency: s.assets?.market === 'US' ? 'USD' : 'TRY',
              direction: directionStr,
              entryMode: entryModeStr,
              target1: Number(s.target_1) || safeTarget,
              target2: Number(s.target_2) || undefined,
              triggerReasons: triggerReasons,
              failedChecks: failedChecks,
              invalidation: invalidationRule,
              marketContext: marketContextObj,
              risk: riskObj,
              isReconfirmed: isReconfirmed,
              lastConfirmedDate: lastConfirmedDate
            };
          });

          // Merge live database signals with comprehensive historical audit ledger
          const combinedSignals = [...mappedAll];
          INITIAL_SCANNED_SIGNALS.forEach(initSig => {
            const exists = combinedSignals.some(s =>
              s.id === initSig.id ||
              (s.symbol.replace('.IS', '').toUpperCase() === initSig.symbol.replace('.IS', '').toUpperCase() && s.strategy === initSig.strategy && s.signalDate === initSig.signalDate)
            );
            if (!exists) {
              combinedSignals.push(initSig);
            }
          });
          allSignalsRegistry = combinedSignals;
          setScannedSignals(combinedSignals);

          // Group open signals by cleanSymbol to merge multi-day triggers into persistent active trade setups
          const signalGroups: Record<string, typeof combinedSignals> = {};
          combinedSignals
            .filter(s => s.status === 'open')
            .forEach(s => {
              const cleanSym = s.symbol.replace('.IS', '').toUpperCase();
              if (!signalGroups[cleanSym]) signalGroups[cleanSym] = [];
              signalGroups[cleanSym].push(s);
            });

          const openSignals = Object.values(signalGroups).map(group => {
            // Sort by signalDate ascending: earliest is original trigger, latest is recent
            group.sort((a, b) => new Date(a.signalDate).getTime() - new Date(b.signalDate).getTime());
            const earliest = group[0];
            const latest = group[group.length - 1];

            const cleanSym = earliest.symbol.replace('.IS', '').toUpperCase();
            const matchedAsset = loadedAssets.find((a: AssetData) => a.symbol.replace('.IS', '').toUpperCase() === cleanSym);

            const effEntry = earliest.entryPrice > 0 ? earliest.entryPrice : (matchedAsset ? matchedAsset.price : 81.15);
            const effStop = earliest.stopLoss > 0 ? earliest.stopLoss : Number((effEntry * 0.95).toFixed(2));
            const effTarget = earliest.targetPrice > 0 ? earliest.targetPrice : Number((effEntry + 2 * Math.abs(effEntry - effStop)).toFixed(2));

            const todayStr = new Date().toISOString().slice(0, 10);
            const originalDate = earliest.signalDate;
            const lastDate = latest.signalDate;
            const diffDays = Math.max(0, Math.round((new Date(todayStr).getTime() - new Date(originalDate).getTime()) / 86400000));
            const isMultiDay = Boolean(group.length > 1 || diffDays >= 1 || (earliest.aiRationale && earliest.aiRationale.includes('RE-CONFIRMED')));
            const daysInZone = isMultiDay ? Math.max(2, diffDays + 1) : 1;

            const triggerHistory = group.map((item, idx) => ({
              id: item.id || `trig-${idx}`,
              date: item.signalDate,
              entryPrice: item.entryPrice > 0 ? item.entryPrice : effEntry,
              stopLoss: item.stopLoss > 0 ? item.stopLoss : effStop,
              targetPrice: item.targetPrice > 0 ? item.targetPrice : effTarget,
              confidence: typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? Math.min(100, Math.max(0, Math.round(item.confidence))) : 0,
              rationale: item.aiRationale
            }));

            return {
              id: latest.id,
              symbol: earliest.symbol,
              name: earliest.name,
              strategy: earliest.strategy.replace('_', ' ').toUpperCase(),
              entryPrice: effEntry, // Keep validated entry price of the setup
              stopLoss: effStop,
              targetPrice: effTarget,
              confidence: typeof latest.confidence === 'number' && Number.isFinite(latest.confidence) ? Math.min(100, Math.max(0, Math.round(latest.confidence))) : 0,
              aiConvictionScore: latest.aiConvictionScore,
              rationale: latest.aiRationale,
              market: earliest.market,
              date: originalDate,
              lastConfirmedDate: lastDate,
              isReconfirmed: isMultiDay,
              daysInZone: daysInZone,
              currency: earliest.currency,
              currentPrice: matchedAsset ? matchedAsset.price : effEntry,
              changePercent: matchedAsset ? matchedAsset.changePercent : 0,
              triggerHistory: triggerHistory,
              direction: latest.direction || 'LONG',
              entryMode: latest.entryMode || 'next_open',
              target1: latest.target1 || effTarget,
              target2: latest.target2,
              triggerReasons: latest.triggerReasons,
              failedChecks: latest.failedChecks,
              invalidation: latest.invalidation,
              marketContext: latest.marketContext,
              risk: latest.risk,
              status: latest.status,
              outcomePnlPct: latest.outcomePnlPct,
              closedAt: latest.closedAt,
              recoveryTracking: latest.recoveryTracking
            };
          });

          // Map recovered closed signals
          const recoveredSignals = combinedSignals
            .filter(s => s.status !== 'open' && s.recoveryTracking && (
              s.recoveryTracking.hasRecoveredEntry || 
              s.recoveryTracking.hasRecoveredPrePullback || 
              s.recoveryTracking.hasReachedTargetAfterExit
            ))
            .map(s => {
              const cleanSym = s.symbol.replace('.IS', '').toUpperCase();
              const matchedAsset = loadedAssets.find((a: AssetData) => a.symbol.replace('.IS', '').toUpperCase() === cleanSym);
              const effEntry = s.entryPrice > 0 ? s.entryPrice : (matchedAsset ? matchedAsset.price : 81.15);
              const effStop = s.stopLoss > 0 ? s.stopLoss : Number((effEntry * 0.95).toFixed(2));
              const effTarget = s.targetPrice > 0 ? s.targetPrice : Number((effEntry + 2 * Math.abs(effEntry - effStop)).toFixed(2));

              return {
                id: s.id,
                symbol: s.symbol,
                name: s.name,
                strategy: s.strategy.replace('_', ' ').toUpperCase(),
                entryPrice: effEntry,
                stopLoss: effStop,
                targetPrice: effTarget,
                confidence: typeof s.confidence === 'number' && Number.isFinite(s.confidence) ? Math.min(100, Math.max(0, Math.round(s.confidence))) : 0,
                aiConvictionScore: s.aiConvictionScore,
                rationale: s.aiRationale,
                market: s.market,
                date: s.signalDate,
                lastConfirmedDate: s.lastConfirmedDate || s.signalDate,
                isReconfirmed: s.isReconfirmed || false,
                daysInZone: 1,
                currency: s.currency,
                currentPrice: matchedAsset ? matchedAsset.price : effEntry,
                changePercent: matchedAsset ? matchedAsset.changePercent : 0,
                direction: s.direction || 'LONG',
                entryMode: s.entryMode || 'next_open',
                target1: s.target1 || effTarget,
                target2: s.target2,
                triggerReasons: s.triggerReasons,
                failedChecks: s.failedChecks,
                invalidation: s.invalidation,
                marketContext: s.marketContext,
                risk: s.risk,
                status: s.status,
                outcomePnlPct: s.outcomePnlPct,
                closedAt: s.closedAt,
                recoveryTracking: s.recoveryTracking
              };
            });

          const allMappedSignals = [...openSignals, ...recoveredSignals];
          if (allMappedSignals.length > 0) {
            setSignals(allMappedSignals);
            try {
              if (typeof window !== 'undefined') {
                localStorage.setItem('market_pulse_cached_signals', JSON.stringify(allMappedSignals));
              }
            } catch (e) {}
          }
        }

        // 3.5 Fetch Market Catalysts & KAP Disclosures
        const { data: catData } = await supabase
          .from('market_catalysts')
          .select('*')
          .order('published_at', { ascending: false });

        const marketDividendCats = generateMarketDividendCatalysts();
        if (catData && catData.length > 0) {
          const mappedCat: MarketCatalyst[] = catData.map((c: any) => ({
            id: c.id,
            symbol: c.symbol,
            market: c.market || 'BIST',
            category: c.category,
            title: c.title,
            details: c.details,
            aiVerdict: c.ai_verdict || 'Bullish',
            aiTakeaway: c.ai_takeaway || 'Positive catalyst.',
            impactScore: Number(c.impact_score) || 8.0,
            sourceUrl: c.source_url,
            publishedAt: c.published_at
          }));
          const mergedCat = [...mappedCat];
          marketDividendCats.forEach(mdc => {
            if (!mergedCat.some(c => c.id === mdc.id || (c.symbol === mdc.symbol && c.category === 'DIVIDEND' && c.publishedAt.slice(0, 10) === mdc.publishedAt.slice(0, 10)))) {
              mergedCat.push(mdc);
            }
          });
          setCatalysts(mergedCat);
        } else {
          setCatalysts(marketDividendCats);
        }

        // 3.6 Fetch Opening Range Breakout (15m ORB) & Gaps from Supabase
        try {
          const { data: orbData } = await supabase
            .from('opening_direction')
            .select('*')
            .order('date', { ascending: false });

          if (orbData && orbData.length > 0) {
            // Deduplicate by symbol keeping the latest record (ordered by date desc)
            const seenSymbols = new Set<string>();
            const uniqueOrbData = orbData.filter((item: any) => {
              const cleanSym = (item.symbol || '').replace('.IS', '').toUpperCase();
              if (seenSymbols.has(cleanSym)) return false;
              seenSymbols.add(cleanSym);
              return true;
            });
            const sortedOrb = [...uniqueOrbData].sort((a: any, b: any) => Math.abs(Number(b.gap_percent)) - Math.abs(Number(a.gap_percent)));
            const mappedOrb: OpeningDirectionItem[] = sortedOrb.map((item: any) => ({
              symbol: (item.symbol || '').replace('.IS', ''),
              market: item.market || 'BIST',
              gapPercent: Number(item.gap_percent) || 0,
              gapType: item.gap_type || 'Flat Open',
              orbStatus: item.orb_status || 'Inside Range',
              bias: item.bias || 'Neutral',
              volumeSpike: Boolean(item.volume_spike)
            }));
            setOrbItems(mappedOrb);
          } else if (loadedAssets.length > 0) {
            const dynamicOrb: OpeningDirectionItem[] = loadedAssets.map(a => {
              const gapPct = a.changePercent || 0;
              let gapType: 'Gap Up & Go' | 'Gap & Fade' | 'Flat Open' | 'Gap Down' = 'Flat Open';
              let orbStatus: 'Broke High' | 'Broke Low' | 'Inside Range' = 'Inside Range';
              let bias: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' = 'Neutral';

              if (gapPct >= 0.75) {
                gapType = 'Gap Up & Go';
                orbStatus = 'Broke High';
                bias = 'Strong Bullish';
              } else if (gapPct <= -0.75) {
                gapType = 'Gap Down';
                orbStatus = 'Broke Low';
                bias = 'Bearish';
              } else if (gapPct > 0.2) {
                gapType = 'Gap Up & Go';
                orbStatus = 'Broke High';
                bias = 'Bullish';
              }

              return {
                symbol: a.symbol,
                market: a.market,
                gapPercent: Number(gapPct.toFixed(2)),
                gapType,
                orbStatus,
                bias,
                volumeSpike: Boolean((a.volumeRatio && a.volumeRatio >= 1.5) || Math.abs(gapPct) > 1.0)
              };
            }).sort((x, y) => Math.abs(y.gapPercent) - Math.abs(x.gapPercent));
            setOrbItems(dynamicOrb);
          }
        } catch (e) {
          console.warn('Error fetching opening direction:', e);
        }

        // 4. Fetch Executed Orders from Supabase (Scoped to logged-in user or Model Portfolio)
        const effectiveUserId = user?.id || ADMIN_USER_ID;
        let ordersQuery = supabase
          .from('portfolio_orders')
          .select('*')
          .or(`user_id.eq.${effectiveUserId},user_id.is.null`)
          .order('executed_at', { ascending: false });

        const { data: ordersData } = await ordersQuery;

        let loadedOrders: ExecutedOrder[] = [];
        if (ordersData && ordersData.length > 0) {
          const mappedOrders: ExecutedOrder[] = ordersData.map((o: any) => {
            const clean = o.symbol?.replace('.IS', '').toUpperCase();
            const matched = loadedAssets.find((a: AssetData) => a.symbol.replace('.IS', '').toUpperCase() === clean);
            const friendlyName = matched?.name || (
              clean === 'ISMEN' ? 'İş Yatırım Menkul Değerler' :
              clean === 'TURSG' ? 'Türkiye Sigorta' :
              clean === 'AKBNK' ? 'Akbank T.A.Ş.' :
              clean === 'HALKB' ? 'Halkbank' :
              clean === 'SOKM' ? 'Şok Marketler' : clean
            );

            return {
              id: o.id,
              ref: o.order_ref,
              symbol: clean,
              name: friendlyName,
              market: (matched?.market || (o.symbol?.endsWith('.IS') ? 'BIST' : 'BIST')) as any,
              side: o.side,
              orderType: o.order_type || 'Limit',
              quantity: Number(o.quantity),
              price: Number(o.price),
              totalValue: Number(o.total_amount),
              currency: o.currency || 'TRY',
              dateTime: new Date(o.executed_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' -'),
              executedAt: o.executed_at,
              status: o.status || 'Filled',
              dcaNote: o.notes
            };
          });
          loadedOrders = mappedOrders;
          setExecutedOrders(mappedOrders);

          // Reconstruct all Realized Trades dynamically from database SELL orders
          const reconstructedRealized: RealizedTrade[] = [];
          const sellOrders = ordersData.filter((o: any) => o.side === 'SELL');
          sellOrders.forEach((so: any) => {
            const clean = so.symbol?.replace('.IS', '').toUpperCase();
            const matched = loadedAssets.find((a: AssetData) => a.symbol.replace('.IS', '').toUpperCase() === clean);
            const friendlyName = matched?.name || (clean === 'KRDMD' ? 'Kardemir D' : clean);

            const qty = Number(so.quantity);
            const exitPr = Number(so.price);
            const sellTime = so.executed_at ? new Date(so.executed_at).getTime() : Date.now();

            // Find matching buy order(s) for that symbol that executed ON OR BEFORE this sell order
            const priorBuyOrders = ordersData.filter((b: any) => 
              b.side === 'BUY' && 
              b.symbol?.replace('.IS', '').toUpperCase() === clean &&
              (b.executed_at ? new Date(b.executed_at).getTime() : 0) <= sellTime
            );

            // Sort chronological ascending (oldest first for FIFO)
            priorBuyOrders.sort((a: any, b: any) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime());

            // Match exact quantity tranche if available, else nearest prior buy order
            const matchingBuy = priorBuyOrders.find((b: any) => Math.abs(Number(b.quantity) - qty) < 0.01) ||
                                (priorBuyOrders.length > 0 ? priorBuyOrders[priorBuyOrders.length - 1] : null);

            let avgEntry = matchingBuy ? Number(matchingBuy.price) : exitPr;
            let calcPnl = (exitPr - avgEntry) * qty;

            // Also check if notes contains verified P&L or cost basis (e.g. "Full swing profit taking (+₺376.38 / +7.56%)" or "Realized P&L: ₺+32.56")
            const notePnlMatch = so.notes?.match(/Realized P&L:\s*₺?([+-]?[\d,.]+)/i) || 
                                 so.notes?.match(/\(\+?₺?([+-]?[\d,.]+)\s*\/\s*([+-]?[\d,.]+)%\)/i);

            if (notePnlMatch && notePnlMatch[1]) {
              const parsedNotePnl = parseFloat(notePnlMatch[1].replace(',', ''));
              if (!isNaN(parsedNotePnl) && parsedNotePnl !== 0) {
                calcPnl = parsedNotePnl;
                avgEntry = Number(((exitPr * qty - calcPnl) / qty).toFixed(2));
              }
            }

            const calcPnlPct = avgEntry > 0 ? ((exitPr - avgEntry) / avgEntry) * 100 : 0;
            const cDate = so.executed_at ? so.executed_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
            const currSymbol = so.currency === 'USD' ? '$' : '₺';

            // Execution Discipline & Counterfactual Target Analysis
            const matchedSig = allSignalsRegistry.find(s => 
              s.symbol.replace('.IS', '').toUpperCase() === clean
            );
            const livePrice = matched?.price || exitPr;

            let recommendedTarget = matchedSig?.targetPrice && matchedSig.targetPrice > 0
              ? matchedSig.targetPrice
              : (avgEntry > 0 ? Number((avgEntry * 1.12).toFixed(2)) : exitPr);

            const targetPnl = (recommendedTarget - avgEntry) * qty;
            const targetPnlPercent = avgEntry > 0 ? ((recommendedTarget - avgEntry) / avgEntry) * 100 : 0;

            let verdict: 'TARGET_HIT' | 'PULLBACK_PROTECTED' | 'RUNNING' | 'STOPPED_OUT' | 'NO_SIGNAL' = 'RUNNING';
            let leftOnTable = 0;
            let aiNote = '';

            if (livePrice >= recommendedTarget) {
              verdict = 'TARGET_HIT';
              leftOnTable = targetPnl - calcPnl;
              aiNote = `Hedef (${currSymbol}${recommendedTarget.toFixed(2)}) vuruldu! Erken çıkış nedeniyle masada kâr bırakıldı.`;
            } else if (livePrice > exitPr) {
              verdict = 'RUNNING';
              leftOnTable = (livePrice - exitPr) * qty;
              aiNote = `Fiyat satışın üzerinde (${currSymbol}${livePrice.toFixed(2)}). Hedefe doğru ralli sürüyor.`;
            } else if (livePrice < exitPr) {
              verdict = 'PULLBACK_PROTECTED';
              leftOnTable = -((exitPr - livePrice) * qty); // negative means capital/profit protected
              aiNote = `Zamanlama başarılı! Satış sonrası fiyat ${currSymbol}${livePrice.toFixed(2)} seviyesine çekildi, kâr korundu.`;
            } else {
              verdict = 'RUNNING';
              leftOnTable = 0;
              aiNote = `Fiyat satış seviyesinde yatay seyrediyor (${currSymbol}${livePrice.toFixed(2)}).`;
            }

            let disciplineCapture = 100;
            if (targetPnl > 0) {
              disciplineCapture = Math.max(0, Number(((calcPnl / targetPnl) * 100).toFixed(1)));
            } else if (calcPnl < 0) {
              disciplineCapture = 0;
            }

            reconstructedRealized.push({
              id: `realized-${so.id || so.order_ref}`,
              symbol: clean,
              name: friendlyName,
              market: (matched?.market || (clean.endsWith('.IS') || so.currency === 'TRY' ? 'BIST' : 'US')) as any,
              currency: so.currency || 'TRY',
              sharesSold: qty,
              entryPrice: avgEntry,
              exitPrice: exitPr,
              realizedPnl: calcPnl,
              realizedPnlPercent: calcPnlPct,
              closeDate: cDate,
              recommendedTargetPrice: recommendedTarget,
              targetPnl: targetPnl,
              targetPnlPercent: targetPnlPercent,
              currentPrice: livePrice,
              leftOnTableAmount: leftOnTable,
              disciplineCapturePct: disciplineCapture,
              executionVerdict: verdict,
              aiTargetNote: aiNote
            });
          });

          setRealizedTrades(reconstructedRealized);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('market_pulse_cached_orders', JSON.stringify(loadedOrders));
              localStorage.setItem('market_pulse_cached_realized', JSON.stringify(reconstructedRealized));
            } catch (e) {}
          }
        } else {
          let hasLocalCache = false;
          if (typeof window !== 'undefined') {
            try {
              const cachedOrd = localStorage.getItem('market_pulse_cached_orders');
              const cachedReal = localStorage.getItem('market_pulse_cached_realized');
              if (cachedOrd) {
                const parsedOrd = JSON.parse(cachedOrd);
                if (Array.isArray(parsedOrd) && parsedOrd.length > 0) {
                  setExecutedOrders(parsedOrd);
                  loadedOrders = parsedOrd;
                  hasLocalCache = true;
                }
              }
              if (cachedReal) {
                const parsedReal = JSON.parse(cachedReal);
                if (Array.isArray(parsedReal) && parsedReal.length > 0) {
                  setRealizedTrades(parsedReal);
                }
              }
            } catch (e) {}
          }
          if (!hasLocalCache) {
            setExecutedOrders([]);
            setRealizedTrades([]);
          }
        }

        // 5. Fetch Capital Transfers from Supabase (Scoped to logged-in user or Model Portfolio)
        let transQuery = supabase
          .from('portfolio_transfers')
          .select('*')
          .or(`user_id.eq.${effectiveUserId},user_id.is.null`)
          .order('transfer_date', { ascending: false });

        const { data: transData } = await transQuery;

        let loadedTrans: CapitalTransfer[] = [];
        if (transData && transData.length > 0) {
          loadedTrans = transData.map((t: any) => ({
            id: t.id,
            transferType: t.transfer_type,
            amount: Number(t.amount),
            currency: t.currency || 'TRY',
            transferDate: t.transfer_date,
            notes: t.notes
          }));
          setTransfers(loadedTrans);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('marketpulse_cached_transfers', JSON.stringify(loadedTrans));
            } catch (e) {}
          }
        } else {
          let hasLocalTrans = false;
          if (typeof window !== 'undefined') {
            try {
              const cachedTr = localStorage.getItem('marketpulse_cached_transfers');
              if (cachedTr) {
                const parsed = JSON.parse(cachedTr);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setTransfers(parsed);
                  loadedTrans = parsed;
                  hasLocalTrans = true;
                }
              }
            } catch (e) {}
          }
          if (!hasLocalTrans) {
            setTransfers([]);
          }
        }

        // User Rule: Compute cash strictly as: (All Deposits + All Sells - All Buys)
        const dynamicLedger = calculateLedgerCash(loadedOrders, loadedTrans, usdTryRate);
        setCashBalance(dynamicLedger.availableCashTRY);

        // 6. Fetch Active Portfolio Positions from Supabase (Scoped to logged-in user or Model Portfolio)
        let positionsQuery = supabase
          .from('portfolio_positions')
          .select('*, assets(symbol, name, market)')
          .eq('is_open', true)
          .or(`user_id.eq.${effectiveUserId},user_id.is.null`)
          .order('created_at', { ascending: true });

        let { data: positionsData } = await positionsQuery;

        if (positionsData && positionsData.length > 0) {
          const mappedPortfolio: PortfolioItem[] = positionsData.map((pos: any) => {
            const rawSym = pos.assets?.symbol || 'UNKNOWN';
            const cleanSym = rawSym.replace('.IS', '');
            const matchedAsset = loadedAssets.find((a: AssetData) => a.id === pos.asset_id || a.symbol.replace('.IS', '').toUpperCase() === cleanSym.toUpperCase());
            const currPrice = matchedAsset ? matchedAsset.price : Number(pos.avg_entry_price);
            const shares = Number(pos.quantity);
            const entryPrice = Number(pos.avg_entry_price);
            const storedOverrides = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('portfolio_strategy_overrides') || '{}') : {};
            const cleanUpper = cleanSym.toUpperCase();
            const overrideStrategy = storedOverrides[cleanUpper] || (pos.notes?.includes('Strategy: SWING') ? 'SWING' : pos.notes?.includes('Strategy: CORE_DIVIDEND') ? 'CORE_DIVIDEND' : null);
            const isCoreDiv = overrideStrategy 
              ? (overrideStrategy === 'CORE_DIVIDEND') 
              : Boolean(
                  MASTER_GROWTH_PROFILES[cleanUpper] || 
                  KNOWN_DIVIDEND_LIST.includes(cleanUpper) ||
                  pos.notes?.toLowerCase().includes('dividend') ||
                  pos.notes?.toLowerCase().includes('core') ||
                  pos.notes?.toLowerCase().includes('dca')
                );
            const matchedSig = signals?.find((s: TradeSignal) => s.symbol.replace('.IS', '').toUpperCase() === cleanUpper);
            const entryDate = pos.entry_date || (pos.created_at ? pos.created_at.slice(0, 10) : '2026-09-24');
            const strategyType = isCoreDiv ? 'CORE_DIVIDEND' : 'SWING';

            // Technical Signal Inherited Levels (Structural Support & Resistance)
            const structuralStop = matchedSig && matchedSig.stopLoss > 0 ? matchedSig.stopLoss : Number((entryPrice * 0.95).toFixed(2));
            const structuralTarget = matchedSig && matchedSig.targetPrice > 0 ? matchedSig.targetPrice : Number((entryPrice * 1.10).toFixed(2));

            const stopLoss = pos.stop_loss !== null && pos.stop_loss !== undefined && Number(pos.stop_loss) > 0
              ? Number(pos.stop_loss)
              : (isCoreDiv ? 0 : structuralStop);

            const targetPrice = pos.target_price !== null && pos.target_price !== undefined && Number(pos.target_price) > 0
              ? Number(pos.target_price)
              : (isCoreDiv ? undefined : (
                  matchedSig && matchedSig.targetPrice > 0 && matchedSig.targetPrice > entryPrice
                    ? matchedSig.targetPrice
                    : (stopLoss > 0 && entryPrice > stopLoss
                        ? Number((entryPrice + 2 * (entryPrice - stopLoss)).toFixed(2))
                        : structuralTarget)
                ));
            const totalCost = shares * entryPrice;
            const currentValue = shares * currPrice;
            const pnlAmount = currentValue - totalCost;
            const pnlPercent = totalCost > 0 ? (pnlAmount / totalCost) * 100 : 0;
            const distanceToStop = stopLoss > 0 && currPrice > 0 ? ((currPrice - stopLoss) / currPrice) * 100 : 0;

            const dcaZone: 'BUY' | 'PAUSE' | 'HOLD' = currPrice <= entryPrice * 0.97 ? 'BUY' : 'HOLD';
            const dcaRationale = pos.notes || (currPrice <= entryPrice * 0.97 
              ? 'Pullback to accumulation zone; DCA accumulation opportunity.'
              : 'Holding core position; maintain disciplined trailing stops.');

            const resolvedName = (pos.assets?.name && pos.assets.name !== cleanSym)
              ? pos.assets.name
              : (cleanUpper === 'TRGYO' ? 'Torunlar GYO' : (MASTER_GROWTH_PROFILES[cleanUpper]?.name || cleanSym));

            return {
              symbol: cleanSym,
              name: resolvedName,
              market: (pos.assets?.market || (rawSym.endsWith('.IS') ? 'BIST' : 'US')) as any,
              shares: shares,
              entryPrice: entryPrice,
              currentPrice: currPrice,
              totalCost: totalCost,
              currentValue: currentValue,
              pnlAmount: pnlAmount,
              pnlPercent: pnlPercent,
              currency: (pos.assets?.market === 'US' ? 'USD' : 'TRY'),
              stopLoss: stopLoss,
              targetPrice: targetPrice,
              distanceToStop: distanceToStop,
              isDividend: isCoreDiv,
              dcaZone: dcaZone,
              dcaRationale: dcaRationale,
              entryDate: entryDate,
              strategyType: strategyType
            };
          });

          setPortfolio(mappedPortfolio);
          const activeDivMap = new Map<string, any>();
          (divSummaryData || []).forEach((d: any) => {
            const sym = (d.symbol || '').replace('.IS', '').trim().toUpperCase();
            if (sym) {
              activeDivMap.set(sym, d);
              activeDivMap.set(`${sym}.IS`, d);
            }
          });
          setDividends(prev => deriveDividendsFromPortfolio(mappedPortfolio, prev, activeDivMap.size > 0 ? activeDivMap : dividendSummaryMap));
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(mappedPortfolio));
              localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(mappedPortfolio));
            }
          } catch (e) {}
        } else {
          // Offline fallback from local cache if Supabase query returned no rows
          if (typeof window !== 'undefined') {
            try {
              const savedGuest = localStorage.getItem('marketpulse_guest_portfolio') || localStorage.getItem('market_pulse_cached_portfolio');
              if (savedGuest) {
                const parsed = JSON.parse(savedGuest);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const rehydrated = parsed.map((p: PortfolioItem) => {
                    const cleanP = p.symbol.replace('.IS', '').toUpperCase();
                    const live = loadedAssets.find((a: AssetData) => a.symbol.replace('.IS', '').toUpperCase() === cleanP);
                    const curPrice = live && live.price > 0 ? live.price : p.currentPrice;
                    const curVal = p.shares * curPrice;
                    const pnl = curVal - p.totalCost;
                    const pnlPct = p.totalCost > 0 ? (pnl / p.totalCost) * 100 : 0;
                    return {
                      ...p,
                      currentPrice: curPrice,
                      currentValue: curVal,
                      pnlAmount: pnl,
                      pnlPercent: pnlPct,
                    };
                  });
                  setPortfolio(rehydrated);
                  setDividends(prevDivs => deriveDividendsFromPortfolio(rehydrated, prevDivs, dividendSummaryMap));
                }
              }
            } catch (e) {
              console.warn('Could not read cached portfolio fallback:', e);
            }
          }
        }

        const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        setLastRefreshedAt(nowStr);

      } catch (err) {
        console.warn('Network or Supabase query exception, using enriched fallback offline data:', err);
        if (assets.length === 0) {
          generateFallbackAssets();
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    };

    function generateFallbackAssets() {
      const topSymbols = [
        { s: 'SPY', n: 'SPDR S&P 500 ETF', m: 'US', p: 735.29, c: 0.82, r: 62.4, e: 'Above 200 EMA', v: 1.15 },
        { s: 'QQQ', n: 'Invesco QQQ Trust', m: 'US', p: 612.40, c: 1.25, r: 68.5, e: 'Above 200 EMA', v: 1.30 },
        { s: 'VOO', n: 'Vanguard S&P 500 ETF', m: 'US', p: 678.38, c: 0.28, r: 50.5, e: 'Above 200 EMA', v: 1.05 },
        { s: 'SCHD', n: 'Schwab US Dividend ETF', m: 'US', p: 83.10, c: 0.35, r: 55.0, e: 'Above 200 EMA', v: 1.05 },
        { s: 'JEPI', n: 'JPMorgan Equity Premium ETF', m: 'US', p: 57.16, c: 0.51, r: 67.1, e: 'Above 200 EMA', v: 1.20 },
        { s: 'O', n: 'Realty Income Corp (REIT)', m: 'US', p: 55.55, c: 0.69, r: 52.3, e: 'Above 200 EMA', v: 1.10 },
        { s: 'VICI', n: 'VICI Properties Inc (REIT)', m: 'US', p: 32.46, c: 2.27, r: 48.9, e: 'Above 200 EMA', v: 1.35 },
        { s: 'PLD', n: 'Prologis Inc (REIT)', m: 'US', p: 126.94, c: -2.70, r: 35.9, e: 'Near 50 EMA', v: 0.95 },
        { s: 'KO', n: 'The Coca-Cola Co', m: 'US', p: 68.50, c: 0.24, r: 61.1, e: 'Above 200 EMA', v: 1.00 },
        { s: 'NVDA', n: 'NVIDIA Corp', m: 'US', p: 186.64, c: 2.10, r: 64.2, e: 'Above 200 EMA', v: 1.85 },
        { s: 'AAPL', n: 'Apple Inc.', m: 'US', p: 342.37, c: 0.45, r: 56.1, e: 'Above 200 EMA', v: 0.95 },
        { s: 'THYAO', n: 'Türk Hava Yolları', m: 'BIST', p: 299.25, c: 2.45, r: 58.2, e: 'Above 200 EMA', v: 2.10 },
        { s: 'TUPRS', n: 'Tüpraş', m: 'BIST', p: 337.50, c: -1.15, r: 42.1, e: 'Near 50 EMA', v: 0.82 },
        { s: 'ASELS', n: 'Aselsan', m: 'BIST', p: 64.80, c: 3.10, r: 66.4, e: 'Above 200 EMA', v: 2.40 },
        { s: 'BIMAS', n: 'BİM Mağazalar', m: 'BIST', p: 371.75, c: 0.90, r: 53.0, e: 'Above 200 EMA', v: 1.10 },
        { s: 'ISMEN', n: 'İş Yatırım Menkul', m: 'BIST', p: 27.36, c: 1.65, r: 55.4, e: 'Above 200 EMA', v: 1.25 },
        { s: 'TURSG', n: 'Türkiye Sigorta', m: 'BIST', p: 3.35, c: 2.20, r: 61.0, e: 'Above 200 EMA', v: 1.50 },
        { s: 'KCHOL', n: 'Koç Holding', m: 'BIST', p: 206.10, c: 0.50, r: 49.5, e: 'Near 50 EMA', v: 0.90 },
        { s: 'EREGL', n: 'Erdemir', m: 'BIST', p: 31.06, c: -0.80, r: 38.2, e: 'Below 200 EMA', v: 0.75 },
        { s: 'FROTO', n: 'Ford Otosan', m: 'BIST', p: 1045.00, c: 1.80, r: 59.8, e: 'Above 200 EMA', v: 1.40 },
        { s: 'SISE', n: 'Şişecam', m: 'BIST', p: 44.30, c: 0.10, r: 41.2, e: 'Below 200 EMA', v: 0.70 },
        { s: 'AKBNK', n: 'Akbank', m: 'BIST', p: 68.65, c: 1.15, r: 57.1, e: 'Above 200 EMA', v: 1.30 },
        { s: 'GARAN', n: 'Garanti BBVA', m: 'BIST', p: 144.30, c: 1.40, r: 60.5, e: 'Above 200 EMA', v: 1.45 },
        { s: 'ZBJ', n: 'Ziraat Portföy Başak Para Piyasası', m: 'TEFAS', p: 5.6070, c: 0.30, r: 60.0, e: 'Above 200 EMA', v: 1.00 },
        { s: 'PPZ', n: 'Azimut Portföy Para Piyasası', m: 'TEFAS', p: 7.0998, c: 0.15, r: 60.0, e: 'Above 200 EMA', v: 1.00 },
        { s: 'MAC', n: 'Marmara Capital Hisse Fonu', m: 'TEFAS', p: 0.6418, c: 0.65, r: 56.0, e: 'Above 200 EMA', v: 1.00 },
        { s: 'TTE', n: 'İş Portföy BIST Teknoloji Fonu', m: 'TEFAS', p: 1.0077, c: 0.85, r: 58.0, e: 'Above 200 EMA', v: 1.00 },
        { s: 'AFT', n: 'Ak Portföy Yeni Teknolojiler', m: 'TEFAS', p: 0.8799, c: 1.10, r: 62.0, e: 'Above 200 EMA', v: 1.00 }
      ];

      setAssets(topSymbols.map((item, idx) => ({
        id: String(idx + 1),
        symbol: item.s,
        name: item.n,
        market: item.m as any,
        price: item.p,
        changePercent: item.c,
        rsi: item.r,
        emaStatus: item.e as any,
        volumeRatio: item.v
      })));
    }

  useEffect(() => {
    // 0. Immediate offline cache hydration for instant loading on mobile networks
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);

      try {
        const cachedAssets = localStorage.getItem('market_pulse_cached_assets');
        if (cachedAssets) {
          const parsed = JSON.parse(cachedAssets);
          // Invalidate legacy cached dummy values (e.g. EREGL at 52.40 or TURSG at 6.72)
          const isStale = Array.isArray(parsed) && parsed.some(
            p => (p.symbol === 'EREGL' && p.price > 45) || (p.symbol === 'TURSG' && p.price > 5) || (p.symbol === 'AAPL' && p.price < 300)
          );
          if (isStale) {
            localStorage.removeItem('market_pulse_cached_assets');
          } else if (Array.isArray(parsed) && parsed.length > 0) {
            setAssets(parsed);
            setIsLoading(false);
          }
        }

        const cachedSignals = localStorage.getItem('market_pulse_cached_signals');
        if (cachedSignals) {
          const parsed = JSON.parse(cachedSignals);
          if (Array.isArray(parsed) && parsed.length > 0) setSignals(parsed);
        }

        const cachedPortfolio = localStorage.getItem('market_pulse_cached_portfolio');
        if (cachedPortfolio) {
          const parsed = JSON.parse(cachedPortfolio);
          if (Array.isArray(parsed) && parsed.length > 0) setPortfolio(parsed);
        }

        const cachedOrders = localStorage.getItem('market_pulse_cached_orders');
        if (cachedOrders) {
          const parsed = JSON.parse(cachedOrders);
          if (Array.isArray(parsed) && parsed.length > 0) setExecutedOrders(parsed);
        }

        const cachedRealized = localStorage.getItem('market_pulse_cached_realized');
        if (cachedRealized) {
          const parsed = JSON.parse(cachedRealized);
          if (Array.isArray(parsed) && parsed.length > 0) setRealizedTrades(parsed);
        }

        const cachedTransfers = localStorage.getItem('marketpulse_cached_transfers');
        if (cachedTransfers) {
          const parsed = JSON.parse(cachedTransfers);
          if (Array.isArray(parsed) && parsed.length > 0) setTransfers(parsed);
        }

        const cachedRegimes = localStorage.getItem('market_pulse_cached_regimes');
        if (cachedRegimes) {
          const parsed = JSON.parse(cachedRegimes);
          if (parsed.us) setUsRegime(parsed.us);
          if (parsed.bist) setBistRegime(parsed.bist);
        }
      } catch (e) {
        console.warn('Failed to hydrate offline cache:', e);
      }
    }

      // Restore saved date filter
      try {
        const savedPreset = localStorage.getItem('market_pulse_date_preset') as any;
        if (savedPreset) {
          const sDate = localStorage.getItem('market_pulse_date_start');
          const eDate = localStorage.getItem('market_pulse_date_end');
          setDateFilter(getDateRangeFromPreset(savedPreset, sDate, eDate));
        }
      } catch (e) {
        // Ignore
      }

    loadData();

    // Auto-refresh when user switches back to tab or unlocks phone
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };

    // Auto-reconnect when switching from Wi-Fi to cellular or recovering signal
    const handleOnline = () => {
      setIsOffline(false);
      setSyncFeedback({
        message: language === 'tr' ? '🌐 İnternet bağlantısı sağlandı. Canlı veriler güncelleniyor...' : '🌐 Network reconnected. Updating live market data...',
        type: 'info'
      });
      loadData(true);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setSyncFeedback({
        message: language === 'tr' ? '⚠️ Mobil internet kesildi. Çevrimdışı veriler gösteriliyor.' : '⚠️ Mobile network disconnected. Displaying cached data.',
        type: 'error'
      });
    };

    // Auto-sync polling every 45s while user is viewing the app
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    }, 45000);

    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [user?.id, isDemoMode]);

  const handleTriggerSync = async (triggerCloudCrawl: boolean = false) => {
    try {
      setIsRefreshing(true);
      setSyncFeedback({
        message: triggerCloudCrawl
          ? (language === 'tr' ? '⚡ Canlı fiyatlar çekiliyor & piyasa taranıyor...' : '⚡ Fetching real-time quotes & crawling market...')
          : (language === 'tr' ? '🔄 BIST & US anlık fiyatları senkronize ediliyor...' : '🔄 Pulling live market quotes from exchange...'),
        type: 'info'
      });

      // 1. Trigger on-demand quote fetching & database update on /api/sync
      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: triggerCloudCrawl ? 'cloud_crawl' : 'sync_live' })
        });
        const json = await res.json();
        if (json.message) {
          setSyncFeedback({
            message: language === 'tr' ? '✅ Canlı veriler başarıyla senkronize edildi' : json.message,
            type: 'success'
          });
        }
      } catch (e) {
        console.warn('Sync API request warning:', e);
      }

      // 2. Reload fresh data & recalculate portfolio from Supabase
      await loadData(true);
      const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      setLastRefreshedAt(nowStr);
      setSyncFeedback({
        message: language === 'tr' ? '✅ Canlı veriler başarıyla senkronize edildi' : '✅ Market data synchronized successfully',
        type: 'success'
      });
      setTimeout(() => setSyncFeedback(null), 5000);
    } catch (err: any) {
      setSyncFeedback({
        message: language === 'tr' ? `⚠️ Yenileme başarısız: ${err.message || err}` : `⚠️ Refresh failed: ${err.message || err}`,
        type: 'error'
      });
      setTimeout(() => setSyncFeedback(null), 5000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRemoveHolding = async (symbol: string) => {
    const cleanSymUpper = symbol.replace('.IS', '').trim().toUpperCase();
    const effectiveUserId = user?.id || ADMIN_USER_ID;

    // 1. Immediately update UI state and local cache
    setPortfolio(prev => {
      const updated = prev.filter(item => item.symbol.replace('.IS', '').trim().toUpperCase() !== cleanSymUpper);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(updated));
          localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(updated));
        } catch (e) {
          console.warn('Could not update guest portfolio on remove:', e);
        }
      }
      return updated;
    });
    setDividends(prev => prev.filter(item => item.symbol.replace('.IS', '').trim().toUpperCase() !== cleanSymUpper));

    // 2. Persist deletion in Supabase (synced to logged-in user or model portfolio)
    if (!isDemoMode) {
      try {
        const cleanSym = symbol.replace('.IS', '');
        const isSymbol = `${cleanSym}.IS`;
        const { data: assetData } = await supabase
          .from('assets')
          .select('id')
          .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
          .limit(1);

        if (assetData && assetData.length > 0) {
          await supabase
            .from('portfolio_positions')
            .delete()
            .eq('asset_id', assetData[0].id)
            .or(`user_id.eq.${effectiveUserId},user_id.is.null`);
        }
      } catch (err) {
        console.warn('Could not remove holding from Supabase:', err);
      }
    }
  };

  const handleAddTransfer = async (newTransfer: CapitalTransfer) => {
    const effectiveUserId = user?.id || ADMIN_USER_ID;
    const updatedTrans = [newTransfer, ...transfers];
    setTransfers(updatedTrans);
    const updatedCash = calculateLedgerCash(executedOrders, updatedTrans, usdTryRate).availableCashTRY;
    setCashBalance(updatedCash);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('marketpulse_cached_transfers', JSON.stringify(updatedTrans));
      } catch (e) {}
    }

    if (!isDemoMode) {
      try {
        await supabase.from('portfolio_transfers').insert([{
          user_id: effectiveUserId,
          transfer_type: newTransfer.transferType,
          amount: newTransfer.amount,
          currency: newTransfer.currency || 'TRY',
          transfer_date: newTransfer.transferDate,
          notes: newTransfer.notes
        }]);
      } catch (err) {
        console.warn('Error saving transfer to Supabase:', err);
      }
    }
  };

  const COMMON_BIST_ALIASES: Record<string, { symbol: string; name: string }> = {
    ASELSAN: { symbol: 'ASELS', name: 'ASELSAN ELEKTRONİK SANAYİ VE TİCARET A.Ş.' },
    TEKFEN: { symbol: 'TKFEN', name: 'TEKFEN HOLDİNG A.Ş.' },
    'TEKFEN HOLDING': { symbol: 'TKFEN', name: 'TEKFEN HOLDİNG A.Ş.' },
    'TEKFEN HOLDİNG': { symbol: 'TKFEN', name: 'TEKFEN HOLDİNG A.Ş.' },
    GARANTI: { symbol: 'GARAN', name: 'TÜRKİYE GARANTİ BANKASI A.Ş.' },
    'GARANTI BANKASI': { symbol: 'GARAN', name: 'TÜRKİYE GARANTİ BANKASI A.Ş.' },
    ISBANK: { symbol: 'ISCTR', name: 'TÜRKİYE İŞ BANKASI A.Ş. (C)' },
    'IS BANKASI': { symbol: 'ISCTR', name: 'TÜRKİYE İŞ BANKASI A.Ş. (C)' },
    AKBANK: { symbol: 'AKBNK', name: 'AKBANK T.A.Ş.' },
    YAPİKREDİ: { symbol: 'YKBNK', name: 'YAPI VE KREDİ BANKASI A.Ş.' },
    'YAPI KREDI': { symbol: 'YKBNK', name: 'YAPI VE KREDİ BANKASI A.Ş.' },
    KOC: { symbol: 'KCHOL', name: 'KOÇ HOLDİNG A.Ş.' },
    'KOC HOLDING': { symbol: 'KCHOL', name: 'KOÇ HOLDİNG A.Ş.' },
    SABANCI: { symbol: 'SAHOL', name: 'HACI ÖMER SABANCI HOLDİNG A.Ş.' },
    'SABANCI HOLDING': { symbol: 'SAHOL', name: 'HACI ÖMER SABANCI HOLDİNG A.Ş.' },
    THY: { symbol: 'THYAO', name: 'TÜRK HAVA YOLLARI A.O.' },
    'TURK HAVA YOLLARI': { symbol: 'THYAO', name: 'TÜRK HAVA YOLLARI A.O.' },
    TUPRAS: { symbol: 'TUPRS', name: 'TÜPRAŞ TÜRKİYE PETROL RAFİNERİLERİ A.Ş.' },
    BIM: { symbol: 'BIMAS', name: 'BİM BİRLEŞİK MAĞAZALAR A.Ş.' },
    BIMAS: { symbol: 'BIMAS', name: 'BİM BİRLEŞİK MAĞAZALAR A.Ş.' },
    ENKA: { symbol: 'ENKAI', name: 'ENKA İNŞAAT VE SANAYİ A.Ş.' },
    SISICAM: { symbol: 'SISE', name: 'TÜRKİYE ŞİŞE VE CAM FABRİKALARI A.Ş.' },
    EREGLI: { symbol: 'EREGL', name: 'EREĞLİ DEMİR VE ÇELİK FABRİKALARI T.A.Ş.' },
    PETKIM: { symbol: 'PETKM', name: 'PETKİM PETROKİMYA HOLDİNG A.Ş.' },
    TURKCELL: { symbol: 'TCELL', name: 'TURKCELL İLETİŞİM HİZMETLERİ A.Ş.' },
    TURKTELEKOM: { symbol: 'TTKOM', name: 'TÜRK TELEKOMÜNİKASYON A.Ş.' },
    'TURK TELEKOM': { symbol: 'TTKOM', name: 'TÜRK TELEKOMÜNİKASYON A.Ş.' },
  };

  const handleAddHolding = async (newHolding: PortfolioItem, isDiv?: boolean, divYield?: number) => {
    let cleanSymUpper = newHolding.symbol.replace('.IS', '').trim().toUpperCase();
    let resolvedName = newHolding.name || cleanSymUpper;
    let resolvedMarket = newHolding.market || 'BIST';

    if (COMMON_BIST_ALIASES[cleanSymUpper]) {
      const alias = COMMON_BIST_ALIASES[cleanSymUpper];
      cleanSymUpper = alias.symbol;
      resolvedName = (resolvedName === newHolding.symbol || !resolvedName) ? alias.name : resolvedName;
      resolvedMarket = 'BIST';
    }

    const isCoreDiv = Boolean(
      isDiv || 
      newHolding.isDividend || 
      newHolding.strategyType === 'CORE_DIVIDEND' || 
      MASTER_GROWTH_PROFILES[cleanSymUpper] || 
      KNOWN_DIVIDEND_LIST.includes(cleanSymUpper)
    );
    const enrichedHolding: PortfolioItem = {
      ...newHolding,
      symbol: cleanSymUpper,
      name: resolvedName,
      market: resolvedMarket,
      entryDate: newHolding.entryDate || new Date().toISOString().slice(0, 10),
      strategyType: isCoreDiv ? 'CORE_DIVIDEND' : (newHolding.strategyType || 'SWING'),
      isDividend: isCoreDiv
    };
    const effectiveUserId = user?.id || ADMIN_USER_ID;

    // 1. Immediately update UI state and local cache
    setPortfolio(prev => {
      const filtered = prev.filter(p => p.symbol.replace('.IS', '').trim().toUpperCase() !== cleanSymUpper);
      const updated = [enrichedHolding, ...filtered];
      setDividends(prevDivs => deriveDividendsFromPortfolio(updated, prevDivs, dividendSummaryMap));
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(updated));
          localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(updated));
        } catch (e) {
          console.warn('Failed to save cached portfolio:', e);
        }
      }
      return updated;
    });

    // Save override locally so it immediately persists across sessions
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('portfolio_strategy_overrides');
        const overrides = stored ? JSON.parse(stored) : {};
        overrides[cleanSymUpper] = isCoreDiv ? 'CORE_DIVIDEND' : 'SWING';
        localStorage.setItem('portfolio_strategy_overrides', JSON.stringify(overrides));
      } catch (e) {
        // ignore local storage errors
      }
    }

    // 2. Persist to Supabase
    try {
      const cleanSym = cleanSymUpper;
      const isSymbol = `${cleanSym}.IS`;
      let { data: assetData } = await supabase
        .from('assets')
        .select('id, symbol, name, market')
        .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol},name.ilike.%${cleanSym}%`)
        .limit(1);

      let assetId = assetData && assetData.length > 0 ? assetData[0].id : null;
      if (!assetId) {
        const { data: newAsset, error: newAssetErr } = await supabase.from('assets').insert([{
          symbol: resolvedMarket === 'BIST' ? `${cleanSym}.IS` : cleanSym,
          name: resolvedName,
          market: resolvedMarket,
          asset_class: 'stock',
          currency: resolvedMarket === 'US' ? 'USD' : 'TRY',
        }]).select('id').single();
        if (newAsset && !newAssetErr) assetId = newAsset.id;
      }

      const orderDateStr = enrichedHolding.entryDate || new Date().toISOString().slice(0, 10);
      const totalVal = newHolding.shares * newHolding.entryPrice;
      const refCode = `#000${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const chosenIso = orderDateStr
        ? new Date(orderDateStr + 'T10:00:00Z').toISOString()
        : new Date().toISOString();
      const displayDateTime = orderDateStr
        ? `${orderDateStr.split('-').reverse().join('.')} - 10:00`
        : new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' -');

      if (assetId && !isDemoMode) {
        const matchedSig = signals.find(s => s.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym);
        const resolvedStop = newHolding.stopLoss > 0 
          ? newHolding.stopLoss 
          : (matchedSig && matchedSig.stopLoss > 0 ? matchedSig.stopLoss : null);
        const resolvedTarget = (newHolding.targetPrice && newHolding.targetPrice > 0)
          ? newHolding.targetPrice
          : (matchedSig && matchedSig.targetPrice > 0 ? matchedSig.targetPrice : null);

        const { error: posError } = await supabase.from('portfolio_positions').insert([{
          user_id: effectiveUserId,
          asset_id: assetId,
          quantity: newHolding.shares,
          avg_entry_price: newHolding.entryPrice,
          stop_loss: resolvedStop,
          target_price: resolvedTarget,
          is_open: true,
          entry_date: orderDateStr,
          notes: isCoreDiv ? `Strategy: CORE_DIVIDEND | ${newHolding.dcaRationale || 'Dividend Compounder'}` : (newHolding.dcaRationale || 'Active holding')
        }]);
        if (posError) {
          console.error('Error adding portfolio position to Supabase:', posError);
        }

        try {
          await supabase.from('portfolio_orders').insert([{
            user_id: effectiveUserId,
            order_ref: refCode,
            symbol: cleanSym,
            side: 'BUY',
            order_type: 'Limit',
            quantity: newHolding.shares,
            price: newHolding.entryPrice,
            total_amount: totalVal,
            currency: newHolding.currency || 'TRY',
            executed_at: chosenIso,
            status: 'Filled',
            notes: newHolding.dcaRationale || 'Position initiation'
          }]);
        } catch (ordErr) {
          console.warn('Could not save order log:', ordErr);
        }
      }

      const newOrder: ExecutedOrder = {
        id: `ord-${Date.now()}`,
        ref: refCode,
        symbol: cleanSym,
        name: newHolding.name || cleanSym,
        market: (newHolding.market || 'BIST') as any,
        side: 'BUY',
        orderType: 'Limit',
        quantity: newHolding.shares,
        price: newHolding.entryPrice,
        totalValue: totalVal,
        currency: newHolding.currency || 'TRY',
        dateTime: displayDateTime,
        executedAt: chosenIso,
        status: 'Filled',
        dcaNote: newHolding.dcaRationale || 'Position initiation'
      };
      const updatedOrders = [newOrder, ...executedOrders];
      setExecutedOrders(updatedOrders);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('market_pulse_cached_orders', JSON.stringify(updatedOrders));
        } catch (e) {}
      }

      // USER RULE: When adding a holding without adding cash, assume cash was added (do NOT assume it came from profit)
      const purchaseCostTRY = newHolding.currency === 'USD' ? totalVal * usdTryRate : totalVal;
      const shortfall = Math.max(0, purchaseCostTRY - cashBalance);
      let updatedTransfersList = transfers;
      if (shortfall > 0) {
        const autoTransfer: CapitalTransfer = {
          id: `trans-${Date.now()}`,
          transferType: 'DEPOSIT',
          amount: shortfall,
          currency: 'TRY',
          transferDate: orderDateStr,
          notes: `Auto-deposit: Funded position ${cleanSym} (${newHolding.shares} shares @ ₺${newHolding.entryPrice.toFixed(2)})`
        };
        updatedTransfersList = [autoTransfer, ...transfers];
        setTransfers(updatedTransfersList);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('marketpulse_cached_transfers', JSON.stringify(updatedTransfersList));
          } catch (e) {}
        }
        if (!isDemoMode) {
          try {
            await supabase.from('portfolio_transfers').insert([{
              user_id: effectiveUserId,
              transfer_type: 'DEPOSIT',
              amount: shortfall,
              currency: 'TRY',
              transfer_date: autoTransfer.transferDate,
              notes: autoTransfer.notes
            }]);
          } catch (trErr) {
            console.warn('Could not auto-save capital transfer:', trErr);
          }
        }
      }
      const updatedCash = calculateLedgerCash(updatedOrders, updatedTransfersList, usdTryRate).availableCashTRY;
      setCashBalance(updatedCash);
    } catch (err) {
      console.warn('Could not save holding to Supabase:', err);
    }
  };

  const handleBuyMoreHolding = async (symbol: string, additionalShares: number, buyPrice: number, tradeDate?: string) => {
    const cleanSymUpper = symbol.replace('.IS', '').trim().toUpperCase();
    
    setPortfolio(prev => {
      const updated = prev.map(item => {
        if (item.symbol.replace('.IS', '').trim().toUpperCase() !== cleanSymUpper) return item;
        const totalShares = item.shares + additionalShares;
        const currentCost = item.shares * item.entryPrice;
        const addedCost = additionalShares * buyPrice;
        const blendedEntry = totalShares > 0 ? (currentCost + addedCost) / totalShares : item.entryPrice;
        const newTotalCost = totalShares * blendedEntry;
        const newCurrentValue = totalShares * item.currentPrice;
        const newPnlAmount = newCurrentValue - newTotalCost;
        const newPnlPercent = newTotalCost > 0 ? (newPnlAmount / newTotalCost) * 100 : 0;
        const distToStop = item.stopLoss > 0 && item.currentPrice > 0 ? ((item.currentPrice - item.stopLoss) / item.currentPrice) * 100 : 0;

        return {
          ...item,
          shares: totalShares,
          entryPrice: blendedEntry,
          totalCost: newTotalCost,
          currentValue: newCurrentValue,
          pnlAmount: newPnlAmount,
          pnlPercent: newPnlPercent,
          distanceToStop: distToStop
        };
      });

      // Synchronize dividend cashflow immediately
      setDividends(prevDivs => deriveDividendsFromPortfolio(updated, prevDivs, dividendSummaryMap));

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(updated));
          localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(updated));
        } catch (e) {}
      }

      return updated;
    });

    setSyncFeedback({
      message: `Successfully added ${additionalShares} shares of ${cleanSymUpper} (DCA Lot)!`,
      type: 'success'
    });

    // Persist to Supabase
    try {
      const cleanSym = cleanSymUpper;
      const isSymbol = `${cleanSym}.IS`;
      const { data: assetData } = await supabase
        .from('assets')
        .select('id')
        .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
        .limit(1);

      if (assetData && assetData.length > 0) {
        const target = portfolio.find(p => p.symbol.replace('.IS', '').trim().toUpperCase() === cleanSymUpper);
        if (target) {
          const totalShares = target.shares + additionalShares;
          const blendedEntry = ((target.shares * target.entryPrice) + (additionalShares * buyPrice)) / totalShares;
          const totalVal = additionalShares * buyPrice;
          const refCode = `#000${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
          const executionIso = tradeDate
            ? new Date(tradeDate + 'T10:00:00Z').toISOString()
            : new Date().toISOString();
          const displayDateTime = tradeDate
            ? `${tradeDate.split('-').reverse().join('.')} - 10:00`
            : new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' -');

          const effectiveUserId = user?.id || ADMIN_USER_ID;

          if (!isDemoMode) {
            await supabase
              .from('portfolio_positions')
              .update({ quantity: totalShares, avg_entry_price: blendedEntry })
              .eq('asset_id', assetData[0].id)
              .eq('is_open', true)
              .or(`user_id.eq.${effectiveUserId},user_id.is.null`);

            // Log buy order to portfolio_orders
            try {
              await supabase.from('portfolio_orders').insert([{
                user_id: effectiveUserId,
                order_ref: refCode,
                symbol: cleanSym,
                side: 'BUY',
                order_type: 'Limit',
                quantity: additionalShares,
                price: buyPrice,
                total_amount: totalVal,
                currency: target.currency || 'TRY',
                executed_at: executionIso,
                status: 'Filled',
                notes: `DCA tranche: added ${additionalShares} shares @ ₺${buyPrice.toFixed(2)}`
              }]);
            } catch (ordErr) {
              console.warn('Could not save buy order:', ordErr);
            }
          }

          const newOrder: ExecutedOrder = {
            id: `ord-${Date.now()}`,
            ref: refCode,
            symbol: cleanSym,
            name: target.name || cleanSym,
            market: (target.market || 'BIST') as any,
            side: 'BUY',
            orderType: 'Limit',
            quantity: additionalShares,
            price: buyPrice,
            totalValue: totalVal,
            currency: target.currency || 'TRY',
            dateTime: displayDateTime,
            executedAt: executionIso,
            status: 'Filled',
            dcaNote: `DCA tranche: added ${additionalShares} shares @ ₺${buyPrice.toFixed(2)}`
          };
          const updatedOrders = [newOrder, ...executedOrders];
          setExecutedOrders(updatedOrders);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('market_pulse_cached_orders', JSON.stringify(updatedOrders));
            } catch (e) {}
          }

          // USER RULE: When buying more shares without adding cash, assume cash was added (do NOT assume it came from profit)
          const additionalCostTRY = target.currency === 'USD' ? totalVal * usdTryRate : totalVal;
          const shortfall = Math.max(0, additionalCostTRY - cashBalance);
          let updatedTransfersList = transfers;
          if (shortfall > 0) {
            const autoTransfer: CapitalTransfer = {
              id: `trans-${Date.now()}`,
              transferType: 'DEPOSIT',
              amount: shortfall,
              currency: 'TRY',
              transferDate: tradeDate || new Date().toISOString().slice(0, 10),
              notes: `Auto-deposit: DCA tranche for ${cleanSym} (+${additionalShares} shares @ ₺${buyPrice.toFixed(2)})`
            };
            updatedTransfersList = [autoTransfer, ...transfers];
            setTransfers(updatedTransfersList);
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('marketpulse_cached_transfers', JSON.stringify(updatedTransfersList));
              } catch (e) {}
            }
            if (!isDemoMode) {
              try {
                await supabase.from('portfolio_transfers').insert([{
                  user_id: effectiveUserId,
                  transfer_type: 'DEPOSIT',
                  amount: shortfall,
                  currency: 'TRY',
                  transfer_date: autoTransfer.transferDate,
                  notes: autoTransfer.notes
                }]);
              } catch (trErr) {
                console.warn('Could not auto-save capital transfer for DCA:', trErr);
              }
            }
          }
          const updatedCash = calculateLedgerCash(updatedOrders, updatedTransfersList, usdTryRate).availableCashTRY;
          setCashBalance(updatedCash);
        }
      }
    } catch (err) {
      console.warn('Error updating position in Supabase:', err);
    }
  };

  const handleSellHolding = async (
    symbol: string, 
    sharesToSell: number, 
    sellPrice: number, 
    tradeDate?: string,
    specificEntryPrice?: number,
    reduceCostBasis: boolean = true
  ) => {
    const cleanSymUpper = symbol.replace('.IS', '').trim().toUpperCase();
    const target = portfolio.find(p => p.symbol.replace('.IS', '').trim().toUpperCase() === cleanSymUpper);
    if (!target) return;

    // Automatic or Explicit Lot / Tranche Matching
    let costBasis = target.entryPrice;
    let isTrancheMatched = false;
    if (specificEntryPrice && specificEntryPrice > 0) {
      costBasis = specificEntryPrice;
      isTrancheMatched = true;
    } else {
      // Auto-detect matching buy tranche if exact quantity matches
      const matchingBuy = executedOrders.find(o => 
        o.side === 'BUY' && 
        o.symbol.replace('.IS', '').toUpperCase() === cleanSymUpper &&
        Math.abs(o.quantity - sharesToSell) < 0.01
      );
      if (matchingBuy && matchingBuy.price > 0) {
        costBasis = matchingBuy.price;
        isTrancheMatched = true;
      }
    }

    const actualSold = Math.min(sharesToSell, target.shares);
    const realizedPnl = (sellPrice - costBasis) * actualSold;
    const realizedPnlPct = costBasis > 0 ? ((sellPrice - costBasis) / costBasis) * 100 : 0;
    const chosenCloseDate = tradeDate || new Date().toISOString().slice(0, 10);

    // Compute remaining shares and restored/netted cost basis (Maliyet Düşürme Modu)
    const remainingShares = Math.max(0, target.shares - actualSold);
    let newAvgEntryPrice = target.entryPrice;
    if (remainingShares > 0) {
      let remainingTotalCost = (target.shares * target.entryPrice) - (actualSold * costBasis);
      if (remainingTotalCost < 0) remainingTotalCost = 0;

      // When Maliyet Düşürme is enabled, deduct the swing profit from remaining capital
      if (reduceCostBasis && realizedPnl > 0) {
        remainingTotalCost = Math.max(0, remainingTotalCost - realizedPnl);
      }
      newAvgEntryPrice = Number((remainingTotalCost / remainingShares).toFixed(4));
    }

    // Record realized trade with execution discipline analytics
    const cleanSym = target.symbol.replace('.IS', '').toUpperCase();
    const matchedAsset = assets.find(a => a.symbol.replace('.IS', '').toUpperCase() === cleanSym);
    const matchedSig = scannedSignals.find(s => s.symbol.replace('.IS', '').toUpperCase() === cleanSym);
    const currSymbol = target.currency === 'USD' ? '$' : '₺';
    const livePrice = matchedAsset?.price || sellPrice;
    const recommendedTarget = target.targetPrice || matchedSig?.targetPrice || (target.entryPrice > 0 ? Number((target.entryPrice * 1.12).toFixed(2)) : sellPrice);
    const targetPnl = (recommendedTarget - costBasis) * actualSold;
    const targetPnlPercent = costBasis > 0 ? ((recommendedTarget - costBasis) / costBasis) * 100 : 0;

    let verdict: 'TARGET_HIT' | 'PULLBACK_PROTECTED' | 'RUNNING' = 'RUNNING';
    let leftOnTable = 0;
    let aiNote = '';

    if (livePrice >= recommendedTarget) {
      verdict = 'TARGET_HIT';
      leftOnTable = targetPnl - realizedPnl;
      aiNote = `Hedef (${currSymbol}${recommendedTarget.toFixed(2)}) vuruldu! Masada kâr bırakıldı.`;
    } else if (livePrice > sellPrice) {
      verdict = 'RUNNING';
      leftOnTable = (livePrice - sellPrice) * actualSold;
      aiNote = `Fiyat satışın üzerinde (${currSymbol}${livePrice.toFixed(2)}). Hedefe doğru ralli sürüyor.`;
    } else if (livePrice < sellPrice) {
      verdict = 'PULLBACK_PROTECTED';
      leftOnTable = -((sellPrice - livePrice) * actualSold);
      aiNote = `Zamanlama başarılı! Satış sonrası fiyat ${currSymbol}${livePrice.toFixed(2)} seviyesine çekildi, kâr korundu.`;
    } else {
      verdict = 'RUNNING';
      leftOnTable = 0;
      aiNote = `Fiyat satış seviyesinde (${currSymbol}${livePrice.toFixed(2)}).`;
    }

    let disciplineCapture = 100;
    if (targetPnl > 0) {
      disciplineCapture = Math.max(0, Number(((realizedPnl / targetPnl) * 100).toFixed(1)));
    } else if (realizedPnl < 0) {
      disciplineCapture = 0;
    }

    const newRealized: RealizedTrade = {
      id: `trade-${Date.now()}`,
      symbol: target.symbol,
      name: target.name,
      market: target.market,
      currency: target.currency,
      sharesSold: actualSold,
      entryPrice: costBasis,
      exitPrice: sellPrice,
      realizedPnl: realizedPnl,
      realizedPnlPercent: realizedPnlPct,
      closeDate: chosenCloseDate,
      recommendedTargetPrice: recommendedTarget,
      targetPnl: targetPnl,
      targetPnlPercent: targetPnlPercent,
      currentPrice: livePrice,
      leftOnTableAmount: leftOnTable,
      disciplineCapturePct: disciplineCapture,
      executionVerdict: verdict,
      aiTargetNote: aiNote
    };

    setRealizedTrades(prev => {
      const updated = [newRealized, ...prev];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('market_pulse_cached_realized', JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });

    if (actualSold >= target.shares) {
      // Full exit
      setPortfolio(prev => {
        const updated = prev.filter(p => p.symbol !== symbol);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(updated));
            localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(updated));
          } catch (e) {}
        }
        return updated;
      });
      setDividends(prev => prev.filter(d => d.symbol !== symbol));
    } else {
      // Partial sell
      setPortfolio(prev => {
        const updated = prev.map(item => {
          if (item.symbol !== symbol) return item;
          const newTotalCost = remainingShares * newAvgEntryPrice;
          const newCurrentValue = remainingShares * item.currentPrice;
          const newPnlAmount = newCurrentValue - newTotalCost;
          const newPnlPercent = newTotalCost > 0 ? (newPnlAmount / newTotalCost) * 100 : 0;

          return {
            ...item,
            shares: remainingShares,
            entryPrice: newAvgEntryPrice,
            totalCost: newTotalCost,
            currentValue: newCurrentValue,
            pnlAmount: newPnlAmount,
            pnlPercent: newPnlPercent
          };
        });

        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(updated));
            localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(updated));
          } catch (e) {}
        }
        return updated;
      });

      setDividends(prev => {
        return prev.map(div => {
          if (div.symbol !== symbol) return div;
          return {
            ...div,
            shares: remainingShares,
            annualPayout: div.dividendYield !== null && div.currentPrice !== null ? (remainingShares * div.currentPrice * div.dividendYield) / 100 : null,
            monthlyPayout: div.dividendYield !== null && div.currentPrice !== null ? (remainingShares * div.currentPrice * div.dividendYield) / 1200 : null
          };
        });
      });
    }

    // Persist to Supabase
    try {
      const cleanSym = symbol.replace('.IS', '');
      const isSymbol = `${cleanSym}.IS`;
      const { data: assetData } = await supabase
        .from('assets')
        .select('id')
        .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
        .limit(1);

      // Log sell order to portfolio_orders
      const totalVal = actualSold * sellPrice;
      const refCode = `#000${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const executionIso = tradeDate
        ? new Date(tradeDate + 'T10:00:00Z').toISOString()
        : new Date().toISOString();
      const displayDateTime = tradeDate
        ? `${tradeDate.split('-').reverse().join('.')} - 10:00`
        : new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' -');

      const costReductionNote = (reduceCostBasis && realizedPnl > 0 && remainingShares > 0)
        ? ` (Kalan ${remainingShares} hissenin maliyeti ₺${newAvgEntryPrice.toFixed(4)} seviyesine çekildi)`
        : '';
      const orderNote = isTrancheMatched
        ? `Sold ${actualSold} shares @ ₺${sellPrice.toFixed(2)} (Tranche Buy: ${actualSold} @ ₺${costBasis.toFixed(2)}). Realized P&L: ₺${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}${costReductionNote}`
        : `Sold ${actualSold} shares @ ₺${sellPrice.toFixed(2)}. Realized P&L: ₺${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}${costReductionNote}`;

      const effectiveUserId = user?.id || ADMIN_USER_ID;

      if (assetData && assetData.length > 0 && !isDemoMode) {
        let posMutQuery = supabase.from('portfolio_positions');
        if (actualSold >= target.shares) {
          await posMutQuery
            .delete()
            .eq('asset_id', assetData[0].id)
            .or(`user_id.eq.${effectiveUserId},user_id.is.null`);
        } else {
          await posMutQuery
            .update({ 
              quantity: remainingShares,
              avg_entry_price: newAvgEntryPrice 
            })
            .eq('asset_id', assetData[0].id)
            .eq('is_open', true)
            .or(`user_id.eq.${effectiveUserId},user_id.is.null`);
        }

        try {
          await supabase.from('portfolio_orders').insert([{
            user_id: effectiveUserId,
            order_ref: refCode,
            symbol: cleanSym,
            side: 'SELL',
            order_type: 'Limit',
            quantity: actualSold,
            price: sellPrice,
            total_amount: totalVal,
            currency: target.currency || 'TRY',
            executed_at: executionIso,
            status: 'Filled',
            notes: orderNote
          }]);
        } catch (ordErr) {
          console.warn('Could not save sell order to Supabase:', ordErr);
        }
      }

      const newSellOrder: ExecutedOrder = {
        id: `ord-${Date.now()}`,
        ref: refCode,
        symbol: cleanSym,
        name: target.name || cleanSym,
        market: (target.market || 'BIST') as any,
        side: 'SELL',
        orderType: 'Limit',
        quantity: actualSold,
        price: sellPrice,
        totalValue: totalVal,
        currency: target.currency || 'TRY',
        dateTime: displayDateTime,
        executedAt: executionIso,
        status: 'Filled',
        dcaNote: `Sold ${actualSold} shares @ ₺${sellPrice.toFixed(2)} (P&L: ${realizedPnl >= 0 ? '+' : ''}₺${realizedPnl.toFixed(2)})${costReductionNote}`
      };
      const updatedOrders = [newSellOrder, ...executedOrders];
      setExecutedOrders(updatedOrders);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('market_pulse_cached_orders', JSON.stringify(updatedOrders));
        } catch (e) {}
      }
      const updatedCash = calculateLedgerCash(updatedOrders, transfers, usdTryRate).availableCashTRY;
      setCashBalance(updatedCash);
    } catch (err) {
      console.warn('Error updating sold shares in Supabase:', err);
    }
  };

  const handleUpdateStopLoss = async (symbol: string, newStopPrice: number) => {
    const cleanSym = symbol.replace('.IS', '').toUpperCase();
    setPortfolio(prev => {
      const updated = prev.map(item => {
        if (item.symbol.replace('.IS', '').toUpperCase() !== cleanSym) return item;
        const distToStop = item.currentPrice > 0 ? ((item.currentPrice - newStopPrice) / item.currentPrice) * 100 : 0;
        return {
          ...item,
          stopLoss: newStopPrice,
          distanceToStop: distToStop
        };
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(updated));
          localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });

    try {
      const isSymbol = `${cleanSym}.IS`;
      const { data: assetData } = await supabase
        .from('assets')
        .select('id')
        .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
        .limit(1);

      const effectiveUserId = user?.id || ADMIN_USER_ID;
      if (assetData && assetData.length > 0 && !isDemoMode) {
        await supabase
          .from('portfolio_positions')
          .update({ stop_loss: newStopPrice })
          .eq('asset_id', assetData[0].id)
          .eq('is_open', true)
          .or(`user_id.eq.${effectiveUserId},user_id.is.null`);
      }
    } catch (err) {
      console.warn('Could not update stop loss in Supabase:', err);
    }
  };

  const handleUpdateTargetPrice = async (symbol: string, newTargetPrice: number) => {
    const cleanSym = symbol.replace('.IS', '').toUpperCase();
    setPortfolio(prev => {
      const updated = prev.map(item => {
        if (item.symbol.replace('.IS', '').toUpperCase() !== cleanSym) return item;
        return {
          ...item,
          targetPrice: newTargetPrice
        };
      });

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(updated));
          localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });

    try {
      const isSymbol = `${cleanSym}.IS`;
      const { data: assetData } = await supabase
        .from('assets')
        .select('id')
        .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
        .limit(1);

      const effectiveUserId = user?.id || ADMIN_USER_ID;
      if (assetData && assetData.length > 0 && !isDemoMode) {
        await supabase
          .from('portfolio_positions')
          .update({ target_price: newTargetPrice })
          .eq('asset_id', assetData[0].id)
          .eq('is_open', true)
          .or(`user_id.eq.${effectiveUserId},user_id.is.null`);
      }
    } catch (err) {
      console.warn('Could not update target price in Supabase:', err);
    }
  };

  const handleToggleStrategyType = async (symbol: string) => {
    const cleanSym = symbol.replace('.IS', '').toUpperCase();
    let newStrategy: 'CORE_DIVIDEND' | 'SWING' = 'SWING';
    let newStopLoss = 0;

    setPortfolio(prev => {
      const updated = prev.map(item => {
        if (item.symbol.replace('.IS', '').toUpperCase() !== cleanSym) return item;
        const willBeSwing = item.strategyType === 'CORE_DIVIDEND' || item.isDividend;
        newStrategy = willBeSwing ? 'SWING' : 'CORE_DIVIDEND';
        // When switching to SWING: provide an initial sensible stop loss (e.g. 5% under entry or existing stop)
        newStopLoss = willBeSwing ? (item.stopLoss > 0 ? item.stopLoss : Number((item.entryPrice * 0.95).toFixed(2))) : 0;
        const distToStop = newStopLoss > 0 && item.currentPrice > 0 ? ((item.currentPrice - newStopLoss) / item.currentPrice) * 100 : 0;

        return {
          ...item,
          strategyType: newStrategy,
          isDividend: newStrategy === 'CORE_DIVIDEND',
          stopLoss: newStopLoss,
          distanceToStop: distToStop
        };
      });

      setDividends(prevDivs => deriveDividendsFromPortfolio(updated, prevDivs, dividendSummaryMap));

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('market_pulse_cached_portfolio', JSON.stringify(updated));
          localStorage.setItem('marketpulse_guest_portfolio', JSON.stringify(updated));
        } catch (e) {}
      }
      return updated;
    });

    // Cache locally so it immediately persists across sessions
    try {
      const stored = localStorage.getItem('portfolio_strategy_overrides');
      const overrides = stored ? JSON.parse(stored) : {};
      overrides[cleanSym] = newStrategy;
      localStorage.setItem('portfolio_strategy_overrides', JSON.stringify(overrides));
    } catch (e) {
      // ignore local storage errors
    }

    // Persist to Supabase
    try {
      const isSymbol = `${cleanSym}.IS`;
      const { data: assetData } = await supabase
        .from('assets')
        .select('id')
        .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
        .limit(1);

      const effectiveUserId = user?.id || ADMIN_USER_ID;
      if (assetData && assetData.length > 0 && !isDemoMode) {
        await supabase
          .from('portfolio_positions')
          .update({
            notes: `Strategy: ${newStrategy}`,
            stop_loss: newStopLoss > 0 ? newStopLoss : null
          })
          .eq('asset_id', assetData[0].id)
          .eq('is_open', true)
          .or(`user_id.eq.${effectiveUserId},user_id.is.null`);
      }
    } catch (err) {
      console.warn('Could not update strategy type in Supabase:', err);
    }
  };

  const handleOpenCoPilotForHolding = (h: PortfolioItem) => {
    const cleanSym = h.symbol.replace('.IS', '').trim().toUpperCase();
    const buys = executedOrders.filter(o => o.side === 'BUY' && o.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym);
    const buyCount = buys.length;
    const lowestBuy = buys.length > 0 ? Math.min(...buys.map(b => b.price)) : h.entryPrice;
    const highestBuy = buys.length > 0 ? Math.max(...buys.map(b => b.price)) : h.entryPrice;
    const latestBuy = buys.length > 0 ? buys[0].price : h.entryPrice;

    setCoPilotAsset({
      symbol: h.symbol,
      name: h.name,
      market: h.market,
      currentPrice: h.currentPrice,
      entryPrice: h.entryPrice,
      stopLoss: h.stopLoss,
      targetPrice: h.targetPrice,
      currency: h.currency,
      strategy: h.strategyType || (h.isDividend ? 'Dividend Accumulation' : 'Swing Momentum'),
      pnlPercent: h.pnlPercent,
      pnlAmount: h.pnlAmount,
      shares: h.shares,
      totalCost: h.totalCost,
      currentValue: h.currentValue,
      entryDate: h.entryDate,
      dcaZone: h.dcaZone,
      isDividend: h.isDividend,
      notes: h.dcaRationale,
      buyCount,
      lowestBuy,
      highestBuy,
      latestBuy
    });
  };

  const handleOpenCoPilotForSignal = (s: TradeSignal) => {
    setCoPilotAsset({
      symbol: s.symbol,
      name: s.name,
      market: s.market,
      currentPrice: s.currentPrice || s.entryPrice,
      entryPrice: s.entryPrice,
      stopLoss: s.stopLoss,
      targetPrice: s.targetPrice,
      currency: s.currency,
      strategy: s.strategy,
      pnlPercent: s.changePercent,
      isDividend: false,
      notes: s.rationale,
      target1: s.target1,
      target2: s.target2,
      triggerReasons: s.triggerReasons,
      failedChecks: s.failedChecks,
      invalidation: s.invalidation,
      marketContext: s.marketContext,
      risk: s.risk || (s as any).riskMetrics,
      direction: s.direction,
      entryMode: s.entryMode,
      isReconfirmed: s.isReconfirmed,
      lastConfirmedDate: s.lastConfirmedDate,
      daysInZone: s.daysInZone,
      triggerHistory: s.triggerHistory,
      confidence: s.confidence
    });
  };

  // Desktop Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in form controls
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        activeEl?.getAttribute('contenteditable') === 'true';

      if (isInput) return;

      // 1-8: Switch tabs instantly
      const tabMap: Record<string, TabId> = {
        '1': 'signals',
        '2': 'catalysts',
        '3': 'quant',
        '4': 'portfolio',
        '5': 'dividend',
        '6': 'forecast',
        '7': 'scorecard',
        '8': 'orb',
      };

      if (tabMap[e.key]) {
        e.preventDefault();
        handleTabChange(tabMap[e.key]);
        return;
      }

      // 'r' or 'R': Trigger sync
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleTriggerSync(false);
        return;
      }

      // '?': Toggle shortcuts cheat sheet modal
      if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsModalOpen(prev => !prev);
        return;
      }

      // 'Escape': Close top active modal
      if (e.key === 'Escape') {
        if (isReportsModalOpen) {
          setIsReportsModalOpen(false);
        } else if (isShortcutsModalOpen) {
          setIsShortcutsModalOpen(false);
        } else if (isAuthModalOpen) {
          setIsAuthModalOpen(false);
        } else if (isModalOpen) {
          setIsModalOpen(false);
        } else if (isHoldingModalOpen) {
          setIsHoldingModalOpen(false);
        } else if (tradeModalOpen) {
          setTradeModalOpen(false);
        } else if (selectedAssetForHistory) {
          setSelectedAssetForHistory(null);
        } else if (coPilotAsset) {
          setCoPilotAsset(null);
        } else if (isSettingsSheetOpen) {
          setIsSettingsSheetOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isReportsModalOpen,
    isShortcutsModalOpen,
    isAuthModalOpen,
    isModalOpen,
    isHoldingModalOpen,
    tradeModalOpen,
    selectedAssetForHistory,
    coPilotAsset,
    isSettingsSheetOpen,
    isRefreshing,
  ]);

  const discountedDividendMetrics = useMemo(() => {
    // 1. Identify dividend compounders in portfolio
    const divHoldings = portfolio.filter(p => 
      p.isDividend || p.strategyType === 'CORE_DIVIDEND'
    );

    // Identify which ones are currently discounted / in buy zone:
    // Criteria: dcaZone === 'BUY' OR trading below entryPrice (pnlPercent < 0)
    const buyZoneHoldings = divHoldings.filter(p => 
      p.dcaZone === 'BUY' || (p.entryPrice > 0 && p.currentPrice <= p.entryPrice) || (p.pnlPercent !== undefined && p.pnlPercent < 0)
    );

    const candidates = buyZoneHoldings.length > 0 ? buyZoneHoldings : divHoldings;

    if (candidates.length > 0) {
      const itemsWithYield = candidates.map(p => {
        const cleanSym = p.symbol.replace('.IS', '').trim().toUpperCase();
        const divItem = dividends.find(d => d.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym);
        const summaryItem = dividendSummaryMap.get(cleanSym);
        const rawYield = summaryItem && Number(summaryItem.trailing_yield_pct) > 0
          ? Number(summaryItem.trailing_yield_pct)
          : (divItem?.dividendYield || 0);
        return { symbol: cleanSym, yield: rawYield };
      }).filter(item => item.yield > 0);

      if (itemsWithYield.length > 0) {
        itemsWithYield.sort((a, b) => b.yield - a.yield);
        const yields = itemsWithYield.map(i => i.yield);
        const minY = Math.min(...yields);
        const maxY = Math.max(...yields);
        const topSymbols = itemsWithYield.slice(0, 2).map(i => i.symbol);
        const symbolsStr = topSymbols.join(' & ');
        const yieldStr = Math.abs(minY - maxY) < 0.05
          ? `%${minY.toFixed(2)}`
          : `%${minY.toFixed(2)} – %${maxY.toFixed(2)}`;
        
        return {
          yieldStr,
          symbolsStr,
          isInBuyZone: buyZoneHoldings.length > 0,
        };
      }
    }

    // Fallback: If no portfolio dividend holdings, query top dividend yields from dividendSummaries view
    if (dividendSummaries.length > 0) {
      const valid = dividendSummaries
        .filter(d => {
          const y = Number(d.trailing_yield_pct);
          return Number.isFinite(y) && y > 3.0 && y < 35.0;
        })
        .sort((a, b) => Number(b.trailing_yield_pct) - Number(a.trailing_yield_pct));

      if (valid.length > 0) {
        const top2 = valid.slice(0, 2);
        const y1 = Number(top2[0].trailing_yield_pct);
        const y2 = top2.length > 1 ? Number(top2[1].trailing_yield_pct) : y1;
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        const symbolsStr = top2.map(d => (d.symbol || '').replace('.IS', '')).join(' & ');
        return {
          yieldStr: Math.abs(minY - maxY) < 0.05 ? `%${minY.toFixed(2)}` : `%${minY.toFixed(2)} – %${maxY.toFixed(2)}`,
          symbolsStr,
          isInBuyZone: true,
        };
      }
    }

    return {
      yieldStr: '%7.09 – %8.55',
      symbolsStr: 'ISMEN & TURSG',
      isInBuyZone: true,
    };
  }, [portfolio, dividends, dividendSummaryMap, dividendSummaries]);

  const getLocalizedRegime = (status?: 'Bullish' | 'Neutral' | 'Bearish') => {
    switch (status) {
      case 'Bullish':
        return language === 'tr' ? 'Yükseliş' : 'Bullish';
      case 'Bearish':
        return language === 'tr' ? 'Düzeltme' : 'Correction';
      default:
        return language === 'tr' ? 'Tepki & Denge' : 'Rebound';
    }
  };

  const dynamicMarketContextSubtitle = useMemo(() => {
    const bistCloseStr = bistRegime?.close
      ? bistRegime.close.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 0 })
      : '';

    if (language === 'tr') {
      if (usRegime?.status === 'Bearish' && bistRegime?.status === 'Bearish') {
        return bistCloseStr 
          ? `Küresel kâr satışları; BIST ${bistCloseStr} desteğinde taban arayışı`
          : 'Küresel düzeltme & destek seviyelerinde taban arayışı';
      }
      if (usRegime?.status === 'Bearish' && bistRegime?.status === 'Bullish') {
        return bistCloseStr 
          ? `ABD teknoloji kâr satışlarına karşın BIST pozitif ayrışıyor (${bistCloseStr})`
          : 'BIST küresel düzeltmeden pozitif ayrışıyor';
      }
      if (usRegime?.status === 'Bullish' && bistRegime?.status === 'Bullish') {
        return 'Küresel risk iştahı güçlü; BIST ve ABD piyasaları yükseliş trendinde';
      }
      if (bistRegime?.status === 'Neutral') {
        return bistCloseStr 
          ? `BIST ${bistCloseStr} bandında konsolidasyon & denge arayışı` 
          : 'Destek seviyesinde dengeleme & taban arayışı';
      }
      if (bistRegime?.descriptionTr) {
        return bistRegime.descriptionTr;
      }
      return 'Piyasalar destek seviyelerinde taban arayışında';
    } else {
      if (usRegime?.status === 'Bearish' && bistRegime?.status === 'Bearish') {
        return bistCloseStr
          ? `Global profit-taking; BIST consolidating above ${bistCloseStr}`
          : 'Global pullback; testing major index support floors';
      }
      if (usRegime?.status === 'Bearish' && bistRegime?.status === 'Bullish') {
        return bistCloseStr
          ? `BIST diverging positively amidst US pullback (${bistCloseStr})`
          : 'BIST holding strong above key dynamic moving averages';
      }
      if (usRegime?.status === 'Bullish' && bistRegime?.status === 'Bullish') {
        return 'Global risk appetite strong across BIST and US benchmarks';
      }
      if (bistRegime?.status === 'Neutral') {
        return bistCloseStr
          ? `BIST consolidating near ${bistCloseStr} support floor`
          : 'Consolidation & technical support defense';
      }
      if (bistRegime?.descriptionEn) {
        return bistRegime.descriptionEn;
      }
      return 'Benchmarks consolidating at technical support';
    }
  }, [language, bistRegime, usRegime]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b13] text-slate-900 dark:text-slate-100 flex antialiased selection:bg-blue-500/20">
      {/* Left Navigation Sidebar */}
      <SidebarNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        catalystsCount={catalysts.length}
        usRegime={usRegime}
        bistRegime={bistRegime}
        usdTryRate={usdTryRate}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onTriggerSync={handleTriggerSync}
        isRefreshing={isRefreshing}
        onOpenSettings={() => setIsSettingsSheetOpen(true)}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenReports={() => setIsReportsModalOpen(true)}
      />

      {/* Right Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 max-w-full min-h-screen overflow-x-hidden">
        {/* Sleek Top Header Bar */}
        <header className="h-14 sm:h-16 bg-white/95 dark:bg-[#070b13]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          {/* Left: Mobile Hamburger Trigger + Current Active Page Title & Subtitle */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden w-9.5 h-9.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer border border-slate-200 dark:border-slate-700 shrink-0 shadow-xs"
              title="Menüyü Aç"
              aria-label="Menüyü Aç"
            >
              ☰
            </button>
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-lg sm:text-2xl shrink-0">{TAB_TITLES[activeTab]?.icon}</span>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-tight truncate">
                  {language === 'tr' ? TAB_TITLES[activeTab]?.tr : TAB_TITLES[activeTab]?.en}
                </h1>
                <p className="text-[10px] text-slate-400 hidden sm:block truncate">
                  {activeTab === 'signals' && (language === 'tr' ? 'Algoritmik Alım Fırsatları & Kademeli Alım Bölgeleri' : 'Algorithmic Buy Opportunities & DCA Zones')}
                  {activeTab === 'assistant' && (language === 'tr' ? 'Otonom Piyasa & Portföy Danışmanı, Canlı Haber & 6 Aylık Senaryo Motoru' : 'Autonomous Market & Portfolio Copilot, Live News & 6-Month Scenario Engine')}
                  {activeTab === 'watchlist' && (language === 'tr' ? 'Portföyden Bağımsız BIST, ABD ve TEFAS Takip Listesi & Fiyat Alarmları' : 'Independent BIST, US & TEFAS Watchlist with Price Alerts')}
                  {activeTab === 'portfolio' && (language === 'tr' ? 'Canlı Portföy, Maliyetler ve Risk Kontrolü' : 'Live Portfolio, Cost Basis & Risk Controls')}
                  {activeTab === 'dividend' && (language === 'tr' ? 'Pasif Nakit Akışı, Temettü Takvimi ve AI Danışmanı' : 'Passive Cashflow, Dividend Calendar & AI Advisor')}
                  {activeTab === 'forecast' && (language === 'tr' ? 'Kartopu Büyüme Simülatörü ve DRIP Lab' : 'Snowball Growth Simulator & DRIP Lab')}
                  {activeTab === 'catalysts' && (language === 'tr' ? 'Canlı KAP Bildirimleri & Şirket Haberleri' : 'Live KAP Filings & Corporate Catalysts')}
                  {activeTab === 'quant' && (language === 'tr' ? 'Eşbütünleşme (Cointegration) & Pair Trading' : 'Statistical Arbitrage & Pair Trading')}
                  {activeTab === 'scorecard' && (language === 'tr' ? '1,173 Geçmiş Trade İstatistiği ve Başarı Oranları' : 'Historical Trade Statistics & Win Rates')}
                  {activeTab === 'orb' && (language === 'tr' ? '15-Dakikalık Açılış Kırılımları ve Seans Yönü' : 'Opening Range Breakouts & Volume Anomalies')}
                  {activeTab === 'help' && (language === 'tr' ? 'Kullanım Rehberi, Kademeli Alım (DCA) Kuralları & SSS' : 'Platform User Guide, Staggered DCA Rules & Knowledge Base')}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Sync Action + Date Filter Trigger & Actions */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Highly Visible Live Sync Button (Mobile & Desktop) */}
            <button
              type="button"
              onClick={() => handleTriggerSync(false)}
              disabled={isRefreshing}
              data-testid="mobile-sync-btn"
              className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 select-none shrink-0 ${
                isRefreshing
                  ? 'bg-blue-500/15 dark:bg-blue-500/25 text-blue-700 dark:text-blue-300 border-blue-400 dark:border-blue-600 ring-2 ring-blue-400/30'
                  : 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300/80 dark:border-emerald-700/80 hover:bg-emerald-500/20 active:bg-emerald-500/25'
              }`}
              title={language === 'tr' ? 'Piyasa Verilerini Canlı Senkronize Et' : 'Sync Live Market Data'}
              aria-label={language === 'tr' ? 'Piyasa Verilerini Senkronize Et' : 'Sync Market Data'}
            >
              <svg
                className={`w-3.5 h-3.5 shrink-0 ${isRefreshing ? 'animate-spin text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-[10px] sm:text-[11px] font-black tracking-tight hidden xs:inline sm:inline">
                {isRefreshing
                  ? (language === 'tr' ? 'Yenileniyor...' : 'Syncing...')
                  : (language === 'tr' ? 'Yenile' : 'Sync')}
              </span>
              {!isRefreshing && (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsDateFilterExpanded(prev => !prev)}
              className={`flex items-center gap-1 px-1.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 shrink-0 ${
                dateFilter.preset !== 'ALL'
                  ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border-blue-400 dark:border-blue-700 ring-2 ring-blue-400/20'
                  : isDateFilterExpanded
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300 dark:border-slate-600'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title={language === 'tr' ? 'Tarih Aralığını Filtrele' : 'Filter by Date Range'}
            >
              <span className="text-xs">📅</span>
              <span className="text-[11px] hidden sm:inline">{formatFilterDisplay(dateFilter, language)}</span>
              <span className="text-[9px] opacity-70 ml-0.5">{isDateFilterExpanded ? '▲' : '▼'}</span>
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm shadow-blue-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
              title="Yeni Takip Edilen Varlık Ekle"
            >
              <span className="font-black text-sm leading-none">+</span>
              <span className="hidden sm:inline sm:ml-1">{language === 'tr' ? 'Varlık Ekle' : 'Add Asset'}</span>
            </button>
          </div>
        </header>

        {/* Floating Sync Notification Toast */}
        {syncFeedback && (
          <div className="fixed top-18 right-4 sm:right-8 z-50 animate-bounce duration-300 pointer-events-none">
            <div className={`px-4 py-2.5 rounded-xl text-xs font-bold shadow-xl border flex items-center space-x-2 backdrop-blur-md ${
              syncFeedback.type === 'success' ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700 shadow-emerald-950/50' :
              syncFeedback.type === 'info' ? 'bg-blue-950/90 text-blue-200 border-blue-700 shadow-blue-950/50' :
              'bg-rose-950/90 text-rose-200 border-rose-700 shadow-rose-950/50'
            }`}>
              <span>{syncFeedback.message}</span>
            </div>
          </div>
        )}

        {/* Offline / Cellular Network Transition Notice */}
        {isOffline && (
          <div className="mx-2 sm:mx-6 lg:mx-8 mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">📡</span>
              <span className="truncate">
                {language === 'tr'
                  ? 'Hücresel Veri / Çevrimdışı Mod: Cihaz önbelleğindeki son veriler gösteriliyor.'
                  : 'Cellular / Offline Mode: Displaying device-cached market data.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleTriggerSync(false)}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-bold text-amber-700 dark:text-amber-300 transition-colors cursor-pointer text-[11px]"
            >
              {language === 'tr' ? 'Tekrar Dene' : 'Retry'}
            </button>
          </div>
        )}

        {/* Prominent Market Correction Warning Notice (Accessible to beginners and pro) */}
        <MarketCorrectionBanner
          bistRegime={bistRegime}
          usRegime={usRegime}
          onNavigateToTab={handleTabChange}
        />

        {/* Dedicated Full Page Content Canvas with Ample Bottom Clearance for Mobile Nav */}
        <main className={`flex-1 max-w-[1720px] w-full mx-auto px-2 sm:px-6 lg:px-8 pt-2 sm:pt-3 ${activeTab === 'assistant' ? 'pb-2 md:pb-8 space-y-2' : 'pb-28 md:pb-8 space-y-5'} min-w-0 overflow-x-hidden`}>

          {/* Universal Date Filter Bar (Expandable on click or auto-shown if active) */}
          {(isDateFilterExpanded || dateFilter.preset !== 'ALL') && (
            <DateFilterBar
              currentFilter={dateFilter}
              onChange={handleDateFilterChange}
            />
          )}

        {/* TAB 1: SIGNALS & SCANNER */}
        {activeTab === 'signals' && (
          <div className="space-y-6">
            {/* Executive Quick Stats Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {language === 'tr' ? 'Aktif Sinyal Havuzu' : 'Active Alpha Signals'}
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-black text-slate-900 dark:text-white font-mono">
                      {signals.length}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {signals.filter(s => s.market === 'BIST').length} BIST · {signals.filter(s => s.market === 'US').length} US
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {language === 'tr' ? 'Kademeli alım & momentum fırsatları' : 'DCA dip & momentum setups'}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-lg font-black shrink-0">
                  ⚡
                </div>
              </div>

              <div 
                onClick={() => handleTabChange('dividend')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTabChange('dividend'); }}
                title={language === 'tr' ? 'Temettü Portföyü ve Kartopu Projeksiyonunu Aç' : 'Open Dividend Portfolio & Projections'}
                className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all group"
              >
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-emerald-500 transition-colors">
                    {language === 'tr' ? 'İskontolu Temettü Verimi' : 'Dividend Accumulation'}
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {discountedDividendMetrics.yieldStr}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {language === 'tr'
                      ? `${discountedDividendMetrics.symbolsStr} ${discountedDividendMetrics.isInBuyZone ? 'alım bölgesinde' : 'temettü odağında'}`
                      : `${discountedDividendMetrics.symbolsStr} ${discountedDividendMetrics.isInBuyZone ? 'in deep buy zone' : 'dividend focus'}`}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-lg font-black shrink-0 group-hover:scale-110 transition-transform">
                  💎
                </div>
              </div>

              <div 
                onClick={() => handleTabChange('quant')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTabChange('quant'); }}
                title={language === 'tr' ? 'Kantitatif Rejim ve Göstergeleri Aç' : 'Open Quant Regime & Indicators'}
                className="p-3.5 rounded-2xl bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group"
              >
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-amber-500 transition-colors">
                    {language === 'tr' ? 'Piyasa Yönü & Rejim' : 'Market Regime Context'}
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-sm font-black font-mono text-slate-900 dark:text-white">
                      🇺🇸 SPY: {getLocalizedRegime(usRegime?.status)} · 🇹🇷 BIST: {getLocalizedRegime(bistRegime?.status)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 line-clamp-1" title={dynamicMarketContextSubtitle}>
                    {dynamicMarketContextSubtitle}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg font-black shrink-0 group-hover:scale-110 transition-transform">
                  🌐
                </div>
              </div>
            </div>

            <div className="flex flex-col xl:flex-row items-start gap-6">
              <div className="flex-1 min-w-0 space-y-4 w-full">
                <div className="flex justify-between items-end flex-wrap gap-2">
                  <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white">{t.signals.title}</h2>
                    <p className="text-xs text-gray-500">{t.signals.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleToggleRightPanel}
                      className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors hidden sm:inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title={isRightPanelOpen ? (language === 'tr' ? 'Rehber / Hesaplayıcı Yan Panelini Gizle' : 'Hide Guide & Calculator Panel') : (language === 'tr' ? 'Rehber / Hesaplayıcı Yan Panelini Göster' : 'Show Guide & Calculator Panel')}
                    >
                      <span className="text-xs">{isRightPanelOpen ? '⇥' : '⇤'}</span>
                      <span>
                        {isRightPanelOpen 
                          ? (language === 'tr' ? 'Yan Paneli Gizle' : 'Hide Panel') 
                          : (language === 'tr' ? 'Yan Paneli Aç' : 'Show Panel')}
                      </span>
                    </button>
                    <button
                      onClick={() => handleTabChange('scorecard')}
                      className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 transition-colors inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                      title={language === 'tr' ? "Tüm taranan geçmiş işlemleri ve başarı karnesini inceleyin" : "View all historical scanned trades and outcomes"}
                    >
                      <span>📜</span>
                      <span>{t.signals.scanAuditBtn} ({scannedSignals.length}) →</span>
                    </button>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
                      {(() => {
                        const count = signals.filter(sig => {
                          const cleanSym = sig.symbol.replace('.IS', '').trim().toUpperCase();
                          const matchedHolding = portfolio.find(p => p.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym) || null;
                          const userHasShares = Boolean(matchedHolding && matchedHolding.shares > 0);
                          
                          // USER CRITICAL RULE: If holding the stock, NEVER remove it!
                          if (userHasShares) return true;

                          const isTargetHit = Boolean(sig.currentPrice && sig.targetPrice && sig.currentPrice >= sig.targetPrice);
                          const isStoppedOut = Boolean(sig.currentPrice && sig.stopLoss && sig.currentPrice <= sig.stopLoss);
                          if (isTargetHit || isStoppedOut) return false;

                          // Filter unowned expired setups
                          const timing = calculateExitDate(sig.date, sig.strategy, false);
                          if (timing.isExpired) return false;

                          return true;
                        }).length;
                        return `${count} ${t.common.active}`;
                      })()}
                    </span>
                  </div>
                </div>

                {/* Quick Filter Bar */}
                {(() => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  
                  // USER RULE: Filter signals so that:
                  // - If user is HOLDING the stock -> NEVER remove it! It stays visible with full position controls!
                  // - If user has 0 shares:
                  //   - If it hit target or stopped out -> filtered out (archived in Scorecard)
                  //   - If its holding period expired -> filtered out (archived in Scorecard)
                  // Helper to match trade types across variations
                  const matchesStrategy = (sigStrategy: string, filterKey: string): boolean => {
                    if (!filterKey || filterKey === 'ALL') return true;
                    const s = (sigStrategy || '').toUpperCase();
                    if (filterKey === 'MEAN_REVERSION') return s.includes('REVERSION');
                    if (filterKey === 'TREND_PULLBACK') return s.includes('PULLBACK') || s.includes('EMA');
                    if (filterKey === 'MOMENTUM_BREAKOUT') return s.includes('BREAKOUT') || (s.includes('MOMENTUM') && !s.includes('FUND'));
                    if (filterKey === 'VOLATILITY_SQUEEZE') return s.includes('SQUEEZE');
                    if (filterKey === 'FUND_MOMENTUM') return s.includes('FUND');
                    if (filterKey === 'ANCHORED_VWAP') return s.includes('VWAP') || s.includes('AVWAP');
                    if (filterKey === 'LIQUIDITY_SWEEP') return s.includes('SWEEP') || s.includes('HUNT') || s.includes('LIQUIDITY');
                    if (filterKey === 'RELATIVE_STRENGTH') return s.includes('RELATIVE') || s.includes('STRENGTH') || s.includes('RS');
                    if (filterKey === 'MINERVINI_VCP') return s.includes('VCP') || s.includes('MINERVINI');
                    if (filterKey === 'HIGH_TIGHT_FLAG') return s.includes('FLAG') || s.includes('HTF');
                    if (filterKey === 'CONNORS_RSI') return s.includes('CONNORS') || s.includes('RSI-2') || s.includes('RSI2');
                    return s === filterKey.toUpperCase();
                  };

                  const activeDisplaySignals = signals.filter(sig => {
                    const cleanSym = sig.symbol.replace('.IS', '').trim().toUpperCase();
                    const matchedHolding = portfolio.find(p => p.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym) || null;
                    const userHasShares = Boolean(matchedHolding && matchedHolding.shares > 0);

                    // If user is currently viewing the RECOVERED tab:
                    if (signalFilter === 'RECOVERED') {
                      const isRecovered = Boolean(
                        sig.recoveryTracking && (
                          sig.recoveryTracking.hasRecoveredEntry ||
                          sig.recoveryTracking.hasRecoveredPrePullback ||
                          sig.recoveryTracking.hasReachedTargetAfterExit
                        )
                      );
                      if (!isRecovered) return false;
                      if (dateFilter && dateFilter.preset !== 'ALL') {
                        const matchesDate = isDateInRange(sig.date, dateFilter) || isDateInRange(sig.lastConfirmedDate, dateFilter);
                        if (!matchesDate) return false;
                      }
                      return true;
                    }

                    // For regular live trade tabs, suppress closed signals
                    if (sig.status && sig.status !== 'open') return false;

                    // USER CRITICAL RULE: If user is holding the stock, NEVER remove it!
                    if (userHasShares) {
                      if (turmoilGuard && selectedStrategyFilter !== 'MEAN_REVERSION' && sig.strategy.toLowerCase().includes('reversion')) {
                        return false;
                      }
                      if (dateFilter && dateFilter.preset !== 'ALL') {
                        const matchesDate = isDateInRange(sig.date, dateFilter) || isDateInRange(sig.lastConfirmedDate, dateFilter);
                        if (!matchesDate) return false;
                      }
                      return true;
                    }

                    // For unowned prospective signals:
                    const isTargetHit = Boolean(sig.currentPrice && sig.targetPrice && sig.currentPrice >= sig.targetPrice);
                    const isStoppedOut = Boolean(sig.currentPrice && sig.stopLoss && sig.currentPrice <= sig.stopLoss);

                    if (isTargetHit || isStoppedOut) return false;

                    // Exclude unowned setups whose time-stop horizon has expired
                    const timing = calculateExitDate(sig.date, sig.strategy, false);
                    if (timing.isExpired) return false;

                    // Turmoil Guard: When active, suppress dangerous Mean Reversion falling-knife trades
                    // BUT if the user explicitly selected 'MEAN_REVERSION' in the Trade Type dropdown, allow viewing them!
                    if (turmoilGuard && selectedStrategyFilter !== 'MEAN_REVERSION' && sig.strategy.toLowerCase().includes('reversion')) {
                      return false;
                    }

                    // Universal Date Filter
                    if (dateFilter && dateFilter.preset !== 'ALL') {
                      const matchesDate = isDateInRange(sig.date, dateFilter) || isDateInRange(sig.lastConfirmedDate, dateFilter);
                      if (!matchesDate) return false;
                    }

                    return true;
                  });

                  const strategyOptions = [
                    { key: 'MEAN_REVERSION', icon: '🔄', label: language === 'tr' ? 'Ortalamaya Dönüş' : 'Mean Reversion', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'MEAN_REVERSION')).length },
                    { key: 'TREND_PULLBACK', icon: '📈', label: language === 'tr' ? 'Trend Düzeltmesi' : 'Trend Pullback', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'TREND_PULLBACK')).length },
                    { key: 'MOMENTUM_BREAKOUT', icon: '⚡', label: language === 'tr' ? 'Momentum Kırılımı' : 'Momentum Breakout', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'MOMENTUM_BREAKOUT')).length },
                    { key: 'VOLATILITY_SQUEEZE', icon: '💥', label: language === 'tr' ? 'Sıkışma Patlaması' : 'Volatility Squeeze', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'VOLATILITY_SQUEEZE')).length },
                    { key: 'MINERVINI_VCP', icon: '📐', label: language === 'tr' ? 'Minervini VCP' : 'Minervini VCP', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'MINERVINI_VCP')).length },
                    { key: 'HIGH_TIGHT_FLAG', icon: '🚩', label: language === 'tr' ? 'High Tight Flag' : 'High Tight Flag', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'HIGH_TIGHT_FLAG')).length },
                    { key: 'CONNORS_RSI', icon: '⚡', label: language === 'tr' ? 'Connors RSI-2 Rebound' : 'Connors RSI-2 Rebound', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'CONNORS_RSI')).length },
                    { key: 'FUND_MOMENTUM', icon: '🏦', label: language === 'tr' ? 'Fon Momentumu' : 'Fund Momentum', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'FUND_MOMENTUM')).length },
                    { key: 'ANCHORED_VWAP', icon: '🏛️', label: language === 'tr' ? 'Kurumsal AVWAP' : 'Anchored VWAP', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'ANCHORED_VWAP')).length },
                    { key: 'LIQUIDITY_SWEEP', icon: '🧲', label: language === 'tr' ? 'Likidite Avı & Geri Alım' : 'Liquidity Sweep', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'LIQUIDITY_SWEEP')).length },
                    { key: 'RELATIVE_STRENGTH', icon: '💎', label: language === 'tr' ? 'Göreceli Güç Lideri' : 'Relative Strength Leader', count: activeDisplaySignals.filter(s => matchesStrategy(s.strategy, 'RELATIVE_STRENGTH')).length },
                  ].filter(opt => opt.count > 0 || opt.key === selectedStrategyFilter);

                  const latestDate = activeDisplaySignals.length > 0 
                    ? [...activeDisplaySignals.map(s => s.lastConfirmedDate || s.date)].sort().reverse()[0] 
                    : todayStr;

                  const isFromToday = (s: any) => (
                    s.date === latestDate || 
                    s.lastConfirmedDate === latestDate || 
                    s.date === todayStr || 
                    s.lastConfirmedDate === todayStr
                  );

                  const todayCount = activeDisplaySignals.filter(isFromToday).length;
                  const bistCount = activeDisplaySignals.filter(s => s.market === 'BIST').length;
                  const usCount = activeDisplaySignals.filter(s => s.market === 'US').length;
                  const runnerCount = activeDisplaySignals.filter(s => Boolean(s.currentPrice && s.targetPrice && s.currentPrice >= s.targetPrice)).length;
                  const buyZoneCount = activeDisplaySignals.filter(s => !(s.currentPrice && s.targetPrice && s.currentPrice >= s.targetPrice) && !(s.currentPrice && s.stopLoss && s.currentPrice <= s.stopLoss)).length;
                  const recoveredCount = signals.filter(s => Boolean(
                    s.recoveryTracking && (
                      s.recoveryTracking.hasRecoveredEntry ||
                      s.recoveryTracking.hasRecoveredPrePullback ||
                      s.recoveryTracking.hasReachedTargetAfterExit
                    )
                  )).length;

                  return (
                    <div className="w-full max-w-full overflow-hidden">
                      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 touch-pan-x no-scrollbar w-full">
                      {/* TRADE TYPE DROPDOWN FILTER */}
                      <div className="relative shrink-0">
                        <div className={`flex items-center rounded-xl px-2.5 py-1 border shadow-xs transition-all ${
                          selectedStrategyFilter !== 'ALL'
                            ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-400/30 font-bold'
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400'
                        }`}>
                          <span className="text-xs mr-1.5 select-none">🎯</span>
                          <select
                            value={selectedStrategyFilter}
                            onChange={(e) => setSelectedStrategyFilter(e.target.value)}
                            className="bg-transparent text-xs font-black focus:outline-none cursor-pointer pr-1 text-gray-900 dark:text-white"
                            aria-label={language === 'tr' ? 'İşlem Tipi Filtresi' : 'Trade Type Filter'}
                          >
                            <option value="ALL" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                              {language === 'tr' ? 'Tüm İşlem Tipleri' : 'All Trade Types'} ({activeDisplaySignals.length})
                            </option>
                            {strategyOptions.map(opt => (
                              <option key={opt.key} value={opt.key} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                                {opt.icon} {opt.label} ({opt.count})
                              </option>
                            ))}
                          </select>
                          {selectedStrategyFilter !== 'ALL' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedStrategyFilter('ALL'); }}
                              className="ml-1 text-[10px] text-gray-400 hover:text-rose-500 cursor-pointer font-bold px-0.5"
                              title={language === 'tr' ? 'İşlem tipi filtresini temizle' : 'Clear trade type filter'}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setSignalFilter('ALL')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          signalFilter === 'ALL'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {t.signals.filterAll} ({activeDisplaySignals.length})
                      </button>
                      <button
                        onClick={() => setSignalFilter('BUY_ZONE')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                          signalFilter === 'BUY_ZONE'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        <span>🟢</span>
                        <span>{t.signals.filterBuyZone} ({buyZoneCount})</span>
                      </button>
                      {runnerCount > 0 && (
                        <button
                          onClick={() => setSignalFilter('TARGET_HIT')}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                            signalFilter === 'TARGET_HIT'
                              ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-400'
                              : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100'
                          }`}
                        >
                          <span>🚀</span>
                          <span>{t.signals.filterRunners} ({runnerCount})</span>
                        </button>
                      )}
                      {recoveredCount > 0 && (
                        <button
                          onClick={() => setSignalFilter('RECOVERED')}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                            signalFilter === 'RECOVERED'
                              ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                          }`}
                        >
                          <span>✨</span>
                          <span>{language === 'tr' ? 'Toparlananlar' : 'Recovered'} ({recoveredCount})</span>
                        </button>
                      )}
                      <button
                        onClick={() => setSignalFilter('TODAY')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                          signalFilter === 'TODAY'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        <span>🔥</span>
                        <span>{t.signals.filterToday} ({todayCount})</span>
                      </button>
                      <button
                        onClick={() => setSignalFilter('BIST')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                          signalFilter === 'BIST'
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span>🇹🇷</span>
                        <span>BIST ({bistCount})</span>
                      </button>
                      <button
                        onClick={() => setSignalFilter('US')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1 whitespace-nowrap ${
                          signalFilter === 'US'
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <span>🇺🇸</span>
                        <span>{t.signals.filterUs} ({usCount})</span>
                      </button>
                      <button
                        onClick={() => setTurmoilGuard(!turmoilGuard)}
                        className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center space-x-1.5 ml-auto border shadow-sm whitespace-nowrap ${
                          turmoilGuard
                            ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20 ring-2 ring-emerald-400'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                        }`}
                        title={language === 'tr' 
                          ? "Piyasa çalkantısında dip arama (Mean Reversion) tuzaklarını engeller, sadece güçlü trend kırılımlarını gösterir." 
                          : "Filters out knife-catching mean reversion setups during market turmoil."}
                      >
                        <span>🛡️</span>
                        <span>{turmoilGuard ? (language === 'tr' ? 'Güvenli Mod: AÇIK' : 'Turmoil Guard: ON') : (language === 'tr' ? 'Güvenli Mod: KAPALI' : 'Turmoil Guard: OFF')}</span>
                      </button>
                    </div>
                  </div>
                  );
                })()}
                
                <div className={`grid grid-cols-1 ${
                  isRightPanelOpen 
                    ? 'md:grid-cols-2 2xl:grid-cols-3' 
                    : 'md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'
                } gap-4`}>
                  {(() => {
                    const matchesStrategy = (sigStrategy: string, filterKey: string): boolean => {
                      if (!filterKey || filterKey === 'ALL') return true;
                      const s = (sigStrategy || '').toUpperCase();
                      if (filterKey === 'MEAN_REVERSION') return s.includes('REVERSION');
                      if (filterKey === 'TREND_PULLBACK') return s.includes('PULLBACK') || s.includes('EMA');
                      if (filterKey === 'MOMENTUM_BREAKOUT') return s.includes('BREAKOUT') || (s.includes('MOMENTUM') && !s.includes('FUND'));
                      if (filterKey === 'VOLATILITY_SQUEEZE') return s.includes('SQUEEZE');
                      if (filterKey === 'FUND_MOMENTUM') return s.includes('FUND');
                      if (filterKey === 'ANCHORED_VWAP') return s.includes('VWAP') || s.includes('AVWAP');
                      if (filterKey === 'LIQUIDITY_SWEEP') return s.includes('SWEEP') || s.includes('HUNT') || s.includes('LIQUIDITY');
                      if (filterKey === 'RELATIVE_STRENGTH') return s.includes('RELATIVE') || s.includes('STRENGTH') || s.includes('RS');
                      if (filterKey === 'MINERVINI_VCP') return s.includes('VCP') || s.includes('MINERVINI');
                      if (filterKey === 'HIGH_TIGHT_FLAG') return s.includes('FLAG') || s.includes('HTF');
                      if (filterKey === 'CONNORS_RSI') return s.includes('CONNORS') || s.includes('RSI-2') || s.includes('RSI2');
                      return s === filterKey.toUpperCase();
                    };

                    const activeDisplaySignals = signals.filter(sig => {
                      const cleanSym = sig.symbol.replace('.IS', '').trim().toUpperCase();
                      const matchedHolding = portfolio.find(p => p.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym) || null;
                      const userHasShares = Boolean(matchedHolding && matchedHolding.shares > 0);

                      // If viewing RECOVERED tab:
                      if (signalFilter === 'RECOVERED') {
                        const isRecovered = Boolean(
                          sig.recoveryTracking && (
                            sig.recoveryTracking.hasRecoveredEntry ||
                            sig.recoveryTracking.hasRecoveredPrePullback ||
                            sig.recoveryTracking.hasReachedTargetAfterExit
                          )
                        );
                        if (!isRecovered) return false;
                        if (dateFilter && dateFilter.preset !== 'ALL') {
                          const matchesDate = isDateInRange(sig.date, dateFilter) || isDateInRange(sig.lastConfirmedDate, dateFilter);
                          if (!matchesDate) return false;
                        }
                        return true;
                      }

                      // Suppress closed signals from live tabs
                      if (sig.status && sig.status !== 'open') return false;

                      const isTargetHit = Boolean(sig.currentPrice && sig.targetPrice && sig.currentPrice >= sig.targetPrice);
                      const isStoppedOut = Boolean(sig.currentPrice && sig.stopLoss && sig.currentPrice <= sig.stopLoss);

                      if (isTargetHit && !userHasShares) return false;
                      if (isStoppedOut && !userHasShares) return false;

                      // Exclude unowned setups whose time-stop horizon has expired
                      const timing = calculateExitDate(sig.date, sig.strategy, false);
                      if (timing.isExpired && !userHasShares) return false;

                      // Turmoil Guard: When active, suppress dangerous Mean Reversion falling-knife trades
                      // BUT if the user explicitly selected 'MEAN_REVERSION' in the Trade Type dropdown, allow viewing them!
                      if (turmoilGuard && selectedStrategyFilter !== 'MEAN_REVERSION' && sig.strategy.toLowerCase().includes('reversion')) {
                        return false;
                      }

                      // Universal Date Filter
                      if (dateFilter && dateFilter.preset !== 'ALL') {
                        const matchesDate = isDateInRange(sig.date, dateFilter) || isDateInRange(sig.lastConfirmedDate, dateFilter);
                        if (!matchesDate) return false;
                      }

                      return true;
                    });

                    const filtered = activeDisplaySignals.filter(sig => {
                      if (signalFilter === 'RECOVERED') {
                        const isRecovered = Boolean(
                          sig.recoveryTracking && (
                            sig.recoveryTracking.hasRecoveredEntry ||
                            sig.recoveryTracking.hasRecoveredPrePullback ||
                            sig.recoveryTracking.hasReachedTargetAfterExit
                          )
                        );
                        if (!isRecovered) return false;
                      }
                      if (signalFilter === 'BUY_ZONE') {
                        const inBuyZone = !(sig.currentPrice && sig.targetPrice && sig.currentPrice >= sig.targetPrice) && !(sig.currentPrice && sig.stopLoss && sig.currentPrice <= sig.stopLoss);
                        if (!inBuyZone) return false;
                      }
                      if (signalFilter === 'TARGET_HIT') {
                        const isHit = Boolean(sig.currentPrice && sig.targetPrice && sig.currentPrice >= sig.targetPrice);
                        if (!isHit) return false;
                      }
                      if (signalFilter === 'TODAY') {
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const latestDate = activeDisplaySignals.length > 0 ? [...activeDisplaySignals.map(s => s.lastConfirmedDate || s.date)].sort().reverse()[0] : '';
                        const isToday = sig.date === latestDate || sig.lastConfirmedDate === latestDate || sig.date === todayStr || sig.lastConfirmedDate === todayStr;
                        if (!isToday) return false;
                      }
                      if (signalFilter === 'BIST' && sig.market !== 'BIST') return false;
                      if (signalFilter === 'US' && sig.market !== 'US') return false;

                      // TRADE TYPE / STRATEGY FILTER
                      if (selectedStrategyFilter !== 'ALL') {
                        if (!matchesStrategy(sig.strategy, selectedStrategyFilter)) {
                          return false;
                        }
                      }

                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="col-span-1 md:col-span-2 p-8 text-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2">
                          <span className="text-3xl block">🎯</span>
                          <h3 className="text-base font-bold text-gray-900 dark:text-white">{t.signals.noActiveTrades}</h3>
                          <p className="text-xs text-gray-500 max-w-md mx-auto">
                            {selectedStrategyFilter !== 'ALL'
                              ? (language === 'tr' ? 'Seçilen işlem tipine uygun aktif kurulum bulunamadı.' : 'No active setups found matching the selected trade type.')
                              : t.signals.noActiveDesc}
                          </p>
                          <div className="flex justify-center gap-2 pt-1">
                            {selectedStrategyFilter !== 'ALL' && (
                              <button
                                type="button"
                                onClick={() => setSelectedStrategyFilter('ALL')}
                                className="px-3 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 rounded-lg border border-blue-200 dark:border-blue-800 cursor-pointer hover:bg-blue-100"
                              >
                                {language === 'tr' ? 'Tüm İşlem Tiplerini Göster' : 'Show All Trade Types'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setSignalFilter('ALL'); setSelectedStrategyFilter('ALL'); }}
                              className="px-3 py-1 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-200"
                            >
                              {t.signals.resetFilter}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return filtered.map((sig, idx) => {
                      const cleanSym = sig.symbol.replace('.IS', '').trim().toUpperCase();
                      const matchedHolding = portfolio.find(p => p.symbol.replace('.IS', '').trim().toUpperCase() === cleanSym) || null;

                      return (
                        <TradeCard 
                          key={idx} 
                          signal={sig} 
                          userHolding={matchedHolding}
                          onSelectTicker={handleSelectTicker}
                          onCalcSize={(s) => {
                            setCalcTrade({
                              entryPrice: s.entryPrice,
                              stopLoss: s.stopLoss,
                              targetPrice: s.targetPrice,
                              currency: s.currency as 'USD' | 'TRY',
                              symbol: s.symbol
                            });
                            setIsCalcModalOpen(true);
                          }}
                          onOpenCoPilot={handleOpenCoPilotForSignal}
                          onTradeHolding={(h) => {
                            setSelectedHolding(h);
                            setTradeModalOpen(true);
                          }}
                        />
                      );
                    });
                  })()}
                </div>
              </div>

              {isRightPanelOpen && (
                <div className="w-full xl:w-80 2xl:w-96 shrink-0 space-y-4">
                  {isSimpleMode ? (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-750 shadow-sm space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🌱</span>
                          <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                            {language === 'tr' ? 'Yeni Başlayanlar Rehberi' : 'Beginner Safety Guide'}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                            {language === 'tr' ? 'Sade Mod' : 'Simple'}
                          </span>
                          <button
                            type="button"
                            onClick={handleToggleRightPanel}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                            title={language === 'tr' ? 'Paneli Kapat' : 'Close Panel'}
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span>💧</span>
                            <span>{language === 'tr' ? 'Kural 1: Kademeli Alım (DCA)' : 'Rule 1: Staggered DCA'}</span>
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                            {language === 'tr'
                              ? 'Tüm paranızla tek seferde alım yapmayın. Parayı 3 eşit parçaya bölüp, hisse düştükçe parça parça alarak ortalama maliyetinizi düşürün.'
                              : 'Never invest all your cash at one price. Divide your capital into 3 tranches and buy progressively as the stock dips.'}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span>💰</span>
                            <span>{language === 'tr' ? 'Kural 2: Temettü Kartopu' : 'Rule 2: Dividend Snowball'}</span>
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                            {language === 'tr'
                              ? 'ISMEN, TURSG, TUPRS gibi kârlı şirketler hisse fiyatı düşse bile hesabınıza nakit temettü yatırır. Bu nakitle tekrar alım yaparak servetinizi büyütün.'
                              : 'High-quality dividend payers continue distributing cash even during corrections, compounding your portfolio over time.'}
                          </p>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-750/50 border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span>🛡️</span>
                            <span>{language === 'tr' ? 'Kural 3: Panik Satışı Yapmayın' : 'Rule 3: Avoid Panic Selling'}</span>
                          </span>
                          <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                            {language === 'tr'
                              ? 'Borsa düşüşleri geçicidir. Zararına panik satışı yapmak yerine sakin kalarak bilançosu güçlü, borçsuz şirketlerde kalın.'
                              : 'Market corrections are temporary. Avoid panic selling fundamentally sound companies at the market bottom.'}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleTabChange('dividend')}
                        className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        <span>🤖</span>
                        <span>{language === 'tr' ? 'AI Temettü Danışmanına Soru Sor →' : 'Ask AI Dividend Advisor →'}</span>
                      </button>
                    </div>
                  ) : (
                    <PositionCalculator selectedTrade={calcTrade} />
                  )}
                </div>
              )}
            </div>

            {!isSimpleMode && (
              <div className="pt-2">
                <AssetTable 
                  assets={assets} 
                  onSelectAsset={(asset) => setSelectedAssetForHistory(asset)}
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 1.5: CATALYSTS & KAP DISCLOSURES */}
        {activeTab === 'catalysts' && (
          <CatalystFeedView
            catalysts={catalysts}
            portfolio={portfolio}
            signals={signals}
            dateFilter={dateFilter}
            onSelectTicker={handleSelectTicker}
            onNavigateToTab={handleTabChange}
          />
        )}

        {/* TAB 1.8: INSTITUTIONAL QUANT & PAIRS STAT-ARB */}
        {activeTab === 'quant' && (
          <QuantHubView dateFilter={dateFilter} portfolioValueTRY={totalPortfolioValueTRY} />
        )}

        {/* TAB: WATCHLIST & RADAR (FAVORİLER) */}
        {activeTab === 'watchlist' && (
          <WatchlistView
            onAddToPortfolio={(asset) => {
              const isTry = asset.currency === 'TRY' || asset.market === 'BIST' || asset.market === 'TEFAS';
              const currentP = asset.currentPrice || 100;
              const defaultShares = isTry ? 10 : 2;
              const item: PortfolioItem = {
                symbol: asset.symbol,
                name: asset.name,
                market: asset.market,
                shares: defaultShares,
                entryPrice: currentP,
                currentPrice: currentP,
                currency: asset.currency || (isTry ? 'TRY' : 'USD'),
                totalCost: currentP * defaultShares,
                currentValue: currentP * defaultShares,
                pnlAmount: 0,
                pnlPercent: 0,
                stopLoss: Number((currentP * 0.95).toFixed(2)),
                targetPrice: Number((currentP * 1.15).toFixed(2)),
                distanceToStop: -5.0,
                isDividend: false,
                dcaZone: 'BUY',
                dcaRationale: 'Takip listesinden portföye eklendi.',
                entryDate: new Date().toISOString().slice(0, 10),
              };
              handleAddHolding(item);
              setActiveTab('portfolio');
            }}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {/* TAB 2: MY PORTFOLIO & DCA */}
        {activeTab === 'portfolio' && (
          <PortfolioView
            portfolio={portfolio}
            signals={signals}
            realizedTrades={realizedTrades}
            orders={executedOrders}
            transfers={transfers}
            usdTryRate={usdTryRate}
            cashBalanceTRY={cashBalance}
            dateFilter={dateFilter}
            isSimpleMode={isSimpleMode}
            onRemoveHolding={handleRemoveHolding}
            onAddHoldingClick={() => setIsHoldingModalOpen(true)}
            onTradeHolding={(item) => {
              setSelectedHolding(item);
              setTradeModalOpen(true);
            }}
            onAddTransfer={handleAddTransfer}
            onUpdateStopLoss={handleUpdateStopLoss}
            onUpdateTargetPrice={handleUpdateTargetPrice}
            onOpenCoPilot={handleOpenCoPilotForHolding}
            onToggleStrategyType={handleToggleStrategyType}
            onSelectTicker={handleSelectTicker}
            portfolioDividends={dividends}
            orbItems={orbItems}
          />
        )}

        {/* TAB 3: DIVIDEND TRACKER */}
        {activeTab === 'dividend' && (
          <DividendView
            dividendAssets={dividends}
            allMarketDividends={allMarketDividends}
            usdTryRate={usdTryRate}
            dateFilter={dateFilter}
            onSelectTicker={handleSelectTicker}
            onImportCandidate={(cand) => {
              if (!cand.price || cand.price <= 0) {
                console.warn('Blocked adding candidate with missing or zero market price:', cand.symbol);
                return;
              }
              handleAddHolding({
                symbol: cand.symbol,
                name: cand.name,
                market: cand.market,
                shares: cand.shares,
                entryPrice: cand.price,
                currentPrice: cand.price,
                currency: cand.market === 'US' ? 'USD' : 'TRY',
                totalCost: cand.shares * cand.price,
                currentValue: cand.shares * cand.price,
                pnlAmount: 0,
                pnlPercent: 0,
                stopLoss: 0,
                distanceToStop: 0,
                isDividend: true,
                dcaZone: 'BUY',
                dcaRationale: 'Synthesized from AI Dividend Portfolio Lab'
              }, true);
              handleTabChange('portfolio');
            }}
          />
        )}

        {/* TAB: DIVIDEND FORECAST & COMPARATOR */}
        {activeTab === 'forecast' && (
          <DividendForecastView
            usdTryRate={usdTryRate}
            userDividendAssets={dividends}
            onSelectTicker={handleSelectTicker}
          />
        )}

        {/* TAB 4: STRATEGY SCORECARD & SCAN AUDIT */}
        {activeTab === 'scorecard' && (
          <ScorecardView 
            strategies={strategies} 
            scannedSignals={scannedSignals}
            dateFilter={dateFilter}
            onSelectTicker={handleSelectTicker}
          />
        )}

        {/* TAB 5: OPENING DIRECTION (ORB) */}
        {activeTab === 'orb' && (
          <OpeningDirectionView 
            items={orbItems}
            portfolioSymbols={new Set(portfolio.map(p => p.symbol.replace('.IS', '').toUpperCase()))}
            dateFilter={dateFilter}
            onSelectTicker={handleSelectTicker}
            onRefreshSync={async () => { await handleTriggerSync(false); }}
          />
        )}

        {/* TAB: AI ASSISTANT & MARKET COPILOT (Kept mounted to preserve ongoing generation & instant tab switching) */}
        <div className={activeTab === 'assistant' ? 'block' : 'hidden'}>
          <AiAssistantView />
        </div>

        {/* TAB 6: HELP CENTER & USER GUIDE */}
        {activeTab === 'help' && (
          <HelpCenterView
            onNavigateToTab={handleTabChange}
            onOpenSettings={() => setIsSettingsSheetOpen(true)}
          />
        )}
      </main>

      {/* Floating Add Asset Button (Desktop only; on mobile, access via top header) */}
      <button 
        onClick={() => setIsModalOpen(true)}
        className="hidden sm:flex fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl items-center justify-center transition-transform hover:scale-110 z-30 focus:outline-none focus:ring-4 focus:ring-blue-500/50 cursor-pointer"
        title="Add Asset to Track"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
      </button>

      {/* Mobile Sticky Bottom Navigation (< 768px) */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        catalystsCount={catalysts.length}
        isSimpleMode={isSimpleMode}
        onToggleSimpleMode={handleToggleSimpleMode}
        onTriggerSync={handleTriggerSync}
        isRefreshing={isRefreshing}
      />

      <AddAssetModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {
          console.log('Asset added successfully.');
          handleTriggerSync();
        }}
      />

      <AddHoldingModal
        isOpen={isHoldingModalOpen}
        onClose={() => setIsHoldingModalOpen(false)}
        onAddHolding={handleAddHolding}
        availableAssets={assets}
      />

      <TradeHoldingModal
        isOpen={tradeModalOpen}
        holding={selectedHolding}
        recentOrders={executedOrders}
        onClose={() => {
          setTradeModalOpen(false);
          setSelectedHolding(null);
        }}
        onBuyMore={handleBuyMoreHolding}
        onSell={handleSellHolding}
      />

      <AssetHistoryModal
        isOpen={!!selectedAssetForHistory}
        onClose={() => setSelectedAssetForHistory(null)}
        asset={selectedAssetForHistory}
      />

      <PositionCalculatorModal
        isOpen={isCalcModalOpen}
        onClose={() => setIsCalcModalOpen(false)}
        selectedTrade={calcTrade}
        onSelectTicker={handleSelectTicker}
      />

      <AiTradeCoPilotModal
        isOpen={!!coPilotAsset}
        onClose={() => setCoPilotAsset(null)}
        asset={coPilotAsset}
        onUpdateStopLoss={handleUpdateStopLoss}
        onTradeHolding={(holding) => {
          setSelectedHolding(holding);
          setTradeModalOpen(true);
        }}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      <ReportsArchiveModal
        isOpen={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
      />

      {/* Mobile Settings & Profile Slide-Up Action Sheet */}
      {isSettingsSheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsSettingsSheetOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] bg-white dark:bg-[#0a0f1d] rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 shadow-2xl z-50 space-y-4 animate-in slide-in-from-bottom duration-250 safe-bottom">
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />

            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                <h3 className="text-base font-black text-gray-900 dark:text-white">
                  {language === 'tr' ? 'Uygulama Ayarları & Profil' : 'Settings & Profile'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsSheetOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Section 1: User Account */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3.5 border border-gray-200 dark:border-gray-700/60 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                {language === 'tr' ? 'Kullanıcı Hesabı' : 'Account'}
              </span>
              {user ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                    <span className="text-xs font-bold text-gray-900 dark:text-white truncate">
                      {user.email}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      signOut();
                      setIsSettingsSheetOpen(false);
                    }}
                    className="px-2.5 py-1 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 rounded-xl border border-rose-200 dark:border-rose-900/50 cursor-pointer"
                  >
                    {language === 'tr' ? 'Çıkış Yap' : 'Sign Out'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                      👀 {language === 'tr' ? 'Model Portföy Modu' : 'Demo Mode'}
                    </span>
                    <p className="text-[10px] text-gray-400">
                      {language === 'tr' ? 'Kendi portföyünüz için giriş yapın' : 'Sign in to access your portfolio'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsSettingsSheetOpen(false);
                      setIsAuthModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-black text-white bg-blue-600 rounded-xl shadow-xs cursor-pointer"
                  >
                    {language === 'tr' ? 'Giriş Yap' : 'Sign In'}
                  </button>
                </div>
              )}
            </div>

            {/* Section 2: Language Selector */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3.5 border border-gray-200 dark:border-gray-700/60 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                {language === 'tr' ? 'Dil Seçimi' : 'Language'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLanguage('tr')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                    language === 'tr'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span>🇹🇷</span>
                  <span>Türkçe</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                    language === 'en'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span>🇬🇧</span>
                  <span>English</span>
                </button>
              </div>
            </div>

            {/* Section 3: Gemini AI API Key (Optional) */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3.5 border border-gray-200 dark:border-gray-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  {language === 'tr' ? '🤖 Gemini AI Danışman Motoru' : '🤖 Gemini AI Engine'}
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                  {geminiApiKey ? (language === 'tr' ? '✓ Bağlı' : '✓ Active') : (language === 'tr' ? 'İsteğe Bağlı' : 'Optional')}
                </span>
              </div>
              <p className="text-[10px] text-gray-500">
                {language === 'tr'
                  ? 'Kendi Google Gemini API anahtarınızı girerek tüm sektörler ve hisseler için canlı LLM akıl yürütmesini etkinleştirebilirsiniz.'
                  : 'Enter your Google Gemini API key to enable live LLM reasoning for any sector or stock.'}
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setGeminiApiKey(val);
                    if (val) {
                      localStorage.setItem('gemini_api_key', val);
                    } else {
                      localStorage.removeItem('gemini_api_key');
                    }
                  }}
                  placeholder="AIzaSy..."
                  className="flex-1 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs font-mono text-gray-900 dark:text-white"
                />
                {geminiApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setGeminiApiKey('');
                      localStorage.removeItem('gemini_api_key');
                    }}
                    className="p-1.5 text-xs text-rose-500 hover:text-rose-600 font-bold"
                    title={language === 'tr' ? 'Anahtarı Sil' : 'Clear Key'}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Section 4: Deep Web Crawler */}
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3.5 border border-gray-200 dark:border-gray-700/60 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                {language === 'tr' ? 'Veri Motoru' : 'Data Engine'}
              </span>
              <button
                type="button"
                onClick={() => {
                  handleTriggerSync(true);
                  setIsSettingsSheetOpen(false);
                }}
                disabled={isRefreshing}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span>⚡</span>
                <span>{language === 'tr' ? 'Derin Web Taraması Başlat (KAP & Yahoo)' : 'Run Deep Web Crawler'}</span>
              </button>
            </div>

            {/* Section 4: System Connection Status */}
            <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{t.common.connected}</span>
              </span>
              {lastRefreshedAt && <span>Son yenilenme: {lastRefreshedAt}</span>}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
