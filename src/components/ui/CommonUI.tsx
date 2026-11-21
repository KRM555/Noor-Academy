import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { dict } from '../../i18n/translations';

export function AcademyLogo({ className = 'w-9 h-9' }: { className?: string }) {
  const [imgErr, setImgErr] = useState(false);

  if (imgErr) {
    return (
      <svg viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
        <rect width="40" height="40" rx="10" className="fill-[#0F213E] dark:fill-[#162C4E]" />
        <path
          d="M23.5 10.5C18.2 11.2 14.2 15.7 14.2 21.1C14.2 26.8 18.8 31.4 24.5 31.4C26.4 31.4 28.2 30.8 29.7 29.9C27.2 30.6 24.4 29.9 22.5 27.9C19.8 25.1 19.9 20.6 22.7 17.8C24.5 16 27.1 15.4 29.4 16.1C27.9 12.6 25.9 10.9 23.5 10.5Z"
          className="fill-[#D99B26]"
        />
        <path
          d="M27.5 13L28.4 15.2L30.6 16.1L28.4 17L27.5 19.2L26.6 17L24.4 16.1L26.6 15.2L27.5 13Z"
          className="fill-[#2DD4BF]"
        />
      </svg>
    );
  }

  return (
    <img
      src="/assets/images/academy_logo.webp"
      alt="شعار أكاديمية نور وبيان"
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setImgErr(true)}
      className={`rounded-xl bg-white p-0.5 object-contain border border-[#E5DEC9] dark:border-[#233C63] ${className}`}
    />
  );
}

