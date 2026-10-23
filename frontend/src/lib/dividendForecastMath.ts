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

export type GrowthScenario = 'conservative' | 'realistic' | 'optimistic';

export interface AssetGrowthProfile {
  symbol: string;
  name: string;
  market: 'BIST' | 'US';
  currency: 'TRY' | 'USD';
  currentPrice: number;
  currentYield: number;
  historical3YrDivCagr: number; // Realized 3-Year CAGR
  historical3YrPriceCagr: number; // Realized 3-Year Price CAGR
  predictedGrowth: {
    conservative: number;
    realistic: number;
    optimistic: number;
  };
  predictedPriceAppreciation: number;
  payoutFrequency: 'Monthly' | 'Quarterly' | 'Semi-Annual' | 'Annual';
  payoutRatio: number;
  safetyGrade: 'AAA' | 'AA' | 'A+' | 'A' | 'B+' | 'B' | 'C';
  aiRationaleTr: string;
  aiRationaleEn: string;
}

/**
 * Historical Data & Consensus Predicted Growth Registry
 */
export const MASTER_GROWTH_PROFILES: Record<string, AssetGrowthProfile> = {
  ISMEN: {
    symbol: 'ISMEN',
    name: 'İş Yatırım Menkul Değerler',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 28.78,
    currentYield: 8.55,
    historical3YrDivCagr: 84.6,
    historical3YrPriceCagr: 32.5,
    predictedGrowth: {
      conservative: 14.0,
      realistic: 22.0,
      optimistic: 28.0,
    },
    predictedPriceAppreciation: 15.0,
    payoutFrequency: 'Annual',
    payoutRatio: 58.4,
    safetyGrade: 'A',
    aiRationaleTr: 'Son 3 yılda %80+ üzerinde temettü artışı kaydetti. Sermaye piyasalarındaki rekor hacimler ve kârlılıkla model, önümüzdeki 5 yıl için %22.0 sürdürülebilir yıllık büyüme öngörüyor.',
    aiRationaleEn: 'Delivered +80%+ dividend CAGR over the last 3 years. Given high brokerage ROE and low leverage, the model forecasts a realistic +22.0% annual dividend growth rate.',
  },
  TURSG: {
    symbol: 'TURSG',
    name: 'Türkiye Sigorta',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 5.15,
    currentYield: 7.09,
    historical3YrDivCagr: 55.7,
    historical3YrPriceCagr: 30.3,
    predictedGrowth: {
      conservative: 16.0,
      realistic: 24.0,
      optimistic: 32.0,
    },
    predictedPriceAppreciation: 18.0,
    payoutFrequency: 'Annual',
    payoutRatio: 52.1,
    safetyGrade: 'A',
    aiRationaleTr: 'Teknik kârlılık ve yüksek faiz ortamındaki devasa prim geliri ile 2022-2025 arası %55.7 temettü CAGR gerçekleştirdi. Model %24.0 dengeli büyüme öngörüyor.',
    aiRationaleEn: 'Recorded +55.7% dividend CAGR between 2022-2025 from surging underwriting profits. Model projects a consensus +24.0% sustainable growth trajectory.',
  },
  TUPRS: {
    symbol: 'TUPRS',
    name: 'Tüpraş',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 367.50,
    currentYield: 7.40,
    historical3YrDivCagr: 91.5,
    historical3YrPriceCagr: 50.9,
    predictedGrowth: {
      conservative: 11.0,
      realistic: 17.5,
      optimistic: 24.0,
    },
    predictedPriceAppreciation: 16.0,
    payoutFrequency: 'Semi-Annual',
    payoutRatio: 65.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Rafineri marjlarındaki döngüsel gücü ve yılda iki kez nakit dağıtma disiplini ile geçmişte %90+ CAGR gördü. Önümüzdeki dönem için %17.5 konsensüs büyüme tahmin ediliyor.',
    aiRationaleEn: 'Strategic national refiner with high free cash conversion. Consensus model projects a normalized +17.5% annual dividend growth rate.',
  },
  FROTO: {
    symbol: 'FROTO',
    name: 'Ford Otosan',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 1045.00,
    currentYield: 5.60,
    historical3YrDivCagr: 60.7,
    historical3YrPriceCagr: 28.4,
    predictedGrowth: {
      conservative: 12.0,
      realistic: 19.0,
      optimistic: 26.0,
    },
    predictedPriceAppreciation: 15.0,
    payoutFrequency: 'Semi-Annual',
    payoutRatio: 55.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Avrupa ticari araç ihracat liderliği ve Craiova fabrikasının nakit akışı ile 2022-2025 döneminde %60.7 temettü CAGR kaydetti. Model %19.0 büyüme öngörüyor.',
    aiRationaleEn: 'Commercial export champion with +60.7% historical dividend CAGR. High reinvestment moat supports +19.0% projected compounding.',
  },
  AKBNK: {
    symbol: 'AKBNK',
    name: 'Akbank T.A.Ş.',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 66.90,
    currentYield: 4.73,
    historical3YrDivCagr: 35.0,
    historical3YrPriceCagr: 30.2,
    predictedGrowth: {
      conservative: 10.0,
      realistic: 16.5,
      optimistic: 22.0,
    },
    predictedPriceAppreciation: 14.0,
    payoutFrequency: 'Annual',
    payoutRatio: 28.5,
    safetyGrade: 'A',
    aiRationaleTr: 'Güçlü sermaye yeterlilik rasyosu ve düşük dağıtım oranı (%28.5) sayesinde temettüsünü rahatça artırma kapasitesine sahip. Konsensüs: %16.5 büyüme.',
    aiRationaleEn: 'Fortress capital adequacy ratio and conservative 28.5% payout ratio provide massive buffer for +16.5% projected annual dividend increases.',
  },
  O: {
    symbol: 'O',
    name: 'Realty Income Corporation',
    market: 'US',
    currency: 'USD',
    currentPrice: 55.55,
    currentYield: 5.40,
    historical3YrDivCagr: 5.5,
    historical3YrPriceCagr: 8.8,
    predictedGrowth: {
      conservative: 3.5,
      realistic: 5.2,
      optimistic: 6.8,
    },
    predictedPriceAppreciation: 5.0,
    payoutFrequency: 'Monthly',
    payoutRatio: 74.5,
    safetyGrade: 'A',
    aiRationaleTr: 'S&P 500 Temettü Aristokratı; 25 yılı aşkın süredir her ay kesintisiz temettü artırıyor. Tarihsel %5.5 artış trendine paralel olarak %5.2 reel büyüme öngörülüyor.',
    aiRationaleEn: 'S&P 500 Dividend Aristocrat with 25+ consecutive years of monthly dividend hikes. Model projects steady +5.2% annual growth with 100% payout reliability.',
  },
  VICI: {
    symbol: 'VICI',
    name: 'VICI Properties Inc.',
    market: 'US',
    currency: 'USD',
    currentPrice: 32.46,
    currentYield: 5.35,
    historical3YrDivCagr: 5.6,
    historical3YrPriceCagr: 7.2,
    predictedGrowth: {
      conservative: 4.0,
      realistic: 5.8,
      optimistic: 7.5,
    },
    predictedPriceAppreciation: 6.0,
    payoutFrequency: 'Quarterly',
    payoutRatio: 68.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Caesars ve MGM tesislerinin sahibi olan gayrimenkul devi, enflasyona endeksli kira sözleşmeleriyle yılda ortalama %5.8 temettü artışı sağlıyor.',
    aiRationaleEn: 'Experiential gaming REIT with 100% rent collection and CPI-linked contracts. Predictive model projects +5.8% annual dividend expansion.',
  },
  SCHD: {
    symbol: 'SCHD',
    name: 'Schwab U.S. Dividend Equity ETF',
    market: 'US',
    currency: 'USD',
    currentPrice: 83.10,
    currentYield: 3.65,
    historical3YrDivCagr: 7.0,
    historical3YrPriceCagr: 17.2,
    predictedGrowth: {
      conservative: 6.0,
      realistic: 8.5,
      optimistic: 11.2,
    },
    predictedPriceAppreciation: 8.0,
    payoutFrequency: 'Quarterly',
    payoutRatio: 65.0,
    safetyGrade: 'A+',
    aiRationaleTr: '10 yıllık tarihsel verisinde ortalama %10.5 temettü CAGR yakalayan 100 kaliteli ABD şirketinin sepeti. Model önümüzdeki 5 yıl için %8.5 büyüme öngörüyor.',
    aiRationaleEn: 'Tracks 100 cash-generative US companies with a 10-year historical dividend CAGR around +10%. Predictive model projects a sustainable +8.5% rate.',
  },
  JEPI: {
    symbol: 'JEPI',
    name: 'JPMorgan Equity Premium Income ETF',
    market: 'US',
    currency: 'USD',
    currentPrice: 57.16,
    currentYield: 7.50,
    historical3YrDivCagr: 4.2,
    historical3YrPriceCagr: 10.5,
    predictedGrowth: {
      conservative: 2.5,
      realistic: 4.0,
      optimistic: 5.5,
    },
    predictedPriceAppreciation: 4.0,
    payoutFrequency: 'Monthly',
    payoutRatio: 85.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Yüksek cari nakit akışı sunan opsiyon primi stratejisi. Amacı yüksek temettü artışı değil, yüksek başlangıç verimi (%7.5) ve düzenli aylık nakittir.',
    aiRationaleEn: 'Covered call overlay generates immediate 7.5% cash distributions. Focused on high current payout with steady +4.0% distribution stability.',
  },
  KO: {
    symbol: 'KO',
    name: 'The Coca-Cola Company',
    market: 'US',
    currency: 'USD',
    currentPrice: 68.50,
    currentYield: 3.10,
    historical3YrDivCagr: 5.0,
    historical3YrPriceCagr: 23.1,
    predictedGrowth: {
      conservative: 3.8,
      realistic: 5.0,
      optimistic: 6.2,
    },
    predictedPriceAppreciation: 6.5,
    payoutFrequency: 'Quarterly',
    payoutRatio: 68.0,
    safetyGrade: 'A+',
    aiRationaleTr: '62 yıldır her yıl aralıksız temettü artıran Dividend King. Defansif fiyatlama gücüyle saat gibi işleyen %5.0 öngörülen yıllık temettü artışı.',
    aiRationaleEn: 'Dividend King with 62 consecutive years of dividend hikes. Rock-solid pricing power supports +5.0% projected annual distribution increases.',
  },
  PLD: {
    symbol: 'PLD',
    name: 'Prologis, Inc.',
    market: 'US',
    currency: 'USD',
    currentPrice: 126.94,
    currentYield: 3.25,
    historical3YrDivCagr: 10.5,
    historical3YrPriceCagr: 7.5,
    predictedGrowth: {
      conservative: 6.5,
      realistic: 9.2,
      optimistic: 12.0,
    },
    predictedPriceAppreciation: 7.0,
    payoutFrequency: 'Quarterly',
    payoutRatio: 72.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Dünyanın 1 numaralı lojistik ve e-ticaret depo devi (Amazon, FedEx). Geçmiş 5 yılda çift haneli temettü büyümesi yakaladı; konsensüs %9.2 büyüme.',
    aiRationaleEn: 'Global logistics real estate leader. Secular e-commerce warehouse expansion drives a robust +9.2% projected dividend growth trajectory.',
  },
  VOO: {
    symbol: 'VOO',
    name: 'Vanguard S&P 500 ETF',
    market: 'US',
    currency: 'USD',
    currentPrice: 528.40,
    currentYield: 1.35,
    historical3YrDivCagr: 5.5,
    historical3YrPriceCagr: 22.5,
    predictedGrowth: {
      conservative: 4.5,
      realistic: 6.5,
      optimistic: 8.5,
    },
    predictedPriceAppreciation: 9.0,
    payoutFrequency: 'Quarterly',
    payoutRatio: 45.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'S&P 500 endeksinin tamamı. Düşük başlangıç verimi ancak güçlü sermaye artışı ve şirket kârlarıyla birlikte yıllık ortalama %6.5 temettü artışı.',
    aiRationaleEn: 'Broad US market index. Low starting yield compensated by high total return and steady +6.5% corporate dividend expansion.',
  },
  TRGYO: {
    symbol: 'TRGYO',
    name: 'Torunlar GYO',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 84.50,
    currentYield: 5.20,
    historical3YrDivCagr: 42.5,
    historical3YrPriceCagr: 38.0,
    predictedGrowth: { conservative: 12.0, realistic: 18.0, optimistic: 25.0 },
    predictedPriceAppreciation: 16.0,
    payoutFrequency: 'Annual',
    payoutRatio: 52.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Mall of Istanbul ve prime ofis kuleleri ile yüksek döviz/TL kira nakit akışı. Net Aktif Değerine (NAD) göre yüksek iskonto ve düzenli temettü ödeme geleneği.',
    aiRationaleEn: 'Premier Turkish REIT anchored by Mall of Istanbul and prime commercial towers. Robust CPI-indexed rental income and consistent distribution yield.',
  },
  EKGYO: {
    symbol: 'EKGYO',
    name: 'Emlak Konut GYO',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 13.80,
    currentYield: 4.80,
    historical3YrDivCagr: 35.0,
    historical3YrPriceCagr: 25.0,
    predictedGrowth: { conservative: 10.0, realistic: 16.0, optimistic: 22.0 },
    predictedPriceAppreciation: 14.0,
    payoutFrequency: 'Annual',
    payoutRatio: 48.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Türkiye gayrimenkul sektörünün amiral gemisi. Gelir paylaşımı modeli ile yüksek nakit yaratımı ve yıllık temettü ödemesi.',
    aiRationaleEn: 'Turkey largest REIT with sovereign backing and extensive master-planned development projects.',
  },
  ISGYO: {
    symbol: 'ISGYO',
    name: 'İş GYO',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 18.20,
    currentYield: 5.10,
    historical3YrDivCagr: 38.0,
    historical3YrPriceCagr: 28.0,
    predictedGrowth: { conservative: 11.0, realistic: 17.0, optimistic: 23.0 },
    predictedPriceAppreciation: 15.0,
    payoutFrequency: 'Annual',
    payoutRatio: 50.0,
    safetyGrade: 'A',
    aiRationaleTr: 'İş Bankası grubu kurumsal güvencesi. Kanyon ve prime ticari varlıkların güçlü kira gelirleri.',
    aiRationaleEn: 'Isbank Group commercial property powerhouse with stable corporate tenant rents.',
  },
  ALGYO: {
    symbol: 'ALGYO',
    name: 'Alarko GYO',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 48.60,
    currentYield: 5.60,
    historical3YrDivCagr: 45.0,
    historical3YrPriceCagr: 31.0,
    predictedGrowth: { conservative: 12.0, realistic: 19.0, optimistic: 26.0 },
    predictedPriceAppreciation: 16.0,
    payoutFrequency: 'Annual',
    payoutRatio: 54.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Net nakit pozisyonu yüksek, döviz bazlı turizm/otel varlıkları ile güçlü temettü ödeme kapasitesi.',
    aiRationaleEn: 'Zero debt, FX-earning luxury hotel and resort portfolio providing high dividend safety.',
  },
  OZKGY: {
    symbol: 'OZKGY',
    name: 'Özak GYO',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 11.40,
    currentYield: 4.90,
    historical3YrDivCagr: 36.0,
    historical3YrPriceCagr: 29.0,
    predictedGrowth: { conservative: 10.0, realistic: 16.5, optimistic: 23.0 },
    predictedPriceAppreciation: 15.0,
    payoutFrequency: 'Annual',
    payoutRatio: 46.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Büyükyalı karma projesi ve Ela Excellence Belek oteli ile dengeli kira ve turizm gelirleri.',
    aiRationaleEn: 'Diversified mixed-use and hospitality REIT with recurring free cash generation.',
  },
  RYGYO: {
    symbol: 'RYGYO',
    name: 'Reysaş Lojistik GYO',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 42.10,
    currentYield: 4.50,
    historical3YrDivCagr: 48.0,
    historical3YrPriceCagr: 35.0,
    predictedGrowth: { conservative: 11.0, realistic: 18.0, optimistic: 25.0 },
    predictedPriceAppreciation: 18.0,
    payoutFrequency: 'Annual',
    payoutRatio: 45.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Türkiye lojistik depoculuğunun lideri. E-ticaret büyümesi ve GES çatı güneş enerjisi gelirleri ile istikrarlı nakit akışı.',
    aiRationaleEn: 'Pure-play logistics warehouse and rooftop solar REIT benefiting from e-commerce secular growth.',
  },
  TTRAK: {
    symbol: 'TTRAK',
    name: 'Türk Traktör',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 780.00,
    currentYield: 7.80,
    historical3YrDivCagr: 72.0,
    historical3YrPriceCagr: 45.0,
    predictedGrowth: { conservative: 14.0, realistic: 21.0, optimistic: 28.0 },
    predictedPriceAppreciation: 18.0,
    payoutFrequency: 'Annual',
    payoutRatio: 75.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'BIST temettü şampiyonu; pazar payı %50 üzerinde ve kârının neredeyse tamamını nakit temettü olarak dağıtma geleneğine sahip.',
    aiRationaleEn: 'Market leader in agricultural machinery distributing high payout yields consistently.',
  },
  TOASO: {
    symbol: 'TOASO',
    name: 'Tofaş Türk Otomobil Fabrikası',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 228.00,
    currentYield: 6.40,
    historical3YrDivCagr: 62.0,
    historical3YrPriceCagr: 36.0,
    predictedGrowth: { conservative: 12.0, realistic: 18.5, optimistic: 25.0 },
    predictedPriceAppreciation: 16.0,
    payoutFrequency: 'Annual',
    payoutRatio: 68.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Stellantis Türkiye entegrasyonu ve güçlü ihracat nakit akışıyla yüksek verimli temettü dağıtıcı.',
    aiRationaleEn: 'Automotive manufacturing powerhouse with top-tier ROIC and generous annual payouts.',
  },
  EREGL: {
    symbol: 'EREGL',
    name: 'Ereğli Demir ve Çelik',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 47.80,
    currentYield: 5.50,
    historical3YrDivCagr: 40.0,
    historical3YrPriceCagr: 22.0,
    predictedGrowth: { conservative: 10.0, realistic: 15.0, optimistic: 22.0 },
    predictedPriceAppreciation: 14.0,
    payoutFrequency: 'Annual',
    payoutRatio: 60.0,
    safetyGrade: 'A',
    aiRationaleTr: 'BIST geleneksel temettü devi. Bingöl peletleme yatırımı ve küresel çelik döngüsünün toparlanmasıyla güçlü temettü potansiyeli.',
    aiRationaleEn: 'Integrated steel champion with high historic payout ratio and long dividend track record.',
  },
  BIMAS: {
    symbol: 'BIMAS',
    name: 'BİM Birleşik Mağazalar',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 485.00,
    currentYield: 3.80,
    historical3YrDivCagr: 48.0,
    historical3YrPriceCagr: 38.0,
    predictedGrowth: { conservative: 12.0, realistic: 18.0, optimistic: 24.0 },
    predictedPriceAppreciation: 18.0,
    payoutFrequency: 'Annual',
    payoutRatio: 50.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Defansif perakende lideri; enflasyondan bağımsız yüksek nakit yaratımı ve her yıl düzenli artan temettü.',
    aiRationaleEn: 'Defensive discount grocery titan with non-cyclical cash conversion and steady annual hikes.',
  },
  CCOLA: {
    symbol: 'CCOLA',
    name: 'Coca-Cola İçecek',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 68.50,
    currentYield: 3.50,
    historical3YrDivCagr: 52.0,
    historical3YrPriceCagr: 42.0,
    predictedGrowth: { conservative: 14.0, realistic: 20.0, optimistic: 27.0 },
    predictedPriceAppreciation: 20.0,
    payoutFrequency: 'Annual',
    payoutRatio: 45.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Orta Asya ve Orta Doğu operasyonlarıyla döviz bazlı büyüme. Yüksek özkaynak kârlılığı ve düzenli temettü.',
    aiRationaleEn: 'Regional beverage bottler with high FX-linked export growth and expanding dividend payouts.',
  },
  TCELL: {
    symbol: 'TCELL',
    name: 'Turkcell İletişim Hizmetleri',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 94.20,
    currentYield: 4.20,
    historical3YrDivCagr: 45.0,
    historical3YrPriceCagr: 32.0,
    predictedGrowth: { conservative: 11.0, realistic: 17.5, optimistic: 24.0 },
    predictedPriceAppreciation: 16.0,
    payoutFrequency: 'Annual',
    payoutRatio: 52.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Telekom sektörünün defansif lideri. ARPU büyümesi ve veri merkezi yatırımlarıyla öngörülebilir nakit akışı.',
    aiRationaleEn: 'Leading telecoms operator with CPI-indexed recurring subscriber revenues.',
  },
  KCHOL: {
    symbol: 'KCHOL',
    name: 'Koç Holding',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 198.50,
    currentYield: 3.60,
    historical3YrDivCagr: 55.0,
    historical3YrPriceCagr: 40.0,
    predictedGrowth: { conservative: 12.0, realistic: 18.0, optimistic: 25.0 },
    predictedPriceAppreciation: 18.0,
    payoutFrequency: 'Annual',
    payoutRatio: 35.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Tüpraş, Ford Otosan, Tofaş ve Yapı Kredi temettülerinin toplandığı ana holding; güçlü bilanço.',
    aiRationaleEn: 'Premier Turkish conglomerate receiving dividends from industrial leaders.',
  },
  SAHOL: {
    symbol: 'SAHOL',
    name: 'Sabancı Holding',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 92.40,
    currentYield: 3.40,
    historical3YrDivCagr: 44.0,
    historical3YrPriceCagr: 34.0,
    predictedGrowth: { conservative: 11.0, realistic: 17.0, optimistic: 23.0 },
    predictedPriceAppreciation: 17.0,
    payoutFrequency: 'Annual',
    payoutRatio: 30.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Enerjisa, Akbank ve Çimsa iştirakleriyle yenilenebilir enerji ve bankacılık odaklı temettü motoru.',
    aiRationaleEn: 'Conglomerate with defensive energy infrastructure and banking dividends.',
  },
  SISE: {
    symbol: 'SISE',
    name: 'Türkiye Şişe ve Cam Fabrikaları',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 42.80,
    currentYield: 3.10,
    historical3YrDivCagr: 38.0,
    historical3YrPriceCagr: 26.0,
    predictedGrowth: { conservative: 10.0, realistic: 16.0, optimistic: 22.0 },
    predictedPriceAppreciation: 15.0,
    payoutFrequency: 'Annual',
    payoutRatio: 40.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Dünyanın önde gelen cam üreticisi; döviz gelirleri ve küresel pazar payı ile düzenli temettü.',
    aiRationaleEn: 'Global glass manufacturing leader with diversified export cashflows.',
  },
  PETKM: {
    symbol: 'PETKM',
    name: 'Petkim Petrokimya',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 19.80,
    currentYield: 3.00,
    historical3YrDivCagr: 30.0,
    historical3YrPriceCagr: 20.0,
    predictedGrowth: { conservative: 8.0, realistic: 14.0, optimistic: 20.0 },
    predictedPriceAppreciation: 12.0,
    payoutFrequency: 'Annual',
    payoutRatio: 40.0,
    safetyGrade: 'B',
    aiRationaleTr: 'SOCAR entegrasyonu ile Türkiye petrokimya pazarı lideri.',
    aiRationaleEn: 'Domestic petrochemical monopoly with Star Refinery integration.',
  },
  AEFES: {
    symbol: 'AEFES',
    name: 'Anadolu Efes',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 19.40,
    currentYield: 4.20,
    historical3YrDivCagr: 46.0,
    historical3YrPriceCagr: 32.0,
    predictedGrowth: { conservative: 11.0, realistic: 17.0, optimistic: 23.0 },
    predictedPriceAppreciation: 16.0,
    payoutFrequency: 'Annual',
    payoutRatio: 48.0,
    safetyGrade: 'A',
    aiRationaleTr: 'CCI ana hissedarı ve küresel bira üreticisi; güçlü nakit üretimi.',
    aiRationaleEn: 'Beverage giant owning controlling stake in Coca-Cola Icecek.',
  },
  AGHOL: {
    symbol: 'AGHOL',
    name: 'AG Anadolu Grubu Holding',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 34.20,
    currentYield: 3.20,
    historical3YrDivCagr: 42.0,
    historical3YrPriceCagr: 35.0,
    predictedGrowth: { conservative: 10.0, realistic: 16.5, optimistic: 23.0 },
    predictedPriceAppreciation: 16.0,
    payoutFrequency: 'Annual',
    payoutRatio: 35.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Migros, Anadolu Efes ve Çelik Motor holding çatı şirketi.',
    aiRationaleEn: 'Holding company controlling Migros, Anadolu Efes, and automotive assets.',
  },
  BRSAN: {
    symbol: 'BRSAN',
    name: 'Borusan Mannesmann Boru',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 645.00,
    currentYield: 3.00,
    historical3YrDivCagr: 50.0,
    historical3YrPriceCagr: 45.0,
    predictedGrowth: { conservative: 10.0, realistic: 16.0, optimistic: 22.0 },
    predictedPriceAppreciation: 18.0,
    payoutFrequency: 'Annual',
    payoutRatio: 35.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Kuzey Amerika boru pazarı ve yenilenebilir enerji boruları ile yüksek döviz nakit akışı.',
    aiRationaleEn: 'Pipe and tubing specialist with strategic US acquisition delivering high dollar margins.',
  },
  GARAN: {
    symbol: 'GARAN',
    name: 'Garanti BBVA',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 115.00,
    currentYield: 4.50,
    historical3YrDivCagr: 40.0,
    historical3YrPriceCagr: 32.0,
    predictedGrowth: { conservative: 11.0, realistic: 17.0, optimistic: 23.0 },
    predictedPriceAppreciation: 16.0,
    payoutFrequency: 'Annual',
    payoutRatio: 30.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'BBVA iştiraki özel bankacılık lideri; rekor özkaynak kârlılığı ve düzenli temettü.',
    aiRationaleEn: 'Top-tier private banking franchise backed by BBVA with high return on tangible equity.',
  },
  ISCTR: {
    symbol: 'ISCTR',
    name: 'İş Bankası (C)',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 13.50,
    currentYield: 4.20,
    historical3YrDivCagr: 38.0,
    historical3YrPriceCagr: 30.0,
    predictedGrowth: { conservative: 10.0, realistic: 16.0, optimistic: 22.0 },
    predictedPriceAppreciation: 15.0,
    payoutFrequency: 'Annual',
    payoutRatio: 28.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Türkiye nin en büyük özel bankası; iştirak temettüleri ve yüksek karşılık oranları.',
    aiRationaleEn: 'Flagship Turkish commercial bank with extensive industrial holding participations.',
  },
  YKBNK: {
    symbol: 'YKBNK',
    name: 'Yapı ve Kredi Bankası',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 28.50,
    currentYield: 4.10,
    historical3YrDivCagr: 36.0,
    historical3YrPriceCagr: 28.0,
    predictedGrowth: { conservative: 10.0, realistic: 16.0, optimistic: 22.0 },
    predictedPriceAppreciation: 15.0,
    payoutFrequency: 'Annual',
    payoutRatio: 28.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Koç Holding iştiraki güçlü perakende bankası; artan temettü dağıtımı.',
    aiRationaleEn: 'Koc Group affiliate bank with expanding dividend payments and retail franchise.',
  },
  HALKB: {
    symbol: 'HALKB',
    name: 'Türkiye Halk Bankası',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 22.40,
    currentYield: 3.50,
    historical3YrDivCagr: 30.0,
    historical3YrPriceCagr: 24.0,
    predictedGrowth: { conservative: 8.0, realistic: 14.0, optimistic: 20.0 },
    predictedPriceAppreciation: 14.0,
    payoutFrequency: 'Annual',
    payoutRatio: 25.0,
    safetyGrade: 'B',
    aiRationaleTr: 'KOBİ finansmanının lider kamu bankası; düzenli kâr payı dağıtımı.',
    aiRationaleEn: 'State lender specialized in SME business loans.',
  },
  VAKBN: {
    symbol: 'VAKBN',
    name: 'Türkiye Vakıflar Bankası',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 24.80,
    currentYield: 3.50,
    historical3YrDivCagr: 30.0,
    historical3YrPriceCagr: 25.0,
    predictedGrowth: { conservative: 8.0, realistic: 14.0, optimistic: 20.0 },
    predictedPriceAppreciation: 14.0,
    payoutFrequency: 'Annual',
    payoutRatio: 25.0,
    safetyGrade: 'B',
    aiRationaleTr: 'Kamu bankacılığı alanında güçlü bilanço büyümesi ve kâr payı.',
    aiRationaleEn: 'Major public sector bank with strong balance sheet expansion.',
  },
  KRDMD: {
    symbol: 'KRDMD',
    name: 'Kardemir (D)',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 28.60,
    currentYield: 3.20,
    historical3YrDivCagr: 32.0,
    historical3YrPriceCagr: 22.0,
    predictedGrowth: { conservative: 8.0, realistic: 14.0, optimistic: 20.0 },
    predictedPriceAppreciation: 14.0,
    payoutFrequency: 'Annual',
    payoutRatio: 35.0,
    safetyGrade: 'B',
    aiRationaleTr: 'Demiryolu rayı ve ağır sanayi profilleri üreticisi entegre demir-çelik tesisi.',
    aiRationaleEn: 'Integrated long steel producer and sole domestic rail manufacturer.',
  },
  JEPQ: {
    symbol: 'JEPQ',
    name: 'JPMorgan Nasdaq Equity Premium Income ETF',
    market: 'US',
    currency: 'USD',
    currentPrice: 54.30,
    currentYield: 9.10,
    historical3YrDivCagr: 5.0,
    historical3YrPriceCagr: 12.0,
    predictedGrowth: { conservative: 2.0, realistic: 4.0, optimistic: 6.0 },
    predictedPriceAppreciation: 5.0,
    payoutFrequency: 'Monthly',
    payoutRatio: 88.0,
    safetyGrade: 'A',
    aiRationaleTr: 'Nasdaq-100 hisseleri üzerine yazılan opsiyon primleriyle her ay yüksek dolar bazlı temettü nakit akışı.',
    aiRationaleEn: 'High-income Nasdaq-100 covered call strategy generating monthly cash distribution.',
  },
  VNQ: {
    symbol: 'VNQ',
    name: 'Vanguard Real Estate ETF',
    market: 'US',
    currency: 'USD',
    currentPrice: 88.50,
    currentYield: 4.10,
    historical3YrDivCagr: 4.5,
    historical3YrPriceCagr: 8.0,
    predictedGrowth: { conservative: 3.5, realistic: 5.5, optimistic: 7.5 },
    predictedPriceAppreciation: 6.0,
    payoutFrequency: 'Quarterly',
    payoutRatio: 72.0,
    safetyGrade: 'A',
    aiRationaleTr: 'ABD gayrimenkul yatırım ortaklıklarının (REIT) en büyük ve en likit sepeti.',
    aiRationaleEn: 'Largest US REIT index ETF providing diversified real estate dividend yield.',
  },
  VYM: {
    symbol: 'VYM',
    name: 'Vanguard High Dividend Yield ETF',
    market: 'US',
    currency: 'USD',
    currentPrice: 128.20,
    currentYield: 2.95,
    historical3YrDivCagr: 6.0,
    historical3YrPriceCagr: 14.0,
    predictedGrowth: { conservative: 5.0, realistic: 7.2, optimistic: 9.5 },
    predictedPriceAppreciation: 8.0,
    payoutFrequency: 'Quarterly',
    payoutRatio: 55.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Yüksek temettü verimine sahip 400+ kaliteli ABD şirketi; düşük gider oranı.',
    aiRationaleEn: 'Broad high-dividend US equity basket with conservative payout security.',
  },
  PEP: {
    symbol: 'PEP',
    name: 'PepsiCo, Inc.',
    market: 'US',
    currency: 'USD',
    currentPrice: 172.40,
    currentYield: 3.20,
    historical3YrDivCagr: 7.0,
    historical3YrPriceCagr: 8.5,
    predictedGrowth: { conservative: 5.0, realistic: 7.0, optimistic: 9.0 },
    predictedPriceAppreciation: 7.0,
    payoutFrequency: 'Quarterly',
    payoutRatio: 65.0,
    safetyGrade: 'A+',
    aiRationaleTr: '52 yıldır temettüsünü artıran Dividend King; atıştırmalık ve içecek devinin sarsılmaz nakit akışı.',
    aiRationaleEn: 'Dividend King with 52 consecutive annual payout increases.',
  },
  JNJ: {
    symbol: 'JNJ',
    name: 'Johnson & Johnson',
    market: 'US',
    currency: 'USD',
    currentPrice: 162.80,
    currentYield: 3.30,
    historical3YrDivCagr: 5.8,
    historical3YrPriceCagr: 6.0,
    predictedGrowth: { conservative: 4.5, realistic: 6.0, optimistic: 7.5 },
    predictedPriceAppreciation: 6.5,
    payoutFrequency: 'Quarterly',
    payoutRatio: 60.0,
    safetyGrade: 'AAA',
    aiRationaleTr: 'AAA kredi notuna sahip küresel sağlık ve ilaç devi; 62 yıllık aralıksız temettü artışı.',
    aiRationaleEn: 'Rare AAA-rated balance sheet with 62 consecutive years of dividend hikes.',
  },
  PG: {
    symbol: 'PG',
    name: 'Procter & Gamble Company',
    market: 'US',
    currency: 'USD',
    currentPrice: 171.20,
    currentYield: 2.40,
    historical3YrDivCagr: 6.2,
    historical3YrPriceCagr: 11.0,
    predictedGrowth: { conservative: 4.5, realistic: 6.2, optimistic: 8.0 },
    predictedPriceAppreciation: 7.5,
    payoutFrequency: 'Quarterly',
    payoutRatio: 60.0,
    safetyGrade: 'A+',
    aiRationaleTr: '67 yıldır kesintisiz temettü artıran tüketim ürünleri kralı; yüksek fiyatlama gücü.',
    aiRationaleEn: 'Consumer staples powerhouse with 67 consecutive dividend growth years.',
  },
  MCD: {
    symbol: 'MCD',
    name: 'McDonalds Corporation',
    market: 'US',
    currency: 'USD',
    currentPrice: 302.50,
    currentYield: 2.30,
    historical3YrDivCagr: 8.0,
    historical3YrPriceCagr: 12.0,
    predictedGrowth: { conservative: 5.5, realistic: 7.5, optimistic: 9.5 },
    predictedPriceAppreciation: 8.0,
    payoutFrequency: 'Quarterly',
    payoutRatio: 58.0,
    safetyGrade: 'A+',
    aiRationaleTr: 'Gayrimenkul temelli küresel franchise modeli ve 47 yıllık temettü artış serisi.',
    aiRationaleEn: 'Global franchise and real estate royalty model with 47 years of dividend hikes.',
  },
};

