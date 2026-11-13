import React, { useEffect, useState, useCallback } from 'react';
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
  CheckSquare,
  ClipboardList,
  Wallet,
  CreditCard,
  Layers,
  UserPlus,
  Scale,
  History,
  Settings,
  GraduationCap,
  KeyRound,
} from 'lucide-react';
import { AppProvider, useApp } from './contexts/AppContext';
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
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardShell, type NavTab } from './components/dashboard/DashboardShell';
import { StudentDashboard } from './pages/dashboard/StudentDashboard';
import { TeacherDashboard } from './pages/dashboard/TeacherDashboard';
import { GuardianDashboard } from './pages/dashboard/GuardianDashboard';
import { AdminDashboard } from './pages/dashboard/AdminDashboard';
import { NoorLettersGame } from './components/games/NoorLettersGame';
import { QuranMemoryGame } from './components/games/QuranMemoryGame';
import { Noor3DExplorer } from './components/games/Noor3DExplorer';
import { LoadingState } from './components/ui/CommonUI';

const ALL_DASHBOARD_TABS: NavTab[] = [
  // Student & Guardian Tabs
  { id: 'home', label_ar: 'الرئيسية', label_en: 'Home', icon: Home, allowedRoles: ['student', 'teacher', 'guardian'] },
  { id: 'lessons', label_ar: 'دروسي واللينكات', label_en: 'My Lessons', icon: BookOpen, allowedRoles: ['student', 'admin'] },
  { id: 'schedule', label_ar: 'الجدول', label_en: 'Schedule', icon: Calendar, allowedRoles: ['student'] },
  { id: 'exams', label_ar: 'الامتحانات', label_en: 'Exams', icon: FileCheck, allowedRoles: ['student', 'admin'] },
  { id: 'recitations', label_ar: 'التسميع والتقييم', label_en: 'Recitations', icon: ClipboardList, allowedRoles: ['student'] },
  { id: 'games', label_ar: 'الألعاب', label_en: 'Games', icon: Gamepad2, allowedRoles: ['student', 'admin'] },
  { id: 'certificates', label_ar: 'الشهادات', label_en: 'Certificates', icon: Award, allowedRoles: ['student', 'guardian', 'admin'] },
  { id: 'announcements', label_ar: 'الإعلانات', label_en: 'Announcements', icon: Megaphone, allowedRoles: ['student', 'admin'] },
  { id: 'profile', label_ar: 'ملفي', label_en: 'My Profile', icon: User, allowedRoles: ['student'] },
  { id: 'account', label_ar: 'حسابي والأمان', label_en: 'Account & Security', icon: KeyRound, allowedRoles: ['guardian'] },

  // Teacher Tabs
  { id: 'courses', label_ar: 'كورساتي', label_en: 'My Courses', icon: BookOpen, allowedRoles: ['teacher', 'admin'] },
  { id: 'students', label_ar: 'طلابي', label_en: 'My Students', icon: Users, allowedRoles: ['teacher', 'admin'] },
  { id: 'attendance', label_ar: 'الحضور', label_en: 'Attendance', icon: CheckSquare, allowedRoles: ['teacher'] },
  { id: 'assessments', label_ar: 'الدرجات والتسميع', label_en: 'Assessments', icon: ClipboardList, allowedRoles: ['teacher'] },
  { id: 'payroll', label_ar: 'مرتباتي', label_en: 'My Payroll', icon: Wallet, allowedRoles: ['teacher', 'admin'] },
  { id: 'payout', label_ar: 'بيانات الراتب', label_en: 'Payout IBAN', icon: CreditCard, allowedRoles: ['teacher'] },

  // Admin Tabs (strictly admin)
  { id: 'overview', label_ar: 'نظرة عامة', label_en: 'Overview', icon: Home, allowedRoles: ['admin'] },
  { id: 'teachers', label_ar: 'المعلمون', label_en: 'Teachers', icon: GraduationCap, allowedRoles: ['admin'] },
  { id: 'levels', label_ar: 'المستويات والتسجيل', label_en: 'Levels & Enroll', icon: Layers, allowedRoles: ['admin'] },
  { id: 'admissions', label_ar: 'طلبات التقديم', label_en: 'Admissions', icon: UserPlus, allowedRoles: ['admin'] },
  { id: 'legal', label_ar: 'الشروط والخصوصية', label_en: 'Legal Docs', icon: Scale, allowedRoles: ['admin'] },
  { id: 'audit', label_ar: 'سجل العمليات', label_en: 'Audit Logs', icon: History, allowedRoles: ['admin'] },
  { id: 'settings', label_ar: 'الإعدادات والأدوار', label_en: 'Settings & Roles', icon: Settings, allowedRoles: ['admin'] },
];

function getDefaultTabForRole(role?: string): string {
  if (role === 'admin') return 'overview';
  return 'home';
}

