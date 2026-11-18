'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  AreaSeries,
  HistogramSeries,
  ColorType,
  IChartApi,
  LineStyle,
} from 'lightweight-charts';
import { ChartPriceBar } from './InteractiveCanvasChart';

interface KoyfinPriceOverviewChartProps {
  data: ChartPriceBar[];
  symbol: string;
  currency?: string;
  timeframe?: '1M' | '3M' | '6M' | '1Y';
  height?: number;
  isLoading?: boolean;
}

export default function KoyfinPriceOverviewChart({
  data,
  symbol,
  currency = 'TRY',
  timeframe = '1Y',
  height = 280,
  isLoading = false,
}: KoyfinPriceOverviewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // 1. Filter bars based on timeframe and sort chronologically
  const activeBars = useMemo(() => {
    if (!data || data.length === 0) return [];
    const valid = data.filter(d => d && d.time && d.close > 0);
    const sorted = [...valid].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    const sliceDays =
      timeframe === '1M' ? 22 : timeframe === '3M' ? 65 : timeframe === '6M' ? 130 : 252;

    return sorted.slice(-sliceDays);
  }, [data, timeframe]);

  // 2. Initialize and re-render chart
  useEffect(() => {
    if (!containerRef.current || activeBars.length === 0) return;

    // Destroy existing chart on re-render/timeframe change
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const isDark = document.documentElement.classList.contains('dark');
    const width = container.clientWidth > 0 ? container.clientWidth : 360;

    const chart = createChart(container, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#94a3b8' : '#64748b',
        fontSize: 11,
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      },
      grid: {
        vertLines: {
          color: isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(241, 245, 249, 0.9)',
          style: LineStyle.Dotted,
        },
        horzLines: {
          color: isDark ? 'rgba(51, 65, 85, 0.35)' : 'rgba(241, 245, 249, 0.9)',
          style: LineStyle.Dotted,
        },
      },
      crosshair: {
        vertLine: {
          color: '#3b82f6',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2563eb',
        },
        horzLine: {
          color: '#3b82f6',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2563eb',
        },
      },
      rightPriceScale: {
        visible: true,
        borderColor: isDark ? '#334155' : '#e2e8f0',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        visible: true,
        borderColor: isDark ? '#334155' : '#e2e8f0',
        timeVisible: false,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScroll: false,
      handleScale: false,
    });

    chartRef.current = chart;

    const first = activeBars[0];
    const last = activeBars[activeBars.length - 1];
    const isUp = last.close >= first.close;
    const strokeColor = isUp ? '#10b981' : '#f43f5e';
    const topFill = isUp ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
    const bottomFill = isUp ? 'rgba(16, 185, 129, 0.01)' : 'rgba(244, 63, 94, 0.01)';

    // Add Area Series (Koyfin Overview Style)
    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: topFill,
      bottomColor: bottomFill,
      lineColor: strokeColor,
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: strokeColor,
      crosshairMarkerBackgroundColor: '#ffffff',
    });

    areaSeries.setData(
      activeBars.map(b => ({
        time: b.time,
        value: b.close,
      }))
    );

    // Add Volume Histogram at bottom (if volume data exists)
    const hasVolume = activeBars.some(b => (b.volume || 0) > 0);
    if (hasVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(100, 116, 139, 0.2)',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.82,
          bottom: 0,
        },
      });

      volumeSeries.setData(
        activeBars.map(b => ({
          time: b.time,
          value: b.volume || 0,
          color:
            b.close >= b.open
              ? isDark
                ? 'rgba(16, 185, 129, 0.35)'
                : 'rgba(16, 185, 129, 0.3)'
              : isDark
                ? 'rgba(244, 63, 94, 0.35)'
                : 'rgba(244, 63, 94, 0.3)',
        }))
      );
    }

    chart.timeScale().fitContent();

    // Auto-fit on container resize (handles mobile/desktop perfectly)
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0 || !chartRef.current) return;
      const newWidth = entries[0].contentRect.width;
      if (newWidth > 0) {
        chartRef.current.applyOptions({ width: newWidth });
        chartRef.current.timeScale().fitContent();
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [activeBars, height]);

  if (isLoading) {
    return (
      <div
        className="w-full flex items-center justify-center text-xs text-slate-400 font-medium gap-2"
        style={{ height }}
      >
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span>Fiyat geçmişi yükleniyor...</span>
      </div>
    );
  }

  if (activeBars.length < 2) {
    return (
      <div
        className="w-full flex items-center justify-center text-xs text-slate-400 font-medium"
        style={{ height }}
      >
        Yetersiz fiyat geçmişi verisi.
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <div ref={containerRef} className="w-full overflow-hidden" style={{ height }} />
    </div>
  );
}
