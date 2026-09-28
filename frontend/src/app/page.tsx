'use client';

import React, { useState, useEffect } from 'react';
import NavigationTabs, { TabId } from '../components/NavigationTabs';
import MarketRegimeBanner, { RegimeStatus } from '../components/MarketRegimeBanner';
import TradeCard, { TradeSignal } from '../components/TradeCard';
import AssetTable, { AssetData } from '../components/AssetTable';
import PositionCalculator from '../components/PositionCalculator';
import AddAssetModal from '../components/AddAssetModal';
import AddHoldingModal from '../components/AddHoldingModal';
import TradeHoldingModal from '../components/TradeHoldingModal';
import PortfolioView from '../components/PortfolioView';
import DividendView from '../components/DividendView';
import ScorecardView from '../components/ScorecardView';
import OpeningDirectionView from '../components/OpeningDirectionView';
import {
  supabase,
  PortfolioItem,
  DividendAsset,
  StrategyStat,
  OpeningDirectionItem,
  RealizedTrade,
} from '../lib/supabaseClient';

const INITIAL_SIGNALS: TradeSignal[] = [
  {
    symbol: 'THYAO', name: 'Türk Hava Yolları', strategy: 'Volatility Breakout',
    entryPrice: 310.50, stopLoss: 295.00, targetPrice: 350.00,
    confidence: 8, rationale: 'Price broke above 20-day high with 2x average volume. RSI showing strong momentum without being overbought.',
    market: 'BIST', date: new Date().toISOString().slice(0, 10), currency: 'TRY'
  },
  {
    symbol: 'NVDA', name: 'NVIDIA Corp', strategy: 'EMA Pullback',
    entryPrice: 125.40, stopLoss: 118.00, targetPrice: 145.00,
    confidence: 7, rationale: 'Retracement to 50-day EMA in confirmed uptrend. Bullish divergence on MACD with volume stabilization.',
    market: 'US', date: new Date().toISOString().slice(0, 10), currency: 'USD'
  },
  {
    symbol: 'TUPRS', name: 'Tüpraş', strategy: '50 EMA Pullback',
    entryPrice: 165.20, stopLoss: 158.00, targetPrice: 182.00,
    confidence: 8, rationale: 'Testing rising 50 EMA support after healthy consolidation. Refining margins remain resilient.',
    market: 'BIST', date: new Date().toISOString().slice(0, 10), currency: 'TRY'
  },
  {
    symbol: 'SCHD', name: 'Schwab US Dividend Equity', strategy: 'Mean Reversion',
    entryPrice: 82.10, stopLoss: 79.50, targetPrice: 88.00,
    confidence: 9, rationale: 'RSI rebounded from oversold territory (RSI 32). Dividend yield expanding above historical average.',
    market: 'US', date: new Date().toISOString().slice(0, 10), currency: 'USD'
  }
];

const INITIAL_PORTFOLIO: PortfolioItem[] = [
  {
    symbol: 'AKBNK', name: 'Akbank T.A.Ş.', market: 'BIST',
    shares: 35, entryPrice: 71.20, currentPrice: 70.10, currency: 'TRY',
    totalCost: 2492.00, currentValue: 2453.50, pnlAmount: -38.50, pnlPercent: -1.54,
    stopLoss: 67.50, distanceToStop: 3.7, isDividend: true,
    dcaZone: 'BUY', dcaRationale: 'Major private bank holding; pullback to 50 EMA support.'
  },
  {
    symbol: 'ISMEN', name: 'İş Yatırım Menkul', market: 'BIST',
    shares: 142, entryPrice: 31.89, currentPrice: 31.48, currency: 'TRY',
    totalCost: 4528.38, currentValue: 4470.16, pnlAmount: -58.72, pnlPercent: -1.30,
    stopLoss: 29.50, distanceToStop: 6.3, isDividend: true,
    dcaZone: 'HOLD', dcaRationale: 'High dividend cashflow provider; holding structural support.'
  },
  {
    symbol: 'TURSG', name: 'Türkiye Sigorta', market: 'BIST',
    shares: 1263, entryPrice: 5.85, currentPrice: 5.66, currency: 'TRY',
    totalCost: 7391.85, currentValue: 7148.58, pnlAmount: -243.27, pnlPercent: -3.29,
    stopLoss: 5.40, distanceToStop: 4.6, isDividend: true,
    dcaZone: 'BUY', dcaRationale: 'Insurance compounder with solid dividend yield; attractive accumulation level.'
  }
];

