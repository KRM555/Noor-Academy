import React, { useState, useCallback, useEffect } from 'react';
import {
  FileText,
  Upload,
  Download,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  ClipboardCheck,
  Pencil,
  RotateCcw,
  ShieldCheck,
  ListChecks,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { Card, PrimaryButton, SecondaryButton, EmptyState } from '../ui/CommonUI';

export type ExamMode = 'file' | 'quiz' | 'hybrid';

export interface QuizQuestionItem {
  id?: string;
  q_type: 'mcq' | 'tf';
  prompt_ar: string;
  prompt_en?: string;
  options_ar: string[];
  options_en?: string[];
  correct_index: number;
  points: number;
}

export interface ManagedExamItem {
  id: number;
  course_id: number;
  title_ar: string;
  title_en?: string;
  course_title_ar: string;
  course_title_en?: string;
  exam_date: string;
  max_score: number;
  exam_mode?: ExamMode;
  instructions_ar?: string;
  instructions_en?: string;
  available_from?: string | null;
  due_at?: string | null;
  time_limit_minutes?: number | null;
  allow_late_submission?: boolean;
  show_answers_after_submit?: boolean;
  has_question_file?: boolean;
  question_file_name?: string | null;
  question_count?: number;
  questions?: QuizQuestionItem[];
  submission_count?: number;
  pending_grading_count?: number;
  graded_count?: number;
}

interface SubmissionRow {
  student_id: number;
  student_code: string;
  full_name_ar: string;
  full_name_en: string;
  overall_status: 'not_submitted' | 'submitted_pending' | 'graded';
  submission: {
    status: string;
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
    graded_at: string | null;
  } | null;
  result: {
    score: number;
    feedback_ar: string;
    feedback_en: string;
    graded_at: string;
  } | null;
}

function openExternalSafely(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function ExamCenter({
  courses,
  exams,
  onReload,
  fixedCourseId,
}: {
  courses: Array<{ id: number; title_ar: string; title_en?: string }>;
  exams: ManagedExamItem[];
  onReload: () => void;
  fixedCourseId?: number;
}) {
  const { lang, toast } = useApp();

  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [courseId, setCourseId] = useState<string>(String(fixedCourseId ?? courses[0]?.id ?? '1'));
  const [titleAr, setTitleAr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [examDate, setExamDate] = useState('2026-11-25');
  const [dueAt, setDueAt] = useState('2026-11-30');
  const [availableFrom, setAvailableFrom] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [timeLimitMinutes, setTimeLimitMinutes] = useState('');
  const [examMode, setExamMode] = useState<ExamMode>('file');
  const [instructionsAr, setInstructionsAr] = useState('');
  const [allowLate, setAllowLate] = useState(true);
  const [showAnswers, setShowAnswers] = useState(true);
  const [notifyStudents, setNotifyStudents] = useState(true);
  const [pendingQuestionFile, setPendingQuestionFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<QuizQuestionItem[]>([]);
  const [savingExam, setSavingExam] = useState(false);

  // Grading workspace state
  const [gradingExam, setGradingExam] = useState<ManagedExamItem | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [gradeInputs, setGradeInputs] = useState<Record<number, { score: string; feedback: string; file: File | null }>>({});
  const [savingGradeId, setSavingGradeId] = useState<number | null>(null);

  useEffect(() => {
    if (fixedCourseId) {
      setCourseId(String(fixedCourseId));
      setGradingExam(null);
      setEditingExamId(null);
    }
  }, [fixedCourseId]);

  const resetForm = useCallback(() => {
    setEditingExamId(null);
    setCourseId(String(fixedCourseId ?? courses[0]?.id ?? '1'));
    setTitleAr('');
    setTitleEn('');
    setExamDate('2026-11-25');
    setDueAt('2026-11-30');
    setAvailableFrom('');
    setMaxScore('100');
    setTimeLimitMinutes('');
    setExamMode('file');
    setInstructionsAr('');
    setAllowLate(true);
    setShowAnswers(true);
    setNotifyStudents(true);
    setPendingQuestionFile(null);
    setQuestions([]);
  }, [courses, fixedCourseId]);

  const startEditExam = (ex: ManagedExamItem) => {
    setEditingExamId(ex.id);
    setCourseId(String(ex.course_id));
    setTitleAr(ex.title_ar);
    setTitleEn(ex.title_en || '');
    setExamDate(String(ex.exam_date).slice(0, 10));
    setDueAt(ex.due_at ? String(ex.due_at).slice(0, 10) : '');
    setAvailableFrom(ex.available_from ? String(ex.available_from).slice(0, 10) : '');
    setMaxScore(String(ex.max_score || 100));
    setTimeLimitMinutes(ex.time_limit_minutes && ex.time_limit_minutes > 0 ? String(ex.time_limit_minutes) : '');
    setExamMode(ex.exam_mode || 'file');
    setInstructionsAr(ex.instructions_ar || '');
    setAllowLate(ex.allow_late_submission ?? true);
    setShowAnswers(ex.show_answers_after_submit ?? true);
    setPendingQuestionFile(null);
    setQuestions(ex.questions ? ex.questions.map((q) => ({ ...q })) : []);
  };

  const addQuestion = (qType: 'mcq' | 'tf') => {
    setQuestions((prev) => [
      ...prev,
      qType === 'tf'
        ? {
            q_type: 'tf',
            prompt_ar: '',
            options_ar: ['صح', 'خطأ'],
            correct_index: 0,
            points: 5,
          }
        : {
            q_type: 'mcq',
            prompt_ar: '',
            options_ar: ['', '', '', ''],
            correct_index: 0,
            points: 5,
          },
    ]);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleAr.trim()) return;
    if (pendingQuestionFile && pendingQuestionFile.size > 8 * 1024 * 1024) {
      toast(lang === 'ar' ? 'الحد الأقصى لملف الأسئلة 8 ميجابايت' : 'Max file size is 8 MB', 'error');
      return;
    }

    const cleanedQuestions =
      examMode === 'file'
        ? []
        : questions.map((q) => ({
            ...q,
            options_ar:
              q.q_type === 'tf'
                ? ['صح', 'خطأ']
                : q.options_ar.map((o) => o.trim()).filter(Boolean),
          }));

    if ((examMode === 'quiz' || examMode === 'hybrid') && cleanedQuestions.length === 0) {
      toast(lang === 'ar' ? 'أضف سؤالاً واحداً على الأقل للاختبار الإلكتروني' : 'Add at least one online question', 'error');
      return;
    }
    for (let i = 0; i < cleanedQuestions.length; i++) {
      const q = cleanedQuestions[i];
      if (!q.prompt_ar.trim() || q.options_ar.length < 2 || q.correct_index >= q.options_ar.length) {
        toast(
          lang === 'ar'
            ? `يرجى استكمال نص السؤال وخياراته والإجابة الصحيحة للسؤال رقم ${i + 1}`
            : `Complete question ${i + 1} prompt, options, and correct answer`,
          'error'
        );
        return;
      }
    }

    setSavingExam(true);
    try {
      let targetExamId = editingExamId;
      if (editingExamId) {
        await apiFetch(`/api/exams/${editingExamId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title_ar: titleAr.trim(),
            title_en: titleEn.trim() || titleAr.trim(),
            exam_date: examDate,
            max_score: Number(maxScore || 100),
            exam_mode: examMode,
            instructions_ar: instructionsAr.trim(),
            available_from: availableFrom || null,
            due_at: dueAt || null,
            time_limit_minutes: Number(timeLimitMinutes || 0) > 0 ? Number(timeLimitMinutes) : 0,
            allow_late_submission: allowLate,
            show_answers_after_submit: showAnswers,
            questions: cleanedQuestions,
          }),
        });
      } else {
        const res = await apiFetch<{ id: number }>('/api/exams', {
          method: 'POST',
          body: JSON.stringify({
            course_id: fixedCourseId || Number(courseId),
            title_ar: titleAr.trim(),
            title_en: titleEn.trim() || titleAr.trim(),
            exam_date: examDate,
            max_score: Number(maxScore || 100),
            exam_mode: examMode,
            instructions_ar: instructionsAr.trim(),
            available_from: availableFrom || null,
            due_at: dueAt || null,
            time_limit_minutes: Number(timeLimitMinutes || 0) > 0 ? Number(timeLimitMinutes) : 0,
            allow_late_submission: allowLate,
            show_answers_after_submit: showAnswers,
            notify_students: notifyStudents,
            questions: cleanedQuestions,
          }),
        });
        targetExamId = res.id;
      }

      if (pendingQuestionFile && targetExamId) {
        const base64Data = await readFileAsBase64(pendingQuestionFile);
        await apiFetch(`/api/exams/${targetExamId}/question-file`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: pendingQuestionFile.name,
            mimeType: pendingQuestionFile.type || 'application/pdf',
            base64Data,
          }),
        });
      }

      toast(
        editingExamId
          ? lang === 'ar' ? 'تم تحديث الامتحان بنجاح' : 'Exam updated'
          : lang === 'ar' ? 'تم نشر الامتحان وإشعار الطلاب' : 'Exam published',
        'success'
      );
      resetForm();
      onReload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error saving exam', 'error');
    } finally {
      setSavingExam(false);
    }
  };

  const uploadQuestionFileInline = async (targetExamId: number, file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast(lang === 'ar' ? 'الحد الأقصى لحجم الملف 8 ميجابايت' : 'Max file size is 8 MB', 'error');
      return;
    }
    try {
      const base64Data = await readFileAsBase64(file);
      await apiFetch(`/api/exams/${targetExamId}/question-file`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          base64Data,
        }),
      });
      toast(lang === 'ar' ? 'تم رفع ورقة الامتحان بأمان' : 'Question file uploaded', 'success');
      onReload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  };

  const downloadQuestionFile = async (targetExamId: number) => {
    try {
      const res = await apiFetch<{ url: string }>(`/api/exams/${targetExamId}/question-file`);
      openExternalSafely(res.url);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download unavailable', 'error');
    }
  };

  const deleteExam = async (targetExamId: number) => {
    try {
      await apiFetch(`/api/exams/${targetExamId}`, { method: 'DELETE' });
      toast(lang === 'ar' ? 'تم حذف الامتحان' : 'Exam removed', 'info');
      if (gradingExam?.id === targetExamId) setGradingExam(null);
      if (editingExamId === targetExamId) resetForm();
      onReload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const openSubmissions = async (ex: ManagedExamItem) => {
    setGradingExam(ex);
    setLoadingSubs(true);
    try {
      const res = await apiFetch<{ submissions: SubmissionRow[] }>(`/api/exams/${ex.id}/submissions`);
      setSubmissions(res.submissions || []);
      const initial: Record<number, { score: string; feedback: string; file: File | null }> = {};
      for (const row of res.submissions || []) {
        const defaultScore =
          row.result?.score !== undefined
            ? String(row.result.score)
            : row.submission?.auto_score !== null && row.submission?.auto_score !== undefined
            ? String(row.submission.auto_score)
            : '';
        initial[row.student_id] = {
          score: defaultScore,
          feedback: row.result?.feedback_ar || '',
          file: null,
        };
      }
      setGradeInputs(initial);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load submissions', 'error');
    } finally {
      setLoadingSubs(false);
    }
  };

  const downloadStudentFile = async (targetExamId: number, studentId: number, kind: 'solution' | 'graded') => {
    try {
      const res = await apiFetch<{ url: string }>(`/api/exams/${targetExamId}/submissions/${studentId}/file?kind=${kind}`);
      openExternalSafely(res.url);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'File unavailable', 'error');
    }
  };

  const saveStudentGrade = async (targetExamId: number, studentId: number) => {
    const entry = gradeInputs[studentId];
    if (!entry || entry.score === '') {
      toast(lang === 'ar' ? 'أدخل الدرجة أولاً' : 'Enter a score first', 'error');
      return;
    }
    if (entry.file && entry.file.size > 8 * 1024 * 1024) {
      toast(lang === 'ar' ? 'الحد الأقصى لملف التصحيح 8 ميجابايت' : 'Max file size is 8 MB', 'error');
      return;
    }

    setSavingGradeId(studentId);
    try {
      let gradedFilePayload: { fileName: string; mimeType: string; base64Data: string } | undefined;
      if (entry.file) {
        const base64Data = await readFileAsBase64(entry.file);
        gradedFilePayload = {
          fileName: entry.file.name,
          mimeType: entry.file.type || 'application/pdf',
          base64Data,
        };
      }

      await apiFetch(`/api/exams/${targetExamId}/grade`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          score: Number(entry.score),
          feedback_ar: entry.feedback.trim(),
          feedback_en: entry.feedback.trim(),
          gradedFile: gradedFilePayload,
        }),
      });
      toast(lang === 'ar' ? 'تم اعتماد الدرجة وإشعار الطالب وولي الأمر' : 'Grade saved & notifications sent', 'success');
      if (gradingExam) await openSubmissions(gradingExam);
      onReload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Grading failed', 'error');
    } finally {
      setSavingGradeId(null);
    }
  };

  const resetSubmission = async (targetExamId: number, studentId: number) => {
    try {
      await apiFetch(`/api/exams/${targetExamId}/submissions/${studentId}/reset`, { method: 'POST' });
      toast(lang === 'ar' ? 'تم فتح إعادة التسليم للطالب' : 'Submission unlocked for retake', 'info');
      if (gradingExam) await openSubmissions(gradingExam);
      onReload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Reset failed', 'error');
    }
  };

  const modeLabel = (mode?: ExamMode) => {
    if (mode === 'quiz') return lang === 'ar' ? 'اختبار إلكتروني (تصحيح تلقائي)' : 'Auto-Graded Online Quiz';
    if (mode === 'hybrid') return lang === 'ar' ? 'امتحان مزدوج (ملف + أسئلة)' : 'Hybrid (File + Quiz)';
    return lang === 'ar' ? 'امتحان ملفات (PDF / صور)' : 'File Exam (PDF / Image)';
  };

  const visibleExams = fixedCourseId
    ? exams.filter((ex) => Number(ex.course_id) === Number(fixedCourseId))
    : courseFilter === 'all'
    ? exams
    : exams.filter((ex) => String(ex.course_id) === courseFilter);
  const fixedCourseObj = fixedCourseId ? courses.find((c) => c.id === fixedCourseId) : undefined;

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">
              {editingExamId
                ? lang === 'ar' ? 'تعديل الامتحان وإعداداته' : 'Edit Exam & Questions'
                : lang === 'ar' ? 'إنشاء امتحان هجين آمن (ملف PDF أو اختبار إلكتروني)' : 'Create Secure Hybrid Exam'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar'
                ? 'الملفات تُحفظ في خزنة خاصة لا تفتح إلا لطلاب الحلقة، والإجابات الصحيحة مشفّرة عن المتصفح حتى التسليم.'
                : 'Files are stored in a private vault accessible only to enrolled course members.'}
            </p>
          </div>
          {editingExamId && (
            <SecondaryButton type="button" onClick={resetForm}>
              {lang === 'ar' ? 'إلغاء التعديل' : 'Cancel Edit'}
            </SecondaryButton>
          )}
        </div>

        <form onSubmit={handleSaveExam} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'الحلقة / الدورة' : 'Course'}</label>
              {fixedCourseId ? (
                <div className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#F2EFE6] dark:bg-[#091529] px-3 py-2 text-sm font-bold text-[#0F766E] dark:text-[#2DD4BF] truncate">
                  {fixedCourseObj ? (lang === 'ar' ? fixedCourseObj.title_ar : fixedCourseObj.title_en || fixedCourseObj.title_ar) : `#${fixedCourseId}`}
                </div>
              ) : (
                <select
                  value={courseId}
                  disabled={Boolean(editingExamId)}
                  onChange={(e) => setCourseId(e.target.value)}
                  className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm disabled:opacity-60"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.title_ar}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'عنوان الامتحان' : 'Exam Title'}</label>
              <input
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                placeholder={lang === 'ar' ? 'مثال: اختبار الجزء الأول' : 'e.g. Midterm Exam'}
                required
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'نوع الامتحان' : 'Exam Format'}</label>
              <select
                value={examMode}
                onChange={(e) => setExamMode(e.target.value as ExamMode)}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm"
              >
                <option value="file">{lang === 'ar' ? 'ملف PDF / صور (تصحيح يدوي)' : 'PDF / Image Upload'}</option>
                <option value="quiz">{lang === 'ar' ? 'اختبار إلكتروني (تصحيح تلقائي)' : 'Interactive Online Quiz'}</option>
                <option value="hybrid">{lang === 'ar' ? 'مزدوج (ملف + أسئلة تفاعلية)' : 'Hybrid (File + Online Quiz)'}</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'الدرجة العظمى' : 'Max Score'}</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                required
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'تاريخ الامتحان' : 'Exam Date'}</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                required
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'يُفتح للطلاب من (اختياري)' : 'Opens From (optional)'}</label>
              <input
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'آخر موعد للتسليم (Deadline)' : 'Submission Deadline'}</label>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold">
                {lang === 'ar' ? 'مؤقت الامتحان (بالدقائق — 0 بلا مؤقت)' : 'Exam Timer (min, 0 = none)'}
              </label>
              <input
                type="number"
                min={0}
                max={300}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value)}
                placeholder={lang === 'ar' ? 'مثال: 30 دقيقة' : 'e.g. 30'}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="space-y-1">
              <label className="text-xs font-bold">{lang === 'ar' ? 'تعليمات وإرشادات للطالب' : 'Instructions for Students'}</label>
              <textarea
                rows={2}
                value={instructionsAr}
                onChange={(e) => setInstructionsAr(e.target.value)}
                placeholder={lang === 'ar' ? 'اكتب تعليمات الحل أو صفحات الكتاب المطلوبة...' : 'Add clear exam instructions...'}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm"
              />
            </div>

            {(examMode === 'file' || examMode === 'hybrid') && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold block">
                  {lang === 'ar' ? 'ملف الأسئلة (PDF أو صورة — حد أقصى 8 MB)' : 'Exam Question Paper (PDF / Image, max 8 MB)'}
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#C98A1E] bg-[#FAF8F3] dark:bg-[#091529] px-4 py-2.5 text-xs font-semibold cursor-pointer hover:bg-[#F2EFE6] dark:hover:bg-[#13284A] transition-colors">
                  <span className="flex items-center gap-2 truncate">
                    <Upload className="w-4 h-4 text-[#C98A1E] shrink-0" />
                    <span className="truncate">
                      {pendingQuestionFile
                        ? pendingQuestionFile.name
                        : lang === 'ar'
                        ? 'اختر ملف PDF أو صورة لورقة الامتحان...'
                        : 'Select PDF or image file...'}
                    </span>
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => setPendingQuestionFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs font-semibold">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} className="rounded" />
              <span>{lang === 'ar' ? 'السماح بالتسليم بعد الموعد مع تمييزه كـ "متأخر"' : 'Allow late submissions (flagged)'}</span>
            </label>
            {examMode !== 'file' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} className="rounded" />
                <span>{lang === 'ar' ? 'إظهار الإجابات الصحيحة للطالب بعد التسليم' : 'Show correct answers after submission'}</span>
              </label>
            )}
            {!editingExamId && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={notifyStudents} onChange={(e) => setNotifyStudents(e.target.checked)} className="rounded" />
                <span>{lang === 'ar' ? 'إرسال إشعار فوري للطلاب وأولياء الأمور' : 'Notify enrolled students & guardians'}</span>
              </label>
            )}
          </div>

          {(examMode === 'quiz' || examMode === 'hybrid') && (
            <div className="pt-4 border-t border-[#E5DEC9] dark:border-[#233C63] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-extrabold flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
                  <span>{lang === 'ar' ? `أسئلة الاختبار الإلكتروني (${questions.length})` : `Online Questions (${questions.length})`}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SecondaryButton type="button" onClick={() => addQuestion('mcq')}>
                    <Plus className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'سؤال اختيار من متعدد' : 'Add MCQ'}</span>
                  </SecondaryButton>
                  <SecondaryButton type="button" onClick={() => addQuestion('tf')}>
                    <Plus className="w-4 h-4" />
                    <span>{lang === 'ar' ? 'سؤال صح / خطأ' : 'Add True/False'}</span>
                  </SecondaryButton>
                </div>
              </div>

              {questions.map((q, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-[#0F766E] dark:text-[#2DD4BF]">
                      {lang === 'ar' ? `السؤال ${idx + 1}` : `Question ${idx + 1}`} ·{' '}
                      {q.q_type === 'tf' ? (lang === 'ar' ? 'صح / خطأ' : 'True/False') : (lang === 'ar' ? 'اختيار من متعدد' : 'MCQ')}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs">
                        <span>{lang === 'ar' ? 'النقاط:' : 'Points:'}</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={q.points}
                          onChange={(e) => {
                            const next = [...questions];
                            next[idx] = { ...q, points: Number(e.target.value || 1) };
                            setQuestions(next);
                          }}
                          className="w-16 rounded-lg border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-2 py-1 text-xs font-mono-tabular"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                        className="text-red-600 hover:underline text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'حذف' : 'Remove'}</span>
                      </button>
                    </div>
                  </div>

                  <input
                    value={q.prompt_ar}
                    onChange={(e) => {
                      const next = [...questions];
                      next[idx] = { ...q, prompt_ar: e.target.value };
                      setQuestions(next);
                    }}
                    placeholder={lang === 'ar' ? 'اكتب نص السؤال هنا...' : 'Enter question prompt...'}
                    className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options_ar.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct_${idx}`}
                          checked={q.correct_index === oIdx}
                          onChange={() => {
                            const next = [...questions];
                            next[idx] = { ...q, correct_index: oIdx };
                            setQuestions(next);
                          }}
                          title={lang === 'ar' ? 'تحديد كإجابة صحيحة' : 'Mark as correct answer'}
                        />
                        {q.q_type === 'tf' ? (
                          <span className="text-sm font-semibold">{opt}</span>
                        ) : (
                          <input
                            value={opt}
                            onChange={(e) => {
                              const next = [...questions];
                              const opts = [...q.options_ar];
                              opts[oIdx] = e.target.value;
                              next[idx] = { ...q, options_ar: opts };
                              setQuestions(next);
                            }}
                            placeholder={lang === 'ar' ? `الخيار ${oIdx + 1}` : `Option ${oIdx + 1}`}
                            className="flex-1 rounded-lg border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-2.5 py-1.5 text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <PrimaryButton type="submit" disabled={savingExam}>
              <ShieldCheck className="w-4 h-4" />
              <span>
                {savingExam
                  ? lang === 'ar' ? 'جاري الحفظ والتأمين...' : 'Saving...'
                  : editingExamId
                  ? lang === 'ar' ? 'حفظ تعديلات الامتحان' : 'Save Exam Changes'
                  : lang === 'ar' ? 'اعتماد ونشر الامتحان' : 'Publish Exam'}
              </span>
            </PrimaryButton>
          </div>
        </form>
      </Card>

      {/* Published Exams List */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold">{lang === 'ar' ? 'الامتحانات المنشأة وإدارة التصحيح' : 'Published Exams & Grading'}</h3>
          {!fixedCourseId && courses.length > 0 && (
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              aria-label={lang === 'ar' ? 'تصفية الامتحانات حسب الكورس' : 'Filter exams by course'}
              className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-1.5 text-xs font-semibold"
            >
              <option value="all">
                {lang === 'ar' ? `جميع الكورسات (${exams.length})` : `All Courses (${exams.length})`}
              </option>
              {courses.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.title_ar}
                </option>
              ))}
            </select>
          )}
        </div>
        {visibleExams.length === 0 ? (
          <EmptyState
            title={
              fixedCourseId
                ? lang === 'ar' ? 'لا توجد امتحانات منشأة في هذا الكورس بعد' : 'No exams created in this course yet'
                : lang === 'ar' ? 'لا توجد امتحانات مطابقة للفلتر الحالي' : 'No exams match this filter'
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visibleExams.map((ex) => (
              <Card key={ex.id} className="p-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {ex.course_title_ar} · {modeLabel(ex.exam_mode)}
                      </div>
                      <h4 className="text-base font-extrabold">{ex.title_ar}</h4>
                    </div>
                    <div className="text-xs font-mono-tabular font-bold text-[#C98A1E] shrink-0">
                      {ex.max_score} {lang === 'ar' ? 'درجة' : 'pts'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                    <span>{lang === 'ar' ? 'التاريخ:' : 'Date:'} {ex.exam_date}</span>
                    {ex.due_at && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{lang === 'ar' ? 'آخر تسليم:' : 'Due:'} {String(ex.due_at).slice(0, 10)}</span>
                      </>
                    )}
                    {ex.time_limit_minutes && ex.time_limit_minutes > 0 ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                          {lang === 'ar' ? `المؤقت: ${ex.time_limit_minutes} د` : `Timer: ${ex.time_limit_minutes}m`}
                        </span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>
                      {lang === 'ar' ? 'التسليمات:' : 'Submissions:'} {ex.submission_count ?? 0} ({lang === 'ar' ? 'مصوّب:' : 'Graded:'} {ex.graded_count ?? 0})
                    </span>
                    {(ex.pending_grading_count ?? 0) > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-bold text-[#C98A1E]">
                          {ex.pending_grading_count} {lang === 'ar' ? 'بانتظار التصحيح' : 'pending review'}
                        </span>
                      </>
                    )}
                  </div>

                  {ex.instructions_ar && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{ex.instructions_ar}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                    {ex.has_question_file ? (
                      <button
                        type="button"
                        onClick={() => downloadQuestionFile(ex.id)}
                        className="inline-flex items-center gap-1.5 text-[#0F766E] dark:text-[#2DD4BF] font-bold hover:underline cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{ex.question_file_name || (lang === 'ar' ? 'ورقة الأسئلة' : 'Question File')}</span>
                      </button>
                    ) : (
                      <span className="text-slate-400">{lang === 'ar' ? 'لا يوجد ملف أسئلة مرفق' : 'No file attached'}</span>
                    )}

                    <label className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-semibold hover:underline cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{ex.has_question_file ? (lang === 'ar' ? 'تحديث الملف' : 'Replace File') : (lang === 'ar' ? 'رفع ملف PDF' : 'Upload PDF')}</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadQuestionFileInline(ex.id, f);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E5DEC9] dark:border-[#233C63] flex flex-wrap items-center justify-between gap-2">
                  <PrimaryButton type="button" onClick={() => openSubmissions(ex)}>
                    <ClipboardCheck className="w-4 h-4" />
                    <span className="whitespace-nowrap">{lang === 'ar' ? 'التسليمات ورصد الدرجات' : 'Submissions & Grading'}</span>
                  </PrimaryButton>
                  <div className="flex items-center gap-3 text-xs font-bold">
                    <button type="button" onClick={() => startEditExam(ex)} className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:underline cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'تعديل' : 'Edit'}</span>
                    </button>
                    <button type="button" onClick={() => deleteExam(ex.id)} className="inline-flex items-center gap-1 text-red-600 hover:underline cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'حذف' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Grading & Submissions Workspace */}
      {gradingExam && (
        <Card className="p-6 space-y-5 border-2 border-[#0F766E]/40 dark:border-[#2DD4BF]/30">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E5DEC9] dark:border-[#233C63]">
            <div>
              <div className="text-xs text-slate-500">{gradingExam.course_title_ar}</div>
              <h3 className="text-lg font-extrabold">
                {lang === 'ar' ? `تصحيح ورصد درجات: ${gradingExam.title_ar}` : `Grading: ${gradingExam.title_ar}`}
              </h3>
            </div>
            <SecondaryButton type="button" onClick={() => setGradingExam(null)}>
              {lang === 'ar' ? 'إغلاق نافذة التصحيح' : 'Close Grading'}
            </SecondaryButton>
          </div>

          {loadingSubs ? (
            <div className="text-sm text-slate-500 py-4">{lang === 'ar' ? 'جاري تحميل تسليمات الطلاب...' : 'Loading submissions...'}</div>
          ) : submissions.length === 0 ? (
            <EmptyState title={lang === 'ar' ? 'لا يوجد طلاب مسجلون في هذه الحلقة' : 'No active students enrolled'} />
          ) : (
            <div className="space-y-4">
              {submissions.map((row) => {
                const inp = gradeInputs[row.student_id] || { score: '', feedback: '', file: null };
                return (
                  <div
                    key={row.student_id}
                    className="p-4 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#091529] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-sm">
                          {row.full_name_ar} <span className="text-xs font-mono-tabular text-slate-500">({row.student_code})</span>
                        </div>
                        <div className="text-xs flex flex-wrap items-center gap-2 mt-0.5">
                          {row.overall_status === 'graded' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {lang === 'ar' ? `تم التصحيح (${row.result?.score} / ${gradingExam.max_score})` : `Graded (${row.result?.score} / ${gradingExam.max_score})`}
                            </span>
                          ) : row.overall_status === 'submitted_pending' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-[#C98A1E]">
                              <Clock className="w-3.5 h-3.5" />
                              {lang === 'ar' ? 'تم تسليم الحل — بانتظار التصحيح' : 'Submitted — Awaiting Grading'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-500">
                              <AlertCircle className="w-3.5 h-3.5" />
                              {lang === 'ar' ? 'لم يرفع الحل بعد' : 'Not submitted yet'}
                            </span>
                          )}
                          {row.submission?.is_late && (
                            <span className="text-red-600 font-bold">· {lang === 'ar' ? 'تسليم متأخر' : 'Late'}</span>
                          )}
                          {row.submission?.timed_out && (
                            <span className="text-[#C98A1E] font-bold">· {lang === 'ar' ? 'أُغلق تلقائياً بانتهاء الوقت' : 'Auto-closed (timeout)'}</span>
                          )}
                          {row.submission?.auto_score !== null && row.submission?.auto_score !== undefined && (
                            <span className="font-mono-tabular text-slate-600 dark:text-slate-300">
                              · {lang === 'ar' ? `نتيجة الأسئلة التفاعلية: ${row.submission.auto_score}` : `Auto-quiz: ${row.submission.auto_score}`}
                            </span>
                          )}
                        </div>
                        {row.submission?.student_notes && (
                          <div className="text-xs text-slate-500 mt-1">
                            {lang === 'ar' ? 'ملاحظة الطالب:' : 'Student note:'} {row.submission.student_notes}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {row.submission?.has_solution_file && (
                          <SecondaryButton
                            type="button"
                            onClick={() => downloadStudentFile(gradingExam.id, row.student_id, 'solution')}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{row.submission.solution_file_name || (lang === 'ar' ? 'تنزيل حل الطالب' : 'Download Solution')}</span>
                          </SecondaryButton>
                        )}
                        {row.submission?.has_graded_file && (
                          <SecondaryButton
                            type="button"
                            onClick={() => downloadStudentFile(gradingExam.id, row.student_id, 'graded')}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'ملف التصحيح' : 'Graded File'}</span>
                          </SecondaryButton>
                        )}
                        {row.submission && (
                          <button
                            type="button"
                            onClick={() => resetSubmission(gradingExam.id, row.student_id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-red-600 cursor-pointer px-2 py-1"
                            title={lang === 'ar' ? 'السماح للطالب برفع حل جديد أو إعادة الاختبار' : 'Reset submission'}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{lang === 'ar' ? 'إتاحة إعادة التسليم' : 'Allow Retake'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Grading Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center pt-2 border-t border-[#E5DEC9]/70 dark:border-[#233C63]/70">
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min={0}
                          max={gradingExam.max_score}
                          step="0.5"
                          placeholder={lang === 'ar' ? `من ${gradingExam.max_score}` : `/${gradingExam.max_score}`}
                          value={inp.score}
                          onChange={(e) =>
                            setGradeInputs({
                              ...gradeInputs,
                              [row.student_id]: { ...inp, score: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm font-mono-tabular"
                        />
                      </div>
                      <div className="sm:col-span-5">
                        <input
                          placeholder={lang === 'ar' ? 'ملاحظات وتوجيهات المعلم للطالب وولي الأمر...' : 'Teacher feedback...'}
                          value={inp.feedback}
                          onChange={(e) =>
                            setGradeInputs({
                              ...gradeInputs,
                              [row.student_id]: { ...inp, feedback: e.target.value },
                            })
                          }
                          className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="flex items-center gap-1.5 rounded-xl border border-dashed border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-3 py-2 text-xs cursor-pointer truncate">
                          <Upload className="w-3.5 h-3.5 shrink-0 text-[#C98A1E]" />
                          <span className="truncate">
                            {inp.file ? inp.file.name : lang === 'ar' ? 'إرفاق ورقة مصححة (اختياري)' : 'Graded PDF (optional)'}
                          </span>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp"
                            className="hidden"
                            onChange={(e) =>
                              setGradeInputs({
                                ...gradeInputs,
                                [row.student_id]: { ...inp, file: e.target.files?.[0] || null },
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="sm:col-span-2">
                        <PrimaryButton
                          type="button"
                          disabled={savingGradeId === row.student_id}
                          onClick={() => saveStudentGrade(gradingExam.id, row.student_id)}
                          className="w-full justify-center"
                        >
                          <span className="whitespace-nowrap">
                            {savingGradeId === row.student_id
                              ? lang === 'ar' ? 'حفظ...' : 'Saving...'
                              : lang === 'ar' ? 'رصد الدرجة' : 'Save Grade'}
                          </span>
                        </PrimaryButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
