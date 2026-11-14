import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../contexts/AppContext';
import { getBrowserSupabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryClient';
import type { NotificationItem } from '../types';

export function useSupabaseRealtime() {
  const { user, lang, toast } = useApp();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const sb = getBrowserSupabase();
    if (!sb) return;

    const channel = sb
      .channel('noor-bayan-live')
      .on('broadcast', { event: 'notification:created' }, async () => {
        const prev = qc.getQueryData<NotificationItem[]>(queryKeys.notifications(user.id)) || [];
        const prevMaxId = prev.reduce((max, n) => Math.max(max, Number(n.id) || 0), 0);
        await qc.invalidateQueries({ queryKey: queryKeys.notifications(user.id) });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
        const next = qc.getQueryData<NotificationItem[]>(queryKeys.notifications(user.id)) || [];
        const newest = next.find((n) => Number(n.id) > prevMaxId && !n.is_read);
        if (newest) {
          const title = lang === 'ar' ? newest.title_ar : newest.title_en || newest.title_ar;
          toast(
            title
              ? `${lang === 'ar' ? 'إشعار جديد:' : 'New notification:'} ${title}`
              : lang === 'ar'
              ? 'وصل إشعار جديد'
              : 'New notification received',
            'info'
          );
        }
      })
      .on('broadcast', { event: 'attendance:updated' }, () => {
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
        if (user.role === 'student' || user.role === 'guardian') {
          toast(
            lang === 'ar' ? 'تم تحديث سجل الحضور لحظياً' : 'Attendance updated live',
            'info'
          );
        }
      })
      .on('broadcast', { event: 'academic:updated' }, () => {
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
      })
      .on('broadcast', { event: 'admission:created' }, () => {
        if (user.role === 'admin') {
          void qc.invalidateQueries({ queryKey: queryKeys.adminDashboard(user.id) });
          toast(
            lang === 'ar' ? 'وصل طلب التحاق جديد' : 'New admission request received',
            'info'
          );
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          void qc.invalidateQueries({ queryKey: queryKeys.notifications(user.id) });
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [user, lang, toast, qc]);
}
