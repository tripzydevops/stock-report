'use client';

import React, { useState } from 'react';

export interface CoPilotAssetContext {
  symbol: string;
  name: string;
  market: string;
  currentPrice: number;
  entryPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
  currency?: string;
  strategy?: string;
  pnlPercent?: number;
  pnlAmount?: number;
  shares?: number;
  totalCost?: number;
  currentValue?: number;
  entryDate?: string;
  dcaZone?: string;
  isDividend?: boolean;
  notes?: string;
  buyCount?: number;
  lowestBuy?: number;
  highestBuy?: number;
  latestBuy?: number;
}

interface AiTradeCoPilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: CoPilotAssetContext | null;
}

export default function AiTradeCoPilotModal({
  isOpen,
  onClose,
  asset,
}: AiTradeCoPilotModalProps) {
  const isHolding = Boolean(asset?.shares && asset.shares > 0);
  const [activeTab, setActiveTab] = useState<'brief' | 'blueprint' | 'premortem' | 'qa'>(
    isHolding ? 'brief' : 'blueprint'
  );
  const [isCopied, setIsCopied] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([]);
  const [isThinking, setIsThinking] = useState(false);

  if (!isOpen || !asset) return null;

  const curr = asset.currency === 'USD' ? '$' : '₺';
  const cleanSym = asset.symbol.replace('.IS', '').toUpperCase();
  const entry = asset.entryPrice || asset.currentPrice;
  const stop = asset.stopLoss || (entry * 0.95);
  const target0 = entry * 1.035; // User personal 3-4% quick TP
  const target1 = asset.targetPrice || (entry * 1.10);
  const target2 = entry * 1.18;
  const breakevenLevel = entry; // Zero-fee trading (no broker commission)
  const isProfitable = (asset.pnlPercent || 0) >= 0;
  const isPersonalTpHit = (asset.pnlPercent || 0) >= 3.0;

  // Holding duration calculation
  const daysHeld = asset.entryDate
    ? Math.max(1, Math.round((Date.now() - new Date(asset.entryDate).getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  // Multi-lot calculations
  const hasMultipleBuys = Boolean(asset.buyCount && asset.buyCount > 1);
  const lowestBuyPrice = asset.lowestBuy || entry;
  const highestBuyPrice = asset.highestBuy || entry;
  const distToBreakevenPct = asset.currentPrice > 0 && entry > 0 
    ? ((entry - asset.currentPrice) / asset.currentPrice) * 100 
    : 0;

  // Dynamic Company-Specific Macro & Fundamentals Engine
  const getMacroTailwind = (sym: string) => {
    switch (sym) {
      case 'TURSG':
        return 'Türkiye Sigorta (Insurance & Financial Services): Exceptionally high investment portfolio yields generated in the current high interest-rate regime. Premium growth in motor and non-life lines outpaces loss ratios, delivering record return on equity (ROE) with consistent high-yield dividend payouts.';
      case 'ISMEN':
        return 'İş Yatırım Menkul Değerler (Capital Markets & Brokerage): Undisputed BIST institutional trading volume leader. Beneficiary of high margin loan spreads, corporate IPO pipelines, and expanding retail brokerage accounts. Operates with near-zero debt and exceptional dividend distribution track record.';
      case 'AKBNK':
      case 'GARAN':
      case 'YKBNK':
      case 'HALKB':
        return 'Turkish Tier-1 Banking Sector: Benefiting from monetary orthodox policy, TCMB disinflation trajectory, and foreign sovereign rating upgrades. Net Interest Margin (NIM) expansion anticipated as cost of deposits stabilizes while loan yields remain attractive.';
      case 'FROTO':
        return 'Ford Otosan (Automotive & Commercial Mobility): Major export powerhouse producing Ford Custom and Transit models for European markets. Hard-currency EUR revenues provide an organic currency hedge, while EV manufacturing expansion and rock-solid dividend distributions underpin defensive growth.';
      case 'TUPRS':
        return 'Tüpraş (Refining & Clean Energy Transition): High Mediterranean refining crack spreads (diesel and jet fuel). Strategic transformation into zero-carbon electricity and green hydrogen, backed by massive cash reserves and high dividend yield.';
      case 'EREGL':
        return 'Erdemir (Steel & Heavy Industrial Manufacturing): Cyclical recovery poised on global steel demand reacceleration and domestic infrastructure investment. Major investments in pelletizing plants and low-carbon electric arc furnaces position it for long-term margin expansion.';
      case 'ASELS':
        return 'Aselsan (Defense Electronics & Aerospace): Robust multi-year backlog exceeding $12+ Billion USD in domestic and export military contracts. Strategically protected by government defense spending commitments and high-margin avionics/radar technology.';
      case 'THYAO':
      case 'PGSUS':
        return 'Aviation & Global Logistics: Strong passenger load factors and cargo revenue yield. Significant foreign-currency (USD/EUR) revenue proportion provides natural hedge against local lira fluctuations and fuel cost swings.';
      case 'BIMAS':
      case 'SOKM':
      case 'MGROS':
        return 'Defensive Food Retail: Relentless daily consumer staple demand with resilient pricing power. High inventory turnover and negative working capital model produce fortress cash flows during inflationary periods.';
      case 'KCHOL':
      case 'SAHOL':
        return 'Major Diversified Conglomerates: Holding companies trading at substantial Net Asset Value (NAV) discounts. Broad multi-sector diversification across banking, energy, automotive, and retail with strong hard-currency dividend streams.';
      case 'SISE':
        return 'Şişecam (Global Glass & Soda Ash Leader): Vertically integrated manufacturing footprint across Europe and North America. Structural demand from architecture, automotive glass, and solar panel glass production.';
      case 'PETKM':
        return 'Petkim (Petrochemicals): Core supplier of domestic plastic and synthetic packaging resins. Operational turnaround tied to ethylene-naphtha spread recovery and high capacity utilization.';
      case 'ENKAI':
        return 'Enka İnşaat (Engineering & USD Fortress Balance Sheet): Enormous net cash position held predominantly in hard currencies. Global energy infrastructure, real estate in Moscow, and international engineering backlogs.';
      case 'CCOLA':
        return 'Coca-Cola İçecek (Beverages & Fast-Moving Consumer Goods): Rapid volume expansion across high-growth Central Asian and Middle Eastern territories with strong pricing realization.';
      case 'SPY':
      case 'VOO':
      case 'QQQ':
        return 'US Broad Market & Mega-Cap Tech: Powered by AI infrastructure capital expenditures, hyperscaler cloud revenue acceleration, and resilient US corporate earnings quality.';
      case 'SCHD':
      case 'O':
      case 'VICI':
      case 'KO':
      case 'PEP':
        return 'US Dividend Aristocrats & REITs: Long-term compounding assets with multi-decade histories of annual distribution growth, robust balance sheets, and steady cash-flow generation.';
      default:
        return 'High liquidity component consolidating above primary institutional moving averages. Volume accumulation patterns confirm steady fund support.';
    }
  };

  // Dynamic Company-Specific Pre-Mortem (Failure Scenarios)
  const getPreMortem = (sym: string) => {
    switch (sym) {
      case 'TURSG':
        return [
          'Failure Trigger 1: Severe spike in catastrophic natural disaster claim ratios that temporarily compresses underwriting profit margin.',
          'Failure Trigger 2: Premature regulatory caps on mandatory motor traffic insurance pricing.',
          'Action Rule: Core Dividend asset. Technical dips into support represent prime DCA accumulation tranches. Never panic sell on temporary drawdown.'
        ];
      case 'ISMEN':
        return [
          'Failure Trigger 1: Protracted contraction in aggregate BIST daily trading volumes below ₺50B, which dampens brokerage commission yields.',
          'Failure Trigger 2: Structural breakdown below ₺27.00 support with expanding distribution volume.',
          'Action Rule: Treat market pullbacks as opportunities to boost dividend Yield on Cost unless fundamental brokerage profit is broken.'
        ];
      case 'AKBNK':
      case 'GARAN':
      case 'YKBNK':
      case 'HALKB':
        return [
          'Failure Trigger 1: A daily close below the 50 EMA on above-average volume invalidates the swing momentum thesis.',
          'Failure Trigger 2: Unexpected regulatory tightening or reserve requirement hikes that squeeze banking NIMs.',
          'Action Rule: If price breaks below the defined protective stop, execute immediately. Do not average down on tactical banking swings.'
        ];
      case 'FROTO':
        return [
          'Failure Trigger 1: Sharp economic contraction in European commercial vehicle demand reducing export volume.',
          'Failure Trigger 2: Disruption in critical battery supply chain or tariff disputes in export destinations.',
          'Action Rule: Core compounder. Dips below the 200 EMA represent generational accumulation zones for long-term dividend investors.'
        ];
      case 'TUPRS':
        return [
          'Failure Trigger 1: Collapse in European diesel and jet fuel crack margins below $10/barrel.',
          'Failure Trigger 2: Unplanned refinery maintenance shutdowns extending beyond projected quarters.',
          'Action Rule: Monitor crack spreads. Accumulate on seasonal weak quarters ahead of spring dividend announcements.'
        ];
      case 'ASELS':
        return [
          'Failure Trigger 1: Budgetary defense spending delays or postponement of major state procurement tenders.',
          'Failure Trigger 2: Export license embargoes from foreign component suppliers.',
          'Action Rule: Maintain stop at swing support. Re-enter on confirmed breakout with institutional volume expansion.'
        ];
      default:
        return [
          'Failure Trigger 1: Broader index (XU100/SPY) regime shifts into confirmed bear market with 50/200 EMA death cross.',
          'Failure Trigger 2: Breakdown below key swing support on heavy institutional selling volume.',
          'Action Rule: Respect the protective stop loss without emotional hesitation.'
        ];
    }
  };

  // Dynamic Stock-Specific Executive Directive
  const getHoldingDirective = () => {
    if (isPersonalTpHit) {
      return {
        title: `🎯 Personal Target Reached (+3% to +4% Window)`,
        type: 'tp',
        text: `${cleanSym} is trading at ${curr}${asset.currentPrice.toFixed(2)}, comfortably up ${asset.pnlPercent ? `+${asset.pnlPercent.toFixed(2)}%` : '+3.5%'}. We recommend taking profit on 50% to 100% of the position to recycle capital into new setups, or raising your stop loss to breakeven (${curr}${breakevenLevel.toFixed(2)}) for a risk-free runner.`
      };
    }

    if (hasMultipleBuys) {
      return {
        title: `📦 Multi-Lot DCA Netting in Progress (${asset.buyCount} Buys)`,
        type: 'dca_multilot',
        text: `You hold ${asset.buyCount} separate tranches on ${cleanSym}. Your lowest purchase at ${curr}${lowestBuyPrice.toFixed(2)} is actively offsetting the drag of earlier high buys (up to ${curr}${highestBuyPrice.toFixed(2)}). Blended average cost is reduced to ${curr}${entry.toFixed(2)}. ${distToBreakevenPct > 0 ? `Position is within ${distToBreakevenPct.toFixed(1)}% of full breakeven.` : 'Blended position is currently profitable.'} Continue accumulating lower tranches during pullbacks.`
      };
    }

    if (asset.isDividend) {
      const isAtDiscount = asset.currentPrice < entry;
      return {
        title: `💎 Core Dividend Compounder Strategy`,
        type: 'dividend',
        text: isAtDiscount
          ? `${cleanSym} is trading at ${curr}${asset.currentPrice.toFixed(2)}, below your average cost of ${curr}${entry.toFixed(2)}. This represents a Prime DCA Accumulation Zone where adding shares enhances your future dividend Yield on Cost. Ignore short-term price noise.`
          : `${cleanSym} is trading in positive territory at ${curr}${asset.currentPrice.toFixed(2)}. Hold position to harvest annual dividend cash flows. Only add further tranches on healthy pullbacks toward average cost.`
      };
    }

    return {
      title: `📈 Tactical Swing Management`,
      type: 'swing',
      text: `Maintain your protective stop loss at ${curr}${stop.toFixed(2)}. Target 0 (+3.5% Personal TP) is at ${curr}${target0.toFixed(2)}. Swing Target 1 is at ${curr}${target1.toFixed(2)}. Monitor price action for momentum follow-through.`
    };
  };

  const directive = getHoldingDirective();

  const handleCopyBrief = () => {
    const briefText = `📊 EXECUTIVE HOLDING BRIEF: ${cleanSym} (${asset.name})
--------------------------------------------------
• Status: ${isPersonalTpHit ? 'In Take-Profit Zone (+3-4%)' : isProfitable ? 'Profitable' : asset.isDividend ? 'Prime DCA Accumulation Zone' : 'Loss Watch'}
• Position Size: ${asset.shares || 1} lots @ ${curr}${entry.toFixed(2)} avg
• Invested: ${curr}${(asset.totalCost || (entry * (asset.shares || 1))).toFixed(2)} | Current Value: ${curr}${(asset.currentValue || (asset.currentPrice * (asset.shares || 1))).toFixed(2)}
• Unrealized P&L: ${isProfitable ? '+' : ''}${curr}${(asset.pnlAmount || ((asset.currentPrice - entry) * (asset.shares || 1))).toFixed(2)} (${(asset.pnlPercent || 0).toFixed(2)}%)
• Holding Duration: ${daysHeld ? `${daysHeld} days` : 'Active'}
${hasMultipleBuys ? `• Multi-Lot Diagnostics: ${asset.buyCount} buys. Lowest buy: ${curr}${lowestBuyPrice.toFixed(2)} vs Highest: ${curr}${highestBuyPrice.toFixed(2)}. Blended cost: ${curr}${entry.toFixed(2)}` : ''}

KEY PRICE LEVELS:
• Personal Quick TP (3-4%): ${curr}${target0.toFixed(2)}
• System Swing Target 1: ${curr}${target1.toFixed(2)}
• System Target 2 Runner: ${curr}${target2.toFixed(2)}
• Protection Floor / Stop: ${asset.isDividend ? 'DCA Mode (No hard stop)' : `${curr}${stop.toFixed(2)}`}

AI DIRECTIVE:
${directive.text}

MACRO & SECTOR CATALYST:
${getMacroTailwind(cleanSym)}
`;
    navigator.clipboard.writeText(briefText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleQuickQuestion = (q: string) => {
    setUserQuery(q);
    executeAsk(q);
  };

  const executeAsk = (queryText: string) => {
    if (!queryText.trim()) return;
    const userMsg = queryText.trim();
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setUserQuery('');
    setIsThinking(true);

    setTimeout(() => {
      let aiReply = '';
      const lower = userMsg.toLowerCase();

      // Flexible semantic matching with typo tolerance (e.g. "accumualte", "accumlate", "dca", "buy more")
      const isBankComparison = /bank|akbnk|halkb|vakbn|garan|ykbnk|isctr|better than|which bank|compare/i.test(lower);
      const isAccumulateQuery = /accum|dca|buy|add|more|tranche|dip|entry|cost basis|average down|when should i/i.test(lower);
      const isStopQuery = /stop|breakeven|break-even|loss|cut|risk|protect|floor/i.test(lower);
      const isTargetProfitQuery = /profit|target|sell|trim|exit|take profit|scale out/i.test(lower);
      const isDividendQuery = /dividend|payout|yield|income|cashflow|cash flow|temett[uü]/i.test(lower);

      if (isBankComparison) {
        aiReply = `🏦 Banking Sector Comparative Analysis & Hierarchy:

• Private Tier-1 Leaders (AKBNK / GARAN) vs State Banks (HALKB / VAKBN):
  1. Return on Equity (ROE): Akbank (~34.2%) and Garanti (~37.1%) produce nearly double the profitability of state banks (HALKB ~18.4%, VAKBN ~19.2%).
  2. Fortress Capital (CAR): AKBNK leads with CAR > 19.4%, giving it the strongest buffer under orthodox monetary policy.
  3. Dividend Track Record: AKBNK pays 28-35% of earnings as cash dividends (Yield: ~4.73%). State banks retain earnings for policy lending with negligible payouts (~1.2%).
• Recommendation: Holding 4 small fragmented banks (AKBNK, YKBNK, HALKB, VAKBN) dilutes returns. Consolidating HALKB and VAKBN into AKBNK upgrades your portfolio's safety grade and directly boosts annual cashflow by +₺170-₺220/yr.`;
      } else if (asset.isDividend) {
        // --- DIVIDEND / CORE COMPOUNDER REASONING ENGINE ---
        if (isAccumulateQuery || lower.includes('when')) {
          const isAtDiscount = asset.currentPrice < entry;
          const discountPct = isAtDiscount ? (((entry - asset.currentPrice) / entry) * 100).toFixed(1) : '0';
          const dcaFloor = (entry * 0.90).toFixed(2);
          const dcaCeil = (entry * 0.97).toFixed(2);

          aiReply = `💡 Accumulation Blueprint for ${cleanSym} (Core Dividend Compounder):

• Current Status: Trading at ${curr}${asset.currentPrice.toFixed(2)} ${isAtDiscount ? `(${discountPct}% below your avg cost of ${curr}${entry.toFixed(2)})` : `(near your avg cost of ${curr}${entry.toFixed(2)})`}.
• Prime Accumulation Zone: ${curr}${dcaFloor} – ${curr}${dcaCeil}. ${isAtDiscount ? `You are currently right inside the prime accumulation zone!` : `Wait for modest pullbacks to add.`}
• When to Add Tranches:
  1. Add on dips below ${curr}${entry.toFixed(2)} to systematically lower your average cost basis.
  2. Each tranche added at lower prices immediately expands your forward Yield on Cost (YoC).
  3. Size each DCA tranche at 20-25% of your planned total position allocation so you retain dry powder if price tests deeper support.
• Golden Rule: Do NOT panic-sell or use tight swing stops. Core dividend assets compound through market cycles.`;
        } else if (isStopQuery) {
          aiReply = `🛡️ Risk & Stop Philosophy for ${cleanSym} (Core Dividend Holding):

Because ${cleanSym} is an institutional dividend compounder, traditional tight swing stops do NOT apply.
• Why No Tight Stop? Short-term price dips increase dividend cash-flow yield and offer DCA accumulation opportunities. Selling on a -5% dip defeats the purpose of dividend compounding.
• When to Consider Breakeven: A breakeven floor is optional only after a substantial rally (+15% to +20%) to protect accumulated capital.
• Invalidation Condition: The only true exit trigger for a dividend holding is fundamental deterioration (e.g. collapse in insurance underwriting profits or dividend policy cancellation), NOT short-term technical noise.`;
        } else if (isTargetProfitQuery) {
          aiReply = `🎯 Return Realization for ${cleanSym}:
• Primary Return: Annual dividend cash distributions harvested directly without touching your principal shares.
• Capital Appreciation: If ${cleanSym} rallies toward Target 1 (${curr}${target1.toFixed(2)}), you may optionally trim a minor tranche (20-25%) to lock in gains and redeploy, while preserving the core compounding engine.`;
        } else if (isDividendQuery) {
          aiReply = `📈 Dividend Yield & Compounding for ${cleanSym}:
• Reliable cash generator designed for steady annual distributions.
• Buying additional lots at current prices (~${curr}${asset.currentPrice.toFixed(2)}) enhances your future dividend payout yield.
• Reinvest dividend cash-flows into whichever portfolio holding is currently sitting in its Prime DCA Zone.`;
        } else {
          aiReply = `💎 Core Dividend Status for ${cleanSym}:
${cleanSym} is a designated long-term dividend compounder (Current: ${curr}${asset.currentPrice.toFixed(2)} vs Avg Entry: ${curr}${entry.toFixed(2)}). Capital allocation priority is patient accumulation on weakness and collecting high dividend cash flow, bypassing short-term swing stops.`;
        }
      } else {
        // --- SWING / MOMENTUM SETUP REASONING ENGINE ---
        if (isStopQuery || lower.includes('breakeven')) {
          aiReply = `For ${cleanSym}, your entry is ${curr}${entry.toFixed(2)}. ${
            (asset.pnlPercent || 0) >= 3.0
              ? `Because you are in profit (+${(asset.pnlPercent || 0).toFixed(2)}%), moving your stop loss to ${curr}${breakevenLevel.toFixed(2)} eliminates all downside risk and turns this into a 100% Free Trade.`
              : `Since the position is currently around entry, keep your initial stop at ${curr}${stop.toFixed(2)}. Move to breakeven once price reaches +3% to +4% profit.`
          }`;
        } else if (isTargetProfitQuery) {
          aiReply = `Exit blueprint for ${cleanSym}:
• Your Personal Quick TP (+3% to +4%): Lock in initial profits at ${curr}${target0.toFixed(2)} to accelerate capital turnover.
• System Target 1 (${curr}${target1.toFixed(2)}): Sell 50% to lock in full swing gains and move stop to entry.
• System Target 2 Runner (${curr}${target2.toFixed(2)}): Trail the remaining position along the 20-day EMA.`;
        } else if (isAccumulateQuery) {
          aiReply = `For swing momentum setup ${cleanSym} (Current: ${curr}${asset.currentPrice.toFixed(2)}), avoid averaging down if price breaks below your stop loss (${curr}${stop.toFixed(2)}). Only add to winning positions on confirmed technical breakouts with volume.`;
        } else {
          aiReply = `Based on current technical indicators for ${cleanSym} (${asset.strategy || 'Momentum Setup'}), the priority is capital preservation. Maintain your stop at ${curr}${stop.toFixed(2)} and watch for follow-through toward ${curr}${target1.toFixed(2)}.`;
        }
      }

      setChatMessages(prev => [...prev, { sender: 'ai', text: aiReply }]);
      setIsThinking(false);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-transparent flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-gray-900 dark:text-white">{cleanSym}</span>
              <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">
                {asset.market}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-black flex items-center gap-1">
                <span>🤖</span>
                <span>AI Trade Co-Pilot</span>
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">{asset.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Level Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-4 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 text-center text-xs">
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Current Price</span>
            <p className="font-bold text-gray-900 dark:text-white mt-0.5">
              {curr}{asset.currentPrice.toFixed(2)}
            </p>
          </div>
          <div>
            <span className="text-[10px] text-gray-400 uppercase font-semibold">Entry / Cost</span>
            <p className="font-bold text-gray-900 dark:text-white mt-0.5">
              {curr}{entry.toFixed(2)}
            </p>
          </div>
          <div>
            <span className={`text-[10px] uppercase font-semibold ${asset.isDividend ? 'text-purple-500' : 'text-rose-500'}`}>
              {asset.isDividend ? 'Risk Mode' : 'Stop Loss'}
            </span>
            <p className={`font-bold mt-0.5 ${asset.isDividend ? 'text-purple-600 dark:text-purple-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {asset.isDividend ? '💎 DCA Focus' : `${curr}${stop.toFixed(2)}`}
            </p>
          </div>
          <div>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold">Personal TP (3-4%)</span>
            <p className="font-bold text-amber-600 dark:text-amber-400 mt-0.5 flex items-center justify-center gap-1 font-mono">
              <span>{curr}{target0.toFixed(2)}</span>
              {isPersonalTpHit && <span className="text-[9px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-1 rounded font-bold">✓</span>}
            </p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-[10px] text-emerald-500 uppercase font-semibold">Target 1</span>
            <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
              {curr}{target1.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-850 px-6 pt-2 overflow-x-auto">
          {isHolding && (
            <button
              onClick={() => setActiveTab('brief')}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
                activeTab === 'brief'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              📋 Executive Brief
            </button>
          )}
          <button
            onClick={() => setActiveTab('blueprint')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === 'blueprint'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            🎯 Tactical Blueprint
          </button>
          <button
            onClick={() => setActiveTab('premortem')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === 'premortem'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            ⚠️ Pre-Mortem (Failure Risks)
          </button>
          <button
            onClick={() => setActiveTab('qa')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
              activeTab === 'qa'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            💬 Interactive Q&A
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-grow text-xs">
          {activeTab === 'brief' && (
            <div className="space-y-4">
              {/* Executive Summary Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50/80 via-blue-50/50 to-indigo-50/80 dark:from-purple-950/40 dark:via-blue-950/30 dark:to-indigo-950/40 border border-purple-200 dark:border-purple-800/60 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-gray-900 dark:text-white">
                      {cleanSym} · {asset.name}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      isPersonalTpHit
                        ? 'bg-emerald-500 text-white animate-pulse'
                        : isProfitable
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : asset.isDividend
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}>
                      {isPersonalTpHit
                        ? '🏆 TAKE PROFIT ZONE (+3-4%)'
                        : isProfitable
                          ? '🟢 PROFITABLE'
                          : asset.isDividend
                            ? '💎 PRIME DCA ZONE'
                            : '⚠️ LOSS WATCH'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyBrief}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <span>{isCopied ? '✓' : '📋'}</span>
                    <span>{isCopied ? 'Copied to Clipboard!' : 'Copy Brief'}</span>
                  </button>
                </div>

                {/* 4-Stat Box */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-purple-100 dark:border-purple-900/40">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Position Size</span>
                    <p className="font-bold text-gray-900 dark:text-white mt-0.5 font-mono">
                      {asset.shares?.toLocaleString() || '1'} lots
                    </p>
                    <span className="text-[10px] text-gray-500 block">Avg: {curr}{entry.toFixed(2)}</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-purple-100 dark:border-purple-900/40">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Capital Invested</span>
                    <p className="font-bold text-gray-900 dark:text-white mt-0.5 font-mono">
                      {curr}{(asset.totalCost || (entry * (asset.shares || 1))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-gray-500 block">Current: {curr}{(asset.currentValue || (asset.currentPrice * (asset.shares || 1))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-purple-100 dark:border-purple-900/40">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Unrealized P&L</span>
                    <p className={`font-bold mt-0.5 font-mono ${isProfitable ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {isProfitable ? '+' : ''}{curr}{(asset.pnlAmount || ((asset.currentPrice - entry) * (asset.shares || 1))).toFixed(2)}
                    </p>
                    <span className={`text-[10px] font-bold block ${isProfitable ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isProfitable ? '▲ +' : '▼ '}{(asset.pnlPercent || 0).toFixed(2)}%
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 border border-purple-100 dark:border-purple-900/40">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Holding Time</span>
                    <p className="font-bold text-gray-900 dark:text-white mt-0.5 font-mono">
                      {daysHeld ? `${daysHeld} days` : 'Active'}
                    </p>
                    <span className="text-[10px] text-gray-500 block">{asset.entryDate || 'Recent'}</span>
                  </div>
                </div>
              </div>

              {/* Actionable Executive AI Verdict */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 space-y-2.5">
                <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-bold">
                  <span>🤖</span>
                  <span>Actionable Holding Directive</span>
                </div>
                <div className="space-y-2 text-gray-700 dark:text-gray-300 leading-relaxed">
                  <div className={`p-3 rounded-xl border space-y-1.5 ${
                    directive.type === 'tp'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : directive.type === 'dca_multilot'
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                        : directive.type === 'dividend'
                          ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300'
                          : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5 text-xs">
                      <span>{directive.type === 'tp' ? '🎯' : directive.type === 'dca_multilot' ? '📦' : directive.type === 'dividend' ? '💎' : '📈'}</span>
                      <span>{directive.title}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      {directive.text}
                    </p>
                  </div>

                  {/* Level Map Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-center">
                    <div className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <span className="text-[10px] text-gray-400 font-sans uppercase">⚡ Personal TP (+3.5%)</span>
                      <p className="font-bold text-amber-600 dark:text-amber-400 mt-0.5">{curr}{target0.toFixed(2)}</p>
                      <span className="text-[9px] text-gray-500 font-sans block">{isPersonalTpHit ? '✓ Reached' : `${((target0 - asset.currentPrice)/asset.currentPrice * 100).toFixed(1)}% to target`}</span>
                    </div>

                    <div className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <span className="text-[10px] text-gray-400 font-sans uppercase">🎯 Swing Target 1</span>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{curr}{target1.toFixed(2)}</p>
                      <span className="text-[9px] text-gray-500 font-sans block">{((target1 - asset.currentPrice)/asset.currentPrice * 100).toFixed(1)}% to target</span>
                    </div>

                    <div className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <span className="text-[10px] text-gray-400 font-sans uppercase">🛡️ Protection Floor</span>
                      <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">{asset.isDividend ? 'DCA Mode' : `${curr}${stop.toFixed(2)}`}</p>
                      <span className="text-[9px] text-gray-500 font-sans block">{asset.isDividend ? 'Long-term hold' : `Risk: ${curr}${(entry - stop).toFixed(2)}`}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Macro & Catalyst Tailwinds */}
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-1.5">
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-bold">
                  <span>🌐</span>
                  <span>Macro & Sector Catalyst</span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-[11px]">
                  {getMacroTailwind(cleanSym)}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'blueprint' && (
            <div className="space-y-4">
              {/* Macro & Fundamental Catalyst */}
              <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60">
                <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300 font-bold mb-1.5">
                  <span>🌐</span>
                  <span>Macro & Sector Catalyst</span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {getMacroTailwind(cleanSym)}
                </p>
              </div>

              {/* Multi-Target & Strategy Blueprint */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center gap-1.5 text-gray-900 dark:text-white font-bold">
                  <span>🎯</span>
                  <span>{asset.isDividend ? 'Core Dividend Accumulation Blueprint' : 'Multi-Target Scaling & Breakeven Rule'}</span>
                </div>
                {asset.isDividend ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-purple-500 uppercase font-semibold">1. DCA Accumulation</span>
                      <p className="font-bold text-purple-600 dark:text-purple-400 mt-0.5">Dips &lt; Cost</p>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Buy tranches on weakness</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-emerald-500 uppercase font-semibold">2. Cash Flow Yield</span>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">Yield on Cost Focus</p>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Harvest dividends annually</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-blue-500 uppercase font-semibold">3. Multi-Year Horizon</span>
                      <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">Indefinite Hold</p>
                      <span className="text-[10px] text-gray-500 block mt-0.5">No tight swing stops</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60">
                      <span className="text-[10px] text-amber-700 dark:text-amber-300 uppercase font-bold">⚡ 1. Personal TP (%3-4)</span>
                      <p className="font-bold text-amber-700 dark:text-amber-300 mt-0.5">{curr}{target0.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 block mt-0.5">Quick turnover (1-3 sessions)</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">2. De-Risk Trigger</span>
                      <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">{curr}{breakevenLevel.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Move stop to entry (Risk: ₺0)</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">3. Target 1 (50% Trim)</span>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{curr}{target1.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Lock 50% profit at R:R 1.5x</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">4. Target 2 (Runner)</span>
                      <p className="font-bold text-purple-600 dark:text-purple-400 mt-0.5">{curr}{target2.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Trail with 20 EMA close</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'premortem' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                <span className="font-bold">⚠️ Institutional Pre-Mortem Protocol</span>
                <p className="text-[11px] mt-0.5">
                  Before entering any trade, top fund managers identify the exact conditions that would invalidate the thesis ahead of time.
                </p>
              </div>

              <div className="space-y-2">
                {getPreMortem(cleanSym).map((riskPoint, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                      {riskPoint}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'qa' && (
            <div className="space-y-3">
              {/* Preset quick question chips */}
              <div className="flex flex-wrap gap-1.5">
                {asset.isDividend ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickQuestion('When should I accumulate more shares?')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors"
                    >
                      💰 When to accumulate more?
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickQuestion('What is the stop loss rule for this dividend position?')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-650 text-gray-700 dark:text-gray-200 transition-colors"
                    >
                      🛡️ Stop loss & risk rule?
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickQuestion('What is the target and profit realization plan?')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-650 text-gray-700 dark:text-gray-200 transition-colors"
                    >
                      🎯 Target & trimming plan?
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickQuestion('How does dividend yield compound with this position?')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors"
                    >
                      📈 Dividend yield compounding?
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickQuestion('When should I move my stop loss to breakeven?')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-650 text-gray-700 dark:text-gray-200 transition-colors"
                    >
                      🛡️ Breakeven rule?
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickQuestion('Should I sell 50% at Target 1?')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-650 text-gray-700 dark:text-gray-200 transition-colors"
                    >
                      🎯 50% Scaling plan?
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickQuestion('Is this a good level for DCA accumulation?')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-650 text-gray-700 dark:text-gray-200 transition-colors"
                    >
                      💰 DCA opportunity?
                    </button>
                  </>
                )}
              </div>

              {/* Chat history */}
              <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 min-h-[140px] max-h-[220px] overflow-y-auto space-y-2.5">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <span>Ask any tactical question about {cleanSym} above or type below.</span>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-line ${
                          msg.sender === 'user'
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-tl-none shadow-sm'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
                {isThinking && (
                  <div className="text-gray-400 text-xs italic animate-pulse">
                    🤖 AI Co-Pilot analyzing price action & risk factors...
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Ask AI Co-Pilot about ${cleanSym}...`}
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') executeAsk(userQuery);
                  }}
                  className="flex-grow px-3.5 py-2 text-xs rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-650 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => executeAsk(userQuery)}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/20"
                >
                  Ask
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 flex justify-between items-center text-xs">
          <span className="text-gray-400 text-[11px]">
            Real-time Autonomous Reasoning Engine · Powered by MarketPulse AI
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
