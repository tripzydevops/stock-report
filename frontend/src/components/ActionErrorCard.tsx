'use client';

import React from 'react';
import { PortfolioMutation } from '../types/portfolioMutation';

export interface ActionErrorCardProps {
  action: PortfolioMutation;
  error?: string | null;
  onRetry: () => void;
  onDiscard: () => void;
  language?: 'tr' | 'en';
}

export function ActionErrorCard({
  action,
  error,
  onRetry,
  onDiscard,
  language = 'tr',
}: ActionErrorCardProps) {
  const displayError = error || action.lastError || (language === 'tr' ? 'Bilinmeyen sunucu hatası' : 'Unknown server error');
  const sym = action.body?.symbol;
  const shares = action.body?.shares ?? action.body?.quantity ?? 0;
  const price = action.body?.price ?? action.body?.entryPrice ?? 0;
  const amount = action.body?.amount ?? 0;
  const currency = action.body?.currency || 'TRY';

  let descriptionLabel = '';
  if (action.type === 'DEPOSIT' || action.type === 'WITHDRAW') {
    descriptionLabel = `${amount.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')} ${currency}`;
  } else if (sym && shares > 0) {
    descriptionLabel = `${sym} • ${shares} ${language === 'tr' ? 'lot' : 'shares'} @ ${price} ${currency}`;
  } else if (sym) {
    descriptionLabel = sym;
  }

  return (
    <div
      data-testid={`action-error-card-${action.clientOrderId}`}
      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white/80 dark:bg-rose-950/40 border border-rose-200/90 dark:border-rose-900/60 shadow-xs text-xs"
    >
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
            action.type === 'BUY'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : action.type === 'SELL'
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              : action.type === 'DELETE_POSITION'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
          }`}
        >
          {action.type === 'DELETE_POSITION' ? 'DELETE' : action.type}
        </span>

        {action.rollbackApplied ? (
          <span
            data-testid="rollback-badge-rolled-back"
            className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
          >
            {language === 'tr' ? 'Geri alındı — tekrar gönderin' : 'Rolled back — retry to resend'}
          </span>
        ) : (
          <span
            data-testid="rollback-badge-provisional"
            className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300"
          >
            {language === 'tr' ? 'Geçici — işlem gerekli' : 'Provisional — action required'}
          </span>
        )}

        {descriptionLabel && (
          <span className="font-extrabold text-neutral-900 dark:text-white">
            {descriptionLabel}
          </span>
        )}

        <span
          className="text-rose-700 dark:text-rose-300 text-[11px] font-medium truncate max-w-[240px] sm:max-w-md"
          title={displayError}
        >
          • {displayError}
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <button
          type="button"
          data-testid="action-retry-button"
          onClick={onRetry}
          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[11px] font-black shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
        >
          <span>🔄</span>
          <span>{language === 'tr' ? 'Tekrar Dene' : 'Retry'}</span>
        </button>

        <button
          type="button"
          data-testid="action-discard-button"
          onClick={onDiscard}
          className="px-3 py-1.5 rounded-lg bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 active:scale-95 text-neutral-800 dark:text-neutral-200 text-[11px] font-bold transition-all cursor-pointer"
        >
          {language === 'tr' ? 'Vazgeç & Sil' : 'Discard'}
        </button>
      </div>
    </div>
  );
}
