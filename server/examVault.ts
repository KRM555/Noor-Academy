import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './errorHandler.ts';

export const EXAM_VAULT_BUCKET = 'exam-vault';
export const MAX_EXAM_FILE_BYTES = 8 * 1024 * 1024; // 8 MB — protects Supabase Free Tier quota

export type ExamMode = 'file' | 'quiz' | 'hybrid';
export type QuizQuestionType = 'mcq' | 'tf';

export interface StoredFileMeta {
  path: string;
  name: string;
  mime: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface QuizQuestionConfig {
  id: string;
  q_type: QuizQuestionType;
  prompt_ar: string;
  prompt_en?: string;
  options_ar: string[];
  options_en?: string[];
  correct_index: number;
  points: number;
}

export interface ExamVaultConfig {
  exam_id: number;
  exam_mode: ExamMode;
  instructions_ar: string;
  instructions_en: string;
  available_from: string | null;
  due_at: string | null;
  time_limit_minutes?: number | null;
  allow_late_submission: boolean;
  show_answers_after_submit: boolean;
  question_file: StoredFileMeta | null;
  questions: QuizQuestionConfig[];
  updated_at: string;
}

export interface QuizAnswerEntry {
  question_id: string;
  selected_index: number;
}

export interface ExamSubmissionRecord {
  exam_id: number;
  student_id: number;
  status: 'submitted_pending' | 'graded';
  submitted_at: string;
  is_late: boolean;
  timed_out?: boolean;
  solution_file: StoredFileMeta | null;
  student_notes: string;
  quiz_answers: QuizAnswerEntry[];
  auto_score: number | null;
  graded_file: StoredFileMeta | null;
  graded_at: string | null;
}

export interface ExamAttemptRecord {
  exam_id: number;
  student_id: number;
  started_at: string;
  expires_at: string;
}

const DISALLOWED_EXTENSIONS = new Set([
  'svg', 'html', 'htm', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx',
  'php', 'py', 'sh', 'bash', 'exe', 'msi', 'bat', 'cmd', 'dll',
  'zip', 'rar', '7z', 'tar', 'gz',
  'mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'm4v',
]);

const ALLOWED_EXAM_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp']);

// Short TTL server-side memory cache (invalidated immediately on any mutation)
const examMetaCache = new Map<number, { expiresAt: number; value: ExamVaultConfig | null }>();
const subMetaCache = new Map<string, { expiresAt: number; value: ExamSubmissionRecord | null }>();
const CACHE_TTL_MS = 10_000;

export function invalidateExamCache(examId: number) {
  examMetaCache.delete(examId);
}

export function invalidateSubmissionCache(examId: number, studentId: number) {
  subMetaCache.delete(`${examId}:${studentId}`);
}

let bucketCheckedAt = 0;

export async function ensureExamVaultBucket(sb: SupabaseClient): Promise<void> {
  if (Date.now() - bucketCheckedAt < 60_000) return;
  const { data: bucket } = await sb.storage.getBucket(EXAM_VAULT_BUCKET);
  if (!bucket) {
    const { error } = await sb.storage.createBucket(EXAM_VAULT_BUCKET, {
      public: false,
      fileSizeLimit: MAX_EXAM_FILE_BYTES,
    });
    if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
      console.error('[examVault:ensureExamVaultBucket]', error);
      throw new AppError(
        500,
        process.env.NODE_ENV === 'production'
          ? 'Exam vault bucket initialization failed'
          : `Exam vault bucket initialization failed: ${error.message}`
      );
    }
  }
  bucketCheckedAt = Date.now();
}

export function sanitizeSafeFilename(rawName: string, fallbackExt: string): string {
  const baseOnly = rawName.split(/[/\\]/).pop() || `file.${fallbackExt}`;
  const cleaned = baseOnly.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.+/g, '.').slice(0, 80);
  if (!cleaned || cleaned.startsWith('.')) {
    return `document_${Date.now()}.${fallbackExt}`;
  }
  return cleaned;
}

/**
 * Verifies uploaded buffer using magic bytes (signatures) in addition to extension
 * to prevent spoofed Content-Type, SVG XSS payloads, executables, or oversized uploads.
 */
