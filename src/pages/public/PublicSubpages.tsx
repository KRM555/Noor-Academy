import React, { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Search, CheckCircle2, XCircle, Gamepad2, BookOpen, Clock, ExternalLink, Copy, Check } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import { getCertificateVerifyUrl, normalizeAcademyText } from '../../lib/siteConfig';
import { dict, tField } from '../../i18n/translations';
import type { Course, LegalDocument, PublicOverview, Teacher } from '../../types';
import { Card, PrimaryButton, SecondaryButton, ResilientImage, LoadingState, PaginationBar } from '../../components/ui/CommonUI';
import { getCourseImageUrl } from '../../lib/courseImages';
import { formatCoursePriceSummary, resolveCoursePrices, type DisplayCurrency } from '../../lib/currency';
import {
  ACADEMY_CONTACTS,
  WhatsAppBrandIcon,
  GmailBrandIcon,
  FacebookBrandIcon,
  YouTubeBrandIcon,
} from '../../components/ui/SocialBrandIcons';

export function CoursesPage({
  courses,
  onSelectCourse,
  onApplyCourse,
}: {
  courses: Course[];
  onSelectCourse: (id: number) => void;
  onApplyCourse: (id: number) => void;
}) {
  const { lang, currency, setCurrency } = useApp();
  const t = dict[lang];
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const pagedCourses = courses.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 space-y-3">
          <h1 className="text-3xl font-extrabold">{t.coursesTitle}</h1>
          <p className="text-slate-600 dark:text-slate-300">{t.coursesSubtitle}</p>
          <div className="inline-flex items-center gap-2 pt-1">
            <span className="text-xs font-bold text-slate-500">{lang === 'ar' ? 'عملة العرض:' : 'Currency:'}</span>
            <div className="inline-flex rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] p-1 text-xs font-bold">
              {(
                [
                  { id: 'BOTH', ar: 'ج.م + ر.س', en: 'EGP + SAR' },
                  { id: 'EGP', ar: 'الجنيه المصري', en: 'EGP' },
                  { id: 'SAR', ar: 'الريال السعودي', en: 'SAR' },
                ] as Array<{ id: DisplayCurrency; ar: string; en: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCurrency(opt.id)}
                  className={`px-3 py-1 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currency === opt.id
                      ? 'bg-[#0F213E] text-white dark:bg-[#C98A1E]'
                      : 'text-slate-600 dark:text-slate-300 hover:text-[#0F213E]'
                  }`}
                >
                  {lang === 'ar' ? opt.ar : opt.en}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] shadow-sm">
          <ResilientImage
            src="/assets/images/virtual_classroom.webp"
            alt={lang === 'ar' ? 'حلقات التعلم التفاعلية في أكاديمية نور وبيان' : 'Interactive virtual learning classroom at Noor & Bayan Academy'}
            className="w-full h-auto block"
          />
        </div>
      </div>

      {courses.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <BookOpen className="w-8 h-8 text-[#C98A1E] mx-auto" />
          <h2 className="text-lg font-bold">
            {lang === 'ar' ? 'لا توجد دورات منشورة حالياً' : 'No Published Courses Yet'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            {lang === 'ar'
              ? 'ستظهر الدورات هنا تلقائياً فور إضافتها من لوحة تحكم الإدارة.'
              : 'Courses added from the academy admin dashboard will appear here automatically.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pagedCourses.map((c) => (
            <Card key={c.id} className="overflow-hidden flex flex-col justify-between">
              <div>
                <div className="aspect-[16/10] bg-[#F2EFE6] dark:bg-[#13284A]">
                  <ResilientImage
                    src={getCourseImageUrl(c.title_ar, c.cover_url)}
                    alt={tField(c as unknown as Record<string, unknown>, 'title', lang)}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 pb-2 space-y-2.5">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {[
                      tField(c as unknown as Record<string, unknown>, 'level_name', lang),
                      tField(c as unknown as Record<string, unknown>, 'teacher_name', lang),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {c.co_teacher_names_ar && c.co_teacher_names_ar.length > 0 && ` (+${c.co_teacher_names_ar.length})`}
                  </div>
                  <h2 className="text-lg font-bold">{tField(c as unknown as Record<string, unknown>, 'title', lang)}</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {tField(c as unknown as Record<string, unknown>, 'description', lang)}
                  </p>
                </div>
              </div>
              <div className="p-6 pt-4 border-t border-[#EFEAD8] dark:border-[#1D355B] space-y-3 mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{tField(c as unknown as Record<string, unknown>, 'schedule', lang)}</span>
                  <span className="text-sm sm:text-base font-extrabold text-[#0F213E] dark:text-[#F8F5EC] tabular-nums">
                    {formatCoursePriceSummary(c, lang, currency)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <SecondaryButton className="flex-1 text-xs py-2" onClick={() => onSelectCourse(c.id)}>
                    {lang === 'ar' ? 'تفاصيل الدورة' : 'Details'}
                  </SecondaryButton>
                  <PrimaryButton className="flex-1 text-xs py-2" onClick={() => onApplyCourse(c.id)}>
                    {t.navApply}
                  </PrimaryButton>
                </div>
              </div>
            </Card>
            ))}
          </div>
          <PaginationBar page={page} totalItems={courses.length} pageSize={pageSize} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export function CourseDetailPage({
  courseId,
  onApplyCourse,
  onBack,
}: {
  courseId: number;
  onApplyCourse: (id: number) => void;
  onBack: () => void;
}) {
  const { lang } = useApp();
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.courseDetail(courseId),
    queryFn: () =>
      apiFetch<{
        course: Course & { age_range?: string; teacher_qualifications_ar?: string; teacher_qualifications_en?: string };
        lessons: Array<{ id: number; title_ar: string; title_en: string; lesson_date: string; duration_min: number; objectives_ar: string; objectives_en: string }>;
      }>(`/api/public/courses/${courseId}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) return <div className="max-w-5xl mx-auto px-4 py-12"><LoadingState variant="detail" /></div>;
  if (isError || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <Card className="p-8 text-center space-y-4">
          <h1 className="text-xl font-extrabold">
            {lang === 'ar' ? 'تعذّر العثور على الدورة المطلوبة' : 'Course Not Found'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {lang === 'ar'
              ? 'ربما حُذفت هذه الدورة أو حدث خطأ مؤقت في التحميل.'
              : 'This course may have been removed or a temporary loading error occurred.'}
          </p>
          <SecondaryButton onClick={onBack}>
            {lang === 'ar' ? '← العودة للدورات' : '← Back to Courses'}
          </SecondaryButton>
        </Card>
      </div>
    );
  }
  const { course, lessons } = data;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <button onClick={onBack} className="text-sm font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer">
        {lang === 'ar' ? '← العودة للدورات' : '← Back to Courses'}
      </button>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-5 aspect-[16/10] md:aspect-auto bg-[#F2EFE6] dark:bg-[#13284A]">
            <ResilientImage
              src={getCourseImageUrl(course.title_ar, course.cover_url)}
              alt={tField(course as unknown as Record<string, unknown>, 'title', lang)}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="md:col-span-7 p-6 sm:p-8 space-y-5">
            <div className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
              {tField(course as unknown as Record<string, unknown>, 'level_name', lang)}
              {' · '}
              {course.age_range}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">
              {tField(course as unknown as Record<string, unknown>, 'title', lang)}
            </h1>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {tField(course as unknown as Record<string, unknown>, 'description', lang)}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#EFEAD8] dark:border-[#1D355B] text-sm">
              <div>
                <div className="text-xs text-slate-500">{lang === 'ar' ? 'المعلمون المسؤولون' : 'Instructors'}</div>
                <div className="font-bold">
                  {tField(course as unknown as Record<string, unknown>, 'teacher_name', lang) ||
                    ((course.co_teacher_names_ar && course.co_teacher_names_ar.length > 0)
                      ? ''
                      : lang === 'ar'
                      ? 'يُحدد لاحقاً'
                      : 'To be assigned')}
                  {course.co_teacher_names_ar && course.co_teacher_names_ar.length > 0 && (
                    <span className="block text-xs font-normal text-slate-500 mt-0.5">
                      {(lang === 'ar' ? course.co_teacher_names_ar : course.co_teacher_names_en || course.co_teacher_names_ar).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{lang === 'ar' ? 'المواعيد' : 'Schedule'}</div>
                <div className="font-bold">{tField(course as unknown as Record<string, unknown>, 'schedule', lang)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{lang === 'ar' ? 'الرسوم الشهرية' : 'Monthly Fee'}</div>
                <div className="font-extrabold tabular-nums">
                  {(() => {
                    const p = resolveCoursePrices(course.price_monthly, course.price_monthly_sar);
                    return lang === 'ar'
                      ? `${p.egp} ج.م · ${p.sar} ر.س / شهرياً`
                      : `${p.egp} EGP · ${p.sar} SAR / mo`;
                  })()}
                </div>
              </div>
            </div>

            <PrimaryButton onClick={() => onApplyCourse(course.id)}>
              {lang === 'ar' ? 'قدّم في هذه الحلقة الآن' : 'Apply for This Circle'}
            </PrimaryButton>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-bold">{lang === 'ar' ? 'خطة الدروس النموذجية' : 'Sample Lesson Plan'}</h2>
        {lessons.length === 0 ? (
          <Card className="p-6 text-sm text-slate-500">{lang === 'ar' ? 'سيتم نشر جدول الدروس عند بدء المجموعة.' : 'Lesson schedule published at cohort start.'}</Card>
        ) : (
          <div className="space-y-3">
            {lessons.map((l) => (
              <Card key={l.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-sm">{tField(l as unknown as Record<string, unknown>, 'title', lang)}</div>
                  <div className="text-xs text-slate-500">{tField(l as unknown as Record<string, unknown>, 'objectives', lang)}</div>
                </div>
                <div className="text-xs font-mono-tabular text-slate-500 shrink-0">
                  {l.lesson_date} · {l.duration_min} {lang === 'ar' ? 'دقيقة' : 'min'}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TeachersPage({
  teachers,
  onSelectTeacher,
}: {
  teachers: Teacher[];
  onSelectTeacher: (id: number) => void;
}) {
  const { lang } = useApp();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const pagedTeachers = teachers.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2 max-w-2xl">
        <h1 className="text-3xl font-extrabold">{dict[lang].teachersTitle}</h1>
        <p className="text-slate-600 dark:text-slate-300">{dict[lang].teachersSubtitle}</p>
      </div>
      {teachers.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {lang === 'ar'
              ? 'سيتم عرض المعلمين المعتمدين هنا فور إضافتهم من لوحة الإدارة.'
              : 'Approved teachers will appear here once added from the admin dashboard.'}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pagedTeachers.map((t) => (
            <Card key={t.id} className="overflow-hidden flex flex-col">
              <div className="aspect-[4/3] bg-[#F2EFE6] dark:bg-[#13284A]">
                <ResilientImage
                  src={t.avatar_url}
                  alt={tField(t as unknown as Record<string, unknown>, 'name', lang)}
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                    {tField(t as unknown as Record<string, unknown>, 'specialty', lang)}
                  </div>
                  <h2 className="text-xl font-bold">{tField(t as unknown as Record<string, unknown>, 'name', lang)}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {tField(t as unknown as Record<string, unknown>, 'qualifications', lang)}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {tField(t as unknown as Record<string, unknown>, 'bio', lang)}
                  </p>
                </div>
                <SecondaryButton className="w-full text-xs mt-2" onClick={() => onSelectTeacher(t.id)}>
                  {lang === 'ar' ? 'الملف الشخصي والدورات' : 'Profile & Courses'}
                </SecondaryButton>
              </div>
            </Card>
            ))}
          </div>
          <PaginationBar page={page} totalItems={teachers.length} pageSize={pageSize} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export function TeacherDetailPage({
  teacherId,
  onSelectCourse,
  onBack,
}: {
  teacherId: number;
  onSelectCourse: (id: number) => void;
  onBack: () => void;
}) {
  const { lang } = useApp();
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.teacherDetail(teacherId),
    queryFn: () => apiFetch<{ teacher: Teacher; courses: Course[] }>(`/api/public/teachers/${teacherId}`),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) return <div className="max-w-5xl mx-auto px-4 py-12"><LoadingState variant="detail" /></div>;
  if (isError || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <Card className="p-8 text-center space-y-4">
          <h1 className="text-xl font-extrabold">
            {lang === 'ar' ? 'ملف المعلم غير متاح' : 'Teacher Profile Not Found'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {lang === 'ar'
              ? 'هذا الملف غير متاح حالياً أو تم تحديث بياناته.'
              : 'This teacher profile is currently unavailable.'}
          </p>
          <SecondaryButton onClick={onBack}>
            {lang === 'ar' ? '← العودة للمعلمين' : '← Back to Teachers'}
          </SecondaryButton>
        </Card>
      </div>
    );
  }
  const { teacher, courses } = data;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <button onClick={onBack} className="text-sm font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer">
        {lang === 'ar' ? '← العودة للمعلمين' : '← Back to Teachers'}
      </button>
      <Card className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-4 aspect-square rounded-2xl overflow-hidden bg-[#F2EFE6]">
          <ResilientImage
            src={teacher.avatar_url}
            alt={tField(teacher as unknown as Record<string, unknown>, 'name', lang)}
            className="w-full h-full object-cover object-top"
          />
        </div>
        <div className="md:col-span-8 space-y-3">
          <div className="text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">
            {tField(teacher as unknown as Record<string, unknown>, 'specialty', lang)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold">
            {tField(teacher as unknown as Record<string, unknown>, 'name', lang)}
          </h1>
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {tField(teacher as unknown as Record<string, unknown>, 'qualifications', lang)}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {tField(teacher as unknown as Record<string, unknown>, 'bio', lang)}
          </p>
        </div>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-bold">{lang === 'ar' ? 'الحلقات التي يشرف عليها' : 'Courses Taught'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {courses.map((c) => (
            <Card key={c.id} className="p-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm">{tField(c as unknown as Record<string, unknown>, 'title', lang)}</h3>
                <div className="text-xs text-slate-500 mt-1">{tField(c as unknown as Record<string, unknown>, 'schedule', lang)}</div>
              </div>
              <SecondaryButton className="text-xs" onClick={() => onSelectCourse(c.id)}>
                {lang === 'ar' ? 'التفاصيل' : 'View'}
              </SecondaryButton>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LevelsPage({ overview, onNavigate }: { overview: PublicOverview | null; onNavigate: (p: string) => void }) {
  const { lang } = useApp();
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold">
          {lang === 'ar' ? 'المستويات التعليمية ونظام التصنيف' : 'Academic Levels & Classification'}
        </h1>
        <p className="text-slate-600 dark:text-slate-300">
          {lang === 'ar'
            ? 'يتدرج الطالب عبر ثلاثة مسارات واضحة حسب العمر والقراءة والحفظ.'
            : 'Students progress smoothly across three structured tiers based on age and mastery.'}
        </p>
      </div>
      <div className="space-y-4">
        {(overview?.levels || []).map((lvl) => (
          <Card key={lvl.id} className="p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-mono-tabular font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                {lvl.code} · {lvl.age_range}
              </span>
            </div>
            <h2 className="text-xl font-bold">{tField(lvl as unknown as Record<string, unknown>, 'name', lang)}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {tField(lvl as unknown as Record<string, unknown>, 'description', lang)}
            </p>
            <div className="pt-3 border-t border-[#EFEAD8] dark:border-[#1D355B] text-xs text-slate-500 dark:text-slate-400">
              <strong>{lang === 'ar' ? 'معيار الانتقال: ' : 'Promotion Criteria: '}</strong>
              {tField(lvl as unknown as Record<string, unknown>, 'criteria', lang)}
            </div>
          </Card>
        ))}
      </div>
      <PrimaryButton onClick={() => onNavigate('/placement')}>
        {dict[lang].ctaPlacement}
      </PrimaryButton>
    </div>
  );
}

export function VerifyCertificatePage() {
  const { lang } = useApp();
  const [code, setCode] = useState(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('code');
    return fromQuery?.trim() || 'NB-CERT-2026-8841';
  });
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [result, setResult] = useState<{
    valid: boolean;
    error?: string;
    certificate?: {
      verification_code: string;
      title_ar: string;
      title_en: string;
      grade_label: string;
      issued_at: string;
      student_name_ar: string;
      student_name_en: string;
      course_title_ar: string;
      course_title_en: string;
    };
  } | null>(null);

  const verifyCode = useCallback(async (targetCode: string) => {
    const trimmed = targetCode.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/public/certificates/verify/${encodeURIComponent(trimmed)}`);
      if (res.status === 429) {
        setResult({
          valid: false,
          error:
            lang === 'ar'
              ? 'محاولات تحقق كثيرة جداً. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.'
              : 'Too many verification attempts. Please wait a moment and try again.',
        });
        return;
      }
      const data = await res.json().catch(() => null);
      if (!data || typeof data.valid !== 'boolean') {
        setResult({
          valid: false,
          error:
            lang === 'ar'
              ? 'تعذر التحقق من الشهادة حالياً. يرجى المحاولة لاحقاً.'
              : 'Unable to verify certificate right now. Please try again shortly.',
        });
        return;
      }
      setResult(data);
    } catch {
      setResult({
        valid: false,
        error:
          lang === 'ar'
            ? 'تعذر الاتصال بالخادم أثناء التحقق من الشهادة. تحقق من اتصالك بالإنترنت.'
            : 'Network error while verifying certificate. Please check your connection.',
      });
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('code');
    if (fromQuery?.trim()) {
      void verifyCode(fromQuery.trim());
    }
  }, [verifyCode]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyCode(code);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">
          <Award className="w-4 h-4" />
          <span>{dict[lang].verifyCert}</span>
        </div>
        <h1 className="text-3xl font-extrabold">{dict[lang].verifyCert}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {lang === 'ar'
            ? 'أدخل رقم التحقق المطبوع أسفل الشهادة للتأكد من صحتها فوراً.'
            : 'Enter the unique verification code printed on the certificate to confirm authenticity.'}
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="NB-CERT-2026-8841"
            className="flex-1 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-4 py-2.5 text-sm font-mono-tabular"
          />
          <PrimaryButton type="submit" disabled={loading}>
            <Search className="w-4 h-4" />
            <span>{lang === 'ar' ? 'تحقق الآن' : 'Verify'}</span>
          </PrimaryButton>
        </form>
      </Card>

      {result && (
        <Card className="p-6 space-y-4">
          {result.valid && result.certificate ? (
            <>
              <div className="flex items-center gap-2.5 text-[#0F766E] dark:text-[#2DD4BF] font-bold">
                <CheckCircle2 className="w-6 h-6" />
                <span>{lang === 'ar' ? 'شهادة صحيحة ومعتمدة' : 'Valid & Verified Certificate'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2 border-t border-[#EFEAD8] dark:border-[#1D355B]">
                <div>
                  <div className="text-xs text-slate-500">{lang === 'ar' ? 'الطالب' : 'Student'}</div>
                  <div className="font-bold">
                    {lang === 'ar' ? result.certificate.student_name_ar : result.certificate.student_name_en}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{lang === 'ar' ? 'التقدير' : 'Standing'}</div>
                  <div className="font-bold">{result.certificate.grade_label}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-slate-500">{lang === 'ar' ? 'الشهادة والبرنامج' : 'Certificate & Program'}</div>
                  <div className="font-bold">
                    {lang === 'ar' ? result.certificate.title_ar : result.certificate.title_en}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {lang === 'ar' ? result.certificate.course_title_ar : result.certificate.course_title_en}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">{lang === 'ar' ? 'تاريخ الإصدار' : 'Issued On'}</div>
                  <div className="font-mono-tabular">{String(result.certificate.issued_at).slice(0, 10)}</div>
                </div>
              </div>
              <div className="pt-3 border-t border-[#EFEAD8] dark:border-[#1D355B] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span dir="ltr" className="text-xs font-mono-tabular text-slate-500 break-all">
                  {getCertificateVerifyUrl(result.certificate.verification_code)}
                </span>
                <SecondaryButton
                  type="button"
                  className="text-xs shrink-0"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        getCertificateVerifyUrl(result.certificate!.verification_code)
                      );
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    } catch {
                      // Clipboard unavailable
                    }
                  }}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>
                    {copiedLink
                      ? lang === 'ar'
                        ? 'تم نسخ الرابط'
                        : 'Link Copied'
                      : lang === 'ar'
                      ? 'نسخ رابط التحقق'
                      : 'Copy Verify Link'}
                  </span>
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400 font-bold">
              <XCircle className="w-6 h-6 shrink-0" />
              <span>
                {result.error ||
                  (lang === 'ar'
                    ? 'لم يتم العثور على شهادة سارية بهذا الرقم.'
                    : 'No active certificate matches this code.')}
              </span>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

export function GamesHubPage({
  overview,
  onLaunchGame,
}: {
  overview: PublicOverview | null;
  onLaunchGame: (slug: string) => void;
}) {
  const { lang, user } = useApp();
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2 max-w-2xl">
        <h1 className="text-3xl font-extrabold">{dict[lang].gamesTitle}</h1>
        <p className="text-slate-600 dark:text-slate-300">
          {user?.role === 'student'
            ? lang === 'ar'
              ? 'أهلاً بك! كل المستويات مفتوحة لك ويتم حفظ نجومك في ملفك.'
              : 'Welcome! All levels are unlocked and your stars save automatically.'
            : lang === 'ar'
            ? 'يمكن للزوار تجربة الجولة الأولى مجاناً، وتُفتح جميع المستويات عند تسجيل دخول الطالب.'
            : 'Visitors can play sample rounds freely; full progression unlocks for enrolled students.'}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(overview?.games || []).map((g) => (
          <Card key={g.id} className="p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                <Gamepad2 className="w-4 h-4" />
                <span>{g.category === '3d_explorer' ? '3D WebGL' : '2D Interactive'}</span>
              </div>
              <h2 className="text-xl font-bold">{tField(g as unknown as Record<string, unknown>, 'title', lang)}</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {tField(g as unknown as Record<string, unknown>, 'description', lang)}
              </p>
            </div>
            <PrimaryButton className="w-full" onClick={() => onLaunchGame(g.slug)}>
              {lang === 'ar' ? 'ابدأ اللعبة' : 'Launch Game'}
            </PrimaryButton>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function InfoStaticPage({
  mode,
  legalDocs,
  onNavigate,
}: {
  mode: 'how-it-works' | 'parents' | 'faq' | 'contact' | 'terms' | 'privacy' | 'refund';
  legalDocs: LegalDocument[];
  onNavigate: (p: string) => void;
}) {
  const { lang } = useApp();

  if (mode === 'terms' || mode === 'privacy' || mode === 'refund') {
    const doc = legalDocs.find((d) => d.doc_type === mode);
    const legalContent = doc
      ? normalizeAcademyText(tField(doc as unknown as Record<string, unknown>, 'content', lang))
      : '';
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <h1 className="text-3xl font-extrabold">
          {doc ? tField(doc as unknown as Record<string, unknown>, 'title', lang) : dict[lang][mode]}
        </h1>
        {doc && (
          <div className="text-xs font-mono-tabular text-slate-500">
            {lang === 'ar' ? 'الإصدار' : 'Version'} {doc.version} · {String(doc.updated_at).slice(0, 10)}
          </div>
        )}
        <Card className="p-6 sm:p-8 whitespace-pre-line text-sm sm:text-base leading-loose text-slate-700 dark:text-slate-200">
          {legalContent}
        </Card>
        <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F2EFE6] dark:bg-[#13284A]">
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {lang === 'ar'
              ? 'للاستفسارات القانونية أو طلبات الخصوصية والتواصل الرسمي:'
              : 'For legal, privacy, or official support inquiries:'}{' '}
            <a
              href={ACADEMY_CONTACTS.mailtoUrl}
              dir="ltr"
              className="font-mono-tabular font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
            >
              {ACADEMY_CONTACTS.email}
            </a>
          </div>
          <SecondaryButton className="text-xs shrink-0" onClick={() => onNavigate('/contact')}>
            {dict[lang].contactUs}
          </SecondaryButton>
        </Card>
      </div>
    );
  }

  if (mode === 'parents') {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="text-xs font-bold text-[#C98A1E]">
              {lang === 'ar' ? 'قسم خاص بأولياء الأمور' : 'Parents & Guardians Corner'}
            </div>
            <h1 className="text-3xl font-extrabold">
              {lang === 'ar' ? 'ولي الأمر شريك في رحلة نجاح طفلك' : 'Parents Are True Partners in Your Child’s Success'}
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'مساحة تجمع أولياء الأمور لتبادل الخبرات، والاستفادة من النصائح التربوية والتعليمية، ومتابعة كل ما يساعد في تربية أبنائنا وتنمية مهاراتهم.'
                : 'A welcoming community uniting parents and guardians to exchange experiences, gain educational advice, and nurture children’s skills.'}
            </p>
          </div>
          <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-[#E5DEC9] dark:border-[#233C63]">
            <ResilientImage
              src="/assets/images/virtual_classroom.webp"
              alt={lang === 'ar' ? 'بيئة التعلم التفاعلي لأطفال أكاديمية نور وبيان' : 'Virtual Learning Classroom'}
              className="w-full h-56 object-cover"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 space-y-3">
            <BookOpen className="w-6 h-6 text-[#C98A1E]" />
            <h2 className="text-lg font-bold">
              {lang === 'ar' ? 'كيف تشجع طفلك على الحفظ والمذاكرة الهادئة؟' : 'Building a Calm Daily Study & Quran Habit'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'خصص 10 دقائق ثابتة يومياً في وقت هادئ للمراجعة السمعية مع الطفل دون ضغط أو مقارنة بغيره، مع مكافأة الجهد بالثناء الهادئ.'
                : 'Dedicate 10 consistent minutes daily at a calm hour for gentle listening and review without comparison.'}
            </p>
          </Card>
          <Card className="p-6 space-y-3">
            <Award className="w-6 h-6 text-[#0F766E] dark:text-[#2DD4BF]" />
            <h2 className="text-lg font-bold">
              {lang === 'ar' ? 'متابعة التقارير الأسبوعية والخطط الفردية' : 'Weekly Evaluations & Personal Plans'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'نركز في تقييماتنا على جودة النطق والانضباط السلوكي والمشاركة وتنمية المهارات العقلية واللغوية، مع متابعة مستمرة مع ولي الأمر.'
                : 'Our evaluations measure pronunciation clarity, respectful conduct, active participation, and steady skill development.'}
            </p>
          </Card>
        </div>

        <Card className="p-6 bg-[#F2EFE6] dark:bg-[#13284A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-extrabold text-lg">
              {lang === 'ar' ? 'نور وبيان — لأن مستقبل أبنائنا يستحق الأفضل' : 'Noor & Bayan — Because Our Children Deserve the Best'}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {lang === 'ar' ? 'نعلّم بشغف.. نطوّر بتميز.. ونبني مستقبلاً مشرقاً.' : 'We teach with passion.. We nurture with excellence.'}
            </div>
          </div>
          <PrimaryButton onClick={() => onNavigate('/apply')}>{dict[lang].ctaApply}</PrimaryButton>
        </Card>
      </div>
    );
  }

  if (mode === 'how-it-works') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <h1 className="text-3xl font-extrabold">{dict[lang].howTitle}</h1>
        <Card className="p-6 sm:p-8 space-y-4 text-sm sm:text-base leading-relaxed text-slate-700 dark:text-slate-200">
          <p>{lang === 'ar' ? '١. يبدأ ولي الأمر باختبار تحديد المستوى أو تقديم طلب التحاق مباشر.' : '1. Begin with the placement test or submit an admission application.'}</p>
          <p>{lang === 'ar' ? '٢. يراجع مدير الأكاديمية الطلب، ويتم ربط حساب الطالب بالحلقة والمعلم المناسبين.' : '2. Our director reviews the application and matches your child with a certified teacher.'}</p>
          <p>{lang === 'ar' ? '٣. يدخل الطالب لوحة التحكم ليجد جدول الحصص وروابط البث المباشر والألعاب التعليمية.' : '3. Students sign in to access class links, schedules, and learning games.'}</p>
          <p>{lang === 'ar' ? '٤. يسجل المعلم الحضور والتسميع والتقييم بعد كل حصة بشفافية تامة.' : '4. Teachers record attendance, recitation scores, and qualitative notes after each session.'}</p>
        </Card>
        <PrimaryButton onClick={() => onNavigate('/placement')}>{dict[lang].ctaPlacement}</PrimaryButton>
      </div>
    );
  }

  if (mode === 'contact') {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold">{dict[lang].contactUs}</h1>
          <p className="text-slate-600 dark:text-slate-300">
            {lang === 'ar'
              ? 'فريق الإشراف الأكاديمي وخدمة أولياء الأمور جاهز للرد على استفساراتكم ومساعدتكم في اختيار المسار التعليمي الأنسب.'
              : 'Our academic care team is ready to answer your questions and help choose the right learning track.'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <WhatsAppBrandIcon className="w-8 h-8 shrink-0" />
              <h2 className="text-lg font-bold text-[#0F213E] dark:text-[#F8F5EC]">
                {lang === 'ar' ? 'التواصل السريع عبر واتساب' : 'Direct WhatsApp Support'}
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'استفسر مباشرة عن المواعيد المتاحة، برامج القرآن واللغات والمناهج وتنمية المهارات وتحديد المستوى.'
                : 'Ask directly about schedules, Quran, languages, curricula, skill tracks, and placement.'}
            </p>
            <div dir="ltr" className="font-mono-tabular text-sm font-bold text-[#0F213E] dark:text-[#F8F5EC]">
              {ACADEMY_CONTACTS.whatsappDisplay}
            </div>
            <a
              href={ACADEMY_CONTACTS.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-[#0F766E] hover:bg-[#0D625B] text-white transition-colors"
            >
              <span>{lang === 'ar' ? 'راسلنا على واتساب' : 'Chat on WhatsApp'}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <GmailBrandIcon className="w-8 h-8 shrink-0" />
              <h2 className="text-lg font-bold text-[#0F213E] dark:text-[#F8F5EC]">
                {lang === 'ar' ? 'البريد الإلكتروني الرسمي' : 'Official Email'}
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'للمراسلات الإدارية، متابعة الشهادات المعتمدة، أو طلبات انضمام المعلمين.'
                : 'For administrative inquiries, certificate support, or teaching applications.'}
            </p>
            <div dir="ltr" className="font-mono-tabular text-sm font-bold text-[#0F213E] dark:text-[#F8F5EC]">
              {ACADEMY_CONTACTS.email}
            </div>
            <a
              href={ACADEMY_CONTACTS.mailtoUrl}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-[#EFEAD8] hover:bg-[#E5DEC9] dark:bg-[#162C4E] dark:hover:bg-[#1F3A66] text-[#0F213E] dark:text-white transition-colors"
            >
              <span>{lang === 'ar' ? 'إرسال رسالة بريدية' : 'Send Email'}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <FacebookBrandIcon className="w-8 h-8 shrink-0" />
              <h2 className="text-lg font-bold text-[#0F213E] dark:text-[#F8F5EC]">
                {lang === 'ar' ? 'صفحة فيسبوك الرسمية' : 'Official Facebook Page'}
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'تابع أحدث إعلانات الدورات واللغات والمناهج الدولية وأنشطة وتكريمات طلابنا.'
                : 'Follow our latest course announcements, student spotlights, and parent tips.'}
            </p>
            <a
              href={ACADEMY_CONTACTS.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-[#1877F2] hover:bg-[#1465D1] text-white transition-colors"
            >
              <span>{lang === 'ar' ? 'زيارة صفحة فيسبوك' : 'Visit Facebook Page'}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <YouTubeBrandIcon className="w-8 h-8 shrink-0" />
              <h2 className="text-lg font-bold text-[#0F213E] dark:text-[#F8F5EC]">
                {lang === 'ar' ? 'قناة يوتيوب الرسمية' : 'Official YouTube Channel'}
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'شاهد نماذج من الحصص التفاعلية، شروحات اللغات والحساب الذهني والنطق والتلاوة.'
                : 'Watch interactive class previews, language tips, mental math, and recitation videos.'}
            </p>
            <a
              href={ACADEMY_CONTACTS.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold bg-[#DC2626] hover:bg-[#B91C1C] text-white transition-colors"
            >
              <span>{lang === 'ar' ? 'مشاهدة قناة يوتيوب' : 'Watch on YouTube'}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </Card>
        </div>

        <Card className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F2EFE6] dark:bg-[#13284A]">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-[#C98A1E] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-sm">
                {lang === 'ar' ? 'ساعات عمل الإشراف والدعم' : 'Support Hours'}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {lang === 'ar'
                  ? 'السبت إلى الخميس — من الساعة ٩ صباحاً حتى ٩ مساءً بتوقيت القاهرة'
                  : 'Saturday – Thursday, 9:00 AM – 9:00 PM (Cairo Time)'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => onNavigate('/placement')}>
              {dict[lang].ctaPlacement}
            </SecondaryButton>
            <PrimaryButton onClick={() => onNavigate('/apply')}>
              {dict[lang].ctaApply}
            </PrimaryButton>
          </div>
        </Card>
      </div>
    );
  }

  const faqItems = [
    {
      qAr: 'ما البرامج والفئات العمرية المناسبة للالتحاق بأكاديمية نور وبيان؟',
      aAr: 'تستقبل الأكاديمية الطلاب من عمر ٤ سنوات وحتى ١٨ عاماً عبر مسارات شاملة تشمل القرآن الكريم والعلوم الإسلامية، وتأسيس نور البيان واللغة العربية، واللغات، وجميع المواد الدراسية والمناهج الدولية، إلى جانب الحساب الذهني وتنمية المهارات وتعديل النطق.',
      qEn: 'Which programs and age groups can enroll at Noor & Bayan Academy?',
      aEn: 'We welcome learners aged 4 to 18 across comprehensive tracks: Quran & Islamic studies, Noor Al-Bayan & Arabic, world languages, school subjects & international curricula, mental math, and speech/skill development.',
    },
    {
      qAr: 'كيف يتم تحديد المستوى المناسب لطفلي قبل بدء الحصص؟',
      aAr: 'يمكنك إجراء اختبار تحديد المستوى المجاني عبر المنصة خلال دقائق، ثم يراجع المشرف التربوي النتيجة ويوجه الطالب للحلقة الأنسب له.',
      qEn: 'How is my child placed into the right learning level?',
      aEn: 'Complete the free placement assessment online in minutes, and our academic supervisor assigns your child to the matching circle.',
    },
    {
      qAr: 'كيف يتابع ولي الأمر حضور الطفل ومستواه في التسميع؟',
      aAr: 'يتوفر لولي الأمر حساب خاص يتيح متابعة سجل الحضور لكل حصة، درجات التسميع والتجويد، نتائج الاختبارات، وتقارير السلوك والمشاركة لحظياً.',
      qEn: 'How can parents monitor attendance and recitation progress?',
      aEn: 'Each guardian receives a dedicated dashboard showing live session attendance, Tajweed & memorization scores, exam grades, and teacher evaluations.',
    },
    {
      qAr: 'هل الشهادات الصادرة عن الأكاديمية موثقة؟',
      aAr: 'نعم، تحمل كل شهادة رمز تحقق فريد ورمز استجابة سريعة (QR) يتيح التحقق الفوري من صحتها عبر صفحة التحقق الرسمية في الموقع.',
      qEn: 'Are academy certificates officially verifiable?',
      aEn: 'Yes. Every certificate includes a unique verification code and QR code for instant authenticity verification on our website.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold">{dict[lang].faqTitle}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {lang === 'ar'
            ? 'إجابات سريعة على أكثر أسئلة أولياء الأمور شيوعاً.'
            : 'Quick answers to the most common parent and student questions.'}
        </p>
      </div>

      <div className="space-y-4">
        {faqItems.map((item, idx) => (
          <Card key={idx} className="p-5 sm:p-6 space-y-2">
            <h2 className="font-bold text-base text-[#0F213E] dark:text-white">
              {lang === 'ar' ? item.qAr : item.qEn}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar' ? item.aAr : item.aEn}
            </p>
          </Card>
        ))}
      </div>

      <Card className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="font-bold text-sm">
            {lang === 'ar' ? 'لديك استفسار آخر؟' : 'Have another question?'}
          </div>
          <div dir="ltr" className="text-xs text-slate-500 font-mono-tabular">
            {ACADEMY_CONTACTS.email} · {ACADEMY_CONTACTS.whatsappDisplay}
          </div>
        </div>
        <PrimaryButton onClick={() => onNavigate('/contact')}>
          {dict[lang].contactUs}
        </PrimaryButton>
      </Card>
    </div>
  );
}
