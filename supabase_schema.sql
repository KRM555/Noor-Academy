-- ============================================================================
-- أكاديمية نور وبيان | Noor & Bayan Academy — Supabase PostgreSQL + Full RLS Schema
-- Idempotent & Hardened Schema: All 28 Tables, Indexes, Helper Functions & RLS
-- جاهز للنسخ والتنفيذ مباشرة في Supabase SQL Editor (آمن للتنفيذ المتكرر)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles & Roles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin', 'guardian')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_lang TEXT NOT NULL DEFAULT 'ar',
  token_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;

-- 2. Levels, Guardians, Teachers, Students
CREATE TABLE IF NOT EXISTS public.levels (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  description_en TEXT NOT NULL,
  age_range TEXT NOT NULL,
  order_index INT NOT NULL,
  criteria_ar TEXT NOT NULL,
  criteria_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guardians (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'ولي أمر',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.teachers (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  bio_ar TEXT NOT NULL,
  bio_en TEXT NOT NULL,
  qualifications_ar TEXT NOT NULL,
  qualifications_en TEXT NOT NULL,
  specialty_ar TEXT NOT NULL,
  specialty_en TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 150,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.students (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  guardian_id BIGINT REFERENCES public.guardians(id) ON DELETE SET NULL,
  student_code TEXT UNIQUE NOT NULL,
  full_name_ar TEXT NOT NULL,
  full_name_en TEXT NOT NULL,
  age INT NOT NULL,
  level_id BIGINT REFERENCES public.levels(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'graduated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- 3. Academic Structure
CREATE TABLE IF NOT EXISTS public.courses (
  id BIGSERIAL PRIMARY KEY,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  description_en TEXT NOT NULL,
  level_id BIGINT REFERENCES public.levels(id) ON DELETE SET NULL,
  teacher_id BIGINT REFERENCES public.teachers(id) ON DELETE SET NULL,
  schedule_ar TEXT NOT NULL,
  schedule_en TEXT NOT NULL,
  price_monthly NUMERIC(10,2) NOT NULL,
  capacity INT NOT NULL DEFAULT 12,
  is_featured BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.lessons (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  lesson_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  duration_min INT NOT NULL DEFAULT 45,
  objectives_ar TEXT NOT NULL,
  objectives_en TEXT NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.lesson_links (
  id BIGSERIAL PRIMARY KEY,
  lesson_id BIGINT NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  url TEXT NOT NULL,
  link_type TEXT NOT NULL CHECK (link_type IN ('zoom', 'meet', 'material', 'recording'))
);

CREATE TABLE IF NOT EXISTS public.enrollments (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(student_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id BIGSERIAL PRIMARY KEY,
  lesson_id BIGINT NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late')),
  notes TEXT DEFAULT '',
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(lesson_id, student_id)
);

-- 4. Assessments
CREATE TABLE IF NOT EXISTS public.exams (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  exam_date DATE NOT NULL,
  max_score NUMERIC(5,2) NOT NULL DEFAULT 100,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.exam_results (
  id BIGSERIAL PRIMARY KEY,
  exam_id BIGINT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL,
  feedback_ar TEXT DEFAULT '',
  feedback_en TEXT DEFAULT '',
  graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  graded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.recitations (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  surah_name TEXT NOT NULL,
  ayah_from INT NOT NULL,
  ayah_to INT NOT NULL,
  tajweed_score NUMERIC(5,2) NOT NULL,
  memorization_score NUMERIC(5,2) NOT NULL,
  notes_ar TEXT DEFAULT '',
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.evaluations (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  behavior_score NUMERIC(5,2) NOT NULL,
  participation_score NUMERIC(5,2) NOT NULL,
  summary_ar TEXT NOT NULL,
  summary_en TEXT NOT NULL,
  evaluated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.placement_tests (
  id BIGSERIAL PRIMARY KEY,
  child_name TEXT NOT NULL,
  age INT NOT NULL,
  parent_email TEXT DEFAULT '',
  score INT NOT NULL,
  recommended_level_id BIGINT REFERENCES public.levels(id) ON DELETE SET NULL,
  answers_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Communications
CREATE TABLE IF NOT EXISTS public.announcements (
  id BIGSERIAL PRIMARY KEY,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  body_en TEXT NOT NULL,
  target_scope TEXT NOT NULL CHECK (target_scope IN ('all_students', 'course', 'specific_students')),
  target_course_id BIGINT REFERENCES public.courses(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.announcement_targets (
  id BIGSERIAL PRIMARY KEY,
  announcement_id BIGINT NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  UNIQUE(announcement_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_ar TEXT NOT NULL,
  body_en TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Certificates & Games
CREATE TABLE IF NOT EXISTS public.certificates (
  id BIGSERIAL PRIMARY KEY,
  verification_code TEXT UNIQUE NOT NULL,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  grade_label TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.games (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  description_en TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('letters', 'numbers', 'memorization', '3d_explorer')),
  is_public_sample BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.game_progress (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  game_id BIGINT NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  stars INT NOT NULL DEFAULT 0,
  completed_levels INT NOT NULL DEFAULT 1,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, game_id)
);

-- 7. Financial (Strict: NO card numbers or CVV, unique payroll per teacher/month)
CREATE TABLE IF NOT EXISTS public.teacher_payout_details (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT UNIQUE NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  account_holder_name TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  iban TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll (
  id BIGSERIAL PRIMARY KEY,
  teacher_id BIGINT NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  base_amount NUMERIC(10,2) NOT NULL,
  bonus_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  deduction_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, month_year)
);

-- 8. Admissions, Legal, Testimonials & Audit
CREATE TABLE IF NOT EXISTS public.admission_requests (
  id BIGSERIAL PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_age INT NOT NULL,
  guardian_name TEXT NOT NULL,
  guardian_email TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,
  preferred_course_id BIGINT REFERENCES public.courses(id) ON DELETE SET NULL,
  recommended_level_id BIGINT REFERENCES public.levels(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  consent_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id BIGSERIAL PRIMARY KEY,
  doc_type TEXT UNIQUE NOT NULL CHECK (doc_type IN ('terms', 'privacy', 'refund')),
  version TEXT NOT NULL DEFAULT '1.0',
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  content_ar TEXT NOT NULL,
  content_en TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.consents (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_version TEXT NOT NULL,
  ip_address TEXT DEFAULT '',
  actor_role TEXT DEFAULT 'guardian',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT '';
ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS actor_role TEXT DEFAULT 'guardian';

CREATE TABLE IF NOT EXISTS public.testimonials (
  id BIGSERIAL PRIMARY KEY,
  guardian_name_ar TEXT NOT NULL,
  guardian_name_en TEXT NOT NULL,
  relation_ar TEXT NOT NULL,
  relation_en TEXT NOT NULL,
  quote_ar TEXT NOT NULL,
  quote_en TEXT NOT NULL,
  student_outcome_ar TEXT NOT NULL,
  student_outcome_en TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Performance Indexes on Foreign Keys & Lookup Columns
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_guardians_profile ON public.guardians(profile_id);
CREATE INDEX IF NOT EXISTS idx_students_profile ON public.students(profile_id);
CREATE INDEX IF NOT EXISTS idx_students_guardian ON public.students(guardian_id);
CREATE INDEX IF NOT EXISTS idx_courses_teacher ON public.courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_level ON public.courses(level_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON public.lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_links_lesson ON public.lesson_links(lesson_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON public.enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam ON public.exam_results(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_student ON public.exam_results(student_id);
CREATE INDEX IF NOT EXISTS idx_recitations_student ON public.recitations(student_id);
CREATE INDEX IF NOT EXISTS idx_recitations_course ON public.recitations(course_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_student ON public.evaluations(student_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_course ON public.evaluations(course_id);
CREATE INDEX IF NOT EXISTS idx_notifications_profile ON public.notifications(profile_id);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON public.certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_payroll_teacher ON public.payroll(teacher_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_email_unique ON public.profiles (LOWER(email)) WHERE deleted_at IS NULL;

-- ============================================================================
-- Helper Security-Definer Functions for Strict RLS & Public Certificate Verification
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = TRUE AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'teacher' AND is_active = TRUE AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_owner(sid BIGINT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = sid AND s.deleted_at IS NULL AND (
      s.profile_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.guardians g
        WHERE g.id = s.guardian_id AND g.profile_id = auth.uid() AND g.deleted_at IS NULL
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.teaches_course(cid BIGINT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses c
    JOIN public.teachers t ON t.id = c.teacher_id
    WHERE c.id = cid AND t.profile_id = auth.uid() AND c.deleted_at IS NULL AND t.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.teaches_student(sid BIGINT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    JOIN public.teachers t ON t.id = c.teacher_id
    WHERE e.student_id = sid AND t.profile_id = auth.uid() AND e.deleted_at IS NULL AND c.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.enrolled_in_course(cid BIGINT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    JOIN public.students s ON s.id = e.student_id
    WHERE e.course_id = cid AND e.deleted_at IS NULL AND (
      s.profile_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.guardians g WHERE g.id = s.guardian_id AND g.profile_id = auth.uid() AND g.deleted_at IS NULL)
    )
  );
$$;

-- Safe Public Certificate Verification RPC (exposes single certificate by exact code without opening certificates table)
CREATE OR REPLACE FUNCTION public.verify_certificate(p_code TEXT)
RETURNS TABLE (
  verification_code TEXT,
  title_ar TEXT,
  title_en TEXT,
  grade_label TEXT,
  issued_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  student_name_ar TEXT,
  student_name_en TEXT,
  course_title_ar TEXT,
  course_title_en TEXT
)
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT
    cert.verification_code,
    cert.title_ar,
    cert.title_en,
    cert.grade_label,
    cert.issued_at,
    cert.revoked_at,
    s.full_name_ar AS student_name_ar,
    s.full_name_en AS student_name_en,
    c.title_ar AS course_title_ar,
    c.title_en AS course_title_en
  FROM public.certificates cert
  JOIN public.students s ON s.id = cert.student_id
  JOIN public.courses c ON c.id = cert.course_id
  WHERE LOWER(cert.verification_code) = LOWER(TRIM(p_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_teacher() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_student_owner(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_student_owner(BIGINT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.teaches_course(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_course(BIGINT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.teaches_student(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teaches_student(BIGINT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enrolled_in_course(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrolled_in_course(BIGINT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.verify_certificate(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(TEXT) TO anon, authenticated;

-- ============================================================================
-- Enable Row Level Security (RLS) on ALL 28 Tables
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_payout_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Strict RLS Policies for Every Table (Idempotent)
-- ============================================================================

-- Profiles
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Public Catalog Tables (Read active public items; Admin full CRUD)
DROP POLICY IF EXISTS "levels_public_read" ON public.levels;
CREATE POLICY "levels_public_read" ON public.levels FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "levels_admin_all" ON public.levels;
CREATE POLICY "levels_admin_all" ON public.levels FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "teachers_public_read" ON public.teachers;
CREATE POLICY "teachers_public_read" ON public.teachers
  FOR SELECT USING ((is_public = TRUE AND deleted_at IS NULL) OR profile_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "teachers_admin_all" ON public.teachers;
CREATE POLICY "teachers_admin_all" ON public.teachers FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "courses_public_read" ON public.courses;
CREATE POLICY "courses_public_read" ON public.courses FOR SELECT USING (deleted_at IS NULL OR public.is_admin());
DROP POLICY IF EXISTS "courses_admin_all" ON public.courses;
CREATE POLICY "courses_admin_all" ON public.courses FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lessons_public_read" ON public.lessons;
CREATE POLICY "lessons_public_read" ON public.lessons FOR SELECT USING (deleted_at IS NULL OR public.is_admin());
DROP POLICY IF EXISTS "lessons_admin_all" ON public.lessons;
CREATE POLICY "lessons_admin_all" ON public.lessons FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "games_public_read" ON public.games;
CREATE POLICY "games_public_read" ON public.games FOR SELECT USING (is_active = TRUE OR public.is_admin());
DROP POLICY IF EXISTS "games_admin_all" ON public.games;
CREATE POLICY "games_admin_all" ON public.games FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "legal_public_read" ON public.legal_documents;
CREATE POLICY "legal_public_read" ON public.legal_documents FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "legal_admin_all" ON public.legal_documents;
CREATE POLICY "legal_admin_all" ON public.legal_documents FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "testimonials_public_read" ON public.testimonials;
CREATE POLICY "testimonials_public_read" ON public.testimonials FOR SELECT USING (is_approved = TRUE OR public.is_admin());
DROP POLICY IF EXISTS "testimonials_admin_all" ON public.testimonials;
CREATE POLICY "testimonials_admin_all" ON public.testimonials FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Lesson Links (CRITICAL: ONLY enrolled students/guardians, course teacher, or admin — NEVER public)
DROP POLICY IF EXISTS "lesson_links_scoped_read" ON public.lesson_links;
CREATE POLICY "lesson_links_scoped_read" ON public.lesson_links
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.lessons l
      WHERE l.id = lesson_links.lesson_id AND l.deleted_at IS NULL
        AND (public.teaches_course(l.course_id) OR public.enrolled_in_course(l.course_id))
    )
  );
DROP POLICY IF EXISTS "lesson_links_admin_all" ON public.lesson_links;
CREATE POLICY "lesson_links_admin_all" ON public.lesson_links FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Guardians (Own guardian record, linked child student, or Admin only)
DROP POLICY IF EXISTS "guardians_scoped_read" ON public.guardians;
CREATE POLICY "guardians_scoped_read" ON public.guardians
  FOR SELECT USING (
    public.is_admin()
    OR profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.guardian_id = guardians.id AND s.profile_id = auth.uid() AND s.deleted_at IS NULL)
  );
DROP POLICY IF EXISTS "guardians_admin_all" ON public.guardians;
CREATE POLICY "guardians_admin_all" ON public.guardians FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Students & Enrollments
DROP POLICY IF EXISTS "students_scoped_read" ON public.students;
CREATE POLICY "students_scoped_read" ON public.students
  FOR SELECT USING (public.is_admin() OR public.is_student_owner(id) OR public.teaches_student(id));
DROP POLICY IF EXISTS "students_admin_all" ON public.students;
CREATE POLICY "students_admin_all" ON public.students FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "enrollments_scoped_read" ON public.enrollments;
CREATE POLICY "enrollments_scoped_read" ON public.enrollments
  FOR SELECT USING (public.is_admin() OR public.is_student_owner(student_id) OR public.teaches_course(course_id));
DROP POLICY IF EXISTS "enrollments_admin_all" ON public.enrollments;
CREATE POLICY "enrollments_admin_all" ON public.enrollments FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Attendance
DROP POLICY IF EXISTS "attendance_scoped_read" ON public.attendance;
CREATE POLICY "attendance_scoped_read" ON public.attendance
  FOR SELECT USING (
    public.is_admin()
    OR public.is_student_owner(student_id)
    OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = attendance.lesson_id AND public.teaches_course(l.course_id))
  );
DROP POLICY IF EXISTS "attendance_teacher_write" ON public.attendance;
CREATE POLICY "attendance_teacher_write" ON public.attendance
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = attendance.lesson_id AND public.teaches_course(l.course_id))
  );
DROP POLICY IF EXISTS "attendance_teacher_update" ON public.attendance;
CREATE POLICY "attendance_teacher_update" ON public.attendance
  FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = attendance.lesson_id AND public.teaches_course(l.course_id))
  );
DROP POLICY IF EXISTS "attendance_admin_delete" ON public.attendance;
CREATE POLICY "attendance_admin_delete" ON public.attendance FOR DELETE USING (public.is_admin());

-- Exams & Exam Results
DROP POLICY IF EXISTS "exams_scoped_read" ON public.exams;
CREATE POLICY "exams_scoped_read" ON public.exams
  FOR SELECT USING (public.is_admin() OR public.teaches_course(course_id) OR public.enrolled_in_course(course_id));
DROP POLICY IF EXISTS "exams_admin_all" ON public.exams;
CREATE POLICY "exams_admin_all" ON public.exams FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "exam_results_scoped_read" ON public.exam_results;
CREATE POLICY "exam_results_scoped_read" ON public.exam_results
  FOR SELECT USING (
    public.is_admin()
    OR public.is_student_owner(student_id)
    OR EXISTS (SELECT 1 FROM public.exams ex WHERE ex.id = exam_results.exam_id AND public.teaches_course(ex.course_id))
  );
DROP POLICY IF EXISTS "exam_results_teacher_write" ON public.exam_results;
CREATE POLICY "exam_results_teacher_write" ON public.exam_results
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.exams ex WHERE ex.id = exam_results.exam_id AND public.teaches_course(ex.course_id))
  );
DROP POLICY IF EXISTS "exam_results_teacher_update" ON public.exam_results;
CREATE POLICY "exam_results_teacher_update" ON public.exam_results
  FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.exams ex WHERE ex.id = exam_results.exam_id AND public.teaches_course(ex.course_id))
  );

-- Recitations & Evaluations
DROP POLICY IF EXISTS "recitations_scoped_read" ON public.recitations;
CREATE POLICY "recitations_scoped_read" ON public.recitations
  FOR SELECT USING (public.is_admin() OR public.is_student_owner(student_id) OR public.teaches_course(course_id));
DROP POLICY IF EXISTS "recitations_teacher_write" ON public.recitations;
CREATE POLICY "recitations_teacher_write" ON public.recitations
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (public.teaches_course(course_id) AND public.teaches_student(student_id))
  );

DROP POLICY IF EXISTS "evaluations_scoped_read" ON public.evaluations;
CREATE POLICY "evaluations_scoped_read" ON public.evaluations
  FOR SELECT USING (public.is_admin() OR public.is_student_owner(student_id) OR public.teaches_course(course_id));
DROP POLICY IF EXISTS "evaluations_teacher_write" ON public.evaluations;
CREATE POLICY "evaluations_teacher_write" ON public.evaluations
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (public.teaches_course(course_id) AND public.teaches_student(student_id))
  );

-- Announcements & Targets & Notifications
DROP POLICY IF EXISTS "announcements_scoped_read" ON public.announcements;
CREATE POLICY "announcements_scoped_read" ON public.announcements
  FOR SELECT USING (
    public.is_admin()
    OR (deleted_at IS NULL AND (
      target_scope = 'all_students'
      OR (target_scope = 'course' AND public.enrolled_in_course(target_course_id))
      OR (target_scope = 'specific_students' AND EXISTS (
        SELECT 1 FROM public.announcement_targets at WHERE at.announcement_id = announcements.id AND public.is_student_owner(at.student_id)
      ))
    ))
  );
DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
CREATE POLICY "announcements_admin_all" ON public.announcements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "announcement_targets_scoped_read" ON public.announcement_targets;
CREATE POLICY "announcement_targets_scoped_read" ON public.announcement_targets
  FOR SELECT USING (public.is_admin() OR public.is_student_owner(student_id));
DROP POLICY IF EXISTS "announcement_targets_admin_all" ON public.announcement_targets;
CREATE POLICY "announcement_targets_admin_all" ON public.announcement_targets FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "notifications_own_read" ON public.notifications;
CREATE POLICY "notifications_own_read" ON public.notifications FOR SELECT USING (profile_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "notifications_own_update" ON public.notifications;
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE USING (profile_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "notifications_admin_insert" ON public.notifications;
CREATE POLICY "notifications_admin_insert" ON public.notifications FOR INSERT WITH CHECK (public.is_admin());

-- Certificates & Game Progress
DROP POLICY IF EXISTS "certificates_scoped_read" ON public.certificates;
CREATE POLICY "certificates_scoped_read" ON public.certificates
  FOR SELECT USING (public.is_admin() OR public.is_student_owner(student_id));
DROP POLICY IF EXISTS "certificates_admin_all" ON public.certificates;
CREATE POLICY "certificates_admin_all" ON public.certificates FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "game_progress_scoped_read" ON public.game_progress;
CREATE POLICY "game_progress_scoped_read" ON public.game_progress
  FOR SELECT USING (public.is_admin() OR public.is_student_owner(student_id));
DROP POLICY IF EXISTS "game_progress_student_upsert" ON public.game_progress;
CREATE POLICY "game_progress_student_upsert" ON public.game_progress
  FOR INSERT WITH CHECK (public.is_student_owner(student_id) OR public.is_admin());
DROP POLICY IF EXISTS "game_progress_student_update" ON public.game_progress;
CREATE POLICY "game_progress_student_update" ON public.game_progress
  FOR UPDATE USING (public.is_student_owner(student_id) OR public.is_admin());

-- Teacher Payout Details & Payroll (Teacher own only + Admin)
DROP POLICY IF EXISTS "payout_details_own_read" ON public.teacher_payout_details;
CREATE POLICY "payout_details_own_read" ON public.teacher_payout_details
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_payout_details.teacher_id AND t.profile_id = auth.uid())
  );
DROP POLICY IF EXISTS "payout_details_own_write" ON public.teacher_payout_details;
CREATE POLICY "payout_details_own_write" ON public.teacher_payout_details
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_payout_details.teacher_id AND t.profile_id = auth.uid())
  );
DROP POLICY IF EXISTS "payout_details_own_update" ON public.teacher_payout_details;
CREATE POLICY "payout_details_own_update" ON public.teacher_payout_details
  FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_payout_details.teacher_id AND t.profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "payroll_own_read" ON public.payroll;
CREATE POLICY "payroll_own_read" ON public.payroll
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = payroll.teacher_id AND t.profile_id = auth.uid())
  );
DROP POLICY IF EXISTS "payroll_admin_all" ON public.payroll;
CREATE POLICY "payroll_admin_all" ON public.payroll FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Public Submissions (Routed exclusively through Express backend with Zod validation & rate limits)
DROP POLICY IF EXISTS "admission_public_insert" ON public.admission_requests;
DROP POLICY IF EXISTS "admission_admin_read_update" ON public.admission_requests;
CREATE POLICY "admission_admin_read_update" ON public.admission_requests
  FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "admission_admin_modify" ON public.admission_requests;
CREATE POLICY "admission_admin_modify" ON public.admission_requests
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "placement_public_insert" ON public.placement_tests;
DROP POLICY IF EXISTS "placement_admin_read" ON public.placement_tests;
CREATE POLICY "placement_admin_read" ON public.placement_tests
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "consents_public_insert" ON public.consents;
DROP POLICY IF EXISTS "consents_admin_read" ON public.consents;
CREATE POLICY "consents_admin_read" ON public.consents
  FOR SELECT USING (public.is_admin());

-- Audit Logs (Admin read & insert only)
DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "audit_logs_admin_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_insert" ON public.audit_logs FOR INSERT WITH CHECK (public.is_admin());

-- ============================================================================
-- Zero-Trust PostgREST Lockdown (All queries execute through Express service_role)
-- Keeps public.verify_certificate(TEXT) RPC callable if needed
-- ============================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- ============================================================================
-- Student Levels Catalog Update (Level 1 / Level 2 / Level 3)
-- ============================================================================
UPDATE public.levels
SET
  code = 'LEVEL-1',
  name_ar = 'المستوى الأول',
  name_en = 'Level 1',
  description_ar = 'مرحلة التأسيس الأولى لبناء المهارات الأساسية خطوة بخطوة',
  description_en = 'First foundational level for building core skills step by step',
  criteria_ar = 'بداية المسار أو في مرحلة التأسيس الأولى',
  criteria_en = 'Starting path or early foundation stage'
WHERE id = 1 OR code = 'L1-BRAEM';

UPDATE public.levels
SET
  code = 'LEVEL-2',
  name_ar = 'المستوى الثاني',
  name_en = 'Level 2',
  description_ar = 'مرحلة التطبيق المتوسط وتنمية الفهم والقراءة والتدريب العملي',
  description_en = 'Intermediate level focused on practice, comprehension, and fluency',
  criteria_ar = 'إتقان مبادئ المستوى الأول واجتياز التقييم المبدئي',
  criteria_en = 'Mastery of Level 1 basics and passing initial placement'
WHERE id = 2 OR code = 'L2-NOOR';

UPDATE public.levels
SET
  code = 'LEVEL-3',
  name_ar = 'المستوى الثالث',
  name_en = 'Level 3',
  description_ar = 'المستوى المتقدم للتعمّق والإتقان في المناهج المقررة',
  description_en = 'Advanced level for deeper mastery across enrolled tracks',
  criteria_ar = 'اجتياز المستوى الثاني أو تحقيق درجة متقدمة في تحديد المستوى',
  criteria_en = 'Completion of Level 2 or advanced placement score'
WHERE id = 3 OR code = 'L3-TAJWEED';
