'use client';

import React, { useState, useEffect } from 'react';
import MarketRegimeBanner, { RegimeStatus } from '../components/MarketRegimeBanner';
import TradeCard, { TradeSignal } from '../components/TradeCard';
import AssetTable, { AssetData } from '../components/AssetTable';
import PositionCalculator from '../components/PositionCalculator';
import AddAssetModal from '../components/AddAssetModal';

// Mock data until API is fully connected
const MOCK_SIGNALS: TradeSignal[] = [
  {
    symbol: 'THYAO', name: 'Türk Hava Yolları', strategy: 'Volatility Breakout',
    entryPrice: 310.50, stopLoss: 295.00, targetPrice: 350.00,
    confidence: 8, rationale: 'Price broke above 20-day high with 2x average volume. RSI showing strong momentum without being overbought.',
    market: 'BIST', date: new Date().toISOString(), currency: 'TRY'
  },
  {
    symbol: 'NVDA', name: 'NVIDIA Corp', strategy: 'EMA Pullback',
    entryPrice: 125.40, stopLoss: 118.00, targetPrice: 145.00,
    confidence: 7, rationale: 'Retracement to 50-day EMA in a confirmed uptrend. Bullish divergence on MACD.',
    market: 'US', date: new Date().toISOString(), currency: 'USD'
  }
];

const MOCK_ASSETS: AssetData[] = [
  { id: '1', symbol: 'SPY', name: 'SPDR S&P 500', market: 'US', price: 545.20, changePercent: 0.8, rsi: 62.4, emaStatus: 'Above 200 EMA', volumeRatio: 1.1 },
  { id: '2', symbol: 'QQQ', name: 'Invesco QQQ Trust', market: 'US', price: 480.15, changePercent: 1.2, rsi: 68.5, emaStatus: 'Above 200 EMA', volumeRatio: 1.3 },
  { id: '3', symbol: 'THYAO', name: 'Türk Hava Yolları', market: 'BIST', price: 310.50, changePercent: 2.4, rsi: 58.2, emaStatus: 'Above 200 EMA', volumeRatio: 2.1 },
  { id: '4', symbol: 'TUPRS', name: 'Tüpraş', market: 'BIST', price: 165.40, changePercent: -1.2, rsi: 42.1, emaStatus: 'Near 50 EMA', volumeRatio: 0.8 },
  { id: '5', symbol: 'MAC', name: 'Marmara Capital', market: 'TEFAS', price: 12.45, changePercent: 0.5, rsi: 55.0, emaStatus: 'Above 200 EMA', volumeRatio: 1.0 },
];

export default function Home() {
  const [usRegime, setUsRegime] = useState<RegimeStatus | undefined>();
  const [bistRegime, setBistRegime] = useState<RegimeStatus | undefined>();
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // In a real app, these would fetch from the API
    // fetchMarketRegime().then(...)
    setTimeout(() => {
      setUsRegime({ status: 'Bullish', close: 545.20, trend: 'up' });
      setBistRegime({ status: 'Neutral', close: 9850.40, trend: 'flat' });
      setSignals(MOCK_SIGNALS);
      setAssets(MOCK_ASSETS);
    }, 1000);
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 pb-20">
      <header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-40 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <svg className="w-8 h-8 text-blue-600 dark:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
            <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">MarketPulse</h1>
          </div>
          <div className="flex items-center">
            {/* Simple dark mode toggle visual placeholder - real logic would go in layout or via next-themes */}
            <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
            </button>
          </div>
        </div>
      </header>

      <MarketRegimeBanner usRegime={usRegime} bistRegime={bistRegime} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-2/3 space-y-4">
            <div className="flex justify-between items-end">
              <h2 className="text-xl font-bold">Today's Trade Opportunities</h2>
              <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View All Scans →</button>
            </div>
            
            {signals.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {signals.map((sig, idx) => (
                  <TradeCard key={idx} signal={sig} />
                ))}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <p className="text-gray-500 animate-pulse">Running market scan...</p>
              </div>
            )}
          </div>

          <div className="lg:w-1/3">
            <PositionCalculator />
          </div>
        </div>

        <div className="pt-4">
          <AssetTable assets={assets} />
        </div>
      </div>

      <button 
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-110 z-40 focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
      </button>

      <AddAssetModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {
          // Refresh assets here
          console.log('Asset added, refreshing...');
        }}
      />
    </main>
  );
}
