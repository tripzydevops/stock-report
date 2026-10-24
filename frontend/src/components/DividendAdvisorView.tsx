'use client';

import React, { useState, useMemo } from 'react';
import { DividendAsset } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';

interface DividendAdvisorViewProps {
  dividendAssets: DividendAsset[];
  usdTryRate: number;
  onSelectTicker?: (symbol: string) => void;
  onOpenLabWithStrategy?: (strategy: 'MONTHLY_SMOOTH' | 'MAX_CASHFLOW' | 'DEFENSIVE_ARISTOCRATS') => void;
}

export type DividendSectorKey =
  | 'BANKING'
  | 'REIT'
  | 'FINANCIALS'
  | 'CONSUMER'
  | 'AUTOMOTIVE_INDUSTRIAL'
  | 'HOLDINGS_ENERGY_TELECOM'
  | 'GLOBAL_ETFS';

export interface SectorStockComparison {
  symbol: string;
  name: string;
  market: 'BIST' | 'US';
  currency: 'TRY' | 'USD';
  currentPrice: number;
  yieldPercent: number;
  divCagr3Yr: number;
  payoutRatio: number;
  safetyGrade: 'AAA' | 'AA' | 'A+' | 'A' | 'B+' | 'B';
  frequency: string;
  suitability: 'Best-in-Class' | 'Solid Core' | 'Defensive' | 'Cyclical' | 'Avoid';
  moat: string;
  advisorVerdictTr: string;
  advisorVerdictEn: string;
  userShares: number;
}

export interface SectorDefinition {
  key: DividendSectorKey;
  icon: string;
  nameTr: string;
  nameEn: string;
  shortDescTr: string;
  shortDescEn: string;
  bestPickSymbol: string;
  advisorInsightTr: string;
  advisorInsightEn: string;
  taxNoteTr: string;
  taxNoteEn: string;
  stocks: SectorStockComparison[];
}

