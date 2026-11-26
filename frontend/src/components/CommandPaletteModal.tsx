'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLanguage } from '../context/LanguageContext';

export interface CommandPaletteAsset {
  symbol: string;
  name?: string;
  market?: string;
  price?: number;
  currency?: string;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  assets: CommandPaletteAsset[];
  onNavigateTab: (tab: string) => void;
  onSelectTicker: (symbol: string) => void;
  onOpenCoPilotDrawer: () => void;
  onTriggerSync: () => void;
  onOpenReports: () => void;
}

interface CommandEntry {
  id: string;
  category: 'NAV' | 'ACTION' | 'ASSET';
  icon: string;
  title: string;
  subtitle: string;
  badge?: string;
  onSelect: () => void;
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  assets,
  onNavigateTab,
  onSelectTicker,
  onOpenCoPilotDrawer,
  onTriggerSync,
  onOpenReports,
}: CommandPaletteModalProps) {
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setQuery('');
    setActiveIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  const baseCommands: CommandEntry[] = useMemo(() => [
    {
      id: 'cmd-copilot-drawer',
      category: 'ACTION',
      icon: '🤖',
      title: language === 'tr' ? 'AI Co-Pilot Çekmecesini Aç' : 'Open AI Co-Pilot Drawer',
      subtitle: language === 'tr' ? 'Mevcut ekranı terk etmeden yapay zeka asistanına sor' : 'Ask the autonomous AI assistant in a slide-over drawer',
      badge: 'AI',
      onSelect: () => {
        onClose();
        onOpenCoPilotDrawer();
      },
    },
    {
      id: 'cmd-sync',
      category: 'ACTION',
      icon: '🔄',
      title: language === 'tr' ? 'Canlı Piyasa Verilerini Eşitle' : 'Sync Live Market Data',
      subtitle: language === 'tr' ? 'BIST, ABD ve temettü verilerini güncelle' : 'Refresh live BIST, US, and dividend feeds',
      badge: 'R',
      onSelect: () => {
        onClose();
        onTriggerSync();
      },
    },
    {
      id: 'cmd-reports',
      category: 'ACTION',
      icon: '📊',
      title: language === 'tr' ? 'Excel Rapor Arşivini Aç' : 'Open Excel Report Archive',
      subtitle: language === 'tr' ? 'Günlük MarketPulse Excel snapshotlarını indir' : 'Download daily MarketPulse Excel snapshots',
      onSelect: () => {
        onClose();
        onOpenReports();
      },
    },
    {
      id: 'nav-signals',
      category: 'NAV',
      icon: '🎯',
      title: language === 'tr' ? 'Alım Sinyalleri & Tarayıcı' : 'Trade Signals & Screener',
      subtitle: language === 'tr' ? 'Trade Merkezi (Hub 1)' : 'Trade Hub (Hub 1)',
      badge: '1',
      onSelect: () => { onClose(); onNavigateTab('signals'); },
    },
    {
      id: 'nav-portfolio',
      category: 'NAV',
      icon: '💼',
      title: language === 'tr' ? 'Portföyüm, Kasa & DCA' : 'Portfolio, Cash Ledger & DCA',
      subtitle: language === 'tr' ? 'Portföy Merkezi (Hub 2)' : 'Portfolio Hub (Hub 2)',
      badge: '4',
      onSelect: () => { onClose(); onNavigateTab('portfolio'); },
    },
    {
      id: 'nav-dividend',
      category: 'NAV',
      icon: '💧',
      title: language === 'tr' ? 'Temettü Takvimi & DRIP Lab' : 'Dividends Calendar & DRIP Lab',
      subtitle: language === 'tr' ? 'Temettü Merkezi (Hub 3)' : 'Dividends Hub (Hub 3)',
      badge: '5',
      onSelect: () => { onClose(); onNavigateTab('dividend'); },
    },
    {
      id: 'nav-watchlist',
      category: 'NAV',
      icon: '⭐',
      title: language === 'tr' ? 'Takip Listesi & Radar' : 'Watchlist & Radar',
      subtitle: language === 'tr' ? 'İzlenen varlıklar ve fiyat alarmları' : 'Tracked tickers and price alerts',
      onSelect: () => { onClose(); onNavigateTab('watchlist'); },
    },
    {
      id: 'nav-quant',
      category: 'NAV',
      icon: '🏛️',
      title: language === 'tr' ? 'Kantitatif Çiftler & Faktörler' : 'Quant Pairs & Factor Rankings',
      subtitle: language === 'tr' ? 'Kurumsal Merkez (Hub 4)' : 'Quant Hub (Hub 4)',
      badge: '3',
      onSelect: () => { onClose(); onNavigateTab('quant'); },
    },
    {
      id: 'nav-catalysts',
      category: 'NAV',
      icon: '⚡',
      title: language === 'tr' ? 'Canlı KAP & Haber Akışı' : 'Live KAP & Catalyst Feed',
      subtitle: language === 'tr' ? 'Şirket bildirimleri ve AI etki analizi' : 'Corporate disclosures and AI verdict',
      badge: '2',
      onSelect: () => { onClose(); onNavigateTab('catalysts'); },
    },
    {
      id: 'nav-scorecard',
      category: 'NAV',
      icon: '🏆',
      title: language === 'tr' ? 'Strateji Karnesi & Backtest' : 'Strategy Scorecard & Backtest',
      subtitle: language === 'tr' ? 'Geçmiş performans ve kazanma oranları' : 'Historical win rates & profit factor',
      badge: '7',
      onSelect: () => { onClose(); onNavigateTab('scorecard'); },
    },
    {
      id: 'nav-orb',
      category: 'NAV',
      icon: '🚀',
      title: language === 'tr' ? '15dk Açılış Kırılımları (ORB)' : 'Opening Range Breakouts (ORB)',
      subtitle: language === 'tr' ? 'Seans açılış yönü ve hacim anomalileri' : 'Session opening direction & volume spikes',
      badge: '8',
      onSelect: () => { onClose(); onNavigateTab('orb'); },
    },
  ], [language, onClose, onNavigateTab, onOpenCoPilotDrawer, onTriggerSync, onOpenReports]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchedCommands = q
      ? baseCommands.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.subtitle.toLowerCase().includes(q)
        )
      : baseCommands;

    const matchedAssets: CommandEntry[] = [];
    if (q.length >= 1) {
      const seen = new Set<string>();
      for (const a of assets) {
        const clean = (a.symbol || '').replace('.IS', '').trim().toUpperCase();
        if (!clean || seen.has(clean)) continue;
        const nameMatch = (a.name || '').toLowerCase().includes(q);
        const symMatch = clean.toLowerCase().includes(q);
        if (symMatch || nameMatch) {
          seen.add(clean);
          const priceStr =
            typeof a.price === 'number' && a.price > 0
              ? `${a.currency === 'USD' ? '$' : '₺'}${a.price.toFixed(2)}`
              : '';
          matchedAssets.push({
            id: `asset-${clean}`,
            category: 'ASSET',
            icon: a.market === 'US' || a.currency === 'USD' ? '🇺🇸' : '🇹🇷',
            title: clean,
            subtitle: `${a.name || clean}${priceStr ? ` · ${priceStr}` : ''}`,
            badge: a.market || 'BIST',
            onSelect: () => {
              onClose();
              onSelectTicker(a.symbol);
            },
          });
        }
        if (matchedAssets.length >= 8) break;
      }
    }

    return [...matchedAssets, ...matchedCommands];
  }, [query, baseCommands, assets, onClose, onSelectTicker]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      results[activeIndex].onSelect();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] flex items-start justify-center pt-[10vh] px-3 sm:px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={language === 'tr' ? 'Hızlı Komut ve Arama' : 'Command Palette'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            const focusables = e.currentTarget.querySelectorAll<HTMLElement>(
              'input, button, [href], [tabindex]:not([tabindex="-1"])'
            );
            if (focusables.length > 0) {
              const first = focusables[0];
              const last = focusables[focusables.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }
          handleKeyDown(e);
        }}
        className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <span className="text-base text-gray-400">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              language === 'tr'
                ? 'Hisse ara (THYAO, AAPL) veya komut yaz (Portföy, Temettü, AI)...'
                : 'Search ticker (THYAO, AAPL) or jump to any hub...'
            }
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/80">
          {results.length === 0 ? (
            <div className="py-10 text-center text-xs text-gray-500">
              {language === 'tr' ? 'Sonuç bulunamadı.' : 'No matching commands or tickers.'}
            </div>
          ) : (
            results.map((item, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={item.onSelect}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/60'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-950/60 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-[10px] text-gray-400">
          <span>↑↓ {language === 'tr' ? 'Gezin' : 'Navigate'} · ↵ {language === 'tr' ? 'Seç' : 'Open'}</span>
          <span>⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
