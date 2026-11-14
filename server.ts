import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import type { ViteDevServer } from 'vite';
import {
  requireSupabaseAdmin,
  createEphemeralSupabaseAnon,
  insertRowSafe,
  getSupabaseLiveHealth,
  pingSupabaseDatabase,
  provisionSupabaseAuthUser,
  syncUsersToSupabaseAuth,
  requestSupabasePasswordReset,
  broadcastRealtimeEvent,
} from './server/supabaseClient.ts';
import { AppError, asyncHandler, apiNotFoundHandler, globalErrorHandler } from './server/errorHandler.ts';

dotenv.config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ALLOW_DEMO_LOGIN = !IS_PRODUCTION && process.env.ALLOW_DEMO_LOGIN !== 'false';

if (IS_PRODUCTION && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24)) {
  throw new Error('FATAL: SESSION_SECRET environment variable (min 24 chars) is required in production.');
}

const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[security] SESSION_SECRET not set — using ephemeral process secret for development.');
}

// Verify Supabase credentials at startup
requireSupabaseAdmin();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

let isShuttingDown = false;
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    if (req.path.startsWith('/api')) {
      res.status(503).json({ error: 'Server is restarting, please retry shortly.' });
      return;
    }
  }
  next();
});

// Configurable CORS for production custom domains / separated frontends
const allowedOrigins = new Set(
  [process.env.CORS_ALLOWED_ORIGINS || '', process.env.APP_URL || '']
    .join(',')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.startsWith('http://') || origin.startsWith('https://'))
);

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin?.replace(/\/+$/, '');
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (IS_PRODUCTION && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Explicit Block on Database, Server Source, Schema & Config Files (dev & prod)
app.use((req, res, next) => {
  const p = req.path.toLowerCase();
  if (
    p.endsWith('.db') ||
    p.endsWith('.db-wal') ||
    p.endsWith('.db-shm') ||
    p.endsWith('.sqlite') ||
    p.endsWith('.sqlite3') ||
    p === '/server.ts' ||
    p === '/server.js' ||
    p.startsWith('/server/') ||
    p === '/supabase_schema.sql' ||
    p === '/vite.config.ts' ||
    p.startsWith('/.env') ||
    p.startsWith('/.git') ||
    p === '/package.json' ||
    p === '/package-lock.json' ||
    p === '/tsconfig.json'
  ) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

// Lightweight In-Memory Sliding-Window Rate Limiter
function createRateLimiter(windowMs: number, maxRequests: number) {
  const buckets = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
      return;
    }
    recent.push(now);
    buckets.set(key, recent);
    if (buckets.size > 5000) buckets.clear();
    next();
  };
}

const loginLimiter = createRateLimiter(15 * 60 * 1000, 30);
const publicSubmitLimiter = createRateLimiter(15 * 60 * 1000, 15);
const verifyLimiter = createRateLimiter(15 * 60 * 1000, 40);

function generateTempPassword(): string {
  return `NB-${crypto.randomBytes(6).toString('base64url')}`;
}

async function generateUniqueStudentCode(): Promise<string> {
  const sb = requireSupabaseAdmin();
  const year = new Date().getFullYear();
  for (let i = 0; i < 10; i++) {
    const code = `NB-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const { data } = await sb.from('students').select('id').eq('student_code', code).maybeSingle();
    if (!data) return code;
  }
  return `NB-${year}-${Date.now().toString(36).toUpperCase()}`;
}

function generateCertificateCode(): string {
  const year = new Date().getFullYear();
  return `NB-CERT-${year}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

const placementSchema = z.object({
  child_name: z.string().trim().min(2).max(120),
  age: z.coerce.number().int().min(3).max(22),
  parent_email: z.string().trim().email().optional().or(z.literal('')),
  answers: z.array(z.number().int().min(0).max(5)).min(1).max(10),
});

const admissionSchema = z.object({
  student_name: z.string().trim().min(2).max(120),
  student_age: z.coerce.number().int().min(3).max(22),
  guardian_name: z.string().trim().min(2).max(120),
  guardian_email: z.string().trim().email().max(160),
  guardian_phone: z.string().trim().min(6).max(32),
  preferred_course_id: z.coerce.number().int().positive().nullable().optional(),
  recommended_level_id: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
  consent_accepted: z.literal(true).or(z.literal(1)).or(z.boolean().refine((v) => v === true)),
});

interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'student' | 'teacher' | 'admin' | 'guardian';
  is_active: boolean;
  preferred_lang: string;
}

interface AuthRequest extends Request {
  user?: AuthUser;
}

function signToken(payload: { id: string; role: string; exp: number }): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): { id: string; role: string; exp: number } | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed?.id || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function maskIban(iban: string): string {
  const clean = iban.replace(/\s+/g, '');
  if (clean.length <= 8) return '****' + clean.slice(-2);
  return clean.slice(0, 4) + ' •••• •••• ' + clean.slice(-4);
}

async function writeAuditLog(
  actorId: string | null,
  actorName: string,
  action: string,
  entityType: string,
  entityId: string | number,
  details: Record<string, unknown>
) {
  try {
    await insertRowSafe('audit_logs', {
      actor_id: actorId,
      actor_name: actorName,
      action,
      entity_type: entityType,
      entity_id: String(entityId),
      details_json: details,
    });
  } catch (err) {
    console.warn('[audit_log] write warning:', err instanceof Error ? err.message : err);
  }
}

const authenticate = asyncHandler<AuthRequest>(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active, preferred_lang')
    .eq('id', String(decoded.id))
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !profile || !profile.is_active) {
    res.status(403).json({ error: 'Account inactive or not found' });
    return;
  }
  req.user = profile as AuthUser;
  next();
});

function requireRole(...roles: Array<'student' | 'teacher' | 'admin' | 'guardian'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient permissions for this role' });
      return;
    }
    next();
  };
}

// ============================================================================
// HEALTH CHECK (Liveness & Supabase Readiness for Hosting Probes)
// ============================================================================
app.get('/api/health', asyncHandler(async (_req, res) => {
  const db = await pingSupabaseDatabase();
  const payload = {
    status: db.connected ? 'ok' : 'degraded',
    environment: IS_PRODUCTION ? 'production' : 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      engine: 'supabase_postgresql',
      connected: db.connected,
      latencyMs: db.latencyMs,
    },
  };
  res.status(db.connected ? 200 : 503).json(payload);
}));

// ============================================================================
// PUBLIC ROUTES (No Auth Required)
// ============================================================================
app.get('/api/public/overview', asyncHandler(async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const [
    studentsRes,
    teachersRes,
    coursesRes,
    lessonsRes,
    levelsRes,
    gamesRes,
    testimonialsRes,
    legalRes,
  ] = await Promise.all([
    sb.from('students').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    sb
      .from('teachers')
      .select('id, name_ar, name_en, bio_ar, bio_en, qualifications_ar, qualifications_en, specialty_ar, specialty_en, avatar_url')
      .is('deleted_at', null)
      .eq('is_public', true)
      .order('id', { ascending: true }),
    sb
      .from('courses')
      .select('*, levels(name_ar, name_en, code), teachers(name_ar, name_en, avatar_url)')
      .is('deleted_at', null)
      .order('is_featured', { ascending: false })
      .order('id', { ascending: true }),
    sb.from('lessons').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    sb.from('levels').select('*').order('order_index', { ascending: true }),
    sb.from('games').select('*').eq('is_active', true).order('id', { ascending: true }),
    sb.from('testimonials').select('*').eq('is_approved', true).order('id', { ascending: true }),
    sb.from('legal_documents').select('doc_type, version, title_ar, title_en, content_ar, content_en, updated_at').order('id', { ascending: true }),
  ]);

  const courses = (coursesRes.data || []).map((c: Record<string, unknown>) => {
    const lvl = c.levels as { name_ar?: string; name_en?: string; code?: string } | null;
    const tch = c.teachers as { name_ar?: string; name_en?: string; avatar_url?: string } | null;
    const { levels: _l, teachers: _t, ...rest } = c;
    return {
      ...rest,
      level_name_ar: lvl?.name_ar ?? null,
      level_name_en: lvl?.name_en ?? null,
      level_code: lvl?.code ?? null,
      teacher_name_ar: tch?.name_ar ?? null,
      teacher_name_en: tch?.name_en ?? null,
      teacher_avatar: tch?.avatar_url ?? null,
    };
  });

  res.json({
    stats: {
      students: studentsRes.count || 0,
      teachers: teachersRes.data?.length || 0,
      courses: courses.length,
      lessons: lessonsRes.count || 0,
    },
    courses,
    teachers: teachersRes.data || [],
    levels: levelsRes.data || [],
    games: gamesRes.data || [],
    testimonials: testimonialsRes.data || [],
    legal: legalRes.data || [],
  });
}));

