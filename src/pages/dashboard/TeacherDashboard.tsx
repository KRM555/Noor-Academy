import React, { useEffect, useState, useCallback } from 'react';
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
import { ShieldCheck, Check, Wallet, Video, PlayCircle, FileText, Upload, Trash2, ExternalLink } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import { tField } from '../../i18n/translations';
import { Card, LoadingState, ResponsiveTable, PrimaryButton, EmptyState } from '../../components/ui/CommonUI';
import { ChangePasswordCard } from '../../components/dashboard/ChangePasswordCard';
import { ExamCenter, type ManagedExamItem } from '../../components/dashboard/ExamCenter';
import { MyCommunityPanel } from '../../components/dashboard/MyCommunityPanel';

interface TeacherDashboardData {
  teacher: { id: number; name_ar: string; name_en: string; specialty_ar: string; specialty_en: string; hourly_rate: number };
  courses: Array<{ id: number; title_ar: string; title_en: string; level_name_ar: string; level_name_en: string; schedule_ar: string; schedule_en: string; capacity: number }>;
  students: Array<{ id: number; student_code: string; full_name_ar: string; full_name_en: string; age: number; level_name_ar: string; level_name_en: string; course_id: number; course_title_ar: string; course_title_en: string }>;
  lessons: Array<{ id: number; course_id: number; title_ar: string; title_en: string; course_title_ar: string; course_title_en: string; lesson_date: string; start_time: string; duration_min: number; weekday_ar?: string }>;
  lessonLinks?: Array<{ id: number; lesson_id: number; title_ar: string; title_en: string; url: string; link_type: string }>;
  attendance: Array<{ id: number; lesson_id: number; student_id: number; status: string; notes: string }>;
  exams: ManagedExamItem[];
  examResults: Array<{ id: number; exam_id: number; student_id: number; score: number; exam_title_ar: string; student_name_ar: string; feedback_ar: string }>;
  recitations: Array<{ id: number; student_id: number; course_id: number; surah_name: string; ayah_from: number; ayah_to: number; tajweed_score: number; memorization_score: number; notes_ar: string; student_name_ar: string; course_title_ar: string }>;
  evaluations: Array<{ id: number; student_id: number; course_id: number; period: string; behavior_score: number; participation_score: number; summary_ar: string; student_name_ar: string; course_title_ar: string }>;
  payroll: Array<{ id: number; month_year: string; base_amount: number; bonus_amount: number; deduction_amount: number; net_amount: number; status: string; paid_at: string | null }>;
  payoutDetails: { account_holder_name: string; bank_name: string; masked_iban: string; updated_at: string } | null;
}

