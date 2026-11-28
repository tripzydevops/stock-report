'use client';

import React from 'react';
import { PortfolioActionStatus } from '../types/portfolioMutation';

export interface SyncStateBannerProps {
  status: PortfolioActionStatus;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt?: string | null;
  onSyncNow?: () => void;
  onReviewErrors?: () => void;
  language?: 'tr' | 'en';
}

export function SyncStateBanner({
  status,
  pendingCount,
  failedCount,
  lastSyncedAt,
  onSyncNow,
  onReviewErrors,
  language = 'tr',
}: SyncStateBannerProps) {
  // If idle, no pending offline queue, and no failed actions, do not take vertical space
  if (status === 'IDLE' && pendingCount === 0 && failedCount === 0) {
    return null;
  }

  // 1. Critical Failure State: Deterministic 4xx or rejected mutations
  if (failedCount > 0) {
    return (
      <aside
        data-testid="sync-state-banner-failed"
        aria-label="Failed actions notice"
        className="mb-3 p-3 rounded-xl bg-gradient-to-r from-rose-500/15 via-red-500/15 to-orange-500/15 border border-rose-400/80 dark:border-rose-500/60 shadow-xs flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base shrink-0" aria-hidden="true">⚠️</span>
          <div className="min-w-0">
            <h2 className="text-xs font-black text-rose-950 dark:text-rose-200">
              {failedCount}{' '}
              {language === 'tr'
                ? 'İşlem Sunucu Tarafından Reddedildi'
                : 'Action(s) Rejected by Server'}
            </h2>
            <p className="text-[11px] text-rose-800 dark:text-rose-300 truncate">
              {language === 'tr'
                ? 'İşlemleriniz korundu. Lütfen inceleyip tekrar deneyin veya iptal edin.'
                : 'Your actions are preserved. Review to retry or discard.'}
            </p>
          </div>
        </div>

        {onReviewErrors && (
          <button
            type="button"
            onClick={onReviewErrors}
            className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-black shadow-xs transition-all cursor-pointer shrink-0"
          >
            {language === 'tr' ? 'Hataları İncele' : 'Review Errors'}
          </button>
        )}
      </aside>
    );
  }

  // 2. Offline / Pending Queued State
  if (status === 'OFFLINE' || pendingCount > 0) {
    return (
      <aside
        data-testid="sync-state-banner-offline"
        aria-label="Offline sync notice"
        className="mb-3 p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-400/80 dark:border-amber-500/60 flex items-center justify-between gap-2 shadow-xs"
      >
        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="text-base shrink-0 animate-pulse" aria-hidden="true">⏳</span>
          <div className="min-w-0">
            <h2 className="font-black text-amber-950 dark:text-amber-200">
              {pendingCount}{' '}
              {language === 'tr'
                ? 'İşlem Çevrimdışı Kuyruğunda Bekliyor'
                : 'Action(s) Queued Offline'}
            </h2>
            <p className="text-[11px] text-amber-800 dark:text-amber-300 truncate">
              {language === 'tr'
                ? 'Bağlantı kurulduğunda otomatik olarak buluta eşitlenecek.'
                : 'Will automatically sync to cloud when connection resumes.'}
            </p>
          </div>
        </div>

        {onSyncNow && (
          <button
            type="button"
            onClick={onSyncNow}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-black shadow-xs transition-all cursor-pointer shrink-0 flex items-center gap-1"
          >
            <span aria-hidden="true">🔄</span>
            <span>{language === 'tr' ? 'Şimdi Eşitle' : 'Sync Now'}</span>
          </button>
        )}
      </aside>
    );
  }

  // 3. Transient Retryable Network Issue State (Online but server temporarily failing)
  if (status === 'RETRYABLE') {
    return (
      <aside
        data-testid="sync-state-banner-retryable"
        aria-label="Connection sync issue"
        className="mb-3 p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-blue-500/15 to-indigo-500/15 border border-blue-400/80 dark:border-blue-500/60 flex items-center justify-between gap-2 shadow-xs"
      >
        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="text-base shrink-0 animate-spin" aria-hidden="true">🔄</span>
          <div className="min-w-0">
            <h2 className="font-black text-blue-950 dark:text-blue-200">
              {language === 'tr'
                ? 'Sunucu Eşitlemesi Beklemede'
                : 'Sync Issue — Retrying Shortly'}
            </h2>
            <p className="text-[11px] text-blue-800 dark:text-blue-300 truncate">
              {language === 'tr'
                ? 'Ağ yanıt vermedi; işlem arka planda yeniden deneniyor.'
                : 'Connection issue; will retry automatically.'}
            </p>
          </div>
        </div>

        {onSyncNow && (
          <button
            type="button"
            onClick={onSyncNow}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-black shadow-xs transition-all cursor-pointer shrink-0"
          >
            {language === 'tr' ? 'Tekrar Dene' : 'Retry Now'}
          </button>
        )}
      </aside>
    );
  }

  // 4. Actively Pending / Syncing State
  if (status === 'PENDING') {
    return (
      <aside
        data-testid="sync-state-banner-pending"
        aria-label="Syncing in progress"
        className="mb-3 p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-300 dark:border-neutral-700 flex items-center justify-between gap-2 shadow-xs"
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="text-sm shrink-0 animate-spin" aria-hidden="true">⏳</span>
          <h2 className="font-bold text-neutral-800 dark:text-neutral-200">
            {language === 'tr' ? 'Değişiklikler eşitleniyor...' : 'Syncing changes with server...'}
          </h2>
        </div>
      </aside>
    );
  }

  return null;
}