app.get('/api/public/courses/:id', asyncHandler(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const courseId = Number(req.params.id);
  const { data: c } = await sb
    .from('courses')
    .select('*, levels(name_ar, name_en, age_range), teachers(id, name_ar, name_en, qualifications_ar, qualifications_en, avatar_url)')
    .eq('id', courseId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!c) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const lvl = c.levels as { name_ar?: string; name_en?: string; age_range?: string } | null;
  const tch = c.teachers as {
    id?: number;
    name_ar?: string;
    name_en?: string;
    qualifications_ar?: string;
    qualifications_en?: string;
    avatar_url?: string;
  } | null;
  const { levels: _l, teachers: _t, ...rest } = c as Record<string, unknown>;

  const course = {
    ...rest,
    level_name_ar: lvl?.name_ar ?? null,
    level_name_en: lvl?.name_en ?? null,
    age_range: lvl?.age_range ?? null,
    teacher_id: tch?.id ?? rest.teacher_id ?? null,
    teacher_name_ar: tch?.name_ar ?? null,
    teacher_name_en: tch?.name_en ?? null,
    teacher_qualifications_ar: tch?.qualifications_ar ?? null,
    teacher_qualifications_en: tch?.qualifications_en ?? null,
    teacher_avatar: tch?.avatar_url ?? null,
  };

  const { data: lessons } = await sb
    .from('lessons')
    .select('id, title_ar, title_en, lesson_date, duration_min, objectives_ar, objectives_en')
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .order('lesson_date', { ascending: true });

  res.json({ course, lessons: lessons || [] });
}));

app.get('/api/public/teachers/:id', asyncHandler(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const teacherId = Number(req.params.id);

  const [{ data: teacher }, { data: courses }] = await Promise.all([
    sb
      .from('teachers')
      .select('id, name_ar, name_en, bio_ar, bio_en, qualifications_ar, qualifications_en, specialty_ar, specialty_en, avatar_url')
      .eq('id', teacherId)
      .is('deleted_at', null)
      .eq('is_public', true)
      .maybeSingle(),
    sb
      .from('courses')
      .select('id, title_ar, title_en, schedule_ar, schedule_en, price_monthly')
      .eq('teacher_id', teacherId)
      .is('deleted_at', null),
  ]);

  if (!teacher) {
    res.status(404).json({ error: 'Teacher not found' });
    return;
  }

  res.json({ teacher, courses: courses || [] });
}));

app.get('/api/public/certificates/verify/:code', verifyLimiter, asyncHandler(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (code.length < 6 || code.length > 48) {
    res.status(400).json({ valid: false, error: 'Invalid verification code format' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const { data: rows, error } = await sb.rpc('verify_certificate', { p_code: code });
  if (error) {
    res.status(500).json({ valid: false, error: 'Verification query failed' });
    return;
  }
  const cert = Array.isArray(rows) ? rows[0] : rows;
  if (!cert) {
    res.status(404).json({ valid: false, error: 'Certificate not found' });
    return;
  }
  res.json({ valid: !cert.revoked_at, certificate: cert });
}));

app.post('/api/public/placement-test', publicSubmitLimiter, asyncHandler(async (req, res) => {
  const parsed = placementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid placement test submission', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { child_name, age, parent_email, answers } = parsed.data;

  // Score calculation: 5 questions, correct indices [1, 2, 0, 2, 1]
  const key = [1, 2, 0, 2, 1];
  let correctCount = 0;
  answers.forEach((ans, idx) => {
    if (ans === key[idx]) correctCount += 1;
  });
  const score = Math.round((correctCount / key.length) * 100);

  const sb = requireSupabaseAdmin();
  const { data: levels } = await sb.from('levels').select('*').order('order_index', { ascending: true });
  const levelList = (levels || []) as Array<{
    id: number;
    code: string;
    name_ar: string;
    name_en: string;
    description_ar: string;
    description_en: string;
  }>;

  let recommended = levelList[0];
  if (score >= 80 && age >= 9) {
    recommended = levelList[2] || levelList[levelList.length - 1];
  } else if (score >= 50) {
    recommended = levelList[1] || levelList[0];
  }

  await insertRowSafe('placement_tests', {
    child_name,
    age,
    parent_email: parent_email || '',
    score,
    recommended_level_id: recommended?.id || null,
    answers_json: answers,
  });

  res.json({ score, correctCount, total: key.length, recommendedLevel: recommended });
}));

app.post('/api/public/admissions', publicSubmitLimiter, asyncHandler(async (req, res) => {
  const parsed = admissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'All required fields and valid consent must be provided' });
    return;
  }
  const {
    student_name,
    student_age,
    guardian_name,
    guardian_email,
    guardian_phone,
    preferred_course_id,
    recommended_level_id,
    notes,
  } = parsed.data;

  const inserted = await insertRowSafe<{ id: number }>('admission_requests', {
    student_name,
    student_age,
    guardian_name,
    guardian_email,
    guardian_phone,
    preferred_course_id: preferred_course_id || null,
    recommended_level_id: recommended_level_id || null,
    notes: notes || '',
    consent_accepted: true,
    status: 'pending',
  });

  await Promise.all([
    insertRowSafe('consents', { email: guardian_email, doc_type: 'terms', doc_version: '1.0' }),
    insertRowSafe('consents', { email: guardian_email, doc_type: 'privacy', doc_version: '1.0' }),
  ]);

  void broadcastRealtimeEvent('admission:created', {
    admissionId: inserted.id,
    student_name,
    status: 'pending',
  });

  res.status(201).json({ id: inserted.id, status: 'pending', syncedToSupabase: true });
}));

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================
app.get('/api/auth/config', (_req, res) => {
  res.json({ demoEnabled: ALLOW_DEMO_LOGIN });
});

app.post('/api/auth/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password, demoRole } = req.body as { email?: string; password?: string; demoRole?: string };
  const sb = requireSupabaseAdmin();
  let profile: AuthUser | null = null;

  if (demoRole) {
    if (!ALLOW_DEMO_LOGIN) {
      res.status(403).json({ error: 'Demo login is disabled in production.' });
      return;
    }
    const demoEmails: Record<string, string> = {
      admin: 'admin@noorbayan.academy',
      teacher1: 'fatima@noorbayan.academy',
      teacher2: 'yusuf@noorbayan.academy',
      student: 'omar.student@noorbayan.academy',
      guardian: 'khaled.parent@noorbayan.academy',
    };
    const targetEmail = demoEmails[demoRole];
    if (!targetEmail) {
      res.status(400).json({ error: 'Unknown demo role' });
      return;
    }
    const { data } = await sb
      .from('profiles')
      .select('id, email, full_name, role, is_active, preferred_lang')
      .ilike('email', targetEmail)
      .is('deleted_at', null)
      .maybeSingle();
    profile = data as AuthUser | null;
  } else {
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const { data: profileRow } = await sb
      .from('profiles')
      .select('id, email, full_name, role, is_active, preferred_lang')
      .ilike('email', cleanEmail)
      .is('deleted_at', null)
      .maybeSingle();

    if (!profileRow) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const anon = createEphemeralSupabaseAnon();
    const { error: authErr } = await anon.auth.signInWithPassword({
      email: profileRow.email,
      password,
    });
    if (authErr) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    profile = profileRow as AuthUser;
  }

  if (!profile || !profile.is_active) {
    res.status(403).json({ error: 'Account disabled or not found' });
    return;
  }

  const token = signToken({ id: profile.id, role: profile.role, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  res.json({
    token,
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      preferred_lang: profile.preferred_lang,
    },
  });
}));

app.get('/api/auth/me', authenticate, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/change-password', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    return;
  }
  const { currentPassword, newPassword } = parsed.data;

  const anon = createEphemeralSupabaseAnon();
  const { error: verifyErr } = await anon.auth.signInWithPassword({
    email: req.user!.email,
    password: currentPassword,
  });
  if (verifyErr) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const { error: updateErr } = await sb.auth.admin.updateUserById(req.user!.id, {
    password: newPassword,
  });
  if (updateErr) {
    res.status(500).json({ error: updateErr.message });
    return;
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, 'CHANGE_PASSWORD', 'profile', req.user!.id, {});
  res.json({ ok: true });
}));

app.post('/api/auth/forgot-password', loginLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({ email: z.string().trim().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email is required.' });
    return;
  }
  const result = await requestSupabasePasswordReset(parsed.data.email, process.env.APP_URL ? `${process.env.APP_URL}/login` : undefined);
  res.json({
    ok: true,
    emailSentViaSupabase: result.sent,
    mode: result.sent ? 'supabase_email' : 'admin_assisted',
  });
}));

app.get('/api/notifications', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data } = await sb
    .from('notifications')
    .select('*')
    .eq('profile_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(20);
  res.json({ notifications: data || [] });
}));

app.post('/api/notifications/read-all', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  await sb.from('notifications').update({ is_read: true }).eq('profile_id', req.user!.id);
  res.json({ ok: true });
}));

