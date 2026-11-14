import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, Lang, NotificationItem, Theme } from '../types';
import { apiFetch, getStoredToken, setStoredToken } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
}

interface AppContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  user: AuthUser | null;
  authLoading: boolean;
  loginWithCredentials: (email: string, password: string) => Promise<AuthUser>;
  loginDemoRole: (demoRole: 'admin' | 'teacher1' | 'teacher2' | 'student' | 'guardian') => Promise<AuthUser>;
  setAuthSession: (token: string, user: AuthUser) => void;
  logout: () => void;
  notifications: NotificationItem[];
  refreshNotifications: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  toast: (text: string, tone?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('nb_lang') as Lang) || 'ar');
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('nb_theme') as Theme) || 'day');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const { data: notifications = [] } = useQuery({
    queryKey: queryKeys.notifications(user?.id),
    queryFn: async () => {
      const data = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      return data.notifications;
    },
    enabled: Boolean(user),
    staleTime: 30 * 1000,
  });

  const toast = useCallback((text: string, tone: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, text, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem('nb_lang', next);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'ar' ? 'en' : 'ar');
  }, [lang, setLang]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem('nb_theme', next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'day' ? 'night' : 'day');
  }, [theme, setTheme]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'night') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const refreshNotifications = useCallback(async () => {
    if (!getStoredToken() || !user) return;
    await qc.invalidateQueries({ queryKey: queryKeys.notifications(user.id) });
  }, [qc, user]);

  const markAllNotificationsRead = useCallback(async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
      qc.setQueryData<NotificationItem[]>(queryKeys.notifications(user?.id), (prev) =>
        (prev || []).map((n) => ({ ...n, is_read: 1 }))
      );
    } catch {
      // ignore
    }
  }, [qc, user?.id]);

  useEffect(() => {
    async function initAuth() {
      try {
        const res = await apiFetch<{ user: AuthUser | null }>('/api/auth/session');
        if (res.user) {
          setUser(res.user);
        } else {
          setStoredToken(null);
          setUser(null);
        }
      } catch {
        setStoredToken(null);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }
    void initAuth();
  }, []);

  const loginWithCredentials = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    void qc.invalidateQueries({ queryKey: queryKeys.notifications(res.user.id) });
    return res.user;
  };

  const loginDemoRole = async (demoRole: 'admin' | 'teacher1' | 'teacher2' | 'student' | 'guardian') => {
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ demoRole }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    void qc.invalidateQueries({ queryKey: queryKeys.notifications(res.user.id) });
    return res.user;
  };

  const setAuthSession = useCallback(
    (token: string, nextUser: AuthUser) => {
      setStoredToken(token);
      setUser(nextUser);
      void qc.invalidateQueries({ queryKey: queryKeys.notifications(nextUser.id) });
    },
    [qc]
  );

  const logout = () => {
    void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setStoredToken(null);
    setUser(null);
    qc.removeQueries({ queryKey: ['dashboard'] });
    qc.removeQueries({ queryKey: ['notifications'] });
    qc.removeQueries({ queryKey: ['admin'] });
  };

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        toggleLang,
        theme,
        setTheme,
        toggleTheme,
        user,
        authLoading,
        loginWithCredentials,
        loginDemoRole,
        setAuthSession,
        logout,
        notifications,
        refreshNotifications,
        markAllNotificationsRead,
        toast,
      }}
    >
      {children}
      <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:end-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium border shadow-md transition-all ${
              item.tone === 'success'
                ? 'bg-teal-700 text-white border-teal-600'
                : item.tone === 'error'
                ? 'bg-red-700 text-white border-red-600'
                : 'bg-[#0F213E] text-[#FAF8F3] border-[#233C63]'
            }`}
          >
            {item.text}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
