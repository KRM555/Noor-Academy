import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Trash2, CheckCircle2, XCircle, Download, ShieldAlert, Rocket, RefreshCw } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { isBrowserSupabaseConfigured } from '../../lib/supabase';
import { tField } from '../../i18n/translations';
import { generateCertificatePDF } from '../../lib/pdfCertificate';
import {
  Card,
  LoadingState,
  ResponsiveTable,
  PrimaryButton,
  SecondaryButton,
  ConfirmDeleteModal,
} from '../../components/ui/CommonUI';
import { ChangePasswordCard } from '../../components/dashboard/ChangePasswordCard';

interface AdminData {
  profiles: Array<{ id: string | number; email: string; full_name: string; role: 'student' | 'teacher' | 'admin' | 'guardian'; is_active: number | boolean }>;
  levels: Array<{ id: number; code: string; name_ar: string; name_en: string; age_range: string }>;
  teachers: Array<{ id: number; name_ar: string; name_en: string; specialty_ar: string; hourly_rate: number }>;
  students: Array<{ id: number; student_code: string; full_name_ar: string; full_name_en: string; age: number; level_id: number; level_name_ar: string; guardian_name: string; student_email?: string }>;
  courses: Array<{ id: number; title_ar: string; title_en: string; level_name_ar: string; teacher_name_ar: string; schedule_ar: string; price_monthly: number; capacity: number }>;
  lessons: Array<{ id: number; course_id: number; title_ar: string; course_title_ar: string; lesson_date: string; start_time: string; duration_min: number }>;
  enrollments: Array<{ id: number; student_id: number; course_id: number; student_name_ar: string; course_title_ar: string; status: string }>;
  admissionRequests: Array<{ id: number; student_name: string; student_age: number; guardian_name: string; guardian_email: string; guardian_phone: string; course_title_ar: string; level_name_ar: string; status: string }>;
  announcements: Array<{ id: number; title_ar: string; body_ar: string; target_scope: string; course_title_ar: string | null; created_at: string }>;
  exams: Array<{ id: number; course_id: number; title_ar: string; course_title_ar: string; exam_date: string; max_score: number }>;
  certificates: Array<{ id: number; verification_code: string; student_id: number; student_name_ar: string; course_title_ar: string; title_ar: string; title_en: string; grade_label: string; issued_at: string; revoked_at: string | null }>;
  payroll: Array<{ id: number; teacher_id: number; teacher_name_ar: string; month_year: string; base_amount: number; bonus_amount: number; deduction_amount: number; net_amount: number; status: string; bank_name: string | null; masked_iban: string | null }>;
  games: Array<{ id: number; slug: string; title_ar: string; title_en: string; category: string; is_active: number | boolean }>;
  legal: Array<{ doc_type: string; version: string; title_ar: string; title_en: string; content_ar: string; content_en: string }>;
  auditLogs: Array<{ id: number; actor_name: string; action: string; entity_type: string; entity_id: string; details_json: unknown; created_at: string }>;
}