// ============================================================================
// STUDENT ROUTES (Strictly scoped to logged-in student)
// ============================================================================
app.get('/api/student/dashboard', authenticate, requireRole('student'), asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: studentRow } = await sb
    .from('students')
    .select('*, levels(name_ar, name_en, code), guardians(full_name, phone, email)')
    .eq('profile_id', req.user!.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!studentRow) {
    res.status(404).json({ error: 'Student profile not linked yet' });
    return;
  }

  const lvl = studentRow.levels as { name_ar?: string; name_en?: string; code?: string } | null;
  const grd = studentRow.guardians as { full_name?: string; phone?: string; email?: string } | null;
  const { levels: _sl, guardians: _sg, ...studentBase } = studentRow as Record<string, unknown>;
  const student = {
    ...studentBase,
    id: Number(studentBase.id),
    level_name_ar: lvl?.name_ar ?? null,
    level_name_en: lvl?.name_en ?? null,
    level_code: lvl?.code ?? null,
    guardian_name: grd?.full_name ?? null,
    guardian_phone: grd?.phone ?? null,
    guardian_email: grd?.email ?? null,
  };

  const { data: enrollRows } = await sb
    .from('enrollments')
    .select('*, courses!inner(title_ar, title_en, schedule_ar, schedule_en, deleted_at, teachers(name_ar, name_en))')
    .eq('student_id', student.id)
    .is('deleted_at', null)
    .is('courses.deleted_at', null);

  const enrollments = (enrollRows || []).map((e: Record<string, unknown>) => {
    const c = e.courses as {
      title_ar?: string;
      title_en?: string;
      schedule_ar?: string;
      schedule_en?: string;
      teachers?: { name_ar?: string; name_en?: string } | null;
    } | null;
    const { courses: _c, ...rest } = e;
    return {
      ...rest,
      course_id: Number(rest.course_id),
      title_ar: c?.title_ar ?? null,
      title_en: c?.title_en ?? null,
      schedule_ar: c?.schedule_ar ?? null,
      schedule_en: c?.schedule_en ?? null,
      teacher_name_ar: c?.teachers?.name_ar ?? null,
      teacher_name_en: c?.teachers?.name_en ?? null,
    };
  });

  const courseIds = enrollments.map((e) => e.course_id);

  const [
    lessonsRes,
    attendanceRes,
    examResultsRes,
    recitationsRes,
    evaluationsRes,
    allAnnouncementsRes,
    annTargetsRes,
    certificatesRes,
    gamesRes,
    gameProgressRes,
  ] = await Promise.all([
    courseIds.length
      ? sb
          .from('lessons')
          .select('*, courses(title_ar, title_en)')
          .in('course_id', courseIds)
          .is('deleted_at', null)
          .order('lesson_date', { ascending: true })
          .order('start_time', { ascending: true })
      : Promise.resolve({ data: [] }),
    sb.from('attendance').select('*, lessons(title_ar, title_en, lesson_date)').eq('student_id', student.id),
    sb
      .from('exam_results')
      .select('*, exams!inner(title_ar, title_en, exam_date, max_score, deleted_at, courses(title_ar, title_en))')
      .eq('student_id', student.id)
      .is('exams.deleted_at', null),
    sb
      .from('recitations')
      .select('*, courses(title_ar, title_en)')
      .eq('student_id', student.id)
      .order('recorded_at', { ascending: false }),
    sb
      .from('evaluations')
      .select('*, courses(title_ar, title_en)')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false }),
    sb.from('announcements').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
    sb.from('announcement_targets').select('announcement_id').eq('student_id', student.id),
    sb
      .from('certificates')
      .select('*, courses(title_ar, title_en)')
      .eq('student_id', student.id)
      .order('issued_at', { ascending: false }),
    sb.from('games').select('*').eq('is_active', true).order('id', { ascending: true }),
    sb.from('game_progress').select('*').eq('student_id', student.id),
  ]);

  const lessons = (lessonsRes.data || []).map((l: Record<string, unknown>) => {
    const c = l.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = l;
    return {
      ...rest,
      id: Number(rest.id),
      course_title_ar: c?.title_ar ?? null,
      course_title_en: c?.title_en ?? null,
    };
  });

  const lessonIds = lessons.map((l) => l.id);
  const lessonLinks = lessonIds.length
    ? (await sb.from('lesson_links').select('*').in('lesson_id', lessonIds)).data || []
    : [];

  const attendance = (attendanceRes.data || [])
    .map((a: Record<string, unknown>) => {
      const l = a.lessons as { title_ar?: string; title_en?: string; lesson_date?: string } | null;
      const { lessons: _l, ...rest } = a;
      return {
        ...rest,
        lesson_title_ar: l?.title_ar ?? null,
        lesson_title_en: l?.title_en ?? null,
        lesson_date: l?.lesson_date ?? '',
      };
    })
    .sort((a, b) => String(b.lesson_date).localeCompare(String(a.lesson_date)));

  const examResults = (examResultsRes.data || [])
    .map((er: Record<string, unknown>) => {
      const ex = er.exams as {
        title_ar?: string;
        title_en?: string;
        exam_date?: string;
        max_score?: number;
        courses?: { title_ar?: string; title_en?: string } | null;
      } | null;
      const { exams: _ex, ...rest } = er;
      return {
        ...rest,
        exam_title_ar: ex?.title_ar ?? null,
        exam_title_en: ex?.title_en ?? null,
        exam_date: ex?.exam_date ?? '',
        max_score: ex?.max_score ?? 100,
        course_title_ar: ex?.courses?.title_ar ?? null,
        course_title_en: ex?.courses?.title_en ?? null,
      };
    })
    .sort((a, b) => String(b.exam_date).localeCompare(String(a.exam_date)));

  const recitations = (recitationsRes.data || []).map((r: Record<string, unknown>) => {
    const c = r.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = r;
    return { ...rest, course_title_ar: c?.title_ar ?? null, course_title_en: c?.title_en ?? null };
  });

  const evaluations = (evaluationsRes.data || []).map((ev: Record<string, unknown>) => {
    const c = ev.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = ev;
    return { ...rest, course_title_ar: c?.title_ar ?? null, course_title_en: c?.title_en ?? null };
  });

  const targetAnnIds = new Set((annTargetsRes.data || []).map((t: { announcement_id: number }) => t.announcement_id));
  const announcements = (allAnnouncementsRes.data || []).filter((a: Record<string, unknown>) => {
    if (a.target_scope === 'all_students') return true;
    if (a.target_scope === 'course' && a.target_course_id && courseIds.includes(Number(a.target_course_id))) return true;
    if (a.target_scope === 'specific_students' && targetAnnIds.has(Number(a.id))) return true;
    return false;
  });

  const certificates = (certificatesRes.data || []).map((cert: Record<string, unknown>) => {
    const c = cert.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = cert;
    return { ...rest, course_title_ar: c?.title_ar ?? null, course_title_en: c?.title_en ?? null };
  });

  const progressMap = new Map<number, Record<string, unknown>>();
  for (const gp of gameProgressRes.data || []) {
    progressMap.set(Number((gp as { game_id: number }).game_id), gp as Record<string, unknown>);
  }
  const games = (gamesRes.data || []).map((g: Record<string, unknown>) => {
    const gp = progressMap.get(Number(g.id));
    return {
      ...g,
      score: gp?.score ?? null,
      stars: gp?.stars ?? null,
      completed_levels: gp?.completed_levels ?? null,
      played_at: gp?.played_at ?? null,
    };
  });

  res.json({
    student,
    enrollments,
    lessons,
    lessonLinks,
    attendance,
    examResults,
    recitations,
    evaluations,
    announcements,
    certificates,
    games,
  });
}));