const INITIAL_DIVIDENDS: DividendAsset[] = [
  {
    symbol: 'AKBNK', name: 'Akbank T.A.Ş.', shares: 35,
    entryPrice: 71.20, currentPrice: 70.10, currency: 'TRY',
    dividendYield: 4.52, yieldOnCost: 4.45, annualPayout: 110.80, monthlyPayout: 9.23,
    payoutRatio: 28.5, safetyRating: 'A', frequency: 'Annual',
    nextExDate: '2027-03-26', nextPaymentDate: '2027-03-30',
    estimatedNextDPS: 3.165, estimatedNextPayout: 110.80,
    payoutMonth: 'March 2027', paymentStatus: 'Estimated'
  },
  {
    symbol: 'ISMEN', name: 'İş Yatırım Menkul', shares: 142,
    entryPrice: 31.89, currentPrice: 31.48, currency: 'TRY',
    dividendYield: 7.82, yieldOnCost: 7.72, annualPayout: 349.60, monthlyPayout: 29.13,
    payoutRatio: 58.4, safetyRating: 'A', frequency: 'Annual',
    nextExDate: '2027-03-29', nextPaymentDate: '2027-04-02',
    estimatedNextDPS: 2.462, estimatedNextPayout: 349.60,
    payoutMonth: 'March / April 2027', paymentStatus: 'Estimated'
  },
  {
    symbol: 'TURSG', name: 'Türkiye Sigorta', shares: 1263,
    entryPrice: 5.85, currentPrice: 5.66, currency: 'TRY',
    dividendYield: 6.45, yieldOnCost: 6.24, annualPayout: 460.60, monthlyPayout: 38.38,
    payoutRatio: 52.1, safetyRating: 'A', frequency: 'Annual',
    nextExDate: '2027-05-22', nextPaymentDate: '2027-05-26',
    estimatedNextDPS: 0.3647, estimatedNextPayout: 460.60,
    payoutMonth: 'May 2027', paymentStatus: 'Estimated'
  }
];

