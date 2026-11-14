import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ExternalLink, Download, Gamepad2, Calendar, Award } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import { tField } from '../../i18n/translations';
import { generateCertificatePDF } from '../../lib/pdfCertificate';
import { Card, LoadingState, ResponsiveTable, PrimaryButton, EmptyState } from '../../components/ui/CommonUI';
import { ChangePasswordCard } from '../../components/dashboard/ChangePasswordCard';

interface StudentDashboardData {
  student: {
    id: number;
    student_code: string;
    full_name_ar: string;
    full_name_en: string;
    age: number;
    level_name_ar: string;
    level_name_en: string;
    level_code: string;
    guardian_name: string;
    guardian_phone: string;
    guardian_email: string;
  };
  enrollments: Array<{ id: number; course_id: number; title_ar: string; title_en: string; schedule_ar: string; schedule_en: string; teacher_name_ar: string; teacher_name_en: string }>;
  lessons: Array<{ id: number; course_id: number; title_ar: string; title_en: string; course_title_ar: string; course_title_en: string; lesson_date: string; start_time: string; duration_min: number; objectives_ar: string; objectives_en: string }>;
  lessonLinks: Array<{ id: number; lesson_id: number; title_ar: string; title_en: string; url: string; link_type: string }>;
  attendance: Array<{ id: number; lesson_title_ar: string; lesson_title_en: string; lesson_date: string; status: string; notes: string }>;
  examResults: Array<{ id: number; exam_title_ar: string; exam_title_en: string; course_title_ar: string; course_title_en: string; exam_date: string; score: number; max_score: number; feedback_ar: string; feedback_en: string }>;
  recitations: Array<{ id: number; surah_name: string; ayah_from: number; ayah_to: number; tajweed_score: number; memorization_score: number; notes_ar: string; recorded_at: string }>;
  evaluations: Array<{ id: number; period: string; behavior_score: number; participation_score: number; summary_ar: string; summary_en: string }>;
  announcements: Array<{ id: number; title_ar: string; title_en: string; body_ar: string; body_en: string; target_scope: string; created_at: string }>;
  certificates: Array<{ id: number; verification_code: string; title_ar: string; title_en: string; course_title_ar: string; course_title_en: string; grade_label: string; issued_at: string; revoked_at: string | null }>;
  games: Array<{ id: number; slug: string; title_ar: string; title_en: string; description_ar: string; description_en: string; score?: number; stars?: number; completed_levels?: number }>;
}

