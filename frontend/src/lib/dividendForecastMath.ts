/**
 * Dividend Forecasting, DRIP Compounding, and Head-to-Head Comparison Math Engine
 */

export interface ForecastParams {
  initialCapital: number; // in chosen currency
  monthlyContribution: number; // recurring monthly DCA
  horizonYears: number; // 1, 3, 5, 10, 15, 20
  dripEnabled: boolean; // Reinvest dividends
  initialDividendYield: number; // e.g. 7.5 for 7.5%
  annualDividendGrowthRate: number; // e.g. 8.0 for 8% annual dividend increase
  annualPriceAppreciationRate: number; // e.g. 7.0 for 7% annual capital appreciation
  currency: 'TRY' | 'USD';
}

export interface YearlyForecastPoint {
  year: number;
  portfolioValue: number;
  cumulativeInvested: number;
  annualDividendIncome: number;
  monthlyAverageIncome: number;
  cumulativeDividendsCollected: number;
  yieldOnCost: number; // %
  currentMarketYield: number; // %
  sharesCountApprox: number;
}

export interface SnowballMilestone {
  id: string;
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
  achievedYear: number | null; // null if not achieved within horizon
  isAchieved: boolean;
  icon: string;
}

export interface ForecastResult {
  params: ForecastParams;
  yearlyPoints: YearlyForecastPoint[];
  finalPortfolioValue: number;
  totalInvested: number;
  totalDividendsPaid: number;
  finalMonthlyIncome: number;
  finalYieldOnCost: number;
  totalReturnPct: number;
  dividendShareOfTotalReturnPct: number;
  milestones: SnowballMilestone[];
}

/**
 * Calculates month-by-month compound growth with DRIP, recurring contributions, and dividend growth
 */