export function validateExamFileUpload(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
}): { buffer: Buffer; ext: string; verifiedMime: string; safeName: string } {
  const rawName = String(params.fileName || '').trim();
  const ext = rawName.includes('.') ? rawName.split('.').pop()!.toLowerCase() : '';

  if (DISALLOWED_EXTENSIONS.has(ext)) {
    if (['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'm4v'].includes(ext)) {
      throw new AppError(400, 'Video uploads are disabled to protect storage quota.');
    }
    throw new AppError(400, 'File format is blocked for security reasons.');
  }

  if (!ALLOWED_EXAM_EXTENSIONS.has(ext)) {
    throw new AppError(400, 'Unsupported file type. Allowed formats: PDF, PNG, JPG, JPEG, WEBP.');
  }

  const cleanBase64 = params.base64Data.includes(',')
    ? params.base64Data.split(',').pop() || ''
    : params.base64Data;

  const buffer = Buffer.from(cleanBase64, 'base64');
  if (!buffer.length) {
    throw new AppError(400, 'Uploaded file is empty.');
  }
  if (buffer.length > MAX_EXAM_FILE_BYTES) {
    throw new AppError(400, 'File exceeds maximum allowed size of 8 MB.');
  }

  // Magic-byte verification
  const isPdf =
    buffer.length >= 5 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d; // -

  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  let verifiedMime = '';
  if (ext === 'pdf') {
    if (!isPdf) throw new AppError(400, 'Invalid PDF file signature.');
    verifiedMime = 'application/pdf';
  } else if (ext === 'png') {
    if (!isPng) throw new AppError(400, 'Invalid PNG image signature.');
    verifiedMime = 'image/png';
  } else if (ext === 'jpg' || ext === 'jpeg') {
    if (!isJpeg) throw new AppError(400, 'Invalid JPEG image signature.');
    verifiedMime = 'image/jpeg';
  } else if (ext === 'webp') {
    if (!isWebp) throw new AppError(400, 'Invalid WEBP image signature.');
    verifiedMime = 'image/webp';
  }

  return {
    buffer,
    ext,
    verifiedMime,
    safeName: sanitizeSafeFilename(rawName, ext),
  };
}

async function readJsonFromVault<T>(sb: SupabaseClient, objectPath: string): Promise<T | null> {
  const { data, error } = await sb.storage.from(EXAM_VAULT_BUCKET).download(objectPath);
  if (error || !data) return null;
  try {
    const text = await data.text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJsonToVault(sb: SupabaseClient, objectPath: string, payload: unknown): Promise<void> {
  await ensureExamVaultBucket(sb);
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  const { error } = await sb.storage.from(EXAM_VAULT_BUCKET).upload(objectPath, body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) {
    console.error('[examVault:writeJsonToVault]', error);
    throw new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Failed to persist exam metadata'
        : `Failed to persist exam metadata: ${error.message}`
    );
  }
}

export function defaultExamConfig(examId: number): ExamVaultConfig {
  return {
    exam_id: examId,
    exam_mode: 'file',
    instructions_ar: '',
    instructions_en: '',
    available_from: null,
    due_at: null,
    time_limit_minutes: null,
    allow_late_submission: true,
    show_answers_after_submit: true,
    question_file: null,
    questions: [],
    updated_at: new Date().toISOString(),
  };
}

export async function getExamVaultConfig(sb: SupabaseClient, examId: number): Promise<ExamVaultConfig> {
  const cached = examMetaCache.get(examId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value || defaultExamConfig(examId);
  }
  await ensureExamVaultBucket(sb).catch(() => {});
  const data = await readJsonFromVault<ExamVaultConfig>(sb, `meta/exam/${examId}.json`);
  examMetaCache.set(examId, { expiresAt: Date.now() + CACHE_TTL_MS, value: data });
  return data || defaultExamConfig(examId);
}

export async function saveExamVaultConfig(sb: SupabaseClient, config: ExamVaultConfig): Promise<void> {
  const updated: ExamVaultConfig = {
    ...config,
    updated_at: new Date().toISOString(),
  };
  await writeJsonToVault(sb, `meta/exam/${config.exam_id}.json`, updated);
  examMetaCache.set(config.exam_id, { expiresAt: Date.now() + CACHE_TTL_MS, value: updated });
}

export async function getExamSubmission(
  sb: SupabaseClient,
  examId: number,
  studentId: number
): Promise<ExamSubmissionRecord | null> {
  const key = `${examId}:${studentId}`;
  const cached = subMetaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const data = await readJsonFromVault<ExamSubmissionRecord>(sb, `meta/sub/${examId}/${studentId}.json`);
  subMetaCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: data });
  return data;
}

export async function saveExamSubmission(sb: SupabaseClient, record: ExamSubmissionRecord): Promise<void> {
  await writeJsonToVault(sb, `meta/sub/${record.exam_id}/${record.student_id}.json`, record);
  subMetaCache.set(`${record.exam_id}:${record.student_id}`, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: record,
  });
}

