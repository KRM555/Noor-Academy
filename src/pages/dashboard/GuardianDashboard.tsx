import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, CheckCircle2, Award, Download, Heart } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import { tField } from '../../i18n/translations';
import { generateCertificatePDF } from '../../lib/pdfCertificate';
import { Card, LoadingState, EmptyState, ResponsiveTable, PrimaryButton } from '../../components/ui/CommonUI';
import { ChangePasswordCard } from '../../components/dashboard/ChangePasswordCard';

interface GuardianChild {
  id: number;
  student_code: string;
  full_name_ar: string;
  full_name_en: string;
  age: number;
  level_name_ar: string;
  level_name_en: string;
  status: string;
}

interface GuardianPayload {
  guardian: { id: number; full_name: string; phone: string; email: string; relation: string };
  children: GuardianChild[];
  enrollments: Array<{ id: number; student_id: number; title_ar: string; title_en: string; schedule_ar: string; schedule_en: string; teacher_name_ar: string; teacher_name_en: string }>;
  attendance: Array<{ id: number; student_id: number; lesson_title_ar: string; lesson_title_en: string; lesson_date: string; status: string; notes: string }>;
  recitations: Array<{ id: number; student_id: number; surah_name: string; ayah_from: number; ayah_to: number; tajweed_score: number; memorization_score: number; notes_ar: string; course_title_ar: string }>;
  examResults: Array<{ id: number; student_id: number; exam_title_ar: string; exam_title_en: string; exam_date: string; score: number; max_score: number; feedback_ar: string; course_title_ar: string }>;
  evaluations: Array<{ id: number; student_id: number; period: string; behavior_score: number; participation_score: number; summary_ar: string; summary_en: string }>;
  certificates: Array<{ id: number; student_id: number; verification_code: string; title_ar: string; title_en: string; course_title_ar: string; course_title_en: string; grade_label: string; issued_at: string }>;
}

