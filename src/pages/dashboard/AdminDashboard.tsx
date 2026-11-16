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
import {
  Trash2,
  CheckCircle2,
  XCircle,
  Download,
  ShieldAlert,
  Rocket,
  RefreshCw,
  Pencil,
  FolderOpen,
  ArrowRight,
  Search,
  Copy,
  Upload,
  Video,
  PlayCircle,
  FileText,
  ExternalLink,
  Plus,
  FileSpreadsheet,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { apiFetch } from '../../lib/api';
import { queryKeys } from '../../lib/queryClient';
import { isBrowserSupabaseConfigured } from '../../lib/supabase';
import { tField } from '../../i18n/translations';
import {
  Card,
  LoadingState,
  ResponsiveTable,
  PrimaryButton,
  SecondaryButton,
  ConfirmDeleteModal,
} from '../../components/ui/CommonUI';
import { ChangePasswordCard } from '../../components/dashboard/ChangePasswordCard';
import { ExamCenter, type ManagedExamItem } from '../../components/dashboard/ExamCenter';

function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  const escape = (val: string | number | boolean | null | undefined) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface AdminData {
  profiles: Array<{ id: string | number; email: string; full_name: string; role: 'student' | 'teacher' | 'admin' | 'guardian'; is_active: number | boolean }>;
  levels: Array<{ id: number; code: string; name_ar: string; name_en: string; age_range: string }>;
  teachers: Array<{
    id: number;
    name_ar: string;
    name_en: string;
    specialty_ar: string;
    specialty_en?: string;
    qualifications_ar?: string;
    bio_ar?: string;
    hourly_rate: number;
    is_public?: boolean;
  }>;
  students: Array<{
    id: number;
    student_code: string;
    full_name_ar: string;
    full_name_en: string;
    age: number;
    level_id: number;
    status: 'active' | 'paused' | 'graduated';
    level_name_ar: string;
    guardian_name: string;
    guardian_phone?: string;
    guardian_email?: string;
    guardian_linked?: boolean;
    student_email?: string;
  }>;
  courses: Array<{
    id: number;
    title_ar: string;
    title_en: string;
    description_ar?: string;
    description_en?: string;
    level_id: number;
    teacher_id: number;
    level_name_ar: string;
    teacher_name_ar: string;
    schedule_ar: string;
    schedule_en?: string;
    price_monthly: number;
    capacity: number;
    is_featured?: boolean;
  }>;
  lessons: Array<{
    id: number;
    course_id: number;
    title_ar: string;
    title_en?: string;
    course_title_ar: string;
    lesson_date: string;
    start_time: string;
    duration_min: number;
    objectives_ar?: string;
    objectives_en?: string;
  }>;
  lessonLinks: Array<{
    id: number;
    lesson_id: number;
    title_ar: string;
    title_en: string;
    url: string;
    link_type: 'zoom' | 'meet' | 'material' | 'recording';
  }>;
  enrollments: Array<{ id: number; student_id: number; course_id: number; student_name_ar: string; course_title_ar: string; status: string }>;
  admissionRequests: Array<{
    id: number;
    student_name: string;
    student_age: number;
    student_email?: string | null;
    guardian_name: string;
    guardian_email: string;
    guardian_phone: string;
    course_title_ar: string;
    level_name_ar: string;
    status: string;
  }>;
  teacherApplications?: Array<{
    id: number;
    email: string;
    name_ar: string;
    name_en: string;
    phone: string;
    specialty_ar: string;
    qualifications_ar: string;
    bio_ar: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
  }>;
  announcements: Array<{ id: number; title_ar: string; body_ar: string; target_scope: string; course_title_ar: string | null; created_at: string }>;
  exams: ManagedExamItem[];
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
  const { lang, toast, user } = useApp();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'courses' | 'lessons' | 'teachers' | 'students'; id: number } | null>(null);
  const [syncingSupabase, setSyncingSupabase] = useState(false);

  // Search & Filter states
  const [studentSearch, setStudentSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [admissionSearch, setAdmissionSearch] = useState('');
  const [admissionFilter, setAdmissionFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Workspace & Edit states
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [courseEdit, setCourseEdit] = useState<{
    title_ar: string;
    title_en: string;
    description_ar: string;
    level_id: string;
    teacher_id: string;
    schedule_ar: string;
    price_monthly: string;
    capacity: string;
    is_featured: boolean;
  } | null>(null);
  const [courseLessonForm, setCourseLessonForm] = useState({
    title_ar: '',
    lesson_date: '2026-11-22',
    start_time: '17:00',
    duration_min: '45',
    objectives_ar: '',
    live_url: '',
  });
  const [courseEnrollStudentId, setCourseEnrollStudentId] = useState('');

  // Lesson edit & attachment states
  const [editingLessonId, setEditingLessonId] = useState<number | null>(null);
  const [lessonEdit, setLessonEdit] = useState({
    title_ar: '',
    lesson_date: '',
    start_time: '',
    duration_min: '45',
    objectives_ar: '',
  });
  const [attachLessonId, setAttachLessonId] = useState<number | null>(null);
  const [attachForm, setAttachForm] = useState<{
    link_type: 'recording' | 'zoom' | 'meet' | 'material';
    title_ar: string;
    url: string;
  }>({ link_type: 'recording', title_ar: '', url: '' });
  const [uploadingMaterial, setUploadingMaterial] = useState(false);

  // Student & Teacher edit states
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [studentEdit, setStudentEdit] = useState({
    full_name_ar: '',
    full_name_en: '',
    age: '8',
    level_id: '1',
    status: 'active' as 'active' | 'paused' | 'graduated',
    guardian_name: '',
    guardian_phone: '',
    guardian_email: '',
    unlink_guardian_account: false,
  });

  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null);
  const [teacherEdit, setTeacherEdit] = useState({
    name_ar: '',
    name_en: '',
    specialty_ar: '',
    qualifications_ar: '',
    hourly_rate: '180',
    bio_ar: '',
    is_public: true,
  });

  // Create Form states
  const [newCourse, setNewCourse] = useState({ title_ar: '', title_en: '', description_ar: '', level_id: '1', teacher_id: '1', schedule_ar: 'الإثنين · 5:00 م', price_monthly: '350', capacity: '12' });
  const [newLesson, setNewLesson] = useState({ course_id: '1', title_ar: '', lesson_date: '2026-11-20', start_time: '17:00', live_url: 'https://zoom.us/j/900112233' });
  const [newStudent, setNewStudent] = useState({ email: '', full_name_ar: '', age: '8', level_id: '1', guardian_name: '', guardian_phone: '', guardian_email: '', course_id: '1' });
  const [newTeacher, setNewTeacher] = useState({ email: '', name_ar: '', specialty_ar: 'نور البيان والقرآن', qualifications_ar: 'إجازة حفص', hourly_rate: '180' });
  const [enrollPair, setEnrollPair] = useState({ student_id: '1', course_id: '1' });
  const [newAnn, setNewAnn] = useState<{ title_ar: string; body_ar: string; target_scope: 'all_students' | 'course' | 'specific_students'; target_course_id: string; student_ids: number[] }>({
    title_ar: '',
    body_ar: '',
    target_scope: 'all_students',
    target_course_id: '1',
    student_ids: [],
  });
  const [newCert, setNewCert] = useState({ student_id: '1', course_id: '1', title_ar: 'شهادة إتمام المستوى', title_en: 'Level Completion Certificate', grade_label: 'امتياز · 98%' });
  const [newPay, setNewPay] = useState({ teacher_id: '1', month_year: '2026-11', base_amount: '5400', bonus_amount: '250', deduction_amount: '0' });
  const [resetTargetUser, setResetTargetUser] = useState<{ id: string | number; email: string; full_name: string } | null>(null);
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [showAdminNewPassword, setShowAdminNewPassword] = useState(false);
  const [resettingUserPass, setResettingUserPass] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminDashboard(user?.id),
    queryFn: () => apiFetch<AdminData>('/api/admin/dashboard'),
  });

  useEffect(() => {
    if (error) {
      toast(error instanceof Error ? error.message : 'Error', 'error');
    }
  }, [error, toast]);

  const { data: launchStatus = null } = useQuery({
    queryKey: queryKeys.adminLaunchStatus,
    queryFn: () =>
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
      }>('/api/admin/launch-status'),
    enabled: activeTab === 'settings',
  });

  const { data: schemaData } = useQuery({
    queryKey: queryKeys.adminSchema,
    queryFn: () => apiFetch<{ sql: string }>('/api/admin/supabase-schema'),
    enabled: activeTab === 'settings',
    staleTime: Infinity,
  });
  const schemaSql = schemaData?.sql || '';

  const loadData = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.adminDashboard(user?.id) });
    void qc.invalidateQueries({ queryKey: queryKeys.publicOverview });
  }, [qc, user?.id]);

  const fetchLaunchStatus = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.adminLaunchStatus });
  }, [qc]);

  if (isLoading) return <LoadingState />;
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

  const openLinkAttachment = async (lk: { id: number; url: string }) => {
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
      toast(err instanceof Error ? err.message : 'Unable to open attachment', 'error');
    }
  };

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
        setNewStudent({ email: '', full_name_ar: '', age: '8', level_id: '1', guardian_name: '', guardian_phone: '', guardian_email: '', course_id: '1' });
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    const startEditStudent = (s: AdminData['students'][number]) => {
      setEditingStudentId(s.id);
      setStudentEdit({
        full_name_ar: s.full_name_ar || '',
        full_name_en: s.full_name_en || '',
        age: String(s.age || 8),
        level_id: String(s.level_id || 1),
        status: s.status || 'active',
        guardian_name: s.guardian_name || '',
        guardian_phone: s.guardian_phone || '',
        guardian_email: s.guardian_email || '',
        unlink_guardian_account: false,
      });
    };

    const saveStudentEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingStudentId) return;
      try {
        await apiFetch(`/api/admin/students/${editingStudentId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...studentEdit,
            age: Number(studentEdit.age),
            level_id: Number(studentEdit.level_id),
          }),
        });
        toast(lang === 'ar' ? 'تم تحديث بيانات الطالب وولي الأمر' : 'Student & guardian updated', 'success');
        setEditingStudentId(null);
        loadData();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    const updateLevel = async (studentId: number, levelId: number) => {
      await apiFetch(`/api/admin/students/${studentId}/level`, { method: 'PATCH', body: JSON.stringify({ level_id: levelId }) });
      toast(lang === 'ar' ? 'تم تحديث تصنيف الطالب' : 'Student level updated', 'success');
      loadData();
    };

    const updateStatus = async (studentId: number, status: 'active' | 'paused' | 'graduated') => {
      await apiFetch(`/api/admin/students/${studentId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast(lang === 'ar' ? 'تم تحديث حالة الطالب' : 'Student status updated', 'success');
      loadData();
    };

    const copyCode = async (code: string) => {
      try {
        await navigator.clipboard.writeText(code);
        toast(lang === 'ar' ? `تم نسخ الكود: ${code}` : `Copied: ${code}`, 'success');
      } catch {
        toast(code, 'info');
      }
    };

    const filteredStudents = data.students.filter((s) => {
      const q = studentSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        s.full_name_ar.toLowerCase().includes(q) ||
        s.full_name_en.toLowerCase().includes(q) ||
        s.student_code.toLowerCase().includes(q) ||
        (s.guardian_name || '').toLowerCase().includes(q) ||
        (s.guardian_email || '').toLowerCase().includes(q)
      );
    });

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إضافة طالب جديد وتسكينه' : 'Add & Classify Student'}</h2>
          <form onSubmit={createStudent} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder={lang === 'ar' ? 'اسم الطالب' : 'Student Name'} value={newStudent.full_name_ar} onChange={(e) => setNewStudent({ ...newStudent, full_name_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="email" placeholder={lang === 'ar' ? 'البريد الإلكتروني للطالب' : 'Student Email'} value={newStudent.email} onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="number" placeholder={lang === 'ar' ? 'العمر' : 'Age'} value={newStudent.age} onChange={(e) => setNewStudent({ ...newStudent, age: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
            <input placeholder={lang === 'ar' ? 'اسم ولي الأمر' : 'Guardian Name'} value={newStudent.guardian_name} onChange={(e) => setNewStudent({ ...newStudent, guardian_name: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="email" placeholder={lang === 'ar' ? 'بريد ولي الأمر (للربط بكود الطالب)' : 'Guardian Email (for parent signup)'} value={newStudent.guardian_email} onChange={(e) => setNewStudent({ ...newStudent, guardian_email: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input placeholder={lang === 'ar' ? 'هاتف ولي الأمر' : 'Guardian Phone'} value={newStudent.guardian_phone} onChange={(e) => setNewStudent({ ...newStudent, guardian_phone: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <select value={newStudent.level_id} onChange={(e) => setNewStudent({ ...newStudent, level_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
            </select>
            <select value={newStudent.course_id} onChange={(e) => setNewStudent({ ...newStudent, course_id: e.target.value })} className="sm:col-span-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
              {data.courses.map((c) => <option key={c.id} value={c.id}>{c.title_ar}</option>)}
            </select>
            <div className="sm:col-span-3"><PrimaryButton type="submit">{lang === 'ar' ? 'إضافة الطالب' : 'Create Student'}</PrimaryButton></div>
          </form>
        </Card>

        {editingStudentId !== null && (
          <Card className="p-6 space-y-4 border-2 border-[#C98A1E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">{lang === 'ar' ? 'تعديل بيانات الطالب وربط ولي الأمر' : 'Edit Student & Guardian Link'}</h3>
              <button type="button" onClick={() => setEditingStudentId(null)} className="text-xs text-slate-500 hover:underline cursor-pointer">
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
            <form onSubmit={saveStudentEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input placeholder={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'} value={studentEdit.full_name_ar} onChange={(e) => setStudentEdit({ ...studentEdit, full_name_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <input placeholder={lang === 'ar' ? 'الاسم بالإنجليزية' : 'English Name'} value={studentEdit.full_name_en} onChange={(e) => setStudentEdit({ ...studentEdit, full_name_en: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <input type="number" placeholder={lang === 'ar' ? 'العمر' : 'Age'} value={studentEdit.age} onChange={(e) => setStudentEdit({ ...studentEdit, age: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
              <select value={studentEdit.level_id} onChange={(e) => setStudentEdit({ ...studentEdit, level_id: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
              </select>
              <select value={studentEdit.status} onChange={(e) => setStudentEdit({ ...studentEdit, status: e.target.value as 'active' | 'paused' | 'graduated' })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                <option value="active">{lang === 'ar' ? 'نشط (active)' : 'Active'}</option>
                <option value="paused">{lang === 'ar' ? 'متوقف مؤقتاً (paused)' : 'Paused'}</option>
                <option value="graduated">{lang === 'ar' ? 'متخرج (graduated)' : 'Graduated'}</option>
              </select>
              <input placeholder={lang === 'ar' ? 'اسم ولي الأمر' : 'Guardian Name'} value={studentEdit.guardian_name} onChange={(e) => setStudentEdit({ ...studentEdit, guardian_name: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <input type="email" placeholder={lang === 'ar' ? 'بريد ولي الأمر' : 'Guardian Email'} value={studentEdit.guardian_email} onChange={(e) => setStudentEdit({ ...studentEdit, guardian_email: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <input placeholder={lang === 'ar' ? 'هاتف ولي الأمر' : 'Guardian Phone'} value={studentEdit.guardian_phone} onChange={(e) => setStudentEdit({ ...studentEdit, guardian_phone: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer px-2">
                <input type="checkbox" checked={studentEdit.unlink_guardian_account} onChange={(e) => setStudentEdit({ ...studentEdit, unlink_guardian_account: e.target.checked })} />
                <span>{lang === 'ar' ? 'إعادة ضبط ربط حساب ولي الأمر' : 'Reset guardian link'}</span>
              </label>
              <div className="sm:col-span-3 flex gap-2">
                <PrimaryButton type="submit">{lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}</PrimaryButton>
                <SecondaryButton type="button" onClick={() => setEditingStudentId(null)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</SecondaryButton>
              </div>
            </form>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'ابحث باسم الطالب أو الكود أو بريد ولي الأمر...' : 'Search by name, code, or guardian email...'}
              className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] ps-9 pe-3 py-2 text-sm"
            />
          </div>
          <SecondaryButton
            type="button"
            className="text-xs"
            onClick={() =>
              exportCsv(
                'students.csv',
                ['Student Code', 'Arabic Name', 'English Name', 'Age', 'Level', 'Status', 'Guardian', 'Guardian Email', 'Guardian Linked'],
                filteredStudents.map((s) => [s.student_code, s.full_name_ar, s.full_name_en, s.age, s.level_name_ar, s.status, s.guardian_name, s.guardian_email, s.guardian_linked ? 'Yes' : 'No'])
              )
            }
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}</span>
          </SecondaryButton>
        </div>

        <ResponsiveTable
          data={filteredStudents}
          emptyTitle={lang === 'ar' ? 'لا يوجد طلاب مطابقون' : 'No students found'}
          columns={[
            {
              key: 'code',
              header: lang === 'ar' ? 'الكود' : 'Code',
              render: (r) => (
                <button
                  type="button"
                  onClick={() => void copyCode(r.student_code)}
                  className="inline-flex items-center gap-1 font-mono-tabular text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                  title={lang === 'ar' ? 'نسخ الكود' : 'Copy Code'}
                >
                  <span>{r.student_code}</span>
                  <Copy className="w-3 h-3" />
                </button>
              ),
            },
            { key: 'name', header: lang === 'ar' ? 'الطالب' : 'Student', render: (r) => r.full_name_ar },
            {
              key: 'guardian',
              header: lang === 'ar' ? 'ولي الأمر' : 'Guardian',
              render: (r) => (
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold">{r.guardian_name || '—'}</div>
                  <div className="text-slate-500 font-mono-tabular">
                    {r.guardian_email || '—'}{' '}
                    <span className={r.guardian_linked ? 'text-[#0F766E] dark:text-[#2DD4BF] font-bold' : 'text-[#C98A1E]'}>
                      ({r.guardian_linked ? (lang === 'ar' ? 'حساب مفعّل' : 'Linked') : lang === 'ar' ? 'بانتظار التسجيل' : 'Unlinked'})
                    </span>
                  </div>
                </div>
              ),
            },
            {
              key: 'level',
              header: lang === 'ar' ? 'المستوى' : 'Level',
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
              key: 'status',
              header: lang === 'ar' ? 'الحالة' : 'Status',
              render: (r) => (
                <select
                  value={r.status || 'active'}
                  onChange={(e) => updateStatus(r.id, e.target.value as 'active' | 'paused' | 'graduated')}
                  className="rounded-lg border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#13284A] px-2 py-1 text-xs"
                >
                  <option value="active">{lang === 'ar' ? 'نشط' : 'Active'}</option>
                  <option value="paused">{lang === 'ar' ? 'متوقف' : 'Paused'}</option>
                  <option value="graduated">{lang === 'ar' ? 'متخرج' : 'Graduated'}</option>
                </select>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'end',
              render: (r) => (
                <div className="inline-flex items-center gap-1">
                  <button onClick={() => startEditStudent(r)} className="p-1.5 text-[#0F766E] dark:text-[#2DD4BF] hover:bg-[#0F766E]/10 rounded-lg cursor-pointer" title={lang === 'ar' ? 'تعديل' : 'Edit'}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'students', id: r.id })} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer" title="Soft Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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

    const startEditTeacher = (t: AdminData['teachers'][number]) => {
      setEditingTeacherId(t.id);
      setTeacherEdit({
        name_ar: t.name_ar || '',
        name_en: t.name_en || '',
        specialty_ar: t.specialty_ar || '',
        qualifications_ar: t.qualifications_ar || '',
        hourly_rate: String(t.hourly_rate || 180),
        bio_ar: t.bio_ar || '',
        is_public: t.is_public !== false,
      });
    };

    const saveTeacherEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingTeacherId) return;
      try {
        await apiFetch(`/api/admin/teachers/${editingTeacherId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...teacherEdit,
            hourly_rate: Number(teacherEdit.hourly_rate),
          }),
        });
        toast(lang === 'ar' ? 'تم تحديث بيانات المعلم' : 'Teacher updated', 'success');
        setEditingTeacherId(null);
        loadData();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    return (
      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-extrabold">{lang === 'ar' ? 'إضافة معلم جديد (المدير فقط)' : 'Add Teacher (Admin Only)'}</h2>
          <form onSubmit={createTeacher} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input placeholder={lang === 'ar' ? 'اسم المعلم' : 'Teacher Name'} value={newTeacher.name_ar} onChange={(e) => setNewTeacher({ ...newTeacher, name_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="email" placeholder={lang === 'ar' ? 'البريد الإلكتروني' : 'Email'} value={newTeacher.email} onChange={(e) => setNewTeacher({ ...newTeacher, email: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input placeholder={lang === 'ar' ? 'التخصص' : 'Specialty'} value={newTeacher.specialty_ar} onChange={(e) => setNewTeacher({ ...newTeacher, specialty_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <input type="number" placeholder={lang === 'ar' ? 'الأجر/ساعة' : 'Rate/hr'} value={newTeacher.hourly_rate} onChange={(e) => setNewTeacher({ ...newTeacher, hourly_rate: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
            <div className="sm:col-span-4"><PrimaryButton type="submit">{lang === 'ar' ? 'إنشاء معلم' : 'Create Teacher'}</PrimaryButton></div>
          </form>
        </Card>

        {editingTeacherId !== null && (
          <Card className="p-6 space-y-4 border-2 border-[#C98A1E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">{lang === 'ar' ? 'تعديل بيانات المعلم' : 'Edit Teacher'}</h3>
              <button type="button" onClick={() => setEditingTeacherId(null)} className="text-xs text-slate-500 hover:underline cursor-pointer">
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
            <form onSubmit={saveTeacherEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input placeholder={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'} value={teacherEdit.name_ar} onChange={(e) => setTeacherEdit({ ...teacherEdit, name_ar: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <input placeholder={lang === 'ar' ? 'الاسم بالإنجليزية' : 'English Name'} value={teacherEdit.name_en} onChange={(e) => setTeacherEdit({ ...teacherEdit, name_en: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <input type="number" placeholder={lang === 'ar' ? 'الأجر/ساعة' : 'Hourly Rate'} value={teacherEdit.hourly_rate} onChange={(e) => setTeacherEdit({ ...teacherEdit, hourly_rate: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
              <input placeholder={lang === 'ar' ? 'التخصص' : 'Specialty'} value={teacherEdit.specialty_ar} onChange={(e) => setTeacherEdit({ ...teacherEdit, specialty_ar: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <input placeholder={lang === 'ar' ? 'المؤهلات والإجازات' : 'Qualifications'} value={teacherEdit.qualifications_ar} onChange={(e) => setTeacherEdit({ ...teacherEdit, qualifications_ar: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer px-2">
                <input type="checkbox" checked={teacherEdit.is_public} onChange={(e) => setTeacherEdit({ ...teacherEdit, is_public: e.target.checked })} />
                <span>{lang === 'ar' ? 'ظاهر في صفحة المعلمين العامة' : 'Visible publicly'}</span>
              </label>
              <textarea rows={2} placeholder={lang === 'ar' ? 'نبذة عن المعلم' : 'Bio'} value={teacherEdit.bio_ar} onChange={(e) => setTeacherEdit({ ...teacherEdit, bio_ar: e.target.value })} className="sm:col-span-3 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <div className="sm:col-span-3 flex gap-2">
                <PrimaryButton type="submit">{lang === 'ar' ? 'حفظ التعديلات' : 'Save Teacher'}</PrimaryButton>
                <SecondaryButton type="button" onClick={() => setEditingTeacherId(null)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</SecondaryButton>
              </div>
            </form>
          </Card>
        )}

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
                <div className="inline-flex items-center gap-1">
                  <button onClick={() => startEditTeacher(r)} className="p-1.5 text-[#0F766E] dark:text-[#2DD4BF] rounded-lg cursor-pointer" title={lang === 'ar' ? 'تعديل' : 'Edit'}>
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'teachers', id: r.id })} className="p-1.5 text-red-600 rounded-lg cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ),
            },
          ]}
        />
        <ConfirmDeleteModal open={Boolean(deleteTarget)} onConfirm={confirmSoftDelete} onClose={() => setDeleteTarget(null)} />
      </div>
    );
  }

  if (activeTab === 'courses') {
    const openCourseWorkspace = (c: AdminData['courses'][number]) => {
      setSelectedCourseId(c.id);
      setCourseEdit({
        title_ar: c.title_ar || '',
        title_en: c.title_en || c.title_ar || '',
        description_ar: c.description_ar || '',
        level_id: String(c.level_id || 1),
        teacher_id: String(c.teacher_id || 1),
        schedule_ar: c.schedule_ar || '',
        price_monthly: String(c.price_monthly ?? 0),
        capacity: String(c.capacity ?? 12),
        is_featured: Boolean(c.is_featured),
      });
      setCourseEnrollStudentId(String(data.students[0]?.id || ''));
      setAttachLessonId(null);
      setEditingLessonId(null);
    };

    const selectedCourse = selectedCourseId ? data.courses.find((c) => c.id === selectedCourseId) : null;

    if (selectedCourse && courseEdit) {
      const courseLessons = data.lessons.filter((l) => l.course_id === selectedCourse.id);
      const courseEnrollments = data.enrollments.filter((e) => e.course_id === selectedCourse.id);
      const enrolledStudentIds = new Set(courseEnrollments.map((e) => e.student_id));
      const unenrolledStudents = data.students.filter((s) => !enrolledStudentIds.has(s.id));

      const saveCourseDetails = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
          await apiFetch(`/api/admin/courses/${selectedCourse.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              ...courseEdit,
              level_id: Number(courseEdit.level_id),
              teacher_id: Number(courseEdit.teacher_id),
              price_monthly: Number(courseEdit.price_monthly),
              capacity: Number(courseEdit.capacity),
            }),
          });
          toast(lang === 'ar' ? 'تم حفظ تعديلات الدورة بنجاح' : 'Course details updated', 'success');
          loadData();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
        }
      };

      const addCourseLesson = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
          await apiFetch('/api/admin/lessons', {
            method: 'POST',
            body: JSON.stringify({
              ...courseLessonForm,
              course_id: selectedCourse.id,
              duration_min: Number(courseLessonForm.duration_min || 45),
            }),
          });
          toast(lang === 'ar' ? 'تمت إضافة الدرس للدورة' : 'Lesson added to course', 'success');
          setCourseLessonForm({ ...courseLessonForm, title_ar: '', objectives_ar: '', live_url: '' });
          loadData();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
        }
      };

      const saveLessonEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingLessonId) return;
        try {
          await apiFetch(`/api/admin/lessons/${editingLessonId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              ...lessonEdit,
              duration_min: Number(lessonEdit.duration_min || 45),
            }),
          });
          toast(lang === 'ar' ? 'تم تحديث بيانات الدرس' : 'Lesson updated', 'success');
          setEditingLessonId(null);
          loadData();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
        }
      };

      const addLessonAttachmentLink = async (e: React.FormEvent, lessonId: number) => {
        e.preventDefault();
        try {
          await apiFetch(`/api/lessons/${lessonId}/links`, {
            method: 'POST',
            body: JSON.stringify({
              link_type: attachForm.link_type,
              title_ar:
                attachForm.title_ar.trim() ||
                (attachForm.link_type === 'recording'
                  ? 'تسجيل المحاضرة'
                  : attachForm.link_type === 'material'
                  ? 'ملف الدرس'
                  : 'رابط الحصة المباشرة'),
              url: attachForm.url.trim(),
            }),
          });
          toast(lang === 'ar' ? 'تمت إضافة الرابط للدرس' : 'Link attached to lesson', 'success');
          setAttachForm({ link_type: 'recording', title_ar: '', url: '' });
          setAttachLessonId(null);
          loadData();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
        }
      };

      const uploadMaterialFile = async (lessonId: number, file: File) => {
        if (file.size > 8 * 1024 * 1024) {
          toast(
            lang === 'ar'
              ? 'حجم الملف يتجاوز 8 ميجابايت. ارفع الفيديوهات على Google Drive / YouTube وأضف الرابط بدلاً من رفعه هنا.'
              : 'Max file size is 8 MB. Host videos on Google Drive / YouTube and paste the link.',
            'error'
          );
          return;
        }
        setUploadingMaterial(true);
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
              title_ar: attachForm.title_ar.trim() || file.name,
            }),
          });
          toast(lang === 'ar' ? 'تم رفع ملف الدرس وحفظه بأمان' : 'Lesson material uploaded', 'success');
          setAttachForm({ ...attachForm, title_ar: '' });
          loadData();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Upload failed', 'error');
        } finally {
          setUploadingMaterial(false);
        }
      };

      const deleteLink = async (linkId: number) => {
        try {
          await apiFetch(`/api/lesson-links/${linkId}`, { method: 'DELETE' });
          toast(lang === 'ar' ? 'تم حذف المرفق' : 'Attachment deleted', 'info');
          loadData();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
        }
      };

      const quickEnroll = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!courseEnrollStudentId) return;
        try {
          await apiFetch('/api/admin/enrollments', {
            method: 'POST',
            body: JSON.stringify({ student_id: Number(courseEnrollStudentId), course_id: selectedCourse.id }),
          });
          toast(lang === 'ar' ? 'تم إلحاق الطالب بالدورة' : 'Student enrolled', 'success');
          loadData();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
        }
      };

      const removeEnrollment = async (enrollmentId: number) => {
        try {
          await apiFetch(`/api/admin/enrollments/${enrollmentId}`, { method: 'DELETE' });
          toast(lang === 'ar' ? 'تمت إزالة الطالب من الدورة' : 'Enrollment removed', 'info');
          loadData();
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Error', 'error');
        }
      };

      return (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedCourseId(null)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'العودة إلى قائمة الدورات' : 'Back to all courses'}</span>
              </button>
              <h2 className="text-2xl font-extrabold">{selectedCourse.title_ar}</h2>
              <div className="text-xs text-slate-500">
                {selectedCourse.teacher_name_ar} · {selectedCourse.level_name_ar} ·{' '}
                <span className="font-mono-tabular font-bold text-[#C98A1E]">
                  {courseEnrollments.length}/{selectedCourse.capacity} {lang === 'ar' ? 'طالب' : 'enrolled'}
                </span>
              </div>
            </div>
            <div className="text-sm font-extrabold px-4 py-2 rounded-xl bg-[#F2EFE6] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63]">
              {selectedCourse.price_monthly} EGP / {lang === 'ar' ? 'شهرياً' : 'mo'}
            </div>
          </div>

          {/* 1. Course Metadata & Pricing Editor */}
          <Card className="p-6 space-y-4">
            <h3 className="text-base font-extrabold">{lang === 'ar' ? 'تعديل إعدادات الدورة والأسعار والمواعيد' : 'Edit Course Settings, Price & Schedule'}</h3>
            <form onSubmit={saveCourseDetails} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'عنوان الدورة (عربي)' : 'Title (AR)'}</label>
                <input value={courseEdit.title_ar} onChange={(e) => setCourseEdit({ ...courseEdit, title_ar: e.target.value })} required className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'عنوان الدورة (إنجليزي)' : 'Title (EN)'}</label>
                <input value={courseEdit.title_en} onChange={(e) => setCourseEdit({ ...courseEdit, title_en: e.target.value })} required className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'المعلم المسؤول' : 'Teacher'}</label>
                <select value={courseEdit.teacher_id} onChange={(e) => setCourseEdit({ ...courseEdit, teacher_id: e.target.value })} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                  {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'المستوى' : 'Level'}</label>
                <select value={courseEdit.level_id} onChange={(e) => setCourseEdit({ ...courseEdit, level_id: e.target.value })} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm">
                  {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'المواعيد' : 'Schedule'}</label>
                <input value={courseEdit.schedule_ar} onChange={(e) => setCourseEdit({ ...courseEdit, schedule_ar: e.target.value })} required className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'السعر الشهري' : 'Price'}</label>
                  <input type="number" min={0} value={courseEdit.price_monthly} onChange={(e) => setCourseEdit({ ...courseEdit, price_monthly: e.target.value })} required className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold">{lang === 'ar' ? 'السعة' : 'Capacity'}</label>
                  <input type="number" min={1} value={courseEdit.capacity} onChange={(e) => setCourseEdit({ ...courseEdit, capacity: e.target.value })} required className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
                </div>
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold">{lang === 'ar' ? 'الوصف' : 'Description'}</label>
                <input value={courseEdit.description_ar} onChange={(e) => setCourseEdit({ ...courseEdit, description_ar: e.target.value })} className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer self-end pb-2">
                <input type="checkbox" checked={courseEdit.is_featured} onChange={(e) => setCourseEdit({ ...courseEdit, is_featured: e.target.checked })} />
                <span>{lang === 'ar' ? 'دورة مميزة في الرئيسية' : 'Featured on Home'}</span>
              </label>
              <div className="sm:col-span-3">
                <PrimaryButton type="submit">{lang === 'ar' ? 'حفظ تعديلات الدورة' : 'Save Course Changes'}</PrimaryButton>
              </div>
            </form>
          </Card>

          {/* 2. Course Lessons, Recordings & Files */}
          <Card className="p-6 space-y-5">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold">{lang === 'ar' ? 'الدروس والمحاضرات المسجلة والمرفقات' : 'Course Lessons, Recordings & Materials'}</h3>
              <p className="text-xs text-slate-500">
                {lang === 'ar'
                  ? 'أضف الدروس وارفع ملفات PDF / أوراق العمل (حتى 8 ميجا)، أما تسجيلات الفيديو فأضف رابط Google Drive أو YouTube Unlisted للحفاظ على سرعة ومجانية الاستضافة.'
                  : 'Attach live URLs, external Google Drive/YouTube recording links, or upload PDF worksheets (max 8 MB).'}
              </p>
            </div>

            <form onSubmit={addCourseLesson} className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63]">
              <input
                placeholder={lang === 'ar' ? 'عنوان الدرس الجديد *' : 'New Lesson Title *'}
                value={courseLessonForm.title_ar}
                onChange={(e) => setCourseLessonForm({ ...courseLessonForm, title_ar: e.target.value })}
                required
                className="sm:col-span-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs"
              />
              <input type="date" value={courseLessonForm.lesson_date} onChange={(e) => setCourseLessonForm({ ...courseLessonForm, lesson_date: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs font-mono-tabular" />
              <input type="time" value={courseLessonForm.start_time} onChange={(e) => setCourseLessonForm({ ...courseLessonForm, start_time: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs font-mono-tabular" />
              <input placeholder={lang === 'ar' ? 'رابط البث المباشر (اختياري)' : 'Live URL (optional)'} value={courseLessonForm.live_url} onChange={(e) => setCourseLessonForm({ ...courseLessonForm, live_url: e.target.value })} className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs" />
              <PrimaryButton type="submit" className="text-xs">
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إضافة درس' : 'Add Lesson'}</span>
              </PrimaryButton>
            </form>

            {courseLessons.length === 0 ? (
              <p className="text-sm text-slate-500">{lang === 'ar' ? 'لا توجد دروس في هذه الدورة بعد.' : 'No lessons in this course yet.'}</p>
            ) : (
              <div className="space-y-3">
                {courseLessons.map((ls) => {
                  const links = (data.lessonLinks || []).filter((lk) => lk.lesson_id === ls.id);
                  const isEditingThis = editingLessonId === ls.id;
                  const isAttachingThis = attachLessonId === ls.id;

                  return (
                    <div key={ls.id} className="rounded-xl border border-[#E5DEC9] dark:border-[#233C63] p-4 space-y-3 bg-white dark:bg-[#0F213E]">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-bold text-sm">{ls.title_ar}</div>
                          <div className="text-xs font-mono-tabular text-[#0F766E] dark:text-[#2DD4BF]">
                            {ls.lesson_date} · {ls.start_time} ({ls.duration_min} {lang === 'ar' ? 'د' : 'm'})
                          </div>
                          {ls.objectives_ar && <p className="text-xs text-slate-500">{ls.objectives_ar}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAttachLessonId(isAttachingThis ? null : ls.id);
                              setAttachForm({ link_type: 'recording', title_ar: '', url: '' });
                            }}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D625B] cursor-pointer"
                          >
                            {isAttachingThis ? (lang === 'ar' ? 'إغلاق المرفقات' : 'Close') : lang === 'ar' ? '+ تسجيل / ملف / رابط' : '+ Recording / File'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingThis) {
                                setEditingLessonId(null);
                              } else {
                                setEditingLessonId(ls.id);
                                setLessonEdit({
                                  title_ar: ls.title_ar || '',
                                  lesson_date: ls.lesson_date || '',
                                  start_time: ls.start_time || '',
                                  duration_min: String(ls.duration_min || 45),
                                  objectives_ar: ls.objectives_ar || '',
                                });
                              }
                            }}
                            className="p-1.5 rounded-lg text-[#0F766E] dark:text-[#2DD4BF] hover:bg-[#0F766E]/10 cursor-pointer"
                            title={lang === 'ar' ? 'تعديل الدرس' : 'Edit Lesson'}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ type: 'lessons', id: ls.id })}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                            title={lang === 'ar' ? 'حذف الدرس' : 'Delete Lesson'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {links.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {links.map((lk) => {
                            const Icon = lk.link_type === 'recording' ? PlayCircle : lk.link_type === 'material' ? FileText : Video;
                            const badgeLabel =
                              lk.link_type === 'recording'
                                ? lang === 'ar' ? 'تسجيل' : 'Rec'
                                : lk.link_type === 'material'
                                ? lang === 'ar' ? 'ملف' : 'File'
                                : lang === 'ar' ? 'بث' : 'Live';
                            return (
                              <div key={lk.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] dark:border-[#233C63] bg-[#FAF8F3] dark:bg-[#13284A] px-2.5 py-1 text-xs">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#C98A1E]/20 text-[#C98A1E]">{badgeLabel}</span>
                                <button
                                  type="button"
                                  onClick={() => void openLinkAttachment(lk)}
                                  className="inline-flex items-center gap-1 font-semibold hover:text-[#0F766E] cursor-pointer"
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                  <span>{lk.title_ar}</span>
                                  <ExternalLink className="w-3 h-3 opacity-60" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteLink(lk.id)}
                                  className="text-red-600 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 cursor-pointer"
                                  title={lang === 'ar' ? 'حذف المرفق' : 'Remove'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isEditingThis && (
                        <form onSubmit={saveLessonEdit} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] border border-[#E5DEC9] dark:border-[#233C63]">
                          <input value={lessonEdit.title_ar} onChange={(e) => setLessonEdit({ ...lessonEdit, title_ar: e.target.value })} required className="sm:col-span-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-1.5 text-xs" />
                          <input type="date" value={lessonEdit.lesson_date} onChange={(e) => setLessonEdit({ ...lessonEdit, lesson_date: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-1.5 text-xs font-mono-tabular" />
                          <input type="time" value={lessonEdit.start_time} onChange={(e) => setLessonEdit({ ...lessonEdit, start_time: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-1.5 text-xs font-mono-tabular" />
                          <input placeholder={lang === 'ar' ? 'أهداف الدرس' : 'Objectives'} value={lessonEdit.objectives_ar} onChange={(e) => setLessonEdit({ ...lessonEdit, objectives_ar: e.target.value })} className="sm:col-span-3 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-1.5 text-xs" />
                          <PrimaryButton type="submit" className="text-xs">{lang === 'ar' ? 'حفظ الدرس' : 'Save'}</PrimaryButton>
                        </form>
                      )}

                      {isAttachingThis && (
                        <div className="p-4 rounded-xl bg-[#FAF8F3] dark:bg-[#13284A] border border-[#C98A1E]/40 space-y-3">
                          <form onSubmit={(e) => addLessonAttachmentLink(e, ls.id)} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                            <select
                              value={attachForm.link_type}
                              onChange={(e) => setAttachForm({ ...attachForm, link_type: e.target.value as 'recording' | 'zoom' | 'meet' | 'material' })}
                              className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs font-bold"
                            >
                              <option value="recording">{lang === 'ar' ? 'تسجيل المحاضرة (Google Drive / YouTube)' : 'Recording URL'}</option>
                              <option value="zoom">{lang === 'ar' ? 'رابط Zoom مباشر' : 'Live Zoom URL'}</option>
                              <option value="meet">{lang === 'ar' ? 'رابط Google Meet' : 'Live Meet URL'}</option>
                              <option value="material">{lang === 'ar' ? 'رابط ملف خارجي' : 'External Material URL'}</option>
                            </select>
                            <input
                              placeholder={lang === 'ar' ? 'العنوان (مثال: تسجيل الحصة الرابعة)' : 'Label'}
                              value={attachForm.title_ar}
                              onChange={(e) => setAttachForm({ ...attachForm, title_ar: e.target.value })}
                              className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs"
                            />
                            <input
                              type="url"
                              required
                              dir="ltr"
                              placeholder="https://drive.google.com/file/..."
                              value={attachForm.url}
                              onChange={(e) => setAttachForm({ ...attachForm, url: e.target.value })}
                              className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#091529] px-3 py-2 text-xs"
                            />
                            <PrimaryButton type="submit" className="text-xs">{lang === 'ar' ? 'إضافة الرابط' : 'Add Link'}</PrimaryButton>
                          </form>
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5DEC9] dark:border-[#233C63] text-xs">
                            <span className="text-slate-500">
                              {lang === 'ar'
                                ? 'أو رفع ملف (PDF / مستند / صورة / صوت — حد أقصى 8 ميجا):'
                                : 'Or upload document/PDF directly to private Storage (max 8 MB):'}
                            </span>
                            <label className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 bg-[#0F213E] text-white font-bold cursor-pointer hover:bg-[#19335E]">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{uploadingMaterial ? (lang === 'ar' ? 'جاري الرفع...' : 'Uploading...') : lang === 'ar' ? 'رفع ملف للدرس' : 'Upload File'}</span>
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.ppt,.pptx,.mp3,.m4a"
                                disabled={uploadingMaterial}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void uploadMaterialFile(ls.id, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* 3. Course Enrollments */}
          <Card className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-extrabold">{lang === 'ar' ? 'الطلاب المسجلون بهذه الدورة' : 'Enrolled Students in Course'}</h3>
              {unenrolledStudents.length > 0 && (
                <form onSubmit={quickEnroll} className="flex flex-wrap items-center gap-2">
                  <select
                    value={courseEnrollStudentId}
                    onChange={(e) => setCourseEnrollStudentId(e.target.value)}
                    className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-1.5 text-xs"
                  >
                    {unenrolledStudents.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name_ar} ({s.student_code})</option>
                    ))}
                  </select>
                  <PrimaryButton type="submit" className="text-xs py-1.5">{lang === 'ar' ? '+ إلحاق طالب' : '+ Enroll'}</PrimaryButton>
                </form>
              )}
            </div>
            <ResponsiveTable
              data={courseEnrollments}
              emptyTitle={lang === 'ar' ? 'لا يوجد طلاب ملتحقون بهذه الدورة بعد' : 'No students enrolled yet'}
              columns={[
                { key: 'student', header: lang === 'ar' ? 'الطالب' : 'Student', render: (r) => r.student_name_ar },
                { key: 'status', header: lang === 'ar' ? 'الحالة' : 'Status', render: (r) => r.status },
                {
                  key: 'act',
                  header: '',
                  align: 'end',
                  render: (r) => (
                    <button
                      type="button"
                      onClick={() => void removeEnrollment(r.id)}
                      className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      {lang === 'ar' ? 'إزالة من الدورة' : 'Remove'}
                    </button>
                  ),
                },
              ]}
            />
          </Card>

          <ConfirmDeleteModal open={Boolean(deleteTarget)} onConfirm={confirmSoftDelete} onClose={() => setDeleteTarget(null)} />
        </div>
      );
    }

    const createCourse = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await apiFetch('/api/admin/courses', { method: 'POST', body: JSON.stringify(newCourse) });
        toast(lang === 'ar' ? 'تم إنشاء الكورس بنجاح' : 'Course created', 'success');
        setNewCourse({ title_ar: '', title_en: '', description_ar: '', level_id: '1', teacher_id: '1', schedule_ar: 'الإثنين · 5:00 م', price_monthly: '350', capacity: '12' });
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    const filteredCourses = data.courses.filter((c) => {
      const q = courseSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        c.title_ar.toLowerCase().includes(q) ||
        (c.title_en || '').toLowerCase().includes(q) ||
        (c.teacher_name_ar || '').toLowerCase().includes(q)
      );
    });

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
            <input type="number" placeholder={lang === 'ar' ? 'السعة' : 'Capacity'} value={newCourse.capacity} onChange={(e) => setNewCourse({ ...newCourse, capacity: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm tabular-nums" />
            <input placeholder={lang === 'ar' ? 'وصف مختصر' : 'Description'} value={newCourse.description_ar} onChange={(e) => setNewCourse({ ...newCourse, description_ar: e.target.value })} required className="sm:col-span-3 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
            <div className="sm:col-span-3"><PrimaryButton type="submit">{lang === 'ar' ? 'إنشاء الحلقة' : 'Create Course'}</PrimaryButton></div>
          </form>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'ابحث باسم الدورة أو المعلم...' : 'Search by course or teacher...'}
              className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] ps-9 pe-3 py-2 text-sm"
            />
          </div>
          <SecondaryButton
            type="button"
            className="text-xs"
            onClick={() =>
              exportCsv(
                'courses.csv',
                ['Title', 'Level', 'Teacher', 'Schedule', 'Monthly Price', 'Capacity'],
                filteredCourses.map((c) => [c.title_ar, c.level_name_ar, c.teacher_name_ar, c.schedule_ar, c.price_monthly, c.capacity])
              )
            }
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}</span>
          </SecondaryButton>
        </div>

        <ResponsiveTable
          data={filteredCourses}
          emptyTitle={lang === 'ar' ? 'لا توجد كورسات' : 'No courses'}
          columns={[
            { key: 'title', header: lang === 'ar' ? 'الحلقة' : 'Title', render: (r) => <span className="font-bold">{r.title_ar}</span> },
            { key: 'teacher', header: lang === 'ar' ? 'المعلم' : 'Teacher', render: (r) => r.teacher_name_ar },
            { key: 'schedule', header: lang === 'ar' ? 'الموعد' : 'Schedule', render: (r) => r.schedule_ar },
            { key: 'price', header: lang === 'ar' ? 'السعر' : 'Price', align: 'end', render: (r) => <span className="font-mono-tabular font-bold">{r.price_monthly}</span> },
            {
              key: 'act',
              header: lang === 'ar' ? 'التحكم' : 'Manage',
              align: 'end',
              render: (r) => (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openCourseWorkspace(r)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold bg-[#0F766E] text-white hover:bg-[#0D625B] cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إدارة الدورة والدروس' : 'Manage'}</span>
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'courses', id: r.id })} className="p-1.5 text-red-600 rounded-lg cursor-pointer" title={lang === 'ar' ? 'أرشفة' : 'Archive'}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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

    const saveInlineLessonEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingLessonId) return;
      try {
        await apiFetch(`/api/admin/lessons/${editingLessonId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...lessonEdit,
            duration_min: Number(lessonEdit.duration_min || 45),
          }),
        });
        toast(lang === 'ar' ? 'تم تعديل الدرس بنجاح' : 'Lesson updated', 'success');
        setEditingLessonId(null);
        loadData();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
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

        {editingLessonId !== null && (
          <Card className="p-6 space-y-4 border-2 border-[#C98A1E]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">{lang === 'ar' ? 'تعديل بيانات الدرس' : 'Edit Lesson'}</h3>
              <button type="button" onClick={() => setEditingLessonId(null)} className="text-xs text-slate-500 hover:underline cursor-pointer">
                {lang === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
            <form onSubmit={saveInlineLessonEdit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input value={lessonEdit.title_ar} onChange={(e) => setLessonEdit({ ...lessonEdit, title_ar: e.target.value })} required className="sm:col-span-2 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <input type="date" value={lessonEdit.lesson_date} onChange={(e) => setLessonEdit({ ...lessonEdit, lesson_date: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular" />
              <input type="time" value={lessonEdit.start_time} onChange={(e) => setLessonEdit({ ...lessonEdit, start_time: e.target.value })} required className="rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm font-mono-tabular" />
              <input placeholder={lang === 'ar' ? 'الأهداف' : 'Objectives'} value={lessonEdit.objectives_ar} onChange={(e) => setLessonEdit({ ...lessonEdit, objectives_ar: e.target.value })} className="sm:col-span-3 rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] px-3 py-2 text-sm" />
              <PrimaryButton type="submit">{lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}</PrimaryButton>
            </form>
          </Card>
        )}

        <ResponsiveTable
          data={data.lessons}
          emptyTitle={lang === 'ar' ? 'لا توجد دروس' : 'No lessons'}
          columns={[
            { key: 'title', header: lang === 'ar' ? 'الدرس' : 'Lesson', render: (r) => r.title_ar },
            { key: 'course', header: lang === 'ar' ? 'الحلقة' : 'Course', render: (r) => r.course_title_ar },
            { key: 'date', header: lang === 'ar' ? 'التاريخ' : 'Date', render: (r) => <span className="font-mono-tabular">{r.lesson_date} · {r.start_time}</span> },
            {
              key: 'links',
              header: lang === 'ar' ? 'المرفقات' : 'Attachments',
              align: 'end',
              render: (r) => <span className="font-mono-tabular font-bold">{(data.lessonLinks || []).filter((lk) => lk.lesson_id === r.id).length}</span>,
            },
            {
              key: 'act',
              header: '',
              align: 'end',
              render: (r) => (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingLessonId(r.id);
                      setLessonEdit({
                        title_ar: r.title_ar || '',
                        lesson_date: r.lesson_date || '',
                        start_time: r.start_time || '',
                        duration_min: String(r.duration_min || 45),
                        objectives_ar: r.objectives_ar || '',
                      });
                    }}
                    className="p-1.5 text-[#0F766E] dark:text-[#2DD4BF] rounded-lg cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'lessons', id: r.id })} className="p-1.5 text-red-600 rounded-lg cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
      try {
        const res = await apiFetch<{ ok: boolean; student_code?: string; temporary_password?: string }>(
          `/api/admin/admissions/${id}/decision`,
          { method: 'POST', body: JSON.stringify({ decision }) }
        );
        if (decision === 'approved') {
          toast(
            res.temporary_password
              ? lang === 'ar'
                ? `تم القبول وتفعيل الحساب (${res.student_code || ''}) — كلمة المرور المؤقتة: ${res.temporary_password}`
                : `Approved & linked (${res.student_code || ''}) — Temp password: ${res.temporary_password}`
              : lang === 'ar'
              ? `تم القبول وتفعيل حساب الطالب بكلمة مروره (${res.student_code || ''})`
              : `Approved & student account activated (${res.student_code || ''})`,
            'success'
          );
        } else {
          toast(lang === 'ar' ? 'تم رفض الطلب وإلغاء التفعيل' : 'Request rejected', 'success');
        }
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    const decideTeacherApp = async (id: number, decision: 'approved' | 'rejected') => {
      try {
        await apiFetch(`/api/admin/teacher-applications/${id}/decision`, {
          method: 'POST',
          body: JSON.stringify({ decision }),
        });
        toast(
          decision === 'approved'
            ? lang === 'ar'
              ? 'تم قبول المعلم وتفعيل حسابه بصلاحيات المعلم'
              : 'Teacher approved and portal activated'
            : lang === 'ar'
            ? 'تم رفض طلب المعلم'
            : 'Teacher application rejected',
          'success'
        );
        loadData();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Error', 'error');
      }
    };

    const filteredAdmissions = data.admissionRequests.filter((r) => {
      if (admissionFilter !== 'all' && r.status !== admissionFilter) return false;
      const q = admissionSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        r.student_name.toLowerCase().includes(q) ||
        (r.student_email || '').toLowerCase().includes(q) ||
        r.guardian_name.toLowerCase().includes(q) ||
        r.guardian_email.toLowerCase().includes(q) ||
        r.guardian_phone.toLowerCase().includes(q)
      );
    });

    const teacherApps = (data.teacherApplications || []).filter((t) => {
      if (admissionFilter !== 'all' && t.status !== admissionFilter) return false;
      const q = admissionSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        t.name_ar.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        t.specialty_ar.toLowerCase().includes(q) ||
        t.phone.toLowerCase().includes(q)
      );
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">{lang === 'ar' ? 'طلبات التقديم (طلاب ومعلمون)' : 'Applications (Students & Teachers)'}</h2>
          <SecondaryButton
            type="button"
            className="text-xs"
            onClick={() =>
              exportCsv(
                'admissions.csv',
                ['Student', 'Age', 'Student Email', 'Guardian', 'Guardian Email', 'Guardian Phone', 'Course', 'Status'],
                filteredAdmissions.map((r) => [r.student_name, r.student_age, r.student_email || '', r.guardian_name, r.guardian_email, r.guardian_phone, r.course_title_ar, r.status])
              )
            }
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}</span>
          </SecondaryButton>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setAdmissionFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                  admissionFilter === st
                    ? 'bg-[#0F213E] text-white border-[#0F213E] dark:bg-[#C98A1E] dark:border-[#C98A1E]'
                    : 'bg-white dark:bg-[#0F213E] border-[#E5DEC9] dark:border-[#233C63]'
                }`}
              >
                {st === 'all'
                  ? lang === 'ar' ? 'الكل' : 'All'
                  : st === 'pending'
                  ? lang === 'ar' ? 'معلقة' : 'Pending'
                  : st === 'approved'
                  ? lang === 'ar' ? 'مقبولة' : 'Approved'
                  : lang === 'ar' ? 'مرفوضة' : 'Rejected'}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              value={admissionSearch}
              onChange={(e) => setAdmissionSearch(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث في الطلبات...' : 'Search applications...'}
              className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-white dark:bg-[#0F213E] ps-9 pe-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-extrabold">{lang === 'ar' ? 'طلبات التحاق الطلاب' : 'Student Admission Requests'}</h3>
          <ResponsiveTable
            data={filteredAdmissions}
            emptyTitle={lang === 'ar' ? 'لا توجد طلبات طلاب' : 'No student requests'}
            columns={[
              {
                key: 'student',
                header: lang === 'ar' ? 'الطالب' : 'Student',
                render: (r) => (
                  <div className="text-xs">
                    <div className="font-bold">{r.student_name} ({r.student_age})</div>
                    {r.student_email && <div className="text-[#0F766E] dark:text-[#2DD4BF] font-mono-tabular">{r.student_email}</div>}
                  </div>
                ),
              },
              {
                key: 'guardian',
                header: lang === 'ar' ? 'ولي الأمر' : 'Guardian',
                render: (r) => (
                  <div className="text-xs">
                    <div className="font-semibold">{r.guardian_name}</div>
                    <div className="text-slate-500 font-mono-tabular">{r.guardian_phone} · {r.guardian_email}</div>
                  </div>
                ),
              },
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

        <div className="space-y-3 pt-2">
          <h3 className="text-base font-extrabold">{lang === 'ar' ? 'طلبات انضمام المعلمين' : 'Teacher Faculty Applications'}</h3>
          <ResponsiveTable
            data={teacherApps}
            emptyTitle={lang === 'ar' ? 'لا توجد طلبات معلمين' : 'No teacher applications'}
            columns={[
              {
                key: 'teacher',
                header: lang === 'ar' ? 'المعلم' : 'Applicant',
                render: (r) => (
                  <div className="text-xs">
                    <div className="font-bold">{r.name_ar}</div>
                    <div className="text-[#0F766E] dark:text-[#2DD4BF] font-mono-tabular">{r.email}</div>
                    <div className="text-slate-500 font-mono-tabular">{r.phone}</div>
                  </div>
                ),
              },
              {
                key: 'specialty',
                header: lang === 'ar' ? 'التخصص والمؤهل' : 'Specialty & Qualifications',
                render: (r) => (
                  <div className="text-xs max-w-xs">
                    <div className="font-semibold">{r.specialty_ar}</div>
                    <div className="text-slate-500">{r.qualifications_ar}</div>
                  </div>
                ),
              },
              { key: 'status', header: lang === 'ar' ? 'الحالة' : 'Status', render: (r) => r.status },
              {
                key: 'act',
                header: lang === 'ar' ? 'القرار' : 'Action',
                align: 'end',
                render: (r) =>
                  r.status === 'pending' ? (
                    <div className="inline-flex gap-2">
                      <button onClick={() => decideTeacherApp(r.id, 'approved')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold bg-[#0F766E] text-white cursor-pointer">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {lang === 'ar' ? 'اعتماد معلم' : 'Approve'}
                      </button>
                      <button onClick={() => decideTeacherApp(r.id, 'rejected')} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold bg-red-700 text-white cursor-pointer">
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
    return <ExamCenter courses={data.courses} exams={data.exams} onReload={loadData} />;
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
                    onClick={async () => {
                      const { generateCertificatePDF } = await import('../../lib/pdfCertificate');
                      await generateCertificatePDF({
                        verification_code: r.verification_code,
                        student_name_ar: r.student_name_ar,
                        student_name_en: r.student_name_ar,
                        course_title_ar: r.course_title_ar,
                        course_title_en: r.course_title_ar,
                        title_ar: r.title_ar,
                        title_en: r.title_en,
                        grade_label: r.grade_label,
                        issued_at: r.issued_at,
                      });
                    }}
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
          {
            key: 'actions',
            header: lang === 'ar' ? 'كلمة المرور' : 'Password',
            render: (r) => (
              <button
                type="button"
                onClick={() => {
                  setResetTargetUser({ id: r.id, email: r.email, full_name: r.full_name });
                  setAdminNewPassword('');
                  setShowAdminNewPassword(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#13284A] hover:border-[#C98A1E] px-2.5 py-1 text-xs font-bold cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#C98A1E]" />
                <span>{lang === 'ar' ? 'تعيين كلمة مرور' : 'Set Password'}</span>
              </button>
            ),
          },
        ]}
      />

      {resetTargetUser && (
        <Card className="p-5 space-y-3 border-[#C98A1E]/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <KeyRound className="w-4 h-4 text-[#C98A1E]" />
              <span>
                {lang === 'ar'
                  ? `تعيين كلمة مرور جديدة للحساب: ${resetTargetUser.full_name} (${resetTargetUser.email})`
                  : `Set New Password for ${resetTargetUser.full_name} (${resetTargetUser.email})`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setResetTargetUser(null);
                setAdminNewPassword('');
              }}
              className="text-xs text-slate-500 hover:underline cursor-pointer"
            >
              {lang === 'ar' ? 'إغلاق' : 'Close'}
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (adminNewPassword.length < 8) {
                toast(lang === 'ar' ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' : 'Password must be at least 8 characters', 'error');
                return;
              }
              setResettingUserPass(true);
              try {
                await apiFetch(`/api/admin/users/${resetTargetUser.id}/reset-password`, {
                  method: 'POST',
                  body: JSON.stringify({ newPassword: adminNewPassword }),
                });
                toast(
                  lang === 'ar'
                    ? `تم تعيين كلمة المرور الجديدة لحساب ${resetTargetUser.email} بنجاح`
                    : `Password updated for ${resetTargetUser.email}`,
                  'success'
                );
                setResetTargetUser(null);
                setAdminNewPassword('');
              } catch (err: unknown) {
                toast(err instanceof Error ? err.message : 'Reset failed', 'error');
              } finally {
                setResettingUserPass(false);
              }
            }}
            className="flex flex-wrap items-center gap-3"
          >
            <div className="relative flex-1 min-w-[220px]">
              <input
                type={showAdminNewPassword ? 'text' : 'password'}
                dir="ltr"
                autoComplete="new-password"
                required
                minLength={8}
                value={adminNewPassword}
                onChange={(e) => setAdminNewPassword(e.target.value)}
                placeholder={lang === 'ar' ? 'أدخل كلمة المرور الجديدة (8 أحرف فأكثر)' : 'Enter new password (8+ chars)'}
                className="w-full rounded-xl border border-[#D6CDB4] dark:border-[#294A7D] bg-[#FAF8F3] dark:bg-[#091529] pl-3.5 pr-10 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowAdminNewPassword((v) => !v)}
                aria-label={showAdminNewPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#0F213E] dark:hover:text-[#F8F5EC] cursor-pointer"
              >
                {showAdminNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PrimaryButton type="submit" disabled={resettingUserPass} className="text-xs">
              {resettingUserPass
                ? lang === 'ar' ? 'جاري الحفظ...' : 'Saving...'
                : lang === 'ar' ? 'حفظ كلمة المرور الجديدة' : 'Save New Password'}
            </PrimaryButton>
          </form>
        </Card>
      )}

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
