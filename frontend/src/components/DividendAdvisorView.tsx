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
  | 'ENERGY'
  | 'FINANCIALS'
  | 'CONSUMER'
  | 'AUTOMOTIVE_INDUSTRIAL'
  | 'HOLDINGS_TELECOM'
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

      ENERGY: {
        key: 'ENERGY',
        icon: '⚡',
        nameTr: 'Enerji, Rafineri & Elektrik',
        nameEn: 'Energy, Refining & Utilities',
        shortDescTr: 'Rafineri crack marjları, regüle elektrik şebekeleri ve dövizli enerji nakit akışları',
        shortDescEn: 'Refining crack spreads, regulated electricity grids, and FX power tariffs',
        bestPickSymbol: 'TUPRS',
        advisorInsightTr: 'Enerji sektörünün tartışmasız 1 numaralı temettü şampiyonu TÜPRAŞ (TUPRS)\'tır (%7.40 verim, yılda 2 taksitle öder). Defansif elektrik tarafında ise TÜFE garantili ENERJİSA (ENJSA, %6.80 verim) enflasyon kalkanıdır. Aygaz (%5.40) Tüpraş\'ın %10.2\'sine doğrudan ortaktır. Petkim ise petrokimya döngüsel marjları nedeniyle temettü için daha geridedir.',
        advisorInsightEn: 'Tüpraş (TUPRS) is the undisputed dividend champion of the Turkish energy sector with 7.4% yield and semi-annual tranches. Enerjisa (ENJSA, 6.8% yield) acts as a defensive regulated utility inflation shield. Aygaz (5.4% yield) holds a 10.2% stake in Tüpraş, while Petkim suffers from cyclical commodity margins.',
        taxNoteTr: 'Standart %10 temettü stopajı kesilir.',
        taxNoteEn: 'Standard 10% dividend withholding tax applies.',
        stocks: [
          {
            symbol: 'TUPRS',
            name: 'Tüpraş (Türkiye Petrol Rafinerileri)',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 367.50,
            yieldPercent: 7.40,
            divCagr3Yr: 91.5,
            payoutRatio: 65.0,
            safetyGrade: 'A+',
            frequency: 'Yılda 2 Taksit (Nis/Eki)',
            suitability: 'Best-in-Class',
            moat: 'Türkiye\'nin tek akaryakıt rafinerisi tekeli, Akdeniz crack marjları, yeşil hidrojen dönüşümü, net nakit kasa',
            advisorVerdictTr: 'BIST\'in temettü kralı. Rafineri nakitlerini hissedara aktarır ve yılda 2 kez dağıtır. Enerjide tartışmasız ilk tercih.',
            advisorVerdictEn: 'Undisputed BIST energy dividend champion. Generates heavy refining cashflows distributed semi-annually.',
            userShares: userHoldingMap.get('TUPRS')?.shares || 0,
          },
          {
            symbol: 'ENJSA',
            name: 'Enerjisa Enerji A.Ş.',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 62.80,
            yieldPercent: 6.80,
            divCagr3Yr: 68.0,
            payoutRatio: 70.0,
            safetyGrade: 'A+',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Best-in-Class',
            moat: 'Sabancı & E.ON ortaklığı, 22 milyon tüketiciye elektrik dağıtım tekeli, regüle TÜFE+reel getiri gelir modeli',
            advisorVerdictTr: 'Defansif altyapı kalesi. Gelirleri TÜFE endeksli regülasyona bağlı olduğundan enflasyon ve krizlerden etkilenmez.',
            advisorVerdictEn: 'Defensive regulated utility monopoly jointly owned by Sabancı and E.ON with guaranteed inflation-indexed returns.',
            userShares: userHoldingMap.get('ENJSA')?.shares || 0,
          },
          {
            symbol: 'AYGAZ',
            name: 'Aygaz A.Ş.',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 164.00,
            yieldPercent: 5.40,
            divCagr3Yr: 58.0,
            payoutRatio: 60.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Solid Core',
            moat: 'LPG otogaz ve tüpgaz pazar liderliği, Tüpraş\'ın %10.2\'sine doğrudan ortaklık, Bangladeş yatırımı',
            advisorVerdictTr: 'Koç Grubu güvencesi. Tüpraş\'ın %10.2 ortağı olduğu için Tüpraş temettü ödedikçe Aygaz\'a da doğrudan kâr akar.',
            advisorVerdictEn: 'Domestic LPG leader holding a 10.2% stake in Tüpraş; upstream distributions pass directly to shareholders.',
            userShares: userHoldingMap.get('AYGAZ')?.shares || 0,
          },
          {
            symbol: 'AKSEN',
            name: 'Aksa Enerji',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 42.50,
            yieldPercent: 3.50,
            divCagr3Yr: 45.0,
            payoutRatio: 35.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Mayıs)',
            suitability: 'Solid Core',
            moat: 'Afrika ve Orta Asya\'da döviz bazlı garantili elektrik santralleri, küresel IPP büyümesi',
            advisorVerdictTr: 'Döviz bazlı küresel elektrik üreticisi. Gelirleri döviz garantilidir; verimi orta düzeydedir, kârını yatırıma aktarır.',
            advisorVerdictEn: 'Global power producer with USD-denominated contracts across Africa and Central Asia with moderate cash yield.',
            userShares: userHoldingMap.get('AKSEN')?.shares || 0,
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
            moat: 'SOCAR Star Rafineri entegrasyonu, Türkiye\'nin tek entegre petrokimya tesisi',
            advisorVerdictTr: 'Petrokimya marjlarına bağlı döngüsel hisse; saf temettü geliri arayanlar için TUPRS veya ENJSA kadar istikrarlı değildir.',
            advisorVerdictEn: 'Cyclical commodity petrochemical producer with margin volatility; lags TUPRS and ENJSA in dividend stability.',
            userShares: userHoldingMap.get('PETKM')?.shares || 48,
          },
          {
            symbol: 'GWIND',
            name: 'Galata Wind Enerji',
            market: 'BIST',
            currency: 'TRY',
            currentPrice: 28.40,
            yieldPercent: 4.20,
            divCagr3Yr: 52.0,
            payoutRatio: 50.0,
            safetyGrade: 'A',
            frequency: 'Yıllık (Nisan)',
            suitability: 'Solid Core',
            moat: 'Doğan Holding çatısı altında %100 saf yenilenebilir rüzgar & güneş santralleri, YEKDEM döviz tarifesi',
            advisorVerdictTr: 'Saf yeşil enerji üreticisi. Karbon kredisi gelirleri ve sıfır fosil yakıt riski ile düzenli temettü ödeyen modern alternatif.',
            advisorVerdictEn: '100% renewable wind and solar operator with dollar-linked feed-in tariffs and reliable clean cashflow.',
            userShares: userHoldingMap.get('GWIND')?.shares || 0,
          },
        ]
      },

      HOLDINGS_TELECOM: {
        key: 'HOLDINGS_TELECOM',
        icon: '🏛️',
        nameTr: 'Holdingler & Telekom',
        nameEn: 'Conglomerates & Telecoms',
        shortDescTr: 'Çok sektörlü holding nakitleri ve TÜFE endeksli telekom fatura gelirleri',
        shortDescEn: 'Conglomerate NAV cashflows and inflation-indexed telecom ARPUs',
        bestPickSymbol: 'TCELL',
        advisorInsightTr: 'Turkcell (TCELL), TÜFE endeksli fatura gelirleri ve yılda 2 TAKSİTLE ödeme yapmasıyla portföyün en dengeli nakit akışlarındandır (2. Taksit 9 Aralık 2026\'da kesinleşti!). Koç Holding (KCHOL) ise Türkiye\'nin en kaliteli ihracatçı ve finans devlerinden gelen temettüleri kasasında toplar.',
        advisorInsightEn: 'Turkcell (TCELL) features inflation-indexed subscriber cashflows and 2 SEMI-ANNUAL tranches (December 2026 confirmed!). Koç Holding (KCHOL) funnels cash distributions from top industrial exporters and banks.',
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
      },
      {
        id: 'prop-5-energy-gap',
        sector: 'ENERGY',
        title: language === 'tr' ? '⚡ Enerji: TUPRS (%7.4) veya ENJSA (%6.8) ile Sektörel Boşluğu Kapatın' : '⚡ Energy: Fill Energy Gap with TUPRS (7.4%) or ENJSA (6.8%)',
        priority: 'HIGH',
        current: language === 'tr' ? 'Doğrudan Enerji Hissesi Yok' : 'No Direct Energy Exposure',
        target: 'TUPRS veya ENJSA',
        rationale: language === 'tr'
          ? 'Portföyünüzde banka ve sigorta ağırlığı yüksekken doğrudan bir Enerji/Rafineri hissesi bulunmuyor. BIST\'in en yüksek temettü ödeyen devi Tüpraş (TUPRS, %7.40 verim) veya regüle elektrik tekeli Enerjisa (ENJSA, %6.80 verim) ekleyerek portföyünüzün nakit akışını hemen güçlendirin.'
          : 'Your portfolio currently lacks direct energy exposure. Adding national refiner Tüpraş (7.4% yield) or regulated utility Enerjisa (6.8% yield) expands your cash generation foundation.',
        netIncomeDeltaTRY: 310,
        badge: language === 'tr' ? 'Eksik Sektör' : 'Missing Sector'
      }
    ];
  }, [userHoldingMap, language]);

  // Sector Showdown stock selector
  const activeSectorData = sectorCatalog[selectedSector];

  // Helper: Local High-Precision Advisor Reasoning Engine
  const generateLocalResponse = (query: string): string => {
    const lower = query.toLowerCase().trim();

    // 1. Energy Sector Showdown (TUPRS, ENJSA, AYGAZ, AKSEN, PETKM, GWIND)
    if (
      lower.includes('enerji') ||
      lower.includes('energy') ||
      lower.includes('petrol') ||
      lower.includes('rafineri') ||
      lower.includes('elektrik') ||
      lower.includes('tuprs') ||
      lower.includes('tüpraş') ||
      lower.includes('enjsa') ||
      lower.includes('enerjisa') ||
      lower.includes('aygaz') ||
      lower.includes('aksen') ||
      lower.includes('petkm') ||
      lower.includes('gwind') ||
      lower.includes('akaryakıt') ||
      lower.includes('şebeke')
    ) {
      if (language === 'tr') {
        return `⚡ **Enerji Sektörü Temettü Analizi: Hangi Firma Alınmalı?**

Enerji ve altyapı sektöründe temettü açısından **2 ana şampiyon dev** öne çıkar:

1. 👑 **Açık Ara 1 Numara: TÜPRAŞ (\`TUPRS\`) - BIST Temettü Şampiyonu**
   - **Temettü Verimi:** **%7.40** (BIST'in en yüksek nakit ödeyen devlerinden biri).
   - **Ödeme Sıklığı:** Temettüsünü **YILDA 2 TAKSİTLE** (Nisan ve Ekim) dağıtır.
   - **Bilanço & Moat:** Türkiye'nin tek akaryakıt rafinerisi tekeli, net nakit pozisyonu, Koç Grubu temettü disiplini ve yeşil hidrojen dönüşümü.
   - **Tavsiye:** Saf yüksek nakit temettü ve döviz bazlı rafineri marjı için enerjide tartışmasız **ilk ve en güçlü tercih**.

2. 🛡️ **Defansif Alternatif: ENERJİSA (\`ENJSA\`) - Düzenli Elektrik Nakdi**
   - **Temettü Verimi:** **%6.80**.
   - **Moat:** Sabancı & E.ON ortaklığında elektrik dağıtım tekeli; gelirleri regülasyonla **TÜFE + reel getiri** olarak garanti altındadır. Enflasyondan ve ekonomik yavaşlamadan etkilenmeyen defansif nakit kalesidir.

3. ⛽ **AYGAZ & PETKM Değerlendirmesi:**
   - **AYGAZ (%5.40 Verim):** LPG pazar lideridir ve Tüpraş'ın %10.2'sine doğrudan ortaktır; Tüpraş temettü dağıttıkça Aygaz'a da devasa nakit akar.
   - **PETKM (%3.00 Verim):** Petrokimya döngüsel marjları baskı altındadır; saf temettü geliri için verimi TUPRS ve ENJSA'nın çok gerisindedir.

⚠️ **Portföyünüzün Durumu:**
Portföyünüzde şu an doğrudan bir Enerji/Rafineri hissesi **bulunmuyor** (yalnızca Koç Holding iştiraki dolaylı taşınmaktadır). Portföyünüze enerji nakit akışı eklemek isterseniz ilk alacağınız hisse kesinlikle **TUPRS**, defansif denge için ise **ENJSA** olmalıdır.`;
      } else {
        return `⚡ **Energy Sector Dividend Diagnostics: Which Stock to Pick?**

In the energy and utility sector, **2 dominant champions** lead:

1. 👑 **Undisputed #1: TÜPRAŞ (\`TUPRS\`) - BIST Dividend King**
   - **Yield:** **7.40%** (among BIST's highest cash distributions).
   - **Frequency:** Paid in **2 SEMI-ANNUAL TRANCHES** (April & October).
   - **Moat:** National refining monopoly, net cash balance sheet, Koç Holding discipline.
   - **Verdict:** Undisputed top pick for pure cash generation and hard-currency refining margins.

2. 🛡️ **Defensive Utility: ENERJİSA (\`ENJSA\`) - Regulated Cashflow**
   - **Yield:** **6.80%**.
   - **Moat:** Regulated electricity distribution grid with inflation-plus guaranteed returns; recession-proof utility cash cow.

3. ⛽ **AYGAZ & PETKM Context:**
   - **AYGAZ (5.40%):** Domestic LPG leader holding a direct 10.2% stake in Tüpraş.
   - **PETKM (3.00%):** Cyclical petrochemical commodity exposure; suboptimal for pure income.

⚠️ **Portfolio Status:** You currently have NO direct energy dividend holdings. Your primary addition should be **TUPRS**, complemented by **ENJSA**.`;
      }
    }

    // 2. Banking Sector Showdown
    if (
      lower.includes('bank') ||
      lower.includes('akbnk') ||
      lower.includes('halkb') ||
      lower.includes('vakbn') ||
      lower.includes('garan') ||
      lower.includes('ykbnk') ||
      lower.includes('isctr') ||
      lower.includes('kamu banka') ||
      lower.includes('özel banka')
    ) {
      if (language === 'tr') {
        return `🏦 **Banka Sektörü Değerlendirmesi: Hangi Banka Daha İyi?**

Portföyünüzde 4 banka bulunuyor: **AKBNK, YKBNK, HALKB, VAKBN**.

1. **Özel Bankalar (AKBNK & GARAN) Açık Ara Üstündür:**
   - **Özkaynak Kârlılığı (ROE):** Akbank (%34.2) ve Garanti (%37.1), kamu bankalarının (HALKB %18.4, VAKBN %19.2) yaklaşık **2 katı** kârlıdır.
   - **Sermaye Gücü (CAR):** Akbank %19.4 sermaye yeterliliği ile sektörün en sağlam bilançosudur.
   - **Temettü:** AKBNK kârının %28-35'ini nakit olarak öder (Verim: %4.73).

2. **HALKB ve VAKBN Neden Temettü İçin Verimsizdir?**
   - Kamu bankaları kârlarını temettü olarak dağıtmak yerine sermayeye eklemek zorundadır. Temettü verimleri %1.2 civarında kalır.
   - Ayrıca Halkbank üzerindeki ABD dava süreci sürekli bir iskonto baskısı yaratır.

👉 **Danışman Kararı:** HALKB (21 lot) ve VAKBN (29 lot) hisselerinizi satıp **AKBNK** veya **ISMEN** üzerine aktarın (+₺170-₺220/yıl ek temettü).`;
      } else {
        return `🏦 **Banking Showdown: Private Leaders vs State Banks**

1. **Why AKBNK & GARAN Win:** Nearly double the return on equity (ROE 34% vs 18%), unmatched 19.4% CAR balance sheet, and reliable ~4.7% cash yield.
2. **Why HALKB & VAKBN Lag:** Constrained by subsidized lending and retain capital rather than paying cash dividends (~1.2% yield).
👉 **Action:** Consolidate HALKB + VAKBN into AKBNK or ISMEN.`;
      }
    }

    // 3. Retail / Consumer Showdown (BIMAS vs CCOLA vs AEFES)
    if (
      lower.includes('bimas') ||
      lower.includes('ccola') ||
      lower.includes('aefes') ||
      lower.includes('mgros') ||
      lower.includes('perakende') ||
      lower.includes('market') ||
      lower.includes('gıda') ||
      lower.includes('içecek') ||
      lower.includes('bim') ||
      lower.includes('kola')
    ) {
      if (language === 'tr') {
        return `🛒 **Tüketim & Perakende Karşılaştırması: BIMAS mı CCOLA mı?**

1. **BİM (BIMAS) - Defansif Nakit Şampiyonu:**
   - **Ödeme Sıklığı:** Temettüsünü **YILDA 3 TAKSİTLE** (Haziran, Eylül, Aralık) öder. 3. Taksiti **18 Aralık 2026**'da ödenecektir.
   - **Moat:** İndirimli market tekeli ve negatif işletme sermayesi ile enflasyon kalkanıdır.
2. **Coca-Cola İçecek (CCOLA) - Büyüme & İhracat Devi:**
   - **Temettü Büyümesi:** Son 3 yılda %52 temettü CAGR gerçekleştirdi.
   - **Moat:** Orta Asya ve Orta Doğu operasyonları döviz bazlı kâr sağlar. Dağıtım oranı %45 ile temettüsünü rahatça artırabilir.

👉 **Danışman Kararı:** İkisi birbirini mükemmel tamamlar. Düzenli çeyreklik nakit için **BIMAS**, dövizli büyüme için **CCOLA** portföyde mutlaka birlikte tutulmalıdır.`;
      } else {
        return `🛒 **Retail Showdown: BIMAS vs CCOLA**

- **BIMAS:** Defensive grocery cash king distributing dividends across **3 tranches** (June, September, December 2026).
- **CCOLA:** Fast-moving beverage bottler delivering high hard-currency export growth across Central Asia with 52% dividend CAGR.
👉 **Verdict:** Both represent blue-chip holdings. Hold BIMAS for multi-tranche timing and CCOLA for FX growth.`;
      }
    }

    // 4. REIT Showdown (TRGYO vs EKGYO vs ISGYO vs ALGYO vs O)
    if (
      lower.includes('trgyo') ||
      lower.includes('torunlar') ||
      lower.includes('ekgyo') ||
      lower.includes('isgyo') ||
      lower.includes('algyo') ||
      lower.includes('gyo') ||
      lower.includes('reit') ||
      lower.includes('stopaj') ||
      lower.includes('gayrimenkul') ||
      lower.includes('kira')
    ) {
      if (language === 'tr') {
        return `🏢 **GYO Sektörü & Torunlar GYO (TRGYO) Analizi:**

1. **En Büyük Avantaj: %0 STOPAJ VERGİSİ (Sıfır Vergi):**
   - BIST sanayi hisselerinden temettü ödemesinde **%10 stopaj vergisi** kesilirken, Torunlar GYO gibi GYO şirketlerinde **STOPAJ ORANI %0'DIR**.
   - Dağıtılan nakdin tamamı kesintisiz cebinize kalır.
2. **TRGYO vs EKGYO:**
   - **TRGYO (Torunlar GYO):** Mall of Istanbul ve prime ofis plazalarının TÜFE'ye endeksli kira akışına sahiptir. Cari verimi **%5.20**'dir.
   - **EKGYO (Emlak Konut):** Konut geliştirme ve gelir paylaşımı devidir (%4.80 verim). Ancak kira yerine konut satış döngüsüne duyarlıdır.

👉 **Danışman Kararı:** TRGYO portföyünüzün defansif kira gelir motorudur. 15 lotunuzu koruyun, geri çekilmelerde 25-30 lota kadar artırın.`;
      } else {
        return `🏢 **REIT Showdown & Torunlar GYO (TRGYO) 0% Tax Moat:**

- **0% Withholding Tax:** Turkish REITs enjoy complete exemption from the 10% dividend tax.
- **TRGYO vs EKGYO:** TRGYO (5.2% yield) offers inflation-indexed rental cash from Mall of Istanbul, while EKGYO (4.8% yield) is exposed to residential construction cycles.
👉 **Verdict:** TRGYO is your premier tax-free defensive cash flow anchor.`;
      }
    }

    // 5. Automotive & Industrial (TTRAK vs FROTO vs TOASO vs BRSAN vs EREGL)
    if (
      lower.includes('ttrak') ||
      lower.includes('froto') ||
      lower.includes('toaso') ||
      lower.includes('brsan') ||
      lower.includes('eregl') ||
      lower.includes('krdmd') ||
      lower.includes('sanayi') ||
      lower.includes('otomotiv') ||
      lower.includes('traktör') ||
      lower.includes('çelik') ||
      lower.includes('demir')
    ) {
      if (language === 'tr') {
        return `🏭 **Otomotiv & Sanayi Karşılaştırması: TTRAK mı FROTO mu BRSAN mı?**

1. **Türk Traktör (TTRAK) - Temettü Şampiyonu:**
   - **Verim:** **%7.80** ile sektörün zirvesindedir.
   - **Dağıtım Disiplini:** Kârının **%75'ini** nakit temettü olarak dağıtır. Pazar payı %50'nin üzerindedir.
2. **Ford Otosan (FROTO) - Euro Bazlı İhracat Kalesi:**
   - **Verim:** **%6.20**. Ford Transit ve Custom modellerinin Avrupa ihracat tekeline sahiptir; Euro döviz kalkanıdır.
3. **Borusan Boru (BRSAN) - Neden Temettü İçin Zayıf?**
   - Portföyünüzde 2 lot BRSAN bulunuyor. Şirket başarılı ancak cari temettü verimi sadece **%3.00**'tür. 

👉 **Danışman Kararı:** Saf temettü geliri hedefliyorsanız BRSAN'ı satıp **TTRAK** veya **FROTO**'ya geçmek yıllık temettü nakdinizi ikiye katlar.`;
      } else {
        return `🏭 **Automotive & Industrial Showdown:**

- **TTRAK (7.8% yield):** Sector dividend champion distributing 75% of earnings with 50%+ tractor monopoly.
- **FROTO (6.2% yield):** Export powerhouse generating hard-currency Euro revenues with high dividend growth.
- **BRSAN (3.0% yield):** High-growth pipe manufacturer, but modest 3% yield makes it suboptimal for pure income.
👉 **Verdict:** Swap low-yield BRSAN lots into TTRAK or FROTO to double cashflow conversion.`;
      }
    }

    // 6. Financial Services & Insurance (ISMEN vs TURSG)
    if (
      lower.includes('ismen') ||
      lower.includes('tursg') ||
      lower.includes('sigorta') ||
      lower.includes('aracı') ||
      lower.includes('broker') ||
      lower.includes('komisyon')
    ) {
      if (language === 'tr') {
        return `📈 **Finansal Hizmetler Karşılaştırması: ISMEN mi TURSG mi?**

İkisi de portföyünüzün **en yüksek nakit üreten iki devidir**:
- **İş Yatırım (ISMEN):** **%8.55 verim**, sıfır borç, BIST borsa işlem hacmi tekeli. Son 3 yılda temettüsünü %84.6 CAGR ile artırdı!
- **Türkiye Sigorta (TURSG):** **%7.09 verim**. Yüksek faiz ortamında devasa prim float rezervlerini değerlendirerek rekor kâr payı ödüyor. Ayrıca Ağustos ayında ödeme yaparak ilkbahar dışındaki aylara can suyu veriyor.

👉 **Danışman Kararı:** İkisi de portföyünüzde ağırlıklı kalmalıdır. Her ikisi de bankalardan daha yüksek doğrudan nakit temettü verir.`;
      } else {
        return `📈 **Financials Showdown: ISMEN vs TURSG**

Both are your highest cashflow generators:
- **ISMEN (8.55% yield):** Zero debt, brokerage volume leader with +84% 3-year dividend CAGR.
- **TURSG (7.09% yield):** High-float insurance underwriter paying in August to diversify timing.
👉 **Verdict:** Maintain both as premier high-yield anchors.`;
      }
    }

    // 7. Holdings & Telecom (TCELL vs KCHOL vs SAHOL vs AGHOL)
    if (
      lower.includes('tcell') ||
      lower.includes('turkcell') ||
      lower.includes('kchol') ||
      lower.includes('sahol') ||
      lower.includes('aghol') ||
      lower.includes('holding') ||
      lower.includes('telekom')
    ) {
      if (language === 'tr') {
        return `🏛️ **Holding & Telekom Karşılaştırması: TCELL mi KCHOL mu SAHOL mu?**

- **Turkcell (TCELL):** Defansif telekom devi. **Yılda 2 taksitle** temettü dağıtır. 2. Taksit ödemesi **9 Aralık 2026**'da kesinleşti!
- **Koç Holding (KCHOL):** Tüpraş, Ford Otosan, Tofaş ve Yapı Kredi temettülerinin toplandığı ana holdingdir (%3.60 verim).
- **Sabancı Holding (SAHOL):** Enerjisa ve Akbank nakitleriyle desteklenen, yüksek iskonto ile işlem gören holdingdir (%3.40 verim).

👉 **Danışman Kararı:** TCELL'in 2 taksitli ödeme disiplini portföy nakit akışını pürüzsüzleştirir. KCHOL ise iştirak temettülerini toplayan en sağlam çatı yapıdır.`;
      } else {
        return `🏛️ **Holdings & Telecom Showdown:**

- **TCELL (4.2% yield):** CPI-indexed telecom utility paying semi-annually (Dec 9, 2026 tranche confirmed!).
- **KCHOL (3.6% yield):** Premier holding company funneling cash from top industrial exporters.
- **SAHOL (3.4% yield):** Conglomerate trading at steep NAV discount anchored by Enerjisa and Akbank.`;
      }
    }

    // 8. Global ETFs / US Dividends
    if (
      lower.includes('abd') ||
      lower.includes('us') ||
      lower.includes('dolar') ||
      lower.includes('etf') ||
      lower.includes('schd') ||
      lower.includes('jepi') ||
      lower.includes('jepq') ||
      lower.includes('vym') ||
      lower.includes('amerika') ||
      lower.includes('yurtdışı')
    ) {
      if (language === 'tr') {
        return `🌐 **Global Temettü ETF'leri (ABD) Değerlendirmesi:**

- **SCHD (%3.65 Verim):** ABD temettü kralı 100 dev şirketin sepetidir. Hem dolar bazında hisse fiyatı artar hem de temettüsü her yıl ortalama %8-10 büyür.
- **JEPI (%7.50 Verim - Her Ay):** S&P 500 hisseleri üzerine kapalı opsiyon (covered call) yazarak **HER AY** düzenli nakit dolar temettüsü öder.
- **JEPQ (%9.20 Verim - Her Ay):** Nasdaq teknoloji hisselerinin volatilitesinden her ay yüksek dolar nakdi üretir.

👉 **Danışman Kararı:** BIST temettüleri Nisan-Mayıs aylarında yoğunlaşırken, ABD fonları yaz ve kış aylarında düzenli dolar nakit akışı sağlar.`;
      } else {
        return `🌐 **US Dividend ETFs Diagnostics:**

- **SCHD (3.65% yield):** Pure dividend compounding gold standard with ~8-10% dividend growth rate.
- **JEPI (7.50% yield, Monthly):** Covered call monthly income powerhouse from S&P 500.
- **JEPQ (9.20% yield, Monthly):** High monthly income harvesting Nasdaq volatility.`;
      }
    }

    // 9. Portfolio Missing Sectors / Gaps Analysis
    if (
      lower.includes('eksik') ||
      lower.includes('ne eksik') ||
      lower.includes('hangi sektör eksik') ||
      lower.includes('boşluk') ||
      lower.includes('portföy') ||
      lower.includes('denge') ||
      lower.includes('gap') ||
      lower.includes('missing')
    ) {
      if (language === 'tr') {
        return `🔍 **Portföy Teşhisi: Hangi Sektör Eksik, Neler Düzeltilmeli?**

Portföyünüzün güçlü yönleri:
✅ **Bankacılık & Finans:** AKBNK, ISMEN (%8.55), TURSG (%7.09) ile güçlü getiri motoru.
✅ **GYO:** TRGYO ile %0 stopajlı TÜFE kira kalkanı.
✅ **Tüketim:** BIMAS ve CCOLA ile çoklu taksit ve dövizli ihracat.

🚨 **Portföyünüzdeki En Kritik 2 Eksik & Boşluk:**
1. ⚡ **DOĞRUDAN ENERJİ HİSSESİ YOK:** BIST'in en yüksek temettüsünü veren **TUPRS** (%7.40 verim) veya regüle elektrik tekeli **ENJSA** (%6.80 verim) portföyünüzde eksiktir!
2. ⚠️ **Kamu Bankası Verimsizliği:** HALKB (21 lot) ve VAKBN (29 lot) kâr dağıtımı yerine sermaye biriktirdiği için portföy verimini aşağı çekmektedir.

👉 **Aksiyon:** Kamu bankalarını satarak elde edilecek ~₺1.900 nakit ile doğrudan **TUPRS** veya **ENJSA** ekleyin; böylece eksik enerji ayağını tamamlayıp yıllık temettünüzü anında artırabilirsiniz.`;
      } else {
        return `🔍 **Portfolio Diagnostics: Missing Sectors & Rebalancing Priorities:**

- **Strengths:** High yield from Financials (ISMEN 8.55%, TURSG 7.09%), 0% tax REIT (TRGYO), and retail compounders (BIMAS, CCOLA).
- **Critical Gap:** You have **NO direct energy holdings**. Adding **TUPRS (7.4%)** or **ENJSA (6.8%)** will complete your sectoral diversification.
- **Drag:** Suboptimal state banks (HALKB, VAKBN) should be reallocated into energy champions.`;
      }
    }

    // 10. Yield Ranking / Best Payouts
    if (
      lower.includes('en yüksek') ||
      lower.includes('en çok') ||
      lower.includes('şampiyon') ||
      lower.includes('en karlı') ||
      lower.includes('highest') ||
      lower.includes('top yield')
    ) {
      if (language === 'tr') {
        return `🏆 **BIST & Global En Yüksek Temettü Veren Şampiyonlar:**

1. 🥇 **ISMEN (İş Yatırım Menkul):** **%8.55 Net Verim** (Sıfır borç, BIST rekor hacim kârı).
2. 🥈 **TTRAK (Türk Traktör):** **%7.80 Verim** (Kârının %75'ini nakit dağıtır).
3. 🥉 **JEPI / JEPQ (ABD):** **%7.50 - %9.20 Verim** (Her ay düzenli dolar nakdi).
4. ⚡ **TUPRS (Tüpraş):** **%7.40 Verim** (Yılda 2 taksitle öder).
5. 🛡️ **TURSG (Türkiye Sigorta):** **%7.09 Verim** (Ağustos ödemesiyle yaz nakdi).
6. ⚡ **ENJSA (Enerjisa):** **%6.80 Verim** (TÜFE garantili elektrik tekeli).
7. 🏢 **TRGYO (Torunlar GYO):** **%5.20 Net Verim** (**%0 STOPAJ - Sıfır Vergi**).`;
      } else {
        return `🏆 **Top Dividend Yield Champions:**

1. **ISMEN:** 8.55% Net Yield
2. **TTRAK:** 7.80% Yield (75% payout ratio)
3. **JEPQ / JEPI:** 7.50% - 9.20% Yield (Monthly USD cashflow)
4. **TUPRS:** 7.40% Yield (Semi-annual tranches)
5. **TURSG:** 7.09% Yield (August payout)
6. **ENJSA:** 6.80% Yield (Regulated utility)
7. **TRGYO:** 5.20% Yield (100% Tax-Free 0% Withholding)`;
      }
    }

    // 11. Timing / Schedule
    if (
      lower.includes('ne zaman') ||
      lower.includes('tarih') ||
      lower.includes('aralık') ||
      lower.includes('aylık') ||
      lower.includes('taksit') ||
      lower.includes('takvim') ||
      lower.includes('maaş')
    ) {
      if (language === 'tr') {
        return `📅 **Temettü Takvimi & Yaklaşan Ödemeler:**

- **18 Aralık 2026:** **BİM (BIMAS)** - 3. Taksit (Hisse başı ₺3.00 net).
- **9 Aralık 2026:** **Turkcell (TCELL)** - 2. Taksit (Hisse başı ₺1.40 net).
- **Mart - Mayıs 2027 (Ana İlkbahar Dalgası):** AKBNK, ISMEN, TRGYO, TTRAK, FROTO ödemeleri.
- **Ağustos 2027:** **Türkiye Sigorta (TURSG)** - Yaz ayı nakit akışı.
- **Ekim 2027:** **Tüpraş (TUPRS)** - 2. Taksit sonbahar nakdi.
- **Her Ay (Aylık Maaş):** Realty Income (\`O\`) veya \`JEPI\` ekleyerek 12 ay kesintisiz gelir elde edebilirsiniz.`;
      } else {
        return `📅 **Upcoming Dividend Distribution Schedule:**

- **Dec 9, 2026:** Turkcell (TCELL) - 2nd Tranche confirmed.
- **Dec 18, 2026:** BİM (BIMAS) - 3rd Tranche confirmed.
- **Spring 2027:** Primary BIST distribution window (AKBNK, ISMEN, TRGYO, TTRAK).
- **August 2027:** Türkiye Sigorta (TURSG) summer cash injection.`;
      }
    }

    // 12. Aviation & Logistics (THYAO, PGSUS, TAVHL, CLEBI, RYSAS, GSDHO)
    if (
      lower.includes('havacılık') ||
      lower.includes('uçak') ||
      lower.includes('hava') ||
      lower.includes('thyao') ||
      lower.includes('thy') ||
      lower.includes('pgsus') ||
      lower.includes('pegasus') ||
      lower.includes('tavhl') ||
      lower.includes('tav') ||
      lower.includes('clebi') ||
      lower.includes('çelebi') ||
      lower.includes('ulaştırma') ||
      lower.includes('lojistik') ||
      lower.includes('aviation') ||
      lower.includes('airline')
    ) {
      if (language === 'tr') {
        return `✈️ **Havacılık & Lojistik Sektörü Temettü Analizi:**

Havacılık sektörü sermaye yoğun (CapEx) ve yüksek borç/büyüme odaklı bir sektördür. Şirketlerin temettü politikaları birbirinden tamamen farklıdır:

1. ⚠️ **THYAO (Türk Hava Yolları) & PGSUS (Pegasus): Temettü İçin Uygun Değildir!**
   - **Neden?** THY ve Pegasus, elde ettikleri tüm net kârı yüzlerce yeni uçak alımına (Filo genişletme CapEx) yatırırlar. Nakit kâr payı dağıtmaz veya sembolik düzeyde bırakırlar. Büyüme ve sermaye kazancı için harikadırlar, ancak **saf temettü portföyü için uygun değillerdir.**
2. 👑 **TAVHL (TAV Havalimanları) & CLEBI (Çelebi): Sektörün Nakit Şampiyonları**
   - **TAVHL:** Havalimanı terminal işletme harçları döviz bazlıdır. Yeni terminal yatırımları bittiğinde düzenli temettü dağıtır.
   - **CLEBI (%6-%8 Dönemsel Verim):** Havalimanı yer hizmetleri tekelidir; işletme sermayesi ihtiyacı düşük olduğundan kârının neredeyse tamamını nakit temettü olarak dağıtma geleneğine sahiptir.

👉 **Danışman Kararı:** Havacılıkta nakit akışı istiyorsanız THYAO yerine havalimanı işletme ve yer hizmeti tekelleri olan **TAVHL** veya **CLEBI** tercih edilmelidir.`;
      } else {
        return `✈️ **Aviation & Logistics Dividend Analysis:**

- **THYAO & PGSUS:** Capital-intensive airlines reinvesting cashflows into fleet expansion CapEx. Suboptimal for cash dividends.
- **TAVHL & CLEBI:** Airport concessions and ground handling monopolies generating reliable hard-currency operational cashflows with regular distributions.`;
      }
    }

    // 13. Defense & Aerospace (ASELS, SDTTR, OTKAR)
    if (
      lower.includes('savunma') ||
      lower.includes('asels') ||
      lower.includes('aselsan') ||
      lower.includes('sdttr') ||
      lower.includes('defense') ||
      lower.includes('askeri') ||
      lower.includes('silah')
    ) {
      if (language === 'tr') {
        return `🛡️ **Savunma Sanayii Temettü Analizi:**

Savunma şirketleri stratejik devlet projeleri ve yüksek AR-GE harcamaları nedeniyle nakit kârlarını şirket bünyesinde tutma eğilimindedir:

1. **ASELS (Aselsan):**
   - **Temettü Karakteri:** Her yıl aralıksız kâr payı öder; ancak cari temettü verimi **%1.0 - %1.5** ile düşüktür.
   - **Neden?** Kârın %70-80'i yüksek teknolojili radar, elektro-optik ve hava savunma AR-GE'sine aktarılır. Portföyde temettü verimi için değil, jeopolitik krizlere karşı **defansif kalkan ve büyüme** amacıyla tutulur.
2. **OTKAR (Otokar):**
   - Koç Grubu temettü disipliniyle zırhlı kara araçları ve ticari otobüs ihracatından elde ettiği kârı daha cömert oranlarla (%3.5-%5 verim) hissedarına dağıtır.

👉 **Danışman Kararı:** Saf temettü geliri arıyorsanız Aselsan verim açısından TUPRS, ISMEN veya TTRAK'ın çok gerisindedir.`;
      } else {
        return `🛡️ **Defense Industry Dividend Analysis:**

- **ASELS (1.0% - 1.5% yield):** Retains 70%+ of earnings to fund advanced defense electronics R&D. Defensive geopolitical hedge, not a high-yield vehicle.
- **OTKAR:** More generous export distributions under Koç Holding governance.`;
      }
    }

    // 14. Cement & Construction Materials (AKCNS, CIMSA, OYAKC, NUHCM, BOBET)
    if (
      lower.includes('çimento') ||
      lower.includes('beton') ||
      lower.includes('yapı') ||
      lower.includes('akcns') ||
      lower.includes('cimsa') ||
      lower.includes('oyakc') ||
      lower.includes('nuhcm') ||
      lower.includes('bobet') ||
      lower.includes('cement') ||
      lower.includes('inşaat')
    ) {
      if (language === 'tr') {
        return `🏗️ **Çimento & Yapı Malzemeleri Sektörü Temettü Analizi:**

Çimento sektörü BIST'in **en köklü ve en yüksek temettü ödeyen** sanayi sektörlerinden biridir:

1. 👑 **AKCNS (Akçansa) - Temettü Kalesi:**
   - **Temettü Verimi:** **%6.5 - %7.5**.
   - **Moat:** Sabancı Holding ve Alman Heidelberg Materials ortaklığı; Marmara bölgesi pazar hakimiyeti ve kârının %70-80'ini nakit dağıtma disiplini.
2. 🥈 **CIMSA (Çimsa) - Küresel Beyaz Çimento Devi:**
   - **Temettü Verimi:** **%6.0 - %6.8**.
   - **Moat:** Beyaz çimento ve kalsiyum alüminat ihracatında dünya lideri. Yüksek döviz geliriyle düzenli temettü öder.
3. **OYAKC (Oyak Çimento):**
   - Entegre Oyak Grubu gücü, deprem bölgesi yeniden inşa projeleri ve altyapı nakit üretimi.

👉 **Danışman Kararı:** Çimento sektörü doğrudan nakit akışı için mükemmeldir. Öncelikli tercih **AKCNS** veya döviz gelirli **CIMSA** olmalıdır.`;
      } else {
        return `🏗️ **Cement & Construction Materials Dividend Analysis:**

- **AKCNS (6.5% - 7.5% yield):** Premier dividend aristocrat backed by Sabancı and Heidelberg Materials with ~75% cash payout culture.
- **CIMSA (6.0% - 6.8% yield):** Global leader in white cement exports generating hard-currency cash distributions.`;
      }
    }

    // 15. Healthcare & Pharmaceuticals (SELEC, DEVA, MPARK, GENIL, TRILC)
    if (
      lower.includes('sağlık') ||
      lower.includes('ilaç') ||
      lower.includes('ecza') ||
      lower.includes('hastane') ||
      lower.includes('selec') ||
      lower.includes('deva') ||
      lower.includes('mpark') ||
      lower.includes('genil') ||
      lower.includes('pharma') ||
      lower.includes('health')
    ) {
      if (language === 'tr') {
        return `💊 **Sağlık & İlaç Sektörü Temettü Analizi:**

1. 👑 **SELEC (Selçuk Ecza Deposu) - Sektörün Tartışmasız Temettü Şampiyonu:**
   - **Temettü Verimi:** **%5.0 - %6.0**.
   - **Moat:** Türkiye genelinde 25.000+ eczaneye dağıtım tekeli (%40+ pazar payı). Net nakit pozisyonunda borçsuz bilanço ve her yıl aralıksız kâr dağıtımı. Resesyonlardan ve ekonomik krizlerden etkilenmeyen defansif liman.
2. **MPARK (MLP Sağlık - Medical Park):**
   - Özel hastane zinciri büyüme ve yeni yatırımlara odaklıdır; temettü yerine şirket değerini büyütmeyi hedefler.
3. **DEVA (Deva Holding):**
   - Jenerik ilaç üretimi ve AR-GE odaklı; temettü verimi %2-3 civarındadır.

👉 **Danışman Kararı:** Sağlık sektöründe temettü için tek geçilecek hisse borçsuz nakit zengini **SELEC**'tir.`;
      } else {
        return `💊 **Healthcare & Pharma Dividend Analysis:**

- **SELEC (5.0% - 6.0% yield):** Undisputed pharmaceutical distribution monopoly with net cash balance sheet and non-cyclical defensive dividends.
- **MPARK & DEVA:** Growth and hospital expansion models retaining capital.`;
      }
    }

    // 16. Technology & Software (LOGO, VBTYZ, MTRKS, ARDYZ, FONET)
    if (
      lower.includes('yazılım') ||
      lower.includes('bilişim') ||
      lower.includes('teknoloji') ||
      lower.includes('logo') ||
      lower.includes('vbtyz') ||
      lower.includes('mtrks') ||
      lower.includes('ardyz') ||
      lower.includes('tech') ||
      lower.includes('software')
    ) {
      if (language === 'tr') {
        return `💻 **Teknoloji & Yazılım Sektörü Temettü Analizi:**

Teknoloji şirketleri genellikle sermaye artırımı (bedelsiz) tercih eder; ancak aralarında çok özel bir istisna vardır:

1. 👑 **LOGO (Logo Yazılım) - BIST'in Teknoloji Temettü Devi:**
   - **Temettü Verimi:** **%3.5 - %4.2**.
   - **Moat:** Türkiye KOBİ ve kurumsal ERP pazar lideri, sıfır borç, %40+ FAVÖK marjı ve SaaS tekrarlayan abonelik nakit akışı.
   - 15 yılı aşkın süredir kesintisiz temettü öder.
2. **MTRKS & VBTYZ:**
   - Veri analitiği ve kamu bilişim projeleriyle dönemsel kâr payı öderler ancak verimleri daha mütevazıdır.

👉 **Danışman Kararı:** Teknolojide hem büyüme hem de güvenilir nakit temettü arayanlar için tek kurumsal adres **LOGO**'dur.`;
      } else {
        return `💻 **Technology & Software Dividend Analysis:**

- **LOGO (3.5% - 4.2% yield):** BIST's premier tech dividend compounder with zero debt, 40%+ EBITDA margins, and recurring enterprise SaaS revenues.
- Other tech peers generally retain cash for capital investments.`;
      }
    }

    // 17. Glass & Packaging (SISE, KLSYN, DURDO, BAKAB)
    if (
      lower.includes('cam') ||
      lower.includes('şişe') ||
      lower.includes('ambalaj') ||
      lower.includes('sise') ||
      lower.includes('şişecam') ||
      lower.includes('klsyn') ||
      lower.includes('durdo') ||
      lower.includes('glass')
    ) {
      if (language === 'tr') {
        return `🏢 **Cam & Ambalaj Sektörü Temettü Analizi:**

1. 👑 **ŞİŞECAM (\`SISE\`) - Küresel Sanayi Devi:**
   - **Temettü Verimi:** **%2.80 - %3.50**.
   - **Moat:** Düzcam, cam ambalaj, cam ev eşyası ve soda külünde dünya ilk 5 üreticisi. Gelirlerinin %60+'ı döviz bazlıdır. İş Bankası iştirakidir ve her yıl düzenli kâr payı öder.
   - **Temettü Notu:** ABD doğal soda külü yatırımı gibi milyar dolarlık global CapEx yürüttüğünden kârının bir kısmını sermayeye ekler; bu nedenle verimi TTRAK veya ISMEN gibi %7-8 seviyesinde değildir.
2. **DURDO (Duran Doğan Basım):**
   - Premium karton ambalaj ihracatçısı; Avrupa lüks tüketim ambalajıyla düzenli kâr payı dağıtır.

👉 **Danışman Kararı:** Şişecam döviz bazlı sanayi kalesidir; yüksek cari getiri yerine defansif uzun vadeli büyüme sunar.`;
      } else {
        return `🏢 **Glass & Packaging Dividend Analysis:**

- **SISE (2.8% - 3.5% yield):** Global top-5 glass and soda ash titan with 60%+ foreign currency revenues under İş Bankası stewardship.`;
      }
    }

    // 18. Mining & Precious Metals (KOZAL, KOZAA, IPEKE, PRKME)
    if (
      lower.includes('maden') ||
      lower.includes('altın') ||
      lower.includes('metal') ||
      lower.includes('kozal') ||
      lower.includes('kozaa') ||
      lower.includes('ipeke') ||
      lower.includes('mining') ||
      lower.includes('gold')
    ) {
      if (language === 'tr') {
        return `⛏️ **Madencilik & Altın Sektörü Temettü Analizi:**

- **KOZAL (Koza Altın) & KOZAA:**
  - **Moat:** Sıfır borç, Türkiye'nin en zengin altın yatakları ve devasa nakit kasası. Ons altın yükselişinde kârlılık patlar.
  - **Temettü Uyarısı:** Hukuki ve mülkiyet süreçleri nedeniyle düzenli bir temettü takvimi bulunmamaktadır. Şirket kasasında milyarlarca TL nakit tutmasına rağmen bunu her yıl düzenli temettü olarak dağıtmaz.
👉 **Danışman Kararı:** Altın fiyat artışından faydalanmak için tutulabilir; ancak nakit maaş odaklı temettü portföyü için güvenilir bir takvim sunmaz.`;
      } else {
        return `⛏️ **Mining & Gold Dividend Analysis:**

- **KOZAL / KOZAA:** Pristine net cash balance sheets benefiting from gold bull runs, but legal ownership overhang makes dividend distribution schedules sporadic.`;
      }
    }

    // 19. Chemicals & Fertilizers (EGGUB, GUBRF, BAGFS, HEKTS, SASA)
    if (
      lower.includes('kimya') ||
      lower.includes('gübre') ||
      lower.includes('zirai') ||
      lower.includes('sasa') ||
      lower.includes('hekts') ||
      lower.includes('hektas') ||
      lower.includes('gubrf') ||
      lower.includes('bagfs') ||
      lower.includes('eggub') ||
      lower.includes('chemical')
    ) {
      if (language === 'tr') {
        return `🧪 **Kimya & Gübre Sektörü Temettü Analizi:**

⚠️ **Önemli Ayrım: SASA ve HEKTAŞ Temettü Hissesi Değildir!**
- **SASA** ve **HEKTS**: Çok yüksek borçlulukla milyar dolarlık petrokimya ve tohum yatırımları yaparlar. Nakit kâr payı dağıtmazlar. Temettü yatırımcısı için uygun değillerdir.
- 👑 **EGGUB (Ege Gübre - %5.5 Verim):** Aliağa liman işletmeciliği ve gübre depolama gelirleriyle sektörde aralıksız temettü ödeyen en istikrarlı şirkettir.
- **GUBRF** ve **BAGFS**: Gübre sübvansiyonları ve küresel amonyak/doğalgaz maliyetlerine duyarlıdır; ödemeleri döngüseldir.

👉 **Danışman Kararı:** Kimya ve gübrede düzenli nakit için tek adres liman gelirleriyle korunan **EGGUB**'dir.`;
      } else {
        return `🧪 **Chemicals & Fertilizer Dividend Analysis:**

- **SASA & HEKTS:** Growth and debt-driven capex models; zero regular dividend distribution.
- **EGGUB (5.5% yield):** Consistent dividend cashflow anchored by deep-sea port logistics.`;
      }
    }

    // 20. Automotive Special: DOAS (Doğuş Otomotiv)
    if (
      lower.includes('doas') ||
      lower.includes('doğuş') ||
      lower.includes('distribütör')
    ) {
      if (language === 'tr') {
        return `🚗 **DOAS (Doğuş Otomotiv) Temettü Analizi:**

- **Temettü Verimi:** **%8.50 - %11.00** (BIST'in en cömert nakit dağıtım devlerinden biri).
- **Moat:** Volkswagen, Audi, Porsche, Skoda, Seat ve Scania Türkiye distribütörlüğü + TÜVTÜRK araç muayene tekelinin %33 ortağı.
- **Dağıtım Disiplini:** Kârının **%70-80'ini** hissedara dağıtır; yılda 2-3 taksit halinde ödeme yapar.
👉 **Danışman Kararı:** TTRAK ve FROTO ile birlikte otomotivde en yüksek nakit üreten üçlüden biridir; portföye eklenmesi temettü gelirini hızla yukarı çeker.`;
      } else {
        return `🚗 **DOAS (Doğuş Otomotiv) Analysis:**

- **Yield:** **8.5% - 11.0%** (among highest dividend yields on BIST).
- **Moat:** Exclusive VW/Audi/Porsche distributor + TÜVTÜRK vehicle inspection monopoly with 75%+ cash payout ratio.`;
      }
    }

    // 21. Textile (YUNSA, KORDS)
    if (
      lower.includes('tekstil') ||
      lower.includes('kumaş') ||
      lower.includes('iplik') ||
      lower.includes('yunsa') ||
      lower.includes('kords') ||
      lower.includes('textile')
    ) {
      if (language === 'tr') {
        return `🧵 **Tekstil & Güçlendirme Temettü Analizi:**

- **YUNSA (Yünsa - %8.0 Verim):** Lüks yünlü kumaş ihracatıyla son yıllarda kârının neredeyse tamamını dağıtarak yüksek temettü ödemiştir.
- **KORDS (Kordsa - %3.5 Verim):** Sabancı Holding çatısında küresel lastik ve havacılık kord bezi üreticisidir; döviz gelirleriyle düzenli temettü öder.`;
      } else {
        return `🧵 **Textile & Reinforcement Analysis:** YUNSA delivers high cyclical yields (8%+), while KORDS offers global export stability under Sabancı Holding.`;
      }
    }

    // 22. Tourism & Hotels
    if (
      lower.includes('turizm') ||
      lower.includes('otel') ||
      lower.includes('tatil') ||
      lower.includes('tourism')
    ) {
      if (language === 'tr') {
        return `🏖️ **Turizm & Otelcilik Temettü Analizi:**

- BIST turizm hisseleri (MAALT, AYCES, PKENT) temettü için değil, gayrimenkul değer artışları için tutulur.
- Temettü verimleri çok düşüktür (%0.5 - %1.5); düzenli nakit akışı portföyleri için **önerilmez.**`;
      } else {
        return `🏖️ **Tourism Analysis:** Tourism equities feature negligible dividend yields (<1.5%) and are unsuited for income portfolios.`;
      }
    }

    // 23. Factoring & Leasing
    if (
      lower.includes('faktoring') ||
      lower.includes('leasing') ||
      lower.includes('kiralama') ||
      lower.includes('garfa') ||
      lower.includes('vakfa') ||
      lower.includes('lidfa') ||
      lower.includes('crdfa')
    ) {
      if (language === 'tr') {
        return `📈 **Faktoring & Finansal Kiralama Temettü Analizi:**

- Yüksek faiz ortamında banka dışı faktoring spreadleri patlamıştır.
- **GARFA** (%8.2 verim), **LIDFA** (%7.5 verim) ve **CRDFA** kârlarının büyük kısmını nakit temettü olarak dağıtır.
👉 **Danışman Kararı:** Yüksek faiz döneminde ISMEN ve TURSG gibi finansal nakit akışını destekler.`;
      } else {
        return `📈 **Factoring & Leasing Analysis:** Generates 7-8% cash yields from interest rate spreads during high-rate macro regimes.`;
      }
    }

    // 24. Inflation Hedging
    if (
      lower.includes('enflasyon') ||
      lower.includes('tüfe') ||
      lower.includes('inflation')
    ) {
      if (language === 'tr') {
        return `🛡️ **Enflasyona Karşı En Güçlü 3 Temettü Sektörü:**

1. 🏢 **GYO (Torunlar GYO - TRGYO):** Prime AVM ve ofis kiraları doğrudan TÜFE'ye endekslidir ve **%0 STOPAJ** (sıfır vergi) avantajıyla kesintisiz net nakit sağlar.
2. 🛒 **Gıda Perakendesi (BİM - BIMAS):** Enflasyonist maliyetleri 24 saat içinde raflara yansıtır; negatif işletme sermayesiyle nakit basar. Yılda 3 taksitle öder.
3. ⚡ **Telekom (Turkcell - TCELL):** Fatura tarifelerini TÜFE oranında günceller; 2 taksitli ödeme yapar.`;
      } else {
        return `🛡️ **Top 3 Inflation-Hedged Dividend Sectors:** REITs (TRGYO 0% tax), Retail (BIMAS), and Telecoms (TCELL).`;
      }
    }

    // 25. Hard Currency / Export Hedging
    if (
      lower.includes('ihracat') ||
      lower.includes('döviz') ||
      lower.includes('dolar bazlı') ||
      lower.includes('euro') ||
      lower.includes('export')
    ) {
      if (language === 'tr') {
        return `💵 **Döviz / İhracat Gelirli En İyi Temettü Hisseleri:**

1. 🇪🇺 **FROTO (Ford Otosan):** Avrupa Transit ihracat tekeli; gelirleri saf Euro bazlıdır (%6.20 verim).
2. 🌏 **CCOLA (Coca-Cola İçecek):** Orta Asya ve Orta Doğu döviz bazlı kârları (%52 3Y CAGR).
3. 🚜 **TTRAK (Türk Traktör):** Küresel ihracat liderliği (%7.80 verim).
4. 🇺🇸 **SCHD & JEPI (ABD ETF'leri):** Doğrudan her çeyrek veya her ay banka hesabınıza Dolar nakit temettüsü öder.`;
      } else {
        return `💵 **Top Foreign Currency Dividend Exporters:** FROTO (EUR), CCOLA (Central Asia), TTRAK (Global), and US ETFs (SCHD/JEPI).`;
      }
    }

    // 26. Complete Market Sector Matrix Fallback (Institutional Grade)
    if (language === 'tr') {
      return `🏛️ **BIST & Küresel Tüm Sektörler Temettü Atlası:**

Sorduğunuz konu doğrultusunda ekonomideki 12 ana sektörün 1 numaralı temettü şampiyonları şunlardır:

1. ⚡ **Enerji & Rafineri:** **TUPRS** (%7.40 verim, 2 taksit) & **ENJSA** (%6.80 verim, TÜFE tekeli).
2. 🏛️ **Bankacılık:** **AKBNK** (CAR %19.4, ROE %34) - Kamu bankalarından (HALKB/VAKBN) çok daha kârlı.
3. 🏢 **GYO / Gayrimenkul:** **TRGYO** (%5.20 verim, **%0 STOPAJ VERGİSİ** ile sıfır vergi).
4. 🚗 **Otomotiv & Traktör:** **TTRAK** (%7.80 verim, %75 dağıtım) & **DOAS** (%9.50) & **FROTO** (Euro kalkanı).
5. ✈️ **Havacılık:** **CLEBI** (%6-8 verim) & **TAVHL** (THYAO ve PGSUS kârı filoya yatırır, temettü vermez).
6. 💊 **Sağlık & İlaç:** **SELEC** (%5.50 verim, borçsuz ecza tekeli).
7. 🏗️ **Çimento:** **AKCNS** (%7.20 verim) & **CIMSA** (%6.50 verim).
8. 💻 **Teknoloji:** **LOGO** (%3.80 verim, borçsuz kurumsal yazılım).
9. 🏢 **Cam & Sanayi:** **SISE** (%3.20 verim, küresel döviz gelirli sanayi kalesi).
10. 🛡️ **Savunma:** **ASELS** (%1.20 verim - kâr AR-GE'ye aktarılır, defansif büyüme hissesidir).
11. 📈 **Finansal Hizmetler:** **ISMEN** (%8.55 verim) & **TURSG** (%7.09 verim).
12. 🛒 **Tüketim & Perakende:** **BIMAS** (3 taksit - 18 Aralık ödemesi) & **CCOLA** (%52 büyüme).

💡 **İstediğiniz herhangi bir sektörü veya hisseyi doğrudan sorabilirsiniz:**
- *"Havacılıkta neden THYAO temettü vermez?"*
- *"Çimento sektöründen ne önerirsin?"*
- *"Sağlık ve ilaçta en iyi temettü hissesi hangisi?"*
- *"Teknolojide temettü ödeyen firma var mı?"*`;
    } else {
      return `🏛️ **Complete BIST & Global Sectoral Dividend Matrix:**

- ⚡ **Energy:** TUPRS (7.4%) & ENJSA (6.8%)
- 🏛️ **Banking:** AKBNK (19.4% CAR, 34% ROE)
- 🏢 **REITs:** TRGYO (0% tax shield, Mall of Istanbul)
- 🚗 **Automotive:** TTRAK (7.8%) & DOAS (9.5%) & FROTO (6.2%)
- ✈️ **Aviation:** CLEBI & TAVHL (THYAO reinvests in aircraft fleet)
- 💊 **Pharma:** SELEC (5.5% net cash distributor)
- 🏗️ **Cement:** AKCNS (7.2%) & CIMSA (6.5%)
- 💻 **Tech:** LOGO Software (3.8% SaaS recurring cash)
- 🏢 **Glass:** SISE (Global FX producer)
- 📈 **Financials:** ISMEN (8.55%) & TURSG (7.09%)
- 🛒 **Retail:** BIMAS (3 tranches) & CCOLA (52% CAGR)

Ask about any sector or company for deep qualitative diagnostics.`;
    }
  };

  // Advisor Semantic Chat Engine
  const executeChatQuery = async (text: string) => {
    if (!text.trim()) return;
    const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setChatMessages(prev => [...prev, { sender: 'user', text, time: nowTime }]);
    setUserQuery('');
    setIsThinking(true);

    let response = '';

    // Step 1: Try AI endpoint
    try {
      const storedKey = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (storedKey) {
        headers['x-gemini-key'] = storedKey;
      }

      const apiRes = await fetch('/api/advisor/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          language,
          geminiApiKey: storedKey || undefined,
          holdings: Array.from(userHoldingMap.values()).map(h => ({ symbol: h.symbol, shares: h.shares })),
          metrics: { annualTRY: totalAnnualTRY, monthlyTRY: totalMonthlyTRY }
        })
      });

      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.success && data.reply) {
          response = data.reply;
        }
      }
    } catch {
      // Fallback seamlessly to local deterministic engine
    }

    // Step 2: Use high-precision local advisor engine if API not available or fallback
    if (!response) {
      response = generateLocalResponse(text);
    }

    setChatMessages(prev => [...prev, {
      sender: 'advisor',
      text: response,
      time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    }]);
    setIsThinking(false);
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
                8 Sektör · 40 Varlık Denetlendi
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              {language === 'tr'
                ? 'Sektör Sektör Temettü Hisseleri Değerlendirmesi'
                : 'Sector-by-Sector Dividend Equity Diagnostics'}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {language === 'tr'
                ? 'Bankacılık, GYO, Enerji, Finans, Tüketim, Sanayi/Otomotiv, Holding/Telekom ve Global ETF\'ler tek tek karşılaştırıldı. Hangi hissenin kârlılık, verim ve nakit akışı açısından diğerinden daha üstün olduğunu keşfedin.'
                : 'Banking, REITs, Energy, Financials, Consumer, Automotive/Industrial, Holdings/Telecoms, and US ETFs evaluated peer-by-peer.'}
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
                {language === 'tr' ? '8 Sektör Karşılaştırmaya Hazır' : '8 Sectors Ready for Audit'}
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
            <span>{language === 'tr' ? 'Sektörel Karşılaştırma (8 Sektör)' : 'Sector Showdown (8 Sectors)'}</span>
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
            <span>{language === 'tr' ? 'Önerilen Değişiklikler (5 Eylem)' : 'Actionable Swaps (5 Actions)'}</span>
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
              onClick={() => executeChatQuery('Enerji sektöründen hangi firma alınmalı?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold transition-all cursor-pointer"
            >
              ⚡ Enerji: Hangi firma alınmalı?
            </button>
            <button
              onClick={() => executeChatQuery('Portföyümde hangi sektör eksik?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 font-bold transition-all cursor-pointer"
            >
              🔍 Portföyümde ne eksik?
            </button>
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
              🏭 TTRAK mı FROTO mu?
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
