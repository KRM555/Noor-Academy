import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { lang } = useApp();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => {
          void install();
        }}
        title={lang === 'ar' ? 'تثبيت التطبيق على جهازك' : 'Install Academy App'}
        className={`inline-flex items-center gap-1.5 rounded-xl font-bold bg-[#0F766E] hover:bg-[#0D625B] text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{lang === 'ar' ? 'تثبيت التطبيق' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] px-2.5 py-1.5 text-xs font-bold text-[#0F213E] dark:text-[#F8F5EC] hover:bg-[#EFEAD8] dark:hover:bg-[#162C4E] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#C98A1E]" />
          <span>{lang === 'ar' ? 'تثبيت على iPhone' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0F213E] border border-[#E5DEC9] dark:border-[#233C63] p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold">
                  {lang === 'ar' ? 'تثبيت أكاديمية نور وبيان' : 'Install on iPhone / iPad'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm text-slate-600 dark:text-slate-300 space-y-2 list-decimal list-inside">
                <li>
                  {lang === 'ar'
                    ? 'اضغط على زر المشاركة (Share) في شريط متصفح Safari.'
                    : 'Tap the Share button in the Safari toolbar.'}
                </li>
                <li>
                  {lang === 'ar'
                    ? 'اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).'
                    : 'Scroll down and tap "Add to Home Screen".'}
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-[#0F213E] dark:bg-[#C98A1E] text-white py-2.5 text-xs font-bold cursor-pointer"
              >
                {lang === 'ar' ? 'حسناً، فهمت' : 'Got it'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const { lang } = useApp();
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 start-4 z-50 flex items-center gap-2 rounded-xl bg-[#C98A1E] px-3.5 py-2 text-xs font-bold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {lang === 'ar'
          ? 'وضع عدم الاتصال — يتم عرض البيانات المخزنة مؤقتاً'
          : 'Offline Mode — Showing cached academy data'}
      </span>
    </div>
  );
}
