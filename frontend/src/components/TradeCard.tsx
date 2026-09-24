import React, { useState } from 'react';

export interface TradeSignal {
  symbol: string;
  name: string;
  strategy: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  confidence: number;
  rationale: string;
  market: string;
  date: string;
  currency: string;
}

export default function TradeCard({ signal }: { signal: TradeSignal }) {
  const [expanded, setExpanded] = useState(false);
  
  const risk = Math.abs(signal.entryPrice - signal.stopLoss);
  const reward = Math.abs(signal.targetPrice - signal.entryPrice);
  const rrRatio = risk > 0 ? (reward / risk).toFixed(2) : 'N/A';
  
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: signal.currency }).format(price);
  };

  const getStrategyColor = (strategy: string) => {
    if (strategy.toLowerCase().includes('breakout')) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    if (strategy.toLowerCase().includes('pullback')) return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col transition-all duration-200 hover:shadow-xl">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg text-gray-900 dark:text-white">{signal.symbol}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{signal.name}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-semibold ${getStrategyColor(signal.strategy)}`}>
          {signal.strategy}
        </span>
      </div>
      
      <div className="p-4 flex-grow">
        <div className="grid grid-cols-3 gap-2 mb-4 text-sm">
          <div className="flex flex-col">
            <span className="text-gray-500 dark:text-gray-400 text-xs">Entry</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(signal.entryPrice)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-red-500 dark:text-red-400 text-xs">Stop Loss</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(signal.stopLoss)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-green-500 dark:text-green-400 text-xs">Target</span>
            <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(signal.targetPrice)}</span>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600 dark:text-gray-300">Risk/Reward ({rrRatio})</span>
          </div>
          <div className="w-full h-2 flex rounded-full overflow-hidden">
            <div className="bg-red-500 h-full" style={{ width: '33%' }}></div>
            <div className="bg-green-500 h-full" style={{ width: '67%' }}></div>
          </div>
        </div>

        <div className="mb-2 flex items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">Confidence:</span>
          <div className="flex">
            {[...Array(10)].map((_, i) => (
              <svg key={i} className={`w-3 h-3 ${i < signal.confidence ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
        </div>

        <div>
          <button 
            onClick={() => setExpanded(!expanded)} 
            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 flex items-center"
          >
            {expanded ? 'Hide Rationale' : 'Show AI Rationale'}
            <svg className={`w-3 h-3 ml-1 transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </button>
          {expanded && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-2 rounded">
              {signal.rationale}
            </div>
          )}
        </div>
      </div>
      
      <div className="bg-gray-50 dark:bg-gray-900 p-3 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
        <span className="px-2 py-0.5 border border-gray-200 dark:border-gray-600 rounded text-[10px] uppercase font-bold">{signal.market}</span>
        <span>{new Date(signal.date).toLocaleDateString()}</span>
        <button className="text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium">Calc Size →</button>
      </div>
    </div>
  );
}
