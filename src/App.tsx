import React, { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react';
import {
  Home,
  BookOpen,
  Calendar,
  FileCheck,
  Award,
  Gamepad2,
  Megaphone,
  User,
  Users,
  ClipboardList,
  Wallet,
  UserPlus,
  Scale,
  History,
  Settings,
  GraduationCap,
  KeyRound,
  MessageSquare,
} from 'lucide-react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { AppProvider, useApp } from './contexts/AppContext';
import { apiFetch } from './lib/api';
import { queryClient, queryKeys } from './lib/queryClient';
import { OFFICIAL_SITE_URL } from './lib/siteConfig';
import type { PublicOverview } from './types';
import { PublicLayout } from './components/public/PublicLayout';
import { HomePage } from './pages/public/HomePage';
import { PlacementTestPage } from './pages/public/PlacementTestPage';
import { AdmissionPage } from './pages/public/AdmissionPage';
import {
  CoursesPage,
  CourseDetailPage,
  TeachersPage,
  TeacherDetailPage,
  LevelsPage,
  VerifyCertificatePage,
  GamesHubPage,
  InfoStaticPage,
} from './pages/public/PublicSubpages';
import { LoginPage, GoogleOAuthCallbackPage } from './pages/auth/LoginPage';
import { DashboardShell, type NavTab } from './components/dashboard/DashboardShell';
import { LoadingState } from './components/ui/CommonUI';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

const StudentDashboard = lazy(() =>
  import('./pages/dashboard/StudentDashboard').then((m) => ({ default: m.StudentDashboard }))
);
const GuardianDashboard = lazy(() =>
  import('./pages/dashboard/GuardianDashboard').then((m) => ({ default: m.GuardianDashboard }))
);
const AdminDashboard = lazy(() =>
  import('./pages/dashboard/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const NoorLettersGame = lazy(() =>
  import('./components/games/NoorLettersGame').then((m) => ({ default: m.NoorLettersGame }))
);
const QuranMemoryGame = lazy(() =>
  import('./components/games/QuranMemoryGame').then((m) => ({ default: m.QuranMemoryGame }))
);
const Noor3DExplorer = lazy(() =>
  import('./components/games/Noor3DExplorer').then((m) => ({ default: m.Noor3DExplorer }))
);
import { OfflineIndicator } from './components/ui/PWAComponents';
import { useSupabaseRealtime } from './hooks/useSupabaseRealtime';

const ALL_DASHBOARD_TABS: NavTab[] = [
  // Student & Guardian Tabs
  { id: 'home', label_ar: 'الرئيسية', label_en: 'Home', icon: Home, allowedRoles: ['student', 'guardian'] },
  { id: 'lessons', label_ar: 'دروسي واللينكات', label_en: 'My Lessons', icon: BookOpen, allowedRoles: ['student'] },
  { id: 'schedule', label_ar: 'الجدول', label_en: 'Schedule', icon: Calendar, allowedRoles: ['student'] },
  { id: 'exams', label_ar: 'الامتحانات', label_en: 'Exams', icon: FileCheck, allowedRoles: ['student', 'admin'] },
  { id: 'recitations', label_ar: 'التسميع والتقييم', label_en: 'Recitations', icon: ClipboardList, allowedRoles: ['student'] },
  { id: 'games', label_ar: 'الألعاب', label_en: 'Games', icon: Gamepad2, allowedRoles: ['student', 'admin'] },
  { id: 'certificates', label_ar: 'الشهادات', label_en: 'Certificates', icon: Award, allowedRoles: ['student', 'guardian', 'admin'] },
  { id: 'announcements', label_ar: 'الإعلانات', label_en: 'Announcements', icon: Megaphone, allowedRoles: ['student', 'admin'] },
  { id: 'profile', label_ar: 'ملفي', label_en: 'My Profile', icon: User, allowedRoles: ['student'] },
  { id: 'account', label_ar: 'حسابي والأمان', label_en: 'Account & Security', icon: KeyRound, allowedRoles: ['guardian'] },

  // Academic Management Tabs (Admin)
  { id: 'courses', label_ar: 'الكورسات', label_en: 'Courses', icon: BookOpen, allowedRoles: ['admin'] },
  { id: 'students', label_ar: 'الطلاب', label_en: 'Students', icon: Users, allowedRoles: ['admin'] },
  { id: 'payroll', label_ar: 'المرتبات', label_en: 'Payroll', icon: Wallet, allowedRoles: ['admin'] },

  // Admin Tabs (strictly admin)
  { id: 'overview', label_ar: 'نظرة عامة', label_en: 'Overview', icon: Home, allowedRoles: ['admin'] },
  { id: 'teachers', label_ar: 'المعلمون', label_en: 'Teachers', icon: GraduationCap, allowedRoles: ['admin'] },
  { id: 'admissions', label_ar: 'طلبات التقديم', label_en: 'Admissions', icon: UserPlus, allowedRoles: ['admin'] },
  { id: 'community', label_ar: 'التعليقات والمقترحات', label_en: 'Reviews & Ideas', icon: MessageSquare, allowedRoles: ['admin'] },
  { id: 'legal', label_ar: 'الشروط والخصوصية', label_en: 'Legal Docs', icon: Scale, allowedRoles: ['admin'] },
  { id: 'audit', label_ar: 'سجل العمليات', label_en: 'Audit Logs', icon: History, allowedRoles: ['admin'] },
  { id: 'settings', label_ar: 'الإعدادات والأدوار', label_en: 'Settings & Roles', icon: Settings, allowedRoles: ['admin'] },
];

const ADMIN_TAB_ORDER = [
  'overview',
  'admissions',
  'courses',
  'students',
  'teachers',
  'exams',
  'certificates',
  'announcements',
  'community',
  'payroll',
  'games',
  'settings',
  'legal',
  'audit',
];

function getDashboardTabsForRole(role?: string): NavTab[] {
  if (role === 'admin') {
    const adminTabs = ALL_DASHBOARD_TABS.filter((t) => t.allowedRoles.includes('admin')).map((t) => {
      if (t.id === 'students') return { ...t, label_ar: 'الطلاب', label_en: 'Students' };
      if (t.id === 'payroll') return { ...t, label_ar: 'الرواتب', label_en: 'Payroll' };
      return t;
    });
    return adminTabs.sort((a, b) => {
      const ia = ADMIN_TAB_ORDER.indexOf(a.id);
      const ib = ADMIN_TAB_ORDER.indexOf(b.id);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }
  return ALL_DASHBOARD_TABS;
}

function getDefaultTabForRole(role?: string): string {
  if (role === 'admin') return 'overview';
  return 'home';
}

function RouterContent() {
  const { user, authLoading, lang } = useApp();
  useSupabaseRealtime();
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');
  const [preCourseId, setPreCourseId] = useState<number | null>(null);
  const [preLevelId, setPreLevelId] = useState<number | null>(null);
  const lastPathBeforeGameRef = useRef<string>('/games');

  const isDashboardRoute = path.startsWith('/dashboard');

  const { data: overview = null } = useQuery({
    queryKey: queryKeys.publicOverview,
    queryFn: () => apiFetch<PublicOverview>('/api/public/overview'),
    enabled: !isDashboardRoute,
    staleTime: 2 * 60 * 1000,
  });

  const { data: adminSummary } = useQuery({
    queryKey: queryKeys.adminSummary(user?.id),
    queryFn: () =>
      apiFetch<{
        counts?: {
          pendingAdmissions?: number;
          pendingGrading?: number;
          pendingSuggestions?: number;
        };
      }>('/api/admin/dashboard/summary'),
    enabled: user?.role === 'admin' && isDashboardRoute,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!isDashboardRoute || !user?.id) return;
    if (user.role === 'student') {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.studentDashboard(user.id),
        queryFn: () => apiFetch('/api/student/dashboard'),
        staleTime: 60 * 1000,
      });
    } else if (user.role === 'guardian') {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.guardianDashboard(user.id),
        queryFn: () => apiFetch('/api/guardian/dashboard'),
        staleTime: 60 * 1000,
      });
    }
  }, [isDashboardRoute, user?.id, user?.role]);

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  }, []);

  const launchGame = useCallback(
    (slug: string) => {
      if (!path.startsWith('/games/')) {
        lastPathBeforeGameRef.current = path || '/games';
      }
      navigate(`/games/${slug}`);
    },
    [path, navigate]
  );

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const seoMap: Record<string, { titleAr: string; titleEn: string; descAr: string; descEn: string }> = {
      '/': {
        titleAr: 'أكاديمية نور وبيان — القرآن واللغات والمناهج الدولية وتنمية المهارات أونلاين',
        titleEn: 'Noor & Bayan Academy — Quran, Languages, International Curricula & Skills',
        descAr: 'أكاديمية تعليمية متكاملة أونلاين لتحفيظ القرآن والعلوم الإسلامية، تأسيس نور البيان والعربية، اللغات، جميع المواد الدراسية، المناهج الدولية، الحساب الذهني وتنمية المهارات والنطق.',
        descEn: 'Comprehensive online academy for Quran & Islamic studies, Noor Al-Bayan & Arabic, world languages, all school subjects, international curricula, mental math, and speech development.',
      },
      '/courses': {
        titleAr: 'الدورات والمسارات التعليمية | أكاديمية نور وبيان',
        titleEn: 'Courses & Tracks | Noor & Bayan Academy',
        descAr: 'استعرض دورات القرآن والعلوم الإسلامية، نور البيان، اللغات، جميع المواد الدراسية، الحساب الذهني، تنمية المهارات، والمناهج الدولية.',
        descEn: 'Explore Quran & Islamic studies, Noor Al-Bayan Arabic, world languages, school subjects, mental math, skill development, and international curricula.',
      },
      '/teachers': {
        titleAr: 'نخبة المعلمين والمعلمات | أكاديمية نور وبيان',
        titleEn: 'Certified Teachers & Mentors | Noor & Bayan Academy',
        descAr: 'تعرّف على معلمي ومعلمات أكاديمية نور وبيان المتخصصين في القرآن، اللغات، المناهج الدولية، الحساب الذهني، وتنمية المهارات.',
        descEn: 'Meet our qualified teachers specialized in Quran, languages, international curricula, mental math, and skill building.',
      },
      '/levels': {
        titleAr: 'المستويات والمسارات التعليمية | أكاديمية نور وبيان',
        titleEn: 'Learning Levels & Tracks | Noor & Bayan Academy',
        descAr: 'مسارات تعليمية متدرجة حسب العمر والمستوى من التأسيس إلى الإتقان والتميّز.',
        descEn: 'Structured learning tracks tailored to every child age and proficiency level.',
      },
      '/placement': {
        titleAr: 'اختبار تحديد المستوى المجاني | أكاديمية نور وبيان',
        titleEn: 'Free Placement Assessment | Noor & Bayan Academy',
        descAr: 'حدّد المستوى الأنسب لطفلك في اللغة العربية والقرآن الكريم خلال دقائق قبل التسجيل.',
        descEn: 'Discover the right learning track for your child in minutes before enrollment.',
      },
      '/apply': {
        titleAr: 'قدّم الآن للانضمام | أكاديمية نور وبيان',
        titleEn: 'Apply for Admission | Noor & Bayan Academy',
        descAr: 'قدّم طلب تسجيل لطفلك في حلقات أكاديمية نور وبيان التعليمية أونلاين بسهولة.',
        descEn: 'Submit your child enrollment application to join Noor & Bayan Academy online circles.',
      },
      '/parents': {
        titleAr: 'قسم أولياء الأمور | أكاديمية نور وبيان',
        titleEn: 'Parents & Guardians Corner | Noor & Bayan Academy',
        descAr: 'شراكة تربوية حقيقية مع أولياء الأمور لمتابعة حضور وتقدم الأبناء لحظة بلحظة.',
        descEn: 'Partnering with parents and guardians through transparent attendance, evaluations, and progress reports.',
      },
      '/games': {
        titleAr: 'الألعاب التعليمية التفاعلية | أكاديمية نور وبيان',
        titleEn: 'Educational Learning Games | Noor & Bayan Academy',
        descAr: 'ألعاب تعليمية تفاعلية وممتعة للحروف العربية وقصار السور وتنمية المهارات.',
        descEn: 'Interactive educational games for Arabic letters, Quran memory, and joyful learning.',
      },
      '/verify': {
        titleAr: 'التحقق من الشهادات المعتمدة | أكاديمية نور وبيان',
        titleEn: 'Verify Academy Certificates | Noor & Bayan Academy',
        descAr: 'تحقق فوراً من صحة الشهادات الصادرة عن أكاديمية نور وبيان عبر رمز التحقق الفريد.',
        descEn: 'Instantly verify official certificates issued by Noor & Bayan Academy.',
      },
      '/how-it-works': {
        titleAr: 'كيف نعمل؟ رحلة الطالب | أكاديمية نور وبيان',
        titleEn: 'How It Works | Noor & Bayan Academy',
        descAr: 'تعرّف على خطوات التسجيل، تحديد المستوى، الحصص التفاعلية المباشرة، والمتابعة الدورية.',
        descEn: 'Learn how enrollment, placement assessment, live interactive classes, and reporting work.',
      },
      '/faq': {
        titleAr: 'الأسئلة الشائعة | أكاديمية نور وبيان',
        titleEn: 'Frequently Asked Questions | Noor & Bayan Academy',
        descAr: 'إجابات شاملة حول مواعيد الحصص، المناهج، الرسوم، ونظام المتابعة في أكاديمية نور وبيان.',
        descEn: 'Answers to common questions about schedules, curricula, tuition, and parent reporting.',
      },
      '/contact': {
        titleAr: 'تواصل معنا | أكاديمية نور وبيان',
        titleEn: 'Contact Us | Noor & Bayan Academy',
        descAr: 'تواصل مع فريق أكاديمية نور وبيان عبر واتساب أو البريد الإلكتروني للاستفسار عن الحلقات وتحديد المستوى.',
        descEn: 'Contact Noor & Bayan Academy via WhatsApp or email for course schedules and placement support.',
      },
      '/login': {
        titleAr: 'تسجيل الدخول الموحد | أكاديمية نور وبيان',
        titleEn: 'Unified Sign In | Noor & Bayan Academy',
        descAr: 'تسجيل دخول الطلاب، أولياء الأمور، وإدارة أكاديمية نور وبيان.',
        descEn: 'Sign in for students, guardians, and administrators at Noor & Bayan Academy.',
      },
    };

    const meta = path.startsWith('/dashboard')
      ? {
          titleAr: 'لوحة التحكم | أكاديمية نور وبيان',
          titleEn: 'Academy Portal | Noor & Bayan Academy',
          descAr: 'بوابة المتابعة الأكاديمية الخاصة بأكاديمية نور وبيان.',
          descEn: 'Private academic portal for Noor & Bayan Academy.',
        }
      : path.startsWith('/courses/')
      ? seoMap['/courses']
      : path.startsWith('/teachers/')
      ? seoMap['/teachers']
      : path.startsWith('/games/')
      ? seoMap['/games']
      : seoMap[path] || seoMap['/'];

    const nextTitle = lang === 'ar' ? meta.titleAr : meta.titleEn;
    const nextDesc = lang === 'ar' ? meta.descAr : meta.descEn;
    document.title = nextTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', nextDesc);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', nextTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', nextDesc);

    const canonicalHref = `${OFFICIAL_SITE_URL}${path === '/' ? '/' : path}`;
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonicalHref);

    let ogUrlMeta = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
    if (!ogUrlMeta) {
      ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrlMeta);
    }
    ogUrlMeta.setAttribute('content', canonicalHref);

    const ogImageAbs = `${OFFICIAL_SITE_URL}/assets/images/academy_banner.webp`;
    document.querySelector('meta[property="og:image"]')?.setAttribute('content', ogImageAbs);
    document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', ogImageAbs);
  }, [path, lang]);

  const exitGame = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'student'] });
    const target = lastPathBeforeGameRef.current || '/games';
    navigate(target.startsWith('/games/') ? '/games' : target);
  }, [navigate]);

  const gameFallback = (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF8F3] dark:bg-[#091529] p-8">
      <div className="w-full max-w-md">
        <LoadingState />
      </div>
    </div>
  );

  const gameMatch = path.match(/^\/games\/([a-z0-9-]+)$/);
  const activeGameSlug = gameMatch ? gameMatch[1] : null;

  if (activeGameSlug === 'noor-letters') {
    return (
      <Suspense fallback={gameFallback}>
        <NoorLettersGame onExit={exitGame} />
      </Suspense>
    );
  }
  if (activeGameSlug === 'quran-memory') {
    return (
      <Suspense fallback={gameFallback}>
        <QuranMemoryGame onExit={exitGame} />
      </Suspense>
    );
  }
  if (activeGameSlug === 'noor-3d-lantern') {
    return (
      <Suspense fallback={gameFallback}>
        <Noor3DExplorer onExit={exitGame} />
      </Suspense>
    );
  }

  // Dashboard Route Guard
  if (path.startsWith('/dashboard')) {
    if (authLoading) {
      return (
        <div className="max-w-4xl mx-auto p-8">
          <LoadingState variant="dashboard" />
        </div>
      );
    }
    if (!user) {
      return (
        <PublicLayout currentPath="/login" onNavigate={navigate}>
          <LoginPage
            onSuccess={() => navigate('/dashboard')}
            onNavigateAdmission={() => navigate('/apply')}
          />
        </PublicLayout>
      );
    }

    const parts = path.split('/').filter(Boolean); // ['dashboard', tab?]
    const requestedTab = parts[1] || getDefaultTabForRole(user.role);

    const pendingAdmissionsCount = Number(adminSummary?.counts?.pendingAdmissions || 0);
    const pendingGradingCount = Number(adminSummary?.counts?.pendingGrading || 0);
    const pendingSuggestionsCount = Number(adminSummary?.counts?.pendingSuggestions || 0);

    const resolvedTabs = getDashboardTabsForRole(user.role).map((t) => {
      if (user.role !== 'admin') return t;
      if (t.id === 'admissions') return { ...t, badgeCount: pendingAdmissionsCount };
      if (t.id === 'exams') return { ...t, badgeCount: pendingGradingCount };
      if (t.id === 'community') return { ...t, badgeCount: pendingSuggestionsCount };
      return t;
    });

    return (
      <DashboardShell
        tabs={resolvedTabs}
        activeTab={requestedTab}
        onSelectTab={(tabId) => navigate(`/dashboard/${tabId}`)}
        onNavigatePublic={navigate}
      >
        <Suspense fallback={<LoadingState variant="dashboard" />}>
          {user.role === 'student' && (
            <StudentDashboard activeTab={requestedTab} onLaunchGame={launchGame} />
          )}
          {user.role === 'guardian' && <GuardianDashboard activeTab={requestedTab} />}
          {user.role === 'admin' && (
            <AdminDashboard activeTab={requestedTab} onLaunchGame={launchGame} />
          )}
        </Suspense>
      </DashboardShell>
    );
  }

  // Public Routes
  const courseMatch = path.match(/^\/courses\/(\d+)$/);
  const teacherMatch = path.match(/^\/teachers\/(\d+)$/);
  const knownStaticPaths = new Set([
    '/',
    '/courses',
    '/teachers',
    '/games',
    '/levels',
    '/placement',
    '/apply',
    '/admission',
    '/verify',
    '/how-it-works',
    '/parents',
    '/faq',
    '/contact',
    '/legal/terms',
    '/legal/privacy',
    '/legal/refund',
    '/login',
    '/auth/google-callback',
    '/auth/google-callback/',
  ]);
  const isKnownPublicRoute = knownStaticPaths.has(path) || Boolean(courseMatch) || Boolean(teacherMatch);

  return (
    <PublicLayout currentPath={path} onNavigate={navigate}>
      {path === '/' && (
        <HomePage
          overview={overview}
          onNavigate={navigate}
          onLaunchGame={launchGame}
        />
      )}

      {path === '/courses' && (
        <CoursesPage
          courses={overview?.courses || []}
          onSelectCourse={(id) => navigate(`/courses/${id}`)}
          onApplyCourse={(id) => {
            setPreCourseId(id);
            navigate('/apply');
          }}
        />
      )}

      {courseMatch && (
        <CourseDetailPage
          courseId={Number(courseMatch[1])}
          onApplyCourse={(id) => {
            setPreCourseId(id);
            navigate('/apply');
          }}
          onBack={() => navigate('/courses')}
        />
      )}

      {path === '/teachers' && (
        <TeachersPage
          teachers={overview?.teachers || []}
          onSelectTeacher={(id) => navigate(`/teachers/${id}`)}
        />
      )}

      {teacherMatch && (
        <TeacherDetailPage
          teacherId={Number(teacherMatch[1])}
          onSelectCourse={(id) => navigate(`/courses/${id}`)}
          onBack={() => navigate('/teachers')}
        />
      )}

      {path === '/games' && (
        <GamesHubPage overview={overview} onLaunchGame={launchGame} />
      )}

      {path === '/levels' && <LevelsPage overview={overview} onNavigate={navigate} />}

      {path === '/placement' && (
        <PlacementTestPage
          onSelectLevelForAdmission={(lvlId) => {
            setPreLevelId(lvlId);
            navigate('/apply');
          }}
        />
      )}

      {(path === '/apply' || path === '/admission') && (
        <AdmissionPage
          courses={overview?.courses || []}
          levels={overview?.levels || []}
          preselectedCourseId={preCourseId}
          preselectedLevelId={preLevelId}
          onNavigate={navigate}
        />
      )}

      {path === '/verify' && <VerifyCertificatePage />}

      {path === '/how-it-works' && (
        <InfoStaticPage mode="how-it-works" legalDocs={overview?.legal || []} onNavigate={navigate} />
      )}
      {path === '/parents' && (
        <InfoStaticPage mode="parents" legalDocs={overview?.legal || []} onNavigate={navigate} />
      )}
      {path === '/faq' && (
        <InfoStaticPage mode="faq" legalDocs={overview?.legal || []} onNavigate={navigate} />
      )}
      {path === '/contact' && (
        <InfoStaticPage mode="contact" legalDocs={overview?.legal || []} onNavigate={navigate} />
      )}
      {path === '/legal/terms' && (
        <InfoStaticPage mode="terms" legalDocs={overview?.legal || []} onNavigate={navigate} />
      )}
      {path === '/legal/privacy' && (
        <InfoStaticPage mode="privacy" legalDocs={overview?.legal || []} onNavigate={navigate} />
      )}
      {path === '/legal/refund' && (
        <InfoStaticPage mode="refund" legalDocs={overview?.legal || []} onNavigate={navigate} />
      )}

      {path === '/login' && (
        <LoginPage
          onSuccess={() => {
            navigate('/dashboard');
          }}
          onNavigateAdmission={() => navigate('/apply')}
        />
      )}

      {(path === '/auth/google-callback' || path === '/auth/google-callback/') && (
        <GoogleOAuthCallbackPage />
      )}

      {!isKnownPublicRoute && (
        <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-5">
          <div className="text-5xl font-extrabold font-mono-tabular text-[#C98A1E]">404</div>
          <h1 className="text-2xl font-extrabold">
            {lang === 'ar' ? 'الصفحة غير موجودة' : 'Page Not Found'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {lang === 'ar'
              ? 'الرابط الذي طلبته غير متاح أو ربما تم نقله. يمكنك العودة إلى الصفحة الرئيسية أو استعراض الدورات.'
              : 'The page you requested does not exist or may have moved. Return home or browse our courses.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold bg-[#C98A1E] hover:bg-[#B47A16] text-white transition-colors cursor-pointer"
            >
              {lang === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/courses')}
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold bg-[#F2EFE6] hover:bg-[#E5DEC9] text-[#0F213E] dark:bg-[#162C4E] dark:text-[#F8F5EC] border border-[#E5DEC9] dark:border-[#233C63] transition-colors cursor-pointer"
            >
              {lang === 'ar' ? 'استعراض الدورات' : 'Browse Courses'}
            </button>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <RouterContent />
          <OfflineIndicator />
        </AppProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
