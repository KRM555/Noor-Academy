import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../contexts/AppContext';
import { getBrowserSupabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryClient';

export function useSupabaseRealtime() {
  const { user, lang, toast } = useApp();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const sb = getBrowserSupabase();
    if (!sb) return;

    const channel = sb
      .channel('noor-bayan-live')
      .on('broadcast', { event: 'notification:created' }, (msg) => {
        const payload = (msg.payload || {}) as {
          targetProfileIds?: string[];
          title_ar?: string;
          title_en?: string;
        };
        const targets = Array.isArray(payload.targetProfileIds) ? payload.targetProfileIds : [];
        if (targets.length === 0 || targets.includes(String(user.id))) {
          void qc.invalidateQueries({ queryKey: queryKeys.notifications(user.id) });
          void qc.invalidateQueries({ queryKey: ['dashboard'] });
          const title = lang === 'ar' ? payload.title_ar : payload.title_en || payload.title_ar;
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