export function AdminDashboard({
  activeTab,
  onLaunchGame,
}: {
  activeTab: string;
  onLaunchGame: (slug: string) => void;
}) {
  const { lang, toast } = useApp();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'courses' | 'lessons' | 'teachers' | 'students'; id: number } | null>(null);
  const [schemaSql, setSchemaSql] = useState('');
  const [syncingSupabase, setSyncingSupabase] = useState(false);
  const [launchStatus, setLaunchStatus] = useState<{
    supabaseConfigured: boolean;
    supabaseUrlPresent: boolean;
    supabaseAnonPresent: boolean;
    supabaseServiceRolePresent: boolean;
    viteSupabasePresent?: boolean;
    supabaseHost?: string | null;
    sessionSecretConfigured: boolean;
    demoLoginEnabled: boolean;
    nodeEnv: string;
    authConnected?: boolean;
    authUsersCount?: number;
    schemaApplied?: boolean;
    connectionError?: string | null;
  } | null>(null);

  // Form states
  const [newCourse, setNewCourse] = useState({ title_ar: '', title_en: '', description_ar: '', level_id: '1', teacher_id: '1', schedule_ar: 'الإثنين · 5:00 م', price_monthly: '350' });
  const [newLesson, setNewLesson] = useState({ course_id: '1', title_ar: '', lesson_date: '2026-11-20', start_time: '17:00', live_url: 'https://zoom.us/j/900112233' });
  const [newStudent, setNewStudent] = useState({ email: '', full_name_ar: '', age: '8', level_id: '1', guardian_name: '', guardian_phone: '', course_id: '1' });
  const [newTeacher, setNewTeacher] = useState({ email: '', name_ar: '', specialty_ar: 'نور البيان والقرآن', qualifications_ar: 'إجازة حفص', hourly_rate: '180' });
  const [enrollPair, setEnrollPair] = useState({ student_id: '1', course_id: '1' });
  const [newAnn, setNewAnn] = useState<{ title_ar: string; body_ar: string; target_scope: 'all_students' | 'course' | 'specific_students'; target_course_id: string; student_ids: number[] }>({
    title_ar: '',
    body_ar: '',
    target_scope: 'all_students',
    target_course_id: '1',
    student_ids: [],
  });
  const [newExam, setNewExam] = useState({ course_id: '1', title_ar: '', exam_date: '2026-11-25', max_score: '100' });
  const [newCert, setNewCert] = useState({ student_id: '1', course_id: '1', title_ar: 'شهادة إتمام المستوى', title_en: 'Level Completion Certificate', grade_label: 'امتياز · 98%' });
  const [newPay, setNewPay] = useState({ teacher_id: '1', month_year: '2026-11', base_amount: '5400', bonus_amount: '250', deduction_amount: '0' });

  const loadData = useCallback(async () => {
    try {
      const res = await apiFetch<AdminData>('/api/admin/dashboard');
      setData(res);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fetchLaunchStatus = useCallback(() => {
    apiFetch<{
      supabaseConfigured: boolean;
      supabaseUrlPresent: boolean;
      supabaseAnonPresent: boolean;
      supabaseServiceRolePresent: boolean;
      viteSupabasePresent?: boolean;
      supabaseHost?: string | null;
      sessionSecretConfigured: boolean;
      demoLoginEnabled: boolean;
      nodeEnv: string;
      authConnected?: boolean;
      authUsersCount?: number;
      schemaApplied?: boolean;
      connectionError?: string | null;
    }>('/api/admin/launch-status')
      .then(setLaunchStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      if (!schemaSql) {
        apiFetch<{ sql: string }>('/api/admin/supabase-schema').then((d) => setSchemaSql(d.sql)).catch(() => {});
      }
      fetchLaunchStatus();
    }
  }, [activeTab, schemaSql, fetchLaunchStatus]);

  if (loading) return <LoadingState />;
  if (!data) return null;

  const confirmSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/admin/${deleteTarget.type}/${deleteTarget.id}`, { method: 'DELETE' });
      toast(lang === 'ar' ? 'تمت الأرشفة والحذف الناعم بنجاح' : 'Record soft-deleted and logged', 'success');
      loadData();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error', 'error');
    }
  };

  if (activeTab === 'overview') {
    const chartData = data.courses.map((c) => ({
      name: c.title_ar.slice(0, 18),
      enrolled: data.enrollments.filter((e) => e.course_id === c.id).length,
      capacity: c.capacity,
    }));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5"><div className="text-xs text-slate-500">{lang === 'ar' ? 'الطلاب' : 'Students'}</div><div className="text-3xl font-extrabold tabular-nums mt-1">{data.students.length}</div></Card>
          <Card className="p-5"><div className="text-xs text-slate-500">{lang === 'ar' ? 'المعلمون' : 'Teachers'}</div><div className="text-3xl font-extrabold tabular-nums mt-1">{data.teachers.length}</div></Card>
          <Card className="p-5"><div className="text-xs text-slate-500">{lang === 'ar' ? 'الكورسات' : 'Courses'}</div><div className="text-3xl font-extrabold tabular-nums mt-1">{data.courses.length}</div></Card>
          <Card className="p-5"><div className="text-xs text-slate-500">{lang === 'ar' ? 'طلبات معلقة' : 'Pending Admissions'}</div><div className="text-3xl font-extrabold tabular-nums text-[#C98A1E] mt-1">{data.admissionRequests.filter((r) => r.status === 'pending').length}</div></Card>
        </div>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'الإشغال الفعلي للحلقات مقابل السعة' : 'Course Enrollment vs Capacity'}</h2>
          <div className="h-64 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="enrolled" name={lang === 'ar' ? 'المسجلون' : 'Enrolled'} fill="#0F766E" radius={[6, 6, 0, 0]} />
                <Bar dataKey="capacity" name={lang === 'ar' ? 'السعة' : 'Capacity'} fill="#D99B26" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    );
  }

  if (activeTab === 'students') {
    const createStudent = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const res = await apiFetch<{ student_code: string; temporary_password: string }>('/api/admin/students', { method: 'POST', body: JSON.stringify(newStudent) });
        toast(
          lang === 'ar'
            ? `تم إنشاء الطالب (${res.student_code}) — كلمة المرور المؤقتة: ${res.temporary_password}`
            : `Student created (${res.student_code}) — Temp password: ${res.temporary_password}`,
          'success'
        );
        setNewStudent({ email: '', full_name_ar: '', age: '8', level_id: '1', guardian_name: '', guardian_phone: '', course_id: '1' });
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    const updateLevel = async (studentId: number, levelId: number) => {
      await apiFetch(`/api/admin/students/${studentId}/level`, { method: 'PATCH', body: JSON.stringify({ level_id: levelId }) });
      toast(lang === 'ar' ? 'تم تحديث تصنيف الطالب' : 'Student level updated', 'success');
      loadData();
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إضافة طالب جديد وتسكينه' : 'Add & Classify Student'}</h2>
          <form onSubmit={createStudent} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder={lang === 'ar' ? 'اسم الطالب' : 'Student Name'} value={newStudent.full_name_ar} onChange={(e) => setNewStudent({ ...newStudent, full_name_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="email" placeholder={lang === 'ar' ? 'البريد الإلكتروني للطالب' : 'Student Email'} value={newStudent.email} onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="number" placeholder={lang === 'ar' ? 'العمر' : 'Age'} value={newStudent.age} onChange={(e) => setNewStudent({ ...newStudent, age: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
            <input placeholder={lang === 'ar' ? 'اسم ولي الأمر' : 'Guardian Name'} value={newStudent.guardian_name} onChange={(e) => setNewStudent({ ...newStudent, guardian_name: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <select value={newStudent.level_id} onChange={(e) => setNewStudent({ ...newStudent, level_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
            </select>
            <select value={newStudent.course_id} onChange={(e) => setNewStudent({ ...newStudent, course_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
            </select>
            <div className="sm:col-span-3"><PrimaryButton type="submit">{lang === 'ar' ? 'إضافة الطالب' : 'Create Student'}</PrimaryButton></div>
          </form>
        </Card>

        <ResponsiveTable
          data={data.students}
          emptyTitle={lang === 'ar' ? 'لا يوجد طلاب' : 'No students'}
          columns={[
            { key: 'code', header: lang === 'ar' ? 'الكود' : 'Code', render: (r) => <span className="font-mono-tabular">{r.student_code}</span> },
            { key: 'name', header: lang === 'ar' ? 'الاسم' : 'Name', render: (r) => r.full_name_ar },
            { key: 'age', header: lang === 'ar' ? 'العمر' : 'Age', align: 'end', render: (r) => r.age },
            {
              key: 'level',
              header: lang === 'ar' ? 'المستوى (تصنيف)' : 'Level',
              render: (r) => (
                <select
                  value={r.level_id}
                  onChange={(e) => updateLevel(r.id, Number(e.target.value))}
                  className="rounded-lg border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#13284A] px-2 py-1 text-xs"
                >
                  {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
                </select>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'end',
              render: (r) => (
                <button onClick={() => setDeleteTarget({ type: 'students', id: r.id })} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer" title="Soft Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              ),
            },
          ]}
        />
        <ConfirmDeleteModal open={Boolean(deleteTarget)} onConfirm={confirmSoftDelete} onClose={() => setDeleteTarget(null)} />
      </div>
    );
  }

  if (activeTab === 'teachers') {
    const createTeacher = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const res = await apiFetch<{ id: number; temporary_password: string }>('/api/admin/teachers', { method: 'POST', body: JSON.stringify(newTeacher) });
        toast(
          lang === 'ar'
            ? `تم إنشاء المعلم — كلمة المرور المؤقتة: ${res.temporary_password}`
            : `Teacher created — Temp password: ${res.temporary_password}`,
          'success'
        );
        setNewTeacher({ email: '', name_ar: '', specialty_ar: 'نور البيان والقرآن', qualifications_ar: 'إجازة حفص', hourly_rate: '180' });
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إضافة معلم جديد (المدير فقط)' : 'Add Teacher (Admin Only)'}</h2>
          <form onSubmit={createTeacher} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder={lang === 'ar' ? 'اسم المعلم' : 'Teacher Name'} value={newTeacher.name_ar} onChange={(e) => setNewTeacher({ ...newTeacher, name_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="email" placeholder={lang === 'ar' ? 'البريد الإلكتروني' : 'Email'} value={newTeacher.email} onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input placeholder={lang === 'ar' ? 'التخصص' : 'Specialty'} value={newTeacher.specialty_ar} onChange={(e) => setNewTeacher({ ...newTeacher, specialty_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <div className="sm:col-span-3"><PrimaryButton type="submit">{lang === 'ar' ? 'إنشاء معلم' : 'Create Teacher'}</PrimaryButton></div>
          </form>
        </Card>

        <ResponsiveTable
          data={data.teachers}
          emptyTitle={lang === 'ar' ? 'لا يوجد معلمون' : 'No teachers'}
          columns={[
            { key: 'name', header: lang === 'ar' ? 'المعلم' : 'Teacher', render: (r) => r.name_ar },
            { key: 'spec', header: lang === 'ar' ? 'التخصص' : 'Specialty', render: (r) => r.specialty_ar },
            { key: 'rate', header: lang === 'ar' ? 'الأجر/ساعة' : 'Rate/hr', align: 'end', render: (r) => r.hourly_rate },
            {
              key: 'act',
              header: '',
              align: 'end',
              render: (r) => (
                <button onClick={() => setDeleteTarget({ type: 'teachers', id: r.id })} className="p-1.5 text-red-600 rounded-lg cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              ),
            },
          ]}
        />
        <ConfirmDeleteModal open={Boolean(deleteTarget)} onConfirm={confirmSoftDelete} onClose={() => setDeleteTarget(null)} />
      </div>
    );
  }

  if (activeTab === 'courses') {
    const createCourse = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/admin/courses', { method: 'POST', body: JSON.stringify(newCourse) });
        toast(lang === 'ar' ? 'تم إنشاء الكورس بنجاح' : 'Course created', 'success');
        setNewCourse({ title_ar: '', title_en: '', description_ar: '', level_id: '1', teacher_id: '1', schedule_ar: 'الإثنين · 5:00 م', price_monthly: '350' });
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إنشاء دورة / حلقة جديدة' : 'Create Course'}</h2>
          <form onSubmit={createCourse} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder={lang === 'ar' ? 'عنوان الحلقة' : 'Course Title'} value={newCourse.title_ar} onChange={(e) => setNewCourse({ ...newCourse, title_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <select value={newCourse.level_id} onChange={(e) => setNewCourse({ ...newCourse, level_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
            </select>
            <select value={newCourse.teacher_id} onChange={(e) => setNewCourse({ ...newCourse, teacher_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
            </select>
            <input placeholder={lang === 'ar' ? 'الجدول' : 'Schedule'} value={newCourse.schedule_ar} onChange={(e) => setNewCourse({ ...newCourse, schedule_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="number" placeholder={lang === 'ar' ? 'السعر الشهري' : 'Price'} value={newCourse.price_monthly} onChange={(e) => setNewCourse({ ...newCourse, price_monthly: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
            <input placeholder={lang === 'ar' ? 'وصف مختصر' : 'Description'} value={newCourse.description_ar} onChange={(e) => setNewCourse({ ...newCourse, description_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <div className="sm:col-span-3"><PrimaryButton type="submit">{lang === 'ar' ? 'إنشاء الحلقة' : 'Create Course'}</PrimaryButton></div>
          </form>
        </Card>

        <ResponsiveTable
          data={data.courses}
          emptyTitle={lang === 'ar' ? 'لا توجد كورسات' : 'No courses'}
          columns={[
            { key: 'title', header: lang === 'ar' ? 'الحلقة' : 'Title', render: (r) => r.title_ar },
            { key: 'teacher', header: lang === 'ar' ? 'المعلم' : 'Teacher', render: (r) => r.teacher_name_ar },
            { key: 'schedule', header: lang === 'ar' ? 'الموعد' : 'Schedule', render: (r) => r.schedule_ar },
            { key: 'price', header: lang === 'ar' ? 'السعر' : 'Price', align: 'end', render: (r) => r.price_monthly },
            {
              key: 'act',
              header: '',
              align: 'end',
              render: (r) => (
                <button onClick={() => setDeleteTarget({ type: 'courses', id: r.id })} className="p-1.5 text-red-600 rounded-lg cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              ),
            },
          ]}
        />
        <ConfirmDeleteModal open={Boolean(deleteTarget)} onConfirm={confirmSoftDelete} onClose={() => setDeleteTarget(null)} />
      </div>
    );
  }

  if (activeTab === 'lessons') {
    const createLesson = async (e: React.FormEvent) => {
      e.preventDefault();
      await apiFetch('/api/admin/lessons', { method: 'POST', body: JSON.stringify(newLesson) });
      toast(lang === 'ar' ? 'تمت إضافة الدرس والرابط' : 'Lesson & link added', 'success');
      setNewLesson({ ...newLesson, title_ar: '' });
      loadData();
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إضافة درس ورابط محاضرة' : 'Add Lesson & Live Link'}</h2>
          <form onSubmit={createLesson} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={newLesson.course_id} onChange={(e) => setNewLesson({ ...newLesson, course_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
            </select>
            <input placeholder={lang === 'ar' ? 'عنوان الدرس' : 'Lesson Title'} value={newLesson.title_ar} onChange={(e) => setNewLesson({ ...newLesson, title_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="date" value={newLesson.lesson_date} onChange={(e) => setNewLesson({ ...newLesson, lesson_date: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular" />
            <input type="time" value={newLesson.start_time} onChange={(e) => setNewLesson({ ...newLesson, start_time: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular" />
            <input placeholder="https://zoom.us/..." value={newLesson.live_url} onChange={(e) => setNewLesson({ ...newLesson, live_url: e.target.value })} className="sm:col-span-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <div className="sm:col-span-3"><PrimaryButton type="submit">{lang === 'ar' ? 'حفظ الدرس' : 'Save Lesson'}</PrimaryButton></div>
          </form>
        </Card>

        <ResponsiveTable
          data={data.lessons}
          emptyTitle={lang === 'ar' ? 'لا توجد دروس' : 'No lessons'}
          columns={[
            { key: 'title', header: lang === 'ar' ? 'الدرس' : 'Lesson', render: (r) => r.title_ar },
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => r.course_title_ar },
            { key: 'date', header: lang === 'ar' ? 'التاريخ' : 'Date', render: (r) => <span className="font-mono-tabular">{r.lesson_date} · {r.start_time}</span> },
            {
              key: 'act',
              header: '',
              align: 'end',
              render: (r) => (
                <button onClick={() => setDeleteTarget({ type: 'lessons', id: r.id })} className="p-1.5 text-red-600 rounded-lg cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              ),
            },
          ]}
        />
        <ConfirmDeleteModal open={Boolean(deleteTarget)} onConfirm={confirmSoftDelete} onClose={() => setDeleteTarget(null)} />
      </div>
    );
  }

  if (activeTab === 'levels') {
    const enrollStudent = async (e: React.FormEvent) => {
      e.preventDefault();
      await apiFetch('/api/admin/enrollments', { method: 'POST', body: JSON.stringify(enrollPair) });
      toast(lang === 'ar' ? 'تم تسجيل الطالب في الحلقة' : 'Student enrolled in course', 'success');
      loadData();
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'تسجيل طالب في حلقة (Enrollments)' : 'Enroll Student into Course'}</h2>
          <form onSubmit={enrollStudent} className="flex flex-wrap gap-3 items-center">
            <select value={enrollPair.student_id} onChange={(e) => setEnrollPair({ ...enrollPair, student_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.students.map((s) => <option key={s.id} value={s.id}>{s.full_name_ar}</option>)}
            </select>
            <select value={enrollPair.course_id} onChange={(e) => setEnrollPair({ ...enrollPair, course_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
            </select>
            <PrimaryButton type="submit">{lang === 'ar' ? 'تأكيد التسجيل' : 'Enroll Student'}</PrimaryButton>
          </form>
        </Card>

        <ResponsiveTable
          data={data.enrollments}
          emptyTitle={lang === 'ar' ? 'لا توجد تسجيلات' : 'No enrollments'}
          columns={[
            { key: 'student', header: lang === 'ar' ? 'الطالب' : 'Student', render: (r) => r.student_name_ar },
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => r.course_title_ar },
            { key: 'status', header: lang === 'ar' ? 'الحالة' : 'Status', render: (r) => r.status },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'admissions') {
    const decide = async (id: number, decision: 'approved' | 'rejected') => {
      const res = await apiFetch<{ ok: boolean; temporary_password?: string }>(`/api/admin/admissions/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
      if (decision === 'approved') {
        toast(
          res.temporary_password
            ? lang === 'ar'
              ? `تم القبول وتفعيل الحساب — كلمة المرور المؤقتة: ${res.temporary_password}`
              : `Approved & linked — Temp password: ${res.temporary_password}`
            : lang === 'ar'
            ? 'تم القبول وربط حساب الطالب بالحلقة'
            : 'Approved & student account linked',
          'success'
        );
      } else {
        toast(lang === 'ar' ? 'تم رفض الطلب' : 'Request rejected', 'success');
      }
      loadData();
    };

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'طلبات التقديم' : 'Admission Requests'}</h2>
        <ResponsiveTable
          data={data.admissionRequests}
          emptyTitle={lang === 'ar' ? 'لا توجد طلبات تقديم' : 'No admission requests'}
          columns={[
            { key: 'student', header: lang === 'ar' ? 'الطالب' : 'Student', render: (r) => `${r.student_name} (${r.student_age})` },
            { key: 'guardian', header: lang === 'ar' ? 'ولي الأمر' : 'Guardian', render: (r) => `${r.guardian_name} · ${r.guardian_phone}` },
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Preferred Course', render: (r) => r.course_title_ar || '—' },
            { key: 'status', header: lang === 'ar' ? 'الحالة' : 'Status', render: (r) => r.status },
            {
              key: 'act',
              header: lang === 'ar' ? 'القرار' : 'Action',
              align: 'end',
              render: (r) =>
                r.status === 'pending' ? (
                  <div className="inline-flex gap-2">
                    <button onClick={() => decide(r.id, 'approved')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold bg-[#0F766E] text-white cursor-pointer">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {lang === 'ar' ? 'قبول' : 'Approve'}
                    </button>
                    <button onClick={() => decide(r.id, 'rejected')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold bg-red-700 text-white cursor-pointer">
                      <XCircle className="w-3.5 h-3.5" /> {lang === 'ar' ? 'رفض' : 'Reject'}
                    </button>
                  </div>
                ) : (
                  <span>—</span>
                ),
            },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'announcements') {
    const createAnnouncement = async (e: React.FormEvent) => {
      e.preventDefault();
      await apiFetch('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({
          ...newAnn,
          target_course_id: newAnn.target_scope === 'course' ? Number(newAnn.target_course_id) : undefined,
        }),
      });
      toast(lang === 'ar' ? 'تم إرسال الإعلان للمستهدفين' : 'Announcement published to targets', 'success');
      setNewAnn({ title_ar: '', body_ar: '', target_scope: 'all_students', target_course_id: '1', student_ids: [] });
      loadData();
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إرسال إعلان موجه' : 'Publish Targeted Announcement'}</h2>
          <form onSubmit={createAnnouncement} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input placeholder={lang === 'ar' ? 'عنوان الإعلان' : 'Title'} value={newAnn.title_ar} onChange={(e) => setNewAnn({ ...newAnn, title_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <select
                value={newAnn.target_scope}
                onChange={(e) => setNewAnn({ ...newAnn, target_scope: e.target.value as 'all_students' | 'course' | 'specific_students' })}
                className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm"
              >
                <option value="all_students">{lang === 'ar' ? 'كل الطلاب' : 'All Students'}</option>
                <option value="course">{lang === 'ar' ? 'طلاب حلقة محددة' : 'Specific Course'}</option>
                <option value="specific_students">{lang === 'ar' ? 'طلاب محددون (announcement_targets)' : 'Specific Students'}</option>
              </select>
            </div>

            {newAnn.target_scope === 'course' && (
              <select value={newAnn.target_course_id} onChange={(e) => setNewAnn({ ...newAnn, target_course_id: e.target.value })} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
              </select>
            )}

            {newAnn.target_scope === 'specific_students' && (
              <div className="flex flex-wrap gap-3 p-3 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63]">
                {data.students.map((s) => (
                  <label key={s.id} className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newAnn.student_ids.includes(s.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...newAnn.student_ids, s.id]
                          : newAnn.student_ids.filter((id) => id !== s.id);
                        setNewAnn({ ...newAnn, student_ids: next });
                      }}
                    />
                    <span>{s.full_name_ar}</span>
                  </label>
                ))}
              </div>
            )}

            <textarea rows={2} placeholder={lang === 'ar' ? 'نص الإعلان' : 'Announcement body'} value={newAnn.body_ar} onChange={(e) => setNewAnn({ ...newAnn, body_ar: e.target.value })} required className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <PrimaryButton type="submit">{lang === 'ar' ? 'نشر الإعلان' : 'Publish Announcement'}</PrimaryButton>
          </form>
        </Card>

        <ResponsiveTable
          data={data.announcements}
          emptyTitle={lang === 'ar' ? 'لا توجد إعلانات' : 'No announcements'}
          columns={[
            { key: 'title', header: lang === 'ar' ? 'العنوان' : 'Title', render: (r) => r.title_ar },
            { key: 'scope', header: lang === 'ar' ? 'الاستهداف' : 'Target', render: (r) => r.target_scope },
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => r.course_title_ar || '—' },
            { key: 'date', header: lang === 'ar' ? 'التاريخ' : 'Date', render: (r) => <span className="font-mono-tabular">{String(r.created_at).slice(0, 10)}</span> },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'exams') {
    const createExam = async (e: React.FormEvent) => {
      e.preventDefault();
      await apiFetch('/api/admin/exams', { method: 'POST', body: JSON.stringify(newExam) });
      toast(lang === 'ar' ? 'تم إنشاء الامتحان' : 'Exam created', 'success');
      setNewExam({ ...newExam, title_ar: '' });
      loadData();
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إنشاء امتحان جديد' : 'Create Exam'}</h2>
          <form onSubmit={createExam} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select value={newExam.course_id} onChange={(e) => setNewExam({ ...newExam, course_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
            </select>
            <input placeholder={lang === 'ar' ? 'عنوان الامتحان' : 'Exam Title'} value={newExam.title_ar} onChange={(e) => setNewExam({ ...newExam, title_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="date" value={newExam.exam_date} onChange={(e) => setNewExam({ ...newExam, exam_date: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular" />
            <PrimaryButton type="submit">{lang === 'ar' ? 'إضافة امتحان' : 'Add Exam'}</PrimaryButton>
          </form>
        </Card>

        <ResponsiveTable
          data={data.exams}
          emptyTitle={lang === 'ar' ? 'لا توجد امتحانات' : 'No exams'}
          columns={[
            { key: 'title', header: lang === 'ar' ? 'الامتحان' : 'Exam', render: (r) => r.title_ar },
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => r.course_title_ar },
            { key: 'date', header: lang === 'ar' ? 'التاريخ' : 'Date', render: (r) => <span className="font-mono-tabular">{r.exam_date}</span> },
            { key: 'max', header: lang === 'ar' ? 'العظمى' : 'Max', align: 'end', render: (r) => r.max_score },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'certificates') {
    const issueCert = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await apiFetch<{ verification_code: string }>('/api/admin/certificates', { method: 'POST', body: JSON.stringify(newCert) });
      toast(`${lang === 'ar' ? 'صدرت الشهادة برقم:' : 'Certificate issued:'} ${res.verification_code}`, 'success');
      loadData();
    };

    const revokeCert = async (id: number) => {
      await apiFetch(`/api/admin/certificates/${id}/revoke`, { method: 'POST' });
      toast(lang === 'ar' ? 'تم سحب الشهادة وتسجيل العملية' : 'Certificate revoked', 'info');
      loadData();
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إصدار شهادة برقم تحقق فريد' : 'Issue Verifiable Certificate'}</h2>
          <form onSubmit={issueCert} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select value={newCert.student_id} onChange={(e) => setNewCert({ ...newCert, student_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.students.map((s) => <option key={s.id} value={s.id}>{s.full_name_ar}</option>)}
            </select>
            <select value={newCert.course_id} onChange={(e) => setNewCert({ ...newCert, course_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
            </select>
            <input placeholder={lang === 'ar' ? 'عنوان الشهادة' : 'Title'} value={newCert.title_ar} onChange={(e) => setNewCert({ ...newCert, title_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input placeholder={lang === 'ar' ? 'التقدير' : 'Grade'} value={newCert.grade_label} onChange={(e) => setNewCert({ ...newCert, grade_label: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <div className="sm:col-span-4"><PrimaryButton type="submit">{lang === 'ar' ? 'إصدار الشهادة' : 'Issue Certificate'}</PrimaryButton></div>
          </form>
        </Card>

        <ResponsiveTable
          data={data.certificates}
          emptyTitle={lang === 'ar' ? 'لا توجد شهادات' : 'No certificates'}
          columns={[
            { key: 'code', header: lang === 'ar' ? 'رقم التحقق' : 'Code', render: (r) => <span className="font-mono-tabular font-bold">{r.verification_code}</span> },
            { key: 'student', header: lang === 'ar' ? 'الطالب' : 'Student', render: (r) => r.student_name_ar },
            { key: 'grade', header: lang === 'ar' ? 'التقدير' : 'Standing', render: (r) => r.grade_label },
            { key: 'status', header: lang === 'ar' ? 'الحالة' : 'Status', render: (r) => (r.revoked_at ? (lang === 'ar' ? 'ملغاة' : 'Revoked') : (lang === 'ar' ? 'سارية' : 'Active')) },
            {
              key: 'act',
              header: '',
              align: 'end',
              render: (r) => (
                <div className="inline-flex gap-2">
                  <button
                    onClick={() =>
                      generateCertificatePDF({
                        verification_code: r.verification_code,
                        student_name_ar: r.student_name_ar,
                        student_name_en: r.student_name_ar,
                        course_title_en: r.course_title_ar,
                        title_en: r.title_en,
                        grade_label: r.grade_label,
                        issued_at: r.issued_at,
                      })
                    }
                    className="p-1.5 text-[#0F766E] rounded-lg cursor-pointer"
                    title="Download PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  {!r.revoked_at && (
                    <button onClick={() => revokeCert(r.id)} className="text-xs font-bold text-red-600 hover:underline cursor-pointer">
                      {lang === 'ar' ? 'إلغاء' : 'Revoke'}
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'payroll') {
    const createPayroll = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/admin/payroll', { method: 'POST', body: JSON.stringify(newPay) });
        toast(lang === 'ar' ? 'تم إنشاء مسير الراتب' : 'Payroll created', 'success');
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Duplicate payroll error', 'error');
      }
    };

    const markPaid = async (id: number) => {
      await apiFetch(`/api/admin/payroll/${id}/pay`, { method: 'PATCH' });
      toast(lang === 'ar' ? 'تم تأكيد صرف الراتب وتسجيله' : 'Marked as paid', 'success');
      loadData();
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إصدار مرتب شهري للمعلم' : 'Issue Monthly Teacher Payroll'}</h2>
            <p className="text-xs text-slate-500">
              {lang === 'ar'
                ? 'يمنع النظام تكرار المرتب لنفس المعلم في نفس الشهر (UNIQUE teacher_id, month_year).'
                : 'Database constraint guarantees at most one payroll entry per teacher per month.'}
            </p>
          </div>
          <form onSubmit={createPayroll} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <select value={newPay.teacher_id} onChange={(e) => setNewPay({ ...newPay, teacher_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
            </select>
            <input type="month" value={newPay.month_year} onChange={(e) => setNewPay({ ...newPay, month_year: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular" />
            <input type="number" placeholder={lang === 'ar' ? 'الأساسي' : 'Base'} value={newPay.base_amount} onChange={(e) => setNewPay({ ...newPay, base_amount: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
            <input type="number" placeholder={lang === 'ar' ? 'حوافز' : 'Bonus'} value={newPay.bonus_amount} onChange={(e) => setNewPay({ ...newPay, bonus_amount: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
            <PrimaryButton type="submit">{lang === 'ar' ? 'اعتماد' : 'Create'}</PrimaryButton>
          </form>
        </Card>

        <ResponsiveTable
          data={data.payroll}
          emptyTitle={lang === 'ar' ? 'لا توجد مرتبات' : 'No payroll records'}
          columns={[
            { key: 'teacher', header: lang === 'ar' ? 'المعلم' : 'Teacher', render: (r) => r.teacher_name_ar },
            { key: 'month', header: lang === 'ar' ? 'الشهر' : 'Month', render: (r) => <span className="font-mono-tabular">{r.month_year}</span> },
            { key: 'iban', header: lang === 'ar' ? 'الحساب البنكي' : 'Bank / IBAN', render: (r) => (r.masked_iban ? `${r.bank_name} (${r.masked_iban})` : '—') },
            { key: 'net', header: lang === 'ar' ? 'الصافي' : 'Net', align: 'end', render: (r) => <span className="font-bold">{r.net_amount}</span> },
            {
              key: 'status',
              header: lang === 'ar' ? 'الحالة' : 'Status',
              align: 'end',
              render: (r) =>
                r.status === 'paid' ? (
                  <span className="text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF]">{lang === 'ar' ? 'تم الصرف' : 'Paid'}</span>
                ) : (
                  <button onClick={() => markPaid(r.id)} className="rounded-lg px-3 py-1 text-xs font-bold bg-[#C98A1E] text-white cursor-pointer">
                    {lang === 'ar' ? 'صرف الآن' : 'Mark Paid'}
                  </button>
                ),
            },
          ]}
        />
      </div>
    );
  }

  if (activeTab === 'games') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'إدارة الألعاب التعليمية' : 'Educational Games'}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.games.map((g) => (
            <Card key={g.id} className="p-5 space-y-3">
              <div className="text-xs font-mono-tabular text-[#0F766E] dark:text-[#2DD4BF]">{g.category}</div>
              <h3 className="font-bold">{tField(g as unknown as Record<string, unknown>, 'title', lang)}</h3>
              <SecondaryButton onClick={() => onLaunchGame(g.slug)} className="w-full text-xs">
                {lang === 'ar' ? 'معاينة اللعبة' : 'Preview Game'}
              </SecondaryButton>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (activeTab === 'legal') {
    const saveDoc = async (doc: { doc_type: string; version: string; title_ar: string; title_en: string; content_ar: string; content_en: string }) => {
      await apiFetch(`/api/admin/legal/${doc.doc_type}`, { method: 'PUT', body: JSON.stringify(doc) });
      toast(lang === 'ar' ? 'تم تحديث الوثيقة القانونية' : 'Legal document updated', 'success');
      loadData();
    };

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'الشروط والأحكام وسياسة الخصوصية' : 'Terms, Privacy & Refund Policies'}</h2>
        {data.legal.map((doc) => (
          <Card key={doc.doc_type} className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{tField(doc as unknown as Record<string, unknown>, 'title', lang)}</h3>
              <span className="text-xs font-mono-tabular text-slate-500">v{doc.version}</span>
            </div>
            <textarea
              rows={4}
              defaultValue={doc.content_ar}
              onBlur={(e) => saveDoc({ ...doc, content_ar: e.target.value })}
              className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] p-3 text-sm"
            />
            <div className="text-xs text-slate-500">{lang === 'ar' ? 'يُحفظ التعديل تلقائياً عند الخروج من الحقل.' : 'Saves automatically on blur.'}</div>
          </Card>
        ))}
      </div>
    );
  }

  if (activeTab === 'audit') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'سجل العمليات (Audit Logs)' : 'System Audit Logs'}</h2>
        <ResponsiveTable
          data={data.auditLogs}
          emptyTitle={lang === 'ar' ? 'السجل فارغ' : 'No audit logs'}
          columns={[
            { key: 'time', header: lang === 'ar' ? 'الوقت' : 'Time', render: (r) => <span className="font-mono-tabular text-xs">{r.created_at}</span> },
            { key: 'actor', header: lang === 'ar' ? 'المنفذ' : 'Actor', render: (r) => r.actor_name },
            { key: 'action', header: lang === 'ar' ? 'الإجراء' : 'Action', render: (r) => <span className="font-mono-tabular text-xs font-bold">{r.action}</span> },
            { key: 'entity', header: lang === 'ar' ? 'الكيان' : 'Entity', render: (r) => `${r.entity_type} #${r.entity_id}` },
          ]}
        />
      </div>
    );
  }

  // Settings Tab: Role Management + Supabase SQL Export
  const changeRole = async (userId: string | number, role: 'student' | 'teacher' | 'admin' | 'guardian') => {
    await apiFetch(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
    toast(lang === 'ar' ? 'تم تحديث الدور وتسجيله في سجل العمليات' : 'Role updated and audited', 'success');
    loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
        <ShieldAlert className="w-4 h-4" />
        <span>
          {lang === 'ar'
            ? 'المدير فقط يملك صلاحية تعديل الأدوار، ولا يمكن لأي مستخدم ترقية دوره بنفسه.'
            : 'Only Admins may change account roles. Every change is logged.'}
        </span>
      </div>

      <ResponsiveTable
        data={data.profiles}
        emptyTitle="No users"
        columns={[
          { key: 'name', header: lang === 'ar' ? 'الاسم' : 'Name', render: (r) => r.full_name },
          { key: 'email', header: lang === 'ar' ? 'البريد' : 'Email', render: (r) => r.email },
          {
            key: 'role',
            header: lang === 'ar' ? 'الدور' : 'Role',
            render: (r) => (
              <select
                value={r.role}
                onChange={(e) => changeRole(r.id, e.target.value as 'student' | 'teacher' | 'admin' | 'guardian')}
                className="rounded-lg border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#13284A] px-2.5 py-1 text-xs font-bold"
              >
                <option value="student">student</option>
                <option value="teacher">teacher</option>
                <option value="admin">admin</option>
                <option value="guardian">guardian</option>
              </select>
            ),
          },
        ]}
      />

      <ChangePasswordCard />

      {launchStatus && (
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-[#0F766E] dark:text-[#2DD4BF]" />
              <div>
                <h3 className="font-bold text-base">
                  {lang === 'ar' ? 'جاهزية الإطلاق والربط الحي مع Supabase' : 'Supabase Live Connection & Launch Readiness'}
                </h3>
                {launchStatus.supabaseHost && (
                  <div className="text-xs font-mono-tabular text-slate-500">{launchStatus.supabaseHost}</div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SecondaryButton
                type="button"
                className="text-xs"
                onClick={() => {
                  fetchLaunchStatus();
                  toast(lang === 'ar' ? 'تم تحديث فحص الاتصال الحي' : 'Live connection check refreshed', 'info');
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'تحديث الفحص' : 'Refresh Check'}</span>
              </SecondaryButton>
              {launchStatus.supabaseConfigured && (
                <PrimaryButton
                  type="button"
                  disabled={syncingSupabase}
                  className="text-xs"
                  onClick={async () => {
                    setSyncingSupabase(true);
                    try {
                      const res = await apiFetch<{ created: number; existing: number; errors: string[] }>(
                        '/api/admin/supabase/sync-users',
                        { method: 'POST' }
                      );
                      toast(
                        lang === 'ar'
                          ? `تمت المزامنة: ${res.created} حساب جديد · ${res.existing} موجود مسبقاً`
                          : `Synced: ${res.created} created · ${res.existing} existing`,
                        res.errors.length ? 'info' : 'success'
                      );
                      fetchLaunchStatus();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Sync failed', 'error');
                    } finally {
                      setSyncingSupabase(false);
                    }
                  }}
                >
                  <span>
                    {syncingSupabase
                      ? lang === 'ar' ? 'جاري المزامنة...' : 'Syncing...'
                      : lang === 'ar' ? 'مزامنة المستخدمين مع Supabase Auth' : 'Sync Users to Supabase Auth'}
                  </span>
                </PrimaryButton>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[
              { label: 'SUPABASE_URL & SERVICE_ROLE (Server)', ok: launchStatus.supabaseConfigured },
              { label: 'VITE_SUPABASE_ANON (Browser SDK)', ok: isBrowserSupabaseConfigured() },
              {
                label: lang === 'ar'
                  ? `اتصال Supabase Auth الحي (${launchStatus.authUsersCount ?? 0} مستخدم)`
                  : `Live Supabase Auth (${launchStatus.authUsersCount ?? 0} users)`,
                ok: Boolean(launchStatus.authConnected),
              },
              {
                label: lang === 'ar' ? 'جداول قاعدة بيانات Supabase (SQL Schema)' : 'Supabase Tables Applied (SQL Schema)',
                ok: Boolean(launchStatus.schemaApplied),
              },
              {
                label: lang === 'ar' ? 'مفتاح الجلسات SESSION_SECRET' : 'SESSION_SECRET (24+ chars)',
                ok: launchStatus.sessionSecretConfigured,
              },
              {
                label: lang === 'ar' ? 'إغلاق أزرار الدخول السريع للإنتاج' : 'Demo Buttons Disabled for Prod',
                ok: !launchStatus.demoLoginEnabled,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#13284A] px-3 py-2.5"
              >
                <span className="font-semibold truncate">{item.label}</span>
                {item.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#0F766E] dark:text-[#2DD4BF]" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 text-[#C98A1E]" />
                )}
              </div>
            ))}
          </div>

          {launchStatus.connectionError && (
            <p className="text-xs text-red-600 dark:text-red-400 font-mono-tabular">
              {launchStatus.connectionError}
            </p>
          )}

          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {launchStatus.authConnected && !launchStatus.schemaApplied
              ? lang === 'ar'
                ? 'تم التحقق من الاتصال الحي بـ Supabase Auth بنجاح! الخطوة المتبقية لجداول قاعدة البيانات: انسخ ملف supabase_schema.sql أدناه وشغّله داخل SQL Editor في لوحة تحكم Supabase لإنشاء الجداول وتفعيل سياسات RLS.'
                : 'Live Supabase Auth is connected! Next step for Postgres tables: copy supabase_schema.sql below and run it in your Supabase SQL Editor to create tables and RLS policies.'
              : lang === 'ar'
              ? 'مفتاح SUPABASE_SERVICE_ROLE_KEY محفوظ على الخادم فقط داخل .env، بينما يستخدم المتصفح مفتاح VITE_SUPABASE_ANON_KEY العام فقط.'
              : 'SUPABASE_SERVICE_ROLE_KEY remains strictly server-side in .env, while the browser only uses the publishable VITE_SUPABASE_ANON_KEY.'}
          </p>
        </Card>
      )}

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">Supabase PostgreSQL + RLS Schema</h3>
          <SecondaryButton
            className="text-xs"
            onClick={() => {
              const blob = new Blob([schemaSql], { type: 'text/sql' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'supabase_schema.sql';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'تحميل ملف SQL' : 'Download SQL'}</span>
          </SecondaryButton>
        </div>
        <pre dir="ltr" className="max-h-64 overflow-auto rounded-xl bg-[#091529] text-slate-200 p-4 text-xs font-mono-tabular">
          {schemaSql || 'Loading supabase_schema.sql...'}
        </pre>
      </Card>
    </div>
  );
}
