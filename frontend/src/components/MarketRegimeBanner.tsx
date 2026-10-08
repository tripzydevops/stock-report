'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

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
  const { t } = useLanguage();

  const getStatusLabel = (status: 'Bullish' | 'Neutral' | 'Bearish') => {
    switch (status) {
      case 'Bullish': return t.regime.bullish;
      case 'Bearish': return t.regime.bearish;
      default: return t.regime.neutral;
    }
  };

  return (
    <div className="w-full bg-gray-900 text-white py-3 px-4 flex flex-col sm:flex-row justify-between items-center text-sm">
      <div className="flex items-center space-x-4 mb-2 sm:mb-0">
        <span className="font-semibold text-gray-300">{t.regime.usMarket}</span>
        {usRegime ? (
          <>
            <span className={`px-2 py-1 rounded text-xs font-bold ${getBadgeColor(usRegime.status)}`}>
              {getStatusLabel(usRegime.status)}
            </span>
            <span>{usRegime.close.toFixed(2)} {getTrendArrow(usRegime.trend)}</span>
          </>
        ) : (
          <span className="text-gray-500 animate-pulse">{t.regime.loading}</span>
        )}
      </div>
      
      <div className="flex items-center space-x-4">
        <span className="font-semibold text-gray-300">{t.regime.bistMarket}</span>
        {bistRegime ? (
          <>
            <span className={`px-2 py-1 rounded text-xs font-bold ${getBadgeColor(bistRegime.status)}`}>
              {getStatusLabel(bistRegime.status)}
            </span>
            <span>{bistRegime.close.toFixed(2)} {getTrendArrow(bistRegime.trend)}</span>
          </>
        ) : (
          <span className="text-gray-500 animate-pulse">{t.regime.loading}</span>
        )}
      </div>
    </div>
  );
}