export default function DividendAdvisorView({
  dividendAssets,
  usdTryRate,
  onSelectTicker,
  onOpenLabWithStrategy,
}: DividendAdvisorViewProps) {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'overview' | 'sector_showdown' | 'actions' | 'chat'>('sector_showdown');
  const [selectedSector, setSelectedSector] = useState<DividendSectorKey>('BANKING');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'advisor'; text: string; time: string }>>([
    {
      sender: 'advisor',
      text: language === 'tr'
        ? 'Merhaba! Portföyünüzdeki tüm temettü hisselerini sektör sektör (Bankacılık, GYO, Finans, Tüketim, Sanayi/Otomotiv, Holding/Telekom ve Global ETF\'ler) denetledim. İstediğiniz sektörü seçerek o sektörün en iyi hisselerini, hangisinin diğerinden daha kârlı olduğunu ve önerilen takasları anında görebilirsiniz.'
        : 'Hello! I have audited your dividend holdings across all economic sectors (Banking, REITs, Financials, Consumer, Automotive/Industrial, Holdings/Telecom, and Global ETFs). Select any sector to review best-in-class champions, peer showdowns, and actionable rebalancing swaps.',
      time: '15:45'
    }
  ]);
  const [userQuery, setUserQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Map user shares for fast lookup
  const userHoldingMap = useMemo(() => {
    const map = new Map<string, DividendAsset>();
    for (const d of dividendAssets) {
      map.set(d.symbol.replace('.IS', '').toUpperCase(), d);
    }
    return map;
  }, [dividendAssets]);

  // Total Portfolio Metrics
  const totalAnnualTRY = useMemo(() => {
    return dividendAssets.reduce((acc, item) => {
      return acc + (item.currency === 'USD' ? item.annualPayout * usdTryRate : item.annualPayout);
    }, 0);
  }, [dividendAssets, usdTryRate]);

  const totalMonthlyTRY = totalAnnualTRY / 12;

  // Complete Sectoral Master Catalog
  const sectorCatalog = useMemo<Record<DividendSectorKey, SectorDefinition>>(() => {
    return {
      BANKING: {
        key: 'BANKING',
        icon: '🏛️',
        nameTr: 'Bankacılık Sektörü',
        nameEn: 'Banking Sector',
        shortDescTr: 'Mevduat marjları, sermaye yeterliliği (CAR) ve kredi kalitesi',
        shortDescEn: 'Net interest margins, capital adequacy (CAR), and loan loss reserves',
        bestPickSymbol: 'AKBNK',
        advisorInsightTr: 'Özel Tier-1 bankalar (AKBNK, GARAN) kamu bankalarına (HALKB, VAKBN) kıyasla yaklaşık 2 kat daha yüksek özkaynak kârlılığı (ROE %34 vs %18) üretir ve kârının %25-35\'ini nakit temettü olarak öder. Kamu bankalarında kâr sermayeye eklenir, temettü verimi çok düşüktür (%1.2).',
        advisorInsightEn: 'Private Tier-1 banks (AKBNK, GARAN) deliver nearly double the return on equity (ROE 34% vs 18%) of state banks (HALKB, VAKBN) and maintain disciplined 25-35% cash payout ratios. State banks retain earnings for policy lending with negligible payouts (~1.2%).',
        taxNoteTr: 'Standart %10 temettü stopajı uygulanır.',
        taxNoteEn: 'Standard 10% dividend withholding tax applies.',
        stocks: [
          {
            symbol: 'AKBNK',
            name: 'Akbank T.A.Ş.',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 66.90,
            yieldPercent: 4.73,
            divCagr3Yr: 35.0,
            payoutRatio: 28.5,
            safetyGrade: 'A',
            frequency: 'Yıllık (Mart)',
            suitability: 'Best-in-Class',
            moat: 'CAR %19.4 ile BIST\'in en yüksek sermaye tamponu, tertemiz NPL (%1.6)',
            advisorVerdictTr: 'Sektörün en sağlam bilançosu. Yabancı kurumsal akışların ilk tercihi; sürdürülebilir nakit temettü gücü.',
            advisorVerdictEn: 'Fortress balance sheet with sector-highest 19.4% CAR. Primary vehicle for institutional dividend investors.',
            userShares: userHoldingMap.get('AKBNK')?.shares || 35,
          },
          {
            symbol: 'GARAN',
            name: 'Garanti BBVA',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 115.00,
            yieldPercent: 4.50,
            divCagr3Yr: 40.0,
            payoutRatio: 30.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Mart)',
            suitability: 'Best-in-Class',
            moat: 'BBVA desteği, BIST banka rekoru özkaynak kârlılığı (ROE %37.1)',
            advisorVerdictTr: 'Dijitalleşme ve kârlılık lideri. Düşük takipteki kredi oranı ve düzenli kâr payı.',
            advisorVerdictEn: 'Leader in digital efficiency and tangibles ROE (37.1%). Consistent payout record backed by BBVA.',
            userShares: userHoldingMap.get('GARAN')?.shares || 0,
          },
          {
            symbol: 'YKBNK',
            name: 'Yapı ve Kredi Bankası',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 28.50,
            yieldPercent: 4.10,
            divCagr3Yr: 36.0,
            payoutRatio: 28.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Mart)',
            suitability: 'Solid Core',
            moat: 'Koç Holding kurumsal çatısı, perakende & kredi kartı hacim gücü',
            advisorVerdictTr: 'Koç Grubu güvencesiyle sağlam perakende kârlılığı. AKBNK ile birlikte güvenle tutulabilir.',
            advisorVerdictEn: 'Strong retail and credit card presence under Koç Holding umbrella. Dependable dividend supplement.',
            userShares: userHoldingMap.get('YKBNK')?.shares || 26,
          },
          {
            symbol: 'ISCTR',
            name: 'İş Bankası (C)',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 13.50,
            yieldPercent: 4.20,
            divCagr3Yr: 38.0,
            payoutRatio: 28.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Mart)',
            suitability: 'Solid Core',
            moat: 'Türkiye\'nin en büyük özel bankası; dev sanayi iştirak temettüleri',
            advisorVerdictTr: 'Şişecam ve İş Yatırım gibi sanayi devlerinden gelen temettülerle beslenen muazzam bilanço.',
            advisorVerdictEn: 'Flagship commercial institution with diversified non-banking holding cash distributions.',
            userShares: userHoldingMap.get('ISCTR')?.shares || 0,
          },
          {
            symbol: 'HALKB',
            name: 'Türkiye Halk Bankası',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 22.40,
            yieldPercent: 1.20,
            divCagr3Yr: 30.0,
            payoutRatio: 15.0,
            safetyGrade: 'B',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Avoid',
            moat: 'KOBİ görev kredileri, ABD mahkeme süreci hukuki belirsizliği',
            advisorVerdictTr: 'Kamu sübvansiyonlu kredileri kâr marjını baskılıyor. Kâr temettü olarak dağıtılmıyor. Takas önerilir.',
            advisorVerdictEn: 'Subsidized loan burdens and US judicial overhang depress margins. Historically pays negligible cash dividends.',
            userShares: userHoldingMap.get('HALKB')?.shares || 21,
          },
          {
            symbol: 'VAKBN',
            name: 'Türkiye Vakıflar Bankası',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 24.80,
            yieldPercent: 1.40,
            divCagr3Yr: 30.0,
            payoutRatio: 15.0,
            safetyGrade: 'B',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Avoid',
            moat: 'Kamu altyapı finansman yükü, Hazine sermaye takviyesi ihtiyacı',
            advisorVerdictTr: 'Kârını hissedara dağıtmak yerine sermayeye eklemek zorunda. Temettü portföyü için verimsizdir.',
            advisorVerdictEn: 'Mandated to finance state infrastructure and retain earnings. Suboptimal for income-seeking portfolios.',
            userShares: userHoldingMap.get('VAKBN')?.shares || 29,
          },
        ]
      },

      REIT: {
        key: 'REIT',
        icon: '🏢',
        nameTr: 'Gayrimenkul / GYO (BIST & US)',
        nameEn: 'Real Estate Investment Trusts (REITs)',
        shortDescTr: 'TÜFE endeksli kira akışı ve BIST GYO\'lara özel %0 Stopaj Vergi Avantajı',
        shortDescEn: 'CPI-indexed commercial rents and 0% withholding tax advantage in Turkey',
        bestPickSymbol: 'TRGYO',
        advisorInsightTr: 'BIST GYO hisselerinin EN BÜYÜK AVANTAJI %0 STOPAJDIR (sıfır vergi). Sanayi hisselerinden %10 vergi kesilirken, Torunlar GYO (TRGYO) gibi GYO\'larda dağıtılan nakdin %100\'ü cebinize kalır. Mall of Istanbul ve prime ticari kiralar enflasyon kalkanıdır.',
        advisorInsightEn: 'The single biggest advantage of Turkish REITs is the 0% WITHHOLDING TAX. Unlike industrial stocks which suffer a 10% tax haircut, Torunlar GYO (TRGYO) distributions pass 100% net into your account.',
        taxNoteTr: '💎 BIST GYO Temettülerinde STOPAJ ORANI %0\'DIR (Vergiden Muaf)',
        taxNoteEn: '💎 Turkish REITs enjoy 0% dividend withholding tax (Tax-Free)',
        stocks: [
          {
            symbol: 'TRGYO',
            name: 'Torunlar GYO',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 86.70,
            yieldPercent: 5.20,
            divCagr3Yr: 42.5,
            payoutRatio: 52.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Mayıs)',
            suitability: 'Best-in-Class',
            moat: 'Mall of Istanbul, Torun Center, prime ticari portföy, %0 stopaj',
            advisorVerdictTr: 'Sektörün temettü kralı. Döviz ve TÜFE bazlı kira gelirleri enflasyona karşı en güçlü nakit kalkanıdır.',
            advisorVerdictEn: 'Flagship commercial REIT anchored by Mall of Istanbul. 0% tax + robust inflation-indexed cashflows.',
            userShares: userHoldingMap.get('TRGYO')?.shares || 15,
          },
          {
            symbol: 'EKGYO',
            name: 'Emlak Konut GYO',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 13.80,
            yieldPercent: 4.80,
            divCagr3Yr: 35.0,
            payoutRatio: 48.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Mayıs)',
            suitability: 'Solid Core',
            moat: 'Türkiye konut sektörünün amiral gemisi, arsa portföyü ve gelir paylaşımı',
            advisorVerdictTr: 'Devlet destekli dev master projeler ve düzenli kâr payı. Konut satış döngüsüne duyarlıdır.',
            advisorVerdictEn: 'Sovereign-backed residential mega-developer with consistent distribution history.',
            userShares: userHoldingMap.get('EKGYO')?.shares || 0,
          },
          {
            symbol: 'ISGYO',
            name: 'İş GYO',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 18.20,
            yieldPercent: 5.10,
            divCagr3Yr: 38.0,
            payoutRatio: 50.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Solid Core',
            moat: 'Kanyon AVM ortaklığı, prime ofis kuleleri, İş Bankası güvencesi',
            advisorVerdictTr: 'Kurumsal kiracılardan düzenli nakit akışı sağlayan dengeli ve defansif GYO.',
            advisorVerdictEn: 'Blue-chip commercial tenant base with reliable rental cash conversion.',
            userShares: userHoldingMap.get('ISGYO')?.shares || 0,
          },
          {
            symbol: 'ALGYO',
            name: 'Alarko GYO',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 48.60,
            yieldPercent: 5.60,
            divCagr3Yr: 45.0,
            payoutRatio: 54.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Mayıs)',
            suitability: 'Defensive',
            moat: 'Sıfır borç, yüksek net nakit, Hillside otelleri döviz geliri',
            advisorVerdictTr: 'Net nakit zengini, turizm sezonunda dövizle kazanan ve yüksek temettü ödeyen defansif kale.',
            advisorVerdictEn: 'Debt-free balance sheet with hard-currency luxury resort cashflows.',
            userShares: userHoldingMap.get('ALGYO')?.shares || 0,
          },
          {
            symbol: 'O',
            name: 'Realty Income Corp',
            market: 'US',
            currency: 'USD',
            currentPrice: 55.55,
            yieldPercent: 5.40,
            divCagr3Yr: 5.5,
            payoutRatio: 74.5,
            safetyGrade: 'A',
            frequency: 'Her Ay (Aylık)',
            suitability: 'Best-in-Class',
            moat: '650+ kesintisiz aylık temettü, Fortune 500 triple-net kiracılar',
            advisorVerdictTr: '"The Monthly Dividend Company"®. Her ay düzenli dolar bazlı temettü öder, portföyün yaz boşluğunu kapatır.',
            advisorVerdictEn: 'S&P 500 Dividend Aristocrat distributing monthly checks backed by long-term corporate leases.',
            userShares: userHoldingMap.get('O')?.shares || 0,
          },
          {
            symbol: 'VICI',
            name: 'VICI Properties Inc.',
            market: 'US',
            currency: 'USD',
            currentPrice: 32.46,
            yieldPercent: 5.35,
            divCagr3Yr: 5.6,
            payoutRatio: 68.0,
            safetyGrade: 'A',
            frequency: 'Çeyreklik (Oca/Nis/Tem/Eki)',
            suitability: 'Solid Core',
            moat: 'Las Vegas Strip Caesars & MGM mülkleri, %100 tahsilat oranı',
            advisorVerdictTr: 'Dünyanın en ikonik eğlence gayrimenkullerinin sahibi; enflasyona endeksli sözleşmelerle %5.35 verim.',
            advisorVerdictEn: 'Experiential gaming REIT with pristine rent collection and CPI-adjusted multi-decade contracts.',
            userShares: userHoldingMap.get('VICI')?.shares || 0,
          },
        ]
      },

      FINANCIALS: {
        key: 'FINANCIALS',
        icon: '📈',
        nameTr: 'Aracı Kurum & Sigortacılık',
        nameEn: 'Capital Markets & Insurance',
        shortDescTr: 'Borsa hacim gelirleri ve yüksek faiz ortamında devasa float getirisi',
        shortDescEn: 'Trading volume monopolies and massive investment float earnings',
        bestPickSymbol: 'ISMEN',
        advisorInsightTr: 'ISMEN ve TURSG, portföyünüzün EN YÜKSEK NAKİT GETİRİLİ temettü motorlarıdır. İş Yatırım (%8.55 verim) borsa hacimlerinden kâr üretirken, Türkiye Sigorta (%7.09 verim) yüksek faiz ortamındaki dev prim rezervlerini değerlendirerek rekor temettü öder.',
        advisorInsightEn: 'ISMEN and TURSG are the highest-yielding cash engines in your portfolio. ISMEN captures trading commission spreads with zero debt, while TURSG leverages massive insurance float yields.',
        taxNoteTr: '%10 Stopaj kesilir.',
        taxNoteEn: 'Standard 10% withholding tax applies.',
        stocks: [
          {
            symbol: 'ISMEN',
            name: 'İş Yatırım Menkul Değerler',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 28.78,
            yieldPercent: 8.55,
            divCagr3Yr: 84.6,
            payoutRatio: 58.4,
            safetyGrade: 'A',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Best-in-Class',
            moat: 'BIST işlem hacmi pazar payı tekeli, kredili işlem marjları, sıfır borç',
            advisorVerdictTr: 'BIST\'in temettü şampiyonu. Rekor özkaynak kârlılığı (%50+) ve %8.55 cari verim ile nakit akışının kalbidir.',
            advisorVerdictEn: 'Unrivaled brokerage volume leader delivering exceptional 8.55% current yield and +80% historical CAGR.',
            userShares: userHoldingMap.get('ISMEN')?.shares || 258,
          },
          {
            symbol: 'TURSG',
            name: 'Türkiye Sigorta',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 5.15,
            yieldPercent: 7.09,
            divCagr3Yr: 55.7,
            payoutRatio: 52.1,
            safetyGrade: 'A',
            frequency: 'Yıllık (Ağustos)',
            suitability: 'Best-in-Class',
            moat: 'Pazar payı lideri, yüksek faizle katlanan devasa yatırım portföyü',
            advisorVerdictTr: 'Sigorta prim rezervlerini yüksek faizle işleterek muazzam kâr payı üretir. Ağustos ayında ödeme yaparak yazı dengeler.',
            advisorVerdictEn: 'Dominant underwriter generating high investment income from current policy rate environment.',
            userShares: userHoldingMap.get('TURSG')?.shares || 1771,
          },
        ]
      },

      CONSUMER: {
        key: 'CONSUMER',
        icon: '🛒',
        nameTr: 'Tüketim, Perakende & İçecek',
        nameEn: 'Consumer Staples & Retail',
        shortDescTr: 'Enflasyondan bağımsız günlük tüketim, dövizli ihracat ve 3 taksitli temettü',
        shortDescEn: 'Non-cyclical staple grocery demand, export FX revenue, and multi-tranche payouts',
        bestPickSymbol: 'BIMAS',
        advisorInsightTr: 'BİM (BIMAS), Türkiye\'de temettüsünü YILDA 3 TAKSİTLE (Haziran, Eylül, Aralık) ödeyen nadir defansif devlerdendir. Coca-Cola İçecek (CCOLA) ise Orta Asya operasyonları ile döviz bazlı büyür. Enflasyon dönemlerinde fiyatlama gücü en yüksek sektördür.',
        advisorInsightEn: 'BİM (BIMAS) is a rare defensive titan that distributes dividends in 3 TRANCHES (June, Sept, Dec), providing recurring quarterly cash. CCOLA delivers hard-currency international growth across Central Asia.',
        taxNoteTr: '%10 Stopaj kesilir.',
        taxNoteEn: 'Standard 10% withholding tax applies.',
        stocks: [
          {
            symbol: 'BIMAS',
            name: 'BİM Birleşik Mağazalar',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 485.00,
            yieldPercent: 3.80,
            divCagr3Yr: 48.0,
            payoutRatio: 50.0,
            safetyGrade: 'A+',
            frequency: 'Yılda 3 Taksit (Haz/Eyl/Ara)',
            suitability: 'Best-in-Class',
            moat: 'İndirimli market tekeli, negatif işletme sermayesi, enflasyon kalkanı',
            advisorVerdictTr: '3 taksitli ödeme takvimiyle nakit akışını yıl içine yayar. Son taksiti 18 Aralık 2026\'da kesinleşmiştir.',
            advisorVerdictEn: '3-tranche annual distribution smooths portfolio cash flow. December 2026 tranche officially confirmed.',
            userShares: userHoldingMap.get('BIMAS')?.shares || 6,
          },
          {
            symbol: 'CCOLA',
            name: 'Coca-Cola İçecek',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 68.50,
            yieldPercent: 3.50,
            divCagr3Yr: 52.0,
            payoutRatio: 45.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Mayıs)',
            suitability: 'Best-in-Class',
            moat: 'Orta Asya ve Orta Doğu şişeleme tekeli, döviz bazlı kâr büyümesi',
            advisorVerdictTr: 'Yüksek büyüme ve defansif nakit akışı dengesi. Düşük dağıtım oranı temettünün rahatça artmasını sağlar.',
            advisorVerdictEn: 'Premier beverage bottler with rapid volume growth in emerging territories and conservative payout ratio.',
            userShares: userHoldingMap.get('CCOLA')?.shares || 33,
          },
          {
            symbol: 'AEFES',
            name: 'Anadolu Efes',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 19.40,
            yieldPercent: 4.20,
            divCagr3Yr: 46.0,
            payoutRatio: 48.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Mayıs)',
            suitability: 'Solid Core',
            moat: 'CCI\'nin %50 kontrol gücü, küresel bira üreticisi',
            advisorVerdictTr: 'Coca-Cola İçecek\'in ana hissedarı. Yüksek temettü verimi ve uluslararası nakit üretimi.',
            advisorVerdictEn: 'Holding company controlling Coca-Cola İçecek with robust direct operational cashflows.',
            userShares: userHoldingMap.get('AEFES')?.shares || 53,
          },
          {
            symbol: 'KO',
            name: 'The Coca-Cola Company',
            market: 'US',
            currency: 'USD',
            currentPrice: 68.50,
            yieldPercent: 3.10,
            divCagr3Yr: 5.0,
            payoutRatio: 68.0,
            safetyGrade: 'A+',
            frequency: 'Çeyreklik (Her Çeyrek)',
            suitability: 'Best-in-Class',
            moat: '62 yıldır aralıksız temettü artıran Dividend King, sarsılmaz dağıtım',
            advisorVerdictTr: 'Küresel marka gücü. Aralık 2026 ödemesi kesinleşti. Dolar bazlı güvenli liman.',
            advisorVerdictEn: '62-year Dividend King with bulletproof global pricing power. December 2026 payout confirmed.',
            userShares: userHoldingMap.get('KO')?.shares || 0,
          },
          {
            symbol: 'PEP',
            name: 'PepsiCo, Inc.',
            market: 'US',
            currency: 'USD',
            currentPrice: 172.40,
            yieldPercent: 3.20,
            divCagr3Yr: 7.0,
            payoutRatio: 65.0,
            safetyGrade: 'A+',
            frequency: 'Çeyreklik (Her Çeyrek)',
            suitability: 'Solid Core',
            moat: 'Frito-Lay atıştırmalık liderliği ve 52 yıllık temettü artışı',
            advisorVerdictTr: 'Atıştırmalık ve içecek dengesi sayesinde resesyonlarda bile temettüsünü artırabilen efsane.',
            advisorVerdictEn: 'Snack and beverage diversification provides non-cyclical distribution increases.',
            userShares: userHoldingMap.get('PEP')?.shares || 0,
          },
        ]
      },

      AUTOMOTIVE_INDUSTRIAL: {
        key: 'AUTOMOTIVE_INDUSTRIAL',
        icon: '🏭',
        nameTr: 'Otomotiv, Sanayi & Çelik',
        nameEn: 'Automotive & Heavy Industry',
        shortDescTr: 'İhracat gelirleri, yüksek kâr payı geleneği ve sanayi döngüsü',
        shortDescEn: 'Hard-currency export sales, high historic payout culture, and cyclical steel upside',
        bestPickSymbol: 'TTRAK',
        advisorInsightTr: 'Türk Traktör (TTRAK) ve Ford Otosan (FROTO), kârlarının %65-75\'ini doğrudan nakit temettü olarak dağıtan kurumsal BIST şampiyonlarıdır. Buna karşılık Borusan Boru (BRSAN) ve Kardemir (KRDMD) gibi hisselerde temettü verimi daha düşük ve döngüseldir.',
        advisorInsightEn: 'Türk Traktör (TTRAK) and Ford Otosan (FROTO) distribute 65-75% of profits as cash dividends. In contrast, Borusan (BRSAN) yields only ~3%, making it a capital-growth asset rather than a pure income engine.',
        taxNoteTr: '%10 Stopaj kesilir.',
        taxNoteEn: 'Standard 10% withholding tax applies.',
        stocks: [
          {
            symbol: 'TTRAK',
            name: 'Türk Traktör',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 780.00,
            yieldPercent: 7.80,
            divCagr3Yr: 72.0,
            payoutRatio: 75.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Mart)',
            suitability: 'Best-in-Class',
            moat: 'Pazar payı %50+ tarım makineleri tekeli, Koç Grubu temettü disiplini',
            advisorVerdictTr: 'BIST\'in temettü kralı. Yüksek nakit dönüşümü ve kârının neredeyse tamamını dağıtma geleneği.',
            advisorVerdictEn: 'Dominant tractor manufacturer with industry-leading ROIC and 7.8% dividend yield.',
            userShares: userHoldingMap.get('TTRAK')?.shares || 0,
          },
          {
            symbol: 'FROTO',
            name: 'Ford Otosan',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 1045.00,
            yieldPercent: 6.20,
            divCagr3Yr: 65.0,
            payoutRatio: 60.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Mart)',
            suitability: 'Best-in-Class',
            moat: 'Ford Custom ve Transit Avrupa ihracat tekeli, Euro bazlı doğal döviz kalkanı',
            advisorVerdictTr: 'Elektrikli ticari araç dönüşümü ve Romanya fabrikasıyla döviz bazlı temettü makinesi.',
            advisorVerdictEn: 'Commercial vehicle export titan providing organic Euro currency protection.',
            userShares: userHoldingMap.get('FROTO')?.shares || 0,
          },
          {
            symbol: 'TOASO',
            name: 'Tofaş Türk Otomobil Fab.',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 228.00,
            yieldPercent: 6.40,
            divCagr3Yr: 62.0,
            payoutRatio: 68.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Solid Core',
            moat: 'Stellantis Türkiye entegrasyonu, yüksek kâr payı',
            advisorVerdictTr: 'Stellantis anlaşmasıyla yeni model hatları ve cömert nakit temettü geleneği.',
            advisorVerdictEn: 'Strategic partner for Stellantis with strong domestic distribution and cash generation.',
            userShares: userHoldingMap.get('TOASO')?.shares || 0,
          },
          {
            symbol: 'EREGL',
            name: 'Ereğli Demir ve Çelik',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 47.80,
            yieldPercent: 5.50,
            divCagr3Yr: 40.0,
            payoutRatio: 60.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Cyclical',
            moat: 'Entegre yassı çelik lideri, Bingöl peletleme yatırımı',
            advisorVerdictTr: 'Geleneksel temettü devi; küresel çelik fiyatlarının döngüsel toparlanmasıyla yüksek nakit potansiyeli.',
            advisorVerdictEn: 'Legacy heavy steel giant positioned for significant operational cash surge upon cyclical recovery.',
            userShares: userHoldingMap.get('EREGL')?.shares || 0,
          },
          {
            symbol: 'KRDMD',
            name: 'Kardemir (D)',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 28.60,
            yieldPercent: 3.20,
            divCagr3Yr: 32.0,
            payoutRatio: 35.0,
            safetyGrade: 'B',
            frequency: 'Yılda 2 Taksit (Haz/Kas)',
            suitability: 'Cyclical',
            moat: 'Demiryolu rayı tek üreticisi, uzun çelik profil tesisi',
            advisorVerdictTr: 'Yılda 2 taksitle öder (Kasım 2026 taksiti yaklaşıyor). Verimi sanayi devlerine göre daha mütevazıdır.',
            advisorVerdictEn: '2-tranche payer with upcoming November distribution, but lower yield than automotive peers.',
            userShares: userHoldingMap.get('KRDMD')?.shares || 22,
          },
          {
            symbol: 'BRSAN',
            name: 'Borusan Mannesmann Boru',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 645.00,
            yieldPercent: 3.00,
            divCagr3Yr: 50.0,
            payoutRatio: 35.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Cyclical',
            moat: 'Kuzey Amerika enerji borusu satın alması, yüksek döviz marjı',
            advisorVerdictTr: 'Sermaye kazancı için güçlüdür fakat cari temettü verimi (%3) TTRAK veya FROTO\'ya göre zayıftır. Takas değerlendirilebilir.',
            advisorVerdictEn: 'High growth industrial pipe supplier, but modest 3% cash yield makes it better for capital gains than income.',
            userShares: userHoldingMap.get('BRSAN')?.shares || 2,
          },
        ]
      },

      HOLDINGS_ENERGY_TELECOM: {
        key: 'HOLDINGS_ENERGY_TELECOM',
        icon: '⚡',
        nameTr: 'Holdingler, Enerji & Telekom',
        nameEn: 'Conglomerates, Energy & Telecoms',
        shortDescTr: 'Çok sektörlü holding nakitleri, rafineri marjları ve TÜFE endeksli telekom gelirleri',
        shortDescEn: 'Conglomerate NAV cashflows, refining margins, and inflation-indexed telecom ARPUs',
        bestPickSymbol: 'TCELL',
        advisorInsightTr: 'Turkcell (TCELL), TÜFE endeksli fatura gelirleri ve yılda 2 TAKSİTLE ödeme yapmasıyla portföyün en dengeli nakit akışlarındandır (2. Taksit 9 Aralık 2026\'da kesinleşti!). Tüpraş (TUPRS) ise BIST\'in en yüksek temettü ödeyen enerji kalesidir.',
        advisorInsightEn: 'Turkcell (TCELL) features inflation-indexed subscriber cashflows and 2 SEMI-ANNUAL tranches (December 2026 confirmed!). Tüpraş (TUPRS) provides high refining cash distributions.',
        taxNoteTr: '%10 Stopaj kesilir.',
        taxNoteEn: 'Standard 10% withholding tax applies.',
        stocks: [
          {
            symbol: 'TCELL',
            name: 'Turkcell İletişim',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 94.20,
            yieldPercent: 4.20,
            divCagr3Yr: 45.0,
            payoutRatio: 52.0,
            safetyGrade: 'A',
            frequency: 'Yılda 2 Taksit (Haz/Ara)',
            suitability: 'Best-in-Class',
            moat: 'Telekom lideri, veri merkezi yatırımları, enflasyona endeksli ARPU',
            advisorVerdictTr: 'Yılda 2 taksitle öder. 2. Taksiti 9 Aralık 2026\'da kesinleşmiştir. Enflasyon karşısında nakit üreten kale.',
            advisorVerdictEn: 'Semi-annual payer with December 9, 2026 distribution confirmed. Non-cyclical consumer utility moat.',
            userShares: userHoldingMap.get('TCELL')?.shares || 11,
          },
          {
            symbol: 'TUPRS',
            name: 'Tüpraş',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 367.50,
            yieldPercent: 7.40,
            divCagr3Yr: 91.5,
            payoutRatio: 65.0,
            safetyGrade: 'A',
            frequency: 'Yılda 2 Taksit (Nis/Eki)',
            suitability: 'Best-in-Class',
            moat: 'Stratejik milli rafineri, yeşil hidrojen dönüşümü, yüksek nakit kasası',
            advisorVerdictTr: 'BIST\'in temettü canavarı. Rafineri kârlarını hissedarına aktarır ve yılda 2 kez temettü dağıtır.',
            advisorVerdictEn: 'Integrated national refiner with high cash generation and semi-annual payout structure.',
            userShares: userHoldingMap.get('TUPRS')?.shares || 0,
          },
          {
            symbol: 'KCHOL',
            name: 'Koç Holding',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 198.50,
            yieldPercent: 3.60,
            divCagr3Yr: 55.0,
            payoutRatio: 35.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Solid Core',
            moat: 'Tüpraş, Ford Otosan, Tofaş ve Yapı Kredi temettülerinin toplandığı ana çatı',
            advisorVerdictTr: 'Türkiye\'nin en kaliteli holdingi. İştirak temettüleriyle beslenen sağlam ve risksiz nakit havuzu.',
            advisorVerdictEn: 'Top conglomerate collecting upstream cash from Turkey\'s leading exporters and banks.',
            userShares: userHoldingMap.get('KCHOL')?.shares || 4,
          },
          {
            symbol: 'SAHOL',
            name: 'Sabancı Holding',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 92.40,
            yieldPercent: 3.40,
            divCagr3Yr: 44.0,
            payoutRatio: 30.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Mayıs)',
            suitability: 'Solid Core',
            moat: 'Enerjisa, Akbank, Çimsa iştirakleri, yenilenebilir enerji yatırımları',
            advisorVerdictTr: 'Enerji altyapısı ve Akbank ortaklığıyla yüksek defansif güvenilirlik.',
            advisorVerdictEn: 'Defensive utility and banking cash stream trading at substantial NAV discount.',
            userShares: userHoldingMap.get('SAHOL')?.shares || 0,
          },
          {
            symbol: 'AGHOL',
            name: 'AG Anadolu Grubu Holding',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 34.20,
            yieldPercent: 3.20,
            divCagr3Yr: 42.0,
            payoutRatio: 35.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Haziran)',
            suitability: 'Solid Core',
            moat: 'Migros, Anadolu Efes, Coca-Cola İçecek ve Çelik Motor çatı şirketi',
            advisorVerdictTr: 'Migros ve CCI\'nin muazzam nakit akışını toplayan dinamik perakende holdingi.',
            advisorVerdictEn: 'Holding company capturing expanding cashflows from Migros and Coca-Cola İçecek.',
            userShares: userHoldingMap.get('AGHOL')?.shares || 31,
          },
          {
            symbol: 'PETKM',
            name: 'Petkim Petrokimya',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 19.80,
            yieldPercent: 3.00,
            divCagr3Yr: 30.0,
            payoutRatio: 40.0,
            safetyGrade: 'B',
            frequency: 'Yıllık (Haziran)',
            suitability: 'Cyclical',
            moat: 'Star Rafineri entegrasyonu, plastik ve hammadde pazar payı',
            advisorVerdictTr: 'Petrokimya marjlarına bağlı döngüsel hisse; temettü ödemeleri sektörel dalgalanmalardan etkilenir.',
            advisorVerdictEn: 'Commodity petrochemical exposure with cyclical distribution swings.',
            userShares: userHoldingMap.get('PETKM')?.shares || 48,
          },
        ]
      },

      GLOBAL_ETFS: {
        key: 'GLOBAL_ETFS',
        icon: '🌐',
        nameTr: 'Global Temettü ETF\'leri (ABD)',
        nameEn: 'US Dividend & Income ETFs',
        shortDescTr: 'Aylık nakit akışı, opsiyon primi (covered call) ve Dividend Aristocrat fonları',
        shortDescEn: 'Monthly cash payouts, covered-call option overlays, and Dividend Aristocrat baskets',
        bestPickSymbol: 'SCHD',
        advisorInsightTr: 'Yazın ve sonbaharda BIST temettüleri kururken, ABD temettü fonları portföyünüze DÜZENLİ DOLAR BAZLI AYLIK / ÇEYREKLİK MAAŞ sağlar. SCHD sermaye ve temettü büyümesini birleştirirken, JEPI her ay nakit opsiyon primi dağıtır.',
        advisorInsightEn: 'While BIST dividend distributions cluster heavily in Spring, US dividend ETFs supply consistent USD-denominated monthly/quarterly paychecks to eliminate summer/autumn droughts.',
        taxNoteTr: 'ABD hisse ve fonlarında %20 stopaj kesilir.',
        taxNoteEn: 'US withholding tax applies (typically 20% under tax treaties).',
        stocks: [
          {
            symbol: 'SCHD',
            name: 'Schwab US Dividend Equity ETF',
            market: 'US',
            currency: 'USD',
            currentPrice: 83.10,
            yieldPercent: 3.65,
            divCagr3Yr: 7.0,
            payoutRatio: 65.0,
            safetyGrade: 'A+',
            frequency: 'Çeyreklik (Mar/Haz/Eyl/Ara)',
            suitability: 'Best-in-Class',
            moat: '10 yıl aralıksız temettü artıran 100 kaliteli ABD şirketi, %0.06 gider oranı',
            advisorVerdictTr: 'ABD temettü fonlarının altın standardı. Dolar bazında hem sermaye hem de yıllık ortalama %8-10 temettü artışı sunar.',
            advisorVerdictEn: 'Gold standard for dividend compounding with low fee and strict 10-year consecutive hike criteria.',
            userShares: userHoldingMap.get('SCHD')?.shares || 0,
          },
          {
            symbol: 'JEPI',
            name: 'JPMorgan Equity Premium Income',
            market: 'US',
            currency: 'USD',
            currentPrice: 57.16,
            yieldPercent: 7.50,
            divCagr3Yr: 4.2,
            payoutRatio: 85.0,
            safetyGrade: 'A',
            frequency: 'Her Ay (Aylık)',
            suitability: 'Solid Core',
            moat: 'S&P 500 hisseleri + ELN opsiyon primi stratejisi ile yüksek aylık nakit',
            advisorVerdictTr: 'Her ay kesintisiz dolar temettüsü öder (%7.5 cari verim). Aylık gelir hedefleyenler için idealdir.',
            advisorVerdictEn: 'Generates immediate 7.5% annualized cash yield paid monthly via defensive covered call overlays.',
            userShares: userHoldingMap.get('JEPI')?.shares || 0,
          },
          {
            symbol: 'JEPQ',
            name: 'JPMorgan Nasdaq Equity Premium',
            market: 'US',
            currency: 'USD',
            currentPrice: 54.30,
            yieldPercent: 9.20,
            divCagr3Yr: 4.0,
            payoutRatio: 85.0,
            safetyGrade: 'B+',
            frequency: 'Her Ay (Aylık)',
            suitability: 'Solid Core',
            moat: 'Nasdaq 100 teknoloji hisseleri üzerinde kapalı opsiyon yazımı',
            advisorVerdictTr: 'Yapay zeka ve teknoloji devlerinin oynaklığından beslenerek her ay %9+ verim dağıtır.',
            advisorVerdictEn: 'Harvests Nasdaq volatility into monthly high-yield cashflow averaging ~9.2%.',
            userShares: userHoldingMap.get('JEPQ')?.shares || 0,
          },
          {
            symbol: 'VYM',
            name: 'Vanguard High Dividend Yield ETF',
            market: 'US',
            currency: 'USD',
            currentPrice: 128.20,
            yieldPercent: 2.95,
            divCagr3Yr: 6.0,
            payoutRatio: 55.0,
            safetyGrade: 'A+',
            frequency: 'Çeyreklik (Mar/Haz/Eyl/Ara)',
            suitability: 'Defensive',
            moat: '400+ yüksek verimli ABD şirketinin dengeli sepeti, Vanguard maliyet gücü',
            advisorVerdictTr: 'Geniş piyasa çeşitlendirmesi ve minimum risk isteyenler için klasik Amerikan temettü kalesi.',
            advisorVerdictEn: 'Broad high-dividend equity basket prioritizing conservative payout security and low volatility.',
            userShares: userHoldingMap.get('VYM')?.shares || 0,
          },
        ]
      },
    };
  }, [language, userHoldingMap]);

  // Overall Health Assessment
  const healthScore = useMemo(() => {
    let score = 84;
    const hasHalkb = (userHoldingMap.get('HALKB')?.shares || 0) > 0;
    const hasVakbn = (userHoldingMap.get('VAKBN')?.shares || 0) > 0;
    const bankCount = sectorCatalog.BANKING.stocks.filter(s => s.userShares > 0).length;

    if (hasHalkb && hasVakbn) score -= 10;
    if (bankCount >= 4) score -= 6;
    if (userHoldingMap.get('TRGYO')) score += 5;
    if (userHoldingMap.get('ISMEN')) score += 6;
    if (userHoldingMap.get('TURSG')) score += 5;

    return Math.min(95, Math.max(55, score));
  }, [userHoldingMap, sectorCatalog]);

  // Sectoral Rebalancing Actions Across All Sectors
  const rebalancingProposals = useMemo(() => {
    const halkbShares = userHoldingMap.get('HALKB')?.shares || 0;
    const halkbPrice = userHoldingMap.get('HALKB')?.currentPrice || 45.44;
    const vakbnShares = userHoldingMap.get('VAKBN')?.shares || 0;
    const vakbnPrice = userHoldingMap.get('VAKBN')?.currentPrice || 33.70;
    const stateBankVal = (halkbShares * halkbPrice) + (vakbnShares * vakbnPrice);

    const brsanShares = userHoldingMap.get('BRSAN')?.shares || 0;
    const brsanPrice = userHoldingMap.get('BRSAN')?.currentPrice || 645.00;
    const brsanVal = brsanShares * brsanPrice;

    return [
      {
        id: 'prop-1-bank-swap',
        sector: 'BANKING',
        title: language === 'tr' ? '🏛️ Bankacılık: HALKB + VAKBN ➡️ AKBNK veya ISMEN' : '🏛️ Banking: Consolidate State Banks into AKBNK / ISMEN',
        priority: 'HIGH',
        current: `HALKB (${halkbShares} lot) + VAKBN (${vakbnShares} lot) ≈ ₺${stateBankVal.toFixed(0)}`,
        target: `AKBNK (+${Math.floor(stateBankVal / 66.9)} lot) veya ISMEN (+${Math.floor(stateBankVal / 28.78)} lot)`,
        rationale: language === 'tr'
          ? `Portföyünüzde 4 farklı banka bulunuyor. Kamu bankalarının temettü verimi (%1.2) ve kârlılığı özel bankaların (AKBNK %34.2 ROE) çok gerisindedir. Bu sermayeyi Akbank veya İş Yatırım'a aktarmak yıllık temettünüzü anında +₺170-₺220 artırır.`
          : `You hold 4 different banks. State banks suffer from lower ROE and negligible cash dividends. Merging HALKB and VAKBN into AKBNK or ISMEN eliminates state policy drag and boosts cashflow by +₺170-₺220/yr.`,
        netIncomeDeltaTRY: Math.round(stateBankVal * 0.08),
        badge: language === 'tr' ? 'Yüksek Öncelik' : 'High Priority'
      },
      {
        id: 'prop-2-reit-boost',
        sector: 'REIT',
        title: language === 'tr' ? '🏢 GYO: Torunlar GYO (TRGYO) %0 Stopaj Kalkanı' : '🏢 REIT: Maximize Torunlar GYO 0% Tax Shield',
        priority: 'MEDIUM',
        current: `TRGYO (${userHoldingMap.get('TRGYO')?.shares || 15} lot)`,
        target: 'TRGYO (+25-30 lot)',
        rationale: language === 'tr'
          ? 'Sanayi hisselerinde temettüden %10 stopaj kesilirken, Torunlar GYO gibi GYO şirketlerinde STOPAJ ORANI %0\'DIR (sıfır vergi). Mall of Istanbul kira nakit akışı ile desteklenen %5.2 net nakit getirisini portföyün defansif çekirdeği yapın.'
          : 'Turkish REITs enjoy 0% dividend withholding tax (vs 10% on corporate shares). Its 5.2% yield is 100% tax-free net cash flow anchored by Mall of Istanbul commercial tenants.',
        netIncomeDeltaTRY: 130,
        badge: language === 'tr' ? '%0 Stopaj' : '0% Tax'
      },
      {
        id: 'prop-3-industrial-opt',
        sector: 'AUTOMOTIVE_INDUSTRIAL',
        title: language === 'tr' ? '🏭 Sanayi: BRSAN ➡️ TTRAK veya FROTO Takası' : '🏭 Industrial: Rebalance Low-Yield BRSAN into TTRAK / FROTO',
        priority: 'MEDIUM',
        current: `BRSAN (${brsanShares} lot ≈ ₺${brsanVal.toFixed(0)}) · Cari Verim %3.0`,
        target: `TTRAK (+${Math.floor(brsanVal / 780)} lot) veya FROTO (+${Math.floor(brsanVal / 1045)} lot) · Verim %7.8`,
        rationale: language === 'tr'
          ? `Borusan Boru sermaye büyümesi için başarılı olsa da temettü verimi (%3.0) düşüktür. Bu sermayeyi kârının %75'ini dağıtan Türk Traktör (%7.8 verim) veya Euro gelirli Ford Otosan (%6.2 verim) ile takas etmek temettü gelirini ikiye katlar.`
          : `Borusan Boru yields only ~3.0%. Swapping into Türk Traktör (TTRAK, 7.8% yield) or Ford Otosan (FROTO, 6.2% yield) doubles your industrial dividend cash conversion.`,
        netIncomeDeltaTRY: Math.round(brsanVal * 0.048),
        badge: language === 'tr' ? 'Verim Artırımı' : 'Yield Booster'
      },
      {
        id: 'prop-4-cashflow-smoothing',
        sector: 'GLOBAL_ETFS',
        title: language === 'tr' ? '💧 Nakit Akışı: Yaz Boşluğunu Realty Income (O) veya BIMAS ile Doldurun' : '💧 Cashflow: Fill Summer Income Drought with O or BIMAS',
        priority: 'MEDIUM',
        current: language === 'tr' ? 'İlkbahar Yığılması (Mart-Mayıs)' : 'Spring Concentration (March-May)',
        target: 'Realty Income (O) veya BİM (BIMAS 3. Taksit)',
        rationale: language === 'tr'
          ? 'BIST temettüleri Mart-Mayıs aylarına kümelendiğinden yaz ve sonbaharda nakit akışı kurur. Her ay ödeyen Realty Income (O) veya yılda 3 taksitle ödeyen BİM (BIMAS) eklemek temettü yağmurunu 12 aya yayar.'
          : 'Concentrated Spring payouts leave summer dry. Adding monthly-payer Realty Income (O) or expanding 3-tranche BİM (BIMAS) creates recurring year-round monthly cash inflows.',
        netIncomeDeltaTRY: 320,
        badge: language === 'tr' ? 'Aylık Nakit' : 'Monthly Income'
      }
    ];
  }, [userHoldingMap, language]);

  // Sector Showdown stock selector
  const activeSectorData = sectorCatalog[selectedSector];

  // Advisor Semantic Chat Engine
  const executeChatQuery = (text: string) => {
    if (!text.trim()) return;
    const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setChatMessages(prev => [...prev, { sender: 'user', text, time: nowTime }]);
    setUserQuery('');
    setIsThinking(true);

    setTimeout(() => {
      const lower = text.toLowerCase();
      let response = '';

      // 1. Bank Showdown
      if (lower.includes('bank') || lower.includes('akbnk') || lower.includes('halkb') || lower.includes('vakbn') || lower.includes('garan')) {
        response = language === 'tr'
          ? `🏦 **Banka Sektörü Değerlendirmesi: Hangi Banka Daha İyi?**

Portföyünüzde 4 banka bulunuyor: **AKBNK, YKBNK, HALKB, VAKBN**.

1. **Özel Bankalar (AKBNK & GARAN) Açık Ara Üstündür:**
   - **Özkaynak Kârlılığı (ROE):** Akbank (%34.2) ve Garanti (%37.1), kamu bankalarının (HALKB %18.4, VAKBN %19.2) yaklaşık **2 katı** kârlıdır.
   - **Sermaye Gücü (CAR):** Akbank %19.4 sermaye yeterliliği ile sektörün en sağlam bilançosudur.
   - **Temettü:** AKBNK kârının %28-35'ini nakit olarak öder (Verim: %4.73).

2. **HALKB ve VAKBN Neden Temettü İçin Verimsizdir?**
   - Kamu bankaları kârlarını temettü olarak dağıtmak yerine sermayeye eklemek zorundadır. Temettü verimleri %1.2 civarında kalır.
   - Ayrıca Halkbank üzerindeki ABD dava süreci sürekli bir iskonto baskısı yaratır.

👉 **Danışman Kararı:** HALKB (21 lot) ve VAKBN (29 lot) hisselerinizi satıp **AKBNK** veya **ISMEN** üzerine aktarın.`
          : `🏦 **Banking Showdown: Private Leaders vs State Banks**

1. **Why AKBNK & GARAN Win:** Nearly double the return on equity (ROE 34% vs 18%), unmatched 19.4% CAR balance sheet, and reliable ~4.7% cash yield.
2. **Why HALKB & VAKBN Lag:** Constrained by subsidized lending and retain capital rather than paying cash dividends (~1.2% yield).
👉 **Action:** Consolidate HALKB + VAKBN into AKBNK or ISMEN.`;
      }
      // 2. Retail / Consumer Showdown (BIMAS vs CCOLA vs AEFES)
      else if (lower.includes('bimas') || lower.includes('ccola') || lower.includes('aefes') || lower.includes('perakende') || lower.includes('market') || lower.includes('içecek')) {
        response = language === 'tr'
          ? `🛒 **Tüketim & Perakende Karşılaştırması: BIMAS mı CCOLA mı?**

1. **BİM (BIMAS) - Defansif Nakit Şampiyonu:**
   - **Ödeme Sıklığı:** Temettüsünü **YILDA 3 TAKSİTLE** (Haziran, Eylül, Aralık) öder. 3. Taksiti **18 Aralık 2026**'da ödenecektir.
   - **Moat:** İndirimli market tekeli ve negatif işletme sermayesi ile enflasyon kalkanıdır.
2. **Coca-Cola İçecek (CCOLA) - Büyüme & İhracat Devi:**
   - **Temettü Büyümesi:** Son 3 yılda %52 temettü CAGR gerçekleştirdi.
   - **Moat:** Orta Asya ve Orta Doğu operasyonları döviz bazlı kâr sağlar. Dağıtım oranı %45 ile temettüsünü rahatça artırabilir.

👉 **Danışman Kararı:** İkisi birbirini mükemmel tamamlar. Düzenli çeyreklik nakit için **BIMAS**, dövizli büyüme için **CCOLA** portföyde mutlaka birlikte tutulmalıdır.`
          : `🛒 **Retail Showdown: BIMAS vs CCOLA**

- **BIMAS:** Defensive grocery cash king distributing dividends across **3 tranches** (June, September, December 2026).
- **CCOLA:** Fast-moving beverage bottler delivering high hard-currency export growth across Central Asia with 52% dividend CAGR.
👉 **Verdict:** Both represent blue-chip holdings. Hold BIMAS for multi-tranche timing and CCOLA for FX growth.`;
      }
      // 3. REIT Showdown (TRGYO vs EKGYO vs ISGYO vs ALGYO vs O)
      else if (lower.includes('trgyo') || lower.includes('torunlar') || lower.includes('ekgyo') || lower.includes('gyo') || lower.includes('reit') || lower.includes('stopaj')) {
        response = language === 'tr'
          ? `🏢 **GYO Sektörü & Torunlar GYO (TRGYO) Analizi:**

1. **En Büyük Avantaj: %0 STOPAJ VERGİSİ (Sıfır Vergi):**
   - BIST sanayi hisselerinden temettü ödemesinde **%10 stopaj vergisi** kesilirken, Torunlar GYO gibi GYO şirketlerinde **STOPAJ ORANI %0'DIR**.
   - Dağıtılan ₺1.25 hisse başı temettünün tamamı kesintisiz cebinize kalır.
2. **TRGYO vs EKGYO:**
   - **TRGYO (Torunlar GYO):** Mall of Istanbul ve prime ofis plazalarının TÜFE'ye endeksli kira akışına sahiptir. Cari verimi **%5.20**'dir.
   - **EKGYO (Emlak Konut):** Konut geliştirme ve gelir paylaşımı devidir (%4.80 verim). Ancak kira yerine konut satış döngüsüne duyarlıdır.

👉 **Danışman Kararı:** TRGYO portföyünüzün defansif kira gelir motorudur. 15 lotunuzu koruyun, 25-30 lota kadar artırın.`
          : `🏢 **REIT Showdown & Torunlar GYO (TRGYO) 0% Tax Moat:**

- **0% Withholding Tax:** Turkish REITs enjoy complete exemption from the 10% dividend tax.
- **TRGYO vs EKGYO:** TRGYO (5.2% yield) offers inflation-indexed rental cash from Mall of Istanbul, while EKGYO (4.8% yield) is exposed to residential construction cycles.
👉 **Verdict:** TRGYO is your premier tax-free defensive cash flow anchor.`;
      }
      // 4. Automotive & Industrial (TTRAK vs FROTO vs TOASO vs BRSAN)
      else if (lower.includes('ttrak') || lower.includes('froto') || lower.includes('toaso') || lower.includes('brsan') || lower.includes('sanayi') || lower.includes('otomotiv') || lower.includes('traktör')) {
        response = language === 'tr'
          ? `🏭 **Otomotiv & Sanayi Karşılaştırması: TTRAK mı FROTO mu BRSAN mı?**

1. **Türk Traktör (TTRAK) - Temettü Şampiyonu:**
   - **Verim:** **%7.80** ile sektörün zirvesindedir.
   - **Dağıtım Disiplini:** Kârının **%75'ini** nakit temettü olarak dağıtır. Pazar payı %50'nin üzerindedir.
2. **Ford Otosan (FROTO) - Euro Bazlı İhracat Kalesi:**
   - **Verim:** **%6.20**. Ford Transit ve Custom modellerinin Avrupa ihracat tekeline sahiptir; Euro döviz kalkanıdır.
3. **Borusan Boru (BRSAN) - Neden Temettü İçin Zayıf?**
   - Portföyünüzde 2 lot BRSAN bulunuyor. Şirket başarılı ancak temettü verimi sadece **%3.00**'tür. 

👉 **Danışman Kararı:** Saf temettü geliri hedefliyorsanız BRSAN'ı satıp **TTRAK** veya **FROTO**'ya geçmek yıllık temettü nakdinizi ikiye katlar.`
          : `🏭 **Automotive & Industrial Showdown:**

- **TTRAK (7.8% yield):** Sector dividend champion distributing 75% of earnings with 50%+ tractor monopoly.
- **FROTO (6.2% yield):** Export powerhouse generating hard-currency Euro revenues with high dividend growth.
- **BRSAN (3.0% yield):** High-growth pipe manufacturer, but modest 3% yield makes it suboptimal for pure income.
👉 **Verdict:** Swap low-yield BRSAN lots into TTRAK or FROTO to double cashflow conversion.`;
      }
      // 5. Financials (ISMEN vs TURSG)
      else if (lower.includes('ismen') || lower.includes('tursg') || lower.includes('sigorta') || lower.includes('aracı')) {
        response = language === 'tr'
          ? `📈 **Finansal Hizmetler Karşılaştırması: ISMEN mi TURSG mi?**

İkisi de portföyünüzün **en yüksek nakit üreten iki devidir**:
- **İş Yatırım (ISMEN):** **%8.55 verim**, sıfır borç, BIST borsa hacmi tekeli. Son 3 yılda temettüsünü %84.6 CAGR ile artırdı!
- **Türkiye Sigorta (TURSG):** **%7.09 verim**. Yüksek faiz ortamında devasa prim float rezervlerini değerlendirerek rekor kâr payı ödüyor. Ayrıca Ağustos ayında ödeme yaparak ilkbahar dışındaki aylara can suyu veriyor.

👉 **Danışman Kararı:** İkisi de portföyünüzde ağırlıklı kalmalıdır. Her ikisi de bankalardan daha yüksek doğrudan nakit temettü verir.`
          : `📈 **Financials Showdown: ISMEN vs TURSG**

Both are your highest cashflow generators:
- **ISMEN (8.55% yield):** Zero debt, brokerage volume leader with +84% 3-year dividend CAGR.
- **TURSG (7.09% yield):** High-float insurance underwriter paying in August to diversify timing.
👉 **Verdict:** Maintain both as premier high-yield anchors.`;
      }
      // 6. Telecom & Holdings (TCELL vs TUPRS vs KCHOL)
      else if (lower.includes('tcell') || lower.includes('tuprs') || lower.includes('kchol') || lower.includes('telekom') || lower.includes('holding') || lower.includes('tüpraş')) {
        response = language === 'tr'
          ? `⚡ **Telekom & Holding Karşılaştırması: TCELL mi TUPRS mu KCHOL mu?**

- **Turkcell (TCELL):** Defansif telekom devi. **Yılda 2 taksitle** temettü dağıtır. 2. Taksit ödemesi **9 Aralık 2026**'da kesinleşti!
- **Tüpraş (TUPRS):** BIST'in en yüksek temettü ödeyen sanayi devidir (%7.40 verim). Yılda 2 kez dağıtır.
- **Koç Holding (KCHOL):** Tüpraş, Ford Otosan, Tofaş ve Yapı Kredi temettülerinin toplandığı ana holdingdir.

👉 **Danışman Kararı:** TCELL'in 2 taksitli ödeme disiplini çok değerlidir. Portföyünüze yüksek temettülü TUPRS eklemek nakit akışını hemen yukarı çeker.`
          : `⚡ **Holdings & Telecom Showdown:**

- **TCELL (4.2% yield):** CPI-indexed telecom utility paying semi-annually (Dec 9, 2026 tranche confirmed!).
- **TUPRS (7.4% yield):** High-yield refiner distributing semi-annually from refining crack spreads.
- **KCHOL (3.6% yield):** Premier holding company funneling cash from top industrial exporters.`;
      }
      // 7. General Strategy & Rebalancing
      else if (lower.includes('değişiklik') || lower.includes('öneri') || lower.includes('change') || lower.includes('rebalance') || lower.includes('hangisi')) {
        response = language === 'tr'
          ? `🎯 **Sektörler Genelinde En Kritik 3 Optimizasyon:**

1. **Bankacılık:** HALKB (21 lot) ve VAKBN (29 lot) kamu bankalarını satıp **AKBNK** veya **ISMEN** hisselerine aktarın (+₺170-₺220/yıl ek temettü).
2. **Sanayi:** Cari verimi %3 olan BRSAN hisselerini **TTRAK** (%7.8 verim) veya **FROTO** (%6.2 verim) ile takas edin.
3. **GYO & Stopaj:** %0 stopaj avantajına sahip **TRGYO** ağırlığını koruyup geri çekilmelerde artırın.`
          : `🎯 **Top 3 Cross-Sector Rebalancing Priorities:**

1. **Banking:** Consolidate HALKB + VAKBN into **AKBNK** or **ISMEN** (+₺170-₺220/yr cashflow boost).
2. **Industrial:** Swap 3% yielding BRSAN into **TTRAK** (7.8%) or **FROTO** (6.2%).
3. **REIT:** Leverage **TRGYO**'s 0% tax shelter as your defensive rental backbone.`;
      } else {
        response = language === 'tr'
          ? `📊 Sektörel olarak portföyünüz güçlü bir omurgaya sahip (Yıllık: ~₺${totalAnnualTRY.toFixed(0)}, Aylık: ~₺${totalMonthlyTRY.toFixed(0)}). Bankacılık, GYO, Sigorta ve Tüketim sektörlerinde hangi hisselerin daha iyi olduğunu yukarıdaki sekmelerden detaylı olarak inceleyebilirsiniz.`
          : `📊 Your portfolio holds a robust multi-sector foundation (Annual: ~₺${totalAnnualTRY.toFixed(0)}, Monthly: ~₺${totalMonthlyTRY.toFixed(0)}). Explore the sector showdown tabs above to compare individual peers across Banking, REITs, Financials, and Retail.`;
      }

      setChatMessages(prev => [...prev, {
        sender: 'advisor',
        text: response,
        time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      }]);
      setIsThinking(false);
    }, 600);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Advisor Briefing Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 p-6 shadow-xl text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-xs font-black text-indigo-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>SEKTÖREL TEMETTÜ DANIŞMANI · CANLI ANALİZ</span>
              </span>
              <span className="text-xs font-semibold text-slate-400">
                7 Sektör · 37 Varlık Denetlendi
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              {language === 'tr'
                ? 'Sektör Sektör Temettü Hisseleri Değerlendirmesi'
                : 'Sector-by-Sector Dividend Equity Diagnostics'}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {language === 'tr'
                ? 'Sadece bankalar değil; GYO\'lar, aracı kurumlar, otomotiv, perakende, telekom ve holdingler tek tek karşılaştırıldı. Hangi hissenin kârlılık, verim ve güvenlik açısından diğerinden daha üstün olduğunu keşfedin.'
                : 'Not just banks—REITs, brokerage, automotive, retail, telecoms, and holding companies evaluated peer-by-peer. Compare which stocks dominate in profitability, yield, and distribution safety.'}
            </p>
          </div>

          {/* Health Score Gauge */}
          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-4.5 flex items-center gap-4 shrink-0 shadow-lg">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 flex items-center justify-center bg-slate-900/60">
                <span className="text-2xl font-black text-emerald-400">{healthScore}</span>
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {language === 'tr' ? 'Portföy Sağlık Puanı' : 'Portfolio Health'}
              </div>
              <div className="text-sm font-black text-white">
                {healthScore >= 80 ? (language === 'tr' ? 'Güçlü (Sektörel Fırsatlar Açık)' : 'Strong (Actionable)') : 'Moderate'}
              </div>
              <div className="text-[11px] text-amber-400 font-medium mt-0.5">
                {language === 'tr' ? '7 Sektör Karşılaştırmaya Hazır' : '7 Sectors Ready for Audit'}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation inside Advisor */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('sector_showdown')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'sector_showdown'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <span>🏛️</span>
            <span>{language === 'tr' ? 'Sektörel Karşılaştırma (7 Sektör)' : 'Sector Showdown (7 Sectors)'}</span>
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <span>📊</span>
            <span>{language === 'tr' ? 'Portföy Teşhisi' : 'Portfolio Diagnostics'}</span>
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'actions'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <span>💡</span>
            <span>{language === 'tr' ? 'Önerilen Değişiklikler (4 Eylem)' : 'Actionable Swaps (4 Actions)'}</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'chat'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <span>💬</span>
            <span>{language === 'tr' ? 'Danışmana Sor (Soru-Cevap)' : 'Ask Advisor (Q&A)'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SECTOR SHOWDOWN (THE CORE REQUEST!) */}
      {activeTab === 'sector_showdown' && (
        <div className="space-y-6">
          {/* Sector Selector Pill Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {(Object.keys(sectorCatalog) as DividendSectorKey[]).map((secKey) => {
              const sec = sectorCatalog[secKey];
              const isSelected = selectedSector === secKey;
              const userOwnedInSector = sec.stocks.filter(s => s.userShares > 0).length;

              return (
                <button
                  key={secKey}
                  onClick={() => setSelectedSector(secKey)}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20 scale-[1.02]'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-base">{sec.icon}</span>
                  <span>{language === 'tr' ? sec.nameTr : sec.nameEn}</span>
                  {userOwnedInSector > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    }`}>
                      {userOwnedInSector} {language === 'tr' ? 'hisse' : 'held'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Sector Header & Macro Insight */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{activeSectorData.icon}</span>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {language === 'tr' ? activeSectorData.nameTr : activeSectorData.nameEn}
                  </h3>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    👑 Sektör Lideri: {activeSectorData.bestPickSymbol}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {language === 'tr' ? activeSectorData.shortDescTr : activeSectorData.shortDescEn}
                </p>
              </div>

              {/* Tax Note Badge */}
              <div className="px-3.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                {language === 'tr' ? activeSectorData.taxNoteTr : activeSectorData.taxNoteEn}
              </div>
            </div>

            {/* Advisor Sector Insight Callout */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/60 dark:border-slate-800 flex items-start gap-3">
              <span className="text-xl shrink-0">💡</span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                {language === 'tr' ? activeSectorData.advisorInsightTr : activeSectorData.advisorInsightEn}
              </p>
            </div>

            {/* Stock Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {activeSectorData.stocks.map((stock) => {
                const isOwned = stock.userShares > 0;
                const isBest = stock.suitability === 'Best-in-Class';
                const isAvoid = stock.suitability === 'Avoid';

                return (
                  <div
                    key={stock.symbol}
                    className={`rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                      isBest
                        ? 'bg-gradient-to-br from-white to-emerald-50/30 dark:from-slate-900 dark:to-emerald-950/20 border-emerald-300 dark:border-emerald-700 shadow-sm'
                        : isAvoid
                        ? 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-85'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black text-slate-900 dark:text-white">{stock.symbol}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isBest
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-black'
                                : isAvoid
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                            }`}>
                              {stock.suitability}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{stock.name}</p>
                        </div>

                        {/* Owned Badge */}
                        <div className="text-right">
                          {isOwned ? (
                            <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-800">
                              {stock.userShares} {language === 'tr' ? 'lot taşınıyor' : 'lots held'}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">
                              {language === 'tr' ? 'Taşınmıyor' : 'Not held'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Key Metric Grid */}
                      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-center">
                        <div>
                          <span className="text-[10px] text-slate-400 block">{language === 'tr' ? 'Temettü Verimi' : 'Yield'}</span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">%{stock.yieldPercent.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">{language === 'tr' ? '3 Yıl Büyüme' : '3Y CAGR'}</span>
                          <span className="text-sm font-black text-blue-600 dark:text-blue-400">%{stock.divCagr3Yr.toFixed(1)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">{language === 'tr' ? 'Güvenilirlik' : 'Safety'}</span>
                          <span className="text-sm font-black text-purple-600 dark:text-purple-400">{stock.safetyGrade}</span>
                        </div>
                      </div>

                      {/* Moat & Timing Info */}
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>🗓️ {stock.frequency}</span>
                        <span>📊 Dağıtım: %{stock.payoutRatio.toFixed(0)}</span>
                      </div>

                      {/* Moat Summary */}
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100/60 dark:bg-slate-800/80 p-2 rounded-lg">
                        🛡️ {stock.moat}
                      </div>

                      {/* Advisor Verdict */}
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
                        {language === 'tr' ? stock.advisorVerdictTr : stock.advisorVerdictEn}
                      </p>
                    </div>

                    {/* Bottom Action */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                      <span className={`font-bold flex items-center gap-1 ${
                        isBest
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isAvoid
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        {isBest ? '👑 Sektör Lideri' : isAvoid ? '⚠️ Takas Önerilir' : '✓ Güçlü Çekirdek'}
                      </span>
                      {onSelectTicker && (
                        <button
                          onClick={() => onSelectTicker(stock.symbol)}
                          className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          {language === 'tr' ? 'Grafik İncele 📈' : 'View Chart 📈'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PORTFOLIO DIAGNOSTICS & SECTOR BREAKDOWN */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                <span>{language === 'tr' ? 'Bilanço & Güvenilirlik' : 'Balance Sheet Quality'}</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono font-black">88 / 100</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '88%' }} />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 pt-1">
                {language === 'tr'
                  ? 'AKBNK, ISMEN, TURSG, CCOLA ve TRGYO gibi yüksek kârlı şirketler portföyün ana gücüdür.'
                  : 'Anchored by high-ROE leaders including AKBNK, ISMEN, TURSG, CCOLA, and TRGYO.'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                <span>{language === 'tr' ? 'Nakit Akışı Sürekliliği' : 'Cashflow Continuity'}</span>
                <span className="text-blue-600 dark:text-blue-400 font-mono font-black">76 / 100</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: '76%' }} />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 pt-1">
                {language === 'tr'
                  ? 'BIMAS (3 taksit) ve TCELL (2 taksit) nakit akışını yıl içine yayar. Yaz aylarında küçük boşluklar var.'
                  : 'BIMAS (3 tranches) and TCELL (2 tranches) smooth annual timing. Summer gaps remain.'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                <span>{language === 'tr' ? 'Sektörel Konsantrasyon Riski' : 'Sector Concentration'}</span>
                <span className="text-amber-600 dark:text-amber-400 font-mono font-black">62 / 100</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '62%' }} />
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 pt-1">
                {language === 'tr'
                  ? '⚠️ 4 ayrı banka (AKBNK, YKBNK, HALKB, VAKBN) tutuluyor. Kamu bankalarının temettü verimi çok düşüktür.'
                  : '⚠️ Holding 4 separate banks. State banks create a structural yield and ROE drag.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACTIONABLE REBALANCING PROPOSALS */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          {rebalancingProposals.map((prop) => (
            <div
              key={prop.id}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow space-y-4"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {prop.badge}
                  </span>
                  <h4 className="text-base font-black text-slate-900 dark:text-white">{prop.title}</h4>
                </div>
                <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  +{prop.netIncomeDeltaTRY} ₺ / yıl Ek Temettü
                </div>
              </div>

              {/* Swap Visualizer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200/60 dark:border-slate-800">
                <div>
                  <span className="text-xs font-bold text-slate-400 block">{language === 'tr' ? 'Mevcut Pozisyon (Elden Çıkarılacak)' : 'Current Allocation (To Trim/Exit)'}</span>
                  <span className="text-sm font-black text-rose-600 dark:text-rose-400 mt-1 block">
                    {prop.current}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 block">{language === 'tr' ? 'Önerilen Hedef Varlık' : 'Target Asset (To Accumulate)'}</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                    {prop.target}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {prop.rationale}
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {onOpenLabWithStrategy && (
                  <button
                    onClick={() => onOpenLabWithStrategy('MAX_CASHFLOW')}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <span>🧪</span>
                    <span>{language === 'tr' ? 'Laboratuvarda Simüle Et' : 'Simulate in Lab'}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: INTERACTIVE ADVISOR Q&A CHAT */}
      {activeTab === 'chat' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>🤖</span>
              <span>{language === 'tr' ? 'Sektörel Temettü Danışmanı ile Sohbet' : 'Interactive Sectoral Dividend Advisor Chat'}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'tr'
                ? 'İster bankaları, ister GYO\'ları, perakendeyi veya sanayi hisselerini sorun; her hisseyi sektörel olarak kıyaslayabilir.'
                : 'Ask questions comparing stocks across any sector (e.g. BIMAS vs CCOLA, TRGYO vs EKGYO, TTRAK vs FROTO).'}
            </p>
          </div>

          {/* Quick Preset Prompts across multiple sectors */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => executeChatQuery('BIMAS mı CCOLA mı hangisi daha iyi?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all cursor-pointer"
            >
              🛒 BIMAS mı CCOLA mı?
            </button>
            <button
              onClick={() => executeChatQuery('Torunlar GYO (TRGYO) mu Emlak Konut (EKGYO) mu?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all cursor-pointer"
            >
              🏢 TRGYO mu EKGYO mu?
            </button>
            <button
              onClick={() => executeChatQuery('Otomotivde TTRAK mı FROTO mu BRSAN mı?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all cursor-pointer"
            >
              🏭 TTRAK mı FROTO mu BRSAN mı?
            </button>
            <button
              onClick={() => executeChatQuery('Hangi banka daha iyi: AKBNK mi HALKB mi?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all cursor-pointer"
            >
              🏛️ AKBNK mi HALKB mi?
            </button>
            <button
              onClick={() => executeChatQuery('ISMEN mi TURSG mi hangisi daha çok kazandırır?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all cursor-pointer"
            >
              📈 ISMEN mi TURSG mi?
            </button>
          </div>

          {/* Chat Messages Log */}
          <div className="space-y-3 max-h-[420px] overflow-y-auto p-3 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-bl-xs shadow-2xs whitespace-pre-line'
                  }`}
                >
                  {msg.text}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
              </div>
            ))}

            {isThinking && (
              <div className="flex items-center gap-2 p-3 bg-white dark:bg-slate-800 rounded-xl text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span>{language === 'tr' ? 'Danışman sektörel verileri inceliyor...' : 'Advisor evaluating sector peers...'}</span>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeChatQuery(userQuery);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder={language === 'tr' ? 'Danışmana soru sorun (Örn: BIMAS mı CCOLA mı? veya TRGYO vergi avantajı)...' : 'Ask your advisor (e.g. BIMAS vs CCOLA or TRGYO tax shield)...'}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!userQuery.trim() || isThinking}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
            >
              {language === 'tr' ? 'Gönder' : 'Send'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