export function StudentDashboard({
  activeTab,
  onLaunchGame,
}: {
  activeTab: string;
  onLaunchGame: (slug: string) => void;
}) {
  const { lang, toast, user } = useApp();
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.studentDashboard(user?.id),
    queryFn: () => apiFetch<StudentDashboardData>('/api/student/dashboard'),
  });

  useEffect(() => {
    if (error) {
      toast(error instanceof Error ? error.message : 'Error', 'error');
    }
  }, [error, toast]);

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState title={lang === 'ar' ? 'لا توجد بيانات طالب مرتبطة' : 'No linked student record'} />;

  const nextLesson = data.lessons[0];
  const nextLinks = nextLesson ? data.lessonLinks.filter((l) => l.lesson_id === nextLesson.id) : [];

  if (activeTab === 'home') {
    const chartData = data.recitations.map((r) => ({
      name: r.surah_name,
      tajweed: r.tajweed_score,
      memorization: r.memorization_score,
    }));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 space-y-1">
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'المستوى الحالي' : 'Current Level'}</div>
            <div className="text-lg font-extrabold">{tField(data.student as unknown as Record<string, unknown>, 'level_name', lang)}</div>
            <div className="text-xs font-mono-tabular text-[#0F766E] dark:text-[#2DD4BF]">{data.student.student_code}</div>
          </Card>
          <Card className="p-5 space-y-1">
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'الحلقات المسجلة' : 'Active Circles'}</div>
            <div className="text-2xl font-extrabold tabular-nums">{data.enrollments.length}</div>
          </Card>
          <Card className="p-5 space-y-1">
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'إجمالي نجوم الألعاب' : 'Total Game Stars'}</div>
            <div className="text-2xl font-extrabold tabular-nums text-[#C98A1E]">
              ★ {data.games.reduce((acc, g) => acc + (g.stars || 0), 0)}
            </div>
          </Card>
        </div>

        {/* Next Class */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'حصتي القادمة' : 'My Next Lesson'}</h2>
            <Calendar className="w-5 h-5 text-[#C98A1E]" />
          </div>
          {nextLesson ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="font-bold text-base">{tField(nextLesson as unknown as Record<string, unknown>, 'title', lang)}</div>
                <div className="text-xs text-slate-500">
                  {tField(nextLesson as unknown as Record<string, unknown>, 'course_title', lang)} ·{' '}
                  <span className="font-mono-tabular">{nextLesson.lesson_date} · {nextLesson.start_time}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {nextLinks.map((lk) => (
                  <a
                    key={lk.id}
                    href={lk.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D625B]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{tField(lk as unknown as Record<string, unknown>, 'title', lang)}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{lang === 'ar' ? 'لا توجد حصص مجدولة حالياً.' : 'No upcoming lessons scheduled.'}</p>
          )}
        </Card>

        {/* Progress Chart */}
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'تقدم التسميع والتجويد' : 'Recitation & Tajweed Progress'}</h2>
          {chartData.length > 0 ? (
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="memorization" name={lang === 'ar' ? 'الحفظ' : 'Memorization'} fill="#0F766E" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="tajweed" name={lang === 'ar' ? 'التجويد' : 'Tajweed'} fill="#C98A1E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{lang === 'ar' ? 'ستظهر الرسوم البيانية بعد أول تسميع.' : 'Charts appear after your first recitation.'}</p>
          )}
        </Card>
      </div>
    );
  }

  if (activeTab === 'lessons') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'دروسي ولينكات المحاضرات' : 'My Lessons & Links'}</h2>
        {data.lessons.map((l) => {
          const links = data.lessonLinks.filter((lk) => lk.lesson_id === l.id);
          return (
            <Card key={l.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs text-slate-500">{tField(l as unknown as Record<string, unknown>, 'course_title', lang)}</div>
                <h3 className="font-bold text-base">{tField(l as unknown as Record<string, unknown>, 'title', lang)}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">{tField(l as unknown as Record<string, unknown>, 'objectives', lang)}</p>
                <div className="text-xs font-mono-tabular text-[#0F766E] dark:text-[#2DD4BF]">
                  {l.lesson_date} · {l.start_time} ({l.duration_min} {lang === 'ar' ? 'د' : 'm'})
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {links.map((lk) => (
                  <a
                    key={lk.id}
                    href={lk.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold bg-[#C98A1E] text-white hover:bg-[#B47A16]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{tField(lk as unknown as Record<string, unknown>, 'title', lang)}</span>
                  </a>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  if (activeTab === 'schedule') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'الجدول الأسبوعي والحضور' : 'Schedule & Attendance'}</h2>
        <ResponsiveTable
          data={data.enrollments}
          emptyTitle={lang === 'ar' ? 'لا توجد حلقات مسجلة' : 'No active enrollments'}
          columns={[
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Circle', render: (r) => tField(r as unknown as Record<string, unknown>, 'title', lang) },
            { key: 'teacher', header: lang === 'ar' ? 'المعلم' : 'Teacher', render: (r) => tField(r as unknown as Record<string, unknown>, 'teacher_name', lang) },
            { key: 'schedule', header: lang === 'ar' ? 'الموعد' : 'Schedule', render: (r) => tField(r as unknown as Record<string, unknown>, 'schedule', lang) },
          ]}
        />
        <h3 className="text-lg font-bold pt-4">{lang === 'ar' ? 'سجل الحضور' : 'Attendance Log'}</h3>
        <ResponsiveTable
          data={data.attendance}
          emptyTitle={lang === 'ar' ? 'لم يُسجل حضور بعد' : 'No attendance records yet'}
          columns={[
            { key: 'date', header: lang === 'ar' ? 'التاريخ' : 'Date', render: (r) => <span className="font-mono-tabular">{r.lesson_date}</span> },
            { key: 'lesson', header: lang === 'ar' ? 'الدرس' : 'Lesson', render: (r) => tField(r as unknown as Record<string, unknown>, 'lesson_title', lang) },
            { key: 'status', header: lang === 'ar' ? 'الحالة' : 'Status', render: (r) => r.status },
            { key: 'notes', header: lang === 'ar' ? 'ملاحظات' : 'Notes', render: (r) => r.notes || '—' },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'exams') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'الامتحانات والنتائج' : 'Exams & Results'}</h2>
          <span className="text-xs text-slate-500">{lang === 'ar' ? 'للقراءة فقط' : 'Read-only'}</span>
        </div>
        <ResponsiveTable
          data={data.examResults}
          emptyTitle={lang === 'ar' ? 'لا توجد نتائج امتحانات بعد' : 'No exam results yet'}
          columns={[
            { key: 'exam', header: lang === 'ar' ? 'الامتحان' : 'Exam', render: (r) => tField(r as unknown as Record<string, unknown>, 'exam_title', lang) },
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => tField(r as unknown as Record<string, unknown>, 'course_title', lang) },
            { key: 'score', header: lang === 'ar' ? 'الدرجة' : 'Score', align: 'end', render: (r) => <span className="font-mono-tabular font-bold">{r.score} / {r.max_score}</span> },
            { key: 'feedback', header: lang === 'ar' ? 'ملاحظة المعلم' : 'Teacher Feedback', render: (r) => tField(r as unknown as Record<string, unknown>, 'feedback', lang) || '—' },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'recitations') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'سجل التسميع والتقييم' : 'Recitations & Evaluations'}</h2>
          <span className="text-xs text-slate-500">{lang === 'ar' ? 'للقراءة فقط' : 'Read-only'}</span>
        </div>
        <ResponsiveTable
          data={data.recitations}
          emptyTitle={lang === 'ar' ? 'لا توجد جلسات تسميع مسجلة' : 'No recitations logged yet'}
          columns={[
            { key: 'surah', header: lang === 'ar' ? 'السورة والآيات' : 'Surah & Ayahs', render: (r) => `${r.surah_name} (${r.ayah_from}–${r.ayah_to})` },
            { key: 'mem', header: lang === 'ar' ? 'الحفظ' : 'Memorization', align: 'end', render: (r) => `${r.memorization_score}%` },
            { key: 'taj', header: lang === 'ar' ? 'التجويد' : 'Tajweed', align: 'end', render: (r) => `${r.tajweed_score}%` },
            { key: 'notes', header: lang === 'ar' ? 'ملاحظات' : 'Notes', render: (r) => r.notes_ar || '—' },
          ]}
        />
        <h3 className="text-lg font-bold">{lang === 'ar' ? 'التقييم التربوي الدوري' : 'Periodic Evaluations'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.evaluations.map((ev) => (
            <Card key={ev.id} className="p-5 space-y-2">
              <div className="text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">{ev.period}</div>
              <div className="text-sm font-semibold tabular-nums">
                {lang === 'ar' ? 'السلوك:' : 'Conduct:'} {ev.behavior_score}% · {lang === 'ar' ? 'المشاركة:' : 'Participation:'} {ev.participation_score}%
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{tField(ev as unknown as Record<string, unknown>, 'summary', lang)}</p>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'games') {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'الألعاب التعليمية وتقدمي' : 'Learning Games & My Progress'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {data.games.map((g) => (
            <Card key={g.id} className="p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="inline-flex items-center gap-1 text-[#0F766E] dark:text-[#2DD4BF]">
                    <Gamepad2 className="w-4 h-4" />
                    {lang === 'ar' ? `المستوى ${g.completed_levels || 1}` : `Level ${g.completed_levels || 1}`}
                  </span>
                  <span className="text-[#C98A1E] font-mono-tabular">★ {g.stars || 0} · {g.score || 0}</span>
                </div>
                <h3 className="font-bold text-base">{tField(g as unknown as Record<string, unknown>, 'title', lang)}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">{tField(g as unknown as Record<string, unknown>, 'description', lang)}</p>
              </div>
              <PrimaryButton onClick={() => onLaunchGame(g.slug)} className="w-full text-xs">
                {lang === 'ar' ? 'العب الآن' : 'Play Now'}
              </PrimaryButton>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'certificates') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'شهاداتي المعتمدة' : 'My Certificates'}</h2>
        {data.certificates.length === 0 ? (
          <EmptyState title={lang === 'ar' ? 'لم تصدر شهادات بعد' : 'No certificates issued yet'} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.certificates.map((cert) => (
              <Card key={cert.id} className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <Award className="w-6 h-6 text-[#C98A1E]" />
                  <span className="text-xs font-mono-tabular text-slate-500">{cert.verification_code}</span>
                </div>
                <h3 className="font-bold text-base">{tField(cert as unknown as Record<string, unknown>, 'title', lang)}</h3>
                <div className="text-xs text-slate-500">
                  {tField(cert as unknown as Record<string, unknown>, 'course_title', lang)} · {cert.grade_label}
                </div>
                <PrimaryButton
                  onClick={() =>
                    generateCertificatePDF({
                      verification_code: cert.verification_code,
                      student_name_ar: data.student.full_name_ar,
                      student_name_en: data.student.full_name_en,
                      course_title_en: cert.course_title_en,
                      title_en: cert.title_en,
                      grade_label: cert.grade_label,
                      issued_at: cert.issued_at,
                    })
                  }
                  className="text-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'تحميل الشهادة PDF' : 'Download PDF Certificate'}</span>
                </PrimaryButton>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'announcements') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'الإعلانات الموجهة لي' : 'My Announcements'}</h2>
        {data.announcements.length === 0 ? (
          <EmptyState title={lang === 'ar' ? 'لا توجد إعلانات حالياً' : 'No announcements'} />
        ) : (
          data.announcements.map((ann) => (
            <Card key={ann.id} className="p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{ann.target_scope}</span>
                <span className="font-mono-tabular">{String(ann.created_at).slice(0, 10)}</span>
              </div>
              <h3 className="font-bold text-base">{tField(ann as unknown as Record<string, unknown>, 'title', lang)}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{tField(ann as unknown as Record<string, unknown>, 'body', lang)}</p>
            </Card>
          ))
        )}
      </div>
    );
  }

  // Profile tab
  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'ملف الطالب' : 'Student Profile'}</h2>
      <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-slate-500">{lang === 'ar' ? 'الاسم' : 'Full Name'}</div>
          <div className="font-bold">{lang === 'ar' ? data.student.full_name_ar : data.student.full_name_en}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{lang === 'ar' ? 'الكود الأكاديمي' : 'Student Code'}</div>
          <div className="font-mono-tabular font-bold">{data.student.student_code}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{lang === 'ar' ? 'العمر' : 'Age'}</div>
          <div className="font-bold tabular-nums">{data.student.age}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{lang === 'ar' ? 'المستوى' : 'Level'}</div>
          <div className="font-bold">{tField(data.student as unknown as Record<string, unknown>, 'level_name', lang)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{lang === 'ar' ? 'ولي الأمر' : 'Guardian'}</div>
          <div className="font-bold">{data.student.guardian_name}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">{lang === 'ar' ? 'هاتف ولي الأمر' : 'Guardian Phone'}</div>
          <div className="font-mono-tabular font-bold">{data.student.guardian_phone}</div>
        </div>
      </Card>
      <ChangePasswordCard />
    </div>
  );
}
