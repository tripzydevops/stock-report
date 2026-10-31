'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import PositionCalculator from './PositionCalculator';

interface PositionCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTrade: {
    entryPrice: number;
    stopLoss: number;
    targetPrice?: number;
    currency: 'USD' | 'TRY';
    symbol?: string;
  } | null;
  onSelectTicker?: (symbol: string) => void;
}

export default function PositionCalculatorModal({
  isOpen,
  onClose,
  selectedTrade,
  onSelectTicker
}: PositionCalculatorModalProps) {
  const { language } = useLanguage();

  if (!isOpen || !selectedTrade) return null;

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 touch-manipulation select-none overflow-y-auto"
    >
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl max-w-lg w-full border border-gray-200 dark:border-gray-750 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/80 dark:bg-gray-850 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-lg font-black shrink-0 shadow-sm shadow-blue-500/30">
              🎯
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white tracking-tight truncate">
                  {selectedTrade.symbol ? `${selectedTrade.symbol} · ` : ''}
                  {language === 'tr' ? 'Pozisyon Boyutlandırma' : 'Position Sizing'}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 shrink-0">
                  {selectedTrade.currency}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {language === 'tr' 
                  ? 'Sermaye riskine göre tavsiye edilen lot miktarı ve kâr realizasyon planı' 
                  : 'Recommended position size & scale-out plan based on capital risk'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[38px] min-h-[38px] p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center font-bold text-lg active:scale-90 touch-manipulation shrink-0"
            title="Kapat (Esc)"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Calculator Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 no-scrollbar">
          <PositionCalculator selectedTrade={selectedTrade} isModal={true} />
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-850 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 shrink-0">
          {selectedTrade.symbol && onSelectTicker ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectTicker(selectedTrade.symbol!);
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <span>📈</span>
              <span>{language === 'tr' ? `${selectedTrade.symbol} Grafiğini Aç` : `View ${selectedTrade.symbol} Chart`}</span>
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20 transition-all cursor-pointer active:scale-95 ml-auto"
          >
            {language === 'tr' ? 'Tamam / Kapat' : 'Done / Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
