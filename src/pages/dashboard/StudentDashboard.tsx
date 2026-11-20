import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ExternalLink, Download, Gamepad2, Calendar, Award, Video, FileText, PlayCircle, Copy, Check, Upload, CheckCircle2, Clock, ListChecks, AlertCircle, Timer, Lock } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import { tField } from '../../i18n/translations';
import { Card, LoadingState, ResponsiveTable, PrimaryButton, EmptyState } from '../../components/ui/CommonUI';
import { ChangePasswordCard } from '../../components/dashboard/ChangePasswordCard';
import { MyCommunityPanel } from '../../components/dashboard/MyCommunityPanel';

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

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
  lessons: Array<{ id: number; course_id: number; title_ar: string; title_en: string; course_title_ar: string; course_title_en: string; lesson_date: string; start_time: string; duration_min: number; objectives_ar: string; objectives_en: string; weekday_ar?: string }>;
  lessonLinks: Array<{ id: number; lesson_id: number; title_ar: string; title_en: string; url: string; link_type: string }>;
  attendance: Array<{ id: number; lesson_title_ar: string; lesson_title_en: string; lesson_date: string; status: string; notes: string }>;
  exams?: Array<{
    id: number;
    course_id: number;
    title_ar: string;
    title_en: string;
    course_title_ar: string;
    course_title_en: string;
    exam_date: string;
    max_score: number;
    exam_mode: 'file' | 'quiz' | 'hybrid';
    instructions_ar: string;
    instructions_en: string;
    due_at: string | null;
    time_limit_minutes?: number | null;
    allow_late_submission: boolean;
    show_answers_after_submit: boolean;
    is_open: boolean;
    is_past_deadline: boolean;
    attempt?: {
      started_at: string;
      expires_at: string;
      remaining_seconds: number | null;
      is_expired: boolean;
    } | null;
    server_now?: string;
    has_question_file: boolean;
    question_file_name: string | null;
    question_count: number;
    questions: Array<{
      id: string;
      q_type: 'mcq' | 'tf';
      prompt_ar: string;
      prompt_en: string;
      options_ar: string[];
      options_en: string[];
      points: number;
      correct_index?: number;
    }>;
    submission: {
      status: 'submitted_pending' | 'graded';
      submitted_at: string;
      is_late: boolean;
      timed_out?: boolean;
      has_solution_file: boolean;
      solution_file_name: string | null;
      student_notes: string;
      quiz_answers: Array<{ question_id: string; selected_index: number }>;
      auto_score: number | null;
      has_graded_file: boolean;
      graded_file_name: string | null;
    } | null;
    result: {
      score: number;
      feedback_ar: string;
      feedback_en: string;
      graded_at: string;
    } | null;
  }>;
  examResults: Array<{ id: number; exam_id?: number; exam_title_ar: string; exam_title_en: string; course_title_ar: string; course_title_en: string; exam_date: string; score: number; max_score: number; feedback_ar: string; feedback_en: string }>;
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
  const qc = useQueryClient();
  const [copiedCode, setCopiedCode] = useState(false);
  const [uploadingExamId, setUploadingExamId] = useState<number | null>(null);
  const [solutionNotes, setSolutionNotes] = useState<Record<number, string>>({});
  const [activeQuizExamId, setActiveQuizExamId] = useState<number | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [startingExamId, setStartingExamId] = useState<number | null>(null);
  const [examDeadlinesMs, setExamDeadlinesMs] = useState<Record<number, number>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const autoSubmittedExamIdsRef = useRef<Set<number>>(new Set());
  const quizAnswersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    quizAnswersRef.current = quizAnswers;
    if (activeQuizExamId && user?.id) {
      try {
        localStorage.setItem(
          `nb_quiz_draft_${user.id}_${activeQuizExamId}`,
          JSON.stringify({ answers: quizAnswers, savedAt: Date.now() })
        );
      } catch {
        // Ignore storage quota issues
      }
    }
  }, [quizAnswers, activeQuizExamId, user?.id]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.studentDashboard(user?.id),
    queryFn: () => apiFetch<StudentDashboardData>('/api/student/dashboard'),
  });

  useEffect(() => {
    if (error) {
      toast(error instanceof Error ? error.message : 'Error', 'error');
    }
  }, [error, toast]);

  // Hydrate server-side active attempt deadlines on dashboard fetch
  useEffect(() => {
    const examsList = data?.exams || [];
    if (examsList.length === 0) return;
    setExamDeadlinesMs((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const ex of examsList) {
        if (ex.attempt && ex.attempt.remaining_seconds !== null && !ex.submission) {
          const computed = Date.now() + Math.max(0, ex.attempt.remaining_seconds) * 1000;
          if (!next[ex.id] || Math.abs(next[ex.id] - computed) > 2500) {
            next[ex.id] = computed;
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [data]);

  const hasActiveTimers = Boolean(
    Object.keys(examDeadlinesMs).length > 0 ||
      (data?.exams || []).some((e) => Boolean(e.attempt && !e.submission))
  );

  useEffect(() => {
    if (!hasActiveTimers) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasActiveTimers]);

  const submitOnlineQuiz = useCallback(
    async (
      examItem: NonNullable<StudentDashboardData['exams']>[number],
      options?: { isAutoTimeout?: boolean }
    ) => {
      const isAutoTimeout = Boolean(options?.isAutoTimeout);
      const answersSource = quizAnswersRef.current;
      const draftKey = user?.id ? `nb_quiz_draft_${user.id}_${examItem.id}` : null;
      let storedDraft: Record<string, number> = {};
      if (draftKey && Object.keys(answersSource).length === 0) {
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            const parsedDraft = JSON.parse(raw) as unknown;
            if (
              parsedDraft &&
              typeof parsedDraft === 'object' &&
              'answers' in parsedDraft &&
              typeof (parsedDraft as { savedAt?: unknown }).savedAt === 'number'
            ) {
              const { answers, savedAt } = parsedDraft as { answers?: Record<string, number>; savedAt: number };
              if (Date.now() - savedAt <= 24 * 60 * 60 * 1000 && answers && typeof answers === 'object') {
                storedDraft = answers;
              } else {
                localStorage.removeItem(draftKey);
              }
            } else if (parsedDraft && typeof parsedDraft === 'object') {
              storedDraft = parsedDraft as Record<string, number>;
            }
          }
        } catch {
          // Ignore malformed draft
        }
      }
      const effectiveAnswers = Object.keys(answersSource).length > 0 ? answersSource : storedDraft;

      const answeredList = examItem.questions
        .filter((q) => effectiveAnswers[q.id] !== undefined && effectiveAnswers[q.id] >= 0)
        .map((q) => ({
          question_id: q.id,
          selected_index: effectiveAnswers[q.id],
        }));

      if (!isAutoTimeout && answeredList.length < examItem.questions.length) {
        toast(
          lang === 'ar'
            ? 'يرجى الإجابة على جميع الأسئلة قبل الإرسال'
            : 'Please answer all questions before submitting',
          'error'
        );
        return;
      }

      setSubmittingQuiz(true);
      try {
        const res = await apiFetch<{ auto_score: number; max_score: number; finalized: boolean }>(
          `/api/exams/${examItem.id}/submit-quiz`,
          {
            method: 'POST',
            body: JSON.stringify({
              answers: answeredList,
              timed_out: isAutoTimeout,
            }),
          }
        );
        if (draftKey) {
          try {
            localStorage.removeItem(draftKey);
          } catch {
            // Ignore
          }
        }
        toast(
          isAutoTimeout
            ? res.finalized
              ? lang === 'ar'
                ? `انتهى وقت الامتحان! تم إغلاقه تلقائياً واعتماد إجاباتك (${res.auto_score} / ${res.max_score})`
                : `Time expired! Auto-submitted saved answers (${res.auto_score} / ${res.max_score})`
              : lang === 'ar'
              ? `انتهى الوقت وتم حفظ إجاباتك المسجلة (${res.auto_score})`
              : `Time expired! Saved answers recorded (${res.auto_score})`
            : res.finalized
            ? lang === 'ar'
              ? `تم تصحيح الاختبار تلقائياً: ${res.auto_score} / ${res.max_score}`
              : `Auto-graded score: ${res.auto_score} / ${res.max_score}`
            : lang === 'ar'
            ? `تم حفظ إجاباتك (${res.auto_score}) بانتظار تصحيح ملف الحل`
            : `Quiz answers saved (${res.auto_score})`,
          isAutoTimeout ? 'info' : 'success'
        );
        if (activeQuizExamId === examItem.id) {
          setActiveQuizExamId(null);
        }
        void qc.invalidateQueries({ queryKey: queryKeys.studentDashboard(user?.id) });
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Submission failed', 'error');
      } finally {
        setSubmittingQuiz(false);
      }
    },
    [activeQuizExamId, lang, qc, toast, user?.id]
  );

  // Auto-lock & auto-submit when any active quiz/hybrid timer reaches zero
  useEffect(() => {
    const examsList = data?.exams || [];
    for (const ex of examsList) {
      if (!ex.time_limit_minutes || ex.time_limit_minutes <= 0) continue;
      if (ex.exam_mode === 'file') continue;
      const quizAlreadyDone = Boolean(ex.submission && ex.submission.quiz_answers.length > 0);
      const isGraded = Boolean(ex.result || ex.submission?.status === 'graded');
      if (quizAlreadyDone || isGraded) continue;

      const deadlineMs = examDeadlinesMs[ex.id];
      const hasTimedAttempt = Boolean(ex.attempt || deadlineMs);
      if (!hasTimedAttempt) continue;

      const isExpired = deadlineMs ? nowMs >= deadlineMs : Boolean(ex.attempt?.is_expired);
      if (isExpired && !autoSubmittedExamIdsRef.current.has(ex.id) && !submittingQuiz) {
        autoSubmittedExamIdsRef.current.add(ex.id);
        void submitOnlineQuiz(ex, { isAutoTimeout: true });
      }
    }
  }, [data?.exams, examDeadlinesMs, nowMs, submittingQuiz, submitOnlineQuiz]);

  if (isLoading) return <LoadingState />;
  if (!data) return <EmptyState title={lang === 'ar' ? 'لا توجد بيانات طالب مرتبطة' : 'No linked student record'} />;

  const nextLesson = data.lessons[0];
  const nextLinks = nextLesson ? data.lessonLinks.filter((l) => l.lesson_id === nextLesson.id) : [];

  const copyStudentCode = async () => {
    try {
      await navigator.clipboard.writeText(data.student.student_code);
      setCopiedCode(true);
      toast(lang === 'ar' ? 'تم نسخ كود الطالب' : 'Student code copied', 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast(data.student.student_code, 'info');
    }
  };

  const openLessonLink = async (lk: { id: number; url: string }) => {
    try {
      let targetUrl = lk.url;
      if (lk.url.startsWith('storage://')) {
        const res = await apiFetch<{ url: string }>(`/api/lesson-links/${lk.id}/access`);
        targetUrl = res.url;
      }
      const a = document.createElement('a');
      a.href = targetUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Unable to open file', 'error');
    }
  };

  const renderLessonLinkButton = (lk: { id: number; title_ar: string; title_en: string; url: string; link_type: string }) => {
    const isRecording = lk.link_type === 'recording';
    const isMaterial = lk.link_type === 'material';
    const colorClass = isRecording
      ? 'bg-[#C98A1E] text-white hover:bg-[#B47A16]'
      : isMaterial
      ? 'bg-[#0F213E] text-white hover:bg-[#19335E] dark:bg-[#1E3B68]'
      : 'bg-[#0F766E] text-white hover:bg-[#0D625B]';
    const Icon = isRecording ? PlayCircle : isMaterial ? FileText : Video;
    return (
      <button
        key={lk.id}
        type="button"
        onClick={() => void openLessonLink(lk)}
        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold cursor-pointer transition-colors ${colorClass}`}
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{tField(lk as unknown as Record<string, unknown>, 'title', lang)}</span>
        <ExternalLink className="w-3 h-3 opacity-80" />
      </button>
    );
  };

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
            <button
              type="button"
              onClick={() => void copyStudentCode()}
              className="inline-flex items-center gap-1.5 text-xs font-mono-tabular font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
              title={lang === 'ar' ? 'نسخ كود الطالب لولي الأمر' : 'Copy student code'}
            >
              <span>{data.student.student_code}</span>
              {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
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
                {nextLinks.map((lk) => renderLessonLinkButton(lk))}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'دروسي وتسجيلات المحاضرات والملفات' : 'My Lessons, Recordings & Materials'}</h2>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF]">{lang === 'ar' ? 'بث مباشر' : 'Live'}</span>
            <span className="px-2.5 py-1 rounded-lg bg-[#C98A1E]/15 text-[#C98A1E]">{lang === 'ar' ? 'تسجيل المحاضرة' : 'Recording'}</span>
            <span className="px-2.5 py-1 rounded-lg bg-[#0F213E]/10 dark:bg-white/10">{lang === 'ar' ? 'ملف / واجب' : 'Material'}</span>
          </div>
        </div>
        {data.lessons.length === 0 ? (
          <EmptyState title={lang === 'ar' ? 'لا توجد دروس مجدولة في حلقاتك بعد' : 'No lessons scheduled yet'} />
        ) : (
          data.lessons.map((l) => {
            const links = data.lessonLinks.filter((lk) => lk.lesson_id === l.id);
            return (
              <Card key={l.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">{tField(l as unknown as Record<string, unknown>, 'course_title', lang)}</div>
                  <h3 className="font-bold text-base">{tField(l as unknown as Record<string, unknown>, 'title', lang)}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{tField(l as unknown as Record<string, unknown>, 'objectives', lang)}</p>
                  <div className="text-xs font-mono-tabular text-[#0F766E] dark:text-[#2DD4BF]">
                    {l.weekday_ar ? `${l.weekday_ar} · ` : ''}{l.lesson_date} · {l.start_time} ({l.duration_min} {lang === 'ar' ? 'د' : 'm'})
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {links.length === 0 ? (
                    <span className="text-xs text-slate-400">{lang === 'ar' ? 'لا توجد مرفقات بعد' : 'No attachments yet'}</span>
                  ) : (
                    links.map((lk) => renderLessonLinkButton(lk))
                  )}
                </div>
              </Card>
            );
          })
        )}
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
    const examsList = data.exams || [];

    const openSignedExamUrl = (url: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    const downloadQuestionPaper = async (examId: number) => {
      try {
        const res = await apiFetch<{ url: string }>(`/api/exams/${examId}/question-file`);
        openSignedExamUrl(res.url);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Unable to download exam file', 'error');
      }
    };

    const downloadSubmissionFile = async (examId: number, kind: 'solution' | 'graded') => {
      try {
        const res = await apiFetch<{ url: string }>(`/api/exams/${examId}/submissions/${data.student.id}/file?kind=${kind}`);
        openSignedExamUrl(res.url);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'File unavailable', 'error');
      }
    };

    const uploadSolution = async (examId: number, file: File) => {
      if (file.size > 8 * 1024 * 1024) {
        toast(lang === 'ar' ? 'الحد الأقصى لحجم الحل 8 ميجابايت' : 'Max solution size is 8 MB', 'error');
        return;
      }
      setUploadingExamId(examId);
      try {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('File read failed'));
          reader.readAsDataURL(file);
        });
        await apiFetch(`/api/exams/${examId}/submit-file`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/pdf',
            base64Data,
            student_notes: (solutionNotes[examId] || '').trim(),
          }),
        });
        toast(lang === 'ar' ? 'تم رفع ملف الحل بأمان وإرساله للمعلم' : 'Solution uploaded securely for grading', 'success');
        void qc.invalidateQueries({ queryKey: queryKeys.studentDashboard(user?.id) });
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      } finally {
        setUploadingExamId(null);
      }
    };

    const openOrStartQuiz = async (examItem: NonNullable<StudentDashboardData['exams']>[number]) => {
      if (activeQuizExamId === examItem.id) {
        setActiveQuizExamId(null);
        return;
      }

      // Restore draft answers if present in localStorage (with 24h TTL)
      if (user?.id) {
        const key = `nb_quiz_draft_${user.id}_${examItem.id}`;
        try {
          const savedDraft = localStorage.getItem(key);
          if (savedDraft) {
            const parsedDraft = JSON.parse(savedDraft) as unknown;
            if (
              parsedDraft &&
              typeof parsedDraft === 'object' &&
              'answers' in parsedDraft &&
              typeof (parsedDraft as { savedAt?: unknown }).savedAt === 'number'
            ) {
              const { answers, savedAt } = parsedDraft as { answers?: Record<string, number>; savedAt: number };
              if (Date.now() - savedAt <= 24 * 60 * 60 * 1000 && answers && typeof answers === 'object') {
                setQuizAnswers(answers);
              } else {
                localStorage.removeItem(key);
                setQuizAnswers({});
              }
            } else if (parsedDraft && typeof parsedDraft === 'object') {
              setQuizAnswers(parsedDraft as Record<string, number>);
            } else {
              setQuizAnswers({});
            }
          } else {
            setQuizAnswers({});
          }
        } catch {
          setQuizAnswers({});
        }
      }

      if (examItem.time_limit_minutes && examItem.time_limit_minutes > 0 && !examItem.attempt) {
        setStartingExamId(examItem.id);
        try {
          const res = await apiFetch<{ started_at: string; expires_at: string; time_limit_minutes: number; server_now: string }>(
            `/api/exams/${examItem.id}/start`,
            { method: 'POST' }
          );
          const remainingMs = Math.max(0, new Date(res.expires_at).getTime() - new Date(res.server_now).getTime());
          setExamDeadlinesMs((prev) => ({
            ...prev,
            [examItem.id]: Date.now() + remainingMs,
          }));
          setNowMs(Date.now());
          setActiveQuizExamId(examItem.id);
          void qc.invalidateQueries({ queryKey: queryKeys.studentDashboard(user?.id) });
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Failed to start timed exam', 'error');
        } finally {
          setStartingExamId(null);
        }
        return;
      }

      setActiveQuizExamId(examItem.id);
    };

    const startTimedFileAttempt = async (examItem: NonNullable<StudentDashboardData['exams']>[number]) => {
      setStartingExamId(examItem.id);
      try {
        const res = await apiFetch<{ started_at: string; expires_at: string; time_limit_minutes: number; server_now: string }>(
          `/api/exams/${examItem.id}/start`,
          { method: 'POST' }
        );
        const remainingMs = Math.max(0, new Date(res.expires_at).getTime() - new Date(res.server_now).getTime());
        setExamDeadlinesMs((prev) => ({
          ...prev,
          [examItem.id]: Date.now() + remainingMs,
        }));
        setNowMs(Date.now());
        toast(
          lang === 'ar'
            ? `بدأ مؤقت الامتحان (${res.time_limit_minutes} دقيقة). احرص على رفع الحل قبل انتهاء العداد.`
            : `Exam timer started (${res.time_limit_minutes}m). Upload your solution before time expires.`,
          'info'
        );
        void qc.invalidateQueries({ queryKey: queryKeys.studentDashboard(user?.id) });
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Unable to start exam timer', 'error');
      } finally {
        setStartingExamId(null);
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'الامتحانات والاختبارات الإلكترونية' : 'Exams & Assessments'}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {lang === 'ar'
              ? 'نزّل ورقة الامتحان أو حل الاختبار الإلكتروني، وعند انتهاء العداد يتم قفل الامتحان تلقائياً واعتماد إجاباتك المسجلة.'
              : 'Download exam papers or take timed online quizzes; saved answers auto-submit when the countdown expires.'}
          </p>
        </div>

        {examsList.length === 0 ? (
          <EmptyState title={lang === 'ar' ? 'لا توجد امتحانات منشورة لحلقاتك حالياً' : 'No exams published for your courses yet'} />
        ) : (
          <div className="space-y-4">
            {examsList.map((ex) => {
              const isGraded = Boolean(ex.result || ex.submission?.status === 'graded');
              const isTimed = Boolean(ex.time_limit_minutes && ex.time_limit_minutes > 0);
              const deadlineMs = examDeadlinesMs[ex.id];
              const remainingSeconds =
                isTimed && deadlineMs !== undefined
                  ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
                  : isTimed && ex.attempt?.remaining_seconds !== null && ex.attempt?.remaining_seconds !== undefined
                  ? ex.attempt.remaining_seconds
                  : null;
              const isAttemptExpired = Boolean(
                isTimed &&
                  !ex.submission &&
                  (ex.attempt?.is_expired || (deadlineMs !== undefined && nowMs >= deadlineMs))
              );
              const canUploadFile =
                (ex.exam_mode === 'file' || ex.exam_mode === 'hybrid') &&
                ex.is_open &&
                !isGraded &&
                !isAttemptExpired &&
                (!ex.is_past_deadline || ex.allow_late_submission);
              const quizAlreadyDone = Boolean(ex.submission && ex.submission.quiz_answers.length > 0);
              const canStartQuiz =
                (ex.exam_mode === 'quiz' || ex.exam_mode === 'hybrid') &&
                ex.is_open &&
                ex.questions.length > 0 &&
                !quizAlreadyDone &&
                !isAttemptExpired &&
                (!ex.is_past_deadline || ex.allow_late_submission);
              const isUrgent = remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 60;

              return (
                <Card key={ex.id} className="p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {tField(ex as unknown as Record<string, unknown>, 'course_title', lang)} ·{' '}
                        <span className="font-mono-tabular">{ex.exam_date}</span>
                        {ex.due_at && (
                          <>
                            {' · '}
                            <span>
                              {lang === 'ar' ? 'آخر موعد:' : 'Due:'} <span className="font-mono-tabular">{String(ex.due_at).slice(0, 10)}</span>
                            </span>
                          </>
                        )}
                        {isTimed && (
                          <>
                            {' · '}
                            <span className="font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                              {lang === 'ar' ? `المدة: ${ex.time_limit_minutes} دقيقة` : `Duration: ${ex.time_limit_minutes}m`}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-lg font-extrabold">{tField(ex as unknown as Record<string, unknown>, 'title', lang)}</h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-sm font-extrabold tabular-nums">
                      {isTimed && remainingSeconds !== null && !ex.submission && !isGraded && (
                        <div
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-mono-tabular ${
                            isAttemptExpired
                              ? 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                              : isUrgent
                              ? 'border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 animate-pulse'
                              : 'border-[#C98A1E] bg-[#C98A1E]/10 text-[#9A6710] dark:text-[#FBBF24]'
                          }`}
                        >
                          <Timer className="w-3.5 h-3.5" />
                          <span>{isAttemptExpired ? '00:00' : formatCountdown(remainingSeconds)}</span>
                        </div>
                      )}
                      {ex.result ? (
                        <span className="inline-flex items-center gap-1.5 text-[#0F766E] dark:text-[#2DD4BF]">
                          <CheckCircle2 className="w-4 h-4" />
                          {ex.result.score} / {ex.max_score}
                        </span>
                      ) : ex.submission ? (
                        <span className="inline-flex items-center gap-1.5 text-[#C98A1E]">
                          <Clock className="w-4 h-4" />
                          {ex.submission.timed_out
                            ? lang === 'ar' ? 'أُغلق بانتهاء الوقت — بانتظار المراجعة' : 'Auto-closed — Pending Review'
                            : lang === 'ar' ? 'تم التسليم — بانتظار التصحيح' : 'Submitted — Pending Grading'}
                        </span>
                      ) : isAttemptExpired ? (
                        <span className="inline-flex items-center gap-1.5 text-red-600">
                          <Lock className="w-4 h-4" />
                          {lang === 'ar' ? 'انتهى وقت الامتحان وتم قفله' : 'Exam Time Expired (Locked)'}
                        </span>
                      ) : !ex.is_open ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-500">
                          <Clock className="w-4 h-4" />
                          {lang === 'ar' ? 'لم يُفتح بعد' : 'Opens soon'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#0F213E] dark:text-[#F6F1E3]">
                          <AlertCircle className="w-4 h-4 text-[#C98A1E]" />
                          {lang === 'ar' ? `مطلوب الحل (${ex.max_score} درجة)` : `Action Needed (${ex.max_score} pts)`}
                        </span>
                      )}
                    </div>
                  </div>

                  {ex.instructions_ar && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {tField(ex as unknown as Record<string, unknown>, 'instructions', lang)}
                    </p>
                  )}

                  {/* Actions Strip */}
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {ex.has_question_file && (
                      <button
                        type="button"
                        onClick={() => downloadQuestionPaper(ex.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F213E] text-white dark:bg-[#1E3B6E] text-xs font-bold hover:opacity-90 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>{lang === 'ar' ? `تحميل ورقة الامتحان (${ex.question_file_name || 'PDF'})` : 'Download Question Paper'}</span>
                      </button>
                    )}

                    {canStartQuiz && (
                      <PrimaryButton
                        type="button"
                        disabled={startingExamId === ex.id}
                        onClick={() => void openOrStartQuiz(ex)}
                      >
                        <ListChecks className="w-4 h-4" />
                        <span>
                          {startingExamId === ex.id
                            ? lang === 'ar' ? 'جاري تشغيل المؤقت...' : 'Starting timer...'
                            : activeQuizExamId === ex.id
                            ? lang === 'ar' ? 'إخفاء الأسئلة' : 'Hide Quiz'
                            : ex.attempt
                            ? lang === 'ar' ? 'متابعة الاختبار الإلكتروني' : 'Resume Online Quiz'
                            : isTimed
                            ? lang === 'ar' ? `بدء الاختبار (${ex.time_limit_minutes} د)` : `Start Timed Quiz (${ex.time_limit_minutes}m)`
                            : lang === 'ar' ? 'بدء الاختبار الإلكتروني' : 'Start Online Quiz'}
                        </span>
                      </PrimaryButton>
                    )}

                    {ex.exam_mode === 'file' && isTimed && ex.is_open && !ex.attempt && !ex.submission && !isGraded && (
                      <PrimaryButton
                        type="button"
                        disabled={startingExamId === ex.id}
                        onClick={() => void startTimedFileAttempt(ex)}
                      >
                        <Timer className="w-4 h-4" />
                        <span>
                          {startingExamId === ex.id
                            ? lang === 'ar' ? 'جاري تشغيل المؤقت...' : 'Starting...'
                            : lang === 'ar' ? `بدء الامتحان (${ex.time_limit_minutes} دقيقة)` : `Start Exam Timer (${ex.time_limit_minutes}m)`}
                        </span>
                      </PrimaryButton>
                    )}

                    {ex.submission?.has_solution_file && (
                      <button
                        type="button"
                        onClick={() => downloadSubmissionFile(ex.id, 'solution')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] text-xs font-bold hover:bg-[#F2EFE6] dark:hover:bg-[#13284A] cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                        <span>{lang === 'ar' ? `ملف الحل المرفوع (${ex.submission.solution_file_name})` : 'My Submitted File'}</span>
                      </button>
                    )}

                    {ex.submission?.has_graded_file && (
                      <button
                        type="button"
                        onClick={() => downloadSubmissionFile(ex.id, 'graded')}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#0F766E]/40 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:bg-[#0F766E]/10 cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>{lang === 'ar' ? 'تحميل ورقة التصحيح من المعلم' : 'Download Graded Copy'}</span>
                      </button>
                    )}
                  </div>

                  {/* PDF / Image Solution Upload Box */}
                  {canUploadFile && (ex.exam_mode !== 'file' || !isTimed || Boolean(ex.attempt)) && (
                    <div className="p-4 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] space-y-3">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {ex.submission?.has_solution_file
                          ? lang === 'ar'
                            ? 'تحديث ملف الحل قبل التصحيح (PDF أو صورة واضحة — حد أقصى 8 MB)'
                            : 'Replace uploaded solution (PDF/Image, max 8 MB)'
                          : lang === 'ar'
                          ? 'ارفع حل الامتحان (PDF أو صورة من الموبايل — حد أقصى 8 MB)'
                          : 'Upload your solution (PDF or clear photo, max 8 MB)'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                        <input
                          value={solutionNotes[ex.id] || ''}
                          onChange={(e) => setSolutionNotes({ ...solutionNotes, [ex.id]: e.target.value })}
                          placeholder={lang === 'ar' ? 'ملاحظة قصيرة للمعلم (اختياري)...' : 'Optional note for teacher...'}
                          className="sm:col-span-7 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-xs"
                        />
                        <label className="sm:col-span-5 flex items-center justify-center gap-2 rounded-xl bg-[#C98A1E] text-white px-4 py-2 text-xs font-bold cursor-pointer hover:bg-[#B07614] transition-colors">
                          <Upload className="w-4 h-4 shrink-0" />
                          <span>
                            {uploadingExamId === ex.id
                              ? lang === 'ar' ? 'جاري الرفع والتأمين...' : 'Uploading...'
                              : lang === 'ar' ? 'اختر ملف الحل PDF / صورة' : 'Choose Solution PDF / Photo'}
                          </span>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp"
                            disabled={uploadingExamId === ex.id}
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void uploadSolution(ex.id, f);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Interactive Online Quiz Box */}
                  {activeQuizExamId === ex.id && canStartQuiz && (
                    <div className="p-4 rounded-xl border border-[#0F766E]/30 bg-[#FAF8F3] dark:bg-[#091529] space-y-4">
                      {isTimed && remainingSeconds !== null && (
                        <div
                          className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border ${
                            isUrgent
                              ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                              : 'border-[#C98A1E]/50 bg-white dark:bg-[#0F213E] text-[#0F213E] dark:text-[#F6F1E3]'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-xs font-bold">
                            <Timer className={`w-4 h-4 ${isUrgent ? 'text-red-600 animate-pulse' : 'text-[#C98A1E]'}`} />
                            <span>
                              {lang === 'ar'
                                ? 'الوقت المتبقي للامتحان (يُغلق ويُعتمد تلقائياً عند الصفر):'
                                : 'Time remaining (auto-locks and submits saved answers at 00:00):'}
                            </span>
                          </div>
                          <span className="font-mono-tabular text-lg font-extrabold tracking-wider">
                            {formatCountdown(remainingSeconds)}
                          </span>
                        </div>
                      )}

                      {ex.questions.map((q, qIdx) => (
                        <div key={q.id} className="space-y-2 pb-3 border-b border-[#E5DEC9] dark:border-[#233C63] last:border-b-0">
                          <div className="text-sm font-bold">
                            {qIdx + 1}. {lang === 'ar' ? q.prompt_ar : q.prompt_en}
                            <span className="text-xs font-normal text-slate-500 mx-2">({q.points} {lang === 'ar' ? 'درجات' : 'pts'})</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {q.options_ar.map((opt, oIdx) => (
                              <label
                                key={oIdx}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                                  quizAnswers[q.id] === oIdx
                                    ? 'border-[#0F766E] bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF]'
                                    : 'border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E]'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`quiz_${ex.id}_${q.id}`}
                                  disabled={isAttemptExpired || submittingQuiz}
                                  checked={quizAnswers[q.id] === oIdx}
                                  onChange={() => setQuizAnswers({ ...quizAnswers, [q.id]: oIdx })}
                                />
                                <span>{lang === 'ar' ? opt : q.options_en[oIdx] || opt}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <PrimaryButton type="button" disabled={submittingQuiz || isAttemptExpired} onClick={() => void submitOnlineQuiz(ex)}>
                        <span>{submittingQuiz ? (lang === 'ar' ? 'جاري التصحيح...' : 'Submitting...') : (lang === 'ar' ? 'إرسال الإجابات والتصحيح' : 'Submit Answers')}</span>
                      </PrimaryButton>
                    </div>
                  )}

                  {/* Quiz Answers Review (only if submitted & allowed by teacher) */}
                  {quizAlreadyDone && ex.show_answers_after_submit && ex.questions.length > 0 && ex.questions[0].correct_index !== undefined && (
                    <div className="p-4 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] space-y-2 text-xs">
                      <div className="font-extrabold text-[#0F766E] dark:text-[#2DD4BF]">
                        {lang === 'ar' ? 'مراجعة إجاباتك:' : 'Answer Review:'}
                      </div>
                      {ex.questions.map((q, qIdx) => {
                        const myAns = ex.submission?.quiz_answers.find((a) => a.question_id === q.id)?.selected_index;
                        const isRight = myAns === q.correct_index;
                        return (
                          <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-[#E5DEC9]/60 dark:border-[#233C63]/60 last:border-b-0">
                            <span className="font-semibold">
                              {qIdx + 1}. {q.prompt_ar}
                            </span>
                            <span className={isRight ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-red-600 font-bold'}>
                              {isRight
                                ? (lang === 'ar' ? 'إجابة صحيحة' : 'Correct')
                                : `${lang === 'ar' ? 'الصواب:' : 'Answer:'} ${q.options_ar[q.correct_index ?? 0]}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Teacher Feedback Box */}
                  {ex.result && (ex.result.feedback_ar || ex.result.feedback_en) && (
                    <div className="text-xs text-slate-700 dark:text-slate-200 pt-2 border-t border-[#E5DEC9] dark:border-[#233C63]">
                      <span className="font-bold">{lang === 'ar' ? 'تعليق المعلم:' : 'Teacher Feedback:'}</span>{' '}
                      {lang === 'ar' ? ex.result.feedback_ar : ex.result.feedback_en || ex.result.feedback_ar}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <div className="pt-2 space-y-3">
          <h3 className="text-lg font-extrabold">{lang === 'ar' ? 'ملخص الدرجات المرصودة' : 'Graded Results Summary'}</h3>
          <ResponsiveTable
            data={data.examResults}
            emptyTitle={lang === 'ar' ? 'لا توجد درجات مرصودة بعد' : 'No graded results yet'}
            columns={[
              { key: 'exam', header: lang === 'ar' ? 'الامتحان' : 'Exam', render: (r) => tField(r as unknown as Record<string, unknown>, 'exam_title', lang) },
              { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => tField(r as unknown as Record<string, unknown>, 'course_title', lang) },
              { key: 'score', header: lang === 'ar' ? 'الدرجة' : 'Score', align: 'end', render: (r) => <span className="font-mono-tabular font-bold">{r.score} / {r.max_score}</span> },
              { key: 'feedback', header: lang === 'ar' ? 'ملاحظة المعلم' : 'Teacher Feedback', render: (r) => tField(r as unknown as Record<string, unknown>, 'feedback', lang) || '—' },
            ]}
          />
        </div>
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
                  onClick={async () => {
                    const { generateCertificatePDF } = await import('../../lib/pdfCertificate');
                    await generateCertificatePDF({
                      verification_code: cert.verification_code,
                      student_name_ar: data.student.full_name_ar,
                      student_name_en: data.student.full_name_en,
                      course_title_ar: cert.course_title_ar,
                      course_title_en: cert.course_title_en,
                      title_ar: cert.title_ar,
                      title_en: cert.title_en,
                      grade_label: cert.grade_label,
                      issued_at: cert.issued_at,
                    });
                  }}
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
      <Card className="p-5 bg-[#F2EFE6] dark:bg-[#13284A] border-[#C98A1E]/40 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#C98A1E]">
              {lang === 'ar' ? 'كود الطالب الخاص لربط حساب ولي الأمر' : 'Unique Student Code for Guardian Linking'}
            </div>
            <div className="text-lg font-mono-tabular font-extrabold tracking-wider text-[#0F213E] dark:text-[#F8F5EC]">
              {data.student.student_code}
            </div>
          </div>
          <PrimaryButton type="button" onClick={() => void copyStudentCode()} className="text-xs">
            {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedCode ? (lang === 'ar' ? 'تم النسخ' : 'Copied') : lang === 'ar' ? 'نسخ الكود' : 'Copy Code'}</span>
          </PrimaryButton>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {lang === 'ar'
            ? `يمكن لولي الأمر تفعيل حسابه من صفحة الدخول باستخدام هذا الكود مع البريد المسجّل (${data.student.guardian_email || 'لدى الإدارة'}).`
            : `Your guardian can activate their portal account on the Sign-In page using this code plus their registered email (${data.student.guardian_email || 'on file'}).`}
        </p>
      </Card>
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
      <MyCommunityPanel />
    </div>
  );
}
