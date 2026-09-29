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
  isDividend?: boolean;
  notes?: string;
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
  const [activeTab, setActiveTab] = useState<'blueprint' | 'premortem' | 'qa'>('blueprint');
  const [userQuery, setUserQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([]);
  const [isThinking, setIsThinking] = useState(false);

  if (!isOpen || !asset) return null;

  const curr = asset.currency === 'USD' ? '$' : '₺';
  const cleanSym = asset.symbol.replace('.IS', '').toUpperCase();
  const entry = asset.entryPrice || asset.currentPrice;
  const stop = asset.stopLoss || (entry * 0.95);
  const target1 = asset.targetPrice || (entry * 1.10);
  const target2 = entry * 1.18;
  const breakevenLevel = entry * 1.002; // cover broker commission
  const isProfitable = (asset.pnlPercent || 0) >= 0;

  // Synthesize intelligence based on asset profile
  const getMacroTailwind = (sym: string) => {
    switch (sym) {
      case 'AKBNK':
      case 'HALKB':
        return 'Turkish Banking Sector: Sensitive to TCMB rate cycle and Net Interest Margin (NIM) trajectory. Disinflation policy and lira stabilization favor foreign institutional inflows into tier-1 liquid bank equities.';
      case 'ISMEN':
        return 'Brokerage & Capital Markets: Driven by BIST retail account expansion, margin loan spreads, and IPO investment banking fee pipelines. Exceptional cash-flow generation with high dividend distribution.';
      case 'TURSG':
        return 'Insurance & Financial Services: Rapid investment portfolio yield expansion in high-rate environment. Strong premium growth in motor and health lines outpaces loss ratios, fueling record ROE.';
      case 'SOKM':
      case 'BIMAS':
        return 'Discount Food Retail: Strong pricing power and defensive consumer cash flow. Essential staple demand provides high resilience against macroeconomic slowdowns.';
      case 'THYAO':
      case 'PGSUS':
        return 'Aviation & Tourism: Hard-currency USD/EUR revenue generation with seasonal passenger load factors. Natural hedge against local currency fluctuations.';
      case 'ASELS':
        return 'Defense & High-Tech: Long-term multi-billion USD state and export order backlogs. Strategic insulation from short-term retail economic cycles.';
      case 'TUPRS':
        return 'Refining & Energy: Mediterranean refining margins and petrochemical spreads. High dividend payout ratio and defensive fortress balance sheet.';
      case 'SPY':
      case 'QQQ':
        return 'US Tech & Mega-Cap: Driven by US Federal Reserve liquidity, corporate AI capex cycles, and cloud revenue growth.';
      default:
        return 'Consolidation above key moving averages with institutional accumulation patterns across major liquid index components.';
    }
  };

  const getPreMortem = (sym: string) => {
    switch (sym) {
      case 'AKBNK':
      case 'HALKB':
        return [
          'Failure Trigger 1: A daily close below the 50 EMA on above-average volume invalidates the swing momentum thesis.',
          'Failure Trigger 2: Unexpected monetary policy tightening or regulatory margin restrictions that compress banking NIMs.',
          'Action Rule: If price breaks below the defined stop loss, cut immediately. Never average down on banking momentum swings.'
        ];
      case 'ISMEN':
        return [
          'Failure Trigger 1: Sustained drop in BIST aggregate daily trading volume below ₺60B, which dampens brokerage commission yields.',
          'Failure Trigger 2: Structural breakdown below ₺29.50 support.',
          'Action Rule: For core dividend holdings, treat pullbacks as DCA zones unless the fundamental dividend payout thesis is compromised.'
        ];
      case 'TURSG':
        return [
          'Failure Trigger 1: Spike in catastrophic claim ratios or sudden regulatory price caps on mandatory insurance.',
          'Failure Trigger 2: Structural breakdown of multi-month 200 EMA support.',
          'Action Rule: As a Core Dividend Compounder, price dips into support are accumulation/DCA zones. Do not exit on tight swing stops.'
        ];
      default:
        return [
          'Failure Trigger 1: Broader index (XU100/SPY) regime shifts from Bullish to Bearish with 50/200 EMA death cross.',
          'Failure Trigger 2: Breakdown below key swing support with expanding volume.',
          'Action Rule: Respect the hard stop loss without hesitation.'
        ];
    }
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
      const isAccumulateQuery = /accum|dca|buy|add|more|tranche|dip|entry|cost basis|average down|when should i/i.test(lower);
      const isStopQuery = /stop|breakeven|break-even|loss|cut|risk|protect|floor/i.test(lower);
      const isTargetProfitQuery = /profit|target|sell|trim|exit|take profit|scale out/i.test(lower);
      const isDividendQuery = /dividend|payout|yield|income|cashflow|cash flow|temett[uü]/i.test(lower);

      if (asset.isDividend) {
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
          aiReply = `Institutional rule for ${cleanSym}: Sell 50% at Target 1 (${curr}${target1.toFixed(2)}) to lock in cash and de-risk. Move stop on remaining 50% to entry, then trail Target 2 (${curr}${target2.toFixed(2)}) along the 20-day EMA.`;
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
        <div className="grid grid-cols-4 gap-2 p-4 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 text-center text-xs">
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
            <span className="text-[10px] text-emerald-500 uppercase font-semibold">Target 1</span>
            <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {curr}{target1.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-850 px-6 pt-2">
          <button
            onClick={() => setActiveTab('blueprint')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'blueprint'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            📋 Tactical Blueprint
          </button>
          <button
            onClick={() => setActiveTab('premortem')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'premortem'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            ⚠️ Pre-Mortem (Failure Risks)
          </button>
          <button
            onClick={() => setActiveTab('qa')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">1. De-Risk Trigger</span>
                      <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">{curr}{breakevenLevel.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Move stop to entry (Risk: ₺0)</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">2. Target 1 (50% Trim)</span>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{curr}{target1.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 block mt-0.5">Lock 50% profit at R:R 1.5x</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-650">
                      <span className="text-[10px] text-gray-400 uppercase font-semibold">3. Target 2 (Runner)</span>
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
