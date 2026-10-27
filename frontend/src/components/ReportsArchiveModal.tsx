'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

interface ReportFileItem {
  id: string;
  report_type: string;
  storage_path: string;
  trading_date: string;
  generated_at: string;
  file_size_bytes: number;
  row_count: number;
  checksum_sha256: string;
  is_latest: boolean;
  download_url: string | null;
}

interface ReportsArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReportsArchiveModal({ isOpen, onClose }: ReportsArchiveModalProps) {
  const { language } = useLanguage();
  const [reports, setReports] = useState<ReportFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetch('/api/reports?limit=15')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          setReports(Array.isArray(data) ? data : []);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Raporlar yüklenemedi');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const latestReport = reports.find(r => r.is_latest) || reports[0];
  const historyReports = reports.filter(r => r.id !== latestReport?.id);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#0c1322] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-7 z-10 max-h-[90vh] flex flex-col space-y-5 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>📊</span>
              <span>{language === 'tr' ? 'MarketPulse Excel Rapor Arşivi' : 'MarketPulse Report Archive'}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {language === 'tr'
                ? 'Supabase Storage üzerinde saklanan değişmez (immutable) piyasa snapshotları'
                : 'Immutable point-in-time market snapshots stored securely in Supabase Storage'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold text-slate-400">
                {language === 'tr' ? 'Raporlar getiriliyor...' : 'Fetching reports...'}
              </p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              ⚠️ {error}
            </div>
          ) : reports.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              {language === 'tr' ? 'Henüz kaydedilmiş rapor bulunamadı.' : 'No reports found yet.'}
            </div>
          ) : (
            <>
              {/* Latest Report Highlight Card */}
              {latestReport && (
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 via-emerald-500/10 to-transparent border border-blue-500/30 dark:border-blue-500/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      ★ {language === 'tr' ? 'EN SON GÜNCEL RAPOR' : 'LATEST ACTIVE REPORT'}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {formatDate(latestReport.generated_at)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-1 text-xs">
                    <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block">{language === 'tr' ? 'Toplam Satır' : 'Row Count'}</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {latestReport.row_count?.toLocaleString()}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 block">{language === 'tr' ? 'Dosya Boyutu' : 'File Size'}</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatFileSize(latestReport.file_size_bytes)}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800 col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-slate-400 block">SHA-256</span>
                      <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400 truncate block" title={latestReport.checksum_sha256}>
                        {latestReport.checksum_sha256?.slice(0, 12)}...
                      </span>
                    </div>
                  </div>

                  {latestReport.download_url && (
                    <a
                      href={latestReport.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-xs shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                    >
                      <span>⬇️</span>
                      <span>{language === 'tr' ? 'En Son Raporu İndir (.xlsx)' : 'Download Latest Report (.xlsx)'}</span>
                    </a>
                  )}
                </div>
              )}

              {/* Historical Archive List */}
              {historyReports.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {language === 'tr' ? 'Geçmiş Seans Raporları' : 'Past Session Reports'}
                  </h3>
                  <div className="space-y-2">
                    {historyReports.map(rep => (
                      <div
                        key={rep.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                            {formatDate(rep.generated_at)}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {formatFileSize(rep.file_size_bytes)} · {rep.row_count?.toLocaleString()} {language === 'tr' ? 'satır' : 'rows'}
                          </p>
                        </div>
                        {rep.download_url && (
                          <a
                            href={rep.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white font-bold text-xs transition-colors shrink-0"
                          >
                            ⬇️ {language === 'tr' ? 'İndir' : 'Download'}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            {language === 'tr' ? 'Kapat' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
