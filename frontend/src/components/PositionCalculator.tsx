import React, { useState, useEffect } from 'react';

interface PositionCalculatorProps {
  selectedTrade?: {
    entryPrice: number;
    stopLoss: number;
    targetPrice?: number;
    currency: 'USD' | 'TRY';
    symbol?: string;
  } | null;
}

export default function PositionCalculator({ selectedTrade }: PositionCalculatorProps = {}) {
  const [currency, setCurrency] = useState<'USD' | 'TRY'>('USD');
  const [accountSize, setAccountSize] = useState<number>(10000);
  const [riskPct, setRiskPct] = useState<number>(1.0);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [stopLoss, setStopLoss] = useState<number>(0);
  const [targetPrice, setTargetPrice] = useState<number>(0);
  
  const [riskAmount, setRiskAmount] = useState(0);
  const [shares, setShares] = useState(0);
  const [positionValue, setPositionValue] = useState(0);

  useEffect(() => {
    if (selectedTrade) {
      setEntryPrice(selectedTrade.entryPrice);
      setStopLoss(selectedTrade.stopLoss);
      setTargetPrice(selectedTrade.targetPrice || 0);
      setCurrency(selectedTrade.currency);
      if (selectedTrade.currency === 'TRY' && accountSize === 10000) {
        setAccountSize(300000);
      } else if (selectedTrade.currency === 'USD' && accountSize === 300000) {
        setAccountSize(10000);
      }
    }
  }, [selectedTrade]);

  useEffect(() => {
    const rAmt = accountSize * (riskPct / 100);
    setRiskAmount(rAmt);
    
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    if (riskPerShare > 0 && entryPrice > 0) {
      const numShares = Math.floor(rAmt / riskPerShare);
      setShares(numShares);
      setPositionValue(numShares * entryPrice);
    } else {
      setShares(0);
      setPositionValue(0);
    }
  }, [accountSize, riskPct, entryPrice, stopLoss]);

  const currencySymbol = currency === 'USD' ? '$' : '₺';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
          <svg className="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
          Position Calculator
        </h2>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button 
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${currency === 'USD' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
            onClick={() => setCurrency('USD')}
          >
            USD
          </button>
          <button 
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${currency === 'TRY' ? 'bg-white dark:bg-gray-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
            onClick={() => setCurrency('TRY')}
          >
            TRY
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Account Size ({currencySymbol})</label>
          <input 
            type="number" 
            value={accountSize || ''} 
            onChange={(e) => setAccountSize(Number(e.target.value))}
            className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Risk Percentage</label>
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{riskPct.toFixed(1)}%</span>
          </div>
          <input 
            type="range" 
            min="0.1" max="5" step="0.1" 
            value={riskPct} 
            onChange={(e) => setRiskPct(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Entry Price</label>
            <input 
              type="number" 
              value={entryPrice || ''} 
              onChange={(e) => setEntryPrice(Number(e.target.value))}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Stop Loss</label>
            <input 
              type="number" 
              value={stopLoss || ''} 
              onChange={(e) => setStopLoss(Number(e.target.value))}
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800/30">
        <div className="grid grid-cols-2 gap-y-3">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Risk Amount</div>
            <div className="font-bold text-lg text-gray-900 dark:text-white">{currencySymbol}{riskAmount.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Shares / Units</div>
            <div className="font-bold text-lg text-blue-600 dark:text-blue-400">{shares}</div>
          </div>
          <div className="col-span-2 pt-2 border-t border-blue-200 dark:border-blue-800/50">
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Position Value</div>
            <div className="font-bold text-xl text-gray-900 dark:text-white">{currencySymbol}{positionValue.toFixed(2)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ({((positionValue / accountSize) * 100).toFixed(1)}% of account)
            </div>
          </div>

          {shares > 0 && (
            <div className="col-span-2 pt-3 border-t border-blue-200 dark:border-blue-800/50">
              {(() => {
                const t1Shares = Math.max(1, Math.ceil(shares * 0.5));
                const t2Shares = Math.max(0, shares - t1Shares);
                const calcT2 = entryPrice > 0 && stopLoss > 0 && entryPrice > stopLoss
                  ? Number((entryPrice + 2 * (entryPrice - stopLoss)).toFixed(2))
                  : 0;
                const effT1 = targetPrice > 0 ? targetPrice : Number((entryPrice * 1.05).toFixed(2));
                const effT2 = calcT2 > 0 ? calcT2 : Number((entryPrice * 1.10).toFixed(2));

                return (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                        <span>🎯</span> Target Exit Allocation ({shares} shares):
                      </span>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">50/50 Rule</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
                        <div className="flex justify-between items-center text-[10px] text-gray-500 dark:text-gray-400">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Target 1 (50%)</span>
                          <span>50%</span>
                        </div>
                        <div className="text-base font-black text-gray-900 dark:text-white mt-0.5">
                          Sell {t1Shares} shares
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5 flex justify-between font-mono">
                          <span>@ {currencySymbol}{effT1.toFixed(2)}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            +{currencySymbol}{((effT1 - entryPrice) * t1Shares).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800/60 shadow-xs">
                        <div className="flex justify-between items-center text-[10px] text-gray-500 dark:text-gray-400">
                          <span className="font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Target 2 (50%)</span>
                          <span>Runner</span>
                        </div>
                        <div className="text-base font-black text-gray-900 dark:text-white mt-0.5">
                          Sell {t2Shares} shares
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5 flex justify-between font-mono">
                          <span>@ {currencySymbol}{effT2.toFixed(2)}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            +{currencySymbol}{((effT2 - entryPrice) * t2Shares).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                      💡 <em>Scale-out rule: After selling Target 1 ({t1Shares} shares), move stop loss on remaining {t2Shares} shares to breakeven ({currencySymbol}{entryPrice.toFixed(2)}) for a risk-free runner.</em>
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
