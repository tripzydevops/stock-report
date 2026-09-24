import React from 'react';

export interface RegimeStatus {
  status: 'Bullish' | 'Neutral' | 'Bearish';
  close: number;
  trend: 'up' | 'down' | 'flat';
}

interface MarketRegimeBannerProps {
  usRegime?: RegimeStatus;
  bistRegime?: RegimeStatus;
}

const getBadgeColor = (status: string) => {
  switch (status) {
    case 'Bullish': return 'bg-green-500 text-white';
    case 'Bearish': return 'bg-red-500 text-white';
    default: return 'bg-yellow-500 text-white';
  }
};

const getTrendArrow = (trend: string) => {
  switch (trend) {
    case 'up': return '↑';
    case 'down': return '↓';
    default: return '→';
  }
};

export default function MarketRegimeBanner({ usRegime, bistRegime }: MarketRegimeBannerProps) {
  return (
    <div className="w-full bg-gray-900 text-white py-3 px-4 flex flex-col sm:flex-row justify-between items-center text-sm">
      <div className="flex items-center space-x-4 mb-2 sm:mb-0">
        <span className="font-semibold text-gray-300">US Market (SPY)</span>
        {usRegime ? (
          <>
            <span className={`px-2 py-1 rounded text-xs font-bold ${getBadgeColor(usRegime.status)}`}>
              {usRegime.status}
            </span>
            <span>{usRegime.close.toFixed(2)} {getTrendArrow(usRegime.trend)}</span>
          </>
        ) : (
          <span className="text-gray-500 animate-pulse">Loading...</span>
        )}
      </div>
      
      <div className="flex items-center space-x-4">
        <span className="font-semibold text-gray-300">Turkish Market (BIST 100)</span>
        {bistRegime ? (
          <>
            <span className={`px-2 py-1 rounded text-xs font-bold ${getBadgeColor(bistRegime.status)}`}>
              {bistRegime.status}
            </span>
            <span>{bistRegime.close.toFixed(2)} {getTrendArrow(bistRegime.trend)}</span>
          </>
        ) : (
          <span className="text-gray-500 animate-pulse">Loading...</span>
        )}
      </div>
    </div>
  );
}
