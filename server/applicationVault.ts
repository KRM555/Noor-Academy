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

let vaultCheckedAt = 0;

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
}

export async function getAdmissionMeta(sb: SupabaseClient, admissionId: number): Promise<AdmissionMetaRecord | null> {
  return readJsonFromVault<AdmissionMetaRecord>(sb, `admissions/${admissionId}.json`);
}

export async function listAdmissionMetas(sb: SupabaseClient): Promise<Map<number, AdmissionMetaRecord>> {
  await ensureApplicationVaultBucket(sb);
  const result = new Map<number, AdmissionMetaRecord>();
  const { data: files } = await sb.storage.from(APPLICATION_VAULT_BUCKET).list('admissions', { limit: 500 });
  if (!files || !files.length) return result;
  const rows = await Promise.all(
    files
      .filter((f) => f.name.endsWith('.json'))
      .map((f) => readJsonFromVault<AdmissionMetaRecord>(sb, `admissions/${f.name}`))
  );
  for (const row of rows) {
    if (row && typeof row.admission_id === 'number') {
      result.set(row.admission_id, row);
    }
  }
  return result;
}

export function generateApplicationId(): number {
  return Date.now() * 100 + crypto.randomInt(10, 99);
}

export async function saveTeacherApplication(sb: SupabaseClient, record: TeacherApplicationRecord): Promise<void> {
  await writeJsonToVault(sb, `teacher-applications/${record.id}.json`, record);
}

export async function getTeacherApplication(sb: SupabaseClient, id: number): Promise<TeacherApplicationRecord | null> {
  return readJsonFromVault<TeacherApplicationRecord>(sb, `teacher-applications/${id}.json`);
}

export async function listTeacherApplications(sb: SupabaseClient): Promise<TeacherApplicationRecord[]> {
  await ensureApplicationVaultBucket(sb);
  const { data: files } = await sb.storage.from(APPLICATION_VAULT_BUCKET).list('teacher-applications', { limit: 500 });
  if (!files || !files.length) return [];
  const rows = await Promise.all(
    files
      .filter((f) => f.name.endsWith('.json'))
      .map((f) => readJsonFromVault<TeacherApplicationRecord>(sb, `teacher-applications/${f.name}`))
  );
  return rows
    .filter((r): r is TeacherApplicationRecord => Boolean(r && typeof r.id === 'number'))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
