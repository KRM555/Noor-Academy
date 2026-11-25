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
  submitted_at?: string | null;
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

let examAttemptsTableMissingWarned = false;

function isExamAttemptsMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  const msg = String(error.message || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /exam_attempts.*does not exist|could not find the table.*exam_attempts|schema cache/i.test(msg)
  );
}

function warnMissingExamAttemptsTableOnce(context: string): void {
  if (!examAttemptsTableMissingWarned) {
    examAttemptsTableMissingWarned = true;
    console.warn(
      `[examVault] public.exam_attempts table is not applied yet (${context}); falling back to vault JSON storage.`
    );
  }
}

function mapExamAttemptRow(row: {
  exam_id: number;
  student_id: number;
  started_at: string;
  expires_at: string;
  submitted_at?: string | null;
}): ExamAttemptRecord {
  return {
    exam_id: Number(row.exam_id),
    student_id: Number(row.student_id),
    started_at: String(row.started_at),
    expires_at: String(row.expires_at),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
  };
}

export async function getExamAttempt(
  sb: SupabaseClient,
  examId: number,
  studentId: number
): Promise<ExamAttemptRecord | null> {
  const { data, error } = await sb
    .from('exam_attempts')
    .select('exam_id, student_id, started_at, expires_at, submitted_at')
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (error) {
    if (isExamAttemptsMissingTableError(error)) {
      warnMissingExamAttemptsTableOnce('getExamAttempt');
      return readJsonFromVault<ExamAttemptRecord>(sb, `meta/attempt/${examId}/${studentId}.json`);
    }
    throw new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Failed reading exam attempt state'
        : `Failed reading exam attempt state: ${error.message}`
    );
  }
  return data ? mapExamAttemptRow(data) : null;
}

export async function saveExamAttempt(
  sb: SupabaseClient,
  record: ExamAttemptRecord
): Promise<ExamAttemptRecord> {
  const { error: upsertErr } = await sb
    .from('exam_attempts')
    .upsert(
      {
        exam_id: record.exam_id,
        student_id: record.student_id,
        started_at: record.started_at,
        expires_at: record.expires_at,
      },
      { onConflict: 'exam_id,student_id', ignoreDuplicates: true }
    );
  if (upsertErr) {
    if (isExamAttemptsMissingTableError(upsertErr)) {
      warnMissingExamAttemptsTableOnce('saveExamAttempt');
      const existing = await readJsonFromVault<ExamAttemptRecord>(
        sb,
        `meta/attempt/${record.exam_id}/${record.student_id}.json`
      );
      if (existing) return existing;
      await writeJsonToVault(sb, `meta/attempt/${record.exam_id}/${record.student_id}.json`, record);
      return record;
    }
    throw new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Failed starting exam attempt'
        : `Failed starting exam attempt: ${upsertErr.message}`
    );
  }

  const { data: selected, error: selectErr } = await sb
    .from('exam_attempts')
    .select('exam_id, student_id, started_at, expires_at, submitted_at')
    .eq('exam_id', record.exam_id)
    .eq('student_id', record.student_id)
    .maybeSingle();
  if (selectErr) {
    if (isExamAttemptsMissingTableError(selectErr)) {
      warnMissingExamAttemptsTableOnce('saveExamAttempt:select');
      await writeJsonToVault(sb, `meta/attempt/${record.exam_id}/${record.student_id}.json`, record);
      return record;
    }
    throw new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Failed reading exam attempt'
        : `Failed reading exam attempt: ${selectErr.message}`
    );
  }
  return selected ? mapExamAttemptRow(selected) : record;
}

