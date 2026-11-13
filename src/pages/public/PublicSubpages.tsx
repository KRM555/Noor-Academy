import React, { useEffect, useState } from 'react';
import { Award, Search, CheckCircle2, XCircle, Gamepad2, PhoneCall, Mail, BookOpen } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { dict, tField } from '../../i18n/translations';
import type { Course, LegalDocument, PublicOverview, Teacher } from '../../types';
import { Card, PrimaryButton, SecondaryButton, ResilientImage, LoadingState } from '../../components/ui/CommonUI';
import { getCourseImageUrl } from '../../lib/courseImages';

export function CoursesPage({
  courses,
  onSelectCourse,
  onApplyCourse,
}: {
  courses: Course[];
  onSelectCourse: (id: number) => void;
  onApplyCourse: (id: number) => void;
}) {
  const { lang } = useApp();
  const t = dict[lang];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 space-y-2">
          <h1 className="text-3xl font-extrabold">{t.coursesTitle}</h1>
          <p className="text-slate-600 dark:text-slate-300">{t.coursesSubtitle}</p>
        </div>
        <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-[#E5DEC9] dark:border-[#233C63]">
          <ResilientImage
            src="/assets/images/academy_banner.webp"
            alt={t.brandFull}
            className="w-full h-44 object-cover"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((c) => (
          <Card key={c.id} className="overflow-hidden flex flex-col justify-between">
            <div>
              <div className="aspect-[16/10] bg-[#F2EFE6] dark:bg-[#13284A]">
                <ResilientImage
                  src={getCourseImageUrl(c.title_ar)}
                  alt={tField(c as unknown as Record<string, unknown>, 'title', lang)}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 pb-2 space-y-2.5">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {tField(c as unknown as Record<string, unknown>, 'level_name', lang)} · {tField(c as unknown as Record<string, unknown>, 'teacher_name', lang)}
                </div>
                <h2 className="text-lg font-bold">{tField(c as unknown as Record<string, unknown>, 'title', lang)}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {tField(c as unknown as Record<string, unknown>, 'description', lang)}
                </p>
              </div>
            </div>
            <div className="p-6 pt-4 border-t border-[#EFEAD8] dark:border-[#1D355B] space-y-3 mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{tField(c as unknown as Record<string, unknown>, 'schedule', lang)}</span>
                <span className="text-base font-extrabold text-[#0F213E] dark:text-[#F8F5EC] tabular-nums">
                  {c.price_monthly} {t.monthlyCurrency}
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
  const [data, setData] = useState<{
    course: Course & { age_range?: string; teacher_qualifications_ar?: string; teacher_qualifications_en?: string };
    lessons: Array<{ id: number; title_ar: string; title_en: string; lesson_date: string; duration_min: number; objectives_ar: string; objectives_en: string }>;
  } | null>(null);

  useEffect(() => {
    apiFetch(`/api/public/courses/${courseId}`).then((d) => setData(d as never)).catch(() => {});
  }, [courseId]);

  if (!data) return <div className="max-w-5xl mx-auto px-4 py-12"><LoadingState /></div>;
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
              src={getCourseImageUrl(course.title_ar)}
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
                <div className="text-xs text-slate-500">{lang === 'ar' ? 'المعلم' : 'Instructor'}</div>
                <div className="font-bold">{tField(course as unknown as Record<string, unknown>, 'teacher_name', lang)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{lang === 'ar' ? 'المواعيد' : 'Schedule'}</div>
                <div className="font-bold">{tField(course as unknown as Record<string, unknown>, 'schedule', lang)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">{lang === 'ar' ? 'الرسوم الشهرية' : 'Monthly Fee'}</div>
                <div className="font-extrabold tabular-nums">{course.price_monthly} {dict[lang].monthlyCurrency}</div>
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
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2 max-w-2xl">
        <h1 className="text-3xl font-extrabold">{dict[lang].teachersTitle}</h1>
        <p className="text-slate-600 dark:text-slate-300">{dict[lang].teachersSubtitle}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {teachers.map((t) => (
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
  const [data, setData] = useState<{ teacher: Teacher; courses: Course[] } | null>(null);

  useEffect(() => {
    apiFetch(`/api/public/teachers/${teacherId}`).then((d) => setData(d as never)).catch(() => {});
  }, [teacherId]);

  if (!data) return <div className="max-w-5xl mx-auto px-4 py-12"><LoadingState /></div>;
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
  const [code, setCode] = useState('NB-CERT-2026-8841');
  const [loading, setLoading] = useState(false);
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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/public/certificates/verify/${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
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
            </>
          ) : (
            <div className="flex items-center gap-2.5 text-red-600 dark:text-red-400 font-bold">
              <XCircle className="w-6 h-6" />
              <span>
                {lang === 'ar' ? 'لم يتم العثور على شهادة سارية بهذا الرقم.' : 'No active certificate matches this code.'}
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
  mode: 'how-it-works' | 'parents' | 'faq' | 'terms' | 'privacy' | 'refund';
  legalDocs: LegalDocument[];
  onNavigate: (p: string) => void;
}) {
  const { lang } = useApp();

  if (mode === 'terms' || mode === 'privacy' || mode === 'refund') {
    const doc = legalDocs.find((d) => d.doc_type === mode);
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
          {doc ? tField(doc as unknown as Record<string, unknown>, 'content', lang) : ''}
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
              {lang === 'ar' ? 'قسم خاص بالأمهات وأولياء الأمور' : 'Mothers & Parents Corner'}
            </div>
            <h1 className="text-3xl font-extrabold">
              {lang === 'ar' ? 'أنتِ شريكة في رحلة نجاح طفلك' : 'You Are a Partner in Your Child’s Success'}
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'مجتمع يجمع الأمهات لتبادل الخبرات، والاستفادة من النصائح التربوية والتعليمية، ومناقشة كل ما يساعد في تربية أطفالنا وتنمية مهاراتهم.'
                : 'A welcoming community uniting mothers to exchange experiences, gain educational and parenting advice, and nurture children’s skills.'}
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
              {lang === 'ar' ? 'كيف تشجعين طفلك على الحفظ والمذاكرة الهادئة؟' : 'Building a Calm Daily Study & Quran Habit'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'خصصي 10 دقائق ثابتة يومياً قبل النوم أو بعد العصر للمراجعة السمعية مع الطفل دون ضغط أو مقارنة بغيره، مع مكافأة الجهد بالثناء الهادئ.'
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
                ? 'نركز في تقييماتنا على جودة النطق والانضباط السلوكي والمشاركة وتنمية المهارات العقلية واللغوية، مع متابعة مستمرة مع الأم.'
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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <h1 className="text-3xl font-extrabold">{dict[lang].faqTitle} &amp; {dict[lang].contactUs}</h1>
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <PhoneCall className="w-5 h-5 text-[#0F766E] dark:text-[#2DD4BF]" />
          <span className="font-mono-tabular text-sm">WhatsApp: +20 100 555 0199</span>
        </div>
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-[#C98A1E]" />
          <span className="font-mono-tabular text-sm">care@noorbayan.academy</span>
        </div>
      </Card>
    </div>
  );
}