export function ResilientImage({
  src,
  alt,
  className = '',
  fallbackTitle,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#F2EFE6] to-[#E5DEC9] dark:from-[#102442] dark:to-[#091529] text-[#0F213E] dark:text-[#F8F5EC] p-4 ${className}`}
      >
        <AcademyLogo className="w-10 h-10 mb-2" />
        {fallbackTitle && <span className="text-xs font-medium opacity-75 text-center">{fallbackTitle}</span>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-white dark:bg-[#0F213E] border border-[#E5DEC9] dark:border-[#233C63] ${className}`}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled = false,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0 bg-[#C98A1E] hover:bg-[#B47A16] text-white transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C98A1E] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = 'button',
  disabled = false,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0 bg-[#F2EFE6] hover:bg-[#E5DEC9] text-[#0F213E] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] dark:text-[#F8F5EC] border border-[#E5DEC9] dark:border-[#233C63] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E] disabled:opacity-50 cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded-lg bg-[#E9E2CE] dark:bg-[#1B345B] ${className}`}
    />
  );
}

export function LoadingState({
  label,
  variant = 'cards',
}: {
  label?: string;
  variant?: 'cards' | 'dashboard' | 'table' | 'catalog' | 'detail';
}) {
  const { lang } = useApp();
  const srText = label || dict[lang].loading;

  if (variant === 'table') {
    return (
      <div className="space-y-3 py-4" aria-busy="true" aria-label={srText}>
        <div className="rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] overflow-hidden">
          <div className="px-4 py-3 bg-[#FAF8F3] dark:bg-[#13284A] border-b border-[#E5DEC9] dark:border-[#233C63] grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((c) => (
              <SkeletonBlock key={c} className="h-3.5 w-3/4" />
            ))}
          </div>
          <div className="divide-y divide-[#EFEAD8] dark:divide-[#1D355B]">
            {[1, 2, 3, 4, 5, 6].map((r) => (
              <div key={r} className="px-4 py-3.5 grid grid-cols-4 gap-4 items-center">
                <SkeletonBlock className="h-4 w-5/6" />
                <SkeletonBlock className="h-4 w-2/3" />
                <SkeletonBlock className="h-4 w-1/2" />
                <SkeletonBlock className="h-4 w-16 ms-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className="space-y-6 py-4" aria-busy="true" aria-label={srText}>
        <SkeletonBlock className="h-4 w-28" />
        <div className="rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] overflow-hidden grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-5 aspect-[16/10] md:aspect-auto md:min-h-[260px] bg-[#F2EFE6] dark:bg-[#13284A] motion-safe:animate-pulse" />
          <div className="md:col-span-7 p-6 sm:p-8 space-y-4">
            <SkeletonBlock className="h-3 w-36" />
            <SkeletonBlock className="h-7 w-3/4" />
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#EFEAD8] dark:border-[#1D355B]">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
            <SkeletonBlock className="h-10 w-44 rounded-xl" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((row) => (
            <div
              key={row}
              className="rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] p-4 flex items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <SkeletonBlock className="h-4 w-48" />
                <SkeletonBlock className="h-3 w-72 max-w-full" />
              </div>
              <SkeletonBlock className="h-4 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'catalog') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-4" aria-busy="true" aria-label={srText}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="aspect-[16/10] bg-[#F2EFE6] dark:bg-[#13284A] motion-safe:animate-pulse" />
              <div className="p-6 space-y-3">
                <SkeletonBlock className="h-3 w-32" />
                <SkeletonBlock className="h-5 w-4/5" />
                <div className="space-y-2">
                  <SkeletonBlock className="h-3.5 w-full" />
                  <SkeletonBlock className="h-3.5 w-5/6" />
                </div>
              </div>
            </div>
            <div className="p-6 pt-4 border-t border-[#EFEAD8] dark:border-[#1D355B] flex gap-2">
              <SkeletonBlock className="h-9 flex-1 rounded-xl" />
              <SkeletonBlock className="h-9 flex-1 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div className="space-y-6 py-4" aria-busy="true" aria-label={srText}>
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <SkeletonBlock className="h-6 w-52" />
            <SkeletonBlock className="h-3.5 w-72 max-w-full" />
          </div>
          <SkeletonBlock className="h-10 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((k) => (
            <div
              key={k}
              className="rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] p-5 space-y-2.5"
            >
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] overflow-hidden">
          <div className="px-4 py-3 bg-[#FAF8F3] dark:bg-[#13284A] border-b border-[#E5DEC9] dark:border-[#233C63] grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((c) => (
              <SkeletonBlock key={c} className="h-3.5 w-2/3" />
            ))}
          </div>
          <div className="divide-y divide-[#EFEAD8] dark:divide-[#1D355B]">
            {[1, 2, 3, 4, 5].map((r) => (
              <div key={r} className="px-4 py-3.5 grid grid-cols-4 gap-4 items-center">
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="h-4 w-3/5" />
                <SkeletonBlock className="h-4 w-1/2" />
                <SkeletonBlock className="h-4 w-16 ms-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-6" aria-busy="true" aria-label={srText}>
      {label && <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-white dark:bg-[#0F213E] border border-[#E5DEC9] dark:border-[#233C63] p-5 space-y-3"
          >
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-5 w-4/5" />
            <SkeletonBlock className="h-3.5 w-full" />
            <SkeletonBlock className="h-3.5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaginationBar({
  page,
  totalItems,
  pageSize = 20,
  onPageChange,
}: {
  page: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (nextPage: number) => void;
}) {
  const { lang } = useApp();
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(totalItems / safeSize));

  if (totalItems <= safeSize) return null;

  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * safeSize + 1;
  const endIdx = Math.min(totalItems, currentPage * safeSize);

  const pageNumbers: Array<number | 'ellipsis-start' | 'ellipsis-end'> = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (currentPage > 3) pageNumbers.push('ellipsis-start');
    const winStart = Math.max(2, currentPage - 1);
    const winEnd = Math.min(totalPages - 1, currentPage + 1);
    for (let i = winStart; i <= winEnd; i++) pageNumbers.push(i);
    if (currentPage < totalPages - 2) pageNumbers.push('ellipsis-end');
    pageNumbers.push(totalPages);
  }

  return (
    <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
      <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
        {lang === 'ar'
          ? `عرض ${startIdx}–${endIdx} من أصل ${totalItems} عنصر (صفحة ${currentPage} من ${totalPages})`
          : `Showing ${startIdx}–${endIdx} of ${totalItems} (Page ${currentPage} of ${totalPages})`}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label={lang === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
          className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] text-[#0F213E] dark:text-[#F8F5EC] hover:bg-[#FAF8F3] dark:hover:bg-[#162C4E] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {lang === 'ar' ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          <span>{lang === 'ar' ? 'السابق' : 'Prev'}</span>
        </button>

        {pageNumbers.map((item) =>
          typeof item === 'string' ? (
            <span key={item} className="px-1.5 text-xs text-slate-400 select-none">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-current={item === currentPage ? 'page' : undefined}
              className={`min-w-8 h-8 rounded-xl px-2.5 text-xs font-bold tabular-nums whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                item === currentPage
                  ? 'bg-[#0F213E] text-white dark:bg-[#C98A1E]'
                  : 'border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] text-[#0F213E] dark:text-[#F8F5EC] hover:bg-[#FAF8F3] dark:hover:bg-[#162C4E]'
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label={lang === 'ar' ? 'الصفحة التالية' : 'Next page'}
          className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] text-[#0F213E] dark:text-[#F8F5EC] hover:bg-[#FAF8F3] dark:hover:bg-[#162C4E] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <span>{lang === 'ar' ? 'التالي' : 'Next'}</span>
          {lang === 'ar' ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#D6CDB4] dark:border-[#233C63] p-8 text-center flex flex-col items-center justify-center gap-2">
      <Inbox className="w-8 h-8 text-slate-400 dark:text-slate-500" />
      <h3 className="text-base font-semibold text-[#0F213E] dark:text-[#F8F5EC]">{title}</h3>
      {description && <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'start' | 'end';
  render: (row: T) => React.ReactNode;
}

export function ResponsiveTable<T extends { id?: string | number }>({
  data,
  columns,
  emptyTitle,
  emptyDescription,
  pageSize = 20,
}: {
  data: T[];
  columns: TableColumn<T>[];
  emptyTitle: string;
  emptyDescription?: string;
  pageSize?: number;
}) {
  const [page, setPage] = useState(1);
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(data.length / safeSize));

  useEffect(() => {
    setPage((prev) => (prev > totalPages ? 1 : prev));
  }, [totalPages]);

  const currentPage = Math.min(page, totalPages);
  const pagedData = useMemo(() => {
    if (data.length <= safeSize) return data;
    const start = (currentPage - 1) * safeSize;
    return data.slice(start, start + safeSize);
  }, [data, currentPage, safeSize]);

  if (!data.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#13284A]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap ${
                    col.align === 'end' ? 'text-end' : 'text-start'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEAD8] dark:divide-[#1D355B]">
            {pagedData.map((row, idx) => (
              <tr key={row.id ?? idx} className="hover:bg-[#FAF8F3]/70 dark:hover:bg-[#162C4E]/60 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-[#0F213E] dark:text-[#F8F5EC] ${
                      col.align === 'end' ? 'text-end tabular-nums' : 'text-start'
                    }`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {pagedData.map((row, idx) => (
          <Card key={row.id ?? idx} className="p-4 space-y-2.5">
            {columns.map((col) => (
              <div key={col.key} className="flex items-start justify-between gap-4 text-sm">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">{col.header}</span>
                <div className="text-end text-[#0F213E] dark:text-[#F8F5EC] font-medium tabular-nums">
                  {col.render(row)}
                </div>
              </div>
            ))}
          </Card>
        ))}
      </div>

      <PaginationBar
        page={currentPage}
        totalItems={data.length}
        pageSize={safeSize}
        onPageChange={setPage}
      />
    </div>
  );
}

export function ConfirmDeleteModal({
  open,
  title,
  description,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: string;
  description?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { lang } = useApp();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0F213E] dark:text-[#F8F5EC]">
                {title || dict[lang].confirmDeleteTitle}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {description || dict[lang].confirmDeleteBody}
        </p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <SecondaryButton onClick={onClose}>{dict[lang].cancel}</SecondaryButton>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold bg-red-700 hover:bg-red-800 text-white transition-colors cursor-pointer"
          >
            {dict[lang].delete}
          </button>
        </div>
      </Card>
    </div>
  );
}
