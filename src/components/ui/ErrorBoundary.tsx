import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[UI ErrorBoundary]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen flex items-center justify-center bg-[#FAF8F3] dark:bg-[#091529] text-[#0F213E] dark:text-[#F8F5EC] px-4"
        >
          <div className="max-w-md w-full rounded-2xl border border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] p-8 text-center space-y-4 shadow-sm">
            <AlertTriangle className="w-10 h-10 text-[#C98A1E] mx-auto" />
            <h1 className="text-xl font-extrabold">حدث خطأ غير متوقع في عرض الصفحة</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              نعتذر عن هذا الخلل المؤقت. يمكنك إعادة تحميل الصفحة للمتابعة بأمان.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold bg-[#0F766E] hover:bg-[#0D625B] text-white cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تحميل الصفحة</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
