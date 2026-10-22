'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const { language } = useLanguage();

  if (!isOpen) return null;

  const shortcuts = [
    { key: '1', labelTr: 'Sinyaller & Tarama', labelEn: 'Signals & Scanner', icon: '🎯' },
    { key: '2', labelTr: 'KAP & Katalizörler', labelEn: 'KAP & Catalysts', icon: '⚡' },
    { key: '3', labelTr: 'Kurumsal Quant Hub', labelEn: 'Institutional Quant Hub', icon: '🏛️' },
    { key: '4', labelTr: 'Portföy & Pozisyonlar', labelEn: 'Portfolio & Positions', icon: '💼' },
    { key: '5', labelTr: 'Temettü Nakit Akışı', labelEn: 'Dividend Cashflow Tracker', icon: '💰' },
    { key: '6', labelTr: 'Temettü Projeksiyonu & Kıyaslama', labelEn: 'Dividend Forecast & Lab', icon: '🔮' },
    { key: '7', labelTr: 'Strateji Karnesi', labelEn: 'Strategy Scorecard', icon: '📈' },
    { key: '8', labelTr: 'Açılış Yönü (ORB)', labelEn: 'Opening Direction (ORB)', icon: '🔔' },
    { key: 'R', labelTr: 'Canlı Veri Senkronizasyonu', labelEn: 'Sync & Refresh Live Data', icon: '🔄' },
    { key: 'Esc', labelTr: 'Açık Modalı Kapat', labelEn: 'Close Active Modal', icon: '✕' },
    { key: '?', labelTr: 'Bu Kısayol Penceresini Aç/Kapat', labelEn: 'Toggle Shortcuts Help', icon: '⌨️' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />
      <div className="relative w-full max-w-lg bg-white dark:bg-[#0a0f1d] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 z-10 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold border border-blue-500/20">
              ⌨️
            </div>
            <div>
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                {language === 'tr' ? 'Masaüstü Klavye Kısayolları' : 'Desktop Keyboard Shortcuts'}
              </h3>
              <p className="text-xs text-gray-400">
                {language === 'tr' ? 'Profesyonel terminal navigasyonu için tuş kombinasyonları' : 'Pro terminal keys for rapid navigation'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">{s.icon}</span>
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  {language === 'tr' ? s.labelTr : s.labelEn}
                </span>
              </div>
              <kbd className="px-2.5 py-1 text-xs font-mono font-black rounded-lg bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-slate-300 dark:border-slate-700 shadow-xs">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-[11px] text-gray-400">
            {language === 'tr' ? 'Yazı yazarken (input alanlarında) kısayollar otomatik olarak devre dışı kalır.' : 'Shortcuts are automatically paused while typing in text inputs.'}
          </p>
        </div>
      </div>
    </div>
  );
}