app.post('/api/student/games/progress', authenticate, requireRole('student'), asyncHandler<AuthRequest>(async (req, res) => {
  const { game_slug, score, stars, completed_levels } = req.body as {
    game_slug: string;
    score: number;
    stars: number;
    completed_levels: number;
  };
  const sb = requireSupabaseAdmin();
  const [{ data: student }, { data: game }] = await Promise.all([
    sb.from('students').select('id').eq('profile_id', req.user!.id).is('deleted_at', null).maybeSingle(),
    sb.from('games').select('id').eq('slug', game_slug).maybeSingle(),
  ]);

  if (!student || !game) {
    res.status(404).json({ error: 'Student or game not found' });
    return;
  }

  const nextScore = Number(score || 0);
  const nextStars = Number(stars || 0);
  const nextLevels = Number(completed_levels || 1);

  const { data: existing } = await sb
    .from('game_progress')
    .select('id, score, stars, completed_levels')
    .eq('student_id', student.id)
    .eq('game_id', game.id)
    .maybeSingle();

  if (existing) {
    await sb
      .from('game_progress')
      .update({
        score: Math.max(Number(existing.score || 0), nextScore),
        stars: Math.max(Number(existing.stars || 0), nextStars),
        completed_levels: Math.max(Number(existing.completed_levels || 1), nextLevels),
        played_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await insertRowSafe('game_progress', {
      student_id: student.id,
      game_id: game.id,
      score: nextScore,
      stars: nextStars,
      completed_levels: nextLevels,
      played_at: new Date().toISOString(),
    });
  }

  res.json({ ok: true });
}));

// ============================================================================
// GUARDIAN / PARENT ROUTES (Strictly scoped to children of logged-in guardian)
// ============================================================================
app.get('/api/guardian/dashboard', authenticate, requireRole('guardian'), asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: guardian } = await sb
    .from('guardians')
    .select('*')
    .eq('profile_id', req.user!.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!guardian) {
    res.status(404).json({ error: 'Guardian profile not linked yet' });
    return;
  }

  const { data: childRows } = await sb
    .from('students')
    .select('*, levels(name_ar, name_en, code)')
    .eq('guardian_id', guardian.id)
    .is('deleted_at', null)
    .order('id', { ascending: true });

  const children = (childRows || []).map((s: Record<string, unknown>) => {
    const l = s.levels as { name_ar?: string; name_en?: string; code?: string } | null;
    const { levels: _l, ...rest } = s;
    return {
      ...rest,
      id: Number(rest.id),
      level_name_ar: l?.name_ar ?? null,
      level_name_en: l?.name_en ?? null,
      level_code: l?.code ?? null,
    };
  });

  const childIds = children.map((c) => c.id);

  if (!childIds.length) {
    res.json({
      guardian,
      children: [],
      enrollments: [],
      attendance: [],
      recitations: [],
      examResults: [],
      evaluations: [],
      certificates: [],
    });
    return;
  }

  const [enrollRes, attendRes, recRes, examRes, evalRes, certRes] = await Promise.all([
    sb
      .from('enrollments')
      .select('*, courses!inner(title_ar, title_en, schedule_ar, schedule_en, deleted_at, teachers(name_ar, name_en))')
      .in('student_id', childIds)
      .is('deleted_at', null)
      .is('courses.deleted_at', null),
    sb.from('attendance').select('*, lessons(title_ar, title_en, lesson_date)').in('student_id', childIds),
    sb
      .from('recitations')
      .select('*, courses(title_ar, title_en)')
      .in('student_id', childIds)
      .order('recorded_at', { ascending: false }),
    sb
      .from('exam_results')
      .select('*, exams!inner(title_ar, title_en, exam_date, max_score, deleted_at, courses(title_ar, title_en))')
      .in('student_id', childIds)
      .is('exams.deleted_at', null),
    sb
      .from('evaluations')
      .select('*, courses(title_ar, title_en)')
      .in('student_id', childIds)
      .order('created_at', { ascending: false }),
    sb
      .from('certificates')
      .select('*, courses(title_ar, title_en)')
      .in('student_id', childIds)
      .order('issued_at', { ascending: false }),
  ]);

  const enrollments = (enrollRes.data || []).map((e: Record<string, unknown>) => {
    const c = e.courses as {
      title_ar?: string;
      title_en?: string;
      schedule_ar?: string;
      schedule_en?: string;
      teachers?: { name_ar?: string; name_en?: string } | null;
    } | null;
    const { courses: _c, ...rest } = e;
    return {
      ...rest,
      title_ar: c?.title_ar ?? null,
      title_en: c?.title_en ?? null,
      schedule_ar: c?.schedule_ar ?? null,
      schedule_en: c?.schedule_en ?? null,
      teacher_name_ar: c?.teachers?.name_ar ?? null,
      teacher_name_en: c?.teachers?.name_en ?? null,
    };
  });

  const attendance = (attendRes.data || [])
    .map((a: Record<string, unknown>) => {
      const l = a.lessons as { title_ar?: string; title_en?: string; lesson_date?: string } | null;
      const { lessons: _l, ...rest } = a;
      return {
        ...rest,
        lesson_title_ar: l?.title_ar ?? null,
        lesson_title_en: l?.title_en ?? null,
        lesson_date: l?.lesson_date ?? '',
      };
    })
    .sort((a, b) => String(b.lesson_date).localeCompare(String(a.lesson_date)));

  const recitations = (recRes.data || []).map((r: Record<string, unknown>) => {
    const c = r.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = r;
    return { ...rest, course_title_ar: c?.title_ar ?? null, course_title_en: c?.title_en ?? null };
  });

  const examResults = (examRes.data || [])
    .map((er: Record<string, unknown>) => {
      const ex = er.exams as {
        title_ar?: string;
        title_en?: string;
        exam_date?: string;
        max_score?: number;
        courses?: { title_ar?: string; title_en?: string } | null;
      } | null;
      const { exams: _ex, ...rest } = er;
      return {
        ...rest,
        exam_title_ar: ex?.title_ar ?? null,
        exam_title_en: ex?.title_en ?? null,
        exam_date: ex?.exam_date ?? '',
        max_score: ex?.max_score ?? 100,
        course_title_ar: ex?.courses?.title_ar ?? null,
        course_title_en: ex?.courses?.title_en ?? null,
      };
    })
    .sort((a, b) => String(b.exam_date).localeCompare(String(a.exam_date)));

  const evaluations = (evalRes.data || []).map((ev: Record<string, unknown>) => {
    const c = ev.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = ev;
    return { ...rest, course_title_ar: c?.title_ar ?? null, course_title_en: c?.title_en ?? null };
  });

  const certificates = (certRes.data || []).map((cert: Record<string, unknown>) => {
    const c = cert.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = cert;
    return { ...rest, course_title_ar: c?.title_ar ?? null, course_title_en: c?.title_en ?? null };
  });

  res.json({
    guardian,
    children,
    enrollments,
    attendance,
    recitations,
    examResults,
    evaluations,
    certificates,
  });
}));

// ============================================================================
// TEACHER ROUTES (Strictly scoped to courses taught by this teacher)
// ============================================================================
async function getTeacherByProfile(profileId: string) {
  const sb = requireSupabaseAdmin();
  const { data } = await sb
    .from('teachers')
    .select('*')
    .eq('profile_id', profileId)
    .is('deleted_at', null)
    .maybeSingle();
  return data as { id: number; name_ar: string } | null;
}

