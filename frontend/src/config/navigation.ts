export type TabId = 
  | 'signals' 
  | 'orb' 
  | 'watchlist' 
  | 'portfolio' 
  | 'dividend' 
  | 'forecast' 
  | 'catalysts' 
  | 'quant' 
  | 'scorecard' 
  | 'help' 
  | 'assistant';

export type HubKey = 'trade' | 'portfolio' | 'dividend' | 'quant';

export interface NavSubTab {
  id: TabId;
  labelTr: string;
  labelEn: string;
  icon: string;
  badge?: string;
  isPro?: boolean;
}

export interface NavHub {
  hubKey: HubKey;
  primaryTab: TabId;
  labelTr: string;
  labelEn: string;
  shortLabelTr: string;
  shortLabelEn: string;
  icon: string;
  descriptionTr: string;
  descriptionEn: string;
  subTabs: NavSubTab[];
}

export const CORE_HUBS: NavHub[] = [
  {
    hubKey: 'trade',
    primaryTab: 'signals',
    labelTr: 'Al-Sat & Radar',
    labelEn: 'Trade & Radar',
    shortLabelTr: 'Al-Sat',
    shortLabelEn: 'Trade',
    icon: '🎯',
    descriptionTr: 'Canlı BIST & US al-sat fırsatları, 15m açılış aralığı kırılımları ve dinamik radar havuzu.',
    descriptionEn: 'Live BIST & US swing setups, 15m opening range breakouts, and custom watchlist radars.',
    subTabs: [
      { id: 'signals', labelTr: 'Sinyaller', labelEn: 'Setups', icon: '🎯' },
      { id: 'orb', labelTr: '15m Açılış (ORB)', labelEn: '15m ORB', icon: '🔔' },
      { id: 'watchlist', labelTr: 'Takip & Radar', labelEn: 'Watchlist', icon: '⭐' },
    ],
  },
  {
    hubKey: 'portfolio',
    primaryTab: 'portfolio',
    labelTr: 'Portföy & Varlık',
    labelEn: 'Portfolio & Wealth',
    shortLabelTr: 'Portföy',
    shortLabelEn: 'Portfolio',
    icon: '💼',
    descriptionTr: 'Varlık yönetimi, kademeli alım maliyetleri, kasa nakit defteri ve gerçekleşen kâr/zarar günlüğü.',
    descriptionEn: 'Wealth command center, multi-tranche lot accounting, cash ledger, and trade performance journal.',
    subTabs: [
      { id: 'portfolio', labelTr: 'Varlıklarım & Kasa', labelEn: 'Holdings & Ledger', icon: '💼' },
    ],
  },
  {
    hubKey: 'dividend',
    primaryTab: 'dividend',
    labelTr: 'Temettü & Gelir',
    labelEn: 'Dividends & Income',
    shortLabelTr: 'Temettü',
    shortLabelEn: 'Dividends',
    icon: '💧',
    descriptionTr: '12 aylık temettü yağmuru akışı, kesinleşen KAP takas tarihleri ve DRIP kartopu simülatörü.',
    descriptionEn: '12-month dividend raindrop cashflows, confirmed KAP settlement dates, and DRIP snowball simulator.',
    subTabs: [
      { id: 'dividend', labelTr: 'Yağmur Takvimi', labelEn: 'Raindrop Calendar', icon: '💧' },
      { id: 'forecast', labelTr: 'Kartopu DRIP', labelEn: 'Snowball DRIP', icon: '🔮', badge: 'DRIP' },
    ],
  },
  {
    hubKey: 'quant',
    primaryTab: 'catalysts',
    labelTr: 'Quant & Araştırma',
    labelEn: 'Quant & Intel',
    shortLabelTr: 'Quant',
    shortLabelEn: 'Quant',
    icon: '🏛️',
    descriptionTr: 'Kurumsal KAP katalizörleri, Pairs Arbitraj korelasyonları, 1,173-işlemlik karne ve strateji rehberi.',
    descriptionEn: 'Institutional KAP catalyst feeds, Stat-Arb pairs trading, 1,173-trade backtest scorecard, and handbook.',
    subTabs: [
      { id: 'catalysts', labelTr: 'KAP Akışı', labelEn: 'KAP Filings', icon: '⚡' },
      { id: 'quant', labelTr: 'Pairs Stat-Arb', labelEn: 'Pairs Arbitrage', icon: '🏛️', badge: 'PRO', isPro: true },
      { id: 'scorecard', labelTr: 'Karne (1,173)', labelEn: 'Scorecard', icon: '📈' },
      { id: 'help', labelTr: 'Rehber', labelEn: 'Guide', icon: '📖' },
    ],
  },
];

export const AI_COPILOT_ITEM: NavSubTab = {
  id: 'assistant',
  labelTr: 'AI Copilot',
  labelEn: 'AI Copilot',
  icon: '🤖',
  badge: 'AI',
};

/**
 * Finds the active hub for any given active tab ID.
 */
export function getActiveHubForTab(activeTab: TabId): NavHub {
  const found = CORE_HUBS.find(h => h.subTabs.some(st => st.id === activeTab));
  return found || CORE_HUBS[0];
}
