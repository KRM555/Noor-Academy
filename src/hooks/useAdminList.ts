import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

export interface AdminPaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type AdminListResource =
  | 'students'
  | 'teachers'
  | 'courses'
  | 'profiles'
  | 'enrollments'
  | 'admissions'
  | 'guardian-requests'
  | 'announcements'
  | 'exams'
  | 'certificates'
  | 'payroll'
  | 'audit-logs';

export function useAdminList<T>(
  resource: AdminListResource,
  opts: {
    page: number;
    limit?: number;
    q?: string;
    status?: string;
    action?: string;
    enabled?: boolean;
  }
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 25));
  const q = (opts.q || '').trim();
  const status = (opts.status || '').trim();
  const action = (opts.action || '').trim();
  const enabled = opts.enabled ?? true;

  return useQuery<AdminPaginatedResponse<T>>({
    queryKey: queryKeys.adminList(resource, {
      page,
      limit,
      q,
      ...(status ? { status } : {}),
      ...(action ? { action } : {}),
    }),
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set('page', String(page));
      sp.set('limit', String(limit));
      if (q) sp.set('q', q);
      if (status && status !== 'all') sp.set('status', status);
      if (action && action !== 'all') sp.set('action', action);
      return apiFetch<AdminPaginatedResponse<T>>(`/api/admin/${resource}?${sp.toString()}`);
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}
