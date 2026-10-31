'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  createChart, 
  CandlestickSeries, 
  HistogramSeries, 
  LineSeries,
  LineStyle,
  ColorType,
  IChartApi
} from 'lightweight-charts';

export interface ChartPriceBar {
  time: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface InteractiveCanvasChartProps {
  data: ChartPriceBar[];
  symbol: string;
  currency?: string;
  entryPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
  height?: number;
}

function calculateEMA(data: { time: string; close: number }[], period: number) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: { time: string; value: number }[] = [];

  // Initial SMA as seed for EMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i].close;
  }
  let prevEma = sum / period;
  result.push({ time: data[period - 1].time, value: Number(prevEma.toFixed(2)) });

  for (let i = period; i < data.length; i++) {
    const currentEma = data[i].close * k + prevEma * (1 - k);
    result.push({ time: data[i].time, value: Number(currentEma.toFixed(2)) });
    prevEma = currentEma;
  }
  return result;
}

export default function InteractiveCanvasChart({
  data,
  symbol,
  currency = 'TRY',
  entryPrice,
  stopLoss,
  targetPrice,
  height = 480
}: InteractiveCanvasChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  const [showBollinger, setShowBollinger] = useState(false);
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(true);
  const [showEma200, setShowEma200] = useState(false);

  const [crosshairInfo, setCrosshairInfo] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    change: number;
    volume?: number;
  } | null>(null);

  const sortedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data]
      .filter(d => d.open > 0 && d.close > 0 && d.time)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [data]);

  useEffect(() => {
    if (!chartContainerRef.current || sortedData.length === 0) return;

    // Clean up any existing chart instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const initialWidth = container.clientWidth > 0
      ? container.clientWidth
      : (container.parentElement?.clientWidth || (typeof window !== 'undefined' ? Math.max(280, window.innerWidth - 32) : 340));

    const chart = createChart(container, {
      width: initialWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#9ca3af',
        fontSize: 12,
        fontFamily: 'Inter, system-ui, sans-serif'
      },
      grid: {
        vertLines: { color: 'rgba(55, 65, 81, 0.45)' },
        horzLines: { color: 'rgba(55, 65, 81, 0.45)' }
      },
      crosshair: {
        vertLine: {
          color: '#60a5fa',
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: '#2563eb'
        },
        horzLine: {
          color: '#60a5fa',
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: '#2563eb'
        }
      },
      rightPriceScale: {
        borderColor: '#374151',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25
        }
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false
      }
    });

    chartInstanceRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444'
    });

    candleSeries.setData(sortedData.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close
    })));

    // 2. Volume Histogram Series (Bottom 25%)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#3b82f6',
      priceFormat: {
        type: 'volume'
      },
      priceScaleId: 'volume'
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0
      }
    });

    volumeSeries.setData(sortedData.map(d => ({
      time: d.time,
      value: d.volume || 0,
      color: d.close >= d.open ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
    })));

    // 3. Strategy Trigger Overlays (Entry, Stop Loss, Target)
    const currSym = currency === 'USD' ? '$' : '₺';

    if (entryPrice && entryPrice > 0) {
      candleSeries.createPriceLine({
        price: entryPrice,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `ENTRY: ${currSym}${entryPrice.toFixed(2)}`
      });
    }

    if (stopLoss && stopLoss > 0) {
      candleSeries.createPriceLine({
        price: stopLoss,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `STOP: ${currSym}${stopLoss.toFixed(2)}`
      });
    }

    if (targetPrice && targetPrice > 0) {
      candleSeries.createPriceLine({
        price: targetPrice,
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `TARGET: ${currSym}${targetPrice.toFixed(2)}`
      });
    }

    // 4. EMA 20 Overlay (Amber)
    if (showEma20 && sortedData.length >= 20) {
      const ema20Data = calculateEMA(sortedData, 20);
      if (ema20Data.length > 0) {
        const ema20Series = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false
        });
        ema20Series.setData(ema20Data);
      }
    }

    // 5. EMA 50 Overlay (Cyan)
    if (showEma50 && sortedData.length >= 50) {
      const ema50Data = calculateEMA(sortedData, 50);
      if (ema50Data.length > 0) {
        const ema50Series = chart.addSeries(LineSeries, {
          color: '#06b6d4',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false
        });
        ema50Series.setData(ema50Data);
      }
    }

    // 6. EMA 200 Overlay (Pink/Magenta)
    if (showEma200 && sortedData.length >= 200) {
      const ema200Data = calculateEMA(sortedData, 200);
      if (ema200Data.length > 0) {
        const ema200Series = chart.addSeries(LineSeries, {
          color: '#ec4899',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false
        });
        ema200Series.setData(ema200Data);
      }
    }

    // 7. Bollinger Bands (20, 2.0σ) Overlay
    if (showBollinger && sortedData.length >= 5) {
      const period = Math.min(20, sortedData.length);
      const upperData: { time: string; value: number }[] = [];
      const middleData: { time: string; value: number }[] = [];
      const lowerData: { time: string; value: number }[] = [];

      for (let i = period - 1; i < sortedData.length; i++) {
        const slice = sortedData.slice(i - period + 1, i + 1);
        const mean = slice.reduce((sum, bar) => sum + bar.close, 0) / period;
        const variance = slice.reduce((sum, bar) => sum + Math.pow(bar.close - mean, 2), 0) / period;
        const std = Math.sqrt(variance);

        const t = sortedData[i].time;
        middleData.push({ time: t, value: Number(mean.toFixed(2)) });
        upperData.push({ time: t, value: Number((mean + 2 * std).toFixed(2)) });
        lowerData.push({ time: t, value: Number((mean - 2 * std).toFixed(2)) });
      }

      if (middleData.length > 0) {
        const upperSeries = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.75)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false
        });
        upperSeries.setData(upperData);

        const middleSeries = chart.addSeries(LineSeries, {
          color: 'rgba(59, 130, 246, 0.65)',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false
        });
        middleSeries.setData(middleData);

        const lowerSeries = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.75)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false
        });
        lowerSeries.setData(lowerData);
      }
    }

    // Set latest bar as default crosshair info
    const latest = sortedData[sortedData.length - 1];
    if (latest) {
      setCrosshairInfo({
        time: latest.time,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        change: latest.open > 0 ? ((latest.close - latest.open) / latest.open) * 100 : 0,
        volume: latest.volume
      });
    }

    // Subscribe to crosshair movement
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.get(candleSeries)) {
        if (latest) {
          setCrosshairInfo({
            time: latest.time,
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
            change: latest.open > 0 ? ((latest.close - latest.open) / latest.open) * 100 : 0,
            volume: latest.volume
          });
        }
        return;
      }

      const bar: any = param.seriesData.get(candleSeries);
      const volBar: any = param.seriesData.get(volumeSeries);
      if (bar) {
        setCrosshairInfo({
          time: String(param.time),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          change: bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0,
          volume: volBar?.value || 0
        });
      }
    });

    chart.timeScale().fitContent();

    // Resize handler (Window + ResizeObserver for modal animations)
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        if (newWidth > 0) {
          chartInstanceRef.current.applyOptions({
            width: newWidth
          });
        }
      }
    };
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && chartContainerRef.current) {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [sortedData, entryPrice, stopLoss, targetPrice, currency, height, showBollinger, showEma20, showEma50, showEma200]);

  const setZoom = (months: number) => {
    if (!chartInstanceRef.current || sortedData.length === 0) return;
    if (months === 0) {
      chartInstanceRef.current.timeScale().fitContent();
      return;
    }
    const lastDate = new Date(sortedData[sortedData.length - 1].time);
    const startDate = new Date(lastDate);
    startDate.setMonth(startDate.getMonth() - months);
    const startStr = startDate.toISOString().split('T')[0];

    chartInstanceRef.current.timeScale().setVisibleRange({
      from: startStr as any,
      to: sortedData[sortedData.length - 1].time as any
    });
  };

  const currSym = currency === 'USD' ? '$' : '₺';

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-gray-800 bg-gray-950 shadow-2xl flex flex-col">
      {/* Real-Time Crosshair HUD Header */}
      <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black text-white font-mono text-sm">{symbol}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
            Interactive Candlesticks
          </span>

          {/* Indicator Toggles */}
          <button
            type="button"
            onClick={() => setShowEma20(!showEma20)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition-all ${
              showEma20 
                ? 'bg-amber-950/80 text-amber-300 border-amber-600' 
                : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
            }`}
            title="Exponential Moving Average (20 period)"
          >
            EMA 20
          </button>
          <button
            type="button"
            onClick={() => setShowEma50(!showEma50)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition-all ${
              showEma50 
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-600' 
                : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
            }`}
            title="Exponential Moving Average (50 period)"
          >
            EMA 50
          </button>
          <button
            type="button"
            onClick={() => setShowEma200(!showEma200)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition-all ${
              showEma200 
                ? 'bg-pink-950/80 text-pink-300 border-pink-600' 
                : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
            }`}
            title="Exponential Moving Average (200 period)"
          >
            EMA 200
          </button>
          <button
            type="button"
            onClick={() => setShowBollinger(!showBollinger)}
            className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition-all ${
              showBollinger 
                ? 'bg-purple-950/90 text-purple-300 border-purple-600' 
                : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
            }`}
            title="Bollinger Bands (20 period, 2.0σ)"
          >
            BB (20, 2σ)
          </button>

          {/* Timeframe Zoom Controls */}
          <div className="flex items-center space-x-1 pl-2 border-l border-gray-800">
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              1M
            </button>
            <button
              type="button"
              onClick={() => setZoom(3)}
              className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              3M
            </button>
            <button
              type="button"
              onClick={() => setZoom(6)}
              className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              6M
            </button>
            <button
              type="button"
              onClick={() => setZoom(12)}
              className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              1Y
            </button>
            <button
              type="button"
              onClick={() => setZoom(0)}
              className="px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              ALL
            </button>
          </div>
        </div>

        {crosshairInfo && (
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span className="text-gray-400">{crosshairInfo.time}</span>
            <div>
              <span className="text-gray-500">O: </span>
              <span className="text-gray-200">{currSym}{crosshairInfo.open.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-500">H: </span>
              <span className="text-emerald-400">{currSym}{crosshairInfo.high.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-500">L: </span>
              <span className="text-rose-400">{currSym}{crosshairInfo.low.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-500">C: </span>
              <span className="text-white font-bold">{currSym}{crosshairInfo.close.toFixed(2)}</span>
            </div>
            <div className={`font-bold ${crosshairInfo.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {crosshairInfo.change >= 0 ? '+' : ''}{crosshairInfo.change.toFixed(2)}%
            </div>
            {crosshairInfo.volume !== undefined && crosshairInfo.volume > 0 && (
              <div>
                <span className="text-gray-500">Vol: </span>
                <span className="text-blue-400">
                  {crosshairInfo.volume > 1000000 
                    ? `${(crosshairInfo.volume / 1000000).toFixed(2)}M` 
                    : crosshairInfo.volume > 1000 
                    ? `${(crosshairInfo.volume / 1000).toFixed(0)}k` 
                    : crosshairInfo.volume.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Canvas Chart Mount Area */}
      <div 
        ref={chartContainerRef} 
        className="w-full relative cursor-crosshair"
        style={{ height }}
      />
    </div>
  );
}
