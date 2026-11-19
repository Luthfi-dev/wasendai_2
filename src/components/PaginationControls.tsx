import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  itemLabel?: string;
  compact?: boolean;
  className?: string;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  itemLabel = 'data',
  compact = false,
  className = ''
}) => {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safeCurrent = Math.min(Math.max(1, currentPage), totalPages);

  if (totalItems <= safePageSize) {
    return null;
  }

  const startIdx = (safeCurrent - 1) * safePageSize + 1;
  const endIdx = Math.min(safeCurrent * safePageSize, totalItems);

  const buildPageNumbers = (): Array<number | 'ellipsis-left' | 'ellipsis-right'> => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: Array<number | 'ellipsis-left' | 'ellipsis-right'> = [1];
    if (safeCurrent > 3) {
      pages.push('ellipsis-left');
    }
    const start = Math.max(2, safeCurrent - 1);
    const end = Math.min(totalPages - 1, safeCurrent + 1);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    if (safeCurrent < totalPages - 2) {
      pages.push('ellipsis-right');
    }
    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = compact ? [] : buildPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-200/80 dark:border-slate-800 ${className}`}
    >
      <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
        Menampilkan <strong className="text-slate-700 dark:text-slate-200">{startIdx}–{endIdx}</strong> dari{' '}
        <strong className="text-slate-700 dark:text-slate-200">{totalItems}</strong> {itemLabel}
      </span>

      <div className="flex items-center gap-1 self-end sm:self-auto">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safeCurrent - 1))}
          disabled={safeCurrent <= 1}
          aria-label="Halaman sebelumnya"
          className="min-w-[34px] min-h-[34px] px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {compact ? (
          <span className="px-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums whitespace-nowrap">
            {safeCurrent} / {totalPages}
          </span>
        ) : (
          pageNumbers.map(item =>
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                className={`min-w-[34px] min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold tabular-nums transition-colors ${
                  item === safeCurrent
                    ? 'bg-emerald-600 text-white border border-emerald-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="px-1 text-xs text-slate-400 select-none">
                ...
              </span>
            )
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safeCurrent + 1))}
          disabled={safeCurrent >= totalPages}
          aria-label="Halaman berikutnya"
          className="min-w-[34px] min-h-[34px] px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
