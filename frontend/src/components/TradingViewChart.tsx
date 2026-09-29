'use client';

import React, { useEffect, useRef, useState } from 'react';

interface TradingViewChartProps {
  symbol: string;
  market?: string;
  height?: number | string;
  theme?: 'dark' | 'light';
}

export function getTradingViewSymbol(symbol: string, market?: string): string {
  const clean = symbol.replace('.IS', '').trim().toUpperCase();
  
  // BIST assets
  if (market === 'BIST' || symbol.endsWith('.IS')) {
    if (clean === 'XU100') return 'BIST:XU100';
    return `BIST:${clean}`;
  }
  
  // US ETFs & Equities
  const amexTickers = ['SPY', 'IWM', 'GLD', 'XLF', 'XLE', 'ARKK', 'DIA', 'VOO', 'VTI'];
  if (amexTickers.includes(clean)) {
    return `AMEX:${clean}`;
  }
  
  const nyseTickers = ['BRK.B', 'JNJ', 'JPM', 'V', 'PG', 'UNH', 'HD', 'MA', 'BAC', 'DIS'];
  if (nyseTickers.includes(clean)) {
    return `NYSE:${clean}`;
  }
  
  // Default US mega-caps (AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, AMD, QQQ, etc.)
  return `NASDAQ:${clean}`;
}

export default function TradingViewChart({
  symbol,
  market,
  height = 480,
  theme = 'dark'
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const tvSymbol = getTradingViewSymbol(symbol, market);
  const containerId = `tv_chart_${symbol.replace(/[^a-zA-Z0-9]/g, '_')}_${Math.random().toString(36).substring(2, 7)}`;

  useEffect(() => {
    let scriptElement: HTMLScriptElement | null = null;
    const currentContainer = containerRef.current;
    if (!currentContainer) return;

    // Clear previous children
    currentContainer.innerHTML = `<div id="${containerId}" style="height: 100%; width: 100%;"></div>`;

    const initWidget = () => {
      if (typeof (window as any).TradingView !== 'undefined' && document.getElementById(containerId)) {
        try {
          new (window as any).TradingView.widget({
            autosize: true,
            symbol: tvSymbol,
            interval: 'D',
            timezone: 'Europe/Istanbul',
            theme: theme,
            style: '1', // Candlestick style
            locale: 'en',
            toolbar_bg: theme === 'dark' ? '#111827' : '#f3f4f6',
            enable_publishing: false,
            allow_symbol_change: true,
            hide_side_toolbar: false,
            container_id: containerId,
            save_image: true,
            studies: [
              'MASimple@tv-basicstudies',
              'RSI@tv-basicstudies'
            ],
            overrides: {
              'mainSeriesProperties.candleStyle.upColor': '#10b981',
              'mainSeriesProperties.candleStyle.downColor': '#ef4444',
              'mainSeriesProperties.candleStyle.drawWick': true,
              'mainSeriesProperties.candleStyle.drawBorder': true,
              'mainSeriesProperties.candleStyle.borderColor': '#374151',
              'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
              'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
              'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
              'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444'
            }
          });
          setIsLoaded(true);
        } catch (err) {
          console.error('Error instantiating TradingView widget:', err);
        }
      }
    };

    // If script already exists on window
    if ((window as any).TradingView) {
      initWidget();
    } else {
      // Check if script tag is already in head
      const existingScript = document.getElementById('tradingview-widget-script');
      if (existingScript) {
        existingScript.addEventListener('load', initWidget);
      } else {
        scriptElement = document.createElement('script');
        scriptElement.id = 'tradingview-widget-script';
        scriptElement.src = 'https://s3.tradingview.com/tv.js';
        scriptElement.type = 'text/javascript';
        scriptElement.async = true;
        scriptElement.onload = initWidget;
        document.head.appendChild(scriptElement);
      }
    }

    return () => {
      if (currentContainer) {
        currentContainer.innerHTML = '';
      }
    };
  }, [tvSymbol, theme, containerId]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-900 shadow-inner" style={{ height }}>
      {!isLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-gray-400 z-10">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs font-mono">Loading TradingView live feed for {tvSymbol}...</p>
        </div>
      )}
      <div 
        ref={containerRef} 
        className="w-full h-full"
      />
    </div>
  );
}
