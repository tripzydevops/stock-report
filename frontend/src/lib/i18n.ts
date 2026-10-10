export type Language = 'en' | 'tr';

export interface Translations {
  common: {
    loading: string;
    connected: string;
    active: string;
    all: string;
    close: string;
    cancel: string;
    confirm: string;
    save: string;
    delete: string;
    shares: string;
    price: string;
    date: string;
    total: string;
    status: string;
    notes: string;
    searchPlaceholder: string;
    filter: string;
  };
  header: {
    title: string;
    subtitle: string;
    syncData: string;
    syncing: string;
    syncShort: string;
    runCrawler: string;
    crawlerShort: string;
    crawlerTooltip: string;
    syncTooltip: string;
    usdTry: string;
    language: string;
  };
  tabs: {
    signals: string;
    catalysts: string;
    portfolio: string;
    dividend: string;
    scorecard: string;
    orb: string;
    quant: string;
  };
  regime: {
    usMarket: string;
    bistMarket: string;
    bullish: string;
    neutral: string;
    bearish: string;
    loading: string;
  };
  signals: {
    title: string;
    subtitle: string;
    scanAuditBtn: string;
    filterAll: string;
    filterBuyZone: string;
    filterRunners: string;
    filterToday: string;
    filterBist: string;
    filterUs: string;
    noActiveTrades: string;
    noActiveDesc: string;
    resetFilter: string;
  };
  tradeCard: {
    target1Hit: string;
    inTakeProfitZone: string;
    stoppedOut: string;
    setupInvalidated: string;
    activeSetup: string;
    holdingInBuyZone: string;
    activeSwing: string;
    entry: string;
    stopLoss: string;
    target1: string;
    target2Runner: string;
    confidence: string;
    riskReward: string;
    strategy: string;
    estExit: string;
    userHolding: string;
    holdingSummary: string;
    tradeSell: string;
    positionSize: string;
    coPilot: string;
    history: string;
    hideHistory: string;
    rationale: string;
    triggerHistoryTitle: string;
  };
  calculator: {
    title: string;
    accountSize: string;
    riskPct: string;
    entryPrice: string;
    stopLoss: string;
    targetPrice: string;
    recommendedShares: string;
    totalCapitalRequired: string;
    t1ScaleOut: string;
    t2Runner: string;
    maxCapitalLoss: string;
    riskRewardRatio: string;
    disclaimer: string;
  };
  portfolio: {
    title: string;
    subtitle: string;
    totalCost: string;
    marketValue: string;
    unrealizedPnl: string;
    realizedPnl: string;
    availableCash: string;
    totalPortfolioValue: string;
    addPositionBtn: string;
    depositWithdrawBtn: string;
    sectorRiskBtn: string;
    ordersHistoryBtn: string;
    realizedLedgerBtn: string;
    holdingsTable: {
      symbol: string;
      shares: string;
      entryPrice: string;
      currentPrice: string;
      currentValue: string;
      pnl: string;
      stopLoss: string;
      target1: string;
      target2: string;
      statusDca: string;
      actions: string;
      buyZoneBadge: string;
      holdBadge: string;
      pauseBadge: string;
      coreDividend: string;
      swingTrade: string;
      editStop: string;
      editTarget: string;
      tradeAction: string;
      copilotAction: string;
      removeAction: string;
      showDcaLots: string;
      hideDcaLots: string;
    };
    cashflowSummary: string;
    emptyPortfolio: string;
    emptyPortfolioDesc: string;
  };
  tradeModal: {
    titleBuy: string;
    titleSell: string;
    tabBuy: string;
    tabSell: string;
    currentHolding: string;
    sharesOwned: string;
    avgEntry: string;
    currPrice: string;
    sharesToBuy: string;
    sharesToSell: string;
    executionPrice: string;
    tradeDate: string;
    quickSell50: string;
    quickSell100: string;
    newBlendedCost: string;
    realizedPnl: string;
    remainingShares: string;
    executeBuy: string;
    executeSell: string;
    insufficientShares: string;
  };
  catalysts: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    filterAll: string;
    filterPortfolio: string;
    filterSignals: string;
    filterBuyback: string;
    filterMacro: string;
    impactHigh: string;
    impactMedium: string;
    impactLow: string;
    verdictBullish: string;
    verdictBearish: string;
    verdictNeutral: string;
    noCatalystsFound: string;
    disclosureDate: string;
    source: string;
  };
  dividend: {
    title: string;
    subtitle: string;
    annualIncome: string;
    monthlyIncome: string;
    yieldOnCost: string;
    portfolioYield: string;
    tabSchedule: string;
    tabTable: string;
    tabLab: string;
    upcomingPayouts: string;
    estDPS: string;
    estTotal: string;
    safetyScore: string;
    frequency: string;
    nextExDate: string;
    nextPayDate: string;
  };
  scorecard: {
    title: string;
    subtitle: string;
    totalTrades: string;
    winRate: string;
    profitFactor: string;
    topStrategy: string;
    systemExpectancy: string;
    auditLedgerTitle: string;
    auditLedgerSubtitle: string;
    statusTargetHit: string;
    statusStoppedOut: string;
    statusActive: string;
    closedDate: string;
  };
  orb: {
    title: string;
    subtitle: string;
    morningSentiment: string;
    bullishDrift: string;
    cautiousMixed: string;
    filterAll: string;
    filterBullish: string;
    filterBearish: string;
    filterBreakout: string;
    filterSpike: string;
    symbol: string;
    gapPercent: string;
    status: string;
    bias: string;
    volumeSpike: string;
    brokeHigh: string;
    insideRange: string;
    yes: string;
    no: string;
  };
  assetTable: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    filterAll: string;
    colSymbol: string;
    colPrice: string;
    colChange: string;
    colRsi: string;
    colEma: string;
    colVolume: string;
    above200Ema: string;
    below200Ema: string;
    near50Ema: string;
  };
}

