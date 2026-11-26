import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, ExternalLink, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { buildGoogleOAuthPopupRequest, isBrowserSupabaseConfigured, waitForGoogleOAuthToken } from '../../lib/supabase';
import { tField } from '../../i18n/translations';
import type { Course, Level } from '../../types';
import { Card, PrimaryButton, SecondaryButton } from '../../components/ui/CommonUI';
import { PhoneInputWithCode } from '../../components/ui/PhoneInputWithCode';
import { TurnstileWidget } from '../../components/ui/TurnstileWidget';

const studentAdmissionSchema = z
  .object({
    student_name: z.string().min(2),
    student_age: z.coerce.number().min(3).max(22),
    student_email: z.string().email(),
    student_password: z.string().min(8),
    confirm_student_password: z.string().min(8),
    guardian_name: z.string().min(2),
    guardian_email: z.string().email(),
    guardian_phone: z.string().min(6),
    preferred_course_id: z.string().optional(),
    recommended_level_id: z.string().optional(),
    notes: z.string().optional(),
    consent_accepted: z.boolean().refine((v) => v === true),
  })
  .refine((data) => data.student_password === data.confirm_student_password, {
    path: ['confirm_student_password'],
    message: 'Passwords do not match',
  });

type StudentAdmissionValues = z.infer<typeof studentAdmissionSchema>;