/**
 * Universal Recognized Dividend Tickers for BIST and US
 */
export const KNOWN_DIVIDEND_LIST = Object.keys(MASTER_GROWTH_PROFILES);

/**
 * Known Estimated Dividend Schedules for Exact Month Placement in Raindrop Calendar
 */
export const KNOWN_DIVIDEND_SCHEDULES: Record<string, { exDate: string; payDate: string; month: string }> = {
  ISMEN: { exDate: '2027-03-29', payDate: '2027-04-02', month: 'March / April 2027' },
  TURSG: { exDate: '2027-05-22', payDate: '2027-05-26', month: 'May 2027' },
  TRGYO: { exDate: '2027-06-18', payDate: '2027-06-22', month: 'June 2027' },
  EKGYO: { exDate: '2027-05-15', payDate: '2027-05-19', month: 'May 2027' },
  ISGYO: { exDate: '2027-04-12', payDate: '2027-04-16', month: 'April 2027' },
  ALGYO: { exDate: '2027-05-08', payDate: '2027-05-12', month: 'May 2027' },
  OZKGY: { exDate: '2027-06-10', payDate: '2027-06-14', month: 'June 2027' },
  RYGYO: { exDate: '2027-07-15', payDate: '2027-07-19', month: 'July 2027' },
  FROTO: { exDate: '2027-03-27', payDate: '2027-03-31', month: 'March 2027' },
  TUPRS: { exDate: '2027-03-28', payDate: '2027-04-01', month: 'March / April 2027' },
  TTRAK: { exDate: '2027-03-25', payDate: '2027-03-29', month: 'March 2027' },
  TOASO: { exDate: '2027-04-04', payDate: '2027-04-08', month: 'April 2027' },
  EREGL: { exDate: '2027-04-16', payDate: '2027-04-20', month: 'April 2027' },
  BIMAS: { exDate: '2027-05-18', payDate: '2027-05-22', month: 'May 2027' },
  CCOLA: { exDate: '2027-05-27', payDate: '2027-05-31', month: 'May 2027' },
  TCELL: { exDate: '2027-06-25', payDate: '2027-06-29', month: 'June 2027' },
  KCHOL: { exDate: '2027-04-24', payDate: '2027-04-28', month: 'April 2027' },
  SAHOL: { exDate: '2027-04-28', payDate: '2027-05-02', month: 'April / May 2027' },
  SISE: { exDate: '2027-05-30', payDate: '2027-06-03', month: 'May / June 2027' },
  PETKM: { exDate: '2027-06-05', payDate: '2027-06-09', month: 'June 2027' },
  AEFES: { exDate: '2027-05-24', payDate: '2027-05-28', month: 'May 2027' },
  AGHOL: { exDate: '2027-05-28', payDate: '2027-06-01', month: 'May / June 2027' },
  BRSAN: { exDate: '2027-04-22', payDate: '2027-04-26', month: 'April 2027' },
  GARAN: { exDate: '2027-03-27', payDate: '2027-03-31', month: 'March 2027' },
  ISCTR: { exDate: '2027-03-30', payDate: '2027-04-03', month: 'March / April 2027' },
  YKBNK: { exDate: '2027-03-29', payDate: '2027-04-02', month: 'March / April 2027' },
  HALKB: { exDate: '2027-04-10', payDate: '2027-04-14', month: 'April 2027' },
  VAKBN: { exDate: '2027-04-12', payDate: '2027-04-16', month: 'April 2027' },
  KRDMD: { exDate: '2027-06-20', payDate: '2027-06-24', month: 'June 2027' },
  AKBNK: { exDate: '2027-03-26', payDate: '2027-03-30', month: 'March 2027' },
  O: { exDate: '2026-10-31', payDate: '2026-11-15', month: 'Monthly' },
  JEPI: { exDate: '2026-10-31', payDate: '2026-11-06', month: 'Monthly' },
  JEPQ: { exDate: '2026-10-31', payDate: '2026-11-06', month: 'Monthly' },
  VICI: { exDate: '2026-12-18', payDate: '2027-01-08', month: 'January 2027' },
  SCHD: { exDate: '2026-12-10', payDate: '2026-12-15', month: 'December 2026' },
  VOO: { exDate: '2026-12-20', payDate: '2026-12-27', month: 'December 2026' },
  VNQ: { exDate: '2026-12-22', payDate: '2026-12-29', month: 'December 2026' },
  VYM: { exDate: '2026-12-18', payDate: '2026-12-24', month: 'December 2026' },
  KO: { exDate: '2026-11-28', payDate: '2026-12-15', month: 'December 2026' },
  PEP: { exDate: '2026-12-04', payDate: '2027-01-06', month: 'January 2027' },
  JNJ: { exDate: '2026-11-18', payDate: '2026-12-08', month: 'December 2026' },
  PG: { exDate: '2026-10-17', payDate: '2026-11-15', month: 'November 2026' },
  MCD: { exDate: '2026-11-29', payDate: '2026-12-15', month: 'December 2026' },
};

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

    // Check Milestone: Covers monthly expense ($100 or ₺4,500)
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
    historical3YrCagr: 84.6,
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
    historical3YrCagr: 55.7,
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
    historical3YrCagr: 5.5,
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
    historical3YrCagr: 5.6,
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
    historical3YrCagr: 7.0,
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
    historical3YrCagr: 91.5,
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
    historical3YrCagr: 60.7,
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
    historical3YrCagr: 5.0,
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
  {
    symbol: 'EKGYO',
    name: 'Emlak Konut GYO',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 13.80,
    dividendYield: 4.80,
    payoutFrequency: 'Annual',
    safetyRating: 'A',
    payoutRatio: 45.0,
    historical3YrCagr: 28.5,
    projected5YrYoC: 8.2,
    sector: 'BIST GYO (Konut & Kentsel Dönüşüm)',
    thesisTr: 'Türkiye gayrimenkul sektörünün amiral gemisi. Kentsel dönüşüm ve TOKİ projeleri katalizörü, %0 stopaj avantajı.',
    thesisEn: 'Flagship Turkish REIT benchmark with government-backed urban renewal pipeline and 0% withholding tax advantage.',
  },
  {
    symbol: 'TRGYO',
    name: 'Torunlar GYO',
    market: 'BIST',
    currency: 'TRY',
    currentPrice: 58.20,
    dividendYield: 5.40,
    payoutFrequency: 'Annual',
    safetyRating: 'A',
    payoutRatio: 50.0,
    historical3YrCagr: 34.0,
    projected5YrYoC: 9.5,
    sector: 'BIST GYO (Ticari & AVM Portföyü)',
    thesisTr: 'Mall of Istanbul ve prime ofis kuleleri ile yüksek döviz/TL kira nakit akışı. Net Aktif Değerine (NAD) göre yüksek iskonto.',
    thesisEn: 'Premier commercial real estate operator with strong recurring rental yields, prime office assets, and substantial NAV discount.',
  },
];