async function assertTeacherOwnsCourse(teacherId: number, courseId: number): Promise<boolean> {
  const sb = requireSupabaseAdmin();
  const { data } = await sb
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

async function assertTeacherTeachesStudent(teacherId: number, studentId: number, courseId?: number): Promise<boolean> {
  const sb = requireSupabaseAdmin();
  if (courseId) {
    const { data } = await sb
      .from('enrollments')
      .select('id, courses!inner(teacher_id, deleted_at)')
      .eq('course_id', courseId)
      .eq('student_id', studentId)
      .eq('courses.teacher_id', teacherId)
      .is('deleted_at', null)
      .is('courses.deleted_at', null)
      .limit(1);
    return Boolean(data && data.length > 0);
  }
  const { data } = await sb
    .from('enrollments')
    .select('id, courses!inner(teacher_id, deleted_at)')
    .eq('student_id', studentId)
    .eq('courses.teacher_id', teacherId)
    .is('deleted_at', null)
    .is('courses.deleted_at', null)
    .limit(1);
  return Boolean(data && data.length > 0);
}

app.get('/api/teacher/dashboard', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const teacher = await getTeacherByProfile(req.user!.id);
  if (!teacher) {
    res.status(404).json({ error: 'Teacher profile not found' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const { data: courseRows } = await sb
    .from('courses')
    .select('*, levels(name_ar, name_en)')
    .eq('teacher_id', teacher.id)
    .is('deleted_at', null)
    .order('id', { ascending: true });

  const courses = (courseRows || []).map((c: Record<string, unknown>) => {
    const l = c.levels as { name_ar?: string; name_en?: string } | null;
    const { levels: _l, ...rest } = c;
    return { ...rest, id: Number(rest.id), level_name_ar: l?.name_ar ?? null, level_name_en: l?.name_en ?? null };
  });

  const courseIds = courses.map((c) => c.id);

  const [
    enrollRowsRes,
    lessonsRes,
    examsRes,
    recRes,
    evalRes,
    payrollRes,
    payoutRes,
  ] = await Promise.all([
    courseIds.length
      ? sb
          .from('enrollments')
          .select('course_id, students!inner(id, student_code, full_name_ar, full_name_en, age, status, deleted_at, levels(name_ar, name_en)), courses(title_ar, title_en)')
          .in('course_id', courseIds)
          .is('deleted_at', null)
          .is('students.deleted_at', null)
      : Promise.resolve({ data: [] }),
    courseIds.length
      ? sb
          .from('lessons')
          .select('*, courses(title_ar, title_en)')
          .in('course_id', courseIds)
          .is('deleted_at', null)
          .order('lesson_date', { ascending: false })
          .order('start_time', { ascending: true })
      : Promise.resolve({ data: [] }),
    courseIds.length
      ? sb.from('exams').select('*, courses(title_ar, title_en)').in('course_id', courseIds).is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    courseIds.length
      ? sb
          .from('recitations')
          .select('*, students(full_name_ar), courses(title_ar)')
          .in('course_id', courseIds)
          .order('recorded_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    courseIds.length
      ? sb
          .from('evaluations')
          .select('*, students(full_name_ar), courses(title_ar)')
          .in('course_id', courseIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    sb.from('payroll').select('*').eq('teacher_id', teacher.id).order('month_year', { ascending: false }),
    sb.from('teacher_payout_details').select('*').eq('teacher_id', teacher.id).maybeSingle(),
  ]);

  const students = (enrollRowsRes.data || [])
    .map((row: Record<string, unknown>) => {
      const s = row.students as {
        id: number;
        student_code: string;
        full_name_ar: string;
        full_name_en: string;
        age: number;
        status: string;
        levels?: { name_ar?: string; name_en?: string } | null;
      };
      const c = row.courses as { title_ar?: string; title_en?: string } | null;
      return {
        id: s.id,
        student_code: s.student_code,
        full_name_ar: s.full_name_ar,
        full_name_en: s.full_name_en,
        age: s.age,
        status: s.status,
        level_name_ar: s.levels?.name_ar ?? null,
        level_name_en: s.levels?.name_en ?? null,
        course_id: row.course_id,
        course_title_ar: c?.title_ar ?? null,
        course_title_en: c?.title_en ?? null,
      };
    })
    .sort((a, b) => a.full_name_ar.localeCompare(b.full_name_ar));

  const lessons = (lessonsRes.data || []).map((l: Record<string, unknown>) => {
    const c = l.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = l;
    return { ...rest, id: Number(rest.id), course_title_ar: c?.title_ar ?? null, course_title_en: c?.title_en ?? null };
  });

  const lessonIds = lessons.map((l) => l.id);
  const attendance = lessonIds.length
    ? ((await sb.from('attendance').select('*, lessons!inner(course_id)').in('lesson_id', lessonIds)).data || []).map((a: Record<string, unknown>) => {
        const l = a.lessons as { course_id?: number } | null;
        const { lessons: _l, ...rest } = a;
        return { ...rest, course_id: l?.course_id ?? null };
      })
    : [];

  const exams = (examsRes.data || []).map((ex: Record<string, unknown>) => {
    const c = ex.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = ex;
    return { ...rest, id: Number(rest.id), course_title_ar: c?.title_ar ?? null, course_title_en: c?.title_en ?? null };
  });

  const examIds = exams.map((ex) => ex.id);
  const examResults = examIds.length
    ? ((await sb.from('exam_results').select('*, exams(course_id, title_ar), students(full_name_ar)').in('exam_id', examIds)).data || []).map(
        (er: Record<string, unknown>) => {
          const ex = er.exams as { course_id?: number; title_ar?: string } | null;
          const s = er.students as { full_name_ar?: string } | null;
          const { exams: _ex, students: _s, ...rest } = er;
          return {
            ...rest,
            course_id: ex?.course_id ?? null,
            exam_title_ar: ex?.title_ar ?? null,
            student_name_ar: s?.full_name_ar ?? null,
          };
        }
      )
    : [];

  const recitations = (recRes.data || []).map((r: Record<string, unknown>) => {
    const s = r.students as { full_name_ar?: string } | null;
    const c = r.courses as { title_ar?: string } | null;
    const { students: _s, courses: _c, ...rest } = r;
    return { ...rest, student_name_ar: s?.full_name_ar ?? null, course_title_ar: c?.title_ar ?? null };
  });

  const evaluations = (evalRes.data || []).map((ev: Record<string, unknown>) => {
    const s = ev.students as { full_name_ar?: string } | null;
    const c = ev.courses as { title_ar?: string } | null;
    const { students: _s, courses: _c, ...rest } = ev;
    return { ...rest, student_name_ar: s?.full_name_ar ?? null, course_title_ar: c?.title_ar ?? null };
  });

  const rawPayout = payoutRes.data as {
    account_holder_name: string;
    bank_name: string;
    iban: string;
    updated_at: string;
  } | null;

  const payoutDetails = rawPayout
    ? {
        account_holder_name: rawPayout.account_holder_name,
        bank_name: rawPayout.bank_name,
        masked_iban: maskIban(rawPayout.iban),
        updated_at: rawPayout.updated_at,
      }
    : null;

  res.json({
    teacher,
    courses,
    students,
    lessons,
    attendance,
    exams,
    examResults,
    recitations,
    evaluations,
    payroll: payrollRes.data || [],
    payoutDetails,
  });
}));

app.get('/api/teacher/students/:studentId', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const teacher = await getTeacherByProfile(req.user!.id);
  const studentId = Number(req.params.studentId);
  if (!teacher || !(await assertTeacherTeachesStudent(teacher.id, studentId))) {
    res.status(403).json({ error: 'Forbidden: student is not enrolled in any of your courses' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const { data: student } = await sb
    .from('students')
    .select('id, student_code, full_name_ar, full_name_en, age, level_id')
    .eq('id', studentId)
    .maybeSingle();
  res.json({ student });
}));

app.post('/api/teacher/attendance', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const teacher = await getTeacherByProfile(req.user!.id);
  const { lesson_id, student_id, status, notes } = req.body;
  const sb = requireSupabaseAdmin();
  const { data: lesson } = await sb
    .from('lessons')
    .select('id, course_id')
    .eq('id', Number(lesson_id))
    .is('deleted_at', null)
    .maybeSingle();

  if (
    !teacher ||
    !lesson ||
    !(await assertTeacherOwnsCourse(teacher.id, lesson.course_id)) ||
    !(await assertTeacherTeachesStudent(teacher.id, Number(student_id), lesson.course_id))
  ) {
    res.status(403).json({ error: 'Forbidden: cannot record attendance outside your courses' });
    return;
  }

  const { data: existing } = await sb
    .from('attendance')
    .select('id')
    .eq('lesson_id', lesson.id)
    .eq('student_id', Number(student_id))
    .maybeSingle();

  if (existing) {
    await sb
      .from('attendance')
      .update({
        status,
        notes: notes || '',
        recorded_by: req.user!.id,
        recorded_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await insertRowSafe('attendance', {
      lesson_id: lesson.id,
      student_id: Number(student_id),
      status,
      notes: notes || '',
      recorded_by: req.user!.id,
      recorded_at: new Date().toISOString(),
    });
  }

  void broadcastRealtimeEvent('attendance:updated', {
    lesson_id: lesson.id,
    course_id: lesson.course_id,
    student_id: Number(student_id),
    status,
  });

  res.json({ ok: true });
}));

app.post('/api/teacher/exam-results', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const teacher = await getTeacherByProfile(req.user!.id);
  const { exam_id, student_id, score, feedback_ar, feedback_en } = req.body;
  const sb = requireSupabaseAdmin();
  const { data: exam } = await sb
    .from('exams')
    .select('id, course_id')
    .eq('id', Number(exam_id))
    .is('deleted_at', null)
    .maybeSingle();

  if (
    !teacher ||
    !exam ||
    !(await assertTeacherOwnsCourse(teacher.id, exam.course_id)) ||
    !(await assertTeacherTeachesStudent(teacher.id, Number(student_id), exam.course_id))
  ) {
    res.status(403).json({ error: 'Forbidden: cannot grade outside your courses' });
    return;
  }

  const { data: existing } = await sb
    .from('exam_results')
    .select('id')
    .eq('exam_id', exam.id)
    .eq('student_id', Number(student_id))
    .maybeSingle();

  if (existing) {
    await sb
      .from('exam_results')
      .update({
        score: Number(score),
        feedback_ar: feedback_ar || '',
        feedback_en: feedback_en || '',
        graded_by: req.user!.id,
        graded_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await insertRowSafe('exam_results', {
      exam_id: exam.id,
      student_id: Number(student_id),
      score: Number(score),
      feedback_ar: feedback_ar || '',
      feedback_en: feedback_en || '',
      graded_by: req.user!.id,
      graded_at: new Date().toISOString(),
    });
  }

  void broadcastRealtimeEvent('academic:updated', {
    kind: 'exam_result',
    exam_id: exam.id,
    student_id: Number(student_id),
  });

  res.json({ ok: true });
}));

app.post('/api/teacher/recitations', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const teacher = await getTeacherByProfile(req.user!.id);
  const { student_id, course_id, surah_name, ayah_from, ayah_to, tajweed_score, memorization_score, notes_ar } = req.body;

  if (
    !teacher ||
    !(await assertTeacherOwnsCourse(teacher.id, Number(course_id))) ||
    !(await assertTeacherTeachesStudent(teacher.id, Number(student_id), Number(course_id)))
  ) {
    res.status(403).json({ error: 'Forbidden: student not in your course' });
    return;
  }

  const inserted = await insertRowSafe<{ id: number }>('recitations', {
    student_id: Number(student_id),
    course_id: Number(course_id),
    surah_name,
    ayah_from: Number(ayah_from),
    ayah_to: Number(ayah_to),
    tajweed_score: Number(tajweed_score),
    memorization_score: Number(memorization_score),
    notes_ar: notes_ar || '',
    recorded_by: req.user!.id,
  });

  void broadcastRealtimeEvent('academic:updated', {
    kind: 'recitation',
    recitation_id: inserted.id,
    student_id: Number(student_id),
    course_id: Number(course_id),
  });

  res.status(201).json({ id: inserted.id });
}));

app.post('/api/teacher/evaluations', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const teacher = await getTeacherByProfile(req.user!.id);
  const { student_id, course_id, period, behavior_score, participation_score, summary_ar, summary_en } = req.body;

  if (
    !teacher ||
    !(await assertTeacherOwnsCourse(teacher.id, Number(course_id))) ||
    !(await assertTeacherTeachesStudent(teacher.id, Number(student_id), Number(course_id)))
  ) {
    res.status(403).json({ error: 'Forbidden: student not in your course' });
    return;
  }

  const inserted = await insertRowSafe<{ id: number }>('evaluations', {
    student_id: Number(student_id),
    course_id: Number(course_id),
    period,
    behavior_score: Number(behavior_score),
    participation_score: Number(participation_score),
    summary_ar,
    summary_en: summary_en || summary_ar,
    evaluated_by: req.user!.id,
  });

  void broadcastRealtimeEvent('academic:updated', {
    kind: 'evaluation',
    evaluation_id: inserted.id,
    student_id: Number(student_id),
    course_id: Number(course_id),
  });

  res.status(201).json({ id: inserted.id });
}));

app.put('/api/teacher/payout-details', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const teacher = await getTeacherByProfile(req.user!.id);
  if (!teacher) {
    res.status(404).json({ error: 'Teacher not found' });
    return;
  }
  const { account_holder_name, bank_name, iban } = req.body as { account_holder_name: string; bank_name: string; iban: string };
  if (!account_holder_name || !bank_name || !iban || iban.trim().length < 10) {
    res.status(400).json({ error: 'Valid account holder, bank name, and IBAN are required (no card numbers or CVV)' });
    return;
  }
  if (/^\d{13,19}$/.test(iban.replace(/\s+/g, ''))) {
    res.status(400).json({ error: 'Card numbers are prohibited. Please enter a valid IBAN starting with country letters.' });
    return;
  }

  const cleanIban = iban.trim().toUpperCase();
  const sb = requireSupabaseAdmin();
  const { data: existing } = await sb.from('teacher_payout_details').select('id').eq('teacher_id', teacher.id).maybeSingle();

  if (existing) {
    await sb
      .from('teacher_payout_details')
      .update({
        account_holder_name: account_holder_name.trim(),
        bank_name: bank_name.trim(),
        iban: cleanIban,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await insertRowSafe('teacher_payout_details', {
      teacher_id: teacher.id,
      account_holder_name: account_holder_name.trim(),
      bank_name: bank_name.trim(),
      iban: cleanIban,
      updated_at: new Date().toISOString(),
    });
  }

  res.json({ masked_iban: maskIban(cleanIban) });
}));

// ============================================================================
// ADMIN ROUTES (Strictly role === 'admin')
// ============================================================================
app.get('/api/admin/dashboard', authenticate, requireRole('admin'), asyncHandler(async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const [
    profilesRes,
    levelsRes,
    teachersRes,
    studentsRes,
    coursesRes,
    lessonsRes,
    lessonLinksRes,
    enrollmentsRes,
    admissionsRes,
    announcementsRes,
    examsRes,
    certificatesRes,
    payrollRes,
    payoutDetailsRes,
    gamesRes,
    legalRes,
    auditLogsRes,
  ] = await Promise.all([
    sb.from('profiles').select('id, email, full_name, role, is_active, created_at').is('deleted_at', null).order('created_at', { ascending: true }),
    sb.from('levels').select('*').order('order_index', { ascending: true }),
    sb.from('teachers').select('*').is('deleted_at', null).order('id', { ascending: true }),
    sb
      .from('students')
      .select('*, levels(name_ar, name_en), guardians(full_name, phone, email), profiles(email)')
      .is('deleted_at', null)
      .order('id', { ascending: false }),
    sb
      .from('courses')
      .select('*, levels(name_ar), teachers(name_ar)')
      .is('deleted_at', null)
      .order('id', { ascending: false }),
    sb
      .from('lessons')
      .select('*, courses(title_ar)')
      .is('deleted_at', null)
      .order('lesson_date', { ascending: false }),
    sb.from('lesson_links').select('*'),
    sb
      .from('enrollments')
      .select('*, students(full_name_ar), courses(title_ar)')
      .is('deleted_at', null),
    sb
      .from('admission_requests')
      .select('*, courses(title_ar), levels(name_ar)')
      .order('created_at', { ascending: false }),
    sb
      .from('announcements')
      .select('*, courses(title_ar)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    sb
      .from('exams')
      .select('*, courses(title_ar)')
      .is('deleted_at', null)
      .order('exam_date', { ascending: false }),
    sb
      .from('certificates')
      .select('*, students(full_name_ar), courses(title_ar)')
      .order('issued_at', { ascending: false }),
    sb
      .from('payroll')
      .select('*, teachers(name_ar)')
      .order('month_year', { ascending: false })
      .order('id', { ascending: false }),
    sb.from('teacher_payout_details').select('teacher_id, bank_name, iban'),
    sb.from('games').select('*').order('id', { ascending: true }),
    sb.from('legal_documents').select('*').order('id', { ascending: true }),
    sb.from('audit_logs').select('*').order('id', { ascending: false }).limit(100),
  ]);

  const students = (studentsRes.data || []).map((s: Record<string, unknown>) => {
    const l = s.levels as { name_ar?: string; name_en?: string } | null;
    const g = s.guardians as { full_name?: string; phone?: string; email?: string } | null;
    const p = s.profiles as { email?: string } | null;
    const { levels: _l, guardians: _g, profiles: _p, ...rest } = s;
    return {
      ...rest,
      level_name_ar: l?.name_ar ?? null,
      level_name_en: l?.name_en ?? null,
      guardian_name: g?.full_name ?? null,
      guardian_phone: g?.phone ?? null,
      guardian_email: g?.email ?? null,
      student_email: p?.email ?? null,
    };
  });

  const courses = (coursesRes.data || []).map((c: Record<string, unknown>) => {
    const l = c.levels as { name_ar?: string } | null;
    const t = c.teachers as { name_ar?: string } | null;
    const { levels: _l, teachers: _t, ...rest } = c;
    return { ...rest, level_name_ar: l?.name_ar ?? null, teacher_name_ar: t?.name_ar ?? null };
  });

  const lessons = (lessonsRes.data || []).map((l: Record<string, unknown>) => {
    const c = l.courses as { title_ar?: string } | null;
    const { courses: _c, ...rest } = l;
    return { ...rest, course_title_ar: c?.title_ar ?? null };
  });

  const enrollments = (enrollmentsRes.data || []).map((e: Record<string, unknown>) => {
    const s = e.students as { full_name_ar?: string } | null;
    const c = e.courses as { title_ar?: string } | null;
    const { students: _s, courses: _c, ...rest } = e;
    return { ...rest, student_name_ar: s?.full_name_ar ?? null, course_title_ar: c?.title_ar ?? null };
  });

  const admissionRequests = (admissionsRes.data || []).map((ar: Record<string, unknown>) => {
    const c = ar.courses as { title_ar?: string } | null;
    const l = ar.levels as { name_ar?: string } | null;
    const { courses: _c, levels: _l, ...rest } = ar;
    return { ...rest, course_title_ar: c?.title_ar ?? null, level_name_ar: l?.name_ar ?? null };
  });

  const announcements = (announcementsRes.data || []).map((a: Record<string, unknown>) => {
    const c = a.courses as { title_ar?: string } | null;
    const { courses: _c, ...rest } = a;
    return { ...rest, course_title_ar: c?.title_ar ?? null };
  });

  const exams = (examsRes.data || []).map((ex: Record<string, unknown>) => {
    const c = ex.courses as { title_ar?: string } | null;
    const { courses: _c, ...rest } = ex;
    return { ...rest, course_title_ar: c?.title_ar ?? null };
  });

  const certificates = (certificatesRes.data || []).map((cert: Record<string, unknown>) => {
    const s = cert.students as { full_name_ar?: string } | null;
    const c = cert.courses as { title_ar?: string } | null;
    const { students: _s, courses: _c, ...rest } = cert;
    return { ...rest, student_name_ar: s?.full_name_ar ?? null, course_title_ar: c?.title_ar ?? null };
  });

  const payoutMap = new Map<number, { bank_name: string; iban: string }>();
  for (const pd of payoutDetailsRes.data || []) {
    const row = pd as { teacher_id: number; bank_name: string; iban: string };
    payoutMap.set(Number(row.teacher_id), { bank_name: row.bank_name, iban: row.iban });
  }

  const payroll = (payrollRes.data || []).map((p: Record<string, unknown>) => {
    const t = p.teachers as { name_ar?: string } | null;
    const pd = payoutMap.get(Number(p.teacher_id));
    const { teachers: _t, ...rest } = p;
    return {
      ...rest,
      teacher_name_ar: t?.name_ar ?? null,
      bank_name: pd?.bank_name ?? null,
      masked_iban: pd?.iban ? maskIban(pd.iban) : null,
    };
  });

  res.json({
    profiles: profilesRes.data || [],
    levels: levelsRes.data || [],
    teachers: teachersRes.data || [],
    students,
    courses,
    lessons,
    lessonLinks: lessonLinksRes.data || [],
    enrollments,
    admissionRequests,
    announcements,
    exams,
    certificates,
    payroll,
    games: gamesRes.data || [],
    legal: legalRes.data || [],
    auditLogs: auditLogsRes.data || [],
  });
}));

app.post('/api/admin/courses', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const { title_ar, title_en, description_ar, description_en, level_id, teacher_id, schedule_ar, schedule_en, price_monthly, capacity } = req.body;
  const inserted = await insertRowSafe<{ id: number }>('courses', {
    title_ar,
    title_en: title_en || title_ar,
    description_ar,
    description_en: description_en || description_ar,
    level_id: Number(level_id),
    teacher_id: Number(teacher_id),
    schedule_ar,
    schedule_en: schedule_en || schedule_ar,
    price_monthly: Number(price_monthly),
    capacity: Number(capacity || 10),
    is_featured: true,
  });

  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_COURSE', 'course', inserted.id, { title_ar });
  res.status(201).json({ id: inserted.id });
}));