export async function claimExamAttemptForSubmit(
  sb: SupabaseClient,
  examId: number,
  studentId: number,
  fallbackExpiresAtIso: string
): Promise<{ mode: 'claimed' | 'already_submitted' | 'fallback'; attempt: ExamAttemptRecord | null }> {
  const { data: claimedRows, error: claimErr } = await sb
    .from('exam_attempts')
    .update({ submitted_at: new Date().toISOString() })
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .is('submitted_at', null)
    .select('exam_id, student_id, started_at, expires_at, submitted_at');

  if (claimErr) {
    if (isExamAttemptsMissingTableError(claimErr)) {
      warnMissingExamAttemptsTableOnce('claimExamAttemptForSubmit');
      const vaultAttempt = await readJsonFromVault<ExamAttemptRecord>(
        sb,
        `meta/attempt/${examId}/${studentId}.json`
      );
      return { mode: 'fallback', attempt: vaultAttempt };
    }
    throw new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Failed locking exam submission'
        : `Failed locking exam submission: ${claimErr.message}`
    );
  }

  if (claimedRows && claimedRows.length > 0) {
    return { mode: 'claimed', attempt: mapExamAttemptRow(claimedRows[0]) };
  }

  const { data: existingRow, error: checkErr } = await sb
    .from('exam_attempts')
    .select('exam_id, student_id, started_at, expires_at, submitted_at')
    .eq('exam_id', examId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (checkErr) {
    if (isExamAttemptsMissingTableError(checkErr)) {
      warnMissingExamAttemptsTableOnce('claimExamAttemptForSubmit:check');
      const vaultAttempt = await readJsonFromVault<ExamAttemptRecord>(
        sb,
        `meta/attempt/${examId}/${studentId}.json`
      );
      return { mode: 'fallback', attempt: vaultAttempt };
    }
    throw new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Failed checking exam attempt'
        : `Failed checking exam attempt: ${checkErr.message}`
    );
  }

  if (!existingRow) {
    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await sb
      .from('exam_attempts')
      .upsert(
        {
          exam_id: examId,
          student_id: studentId,
          started_at: nowIso,
          expires_at: fallbackExpiresAtIso,
        },
        { onConflict: 'exam_id,student_id', ignoreDuplicates: true }
      );
    if (upsertErr) {
      throw new AppError(
        500,
        process.env.NODE_ENV === 'production'
          ? 'Failed initializing exam attempt'
          : `Failed initializing exam attempt: ${upsertErr.message}`
      );
    }

    const { data: retryRows, error: retryErr } = await sb
      .from('exam_attempts')
      .update({ submitted_at: new Date().toISOString() })
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .is('submitted_at', null)
      .select('exam_id, student_id, started_at, expires_at, submitted_at');
    if (retryErr) {
      throw new AppError(
        500,
        process.env.NODE_ENV === 'production'
          ? 'Failed claiming exam attempt'
          : `Failed claiming exam attempt: ${retryErr.message}`
      );
    }
    if (retryRows && retryRows.length > 0) {
      return { mode: 'claimed', attempt: mapExamAttemptRow(retryRows[0]) };
    }
    return { mode: 'already_submitted', attempt: null };
  }

  return { mode: 'already_submitted', attempt: mapExamAttemptRow(existingRow) };
}

export async function releaseExamAttemptClaim(
  sb: SupabaseClient,
  examId: number,
  studentId: number
): Promise<void> {
  const { error } = await sb
    .from('exam_attempts')
    .update({ submitted_at: null })
    .eq('exam_id', examId)
    .eq('student_id', studentId);
  if (error) {
    if (isExamAttemptsMissingTableError(error)) {
      warnMissingExamAttemptsTableOnce('releaseExamAttemptClaim');
    } else {
      console.warn(`[examVault] Failed releasing exam_attempts claim (${examId}, ${studentId}):`, error.message);
    }
  }
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
  const [{ error: storageErr }, { error: dbErr }] = await Promise.all([
    sb.storage.from(EXAM_VAULT_BUCKET).remove(pathsToRemove),
    sb.from('exam_attempts').delete().eq('exam_id', examId).eq('student_id', studentId),
  ]);
  if (storageErr) {
    console.warn(`[examVault] Failed removing exam ${examId} submission for student ${studentId}:`, storageErr.message);
  }
  if (dbErr) {
    if (isExamAttemptsMissingTableError(dbErr)) {
      warnMissingExamAttemptsTableOnce('deleteExamSubmissionRecord');
    } else {
      console.warn(`[examVault] Failed deleting exam_attempts row (${examId}, ${studentId}):`, dbErr.message);
    }
  }
  subMetaCache.delete(`${examId}:${studentId}`);
}

export async function countExamSubmissionFiles(
  sb: SupabaseClient,
  examId: number
): Promise<number> {
  await ensureExamVaultBucket(sb).catch(() => {});
  const PAGE_SIZE = 100;
  let count = 0;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: files, error } = await sb.storage
      .from(EXAM_VAULT_BUCKET)
      .list(`meta/sub/${examId}`, { limit: PAGE_SIZE, offset });
    if (error || !files || !files.length) break;
    for (const f of files) {
      const name = String(f.name || '');
      if (name.endsWith('.json')) {
        const sid = Number(name.slice(0, -5));
        if (Number.isFinite(sid) && sid > 0) count += 1;
      }
    }
    if (files.length < PAGE_SIZE) break;
  }
  return count;
}

export async function listExamSubmissionsForExam(
  sb: SupabaseClient,
  examId: number
): Promise<ExamSubmissionRecord[]> {
  await ensureExamVaultBucket(sb).catch(() => {});
  const PAGE_SIZE = 100;
  const studentIds: number[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: files, error } = await sb.storage
      .from(EXAM_VAULT_BUCKET)
      .list(`meta/sub/${examId}`, { limit: PAGE_SIZE, offset });
    if (error || !files || !files.length) break;
    for (const f of files) {
      const name = String(f.name || '');
      if (name.endsWith('.json')) {
        const sid = Number(name.slice(0, -5));
        if (Number.isFinite(sid) && sid > 0) studentIds.push(sid);
      }
    }
    if (files.length < PAGE_SIZE) break;
  }
  if (!studentIds.length) return [];
  const records = await Promise.all(studentIds.map((sid) => getExamSubmission(sb, examId, sid)));
  return records.filter((r): r is ExamSubmissionRecord => Boolean(r));
}