export function calculateDividendForecast(params: ForecastParams): ForecastResult {
  const {
    initialCapital,
    monthlyContribution,
    horizonYears,
    dripEnabled,
    initialDividendYield,
    annualDividendGrowthRate,
    annualPriceAppreciationRate,
  } = params;

  const totalMonths = horizonYears * 12;
  const monthlyPriceGrowth = Math.pow(1 + annualPriceAppreciationRate / 100, 1 / 12) - 1;

  let currentPortfolioValue = initialCapital;
  let cumulativeInvested = initialCapital;
  let cumulativeDividends = 0;
  let currentSharePrice = 100; // Normalized baseline share price
  let sharesOwned = initialCapital / currentSharePrice;

  const yearlyPoints: YearlyForecastPoint[] = [];

  // Track milestones
  let milestoneSharePerMonthYear: number | null = null;
  let milestoneBasicExpenseYear: number | null = null;
  let milestone10YoCYear: number | null = null;
  let milestone100PrincipalPaybackYear: number | null = null;

  // Initial year 0 point
  const initialAnnualDiv = initialCapital * (initialDividendYield / 100);
  yearlyPoints.push({
    year: 0,
    portfolioValue: Math.round(initialCapital),
    cumulativeInvested: Math.round(initialCapital),
    annualDividendIncome: Math.round(initialAnnualDiv),
    monthlyAverageIncome: Math.round(initialAnnualDiv / 12),
    cumulativeDividendsCollected: 0,
    yieldOnCost: Number(initialDividendYield.toFixed(2)),
    currentMarketYield: Number(initialDividendYield.toFixed(2)),
    sharesCountApprox: Math.round(sharesOwned),
  });

  for (let m = 1; m <= totalMonths; m++) {
    const currentYear = Math.floor((m - 1) / 12);
    // Dividend yield expands with dividend growth
    const dividendGrowthMultiplier = Math.pow(1 + annualDividendGrowthRate / 100, currentYear);
    const effectiveAnnualYield = (initialDividendYield / 100) * dividendGrowthMultiplier;
    const monthlyYield = effectiveAnnualYield / 12;

    // Capital appreciation on existing portfolio
    currentPortfolioValue *= (1 + monthlyPriceGrowth);
    currentSharePrice *= (1 + monthlyPriceGrowth);

    // Monthly contribution
    if (monthlyContribution > 0) {
      currentPortfolioValue += monthlyContribution;
      cumulativeInvested += monthlyContribution;
      sharesOwned += monthlyContribution / currentSharePrice;
    }

    // Monthly dividend payout
    const monthlyDividendPaid = currentPortfolioValue * monthlyYield;
    cumulativeDividends += monthlyDividendPaid;

    // Check Milestone: Monthly dividend buys 1 full share
    if (!milestoneSharePerMonthYear && monthlyDividendPaid >= currentSharePrice) {
      milestoneSharePerMonthYear = Math.ceil(m / 12);
    }

    // Check Milestone: Covers monthly expense ($100 or ₺4,000)
    const thresholdExpense = params.currency === 'USD' ? 100 : 4500;
    if (!milestoneBasicExpenseYear && monthlyDividendPaid >= thresholdExpense) {
      milestoneBasicExpenseYear = Math.ceil(m / 12);
    }

    // DRIP Reinvestment
    if (dripEnabled) {
      currentPortfolioValue += monthlyDividendPaid;
      sharesOwned += monthlyDividendPaid / currentSharePrice;
    }

    // Record yearly checkpoints
    if (m % 12 === 0) {
      const yearNum = m / 12;
      const annualizedDividendIncome = currentPortfolioValue * effectiveAnnualYield;
      const currentYoC = cumulativeInvested > 0 ? (annualizedDividendIncome / cumulativeInvested) * 100 : 0;

      if (!milestone10YoCYear && currentYoC >= 10.0) {
        milestone10YoCYear = yearNum;
      }
      if (!milestone100PrincipalPaybackYear && cumulativeDividends >= cumulativeInvested) {
        milestone100PrincipalPaybackYear = yearNum;
      }

      yearlyPoints.push({
        year: yearNum,
        portfolioValue: Math.round(currentPortfolioValue),
        cumulativeInvested: Math.round(cumulativeInvested),
        annualDividendIncome: Math.round(annualizedDividendIncome),
        monthlyAverageIncome: Math.round(annualizedDividendIncome / 12),
        cumulativeDividendsCollected: Math.round(cumulativeDividends),
        yieldOnCost: Number(currentYoC.toFixed(2)),
        currentMarketYield: Number((effectiveAnnualYield * 100).toFixed(2)),
        sharesCountApprox: Math.round(sharesOwned),
      });
    }
  }

  const finalPoint = yearlyPoints[yearlyPoints.length - 1];
  const totalReturnAmount = (currentPortfolioValue + (dripEnabled ? 0 : cumulativeDividends)) - cumulativeInvested;
  const totalReturnPct = cumulativeInvested > 0 ? (totalReturnAmount / cumulativeInvested) * 100 : 0;
  const divSharePct = totalReturnAmount > 0 ? Math.min(100, Math.max(0, (cumulativeDividends / totalReturnAmount) * 100)) : 0;

  const milestones: SnowballMilestone[] = [
    {
      id: 'm_share_per_month',
      titleTr: 'Kendi Kendini Besleyen Lot (1 Lot / Ay)',
      titleEn: 'Self-Funded Share (1 Share / Month)',
      descriptionTr: 'Aylık temettü ödemeniz cebinizden para çıkmadan her ay 1 tam hisse almaya yetiyor.',
      descriptionEn: 'Monthly dividends automatically purchase 1 full share without out-of-pocket cash.',
      achievedYear: milestoneSharePerMonthYear,
      isAchieved: milestoneSharePerMonthYear !== null,
      icon: '🌱',
    },
    {
      id: 'm_basic_expense',
      titleTr: params.currency === 'USD' ? 'Aylık $100 Fatura Kalkanı' : 'Aylık ₺4.500 Fatura Kalkanı',
      titleEn: params.currency === 'USD' ? '$100/mo Utility Shield' : '₺4,500/mo Utility Shield',
      descriptionTr: 'Pasif nakit akışınız temel bir yaşam masrafınızı veya aboneliklerinizi kalıcı olarak finanse ediyor.',
      descriptionEn: 'Passive dividend flow permanently finances a baseline recurring monthly expense.',
      achievedYear: milestoneBasicExpenseYear,
      isAchieved: milestoneBasicExpenseYear !== null,
      icon: '🛡️',
    },
    {
      id: 'm_10_yoc',
      titleTr: '%10+ Maliyete Göre Verim (YoC)',
      titleEn: '10%+ Yield on Cost (YoC)',
      descriptionTr: 'Başlangıçta yatırdığınız her 100 liranız/dolarınız artık her yıl 10 liranın üzerinde net nakit akıtıyor.',
      descriptionEn: 'Every original capital unit invested yields over 10% in passive annual cash.',
      achievedYear: milestone10YoCYear,
      isAchieved: milestone10YoCYear !== null,
      icon: '🚀',
    },
    {
      id: 'm_100_payback',
      titleTr: 'Sermaye Amortismanı (%100 Geri Ödeme)',
      titleEn: 'Principal Full Payback (100% Risk-Free)',
      descriptionTr: 'Toplanan toplam temettüler cebinizden çıkan toplam anaparayı aştı. Pozisyon artık tamamen bedava!',
      descriptionEn: 'Cumulative dividends collected exceed 100% of invested principal. Free carry compounding!',
      achievedYear: milestone100PrincipalPaybackYear,
      isAchieved: milestone100PrincipalPaybackYear !== null,
      icon: '🏆',
    },
  ];

  return {
    params,
    yearlyPoints,
    finalPortfolioValue: Math.round(currentPortfolioValue),
    totalInvested: Math.round(cumulativeInvested),
    totalDividendsPaid: Math.round(cumulativeDividends),
    finalMonthlyIncome: finalPoint.monthlyAverageIncome,
    finalYieldOnCost: finalPoint.yieldOnCost,
    totalReturnPct: Number(totalReturnPct.toFixed(1)),
    dividendShareOfTotalReturnPct: Number(divSharePct.toFixed(1)),
    milestones,
  };
}

