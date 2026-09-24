import React, { useState, useEffect } from 'react';

export default function PositionCalculator() {
  const [currency, setCurrency] = useState<'USD' | 'TRY'>('USD');
  const [accountSize, setAccountSize] = useState<number>(10000);
  const [riskPct, setRiskPct] = useState<number>(1.0);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [stopLoss, setStopLoss] = useState<number>(0);
  
  const [riskAmount, setRiskAmount] = useState(0);
  const [shares, setShares] = useState(0);
  const [positionValue, setPositionValue] = useState(0);

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
        </div>
      </div>
    </div>
  );
}
