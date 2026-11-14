import React, { useState } from 'react';
import { Sun, Moon, Menu, X, Globe, LogIn, LayoutDashboard } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { dict } from '../../i18n/translations';
import { AcademyLogo } from '../ui/CommonUI';
import { PWAInstallButton } from '../ui/PWAComponents';

interface PublicLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

export function PublicLayout({ currentPath, onNavigate, children }: PublicLayoutProps) {
  const { lang, toggleLang, theme, toggleTheme, user } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = dict[lang];

  const navItems = [
    { path: '/courses', label: t.navCourses },
    { path: '/teachers', label: t.navTeachers },
    { path: '/games', label: t.navGames },
    { path: '/parents', label: lang === 'ar' ? 'قسم الأمهات' : 'Mothers' },
    { path: '/placement', label: t.navPlacement },
  ];

  const go = (path: string) => {
    setMobileOpen(false);
    onNavigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] dark:bg-[#091529] text-[#0F213E] dark:text-[#F8F5EC]">
      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 border-b border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3]/95 dark:bg-[#091529]/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 lg:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            onClick={() => go('/')}
            className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight whitespace-nowrap shrink-0 cursor-pointer"
          >
            <AcademyLogo className="w-8 h-8" />
            <span>{t.brand}</span>
          </button>

          {/* Zone 2: Concise Single-Line Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {navItems.map((item) => {
              const active = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => go(item.path)}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                    active
                      ? 'border-[#C98A1E] text-[#0F213E] dark:text-white'
                      : 'border-transparent hover:border-[#C98A1E]/50 hover:text-[#0F213E] dark:hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Theme, Language, Auth & Primary Action */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={toggleTheme}
              title={theme === 'day' ? t.themeNight : t.themeDay}
              aria-label={theme === 'day' ? t.themeNight : t.themeDay}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-[#EFEAD8] dark:hover:bg-[#162C4E] transition-colors cursor-pointer"
            >
              {theme === 'day' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-300" />}
            </button>

            <button
              onClick={toggleLang}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-[#EFEAD8] dark:hover:bg-[#162C4E] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t.switchLang}</span>
            </button>

            <div className="hidden md:flex">
              <PWAInstallButton compact />
            </div>

            {user ? (
              <button
                onClick={() => go('/dashboard')}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold bg-[#0F766E] hover:bg-[#0D625B] text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>{t.navDashboard}</span>
              </button>
            ) : (
              <button
                onClick={() => go('/login')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0F213E] dark:text-[#F8F5EC] hover:text-[#C98A1E] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t.navLogin}</span>
              </button>
            )}

            <button
              onClick={() => go('/apply')}
              className="hidden sm:inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-bold bg-[#C98A1E] hover:bg-[#B47A16] text-white whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              {t.navApply}
            </button>

            <button
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
              className="lg:hidden p-2 rounded-lg text-[#0F213E] dark:text-[#F8F5EC] hover:bg-[#EFEAD8] dark:hover:bg-[#162C4E] cursor-pointer"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#0F213E] px-4 py-4 space-y-2">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className="block w-full text-start px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#EFEAD8] dark:hover:bg-[#162C4E] cursor-pointer"
              >
                {item.label}
              </button>
            ))}
            <div className="pt-2 border-t border-[#E5DEC9] dark:border-[#233C63] flex items-center gap-2">
              {user ? (
                <button
                  onClick={() => go('/dashboard')}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold bg-[#0F766E] text-white text-center cursor-pointer"
                >
                  {t.navDashboard}
                </button>
              ) : (
                <button
                  onClick={() => go('/login')}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold bg-[#EFEAD8] dark:bg-[#162C4E] text-center cursor-pointer"
                >
                  {t.navLogin}
                </button>
              )}
              <button
                onClick={() => go('/apply')}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold bg-[#C98A1E] text-white text-center cursor-pointer"
              >
                {t.navApply}
              </button>
            </div>
            <div className="pt-1 flex justify-center">
              <PWAInstallButton />
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-[#E5DEC9] dark:border-[#233C63] bg-[#F2EFE6] dark:bg-[#0D1C36] mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 font-extrabold text-base">
              <AcademyLogo className="w-7 h-7" />
              <span>{t.brandFull}</span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-xs">
              {lang === 'ar'
                ? 'بيئة تعليمية تربوية دافئة لتعليم القرآن الكريم ونور البيان واللغة العربية للأطفال بإشراف معلمين مجازين.'
                : 'A warm, trustworthy online academy teaching Quran, Noor Al-Bayan, and Arabic to children with certified instructors.'}
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'الأكاديمية' : 'Academy'}
            </h4>
            <ul className="space-y-1.5">
              <li><button onClick={() => go('/how-it-works')} className="hover:text-[#C98A1E] cursor-pointer">{lang === 'ar' ? 'كيف نعمل بالتفصيل' : 'How It Works'}</button></li>
              <li><button onClick={() => go('/levels')} className="hover:text-[#C98A1E] cursor-pointer">{t.navLevels}</button></li>
              <li><button onClick={() => go('/parents')} className="hover:text-[#C98A1E] cursor-pointer">{t.parentsCorner}</button></li>
              <li><button onClick={() => go('/verify')} className="hover:text-[#C98A1E] cursor-pointer">{t.verifyCert}</button></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'السياسات والتواصل' : 'Policies & Support'}
            </h4>
            <ul className="space-y-1.5">
              <li><button onClick={() => go('/faq')} className="hover:text-[#C98A1E] cursor-pointer">{t.faqTitle}</button></li>
              <li><button onClick={() => go('/contact')} className="hover:text-[#C98A1E] cursor-pointer">{t.contactUs}</button></li>
              <li><button onClick={() => go('/legal/terms')} className="hover:text-[#C98A1E] cursor-pointer">{t.terms}</button></li>
              <li><button onClick={() => go('/legal/privacy')} className="hover:text-[#C98A1E] cursor-pointer">{t.privacy}</button></li>
              <li><button onClick={() => go('/legal/refund')} className="hover:text-[#C98A1E] cursor-pointer">{t.refund}</button></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-xs text-slate-500 dark:text-slate-400">
              <button onClick={() => go('/contact')} className="hover:text-[#C98A1E] cursor-pointer">
                {t.contactUs}
              </button>
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-mono-tabular">
              <a href="mailto:care@noorbayan.academy" className="hover:text-[#C98A1E]">
                care@noorbayan.academy
              </a>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-mono-tabular">
              <a href="https://wa.me/201005550199" target="_blank" rel="noopener noreferrer" className="hover:text-[#C98A1E]">
                WhatsApp: +20 100 555 0199
              </a>
            </p>
            <button
              onClick={() => go('/apply')}
              className="mt-2 inline-flex items-center rounded-xl px-4 py-2 text-xs font-bold bg-[#0F213E] dark:bg-[#C98A1E] text-white cursor-pointer"
            >
              {t.navApply}
            </button>
          </div>
        </div>
        <div className="border-t border-[#E5DEC9] dark:border-[#233C63] py-4 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
          © {new Date().getFullYear()} {t.brandFull}. {lang === 'ar' ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
        </div>
      </footer>
    </div>
  );
}