export function AdmissionPage({
  courses,
  levels,
  preselectedCourseId,
  preselectedLevelId,
  onNavigate,
}: {
  courses: Course[];
  levels: Level[];
  preselectedCourseId?: number | null;
  preselectedLevelId?: number | null;
  onNavigate: (path: string) => void;
}) {
  const { lang, toast } = useApp();
  const [submittedInfo, setSubmittedInfo] = useState<{ id: number; email: string } | null>(null);
  const [googlePrefillLoading, setGooglePrefillLoading] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [blockedOAuthUrl, setBlockedOAuthUrl] = useState<string | null>(null);
  const [showStudentPass, setShowStudentPass] = useState(false);
  const [showStudentConfirm, setShowStudentConfirm] = useState(false);
  const [sameEmailForGuardian, setSameEmailForGuardian] = useState(true);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const googleEnabled = isBrowserSupabaseConfigured();

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { turnstileEnabled?: boolean; turnstileSiteKey?: string | null }) => {
        if (d.turnstileEnabled && d.turnstileSiteKey) {
          setTurnstileSiteKey(d.turnstileSiteKey);
        }
      })
      .catch(() => {});
  }, []);

  const studentForm = useForm<StudentAdmissionValues>({
    resolver: zodResolver(studentAdmissionSchema) as never,
    defaultValues: {
      student_age: 8,
      preferred_course_id: preselectedCourseId ? String(preselectedCourseId) : courses[0] ? String(courses[0].id) : '',
      recommended_level_id: preselectedLevelId ? String(preselectedLevelId) : levels[0] ? String(levels[0].id) : '',
      consent_accepted: false,
    },
  });

  useEffect(() => {
    if (!studentForm.getValues('preferred_course_id') && (preselectedCourseId || courses[0])) {
      studentForm.setValue('preferred_course_id', String(preselectedCourseId || courses[0].id));
    }
    if (!studentForm.getValues('recommended_level_id') && (preselectedLevelId || levels[0])) {
      studentForm.setValue('recommended_level_id', String(preselectedLevelId || levels[0].id));
    }
  }, [courses, levels, preselectedCourseId, preselectedLevelId, studentForm]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('nb_google_prefill');
      if (!raw) return;
      sessionStorage.removeItem('nb_google_prefill');
      const parsed = JSON.parse(raw) as { email?: string; full_name?: string };
      if (parsed.email && !studentForm.getValues('student_email')) studentForm.setValue('student_email', parsed.email);
      if (parsed.full_name && !studentForm.getValues('student_name')) studentForm.setValue('student_name', parsed.full_name);
    } catch {
      // ignore
    }
  }, [studentForm]);

  const watchedStudentEmail = studentForm.watch('student_email');
  useEffect(() => {
    if (sameEmailForGuardian && watchedStudentEmail !== undefined) {
      studentForm.setValue('guardian_email', watchedStudentEmail, {
        shouldValidate: Boolean(watchedStudentEmail),
      });
    }
  }, [sameEmailForGuardian, watchedStudentEmail, studentForm]);

  const handleGooglePrefill = async () => {
    setGooglePrefillLoading(true);
    setBlockedOAuthUrl(null);
    const popup = window.open('about:blank', 'nb_google_oauth', 'width=520,height=680');
    try {
      const { state, url } = await buildGoogleOAuthPopupRequest();
      if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        setBlockedOAuthUrl(url);
      }
      const accessToken = await waitForGoogleOAuthToken(state, popup);
      setBlockedOAuthUrl(null);
      setGoogleAccessToken(accessToken);
      const res = await apiFetch<{ status: string; googleProfile: { email: string; full_name: string } }>(
        '/api/auth/google',
        {
          method: 'POST',
          body: JSON.stringify({ access_token: accessToken, intent: 'prefill' }),
        }
      );
      if (res.googleProfile?.email) studentForm.setValue('student_email', res.googleProfile.email, { shouldValidate: true });
      if (res.googleProfile?.full_name) studentForm.setValue('student_name', res.googleProfile.full_name, { shouldValidate: true });
      toast(lang === 'ar' ? 'تمت تعبئة الاسم والبريد من حساب Google' : 'Filled name and email from Google', 'success');
    } catch (err: unknown) {
      if (popup && !popup.closed) {
        try {
          popup.close();
        } catch {
          // ignore
        }
      }
      toast(err instanceof Error ? err.message : 'Unable to fetch Google profile', 'error');
    } finally {
      setGooglePrefillLoading(false);
    }
  };

  const onSubmitStudent = async (values: StudentAdmissionValues) => {
    if (turnstileSiteKey && !turnstileToken) {
      toast(lang === 'ar' ? 'يرجى إتمام التحقق الأمني أولاً' : 'Please complete the security verification first', 'error');
      return;
    }
    try {
      const res = await apiFetch<{ id: number; student_email: string }>('/api/public/admissions', {
        method: 'POST',
        body: JSON.stringify({
          student_name: values.student_name,
          student_age: values.student_age,
          student_email: values.student_email,
          student_password: values.student_password,
          guardian_name: values.guardian_name,
          guardian_email: values.guardian_email,
          guardian_phone: values.guardian_phone,
          preferred_course_id: values.preferred_course_id ? Number(values.preferred_course_id) : null,
          recommended_level_id: values.recommended_level_id ? Number(values.recommended_level_id) : null,
          notes: values.notes,
          consent_accepted: values.consent_accepted,
          ...(googleAccessToken ? { google_access_token: googleAccessToken } : {}),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      setSubmittedInfo({ id: res.id, email: res.student_email || values.student_email });
      toast(lang === 'ar' ? 'تم استلام طلب التحاق الطالب بنجاح!' : 'Student admission request received!', 'success');
    } catch (err: unknown) {
      setTurnstileResetKey((n) => n + 1);
      toast(err instanceof Error ? err.message : 'Submission error', 'error');
    }
  };

  if (submittedInfo) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <Card className="p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-[#0F766E] dark:text-[#2DD4BF] mx-auto" />
          <h1 className="text-2xl font-extrabold">
            {lang === 'ar' ? 'تم تسجيل طلب التحاق الطالب وحفظ بيانات دخوله' : 'Student Application & Credentials Saved'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {lang === 'ar'
              ? `رقم الطلب المرجعي: #${submittedInfo.id}. الحساب (${submittedInfo.email}) قيد المراجعة الآن — وفور موافقة مدير الأكاديمية ستتمكن من تسجيل الدخول فوراً بنفس البريد وكلمة المرور التي أدخلتها، كما سيحصل ولي الأمر على كود الطالب لربط حسابه.`
              : `Reference #${submittedInfo.id}. Your account (${submittedInfo.email}) is awaiting admin approval. Once approved, you can sign in immediately with your chosen email and password.`}
          </p>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <PrimaryButton onClick={() => onNavigate('/login')}>
              {lang === 'ar' ? 'الذهاب لبوابة الدخول' : 'Go to Sign In'}
            </PrimaryButton>
            <SecondaryButton onClick={() => onNavigate('/')}>
              {lang === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}
            </SecondaryButton>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold">
          {lang === 'ar' ? 'تقديم طلب التحاق طالب جديد' : 'Student Admission Application'}
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
          {lang === 'ar'
            ? 'حدّد البريد وكلمة المرور لحساب الطالب مع بيانات ولي الأمر؛ وبمجرد موافقة الإدارة يُفعّل الحساب فوراً.'
            : 'Set the student login email and password alongside guardian details; activation occurs immediately upon approval.'}
        </p>
      </div>

      <Card className="p-6 sm:p-8 space-y-5">
        {googleEnabled && (
          <div className="p-3.5 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {lang === 'ar'
                ? 'يمكنك تعبئة الاسم والبريد الإلكتروني لحساب الدخول من Google تلقائياً:'
                : 'Fill name & verified account email from Google in one click:'}
            </div>
            <button
              type="button"
              disabled={googlePrefillLoading}
              onClick={handleGooglePrefill}
              className="inline-flex items-center gap-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3.5 py-2 text-xs font-bold hover:bg-[#F2EFE6] dark:hover:bg-[#13284A] cursor-pointer disabled:opacity-60"
            >
              <span>
                {googlePrefillLoading
                  ? lang === 'ar' ? 'بانتظار Google...' : 'Waiting...'
                  : lang === 'ar' ? 'تعبئة من حساب Google' : 'Fill with Google'}
              </span>
            </button>
            {blockedOAuthUrl && (
              <a
                href={blockedOAuthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center gap-1.5 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'افتح نافذة Google للمصادقة' : 'Open Google Sign-In'}</span>
              </a>
            )}
          </div>
        )}

        <form onSubmit={studentForm.handleSubmit(onSubmitStudent)} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold">{lang === 'ar' ? 'اسم الطالب بالكامل *' : 'Student Full Name *'}</label>
                <input
                  {...studentForm.register('student_name')}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                />
                {studentForm.formState.errors.student_name && (
                  <p className="text-xs text-red-600">{lang === 'ar' ? 'يرجى إدخال اسم الطالب' : 'Student name is required'}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold">{lang === 'ar' ? 'عمر الطالب (3–22) *' : 'Student Age (3–22) *'}</label>
                <input
                  type="number"
                  {...studentForm.register('student_age')}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm tabular-nums"
                />
                {studentForm.formState.errors.student_age && (
                  <p className="text-xs text-red-600">{lang === 'ar' ? 'يرجى إدخال عمر صحيح (3 إلى 22 سنة)' : 'Valid age (3-22) is required'}</p>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-[#0F766E]/30 bg-[#0F766E]/5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#0F766E] dark:text-[#2DD4BF]">
                <ShieldCheck className="w-4 h-4" />
                <span>{lang === 'ar' ? 'بيانات حساب دخول الطالب (تُفعّل فور القبول)' : 'Student Portal Login Credentials (activated on approval)'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'البريد الإلكتروني لدخول الطالب *' : 'Student Login Email *'}</label>
                  <input
                    type="email"
                    dir="ltr"
                    {...studentForm.register('student_email')}
                    placeholder="student@example.com"
                    className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                  />
                  <p className="text-[11px] text-slate-500">
                    {lang === 'ar'
                      ? 'يمكن استخدام نفس البريد الإلكتروني لحساب ولي الأمر أيضاً، مع تخصيص كلمة مرور مستقلة وبوابة دخول خاصة بكل منهما.'
                      : 'You can share this email with the Guardian portal; each portal keeps its own independent password.'}
                  </p>
                  {studentForm.formState.errors.student_email && (
                    <p className="text-xs text-red-600">
                      {lang === 'ar'
                        ? 'يرجى إدخال بريد إلكتروني صحيح للطالب'
                        : 'Please enter a valid student email address'}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'كلمة مرور الطالب (8+ أحرف) *' : 'Student Password (8+ chars) *'}</label>
                  <div className="relative">
                    <input
                      type={showStudentPass ? 'text' : 'password'}
                      dir="ltr"
                      autoComplete="new-password"
                      {...studentForm.register('student_password')}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] pl-3.5 pr-10 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStudentPass((v) => !v)}
                      aria-label={showStudentPass ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
                    >
                      {showStudentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {studentForm.formState.errors.student_password && (
                    <p className="text-xs text-red-600">{lang === 'ar' ? 'كلمة المرور 8 أحرف على الأقل' : 'Minimum 8 characters required'}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'تأكيد كلمة مرور الطالب *' : 'Confirm Student Password *'}</label>
                  <div className="relative">
                    <input
                      type={showStudentConfirm ? 'text' : 'password'}
                      dir="ltr"
                      autoComplete="new-password"
                      {...studentForm.register('confirm_student_password')}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] pl-3.5 pr-10 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStudentConfirm((v) => !v)}
                      aria-label={showStudentConfirm ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
                    >
                      {showStudentConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {studentForm.formState.errors.confirm_student_password && (
                    <p className="text-xs text-red-600">{lang === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold">{lang === 'ar' ? 'اسم ولي الأمر *' : 'Guardian Name *'}</label>
                <input
                  {...studentForm.register('guardian_name')}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                />
                {studentForm.formState.errors.guardian_name && (
                  <p className="text-xs text-red-600">{lang === 'ar' ? 'يرجى إدخال اسم ولي الأمر' : 'Guardian name is required'}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold">{lang === 'ar' ? 'رقم الواتساب / الهاتف *' : 'WhatsApp / Phone *'}</label>
                <Controller
                  name="guardian_phone"
                  control={studentForm.control}
                  render={({ field }) => (
                    <PhoneInputWithCode
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      required
                      placeholder="1012345678"
                    />
                  )}
                />
                {studentForm.formState.errors.guardian_phone && (
                  <p className="text-xs text-red-600">{lang === 'ar' ? 'يرجى إدخال رقم هاتف صحيح' : 'Valid phone required'}</p>
                )}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sameEmailForGuardian}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSameEmailForGuardian(checked);
                      if (checked) {
                        studentForm.setValue('guardian_email', studentForm.getValues('student_email') || '', {
                          shouldValidate: true,
                        });
                      }
                    }}
                    className="accent-[#0F766E]"
                  />
                  <span>
                    {lang === 'ar'
                      ? 'استخدام نفس البريد الإلكتروني للطالب وولي الأمر (ببوابة وكلمة مرور مستقلة لولي الأمر لاحقاً)'
                      : 'Use the same email for Student & Guardian (separate password per portal)'}
                  </span>
                </label>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'البريد الإلكتروني لولي الأمر (للتفعيل بكود الطالب لاحقاً) *' : 'Guardian Email (for Student Code linking) *'}</label>
                  <input
                    type="email"
                    dir="ltr"
                    readOnly={sameEmailForGuardian}
                    {...studentForm.register('guardian_email')}
                    placeholder="parent@example.com"
                    className={`w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] px-3.5 py-2.5 text-sm ${
                      sameEmailForGuardian
                        ? 'bg-[#F2EFE6] dark:bg-[#13284A] opacity-80'
                        : 'bg-[#FAF8F3] dark:bg-[#091529]'
                    }`}
                  />
                  {studentForm.formState.errors.guardian_email && (
                    <p className="text-xs text-red-600">{lang === 'ar' ? 'بريد إلكتروني غير صالح' : 'Valid email required'}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold">{lang === 'ar' ? 'المستوى المناسب' : 'Preferred Level'}</label>
                <select
                  {...studentForm.register('recommended_level_id')}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                >
                  {levels.map((lvl) => (
                    <option key={lvl.id} value={String(lvl.id)}>
                      {tField(lvl as unknown as Record<string, unknown>, 'name', lang)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold">{lang === 'ar' ? 'الحلقة المفضلة' : 'Preferred Course'}</label>
                <select
                  {...studentForm.register('preferred_course_id')}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {tField(c as unknown as Record<string, unknown>, 'title', lang)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'ملاحظات إضافية حول مستوى الطالب' : 'Additional Notes'}</label>
              <textarea
                rows={3}
                {...studentForm.register('notes')}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
            </div>

            <div className="pt-1 space-y-1">
              <label className="flex items-start gap-2.5 text-xs sm:text-sm cursor-pointer">
                <input type="checkbox" {...studentForm.register('consent_accepted')} className="mt-1 accent-[#0F766E]" />
                <span>
                  {lang === 'ar' ? 'أوافق على ' : 'I agree to the '}
                  <button type="button" onClick={() => onNavigate('/legal/terms')} className="underline text-[#0F766E] dark:text-[#2DD4BF] cursor-pointer">
                    {lang === 'ar' ? 'الشروط والأحكام' : 'Terms & Conditions'}
                  </button>
                  {lang === 'ar' ? ' و' : ' & '}
                  <button type="button" onClick={() => onNavigate('/legal/privacy')} className="underline text-[#0F766E] dark:text-[#2DD4BF] cursor-pointer">
                    {lang === 'ar' ? 'سياسة الخصوصية وحماية الطفل' : 'Privacy Policy'}
                  </button>
                </span>
              </label>
              {studentForm.formState.errors.consent_accepted && (
                <p className="text-xs text-red-600">{lang === 'ar' ? 'الموافقة على الشروط والخصوصية مطلوبة' : 'Consent is required'}</p>
              )}
            </div>

            <TurnstileWidget
              siteKey={turnstileSiteKey}
              onToken={setTurnstileToken}
              resetKey={turnstileResetKey}
            />

            <PrimaryButton type="submit" disabled={studentForm.formState.isSubmitting}>
              {studentForm.formState.isSubmitting
                ? lang === 'ar' ? 'جاري إرسال الطلب...' : 'Submitting...'
                : lang === 'ar' ? 'إرسال طلب التحاق الطالب' : 'Submit Student Application'}
            </PrimaryButton>
          </form>
      </Card>
    </div>
  );
}
