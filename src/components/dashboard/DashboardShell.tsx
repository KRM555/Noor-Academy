import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Globe,
  Bell,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Home,
  ShieldAlert,
  Menu,
  X,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { dict, tField } from '../../i18n/translations';
import type { UserRole } from '../../types';
import { AcademyLogo, Card, PrimaryButton } from '../ui/CommonUI';
import { PWAInstallButton } from '../ui/PWAComponents';

export interface NavTab {
  id: string;
  label_ar: string;
  label_en: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: UserRole[];
  badgeCount?: number;
}

export function DashboardShell({
  tabs,
  activeTab,
  onSelectTab,
  onNavigatePublic,
  children,
}: {
  tabs: NavTab[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onNavigatePublic: (path: string) => void;
  children: React.ReactNode;
}) {
  const { lang, toggleLang, theme, toggleTheme, user, logout, notifications, markAllNotificationsRead } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const t = dict[lang];

  const currentTabObj = tabs.find((tab) => tab.id === activeTab);
  const isAllowed = user && currentTabObj && currentTabObj.allowedRoles.includes(user.role);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const visibleTabs = tabs.filter((tab) => user && tab.allowedRoles.includes(user.role));
  const mobileQuickTabs = visibleTabs.slice(0, 4);

  const roleBadgeLabel =
    user?.role === 'admin'
      ? lang === 'ar' ? 'المدير العام' : 'Director'
      : user?.role === 'teacher'
      ? lang === 'ar' ? 'المعلم' : 'Teacher'
      : user?.role === 'guardian'
      ? lang === 'ar' ? 'ولي الأمر' : 'Guardian'
      : lang === 'ar' ? 'الطالب' : 'Student';

  return (
    <div className="min-h-screen flex bg-[#FAF8F3] dark:bg-[#091529] text-[#0F213E] dark:text-[#F8F5EC]">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden md:flex flex-col border-e border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] transition-all duration-200 shrink-0 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#E5DEC9] dark:border-[#233C63]">
          <button
            onClick={() => onNavigatePublic('/')}
            className="flex items-center gap-2.5 font-extrabold text-base overflow-hidden cursor-pointer"
          >
            <AcademyLogo className="w-8 h-8 shrink-0" />
            {!collapsed && <span className="truncate">{t.brand}</span>}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle sidebar"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
          >
            {collapsed ? (
              lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : lang === 'ar' ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab;
            const count = Number(tab.badgeCount || 0);
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                title={lang === 'ar' ? tab.label_ar : tab.label_en}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0F213E] text-white dark:bg-[#C98A1E] dark:text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E]'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && (
                    <span className="truncate">{lang === 'ar' ? tab.label_ar : tab.label_en}</span>
                  )}
                </span>
                {!collapsed && count > 0 && (
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-bold font-mono-tabular ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-[#C98A1E]/15 text-[#A56D10] dark:text-amber-300'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#E5DEC9] dark:border-[#233C63] space-y-1">
          <button
            onClick={() => onNavigatePublic('/')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
          >
            <Home className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{lang === 'ar' ? 'الموقع العام' : 'Public Site'}</span>}
          </button>
          <button
            onClick={() => {
              logout();
              onNavigatePublic('/');
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{t.logout}</span>}
          </button>
        </div>
      </aside>

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Dashboard Top Bar */}
        <header className="h-16 px-4 sm:px-6 border-b border-[#E5DEC9] dark:border-[#233C63] bg-white dark:bg-[#0F213E] flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label={lang === 'ar' ? 'فتح القائمة' : 'Open menu'}
              className="md:hidden p-2 -ms-1 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-extrabold text-base truncate">
              {currentTabObj ? (lang === 'ar' ? currentTabObj.label_ar : currentTabObj.label_en) : t.navDashboard}
            </span>
            <span className="hidden sm:inline text-xs text-slate-400">·</span>
            <span className="hidden sm:inline text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] truncate">
              {user?.full_name} ({roleBadgeLabel})
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              onClick={toggleTheme}
              aria-label="Theme"
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
            >
              {theme === 'day' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-300" />}
            </button>

            <button
              onClick={toggleLang}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t.switchLang}</span>
            </button>

            <div className="hidden sm:flex">
              <PWAInstallButton compact />
            </div>

            <button
              onClick={() => setNotifOpen((o) => !o)}
              aria-label={t.notifications}
              className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#C98A1E] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <Card className="absolute top-12 end-0 w-80 p-4 shadow-xl z-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{t.notifications}</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllNotificationsRead}
                      className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                    >
                      {t.markAllRead}
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">{t.noNotifications}</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-2.5 rounded-xl text-xs space-y-0.5 ${
                          n.is_read ? 'opacity-65 bg-[#FAF8F3] dark:bg-[#13284A]' : 'bg-[#F2EFE6] dark:bg-[#162C4E]'
                        }`}
                      >
                        <div className="font-bold">{tField(n as unknown as Record<string, unknown>, 'title', lang)}</div>
                        <div className="text-slate-600 dark:text-slate-300">
                          {tField(n as unknown as Record<string, unknown>, 'body', lang)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        </header>

        {/* Page Body with strict Role Guard */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {isAllowed ? (
            children
          ) : (
            <Card className="p-8 max-w-lg mx-auto text-center space-y-4 my-12">
              <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
              <h2 className="text-xl font-bold">{t.accessDenied}</h2>
              <PrimaryButton onClick={() => visibleTabs[0] && onSelectTab(visibleTabs[0].id)}>
                {lang === 'ar' ? 'الانتقال إلى لوحتي' : 'Go to My Dashboard'}
              </PrimaryButton>
            </Card>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Compact <= 56px) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-white dark:bg-[#0F213E] border-t border-[#E5DEC9] dark:border-[#233C63] flex items-center justify-around px-1">
        {mobileQuickTabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setMobileDrawerOpen(false);
                onSelectTab(tab.id);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[10px] font-bold cursor-pointer ${
                active ? 'text-[#C98A1E]' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[60px]">{lang === 'ar' ? tab.label_ar : tab.label_en}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-[10px] font-bold cursor-pointer ${
            mobileDrawerOpen ? 'text-[#C98A1E]' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Menu className="w-4 h-4" />
          <span className="truncate max-w-[60px]">{lang === 'ar' ? 'القائمة' : 'Menu'}</span>
        </button>
      </nav>

      {/* Mobile Slide-Over Full Navigation Drawer */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-white dark:bg-[#0F213E] border-e border-[#E5DEC9] dark:border-[#233C63] flex flex-col shadow-2xl">
            <div className="h-16 px-4 flex items-center justify-between border-b border-[#E5DEC9] dark:border-[#233C63]">
              <div className="flex items-center gap-2.5 min-w-0">
                <AcademyLogo className="w-8 h-8 shrink-0" />
                <div className="min-w-0">
                  <div className="font-extrabold text-sm truncate">{user?.full_name || t.brand}</div>
                  <div className="text-[11px] font-semibold text-[#0F766E] dark:text-[#2DD4BF] truncate">
                    {roleBadgeLabel}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label={lang === 'ar' ? 'إغلاق القائمة' : 'Close menu'}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const active = tab.id === activeTab;
                const count = Number(tab.badgeCount || 0);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(tab.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#0F213E] text-white dark:bg-[#C98A1E] dark:text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{lang === 'ar' ? tab.label_ar : tab.label_en}</span>
                    </span>
                    {count > 0 && (
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-bold font-mono-tabular ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-[#C98A1E]/15 text-[#A56D10] dark:text-amber-300'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-[#E5DEC9] dark:border-[#233C63] space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  onNavigatePublic('/');
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-[#F2EFE6] dark:hover:bg-[#162C4E] cursor-pointer"
              >
                <Home className="w-4 h-4 shrink-0" />
                <span>{lang === 'ar' ? 'الموقع العام' : 'Public Site'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  logout();
                  onNavigatePublic('/');
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>{t.logout}</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
