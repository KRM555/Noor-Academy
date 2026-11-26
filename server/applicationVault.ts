import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const APPLICATION_VAULT_BUCKET = 'application-vault';

export interface AdmissionMetaRecord {
  admission_id: number;
  student_email: string;
  pending_profile_id: string | null;
  created_at: string;
}

export interface TeacherApplicationRecord {
  id: number;
  profile_id: string | null;
  email: string;
  name_ar: string;
  name_en: string;
  phone: string;
  specialty_ar: string;
  qualifications_ar: string;
  bio_ar: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface GuardianRequestRecord {
  id: number;
  profile_id: string;
  guardian_id: number;
  student_id: number;
  student_code: string;
  student_name: string;
  full_name: string;
  email: string;
  phone: string;
  relation: string;
  status: 'pending' | 'approved' | 'rejected';
  shared_student_email?: boolean;
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

export interface GuardianAuthRecord {
  guardian_id: number;
  email: string;
  full_name: string;
  phone: string;
  relation: string;
  linked_profile_id: string | null;
  password_salt: string;
  password_hash: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface CourseMetaRecord {
  course_id: number;
  cover_url?: string | null;
  cover_storage_path?: string | null;
  cover_mime?: string | null;
  co_teacher_ids?: number[];
  price_monthly_sar?: number | null;
  updated_at: string;
}

export interface LessonMetaRecord {
  lesson_id: number;
  weekday_ar: string;
  is_published: boolean;
  published_at: string | null;
  teacher_id?: number | null;
}

export const COURSE_COVERS_BUCKET = 'course-covers';

let vaultCheckedAt = 0;
let coversBucketCheckedAt = 0;

const VAULT_CACHE_TTL_MS = 30_000;
let admissionMetasCache: { value: Map<number, AdmissionMetaRecord>; expiresAt: number } | null = null;
let teacherAppsCache: { value: TeacherApplicationRecord[]; expiresAt: number } | null = null;
let guardianReqsCache: { value: GuardianRequestRecord[]; expiresAt: number } | null = null;
let courseMetasCache: { value: Map<number, CourseMetaRecord>; expiresAt: number } | null = null;
let lessonMetasCache: { value: Map<number, LessonMetaRecord>; expiresAt: number } | null = null;
let teacherPhonesCache: { value: Map<number, string>; expiresAt: number } | null = null;
const singleCourseMetaCache = new Map<number, { value: CourseMetaRecord | null; expiresAt: number }>();
const singleLessonMetaCache = new Map<number, { value: LessonMetaRecord | null; expiresAt: number }>();

function invalidateAdmissionMetasCache() {
  admissionMetasCache = null;
}
function invalidateTeacherAppsCache() {
  teacherAppsCache = null;
}
function invalidateGuardianReqsCache() {
  guardianReqsCache = null;
}
function invalidateCourseMetaCaches(courseId?: number) {
  courseMetasCache = null;
  if (typeof courseId === 'number') singleCourseMetaCache.delete(courseId);
  else singleCourseMetaCache.clear();
}
function invalidateLessonMetaCaches(lessonId?: number) {
  lessonMetasCache = null;
  if (typeof lessonId === 'number') singleLessonMetaCache.delete(lessonId);
  else singleLessonMetaCache.clear();
}

async function ensureApplicationVaultBucket(sb: SupabaseClient): Promise<void> {
  if (Date.now() - vaultCheckedAt < 60_000) return;
  const { data: bucket } = await sb.storage.getBucket(APPLICATION_VAULT_BUCKET);
  if (!bucket) {
    const { error } = await sb.storage.createBucket(APPLICATION_VAULT_BUCKET, {
      public: false,
      fileSizeLimit: 512 * 1024,
    });
    if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
      throw new Error(`Application vault bucket init failed: ${error.message}`);
    }
  }
  vaultCheckedAt = Date.now();
}

async function ensureCourseCoversBucket(sb: SupabaseClient): Promise<void> {
  if (Date.now() - coversBucketCheckedAt < 60_000) return;
  const { data: bucket } = await sb.storage.getBucket(COURSE_COVERS_BUCKET);
  if (!bucket) {
    const { error } = await sb.storage.createBucket(COURSE_COVERS_BUCKET, {
      public: false,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
      throw new Error(`Course covers bucket init failed: ${error.message}`);
    }
  }
  coversBucketCheckedAt = Date.now();
}

async function listAllVaultFiles(sb: SupabaseClient, folder: string): Promise<Array<{ name: string }>> {
  await ensureApplicationVaultBucket(sb);
  const all: Array<{ name: string }> = [];
  const limit = 500;
  for (let offset = 0; offset < 10_000; offset += limit) {
    const { data: files } = await sb.storage.from(APPLICATION_VAULT_BUCKET).list(folder, {
      limit,
      offset,
    });
    if (!files || !files.length) break;
    for (const f of files) {
      if (f.name.endsWith('.json')) all.push({ name: f.name });
    }
    if (files.length < limit) break;
  }
  return all;
}

async function readJsonFromVault<T>(sb: SupabaseClient, path: string): Promise<T | null> {
  await ensureApplicationVaultBucket(sb);
  const { data, error } = await sb.storage.from(APPLICATION_VAULT_BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function writeJsonToVault(sb: SupabaseClient, path: string, payload: unknown): Promise<void> {
  await ensureApplicationVaultBucket(sb);
  const buf = Buffer.from(JSON.stringify(payload), 'utf8');
  const { error } = await sb.storage.from(APPLICATION_VAULT_BUCKET).upload(path, buf, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) {
    throw new Error(`Application vault write failed: ${error.message}`);
  }
}

export async function saveAdmissionMeta(sb: SupabaseClient, record: AdmissionMetaRecord): Promise<void> {
  await writeJsonToVault(sb, `admissions/${record.admission_id}.json`, record);
  invalidateAdmissionMetasCache();
}

export async function getAdmissionMeta(sb: SupabaseClient, admissionId: number): Promise<AdmissionMetaRecord | null> {
  if (admissionMetasCache && Date.now() < admissionMetasCache.expiresAt) {
    return admissionMetasCache.value.get(admissionId) ?? null;
  }
  return readJsonFromVault<AdmissionMetaRecord>(sb, `admissions/${admissionId}.json`);
}

export async function listAdmissionMetas(sb: SupabaseClient): Promise<Map<number, AdmissionMetaRecord>> {
  if (admissionMetasCache && Date.now() < admissionMetasCache.expiresAt) {
    return admissionMetasCache.value;
  }
  const result = new Map<number, AdmissionMetaRecord>();
  const files = await listAllVaultFiles(sb, 'admissions');
  if (!files.length) {
    admissionMetasCache = { value: result, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
    return result;
  }
  const rows = await Promise.all(
    files.map((f) => readJsonFromVault<AdmissionMetaRecord>(sb, `admissions/${f.name}`))
  );
  for (const row of rows) {
    if (row && typeof row.admission_id === 'number') {
      result.set(row.admission_id, row);
    }
  }
  admissionMetasCache = { value: result, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
  return result;
}

export function generateApplicationId(): number {
  return Date.now() * 100 + crypto.randomInt(10, 99);
}

export async function saveTeacherApplication(sb: SupabaseClient, record: TeacherApplicationRecord): Promise<void> {
  await writeJsonToVault(sb, `teacher-applications/${record.id}.json`, record);
  invalidateTeacherAppsCache();
}

export async function getTeacherApplication(sb: SupabaseClient, id: number): Promise<TeacherApplicationRecord | null> {
  return readJsonFromVault<TeacherApplicationRecord>(sb, `teacher-applications/${id}.json`);
}

export async function listTeacherApplications(sb: SupabaseClient): Promise<TeacherApplicationRecord[]> {
  if (teacherAppsCache && Date.now() < teacherAppsCache.expiresAt) {
    return teacherAppsCache.value;
  }
  const files = await listAllVaultFiles(sb, 'teacher-applications');
  if (!files.length) {
    teacherAppsCache = { value: [], expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
    return [];
  }
  const rows = await Promise.all(
    files.map((f) => readJsonFromVault<TeacherApplicationRecord>(sb, `teacher-applications/${f.name}`))
  );
  const sorted = rows
    .filter((r): r is TeacherApplicationRecord => Boolean(r && typeof r.id === 'number'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  teacherAppsCache = { value: sorted, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
  return sorted;
}

export async function saveGuardianRequest(sb: SupabaseClient, record: GuardianRequestRecord): Promise<void> {
  await writeJsonToVault(sb, `guardian-requests/${record.id}.json`, record);
  invalidateGuardianReqsCache();
}

export async function getGuardianRequest(sb: SupabaseClient, id: number): Promise<GuardianRequestRecord | null> {
  return readJsonFromVault<GuardianRequestRecord>(sb, `guardian-requests/${id}.json`);
}

export async function listGuardianRequests(sb: SupabaseClient): Promise<GuardianRequestRecord[]> {
  if (guardianReqsCache && Date.now() < guardianReqsCache.expiresAt) {
    return guardianReqsCache.value;
  }
  const files = await listAllVaultFiles(sb, 'guardian-requests');
  if (!files.length) {
    guardianReqsCache = { value: [], expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
    return [];
  }
  const rows = await Promise.all(
    files.map((f) => readJsonFromVault<GuardianRequestRecord>(sb, `guardian-requests/${f.name}`))
  );
  const sorted = rows
    .filter((r): r is GuardianRequestRecord => Boolean(r && typeof r.id === 'number'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  guardianReqsCache = { value: sorted, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
  return sorted;
}

export async function deleteAdmissionMeta(sb: SupabaseClient, admissionId: number): Promise<void> {
  await ensureApplicationVaultBucket(sb);
  const { error } = await sb.storage.from(APPLICATION_VAULT_BUCKET).remove([`admissions/${admissionId}.json`]);
  if (error) {
    console.warn(`[applicationVault] Failed removing admission meta ${admissionId}:`, error.message);
  }
  if (admissionMetasCache && Date.now() < admissionMetasCache.expiresAt) {
    admissionMetasCache.value.delete(admissionId);
  } else {
    invalidateAdmissionMetasCache();
  }
}

async function removeVaultPathsWithRetry(
  sb: SupabaseClient,
  paths: string[],
  label: string
): Promise<number> {
  if (!paths.length) return 0;
  try {
    await ensureApplicationVaultBucket(sb);
  } catch (err) {
    console.warn(`[applicationVault] ${label} bucket check failed:`, err instanceof Error ? err.message : err);
    return paths.length;
  }

  let failedCount = 0;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < paths.length; i += CHUNK_SIZE) {
    const chunk = paths.slice(i, i + CHUNK_SIZE);
    let chunkSucceeded = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { error } = await sb.storage.from(APPLICATION_VAULT_BUCKET).remove(chunk);
        if (!error) {
          chunkSucceeded = true;
          break;
        }
        console.warn(`[applicationVault] ${label} remove attempt ${attempt + 1} failed:`, error.message);
      } catch (err) {
        console.warn(
          `[applicationVault] ${label} remove attempt ${attempt + 1} threw:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    if (!chunkSucceeded) {
      failedCount += chunk.length;
    }
  }
  return failedCount;
}

export async function deleteAdmissionMetasBatch(
  sb: SupabaseClient,
  admissionIds: number[]
): Promise<{ failed: number }> {
  const uniqueIds = Array.from(new Set(admissionIds.filter((id) => Number.isFinite(id))));
  if (!uniqueIds.length) return { failed: 0 };
  const paths = uniqueIds.map((id) => `admissions/${id}.json`);
  const failed = await removeVaultPathsWithRetry(sb, paths, 'admissionMetasBatch');
  if (admissionMetasCache && Date.now() < admissionMetasCache.expiresAt) {
    for (const id of uniqueIds) admissionMetasCache.value.delete(id);
  } else {
    invalidateAdmissionMetasCache();
  }
  return { failed };
}

export async function deleteTeacherApplication(sb: SupabaseClient, id: number): Promise<void> {
  await ensureApplicationVaultBucket(sb);
  const { error } = await sb.storage.from(APPLICATION_VAULT_BUCKET).remove([`teacher-applications/${id}.json`]);
  if (error) {
    console.warn(`[applicationVault] Failed removing teacher application ${id}:`, error.message);
  }
  if (teacherAppsCache && Date.now() < teacherAppsCache.expiresAt) {
    teacherAppsCache.value = teacherAppsCache.value.filter((app) => app.id !== id);
  } else {
    invalidateTeacherAppsCache();
  }
}

export async function deleteTeacherApplicationsBatch(
  sb: SupabaseClient,
  ids: number[]
): Promise<{ failed: number }> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
  if (!uniqueIds.length) return { failed: 0 };
  const paths = uniqueIds.map((id) => `teacher-applications/${id}.json`);
  const failed = await removeVaultPathsWithRetry(sb, paths, 'teacherApplicationsBatch');
  const idSet = new Set(uniqueIds);
  if (teacherAppsCache && Date.now() < teacherAppsCache.expiresAt) {
    teacherAppsCache.value = teacherAppsCache.value.filter((app) => !idSet.has(app.id));
  } else {
    invalidateTeacherAppsCache();
  }
  return { failed };
}

export async function deleteGuardianRequest(sb: SupabaseClient, id: number): Promise<void> {
  await ensureApplicationVaultBucket(sb);
  const { error } = await sb.storage.from(APPLICATION_VAULT_BUCKET).remove([`guardian-requests/${id}.json`]);
  if (error) {
    console.warn(`[applicationVault] Failed removing guardian request ${id}:`, error.message);
  }
  if (guardianReqsCache && Date.now() < guardianReqsCache.expiresAt) {
    guardianReqsCache.value = guardianReqsCache.value.filter((req) => req.id !== id);
  } else {
    invalidateGuardianReqsCache();
  }
}

export async function deleteGuardianRequestsBatch(
  sb: SupabaseClient,
  ids: number[]
): Promise<{ failed: number }> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
  if (!uniqueIds.length) return { failed: 0 };
  const paths = uniqueIds.map((id) => `guardian-requests/${id}.json`);
  const failed = await removeVaultPathsWithRetry(sb, paths, 'guardianRequestsBatch');
  const idSet = new Set(uniqueIds);
  if (guardianReqsCache && Date.now() < guardianReqsCache.expiresAt) {
    guardianReqsCache.value = guardianReqsCache.value.filter((req) => !idSet.has(req.id));
  } else {
    invalidateGuardianReqsCache();
  }
  return { failed };
}

export function hashVaultPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyVaultPassword(password: string, salt: string, expectedHash: string): boolean {
  try {
    if (!salt || !expectedHash) return false;
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function saveGuardianAuth(sb: SupabaseClient, record: GuardianAuthRecord): Promise<void> {
  await writeJsonToVault(sb, `guardian-auth/${record.guardian_id}.json`, record);
}

export async function getGuardianAuth(sb: SupabaseClient, guardianId: number): Promise<GuardianAuthRecord | null> {
  return readJsonFromVault<GuardianAuthRecord>(sb, `guardian-auth/${guardianId}.json`);
}

export async function deleteGuardianAuth(sb: SupabaseClient, guardianId: number): Promise<void> {
  await ensureApplicationVaultBucket(sb);
  await sb.storage.from(APPLICATION_VAULT_BUCKET).remove([`guardian-auth/${guardianId}.json`]).catch(() => {});
}

export async function listGuardianAuths(sb: SupabaseClient): Promise<GuardianAuthRecord[]> {
  const files = await listAllVaultFiles(sb, 'guardian-auth');
  if (!files.length) return [];
  const rows = await Promise.all(
    files.map((f) => readJsonFromVault<GuardianAuthRecord>(sb, `guardian-auth/${f.name}`))
  );
  return rows.filter((r): r is GuardianAuthRecord => Boolean(r && typeof r.guardian_id === 'number'));
}

export async function saveCourseMeta(sb: SupabaseClient, record: CourseMetaRecord): Promise<void> {
  await writeJsonToVault(sb, `course-meta/${record.course_id}.json`, record);
  invalidateCourseMetaCaches(record.course_id);
}

export async function getCourseMeta(sb: SupabaseClient, courseId: number): Promise<CourseMetaRecord | null> {
  const cachedSingle = singleCourseMetaCache.get(courseId);
  if (cachedSingle && Date.now() < cachedSingle.expiresAt) {
    return cachedSingle.value;
  }
  if (courseMetasCache && Date.now() < courseMetasCache.expiresAt) {
    return courseMetasCache.value.get(courseId) ?? null;
  }
  const value = await readJsonFromVault<CourseMetaRecord>(sb, `course-meta/${courseId}.json`);
  singleCourseMetaCache.set(courseId, { value, expiresAt: Date.now() + VAULT_CACHE_TTL_MS });
  return value;
}

export async function deleteCourseMeta(sb: SupabaseClient, courseId: number): Promise<void> {
  await ensureApplicationVaultBucket(sb);
  await sb.storage.from(APPLICATION_VAULT_BUCKET).remove([`course-meta/${courseId}.json`]).catch(() => {});
  invalidateCourseMetaCaches(courseId);
}

export async function listCourseMetas(sb: SupabaseClient): Promise<Map<number, CourseMetaRecord>> {
  if (courseMetasCache && Date.now() < courseMetasCache.expiresAt) {
    return courseMetasCache.value;
  }
  const result = new Map<number, CourseMetaRecord>();
  const files = await listAllVaultFiles(sb, 'course-meta');
  if (!files.length) {
    courseMetasCache = { value: result, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
    return result;
  }
  const rows = await Promise.all(
    files.map((f) => readJsonFromVault<CourseMetaRecord>(sb, `course-meta/${f.name}`))
  );
  for (const row of rows) {
    if (row && typeof row.course_id === 'number') {
      result.set(row.course_id, row);
    }
  }
  courseMetasCache = { value: result, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
  return result;
}

export async function uploadCourseCoverFile(
  sb: SupabaseClient,
  courseId: number,
  buffer: Buffer,
  mimeType: string,
  ext: string
): Promise<string> {
  await ensureCourseCoversBucket(sb);
  const objectPath = `courses/${courseId}/${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  const { error } = await sb.storage.from(COURSE_COVERS_BUCKET).upload(objectPath, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Course cover upload failed: ${error.message}`);
  }
  return objectPath;
}

export async function removeCourseCoverFile(sb: SupabaseClient, storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return;
  await ensureCourseCoversBucket(sb);
  await sb.storage.from(COURSE_COVERS_BUCKET).remove([storagePath]).catch(() => {});
}

export async function readCourseCoverFile(sb: SupabaseClient, storagePath: string): Promise<Buffer | null> {
  await ensureCourseCoversBucket(sb);
  const { data, error } = await sb.storage.from(COURSE_COVERS_BUCKET).download(storagePath);
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export async function saveLessonMeta(sb: SupabaseClient, record: LessonMetaRecord): Promise<void> {
  await writeJsonToVault(sb, `lesson-meta/${record.lesson_id}.json`, record);
  invalidateLessonMetaCaches(record.lesson_id);
}

export async function getLessonMeta(sb: SupabaseClient, lessonId: number): Promise<LessonMetaRecord | null> {
  const cachedSingle = singleLessonMetaCache.get(lessonId);
  if (cachedSingle && Date.now() < cachedSingle.expiresAt) {
    return cachedSingle.value;
  }
  if (lessonMetasCache && Date.now() < lessonMetasCache.expiresAt) {
    return lessonMetasCache.value.get(lessonId) ?? null;
  }
  const value = await readJsonFromVault<LessonMetaRecord>(sb, `lesson-meta/${lessonId}.json`);
  singleLessonMetaCache.set(lessonId, { value, expiresAt: Date.now() + VAULT_CACHE_TTL_MS });
  return value;
}

export async function deleteLessonMeta(sb: SupabaseClient, lessonId: number): Promise<void> {
  await ensureApplicationVaultBucket(sb);
  await sb.storage.from(APPLICATION_VAULT_BUCKET).remove([`lesson-meta/${lessonId}.json`]).catch(() => {});
  invalidateLessonMetaCaches(lessonId);
}

export async function listLessonMetas(sb: SupabaseClient): Promise<Map<number, LessonMetaRecord>> {
  if (lessonMetasCache && Date.now() < lessonMetasCache.expiresAt) {
    return lessonMetasCache.value;
  }
  const result = new Map<number, LessonMetaRecord>();
  const files = await listAllVaultFiles(sb, 'lesson-meta');
  if (!files.length) {
    lessonMetasCache = { value: result, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
    return result;
  }
  const rows = await Promise.all(
    files.map((f) => readJsonFromVault<LessonMetaRecord>(sb, `lesson-meta/${f.name}`))
  );
  for (const row of rows) {
    if (row && typeof row.lesson_id === 'number') {
      result.set(row.lesson_id, row);
    }
  }
  lessonMetasCache = { value: result, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
  return result;
}

export async function saveTeacherPhone(sb: SupabaseClient, teacherId: number, phone: string): Promise<void> {
  const cleanPhone = String(phone || '').trim();
  await writeJsonToVault(sb, `teacher-phones/${teacherId}.json`, {
    teacher_id: teacherId,
    phone: cleanPhone,
    updated_at: new Date().toISOString(),
  });
  teacherPhonesCache = null;
}

export async function listTeacherPhones(sb: SupabaseClient): Promise<Map<number, string>> {
  if (teacherPhonesCache && Date.now() < teacherPhonesCache.expiresAt) {
    return teacherPhonesCache.value;
  }
  const result = new Map<number, string>();
  const files = await listAllVaultFiles(sb, 'teacher-phones');
  if (!files.length) {
    teacherPhonesCache = { value: result, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
    return result;
  }
  const rows = await Promise.all(
    files.map((f) => readJsonFromVault<{ teacher_id?: number; phone?: string }>(sb, `teacher-phones/${f.name}`))
  );
  for (const row of rows) {
    if (row && typeof row.teacher_id === 'number') {
      result.set(row.teacher_id, String(row.phone || '').trim());
    }
  }
  teacherPhonesCache = { value: result, expiresAt: Date.now() + VAULT_CACHE_TTL_MS };
  return result;
}

export async function deleteTeacherPhone(sb: SupabaseClient, teacherId: number): Promise<void> {
  await ensureApplicationVaultBucket(sb);
  await sb.storage.from(APPLICATION_VAULT_BUCKET).remove([`teacher-phones/${teacherId}.json`]).catch(() => {});
  teacherPhonesCache = null;
}

/**
 * Safely cleans up an unactivated Supabase Auth user + profile ONLY if the profile is still inactive
 * and not linked to any student or teacher record (e.g., when a pending admission/teacher application is rejected).
 */
export async function deletePendingAuthProfileIfSafe(sb: SupabaseClient, profileId: string | null | undefined): Promise<void> {
  if (!profileId) return;
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select('id, is_active, role')
      .eq('id', profileId)
      .maybeSingle();

    if (!profile || profile.is_active || profile.role === 'admin') return;

    const [{ data: studentRow }, { data: teacherRow }] = await Promise.all([
      sb.from('students').select('id').eq('profile_id', profileId).maybeSingle(),
      sb.from('teachers').select('id').eq('profile_id', profileId).maybeSingle(),
    ]);
    if (studentRow || teacherRow) return;

    await sb.from('profiles').delete().eq('id', profileId);
    await sb.auth.admin.deleteUser(profileId);
  } catch (err) {
    console.warn('[applicationVault] cleanup warning:', err instanceof Error ? err.message : err);
  }
}