app.delete('/api/admin/courses/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = Number(req.params.id);
  const sb = requireSupabaseAdmin();
  await sb.from('courses').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'SOFT_DELETE_COURSE', 'course', id, {});
  res.json({ ok: true });
}));

app.post('/api/admin/lessons', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const { course_id, title_ar, title_en, lesson_date, start_time, duration_min, objectives_ar, objectives_en, live_url } = req.body;
  const lesson = await insertRowSafe<{ id: number }>('lessons', {
    course_id: Number(course_id),
    title_ar,
    title_en: title_en || title_ar,
    lesson_date,
    start_time,
    duration_min: Number(duration_min || 45),
    objectives_ar: objectives_ar || '',
    objectives_en: objectives_en || '',
  });

  if (live_url) {
    await insertRowSafe('lesson_links', {
      lesson_id: lesson.id,
      title_ar: 'رابط الحصة المباشرة',
      title_en: 'Live Session Link',
      url: live_url,
      link_type: 'zoom',
    });
  }
  res.status(201).json({ id: lesson.id });
}));

app.delete('/api/admin/lessons/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = Number(req.params.id);
  const sb = requireSupabaseAdmin();
  await sb.from('lessons').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'SOFT_DELETE_LESSON', 'lesson', id, {});
  res.json({ ok: true });
}));

