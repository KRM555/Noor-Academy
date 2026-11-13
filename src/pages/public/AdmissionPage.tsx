import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { tField } from '../../i18n/translations';
import type { Course, Level } from '../../types';
import { Card, PrimaryButton } from '../../components/ui/CommonUI';

const admissionSchema = z.object({
  student_name: z.string().min(2),
  student_age: z.coerce.number().min(3).max(22),
  guardian_name: z.string().min(2),
  guardian_email: z.string().email(),
  guardian_phone: z.string().min(6),
  preferred_course_id: z.string().optional(),
  recommended_level_id: z.string().optional(),
  notes: z.string().optional(),
  consent_accepted: z.boolean().refine((v) => v === true),
});

type AdmissionFormValues = z.infer<typeof admissionSchema>;

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
  const [submittedId, setSubmittedId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<AdmissionFormValues>({
    resolver: zodResolver(admissionSchema) as never,
    defaultValues: {
      student_age: 8,
      preferred_course_id: preselectedCourseId ? String(preselectedCourseId) : courses[0] ? String(courses[0].id) : '',
      recommended_level_id: preselectedLevelId ? String(preselectedLevelId) : levels[0] ? String(levels[0].id) : '',
      consent_accepted: false,
    },
  });

  useEffect(() => {
    if (!getValues('preferred_course_id') && (preselectedCourseId || courses[0])) {
      setValue('preferred_course_id', String(preselectedCourseId || courses[0].id));
    }
    if (!getValues('recommended_level_id') && (preselectedLevelId || levels[0])) {
      setValue('recommended_level_id', String(preselectedLevelId || levels[0].id));
    }
  }, [courses, levels, preselectedCourseId, preselectedLevelId, getValues, setValue]);

  const onSubmit = async (values: AdmissionFormValues) => {
    try {
      const res = await apiFetch<{ id: number }>('/api/public/admissions', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          preferred_course_id: values.preferred_course_id ? Number(values.preferred_course_id) : null,
          recommended_level_id: values.recommended_level_id ? Number(values.recommended_level_id) : null,
        }),
      });
      setSubmittedId(res.id);
      toast(lang === 'ar' ? 'تم استلام طلب التقديم بنجاح!' : 'Admission request received!', 'success');
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Submission error', 'error');
    }
  };

  if (submittedId) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <Card className="p-8 text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-[#0F766E] dark:text-[#2DD4BF] mx-auto" />
          <h1 className="text-2xl font-extrabold">
            {lang === 'ar' ? 'تم تسجيل طلب الانضمام بنجاح' : 'Application Submitted Successfully'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {lang === 'ar'
              ? `رقم الطلب المرجعي: #${submittedId}. سيراجع مدير الأكاديمية الطلب ويتواصل مع ولي الأمر لربط حساب الطالب وتأكيد موعد الحصة الأولى.`
              : `Reference #${submittedId}. Our director will review the request and link the student account shortly.`}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <PrimaryButton onClick={() => onNavigate('/')}>
              {lang === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}
            </PrimaryButton>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold">
          {lang === 'ar' ? 'تقديم طلب التحاق جديد' : 'Student Admission Application'}
        </h1>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300">
          {lang === 'ar'
            ? 'أدخل بيانات الطالب وولي الأمر وسيتم مراجعتها وربط الحساب فوراً من إدارة الأكاديمية.'
            : 'Complete student and guardian information for academic review and enrollment.'}
        </p>
      </div>

      <Card className="p-6 sm:p-8">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'اسم الطالب بالكامل *' : 'Student Full Name *'}</label>
              <input
                {...register('student_name')}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
              {errors.student_name && (
                <p className="text-xs text-red-600">{lang === 'ar' ? 'يرجى إدخال اسم الطالب' : 'Student name is required'}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'عمر الطالب (3–22) *' : 'Student Age (3–22) *'}</label>
              <input
                type="number"
                {...register('student_age')}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm tabular-nums"
              />
              {errors.student_age && (
                <p className="text-xs text-red-600">{lang === 'ar' ? 'يرجى إدخال عمر صحيح (3 إلى 22 سنة)' : 'Valid age (3-22) is required'}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'اسم ولي الأمر *' : 'Guardian Name *'}</label>
              <input
                {...register('guardian_name')}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
              {errors.guardian_name && (
                <p className="text-xs text-red-600">{lang === 'ar' ? 'يرجى إدخال اسم ولي الأمر' : 'Guardian name is required'}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'رقم الواتساب / الهاتف *' : 'WhatsApp / Phone *'}</label>
              <input
                {...register('guardian_phone')}
                placeholder="+2010..."
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm font-mono-tabular"
              />
              {errors.guardian_phone && (
                <p className="text-xs text-red-600">{lang === 'ar' ? 'يرجى إدخال رقم هاتف صحيح' : 'Valid phone required'}</p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-bold">{lang === 'ar' ? 'البريد الإلكتروني لولي الأمر *' : 'Guardian Email *'}</label>
              <input
                type="email"
                {...register('guardian_email')}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
              />
              {errors.guardian_email && (
                <p className="text-xs text-red-600">{lang === 'ar' ? 'بريد إلكتروني غير صالح' : 'Valid email required'}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold">{lang === 'ar' ? 'المستوى المناسب' : 'Preferred Level'}</label>
              <select
                {...register('recommended_level_id')}
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
                {...register('preferred_course_id')}
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
            <label className="text-xs font-bold">{lang === 'ar' ? 'ملاحظات إضافية حول مستوى الطفل' : 'Additional Notes'}</label>
            <textarea
              rows={3}
              {...register('notes')}
              className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="pt-1 space-y-1">
            <label className="flex items-start gap-2.5 text-xs sm:text-sm cursor-pointer">
              <input type="checkbox" {...register('consent_accepted')} className="mt-1 accent-[#0F766E]" />
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
            {errors.consent_accepted && (
              <p className="text-xs text-red-600">{lang === 'ar' ? 'الموافقة على الشروط والخصوصية مطلوبة' : 'Consent is required'}</p>
            )}
          </div>

          <PrimaryButton type="submit" disabled={isSubmitting}>
            {isSubmitting ? (lang === 'ar' ? 'جاري الإرسال...' : 'Submitting...') : lang === 'ar' ? 'إرسال طلب التقديم' : 'Submit Admission Request'}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  );
}