export async function getExamAttempt(
  sb: SupabaseClient,
  examId: number,
  studentId: number
): Promise<ExamAttemptRecord | null> {
  return readJsonFromVault<ExamAttemptRecord>(sb, `meta/attempt/${examId}/${studentId}.json`);
}

export async function saveExamAttempt(sb: SupabaseClient, record: ExamAttemptRecord): Promise<void> {
  await writeJsonToVault(sb, `meta/attempt/${record.exam_id}/${record.student_id}.json`, record);
}

export async function deleteExamSubmissionRecord(
  sb: SupabaseClient,
  examId: number,
  studentId: number
): Promise<void> {
  const existing = await getExamSubmission(sb, examId, studentId);
  const pathsToRemove = [
    `meta/sub/${examId}/${studentId}.json`,
    `meta/attempt/${examId}/${studentId}.json`,
  ];
  if (existing?.solution_file?.path) pathsToRemove.push(existing.solution_file.path);
  if (existing?.graded_file?.path) pathsToRemove.push(existing.graded_file.path);
  await sb.storage.from(EXAM_VAULT_BUCKET).remove(pathsToRemove).catch(() => {});
  subMetaCache.delete(`${examId}:${studentId}`);
}

export async function listExamSubmissionsForExam(
  sb: SupabaseClient,
  examId: number
): Promise<ExamSubmissionRecord[]> {
  await ensureExamVaultBucket(sb).catch(() => {});
  const { data: files } = await sb.storage.from(EXAM_VAULT_BUCKET).list(`meta/sub/${examId}`, { limit: 200 });
  if (!files || !files.length) return [];
  const studentIds = files
    .map((f) => Number(String(f.name || '').replace('.json', '')))
    .filter((id) => Number.isFinite(id) && id > 0);
  const records = await Promise.all(studentIds.map((sid) => getExamSubmission(sb, examId, sid)));
  return records.filter((r): r is ExamSubmissionRecord => Boolean(r));
}

export async function deleteExamDataForStudent(sb: SupabaseClient, studentId: number): Promise<void> {
  try {
    await ensureExamVaultBucket(sb);
    const { data: exams } = await sb.from('exams').select('id');
    const examIds = (exams || []).map((e: { id: number }) => Number(e.id)).filter((id) => Number.isFinite(id));
    await Promise.all(examIds.map((eid) => deleteExamSubmissionRecord(sb, eid, studentId)));
  } catch {
    // non-fatal cleanup
  }
}

export async function deleteExamVaultData(sb: SupabaseClient, examId: number): Promise<void> {
  try {
    await ensureExamVaultBucket(sb);
    const pathsToRemove = [`meta/exam/${examId}.json`];
    const folders = [
      `questions/${examId}`,
      `meta/sub/${examId}`,
      `meta/attempt/${examId}`,
      `submissions/${examId}`,
      `graded/${examId}`,
    ];
    for (const folder of folders) {
      const { data: items } = await sb.storage.from(EXAM_VAULT_BUCKET).list(folder, { limit: 1000 });
      for (const item of items || []) {
        if (item.name && item.id) {
          pathsToRemove.push(`${folder}/${item.name}`);
        } else if (item.name && !item.id) {
          const { data: nested } = await sb.storage.from(EXAM_VAULT_BUCKET).list(`${folder}/${item.name}`, { limit: 1000 });
          for (const sub of nested || []) {
            if (sub.name) pathsToRemove.push(`${folder}/${item.name}/${sub.name}`);
          }
        }
      }
    }
    if (pathsToRemove.length > 0) {
      await sb.storage.from(EXAM_VAULT_BUCKET).remove(pathsToRemove).catch(() => {});
    }
    invalidateExamCache(examId);
  } catch {
    // non-fatal cleanup
  }
}

export async function uploadExamBinaryFile(params: {
  sb: SupabaseClient;
  folder: string;
  fileName: string;
  mimeType: string;
  base64Data: string;
}): Promise<StoredFileMeta> {
  const validated = validateExamFileUpload({
    fileName: params.fileName,
    mimeType: params.mimeType,
    base64Data: params.base64Data,
  });
  await ensureExamVaultBucket(params.sb);
  const objectPath = `${params.folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${validated.safeName}`;
  const { error } = await params.sb.storage.from(EXAM_VAULT_BUCKET).upload(objectPath, validated.buffer, {
    contentType: validated.verifiedMime,
    upsert: false,
  });
  if (error) {
    console.error('[examVault:uploadExamBinaryFile]', error);
    throw new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Exam file upload failed'
        : `Exam file upload failed: ${error.message}`
    );
  }
  return {
    path: objectPath,
    name: validated.safeName,
    mime: validated.verifiedMime,
    size_bytes: validated.buffer.length,
    uploaded_at: new Date().toISOString(),
  };
}

