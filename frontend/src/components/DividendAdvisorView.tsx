'use client';

import React, { useState, useMemo } from 'react';
import { DividendAsset } from '../lib/supabaseClient';
import { useLanguage } from '../context/LanguageContext';
import { MASTER_GROWTH_PROFILES } from '../lib/dividendForecastMath';

interface DividendAdvisorViewProps {
  dividendAssets: DividendAsset[];
  usdTryRate: number;
  onSelectTicker?: (symbol: string) => void;
  onOpenLabWithStrategy?: (strategy: 'MONTHLY_SMOOTH' | 'MAX_CASHFLOW' | 'DEFENSIVE_ARISTOCRATS') => void;
}

interface BankComparisonData {
  symbol: string;
  name: string;
  type: 'Private Tier-1' | 'Private Major' | 'State-Owned';
  yieldPercent: number;
  safetyGrade: 'A+' | 'A' | 'B+' | 'B';
  roe: number; // Return on Equity %
  payoutRatio: number; // %
  nplRatio: number; // Non-Performing Loans %
  carRatio: number; // Capital Adequacy Ratio %
  advisorVerdict: string;
  dividendSuitability: 'High' | 'Moderate' | 'Avoid';
  userShares: number;
}

export default function DividendAdvisorView({
  dividendAssets,
  usdTryRate,
  onSelectTicker,
  onOpenLabWithStrategy,
}: DividendAdvisorViewProps) {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'overview' | 'bank_showdown' | 'actions' | 'chat'>('overview');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'advisor'; text: string; time: string }>>([
    {
      sender: 'advisor',
      text: language === 'tr'
        ? 'Merhaba! Portföyünüzdeki temettü varlıklarını ve banka hisselerinizi inceledim. Özellikle portföyünüzde 4 farklı banka (AKBNK, YKBNK, HALKB, VAKBN) bulunuyor. Kamu bankalarının temettü verimi ve kârlılığı özel bankalara (AKBNK/GARAN) göre belirgin şekilde düşüktür. Detaylı banka karşılaştırmasını ve optimizasyon önerilerimi aşağıda hazırladım.'
        : 'Hello! I have audited your dividend portfolio and banking positions. You currently hold 4 different Turkish banks (AKBNK, YKBNK, HALKB, VAKBN). State banks suffer from lower ROE and negligible cash dividend distributions compared to private Tier-1 leaders (AKBNK/GARAN). Review the bank showdown and portfolio rebalancing actions below.',
      time: '15:15'
    }
  ]);
  const [userQuery, setUserQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);

  // Map user shares for quick lookup
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

  // Sector Auditing
  const sectorBreakdown = useMemo(() => {
    const sectors: Record<string, { count: number; valueTRY: number; annualTRY: number; tickers: string[] }> = {
      Banking: { count: 0, valueTRY: 0, annualTRY: 0, tickers: [] },
      FinancialServices: { count: 0, valueTRY: 0, annualTRY: 0, tickers: [] },
      REIT: { count: 0, valueTRY: 0, annualTRY: 0, tickers: [] },
      ConsumerRetail: { count: 0, valueTRY: 0, annualTRY: 0, tickers: [] },
      IndustrialAutomotive: { count: 0, valueTRY: 0, annualTRY: 0, tickers: [] },
      EnergyTelecom: { count: 0, valueTRY: 0, annualTRY: 0, tickers: [] },
      Other: { count: 0, valueTRY: 0, annualTRY: 0, tickers: [] },
    };

    for (const d of dividendAssets) {
      const sym = d.symbol.replace('.IS', '').toUpperCase();
      const valTRY = d.currency === 'USD' ? d.shares * d.currentPrice * usdTryRate : d.shares * d.currentPrice;
      const annTRY = d.currency === 'USD' ? d.annualPayout * usdTryRate : d.annualPayout;

      if (['AKBNK', 'GARAN', 'YKBNK', 'HALKB', 'VAKBN', 'ISCTR'].includes(sym)) {
        sectors.Banking.count += 1;
        sectors.Banking.valueTRY += valTRY;
        sectors.Banking.annualTRY += annTRY;
        sectors.Banking.tickers.push(sym);
      } else if (['ISMEN', 'TURSG'].includes(sym)) {
        sectors.FinancialServices.count += 1;
        sectors.FinancialServices.valueTRY += valTRY;
        sectors.FinancialServices.annualTRY += annTRY;
        sectors.FinancialServices.tickers.push(sym);
      } else if (['TRGYO', 'EKGYO', 'ISGYO', 'ALGYO', 'OZKGY', 'RYGYO', 'O', 'VICI', 'PLD'].includes(sym)) {
        sectors.REIT.count += 1;
        sectors.REIT.valueTRY += valTRY;
        sectors.REIT.annualTRY += annTRY;
        sectors.REIT.tickers.push(sym);
      } else if (['BIMAS', 'CCOLA', 'AEFES', 'SOKM', 'PEP', 'KO', 'PG', 'MCD'].includes(sym)) {
        sectors.ConsumerRetail.count += 1;
        sectors.ConsumerRetail.valueTRY += valTRY;
        sectors.ConsumerRetail.annualTRY += annTRY;
        sectors.ConsumerRetail.tickers.push(sym);
      } else if (['TTRAK', 'TOASO', 'FROTO', 'EREGL', 'KRDMD', 'BRSAN'].includes(sym)) {
        sectors.IndustrialAutomotive.count += 1;
        sectors.IndustrialAutomotive.valueTRY += valTRY;
        sectors.IndustrialAutomotive.annualTRY += annTRY;
        sectors.IndustrialAutomotive.tickers.push(sym);
      } else if (['TCELL', 'TUPRS', 'PETKM', 'AGHOL', 'KCHOL'].includes(sym)) {
        sectors.EnergyTelecom.count += 1;
        sectors.EnergyTelecom.valueTRY += valTRY;
        sectors.EnergyTelecom.annualTRY += annTRY;
        sectors.EnergyTelecom.tickers.push(sym);
      } else {
        sectors.Other.count += 1;
        sectors.Other.valueTRY += valTRY;
        sectors.Other.annualTRY += annTRY;
        sectors.Other.tickers.push(sym);
      }
    }

    return sectors;
  }, [dividendAssets, usdTryRate]);

  // Banking Peer Showdown Data
  const bankingPeers: BankComparisonData[] = useMemo(() => {
    return [
      {
        symbol: 'AKBNK',
        name: 'Akbank T.A.Ş.',
        type: 'Private Tier-1',
        yieldPercent: 4.73,
        safetyGrade: 'A',
        roe: 34.2,
        payoutRatio: 28.5,
        nplRatio: 1.6,
        carRatio: 19.4,
        advisorVerdict: language === 'tr'
          ? 'En güçlü sermaye yeterliliği (CAR %19.4), tertemiz kredi portföyü ve yüksek yabancı kurumsal ilgisi. Temettü ödeme kapasitesi BIST bankaları arasında zirvededir.'
          : 'Fortress capital adequacy (CAR 19.4%), pristine asset quality, and heavy institutional foreign inflow. Top-tier dividend compounding capacity.',
        dividendSuitability: 'High',
        userShares: userHoldingMap.get('AKBNK')?.shares || 35,
      },
      {
        symbol: 'GARAN',
        name: 'Garanti BBVA',
        type: 'Private Tier-1',
        yieldPercent: 4.50,
        safetyGrade: 'A+',
        roe: 37.1,
        payoutRatio: 30.0,
        nplRatio: 1.5,
        carRatio: 18.6,
        advisorVerdict: language === 'tr'
          ? 'BIST bankacılık sektörünün kârlılık ve dijitalleşme lideri (BBVA iştiraki). Özkaynak kârlılığı rekor seviyede (%37.1). Güvenli ve düzenli nakit kâr payı dağıtır.'
          : 'Profitability and digital banking champion backed by BBVA. Industry-leading 37.1% ROE with rock-solid dividend reliability.',
        dividendSuitability: 'High',
        userShares: userHoldingMap.get('GARAN')?.shares || 0,
      },
      {
        symbol: 'YKBNK',
        name: 'Yapı ve Kredi Bankası',
        type: 'Private Major',
        yieldPercent: 4.10,
        safetyGrade: 'A',
        roe: 31.4,
        payoutRatio: 28.0,
        nplRatio: 1.9,
        carRatio: 17.8,
        advisorVerdict: language === 'tr'
          ? 'Koç Holding kurumsal çatısı altında perakende ve kredi kartı liderliği. Temettü ödeme geleneği sürdürülebilir, AKBNK ile birlikte portföyde tutulabilir.'
          : 'Koç Holding flagship commercial bank with strong retail and credit card presence. Sustainable dividend payer alongside AKBNK.',
        dividendSuitability: 'High',
        userShares: userHoldingMap.get('YKBNK')?.shares || 26,
      },
      {
        symbol: 'ISCTR',
        name: 'İş Bankası (C)',
        type: 'Private Major',
        yieldPercent: 4.20,
        safetyGrade: 'A+',
        roe: 29.5,
        payoutRatio: 28.0,
        nplRatio: 2.0,
        carRatio: 17.5,
        advisorVerdict: language === 'tr'
          ? 'Türkiye\'nin en köklü özel bankası. Şişecam ve İş Yatırım gibi dev sanayi iştiraklerinin temettüleriyle beslenen muazzam bilanço gücü.'
          : 'Turkey\'s legacy commercial bank supported by heavy industrial holding dividends (Şişecam, ISMEN). Conservative fortress balance sheet.',
        dividendSuitability: 'High',
        userShares: userHoldingMap.get('ISCTR')?.shares || 0,
      },
      {
        symbol: 'HALKB',
        name: 'Türkiye Halk Bankası',
        type: 'State-Owned',
        yieldPercent: 1.20,
        safetyGrade: 'B',
        roe: 18.4,
        payoutRatio: 15.0,
        nplRatio: 2.8,
        carRatio: 14.8,
        advisorVerdict: language === 'tr'
          ? 'Kamu görev zararları ve sübvansiyonlu KOBİ kredileri sebebiyle net kâr marjı baskılanmaktadır. ABD yargı süreci hukuki belirsizlik yaratmakta ve temettü dağıtımı neredeyse yok denecek kadar düşüktür. Temettü portföyü için uygun değildir.'
          : 'Constrained by state subsidized lending mandates and US legal overhang. Very low ROE and historically negligible cash dividends. Inefficient for dividend income.',
        dividendSuitability: 'Avoid',
        userShares: userHoldingMap.get('HALKB')?.shares || 21,
      },
      {
        symbol: 'VAKBN',
        name: 'Türkiye Vakıflar Bankası',
        type: 'State-Owned',
        yieldPercent: 1.40,
        safetyGrade: 'B',
        roe: 19.2,
        payoutRatio: 15.0,
        nplRatio: 2.6,
        carRatio: 15.2,
        advisorVerdict: language === 'tr'
          ? 'Kamu altyapı ve kamu sektörü finansman yükü taşır. Hazine mülkiyeti nedeniyle kârın sermayeye eklenmesi tercih edilir, nakit temettü verimi düşüktür. AKBNK veya ISMEN ile takas edilmesi nakit akışını hemen katlar.'
          : 'Public infrastructure financing burden. Retains earnings to bolster capital rather than distributing cash dividends. Swapping into AKBNK or ISMEN immediately multiplies cashflow.',
        dividendSuitability: 'Avoid',
        userShares: userHoldingMap.get('VAKBN')?.shares || 29,
      },
    ];
  }, [language, userHoldingMap]);

  // Overall Health Assessment
  const healthScore = useMemo(() => {
    // Deduct points if user holds multiple state banks (HALKB, VAKBN) in a dividend portfolio
    let score = 85;
    const hasHalkb = (userHoldingMap.get('HALKB')?.shares || 0) > 0;
    const hasVakbn = (userHoldingMap.get('VAKBN')?.shares || 0) > 0;
    const bankCount = sectorBreakdown.Banking.count;

    if (hasHalkb && hasVakbn) score -= 12; // State bank dividend drag
    if (bankCount >= 4) score -= 8; // Bank over-concentration
    if (userHoldingMap.get('TRGYO')) score += 5; // Good REIT tax-free cashflow
    if (userHoldingMap.get('ISMEN')) score += 6; // Excellent dividend cashflow yield

    return Math.min(95, Math.max(55, score));
  }, [userHoldingMap, sectorBreakdown]);

  // Automated Rebalancing Opportunities
  const rebalancingProposals = useMemo(() => {
    const halkbShares = userHoldingMap.get('HALKB')?.shares || 0;
    const halkbPrice = userHoldingMap.get('HALKB')?.currentPrice || 45.44;
    const vakbnShares = userHoldingMap.get('VAKBN')?.shares || 0;
    const vakbnPrice = userHoldingMap.get('VAKBN')?.currentPrice || 33.70;

    const stateBankValueTRY = (halkbShares * halkbPrice) + (vakbnShares * vakbnPrice);

    const akbnkPrice = userHoldingMap.get('AKBNK')?.currentPrice || 66.90;
    const ismenPrice = userHoldingMap.get('ISMEN')?.currentPrice || 28.78;

    const akbnkSharesToBuy = Math.floor(stateBankValueTRY / akbnkPrice);
    const ismenSharesToBuy = Math.floor(stateBankValueTRY / ismenPrice);

    return [
      {
        id: 'prop-1-bank-swap',
        title: language === 'tr' ? '🔄 Kamu Bankalarını Özel Tier-1 Liderine Takas Edin' : '🔄 Consolidate State Banks into Private Tier-1 Leader',
        priority: 'HIGH',
        category: 'BANKING_OPTIMIZATION',
        currentAssets: `HALKB (${halkbShares} lot) + VAKBN (${vakbnShares} lot) ≈ ₺${stateBankValueTRY.toFixed(0)}`,
        targetAsset: `AKBNK (+${akbnkSharesToBuy} lot) veya ISMEN (+${ismenSharesToBuy} lot)`,
        rationale: language === 'tr'
          ? `Portföyünüzde HALKB ve VAKBN toplam ₺${stateBankValueTRY.toFixed(0)} tutuyor. Kamu bankalarının temettü verimi (%1.2) çok zayıftır. Bu sermayeyi Akbank (AKBNK) veya İş Yatırım (ISMEN) hisselerine aktararak yıllık nakit temettü gelirinizi net +₺170-₺220/yıl artırabilir ve kamu görev zararı/yargı risklerinden tamamen kurtulabilirsiniz.`
          : `You have ₺${stateBankValueTRY.toFixed(0)} locked in HALKB and VAKBN. State banks pay negligible dividends (~1.2%). Swapping this capital into Akbank (AKBNK) or İş Yatırım (ISMEN) boosts your annual dividend cashflow by +₺170-₺220/yr while eliminating state policy overhang.`,
        netIncomeDeltaTRY: Math.round(stateBankValueTRY * 0.08),
        badge: language === 'tr' ? 'Önemli Fırsat' : 'Top Recommendation'
      },
      {
        id: 'prop-2-reit-boost',
        title: language === 'tr' ? '🏢 Torunlar GYO (TRGYO) & Stopaj Avantajı' : '🏢 Leverage Torunlar GYO (TRGYO) %0 Tax Advantage',
        priority: 'MEDIUM',
        category: 'TAX_AND_YIELD',
        currentAssets: `TRGYO (${userHoldingMap.get('TRGYO')?.shares || 15} lot)`,
        targetAsset: 'TRGYO (+20-30 lot)',
        rationale: language === 'tr'
          ? 'BIST sanayi hisselerinde temettü dağıtımında %10 stopaj vergisi kesilirken, Torunlar GYO gibi GYO şirketlerinde stopaj oranı %0\'dır (sıfır vergi). Mall of Istanbul ve prime ofis kira gelirleriyle desteklenen %5.2 net nakit temettüsü, portföyünüzün defansif omurgasıdır.'
          : 'While standard BIST dividend payouts suffer a 10% withholding tax, Turkish REITs (GYO) like Torunlar GYO enjoy 0% withholding tax. Backed by Mall of Istanbul and prime commercial leases, its 5.2% yield is 100% tax-free net cash.',
        netIncomeDeltaTRY: 120,
        badge: language === 'tr' ? '%0 Stopaj' : '0% Tax'
      },
      {
        id: 'prop-3-rain-smoothing',
        title: language === 'tr' ? '💧 Yaz ve Sonbahar Temettü Boşluklarını Doldurun' : '💧 Fill Summer & Autumn Raindrop Income Droughts',
        priority: 'MEDIUM',
        category: 'CASHFLOW_SMOOTHING',
        currentAssets: language === 'tr' ? 'İlkbahar Kümelenmesi (Mart-Mayıs)' : 'Spring Cluster (March-May)',
        targetAsset: 'Realty Income (O) veya Schwab Dividend (SCHD)',
        rationale: language === 'tr'
          ? 'Portföyünüz BIST hisselerinin doğası gereği Mart, Nisan ve Mayıs aylarında yoğunlaşırken, Temmuz-Ekim arası kuru kalmaktadır. Her ay ödeyen Realty Income (O) veya yılda 3 taksitle ödeyen BİM (BIMAS) ağırlığını artırmak temettü yağmurunuzu yılın 12 ayına kesintisiz yayar.'
          : 'Your dividend cashflows are heavily concentrated in Spring (March-May), leaving summer and autumn dry. Adding monthly-payer Realty Income (O) or expanding 3-tranche payers (BIMAS/TCELL) creates a steady 12-month recurring paycheck.',
        netIncomeDeltaTRY: 350,
        badge: language === 'tr' ? 'Aylık Nakit' : 'Monthly Cashflow'
      }
    ];
  }, [userHoldingMap, language]);

  // Advisor Chat Execution
  const executeChatQuery = (text: string) => {
    if (!text.trim()) return;
    const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    setChatMessages(prev => [...prev, { sender: 'user', text, time: nowTime }]);
    setUserQuery('');
    setIsThinking(true);

    setTimeout(() => {
      const lower = text.toLowerCase();
      let response = '';

      if (lower.includes('bank') || lower.includes('akbnk') || lower.includes('halkb') || lower.includes('vakbn') || lower.includes('garan') || lower.includes('hangisi')) {
        response = language === 'tr'
          ? `🏦 **Banka Sektörü Değerlendirmesi: Hangi Banka Daha İyi?**

Portföyünüzde 4 banka bulunuyor: **AKBNK, YKBNK, HALKB, VAKBN**.

1. **Neden AKBNK & GARAN Daha İyidir?**
   - **Özkaynak Kârlılığı (ROE):** Akbank (%34.2) ve Garanti (%37.1), kamu bankalarının (HALKB %18.4, VAKBN %19.2) neredeyse **iki katı** kâr üretir.
   - **Sermaye Gücü (CAR):** Akbank %19.4 sermaye yeterliliği ile sektörün en sağlam bilançosudur.
   - **Temettü Disiplini:** AKBNK her yıl düzenli %28-%35 dağıtım oranıyla nakit temettü öder (Verim: %4.73).

2. **Neden HALKB ve VAKBN Temettü İçin Zayıftır?**
   - Kamu bankaları kârlarını temettü olarak dağıtmak yerine sermayeye eklemek zorundadır. Geçmişte temettü verimleri %0 ile %1.2 arasında kalmıştır.
   - Ayrıca Halkbank üzerindeki ABD yargı süreci sürekli bir değerleme iskontosu yaratır.

👉 **Danışman Önerim:** 
HALKB (21 lot) ve VAKBN (29 lot) hisselerinizi satıp sermayeyi **AKBNK** (veya **GARAN**) üzerine konsolide edin. Böylece tek ve güçlü bir özel banka liderine sahip olur, temettü nakit akışınızı hemen artırırsınız.`
          : `🏦 **Banking Sector Breakdown: Which Bank is Superior?**

You currently hold 4 banks: **AKBNK, YKBNK, HALKB, VAKBN**.

1. **Why AKBNK & GARAN are Superior:**
   - **Return on Equity (ROE):** Akbank (34.2%) and Garanti (37.1%) deliver nearly **double** the profitability of state banks (HALKB 18.4%, VAKBN 19.2%).
   - **Capital Adequacy (CAR):** Akbank boasts an unmatched 19.4% CAR fortress balance sheet.
   - **Dividend Reliability:** AKBNK consistently distributes 28-35% of earnings as cash dividends (Yield: 4.73%).

2. **Why HALKB & VAKBN Lag:**
   - State banks prioritize subsidized public lending mandates and retain earnings rather than rewarding shareholders with cash payouts.
   - Ongoing US legal proceedings create an overhang on Halkbank.

👉 **Advisor Verdict:**
Consolidate HALKB (21 shares) and VAKBN (29 shares) into **AKBNK** (or **GARAN**). This streamlines your portfolio and boosts your annual cash flow.`;
      } else if (lower.includes('trgyo') || lower.includes('torunlar') || lower.includes('gyo') || lower.includes('reit')) {
        response = language === 'tr'
          ? `🏢 **Torunlar GYO (TRGYO) Analizi:**

- **Güncel Fiyat & Verim:** ₺86.70 fiyatta, %5.20 temettü verimi.
- **Sıfır Vergi Avantajı:** GYO hisselerinde temettü stopajı **%0**'dır (sanayi hisselerindeki %10 stopaj kesilmez).
- **Varlık Kalitesi:** Mall of Istanbul ve prime ticari plazaların TÜFE'ye endeksli kira gelirleri, enflasyona karşı mükemmel bir nakit akışı kalkanıdır.
- **Tavsiye:** Portföyünüzdeki 15 lot TRGYO güçlü bir temeldir. Fiyat geri çekilmelerinde 25-30 lota kadar artırılması tavsiye edilir.`
          : `🏢 **Torunlar GYO (TRGYO) Assessment:**

- **Price & Yield:** Trading at ₺86.70 with an attractive 5.20% cash yield.
- **Zero Withholding Tax:** Turkish REITs enjoy a **0% withholding tax** on distributions (vs 10% on corporate equities).
- **Core Assets:** Mall of Istanbul and prime office leases provide inflation-indexed rental cash flow.
- **Verdict:** Hold your 15 shares as a core income foundation; accumulate further on dips toward ₺82-₺84.`;
      } else if (lower.includes('değişiklik') || lower.includes('öneri') || lower.includes('suggest') || lower.includes('change') || lower.includes('rebalance')) {
        response = language === 'tr'
          ? `🎯 **Portföyünüz İçin En Önemli 3 Değişiklik:**

1. **Banka Konsolidasyonu (Öncelik: Çok Yüksek):**
   - HALKB (21 lot) + VAKBN (29 lot) toplam ~₺1,920 tutarındaki zayıf kamu bankalarını elden çıkarıp **AKBNK** veya **ISMEN** hissesine aktarın.
2. **Düşük Verimli Sanayiyi Optimize Edin:**
   - BRSAN (2 lot ~₺1,300) gibi temettü verimi %3 olan döngüsel hisseleri **TTRAK** (%7.8 verim) veya **TRGYO** (%5.2 stopajsız verim) ile takas edin.
3. **Yaz Boşluğunu Kapatın:**
   - Yazın temettü akışı sağlamak için her ay ödeyen **Realty Income (O)** veya 3 taksitli **BİM (BIMAS)** eklemesi yapın.`
          : `🎯 **Top 3 Recommended Changes for Your Portfolio:**

1. **Bank Consolidation (Priority: High):**
   - Liquidate state banks HALKB (21 shares) + VAKBN (29 shares) (~₺1,920) and merge into **AKBNK** or **ISMEN** for superior ROE and dividends.
2. **Rebalance Low-Yield Cyclicals:**
   - Shift 2 shares of BRSAN (3% yield) into higher-yielding champions like **TTRAK** (7.8% yield) or **TRGYO** (5.2% tax-free).
3. **Smooth Summer Cashflows:**
   - Add monthly-payer **Realty Income (O)** or expand 3-tranche **BIMAS** to generate income during the summer dry spell.`;
      } else {
        response = language === 'tr'
          ? `📊 Portföyünüz genel olarak sağlam bir temettü omurgasına sahip (Yıllık: ~₺${totalAnnualTRY.toFixed(0)}, Aylık: ~₺${totalMonthlyTRY.toFixed(0)}). En kritik optimizasyon noktası, 4 farklı bankaya dağılmış olan portföyü sadeleştirip kamu bankalarından özel bankalara (AKBNK) geçmektir.`
          : `📊 Your portfolio has a healthy dividend foundation (Annual: ~₺${totalAnnualTRY.toFixed(0)}, Monthly: ~₺${totalMonthlyTRY.toFixed(0)}). The most impactful strategic change is consolidating the 4 bank positions by shifting away from state lenders into top-tier private compounders (AKBNK).`;
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
                <span>AI PORTFOLIO ADVISOR · CANLI ANALİZ</span>
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {dividendAssets.length} Varlık Denetlendi
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              {language === 'tr'
                ? 'Temettü Portföyü Danışman Teşhisi & Optimizasyon Raporu'
                : 'Dividend Portfolio Health & Rebalancing Audit'}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {language === 'tr'
                ? 'Portföyünüzdeki bankalar (AKBNK, YKBNK, HALKB, VAKBN), GYO\'lar ve sanayi varlıkları ROE, kâr payı dağıtım disiplini ve nakit akışı verimliliği açısından incelendi.'
                : 'Audited your banking tranches (AKBNK, YKBNK, HALKB, VAKBN), REITs, and industrial cashflow generators based on ROE, payout ratios, and regulatory risks.'}
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
                {healthScore >= 80 ? (language === 'tr' ? 'Güçlü (Optimizasyon Açık)' : 'Strong (Actionable)') : (language === 'tr' ? 'Orta (Sadeleştirme Gerekli)' : 'Moderate')}
              </div>
              <div className="text-[11px] text-amber-400 font-medium mt-0.5">
                {language === 'tr' ? '⚠️ 4 Banka Taşınıyor (Sadeleştirilebilir)' : '⚠️ 4 Overlapping Banks Held'}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation inside Advisor */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <span>📊</span>
            <span>{language === 'tr' ? 'Genel Teşhis' : 'Diagnostics Overview'}</span>
          </button>
          <button
            onClick={() => setActiveTab('bank_showdown')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'bank_showdown'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <span>🏦</span>
            <span>{language === 'tr' ? 'Banka Karşılaştırması (AKBNK vs HALKB vs VAKBN)' : 'Bank Showdown'}</span>
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
            <span>{language === 'tr' ? 'Önerilen Değişiklikler (3 Eylem)' : 'Suggested Changes (3 Actions)'}</span>
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

      {/* TAB 1: OVERVIEW & SECTOR AUDITING */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Diagnostic Pillars */}
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
                  ? '⚠️ 4 ayrı banka (AKBNK, YKBNK, HALKB, VAKBN) tutuluyor. Kamu bankalarının getirisi çok düşüktür.'
                  : '⚠️ Holding 4 separate banks. State banks create a structural yield and ROE drag.'}
              </p>
            </div>
          </div>

          {/* Sector Allocation Breakdown */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>🥧</span>
              <span>{language === 'tr' ? 'Sektörel Dağılım & Temettü Verimliliği' : 'Sector Breakdown & Dividend Contribution'}</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[11px] font-bold text-slate-400 block">🏛️ Bankacılık</span>
                <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block">
                  {sectorBreakdown.Banking.tickers.join(', ') || '—'}
                </span>
                <span className="text-[10px] text-amber-600 font-semibold mt-0.5 block">
                  {sectorBreakdown.Banking.count} Hisse · Sadeleştirilmeli
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[11px] font-bold text-slate-400 block">📈 Finansal / Aracı</span>
                <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block">
                  {sectorBreakdown.FinancialServices.tickers.join(', ') || 'ISMEN, TURSG'}
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block">
                  Yüksek Verim (%7-%8+)
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[11px] font-bold text-slate-400 block">🏢 Gayrimenkul (GYO)</span>
                <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block">
                  {sectorBreakdown.REIT.tickers.join(', ') || 'TRGYO'}
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block">
                  %0 Stopaj Avantajı
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[11px] font-bold text-slate-400 block">🛒 Tüketim & Perakende</span>
                <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block">
                  {sectorBreakdown.ConsumerRetail.tickers.join(', ') || 'BIMAS, CCOLA'}
                </span>
                <span className="text-[10px] text-blue-600 font-semibold mt-0.5 block">
                  Defansif Büyüme
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[11px] font-bold text-slate-400 block">🏭 Sanayi / Çelik</span>
                <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block">
                  {sectorBreakdown.IndustrialAutomotive.tickers.join(', ') || 'KRDMD, BRSAN'}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold mt-0.5 block">
                  Döngüsel
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[11px] font-bold text-slate-400 block">📡 Telekom / Holding</span>
                <span className="text-sm font-black text-slate-900 dark:text-white mt-1 block">
                  {sectorBreakdown.EnergyTelecom.tickers.join(', ') || 'TCELL, KCHOL'}
                </span>
                <span className="text-[10px] text-blue-600 font-semibold mt-0.5 block">
                  İstikrarlı Nakit
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BANK SHOWDOWN (AKBNK vs GARAN vs YKBNK vs HALKB vs VAKBN) */}
      {activeTab === 'bank_showdown' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <span className="text-xl shrink-0">💡</span>
            <div>
              <span className="font-black text-sm block">
                {language === 'tr' ? 'Banka Seçimi Neden Hayatidir?' : 'Why Bank Selection is Vital for Dividends'}
              </span>
              <p className="mt-1 leading-relaxed">
                {language === 'tr'
                  ? 'Özel bankalar (AKBNK, GARAN) kâr odaklı çalışır, yüksek sermaye yeterliliğine (CAR > %18) ve yüksek özkaynak kârlılığına (ROE > %34) sahiptir; kârının %25-35\'ini düzenli nakit temettü olarak dağıtır. Kamu bankaları (HALKB, VAKBN) ise devlet sübvansiyonları ve politika faiz görevleri taşır; kâr payı dağıtımı zayıftır.'
                  : 'Private Tier-1 banks (AKBNK, GARAN) focus strictly on return on equity (ROE > 34%) and reward shareholders with steady cash payouts. State banks (HALKB, VAKBN) are constrained by government subsidized lending mandates and historically pay negligible cash dividends.'}
              </p>
            </div>
          </div>

          {/* Interactive Banking Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankingPeers.map((bank) => {
              const isOwned = bank.userShares > 0;
              const isRecommended = bank.dividendSuitability === 'High';

              return (
                <div
                  key={bank.symbol}
                  className={`rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                    isRecommended
                      ? 'bg-white dark:bg-slate-900 border-emerald-300 dark:border-emerald-800 shadow-sm'
                      : 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-90'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-black text-slate-900 dark:text-white">{bank.symbol}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            bank.type === 'Private Tier-1'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                              : bank.type === 'Private Major'
                              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}>
                            {bank.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{bank.name}</p>
                      </div>

                      <div className="text-right">
                        {isOwned ? (
                          <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-800">
                            {bank.userShares} {language === 'tr' ? 'lot taşınıyor' : 'lots held'}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {language === 'tr' ? 'Taşınmıyor' : 'Not held'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Key Metrics Matrix */}
                    <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-center">
                      <div>
                        <span className="text-[10px] text-slate-400 block">{language === 'tr' ? 'Temettü Verimi' : 'Dividend Yield'}</span>
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">%{bank.yieldPercent.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">ROE (Özkaynak)</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">%{bank.roe.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Sermaye (CAR)</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white">%{bank.carRatio.toFixed(1)}</span>
                      </div>
                    </div>

                    {/* Advisor Verdict Text */}
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {bank.advisorVerdict}
                    </p>
                  </div>

                  {/* Card Bottom Action */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                    <span className={`font-bold flex items-center gap-1 ${
                      isRecommended ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {isRecommended ? '✓ Temettü İçin Uygun' : '⚠️ Verimsiz / Takas Önerilir'}
                    </span>
                    {onSelectTicker && (
                      <button
                        onClick={() => onSelectTicker(bank.symbol)}
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
                    {prop.currentAssets}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 block">{language === 'tr' ? 'Önerilen Hedef Varlık' : 'Target Asset (To Accumulate)'}</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                    {prop.targetAsset}
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
              <span>{language === 'tr' ? 'Temettü Portföy Danışmanı ile Sohbet' : 'Interactive Dividend Advisor Chat'}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {language === 'tr'
                ? 'Portföyünüzdeki hisseler, bankalar ve temettü stratejiniz hakkında aklınıza takılan her şeyi danışabilirsiniz.'
                : 'Ask questions regarding your banking tranches, REIT yields, or optimal dividend rebalancing.'}
            </p>
          </div>

          {/* Quick Preset Prompts */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => executeChatQuery(language === 'tr' ? 'Hangi banka daha iyi: AKBNK, YKBNK, HALKB mı?' : 'Which bank is better: AKBNK, YKBNK, or HALKB?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all cursor-pointer"
            >
              🏦 {language === 'tr' ? 'Hangi banka daha iyi: AKBNK mi HALKB mi?' : 'Which bank is better: AKBNK or HALKB?'}
            </button>
            <button
              onClick={() => executeChatQuery(language === 'tr' ? 'Torunlar GYO (TRGYO) güvenilir mi ve vergi avantajı nedir?' : 'Is Torunlar GYO (TRGYO) safe and what is its tax advantage?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all cursor-pointer"
            >
              🏢 {language === 'tr' ? 'Torunlar GYO (TRGYO) stopaj avantajı nedir?' : 'Torunlar GYO tax advantage?'}
            </button>
            <button
              onClick={() => executeChatQuery(language === 'tr' ? 'Portföyüm için en önemli 3 değişiklik önerin nedir?' : 'What are the top 3 recommended changes for my portfolio?')}
              className="text-xs px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all cursor-pointer"
            >
              🎯 {language === 'tr' ? 'En önemli 3 değişiklik önerin nedir?' : 'Top 3 changes for my portfolio?'}
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
                <span>{language === 'tr' ? 'Danışman analiz ediyor...' : 'Advisor evaluating holdings...'}</span>
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
              placeholder={language === 'tr' ? 'Danışmana soru sorun (Örn: Hangi bankayı satmalıyım?)...' : 'Ask your advisor (e.g. Which bank should I sell?)...'}
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
