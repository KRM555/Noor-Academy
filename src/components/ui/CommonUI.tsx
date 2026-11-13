import React, { useState } from 'react';
import { X, AlertTriangle, Inbox } from 'lucide-react';
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
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}) {
  const [failed, setFailed] = useState(false);

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

export function LoadingState({ label }: { label?: string }) {
  const { lang } = useApp();
  return (
    <div className="space-y-4 py-6" aria-busy="true">
      <div className="text-sm text-slate-500 dark:text-slate-400">{label || dict[lang].loading}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-[#F2EFE6] dark:bg-[#162C4E] border border-[#E5DEC9] dark:border-[#233C63] opacity-70"
          />
        ))}
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
}: {
  data: T[];
  columns: TableColumn<T>[];
  emptyTitle: string;
  emptyDescription?: string;
}) {
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
            {data.map((row, idx) => (
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
        {data.map((row, idx) => (
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