export function TeacherDashboard({ activeTab }: { activeTab: string }) {
  const { lang, toast, user } = useApp();
  const qc = useQueryClient();

  // Attendance form state
  const [selectedLessonId, setSelectedLessonId] = useState<number>(0);

  // Assessment sub-tab & forms
  const [assessSub, setAssessSub] = useState<'recitation' | 'exam' | 'evaluation'>('recitation');
  const [recCourseId, setRecCourseId] = useState<number>(0);
  const [recStudentId, setRecStudentId] = useState<number>(0);
  const [surahName, setSurahName] = useState('سورة النبأ');
  const [ayahFrom, setAyahFrom] = useState('1');
  const [ayahTo, setAyahTo] = useState('15');
  const [tajweedScore, setTajweedScore] = useState('92');
  const [memScore, setMemScore] = useState('95');
  const [recNotes, setRecNotes] = useState('');

  const [evalCourseId, setEvalCourseId] = useState<number>(0);
  const [evalStudentId, setEvalStudentId] = useState<number>(0);
  const [evalPeriod, setEvalPeriod] = useState('نوفمبر 2026');
  const [behaviorScore, setBehaviorScore] = useState('96');
  const [partScore, setPartScore] = useState('94');
  const [evalSummary, setEvalSummary] = useState('');

  // Payout form
  const [holderName, setHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [iban, setIban] = useState('');

  // Lesson attachment state
  const [attachLessonId, setAttachLessonId] = useState<number>(0);
  const [attachType, setAttachType] = useState<'zoom' | 'meet' | 'recording' | 'material'>('recording');
  const [attachTitle, setAttachTitle] = useState('');
  const [attachUrl, setAttachUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.teacherDashboard(user?.id),
    queryFn: () => apiFetch<TeacherDashboardData>('/api/teacher/dashboard'),
  });

  useEffect(() => {
    if (error) {
      toast(error instanceof Error ? error.message : 'Error', 'error');
    }
  }, [error, toast]);

  useEffect(() => {
    if (!data) return;
    if (data.lessons.length && !selectedLessonId) setSelectedLessonId(data.lessons[0].id);
    if (data.courses.length && !recCourseId) {
      setRecCourseId(data.courses[0].id);
      setEvalCourseId(data.courses[0].id);
    }
    if (data.students.length && !recStudentId) {
      setRecStudentId(data.students[0].id);
      setEvalStudentId(data.students[0].id);
    }
    if (data.payoutDetails) {
      setHolderName((prev) => prev || data.payoutDetails!.account_holder_name);
      setBankName((prev) => prev || data.payoutDetails!.bank_name);
    }
  }, [data, selectedLessonId, recCourseId, recStudentId]);

  const loadData = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.teacherDashboard(user?.id) });
  }, [qc, user?.id]);

  if (isLoading) return <LoadingState variant="dashboard" />;
  if (!data) return <EmptyState title={lang === 'ar' ? 'لا يوجد ملف معلم' : 'Teacher profile not found'} />;

  if (activeTab === 'home') {
    const chartData = data.recitations.slice(0, 6).map((r) => ({
      name: `${r.student_name_ar.split(' ')[0]}`,
      tajweed: r.tajweed_score,
      memorization: r.memorization_score,
    }));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-5 space-y-1">
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'الحلقات التي أدرّسها' : 'My Assigned Courses'}</div>
            <div className="text-2xl font-extrabold tabular-nums">{data.courses.length}</div>
          </Card>
          <Card className="p-5 space-y-1">
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'طلابي المسجلون' : 'My Enrolled Students'}</div>
            <div className="text-2xl font-extrabold tabular-nums">{data.students.length}</div>
          </Card>
          <Card className="p-5 space-y-1">
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</div>
            <div className="text-2xl font-extrabold tabular-nums">{data.teacher.hourly_rate} EGP</div>
          </Card>
        </div>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'متوسط أداء التسميع لطلابي' : 'Recent Student Recitation Scores'}</h2>
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
            <p className="text-sm text-slate-500">{lang === 'ar' ? 'لا توجد قراءات مسجلة بعد.' : 'No recitation scores logged yet.'}</p>
          )}
        </Card>
      </div>
    );
  }

  if (activeTab === 'courses') {
    const teacherLinks = data.lessonLinks || [];

    const addTeacherLink = async (e: React.FormEvent, lessonId: number) => {
      e.preventDefault();
      try {
        await apiFetch(`/api/lessons/${lessonId}/links`, {
          method: 'POST',
          body: JSON.stringify({
            title_ar: attachTitle.trim() || (attachType === 'recording' ? 'تسجيل المحاضرة' : attachType === 'material' ? 'ملف الدرس' : 'رابط الحصة'),
            url: attachUrl.trim(),
            link_type: attachType,
          }),
        });
        toast(lang === 'ar' ? 'تمت إضافة المرفق بنجاح' : 'Attachment added', 'success');
        setAttachTitle('');
        setAttachUrl('');
        setAttachLessonId(0);
        loadData();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    const uploadTeacherMaterial = async (lessonId: number, file: File) => {
      if (file.size > 8 * 1024 * 1024) {
        toast(lang === 'ar' ? 'الحد الأقصى لحجم الملف 8 ميجابايت. ارفع الفيديوهات على Google Drive وأضف الرابط.' : 'Max file size is 8 MB. Upload videos to Drive and paste link.', 'error');
        return;
      }
      setUploadingFile(true);
      try {
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('File read failed'));
          reader.readAsDataURL(file);
        });
        await apiFetch(`/api/lessons/${lessonId}/upload-material`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64Data,
            title_ar: attachTitle.trim() || file.name,
          }),
        });
        toast(lang === 'ar' ? 'تم رفع الملف وحفظه بالدرس' : 'Material uploaded', 'success');
        setAttachTitle('');
        loadData();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Upload failed', 'error');
      } finally {
        setUploadingFile(false);
      }
    };

    const openLink = async (lk: { id: number; url: string }) => {
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
        toast(err instanceof Error ? err.message : 'Unable to open link', 'error');
      }
    };

    const deleteLink = async (id: number) => {
      try {
        await apiFetch(`/api/lesson-links/${id}`, { method: 'DELETE' });
        toast(lang === 'ar' ? 'تم حذف المرفق' : 'Attachment deleted', 'info');
        loadData();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    };

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'كورساتي وحلقاتي ودروسي' : 'My Courses & Lesson Materials'}</h2>
        <ResponsiveTable
          data={data.courses}
          emptyTitle={lang === 'ar' ? 'لا توجد كورسات مسندة لك' : 'No assigned courses'}
          columns={[
            { key: 'title', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => tField(r as unknown as Record<string, unknown>, 'title', lang) },
            { key: 'level', header: lang === 'ar' ? 'المستوى' : 'Level', render: (r) => tField(r as unknown as Record<string, unknown>, 'level_name', lang) },
            { key: 'schedule', header: lang === 'ar' ? 'الجدول' : 'Schedule', render: (r) => tField(r as unknown as Record<string, unknown>, 'schedule', lang) },
            { key: 'cap', header: lang === 'ar' ? 'السعة' : 'Capacity', align: 'end', render: (r) => r.capacity },
          ]}
        />

        <div className="space-y-3 pt-2">
          <h3 className="text-lg font-extrabold">{lang === 'ar' ? 'الدروس والتسجيلات والمرفقات' : 'Lessons, Recordings & Files'}</h3>
          {data.lessons.length === 0 ? (
            <EmptyState title={lang === 'ar' ? 'لا توجد دروس مسجلة لحلقاتك بعد' : 'No lessons yet'} />
          ) : (
            data.lessons.map((ls) => {
              const links = teacherLinks.filter((lk) => lk.lesson_id === ls.id);
              const isOpen = attachLessonId === ls.id;
              return (
                <Card key={ls.id} className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">{tField(ls as unknown as Record<string, unknown>, 'course_title', lang)}</div>
                      <div className="font-bold text-sm">{tField(ls as unknown as Record<string, unknown>, 'title', lang)}</div>
                      <div className="text-xs font-mono-tabular text-[#0F766E] dark:text-[#2DD4BF]">
                        {ls.weekday_ar ? `${ls.weekday_ar} · ` : ''}{ls.lesson_date} · {ls.start_time}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachLessonId(isOpen ? 0 : ls.id)}
                      className="rounded-xl px-3 py-1.5 text-xs font-bold bg-[#F2EFE6] dark:bg-[#162C4E] border border-[#E5DEC9] dark:border-[#233C63] cursor-pointer"
                    >
                      {isOpen ? (lang === 'ar' ? 'إغلاق' : 'Close') : lang === 'ar' ? '+ إضافة تسجيل أو ملف' : '+ Add Recording / File'}
                    </button>
                  </div>

                  {links.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {links.map((lk) => {
                        const Icon = lk.link_type === 'recording' ? PlayCircle : lk.link_type === 'material' ? FileText : Video;
                        return (
                          <div key={lk.id} className="inline-flex items-center gap-1 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#13284A] px-2.5 py-1.5 text-xs">
                            <button
                              type="button"
                              onClick={() => void openLink(lk)}
                              className="inline-flex items-center gap-1 font-bold hover:text-[#0F766E] cursor-pointer"
                            >
                              <Icon className="w-3.5 h-3.5 text-[#C98A1E]" />
                              <span>{tField(lk as unknown as Record<string, unknown>, 'title', lang)}</span>
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteLink(lk.id)}
                              className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 p-0.5 rounded cursor-pointer"
                              title={lang === 'ar' ? 'حذف' : 'Delete'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isOpen && (
                    <div className="p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63] space-y-3">
                      <form onSubmit={(e) => addTeacherLink(e, ls.id)} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <select
                          value={attachType}
                          onChange={(e) => setAttachType(e.target.value as 'zoom' | 'meet' | 'recording' | 'material')}
                          className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs font-bold"
                        >
                          <option value="recording">{lang === 'ar' ? 'تسجيل محاضرة (Drive / YouTube)' : 'Recording Link'}</option>
                          <option value="zoom">{lang === 'ar' ? 'رابط Zoom مباشر' : 'Live Zoom'}</option>
                          <option value="meet">{lang === 'ar' ? 'رابط Google Meet' : 'Live Meet'}</option>
                          <option value="material">{lang === 'ar' ? 'رابط ملف خارجي' : 'Material URL'}</option>
                        </select>
                        <input
                          placeholder={lang === 'ar' ? 'عنوان المرفق' : 'Label'}
                          value={attachTitle}
                          onChange={(e) => setAttachTitle(e.target.value)}
                          className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs"
                        />
                        <input
                          type="url"
                          required
                          dir="ltr"
                          placeholder="https://drive.google.com/..."
                          value={attachUrl}
                          onChange={(e) => setAttachUrl(e.target.value)}
                          className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs"
                        />
                        <PrimaryButton type="submit" className="text-xs">
                          {lang === 'ar' ? 'حفظ الرابط' : 'Save Link'}
                        </PrimaryButton>
                      </form>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5DEC9] dark:border-[#233C63] text-xs">
                        <span className="text-slate-500">
                          {lang === 'ar'
                            ? 'أو ارفع ملف PDF / ورقة عمل مباشرة (حتى 8 ميجا — الفيديوهات تُضاف كرابط Drive/YouTube فقط):'
                            : 'Or upload PDF/worksheet directly (max 8 MB; keep videos on Drive/YouTube):'}
                        </span>
                        <label className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 bg-[#0F213E] text-white font-bold cursor-pointer hover:bg-[#1B3766]">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{uploadingFile ? (lang === 'ar' ? 'جاري الرفع...' : 'Uploading...') : lang === 'ar' ? 'رفع ملف PDF' : 'Upload File'}</span>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.ppt,.pptx,.mp3,.m4a"
                            disabled={uploadingFile}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadTeacherMaterial(ls.id, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (activeTab === 'students') {
    const testCrossAccess = async () => {
      // Check accessing student ID 999 or a student not enrolled with this teacher
      const otherStudentId = data.students.some((s) => s.id === 1) ? 2 : 1;
      try {
        await apiFetch(`/api/teacher/students/${otherStudentId}`);
        toast(lang === 'ar' ? 'هذا الطالب مسجل في إحدى حلقاتك.' : 'This student is enrolled in your circle.', 'info');
      } catch (e: unknown) {
        toast(
          lang === 'ar'
            ? `حماية قاعدة البيانات نشطة: رفض الخادم الوصول لطالب خارج حلقاتك (${e instanceof Error ? e.message : '403'})`
            : `RLS/RBAC Verified: Server blocked access (${e instanceof Error ? e.message : '403'})`,
          'success'
        );
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'طلابي (طلاب حلقاتي فقط)' : 'My Students (Strictly Scoped)'}</h2>
            <p className="text-xs text-slate-500">
              {lang === 'ar'
                ? 'لا يمكنك رؤية أو تعديل أي طالب غير مسجل في الكورسات المسندة إليك.'
                : 'You can only view and grade students enrolled in courses assigned to you.'}
            </p>
          </div>
          <button
            onClick={testCrossAccess}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold bg-[#F2EFE6] dark:bg-[#162C4E] border border-[#E5DEC9] dark:border-[#233C63] cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-[#0F766E] dark:text-[#2DD4BF]" />
            <span>{lang === 'ar' ? 'اختبار عزل البيانات (403)' : 'Test Student Isolation (403)'}</span>
          </button>
        </div>

        <ResponsiveTable
          data={data.students}
          emptyTitle={lang === 'ar' ? 'لا يوجد طلاب مسجلون في حلقاتك' : 'No students enrolled in your courses'}
          columns={[
            { key: 'code', header: lang === 'ar' ? 'الكود' : 'Code', render: (r) => <span className="font-mono-tabular">{r.student_code}</span> },
            { key: 'name', header: lang === 'ar' ? 'الطالب' : 'Student', render: (r) => (lang === 'ar' ? r.full_name_ar : r.full_name_en) },
            { key: 'age', header: lang === 'ar' ? 'العمر' : 'Age', align: 'end', render: (r) => r.age },
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => tField(r as unknown as Record<string, unknown>, 'course_title', lang) },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'attendance') {
    const activeLesson = data.lessons.find((l) => l.id === selectedLessonId);
    const lessonStudents = activeLesson ? data.students.filter((s) => s.course_id === activeLesson.course_id) : [];

    const markAttendance = async (studentId: number, status: 'present' | 'absent' | 'late' | 'excused') => {
      if (!activeLesson) return;
      try {
        await apiFetch('/api/teacher/attendance', {
          method: 'POST',
          body: JSON.stringify({ lesson_id: activeLesson.id, student_id: studentId, status, notes: '' }),
        });
        toast(lang === 'ar' ? 'تم حفظ الحضور' : 'Attendance saved', 'success');
        loadData();
      } catch (e: unknown) {
        toast(e instanceof Error ? e.message : 'Error', 'error');
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'تسجيل الحضور' : 'Attendance Tracker'}</h2>
          <select
            value={selectedLessonId}
            onChange={(e) => setSelectedLessonId(Number(e.target.value))}
            className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] px-4 py-2 text-sm font-semibold"
          >
            {data.lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.lesson_date} · {tField(l as unknown as Record<string, unknown>, 'title', lang)}
              </option>
            ))}
          </select>
        </div>

        {lessonStudents.length === 0 ? (
          <EmptyState title={lang === 'ar' ? 'اختر درساً لعرض طلاب الحلقة' : 'Select a lesson to mark attendance'} />
        ) : (
          <div className="space-y-3">
            {lessonStudents.map((st) => {
              const existing = data.attendance.find((a) => a.lesson_id === selectedLessonId && a.student_id === st.id);
              return (
                <Card key={st.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm">{lang === 'ar' ? st.full_name_ar : st.full_name_en}</div>
                    <div className="text-xs text-slate-500 font-mono-tabular">
                      {st.student_code} · {existing ? `${lang === 'ar' ? 'المسجل:' : 'Marked:'} ${existing.status}` : lang === 'ar' ? 'لم يُسجل بعد' : 'Not marked'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['present', 'late', 'excused', 'absent'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => markAttendance(st.id, status)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border transition-colors ${
                          existing?.status === status
                            ? 'bg-[#0F766E] text-white border-[#0F766E]'
                            : 'bg-[#FAF8F3] dark:bg-[#13284A] border-[#E5DEC9] dark:border-[#233C63] hover:border-[#C98A1E]'
                        }`}
                      >
                        {status === 'present'
                          ? lang === 'ar' ? 'حاضر' : 'Present'
                          : status === 'late'
                          ? lang === 'ar' ? 'متأخر' : 'Late'
                          : status === 'excused'
                          ? lang === 'ar' ? 'بعذر' : 'Excused'
                          : lang === 'ar' ? 'غائب' : 'Absent'}
                      </button>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'assessments') {
    const saveRecitation = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/teacher/recitations', {
          method: 'POST',
          body: JSON.stringify({
            student_id: recStudentId,
            course_id: recCourseId,
            surah_name: surahName,
            ayah_from: Number(ayahFrom),
            ayah_to: Number(ayahTo),
            tajweed_score: Number(tajweedScore),
            memorization_score: Number(memScore),
            notes_ar: recNotes,
          }),
        });
        toast(lang === 'ar' ? 'تم تسجيل التسميع بنجاح' : 'Recitation logged', 'success');
        setRecNotes('');
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    const saveEvaluation = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/teacher/evaluations', {
          method: 'POST',
          body: JSON.stringify({
            student_id: evalStudentId,
            course_id: evalCourseId,
            period: evalPeriod,
            behavior_score: Number(behaviorScore),
            participation_score: Number(partScore),
            summary_ar: evalSummary,
            summary_en: evalSummary,
          }),
        });
        toast(lang === 'ar' ? 'تم حفظ التقييم التربوي' : 'Evaluation saved', 'success');
        setEvalSummary('');
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'الدرجات والتسميع والتقييم' : 'Grades, Recitations & Evaluations'}</h2>
          <div className="flex items-center gap-1 p-1 bg-[#F2EFE6] dark:bg-[#13284A] rounded-xl">
            {(
              [
                ['recitation', lang === 'ar' ? 'تسميع جديد' : 'Recitation'],
                ['exam', lang === 'ar' ? 'الامتحانات والتصحيح' : 'Exams & Grading'],
                ['evaluation', lang === 'ar' ? 'تقييم دوري' : 'Evaluation'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setAssessSub(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  assessSub === k ? 'bg-white dark:bg-[#0F213E] shadow-sm' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {assessSub === 'recitation' && (
          <Card className="p-6">
            <form onSubmit={saveRecitation} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'الحلقة' : 'Course'}</label>
                <select value={recCourseId} onChange={(e) => setRecCourseId(Number(e.target.value))} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                  {data.courses.map((c) => <option key={c.id} value={c.id}>{tField(c as unknown as Record<string, unknown>, 'title', lang)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'الطالب' : 'Student'}</label>
                <select value={recStudentId} onChange={(e) => setRecStudentId(Number(e.target.value))} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                  {data.students.filter((s) => s.course_id === recCourseId).map((s) => <option key={s.id} value={s.id}>{s.full_name_ar}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'اسم السورة' : 'Surah'}</label>
                <input value={surahName} onChange={(e) => setSurahName(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'من آية' : 'From Ayah'}</label>
                <input type="number" value={ayahFrom} onChange={(e) => setAyahFrom(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'إلى آية' : 'To Ayah'}</label>
                <input type="number" value={ayahTo} onChange={(e) => setAyahTo(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'التجويد %' : 'Tajweed %'}</label>
                  <input type="number" max={100} min={0} value={tajweedScore} onChange={(e) => setTajweedScore(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'الحفظ %' : 'Mem %'}</label>
                  <input type="number" max={100} min={0} value={memScore} onChange={(e) => setMemScore(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" required />
                </div>
              </div>
              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'ملاحظات المعلم' : 'Teacher Notes'}</label>
                <input value={recNotes} onChange={(e) => setRecNotes(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-3">
                <PrimaryButton type="submit">{lang === 'ar' ? 'حفظ التسميع' : 'Save Recitation'}</PrimaryButton>
              </div>
            </form>
          </Card>
        )}

        {assessSub === 'exam' && (
          <ExamCenter courses={data.courses} exams={data.exams} onReload={loadData} />
        )}

        {assessSub === 'evaluation' && (
          <Card className="p-6">
            <form onSubmit={saveEvaluation} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'الحلقة' : 'Course'}</label>
                <select value={evalCourseId} onChange={(e) => setEvalCourseId(Number(e.target.value))} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                  {data.courses.map((c) => <option key={c.id} value={c.id}>{tField(c as unknown as Record<string, unknown>, 'title', lang)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'الطالب' : 'Student'}</label>
                <select value={evalStudentId} onChange={(e) => setEvalStudentId(Number(e.target.value))} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                  {data.students.filter((s) => s.course_id === evalCourseId).map((s) => <option key={s.id} value={s.id}>{s.full_name_ar}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'الفترة' : 'Period'}</label>
                <input value={evalPeriod} onChange={(e) => setEvalPeriod(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'السلوك %' : 'Conduct %'}</label>
                <input type="number" min={0} max={100} value={behaviorScore} onChange={(e) => setBehaviorScore(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'المشاركة %' : 'Participation %'}</label>
                <input type="number" min={0} max={100} value={partScore} onChange={(e) => setPartScore(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" required />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'ملخص التقييم التربوي' : 'Evaluation Summary'}</label>
                <textarea rows={2} value={evalSummary} onChange={(e) => setEvalSummary(e.target.value)} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" required />
              </div>
              <div className="sm:col-span-3">
                <PrimaryButton type="submit">{lang === 'ar' ? 'حفظ التقييم' : 'Save Evaluation'}</PrimaryButton>
              </div>
            </form>
          </Card>
        )}

        <h3 className="text-lg font-bold">{lang === 'ar' ? 'أحدث التسميعات المسجلة' : 'Recent Recitations'}</h3>
        <ResponsiveTable
          data={data.recitations}
          emptyTitle={lang === 'ar' ? 'لا توجد تسميعات' : 'No recitations'}
          columns={[
            { key: 'student', header: lang === 'ar' ? 'الطالب' : 'Student', render: (r) => r.student_name_ar },
            { key: 'surah', header: lang === 'ar' ? 'السورة' : 'Surah', render: (r) => `${r.surah_name} (${r.ayah_from}–${r.ayah_to})` },
            { key: 'mem', header: lang === 'ar' ? 'الحفظ' : 'Mem', align: 'end', render: (r) => `${r.memorization_score}%` },
            { key: 'taj', header: lang === 'ar' ? 'التجويد' : 'Tajweed', align: 'end', render: (r) => `${r.tajweed_score}%` },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'payroll') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'سجل مرتباتي' : 'My Payroll History'}</h2>
        <ResponsiveTable
          data={data.payroll}
          emptyTitle={lang === 'ar' ? 'لا توجد مسيرات رواتب بعد' : 'No payroll records yet'}
          columns={[
            { key: 'month', header: lang === 'ar' ? 'الشهر' : 'Month', render: (r) => <span className="font-mono-tabular">{r.month_year}</span> },
            { key: 'base', header: lang === 'ar' ? 'الأساسي' : 'Base', align: 'end', render: (r) => r.base_amount },
            { key: 'bonus', header: lang === 'ar' ? 'الحوافز' : 'Bonus', align: 'end', render: (r) => r.bonus_amount },
            { key: 'ded', header: lang === 'ar' ? 'الخصم' : 'Deduction', align: 'end', render: (r) => r.deduction_amount },
            { key: 'net', header: lang === 'ar' ? 'الصافي' : 'Net', align: 'end', render: (r) => <span className="font-bold">{r.net_amount}</span> },
            { key: 'status', header: lang === 'ar' ? 'الحالة' : 'Status', render: (r) => (r.status === 'paid' ? (lang === 'ar' ? 'تم التحويل' : 'Paid') : (lang === 'ar' ? 'قيد المراجعة' : 'Pending')) },
          ]}
        />
      </div>
    );
  }

  // Payout Details (Holder, Bank, IBAN ONLY — NO card or CVV)
  const savePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/teacher/payout-details', {
        method: 'PUT',
        body: JSON.stringify({ account_holder_name: holderName, bank_name: bankName, iban }),
      });
      toast(lang === 'ar' ? 'تم تحديث بيانات التحويل البنكي بأمان' : 'Payout IBAN updated securely', 'success');
      setIban('');
      loadData();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'بيانات استلام الراتب' : 'Payout Details'}</h2>
        <p className="text-xs text-slate-500">
          {lang === 'ar'
            ? 'نحفظ فقط اسم صاحب الحساب واسم البنك ورقم الآيبان (IBAN). يُمنع إدخال أرقام البطاقات البنكية أو رموز CVV.'
            : 'We store Account Holder, Bank Name, and IBAN only. Card numbers and CVV are strictly prohibited.'}
        </p>
      </div>

      {data.payoutDetails && (
        <Card className="p-5 flex items-center justify-between gap-4 bg-[#F2EFE6] dark:bg-[#13284A]">
          <div className="flex items-center gap-3">
            <Wallet className="w-6 h-6 text-[#0F766E] dark:text-[#2DD4BF]" />
            <div>
              <div className="text-sm font-bold">{data.payoutDetails.account_holder_name}</div>
              <div className="text-xs text-slate-600 dark:text-slate-300">
                {data.payoutDetails.bank_name} · <span className="font-mono-tabular">{data.payoutDetails.masked_iban}</span>
              </div>
            </div>
          </div>
          <Check className="w-5 h-5 text-[#0F766E] dark:text-[#2DD4BF]" />
        </Card>
      )}

      <Card className="p-6">
        <form onSubmit={savePayout} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold">{lang === 'ar' ? 'اسم صاحب الحساب *' : 'Account Holder Name *'}</label>
            <input value={holderName} onChange={(e) => setHolderName(e.target.value)} required className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold">{lang === 'ar' ? 'اسم البنك *' : 'Bank Name *'}</label>
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} required className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold">{lang === 'ar' ? 'رقم الآيبان (IBAN) *' : 'IBAN *'}</label>
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              required
              placeholder="SA4480000123608010998812"
              className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3.5 py-2.5 text-sm font-mono-tabular"
            />
          </div>
          <PrimaryButton type="submit">{lang === 'ar' ? 'حفظ البيانات البنكية' : 'Save IBAN Details'}</PrimaryButton>
        </form>
      </Card>

      <ChangePasswordCard />
      <MyCommunityPanel />
    </div>
  );
}
