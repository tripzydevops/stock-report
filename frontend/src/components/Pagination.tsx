'use client';

import React from 'react';
import { useLanguage } from '../context/LanguageContext';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [15, 25, 50, 100],
  className = '',
}: PaginationProps) {
  const { language } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalItems <= 0) return null;

  const startItem = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with smart ellipsis
  const getPageNumbers = (): (number | string)[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }

    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  const pages = getPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 ${className}`}
    >
      {/* Left: Item Counter & Optional Page Size Selector */}
      <div className="flex items-center gap-3">
        <span>
          {language === 'tr' ? (
            <>
              Toplam <span className="font-bold text-gray-900 dark:text-white">{totalItems}</span> kayıttan{' '}
              <span className="font-bold text-gray-900 dark:text-white">{startItem}</span> -{' '}
              <span className="font-bold text-gray-900 dark:text-white">{endItem}</span> arası gösteriliyor
            </>
          ) : (
            <>
              Showing <span className="font-bold text-gray-900 dark:text-white">{startItem}</span> to{' '}
              <span className="font-bold text-gray-900 dark:text-white">{endItem}</span> of{' '}
              <span className="font-bold text-gray-900 dark:text-white">{totalItems}</span> entries
            </>
          )}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-2">
            <label htmlFor="pageSizeSelect" className="text-gray-400 text-[11px] hidden sm:inline">
              {language === 'tr' ? 'Sayfa Boyutu:' : 'Page Size:'}
            </label>
            <select
              id="pageSizeSelect"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation Controls */}
      <div className="flex items-center gap-1">
        {/* Previous Button */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none font-semibold transition-all cursor-pointer flex items-center gap-1"
          title={language === 'tr' ? 'Önceki Sayfa' : 'Previous Page'}
        >
          <span>←</span>
          <span className="hidden sm:inline">{language === 'tr' ? 'Önceki' : 'Prev'}</span>
        </button>

        {/* Page Number Buttons */}
        <div className="flex items-center gap-1">
          {pages.map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`dots-${idx}`} className="px-2 py-1 text-gray-400 font-bold select-none">
                  …
                </span>
              );
            }

            const pageNum = p as number;
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                className={`min-w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30'
                    : 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-750 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:pointer-events-none font-semibold transition-all cursor-pointer flex items-center gap-1"
          title={language === 'tr' ? 'Sonraki Sayfa' : 'Next Page'}
        >
          <span className="hidden sm:inline">{language === 'tr' ? 'Sonraki' : 'Next'}</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
export default Pagination;