export const translations: Record<Language, Translations> = {
  en: {
    common: {
      loading: 'Loading...',
      connected: 'Connected',
      active: 'Active',
      all: 'All',
      close: 'Close',
      cancel: 'Cancel',
      confirm: 'Confirm',
      save: 'Save',
      delete: 'Delete',
      shares: 'Shares',
      price: 'Price',
      date: 'Date',
      total: 'Total',
      status: 'Status',
      notes: 'Notes',
      searchPlaceholder: 'Search ticker or company...',
      filter: 'Filter',
    },
    header: {
      title: 'MarketPulse',
      subtitle: 'Autonomous Travel & Market Intelligence Engine',
      syncData: 'Sync Market Data',
      syncing: 'Syncing...',
      syncShort: 'Sync',
      runCrawler: 'Run Crawler',
      crawlerShort: 'Crawler',
      crawlerTooltip: 'Trigger full on-demand market crawler in GitHub Actions (fetches all 118 tickers)',
      syncTooltip: 'Instantly reload live prices, positions, and indicators from Supabase',
      usdTry: 'USD/TRY:',
      language: 'Language',
    },
    tabs: {
      signals: 'Market & Signals',
      catalysts: '⚡ Catalysts & KAP',
      portfolio: 'My Portfolio & DCA',
      dividend: 'Dividend Cashflow',
      scorecard: 'Strategy Scorecard',
      orb: 'Opening Direction',
      quant: '🏛️ Institutional Quant',
    },
    regime: {
      usMarket: 'US Market (SPY)',
      bistMarket: 'Turkish Market (BIST 100)',
      bullish: 'Bullish',
      neutral: 'Neutral',
      bearish: 'Bearish',
      loading: 'Loading...',
    },
    signals: {
      title: 'Active Trade Setups & Signals',
      subtitle: 'Autonomous scanner triggers with calculated targets, stop-losses, and AI rationales.',
      scanAuditBtn: 'Scan Audit & Outcome History',
      filterAll: 'All Active',
      filterBuyZone: 'In Buy Zone',
      filterRunners: 'T2 Runners',
      filterToday: "Today's Setups",
      filterBist: 'BIST',
      filterUs: 'US Market',
      noActiveTrades: 'No Active Trades in this View',
      noActiveDesc: 'All completed setups where targets were reached and shares were fully exited have graduated to the Scan Audit & Scorecard ledger.',
      resetFilter: 'Reset Filter to All',
    },
    tradeCard: {
      target1Hit: 'Target 1 Hit at',
      inTakeProfitZone: 'In Take-Profit Zone (Trail Stop to Breakeven)',
      stoppedOut: 'Dipped below stop loss at',
      setupInvalidated: 'Setup Invalidated',
      activeSetup: 'Active Setup: Originally triggered',
      holdingInBuyZone: 'Holding in Buy Zone',
      activeSwing: 'Active Swing: Triggered',
      entry: 'Entry Price',
      stopLoss: 'Stop Loss',
      target1: 'Target 1',
      target2Runner: 'Target 2 Runner',
      confidence: 'Confidence',
      riskReward: 'Risk / Reward',
      strategy: 'Strategy',
      estExit: 'Est. Exit',
      userHolding: 'My Position',
      holdingSummary: 'Holding',
      tradeSell: 'Trade / Sell',
      positionSize: 'Size Calc',
      coPilot: 'AI Co-Pilot',
      history: 'Re-confirmations',
      hideHistory: 'Hide History',
      rationale: 'AI Rationale',
      triggerHistoryTitle: 'Multi-Day Signal Trigger History',
    },
    calculator: {
      title: 'Position Size Calculator',
      accountSize: 'Account Capital',
      riskPct: 'Risk per Trade (%)',
      entryPrice: 'Entry Price',
      stopLoss: 'Stop Loss Price',
      targetPrice: 'Target 1 Price',
      recommendedShares: 'Recommended Shares',
      totalCapitalRequired: 'Total Capital Required',
      t1ScaleOut: 'T1 Scale-Out (50%)',
      t2Runner: 'T2 Runner (50%)',
      maxCapitalLoss: 'Max Capital at Risk',
      riskRewardRatio: 'Risk / Reward Ratio',
      disclaimer: 'Calculated strictly using portfolio capital allocation and volatility rules.',
    },
    portfolio: {
      title: 'Holdings & DCA Tracking',
      subtitle: 'Live portfolio allocation, DCA accumulation zones, and multi-tranche execution.',
      totalCost: 'Total Cost',
      marketValue: 'Market Value',
      unrealizedPnl: 'Unrealized P&L',
      realizedPnl: 'Realized P&L',
      availableCash: 'Available Cash',
      totalPortfolioValue: 'Total Portfolio Value',
      addPositionBtn: '+ Add Position',
      depositWithdrawBtn: 'Deposit / Transfer',
      sectorRiskBtn: 'Sector Allocation & Risk',
      ordersHistoryBtn: 'Executed Orders History',
      realizedLedgerBtn: 'Realized Trades Ledger',
      holdingsTable: {
        symbol: 'Symbol',
        shares: 'Shares',
        entryPrice: 'Avg Entry',
        currentPrice: 'Current Price',
        currentValue: 'Current Value',
        pnl: 'P&L',
        stopLoss: 'Stop Loss',
        target1: 'Target 1 (50%)',
        target2: 'Target 2 (Runner)',
        statusDca: 'DCA Status',
        actions: 'Actions',
        buyZoneBadge: 'BUY ZONE',
        holdBadge: 'HOLD',
        pauseBadge: 'PAUSE',
        coreDividend: 'CORE DIVIDEND',
        swingTrade: 'SWING TRADE',
        editStop: 'Edit Stop',
        editTarget: 'Edit Target',
        tradeAction: 'Trade / Sell',
        copilotAction: 'AI Co-Pilot',
        removeAction: 'Remove',
        showDcaLots: 'Show DCA Lots',
        hideDcaLots: 'Hide DCA Lots',
      },
      cashflowSummary: 'Cashflow & Balance Summary',
      emptyPortfolio: 'No active holdings in portfolio',
      emptyPortfolioDesc: 'Click "+ Add Position" or trade directly from active signals to begin tracking.',
    },
    tradeModal: {
      titleBuy: 'Add More Shares (DCA)',
      titleSell: 'Trade & Exit Execution',
      tabBuy: 'Buy More (DCA)',
      tabSell: 'Sell Shares',
      currentHolding: 'Current Position',
      sharesOwned: 'Shares Owned',
      avgEntry: 'Avg Entry Price',
      currPrice: 'Current Price',
      sharesToBuy: 'Shares to Buy',
      sharesToSell: 'Shares to Sell',
      executionPrice: 'Execution Price',
      tradeDate: 'Execution Date',
      quickSell50: 'Sell 50% (T1 Tranche)',
      quickSell100: 'Sell 100% (Full Exit)',
      newBlendedCost: 'New Blended Cost',
      realizedPnl: 'Estimated Realized P&L',
      remainingShares: 'Remaining Shares',
      executeBuy: 'Confirm Buy Order',
      executeSell: 'Confirm Sell Order',
      insufficientShares: 'Cannot sell more shares than currently owned.',
    },
    catalysts: {
      title: 'Market Catalysts & KAP Feed',
      subtitle: 'Real-time regulatory disclosures, share buybacks, and macro policy catalysts.',
      searchPlaceholder: 'Search disclosures, company or keyword...',
      filterAll: 'All Disclosures',
      filterPortfolio: 'My Portfolio Only',
      filterSignals: 'Active Signals Only',
      filterBuyback: 'Share Buybacks',
      filterMacro: 'Macro & Central Bank',
      impactHigh: 'HIGH IMPACT',
      impactMedium: 'MEDIUM IMPACT',
      impactLow: 'LOW IMPACT',
      verdictBullish: 'BULLISH',
      verdictBearish: 'BEARISH',
      verdictNeutral: 'NEUTRAL',
      noCatalystsFound: 'No catalysts found matching current filter.',
      disclosureDate: 'Disclosed At',
      source: 'Source',
    },
    dividend: {
      title: 'Dividend Cashflow Tracker',
      subtitle: 'Passive dividend income schedule, yield-on-cost metrics, and portfolio lab.',
      annualIncome: 'Annual Dividend Income',
      monthlyIncome: 'Monthly Average Payout',
      yieldOnCost: 'Yield on Cost (YoC)',
      portfolioYield: 'Portfolio Dividend Yield',
      tabSchedule: 'Payout Schedule',
      tabTable: 'Dividend Assets Table',
      tabLab: 'Dividend Portfolio Lab',
      upcomingPayouts: 'Upcoming Dividend Payouts',
      estDPS: 'Est. Net DPS',
      estTotal: 'Est. Total Payout',
      safetyScore: 'Safety Score',
      frequency: 'Frequency',
      nextExDate: 'Ex-Dividend Date',
      nextPayDate: 'Payment Date',
    },
    scorecard: {
      title: 'Strategy Performance Scorecard',
      subtitle: 'Verified backtests and live execution ledger across algorithmic trading models.',
      totalTrades: 'Total Evaluated Trades',
      winRate: 'System Win Rate',
      profitFactor: 'Profit Factor',
      topStrategy: 'Top Strategy Win Rate',
      systemExpectancy: 'Mathematical Expectancy',
      auditLedgerTitle: 'Scan Audit & Outcome Ledger',
      auditLedgerSubtitle: 'Live historical record of all scanned signals and their target achievements.',
      statusTargetHit: 'Target Reached (Winner)',
      statusStoppedOut: 'Stopped Out (Loss)',
      statusActive: 'In Progress (Active)',
      closedDate: 'Closed Date',
    },
    orb: {
      title: 'Opening Range Breakout (ORB)',
      subtitle: 'Opening momentum, morning price gaps, and first 15-minute range direction.',
      morningSentiment: 'Morning Sentiment Bias',
      bullishDrift: 'Bullish Drift',
      cautiousMixed: 'Cautious / Mixed',
      filterAll: 'All Tickers',
      filterBullish: 'Bullish Bias',
      filterBearish: 'Bearish Bias',
      filterBreakout: 'Broke High',
      filterSpike: 'Volume Spike',
      symbol: 'Symbol',
      gapPercent: 'Opening Gap %',
      status: 'ORB Status',
      bias: 'Direction Bias',
      volumeSpike: 'Volume Surge',
      brokeHigh: 'Broke High',
      insideRange: 'Inside Range',
      yes: 'Yes',
      no: 'No',
    },
    assetTable: {
      title: 'Market Watchlist & Technical Screen',
      subtitle: 'Multi-timeframe momentum, RSI readings, and moving average trend states.',
      searchPlaceholder: 'Filter watchlist...',
      filterAll: 'All Markets',
      colSymbol: 'Asset',
      colPrice: 'Price',
      colChange: '24h Change',
      colRsi: 'RSI (14)',
      colEma: '200 EMA State',
      colVolume: 'Volume Ratio',
      above200Ema: 'Above 200 EMA',
      below200Ema: 'Below 200 EMA',
      near50Ema: 'Near 50 EMA',
    },
  },
  tr: {
    common: {
      loading: 'Yükleniyor...',
      connected: 'Bağlandı',
      active: 'Aktif',
      all: 'Tümü',
      close: 'Kapat',
      cancel: 'İptal',
      confirm: 'Onayla',
      save: 'Kaydet',
      delete: 'Sil',
      shares: 'Adet',
      price: 'Fiyat',
      date: 'Tarih',
      total: 'Toplam',
      status: 'Durum',
      notes: 'Notlar',
      searchPlaceholder: 'Hisse kodu veya şirket ara...',
      filter: 'Filtrele',
    },
    header: {
      title: 'MarketPulse',
      subtitle: 'Otonom Seyahat & Piyasa İstihbarat Motoru',
      syncData: 'Piyasa Verilerini Senkronize Et',
      syncing: 'Senkronize Ediliyor...',
      syncShort: 'Senk',
      runCrawler: 'Tarayıcıyı Çalıştır',
      crawlerShort: 'Tarayıcı',
      crawlerTooltip: 'GitHub Actions üzerinde tüm 118 hisseyi tarayan piyasa botunu anında çalıştırır',
      syncTooltip: 'Supabase üzerindeki güncel fiyat, pozisyon ve indikatörleri anında yeniler',
      usdTry: 'USD/TRY:',
      language: 'Dil',
    },
    tabs: {
      signals: 'Piyasa & Sinyaller',
      catalysts: '⚡ Katalizörler & KAP',
      portfolio: 'Portföyüm & Kademeli Alım',
      dividend: 'Temettü Nakit Akışı',
      scorecard: 'Strateji Karnesi',
      orb: 'Açılış Yönü',
      quant: '🏛️ Kurumsal Quant',
    },
    regime: {
      usMarket: 'ABD Piyasası (SPY)',
      bistMarket: 'BIST 100 Endeksi',
      bullish: 'Yükseliş (Boğa)',
      neutral: 'Yatay / Nötr',
      bearish: 'Düşüş (Ayı)',
      loading: 'Yükleniyor...',
    },
    signals: {
      title: 'Aktif İşlem Kurulumları & Sinyaller',
      subtitle: 'Hesaplanmış hedefler, zarar kes seviyeleri ve yapay zeka gerekçeleri ile otonom tarama sinyalleri.',
      scanAuditBtn: 'Tarama Geçmişi & Sonuç Denetimi',
      filterAll: 'Tümü',
      filterBuyZone: 'Alım Bölgesinde',
      filterRunners: 'T2 Koşucuları',
      filterToday: 'Günün Kurulumları',
      filterBist: 'BIST',
      filterUs: 'ABD Piyasası',
      noActiveTrades: 'Bu Görünümde Aktif İşlem Yok',
      noActiveDesc: 'Hedefine ulaşan ve tüm hisseleri satılmış kurulumlar Tarama Geçmişi ve Karne bölümüne aktarılmıştır.',
      resetFilter: 'Filtreyi Sıfırla',
    },
    tradeCard: {
      target1Hit: 'Hedef 1 Alındı:',
      inTakeProfitZone: 'Kâr Al Bölgesinde (Zarar Kesi Girişe Çek)',
      stoppedOut: 'Zarar kes seviyesinin altına indi:',
      setupInvalidated: 'Kurulum İptal Edildi',
      activeSetup: 'Aktif Kurulum: İlk tetiklenme',
      holdingInBuyZone: 'Alım Bölgesinde Bekleniyor',
      activeSwing: 'Aktif Salınım: Tetiklenme',
      entry: 'Giriş Fiyatı',
      stopLoss: 'Zarar Kes (Stop)',
      target1: 'Hedef 1',
      target2Runner: 'Hedef 2 (Koşucu)',
      confidence: 'Güven',
      riskReward: 'Risk / Ödül',
      strategy: 'Strateji',
      estExit: 'Tahmini Çıkış',
      userHolding: 'Portföyüm',
      holdingSummary: 'Elimdeki',
      tradeSell: 'İşlem / Satış',
      positionSize: 'Pozisyon Hesapla',
      coPilot: 'YZ Yardımcısı',
      history: 'Onay Geçmişi',
      hideHistory: 'Geçmişi Gizle',
      rationale: 'Yapay Zeka Analizi',
      triggerHistoryTitle: 'Günlük Sinyal Tetiklenme Geçmişi',
    },
    calculator: {
      title: 'Pozisyon Büyüklüğü Hesaplayıcı',
      accountSize: 'Hesap Sermayesi',
      riskPct: 'İşlem Başına Risk (%)',
      entryPrice: 'Giriş Fiyatı',
      stopLoss: 'Zarar Kes Fiyatı',
      targetPrice: 'Hedef 1 Fiyatı',
      recommendedShares: 'Önerilen Hisse Adedi',
      totalCapitalRequired: 'Gereken Toplam Sermaye',
      t1ScaleOut: 'T1 Kısmi Satış (%50)',
      t2Runner: 'T2 Koşucu Dilimi (%50)',
      maxCapitalLoss: 'Maksimum Risk Tutarı',
      riskRewardRatio: 'Risk / Ödül Oranı',
      disclaimer: 'Portföy sermaye yönetimi ve volatilite risk kurallarına göre kesin hesaplanmıştır.',
    },
    portfolio: {
      title: 'Portföy Varlıkları & Kademeli Alım (DCA)',
      subtitle: 'Canlı portföy dağılımı, kademeli alım bölgeleri ve çoklu dilim yönetimi.',
      totalCost: 'Toplam Maliyet',
      marketValue: 'Piyasa Değeri',
      unrealizedPnl: 'Gerçekleşmemiş K/Z',
      realizedPnl: 'Gerçekleşmiş K/Z',
      availableCash: 'Nakit Bakiye',
      totalPortfolioValue: 'Toplam Portföy Değeri',
      addPositionBtn: '+ Yeni Pozisyon Ekle',
      depositWithdrawBtn: 'Para Yatır / Çek',
      sectorRiskBtn: 'Sektörel Dağılım & Risk',
      ordersHistoryBtn: 'Emirler & İşlem Geçmişi',
      realizedLedgerBtn: 'Kapatılan İşlemler Defteri',
      holdingsTable: {
        symbol: 'Hisse / Varlık',
        shares: 'Adet',
        entryPrice: 'Ort. Maliyet',
        currentPrice: 'Son Fiyat',
        currentValue: 'Piyasa Değeri',
        pnl: 'Kâr / Zarar',
        stopLoss: 'Zarar Kes',
        target1: 'Hedef 1 (%50)',
        target2: 'Hedef 2 (Koşucu)',
        statusDca: 'DCA Durumu',
        actions: 'İşlemler',
        buyZoneBadge: 'ALIM BÖLGESİ',
        holdBadge: 'TUT',
        pauseBadge: 'DURAKLAT',
        coreDividend: 'ANA TEMETTÜ',
        swingTrade: 'SALINIM (SWING)',
        editStop: 'Stop Düzenle',
        editTarget: 'Hedef Düzenle',
        tradeAction: 'İşlem / Satış',
        copilotAction: 'YZ Asistanı',
        removeAction: 'Kaldır',
        showDcaLots: 'Alım Dilimlerini Göster',
        hideDcaLots: 'Alım Dilimlerini Gizle',
      },
      cashflowSummary: 'Nakit Akışı ve Bakiye Özeti',
      emptyPortfolio: 'Portföyde aktif varlık bulunmuyor',
      emptyPortfolioDesc: 'Takip etmek için "+ Yeni Pozisyon Ekle" butonuna tıklayın veya sinyallerden işlem başlatın.',
    },
    tradeModal: {
      titleBuy: 'Kademeli Alım Ekle (DCA)',
      titleSell: 'Pozisyon Satışı & Kâr Realizasyonu',
      tabBuy: 'Alım Ekle (DCA)',
      tabSell: 'Hisse Sat',
      currentHolding: 'Mevcut Pozisyon',
      sharesOwned: 'Mevcut Adet',
      avgEntry: 'Ortalama Maliyet',
      currPrice: 'Güncel Fiyat',
      sharesToBuy: 'Alınacak Adet',
      sharesToSell: 'Satılacak Adet',
      executionPrice: 'İşlem Fiyatı',
      tradeDate: 'İşlem Tarihi',
      quickSell50: '%50 Sat (Hedef 1 Dilimi)',
      quickSell100: '%100 Sat (Tamamını Kapat)',
      newBlendedCost: 'Yeni Ortalama Maliyet',
      realizedPnl: 'Tahmini Gerçekleşen K/Z',
      remainingShares: 'Kalan Hisse Adedi',
      executeBuy: 'Alım Emrini Onayla',
      executeSell: 'Satış Emrini Onayla',
      insufficientShares: 'Elinizdeki adet miktarından daha fazla satış yapamazsınız.',
    },
    catalysts: {
      title: 'Piyasa Katalizörleri & KAP Bildirimleri',
      subtitle: 'Gerçek zamanlı şirket bildirimleri, hisse geri alımları ve makro politika haberleri.',
      searchPlaceholder: 'Bildirim, şirket veya anahtar kelime ara...',
      filterAll: 'Tüm Bildirimler',
      filterPortfolio: 'Sadece Portföyüm',
      filterSignals: 'Sadece Sinyaller',
      filterBuyback: 'Hisse Geri Alımları',
      filterMacro: 'Makro & TCMB / Fed',
      impactHigh: 'YÜKSEK ETKİ',
      impactMedium: 'ORTA ETKİ',
      impactLow: 'DÜŞÜK ETKİ',
      verdictBullish: 'POZİTİF (BOĞA)',
      verdictBearish: 'NEGATİF (AYI)',
      verdictNeutral: 'NÖTR',
      noCatalystsFound: 'Seçili filtreye uygun bildirim bulunamadı.',
      disclosureDate: 'Bildirim Saati',
      source: 'Kaynak',
    },
    dividend: {
      title: 'Temettü Nakit Akışı Takibi',
      subtitle: 'Düzenli temettü gelir takvimi, maliyete göre verim analizi ve portföy laboratuvarı.',
      annualIncome: 'Yıllık Temettü Geliri',
      monthlyIncome: 'Aylık Ortalama Gelir',
      yieldOnCost: 'Maliyete Göre Verim (YoC)',
      portfolioYield: 'Portföy Temettü Verimi',
      tabSchedule: 'Ödeme Takvimi',
      tabTable: 'Temettü Hisseleri',
      tabLab: 'Temettü Portföy Lab',
      upcomingPayouts: 'Yaklaşan Temettü Ödemeleri',
      estDPS: 'Tahmini Net Hisse Başı',
      estTotal: 'Tahmini Toplam Ödeme',
      safetyScore: 'Güvenilirlik Notu',
      frequency: 'Ödeme Sıklığı',
      nextExDate: 'Hak Kullanım (Ex) Tarihi',
      nextPayDate: 'Hesaba Geçiş Tarihi',
    },
    scorecard: {
      title: 'Strateji Performans Karnesi',
      subtitle: 'Algoritmik işlem modellerinin doğrulanmış geriye dönük testleri ve canlı sonuçları.',
      totalTrades: 'Değerlendirilen Toplam İşlem',
      winRate: 'Sistem Başarı Oranı',
      profitFactor: 'Kâr Faktörü (Profit Factor)',
      topStrategy: 'En İyi Strateji Başarısı',
      systemExpectancy: 'Matematiksel Beklenti',
      auditLedgerTitle: 'Tarama Geçmişi & Sonuç Defteri',
      auditLedgerSubtitle: 'Taranan tüm sinyallerin hedefe ulaşma ve canlı performans kayıtları.',
      statusTargetHit: 'Hedefe Ulaştı (Kazanç)',
      statusStoppedOut: 'Zarar Kes Oldu (Kayıp)',
      statusActive: 'Devam Ediyor (Aktif)',
      closedDate: 'Kapanış Tarihi',
    },
    orb: {
      title: 'Açılış Yönü & Kırılım (ORB)',
      subtitle: 'Açılış ivmesi, sabah fiyat boşlukları (gap) ve ilk 15 dakikalık yön eğilimi.',
      morningSentiment: 'Sabah Piyasa Yön Eğilimi',
      bullishDrift: 'Pozitif Açılış Eğilimi',
      cautiousMixed: 'Temkinli / Karışık',
      filterAll: 'Tüm Hisseler',
      filterBullish: 'Pozitif (Bullish)',
      filterBearish: 'Negatif (Bearish)',
      filterBreakout: 'Günü Yüksek Kırdı',
      filterSpike: 'Hacim Patlaması',
      symbol: 'Hisse',
      gapPercent: 'Açılış Gap %',
      status: 'ORB Durumu',
      bias: 'Yön Eğilimi',
      volumeSpike: 'Hacim Artışı',
      brokeHigh: 'Zirveyi Kırdı',
      insideRange: 'Aralık İçi',
      yes: 'Evet',
      no: 'Hayır',
    },
    assetTable: {
      title: 'Piyasa İzleme Listesi & Teknik Tarama',
      subtitle: 'Çoklu zaman dilimi ivmesi, RSI seviyeleri ve hareketli ortalama trendleri.',
      searchPlaceholder: 'İzleme listesinde ara...',
      filterAll: 'Tüm Piyasalar',
      colSymbol: 'Varlık',
      colPrice: 'Fiyat',
      colChange: '24s Değişim',
      colRsi: 'RSI (14)',
      colEma: '200 EMA Durumu',
      colVolume: 'Hacim Oranı',
      above200Ema: '200 EMA Üzerinde',
      below200Ema: '200 EMA Altında',
      near50Ema: '50 EMA Yakınında',
    },
  },
};