app.post('/api/admin/teachers', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const { email, name_ar, name_en, bio_ar, bio_en, qualifications_ar, qualifications_en, specialty_ar, specialty_en, hourly_rate } = req.body;
  if (!email || !name_ar) {
    res.status(400).json({ error: 'Teacher email and Arabic name are required' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = String(name_ar).trim();
  const tempPassword = generateTempPassword();
  const sb = requireSupabaseAdmin();

  const { user } = await provisionSupabaseAuthUser(cleanEmail, tempPassword, cleanName, 'teacher');
  const { error: pErr } = await sb.from('profiles').upsert(
    {
      id: user.id,
      email: cleanEmail,
      full_name: cleanName,
      role: 'teacher',
      is_active: true,
      preferred_lang: 'ar',
    },
    { onConflict: 'id' }
  );
  if (pErr) {
    res.status(500).json({ error: pErr.message });
    return;
  }

  const teacher = await insertRowSafe<{ id: number }>('teachers', {
    profile_id: user.id,
    name_ar: cleanName,
    name_en: name_en || cleanName,
    bio_ar: bio_ar || '',
    bio_en: bio_en || '',
    qualifications_ar: qualifications_ar || '',
    qualifications_en: qualifications_en || '',
    specialty_ar: specialty_ar || '',
    specialty_en: specialty_en || '',
    avatar_url: '/assets/images/teacher_portrait_1.webp',
    hourly_rate: Number(hourly_rate || 180),
  });

  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_TEACHER', 'teacher', teacher.id, { email: cleanEmail, name_ar: cleanName });
  res.status(201).json({ id: teacher.id, temporary_password: tempPassword });
}));

app.delete('/api/admin/teachers/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = Number(req.params.id);
  const sb = requireSupabaseAdmin();
  await sb.from('teachers').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'SOFT_DELETE_TEACHER', 'teacher', id, {});
  res.json({ ok: true });
}));

app.post('/api/admin/students', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const { email, full_name_ar, full_name_en, age, level_id, guardian_name, guardian_phone, guardian_email, course_id } = req.body;
  if (!email || !full_name_ar || !age) {
    res.status(400).json({ error: 'Student email, name, and age are required' });
    return;
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanName = String(full_name_ar).trim();
  const tempPassword = generateTempPassword();
  const sb = requireSupabaseAdmin();

  const { user } = await provisionSupabaseAuthUser(cleanEmail, tempPassword, cleanName, 'student');
  const { error: pErr } = await sb.from('profiles').upsert(
    {
      id: user.id,
      email: cleanEmail,
      full_name: cleanName,
      role: 'student',
      is_active: true,
      preferred_lang: 'ar',
    },
    { onConflict: 'id' }
  );
  if (pErr) {
    res.status(500).json({ error: pErr.message });
    return;
  }

  const guardian = await insertRowSafe<{ id: number }>('guardians', {
    full_name: guardian_name || 'ولي أمر',
    phone: guardian_phone || '',
    email: guardian_email || cleanEmail,
    relation: 'ولي أمر',
  });

  const code = await generateUniqueStudentCode();
  const student = await insertRowSafe<{ id: number }>('students', {
    profile_id: user.id,
    guardian_id: guardian.id,
    student_code: code,
    full_name_ar: cleanName,
    full_name_en: full_name_en || cleanName,
    age: Number(age),
    level_id: Number(level_id || 1),
    status: 'active',
  });

  if (course_id) {
    await insertRowSafe('enrollments', {
      student_id: student.id,
      course_id: Number(course_id),
      status: 'active',
    });
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_STUDENT', 'student', student.id, { email: cleanEmail, full_name_ar: cleanName });
  res.status(201).json({ id: student.id, student_code: code, temporary_password: tempPassword });
}));

app.patch('/api/admin/students/:id/level', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = Number(req.params.id);
  const { level_id } = req.body;
  const sb = requireSupabaseAdmin();
  await sb.from('students').update({ level_id: Number(level_id) }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_STUDENT_LEVEL', 'student', id, { level_id });
  res.json({ ok: true });
}));

app.delete('/api/admin/students/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = Number(req.params.id);
  const sb = requireSupabaseAdmin();
  await sb.from('students').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'SOFT_DELETE_STUDENT', 'student', id, {});
  res.json({ ok: true });
}));

app.post('/api/admin/enrollments', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const studentId = Number(req.body.student_id);
  const courseId = Number(req.body.course_id);
  const sb = requireSupabaseAdmin();

  const { data: existing } = await sb
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .eq('course_id', courseId)
    .maybeSingle();

  if (existing) {
    await sb.from('enrollments').update({ status: 'active', deleted_at: null }).eq('id', existing.id);
  } else {
    await insertRowSafe('enrollments', { student_id: studentId, course_id: courseId, status: 'active' });
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, 'ENROLL_STUDENT', 'enrollment', `${studentId}-${courseId}`, {
    student_id: studentId,
    course_id: courseId,
  });
  res.status(201).json({ ok: true });
}));

app.post('/api/admin/admissions/:id/decision', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = Number(req.params.id);
  const { decision, student_email } = req.body as { decision: 'approved' | 'rejected'; student_email?: string };
  const sb = requireSupabaseAdmin();

  const { data: reqRow } = await sb.from('admission_requests').select('*').eq('id', id).maybeSingle();
  if (!reqRow) {
    res.status(404).json({ error: 'Admission request not found' });
    return;
  }

  await sb.from('admission_requests').update({ status: decision, reviewed_by: req.user!.id }).eq('id', id);

  let tempPassword: string | undefined;

  if (decision === 'approved') {
    const emailToUse = (student_email || `student.${id}@noorbayan.academy`).trim().toLowerCase();
    const { data: existingProfile } = await sb.from('profiles').select('id').ilike('email', emailToUse).maybeSingle();

    let profileId: string;
    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      tempPassword = generateTempPassword();
      const { user } = await provisionSupabaseAuthUser(emailToUse, tempPassword, reqRow.student_name, 'student');
      profileId = user.id;
      await sb.from('profiles').upsert(
        {
          id: profileId,
          email: emailToUse,
          full_name: reqRow.student_name,
          role: 'student',
          is_active: true,
          preferred_lang: 'ar',
        },
        { onConflict: 'id' }
      );
    }

    const guardian = await insertRowSafe<{ id: number }>('guardians', {
      full_name: reqRow.guardian_name,
      phone: reqRow.guardian_phone,
      email: reqRow.guardian_email,
    });

    const code = await generateUniqueStudentCode();
    const student = await insertRowSafe<{ id: number }>('students', {
      profile_id: profileId,
      guardian_id: guardian.id,
      student_code: code,
      full_name_ar: reqRow.student_name,
      full_name_en: reqRow.student_name,
      age: reqRow.student_age,
      level_id: reqRow.recommended_level_id || 1,
      status: 'active',
    });

    if (reqRow.preferred_course_id) {
      const { data: existingEnroll } = await sb
        .from('enrollments')
        .select('id')
        .eq('student_id', student.id)
        .eq('course_id', reqRow.preferred_course_id)
        .maybeSingle();
      if (!existingEnroll) {
        await insertRowSafe('enrollments', {
          student_id: student.id,
          course_id: reqRow.preferred_course_id,
          status: 'active',
        });
      }
    }

    await insertRowSafe('notifications', {
      profile_id: profileId,
      title_ar: 'أهلاً بك في أكاديمية نور وبيان',
      title_en: 'Welcome to Noor & Bayan Academy',
      body_ar: 'تم قبول طلب انضمامك وتفعيل حسابك بنجاح.',
      body_en: 'Your admission request has been approved.',
    });
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, `ADMISSION_${decision.toUpperCase()}`, 'admission_request', id, {
    student_name: reqRow.student_name,
  });
  res.json({ ok: true, ...(tempPassword ? { temporary_password: tempPassword } : {}) });
}));