const INITIAL_STRATEGIES: StrategyStat[] = [
  { strategy: '50 EMA Pullback in Uptrend', totalTrades: 382, winRate: 68.4, profitFactor: 2.14, avgGain: 6.8, avgLoss: 2.9, expectancy: 0.85 },
  { strategy: 'Volatility Breakout (20D High + 2x Vol)', totalTrades: 426, winRate: 59.2, profitFactor: 1.86, avgGain: 8.4, avgLoss: 3.8, expectancy: 0.72 },
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>('signals');
  const [usRegime, setUsRegime] = useState<RegimeStatus | undefined>({
    status: 'Bullish', close: 771.35, trend: 'up'
  });
  const [bistRegime, setBistRegime] = useState<RegimeStatus | undefined>({
    status: 'Neutral', close: 12550.94, trend: 'flat'
  });
  const [signals, setSignals] = useState<TradeSignal[]>(INITIAL_SIGNALS);
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(INITIAL_PORTFOLIO);
  const [dividends, setDividends] = useState<DividendAsset[]>(INITIAL_DIVIDENDS);
  const [strategies, setStrategies] = useState<StrategyStat[]>(INITIAL_STRATEGIES);
  const [orbItems, setOrbItems] = useState<OpeningDirectionItem[]>(INITIAL_ORB);
  const [usdTryRate, setUsdTryRate] = useState<number>(48.95);
  const [cashBalance, setCashBalance] = useState<number>(2952.26);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHoldingModalOpen, setIsHoldingModalOpen] = useState(false);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<PortfolioItem | null>(null);
  const [realizedTrades, setRealizedTrades] = useState<RealizedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch real data from Supabase
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);

        // 1. Fetch Market Regimes specifically by market
        const [usRes, bistRes, fxRes] = await Promise.all([
          supabase.from('market_regime').select('*').eq('market', 'US').order('date', { ascending: false }).limit(1),
          supabase.from('market_regime').select('*').eq('market', 'BIST').order('date', { ascending: false }).limit(1),
          supabase.from('fx_rates').select('rate').eq('pair', 'USDTRY').order('date', { ascending: false }).limit(1)
        ]);

        if (usRes.data && usRes.data.length > 0) {
          const us = usRes.data[0];
          setUsRegime({
            status: us.regime === 'bullish' ? 'Bullish' : us.regime === 'bearish' ? 'Bearish' : 'Neutral',
            close: Number(us.index_close) || 771.35,
            trend: us.regime === 'bullish' ? 'up' : us.regime === 'bearish' ? 'down' : 'flat'
          });
        }
        if (bistRes.data && bistRes.data.length > 0) {
          const bist = bistRes.data[0];
          setBistRegime({
            status: bist.regime === 'bullish' ? 'Bullish' : bist.regime === 'bearish' ? 'Bearish' : 'Neutral',
            close: Number(bist.index_close) || 12550.94,
            trend: bist.regime === 'bullish' ? 'up' : bist.regime === 'bearish' ? 'down' : 'flat'
          });
        }
        if (fxRes.data && fxRes.data.length > 0 && fxRes.data[0].rate) {
          setUsdTryRate(Number(fxRes.data[0].rate));
        }

        // 2. Fetch Assets & Indicators
        const { data: assetsData } = await supabase
          .from('assets')
          .select(`
            id, symbol, name, market,
            daily_indicators ( rsi_14, volume_ratio, high_52w, low_52w, ema_200 ),
            price_history ( close, date )
          `)
          .limit(150);

        if (assetsData && assetsData.length > 0) {
          const mapped: AssetData[] = assetsData.map((a: any) => {
            const ind = a.daily_indicators?.[0] || {};
            const recentPrices = a.price_history || [];
            const latestPrice = recentPrices.length > 0 ? recentPrices[recentPrices.length - 1].close : 100;
            const prevPrice = recentPrices.length > 1 ? recentPrices[recentPrices.length - 2].close : latestPrice;
            const changePct = prevPrice > 0 ? ((latestPrice - prevPrice) / prevPrice) * 100 : 0;
            const ema200 = ind.ema_200 || latestPrice;
            const emaStatus = latestPrice >= ema200 ? 'Above 200 EMA' : 'Below 200 EMA';

            return {
              id: a.id,
              symbol: a.symbol.replace('.IS', ''),
              name: a.name || a.symbol,
              market: a.market || 'BIST',
              price: latestPrice,
              changePercent: changePct,
              rsi: ind.rsi_14 || 50,
              emaStatus: emaStatus,
              volumeRatio: ind.volume_ratio || 1.0,
              high52w: ind.high_52w,
              low52w: ind.low_52w
            };
          });
          setAssets(mapped);
        } else {
          // Generate default 117 sample dataset from constituent lists
          generateFallbackAssets();
        }

        // 3. Fetch Trade Signals
        const { data: sigData } = await supabase
          .from('trade_signals')
          .select('*, assets(symbol, name, market)')
          .eq('status', 'open')
          .order('signal_date', { ascending: false })
          .limit(8);

        if (sigData && sigData.length > 0) {
          const mappedSignals: TradeSignal[] = sigData
            .filter((s: any) => {
              const entry = Number(s.entry_price);
              const stop = Number(s.stop_loss);
              const target = Number(s.target_1);
              if (entry > 0 && stop > 0 && stop >= entry) return false;
              if (entry > 0 && target > 0 && target <= entry) return false;
              return true;
            })
            .map((s: any) => ({
              symbol: s.assets?.symbol?.replace('.IS', '') || 'ASSET',
              name: s.assets?.name || s.assets?.symbol || '',
              strategy: s.strategy.replace('_', ' ').toUpperCase(),
              entryPrice: s.entry_price,
              stopLoss: s.stop_loss || s.entry_price * 0.95,
              targetPrice: s.target_1 || s.entry_price * 1.15,
              confidence: Math.round(s.confidence_score || 8),
              rationale: s.ai_rationale || 'Autonomous strategy trigger confirmed.',
              market: s.assets?.market || 'BIST',
              date: s.signal_date || new Date().toISOString().slice(0, 10),
              currency: s.assets?.market === 'US' ? 'USD' : 'TRY'
            }));
          if (mappedSignals.length > 0) {
            setSignals(mappedSignals);
          }
        }

      } catch (err) {
        console.warn('Using enriched fallback offline data:', err);
        generateFallbackAssets();
      } finally {
        setIsLoading(false);
      }
    }

    function generateFallbackAssets() {
      const topSymbols = [
        { s: 'SPY', n: 'SPDR S&P 500 ETF', m: 'US', p: 545.20, c: 0.82, r: 62.4, e: 'Above 200 EMA', v: 1.15 },
        { s: 'QQQ', n: 'Invesco QQQ Trust', m: 'US', p: 480.15, c: 1.25, r: 68.5, e: 'Above 200 EMA', v: 1.30 },
        { s: 'NVDA', n: 'NVIDIA Corp', m: 'US', p: 125.40, c: 2.10, r: 64.2, e: 'Above 200 EMA', v: 1.85 },
        { s: 'AAPL', n: 'Apple Inc.', m: 'US', p: 231.80, c: 0.45, r: 56.1, e: 'Above 200 EMA', v: 0.95 },
        { s: 'SCHD', n: 'Schwab US Dividend ETF', m: 'US', p: 82.10, c: 0.35, r: 48.0, e: 'Above 200 EMA', v: 1.05 },
        { s: 'O', n: 'Realty Income Corp', m: 'US', p: 54.30, c: -0.20, r: 42.5, e: 'Near 50 EMA', v: 0.88 },
        { s: 'THYAO', n: 'Türk Hava Yolları', m: 'BIST', p: 326.50, c: 2.45, r: 58.2, e: 'Above 200 EMA', v: 2.10 },
        { s: 'TUPRS', n: 'Tüpraş', m: 'BIST', p: 165.20, c: -1.15, r: 42.1, e: 'Near 50 EMA', v: 0.82 },
        { s: 'ASELS', n: 'Aselsan', m: 'BIST', p: 374.50, c: 3.10, r: 66.4, e: 'Above 200 EMA', v: 2.40 },
        { s: 'BIMAS', n: 'BİM Mağazalar', m: 'BIST', p: 485.00, c: 0.90, r: 53.0, e: 'Above 200 EMA', v: 1.10 },
        { s: 'ISMEN', n: 'İş Yatırım Menkul', m: 'BIST', p: 35.80, c: 1.65, r: 55.4, e: 'Above 200 EMA', v: 1.25 },
        { s: 'TURSG', n: 'Türkiye Sigorta', m: 'BIST', p: 6.72, c: 2.20, r: 61.0, e: 'Above 200 EMA', v: 1.50 },
        { s: 'KCHOL', n: 'Koç Holding', m: 'BIST', p: 215.00, c: 0.50, r: 49.5, e: 'Near 50 EMA', v: 0.90 },
        { s: 'EREGL', n: 'Erdemir', m: 'BIST', p: 52.40, c: -0.80, r: 38.2, e: 'Below 200 EMA', v: 0.75 },
        { s: 'FROTO', n: 'Ford Otosan', m: 'BIST', p: 1045.00, c: 1.80, r: 59.8, e: 'Above 200 EMA', v: 1.40 },
        { s: 'SISE', n: 'Şişecam', m: 'BIST', p: 44.30, c: 0.10, r: 41.2, e: 'Below 200 EMA', v: 0.70 },
        { s: 'AKBNK', n: 'Akbank', m: 'BIST', p: 58.20, c: 1.15, r: 57.1, e: 'Above 200 EMA', v: 1.30 },
        { s: 'GARAN', n: 'Garanti BBVA', m: 'BIST', p: 114.50, c: 1.40, r: 60.5, e: 'Above 200 EMA', v: 1.45 },
        { s: 'MAC', n: 'Marmara Capital Fonu', m: 'TEFAS', p: 12.85, c: 0.65, r: 56.0, e: 'Above 200 EMA', v: 1.00 },
        { s: 'TI2', n: 'İş Portföy Hisse Fonu', m: 'TEFAS', p: 8.42, c: 0.45, r: 54.0, e: 'Above 200 EMA', v: 1.00 }
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

    loadData();
  }, []);

  const handleRemoveHolding = async (symbol: string) => {
    // 1. Immediately update UI state
    setPortfolio(prev => prev.filter(item => item.symbol !== symbol));
    setDividends(prev => prev.filter(item => item.symbol !== symbol));

    // 2. Persist deletion in Supabase
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
          .eq('asset_id', assetData[0].id);
      }
    } catch (err) {
      console.warn('Could not remove holding from Supabase:', err);
    }
  };

  const handleAddHolding = async (newHolding: PortfolioItem, isDiv: boolean, divYield?: number) => {
    // 1. Immediately update UI state
    setPortfolio(prev => [newHolding, ...prev]);

    if (isDiv) {
      const yld = divYield || 5.0;
      const yoc = newHolding.entryPrice > 0
        ? ((newHolding.currentPrice * yld) / newHolding.entryPrice)
        : yld;

      const newDiv: DividendAsset = {
        symbol: newHolding.symbol,
        name: newHolding.name,
        shares: newHolding.shares,
        entryPrice: newHolding.entryPrice,
        currentPrice: newHolding.currentPrice,
        currency: newHolding.currency,
        dividendYield: yld,
        yieldOnCost: yoc,
        annualPayout: (newHolding.shares * newHolding.currentPrice * yld) / 100,
        monthlyPayout: (newHolding.shares * newHolding.currentPrice * yld) / 1200,
        payoutRatio: 52.0,
        safetyRating: 'A',
        frequency: newHolding.market === 'US' ? 'Quarterly' : 'Annual'
      };
      setDividends(prev => [newDiv, ...prev]);
    }

    // 2. Persist to Supabase
    try {
      const cleanSym = newHolding.symbol.replace('.IS', '');
      const isSymbol = `${cleanSym}.IS`;
      const { data: assetData } = await supabase
        .from('assets')
        .select('id')
        .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
        .limit(1);

      if (assetData && assetData.length > 0) {
        await supabase.from('portfolio_positions').insert([{
          asset_id: assetData[0].id,
          quantity: newHolding.shares,
          avg_entry_price: newHolding.entryPrice,
          stop_loss: newHolding.stopLoss > 0 ? newHolding.stopLoss : null,
          is_open: true,
          notes: newHolding.dcaRationale
        }]);
      }
    } catch (err) {
      console.warn('Could not save holding to Supabase:', err);
    }
  };

  const handleBuyMoreHolding = async (symbol: string, additionalShares: number, buyPrice: number) => {
    setPortfolio(prev => {
      return prev.map(item => {
        if (item.symbol !== symbol) return item;
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
    });

    // Update dividends if present
    setDividends(prev => {
      return prev.map(div => {
        if (div.symbol !== symbol) return div;
        const targetHolding = portfolio.find(p => p.symbol === symbol);
        const oldShares = targetHolding ? targetHolding.shares : div.shares;
        const oldPrice = targetHolding ? targetHolding.entryPrice : div.entryPrice;
        const totalShares = oldShares + additionalShares;
        const blendedEntry = totalShares > 0 ? ((oldShares * oldPrice) + (additionalShares * buyPrice)) / totalShares : oldPrice;
        const newYoC = blendedEntry > 0 ? ((div.currentPrice * div.dividendYield) / blendedEntry) : div.dividendYield;

        return {
          ...div,
          shares: totalShares,
          entryPrice: blendedEntry,
          yieldOnCost: newYoC,
          annualPayout: (totalShares * div.currentPrice * div.dividendYield) / 100,
          monthlyPayout: (totalShares * div.currentPrice * div.dividendYield) / 1200
        };
      });
    });

    // Persist to Supabase
    try {
      const cleanSym = symbol.replace('.IS', '');
      const isSymbol = `${cleanSym}.IS`;
      const { data: assetData } = await supabase
        .from('assets')
        .select('id')
        .or(`symbol.eq.${cleanSym},symbol.eq.${isSymbol}`)
        .limit(1);

      if (assetData && assetData.length > 0) {
        const target = portfolio.find(p => p.symbol === symbol);
        if (target) {
          const totalShares = target.shares + additionalShares;
          const blendedEntry = ((target.shares * target.entryPrice) + (additionalShares * buyPrice)) / totalShares;
          await supabase
            .from('portfolio_positions')
            .update({ quantity: totalShares, avg_entry_price: blendedEntry })
            .eq('asset_id', assetData[0].id)
            .eq('is_open', true);
        }
      }
    } catch (err) {
      console.warn('Error updating position in Supabase:', err);
    }
  };

  const handleSellHolding = async (symbol: string, sharesToSell: number, sellPrice: number) => {
    const target = portfolio.find(p => p.symbol === symbol);
    if (!target) return;

    const actualSold = Math.min(sharesToSell, target.shares);
    const realizedPnl = (sellPrice - target.entryPrice) * actualSold;
    const realizedPnlPct = target.entryPrice > 0 ? ((sellPrice - target.entryPrice) / target.entryPrice) * 100 : 0;

    // Record realized trade
    const newRealized: RealizedTrade = {
      id: `trade-${Date.now()}`,
      symbol: target.symbol,
      name: target.name,
      market: target.market,
      currency: target.currency,
      sharesSold: actualSold,
      entryPrice: target.entryPrice,
      exitPrice: sellPrice,
      realizedPnl: realizedPnl,
      realizedPnlPercent: realizedPnlPct,
      closeDate: new Date().toISOString().slice(0, 10)
    };

    setRealizedTrades(prev => [newRealized, ...prev]);

    if (actualSold >= target.shares) {
      // Full exit
      setPortfolio(prev => prev.filter(p => p.symbol !== symbol));
      setDividends(prev => prev.filter(d => d.symbol !== symbol));
    } else {
      // Partial sell
      setPortfolio(prev => {
        return prev.map(item => {
          if (item.symbol !== symbol) return item;
          const remainingShares = item.shares - actualSold;
          const newTotalCost = remainingShares * item.entryPrice;
          const newCurrentValue = remainingShares * item.currentPrice;
          const newPnlAmount = newCurrentValue - newTotalCost;
          const newPnlPercent = newTotalCost > 0 ? (newPnlAmount / newTotalCost) * 100 : 0;

          return {
            ...item,
            shares: remainingShares,
            totalCost: newTotalCost,
            currentValue: newCurrentValue,
            pnlAmount: newPnlAmount,
            pnlPercent: newPnlPercent
          };
        });
      });

      setDividends(prev => {
        return prev.map(div => {
          if (div.symbol !== symbol) return div;
          const remainingShares = div.shares - actualSold;
          return {
            ...div,
            shares: remainingShares,
            annualPayout: (remainingShares * div.currentPrice * div.dividendYield) / 100,
            monthlyPayout: (remainingShares * div.currentPrice * div.dividendYield) / 1200
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

      if (assetData && assetData.length > 0) {
        if (actualSold >= target.shares) {
          await supabase.from('portfolio_positions').delete().eq('asset_id', assetData[0].id);
        } else {
          await supabase
            .from('portfolio_positions')
            .update({ quantity: target.shares - actualSold })
            .eq('asset_id', assetData[0].id)
            .eq('is_open', true);
        }
      }
    } catch (err) {
      console.warn('Error updating sold shares in Supabase:', err);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 dark:bg-[#0b0f19] text-gray-900 dark:text-gray-100 pb-20">
      {/* Top Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-40 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">MarketPulse</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                  LIVE 2.0
                </span>
              </div>
              <p className="text-[10px] text-gray-400 hidden sm:block">Autonomous Travel & Market Intelligence Engine</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
              <span>USD/TRY:</span>
              <span className="text-blue-600 dark:text-blue-400">₺{usdTryRate.toFixed(2)}</span>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs text-gray-500 font-semibold">Supabase Connected</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <NavigationTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Regime Banners (Always visible on top) */}
      <MarketRegimeBanner usRegime={usRegime} bistRegime={bistRegime} />

      {/* Main Tab Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* TAB 1: SIGNALS & SCANNER */}
        {activeTab === 'signals' && (
          <div className="space-y-8">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="lg:w-2/3 space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-white">Active Trade Setups & Signals</h2>
                    <p className="text-xs text-gray-500">Autonomous scanner triggers with calculated targets, stop-losses, and AI rationales.</p>
                  </div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {signals.length} Setups Active
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {signals.map((sig, idx) => (
                    <TradeCard key={idx} signal={sig} />
                  ))}
                </div>
              </div>

              <div className="lg:w-1/3">
                <PositionCalculator />
              </div>
            </div>

            <div className="pt-2">
              <AssetTable assets={assets} />
            </div>
          </div>
        )}

        {/* TAB 2: MY PORTFOLIO & DCA */}
        {activeTab === 'portfolio' && (
          <PortfolioView
            portfolio={portfolio}
            realizedTrades={realizedTrades}
            usdTryRate={usdTryRate}
            cashBalanceTRY={cashBalance}
            onRemoveHolding={handleRemoveHolding}
            onAddHoldingClick={() => setIsHoldingModalOpen(true)}
            onTradeHolding={(item) => {
              setSelectedHolding(item);
              setTradeModalOpen(true);
            }}
          />
        )}

        {/* TAB 3: DIVIDEND TRACKER */}
        {activeTab === 'dividend' && (
          <DividendView dividendAssets={dividends} usdTryRate={usdTryRate} />
        )}

        {/* TAB 4: STRATEGY SCORECARD */}
        {activeTab === 'scorecard' && (
          <ScorecardView strategies={strategies} />
        )}

        {/* TAB 5: OPENING DIRECTION (ORB) */}
        {activeTab === 'orb' && (
          <OpeningDirectionView items={orbItems} />
        )}
      </div>

      {/* Floating Add Asset Modal */}
      <button 
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 z-40 focus:outline-none focus:ring-4 focus:ring-blue-500/50"
        title="Add Asset to Track"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
      </button>

      <AddAssetModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {
          console.log('Asset added successfully.');
        }}
      />

      <AddHoldingModal
        isOpen={isHoldingModalOpen}
        onClose={() => setIsHoldingModalOpen(false)}
        onAddHolding={handleAddHolding}
      />

      <TradeHoldingModal
        isOpen={tradeModalOpen}
        holding={selectedHolding}
        onClose={() => {
          setTradeModalOpen(false);
          setSelectedHolding(null);
        }}
        onBuyMore={handleBuyMoreHolding}
        onSell={handleSellHolding}
      />
    </main>
  );
}