/**
 * Head-to-Head Comparison Math Engine
 */
export interface DividendComparatorAsset {
  symbol: string;
  name: string;
  market: 'BIST' | 'US';
  currency: 'TRY' | 'USD';
  currentPrice: number;
  dividendYield: number; // %
  payoutFrequency: 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual';
  safetyRating: 'A+' | 'A' | 'B+' | 'B';
  payoutRatio: number; // %
  historical3YrCagr: number; // %
  projected5YrYoC: number; // %
  sector: string;
  thesisTr: string;
  thesisEn: string;
}

export const MASTER_COMPARATOR_ASSETS: DividendComparatorAsset[] = [
  {
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 28.78,
    dividendYield: 8.55,
    payoutFrequency: 'Annual',
    safetyRating: 'A',
    payoutRatio: 58.4,
    historical3YrCagr: 24.5,
    projected5YrYoC: 15.2,
    sector: 'Sermaye Piyasaları & Aracı Kurum',
    thesisTr: 'Yüksek komisyon & kredi faiz gelirleri ile düzenli yüksek kâr dağıtımı.',
    thesisEn: 'Market leader in Turkish brokerage with superior return on equity and high payout.',
  },
  {
    symbol: 'TURSG',
    name: 'Türkiye Sigorta',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 5.15,
    dividendYield: 7.09,
    payoutFrequency: 'Annual',
    safetyRating: 'A',
    payoutRatio: 52.1,
    historical3YrCagr: 28.0,
    projected5YrYoC: 13.8,
    sector: 'Sigorta & Finans',
    thesisTr: 'Yüksek faiz ortamında devasa teknik kâr & prim büyümesi ile defansif temettü.',
    thesisEn: 'Dominant Turkish non-life insurer benefiting from strong float investment returns.',
  },
  {
    symbol: 'O',
    name: 'Realty Income Corporation',
    market: 'US',
    currency: 'USD',
    currentPrice: 55.55,
    dividendYield: 5.40,
    payoutFrequency: 'Monthly',
    safetyRating: 'A',
    payoutRatio: 74.5,
    historical3YrCagr: 3.8,
    projected5YrYoC: 6.8,
    sector: 'Gayrimenkul (Ticari / Perakende REIT)',
    thesisTr: '"The Monthly Dividend Company" - 25+ yıl kesintisiz aylık temettü aristokratı.',
    thesisEn: 'S&P 500 monthly dividend aristocrat with triple-net lease agreements and 98% occupancy.',
  },
  {
    symbol: 'VICI',
    name: 'VICI Properties Inc.',
    market: 'US',
    currency: 'USD',
    currentPrice: 32.46,
    dividendYield: 5.35,
    payoutFrequency: 'Quarterly',
    safetyRating: 'A',
    payoutRatio: 68.0,
    historical3YrCagr: 6.5,
    projected5YrYoC: 7.4,
    sector: 'Eğlence & Otelcilik (REIT)',
    thesisTr: 'Las Vegas ve ABD genelinde Caesars/MGM tesislerinin gayrimenkul sahibi.',
    thesisEn: 'Premier experiential gaming REIT with 100% rent collection track record and inflation-protected leases.',
  },
  {
    symbol: 'SCHD',
    name: 'Schwab U.S. Dividend Equity ETF',
    market: 'US',
    currency: 'USD',
    currentPrice: 83.10,
    dividendYield: 3.65,
    payoutFrequency: 'Quarterly',
    safetyRating: 'A+',
    payoutRatio: 65.0,
    historical3YrCagr: 9.8,
    projected5YrYoC: 6.2,
    sector: 'Bileşik Büyüyen Temettü Fonu (ETF)',
    thesisTr: 'Midas kullanıcılarının 1 numaralı temettü ETF’i. 100 kaliteli şirketin sepeti.',
    thesisEn: 'The premier US dividend growth ETF tracking the 100 highest quality, cash-generative US companies.',
  },
  {
    symbol: 'JEPI',
    name: 'JPMorgan Equity Premium Income ETF',
    market: 'US',
    currency: 'USD',
    currentPrice: 57.16,
    dividendYield: 7.50,
    payoutFrequency: 'Monthly',
    safetyRating: 'A',
    payoutRatio: 85.0,
    historical3YrCagr: 4.2,
    projected5YrYoC: 8.6,
    sector: 'Opsiyonlu Yüksek Nakit Akışı Fonu',
    thesisTr: 'S&P 500 hisseleri üzerine call opsiyon primi yazarak yüksek aylık dolar geliri sunar.',
    thesisEn: 'Combines low-volatility S&P 500 stocks with covered-call overlay to generate 7-8% monthly USD distributions.',
  },
  {
    symbol: 'TUPRS',
    name: 'Tüpraş',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 367.50,
    dividendYield: 7.40,
    payoutFrequency: 'Semi-Annual',
    safetyRating: 'A',
    payoutRatio: 65.0,
    historical3YrCagr: 32.0,
    projected5YrYoC: 14.8,
    sector: 'Rafineri & Enerji',
    thesisTr: 'Net nakit pozisyonu, güçlü rafineri marjları ve yılda 2 kez temettü alışkanlığı.',
    thesisEn: 'Strategic national refiner with high free cash flow conversion and generous twice-a-year payouts.',
  },
  {
    symbol: 'FROTO',
    name: 'Ford Otosan',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 1045.00,
    dividendYield: 5.60,
    payoutFrequency: 'Semi-Annual',
    safetyRating: 'A+',
    payoutRatio: 55.0,
    historical3YrCagr: 26.0,
    projected5YrYoC: 13.5,
    sector: 'Otomotiv & İhracat',
    thesisTr: 'Romanya Craiova yatırımı ve Avrupa ticari araç liderliği ile büyüme temettüsü.',
    thesisEn: 'Commercial vehicle export powerhouse with decades of consecutive dividend growth.',
  },
  {
    symbol: 'KO',
    name: 'The Coca-Cola Company',
    market: 'US',
    currency: 'USD',
    currentPrice: 68.50,
    dividendYield: 3.10,
    payoutFrequency: 'Quarterly',
    safetyRating: 'A+',
    payoutRatio: 68.0,
    historical3YrCagr: 5.2,
    projected5YrYoC: 4.8,
    sector: 'Tüketim Ürünleri (Dividend King)',
    thesisTr: '62 yıldır kesintisiz temettü artıran dünya devi. Defansif kale.',
    thesisEn: 'Dividend King with 62 consecutive years of dividend hikes and immense global pricing power.',
  },
  {
    symbol: 'PLD',
    name: 'Prologis, Inc.',
    market: 'US',
    currency: 'USD',
    currentPrice: 126.94,
    dividendYield: 3.25,
    payoutFrequency: 'Quarterly',
    safetyRating: 'A',
    payoutRatio: 72.0,
    historical3YrCagr: 10.5,
    projected5YrYoC: 5.5,
    sector: 'Lojistik & Depoculuk (REIT)',
    thesisTr: 'Dünyanın 1 numaralı e-ticaret ve lojistik depo gayrimenkul devi (Amazon, FedEx).',
    thesisEn: 'Global logistics real estate leader benefiting from secular e-commerce warehousing expansion.',
  },
];
