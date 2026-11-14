import dotenv from 'dotenv';
dotenv.config();

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const dbPath = path.resolve(process.cwd(), 'noor_bayan.db');
if (!fs.existsSync(dbPath)) {
  console.log('No local noor_bayan.db found — nothing to migrate.');
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseJsonSafe(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function main() {
  console.log('Starting full SQLite -> Supabase migration...');

  // 1. Sync Auth Users & Profiles
  const sqliteProfiles = db.prepare('SELECT * FROM profiles ORDER BY id ASC').all() as Array<{
    id: number;
    email: string;
    full_name: string;
    role: string;
    is_active: number;
    preferred_lang: string;
    created_at: string;
    deleted_at: string | null;
  }>;

  const { data: existingAuthData, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new Error('Failed to list Supabase auth users: ' + listErr.message);

  const authByEmail = new Map<string, string>();
  for (const u of existingAuthData?.users || []) {
    if (u.email) authByEmail.set(u.email.toLowerCase(), u.id);
  }

  const profileIdMap = new Map<number, string>();
  const profileRows: Array<Record<string, unknown>> = [];
  let createdAuthUsers = 0;

  for (const p of sqliteProfiles) {
    const email = p.email.trim().toLowerCase();
    let uuid = authByEmail.get(email);
    if (!uuid) {
      const randomPassword = `NB-${crypto.randomBytes(16).toString('base64url')}`;
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: p.full_name, role: p.role },
      });
      if (createErr || !created.user) {
        throw new Error(`Failed creating auth user ${email}: ${createErr?.message}`);
      }
      uuid = created.user.id;
      authByEmail.set(email, uuid);
      createdAuthUsers++;
    }
    profileIdMap.set(p.id, uuid);
    profileRows.push({
      id: uuid,
      email,
      full_name: p.full_name,
      role: p.role,
      is_active: Boolean(p.is_active),
      preferred_lang: p.preferred_lang || 'ar',
      deleted_at: p.deleted_at || null,
    });
  }

  if (profileRows.length) {
    const { error } = await sb.from('profiles').upsert(profileRows, { onConflict: 'id' });
    if (error) throw new Error('profiles upsert failed: ' + error.message);
  }
  console.log(`Migrated profiles: ${profileRows.length} (newly provisioned Auth accounts with random passwords: ${createdAuthUsers})`);
  if (createdAuthUsers > 0) {
    console.log('Notice: Newly created Auth users were assigned unique random passwords. Trigger password reset emails before user sign-in.');
  }

  const mapPid = (oldId: unknown): string | null => {
    if (oldId === null || oldId === undefined) return null;
    return profileIdMap.get(Number(oldId)) || null;
  };

  // 2. Levels
  const levels = db.prepare('SELECT * FROM levels ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  if (levels.length) {
    const { error } = await sb.from('levels').upsert(levels, { onConflict: 'id' });
    if (error) throw new Error('levels: ' + error.message);
  }

  // 3. Guardians
  const guardians = (db.prepare('SELECT * FROM guardians ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((g) => ({
    ...g,
    profile_id: mapPid(g.profile_id),
    deleted_at: g.deleted_at || null,
  }));
  if (guardians.length) {
    const { error } = await sb.from('guardians').upsert(guardians, { onConflict: 'id' });
    if (error) throw new Error('guardians: ' + error.message);
  }

  // 4. Teachers
  const teachers = (db.prepare('SELECT * FROM teachers ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((t) => ({
    ...t,
    profile_id: mapPid(t.profile_id),
    is_public: Boolean(t.is_public),
    deleted_at: t.deleted_at || null,
  }));
  if (teachers.length) {
    const { error } = await sb.from('teachers').upsert(teachers, { onConflict: 'id' });
    if (error) throw new Error('teachers: ' + error.message);
  }

  // 5. Students
  const students = (db.prepare('SELECT * FROM students ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((s) => ({
    ...s,
    profile_id: mapPid(s.profile_id),
    deleted_at: s.deleted_at || null,
  }));
  if (students.length) {
    const { error } = await sb.from('students').upsert(students, { onConflict: 'id' });
    if (error) throw new Error('students: ' + error.message);
  }

  // 6. Courses
  const courses = (db.prepare('SELECT * FROM courses ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    is_featured: Boolean(c.is_featured),
    deleted_at: c.deleted_at || null,
  }));
  if (courses.length) {
    const { error } = await sb.from('courses').upsert(courses, { onConflict: 'id' });
    if (error) throw new Error('courses: ' + error.message);
  }

  // 7. Lessons & Lesson Links
  const lessons = (db.prepare('SELECT * FROM lessons ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((l) => ({
    ...l,
    deleted_at: l.deleted_at || null,
  }));
  if (lessons.length) {
    const { error } = await sb.from('lessons').upsert(lessons, { onConflict: 'id' });
    if (error) throw new Error('lessons: ' + error.message);
  }

  const lessonLinks = db.prepare('SELECT * FROM lesson_links ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  if (lessonLinks.length) {
    const { error } = await sb.from('lesson_links').upsert(lessonLinks, { onConflict: 'id' });
    if (error) throw new Error('lesson_links: ' + error.message);
  }

  // 8. Enrollments & Attendance
  const enrollments = (db.prepare('SELECT * FROM enrollments ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((e) => ({
    ...e,
    deleted_at: e.deleted_at || null,
  }));
  if (enrollments.length) {
    const { error } = await sb.from('enrollments').upsert(enrollments, { onConflict: 'id' });
    if (error) throw new Error('enrollments: ' + error.message);
  }

  const attendance = (db.prepare('SELECT * FROM attendance ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((a) => ({
    ...a,
    recorded_by: mapPid(a.recorded_by),
  }));
  if (attendance.length) {
    const { error } = await sb.from('attendance').upsert(attendance, { onConflict: 'id' });
    if (error) throw new Error('attendance: ' + error.message);
  }

  // 9. Exams, Results, Recitations, Evaluations, Placement Tests
  const exams = (db.prepare('SELECT * FROM exams ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((ex) => ({
    ...ex,
    deleted_at: ex.deleted_at || null,
  }));
  if (exams.length) {
    const { error } = await sb.from('exams').upsert(exams, { onConflict: 'id' });
    if (error) throw new Error('exams: ' + error.message);
  }

  const examResults = (db.prepare('SELECT * FROM exam_results ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((er) => ({
    ...er,
    graded_by: mapPid(er.graded_by),
  }));
  if (examResults.length) {
    const { error } = await sb.from('exam_results').upsert(examResults, { onConflict: 'id' });
    if (error) throw new Error('exam_results: ' + error.message);
  }

  const recitations = (db.prepare('SELECT * FROM recitations ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    recorded_by: mapPid(r.recorded_by),
  }));
  if (recitations.length) {
    const { error } = await sb.from('recitations').upsert(recitations, { onConflict: 'id' });
    if (error) throw new Error('recitations: ' + error.message);
  }

  const evaluations = (db.prepare('SELECT * FROM evaluations ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((ev) => ({
    ...ev,
    evaluated_by: mapPid(ev.evaluated_by),
  }));
  if (evaluations.length) {
    const { error } = await sb.from('evaluations').upsert(evaluations, { onConflict: 'id' });
    if (error) throw new Error('evaluations: ' + error.message);
  }

  const placementTests = (db.prepare('SELECT * FROM placement_tests ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((pt) => ({
    ...pt,
    answers_json: parseJsonSafe(pt.answers_json),
  }));
  if (placementTests.length) {
    const { error } = await sb.from('placement_tests').upsert(placementTests, { onConflict: 'id' });
    if (error) throw new Error('placement_tests: ' + error.message);
  }

  // 10. Announcements, Targets, Notifications
  const announcements = (db.prepare('SELECT * FROM announcements ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((a) => ({
    ...a,
    created_by: mapPid(a.created_by),
    deleted_at: a.deleted_at || null,
  }));
  if (announcements.length) {
    const { error } = await sb.from('announcements').upsert(announcements, { onConflict: 'id' });
    if (error) throw new Error('announcements: ' + error.message);
  }

  const annTargets = db.prepare('SELECT * FROM announcement_targets ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  if (annTargets.length) {
    const { error } = await sb.from('announcement_targets').upsert(annTargets, { onConflict: 'id' });
    if (error) throw new Error('announcement_targets: ' + error.message);
  }

  const notifications = (db.prepare('SELECT * FROM notifications ORDER BY id ASC').all() as Array<Record<string, unknown>>)
    .map((n) => ({
      ...n,
      profile_id: mapPid(n.profile_id),
      is_read: Boolean(n.is_read),
    }))
    .filter((n) => Boolean(n.profile_id));
  if (notifications.length) {
    const { error } = await sb.from('notifications').upsert(notifications, { onConflict: 'id' });
    if (error) throw new Error('notifications: ' + error.message);
  }

  // 11. Certificates, Games, Game Progress
  const certificates = (db.prepare('SELECT * FROM certificates ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((c) => ({
    ...c,
    issued_by: mapPid(c.issued_by),
    revoked_at: c.revoked_at || null,
  }));
  if (certificates.length) {
    const { error } = await sb.from('certificates').upsert(certificates, { onConflict: 'id' });
    if (error) throw new Error('certificates: ' + error.message);
  }

  const games = (db.prepare('SELECT * FROM games ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((g) => ({
    ...g,
    is_public_sample: Boolean(g.is_public_sample),
    is_active: Boolean(g.is_active),
  }));
  if (games.length) {
    const { error } = await sb.from('games').upsert(games, { onConflict: 'id' });
    if (error) throw new Error('games: ' + error.message);
  }

  const gameProgress = db.prepare('SELECT * FROM game_progress ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  if (gameProgress.length) {
    const { error } = await sb.from('game_progress').upsert(gameProgress, { onConflict: 'id' });
    if (error) throw new Error('game_progress: ' + error.message);
  }

  // 12. Payouts, Payroll
  const payoutDetails = db.prepare('SELECT * FROM teacher_payout_details ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  if (payoutDetails.length) {
    const { error } = await sb.from('teacher_payout_details').upsert(payoutDetails, { onConflict: 'id' });
    if (error) throw new Error('teacher_payout_details: ' + error.message);
  }

  const payroll = (db.prepare('SELECT * FROM payroll ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((p) => ({
    ...p,
    created_by: mapPid(p.created_by),
    paid_at: p.paid_at || null,
  }));
  if (payroll.length) {
    const { error } = await sb.from('payroll').upsert(payroll, { onConflict: 'id' });
    if (error) throw new Error('payroll: ' + error.message);
  }

  // 13. Admissions, Legal, Consents, Testimonials, Audit Logs
  const admissions = (db.prepare('SELECT * FROM admission_requests ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((a) => ({
    ...a,
    consent_accepted: Boolean(a.consent_accepted),
    reviewed_by: mapPid(a.reviewed_by),
  }));
  if (admissions.length) {
    const { error } = await sb.from('admission_requests').upsert(admissions, { onConflict: 'id' });
    if (error) throw new Error('admission_requests: ' + error.message);
  }

  const legalDocs = db.prepare('SELECT * FROM legal_documents ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  if (legalDocs.length) {
    const { error } = await sb.from('legal_documents').upsert(legalDocs, { onConflict: 'doc_type' });
    if (error) throw new Error('legal_documents: ' + error.message);
  }

  const consents = db.prepare('SELECT * FROM consents ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  if (consents.length) {
    const { error } = await sb.from('consents').upsert(consents, { onConflict: 'id' });
    if (error) throw new Error('consents: ' + error.message);
  }

  const testimonials = (db.prepare('SELECT * FROM testimonials ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((t) => ({
    ...t,
    is_approved: Boolean(t.is_approved),
  }));
  if (testimonials.length) {
    const { error } = await sb.from('testimonials').upsert(testimonials, { onConflict: 'id' });
    if (error) throw new Error('testimonials: ' + error.message);
  }

  const auditLogs = (db.prepare('SELECT * FROM audit_logs ORDER BY id ASC').all() as Array<Record<string, unknown>>).map((al) => ({
    ...al,
    actor_id: mapPid(al.actor_id),
    details_json: parseJsonSafe(al.details_json),
  }));
  if (auditLogs.length) {
    const { error } = await sb.from('audit_logs').upsert(auditLogs, { onConflict: 'id' });
    if (error) throw new Error('audit_logs: ' + error.message);
  }

  // Verify final counts across all 28 tables
  const tables = [
    'profiles', 'levels', 'guardians', 'teachers', 'students', 'courses', 'lessons',
    'lesson_links', 'enrollments', 'attendance', 'exams', 'exam_results', 'recitations',
    'evaluations', 'placement_tests', 'announcements', 'announcement_targets',
    'notifications', 'certificates', 'games', 'game_progress', 'teacher_payout_details',
    'payroll', 'admission_requests', 'legal_documents', 'consents', 'testimonials', 'audit_logs',
  ];

  console.log('\n--- MIGRATION VERIFICATION ---');
  const results = await Promise.all(
    tables.map(async (t) => {
      const sqliteCount = (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number }).c;
      const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
      return { table: t, sqlite: sqliteCount, supabase: error ? -1 : (count ?? 0), error: error?.message };
    })
  );

  for (const r of results) {
    console.log(`${r.table.padEnd(24)} SQLite=${String(r.sqlite).padStart(3)} | Supabase=${String(r.supabase).padStart(3)}${r.error ? ' ERR: ' + r.error : ''}`);
  }
  console.log('Migration complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