export async function createExamSignedUrl(
  sb: SupabaseClient,
  objectPath: string,
  expiresInSeconds = 180
): Promise<string> {
  const { data, error } = await sb.storage.from(EXAM_VAULT_BUCKET).createSignedUrl(objectPath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    console.error('[examVault:createExamSignedUrl]', error);
    throw new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Unable to generate secure exam download URL'
        : error?.message || 'Unable to generate secure exam download URL'
    );
  }
  return data.signedUrl;
}

export async function removeExamBinaryFile(sb: SupabaseClient, objectPath: string | null | undefined): Promise<void> {
  if (!objectPath) return;
  await sb.storage.from(EXAM_VAULT_BUCKET).remove([objectPath]).catch(() => {});
}

export function isExamAvailableYet(cfg: ExamVaultConfig, now = new Date()): boolean {
  if (!cfg.available_from) return true;
  const start = new Date(cfg.available_from);
  if (Number.isNaN(start.getTime())) return true;
  return now.getTime() >= start.getTime();
}

export function isExamPastDeadline(cfg: ExamVaultConfig, now = new Date()): boolean {
  if (!cfg.due_at) return false;
  const due = new Date(cfg.due_at);
  if (Number.isNaN(due.getTime())) return false;
  // If date-only YYYY-MM-DD, treat deadline as end of that day UTC/local safely
  if (/^\d{4}-\d{2}-\d{2}$/.test(cfg.due_at)) {
    due.setHours(23, 59, 59, 999);
  }
  return now.getTime() > due.getTime();
}

/**
 * Strips sensitive answer keys (`correct_index`) and internal storage paths
 * before returning exam configs to students or guardians.
 */
export function sanitizeExamConfigForViewer(
  cfg: ExamVaultConfig,
  opts: { isPrivileged: boolean; canRevealAnswers?: boolean }
) {
  const nowAvailable = isExamAvailableYet(cfg);
  const questions =
    !opts.isPrivileged && !nowAvailable
      ? []
      : cfg.questions.map((q) => {
          const base = {
            id: q.id,
            q_type: q.q_type,
            prompt_ar: q.prompt_ar,
            prompt_en: q.prompt_en || q.prompt_ar,
            options_ar: q.options_ar,
            options_en: q.options_en || q.options_ar,
            points: q.points,
          };
          if (opts.isPrivileged || opts.canRevealAnswers) {
            return { ...base, correct_index: q.correct_index };
          }
          return base;
        });

  return {
    exam_mode: cfg.exam_mode,
    instructions_ar: cfg.instructions_ar,
    instructions_en: cfg.instructions_en,
    available_from: cfg.available_from,
    due_at: cfg.due_at,
    time_limit_minutes: cfg.time_limit_minutes ?? null,
    allow_late_submission: cfg.allow_late_submission,
    show_answers_after_submit: cfg.show_answers_after_submit,
    is_open: nowAvailable,
    is_past_deadline: isExamPastDeadline(cfg),
    has_question_file: Boolean(cfg.question_file && (opts.isPrivileged || nowAvailable)),
    question_file_name: (opts.isPrivileged || nowAvailable) ? (cfg.question_file?.name ?? null) : null,
    question_file_mime: (opts.isPrivileged || nowAvailable) ? (cfg.question_file?.mime ?? null) : null,
    question_count: cfg.questions.length,
    questions,
  };
}

export function sanitizeSubmissionForViewer(sub: ExamSubmissionRecord | null) {
  if (!sub) return null;
  return {
    exam_id: sub.exam_id,
    student_id: sub.student_id,
    status: sub.status,
    submitted_at: sub.submitted_at,
    is_late: sub.is_late,
    timed_out: Boolean(sub.timed_out),
    has_solution_file: Boolean(sub.solution_file),
    solution_file_name: sub.solution_file?.name ?? null,
    solution_file_mime: sub.solution_file?.mime ?? null,
    student_notes: sub.student_notes,
    quiz_answers: sub.quiz_answers,
    auto_score: sub.auto_score,
    has_graded_file: Boolean(sub.graded_file),
    graded_file_name: sub.graded_file?.name ?? null,
    graded_at: sub.graded_at,
  };
}