/**
 * Automatically synchronizes and derives DividendAsset items from the user's live Portfolio holdings.
 * Keeps dividend cashflow, upcoming schedules, and annual payout metrics 100% in sync with portfolio trades.
 */
export function deriveDividendsFromPortfolio(
  portfolioList: Array<{
    symbol: string;
    name?: string;
    shares: number;
    entryPrice: number;
    currentPrice: number;
    currency?: string;
    market?: string;
    isDividend?: boolean;
    strategyType?: string;
  }>,
  existingDivs: Array<{
    symbol: string;
    name: string;
    shares: number;
    currentPrice: number;
    entryPrice: number;
    currency: string;
    dividendYield: number;
    yieldOnCost: number;
    annualPayout: number;
    monthlyPayout: number;
    payoutRatio: number;
    safetyRating: 'A' | 'B' | 'C';
    frequency: string;
    nextExDate?: string;
    nextPaymentDate?: string;
    estimatedNextDPS?: number;
    estimatedNextPayout?: number;
    payoutMonth?: string;
    paymentStatus?: 'Estimated' | 'Confirmed';
  }> = []
) {
  const existingMap = new Map<string, (typeof existingDivs)[0]>();
  for (const d of existingDivs) {
    existingMap.set(d.symbol.replace('.IS', '').trim().toUpperCase(), d);
  }

  const result: typeof existingDivs = [];

  for (const pos of portfolioList) {
    if (pos.shares <= 0) continue;
    const cleanSym = pos.symbol.replace('.IS', '').trim().toUpperCase();
    const growthProfile = MASTER_GROWTH_PROFILES[cleanSym];
    const existing = existingMap.get(cleanSym);

    // Check if asset is a dividend holding:
    // Exclude ONLY if explicitly flagged as an intentional swing trade with no dividend preference
    const isExplicitSwing = pos.isDividend === false && pos.strategyType === 'SWING';
    if (isExplicitSwing) {
      continue;
    }

    const isDivAsset = Boolean(
      pos.isDividend === true ||
      pos.strategyType === 'CORE_DIVIDEND' ||
      existing ||
      (growthProfile && growthProfile.currentYield > 0)
    );

    if (!isDivAsset) continue;

    const effectivePrice = pos.currentPrice > 0 ? pos.currentPrice : (pos.entryPrice > 0 ? pos.entryPrice : (growthProfile?.currentPrice || 50));
    const divYield = growthProfile?.currentYield || existing?.dividendYield || 5.0;
    const yoc = pos.entryPrice > 0 ? (effectivePrice * divYield) / pos.entryPrice : divYield;
    const annualPayout = (pos.shares * effectivePrice * divYield) / 100;
    const monthlyPayout = annualPayout / 12;

    const frequency = growthProfile?.payoutFrequency || existing?.frequency || (pos.market === 'US' ? 'Quarterly' : 'Annual');
    const payoutRatio = growthProfile?.payoutRatio || existing?.payoutRatio || 50.0;
    const safetyRating = (growthProfile?.safetyGrade?.charAt(0) || existing?.safetyRating || 'A') as 'A' | 'B' | 'C';

    const freqDiv = frequency === 'Monthly' ? 12 : frequency === 'Quarterly' ? 4 : frequency === 'Semi-Annual' ? 2 : 1;
    const estimatedDPS = existing?.estimatedNextDPS || Number(((effectivePrice * (divYield / 100)) / freqDiv).toFixed(4));
    const estimatedNextPayout = Number((pos.shares * estimatedDPS).toFixed(2));

    const sched = KNOWN_DIVIDEND_SCHEDULES[cleanSym];
    const nextExDate = existing?.nextExDate || sched?.exDate || (pos.market === 'US' ? '2026-11-15' : '2027-04-15');
    const nextPaymentDate = existing?.nextPaymentDate || sched?.payDate || (pos.market === 'US' ? '2026-11-30' : '2027-04-20');
    const payoutMonth = existing?.payoutMonth || sched?.month || (pos.market === 'US' ? 'November 2026' : 'April 2027');

    result.push({
      symbol: cleanSym,
      name: pos.name || cleanSym,
      shares: pos.shares,
      entryPrice: pos.entryPrice,
      currentPrice: effectivePrice,
      currency: pos.currency || (pos.market === 'US' ? 'USD' : 'TRY'),
      dividendYield: divYield,
      yieldOnCost: Number(yoc.toFixed(2)),
      annualPayout: Number(annualPayout.toFixed(2)),
      monthlyPayout: Number(monthlyPayout.toFixed(2)),
      payoutRatio: payoutRatio,
      safetyRating: safetyRating,
      frequency: frequency,
      nextExDate: nextExDate,
      nextPaymentDate: nextPaymentDate,
      estimatedNextDPS: estimatedDPS,
      estimatedNextPayout: estimatedNextPayout,
      payoutMonth: payoutMonth,
      paymentStatus: existing?.paymentStatus || 'Estimated'
    });
  }

  return result;
}