export async function deleteExamDataForStudent(
  sb: SupabaseClient,
  studentId: number
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  try {
    await ensureExamVaultBucket(sb);

    const EXAM_PAGE_SIZE = 1000;
    const examIds: number[] = [];
    for (let offset = 0; ; offset += EXAM_PAGE_SIZE) {
      const { data: examsPage, error: examsErr } = await sb
        .from('exams')
        .select('id')
        .order('id', { ascending: true })
        .range(offset, offset + EXAM_PAGE_SIZE - 1);
      if (examsErr) {
        console.warn(`[examVault] Failed fetching exam list for student ${studentId} cleanup:`, examsErr.message);
        failed += 1;
        break;
      }
      const rows = (examsPage || []) as Array<{ id: number }>;
      for (const row of rows) {
        const id = Number(row.id);
        if (Number.isFinite(id) && id > 0) examIds.push(id);
      }
      if (rows.length < EXAM_PAGE_SIZE) break;
    }

    if (!examIds.length) return { removed, failed };

    const STORAGE_LIST_LIMIT = 100;
    const listAllPathsInFolder = async (folder: string): Promise<{ paths: string[]; hadError: boolean }> => {
      const paths: string[] = [];
      for (let offset = 0; ; offset += STORAGE_LIST_LIMIT) {
        const { data, error } = await sb.storage
          .from(EXAM_VAULT_BUCKET)
          .list(folder, { limit: STORAGE_LIST_LIMIT, offset });
        if (error) {
          console.warn(`[examVault] Failed listing ${folder} (offset=${offset}) for student ${studentId}:`, error.message);
          return { paths, hadError: true };
        }
        const items = data || [];
        for (const f of items) {
          if (f.name) paths.push(`${folder}/${f.name}`);
        }
        if (items.length < STORAGE_LIST_LIMIT) break;
      }
      return { paths, hadError: false };
    };

    const folderResults = await Promise.allSettled(
      examIds.map(async (eid) => {
        subMetaCache.delete(`${eid}:${studentId}`);
        const collected = [`meta/sub/${eid}/${studentId}.json`, `meta/attempt/${eid}/${studentId}.json`];
        const [subRes, gradedRes] = await Promise.all([
          listAllPathsInFolder(`submissions/${eid}/${studentId}`),
          listAllPathsInFolder(`graded/${eid}/${studentId}`),
        ]);
        collected.push(...subRes.paths, ...gradedRes.paths);
        return {
          paths: collected,
          listFailures: (subRes.hadError ? 1 : 0) + (gradedRes.hadError ? 1 : 0),
        };
      })
    );

    const pathsToRemove: string[] = [];
    for (const r of folderResults) {
      if (r.status === 'fulfilled') {
        pathsToRemove.push(...r.value.paths);
        failed += r.value.listFailures;
      } else {
        failed += 1;
        console.warn(`[examVault] Partial listing failure during student ${studentId} cleanup:`, r.reason);
      }
    }

    const CHUNK_SIZE = 100;
    const removeChunkWithRetry = async (chunk: string[]): Promise<{ removed: number; failed: number }> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await sb.storage.from(EXAM_VAULT_BUCKET).remove(chunk);
          if (!error) {
            return { removed: Array.isArray(data) ? data.length : chunk.length, failed: 0 };
          }
          console.warn(
            `[examVault] Remove attempt ${attempt + 1} failed for student ${studentId}:`,
            error.message
          );
        } catch (err) {
          console.warn(
            `[examVault] Remove attempt ${attempt + 1} threw for student ${studentId}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
      return { removed: 0, failed: chunk.length };
    };

    const removeTasks: Promise<{ removed: number; failed: number }>[] = [];
    for (let i = 0; i < pathsToRemove.length; i += CHUNK_SIZE) {
      const chunk = pathsToRemove.slice(i, i + CHUNK_SIZE);
      removeTasks.push(removeChunkWithRetry(chunk));
    }
    const removeResults = await Promise.allSettled(removeTasks);
    for (const r of removeResults) {
      if (r.status === 'fulfilled') {
        removed += r.value.removed;
        failed += r.value.failed;
      } else {
        failed += 1;
        console.warn(`[examVault] Batch storage cleanup error for student ${studentId}:`, r.reason);
      }
    }
    return { removed, failed };
  } catch (err) {
    console.warn(`[examVault] deleteExamDataForStudent error for student ${studentId}:`, err instanceof Error ? err.message : err);
    return { removed, failed: failed > 0 ? failed : 1 };
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