function RouterContent() {
  const { user, authLoading, lang } = useApp();
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [activeGameSlug, setActiveGameSlug] = useState<string | null>(null);
  const [preCourseId, setPreCourseId] = useState<number | null>(null);
  const [preLevelId, setPreLevelId] = useState<number | null>(null);

  const navigate = useCallback((nextPath: string) => {
    window.history.pushState({}, '', nextPath);
    setPath(nextPath);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const seoMap: Record<string, { titleAr: string; titleEn: string; descAr: string; descEn: string }> = {
      '/': {
        titleAr: 'أكاديمية نور وبيان — تعليم القرآن واللغة العربية والمناهج الدولية أونلاين',
        titleEn: 'Noor & Bayan Academy — Online Quran, Arabic & International Learning',
        descAr: 'منصة تعليمية متكاملة لتحفيظ القرآن الكريم، تأسيس نور البيان، اللغة العربية، الحساب الذهني والمناهج الدولية لجميع المراحل.',
        descEn: 'Comprehensive online academy for Quran memorization, Noor Al-Bayan reading foundation, languages, mental math, and international curricula.',
      },
      '/courses': {
        titleAr: 'الدورات والحلقات التعليمية | أكاديمية نور وبيان',
        titleEn: 'Courses & Circles | Noor & Bayan Academy',
        descAr: 'استعرض دورات القرآن الكريم، التأسيس بنور البيان، اللغات، الحساب الذهني، والمناهج البريطانية والأمريكية.',
        descEn: 'Explore Quran circles, Arabic Noor Al-Bayan foundation, languages, mental math, and international curricula.',
      },
      '/teachers': {
        titleAr: 'نخبة المعلمين والمعلمات | أكاديمية نور وبيان',
        titleEn: 'Certified Teachers & Mentors | Noor & Bayan Academy',
        descAr: 'تعرّف على معلمي ومعلمات أكاديمية نور وبيان المجازين والمتخصصين في تعليم الأطفال والشباب أونلاين.',
        descEn: 'Meet our qualified teachers specialized in Quran Tajweed, Arabic literacy, languages, and school support.',
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
        titleAr: 'قسم الأمهات وأولياء الأمور | أكاديمية نور وبيان',
        titleEn: 'Mothers & Guardians Corner | Noor & Bayan Academy',
        descAr: 'شراكة تربوية حقيقية مع الأمهات وأولياء الأمور لمتابعة حضور وتقدم الأبناء لحظة بلحظة.',
        descEn: 'Partnering with mothers and guardians through transparent attendance, evaluations, and progress reports.',
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
      '/login': {
        titleAr: 'تسجيل الدخول الموحد | أكاديمية نور وبيان',
        titleEn: 'Unified Sign In | Noor & Bayan Academy',
        descAr: 'تسجيل دخول الطلاب، المعلمين، أولياء الأمور، وإدارة أكاديمية نور وبيان.',
        descEn: 'Sign in for students, teachers, guardians, and administrators at Noor & Bayan Academy.',
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
      : seoMap[path] || seoMap['/'];

    const nextTitle = lang === 'ar' ? meta.titleAr : meta.titleEn;
    const nextDesc = lang === 'ar' ? meta.descAr : meta.descEn;
    document.title = nextTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', nextDesc);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', nextTitle);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', nextDesc);
  }, [path, lang]);

  useEffect(() => {
    fetch('/api/public/overview')
      .then((r) => r.json())
      .then(setOverview)
      .catch(() => {});
  }, []);

  if (activeGameSlug === 'noor-letters') {
    return <NoorLettersGame onExit={() => setActiveGameSlug(null)} />;
  }
  if (activeGameSlug === 'quran-memory') {
    return <QuranMemoryGame onExit={() => setActiveGameSlug(null)} />;
  }
  if (activeGameSlug === 'noor-3d-lantern') {
    return <Noor3DExplorer onExit={() => setActiveGameSlug(null)} />;
  }

  // Dashboard Route Guard
  if (path.startsWith('/dashboard')) {
    if (authLoading) {
      return (
        <div className="max-w-4xl mx-auto p-8">
          <LoadingState />
        </div>
      );
    }
    if (!user) {
      return (
        <PublicLayout currentPath="/login" onNavigate={navigate}>
          <LoginPage onSuccess={() => navigate('/dashboard')} />
        </PublicLayout>
      );
    }

    const parts = path.split('/').filter(Boolean); // ['dashboard', tab?]
    const requestedTab = parts[1] || getDefaultTabForRole(user.role);

    return (
      <DashboardShell
        tabs={ALL_DASHBOARD_TABS}
        activeTab={requestedTab}
        onSelectTab={(tabId) => navigate(`/dashboard/${tabId}`)}
        onNavigatePublic={navigate}
      >
        {user.role === 'student' && (
          <StudentDashboard activeTab={requestedTab} onLaunchGame={setActiveGameSlug} />
        )}
        {user.role === 'teacher' && <TeacherDashboard activeTab={requestedTab} />}
        {user.role === 'guardian' && <GuardianDashboard activeTab={requestedTab} />}
        {user.role === 'admin' && (
          <AdminDashboard activeTab={requestedTab} onLaunchGame={setActiveGameSlug} />
        )}
      </DashboardShell>
    );
  }

  // Public Routes
  const courseMatch = path.match(/^\/courses\/(\d+)$/);
  const teacherMatch = path.match(/^\/teachers\/(\d+)$/);

  return (
    <PublicLayout currentPath={path} onNavigate={navigate}>
      {path === '/' && (
        <HomePage
          overview={overview}
          onNavigate={navigate}
          onLaunchGame={setActiveGameSlug}
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
        <GamesHubPage overview={overview} onLaunchGame={setActiveGameSlug} />
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

      {path === '/apply' && (
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
        />
      )}
    </PublicLayout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RouterContent />
    </AppProvider>
  );
}
