'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import {
  ForecastParams,
  ForecastResult,
  calculateDividendForecast,
  MASTER_COMPARATOR_ASSETS,
  MASTER_GROWTH_PROFILES,
  GrowthScenario,
  AssetGrowthProfile
} from '../lib/dividendForecastMath';
import { DividendAsset } from '../lib/supabaseClient';

interface DividendForecastViewProps {
  usdTryRate: number;
  userDividendAssets?: DividendAsset[];
  onSelectTicker?: (symbol: string) => void;
}

export default function DividendForecastView({
  usdTryRate,
  userDividendAssets = [],
  onSelectTicker
}: DividendForecastViewProps) {
  const { language } = useLanguage();

  // Primary navigation sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'simulator' | 'comparator' | 'portfolios'>('simulator');

  // Currency toggle: TRY ↔ USD
  const [currency, setCurrency] = useState<'TRY' | 'USD'>('TRY');

  // Selected asset / source in Simulator
  // Options: 'MY_PORTFOLIO' | symbol (e.g. 'ISMEN', 'TURSG', 'O', 'SCHD') | model portfolio id
  const [selectedAssetSource, setSelectedAssetSource] = useState<string>('MY_PORTFOLIO');
  const [activeScenario, setActiveScenario] = useState<GrowthScenario>('realistic');

  // Simulator Inputs
  const [initialCapitalInput, setInitialCapitalInput] = useState<string>('100000');
  const [monthlyContributionInput, setMonthlyContributionInput] = useState<string>('5000');
  const [horizonYears, setHorizonYears] = useState<number>(5);
  const [dripEnabled, setDripEnabled] = useState<boolean>(true);
  const [initialYield, setInitialYield] = useState<number>(7.8);
  const [dividendGrowthRate, setDividendGrowthRate] = useState<number>(22.0);
  const [priceAppreciationRate, setPriceAppreciationRate] = useState<number>(15.0);

  // Comparator State: selected symbols (up to 4)
  const [selectedComparatorSymbols, setSelectedComparatorSymbols] = useState<string[]>(['ISMEN', 'TURSG', 'O', 'SCHD']);
  const [comparatorBaseAmount, setComparatorBaseAmount] = useState<number>(100000);

  // Currency conversion helper
  const formatMoney = (val: number, forceCurr?: 'TRY' | 'USD') => {
    const c = forceCurr || currency;
    const sign = c === 'USD' ? '$' : '₺';
    return `${sign}${Math.round(val).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}`;
  };

  // Calculate user portfolio stats
  const userPortfolioStats = useMemo(() => {
    if (userDividendAssets.length === 0) {
      return { totalCostTRY: 0, totalAnnualTRY: 0, weightedYield: 7.82, weightedGrowth: 22.0 };
    }
    const totalCostTRY = userDividendAssets.reduce((acc, item) => {
      const c = item.shares * item.entryPrice;
      return acc + (item.currency === 'USD' ? c * usdTryRate : c);
    }, 0);
    const totalAnnualTRY = userDividendAssets.reduce((acc, item) => {
      return acc + (item.currency === 'USD' ? item.annualPayout * usdTryRate : item.annualPayout);
    }, 0);
    const weightedYield = totalCostTRY > 0 ? (totalAnnualTRY / totalCostTRY) * 100 : 7.82;
    return {
      totalCostTRY,
      totalAnnualTRY,
      weightedYield: Number(weightedYield.toFixed(2)),
      weightedGrowth: 22.5,
    };
  }, [userDividendAssets, usdTryRate]);

  // Model Portfolios definition
  const modelPortfolios = useMemo(() => [
    {
      id: 'high_cashflow',
      titleTr: 'Nakit Akışı Şampiyonları',
      titleEn: 'High Cashflow Champions',
      badgeTr: 'Yüksek Temettü',
      badgeEn: 'High Yield',
      badgeColor: 'bg-emerald-500',
      targetYield: 8.45,
      growthCagr: 16.5,
      priceApprec: 14.0,
      frequencyTr: 'Yılda 10+ Kez Ödeme',
      frequencyEn: '10+ Payouts / Year',
      holdings: [
        { sym: 'ISMEN', weight: 30, yield: 8.55, curr: 'TRY' },
        { sym: 'TURSG', weight: 25, yield: 7.09, curr: 'TRY' },
        { sym: 'JEPI', weight: 25, yield: 7.50, curr: 'USD' },
        { sym: 'O', weight: 20, yield: 5.40, curr: 'USD' },
      ],
      descriptionTr: 'Maksimum cari nakit akışı ve aylık dolar temettüleri ile hibrit gelir modeli.',
      descriptionEn: 'Maximizes immediate recurring cashflow combining high-yield BIST brokers with US covered calls and REITs.',
    },
    {
      id: 'growth_compounders',
      titleTr: 'Bileşik Büyüme & Aristokratlar',
      titleEn: 'Compound Growth Aristocrats',
      badgeTr: 'Çift Haneli Temettü Artışı',
      badgeEn: 'Double-Digit CAGR',
      badgeColor: 'bg-blue-600',
      targetYield: 4.85,
      growthCagr: 12.5,
      priceApprec: 10.0,
      frequencyTr: 'Düzenli Çeyreklik & Yıllık',
      frequencyEn: 'Quarterly & Annual',
      holdings: [
        { sym: 'SCHD', weight: 35, yield: 3.65, curr: 'USD' },
        { sym: 'FROTO', weight: 25, yield: 5.60, curr: 'TRY' },
        { sym: 'VICI', weight: 20, yield: 5.35, curr: 'USD' },
        { sym: 'KO', weight: 20, yield: 3.10, curr: 'USD' },
      ],
      descriptionTr: 'Her yıl temettüsünü enflasyonun çok üzerinde artıran sağlam bilançolu devler.',
      descriptionEn: 'Focused on companies that aggressively increase cash dividends year-over-year for long-term YoC compounding.',
    },
    {
      id: 'midas_usd_monthly',
      titleTr: 'Midas US Dolar Bazlı Pasif Gelir',
      titleEn: 'Midas USD Monthly Income',
      badgeTr: 'Aylık Dolar Geliri',
      badgeEn: 'Monthly USD Cash',
      badgeColor: 'bg-purple-600',
      targetYield: 6.85,
      growthCagr: 5.8,
      priceApprec: 6.0,
      frequencyTr: 'Her Ay Kesintisiz Ödeme',
      frequencyEn: 'Monthly Continuous Cash',
      holdings: [
        { sym: 'O', weight: 30, yield: 5.40, curr: 'USD' },
        { sym: 'JEPI', weight: 30, yield: 7.50, curr: 'USD' },
        { sym: 'VICI', weight: 20, yield: 5.35, curr: 'USD' },
        { sym: 'SCHD', weight: 20, yield: 3.65, curr: 'USD' },
      ],
      descriptionTr: 'Midas ile kolayca işlem gören, kur riskinden koruyan ve her ay düzenli dolar akıtan sepet.',
      descriptionEn: 'Pure USD passive cashflow designed for Turkish retail investors trading on Midas.',
    },
    {
      id: 'balanced_hybrid',
      titleTr: 'BIST + ABD 50/50 Dengeli Hibrit',
      titleEn: 'BIST + US 50/50 Balanced Hybrid',
      badgeTr: 'Maksimum Koruma',
      badgeEn: 'Optimal Balance',
      badgeColor: 'bg-amber-600',
      targetYield: 6.40,
      growthCagr: 15.0,
      priceApprec: 12.0,
      frequencyTr: 'Aylık + Çeyreklik Karışık',
      frequencyEn: 'Blended Schedule',
      holdings: [
        { sym: 'ISMEN', weight: 25, yield: 8.55, curr: 'TRY' },
        { sym: 'TURSG', weight: 25, yield: 7.09, curr: 'TRY' },
        { sym: 'SCHD', weight: 25, yield: 3.65, curr: 'USD' },
        { sym: 'O', weight: 25, yield: 5.40, curr: 'USD' },
      ],
      descriptionTr: 'Yüksek TL getirisi ile güvenli dolar varlıklarını mükemmel 50/50 oranda harmanlar.',
      descriptionEn: '50% high-yield domestic champions combined with 50% top-tier US dollar dividend assets.',
    },
  ], []);

  // When user changes asset source or scenario, auto-populate past performance metrics
  useEffect(() => {
    if (selectedAssetSource === 'MY_PORTFOLIO') {
      setInitialYield(userPortfolioStats.weightedYield);
      const rate = activeScenario === 'conservative' ? 14.0 : activeScenario === 'optimistic' ? 28.0 : 22.5;
      setDividendGrowthRate(rate);
      setPriceAppreciationRate(15.0);
      if (currency !== 'TRY') {
        setCurrency('TRY');
      }
      return;
    }

    // Check if it's a specific single asset in MASTER_GROWTH_PROFILES
    const profile = MASTER_GROWTH_PROFILES[selectedAssetSource];
    if (profile) {
      setInitialYield(profile.currentYield);
      setDividendGrowthRate(profile.predictedGrowth[activeScenario]);
      setPriceAppreciationRate(profile.predictedPriceAppreciation);

      // Auto switch currency to match asset market for maximum realism
      if (profile.market === 'US' && currency !== 'USD') {
        setCurrency('USD');
        const currNum = parseFloat(initialCapitalInput) || 100000;
        setInitialCapitalInput(String(Math.round(currNum / usdTryRate)));
        const currMon = parseFloat(monthlyContributionInput) || 5000;
        setMonthlyContributionInput(String(Math.round(currMon / usdTryRate)));
      } else if (profile.market === 'BIST' && currency !== 'TRY') {
        setCurrency('TRY');
        const currNum = parseFloat(initialCapitalInput) || 2000;
        setInitialCapitalInput(String(Math.round(currNum * usdTryRate)));
        const currMon = parseFloat(monthlyContributionInput) || 100;
        setMonthlyContributionInput(String(Math.round(currMon * usdTryRate)));
      }
      return;
    }

    // Check if it's a model portfolio
    const model = modelPortfolios.find(m => m.id === selectedAssetSource);
    if (model) {
      setInitialYield(model.targetYield);
      const mult = activeScenario === 'conservative' ? 0.75 : activeScenario === 'optimistic' ? 1.25 : 1.0;
      setDividendGrowthRate(Number((model.growthCagr * mult).toFixed(1)));
      setPriceAppreciationRate(model.priceApprec);
    }
  }, [selectedAssetSource, activeScenario, userPortfolioStats, usdTryRate]);

  // Active Profile details (for the AI insight card)
  const currentActiveProfile = MASTER_GROWTH_PROFILES[selectedAssetSource] || null;

  // Run Forecast Calculation dynamically
  const forecastResult: ForecastResult = useMemo(() => {
    const initCap = parseFloat(initialCapitalInput) || 0;
    const monthlyCont = parseFloat(monthlyContributionInput) || 0;

    const params: ForecastParams = {
      initialCapital: initCap,
      monthlyContribution: monthlyCont,
      horizonYears,
      dripEnabled,
      initialDividendYield: initialYield,
      annualDividendGrowthRate: dividendGrowthRate,
      annualPriceAppreciationRate: priceAppreciationRate,
      currency,
    };

    return calculateDividendForecast(params);
  }, [
    initialCapitalInput,
    monthlyContributionInput,
    horizonYears,
    dripEnabled,
    initialYield,
    dividendGrowthRate,
    priceAppreciationRate,
    currency,
  ]);

  // Toggle comparator asset
  const handleToggleComparatorSymbol = (sym: string) => {
    if (selectedComparatorSymbols.includes(sym)) {
      if (selectedComparatorSymbols.length > 1) {
        setSelectedComparatorSymbols(prev => prev.filter(s => s !== sym));
      }
    } else {
      if (selectedComparatorSymbols.length < 4) {
        setSelectedComparatorSymbols(prev => [...prev, sym]);
      }
    }
  };

  // Selected Comparator Assets
  const activeComparatorAssets = useMemo(() => {
    return MASTER_COMPARATOR_ASSETS.filter(a => selectedComparatorSymbols.includes(a.symbol));
  }, [selectedComparatorSymbols]);

  const handleApplyModelPortfolio = (modelId: string) => {
    setSelectedAssetSource(modelId);
    setActiveSubTab('simulator');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header Card & View Mode Switcher */}
      <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/70 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-xl shadow-xs">
              🔮
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>{language === 'tr' ? 'Temettü Projeksiyonu & Kıyaslama Laboratuvarı' : 'Dividend Forecasting & Comparator Hub'}</span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                  {language === 'tr' ? 'Otonom Geçmiş Veri & Konsensüs' : 'Autonomous Predictive Engine'}
                </span>
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                {language === 'tr'
                  ? 'Şirketlerin geçmiş 3-5 yıllık fiili temettü büyüme hızını (CAGR) otomatik çeken kurumsal simülatör ve Midas ABD / BIST kıyaslaması.'
                  : 'Institutional simulator that automatically pulls historical 3-5 yr dividend CAGR and consensus growth scenarios.'}
              </p>
            </div>
          </div>
        </div>

        {/* Currency Toggle & Primary Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* Dynamic Currency Toggle */}
          <div className="flex items-center p-1 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                if (currency !== 'TRY') {
                  setCurrency('TRY');
                  const currNum = parseFloat(initialCapitalInput) || 2000;
                  setInitialCapitalInput(String(Math.round(currNum * usdTryRate)));
                  const currMon = parseFloat(monthlyContributionInput) || 100;
                  setMonthlyContributionInput(String(Math.round(currMon * usdTryRate)));
                }
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                currency === 'TRY'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              ₺ TRY
            </button>
            <button
              type="button"
              onClick={() => {
                if (currency !== 'USD') {
                  setCurrency('USD');
                  const currNum = parseFloat(initialCapitalInput) || 100000;
                  setInitialCapitalInput(String(Math.round(currNum / usdTryRate)));
                  const currMon = parseFloat(monthlyContributionInput) || 5000;
                  setMonthlyContributionInput(String(Math.round(currMon / usdTryRate)));
                }
              }}
              className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                currency === 'USD'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              $ USD
            </button>
          </div>

          {/* Sub Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setActiveSubTab('simulator')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'simulator'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span>📈</span>
              <span>{language === 'tr' ? 'Simülatör (DRIP)' : 'Simulator (DRIP)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('comparator')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'comparator'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span>⚖️</span>
              <span>{language === 'tr' ? 'Birebir Kıyaslama' : 'Comparator'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('portfolios')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'portfolios'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span>🏛️</span>
              <span>{language === 'tr' ? 'Model Portföyler' : 'Model Portfolios'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: FORECAST SIMULATOR & DRIP COMPOUNDING ENGINE                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'simulator' && (
        <div className="space-y-6">
          {/* Controls & Configuration Box */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-5">
            {/* Header: Asset & Preset Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="space-y-0.5">
                <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>🎯</span>
                  <span>{language === 'tr' ? 'Simülasyon Hedef Varlığı' : 'Simulation Target Asset'}</span>
                </h3>
                <p className="text-xs text-gray-500">
                  {language === 'tr'
                    ? 'Bir hisse veya sepet seçtiğinizde geçmiş 3-5 yıllık temettü büyüme verisi (CAGR) otomatik yüklenir.'
                    : 'Selecting an asset automatically loads its verified 3-5 year historical dividend CAGR and predictive consensus.'}
                </p>
              </div>

              {/* Asset Dropdown Selector */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedAssetSource}
                  onChange={(e) => setSelectedAssetSource(e.target.value)}
                  className="text-xs font-black py-1.5 px-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                >
                  <optgroup label={language === 'tr' ? 'Portföyüm' : 'My Holdings'}>
                    <option value="MY_PORTFOLIO">
                      🎯 {language === 'tr' ? 'Mevcut Portföyüm (Ağırlıklı Ortalama)' : 'My Portfolio (Weighted Average)'}
                    </option>
                  </optgroup>
                  <optgroup label="BIST Temettü Şampiyonları">
                    <option value="ISMEN">ISMEN (İş Yatırım Menkul) - %8.55 Verim</option>
                    <option value="TURSG">TURSG (Türkiye Sigorta) - %7.09 Verim</option>
                    <option value="TUPRS">TUPRS (Tüpraş) - %7.40 Verim</option>
                    <option value="FROTO">FROTO (Ford Otosan) - %5.60 Verim</option>
                    <option value="AKBNK">AKBNK (Akbank) - %4.73 Verim</option>
                  </optgroup>
                  <optgroup label="Midas ABD REIT & Gayrimenkul">
                    <option value="O">O (Realty Income - Aylık Temettü) - %5.40 USD</option>
                    <option value="VICI">VICI Properties (Casino/Otel REIT) - %5.35 USD</option>
                    <option value="PLD">PLD (Prologis Lojistik REIT) - %3.25 USD</option>
                  </optgroup>
                  <optgroup label="Midas ABD ETF & Temettü Kralları">
                    <option value="SCHD">SCHD (Schwab US Dividend ETF) - %3.65 USD</option>
                    <option value="JEPI">JEPI (JPMorgan Equity Premium) - %7.50 USD</option>
                    <option value="KO">KO (The Coca-Cola Co - Dividend King) - %3.10 USD</option>
                    <option value="VOO">VOO (Vanguard S&P 500 ETF) - %1.35 USD</option>
                  </optgroup>
                  <optgroup label={language === 'tr' ? 'Yapay Zeka Model Portföyleri' : 'AI Model Portfolios'}>
                    <option value="high_cashflow">🏛️ Nakit Akışı Şampiyonları (%8.45)</option>
                    <option value="growth_compounders">🏛️ Bileşik Büyüme & Aristokratlar (%4.85)</option>
                    <option value="midas_usd_monthly">🏛️ Midas USD Aylık Nakit Akışı (%6.85)</option>
                    <option value="balanced_hybrid">🏛️ BIST + ABD 50/50 Dengeli Hibrit (%6.40)</option>
                  </optgroup>
                </select>
              </div>
            </div>

            {/* AI Past-Performance Intelligence Banner */}
            <div className="bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-transparent p-4 rounded-2xl border border-purple-200 dark:border-purple-800/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">📊</span>
                  <span className="text-xs font-black uppercase text-purple-700 dark:text-purple-300 tracking-wider">
                    {language === 'tr' ? 'Geçmiş Performans & Konsensüs Tahmin Analizi' : 'Historical CAGR & Consensus Projection'}
                  </span>
                </div>

                {/* Scenario Switcher */}
                <div className="flex items-center gap-1 bg-white/80 dark:bg-gray-800/80 p-0.5 rounded-xl border border-gray-200 dark:border-gray-700 self-start sm:self-auto">
                  <span className="text-[10px] font-bold text-gray-500 px-2">
                    {language === 'tr' ? 'Senaryo:' : 'Scenario:'}
                  </span>
                  {(['conservative', 'realistic', 'optimistic'] as GrowthScenario[]).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setActiveScenario(sc)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeScenario === sc
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                      }`}
                    >
                      {sc === 'conservative'
                        ? (language === 'tr' ? '🛡️ Muhafazakâr' : 'Conservative')
                        : sc === 'realistic'
                        ? (language === 'tr' ? '⚖️ Gerçekçi (Baz)' : 'Realistic')
                        : (language === 'tr' ? '🚀 İyimser' : 'Optimistic')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/70 dark:bg-gray-850/80 p-3 rounded-xl border border-purple-100 dark:border-purple-900/50">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">
                    {language === 'tr' ? 'Cari Temettü Verimi' : 'Current Yield'}
                  </span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    %{initialYield.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">
                    {language === 'tr' ? 'Geçmiş 3 Yıllık CAGR' : 'Historical 3Y CAGR'}
                  </span>
                  <span className="text-base font-black text-blue-600 dark:text-blue-400 font-mono">
                    {currentActiveProfile ? `+${currentActiveProfile.historical3YrDivCagr.toFixed(1)}%` : '+24.5%'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">
                    {language === 'tr' ? 'Öngörülen Büyüme (Yıllık)' : 'Consensus Predicted Growth'}
                  </span>
                  <span className="text-base font-black text-purple-600 dark:text-purple-400 font-mono">
                    +%{dividendGrowthRate.toFixed(1)} / yıl
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">
                    {language === 'tr' ? 'Ödeme Güvenilirliği' : 'Safety Score'}
                  </span>
                  <span className="text-base font-black text-amber-500 font-mono">
                    {currentActiveProfile ? `${currentActiveProfile.safetyGrade} (%${currentActiveProfile.payoutRatio})` : 'Grade A (%55.0)'}
                  </span>
                </div>
              </div>

              {/* AI Explanation Text */}
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed italic">
                💡 {currentActiveProfile
                  ? (language === 'tr' ? currentActiveProfile.aiRationaleTr : currentActiveProfile.aiRationaleEn)
                  : (language === 'tr'
                      ? 'Portföyünüzdeki ISMEN, TURSG ve diğer varlıkların fiili kâr dağıtım geçmişi harmanlanarak yıllık ortalama %22.5 sürdürülebilir büyüme öngörülmüştür.'
                      : 'Blended from your active ISMEN and TURSG dividend distributions. Predictive model applies an institutional 22.5% annual growth rate.')}
              </p>
            </div>

            {/* Input Row: Capital & Monthly DCA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Initial Capital */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
                  {language === 'tr' ? 'Başlangıç Sermayesi:' : 'Initial Capital:'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-400">
                    {currency === 'USD' ? '$' : '₺'}
                  </span>
                  <input
                    type="number"
                    value={initialCapitalInput}
                    onChange={(e) => setInitialCapitalInput(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm font-black text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                </div>
              </div>

              {/* Monthly DCA Addition */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
                  {language === 'tr' ? 'Aylık Düzenli İlave (DCA):' : 'Monthly Recurring DCA:'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-gray-400">
                    {currency === 'USD' ? '$' : '₺'}
                  </span>
                  <input
                    type="number"
                    value={monthlyContributionInput}
                    onChange={(e) => setMonthlyContributionInput(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-sm font-black text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                </div>
              </div>

              {/* Initial Dividend Yield Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
                    {language === 'tr' ? 'Başlangıç Verimi:' : 'Starting Yield:'}
                  </label>
                  <span className="text-xs font-black text-purple-600 dark:text-purple-400 font-mono">
                    %{initialYield.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="15.0"
                  step="0.1"
                  value={initialYield}
                  onChange={(e) => setInitialYield(parseFloat(e.target.value))}
                  className="w-full accent-purple-600 cursor-pointer"
                />
              </div>

              {/* Annual Dividend Growth Rate (CAGR) Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400">
                    {language === 'tr' ? 'Yıllık Temettü Artışı (CAGR):' : 'Dividend Growth (CAGR):'}
                  </label>
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    +%{dividendGrowthRate.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="35.0"
                  step="0.5"
                  value={dividendGrowthRate}
                  onChange={(e) => setDividendGrowthRate(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Input Row: Horizon Buttons & DRIP Toggle */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
              {/* Horizon Quick Selector */}
              <div className="space-y-1 w-full sm:w-auto">
                <label className="text-xs font-bold text-gray-500 block">
                  {language === 'tr' ? 'Projeksiyon Zaman Dilimi (Ufuk):' : 'Projection Time Horizon:'}
                </label>
                <div className="grid grid-cols-6 gap-1 sm:flex sm:items-center">
                  {[1, 3, 5, 10, 15, 20].map((yr) => (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => setHorizonYears(yr)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        horizonYears === yr
                          ? 'bg-purple-600 text-white shadow-xs ring-2 ring-purple-400/40'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-755'
                      }`}
                    >
                      {yr} {language === 'tr' ? 'Yıl' : 'Yr'}
                    </button>
                  ))}
                </div>
              </div>

              {/* DRIP Toggle Switch */}
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/80 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 self-stretch sm:self-auto justify-between sm:justify-start">
                <div className="text-left">
                  <div className="text-xs font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                    <span>🔄</span>
                    <span>DRIP (Temettüleri Yeniden Yatır)</span>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {dripEnabled
                      ? (language === 'tr' ? 'Kartopu etkisi aktif (Bileşik alım)' : 'Snowball active (Reinvests automatically)')
                      : (language === 'tr' ? 'Temettüler nakit çekiliyor' : 'Cash payout mode')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDripEnabled(!dripEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                    dripEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      dripEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Top 4 Output KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Future Portfolio Value */}
            <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
              <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider">
                {horizonYears} {language === 'tr' ? 'Yıl Sonra Portföy Değeri' : 'Yr Future Portfolio Value'}
              </span>
              <div className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
                {formatMoney(forecastResult.finalPortfolioValue)}
              </div>
              <div className="text-xs text-gray-500 mt-1 font-medium">
                {language === 'tr' ? 'Toplam Yatırılan: ' : 'Total Invested: '}
                <span className="font-bold text-gray-700 dark:text-gray-300 font-mono">
                  {formatMoney(forecastResult.totalInvested)}
                </span>
                <span className="ml-1 text-emerald-500 font-bold">
                  (+%{forecastResult.totalReturnPct} kâr)
                </span>
              </div>
            </div>

            {/* Total Dividends Collected */}
            <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
              <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider">
                {language === 'tr' ? 'Toplanacak Toplam Temettü' : 'Total Cumulative Dividends'}
              </span>
              <div className="mt-2 text-2xl font-black text-emerald-500 font-mono">
                {formatMoney(forecastResult.totalDividendsPaid)}
              </div>
              <div className="text-xs text-gray-500 mt-1 font-medium">
                {language === 'tr'
                  ? `Toplam getirinin %${forecastResult.dividendShareOfTotalReturnPct}'si sadece temettüden!`
                  : `${forecastResult.dividendShareOfTotalReturnPct}% of total returns powered by dividends!`}
              </div>
            </div>

            {/* Monthly Passive Income in Final Year */}
            <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
              <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider">
                {horizonYears}. {language === 'tr' ? 'Yılda Aylık Pasif Gelir' : 'Yr Monthly Passive Cash'}
              </span>
              <div className="mt-2 text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
                {formatMoney(forecastResult.finalMonthlyIncome)}/{language === 'tr' ? 'ay' : 'mo'}
              </div>
              <div className="text-xs text-gray-500 mt-1 font-medium">
                {language === 'tr' ? 'Yıllık Nakit: ' : 'Annual Cash: '}
                <span className="font-bold text-gray-700 dark:text-gray-300 font-mono">
                  {formatMoney(forecastResult.finalMonthlyIncome * 12)}
                </span>
              </div>
            </div>

            {/* Yield-on-Cost (YoC) */}
            <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -mr-6 -mt-6 pointer-events-none" />
              <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider">
                {language === 'tr' ? 'Maliyete Göre Verim (YoC)' : 'Final Yield on Cost (YoC)'}
              </span>
              <div className="mt-2 text-2xl font-black text-amber-500 font-mono">
                %{forecastResult.finalYieldOnCost.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500 mt-1 font-medium">
                {language === 'tr' ? 'Başlangıç Verimi: ' : 'Starting Yield: '}
                <span className="line-through text-gray-400 font-mono">%{initialYield.toFixed(1)}</span>
                <span className="ml-1 text-emerald-500 font-bold">
                  ➔ +{((forecastResult.finalYieldOnCost / initialYield) * 100 - 100).toFixed(0)}% Artış
                </span>
              </div>
            </div>
          </div>

          {/* Snowball Milestone Achievements */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span>⛄</span>
                <span>{language === 'tr' ? 'Kartopu Etkisi Dönüm Noktaları (Milestones)' : 'Snowball Milestones Tracker'}</span>
              </h4>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                {forecastResult.milestones.filter(m => m.isAchieved).length} / {forecastResult.milestones.length} {language === 'tr' ? 'Ulaşıldı' : 'Achieved'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {forecastResult.milestones.map((m) => (
                <div
                  key={m.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    m.isAchieved
                      ? 'bg-purple-50/60 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800 shadow-xs'
                      : 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-200/60 dark:border-gray-750 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-lg">{m.icon}</span>
                    {m.isAchieved ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        ✓ {m.achievedYear}. {language === 'tr' ? 'Yılda' : 'Year'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        {language === 'tr' ? 'Daha Uzun Vade Gerekli' : 'Needs Longer Horizon'}
                      </span>
                    )}
                  </div>
                  <h5 className="text-xs font-black text-gray-900 dark:text-white leading-tight">
                    {language === 'tr' ? m.titleTr : m.titleEn}
                  </h5>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {language === 'tr' ? m.descriptionTr : m.descriptionEn}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Yearly Progress Table */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                {language === 'tr' ? 'Yıl Yıl Büyüme & Temettü Tablosu' : 'Year-by-Year Compound Growth Table'}
              </h4>
              <span className="text-xs font-medium text-gray-400">
                {dripEnabled ? (language === 'tr' ? 'DRIP Açık' : 'DRIP Enabled') : (language === 'tr' ? 'Nakit Payout' : 'Cash Payout')}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 font-bold uppercase border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="py-2.5 px-4">{language === 'tr' ? 'Yıl' : 'Year'}</th>
                    <th className="py-2.5 px-4">{language === 'tr' ? 'Portföy Değeri' : 'Portfolio Value'}</th>
                    <th className="py-2.5 px-4">{language === 'tr' ? 'Yatırılan Anapara' : 'Capital Invested'}</th>
                    <th className="py-2.5 px-4">{language === 'tr' ? 'Aylık Pasif Gelir' : 'Monthly Cash'}</th>
                    <th className="py-2.5 px-4">{language === 'tr' ? 'Yıllık Temettü' : 'Annual Dividend'}</th>
                    <th className="py-2.5 px-4">{language === 'tr' ? 'Kümülatif Temettü' : 'Total Collected'}</th>
                    <th className="py-2.5 px-4">{language === 'tr' ? 'Maliyet Verimi (YoC)' : 'Yield on Cost'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-mono">
                  {forecastResult.yearlyPoints.map((pt) => (
                    <tr key={pt.year} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-gray-900 dark:text-white font-sans">
                        {pt.year === 0 ? (language === 'tr' ? 'Başlangıç' : 'Start') : `${pt.year}. Yıl`}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-purple-600 dark:text-purple-400">
                        {formatMoney(pt.portfolioValue)}
                      </td>
                      <td className="py-2.5 px-4 text-gray-500">
                        {formatMoney(pt.cumulativeInvested)}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-blue-600 dark:text-blue-400">
                        {formatMoney(pt.monthlyAverageIncome)}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold">
                        {formatMoney(pt.annualDividendIncome)}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-500">
                        {formatMoney(pt.cumulativeDividendsCollected)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-bold border border-amber-200 dark:border-amber-800 text-[11px]">
                          %{pt.yieldOnCost.toFixed(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: HEAD-TO-HEAD ASSET & ETF COMPARATOR                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'comparator' && (
        <div className="space-y-6">
          {/* Ticker Selector Strip */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>⚖️</span>
                  <span>{language === 'tr' ? 'Kıyaslanacak Varlıkları Seçin (Maksimum 4 Varlık)' : 'Select Tickers to Compare (Max 4)'}</span>
                </h3>
                <p className="text-xs text-gray-500">
                  {language === 'tr' ? 'BIST ve Midas ABD temettü hisseleri, REIT\'leri ve ETF\'lerini yan yana kıyaslayın.' : 'Side-by-side comparison across BIST & Midas US dividend stocks, REITs, and ETFs.'}
                </p>
              </div>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 self-start sm:self-auto">
                {selectedComparatorSymbols.length} / 4 {language === 'tr' ? 'Seçildi' : 'Selected'}
              </span>
            </div>

            {/* Chip Selection Bar */}
            <div className="flex flex-wrap gap-2 pt-1">
              {MASTER_COMPARATOR_ASSETS.map((asset) => {
                const isSelected = selectedComparatorSymbols.includes(asset.symbol);
                return (
                  <button
                    key={asset.symbol}
                    type="button"
                    onClick={() => handleToggleComparatorSymbol(asset.symbol)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-750 hover:bg-gray-100 dark:hover:bg-gray-750'
                    }`}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span className="font-mono">{asset.symbol}</span>
                    <span className="text-[10px] opacity-75 font-normal">
                      (%{asset.dividendYield.toFixed(1)})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comparison Matrix Table */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                {language === 'tr' ? 'Birebir Metrik Kıyaslama Matrisi' : 'Head-to-Head Metric Comparison Matrix'}
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 font-bold uppercase border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="py-3 px-4 w-44">{language === 'tr' ? 'Metrik' : 'Metric'}</th>
                    {activeComparatorAssets.map(a => (
                      <th key={a.symbol} className="py-3 px-4 min-w-[170px]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-black text-gray-900 dark:text-white">
                            {a.symbol}
                          </span>
                          <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                            a.market === 'US' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {a.market}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-medium truncate max-w-[160px]">
                          {a.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-mono">
                  {/* Row: Current Yield */}
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="py-3 px-4 font-bold text-gray-700 dark:text-gray-300 font-sans">
                      {language === 'tr' ? 'Cari Temettü Verimi' : 'Current Dividend Yield'}
                    </td>
                    {activeComparatorAssets.map(a => (
                      <td key={a.symbol} className="py-3 px-4 font-black text-emerald-600 dark:text-emerald-400 text-sm">
                        %{a.dividendYield.toFixed(2)}
                      </td>
                    ))}
                  </tr>

                  {/* Row: 5-Year Projected YoC */}
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 bg-purple-50/30 dark:bg-purple-950/20">
                    <td className="py-3 px-4 font-bold text-purple-700 dark:text-purple-300 font-sans">
                      {language === 'tr' ? '5 Yıllık Projeksiyon YoC' : '5-Yr Projected Yield on Cost'}
                    </td>
                    {activeComparatorAssets.map(a => (
                      <td key={a.symbol} className="py-3 px-4 font-black text-purple-600 dark:text-purple-400 text-sm">
                        %{a.projected5YrYoC.toFixed(1)}
                      </td>
                    ))}
                  </tr>

                  {/* Row: 3-Year Dividend CAGR */}
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="py-3 px-4 font-bold text-gray-700 dark:text-gray-300 font-sans">
                      {language === 'tr' ? '3 Yıllık Temettü Artış Hızı (CAGR)' : '3-Yr Dividend Growth (CAGR)'}
                    </td>
                    {activeComparatorAssets.map(a => (
                      <td key={a.symbol} className="py-3 px-4 font-bold text-blue-600 dark:text-blue-400">
                        +%{a.historical3YrCagr.toFixed(1)} / yıl
                      </td>
                    ))}
                  </tr>

                  {/* Row: Payout Frequency */}
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="py-3 px-4 font-bold text-gray-700 dark:text-gray-300 font-sans">
                      {language === 'tr' ? 'Ödeme Sıklığı' : 'Payout Frequency'}
                    </td>
                    {activeComparatorAssets.map(a => (
                      <td key={a.symbol} className="py-3 px-4 font-sans font-bold text-gray-800 dark:text-gray-200">
                        {a.payoutFrequency === 'Monthly' ? '🗓️ Her Ay (Monthly)' : a.payoutFrequency === 'Quarterly' ? '3 Ayda Bir' : a.payoutFrequency === 'Semi-Annual' ? '6 Ayda Bir' : 'Yıllık'}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Safety Rating & Payout Ratio */}
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="py-3 px-4 font-bold text-gray-700 dark:text-gray-300 font-sans">
                      {language === 'tr' ? 'Güvenilirlik & Dağıtım Oranı' : 'Safety Grade & Payout Ratio'}
                    </td>
                    {activeComparatorAssets.map(a => (
                      <td key={a.symbol} className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[11px] mr-2">
                          {a.safetyRating}
                        </span>
                        <span className="text-gray-500 text-[11px]">
                          (%{a.payoutRatio} Dağıtım)
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Row: Sector & Category */}
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="py-3 px-4 font-bold text-gray-700 dark:text-gray-300 font-sans">
                      {language === 'tr' ? 'Sektör / Kategori' : 'Sector / Category'}
                    </td>
                    {activeComparatorAssets.map(a => (
                      <td key={a.symbol} className="py-3 px-4 font-sans text-gray-600 dark:text-gray-400">
                        {a.sector}
                      </td>
                    ))}
                  </tr>

                  {/* Row: Thesis */}
                  <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                    <td className="py-3 px-4 font-bold text-gray-700 dark:text-gray-300 font-sans">
                      {language === 'tr' ? 'Yapay Zeka Yatırım Tezi' : 'AI Investment Thesis'}
                    </td>
                    {activeComparatorAssets.map(a => (
                      <td key={a.symbol} className="py-3 px-4 font-sans text-[11px] text-gray-500 leading-relaxed">
                        {language === 'tr' ? a.thesisTr : a.thesisEn}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 5-Year Cashflow Simulation ($10k / ₺100k invested in each) */}
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <span>💰</span>
                  <span>
                    {language === 'tr'
                      ? `Eşit Yatırım Senaryosu: Her Birine ${formatMoney(comparatorBaseAmount)} Yatırılsaydı Ne Olurdu?`
                      : `Equal Capital Test: What if you put ${formatMoney(comparatorBaseAmount)} in each?`}
                  </span>
                </h4>
                <p className="text-xs text-gray-500">
                  {language === 'tr' ? '5 yıl boyunca toplanan net temettü nakit akışı ve tahmini portföy büyüklüğü' : '5-year cumulative dividend income and estimated asset growth comparison'}
                </p>
              </div>

              {/* Base Amount Selector */}
              <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-0.5 self-start sm:self-auto">
                {[50000, 100000, 250000].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setComparatorBaseAmount(amt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      comparatorBaseAmount === amt
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                    }`}
                  >
                    {formatMoney(amt)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              {activeComparatorAssets.map(a => {
                // Approximate 5-year compounding
                const annualDivYear1 = comparatorBaseAmount * (a.dividendYield / 100);
                const total5YrDividends = Array.from({ length: 5 }).reduce((acc: number, _, i) => {
                  return acc + annualDivYear1 * Math.pow(1 + a.historical3YrCagr / 100 * 0.4, i);
                }, 0);
                const finalYoC = a.projected5YrYoC;

                return (
                  <div key={a.symbol} className="p-4 rounded-xl border border-gray-200 dark:border-gray-750 bg-gray-50/50 dark:bg-gray-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-black text-gray-900 dark:text-white">
                        {a.symbol}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        5Y YoC: %{finalYoC}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-gray-400">
                        {language === 'tr' ? '5 Yılda Toplanan Temettü' : '5-Yr Total Dividends'}
                      </span>
                      <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatMoney(total5YrDividends)}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {language === 'tr' ? 'Anapara Geri Ödeme: ' : 'Principal Payback: '}
                        <span className="font-bold text-gray-700 dark:text-gray-300">
                          %{((total5YrDividends / comparatorBaseAmount) * 100).toFixed(0)}
                        </span>
                      </p>
                    </div>

                    <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between text-xs">
                      <span className="text-gray-500">{language === 'tr' ? 'Yıllık Nakit (5. Yıl):' : 'Yr 5 Annual Cash:'}</span>
                      <span className="font-bold text-purple-600 dark:text-purple-400 font-mono">
                        {formatMoney(comparatorBaseAmount * (finalYoC / 100))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 3: AUTONOMOUS MODEL PORTFOLIO RECOMMENDATIONS                    */}
      {/* ========================================================================= */}
      {activeSubTab === 'portfolios' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-850 rounded-2xl p-5 border border-gray-200 dark:border-gray-800 shadow-sm">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span>🏛️</span>
              <span>{language === 'tr' ? 'Yapay Zeka Destekli Model Temettü Portföyleri' : 'Autonomous Model Dividend Portfolios'}</span>
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {language === 'tr'
                ? 'Farklı yatırım hedeflerine ve nakit akışı ihtiyaçlarına göre optimize edilmiş 4 ana model strateji.'
                : '4 pre-configured strategy allocations optimized for immediate yield, double-digit dividend growth, or USD monthly cashflow.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {modelPortfolios.map((portfolio) => (
              <div
                key={portfolio.id}
                className="bg-white dark:bg-gray-850 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4 flex flex-col justify-between hover:border-purple-300 dark:hover:border-purple-800 transition-all"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-black text-gray-900 dark:text-white">
                          {language === 'tr' ? portfolio.titleTr : portfolio.titleEn}
                        </h4>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full text-white ${portfolio.badgeColor}`}>
                          {language === 'tr' ? portfolio.badgeTr : portfolio.badgeEn}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {language === 'tr' ? portfolio.descriptionTr : portfolio.descriptionEn}
                      </p>
                    </div>
                  </div>

                  {/* Core Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-100 dark:border-gray-750">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">
                        {language === 'tr' ? 'Hedef Verim' : 'Target Yield'}
                      </span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        %{portfolio.targetYield.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">
                        {language === 'tr' ? 'Büyüme (CAGR)' : 'Growth CAGR'}
                      </span>
                      <span className="text-base font-black text-blue-600 dark:text-blue-400 font-mono">
                        +%{portfolio.growthCagr.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">
                        {language === 'tr' ? 'Ödeme Düzeni' : 'Frequency'}
                      </span>
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                        {language === 'tr' ? portfolio.frequencyTr : portfolio.frequencyEn}
                      </span>
                    </div>
                  </div>

                  {/* Holdings Breakdown */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                      {language === 'tr' ? 'Varlık Dağılımı:' : 'Asset Allocation:'}
                    </span>
                    <div className="space-y-1.5">
                      {portfolio.holdings.map(h => (
                        <div key={h.sym} className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-gray-50/80 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-750">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-gray-900 dark:text-white">{h.sym}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold">
                              {h.curr}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500 font-mono">%{h.weight} ağırlık</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                              %{h.yield} Verim
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => handleApplyModelPortfolio(portfolio.id)}
                    className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 active:scale-98 text-white shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>📈</span>
                    <span>{language === 'tr' ? 'Bu Portföyü Simülatöre Yükle ve Test Et' : 'Load into Simulator & Test'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