export function GuardianDashboard({ activeTab }: { activeTab: string }) {
  const { lang, user } = useApp();
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.guardianDashboard(user?.id),
    queryFn: () => apiFetch<GuardianPayload>('/api/guardian/dashboard'),
  });

  if (isLoading) return <LoadingState label={lang === 'ar' ? 'جاري تحميل متابعة الأبناء...' : 'Loading family progress...'} />;
  if (!data) return <EmptyState title={lang === 'ar' ? 'لا توجد بيانات لولي الأمر بعد' : 'Guardian data unavailable'} />;

  const selectedChild = data.children.find((c) => c.id === selectedChildId) || data.children[0];
  const childId = selectedChild?.id;

  const childEnrollments = data.enrollments.filter((e) => e.student_id === childId);
  const childAttendance = data.attendance.filter((a) => a.student_id === childId);
  const childRecitations = data.recitations.filter((r) => r.student_id === childId);
  const childExams = data.examResults.filter((ex) => ex.student_id === childId);
  const childEvaluations = data.evaluations.filter((ev) => ev.student_id === childId);
  const childCertificates = data.certificates.filter((c) => c.student_id === childId);

  const attendanceRate = childAttendance.length
    ? Math.round((childAttendance.filter((a) => a.status === 'present').length / childAttendance.length) * 100)
    : 100;

  if (activeTab === 'account') {
    return (
      <div className="space-y-6 max-w-2xl">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'حساب ولي الأمر والأمان' : 'Guardian Account & Security'}</h2>
        <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'الاسم' : 'Full Name'}</div>
            <div className="font-bold">{data.guardian.full_name}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'الصفة' : 'Relation'}</div>
            <div className="font-bold">{data.guardian.relation}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'الهاتف' : 'Phone'}</div>
            <div className="font-mono-tabular font-bold">{data.guardian.phone}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</div>
            <div className="font-mono-tabular font-bold">{data.guardian.email}</div>
          </div>
        </Card>
        <ChangePasswordCard />
      </div>
    );
  }

  if (activeTab === 'certificates') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'شهادات الأبناء المعتمدة' : 'Children Certificates'}</h2>
        {data.certificates.length === 0 ? (
          <EmptyState title={lang === 'ar' ? 'لا توجد شهادات مصدرة للأبناء بعد' : 'No certificates issued yet'} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.certificates.map((cert) => {
              const child = data.children.find((c) => c.id === cert.student_id);
              return (
                <Card key={cert.id} className="p-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <Award className="w-6 h-6 text-[#C98A1E]" />
                    <span className="text-xs font-mono-tabular text-slate-500">{cert.verification_code}</span>
                  </div>
                  <div className="text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                    {child ? (lang === 'ar' ? child.full_name_ar : child.full_name_en) : ''}
                  </div>
                  <h3 className="font-bold text-base">{tField(cert as unknown as Record<string, unknown>, 'title', lang)}</h3>
                  <div className="text-xs text-slate-500">
                    {tField(cert as unknown as Record<string, unknown>, 'course_title', lang)} · {cert.grade_label}
                  </div>
                  {child && (
                    <PrimaryButton
                      onClick={() =>
                        generateCertificatePDF({
                          verification_code: cert.verification_code,
                          student_name_ar: child.full_name_ar,
                          student_name_en: child.full_name_en,
                          course_title_en: cert.course_title_en,
                          title_en: cert.title_en,
                          grade_label: cert.grade_label,
                          issued_at: cert.issued_at,
                        })
                      }
                      className="text-xs"
                    >
                      <Download className="w-4 h-4" />
                      <span>{lang === 'ar' ? 'تحميل PDF' : 'Download PDF'}</span>
                    </PrimaryButton>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Child Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C98A1E]">
            <Heart className="w-4 h-4" />
            <span>{lang === 'ar' ? 'بوابة متابعة أولياء الأمور والأمهات' : 'Parents & Mothers Progress Portal'}</span>
          </div>
          <h2 className="text-2xl font-extrabold">
            {lang === 'ar' ? `أهلاً ${data.guardian.full_name}` : `Welcome, ${data.guardian.full_name}`}
          </h2>
        </div>

        {data.children.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.children.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedChildId(c.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  c.id === childId
                    ? 'bg-[#0F213E] text-white border-[#0F213E] dark:bg-[#C98A1E] dark:border-[#C98A1E]'
                    : 'bg-white dark:bg-[#0F213E] border-[#E5DEC9] dark:border-[#233C63] hover:border-[#C98A1E]'
                }`}
              >
                {lang === 'ar' ? c.full_name_ar : c.full_name_en} ({tField(c as unknown as Record<string, unknown>, 'level_name', lang)})
              </button>
            ))}
          </div>
        )}
      </div>

      {!selectedChild ? (
        <EmptyState title={lang === 'ar' ? 'لم يتم ربط أبناء بهذا الحساب بعد' : 'No children linked to this account yet'} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{lang === 'ar' ? 'نسبة الحضور' : 'Attendance'}</span>
                <CheckCircle2 className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
              </div>
              <div className="text-2xl font-extrabold tabular-nums">{attendanceRate}%</div>
            </Card>
            <Card className="p-5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{lang === 'ar' ? 'الحلقات النشطة' : 'Active Courses'}</span>
                <BookOpen className="w-4 h-4 text-[#C98A1E]" />
              </div>
              <div className="text-2xl font-extrabold tabular-nums">{childEnrollments.length}</div>
            </Card>
            <Card className="p-5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{lang === 'ar' ? 'سجلات التسميع' : 'Recitations'}</span>
                <Users className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
              </div>
              <div className="text-2xl font-extrabold tabular-nums">{childRecitations.length}</div>
            </Card>
            <Card className="p-5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{lang === 'ar' ? 'الشهادات' : 'Certificates'}</span>
                <Award className="w-4 h-4 text-[#C98A1E]" />
              </div>
              <div className="text-2xl font-extrabold tabular-nums">{childCertificates.length}</div>
            </Card>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-bold">{lang === 'ar' ? 'الحلقات المسجّل بها الطفل' : 'Enrolled Circles'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {childEnrollments.map((en) => (
                <Card key={en.id} className="p-5 space-y-1">
                  <div className="font-bold text-base">{tField(en as unknown as Record<string, unknown>, 'title', lang)}</div>
                  <div className="text-xs text-slate-500">
                    {tField(en as unknown as Record<string, unknown>, 'teacher_name', lang)} · {tField(en as unknown as Record<string, unknown>, 'schedule', lang)}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-bold">{lang === 'ar' ? 'التقييم التربوي الدوري' : 'Periodic Mentor Evaluations'}</h3>
            {childEvaluations.length === 0 ? (
              <Card className="p-5 text-sm text-slate-500">{lang === 'ar' ? 'لا توجد تقييمات مسجلة بعد.' : 'No evaluations recorded yet.'}</Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {childEvaluations.map((ev) => (
                  <Card key={ev.id} className="p-5 space-y-2">
                    <div className="text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">{ev.period}</div>
                    <div className="text-sm font-semibold tabular-nums">
                      {lang === 'ar' ? 'السلوك:' : 'Conduct:'} {ev.behavior_score}% · {lang === 'ar' ? 'المشاركة:' : 'Participation:'} {ev.participation_score}%
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{tField(ev as unknown as Record<string, unknown>, 'summary', lang)}</p>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-bold">{lang === 'ar' ? 'سجل التسميع والامتحانات' : 'Recitation & Exam Log'}</h3>
            <ResponsiveTable
              data={childRecitations}
              emptyTitle={lang === 'ar' ? 'لا توجد سجلات تسميع لهذا الطالب بعد' : 'No recitations yet'}
              columns={[
                { key: 'surah', header: lang === 'ar' ? 'السورة والآيات' : 'Surah & Ayahs', render: (r) => `${r.surah_name} (${r.ayah_from}–${r.ayah_to})` },
                { key: 'mem', header: lang === 'ar' ? 'الحفظ' : 'Memorization', align: 'end', render: (r) => `${r.memorization_score}%` },
                { key: 'taj', header: lang === 'ar' ? 'التجويد' : 'Tajweed', align: 'end', render: (r) => `${r.tajweed_score}%` },
                { key: 'notes', header: lang === 'ar' ? 'ملاحظات المعلم' : 'Notes', render: (r) => r.notes_ar || '—' },
              ]}
            />
            {childExams.length > 0 && (
              <ResponsiveTable
                data={childExams}
                emptyTitle=""
                columns={[
                  { key: 'exam', header: lang === 'ar' ? 'الامتحان' : 'Exam', render: (r) => tField(r as unknown as Record<string, unknown>, 'exam_title', lang) },
                  { key: 'date', header: lang === 'ar' ? 'التاريخ' : 'Date', render: (r) => <span className="font-mono-tabular">{r.exam_date}</span> },
                  { key: 'score', header: lang === 'ar' ? 'الدرجة' : 'Score', align: 'end', render: (r) => `${r.score} / ${r.max_score}` },
                  { key: 'fb', header: lang === 'ar' ? 'التغذية الراجعة' : 'Feedback', render: (r) => r.feedback_ar || '—' },
                ]}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
