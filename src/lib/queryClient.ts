import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (failureCount >= 1) return false;
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('401') || msg.includes('403') || msg.includes('404')) {
          return false;
        }
        return true;
      },
    },
  },
});

export const queryKeys = {
  publicOverview: ['public', 'overview'] as const,
  courseDetail: (courseId: number) => ['public', 'courses', courseId] as const,
  teacherDetail: (teacherId: number) => ['public', 'teachers', teacherId] as const,
  notifications: (userId?: string | number) => ['notifications', userId ?? 'anon'] as const,
  studentDashboard: (userId?: string | number) => ['dashboard', 'student', userId ?? 'anon'] as const,
  guardianDashboard: (userId?: string | number) => ['dashboard', 'guardian', userId ?? 'anon'] as const,
  adminSummary: (userId?: string | number) => ['admin', 'summary', userId ?? 'anon'] as const,
  adminList: (
    resource: string,
    params?: { page?: number; limit?: number; q?: string; status?: string; action?: string }
  ) =>
    params
      ? (['admin', 'list', resource, params] as const)
      : (['admin', 'list', resource] as const),
  adminCourseWorkspace: (courseId: number | null) =>
    ['admin', 'course-workspace', courseId ?? 'none'] as const,
  adminLaunchStatus: ['admin', 'launch-status'] as const,
  adminSchema: ['admin', 'supabase-schema'] as const,
  publicComments: ['public', 'comments'] as const,
  publicSuggestions: ['public', 'suggestions'] as const,
  publicPlacementTest: ['public', 'placement-test'] as const,
  myCommunity: (userId?: string | number) => ['my', 'community', userId ?? 'anon'] as const,
  adminCommunity: ['admin', 'community'] as const,
  adminPlacementTest: ['admin', 'placement-test'] as const,
};