app.post('/api/admin/announcements', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const { title_ar, title_en, body_ar, body_en, target_scope, target_course_id, student_ids } = req.body as {
    title_ar: string;
    title_en?: string;
    body_ar: string;
    body_en?: string;
    target_scope: 'all_students' | 'course' | 'specific_students';
    target_course_id?: number;
    student_ids?: number[];
  };
  const sb = requireSupabaseAdmin();

  const ann = await insertRowSafe<{ id: number }>('announcements', {
    title_ar,
    title_en: title_en || title_ar,
    body_ar,
    body_en: body_en || body_ar,
    target_scope,
    target_course_id: target_course_id ? Number(target_course_id) : null,
    created_by: req.user!.id,
  });

  if (target_scope === 'specific_students' && Array.isArray(student_ids) && student_ids.length) {
    for (const sid of student_ids) {
      await insertRowSafe('announcement_targets', { announcement_id: ann.id, student_id: Number(sid) });
    }
  }

  let targetProfileIds: string[] = [];
  if (target_scope === 'all_students') {
    const { data } = await sb.from('students').select('profile_id').not('profile_id', 'is', null).is('deleted_at', null);
    targetProfileIds = (data || []).map((r: { profile_id: string }) => r.profile_id);
  } else if (target_scope === 'course' && target_course_id) {
    const { data } = await sb
      .from('enrollments')
      .select('students!inner(profile_id, deleted_at)')
      .eq('course_id', Number(target_course_id))
      .is('deleted_at', null)
      .is('students.deleted_at', null);
    const set = new Set<string>();
    for (const row of data || []) {
      const s = (row as { students?: { profile_id?: string | null } }).students;
      if (s?.profile_id) set.add(s.profile_id);
    }
    targetProfileIds = Array.from(set);
  } else if (target_scope === 'specific_students' && Array.isArray(student_ids) && student_ids.length) {
    const { data } = await sb
      .from('students')
      .select('profile_id')
      .in('id', student_ids.map(Number))
      .not('profile_id', 'is', null);
    targetProfileIds = (data || []).map((r: { profile_id: string }) => r.profile_id);
  }

  for (const pid of targetProfileIds) {
    await insertRowSafe('notifications', {
      profile_id: pid,
      title_ar,
      title_en: title_en || title_ar,
      body_ar,
      body_en: body_en || body_ar,
    });
  }

  void broadcastRealtimeEvent('notification:created', {
    announcementId: ann.id,
    targetProfileIds,
    title_ar,
    title_en: title_en || title_ar,
  });

  res.status(201).json({ id: ann.id });
}));

app.post('/api/admin/exams', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const { course_id, title_ar, title_en, exam_date, max_score } = req.body;
  const inserted = await insertRowSafe<{ id: number }>('exams', {
    course_id: Number(course_id),
    title_ar,
    title_en: title_en || title_ar,
    exam_date,
    max_score: Number(max_score || 100),
  });
  res.status(201).json({ id: inserted.id });
}));

app.post('/api/admin/certificates', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const { student_id, course_id, title_ar, title_en, grade_label } = req.body;
  const code = generateCertificateCode();
  const inserted = await insertRowSafe<{ id: number }>('certificates', {
    verification_code: code,
    student_id: Number(student_id),
    course_id: Number(course_id),
    title_ar,
    title_en: title_en || title_ar,
    grade_label,
    issued_by: req.user!.id,
  });

  await writeAuditLog(req.user!.id, req.user!.full_name, 'ISSUE_CERTIFICATE', 'certificate', inserted.id, {
    code,
    student_id,
    course_id,
  });
  void broadcastRealtimeEvent('academic:updated', {
    kind: 'certificate',
    student_id: Number(student_id),
    verification_code: code,
  });
  res.status(201).json({ id: inserted.id, verification_code: code });
}));

app.post('/api/admin/certificates/:id/revoke', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = Number(req.params.id);
  const sb = requireSupabaseAdmin();
  await sb.from('certificates').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'REVOKE_CERTIFICATE', 'certificate', id, {});
  res.json({ ok: true });
}));

app.post('/api/admin/payroll', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const { teacher_id, month_year, base_amount, bonus_amount, deduction_amount } = req.body;
  const net = Number(base_amount) + Number(bonus_amount || 0) - Number(deduction_amount || 0);
  const inserted = await insertRowSafe<{ id: number }>('payroll', {
    teacher_id: Number(teacher_id),
    month_year,
    base_amount: Number(base_amount),
    bonus_amount: Number(bonus_amount || 0),
    deduction_amount: Number(deduction_amount || 0),
    net_amount: net,
    status: 'pending',
    created_by: req.user!.id,
  }).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('duplicate key') || message.includes('payroll_teacher_id_month_year_key')) {
      throw new AppError(409, 'Duplicate payroll: this teacher already has a payroll record for this month.');
    }
    throw err;
  });

  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_PAYROLL', 'payroll', inserted.id, { teacher_id, month_year, net });
  res.status(201).json({ id: inserted.id });
}));

app.patch('/api/admin/payroll/:id/pay', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = Number(req.params.id);
  const sb = requireSupabaseAdmin();
  await sb.from('payroll').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'MARK_PAYROLL_PAID', 'payroll', id, {});
  res.json({ ok: true });
}));

app.put('/api/admin/legal/:docType', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const docType = String(req.params.docType);
  const { version, title_ar, title_en, content_ar, content_en } = req.body;
  const sb = requireSupabaseAdmin();
  await sb
    .from('legal_documents')
    .update({
      version: version || '1.1',
      title_ar,
      title_en,
      content_ar,
      content_en,
      updated_at: new Date().toISOString(),
    })
    .eq('doc_type', docType);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_LEGAL_DOC', 'legal_document', docType, { version });
  res.json({ ok: true });
}));

app.patch('/api/admin/users/:id/role', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = String(req.params.id);
  const { role, is_active } = req.body as { role?: 'student' | 'teacher' | 'admin' | 'guardian'; is_active?: boolean | number };
  const sb = requireSupabaseAdmin();

  const { data: target } = await sb.from('profiles').select('id, email, full_name, role, is_active').eq('id', id).maybeSingle();
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const newRole = role || target.role;
  const newActive = is_active !== undefined ? Boolean(is_active) : target.is_active;

  await sb.from('profiles').update({ role: newRole, is_active: newActive }).eq('id', id);
  await sb.auth.admin.updateUserById(id, { user_metadata: { full_name: target.full_name, role: newRole } });
  await writeAuditLog(req.user!.id, req.user!.full_name, 'CHANGE_USER_ROLE', 'profile', id, {
    from: target.role,
    to: newRole,
    is_active: newActive,
  });
  res.json({ ok: true });
}));

app.get('/api/admin/supabase-schema', authenticate, requireRole('admin'), (_req, res) => {
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase_schema.sql'), 'utf8');
  res.json({ sql });
});

app.get('/api/admin/launch-status', authenticate, requireRole('admin'), asyncHandler(async (_req, res) => {
  const health = await getSupabaseLiveHealth();
  res.json(health);
}));

app.post('/api/admin/supabase/sync-users', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const { data: profiles } = await sb
    .from('profiles')
    .select('email, full_name, role')
    .is('deleted_at', null)
    .eq('is_active', true);
  const result = await syncUsersToSupabaseAuth((profiles || []) as Array<{ email: string; full_name: string; role: string }>).catch(
    (err: unknown) => {
      throw new AppError(502, err instanceof Error ? err.message : 'Supabase sync failed');
    }
  );
  await writeAuditLog(req.user!.id, req.user!.full_name, 'SYNC_SUPABASE_AUTH', 'supabase', 'auth', result);
  res.json(result);
}));

// Unmatched API endpoints return structured JSON 404 instead of SPA HTML
app.use('/api', apiNotFoundHandler);

// ============================================================================
// VITE DEV / PRODUCTION STATIC MOUNT + GLOBAL ERROR MIDDLEWARE + GRACEFUL SHUTDOWN
// ============================================================================
async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  let viteServer: ViteDevServer | null = null;

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    viteServer = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      console.warn('[hosting] dist/index.html not found — run "npm run build" before starting in production.');
    }

    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      if (!fs.existsSync(indexHtmlPath)) {
        res.status(503).json({ error: 'Frontend build missing. Run npm run build first.' });
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtmlPath);
    });
  }

  // Global Error Handling Middleware (always registered last)
  app.use(globalErrorHandler);

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Noor & Bayan Academy (Supabase PostgreSQL, ${IS_PRODUCTION ? 'production' : 'development'}) running on http://0.0.0.0:${PORT}`
    );
  });

  const gracefulShutdown = async (signal: string, exitCode = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[shutdown] Received ${signal}. Closing HTTP server gracefully...`);

    const forceTimer = setTimeout(() => {
      console.error('[shutdown] Timed out closing active connections — forcing exit.');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    httpServer.close(async (closeErr) => {
      if (closeErr) {
        console.error('[shutdown] HTTP close error:', closeErr.message);
      }
      if (viteServer) {
        try {
          await viteServer.close();
        } catch (viteErr) {
          console.warn('[shutdown] Vite close warning:', viteErr);
        }
      }
      clearTimeout(forceTimer);
      console.log('[shutdown] Clean exit complete.');
      process.exit(exitCode);
    });
    httpServer.closeIdleConnections?.();
  };

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT', 0);
  });
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM', 0);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[process] Unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[process] Uncaught exception:', err);
    void gracefulShutdown('uncaughtException', 1);
  });
}

void startServer();
