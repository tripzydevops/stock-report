export interface SectorRiskProfile {
  sector: string;
  totalCostTRY: number;
  totalMarketValTRY: number;
  weightPercent: number;
  symbols: string[];
  color: string;
  isOverweight: boolean;
}

export const ASSET_SECTOR_MAP: Record<string, { sector: string; industry: string; color: string }> = {
  AKBNK: { sector: 'Financials & Banking', industry: 'Commercial Banking', color: '#3b82f6' },
  HALKB: { sector: 'Financials & Banking', industry: 'State Banking', color: '#1d4ed8' },
  ISMEN: { sector: 'Financials & Brokerage', industry: 'Investment Banking & Brokerage', color: '#6366f1' },
  TURSG: { sector: 'Financials & Insurance', industry: 'Non-Life Insurance', color: '#0ea5e9' },
  SOKM: { sector: 'Consumer Staples', industry: 'Discount Food Retail', color: '#10b981' },
  BIMAS: { sector: 'Consumer Staples', industry: 'Food Retail', color: '#059669' },
  THYAO: { sector: 'Industrials & Aviation', industry: 'Aviation & Air Freight', color: '#f59e0b' },
  PGSUS: { sector: 'Industrials & Aviation', industry: 'Passenger Airline', color: '#d97706' },
  ASELS: { sector: 'Technology & Defense', industry: 'Defense Electronics', color: '#8b5cf6' },
  TUPRS: { sector: 'Energy & Refining', industry: 'Oil Refining', color: '#ef4444' },
  FROTO: { sector: 'Consumer Discretionary', industry: 'Automotive Manufacturing', color: '#ec4899' },
  EREGL: { sector: 'Materials & Steel', industry: 'Steel & Metallurgy', color: '#64748b' },
  SISE: { sector: 'Materials & Glass', industry: 'Glass & Chemicals', color: '#94a3b8' },
  SPY: { sector: 'Broad Market ETF', industry: 'S&P 500 Index', color: '#3b82f6' },
  QQQ: { sector: 'Technology ETF', industry: 'Nasdaq 100', color: '#8b5cf6' },
  NVDA: { sector: 'Technology & AI', industry: 'Semiconductors', color: '#22c55e' },
  AAPL: { sector: 'Technology', industry: 'Consumer Electronics', color: '#64748b' },
  SCHD: { sector: 'Dividend ETF', industry: 'US High Dividend', color: '#14b8a6' },
  O: { sector: 'Real Estate', industry: 'Triple-Net REIT', color: '#a855f7' },
};

export function calculateSectorRisk(
  portfolio: Array<{ symbol: string; currentValue: number; totalCost: number; currency: string }>,
  usdTryRate: number = 48.95
) {
  const sectorTotals: Record<string, { totalVal: number; totalCost: number; symbols: string[]; color: string }> = {};

  let grandTotalTRY = 0;

  for (const item of portfolio) {
    const cleanSym = item.symbol.replace('.IS', '').toUpperCase();
    const info = ASSET_SECTOR_MAP[cleanSym] || { sector: 'Other / Equities', industry: 'Diversified', color: '#64748b' };
    const valTRY = item.currency === 'USD' ? item.currentValue * usdTryRate : item.currentValue;
    const costTRY = item.currency === 'USD' ? item.totalCost * usdTryRate : item.totalCost;

    grandTotalTRY += valTRY;

    if (!sectorTotals[info.sector]) {
      sectorTotals[info.sector] = { totalVal: 0, totalCost: 0, symbols: [], color: info.color };
    }
    sectorTotals[info.sector].totalVal += valTRY;
    sectorTotals[info.sector].totalCost += costTRY;
    if (!sectorTotals[info.sector].symbols.includes(cleanSym)) {
      sectorTotals[info.sector].symbols.push(cleanSym);
    }
  }

  const profiles: SectorRiskProfile[] = Object.entries(sectorTotals).map(([sector, data]) => {
    const weight = grandTotalTRY > 0 ? (data.totalVal / grandTotalTRY) * 100 : 0;
    return {
      sector,
      totalCostTRY: data.totalCost,
      totalMarketValTRY: data.totalVal,
      weightPercent: weight,
      symbols: data.symbols,
      color: data.color,
      isOverweight: weight > 35.0 // Warning threshold: >35% single sector concentration
    };
  });

  profiles.sort((a, b) => b.weightPercent - a.weightPercent);

  const highestSector = profiles.length > 0 ? profiles[0] : null;
  const isHighConcentration = highestSector ? highestSector.weightPercent > 40 : false;

  return {
    profiles,
    grandTotalTRY,
    highestSector,
    isHighConcentration
  };
}
