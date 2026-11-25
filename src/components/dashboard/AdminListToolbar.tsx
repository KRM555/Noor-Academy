import React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { SecondaryButton } from '../ui/CommonUI';

interface AdminListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  isFetching?: boolean;
  onPageChange: (nextPage: number) => void;
  lang: 'ar' | 'en';
  actions?: React.ReactNode;
}

export function AdminListSearchHeader({
  search,
  onSearchChange,
  searchPlaceholder,
  total,
  isFetching,
  lang,
  actions,
}: Pick<
  AdminListToolbarProps,
  'search' | 'onSearchChange' | 'searchPlaceholder' | 'total' | 'isFetching' | 'lang' | 'actions'
>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] ps-9 pe-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
          {isFetching
            ? lang === 'ar'
              ? 'جاري التحديث...'
              : 'Updating...'
            : lang === 'ar'
            ? `الإجمالي: ${total}`
            : `Total: ${total}`}
        </span>
        {actions}
      </div>
    </div>
  );
}

export function AdminListPagination({
  page,
  totalPages,
  total,
  limit,
  isFetching,
  onPageChange,
  lang,
}: Pick<
  AdminListToolbarProps,
  'page' | 'totalPages' | 'total' | 'limit' | 'isFetching' | 'onPageChange' | 'lang'
>) {
  if (total <= 0 && totalPages <= 1) return null;
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(total, page * limit);
  const PrevIcon = lang === 'ar' ? ChevronRight : ChevronLeft;
  const NextIcon = lang === 'ar' ? ChevronLeft : ChevronRight;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold tabular-nums">
        {lang === 'ar'
          ? `عرض ${startItem}–${endItem} من أصل ${total} · صفحة ${page} من ${totalPages}`
          : `Showing ${startItem}–${endItem} of ${total} · Page ${page} of ${totalPages}`}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <SecondaryButton
            type="button"
            disabled={page <= 1 || isFetching}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="text-xs px-3 py-1.5"
          >
            <PrevIcon className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'السابق' : 'Prev'}</span>
          </SecondaryButton>
          <SecondaryButton
            type="button"
            disabled={page >= totalPages || isFetching}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="text-xs px-3 py-1.5"
          >
            <span>{lang === 'ar' ? 'التالي' : 'Next'}</span>
            <NextIcon className="w-3.5 h-3.5" />
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}

export function AdminTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] overflow-hidden animate-pulse">
      <div className="h-10 bg-[#FAF8F3] dark:bg-[#13284A] border-b border-[#E5DEC9] dark:border-[#233C63]" />
      <div className="divide-y divide-[#EFEAD8] dark:divide-[#1D355B]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center justify-between gap-4">
            <div className="h-3.5 w-24 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3.5 flex-1 max-w-xs rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3.5 w-32 rounded bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div className="h-7 w-20 rounded-lg bg-slate-200 dark:bg-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminCardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-pulse">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] overflow-hidden"
        >
          <div className="aspect-[16/10] w-full bg-slate-200 dark:bg-slate-800" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  );
}
