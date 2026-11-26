import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import type { ViteDevServer } from 'vite';
import {
  getSupabaseAdmin,
  requireSupabaseAdmin,
  createEphemeralSupabaseAnon,
  insertRowSafe,
  getSupabaseLiveHealth,
  pingSupabaseDatabase,
  findSupabaseAuthUserByEmail,
  verifyVerifiedGoogleToken,
  provisionSupabaseAuthUser,
  syncUsersToSupabaseAuth,
  requestSupabasePasswordReset,
  requestSupabaseSignupConfirmation,
  broadcastRealtimeEvent,
  verifyTurnstileToken,
} from './server/supabaseClient.ts';
import { AppError, asyncHandler, apiNotFoundHandler, globalErrorHandler } from './server/errorHandler.ts';
import {
  saveAdmissionMeta,
  getAdmissionMeta,
  listAdmissionMetas,
  deleteAdmissionMeta,
  deleteAdmissionMetasBatch,
  generateApplicationId,
  saveTeacherApplication,
  getTeacherApplication,
  listTeacherApplications,
  deleteTeacherApplication,
  deleteTeacherApplicationsBatch,
  saveGuardianRequest,
  getGuardianRequest,
  listGuardianRequests,
  deleteGuardianRequest,
  deleteGuardianRequestsBatch,
  hashVaultPassword,
  verifyVaultPassword,
  saveGuardianAuth,
  getGuardianAuth,
  deleteGuardianAuth,
  listGuardianAuths,
  deletePendingAuthProfileIfSafe,
  saveCourseMeta,
  getCourseMeta,
  deleteCourseMeta,
  listCourseMetas,
  uploadCourseCoverFile,
  removeCourseCoverFile,
  readCourseCoverFile,
  saveLessonMeta,
  getLessonMeta,
  deleteLessonMeta,
  listLessonMetas,
  saveTeacherPhone,
  listTeacherPhones,
  deleteTeacherPhone,
  type LessonMetaRecord,
} from './server/applicationVault.ts';
import {
  getExamVaultConfig,
  saveExamVaultConfig,
  getExamSubmission,
  saveExamSubmission,
  getExamAttempt,
  saveExamAttempt,
  claimExamAttemptForSubmit,
  releaseExamAttemptClaim,
  deleteExamSubmissionRecord,
  deleteExamDataForStudent,
  deleteExamVaultData,
  listExamSubmissionsForExam,
  countExamSubmissionFiles,
  uploadExamBinaryFile,
  createExamSignedUrl,
  removeExamBinaryFile,
  isExamAvailableYet,
  isExamPastDeadline,
  sanitizeExamConfigForViewer,
  sanitizeSubmissionForViewer,
  invalidateExamCache,
  type ExamVaultConfig,
  type ExamSubmissionRecord,
  type QuizQuestionConfig,
} from './server/examVault.ts';
import {
  listAllComments,
  getCommentById,
  saveComment,
  deleteCommentRecord,
  sanitizeCommentForPublic,
  listAllSuggestions,
  getSuggestionById,
  saveSuggestion,
  deleteSuggestionRecord,
  sanitizeSuggestionForPublic,
  getPlacementTestConfig,
  savePlacementTestConfig,
  sanitizePlacementConfigForPublic,
  generateRecordId,
} from './server/communityVault.ts';

dotenv.config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REQUIRE_EMAIL_VERIFICATION = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
const OFFICIAL_SITE_URL = 'https://noorwbayan-academy.com';
const OFFICIAL_CONTACT_EMAIL = 'care@noorwbayan-academy.com';

function normalizeLegacyDomainText(value: string): string {
  if (!value) return value;
  return value
    .replace(/care@noorbayan\.academy/gi, OFFICIAL_CONTACT_EMAIL)
    .replace(/noorwbayan558@gmail\.com/gi, OFFICIAL_CONTACT_EMAIL)
    .replace(/https?:\/\/(?:[a-z0-9-]+\.)?noorwbayan-academy\.up\.railway\.app/gi, OFFICIAL_SITE_URL)
    .replace(/https?:\/\/(?:www\.)?noorbayan\.academy/gi, OFFICIAL_SITE_URL)
    .replace(/\b(?:[a-z0-9-]+\.)?noorwbayan-academy\.up\.railway\.app\b/gi, 'noorwbayan-academy.com')
    .replace(/\b(?:www\.)?noorbayan\.academy\b/gi, 'noorwbayan-academy.com');
}

if (IS_PRODUCTION && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24)) {
  throw new Error('FATAL: SESSION_SECRET environment variable (min 24 chars) is required in production.');
}

const configuredAppUrl = process.env.APP_URL?.trim();
if (IS_PRODUCTION && (!configuredAppUrl || configuredAppUrl === 'MY_APP_URL')) {
  throw new Error('FATAL: APP_URL environment variable is required in production and must not equal "MY_APP_URL".');
}

function sendInternalError(
  res: Response,
  logContext: string,
  err: unknown,
  genericMessage = 'Internal server error',
  status = 500
) {
  console.error(`[${logContext}]`, err);
  const detail = err instanceof Error ? err.message : (err as { message?: string } | null)?.message;
  res.status(status).json({
    error: IS_PRODUCTION ? genericMessage : detail || genericMessage,
  });
}

function parsePositiveIntParam(raw: unknown, label = 'ID'): number {
  const value = Number(String(raw ?? '').trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new AppError(400, `Invalid ${label}`);
  }
  return value;
}

const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[security] SESSION_SECRET not set — using ephemeral process secret for development.');
}

// Verify Supabase credentials at startup
requireSupabaseAdmin();

const app = express();
const parsedTrustProxyHops = Number.parseInt(String(process.env.TRUST_PROXY_HOPS ?? '1').trim(), 10);
const TRUST_PROXY_HOPS = Number.isInteger(parsedTrustProxyHops) && parsedTrustProxyHops >= 0 ? parsedTrustProxyHops : 1;
app.set('trust proxy', TRUST_PROXY_HOPS);
app.disable('x-powered-by');
const UPLOAD_JSON_SUFFIXES = ['/upload-material', '/question-file', '/submit-file', '/grade', '/cover'];
const defaultJsonParser = express.json({ limit: '256kb' });
const inFlightQuizSubmits = new Set<string>();
app.use((req, res, next) => {
  if (UPLOAD_JSON_SUFFIXES.some((suffix) => req.path.endsWith(suffix))) {
    next();
    return;
  }
  defaultJsonParser(req, res, next);
});

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
  [
    OFFICIAL_SITE_URL,
    'https://www.noorwbayan-academy.com',
    process.env.CORS_ALLOWED_ORIGINS || '',
    process.env.APP_URL || '',
  ]
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
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-CSRF-Token');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Explicit Origin, Fetch-Metadata & Double-Submit CSRF protection for state-changing /api requests
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
function resolveRequestExpectedOrigin(req: Request): string | null {
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  if (!host) return null;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

const AUTH_READONLY_MUTATION_PATHS = new Set([
  '/auth/login',
  '/auth/logout',
  '/auth/google-session',
  '/auth/forgot-password',
  '/auth/resend-confirmation',
]);

app.use('/api', (req, res, next) => {
  if (SAFE_HTTP_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const fetchSite = String(req.headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (fetchSite === 'cross-site') {
    res.status(403).json({ error: 'Forbidden: cross-site state-changing request rejected' });
    return;
  }

  const expectedOrigin = resolveRequestExpectedOrigin(req);
  const rawOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/+$/, '') : '';
  const rawReferer = typeof req.headers.referer === 'string' ? req.headers.referer.trim() : '';

  if (rawOrigin) {
    if (rawOrigin !== expectedOrigin && !allowedOrigins.has(rawOrigin)) {
      res.status(403).json({ error: 'Forbidden: invalid request origin' });
      return;
    }
  } else if (rawReferer) {
    try {
      const refOrigin = new URL(rawReferer).origin;
      if (refOrigin !== expectedOrigin && !allowedOrigins.has(refOrigin)) {
        res.status(403).json({ error: 'Forbidden: invalid request referer' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Forbidden: malformed referer' });
      return;
    }
  }

  // Enforce double-submit CSRF token whenever a mutating request authenticates via session cookie
  const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.slice(7).trim());
  const cookies = parseCookies(req.headers.cookie);
  if (!hasBearer && cookies[SESSION_COOKIE_NAME]) {
    const cookieCsrf = cookies[CSRF_COOKIE_NAME] || '';
    const headerCsrf = String(req.headers['x-csrf-token'] || '');
    const a = Buffer.from(cookieCsrf);
    const b = Buffer.from(headerCsrf);
    if (!cookieCsrf || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(403).json({ error: 'CSRF validation failed. Please refresh the page and try again.' });
      return;
    }
  }

  if (!AUTH_READONLY_MUTATION_PATHS.has(req.path)) {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        invalidateDashboardCaches();
      }
    });
  }

  next();
});

// Security Headers (including environment-aware Content Security Policy)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const turnstileEnabled = Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.VITE_TURNSTILE_SITE_KEY);
  const frameAncestors =
    IS_PRODUCTION && process.env.ALLOW_IFRAME_EMBED !== 'true'
      ? "'self'"
      : "'self' https://aistudio.google.com https://*.google.com";
  const connectSrc = IS_PRODUCTION
    ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co ws: wss:";
  const scriptSrc = turnstileEnabled
    ? "script-src 'self' https://challenges.cloudflare.com"
    : "script-src 'self'";
  const frameSrc = turnstileEnabled
    ? "frame-src 'self' https://challenges.cloudflare.com"
    : "frame-src 'self'";
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com",
      connectSrc,
      frameSrc,
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      `frame-ancestors ${frameAncestors}`,
    ].join('; ')
  );
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
function createRateLimiter(
  name: string,
  windowMs: number,
  maxRequests: number,
  keyExtractor?: (req: Request) => string
) {
  const buckets = new Map<string, number[]>();
  const MAX_BUCKETS = 5000;
  return (req: Request, res: Response, next: NextFunction) => {
    const rawKey = keyExtractor
      ? keyExtractor(req)
      : req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${name}:${rawKey}`;
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      buckets.set(key, recent);
      res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });
      return;
    }
    recent.push(now);
    buckets.delete(key);
    buckets.set(key, recent);
    if (buckets.size > MAX_BUCKETS) {
      for (const [bKey, timestamps] of buckets.entries()) {
        const active = timestamps.filter((ts) => now - ts < windowMs);
        if (active.length === 0) {
          buckets.delete(bKey);
        }
        if (buckets.size <= MAX_BUCKETS) break;
      }
      while (buckets.size > MAX_BUCKETS) {
        const oldestKey = buckets.keys().next().value;
        if (oldestKey === undefined) break;
        buckets.delete(oldestKey);
      }
    }
    next();
  };
}

const loginLimiter = createRateLimiter('login', 15 * 60 * 1000, 30);
const publicSubmitLimiter = createRateLimiter('public-submit', 15 * 60 * 1000, 15);
const verifyLimiter = createRateLimiter('verify', 15 * 60 * 1000, 40);
const guardianVerifyLimiter = createRateLimiter('guardian-verify', 15 * 60 * 1000, 6);
const examUploadLimiter = createRateLimiter('exam-upload', 15 * 60 * 1000, 25);
const communityWriteLimiter = createRateLimiter('community-write', 15 * 60 * 1000, 20);
const resendConfirmIpLimiter = createRateLimiter('resend-confirm-ip', 15 * 60 * 1000, 15);
const resendConfirmEmailLimiter = createRateLimiter('resend-confirm-email', 15 * 60 * 1000, 5, (req) => {
  const rawEmail = typeof (req.body as { email?: unknown } | undefined)?.email === 'string'
    ? (req.body as { email: string }).email.trim().toLowerCase()
    : '';
  return rawEmail || req.ip || req.socket.remoteAddress || 'unknown';
});

const RESEND_CONFIRM_COOLDOWN_MS = 60_000;
const resendConfirmationCooldownMap = new Map<string, number>();

async function sendSignupConfirmationIfNeeded(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  profileId: string,
  email: string,
  redirectTo: string
): Promise<{ alreadyConfirmed: boolean; emailSent: boolean }> {
  const { data: uData } = await sb.auth.admin.getUserById(profileId).catch(() => ({ data: { user: null } }));
  if (uData?.user?.email_confirmed_at) {
    return { alreadyConfirmed: true, emailSent: false };
  }
  const result = await requestSupabaseSignupConfirmation(email, redirectTo);
  if (!result.sent && result.reason) {
    console.warn('[auth] confirmation email delivery warning:', result.reason);
  }
  return { alreadyConfirmed: false, emailSent: result.sent };
}

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
  answers: z.array(z.number().int().min(0).max(5)).min(1).max(20),
});

const admissionSchema = z.object({
  student_name: z.string().trim().min(2).max(120),
  student_age: z.coerce.number().int().min(3).max(22),
  student_email: z.string().trim().email().max(160),
  student_password: z.string().min(8).max(128),
  guardian_name: z.string().trim().min(2).max(120),
  guardian_email: z.string().trim().email().max(160),
  guardian_phone: z.string().trim().min(6).max(32),
  preferred_course_id: z.coerce.number().int().positive().nullable().optional(),
  recommended_level_id: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
  consent_accepted: z.literal(true).or(z.literal(1)).or(z.boolean().refine((v) => v === true)),
  google_access_token: z.string().max(8192).optional(),
  turnstileToken: z.string().max(4096).optional(),
});

interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'student' | 'teacher' | 'admin' | 'guardian';
  is_active: boolean;
  preferred_lang: string;
  guardian_id?: number;
}

interface AuthRequest extends Request {
  user?: AuthUser;
}

const SESSION_COOKIE_NAME = 'nb_session';
const CSRF_COOKIE_NAME = 'nb_csrf';
const SESSION_TTL_SECONDS = 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const revokedTokens = new Map<string, number>();

function pruneRevokedTokens(now = Date.now()): void {
  for (const [jti, exp] of revokedTokens.entries()) {
    if (exp <= now) revokedTokens.delete(jti);
  }
  while (revokedTokens.size > 10_000) {
    const oldest = revokedTokens.keys().next().value;
    if (oldest === undefined) break;
    revokedTokens.delete(oldest);
  }
}

function revokeTokenJti(jti: string | undefined, exp: number): void {
  if (!jti) return;
  pruneRevokedTokens();
  revokedTokens.set(jti, exp);
}

function parseCookies(header?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function extractRequestToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function issueCsrfCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const csrfParts = [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isHttps) csrfParts.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const prev = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  res.setHeader('Set-Cookie', [...prev, csrfParts.join('; ')]);
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sessionParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isHttps) sessionParts.push('Secure');

  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const csrfParts = [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isHttps) csrfParts.push('Secure');

  res.setHeader('Set-Cookie', [sessionParts.join('; '), csrfParts.join('; ')]);
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const sessionParts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  const csrfParts = [
    `${CSRF_COOKIE_NAME}=`,
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isHttps) {
    sessionParts.push('Secure');
    csrfParts.push('Secure');
  }
  res.setHeader('Set-Cookie', [sessionParts.join('; '), csrfParts.join('; ')]);
}

function signToken(payload: { id: string; role: string; guardianId?: number; tv?: number; exp: number; jti?: string }): string {
  const tokenPayload = { ...payload, jti: payload.jti || crypto.randomUUID() };
  const data = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): { id: string; role: string; guardianId?: number; tv?: number; exp: number; jti?: string } | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
      id?: string;
      role?: string;
      guardianId?: number;
      tv?: number;
      exp?: number;
      jti?: string;
    };
    if (!parsed?.id || !parsed.exp || parsed.exp < Date.now()) return null;
    if (parsed.jti && revokedTokens.has(parsed.jti)) {
      const exp = revokedTokens.get(parsed.jti)!;
      if (exp > Date.now()) return null;
      revokedTokens.delete(parsed.jti);
    }
    return parsed as { id: string; role: string; guardianId?: number; tv?: number; exp: number; jti?: string };
  } catch {
    return null;
  }
}

const IBAN_LEGACY_AES_KEY = crypto
  .createHash('sha256')
  .update(`nb-iban:${TOKEN_SECRET}`)
  .digest();
const IBAN_CURRENT_RAW = process.env.IBAN_ENCRYPTION_KEY?.trim() || '';
const IBAN_PREVIOUS_RAW = process.env.IBAN_ENCRYPTION_KEY_PREVIOUS?.trim() || '';

const IBAN_AES_KEY = IBAN_CURRENT_RAW
  ? crypto.createHash('sha256').update(IBAN_CURRENT_RAW).digest()
  : IBAN_LEGACY_AES_KEY;
const IBAN_PREVIOUS_AES_KEY = IBAN_PREVIOUS_RAW
  ? crypto.createHash('sha256').update(IBAN_PREVIOUS_RAW).digest()
  : null;

function ibanKeyId(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
}

const IBAN_CURRENT_KEY_ID = ibanKeyId(IBAN_AES_KEY);
const IBAN_KEY_RING: Array<{ id: string; key: Buffer }> = (() => {
  const seen = new Set<string>();
  const ring: Array<{ id: string; key: Buffer }> = [];
  for (const key of [IBAN_AES_KEY, IBAN_PREVIOUS_AES_KEY, IBAN_LEGACY_AES_KEY]) {
    if (!key) continue;
    const id = ibanKeyId(key);
    if (!seen.has(id)) {
      seen.add(id);
      ring.push({ id, key });
    }
  }
  return ring;
})();

function encryptIban(plainIban: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', IBAN_AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainIban, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v2:${IBAN_CURRENT_KEY_ID}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function tryDecryptIbanWithKey(key: Buffer, iv: Buffer, tag: Buffer, data: Buffer): string | null {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function decryptIban(storedIban: string): string {
  if (!storedIban) return storedIban;

  if (storedIban.startsWith('enc:v2:')) {
    try {
      const parts = storedIban.split(':');
      if (parts.length !== 6) return 'INVALID';
      const [, , keyId, ivHex, tagHex, cipherHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const data = Buffer.from(cipherHex, 'hex');
      if (iv.length !== 12 || tag.length !== 16) return 'INVALID';

      const preferred = IBAN_KEY_RING.filter((entry) => entry.id === keyId);
      const fallback = IBAN_KEY_RING.filter((entry) => entry.id !== keyId);
      for (const entry of [...preferred, ...fallback]) {
        const plain = tryDecryptIbanWithKey(entry.key, iv, tag, data);
        if (plain !== null) return plain;
      }
      return 'INVALID';
    } catch {
      return 'INVALID';
    }
  }

  if (storedIban.startsWith('enc:v1:')) {
    try {
      const parts = storedIban.split(':');
      if (parts.length !== 5) return storedIban;
      const [, , ivHex, tagHex, cipherHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const data = Buffer.from(cipherHex, 'hex');
      if (iv.length !== 12 || tag.length !== 16) return 'INVALID';

      for (const entry of IBAN_KEY_RING) {
        const plain = tryDecryptIbanWithKey(entry.key, iv, tag, data);
        if (plain !== null) return plain;
      }
      return 'INVALID';
    } catch {
      return 'INVALID';
    }
  }

  return storedIban;
}

function maskIban(iban: string): string {
  const plain = decryptIban(iban);
  if (plain === 'INVALID') return '•••• ••••';
  const clean = plain.replace(/\s+/g, '');
  if (clean.length <= 8) return '****' + clean.slice(-2);
  return clean.slice(0, 4) + ' •••• •••• ' + clean.slice(-4);
}

const tokenVersionFallback = new Map<string, number>();

async function getProfileTokenVersion(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  profileId: string
): Promise<number> {
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('token_version')
      .eq('id', profileId)
      .maybeSingle();
    if (!error && data && typeof (data as { token_version?: number }).token_version === 'number') {
      const tv = Number((data as { token_version: number }).token_version);
      tokenVersionFallback.set(profileId, tv);
      return tv;
    }
  } catch {
    // fallback safely if column not migrated yet
  }
  return tokenVersionFallback.get(profileId) ?? 1;
}

async function bumpProfileTokenVersion(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  profileId: string
): Promise<number> {
  const current = await getProfileTokenVersion(sb, profileId);
  const next = current + 1;
  tokenVersionFallback.set(profileId, next);
  invalidateAuthSessionCacheForUser(profileId);
  try {
    await sb.from('profiles').update({ token_version: next }).eq('id', profileId);
  } catch {
    // fallback in memory until DB migration applied
  }
  return next;
}

const ACCOUNT_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LOCKOUT_MAX_ATTEMPTS = 5;
const EMAIL_FAIL_DELAY_THRESHOLD = 20;
const EMAIL_FAIL_DELAY_MS = 3000;
const loginAccountFailures = new Map<string, { count: number; lockedUntil: number; firstAt: number }>();
const loginEmailFailures = new Map<string, { count: number; firstAt: number; warned: boolean }>();

function checkAccountLockout(key: string): { locked: boolean; retryAfterSec: number } {
  const entry = loginAccountFailures.get(key);
  if (!entry) return { locked: false, retryAfterSec: 0 };
  const now = Date.now();
  if (entry.lockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
  }
  if (now - entry.firstAt > ACCOUNT_LOCKOUT_WINDOW_MS) {
    loginAccountFailures.delete(key);
  }
  return { locked: false, retryAfterSec: 0 };
}

function shouldDelayEmailLogin(emailKey: string): boolean {
  const entry = loginEmailFailures.get(emailKey);
  if (!entry) return false;
  const now = Date.now();
  if (now - entry.firstAt > ACCOUNT_LOCKOUT_WINDOW_MS) {
    loginEmailFailures.delete(emailKey);
    return false;
  }
  return entry.count >= EMAIL_FAIL_DELAY_THRESHOLD;
}

function recordAccountFailure(key: string, emailKey?: string): void {
  const now = Date.now();
  if (loginAccountFailures.size > 5000) {
    for (const [k, v] of loginAccountFailures.entries()) {
      if (v.lockedUntil <= now && now - v.firstAt > ACCOUNT_LOCKOUT_WINDOW_MS) {
        loginAccountFailures.delete(k);
      }
    }
  }
  const existing = loginAccountFailures.get(key);
  if (!existing || now - existing.firstAt > ACCOUNT_LOCKOUT_WINDOW_MS) {
    loginAccountFailures.set(key, { count: 1, lockedUntil: 0, firstAt: now });
  } else {
    const nextCount = existing.count + 1;
    const lockedUntil = nextCount >= ACCOUNT_LOCKOUT_MAX_ATTEMPTS ? now + ACCOUNT_LOCKOUT_WINDOW_MS : 0;
    loginAccountFailures.set(key, { count: nextCount, lockedUntil, firstAt: existing.firstAt });
  }

  if (emailKey) {
    if (loginEmailFailures.size > 5000) {
      for (const [k, v] of loginEmailFailures.entries()) {
        if (now - v.firstAt > ACCOUNT_LOCKOUT_WINDOW_MS) {
          loginEmailFailures.delete(k);
        }
      }
    }
    const emailEntry = loginEmailFailures.get(emailKey);
    if (!emailEntry || now - emailEntry.firstAt > ACCOUNT_LOCKOUT_WINDOW_MS) {
      loginEmailFailures.set(emailKey, { count: 1, firstAt: now, warned: false });
    } else {
      const nextCount = emailEntry.count + 1;
      let warned = emailEntry.warned;
      if (nextCount >= EMAIL_FAIL_DELAY_THRESHOLD && !warned) {
        warned = true;
        console.warn(
          `[auth-lockout] ${nextCount} failed login attempts across IPs in 15m for ${maskEmail(emailKey)}; applying ${EMAIL_FAIL_DELAY_MS}ms delay without hard lock.`
        );
      }
      loginEmailFailures.set(emailKey, { count: nextCount, firstAt: emailEntry.firstAt, warned });
    }
  }
}

function clearAccountFailure(key: string, emailKey?: string): void {
  loginAccountFailures.delete(key);
  if (emailKey) {
    loginEmailFailures.delete(emailKey);
  }
}

async function insertConsentSafe(
  email: string,
  docType: string,
  docVersion: string,
  ipAddress: string,
  actorRole: string
) {
  const sb = requireSupabaseAdmin();
  const resWithMeta = await sb
    .from('consents')
    .insert({
      email: email.trim().toLowerCase(),
      doc_type: docType,
      doc_version: docVersion,
      ip_address: ipAddress,
      actor_role: actorRole,
    });
  if (!resWithMeta.error) return;
  // Backwards-compatible fallback if live Supabase consents table lacks new columns yet
  await insertRowSafe('consents', {
    email: email.trim().toLowerCase(),
    doc_type: docType,
    doc_version: docVersion,
  });
}

const REAUTH_WINDOW_MS = 15 * 60 * 1000;
const REAUTH_MAX_ATTEMPTS = 5;
const GOOGLE_REAUTH_MAX_AGE_MS = 3 * 60 * 1000;
const reauthFailedAttempts = new Map<string, { count: number; resetAt: number }>();

function isAdminReauthRateLimited(adminId: string): boolean {
  const rec = reauthFailedAttempts.get(adminId);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) {
    reauthFailedAttempts.delete(adminId);
    return false;
  }
  return rec.count >= REAUTH_MAX_ATTEMPTS;
}

function recordAdminReauthFailure(adminId: string): void {
  const now = Date.now();
  const existing = reauthFailedAttempts.get(adminId);
  if (!existing || now > existing.resetAt) {
    reauthFailedAttempts.set(adminId, { count: 1, resetAt: now + REAUTH_WINDOW_MS });
  } else {
    existing.count += 1;
  }
}

function clearAdminReauthFailures(adminId: string): void {
  reauthFailedAttempts.delete(adminId);
}

/**
 * Inspects Supabase JWT `amr` (Authentication Methods References) claim AFTER the token
 * has already been verified by `sb.auth.getUser(token)`. Returns the most recent
 * interactive authentication timestamp (never `iat` from a silent refresh).
 */
function parseJwtInteractiveAuthMs(verifiedJwt: string): number | null {
  try {
    const parts = verifiedJwt.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      amr?: Array<{ method?: string; timestamp?: number }>;
    };
    if (!Array.isArray(payload.amr)) return null;
    let latestMs: number | null = null;
    for (const entry of payload.amr) {
      if (!entry || typeof entry.timestamp !== 'number') continue;
      const method = String(entry.method || '').toLowerCase();
      if (method === 'token_refresh') continue;
      const tsMs = entry.timestamp > 1e12 ? entry.timestamp : entry.timestamp * 1000;
      if (Number.isFinite(tsMs) && (latestMs === null || tsMs > latestMs)) {
        latestMs = tsMs;
      }
    }
    return latestMs;
  } catch {
    return null;
  }
}

async function verifyAdminReauth(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  adminUser: AuthUser,
  confirmPassword?: string,
  confirmGoogleToken?: string
): Promise<{ ok: boolean; status?: number; error?: string; code?: string }> {
  if (isAdminReauthRateLimited(adminUser.id)) {
    return {
      ok: false,
      status: 429,
      error: 'Too many failed verification attempts. Please wait 15 minutes before trying again.',
      code: 'REAUTH_RATE_LIMITED',
    };
  }

  const { data: uData } = await sb.auth.admin.getUserById(adminUser.id).catch(() => ({ data: { user: null } }));
  const authUserObj = uData?.user;
  const appProviders = Array.isArray(authUserObj?.app_metadata?.providers)
    ? (authUserObj.app_metadata.providers as string[])
    : [];
  const identityProviders = Array.isArray(authUserObj?.identities)
    ? authUserObj.identities.map((id) => id.provider).filter((p): p is string => Boolean(p))
    : [];
  const allProviders = new Set([...appProviders, ...identityProviders]);
  const isGoogleOnlyAdmin = allProviders.has('google') && !allProviders.has('email');

  if (isGoogleOnlyAdmin) {
    if (confirmPassword && confirmPassword.trim().length > 0) {
      const anon = createEphemeralSupabaseAnon();
      const { error } = await anon.auth.signInWithPassword({ email: adminUser.email, password: confirmPassword });
      if (!error) {
        clearAdminReauthFailures(adminUser.id);
        return { ok: true };
      }
      recordAdminReauthFailure(adminUser.id);
      return {
        ok: false,
        status: 401,
        error: 'Administrator password confirmation failed.',
        code: 'REAUTH_INVALID_PASSWORD',
      };
    }

    if (confirmGoogleToken && confirmGoogleToken.trim().length > 0) {
      const verified = await verifyVerifiedGoogleToken(sb, confirmGoogleToken.trim());
      if (!verified) {
        recordAdminReauthFailure(adminUser.id);
        return {
          ok: false,
          status: 401,
          error: 'Invalid or unverified Google re-authentication token.',
          code: 'REAUTH_GOOGLE_INVALID',
        };
      }

      const expectedEmail = adminUser.email.trim().toLowerCase();
      if (verified.user.id !== adminUser.id || verified.email !== expectedEmail) {
        recordAdminReauthFailure(adminUser.id);
        return {
          ok: false,
          status: 403,
          error: 'Google verification must match the currently signed-in administrator account.',
          code: 'REAUTH_GOOGLE_MISMATCH',
        };
      }

      const lastSignInMs = verified.user.last_sign_in_at ? Date.parse(verified.user.last_sign_in_at) : NaN;
      const amrAuthMs = parseJwtInteractiveAuthMs(confirmGoogleToken.trim());
      const now = Date.now();
      const isLastSignInFresh =
        Number.isFinite(lastSignInMs) &&
        lastSignInMs <= now + 60_000 &&
        now - lastSignInMs <= GOOGLE_REAUTH_MAX_AGE_MS;
      const isAmrFresh =
        amrAuthMs === null ||
        (amrAuthMs <= now + 60_000 && now - amrAuthMs <= GOOGLE_REAUTH_MAX_AGE_MS);

      if (!isLastSignInFresh || !isAmrFresh) {
        recordAdminReauthFailure(adminUser.id);
        return {
          ok: false,
          status: 401,
          error: 'Google sign-in confirmation has expired (older than 3 minutes). Please sign in with Google again.',
          code: 'REAUTH_GOOGLE_STALE',
        };
      }

      clearAdminReauthFailures(adminUser.id);
      return { ok: true };
    }

    return {
      ok: false,
      status: 401,
      error: 'Fresh Google sign-in confirmation (within 3 minutes) is required for this sensitive action.',
      code: 'REAUTH_GOOGLE_REQUIRED',
    };
  }

  if (!confirmPassword || typeof confirmPassword !== 'string' || !confirmPassword.trim()) {
    return {
      ok: false,
      status: 401,
      error: 'Please enter your administrator password to confirm this sensitive action.',
      code: 'REAUTH_PASSWORD_REQUIRED',
    };
  }

  const anon = createEphemeralSupabaseAnon();
  const { error: verifyErr } = await anon.auth.signInWithPassword({
    email: adminUser.email,
    password: confirmPassword,
  });
  if (verifyErr) {
    recordAdminReauthFailure(adminUser.id);
    return {
      ok: false,
      status: 401,
      error: 'Administrator password confirmation failed.',
      code: 'REAUTH_INVALID_PASSWORD',
    };
  }
  clearAdminReauthFailures(adminUser.id);
  return { ok: true };
}

function maskEmail(rawEmail: string | null | undefined): string | null {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) return null;
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***';
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

function getAuditLogRetentionMonths(): number {
  const parsed = Number(process.env.AUDIT_LOG_RETENTION_MONTHS || 24);
  if (!Number.isFinite(parsed) || parsed < 1) return 24;
  return Math.min(Math.floor(parsed), 120);
}

async function cleanupExpiredAuditLogs(): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const retentionMonths = getAuditLogRetentionMonths();
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);
    const cutoffIso = cutoff.toISOString();
    const { error } = await sb.from('audit_logs').delete().lt('created_at', cutoffIso);
    if (error) {
      console.warn('[audit_log] retention cleanup warning:', error.message);
    }
  } catch (err) {
    console.warn('[audit_log] retention cleanup error:', err instanceof Error ? err.message : err);
  }
}

const AUDIT_PII_KEYS = ['email', 'name_ar', 'full_name_ar', 'student_name', 'student_email'] as const;

function auditActorName(user: { id: string; role?: string | null; full_name?: string | null }): string {
  const role = String(user.role || '').toLowerCase();
  if (role === 'student' || role === 'guardian') {
    const shortId = String(user.id || '').slice(0, 8) || 'unknown';
    return `${role}#${shortId}`;
  }
  return String(user.full_name || '').trim() || `${role || 'user'}#${String(user.id || '').slice(0, 8)}`;
}

async function anonymizeAuditSubject(params: {
  profileId?: string | null;
  entityType?: string;
  entityId?: string | number | null;
}): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    if (!sb) return;
    const { profileId, entityType, entityId } = params;

    if (profileId) {
      const { error: actorErr } = await sb
        .from('audit_logs')
        .update({ actor_name: 'deleted-user' })
        .eq('actor_id', profileId);
      if (actorErr) {
        console.warn('[audit_log] anonymize actor_name warning:', actorErr.message);
      }
    }

    if (entityType && entityId !== undefined && entityId !== null && String(entityId).length > 0) {
      const { data: rows, error: selErr } = await sb
        .from('audit_logs')
        .select('id, details_json')
        .eq('entity_type', entityType)
        .eq('entity_id', String(entityId));
      if (selErr) {
        console.warn('[audit_log] anonymize select details warning:', selErr.message);
        return;
      }
      const updates: PromiseLike<unknown>[] = [];
      for (const row of (rows || []) as Array<{ id: number; details_json?: Record<string, unknown> | null }>) {
        const details = row.details_json;
        if (!details || typeof details !== 'object' || Array.isArray(details)) continue;
        let changed = false;
        const cleaned: Record<string, unknown> = { ...details };
        for (const key of AUDIT_PII_KEYS) {
          if (Object.prototype.hasOwnProperty.call(cleaned, key)) {
            delete cleaned[key];
            changed = true;
          }
        }
        if (changed) {
          updates.push(
            sb
              .from('audit_logs')
              .update({ details_json: cleaned })
              .eq('id', row.id)
              .then(({ error }) => {
                if (error) console.warn(`[audit_log] anonymize row ${row.id} warning:`, error.message);
              })
          );
        }
      }
      if (updates.length) {
        await Promise.allSettled(updates);
      }
    }
  } catch (err) {
    console.warn('[audit_log] anonymizeAuditSubject warning:', err instanceof Error ? err.message : err);
  }
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

async function resolveSessionAuthUser(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  decoded: { id: string; role: string; guardianId?: number; tv?: number }
): Promise<AuthUser | null> {
  let profile: (AuthUser & { token_version?: number }) | null = null;
  const primaryRes = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active, preferred_lang, token_version')
    .eq('id', String(decoded.id))
    .is('deleted_at', null)
    .maybeSingle();

  if (primaryRes.error && String(primaryRes.error.message || '').includes('token_version')) {
    const fallbackRes = await sb
      .from('profiles')
      .select('id, email, full_name, role, is_active, preferred_lang')
      .eq('id', String(decoded.id))
      .is('deleted_at', null)
      .maybeSingle();
    if (fallbackRes.error || !fallbackRes.data) return null;
    profile = fallbackRes.data as AuthUser;
  } else if (primaryRes.error || !primaryRes.data) {
    return null;
  } else {
    profile = primaryRes.data as AuthUser & { token_version?: number };
  }

  if (!profile || !profile.is_active) {
    return null;
  }

  const effectiveTv =
    typeof profile.token_version === 'number'
      ? profile.token_version
      : tokenVersionFallback.get(profile.id) ?? 1;
  if (decoded.tv !== undefined && Number(decoded.tv) !== effectiveTv) {
    return null;
  }

  if (decoded.role === 'guardian' && decoded.guardianId) {
    if (profile.role === 'admin' || profile.role === 'teacher') {
      return null;
    }
    const { data: gRow } = await sb
      .from('guardians')
      .select('id, profile_id, full_name, email')
      .eq('id', Number(decoded.guardianId))
      .is('deleted_at', null)
      .maybeSingle();
    if (!gRow) {
      return null;
    }
    if (profile.role === 'student') {
      const gAuth = await getGuardianAuth(sb, Number(gRow.id));
      if (!gAuth || gAuth.status !== 'approved') {
        return null;
      }
      if (gRow.profile_id && gRow.profile_id !== profile.id) {
        return null;
      }
    }
    return {
      id: profile.id,
      email: gRow.email || profile.email,
      full_name: gRow.full_name || profile.full_name,
      role: 'guardian',
      is_active: true,
      preferred_lang: profile.preferred_lang,
      guardian_id: Number(gRow.id),
    };
  }

  const { token_version: _tv, ...safeProfile } = profile;
  return safeProfile as AuthUser;
}

async function findGuardianForUser(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  user: AuthUser
): Promise<{ id: number; profile_id: string | null; full_name: string; phone: string; email: string; relation: string } | null> {
  if (user.guardian_id) {
    const { data } = await sb
      .from('guardians')
      .select('id, profile_id, full_name, phone, email, relation')
      .eq('id', user.guardian_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (data) {
      return data as { id: number; profile_id: string | null; full_name: string; phone: string; email: string; relation: string };
    }
  }
  const { data } = await sb
    .from('guardians')
    .select('id, profile_id, full_name, phone, email, relation')
    .eq('profile_id', user.id)
    .is('deleted_at', null)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: number; profile_id: string | null; full_name: string; phone: string; email: string; relation: string } | null) || null;
}

const AUTH_SESSION_CACHE_TTL_MS = 60_000;
const AUTH_SESSION_CACHE_MAX_ENTRIES = 5000;
const authSessionCache = new Map<string, { user: AuthUser | null; userId: string; expiresAt: number }>();
const authSessionInFlight = new Map<string, Promise<AuthUser | null>>();

function getAuthSessionCacheKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function invalidateAuthSessionCacheForToken(token: string | null | undefined): void {
  if (!token) return;
  const key = getAuthSessionCacheKey(token);
  authSessionCache.delete(key);
  authSessionInFlight.delete(key);
}

function invalidateAuthSessionCacheForUser(userId: string | null | undefined): void {
  if (!userId) return;
  const target = String(userId);
  for (const [key, entry] of authSessionCache.entries()) {
    if (entry.userId === target) {
      authSessionCache.delete(key);
    }
  }
}

async function resolveVerifiedAuthUserCached(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  token: string,
  decoded: { id: string; role: string; guardianId?: number; tv?: number; exp: number }
): Promise<AuthUser | null> {
  const now = Date.now();
  const key = getAuthSessionCacheKey(token);
  const cached = authSessionCache.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.user;
  }
  if (cached) {
    authSessionCache.delete(key);
  }

  const existingFlight = authSessionInFlight.get(key);
  if (existingFlight) {
    return existingFlight;
  }

  const lookupPromise = resolveSessionAuthUser(sb, decoded)
    .then((resolved) => {
      const doneNow = Date.now();
      if (authSessionCache.size > AUTH_SESSION_CACHE_MAX_ENTRIES) {
        for (const [k, v] of authSessionCache.entries()) {
          if (v.expiresAt <= doneNow) authSessionCache.delete(k);
        }
        while (authSessionCache.size > AUTH_SESSION_CACHE_MAX_ENTRIES) {
          const oldest = authSessionCache.keys().next().value;
          if (oldest === undefined) break;
          authSessionCache.delete(oldest);
        }
      }
      const expiresAt = Math.min(doneNow + AUTH_SESSION_CACHE_TTL_MS, decoded.exp);
      if (expiresAt > doneNow) {
        authSessionCache.set(key, {
          user: resolved,
          userId: String(decoded.id),
          expiresAt,
        });
      }
      return resolved;
    })
    .finally(() => {
      authSessionInFlight.delete(key);
    });

  authSessionInFlight.set(key, lookupPromise);
  return lookupPromise;
}

const authenticate = asyncHandler<AuthRequest>(async (req, res, next) => {
  const token = extractRequestToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    invalidateAuthSessionCacheForToken(token);
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const user = await resolveVerifiedAuthUserCached(sb, token, decoded);
  if (!user) {
    res.status(403).json({ error: 'Account inactive or not found' });
    return;
  }
  req.user = user;
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

async function tryAuthenticateOptional(req: Request): Promise<AuthUser | null> {
  try {
    const token = extractRequestToken(req);
    if (!token) return null;
    const decoded = verifyToken(token);
    if (!decoded) {
      invalidateAuthSessionCacheForToken(token);
      return null;
    }
    const sb = requireSupabaseAdmin();
    return await resolveVerifiedAuthUserCached(sb, token, decoded);
  } catch {
    return null;
  }
}

const UPDATED_LEVELS_CATALOG = [
  {
    id: 1,
    code: 'LEVEL-1',
    name_ar: 'المستوى الأول — التأسيس والمهارات الأساسية',
    name_en: 'Level 1 — Foundations & Core Skills',
    description_ar:
      'مرحلة البداية لبناء المهارات الأساسية في القراءة والكتابة، التأسيس الأكاديمي، ومبادئ المواد واللغات والحساب بأسلوب تفاعلي مبسط.',
    description_en:
      'Entry stage building core foundations in reading, writing, early numeracy, languages, and core subjects through interactive guidance.',
    age_range: '4 – 7 سنوات',
    criteria_ar: 'الانتقال عند إتقان المهارات التأسيسية واجتياز التقييم الأولي بنجاح.',
    criteria_en: 'Advance upon mastering foundational skills and passing the initial assessment.',
  },
  {
    id: 2,
    code: 'LEVEL-2',
    name_ar: 'المستوى الثاني — الطلاقة والتطبيق المتوسط',
    name_en: 'Level 2 — Fluency & Intermediate Track',
    description_ar:
      'تطوير الطلاقة القرائية واللغوية، تعميق الفهم في المواد الدراسية والعلوم الإسلامية، وتنمية مهارات التفكير والحساب الذهني.',
    description_en:
      'Developing reading and language fluency, strengthening school subjects and Islamic studies, and building mental math & thinking skills.',
    age_range: '8 – 11 سنة',
    criteria_ar: 'الانتقال عند تحقيق نسبة 85% فأكثر في التقييمات الدورية والمشاركة الصفية.',
    criteria_en: 'Advance after achieving 85%+ across periodic assessments and class participation.',
  },
  {
    id: 3,
    code: 'LEVEL-3',
    name_ar: 'المستوى الثالث — التقدّم والتميّز الأكاديمي',
    name_en: 'Level 3 — Advanced & Academic Mastery',
    description_ar:
      'تطبيق المهارات المتقدمة في جميع المسارات: الإتقان القرائي والتجويدي، اللغات والمناهج الدولية، وحل المسائل العليا بتفوّق.',
    description_en:
      'Advanced mastery across tracks: fluent recitation, international curricula, languages, and higher-order problem solving.',
    age_range: '12 – 18 سنة',
    criteria_ar: 'إتمام متطلبات المسار المتقدم والاختبار النهائي بنجاح لاستلام شهادة المستوى.',
    criteria_en: 'Complete advanced track requirements and pass the final assessment for level certification.',
  },
] as const;

async function ensureUpdatedLevelsCatalog(): Promise<void> {
  try {
    const sb = requireSupabaseAdmin();
    const { data: rows } = await sb.from('levels').select('id, code, name_ar').in('id', [1, 2, 3]);
    if (!rows || !rows.length) return;
    let changed = false;
    for (const target of UPDATED_LEVELS_CATALOG) {
      const cur = rows.find((r: { id: number; code?: string; name_ar?: string }) => Number(r.id) === target.id);
      if (!cur) continue;
      const needsUpdate =
        cur.code === 'L1-BRAEM' ||
        cur.code === 'L2-NOOR' ||
        cur.code === 'L3-TAJWEED' ||
        String(cur.name_ar || '').includes('البراعم') ||
        String(cur.name_ar || '').includes('الإتقان') ||
        String(cur.name_ar || '').includes('المستوى الأساسي');
      if (needsUpdate) {
        const { error } = await sb
          .from('levels')
          .update({
            code: target.code,
            name_ar: target.name_ar,
            name_en: target.name_en,
            description_ar: target.description_ar,
            description_en: target.description_en,
            age_range: target.age_range,
            criteria_ar: target.criteria_ar,
            criteria_en: target.criteria_en,
          })
          .eq('id', target.id);
        if (!error) changed = true;
      }
    }
    if (changed) {
      overviewCache = null;
      console.log('[levels] Updated legacy levels (1–3) to generic academic level names.');
    }
  } catch (err) {
    console.warn('[levels] startup catalog sync warning:', err instanceof Error ? err.message : err);
  }
}

// ============================================================================
// HEALTH CHECK (Liveness & Supabase Readiness for Hosting Probes)
// ============================================================================
app.get('/api/health', asyncHandler(async (req, res) => {
  const authUser = await tryAuthenticateOptional(req);
  if (!authUser || authUser.role !== 'admin') {
    res.status(200).json({ ok: true });
    return;
  }

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
const DASHBOARD_CACHE_TTL_MS = 30_000;
const ROLE_DASHBOARD_CACHE_MAX_ENTRIES = 2000;
let overviewCache: { payload: unknown; expiresAt: number } | null = null;
const courseDetailCache = new Map<number, { payload: unknown; expiresAt: number }>();
const teacherDetailCache = new Map<number, { payload: unknown; expiresAt: number }>();
let adminDashboardSummaryCache: { payload: unknown; expiresAt: number } | null = null;
let adminDashboardSummaryInFlight: Promise<unknown> | null = null;
let adminDashboardSummaryEpoch = 0;
const roleDashboardCache = new Map<string, { payload: unknown; expiresAt: number }>();

function getCachedRoleDashboard<T>(key: string): T | null {
  const entry = roleDashboardCache.get(key);
  if (!entry) return null;
  if (Date.now() < entry.expiresAt) {
    return entry.payload as T;
  }
  roleDashboardCache.delete(key);
  return null;
}

function setCachedRoleDashboard(key: string, payload: unknown): void {
  const now = Date.now();
  if (roleDashboardCache.size > ROLE_DASHBOARD_CACHE_MAX_ENTRIES) {
    for (const [k, v] of roleDashboardCache.entries()) {
      if (v.expiresAt <= now) roleDashboardCache.delete(k);
    }
    while (roleDashboardCache.size > ROLE_DASHBOARD_CACHE_MAX_ENTRIES) {
      const oldest = roleDashboardCache.keys().next().value;
      if (oldest === undefined) break;
      roleDashboardCache.delete(oldest);
    }
  }
  roleDashboardCache.set(key, { payload, expiresAt: now + DASHBOARD_CACHE_TTL_MS });
}

function invalidateDashboardCaches(): void {
  adminDashboardSummaryEpoch += 1;
  adminDashboardSummaryCache = null;
  adminDashboardSummaryInFlight = null;
  roleDashboardCache.clear();
}

function invalidateOverviewCache(): void {
  overviewCache = null;
  courseDetailCache.clear();
  teacherDetailCache.clear();
  invalidateDashboardCaches();
}

app.get('/api/public/overview', asyncHandler(async (_req, res) => {
  if (overviewCache && Date.now() < overviewCache.expiresAt) {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json(overviewCache.payload);
    return;
  }

  const sb = requireSupabaseAdmin();
  const [
    studentsRes,
    teachersRes,
    coursesRes,
    lessonsRes,
    levelsRes,
    gamesRes,
    legalRes,
    courseMetasMap,
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
      .select('*, levels(name_ar, name_en, code), teachers(id, name_ar, name_en, avatar_url, is_public, deleted_at)')
      .is('deleted_at', null)
      .order('is_featured', { ascending: false })
      .order('id', { ascending: true }),
    sb
      .from('lessons')
      .select('id, courses!inner(deleted_at)', { count: 'exact', head: true })
      .is('deleted_at', null)
      .is('courses.deleted_at', null),
    sb.from('levels').select('*').order('order_index', { ascending: true }),
    sb.from('games').select('*').eq('is_active', true).order('id', { ascending: true }),
    sb.from('legal_documents').select('doc_type, version, title_ar, title_en, content_ar, content_en, updated_at').order('id', { ascending: true }),
    listCourseMetas(sb),
  ]);

  const publicTeacherById = new Map<number, { name_ar: string; name_en: string }>();
  for (const t of teachersRes.data || []) {
    publicTeacherById.set(Number((t as { id: number }).id), {
      name_ar: String((t as { name_ar?: string }).name_ar || ''),
      name_en: String((t as { name_en?: string }).name_en || ''),
    });
  }

  const courses = (coursesRes.data || []).map((c: Record<string, unknown>) => {
    const lvl = c.levels as { name_ar?: string; name_en?: string; code?: string } | null;
    const tch = c.teachers as {
      id?: number;
      name_ar?: string;
      name_en?: string;
      avatar_url?: string;
      is_public?: boolean;
      deleted_at?: string | null;
    } | null;
    const showPrimaryTeacher = Boolean(tch && tch.is_public !== false && !tch.deleted_at);
    const { levels: _l, teachers: _t, ...rest } = c;
    const cid = Number(rest.id);
    const meta = courseMetasMap.get(cid);
    const coIds = (meta?.co_teacher_ids || []).filter((id) => id !== Number(rest.teacher_id));
    return {
      ...rest,
      level_name_ar: lvl?.name_ar ?? null,
      level_name_en: lvl?.name_en ?? null,
      level_code: lvl?.code ?? null,
      teacher_name_ar: showPrimaryTeacher ? tch?.name_ar ?? null : null,
      teacher_name_en: showPrimaryTeacher ? tch?.name_en ?? null : null,
      teacher_avatar: showPrimaryTeacher ? tch?.avatar_url ?? null : null,
      cover_url: meta?.cover_url ?? null,
      price_monthly_sar: meta?.price_monthly_sar ?? null,
      co_teacher_ids: coIds,
      co_teacher_names_ar: coIds.map((id) => publicTeacherById.get(id)?.name_ar).filter(Boolean),
      co_teacher_names_en: coIds.map((id) => publicTeacherById.get(id)?.name_en).filter(Boolean),
    };
  });

  const payload = {
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
    testimonials: [],
    legal: (legalRes.data || []).map((doc: Record<string, unknown>) => ({
      ...doc,
      content_ar: normalizeLegacyDomainText(String(doc.content_ar || '')),
      content_en: normalizeLegacyDomainText(String(doc.content_en || '')),
    })),
  };
  overviewCache = { payload, expiresAt: Date.now() + 60_000 };
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.json(payload);
}));

app.get('/api/public/course-covers/:id', asyncHandler(async (req, res) => {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    res.status(404).end();
    return;
  }
  const sb = requireSupabaseAdmin();
  const meta = await getCourseMeta(sb, courseId);
  if (!meta?.cover_storage_path) {
    res.status(404).end();
    return;
  }
  const buf = await readCourseCoverFile(sb, meta.cover_storage_path);
  if (!buf) {
    res.status(404).end();
    return;
  }
  const mime = meta.cover_mime && ['image/png', 'image/jpeg', 'image/webp'].includes(meta.cover_mime)
    ? meta.cover_mime
    : 'image/jpeg';
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(buf);
}));

app.get('/api/public/courses/:id', asyncHandler(async (req, res) => {
  const courseId = parsePositiveIntParam(req.params.id, 'course id');
  const cached = courseDetailCache.get(courseId);
  if (cached && Date.now() < cached.expiresAt) {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json(cached.payload);
    return;
  }

  const sb = requireSupabaseAdmin();
  const [{ data: c }, courseMeta, { data: lessons }, lessonMetasMap] = await Promise.all([
    sb
      .from('courses')
      .select('*, levels(name_ar, name_en, age_range), teachers(id, name_ar, name_en, qualifications_ar, qualifications_en, avatar_url, is_public, deleted_at)')
      .eq('id', courseId)
      .is('deleted_at', null)
      .maybeSingle(),
    getCourseMeta(sb, courseId),
    sb
      .from('lessons')
      .select('id, title_ar, title_en, lesson_date, start_time, duration_min, objectives_ar, objectives_en')
      .eq('course_id', courseId)
      .is('deleted_at', null)
      .order('lesson_date', { ascending: true }),
    listLessonMetas(sb),
  ]);

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
    is_public?: boolean;
    deleted_at?: string | null;
  } | null;
  const showPrimaryTeacher = Boolean(tch && tch.is_public !== false && !tch.deleted_at);
  const { levels: _l, teachers: _t, ...rest } = c as Record<string, unknown>;

  const coIds = (courseMeta?.co_teacher_ids || []).filter((id) => id !== Number(tch?.id ?? rest.teacher_id));
  const coTeachers = coIds.length
    ? ((await sb.from('teachers').select('id, name_ar, name_en').in('id', coIds).eq('is_public', true).is('deleted_at', null)).data || [])
    : [];

  const course = {
    ...rest,
    level_name_ar: lvl?.name_ar ?? null,
    level_name_en: lvl?.name_en ?? null,
    age_range: lvl?.age_range ?? null,
    teacher_id: showPrimaryTeacher ? tch?.id ?? rest.teacher_id ?? null : null,
    teacher_name_ar: showPrimaryTeacher ? tch?.name_ar ?? null : null,
    teacher_name_en: showPrimaryTeacher ? tch?.name_en ?? null : null,
    teacher_qualifications_ar: showPrimaryTeacher ? tch?.qualifications_ar ?? null : null,
    teacher_qualifications_en: showPrimaryTeacher ? tch?.qualifications_en ?? null : null,
    teacher_avatar: showPrimaryTeacher ? tch?.avatar_url ?? null : null,
    cover_url: courseMeta?.cover_url ?? null,
    price_monthly_sar: courseMeta?.price_monthly_sar ?? null,
    co_teacher_ids: coIds,
    co_teacher_names_ar: coTeachers.map((t: { name_ar: string }) => t.name_ar),
    co_teacher_names_en: coTeachers.map((t: { name_en: string }) => t.name_en),
  };

  const publishedLessons = (lessons || [])
    .map((l: Record<string, unknown>) => {
      const lm = lessonMetasMap.get(Number(l.id));
      return {
        ...l,
        weekday_ar: lm?.weekday_ar ?? '',
        is_published: lm ? lm.is_published : true,
      };
    })
    .filter((l) => l.is_published);

  const payload = { course, lessons: publishedLessons };
  courseDetailCache.set(courseId, { payload, expiresAt: Date.now() + 60_000 });
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.json(payload);
}));

app.get('/api/public/teachers/:id', asyncHandler(async (req, res) => {
  const teacherId = parsePositiveIntParam(req.params.id, 'teacher id');
  const cached = teacherDetailCache.get(teacherId);
  if (cached && Date.now() < cached.expiresAt) {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json(cached.payload);
    return;
  }

  const sb = requireSupabaseAdmin();
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

  const payload = { teacher, courses: courses || [] };
  teacherDetailCache.set(teacherId, { payload, expiresAt: Date.now() + 60_000 });
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.json(payload);
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
    console.error('[verify-certificate]', error);
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

app.get('/api/public/placement-test', asyncHandler(async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const cfg = await getPlacementTestConfig(sb);
  res.setHeader('Cache-Control', 'no-cache');
  res.json(sanitizePlacementConfigForPublic(cfg));
}));

app.post('/api/public/placement-test', publicSubmitLimiter, asyncHandler(async (req, res) => {
  const parsed = placementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid placement test submission', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { child_name, age, parent_email, answers } = parsed.data;
  const sb = requireSupabaseAdmin();
  const cfg = await getPlacementTestConfig(sb);

  if (answers.length !== cfg.questions.length) {
    res.status(400).json({ error: `Please answer all ${cfg.questions.length} questions.` });
    return;
  }

  let correctCount = 0;
  for (let i = 0; i < cfg.questions.length; i += 1) {
    const q = cfg.questions[i];
    const chosen = answers[i];
    if (chosen < 0 || chosen >= q.opts_ar.length) {
      res.status(400).json({ error: 'Invalid option index submitted.' });
      return;
    }
    if (chosen === q.correct_index) correctCount += 1;
  }

  const score = Math.round((correctCount / cfg.questions.length) * 100);
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
  if (score >= cfg.thresholds.advanced_min_score && age >= cfg.thresholds.advanced_min_age) {
    recommended = levelList[2] || levelList[levelList.length - 1];
  } else if (score >= cfg.thresholds.intermediate_min_score) {
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

  res.json({ score, correctCount, total: cfg.questions.length, recommendedLevel: recommended });
}));

app.post('/api/public/admissions', publicSubmitLimiter, asyncHandler(async (req, res) => {
  const parsed = admissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'All required fields (including valid student email and password min 8 chars) and consent must be provided.' });
    return;
  }
  const {
    student_name,
    student_age,
    student_email,
    student_password,
    guardian_name,
    guardian_email,
    guardian_phone,
    preferred_course_id,
    recommended_level_id,
    notes,
    google_access_token,
    turnstileToken,
  } = parsed.data;

  const captchaCheck = await verifyTurnstileToken(turnstileToken, req.ip);
  if (!captchaCheck.ok) {
    res.status(400).json({ error: captchaCheck.reason || 'CAPTCHA verification failed.' });
    return;
  }

  const cleanStudentEmail = student_email.toLowerCase();
  const cleanGuardianEmail = guardian_email.toLowerCase();

  const sb = requireSupabaseAdmin();
  const { data: existingProfile } = await sb
    .from('profiles')
    .select('id')
    .eq('email', cleanStudentEmail)
    .is('deleted_at', null)
    .maybeSingle();
  if (existingProfile) {
    res.status(409).json({ error: 'This student email is already registered or has a pending application.' });
    return;
  }

  const verifiedGoogle = google_access_token ? await verifyVerifiedGoogleToken(sb, google_access_token) : null;
  const googleVerifiedForEmail = Boolean(verifiedGoogle && verifiedGoogle.email === cleanStudentEmail);
  const provisioned = await provisionSupabaseAuthUser(cleanStudentEmail, student_password, student_name, 'student', {
    emailConfirm: googleVerifiedForEmail,
  });
  let authUserId = provisioned.user.id;
  const alreadyExisted = provisioned.alreadyExisted;

  if (alreadyExisted) {
    if (!googleVerifiedForEmail) {
      res.status(409).json({
        error: 'An authentication account already exists for this email. Verify ownership using Fill with Google or use another email.',
      });
      return;
    }
    const { data: upd, error: updErr } = await sb.auth.admin.updateUserById(authUserId, {
      password: student_password,
      email_confirm: true,
      user_metadata: { ...(provisioned.user.user_metadata || {}), full_name: student_name, role: 'student' },
    });
    if (updErr || !upd.user) {
      sendInternalError(res, 'admission-prepare-student', updErr, 'Failed to prepare student account');
      return;
    }
    authUserId = upd.user.id;
  }

  const { error: profErr } = await sb.from('profiles').upsert(
    {
      id: authUserId,
      email: cleanStudentEmail,
      full_name: student_name,
      role: 'student',
      is_active: false,
      preferred_lang: 'ar',
    },
    { onConflict: 'id' }
  );
  if (profErr) {
    if (!alreadyExisted) {
      await sb.auth.admin.deleteUser(authUserId).catch(() => {});
    }
    sendInternalError(res, 'admission-create-profile', profErr, 'Failed to create student profile');
    return;
  }

  let inserted: { id: number };
  try {
    inserted = await insertRowSafe<{ id: number }>('admission_requests', {
      student_name,
      student_age,
      guardian_name,
      guardian_email: cleanGuardianEmail,
      guardian_phone,
      preferred_course_id: preferred_course_id || null,
      recommended_level_id: recommended_level_id || null,
      notes: notes || '',
      consent_accepted: true,
      status: 'pending',
    });

    await saveAdmissionMeta(sb, {
      admission_id: inserted.id,
      student_email: cleanStudentEmail,
      pending_profile_id: authUserId,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    await deletePendingAuthProfileIfSafe(sb, authUserId);
    throw err;
  }

  const clientIp = req.ip || '';
  await Promise.all([
    insertConsentSafe(cleanGuardianEmail, 'terms', '1.0', clientIp, 'guardian'),
    insertConsentSafe(cleanGuardianEmail, 'privacy', '1.0', clientIp, 'guardian'),
  ]);

  void broadcastRealtimeEvent('admission:created', { kind: 'admission' });

  res.status(201).json({ id: inserted.id, status: 'pending', student_email: cleanStudentEmail, syncedToSupabase: true });
}));

app.post('/api/public/teacher-applications', publicSubmitLimiter, asyncHandler(async (_req, res) => {
  res.status(403).json({
    error: 'Teacher self-registration has been disabled. Teachers are added directly by academy administration.',
    code: 'TEACHER_PORTAL_DISABLED',
  });
}));

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================
app.get('/api/auth/config', (_req, res) => {
  res.json({
    googleOAuthEnabled: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
    turnstileEnabled: Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.VITE_TURNSTILE_SITE_KEY),
    turnstileSiteKey: process.env.VITE_TURNSTILE_SITE_KEY || null,
  });
});

app.post('/api/auth/login', loginLimiter, asyncHandler(async (req, res) => {
  const { email, password, portalRole, turnstileToken } = req.body as {
    email?: string;
    password?: string;
    portalRole?: 'student' | 'teacher' | 'guardian' | 'admin';
    turnstileToken?: string;
  };
  const sb = requireSupabaseAdmin();
  let profile: AuthUser | null = null;
  let tokenGuardianId: number | undefined;

  if (portalRole === 'teacher') {
    res.status(403).json({
      error: 'Teacher portal sign-in is disabled.',
      code: 'TEACHER_PORTAL_DISABLED',
    });
    return;
  }

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const captchaCheck = await verifyTurnstileToken(turnstileToken, req.ip);
  if (!captchaCheck.ok) {
    res.status(400).json({ error: captchaCheck.reason || 'CAPTCHA verification failed.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const clientIp = String(req.ip || 'unknown');
  const lockoutKey = `${portalRole || 'any'}:${cleanEmail}:${clientIp}`;
  const lockStatus = checkAccountLockout(lockoutKey);
  if (lockStatus.locked) {
    res.setHeader('Retry-After', String(lockStatus.retryAfterSec));
    res.status(429).json({
      error: `Too many failed sign-in attempts for this account. Please wait ${Math.ceil(lockStatus.retryAfterSec / 60)} minutes or reset your password.`,
      code: 'ACCOUNT_LOCKED',
    });
    return;
  }
  if (shouldDelayEmailLogin(cleanEmail)) {
    await new Promise((resolve) => setTimeout(resolve, EMAIL_FAIL_DELAY_MS));
  }

  if (portalRole === 'guardian') {
    const { data: guardianRows } = await sb
      .from('guardians')
      .select('id, profile_id, full_name, email')
      .eq('email', cleanEmail)
      .is('deleted_at', null)
      .order('id', { ascending: true });

    const candidates = (guardianRows || []) as Array<{
      id: number;
      profile_id: string | null;
      full_name: string;
      email: string;
    }>;

    let matchedVault: { guardian: (typeof candidates)[number]; status: string; linkedProfileId: string | null } | null = null;
    let anyVaultExists = false;

    for (const g of candidates) {
      const rec = await getGuardianAuth(sb, Number(g.id));
      if (!rec) continue;
      anyVaultExists = true;
      if (verifyVaultPassword(password, rec.password_salt, rec.password_hash)) {
        matchedVault = { guardian: g, status: rec.status, linkedProfileId: rec.linked_profile_id || g.profile_id };
        if (rec.status === 'approved') break;
      }
    }

    if (matchedVault) {
      if (matchedVault.status === 'pending') {
        res.status(403).json({
          error: 'Your application is pending administrator approval. Please wait until your account is activated.',
          code: 'APPLICATION_PENDING',
        });
        return;
      }
      if (matchedVault.status !== 'approved' || !matchedVault.linkedProfileId) {
        res.status(403).json({ error: 'Guardian account is not active yet.' });
        return;
      }
      const { data: linkedProfile } = await sb
        .from('profiles')
        .select('id, email, full_name, role, is_active, preferred_lang')
        .eq('id', matchedVault.linkedProfileId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!linkedProfile || !linkedProfile.is_active) {
        res.status(403).json({ error: 'Linked academy account is pending or disabled.' });
        return;
      }
      if (REQUIRE_EMAIL_VERIFICATION) {
        const { data: uData } = await sb.auth.admin.getUserById(linkedProfile.id).catch(() => ({ data: { user: null } }));
        if (!uData?.user?.email_confirmed_at) {
          res.status(403).json({
            code: 'EMAIL_NOT_CONFIRMED',
            error: 'يرجى تأكيد بريدك الإلكتروني عبر رابط التفعيل المرسل إلى بريدك قبل تسجيل الدخول. / Please confirm your email address via the verification link sent to your inbox before signing in.',
          });
          return;
        }
      }
      profile = {
        id: linkedProfile.id,
        email: matchedVault.guardian.email || linkedProfile.email,
        full_name: matchedVault.guardian.full_name || linkedProfile.full_name,
        role: 'guardian',
        is_active: true,
        preferred_lang: linkedProfile.preferred_lang,
        guardian_id: Number(matchedVault.guardian.id),
      };
      tokenGuardianId = Number(matchedVault.guardian.id);
    } else if (!anyVaultExists) {
      // Legacy separate-email guardian created before guardian-auth vault
      const { data: profileRow } = await sb
        .from('profiles')
        .select('id, email, full_name, role, is_active, preferred_lang')
        .eq('email', cleanEmail)
        .is('deleted_at', null)
        .maybeSingle();

      if (!profileRow || profileRow.role !== 'guardian') {
        recordAccountFailure(lockoutKey, cleanEmail);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const anon = createEphemeralSupabaseAnon();
      const { error: authErr } = await anon.auth.signInWithPassword({
        email: profileRow.email,
        password,
      });
      if (authErr) {
        const errMsg = String(authErr.message || '');
        const errCode = String((authErr as { code?: string }).code || '').toLowerCase();
        const isEmailNotConfirmed = errCode === 'email_not_confirmed' || /email not confirmed/i.test(errMsg);
        if (REQUIRE_EMAIL_VERIFICATION && isEmailNotConfirmed) {
          if (!profileRow.is_active) {
            const { data: linked } = await sb.from('guardians').select('id').eq('profile_id', profileRow.id).maybeSingle();
            if (!linked) {
              res.status(403).json({
                error: 'Your application is pending administrator approval. Please wait until your account is activated.',
                code: 'APPLICATION_PENDING',
              });
              return;
            }
          }
          res.status(403).json({
            code: 'EMAIL_NOT_CONFIRMED',
            error: 'يرجى تأكيد بريدك الإلكتروني عبر رابط التفعيل المرسل إلى بريدك قبل تسجيل الدخول. / Please confirm your email address via the verification link sent to your inbox before signing in.',
          });
          return;
        }
        recordAccountFailure(lockoutKey, cleanEmail);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }
      profile = profileRow as AuthUser;
    } else {
      recordAccountFailure(lockoutKey, cleanEmail);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
  } else {
    const { data: profileRow } = await sb
      .from('profiles')
      .select('id, email, full_name, role, is_active, preferred_lang')
      .eq('email', cleanEmail)
      .is('deleted_at', null)
      .maybeSingle();

    if (!profileRow) {
      recordAccountFailure(lockoutKey, cleanEmail);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (profileRow.role === 'teacher') {
      res.status(403).json({
        error: 'Teacher portal sign-in is disabled.',
        code: 'TEACHER_PORTAL_DISABLED',
      });
      return;
    }

    if (portalRole && profileRow.role !== portalRole) {
      res.status(403).json({
        error: 'This account is registered under a different portal role. Please select the matching role tab above.',
        code: 'PORTAL_ROLE_MISMATCH',
      });
      return;
    }

    const anon = createEphemeralSupabaseAnon();
    const { error: authErr } = await anon.auth.signInWithPassword({
      email: profileRow.email,
      password,
    });
    if (authErr) {
      const errMsg = String(authErr.message || '');
      const errStatus = Number((authErr as { status?: number }).status || 0);
      const errCode = String((authErr as { code?: string }).code || '').toLowerCase();
      console.warn('[auth-login] signInWithPassword failed:', {
        email: profileRow.email,
        status: errStatus,
        code: errCode || undefined,
        message: errMsg,
      });

      const isEmailNotConfirmed = errCode === 'email_not_confirmed' || /email not confirmed/i.test(errMsg);
      if (REQUIRE_EMAIL_VERIFICATION && isEmailNotConfirmed) {
        if (
          !profileRow.is_active &&
          (profileRow.role === 'student' || profileRow.role === 'teacher' || profileRow.role === 'guardian')
        ) {
          const table =
            profileRow.role === 'student' ? 'students' : profileRow.role === 'teacher' ? 'teachers' : 'guardians';
          const { data: linked } = await sb.from(table).select('id').eq('profile_id', profileRow.id).maybeSingle();
          if (!linked) {
            res.status(403).json({
              error: 'Your application is pending administrator approval. Please wait until your account is activated.',
              code: 'APPLICATION_PENDING',
            });
            return;
          }
        }
        res.status(403).json({
          code: 'EMAIL_NOT_CONFIRMED',
          error: 'يرجى تأكيد بريدك الإلكتروني عبر رابط التفعيل المرسل إلى بريدك قبل تسجيل الدخول. / Please confirm your email address via the verification link sent to your inbox before signing in.',
        });
        return;
      }

      if (/invalid api key|no api key/i.test(errMsg) || errStatus >= 500) {
        sendInternalError(res, 'auth-login-supabase-config', authErr, 'Authentication service configuration error');
        return;
      }
      if (errStatus === 429 || /rate limit|too many requests/i.test(errMsg)) {
        res.status(429).json({ error: 'Too many authentication attempts. Please wait a moment and try again.' });
        return;
      }
      if (/email logins are disabled|email_provider_disabled/i.test(errMsg)) {
        res.status(403).json({ error: 'Email and password sign-in is currently disabled in Supabase Authentication settings.' });
        return;
      }

      const { data: uData } = await sb.auth.admin.getUserById(profileRow.id).catch(() => ({ data: { user: null } }));
      const authUserObj = uData?.user;
      const appProviders = Array.isArray(authUserObj?.app_metadata?.providers)
        ? (authUserObj.app_metadata.providers as string[])
        : [];
      const identityProviders = Array.isArray(authUserObj?.identities)
        ? authUserObj.identities.map((id) => id.provider).filter((p): p is string => Boolean(p))
        : [];
      const allProviders = new Set([...appProviders, ...identityProviders]);
      if (allProviders.has('google') && !allProviders.has('email')) {
        res.status(401).json({
          error: 'This email is linked via Google Sign-In without an email password yet. Sign in with Google or use Forgot Password to set one.',
          code: 'GOOGLE_ONLY_ACCOUNT',
        });
        return;
      }
      recordAccountFailure(lockoutKey, cleanEmail);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    profile = profileRow as AuthUser;
  }

  if (!profile) {
    recordAccountFailure(lockoutKey, cleanEmail);
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (!profile.is_active) {
    if (profile.role === 'student' || profile.role === 'teacher' || profile.role === 'guardian') {
      const table =
        profile.role === 'student' ? 'students' : profile.role === 'teacher' ? 'teachers' : 'guardians';
      const { data: linked } = await sb.from(table).select('id').eq('profile_id', profile.id).maybeSingle();
      if (!linked) {
        res.status(403).json({
          error: 'Your application is pending administrator approval. Please wait until your account is activated.',
          code: 'APPLICATION_PENDING',
        });
        return;
      }
    }
    res.status(403).json({ error: 'Account disabled or not active. Please contact academy administration.' });
    return;
  }

  clearAccountFailure(lockoutKey, cleanEmail);
  const tv = await getProfileTokenVersion(sb, profile.id);
  const token = signToken({
    id: profile.id,
    role: profile.role,
    ...(tokenGuardianId ? { guardianId: tokenGuardianId } : {}),
    tv,
    exp: Date.now() + SESSION_TTL_MS,
  });
  setSessionCookie(req, res, token);
  res.json({
    token,
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      preferred_lang: profile.preferred_lang,
      ...(tokenGuardianId ? { guardian_id: tokenGuardianId } : {}),
    },
  });
}));

app.post('/api/auth/logout', (req, res) => {
  const token = extractRequestToken(req);
  if (token) {
    invalidateAuthSessionCacheForToken(token);
    const decoded = verifyToken(token);
    if (decoded?.jti) {
      revokeTokenJti(decoded.jti, decoded.exp);
    }
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/session', asyncHandler(async (req, res) => {
  const token = extractRequestToken(req);
  const decoded = token ? verifyToken(token) : null;
  if (!decoded || !token) {
    if (token) invalidateAuthSessionCacheForToken(token);
    res.json({ user: null });
    return;
  }
  const sb = requireSupabaseAdmin();
  const resolved = await resolveVerifiedAuthUserCached(sb, token, decoded);
  if (!resolved) {
    clearSessionCookie(req, res);
    res.json({ user: null });
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME] && !cookies[CSRF_COOKIE_NAME]) {
    issueCsrfCookie(req, res);
  }
  res.json({ user: resolved });
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
  const sb = requireSupabaseAdmin();

  if (req.user!.role === 'guardian' && req.user!.guardian_id) {
    const gAuth = await getGuardianAuth(sb, req.user!.guardian_id);
    if (gAuth) {
      if (!verifyVaultPassword(currentPassword, gAuth.password_salt, gAuth.password_hash)) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }
      const { salt, hash } = hashVaultPassword(newPassword);
      await saveGuardianAuth(sb, {
        ...gAuth,
        password_salt: salt,
        password_hash: hash,
        updated_at: new Date().toISOString(),
      });
      const { data: prof } = await sb.from('profiles').select('role').eq('id', req.user!.id).maybeSingle();
      if (prof?.role === 'guardian') {
        await sb.auth.admin.updateUserById(req.user!.id, { password: newPassword }).catch(() => {});
      }
      const nextTv = await bumpProfileTokenVersion(sb, req.user!.id);
      const freshToken = signToken({
        id: req.user!.id,
        role: 'guardian',
        guardianId: req.user!.guardian_id,
        tv: nextTv,
        exp: Date.now() + SESSION_TTL_MS,
      });
      setSessionCookie(req, res, freshToken);
      await writeAuditLog(req.user!.id, auditActorName(req.user!), 'CHANGE_PASSWORD', 'guardian', req.user!.guardian_id, {});
      res.json({ ok: true, token: freshToken });
      return;
    }
  }

  const anon = createEphemeralSupabaseAnon();
  const { error: verifyErr } = await anon.auth.signInWithPassword({
    email: req.user!.email,
    password: currentPassword,
  });
  if (verifyErr) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const { error: updateErr } = await sb.auth.admin.updateUserById(req.user!.id, {
    password: newPassword,
  });
  if (updateErr) {
    sendInternalError(res, 'auth-change-password', updateErr, 'Failed to update password');
    return;
  }

  const nextTv = await bumpProfileTokenVersion(sb, req.user!.id);
  const freshToken = signToken({
    id: req.user!.id,
    role: req.user!.role,
    tv: nextTv,
    exp: Date.now() + SESSION_TTL_MS,
  });
  setSessionCookie(req, res, freshToken);
  await writeAuditLog(req.user!.id, auditActorName(req.user!), 'CHANGE_PASSWORD', 'profile', req.user!.id, {});
  res.json({ ok: true, token: freshToken });
}));

app.post('/api/auth/forgot-password', loginLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email(),
    turnstileToken: z.string().max(4096).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email is required.' });
    return;
  }
  const captchaCheck = await verifyTurnstileToken(parsed.data.turnstileToken, req.ip);
  if (!captchaCheck.ok) {
    res.status(400).json({ error: captchaCheck.reason || 'CAPTCHA verification failed.' });
    return;
  }
  const baseUrl = IS_PRODUCTION
    ? resolvePublicBaseUrl(req)
    : (() => {
        const rawOrigin = String(req.headers.origin || process.env.APP_URL || '').trim().replace(/\/+$/, '');
        return /^https?:\/\/[a-zA-Z0-9.-]+(:\d+)?$/.test(rawOrigin) ? rawOrigin : resolvePublicBaseUrl(req);
      })();
  const redirectTo = `${baseUrl}/login?mode=reset-password`;
  const result = await requestSupabasePasswordReset(parsed.data.email.toLowerCase(), redirectTo);
  if (!result.sent && result.reason) {
    console.warn('[auth] forgot-password reset delivery fallback:', result.reason);
  }
  res.json({
    ok: true,
    emailSentViaSupabase: result.sent,
    mode: result.sent ? 'supabase_email' : 'admin_assisted',
  });
}));

app.post('/api/auth/resend-confirmation', resendConfirmIpLimiter, resendConfirmEmailLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email().max(160),
    turnstileToken: z.string().max(4096).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email is required.' });
    return;
  }

  const captchaCheck = await verifyTurnstileToken(parsed.data.turnstileToken, req.ip);
  if (!captchaCheck.ok) {
    res.status(400).json({ error: captchaCheck.reason || 'CAPTCHA verification failed.' });
    return;
  }

  const cleanEmail = parsed.data.email.toLowerCase();
  const now = Date.now();
  for (const [k, ts] of resendConfirmationCooldownMap.entries()) {
    if (now - ts >= RESEND_CONFIRM_COOLDOWN_MS) resendConfirmationCooldownMap.delete(k);
  }
  while (resendConfirmationCooldownMap.size > 5000) {
    const oldest = resendConfirmationCooldownMap.keys().next().value;
    if (oldest === undefined) break;
    resendConfirmationCooldownMap.delete(oldest);
  }

  const lastSentAt = resendConfirmationCooldownMap.get(cleanEmail) || 0;
  const withinCooldown = now - lastSentAt < RESEND_CONFIRM_COOLDOWN_MS;

  if (!withinCooldown) {
    resendConfirmationCooldownMap.set(cleanEmail, now);
    if (REQUIRE_EMAIL_VERIFICATION) {
      const sb = requireSupabaseAdmin();
      const { data: profileRow } = await sb
        .from('profiles')
        .select('id, email, is_active')
        .eq('email', cleanEmail)
        .is('deleted_at', null)
        .maybeSingle();

      if (profileRow && profileRow.is_active) {
        const redirectTo = `${resolvePublicBaseUrl(req)}/login?confirmed=1`;
        await sendSignupConfirmationIfNeeded(sb, profileRow.id, profileRow.email, redirectTo);
      }
    }
  }

  res.json({
    ok: true,
    message: 'إذا كان البريد مسجلاً ومفعّلاً ولم يتم تأكيده بعد، فسيتم إرسال رابط التفعيل قريباً. / If this approved account still requires email confirmation, a verification link has been sent.',
  });
}));

app.post('/api/auth/complete-password-reset', loginLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    access_token: z.string().min(20).max(8192),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid recovery token and a new password (min 8 chars) are required.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const { data: authData, error: authErr } = await sb.auth.getUser(parsed.data.access_token);
  if (authErr || !authData?.user?.id || !authData.user.email) {
    res.status(401).json({ error: 'Invalid or expired password recovery link. Please request a new reset email.' });
    return;
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', authData.user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile) {
    res.status(404).json({ error: 'No academy profile found for this recovery link.' });
    return;
  }

  const { error: updateErr } = await sb.auth.admin.updateUserById(authData.user.id, {
    password: parsed.data.newPassword,
  });
  if (updateErr) {
    sendInternalError(res, 'auth-complete-password-reset', updateErr, 'Failed to reset password');
    return;
  }

  await bumpProfileTokenVersion(sb, profile.id);
  await writeAuditLog(profile.id, auditActorName(profile), 'PASSWORD_RESET_COMPLETED', 'profile', profile.id, {
    masked_email: maskEmail(profile.email),
  });
  res.json({ ok: true, email: profile.email });
}));

app.post('/api/auth/register-guardian', guardianVerifyLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    password: z.string().min(8).max(128),
    student_code: z.string().trim().min(4).max(40),
    phone: z.string().trim().max(32).optional(),
    relation: z.string().trim().max(40).optional(),
    google_access_token: z.string().max(8192).optional(),
    turnstileToken: z.string().max(4096).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Please fill all required fields accurately (password min 8 chars, valid email and student code).',
    });
    return;
  }

  const captchaCheck = await verifyTurnstileToken(parsed.data.turnstileToken, req.ip);
  if (!captchaCheck.ok) {
    res.status(400).json({ error: captchaCheck.reason || 'CAPTCHA verification failed.' });
    return;
  }

  const cleanEmail = parsed.data.email.toLowerCase();
  const cleanCode = parsed.data.student_code.trim().toUpperCase();
  const sb = requireSupabaseAdmin();

  const { data: studentRow } = await sb
    .from('students')
    .select('id, profile_id, student_code, full_name_ar, guardian_id, profiles(id, email, role, is_active), guardians(id, profile_id, full_name, email, phone)')
    .eq('student_code', cleanCode)
    .is('deleted_at', null)
    .maybeSingle();

  if (!studentRow) {
    res.status(400).json({
      error: 'Unable to match this student code with the provided email. Please verify both details or contact Academy administration.',
    });
    return;
  }

  const rawGuardian = Array.isArray(studentRow.guardians) ? studentRow.guardians[0] : studentRow.guardians;
  const guardianRecord = (rawGuardian ?? null) as unknown as {
    id: number;
    profile_id: string | null;
    full_name: string;
    email: string;
    phone: string;
  } | null;

  const rawStudentProfile = Array.isArray(studentRow.profiles) ? studentRow.profiles[0] : studentRow.profiles;
  const studentProfile = (rawStudentProfile ?? null) as unknown as {
    id: string;
    email: string;
    role: string;
    is_active: boolean;
  } | null;

  const registeredGuardianEmail = guardianRecord?.email?.trim().toLowerCase() || '';
  const studentProfileEmail = studentProfile?.email?.trim().toLowerCase() || '';

  if (!guardianRecord || (!registeredGuardianEmail && !studentProfileEmail) || (cleanEmail !== registeredGuardianEmail && cleanEmail !== studentProfileEmail)) {
    res.status(400).json({
      error: 'Unable to match this student code with the provided email. Please verify both details or contact Academy administration.',
    });
    return;
  }

  const existingGuardianAuth = await getGuardianAuth(sb, guardianRecord.id);
  if (guardianRecord.profile_id || existingGuardianAuth?.status === 'approved') {
    res.status(409).json({
      error: 'This student is already linked to a guardian account. Please sign in with your guardian password or contact administration.',
    });
    return;
  }

  const existingPending = (await listGuardianRequests(sb)).find(
    (r) =>
      r.status === 'pending' &&
      (r.student_code.toUpperCase() === cleanCode ||
        r.guardian_id === guardianRecord.id ||
        r.email.toLowerCase() === cleanEmail)
  );
  if (existingPending) {
    res.status(409).json({
      error: 'A guardian activation request for this student code or email is already pending administrator approval.',
    });
    return;
  }

  const { data: existingProfile } = await sb
    .from('profiles')
    .select('id, role, is_active')
    .eq('email', cleanEmail)
    .is('deleted_at', null)
    .maybeSingle();

  let userId: string;
  let alreadyExisted = false;
  let sharedStudentEmail = false;

  if (existingProfile) {
    if (existingProfile.role === 'student') {
      sharedStudentEmail = true;
      userId = existingProfile.id;
    } else if (existingProfile.role === 'guardian') {
      res.status(409).json({
        error: 'A guardian account with this email already exists or is awaiting review.',
      });
      return;
    } else {
      res.status(409).json({
        error: 'This email is already registered under a teacher or administrator role.',
      });
      return;
    }
  } else {
    const verifiedGoogle = parsed.data.google_access_token
      ? await verifyVerifiedGoogleToken(sb, parsed.data.google_access_token)
      : null;
    const googleVerifiedForEmail = Boolean(verifiedGoogle && verifiedGoogle.email === cleanEmail);
    const provisioned = await provisionSupabaseAuthUser(cleanEmail, parsed.data.password, parsed.data.full_name, 'guardian', {
      emailConfirm: googleVerifiedForEmail,
    });
    userId = provisioned.user.id;
    alreadyExisted = provisioned.alreadyExisted;

    if (alreadyExisted) {
      if (!googleVerifiedForEmail) {
        res.status(409).json({
          error: 'An authentication account already exists for this email. Verify with Google Sign-In or contact Academy administration.',
        });
        return;
      }
      const { data: upd, error: updErr } = await sb.auth.admin.updateUserById(userId, {
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { ...(provisioned.user.user_metadata || {}), full_name: parsed.data.full_name, role: 'guardian' },
      });
      if (updErr || !upd.user) {
        sendInternalError(res, 'guardian-register-prepare', updErr, 'Failed to prepare guardian account');
        return;
      }
      userId = upd.user.id;
    }

    const { error: profErr } = await sb.from('profiles').upsert(
      {
        id: userId,
        email: cleanEmail,
        full_name: parsed.data.full_name,
        role: 'guardian',
        is_active: false,
        preferred_lang: 'ar',
      },
      { onConflict: 'id' }
    );
    if (profErr) {
      if (!alreadyExisted) {
        await sb.auth.admin.deleteUser(userId).catch(() => {});
      }
      sendInternalError(res, 'guardian-register-profile', profErr, 'Failed to create guardian profile');
      return;
    }
  }

  const nowIso = new Date().toISOString();
  const { salt, hash } = hashVaultPassword(parsed.data.password);
  const reqId = generateApplicationId();

  try {
    await saveGuardianAuth(sb, {
      guardian_id: guardianRecord.id,
      email: cleanEmail,
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || guardianRecord.phone || '',
      relation: parsed.data.relation || 'ولي أمر',
      linked_profile_id: userId,
      password_salt: salt,
      password_hash: hash,
      status: 'pending',
      created_at: nowIso,
      updated_at: nowIso,
    });

    await saveGuardianRequest(sb, {
      id: reqId,
      profile_id: userId,
      guardian_id: guardianRecord.id,
      student_id: Number(studentRow.id),
      student_code: studentRow.student_code,
      student_name: String(studentRow.full_name_ar || ''),
      full_name: parsed.data.full_name,
      email: cleanEmail,
      phone: parsed.data.phone || guardianRecord.phone || '',
      relation: parsed.data.relation || 'ولي أمر',
      status: 'pending',
      shared_student_email: sharedStudentEmail,
      created_at: nowIso,
    });
  } catch (err) {
    await deleteGuardianAuth(sb, guardianRecord.id);
    if (!sharedStudentEmail) {
      await deletePendingAuthProfileIfSafe(sb, userId);
    }
    throw err;
  }

  await writeAuditLog(
    userId,
    auditActorName({ id: userId, role: 'guardian', full_name: parsed.data.full_name }),
    'REGISTER_GUARDIAN_REQUEST',
    'guardian',
    guardianRecord.id,
    {
      request_id: reqId,
      student_id: studentRow.id,
      student_code: studentRow.student_code,
      shared_student_email: sharedStudentEmail,
    }
  );
  void broadcastRealtimeEvent('admission:created', { kind: 'guardian_request' });

  res.status(201).json({
    status: 'pending_approval',
    request_id: reqId,
    student_code: studentRow.student_code,
    email: cleanEmail,
  });
}));

// Ephemeral single-use OAuth handoff store for cross-site iframe / COOP popup fallback
const oauthHandoffMap = new Map<string, { access_token?: string; error?: string; expiresAt: number }>();
const OAUTH_HANDOFF_TTL_MS = 120_000;
const oauthHandoffReadLimiter = createRateLimiter('oauth-handoff-read', 5 * 60 * 1000, 180);

function pruneOauthHandoffMap() {
  const now = Date.now();
  for (const [k, v] of oauthHandoffMap.entries()) {
    if (v.expiresAt <= now) oauthHandoffMap.delete(k);
  }
  while (oauthHandoffMap.size > 500) {
    const oldest = oauthHandoffMap.keys().next().value;
    if (!oldest) break;
    oauthHandoffMap.delete(oldest);
  }
}

app.post('/api/auth/oauth-handoff', loginLimiter, (req, res) => {
  const schema = z.object({
    state: z.string().regex(/^[a-zA-Z0-9_-]{16,96}$/),
    access_token: z.string().max(8192).optional(),
    error: z.string().max(300).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid OAuth handoff payload' });
    return;
  }
  pruneOauthHandoffMap();
  oauthHandoffMap.set(parsed.data.state, {
    access_token: parsed.data.access_token,
    error: parsed.data.error,
    expiresAt: Date.now() + OAUTH_HANDOFF_TTL_MS,
  });
  res.json({ ok: true });
});

app.get('/api/auth/oauth-handoff/:state', oauthHandoffReadLimiter, (req, res) => {
  const state = String(req.params.state || '');
  if (!/^[a-zA-Z0-9_-]{16,96}$/.test(state)) {
    res.status(400).json({ error: 'Invalid state' });
    return;
  }
  pruneOauthHandoffMap();
  const entry = oauthHandoffMap.get(state);
  if (!entry) {
    res.json({ ready: false });
    return;
  }
  oauthHandoffMap.delete(state);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ready: true,
    access_token: entry.access_token || null,
    error: entry.error || null,
  });
});

app.get('/auth/google-callback.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`(function(){
  var closeBtn = document.getElementById('close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function(){ try { window.close(); } catch(e){} });
  }
  var hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  var queryParams = new URLSearchParams(window.location.search || '');
  var state = queryParams.get('oauth_state') || '';
  var accessToken = hashParams.get('access_token') || '';
  var errorMsg = queryParams.get('error_description') || queryParams.get('error') || hashParams.get('error_description') || hashParams.get('error') || '';
  var payload = { type: 'NB_GOOGLE_OAUTH', state: state, access_token: accessToken, error: errorMsg };

  var titleEl = document.getElementById('title');
  var msgEl = document.getElementById('msg');
  if (errorMsg) {
    if (titleEl) titleEl.textContent = 'تعذر إتمام تسجيل الدخول عبر Google';
    if (msgEl) msgEl.textContent = errorMsg;
  } else if (accessToken) {
    if (titleEl) titleEl.textContent = 'تم التحقق من حساب Google بنجاح';
    if (msgEl) msgEl.textContent = 'يمكنك العودة إلى نافذة المنصة أو إغلاق هذه النافذة.';
  } else {
    if (titleEl) titleEl.textContent = 'لم يتم استلام رمز التحقق';
    if (msgEl) msgEl.textContent = 'يرجى إغلاق النافذة والمحاولة مرة أخرى.';
    payload.error = 'Missing access token from Google OAuth callback.';
  }

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch (e) {}
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      var ch = new BroadcastChannel('nb_google_oauth');
      ch.postMessage(payload);
      ch.close();
    }
  } catch (e) {}

  if (state && /^[a-zA-Z0-9_-]{16,96}$/.test(state)) {
    fetch('/api/auth/oauth-handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: state, access_token: accessToken || undefined, error: payload.error || undefined }),
      keepalive: true
    }).catch(function(){}).finally(function(){
      setTimeout(function(){ try { window.close(); } catch(e){} }, 350);
    });
  } else {
    setTimeout(function(){ try { window.close(); } catch(e){} }, 350);
  }
})();`);
});

app.get(['/auth/google-callback', '/auth/google-callback/'], (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Google Sign-In — أكاديمية نور وبيان</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#FAF8F3;color:#0F213E;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
    .box{max-width:400px;background:#fff;border:1px solid #E5DEC9;border-radius:16px;padding:28px;box-shadow:0 8px 30px rgba(15,33,62,.06)}
    h1{font-size:18px;margin:0 0 10px}
    p{font-size:14px;color:#475569;margin:0 0 18px;line-height:1.6}
    button{background:#0F766E;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13px;cursor:pointer}
  </style>
</head>
<body>
  <div class="box">
    <h1 id="title">جاري إتمام التحقق من حساب Google...</h1>
    <p id="msg">سيتم إرجاعك تلقائياً إلى المنصة خلال لحظات.</p>
    <button id="close-btn" type="button">إغلاق النافذة</button>
  </div>
  <script src="/auth/google-callback.js"></script>
</body>
</html>`);
});

app.post('/api/auth/google', loginLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    access_token: z.string().min(20).max(8192),
    intent: z.enum(['login', 'prefill']).default('login'),
    portalRole: z.enum(['student', 'teacher', 'guardian', 'admin']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Google OAuth token payload.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const verified = await verifyVerifiedGoogleToken(sb, parsed.data.access_token);
  if (!verified) {
    res.status(401).json({ error: 'Invalid, unverified, or non-Google session token.' });
    return;
  }

  const cleanEmail = verified.email;
  const googleName = verified.fullName;

  if (parsed.data.intent === 'prefill') {
    res.json({
      status: 'prefill',
      googleProfile: {
        email: cleanEmail,
        full_name: googleName,
      },
    });
    return;
  }

  const { data: profile } = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active, preferred_lang')
    .eq('email', cleanEmail)
    .is('deleted_at', null)
    .maybeSingle();

  if (!profile) {
    res.json({
      status: 'needs_registration',
      googleProfile: {
        email: cleanEmail,
        full_name: googleName,
      },
    });
    return;
  }

  if (parsed.data.portalRole === 'teacher' || profile.role === 'teacher') {
    res.status(403).json({
      error: 'Teacher portal sign-in is disabled.',
      code: 'TEACHER_PORTAL_DISABLED',
    });
    return;
  }

  if (parsed.data.portalRole === 'guardian' && profile.role === 'student') {
    res.status(403).json({
      error: 'Please sign in to the Guardian Portal using the dedicated Guardian password set during activation.',
      code: 'GUARDIAN_PASSWORD_REQUIRED',
    });
    return;
  }

  if (parsed.data.portalRole && parsed.data.portalRole !== profile.role) {
    res.status(403).json({
      error: 'This account is registered under a different portal role. Please select the matching role tab above.',
      code: 'PORTAL_ROLE_MISMATCH',
    });
    return;
  }

  if (!profile.is_active) {
    if (profile.role === 'student' || profile.role === 'teacher' || profile.role === 'guardian') {
      const table =
        profile.role === 'student' ? 'students' : profile.role === 'teacher' ? 'teachers' : 'guardians';
      const { data: linked } = await sb.from(table).select('id').eq('profile_id', profile.id).maybeSingle();
      if (!linked) {
        res.status(403).json({
          error: 'Your application is pending administrator approval. Please wait until your account is activated.',
          code: 'APPLICATION_PENDING',
        });
        return;
      }
    }
    res.status(403).json({ error: 'Account is disabled. Please contact academy administration.' });
    return;
  }

  const tv = await getProfileTokenVersion(sb, profile.id);
  const token = signToken({ id: profile.id, role: profile.role, tv, exp: Date.now() + SESSION_TTL_MS });
  setSessionCookie(req, res, token);

  await writeAuditLog(profile.id, auditActorName(profile), 'LOGIN_GOOGLE_OAUTH', 'profile', profile.id, {
    masked_email: maskEmail(cleanEmail),
    role: profile.role,
  });

  res.json({
    status: 'authenticated',
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
  const cacheKey = `student:${req.user!.id}`;
  const cachedPayload = getCachedRoleDashboard<Record<string, unknown>>(cacheKey);
  if (cachedPayload) {
    res.json(cachedPayload);
    return;
  }

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
    courseExamsRes,
    examResultsRes,
    recitationsRes,
    evaluationsRes,
    allAnnouncementsRes,
    annTargetsRes,
    certificatesRes,
    gamesRes,
    gameProgressRes,
    lessonMetasMap,
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
    courseIds.length
      ? sb
          .from('exams')
          .select('*, courses(title_ar, title_en)')
          .in('course_id', courseIds)
          .is('deleted_at', null)
          .order('exam_date', { ascending: false })
      : Promise.resolve({ data: [] }),
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
    listLessonMetas(sb),
  ]);

  const lessons = (lessonsRes.data || [])
    .map((l: Record<string, unknown>) => {
      const c = l.courses as { title_ar?: string; title_en?: string } | null;
      const { courses: _c, ...rest } = l;
      const lid = Number(rest.id);
      const lm = lessonMetasMap.get(lid);
      return {
        ...rest,
        id: lid,
        course_title_ar: c?.title_ar ?? null,
        course_title_en: c?.title_en ?? null,
        weekday_ar: lm?.weekday_ar ?? '',
        is_published: lm ? lm.is_published : true,
        published_at: lm?.published_at ?? null,
      };
    })
    .filter((l) => l.is_published);

  const lessonIds = lessons.map((l) => l.id);

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

  const resultByExamId = new Map<number, Record<string, unknown>>();
  for (const er of examResults) {
    resultByExamId.set(Number((er as Record<string, unknown>).exam_id), er as Record<string, unknown>);
  }

  const [lessonLinksRes, exams] = await Promise.all([
    lessonIds.length
      ? sb.from('lesson_links').select('*').in('lesson_id', lessonIds)
      : Promise.resolve({ data: [] }),
    Promise.all(
      (courseExamsRes.data || []).map(async (ex: Record<string, unknown>) => {
        const c = ex.courses as { title_ar?: string; title_en?: string } | null;
        const { courses: _c, ...rest } = ex;
        const eid = Number(rest.id);
        const [cfg, sub, attempt] = await Promise.all([
          getExamVaultConfig(sb, eid),
          getExamSubmission(sb, eid, student.id),
          getExamAttempt(sb, eid, student.id),
        ]);
        const resultRow = resultByExamId.get(eid) || null;
        const hasSubmittedOrGraded = Boolean(sub || resultRow);
        const canRevealAnswers = Boolean(hasSubmittedOrGraded && cfg.show_answers_after_submit);
        const nowMs = Date.now();
        const limitMin = Number(cfg.time_limit_minutes || 0);
        const remainingSeconds =
          attempt && limitMin > 0
            ? Math.max(0, Math.floor((new Date(attempt.expires_at).getTime() - nowMs) / 1000))
            : limitMin > 0
            ? limitMin * 60
            : null;
        const isExpired = Boolean(attempt && limitMin > 0 && new Date(attempt.expires_at).getTime() <= nowMs);
        return {
          ...rest,
          id: eid,
          course_title_ar: c?.title_ar ?? null,
          course_title_en: c?.title_en ?? null,
          ...sanitizeExamConfigForViewer(cfg, { isPrivileged: false, canRevealAnswers }),
          attempt: attempt
            ? {
                started_at: attempt.started_at,
                expires_at: attempt.expires_at,
                remaining_seconds: remainingSeconds,
                is_expired: isExpired,
              }
            : null,
          server_now: new Date(nowMs).toISOString(),
          submission: sanitizeSubmissionForViewer(sub),
          result: resultRow
            ? {
                score: resultRow.score,
                feedback_ar: resultRow.feedback_ar,
                feedback_en: resultRow.feedback_en,
                graded_at: resultRow.graded_at,
              }
            : null,
        };
      })
    ),
  ]);
  const lessonLinks = lessonLinksRes.data || [];

  const payload = {
    student,
    enrollments,
    lessons,
    lessonLinks,
    attendance,
    exams,
    examResults,
    recitations,
    evaluations,
    announcements,
    certificates,
    games,
  };
  setCachedRoleDashboard(cacheKey, payload);
  res.json(payload);
}));

app.post('/api/student/games/progress', authenticate, requireRole('student'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    game_slug: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
    score: z.number().int().min(0).max(1000).optional().default(0),
    stars: z.number().int().min(0).max(1000).optional().default(0),
    completed_levels: z
      .union([
        z.number().int().min(0).max(1000),
        z.array(z.union([z.number().int().min(0).max(1000), z.string().trim().max(64)])).max(100),
      ])
      .optional()
      .default(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid game progress payload.' });
    return;
  }

  const { game_slug, score, stars, completed_levels } = parsed.data;
  const sb = requireSupabaseAdmin();
  const [{ data: student }, { data: game }] = await Promise.all([
    sb.from('students').select('id').eq('profile_id', req.user!.id).is('deleted_at', null).maybeSingle(),
    sb.from('games').select('id').eq('slug', game_slug).maybeSingle(),
  ]);

  if (!student || !game) {
    res.status(404).json({ error: 'Student or game not found' });
    return;
  }

  const nextScore = score;
  const nextStars = stars;
  const nextLevels = Array.isArray(completed_levels) ? completed_levels.length : completed_levels;

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
  const cacheKey = `guardian:${req.user!.id}`;
  const cachedPayload = getCachedRoleDashboard<Record<string, unknown>>(cacheKey);
  if (cachedPayload) {
    res.json(cachedPayload);
    return;
  }

  const sb = requireSupabaseAdmin();
  const guardian = await findGuardianForUser(sb, req.user!);

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
    const emptyPayload = {
      guardian,
      children: [],
      enrollments: [],
      attendance: [],
      recitations: [],
      exams: [],
      examResults: [],
      evaluations: [],
      certificates: [],
    };
    setCachedRoleDashboard(cacheKey, emptyPayload);
    res.json(emptyPayload);
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

  const childCoursePairs = enrollments.map((e: Record<string, unknown>) => ({
    student_id: Number(e.student_id),
    course_id: Number(e.course_id),
  }));
  const allChildCourseIds = Array.from(new Set(childCoursePairs.map((p) => p.course_id)));
  const guardianExamsRaw = allChildCourseIds.length
    ? (
        await sb
          .from('exams')
          .select('*, courses(title_ar, title_en)')
          .in('course_id', allChildCourseIds)
          .is('deleted_at', null)
          .order('exam_date', { ascending: false })
      ).data || []
    : [];

  const guardianExamResultMap = new Map<string, Record<string, unknown>>();
  for (const er of examResults) {
    const rec = er as Record<string, unknown>;
    guardianExamResultMap.set(`${Number(rec.exam_id)}:${Number(rec.student_id)}`, rec);
  }

  const examSubPairs: Array<{ student_id: number; course_id: number; ex: Record<string, unknown> }> = [];
  for (const { student_id, course_id } of childCoursePairs) {
    const matching = guardianExamsRaw.filter((ex: Record<string, unknown>) => Number(ex.course_id) === course_id);
    for (const ex of matching) {
      examSubPairs.push({ student_id, course_id, ex });
    }
  }

  const guardianExamConfigs = new Map<number, ExamVaultConfig>();
  const [, guardianSubmissions] = await Promise.all([
    Promise.all(
      guardianExamsRaw.map(async (ex: Record<string, unknown>) => {
        const eid = Number(ex.id);
        guardianExamConfigs.set(eid, await getExamVaultConfig(sb, eid));
      })
    ),
    Promise.all(
      examSubPairs.map(({ student_id, ex }) => getExamSubmission(sb, Number(ex.id), student_id))
    ),
  ]);

  const guardianExams = examSubPairs.map(({ student_id, course_id, ex }, idx) => {
    const eid = Number(ex.id);
    const c = ex.courses as { title_ar?: string; title_en?: string } | null;
    const cfg = guardianExamConfigs.get(eid)!;
    const sub = guardianSubmissions[idx];
    const resRow = guardianExamResultMap.get(`${eid}:${student_id}`) || null;
    return {
      id: eid,
      student_id,
      course_id,
      title_ar: ex.title_ar,
      title_en: ex.title_en,
      exam_date: ex.exam_date,
      max_score: ex.max_score,
      course_title_ar: c?.title_ar ?? null,
      course_title_en: c?.title_en ?? null,
      ...sanitizeExamConfigForViewer(cfg, { isPrivileged: false, canRevealAnswers: false }),
      submission: sanitizeSubmissionForViewer(sub),
      result: resRow
        ? {
            score: resRow.score,
            feedback_ar: resRow.feedback_ar,
            feedback_en: resRow.feedback_en,
            graded_at: resRow.graded_at,
          }
        : null,
    };
  });

  const payload = {
    guardian,
    children,
    enrollments,
    attendance,
    recitations,
    exams: guardianExams,
    examResults,
    evaluations,
    certificates,
  };
  setCachedRoleDashboard(cacheKey, payload);
  res.json(payload);
}));

app.post('/api/guardian/link-child', authenticate, requireRole('guardian'), guardianVerifyLimiter, asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    student_code: z.string().trim().min(4).max(40),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid student code is required.' });
    return;
  }

  const cleanCode = parsed.data.student_code.trim().toUpperCase();
  const cleanUserEmail = req.user!.email.trim().toLowerCase();
  const sb = requireSupabaseAdmin();

  let myGuardian = await findGuardianForUser(sb, req.user!);

  if (!myGuardian) {
    myGuardian = await insertRowSafe<{ id: number; profile_id: string | null; full_name: string; phone: string; email: string; relation: string }>('guardians', {
      profile_id: req.user!.id,
      full_name: req.user!.full_name,
      phone: '',
      email: cleanUserEmail,
      relation: 'ولي أمر',
    });
  }

  const { data: studentRow } = await sb
    .from('students')
    .select('id, student_code, full_name_ar, guardian_id, profiles(email), guardians(id, profile_id, email)')
    .eq('student_code', cleanCode)
    .is('deleted_at', null)
    .maybeSingle();

  if (!studentRow) {
    res.status(404).json({ error: 'Student code not found.' });
    return;
  }

  const rawCurrentGuardian = Array.isArray(studentRow.guardians) ? studentRow.guardians[0] : studentRow.guardians;
  const currentGuardian = (rawCurrentGuardian ?? null) as unknown as {
    id: number;
    profile_id: string | null;
    email: string;
  } | null;
  const rawStuProf = Array.isArray(studentRow.profiles) ? studentRow.profiles[0] : studentRow.profiles;
  const stuProfEmail = (rawStuProf as { email?: string } | null)?.email?.trim().toLowerCase() || '';
  const studentGuardianEmail = currentGuardian?.email?.trim().toLowerCase() || '';

  if (cleanUserEmail !== studentGuardianEmail && cleanUserEmail !== stuProfEmail) {
    res.status(403).json({
      error: 'Your account email does not match the registered guardian email for this student.',
    });
    return;
  }

  if (currentGuardian?.profile_id && currentGuardian.profile_id !== req.user!.id) {
    res.status(409).json({
      error: 'This student is already linked to a different guardian account.',
    });
    return;
  }

  if (studentRow.guardian_id !== myGuardian.id) {
    await sb.from('students').update({ guardian_id: myGuardian.id }).eq('id', studentRow.id);
  }

  await writeAuditLog(req.user!.id, auditActorName(req.user!), 'GUARDIAN_LINK_CHILD', 'student', studentRow.id, {
    student_code: studentRow.student_code,
    guardian_id: myGuardian.id,
  });

  res.json({ ok: true, student_code: studentRow.student_code, full_name_ar: studentRow.full_name_ar });
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

const ADMIN_TEACHER_PREFIX = 'admin:';
const ADMIN_TEACHER_REF_REGEX = /^admin:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ensureTeacherForAdminProfile(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  profileId: string
): Promise<{ id: number; name_ar: string; created: boolean }> {
  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active, deleted_at')
    .eq('id', profileId)
    .maybeSingle();
  if (profErr || !profile || profile.deleted_at || !profile.is_active || profile.role !== 'admin') {
    throw new AppError(400, 'Selected administrator account is not active');
  }

  const { data: existingTeacher } = await sb
    .from('teachers')
    .select('id, name_ar')
    .eq('profile_id', profileId)
    .is('deleted_at', null)
    .maybeSingle();
  if (existingTeacher) {
    return {
      id: Number(existingTeacher.id),
      name_ar: String(existingTeacher.name_ar || profile.full_name || 'المدير'),
      created: false,
    };
  }

  const displayName = String(profile.full_name || profile.email || 'المدير').trim() || 'المدير';
  const inserted = await insertRowSafe<{ id: number }>('teachers', {
    profile_id: profileId,
    name_ar: displayName,
    name_en: displayName,
    bio_ar: '',
    bio_en: '',
    qualifications_ar: '',
    qualifications_en: '',
    specialty_ar: 'إدارة وتعليم القرآن والعلوم الشرعية',
    specialty_en: 'Academy Director & Instructor',
    avatar_url: '/assets/images/teacher_portrait_1.webp',
    hourly_rate: 0,
    is_public: true,
  });

  return { id: inserted.id, name_ar: displayName, created: true };
}

async function resolveTeacherRefToId(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  raw: number | string | null | undefined
): Promise<number | null> {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase().startsWith(ADMIN_TEACHER_PREFIX)) {
      const uuid = trimmed.slice(ADMIN_TEACHER_PREFIX.length).trim();
      if (!z.string().uuid().safeParse(uuid).success) {
        throw new AppError(400, 'Invalid administrator teacher reference');
      }
      const linked = await ensureTeacherForAdminProfile(sb, uuid);
      return linked.id;
    }
    const parsedNum = Number(trimmed);
    if (!Number.isInteger(parsedNum) || parsedNum <= 0) {
      throw new AppError(400, 'Invalid teacher ID');
    }
    raw = parsedNum;
  }
  const tid = Number(raw);
  if (!Number.isInteger(tid) || tid <= 0) {
    throw new AppError(400, 'Invalid teacher ID');
  }
  const { data: teacherRow } = await sb
    .from('teachers')
    .select('id')
    .eq('id', tid)
    .is('deleted_at', null)
    .maybeSingle();
  if (!teacherRow) {
    throw new AppError(400, 'Selected teacher does not exist');
  }
  return tid;
}

async function assertCourseHasStudent(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  courseId: number,
  studentId: number
): Promise<boolean> {
  const { data } = await sb
    .from('enrollments')
    .select('id')
    .eq('course_id', courseId)
    .eq('student_id', studentId)
    .is('deleted_at', null)
    .limit(1);
  return Boolean(data && data.length > 0);
}

async function assertTeacherOwnsCourse(teacherId: number, courseId: number): Promise<boolean> {
  const sb = requireSupabaseAdmin();
  const [{ data }, courseMeta] = await Promise.all([
    sb
      .from('courses')
      .select('id, teacher_id')
      .eq('id', courseId)
      .is('deleted_at', null)
      .maybeSingle(),
    getCourseMeta(sb, courseId),
  ]);
  if (!data) return false;
  if (Number(data.teacher_id) === teacherId) return true;
  return Boolean(courseMeta?.co_teacher_ids?.includes(teacherId));
}

async function getCourseIdsForTeacher(sb: ReturnType<typeof requireSupabaseAdmin>, teacherId: number): Promise<number[]> {
  const [{ data: primaryRows }, courseMetasMap] = await Promise.all([
    sb.from('courses').select('id').eq('teacher_id', teacherId).is('deleted_at', null),
    listCourseMetas(sb),
  ]);
  const ids = new Set<number>((primaryRows || []).map((r: { id: number }) => Number(r.id)));
  for (const [cid, meta] of courseMetasMap.entries()) {
    if (meta.co_teacher_ids?.includes(teacherId)) ids.add(cid);
  }
  return Array.from(ids);
}

async function assertTeacherTeachesStudent(teacherId: number, studentId: number, courseId?: number): Promise<boolean> {
  const sb = requireSupabaseAdmin();
  const teacherCourseIds = await getCourseIdsForTeacher(sb, teacherId);
  if (!teacherCourseIds.length) return false;
  if (courseId) {
    if (!teacherCourseIds.includes(courseId)) return false;
    const { data } = await sb
      .from('enrollments')
      .select('id')
      .eq('course_id', courseId)
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .limit(1);
    return Boolean(data && data.length > 0);
  }
  const { data } = await sb
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .in('course_id', teacherCourseIds)
    .is('deleted_at', null)
    .limit(1);
  return Boolean(data && data.length > 0);
}

app.get('/api/teacher/dashboard', authenticate, asyncHandler<AuthRequest>(async (_req, res) => {
  res.status(403).json({ error: 'Teacher portal has been disabled.', code: 'TEACHER_PORTAL_DISABLED' });
  return;
}));

app.get('/api/teacher/_disabled_dashboard_unused', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const cacheKey = `teacher:${req.user!.id}`;
  const cachedPayload = getCachedRoleDashboard<Record<string, unknown>>(cacheKey);
  if (cachedPayload) {
    res.json(cachedPayload);
    return;
  }

  const teacher = await getTeacherByProfile(req.user!.id);
  if (!teacher) {
    res.status(404).json({ error: 'Teacher profile not found' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const assignedCourseIds = await getCourseIdsForTeacher(sb, teacher.id);
  const [{ data: courseRows }, courseMetasMap, lessonMetasMap] = await Promise.all([
    assignedCourseIds.length
      ? sb
          .from('courses')
          .select('*, levels(name_ar, name_en)')
          .in('id', assignedCourseIds)
          .is('deleted_at', null)
          .order('id', { ascending: true })
      : Promise.resolve({ data: [] }),
    listCourseMetas(sb),
    listLessonMetas(sb),
  ]);

  const courses = (courseRows || []).map((c: Record<string, unknown>) => {
    const l = c.levels as { name_ar?: string; name_en?: string } | null;
    const { levels: _l, ...rest } = c;
    const cid = Number(rest.id);
    const meta = courseMetasMap.get(cid);
    return {
      ...rest,
      id: cid,
      level_name_ar: l?.name_ar ?? null,
      level_name_en: l?.name_en ?? null,
      cover_url: meta?.cover_url ?? null,
      price_monthly_sar: meta?.price_monthly_sar ?? null,
    };
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
    const lid = Number(rest.id);
    const lm = lessonMetasMap.get(lid);
    return {
      ...rest,
      id: lid,
      course_title_ar: c?.title_ar ?? null,
      course_title_en: c?.title_en ?? null,
      weekday_ar: lm?.weekday_ar ?? '',
      is_published: lm ? lm.is_published : true,
      published_at: lm?.published_at ?? null,
    };
  });

  const lessonIds = lessons.map((l) => l.id);
  const rawExams = examsRes.data || [];
  const rawExamIds = rawExams.map((ex: Record<string, unknown>) => Number(ex.id));

  const [attendanceRes, lessonLinksRes, examResultsRes, examVaultBundles] = await Promise.all([
    lessonIds.length
      ? sb.from('attendance').select('*, lessons!inner(course_id)').in('lesson_id', lessonIds)
      : Promise.resolve({ data: [] }),
    lessonIds.length
      ? sb.from('lesson_links').select('*').in('lesson_id', lessonIds).order('id', { ascending: true })
      : Promise.resolve({ data: [] }),
    rawExamIds.length
      ? sb.from('exam_results').select('*, exams(course_id, title_ar), students(full_name_ar)').in('exam_id', rawExamIds)
      : Promise.resolve({ data: [] }),
    Promise.all(
      rawExams.map(async (ex: Record<string, unknown>) => {
        const eid = Number(ex.id);
        const [cfg, subs] = await Promise.all([
          getExamVaultConfig(sb, eid),
          listExamSubmissionsForExam(sb, eid),
        ]);
        return { eid, cfg, subs };
      })
    ),
  ]);

  const attendance = (attendanceRes.data || []).map((a: Record<string, unknown>) => {
    const l = a.lessons as { course_id?: number } | null;
    const { lessons: _l, ...rest } = a;
    return { ...rest, course_id: l?.course_id ?? null };
  });
  const lessonLinks = lessonLinksRes.data || [];
  const examResultsRows = examResultsRes.data || [];

  const examResults = examResultsRows.map((er: Record<string, unknown>) => {
    const ex = er.exams as { course_id?: number; title_ar?: string } | null;
    const s = er.students as { full_name_ar?: string } | null;
    const { exams: _ex, students: _s, ...rest } = er;
    return {
      ...rest,
      course_id: ex?.course_id ?? null,
      exam_title_ar: ex?.title_ar ?? null,
      student_name_ar: s?.full_name_ar ?? null,
    };
  });

  const gradedByExamId = new Map<number, number>();
  for (const er of examResultsRows as Array<Record<string, unknown>>) {
    const eid = Number(er.exam_id);
    gradedByExamId.set(eid, (gradedByExamId.get(eid) || 0) + 1);
  }

  const exams = rawExams.map((ex: Record<string, unknown>, idx: number) => {
    const c = ex.courses as { title_ar?: string; title_en?: string } | null;
    const { courses: _c, ...rest } = ex;
    const { eid, cfg, subs } = examVaultBundles[idx];
    return {
      ...rest,
      id: eid,
      course_title_ar: c?.title_ar ?? null,
      course_title_en: c?.title_en ?? null,
      ...sanitizeExamConfigForViewer(cfg, { isPrivileged: true }),
      submission_count: subs.length,
      pending_grading_count: subs.filter((s) => s.status === 'submitted_pending').length,
      graded_count: gradedByExamId.get(eid) || 0,
    };
  });

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

  const payload = {
    teacher,
    courses,
    students,
    lessons,
    lessonLinks,
    attendance,
    exams,
    examResults,
    recitations,
    evaluations,
    payroll: payrollRes.data || [],
    payoutDetails,
  };
  setCachedRoleDashboard(cacheKey, payload);
  res.json(payload);
}));

app.get('/api/teacher/students/:studentId', authenticate, asyncHandler<AuthRequest>(async (_req, res) => {
  res.status(403).json({ error: 'Teacher portal has been disabled.', code: 'TEACHER_PORTAL_DISABLED' });
}));

app.post('/api/teacher/attendance', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    lesson_id: z.coerce.number().int().positive(),
    student_id: z.coerce.number().int().positive(),
    status: z.enum(['present', 'absent', 'late', 'excused']),
    notes: z.string().trim().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid attendance payload.' });
    return;
  }
  const { lesson_id, student_id, status, notes } = parsed.data;
  const sb = requireSupabaseAdmin();
  const { data: lesson } = await sb
    .from('lessons')
    .select('id, course_id')
    .eq('id', lesson_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!lesson) {
    res.status(404).json({ error: 'Lesson not found' });
    return;
  }

  if (req.user!.role === 'admin') {
    if (!(await assertCourseHasStudent(sb, lesson.course_id, student_id))) {
      res.status(400).json({ error: 'Student is not enrolled in this course' });
      return;
    }
  } else {
    const teacher = await getTeacherByProfile(req.user!.id);
    if (
      !teacher ||
      !(await assertTeacherOwnsCourse(teacher.id, lesson.course_id)) ||
      !(await assertTeacherTeachesStudent(teacher.id, student_id, lesson.course_id))
    ) {
      res.status(403).json({ error: 'Forbidden: cannot record attendance outside your courses' });
      return;
    }
  }

  const { data: existing } = await sb
    .from('attendance')
    .select('id')
    .eq('lesson_id', lesson.id)
    .eq('student_id', student_id)
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
      student_id,
      status,
      notes: notes || '',
      recorded_by: req.user!.id,
      recorded_at: new Date().toISOString(),
    });
  }

  void broadcastRealtimeEvent('attendance:updated', { kind: 'attendance' });

  res.json({ ok: true });
}));

app.post('/api/teacher/exam-results', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    exam_id: z.coerce.number().int().positive(),
    student_id: z.coerce.number().int().positive(),
    score: z.coerce.number().min(0),
    feedback_ar: z.string().trim().max(1000).optional(),
    feedback_en: z.string().trim().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid exam result payload.' });
    return;
  }
  const { exam_id, student_id, score, feedback_ar, feedback_en } = parsed.data;
  const sb = requireSupabaseAdmin();
  const { data: exam } = await sb
    .from('exams')
    .select('id, course_id, title_ar, title_en, max_score')
    .eq('id', exam_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!exam) {
    res.status(404).json({ error: 'Exam not found' });
    return;
  }

  if (req.user!.role === 'admin') {
    if (!(await assertCourseHasStudent(sb, exam.course_id, student_id))) {
      res.status(400).json({ error: 'Student is not enrolled in this course' });
      return;
    }
  } else {
    const teacher = await getTeacherByProfile(req.user!.id);
    if (
      !teacher ||
      !(await assertTeacherOwnsCourse(teacher.id, exam.course_id)) ||
      !(await assertTeacherTeachesStudent(teacher.id, student_id, exam.course_id))
    ) {
      res.status(403).json({ error: 'Forbidden: cannot grade outside your courses' });
      return;
    }
  }

  const maxScore = Number(exam.max_score || 100);
  if (!Number.isFinite(score) || score < 0 || score > maxScore) {
    res.status(400).json({ error: `Score must be between 0 and ${maxScore}` });
    return;
  }

  const { data: existing } = await sb
    .from('exam_results')
    .select('id')
    .eq('exam_id', exam.id)
    .eq('student_id', student_id)
    .maybeSingle();

  const gradedAt = new Date().toISOString();
  if (existing) {
    await sb
      .from('exam_results')
      .update({
        score,
        feedback_ar: feedback_ar || '',
        feedback_en: feedback_en || '',
        graded_by: req.user!.id,
        graded_at: gradedAt,
      })
      .eq('id', existing.id);
  } else {
    await insertRowSafe('exam_results', {
      exam_id: exam.id,
      student_id,
      score,
      feedback_ar: feedback_ar || '',
      feedback_en: feedback_en || '',
      graded_by: req.user!.id,
      graded_at: gradedAt,
    });
  }

  const existingSub = await getExamSubmission(sb, exam.id, student_id);
  if (existingSub) {
    await saveExamSubmission(sb, {
      ...existingSub,
      status: 'graded',
      graded_at: gradedAt,
    });
  }

  await notifyStudentAndGuardian(
    sb,
    student_id,
    `تم رصد درجة: ${exam.title_ar}`,
    `Exam Graded: ${exam.title_en}`,
    `درجتك: ${score} / ${maxScore}`,
    `Score: ${score} / ${maxScore}`
  );
  await writeAuditLog(req.user!.id, req.user!.full_name, 'GRADE_EXAM', 'exam', exam.id, {
    student_id,
    score,
  });
  void broadcastRealtimeEvent('academic:updated', { kind: 'exam_result' });

  res.json({ ok: true });
}));

app.post('/api/teacher/recitations', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    student_id: z.coerce.number().int().positive(),
    course_id: z.coerce.number().int().positive(),
    surah_name: z.string().trim().min(1).max(100),
    ayah_from: z.coerce.number().int().min(1).max(300),
    ayah_to: z.coerce.number().int().min(1).max(300),
    tajweed_score: z.coerce.number().min(0).max(100),
    memorization_score: z.coerce.number().min(0).max(100),
    notes_ar: z.string().trim().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid recitation record payload.' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const { student_id, course_id, surah_name, ayah_from, ayah_to, tajweed_score, memorization_score, notes_ar } = parsed.data;

  if (req.user!.role === 'admin') {
    if (!(await assertCourseHasStudent(sb, course_id, student_id))) {
      res.status(400).json({ error: 'Student is not enrolled in this course' });
      return;
    }
  } else {
    const teacher = await getTeacherByProfile(req.user!.id);
    if (
      !teacher ||
      !(await assertTeacherOwnsCourse(teacher.id, course_id)) ||
      !(await assertTeacherTeachesStudent(teacher.id, student_id, course_id))
    ) {
      res.status(403).json({ error: 'Forbidden: student not in your course' });
      return;
    }
  }

  const inserted = await insertRowSafe<{ id: number }>('recitations', {
    student_id,
    course_id,
    surah_name,
    ayah_from,
    ayah_to,
    tajweed_score,
    memorization_score,
    notes_ar: notes_ar || '',
    recorded_by: req.user!.id,
  });

  void broadcastRealtimeEvent('academic:updated', { kind: 'recitation' });

  res.status(201).json({ id: inserted.id });
}));

app.post('/api/teacher/evaluations', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    student_id: z.coerce.number().int().positive(),
    course_id: z.coerce.number().int().positive(),
    period: z.string().trim().min(1).max(60),
    behavior_score: z.coerce.number().min(0).max(100),
    participation_score: z.coerce.number().min(0).max(100),
    summary_ar: z.string().trim().min(1).max(1000),
    summary_en: z.string().trim().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid evaluation payload.' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const { student_id, course_id, period, behavior_score, participation_score, summary_ar, summary_en } = parsed.data;

  if (req.user!.role === 'admin') {
    if (!(await assertCourseHasStudent(sb, course_id, student_id))) {
      res.status(400).json({ error: 'Student is not enrolled in this course' });
      return;
    }
  } else {
    const teacher = await getTeacherByProfile(req.user!.id);
    if (
      !teacher ||
      !(await assertTeacherOwnsCourse(teacher.id, course_id)) ||
      !(await assertTeacherTeachesStudent(teacher.id, student_id, course_id))
    ) {
      res.status(403).json({ error: 'Forbidden: student not in your course' });
      return;
    }
  }

  const inserted = await insertRowSafe<{ id: number }>('evaluations', {
    student_id,
    course_id,
    period,
    behavior_score,
    participation_score,
    summary_ar,
    summary_en: summary_en || summary_ar,
    evaluated_by: req.user!.id,
  });

  void broadcastRealtimeEvent('academic:updated', { kind: 'evaluation' });

  res.status(201).json({ id: inserted.id });
}));

app.put('/api/teacher/payout-details', authenticate, asyncHandler<AuthRequest>(async (_req, res) => {
  res.status(403).json({ error: 'Teacher portal has been disabled.', code: 'TEACHER_PORTAL_DISABLED' });
  return;
}));

app.put('/api/teacher/_disabled_payout_unused', authenticate, requireRole('teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const teacher = await getTeacherByProfile(req.user!.id);
  if (!teacher) {
    res.status(404).json({ error: 'Teacher not found' });
    return;
  }
  const payoutSchema = z.object({
    account_holder_name: z.string().trim().min(2).max(120),
    bank_name: z.string().trim().min(2).max(120),
    iban: z
      .string()
      .max(64)
      .transform((v) => v.replace(/\s+/g, '').toUpperCase())
      .refine((v) => !/^\d{13,19}$/.test(v), 'Card numbers are prohibited. Please enter a valid IBAN starting with country letters.')
      .refine((v) => /^[A-Z0-9]{15,34}$/.test(v), 'IBAN must be 15 to 34 alphanumeric characters.'),
  });

  const parsed = payoutSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstMsg = parsed.error.issues[0]?.message;
    res.status(400).json({
      error: firstMsg || 'Valid account holder, bank name, and IBAN are required (no card numbers or CVV)',
    });
    return;
  }

  const { account_holder_name, bank_name, iban: cleanIban } = parsed.data;
  const encryptedIban = encryptIban(cleanIban);
  const sb = requireSupabaseAdmin();
  const { data: existing } = await sb.from('teacher_payout_details').select('id').eq('teacher_id', teacher.id).maybeSingle();

  if (existing) {
    await sb
      .from('teacher_payout_details')
      .update({
        account_holder_name,
        bank_name,
        iban: encryptedIban,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await insertRowSafe('teacher_payout_details', {
      teacher_id: teacher.id,
      account_holder_name,
      bank_name,
      iban: encryptedIban,
      updated_at: new Date().toISOString(),
    });
  }

  res.json({ masked_iban: maskIban(encryptedIban) });
}));

// ============================================================================
// LESSON LINKS, RECORDINGS & MATERIAL STORAGE (Role-Scoped)
// ============================================================================
const LESSON_MATERIALS_BUCKET = 'lesson-materials';
const STORAGE_PREFIX = `storage://${LESSON_MATERIALS_BUCKET}/`;
const MAX_MATERIAL_BYTES = 8 * 1024 * 1024;
const ALLOWED_MATERIAL_EXTENSIONS = new Set([
  'pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'ppt', 'pptx', 'mp3', 'm4a',
]);
const DISALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'm4v']);

function verifyLessonMaterialFile(ext: string, buffer: Buffer): string {
  const isPdf = buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a;
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
  const isOle2 =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1;
  const isMp3 =
    (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'ID3') ||
    (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  const isM4a = buffer.length >= 8 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';

  switch (ext) {
    case 'pdf':
      if (!isPdf) throw new AppError(400, 'Invalid PDF file signature.');
      return 'application/pdf';
    case 'png':
      if (!isPng) throw new AppError(400, 'Invalid PNG image signature.');
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      if (!isJpeg) throw new AppError(400, 'Invalid JPEG image signature.');
      return 'image/jpeg';
    case 'webp':
      if (!isWebp) throw new AppError(400, 'Invalid WEBP image signature.');
      return 'image/webp';
    case 'doc':
      if (!isOle2) throw new AppError(400, 'Invalid DOC file signature.');
      return 'application/msword';
    case 'ppt':
      if (!isOle2) throw new AppError(400, 'Invalid PPT file signature.');
      return 'application/vnd.ms-powerpoint';
    case 'docx':
      if (!isZip) throw new AppError(400, 'Invalid DOCX file signature.');
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'pptx':
      if (!isZip) throw new AppError(400, 'Invalid PPTX file signature.');
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'mp3':
      if (!isMp3) throw new AppError(400, 'Invalid MP3 audio signature.');
      return 'audio/mpeg';
    case 'm4a':
      if (!isM4a) throw new AppError(400, 'Invalid M4A audio signature.');
      return 'audio/mp4';
    default:
      throw new AppError(400, 'Unsupported file type.');
  }
}

async function ensureMaterialsBucket(sb: ReturnType<typeof requireSupabaseAdmin>) {
  const { data: bucket } = await sb.storage.getBucket(LESSON_MATERIALS_BUCKET);
  if (!bucket) {
    const { error } = await sb.storage.createBucket(LESSON_MATERIALS_BUCKET, {
      public: false,
      fileSizeLimit: MAX_MATERIAL_BYTES,
    });
    if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
      console.error('[materials-bucket]', error);
      throw new AppError(
        500,
        IS_PRODUCTION ? 'Storage bucket initialization failed' : `Storage bucket initialization failed: ${error.message}`
      );
    }
  }
}

async function assertCanManageLesson(user: AuthUser, lessonId: number) {
  const sb = requireSupabaseAdmin();
  const { data: lesson } = await sb
    .from('lessons')
    .select('id, course_id, courses!inner(id, teacher_id)')
    .eq('id', lessonId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!lesson) {
    throw new AppError(404, 'Lesson not found');
  }

  if (user.role === 'admin') {
    return { sb, lesson };
  }

  if (user.role === 'teacher') {
    const teacher = await getTeacherByProfile(user.id);
    if (teacher && (await assertTeacherOwnsCourse(teacher.id, Number(lesson.course_id)))) {
      return { sb, lesson };
    }
  }

  throw new AppError(403, 'Forbidden: cannot modify lesson links outside your courses');
}

async function assertCanAccessLesson(user: AuthUser, lessonId: number) {
  const sb = requireSupabaseAdmin();
  const { data: lesson } = await sb
    .from('lessons')
    .select('id, course_id, courses!inner(id, teacher_id)')
    .eq('id', lessonId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!lesson) {
    throw new AppError(404, 'Lesson not found');
  }

  if (user.role === 'admin') return { sb, lesson };

  if (user.role === 'teacher') {
    const teacher = await getTeacherByProfile(user.id);
    if (teacher && (await assertTeacherOwnsCourse(teacher.id, Number(lesson.course_id)))) return { sb, lesson };
  }

  if (user.role === 'student') {
    const { data: student } = await sb
      .from('students')
      .select('id')
      .eq('profile_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (student) {
      const { data: enroll } = await sb
        .from('enrollments')
        .select('id')
        .eq('student_id', student.id)
        .eq('course_id', lesson.course_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (enroll) return { sb, lesson };
    }
  }

  if (user.role === 'guardian') {
    const guardian = await findGuardianForUser(sb, user);
    if (guardian) {
      const { data: children } = await sb
        .from('students')
        .select('id')
        .eq('guardian_id', guardian.id)
        .is('deleted_at', null);
      const childIds = (children || []).map((c: { id: number }) => c.id);
      if (childIds.length) {
        const { data: enroll } = await sb
          .from('enrollments')
          .select('id')
          .in('student_id', childIds)
          .eq('course_id', lesson.course_id)
          .is('deleted_at', null)
          .limit(1);
        if (enroll && enroll.length > 0) return { sb, lesson };
      }
    }
  }

  throw new AppError(403, 'Forbidden: not enrolled in this course');
}

app.post('/api/lessons/:lessonId/links', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const lessonId = parsePositiveIntParam(req.params.lessonId, 'lesson id');
  await assertCanManageLesson(req.user!, lessonId);

  const schema = z.object({
    title_ar: z.string().trim().min(1).max(160),
    title_en: z.string().trim().max(160).optional(),
    url: z
      .string()
      .trim()
      .url()
      .refine((v) => /^https?:\/\//i.test(v), 'URL must start with http:// or https://'),
    link_type: z.enum(['zoom', 'meet', 'material', 'recording']),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid link title, type, and https:// URL are required.' });
    return;
  }

  const inserted = await insertRowSafe<{ id: number; lesson_id: number; title_ar: string; title_en: string; url: string; link_type: string }>(
    'lesson_links',
    {
      lesson_id: lessonId,
      title_ar: parsed.data.title_ar,
      title_en: parsed.data.title_en || parsed.data.title_ar,
      url: parsed.data.url,
      link_type: parsed.data.link_type,
    }
  );

  await writeAuditLog(req.user!.id, req.user!.full_name, 'ADD_LESSON_LINK', 'lesson', lessonId, {
    link_type: parsed.data.link_type,
    title_ar: parsed.data.title_ar,
  });

  res.status(201).json({ link: inserted });
}));

app.post(
  '/api/lessons/:lessonId/upload-material',
  examUploadLimiter,
  authenticate,
  requireRole('admin', 'teacher'),
  express.json({ limit: '14mb' }),
  asyncHandler<AuthRequest>(async (req, res) => {
    const lessonId = parsePositiveIntParam(req.params.lessonId, 'lesson id');
    const { sb } = await assertCanManageLesson(req.user!, lessonId);

    const schema = z.object({
      fileName: z.string().trim().min(1).max(180),
      mimeType: z.string().trim().max(120).optional(),
      base64Data: z.string().min(1),
      title_ar: z.string().trim().max(160).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid file upload payload.' });
      return;
    }

    const rawName = parsed.data.fileName;
    const ext = rawName.includes('.') ? rawName.split('.').pop()!.toLowerCase() : '';
    if (DISALLOWED_VIDEO_EXTENSIONS.has(ext)) {
      res.status(400).json({
        error: 'Direct video uploads are disabled to protect storage quota. Please upload the video to Google Drive or YouTube Unlisted and paste its link as a Recording.',
      });
      return;
    }
    if (!ALLOWED_MATERIAL_EXTENSIONS.has(ext)) {
      res.status(400).json({
        error: 'Unsupported file type. Allowed: PDF, PNG, JPG, WEBP, DOC/DOCX, PPT/PPTX, MP3/M4A.',
      });
      return;
    }

    const base64Clean = parsed.data.base64Data.includes(',')
      ? parsed.data.base64Data.split(',').pop() || ''
      : parsed.data.base64Data;
    const buffer = Buffer.from(base64Clean, 'base64');
    if (!buffer.length || buffer.length > MAX_MATERIAL_BYTES) {
      res.status(400).json({ error: 'File exceeds maximum allowed size of 8 MB.' });
      return;
    }

    const verifiedMime = verifyLessonMaterialFile(ext, buffer);

    await ensureMaterialsBucket(sb);
    const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || `file.${ext}`;
    const objectPath = `lessons/${lessonId}/${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${safeBase}`;

    const { error: uploadErr } = await sb.storage
      .from(LESSON_MATERIALS_BUCKET)
      .upload(objectPath, buffer, {
        contentType: verifiedMime,
        upsert: false,
      });

    if (uploadErr) {
      sendInternalError(res, 'lesson-upload-material', uploadErr, 'Material upload failed');
      return;
    }

    const storedUrl = `${STORAGE_PREFIX}${objectPath}`;
    const displayTitle = parsed.data.title_ar?.trim() || rawName;
    const inserted = await insertRowSafe<{ id: number; lesson_id: number; title_ar: string; title_en: string; url: string; link_type: string }>(
      'lesson_links',
      {
        lesson_id: lessonId,
        title_ar: displayTitle,
        title_en: displayTitle,
        url: storedUrl,
        link_type: 'material',
      }
    );

    await writeAuditLog(req.user!.id, req.user!.full_name, 'UPLOAD_LESSON_MATERIAL', 'lesson', lessonId, {
      fileName: rawName,
      bytes: buffer.length,
    });

    res.status(201).json({ link: inserted });
  })
);

app.delete('/api/lesson-links/:id', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const linkId = parsePositiveIntParam(req.params.id, 'lesson link id');
  const sb = requireSupabaseAdmin();
  const { data: linkRow } = await sb.from('lesson_links').select('*').eq('id', linkId).maybeSingle();
  if (!linkRow) {
    res.status(404).json({ error: 'Lesson link not found' });
    return;
  }

  await assertCanManageLesson(req.user!, Number(linkRow.lesson_id));

  if (typeof linkRow.url === 'string' && linkRow.url.startsWith(STORAGE_PREFIX)) {
    const objectPath = linkRow.url.slice(STORAGE_PREFIX.length);
    await sb.storage.from(LESSON_MATERIALS_BUCKET).remove([objectPath]).catch(() => {});
  }

  await sb.from('lesson_links').delete().eq('id', linkId);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'DELETE_LESSON_LINK', 'lesson_link', linkId, {
    lesson_id: linkRow.lesson_id,
  });

  res.json({ ok: true });
}));

app.get('/api/lesson-links/:id/access', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const linkId = parsePositiveIntParam(req.params.id, 'lesson link id');
  const sb = requireSupabaseAdmin();
  const { data: linkRow } = await sb.from('lesson_links').select('*').eq('id', linkId).maybeSingle();
  if (!linkRow) {
    res.status(404).json({ error: 'Lesson attachment not found' });
    return;
  }

  await assertCanAccessLesson(req.user!, Number(linkRow.lesson_id));

  if (typeof linkRow.url === 'string' && linkRow.url.startsWith(STORAGE_PREFIX)) {
    const objectPath = linkRow.url.slice(STORAGE_PREFIX.length);
    const { data, error } = await sb.storage.from(LESSON_MATERIALS_BUCKET).createSignedUrl(objectPath, 300);
    if (error || !data?.signedUrl) {
      sendInternalError(res, 'lesson-link-access', error, 'Unable to generate download link');
      return;
    }
    res.json({ url: data.signedUrl });
    return;
  }

  res.json({ url: linkRow.url });
}));

// ============================================================================
// HARDENED HYBRID EXAM SYSTEM (PDF/Image Vault + Auto-Graded Online Quizzes)
// ============================================================================
async function insertNotificationsBulk(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  profileIds: Iterable<string>,
  titleAr: string,
  titleEn: string,
  bodyAr: string,
  bodyEn: string
) {
  const uniqueIds = Array.from(new Set(Array.from(profileIds).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!uniqueIds.length) return;
  const rows = uniqueIds.map((pid) => ({
    profile_id: pid,
    title_ar: titleAr,
    title_en: titleEn,
    body_ar: bodyAr,
    body_en: bodyEn,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await sb.from('notifications').insert(rows.slice(i, i + 200)).then(({ error }) => {
      if (error) console.error('[notifications-bulk]', error);
    });
  }
}

async function notifyStudentAndGuardian(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  studentId: number,
  titleAr: string,
  titleEn: string,
  bodyAr: string,
  bodyEn: string
) {
  const { data: studentRow } = await sb
    .from('students')
    .select('profile_id, guardians(profile_id)')
    .eq('id', studentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!studentRow) return;

  const profileIds = new Set<string>();
  if (studentRow.profile_id) profileIds.add(String(studentRow.profile_id));
  const rawG = Array.isArray(studentRow.guardians) ? studentRow.guardians[0] : studentRow.guardians;
  const gObj = rawG as { profile_id?: string | null } | null;
  if (gObj?.profile_id) profileIds.add(String(gObj.profile_id));

  await insertNotificationsBulk(sb, profileIds, titleAr, titleEn, bodyAr, bodyEn);
}

async function notifyCourseStudentsAndGuardians(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  courseId: number,
  titleAr: string,
  titleEn: string,
  bodyAr: string,
  bodyEn: string
): Promise<number> {
  const { data: enrolls } = await sb
    .from('enrollments')
    .select('student_id, students!inner(profile_id, deleted_at, guardians(profile_id))')
    .eq('course_id', courseId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .is('students.deleted_at', null);

  const profileIds = new Set<string>();
  let studentCount = 0;
  for (const row of enrolls || []) {
    studentCount += 1;
    const rawS = Array.isArray((row as { students?: unknown }).students)
      ? ((row as { students: unknown[] }).students[0])
      : (row as { students?: unknown }).students;
    const stu = rawS as { profile_id?: string | null; guardians?: unknown } | null;
    if (stu?.profile_id) profileIds.add(String(stu.profile_id));
    const rawG = Array.isArray(stu?.guardians) ? stu?.guardians[0] : stu?.guardians;
    const gObj = rawG as { profile_id?: string | null } | null;
    if (gObj?.profile_id) profileIds.add(String(gObj.profile_id));
  }

  await insertNotificationsBulk(sb, profileIds, titleAr, titleEn, bodyAr, bodyEn);
  return studentCount;
}

async function notifyCourseExamPublished(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  courseId: number,
  examTitleAr: string,
  examTitleEn: string
) {
  await notifyCourseStudentsAndGuardians(
    sb,
    courseId,
    `امتحان جديد: ${examTitleAr}`,
    `New Exam Published: ${examTitleEn}`,
    'تم نشر امتحان جديد في حلقتك. يرجى مراجعة تبويب الامتحانات والالتزام بموعد التسليم.',
    'A new exam has been published for your course. Please check the Exams tab.'
  );
  void broadcastRealtimeEvent('notification:created', { kind: 'exam' });
}

async function notifyCourseLessonPublished(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  courseId: number,
  courseTitleAr: string,
  courseTitleEn: string,
  lessonTitleAr: string,
  lessonTitleEn: string,
  scheduleHint: string
): Promise<number> {
  const count = await notifyCourseStudentsAndGuardians(
    sb,
    courseId,
    `تم نشر درس جديد: ${lessonTitleAr}`,
    `New Lesson Published: ${lessonTitleEn}`,
    `تم نشر درس جديد في كورس "${courseTitleAr}" (${scheduleHint}). يمكنك الآن فتح المرفقات وملف الـ PDF ورابط الحصة من تبويب الدروس.`,
    `A new lesson in "${courseTitleEn}" (${scheduleHint}) has been published with its links and PDF materials.`
  );
  void broadcastRealtimeEvent('notification:created', { kind: 'lesson' });
  return count;
}

async function assertCanManageExam(user: AuthUser, examId: number) {
  const sb = requireSupabaseAdmin();
  const { data: exam } = await sb
    .from('exams')
    .select('*, courses!inner(id, teacher_id, title_ar, title_en)')
    .eq('id', examId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!exam) throw new AppError(404, 'Exam not found');

  if (user.role === 'admin') {
    return { sb, exam };
  }

  if (user.role === 'teacher') {
    const teacher = await getTeacherByProfile(user.id);
    if (teacher && (await assertTeacherOwnsCourse(teacher.id, Number(exam.course_id)))) {
      return { sb, exam };
    }
  }

  throw new AppError(403, 'Forbidden: cannot manage exams outside your courses');
}

async function assertCanAccessExam(user: AuthUser, examId: number) {
  const sb = requireSupabaseAdmin();
  const { data: exam } = await sb
    .from('exams')
    .select('*, courses!inner(id, teacher_id)')
    .eq('id', examId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!exam) throw new AppError(404, 'Exam not found');

  if (user.role === 'admin') return { sb, exam, studentId: null as number | null };

  if (user.role === 'teacher') {
    const teacher = await getTeacherByProfile(user.id);
    if (teacher && (await assertTeacherOwnsCourse(teacher.id, Number(exam.course_id)))) {
      return { sb, exam, studentId: null as number | null };
    }
  }

  if (user.role === 'student') {
    const { data: student } = await sb
      .from('students')
      .select('id')
      .eq('profile_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (student) {
      const { data: enroll } = await sb
        .from('enrollments')
        .select('id')
        .eq('student_id', student.id)
        .eq('course_id', exam.course_id)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle();
      if (enroll) return { sb, exam, studentId: Number(student.id) };
    }
  }

  if (user.role === 'guardian') {
    const guardian = await findGuardianForUser(sb, user);
    if (guardian) {
      const { data: children } = await sb
        .from('students')
        .select('id')
        .eq('guardian_id', guardian.id)
        .is('deleted_at', null);
      const childIds = (children || []).map((c: { id: number }) => c.id);
      if (childIds.length) {
        const { data: enroll } = await sb
          .from('enrollments')
          .select('student_id')
          .in('student_id', childIds)
          .eq('course_id', exam.course_id)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        if (enroll) return { sb, exam, studentId: Number(enroll.student_id) };
      }
    }
  }

  throw new AppError(403, 'Forbidden: not authorized for this course exam');
}

const quizQuestionSchema = z.object({
  id: z.string().trim().min(1).max(64).optional(),
  q_type: z.enum(['mcq', 'tf']),
  prompt_ar: z.string().trim().min(1).max(600),
  prompt_en: z.string().trim().max(600).optional(),
  options_ar: z.array(z.string().trim().min(1).max(250)).min(2).max(6),
  options_en: z.array(z.string().trim().max(250)).optional(),
  correct_index: z.coerce.number().int().min(0).max(5),
  points: z.coerce.number().positive().max(100).default(1),
});

const examCreateOrUpdateSchema = z.object({
  course_id: z.coerce.number().int().positive(),
  title_ar: z.string().trim().min(2).max(180),
  title_en: z.string().trim().max(180).optional(),
  exam_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  max_score: z.coerce.number().positive().max(1000).default(100),
  exam_mode: z.enum(['file', 'quiz', 'hybrid']).default('file'),
  instructions_ar: z.string().trim().max(2000).optional(),
  instructions_en: z.string().trim().max(2000).optional(),
  available_from: z.string().trim().max(40).nullable().optional(),
  due_at: z.string().trim().max(40).nullable().optional(),
  time_limit_minutes: z.coerce.number().int().min(0).max(300).nullable().optional(),
  allow_late_submission: z.boolean().default(true),
  show_answers_after_submit: z.boolean().default(true),
  notify_students: z.boolean().default(true),
  questions: z.array(quizQuestionSchema).max(60).default([]),
});

function normalizeQuestions(raw: Array<z.infer<typeof quizQuestionSchema>>): QuizQuestionConfig[] {
  return raw.map((q, idx) => {
    const safeOptions = q.q_type === 'tf' ? ['صح', 'خطأ'] : q.options_ar;
    const safeOptionsEn = q.q_type === 'tf' ? ['True', 'False'] : (q.options_en?.length ? q.options_en : safeOptions);
    if (q.correct_index < 0 || q.correct_index >= safeOptions.length) {
      throw new AppError(400, `Question ${idx + 1}: correct option index is out of range.`);
    }
    return {
      id: q.id || `q_${idx + 1}_${crypto.randomBytes(2).toString('hex')}`,
      q_type: q.q_type,
      prompt_ar: q.prompt_ar,
      prompt_en: q.prompt_en || q.prompt_ar,
      options_ar: safeOptions,
      options_en: safeOptionsEn,
      correct_index: q.correct_index,
      points: Number(q.points || 1),
    };
  });
}

app.post('/api/exams', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const parsed = examCreateOrUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid exam payload', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const sb = requireSupabaseAdmin();
  if (req.user!.role === 'teacher') {
    const teacher = await getTeacherByProfile(req.user!.id);
    if (!teacher || !(await assertTeacherOwnsCourse(teacher.id, parsed.data.course_id))) {
      res.status(403).json({ error: 'Forbidden: you can only create exams for your assigned courses' });
      return;
    }
  }

  if ((parsed.data.exam_mode === 'quiz' || parsed.data.exam_mode === 'hybrid') && parsed.data.questions.length === 0) {
    res.status(400).json({ error: 'Online quiz and hybrid exams require at least one question.' });
    return;
  }

  const questions = normalizeQuestions(parsed.data.questions);
  const inserted = await insertRowSafe<{ id: number }>('exams', {
    course_id: parsed.data.course_id,
    title_ar: parsed.data.title_ar,
    title_en: parsed.data.title_en?.trim() || parsed.data.title_ar,
    exam_date: parsed.data.exam_date,
    max_score: parsed.data.max_score,
  });

  await saveExamVaultConfig(sb, {
    exam_id: inserted.id,
    exam_mode: parsed.data.exam_mode,
    instructions_ar: parsed.data.instructions_ar || '',
    instructions_en: parsed.data.instructions_en || parsed.data.instructions_ar || '',
    available_from: parsed.data.available_from || null,
    due_at: parsed.data.due_at || null,
    time_limit_minutes:
      parsed.data.time_limit_minutes && parsed.data.time_limit_minutes > 0
        ? parsed.data.time_limit_minutes
        : null,
    allow_late_submission: parsed.data.allow_late_submission,
    show_answers_after_submit: parsed.data.show_answers_after_submit,
    question_file: null,
    questions,
    updated_at: new Date().toISOString(),
  });

  if (parsed.data.notify_students) {
    await notifyCourseExamPublished(
      sb,
      parsed.data.course_id,
      parsed.data.title_ar,
      parsed.data.title_en?.trim() || parsed.data.title_ar
    );
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_EXAM', 'exam', inserted.id, {
    course_id: parsed.data.course_id,
    exam_mode: parsed.data.exam_mode,
    question_count: questions.length,
  });
  void broadcastRealtimeEvent('academic:updated', { kind: 'exam' });

  res.status(201).json({ id: inserted.id });
}));

app.patch('/api/exams/:examId', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const examId = parsePositiveIntParam(req.params.examId, 'exam id');
  const { sb, exam } = await assertCanManageExam(req.user!, examId);

  const partialSchema = examCreateOrUpdateSchema.partial().omit({ course_id: true, notify_students: true });
  const parsed = partialSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid exam update payload', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const dbUpdate: Record<string, unknown> = {};
  if (parsed.data.title_ar !== undefined) dbUpdate.title_ar = parsed.data.title_ar;
  if (parsed.data.title_en !== undefined) dbUpdate.title_en = parsed.data.title_en;
  if (parsed.data.exam_date !== undefined) dbUpdate.exam_date = parsed.data.exam_date;
  if (parsed.data.max_score !== undefined) dbUpdate.max_score = parsed.data.max_score;
  if (Object.keys(dbUpdate).length) {
    await sb.from('exams').update(dbUpdate).eq('id', examId);
  }

  const existingCfg = await getExamVaultConfig(sb, examId);
  const nextMode = parsed.data.exam_mode ?? existingCfg.exam_mode;
  const nextQuestions = parsed.data.questions !== undefined ? normalizeQuestions(parsed.data.questions) : existingCfg.questions;
  if ((nextMode === 'quiz' || nextMode === 'hybrid') && nextQuestions.length === 0) {
    res.status(400).json({ error: 'Online quiz and hybrid exams require at least one question.' });
    return;
  }

  await saveExamVaultConfig(sb, {
    ...existingCfg,
    exam_mode: nextMode,
    instructions_ar: parsed.data.instructions_ar ?? existingCfg.instructions_ar,
    instructions_en: parsed.data.instructions_en ?? existingCfg.instructions_en,
    available_from: parsed.data.available_from !== undefined ? parsed.data.available_from : existingCfg.available_from,
    due_at: parsed.data.due_at !== undefined ? parsed.data.due_at : existingCfg.due_at,
    time_limit_minutes:
      parsed.data.time_limit_minutes !== undefined
        ? parsed.data.time_limit_minutes && parsed.data.time_limit_minutes > 0
          ? parsed.data.time_limit_minutes
          : null
        : existingCfg.time_limit_minutes ?? null,
    allow_late_submission: parsed.data.allow_late_submission ?? existingCfg.allow_late_submission,
    show_answers_after_submit: parsed.data.show_answers_after_submit ?? existingCfg.show_answers_after_submit,
    questions: nextQuestions,
  });

  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_EXAM', 'exam', examId, {
    course_id: exam.course_id,
    exam_mode: nextMode,
  });
  void broadcastRealtimeEvent('academic:updated', { kind: 'exam' });
  res.json({ ok: true });
}));

app.delete('/api/exams/:examId', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const examId = parsePositiveIntParam(req.params.examId, 'exam id');
  const { sb } = await assertCanManageExam(req.user!, examId);
  await deleteExamVaultData(sb, examId);
  await sb.from('exams').delete().eq('id', examId);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'DELETE_EXAM', 'exam', examId, {});
  void broadcastRealtimeEvent('academic:updated', { kind: 'exam' });
  res.json({ ok: true });
}));

app.post(
  '/api/exams/:examId/question-file',
  examUploadLimiter,
  authenticate,
  requireRole('admin', 'teacher'),
  express.json({ limit: '14mb' }),
  asyncHandler<AuthRequest>(async (req, res) => {
    const examId = parsePositiveIntParam(req.params.examId, 'exam id');
    const { sb } = await assertCanManageExam(req.user!, examId);

    const schema = z.object({
      fileName: z.string().trim().min(1).max(180),
      mimeType: z.string().trim().min(1).max(120),
      base64Data: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid question file upload payload.' });
      return;
    }

    const uploadedMeta = await uploadExamBinaryFile({
      sb,
      folder: `questions/${examId}`,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      base64Data: parsed.data.base64Data,
    });

    const cfg = await getExamVaultConfig(sb, examId);
    if (cfg.question_file?.path) {
      await removeExamBinaryFile(sb, cfg.question_file.path);
    }

    await saveExamVaultConfig(sb, {
      ...cfg,
      question_file: uploadedMeta,
    });

    await writeAuditLog(req.user!.id, req.user!.full_name, 'UPLOAD_EXAM_QUESTION_FILE', 'exam', examId, {
      fileName: uploadedMeta.name,
      bytes: uploadedMeta.size_bytes,
    });
    res.status(201).json({ fileName: uploadedMeta.name, mime: uploadedMeta.mime });
  })
);

app.delete('/api/exams/:examId/question-file', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const examId = parsePositiveIntParam(req.params.examId, 'exam id');
  const { sb } = await assertCanManageExam(req.user!, examId);
  const cfg = await getExamVaultConfig(sb, examId);
  if (cfg.question_file?.path) {
    await removeExamBinaryFile(sb, cfg.question_file.path);
  }
  await saveExamVaultConfig(sb, { ...cfg, question_file: null });
  res.json({ ok: true });
}));

app.get('/api/exams/:examId/question-file', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const examId = parsePositiveIntParam(req.params.examId, 'exam id');
  const { sb } = await assertCanAccessExam(req.user!, examId);
  const cfg = await getExamVaultConfig(sb, examId);

  const isPrivileged = req.user!.role === 'admin' || req.user!.role === 'teacher';
  if (!isPrivileged && !isExamAvailableYet(cfg)) {
    res.status(403).json({ error: 'Exam question paper is not open yet.' });
    return;
  }
  if (!cfg.question_file?.path) {
    res.status(404).json({ error: 'No question PDF/file attached to this exam.' });
    return;
  }

  const signedUrl = await createExamSignedUrl(sb, cfg.question_file.path, 180);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ url: signedUrl, fileName: cfg.question_file.name, mime: cfg.question_file.mime });
}));

app.get('/api/exams/:examId/submissions', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const examId = parsePositiveIntParam(req.params.examId, 'exam id');
  const { sb, exam } = await assertCanManageExam(req.user!, examId);

  const [enrollRes, resultsRes, subs] = await Promise.all([
    sb
      .from('enrollments')
      .select('student_id, students!inner(id, student_code, full_name_ar, full_name_en, deleted_at)')
      .eq('course_id', exam.course_id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .is('students.deleted_at', null),
    sb.from('exam_results').select('*').eq('exam_id', examId),
    listExamSubmissionsForExam(sb, examId),
  ]);

  const subMap = new Map<number, ExamSubmissionRecord>();
  for (const s of subs) subMap.set(s.student_id, s);

  const resMap = new Map<number, Record<string, unknown>>();
  for (const r of resultsRes.data || []) {
    resMap.set(Number((r as { student_id: number }).student_id), r as Record<string, unknown>);
  }

  const rows = (enrollRes.data || []).map((row: Record<string, unknown>) => {
    const rawS = Array.isArray(row.students) ? row.students[0] : row.students;
    const stu = rawS as { id: number; student_code: string; full_name_ar: string; full_name_en: string };
    const sub = subMap.get(stu.id) || null;
    const result = resMap.get(stu.id) || null;
    return {
      student_id: stu.id,
      student_code: stu.student_code,
      full_name_ar: stu.full_name_ar,
      full_name_en: stu.full_name_en,
      submission: sanitizeSubmissionForViewer(sub),
      result: result
        ? {
            score: result.score,
            feedback_ar: result.feedback_ar,
            feedback_en: result.feedback_en,
            graded_at: result.graded_at,
          }
        : null,
      overall_status: result ? 'graded' : sub ? 'submitted_pending' : 'not_submitted',
    };
  });

  res.json({ exam_id: examId, max_score: exam.max_score, submissions: rows });
}));

app.post(
  '/api/exams/:examId/submit-file',
  examUploadLimiter,
  authenticate,
  requireRole('student'),
  express.json({ limit: '14mb' }),
  asyncHandler<AuthRequest>(async (req, res) => {
    const examId = parsePositiveIntParam(req.params.examId, 'exam id');
    const { sb, exam, studentId } = await assertCanAccessExam(req.user!, examId);
    if (!studentId) {
      res.status(403).json({ error: 'Student profile is not linked.' });
      return;
    }

    const schema = z.object({
      fileName: z.string().trim().min(1).max(180),
      mimeType: z.string().trim().min(1).max(120),
      base64Data: z.string().min(1),
      student_notes: z.string().trim().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid solution file upload payload.' });
      return;
    }

    const cfg = await getExamVaultConfig(sb, examId);
    if (!isExamAvailableYet(cfg)) {
      res.status(403).json({ error: 'Exam is not open for submissions yet.' });
      return;
    }
    const pastDeadline = isExamPastDeadline(cfg);
    if (pastDeadline && !cfg.allow_late_submission) {
      res.status(403).json({ error: 'Submission deadline has passed for this exam.' });
      return;
    }

    const limitMin = Number(cfg.time_limit_minutes || 0);
    const fallbackDurationMs = limitMin > 0 ? limitMin * 60_000 : 24 * 60 * 60_000;
    const fallbackExpiresAtIso = new Date(Date.now() + fallbackDurationMs).toISOString();
    const claim = await claimExamAttemptForSubmit(sb, examId, studentId, fallbackExpiresAtIso);
    if (claim.mode === 'already_submitted') {
      res.status(409).json({ error: 'A solution has already been submitted for this exam.' });
      return;
    }
    const claimedInDb = claim.mode === 'claimed';

    try {
      if (limitMin > 0 && claim.attempt) {
        if (Date.now() > new Date(claim.attempt.expires_at).getTime() + 45_000) {
          if (claimedInDb) await releaseExamAttemptClaim(sb, examId, studentId);
          res.status(403).json({ error: 'Exam time limit has expired and the exam is locked.' });
          return;
        }
      }

      const [{ data: existingResult }, existingSub] = await Promise.all([
        sb.from('exam_results').select('id').eq('exam_id', examId).eq('student_id', studentId).maybeSingle(),
        getExamSubmission(sb, examId, studentId),
      ]);
      if (existingResult || existingSub?.status === 'graded') {
        res.status(409).json({ error: 'This exam has already been graded. Ask your teacher if a re-submission is needed.' });
        return;
      }

      const uploadedMeta = await uploadExamBinaryFile({
        sb,
        folder: `submissions/${examId}/${studentId}`,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        base64Data: parsed.data.base64Data,
      });

      if (existingSub?.solution_file?.path) {
        await removeExamBinaryFile(sb, existingSub.solution_file.path);
      }

      const nowIso = new Date().toISOString();
      await saveExamSubmission(sb, {
        exam_id: examId,
        student_id: studentId,
        status: 'submitted_pending',
        submitted_at: nowIso,
        is_late: pastDeadline,
        solution_file: uploadedMeta,
        student_notes: parsed.data.student_notes || existingSub?.student_notes || '',
        quiz_answers: existingSub?.quiz_answers || [],
        auto_score: existingSub?.auto_score ?? null,
        graded_file: existingSub?.graded_file || null,
        graded_at: null,
      });

      // Notify course teacher
      const rawCourse = Array.isArray(exam.courses) ? exam.courses[0] : exam.courses;
      const teacherId = (rawCourse as { teacher_id?: number | null } | null)?.teacher_id;
      if (teacherId) {
        const { data: teacherRow } = await sb.from('teachers').select('profile_id').eq('id', teacherId).maybeSingle();
        if (teacherRow?.profile_id) {
          await insertRowSafe('notifications', {
            profile_id: teacherRow.profile_id,
            title_ar: `تسليم حل امتحان: ${exam.title_ar}`,
            title_en: `Exam Solution Submitted: ${exam.title_en}`,
            body_ar: `قام الطالب ${req.user!.full_name} برفع ملف الحل وهو بانتظار التصحيح ورصد الدرجة.`,
            body_en: `${req.user!.full_name} uploaded an exam solution awaiting grading.`,
          }).catch(() => {});
        }
      }

      await writeAuditLog(req.user!.id, auditActorName(req.user!), 'SUBMIT_EXAM_FILE', 'exam', examId, {
        student_id: studentId,
        fileName: uploadedMeta.name,
        is_late: pastDeadline,
      });
      void broadcastRealtimeEvent('academic:updated', { kind: 'exam_submission' });

      res.status(201).json({ ok: true, fileName: uploadedMeta.name, is_late: pastDeadline });
    } catch (err) {
      if (claimedInDb) {
        await releaseExamAttemptClaim(sb, examId, studentId);
      }
      throw err;
    }
  })
);

app.post(
  '/api/exams/:examId/start',
  authenticate,
  requireRole('student'),
  asyncHandler<AuthRequest>(async (req, res) => {
    const examId = parsePositiveIntParam(req.params.examId, 'exam id');
    const { sb, studentId } = await assertCanAccessExam(req.user!, examId);
    if (!studentId) {
      res.status(403).json({ error: 'Student profile is not linked.' });
      return;
    }

    const cfg = await getExamVaultConfig(sb, examId);
    if (!isExamAvailableYet(cfg)) {
      res.status(403).json({ error: 'Exam is not open yet.' });
      return;
    }
    const pastDeadline = isExamPastDeadline(cfg);
    if (pastDeadline && !cfg.allow_late_submission) {
      res.status(403).json({ error: 'Submission deadline has passed for this exam.' });
      return;
    }

    const [{ data: existingResult }, existingSub, existingAttempt] = await Promise.all([
      sb.from('exam_results').select('id').eq('exam_id', examId).eq('student_id', studentId).maybeSingle(),
      getExamSubmission(sb, examId, studentId),
      getExamAttempt(sb, examId, studentId),
    ]);
    if (existingResult || existingSub?.status === 'graded' || (existingSub && existingSub.quiz_answers.length > 0)) {
      res.status(409).json({ error: 'Exam answers have already been submitted.' });
      return;
    }

    const nowMs = Date.now();
    const limitMin = Number(cfg.time_limit_minutes || 0);
    if (existingAttempt) {
      const expiresMs = new Date(existingAttempt.expires_at).getTime();
      const remainingSeconds = limitMin > 0 ? Math.max(0, Math.floor((expiresMs - nowMs) / 1000)) : null;
      res.json({
        attempt: {
          ...existingAttempt,
          remaining_seconds: remainingSeconds,
          is_expired: Boolean(limitMin > 0 && expiresMs <= nowMs),
        },
        server_now: new Date(nowMs).toISOString(),
      });
      return;
    }

    const startedAt = new Date(nowMs);
    const durationMs = limitMin > 0 ? limitMin * 60_000 : 24 * 60 * 60_000;
    const expiresAt = new Date(nowMs + durationMs);
    const attempt = {
      exam_id: examId,
      student_id: studentId,
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };
    const persistedAttempt = await saveExamAttempt(sb, attempt);
    const persistedExpiresMs = new Date(persistedAttempt.expires_at).getTime();
    const persistedRemaining = limitMin > 0 ? Math.max(0, Math.floor((persistedExpiresMs - Date.now()) / 1000)) : null;

    res.status(persistedAttempt.started_at === attempt.started_at ? 201 : 200).json({
      attempt: {
        ...persistedAttempt,
        remaining_seconds: persistedRemaining,
        is_expired: Boolean(limitMin > 0 && persistedExpiresMs <= Date.now()),
      },
      server_now: new Date().toISOString(),
    });
  })
);

app.post(
  '/api/exams/:examId/submit-quiz',
  authenticate,
  requireRole('student'),
  examUploadLimiter,
  asyncHandler<AuthRequest>(async (req, res) => {
    const examId = parsePositiveIntParam(req.params.examId, 'exam id');
    const { sb, exam, studentId } = await assertCanAccessExam(req.user!, examId);
    if (!studentId) {
      res.status(403).json({ error: 'Student profile is not linked.' });
      return;
    }

    const schema = z.object({
      answers: z.array(
        z.object({
          question_id: z.string().trim().min(1).max(64),
          selected_index: z.coerce.number().int().min(0).max(5),
        })
      ).min(0).max(60),
      timed_out: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid quiz answers payload.' });
      return;
    }
    if (!parsed.data.timed_out && parsed.data.answers.length === 0) {
      res.status(400).json({ error: 'Please answer at least one question before submitting.' });
      return;
    }

    const cfg = await getExamVaultConfig(sb, examId);
    if (cfg.exam_mode !== 'quiz' && cfg.exam_mode !== 'hybrid') {
      res.status(400).json({ error: 'This exam does not contain interactive online questions.' });
      return;
    }
    if (!isExamAvailableYet(cfg)) {
      res.status(403).json({ error: 'Exam is not open yet.' });
      return;
    }
    const pastDeadline = isExamPastDeadline(cfg);
    if (pastDeadline && !cfg.allow_late_submission) {
      res.status(403).json({ error: 'Submission deadline has passed for this exam.' });
      return;
    }

    const quizSubmitKey = `${examId}:${studentId}`;
    if (inFlightQuizSubmits.has(quizSubmitKey)) {
      res.status(409).json({ error: 'Quiz submission is already being processed.' });
      return;
    }
    inFlightQuizSubmits.add(quizSubmitKey);

    try {
      const limitMin = Number(cfg.time_limit_minutes || 0);
      const fallbackDurationMs = limitMin > 0 ? limitMin * 60_000 : 24 * 60 * 60_000;
      const fallbackExpiresAtIso = new Date(Date.now() + fallbackDurationMs).toISOString();
      const claim = await claimExamAttemptForSubmit(sb, examId, studentId, fallbackExpiresAtIso);
      if (claim.mode === 'already_submitted') {
        res.status(409).json({ error: 'Quiz answers have already been submitted for this exam.' });
        return;
      }
      const claimedInDb = claim.mode === 'claimed';
      const attempt = claim.attempt;

      try {
        const [{ data: existingResult }, existingSub] = await Promise.all([
          sb.from('exam_results').select('id').eq('exam_id', examId).eq('student_id', studentId).maybeSingle(),
          getExamSubmission(sb, examId, studentId),
        ]);
        if (existingResult || existingSub?.status === 'graded') {
          res.status(409).json({ error: 'This exam has already been graded.' });
          return;
        }
        if (existingSub && existingSub.quiz_answers.length > 0) {
          res.status(409).json({ error: 'Quiz answers have already been submitted for this exam.' });
          return;
        }

        let isTimedOutSubmission = Boolean(parsed.data.timed_out);
        if (limitMin > 0 && attempt) {
          const expiresMs = new Date(attempt.expires_at).getTime();
          const nowMs = Date.now();
          if (nowMs >= expiresMs) {
            isTimedOutSubmission = true;
          }
          const allowedGraceMs = parsed.data.timed_out ? 180_000 : 45_000;
          if (nowMs > expiresMs + allowedGraceMs) {
            if (claimedInDb) await releaseExamAttemptClaim(sb, examId, studentId);
            res.status(403).json({ error: 'Exam countdown expired and submissions are locked.' });
            return;
          }
        }

      // 100% Server-side authoritative grading
      const answerById = new Map<string, number>();
      for (const a of parsed.data.answers) {
        answerById.set(a.question_id, a.selected_index);
      }

      let totalPoints = 0;
      let earnedPoints = 0;
      for (const q of cfg.questions) {
        const pts = Number(q.points || 1);
        totalPoints += pts;
        if (answerById.get(q.id) === q.correct_index) {
          earnedPoints += pts;
        }
      }

      const maxScore = Number(exam.max_score || 100);
      const computedScore =
        totalPoints > 0
          ? Math.round((earnedPoints / totalPoints) * maxScore * 100) / 100
          : 0;

      const nowIso = new Date().toISOString();
      const isPureQuiz = cfg.exam_mode === 'quiz';

      await saveExamSubmission(sb, {
        exam_id: examId,
        student_id: studentId,
        status: isPureQuiz ? 'graded' : 'submitted_pending',
        submitted_at: existingSub?.submitted_at || nowIso,
        is_late: pastDeadline,
        timed_out: isTimedOutSubmission,
        solution_file: existingSub?.solution_file || null,
        student_notes: existingSub?.student_notes || '',
        quiz_answers: parsed.data.answers,
        auto_score: computedScore,
        graded_file: existingSub?.graded_file || null,
        graded_at: isPureQuiz ? nowIso : null,
      });

      if (isPureQuiz) {
        const feedbackAr = isTimedOutSubmission
          ? `تم إغلاق الامتحان تلقائياً بانتهاء العداد واعتماد الإجابات المسجلة (${earnedPoints} من ${totalPoints} نقطة).`
          : `تم التصحيح التلقائي (${earnedPoints} من ${totalPoints} نقطة).`;
        const feedbackEn = isTimedOutSubmission
          ? `Auto-locked on timer expiry with saved answers (${earnedPoints} / ${totalPoints} pts).`
          : `Auto-graded (${earnedPoints} / ${totalPoints} pts).`;
        const { data: existingResultRow } = await sb
          .from('exam_results')
          .select('id')
          .eq('exam_id', examId)
          .eq('student_id', studentId)
          .maybeSingle();

        if (existingResultRow) {
          await sb
            .from('exam_results')
            .update({
              score: computedScore,
              feedback_ar: feedbackAr,
              feedback_en: feedbackEn,
              graded_at: nowIso,
            })
            .eq('id', existingResultRow.id);
        } else {
          try {
            await insertRowSafe('exam_results', {
              exam_id: examId,
              student_id: studentId,
              score: computedScore,
              feedback_ar: feedbackAr,
              feedback_en: feedbackEn,
              graded_at: nowIso,
            });
          } catch (insertErr: unknown) {
            const msg = insertErr instanceof Error ? insertErr.message : '';
            if (/duplicate key|23505/i.test(msg)) {
              res.status(409).json({ error: 'This exam has already been graded.' });
              return;
            }
            throw insertErr;
          }
        }

        await notifyStudentAndGuardian(
          sb,
          studentId,
          isTimedOutSubmission ? `انتهى مؤقت الاختبار: ${exam.title_ar}` : `نتيجة الاختبار: ${exam.title_ar}`,
          isTimedOutSubmission ? `Exam Timer Expired: ${exam.title_en}` : `Quiz Result: ${exam.title_en}`,
          isTimedOutSubmission
            ? `انتهى مؤقت الامتحان وأُغلق تلقائياً مع اعتماد إجاباتك: ${computedScore} / ${maxScore}`
            : `درجتك التلقائية: ${computedScore} / ${maxScore}`,
          isTimedOutSubmission
            ? `Exam countdown expired; auto-submitted with score: ${computedScore} / ${maxScore}`
            : `Auto-graded score: ${computedScore} / ${maxScore}`
        );
      } else if (isTimedOutSubmission) {
        await notifyStudentAndGuardian(
          sb,
          studentId,
          `إغلاق تلقائي للامتحان بانتهاء المؤقت: ${exam.title_ar}`,
          `Exam Auto-Locked on Timeout: ${exam.title_en}`,
          `انتهى مؤقت الامتحان الهجين وأُغلقت الإجابات التفاعلية تلقائياً وبانتظار التصحيح النهائي (${computedScore} / ${maxScore} تلقائياً).`,
          `Exam countdown expired and quiz answers were auto-locked pending final grading.`
        );
      }

      await writeAuditLog(req.user!.id, auditActorName(req.user!), 'SUBMIT_EXAM_QUIZ', 'exam', examId, {
        student_id: studentId,
        auto_score: computedScore,
        pure_quiz: isPureQuiz,
        timed_out: isTimedOutSubmission,
      });
      void broadcastRealtimeEvent('academic:updated', { kind: 'exam_result' });

      res.status(201).json({
        ok: true,
        auto_score: computedScore,
        max_score: maxScore,
        finalized: isPureQuiz,
      });
      } catch (err) {
        if (claimedInDb) {
          await releaseExamAttemptClaim(sb, examId, studentId);
        }
        throw err;
      }
    } finally {
      inFlightQuizSubmits.delete(quizSubmitKey);
    }
  })
);

app.post(
  '/api/exams/:examId/grade',
  examUploadLimiter,
  authenticate,
  requireRole('admin', 'teacher'),
  express.json({ limit: '14mb' }),
  asyncHandler<AuthRequest>(async (req, res) => {
    const examId = parsePositiveIntParam(req.params.examId, 'exam id');
    const { sb, exam } = await assertCanManageExam(req.user!, examId);

    const schema = z.object({
      student_id: z.coerce.number().int().positive(),
      score: z.coerce.number().min(0),
      feedback_ar: z.string().trim().max(1500).optional(),
      feedback_en: z.string().trim().max(1500).optional(),
      gradedFile: z
        .object({
          fileName: z.string().trim().min(1).max(180),
          mimeType: z.string().trim().min(1).max(120),
          base64Data: z.string().min(1),
        })
        .optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid grading payload.' });
      return;
    }

    const maxScore = Number(exam.max_score || 100);
    if (parsed.data.score > maxScore) {
      res.status(400).json({ error: `Score cannot exceed maximum score (${maxScore}).` });
      return;
    }

    const targetStudentId = parsed.data.student_id;
    const { data: enrollment } = await sb
      .from('enrollments')
      .select('id')
      .eq('course_id', exam.course_id)
      .eq('student_id', targetStudentId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!enrollment) {
      res.status(403).json({ error: 'Student is not enrolled in this exam course.' });
      return;
    }

    const existingSub = await getExamSubmission(sb, examId, targetStudentId);
    let gradedFileMeta = existingSub?.graded_file || null;
    if (parsed.data.gradedFile) {
      const uploadedGraded = await uploadExamBinaryFile({
        sb,
        folder: `graded/${examId}/${targetStudentId}`,
        fileName: parsed.data.gradedFile.fileName,
        mimeType: parsed.data.gradedFile.mimeType,
        base64Data: parsed.data.gradedFile.base64Data,
      });
      if (existingSub?.graded_file?.path) {
        await removeExamBinaryFile(sb, existingSub.graded_file.path);
      }
      gradedFileMeta = uploadedGraded;
    }

    const gradedAt = new Date().toISOString();
    const { data: existingResult } = await sb
      .from('exam_results')
      .select('id')
      .eq('exam_id', examId)
      .eq('student_id', targetStudentId)
      .maybeSingle();

    if (existingResult) {
      await sb
        .from('exam_results')
        .update({
          score: parsed.data.score,
          feedback_ar: parsed.data.feedback_ar || '',
          feedback_en: parsed.data.feedback_en || parsed.data.feedback_ar || '',
          graded_by: req.user!.id,
          graded_at: gradedAt,
        })
        .eq('id', existingResult.id);
    } else {
      await insertRowSafe('exam_results', {
        exam_id: examId,
        student_id: targetStudentId,
        score: parsed.data.score,
        feedback_ar: parsed.data.feedback_ar || '',
        feedback_en: parsed.data.feedback_en || parsed.data.feedback_ar || '',
        graded_by: req.user!.id,
        graded_at: gradedAt,
      });
    }

    await saveExamSubmission(sb, {
      exam_id: examId,
      student_id: targetStudentId,
      status: 'graded',
      submitted_at: existingSub?.submitted_at || gradedAt,
      is_late: existingSub?.is_late || false,
      solution_file: existingSub?.solution_file || null,
      student_notes: existingSub?.student_notes || '',
      quiz_answers: existingSub?.quiz_answers || [],
      auto_score: existingSub?.auto_score ?? null,
      graded_file: gradedFileMeta,
      graded_at: gradedAt,
    });

    await notifyStudentAndGuardian(
      sb,
      targetStudentId,
      `تم تصحيح ورصد درجة: ${exam.title_ar}`,
      `Exam Graded: ${exam.title_en}`,
      `الدرجة المرصودة: ${parsed.data.score} / ${maxScore}`,
      `Score recorded: ${parsed.data.score} / ${maxScore}`
    );

    await writeAuditLog(req.user!.id, req.user!.full_name, 'GRADE_EXAM', 'exam', examId, {
      student_id: targetStudentId,
      score: parsed.data.score,
      has_graded_file: Boolean(gradedFileMeta),
    });
    void broadcastRealtimeEvent('academic:updated', { kind: 'exam_result' });

    res.json({ ok: true });
  })
);

app.get('/api/exams/:examId/submissions/:studentId/file', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const examId = parsePositiveIntParam(req.params.examId, 'exam id');
  const targetStudentId = parsePositiveIntParam(req.params.studentId, 'student id');
  const kind = req.query.kind === 'graded' ? 'graded' : 'solution';

  const sb = requireSupabaseAdmin();
  const { data: exam } = await sb
    .from('exams')
    .select('id, course_id, courses!inner(teacher_id)')
    .eq('id', examId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!exam) {
    res.status(404).json({ error: 'Exam not found' });
    return;
  }

  let authorized = false;
  if (req.user!.role === 'admin') {
    authorized = true;
  } else if (req.user!.role === 'teacher') {
    const teacher = await getTeacherByProfile(req.user!.id);
    if (teacher && (await assertTeacherOwnsCourse(teacher.id, Number(exam.course_id)))) {
      authorized = true;
    }
  } else if (req.user!.role === 'student') {
    const { data: stu } = await sb.from('students').select('id').eq('profile_id', req.user!.id).is('deleted_at', null).maybeSingle();
    if (stu && Number(stu.id) === targetStudentId) authorized = true;
  } else if (req.user!.role === 'guardian') {
    const guard = await findGuardianForUser(sb, req.user!);
    if (guard) {
      const { data: stu } = await sb
        .from('students')
        .select('id')
        .eq('id', targetStudentId)
        .eq('guardian_id', guard.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (stu) authorized = true;
    }
  }

  if (!authorized) {
    res.status(403).json({ error: 'Forbidden: you are not authorized to access this exam file.' });
    return;
  }

  const sub = await getExamSubmission(sb, examId, targetStudentId);
  const fileMeta = kind === 'graded' ? sub?.graded_file : sub?.solution_file;
  if (!fileMeta?.path) {
    res.status(404).json({ error: 'Requested exam file was not found.' });
    return;
  }

  const signedUrl = await createExamSignedUrl(sb, fileMeta.path, 180);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ url: signedUrl, fileName: fileMeta.name, mime: fileMeta.mime });
}));

app.post('/api/exams/:examId/submissions/:studentId/reset', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const examId = parsePositiveIntParam(req.params.examId, 'exam id');
  const targetStudentId = parsePositiveIntParam(req.params.studentId, 'student id');
  const { sb } = await assertCanManageExam(req.user!, examId);

  await sb.from('exam_results').delete().eq('exam_id', examId).eq('student_id', targetStudentId);
  await deleteExamSubmissionRecord(sb, examId, targetStudentId);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'RESET_EXAM_SUBMISSION', 'exam', examId, {
    student_id: targetStudentId,
  });
  void broadcastRealtimeEvent('academic:updated', { kind: 'exam_submission' });
  res.json({ ok: true });
}));

// ============================================================================
// ADMIN ROUTES (Strictly role === 'admin')
// ============================================================================
let devEndpointTimingSeq = 0;

function startDevEndpointTimer(label: string): (() => void) | null {
  if (IS_PRODUCTION) return null;
  const timerId = `[dev-timing] ${label} #${++devEndpointTimingSeq}`;
  console.time(timerId);
  return () => {
    console.timeEnd(timerId);
  };
}

function parseAdminListQuery(req: express.Request) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '25'), 10) || 25));
  const q = String(req.query.q || '').trim().slice(0, 120);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, q, from, to };
}

function sanitizePostgrestOrSearch(q: string): string {
  return q
    .replace(/[\\%_]/g, (m) => `\\${m}`)
    .replace(/[(),]/g, ' ')
    .trim();
}

let warnedMissingAdminSummaryRpc = false;

async function buildAdminDashboardSummaryPayload(sb: ReturnType<typeof requireSupabaseAdmin>) {
  const { data: rpcPayload, error: rpcError } = await sb.rpc('get_admin_dashboard_summary');
  if (!rpcError && rpcPayload && typeof rpcPayload === 'object') {
    const record = rpcPayload as Record<string, unknown>;
    const legalList = Array.isArray(record.legal) ? record.legal : [];
    return {
      ...record,
      legal: legalList.map((doc) => {
        const d = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>;
        return {
          ...d,
          content_ar: normalizeLegacyDomainText(String(d.content_ar || '')),
          content_en: normalizeLegacyDomainText(String(d.content_en || '')),
        };
      }),
    };
  }

  const errCode = String((rpcError as { code?: string } | null)?.code || '');
  const errMsg = String((rpcError as { message?: string } | null)?.message || '');
  const isMissingRpc =
    errCode === 'PGRST202' ||
    errCode === '42883' ||
    errMsg.includes('get_admin_dashboard_summary');

  if (!isMissingRpc) {
    throw new Error(errMsg || 'Failed to load admin dashboard summary');
  }

  if (!warnedMissingAdminSummaryRpc) {
    warnedMissingAdminSummaryRpc = true;
    console.warn('[admin-summary] get_admin_dashboard_summary() RPC is not installed yet; falling back to multi-query mode until supabase_schema.sql is applied.');
  }
  return buildAdminDashboardSummaryFallback(sb);
}

async function buildAdminDashboardSummaryFallback(sb: ReturnType<typeof requireSupabaseAdmin>) {
  const [
    studentsCountRes,
    teachersCountRes,
    coursesCountRes,
    lessonsCountRes,
    pendingAdmissionsRes,
    levelsRes,
    gamesRes,
    legalRes,
    studentOptsRes,
    teacherOptsRes,
    adminProfilesRes,
    courseOptsRes,
    enrollmentsCourseIdsRes,
    examIdsRes,
    examResultsRes,
    guardianReqs,
    suggestionsList,
  ] = await Promise.all([
    sb.from('students').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    sb.from('teachers').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    sb.from('courses').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    sb
      .from('lessons')
      .select('id, courses!inner(deleted_at)', { count: 'exact', head: true })
      .is('deleted_at', null)
      .is('courses.deleted_at', null),
    sb.from('admission_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('levels').select('id, code, name_ar, name_en, age_range').order('order_index', { ascending: true }).limit(100),
    sb.from('games').select('id, slug, title_ar, title_en, category, is_active').order('id', { ascending: true }).limit(100),
    sb.from('legal_documents').select('doc_type, version, title_ar, title_en, content_ar, content_en').order('id', { ascending: true }).limit(50),
    sb.from('students').select('id, full_name_ar, student_code').is('deleted_at', null).order('id', { ascending: false }).limit(500),
    sb.from('teachers').select('id, profile_id, name_ar').is('deleted_at', null).order('id', { ascending: true }).limit(500),
    sb.from('profiles').select('id, full_name, email').eq('role', 'admin').eq('is_active', true).is('deleted_at', null).order('created_at', { ascending: true }).limit(50),
    sb.from('courses').select('id, title_ar, capacity').is('deleted_at', null).order('id', { ascending: false }).limit(500),
    sb.from('enrollments').select('course_id').is('deleted_at', null).limit(50000),
    sb.from('exams').select('id, courses!inner(deleted_at)').is('deleted_at', null).is('courses.deleted_at', null).limit(500),
    sb.from('exam_results').select('exam_id').limit(50000),
    listGuardianRequests(sb),
    listAllSuggestions(sb),
  ]);

  const activeAdminProfiles = (adminProfilesRes.data || []) as Array<{ id: string; full_name: string | null; email: string }>;
  const adminProfileSet = new Set(activeAdminProfiles.map((a) => String(a.id)));
  const linkedAdminProfileIds = new Set<string>();
  const teacherOptionRows = (teacherOptsRes.data || []) as Array<{ id: number; profile_id: string | null; name_ar: string }>;
  for (const t of teacherOptionRows) {
    if (t.profile_id && adminProfileSet.has(String(t.profile_id))) {
      linkedAdminProfileIds.add(String(t.profile_id));
    }
  }
  const unlinkedAdmins = activeAdminProfiles
    .filter((a) => !linkedAdminProfileIds.has(String(a.id)))
    .map((a) => {
      const displayName = String(a.full_name || a.email || 'المدير').trim();
      return {
        profile_id: String(a.id),
        full_name: displayName,
        label: `${displayName} (المدير)`,
      };
    });

  const gradedByExam = new Map<number, number>();
  for (const row of (examResultsRes.data || []) as Array<{ exam_id: number }>) {
    const eid = Number(row.exam_id);
    gradedByExam.set(eid, (gradedByExam.get(eid) || 0) + 1);
  }

  const examIds = ((examIdsRes.data || []) as Array<{ id: number }>).map((r) => Number(r.id)).filter((id) => id > 0);
  const subCounts = examIds.length
    ? await Promise.all(examIds.map((eid) => countExamSubmissionFiles(sb, eid)))
    : [];
  let pendingGrading = 0;
  for (let i = 0; i < examIds.length; i++) {
    const subCount = subCounts[i] || 0;
    const gradedCount = gradedByExam.get(examIds[i]) || 0;
    pendingGrading += Math.max(0, subCount - gradedCount);
  }

  const enrolledByCourse = new Map<number, number>();
  for (const row of (enrollmentsCourseIdsRes.data || []) as Array<{ course_id: number }>) {
    const cid = Number(row.course_id);
    enrolledByCourse.set(cid, (enrolledByCourse.get(cid) || 0) + 1);
  }

  const courseRows = (courseOptsRes.data || []) as Array<{ id: number; title_ar: string; capacity: number }>;
  const courseChart = courseRows.map((c) => ({
    id: Number(c.id),
    title_ar: String(c.title_ar || ''),
    capacity: Number(c.capacity || 0),
    enrolled_count: enrolledByCourse.get(Number(c.id)) || 0,
  }));

  const studentsCount = studentsCountRes.count || 0;
  const teachersCount = teachersCountRes.count || 0;
  const coursesCount = coursesCountRes.count || 0;
  const lessonsCount = lessonsCountRes.count || 0;
  const pendingSuggestionsCount = suggestionsList.filter((s) => s.status === 'pending').length;

  return {
    counts: {
      students: studentsCount,
      teachers: teachersCount,
      courses: coursesCount,
      lessons: lessonsCount,
      pendingAdmissions:
        (pendingAdmissionsRes.count || 0) +
        guardianReqs.filter((g) => g.status === 'pending').length,
      pendingGrading,
      pendingSuggestions: pendingSuggestionsCount,
    },
    overview: {
      stats: {
        students: studentsCount,
        teachers: teachersCount,
        courses: coursesCount,
        lessons: lessonsCount,
      },
    },
    levels: levelsRes.data || [],
    games: gamesRes.data || [],
    legal: (legalRes.data || []).map((doc: Record<string, unknown>) => ({
      ...doc,
      content_ar: normalizeLegacyDomainText(String(doc.content_ar || '')),
      content_en: normalizeLegacyDomainText(String(doc.content_en || '')),
    })),
    courseChart,
    options: {
      students: ((studentOptsRes.data || []) as Array<{ id: number; full_name_ar: string; student_code: string }>).map((s) => ({
        id: Number(s.id),
        label: `${s.full_name_ar} (${s.student_code})`,
        full_name_ar: s.full_name_ar,
        student_code: s.student_code,
      })),
      teachers: teacherOptionRows.map((t) => {
        const isAdmin = Boolean(t.profile_id && adminProfileSet.has(String(t.profile_id)));
        const baseName = String(t.name_ar || '');
        return {
          id: Number(t.id),
          label: isAdmin ? `${baseName} (المدير)` : baseName,
          is_admin: isAdmin,
        };
      }),
      unlinkedAdmins,
      courses: courseRows.map((c) => ({
        id: Number(c.id),
        label: String(c.title_ar || ''),
      })),
    },
  };
}

app.get(['/api/admin/dashboard/summary', '/api/admin/summary'], authenticate, requireRole('admin'), asyncHandler(async (_req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/dashboard/summary');
  try {
    if (adminDashboardSummaryCache && Date.now() < adminDashboardSummaryCache.expiresAt) {
      res.json(adminDashboardSummaryCache.payload);
      return;
    }

    const sb = requireSupabaseAdmin();
    if (!adminDashboardSummaryInFlight) {
      const requestEpoch = adminDashboardSummaryEpoch;
      adminDashboardSummaryInFlight = buildAdminDashboardSummaryPayload(sb)
        .then((payload) => {
          if (requestEpoch === adminDashboardSummaryEpoch) {
            adminDashboardSummaryCache = {
              payload,
              expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
            };
          }
          return payload;
        })
        .finally(() => {
          adminDashboardSummaryInFlight = null;
        });
    }

    const payload = await adminDashboardSummaryInFlight;
    res.json(payload);
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/students', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/students');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);

  let query = sb
    .from('students')
    .select(
      'id, student_code, full_name_ar, full_name_en, age, level_id, status, levels(name_ar), guardians(full_name, phone, email, profile_id)',
      { count: 'exact' }
    )
    .is('deleted_at', null);

  if (safeQ) {
    const { data: matchingGuardians } = await sb
      .from('guardians')
      .select('id')
      .is('deleted_at', null)
      .or(`full_name.ilike.%${safeQ}%,email.ilike.%${safeQ}%`)
      .limit(200);
    const guardianIds = ((matchingGuardians || []) as Array<{ id: number }>)
      .map((g) => Number(g.id))
      .filter((id) => id > 0);
    const orParts = [
      `full_name_ar.ilike.%${safeQ}%`,
      `full_name_en.ilike.%${safeQ}%`,
      `student_code.ilike.%${safeQ}%`,
    ];
    if (guardianIds.length > 0) {
      orParts.push(`guardian_id.in.(${guardianIds.join(',')})`);
    }
    query = query.or(orParts.join(','));
  }

  const { data, count, error } = await query
    .order('id', { ascending: false })
    .range(from, to);
  if (error) {
    throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch students' : error.message);
  }

  const items = (data || []).map((s: Record<string, unknown>) => {
    const l = s.levels as { name_ar?: string } | null;
    const g = s.guardians as { full_name?: string; phone?: string; email?: string; profile_id?: string | null } | null;
    const { levels: _l, guardians: _g, ...rest } = s;
    return {
      ...rest,
      level_name_ar: l?.name_ar ?? null,
      guardian_name: g?.full_name ?? null,
      guardian_phone: g?.phone ?? null,
      guardian_email: g?.email ?? null,
      guardian_linked: Boolean(g?.profile_id),
    };
  });

  const total = count || 0;
  res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/teachers', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/teachers');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);
    const qLower = q.trim().toLowerCase();

    const [vaultPhoneMap, { data: adminProfs }] = await Promise.all([
      listTeacherPhones(sb),
      sb.from('profiles').select('id').eq('role', 'admin').is('deleted_at', null).limit(100),
    ]);

    const vaultMatchedTeacherIds = qLower
      ? Array.from(vaultPhoneMap.entries())
          .filter(([, phone]) => phone.toLowerCase().includes(qLower))
          .map(([tid]) => tid)
      : [];

    const runTeacherQuery = async (includePhoneColumn: boolean) => {
      const selectCols = includePhoneColumn
        ? 'id, profile_id, name_ar, name_en, specialty_ar, qualifications_ar, bio_ar, phone, hourly_rate, is_public'
        : 'id, profile_id, name_ar, name_en, specialty_ar, qualifications_ar, bio_ar, hourly_rate, is_public';
      let query = sb.from('teachers').select(selectCols, { count: 'exact' }).is('deleted_at', null);

      if (qLower) {
        const orParts: string[] = [];
        if (safeQ) {
          orParts.push(`name_ar.ilike.%${safeQ}%`, `name_en.ilike.%${safeQ}%`, `specialty_ar.ilike.%${safeQ}%`);
          if (includePhoneColumn) {
            orParts.push(`phone.ilike.%${safeQ}%`);
          }
        }
        if (vaultMatchedTeacherIds.length > 0) {
          orParts.push(`id.in.(${vaultMatchedTeacherIds.join(',')})`);
        }
        if (orParts.length > 0) {
          query = query.or(orParts.join(','));
        }
      }

      return query.order('id', { ascending: true }).range(from, to);
    };

    let result = await runTeacherQuery(true);
    if (
      result.error &&
      (String((result.error as { code?: string }).code || '') === '42703' ||
        String((result.error as { code?: string }).code || '') === 'PGRST204' ||
        String(result.error.message || '').toLowerCase().includes('phone'))
    ) {
      result = await runTeacherQuery(false);
    }

    if (result.error) {
      throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch teachers' : result.error.message);
    }

    const adminIdSet = new Set(((adminProfs || []) as Array<{ id: string }>).map((p) => String(p.id)));
    const items = ((result.data || []) as unknown as Array<Record<string, unknown>>).map(({ profile_id, phone, ...rest }) => {
      const tid = Number(rest.id);
      return {
        ...rest,
        phone: String(phone || vaultPhoneMap.get(tid) || ''),
        is_admin: Boolean(profile_id && adminIdSet.has(String(profile_id))),
      };
    });

    const total = result.count || 0;
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/courses', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/courses');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);

  let query = sb
    .from('courses')
    .select(
      'id, title_ar, title_en, description_ar, level_id, teacher_id, schedule_ar, price_monthly, capacity, is_featured, levels(name_ar), teachers(name_ar)',
      { count: 'exact' }
    )
    .is('deleted_at', null);

  if (safeQ) {
    const { data: matchingTeachers } = await sb
      .from('teachers')
      .select('id')
      .is('deleted_at', null)
      .or(`name_ar.ilike.%${safeQ}%,name_en.ilike.%${safeQ}%`)
      .limit(200);
    const teacherIds = ((matchingTeachers || []) as Array<{ id: number }>)
      .map((t) => Number(t.id))
      .filter((id) => id > 0);
    const orParts = [
      `title_ar.ilike.%${safeQ}%`,
      `title_en.ilike.%${safeQ}%`,
    ];
    if (teacherIds.length > 0) {
      orParts.push(`teacher_id.in.(${teacherIds.join(',')})`);
    }
    query = query.or(orParts.join(','));
  }

  const { data: coursesData, count, error } = await query
    .order('id', { ascending: false })
    .range(from, to);
  if (error) {
    throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch courses' : error.message);
  }

  const pageRows = (coursesData || []) as Array<Record<string, unknown>>;
  const pageCourseIds = pageRows.map((c) => Number(c.id)).filter((id) => id > 0);

  const [courseMetasMap, lessonRowsRes, examRowsRes, enrollRowsRes] = pageCourseIds.length
    ? await Promise.all([
        listCourseMetas(sb),
        sb.from('lessons').select('course_id').is('deleted_at', null).in('course_id', pageCourseIds),
        sb.from('exams').select('course_id').is('deleted_at', null).in('course_id', pageCourseIds),
        sb.from('enrollments').select('course_id').is('deleted_at', null).in('course_id', pageCourseIds),
      ])
    : [new Map(), { data: [] }, { data: [] }, { data: [] }];

  const coTeacherIdsNeeded = new Set<number>();
  for (const cid of pageCourseIds) {
    const meta = courseMetasMap.get(cid);
    for (const tid of meta?.co_teacher_ids || []) {
      coTeacherIdsNeeded.add(tid);
    }
  }

  const coTeacherNameMap = new Map<number, string>();
  if (coTeacherIdsNeeded.size > 0) {
    const { data: coTeachers } = await sb
      .from('teachers')
      .select('id, name_ar')
      .is('deleted_at', null)
      .in('id', Array.from(coTeacherIdsNeeded));
    for (const t of (coTeachers || []) as Array<{ id: number; name_ar: string }>) {
      coTeacherNameMap.set(Number(t.id), String(t.name_ar || ''));
    }
  }

  const lessonCounts = new Map<number, number>();
  for (const r of (lessonRowsRes.data || []) as Array<{ course_id: number }>) {
    const cid = Number(r.course_id);
    lessonCounts.set(cid, (lessonCounts.get(cid) || 0) + 1);
  }
  const examCounts = new Map<number, number>();
  for (const r of (examRowsRes.data || []) as Array<{ course_id: number }>) {
    const cid = Number(r.course_id);
    examCounts.set(cid, (examCounts.get(cid) || 0) + 1);
  }
  const enrollCounts = new Map<number, number>();
  for (const r of (enrollRowsRes.data || []) as Array<{ course_id: number }>) {
    const cid = Number(r.course_id);
    enrollCounts.set(cid, (enrollCounts.get(cid) || 0) + 1);
  }

  const items = pageRows.map((c) => {
    const l = c.levels as { name_ar?: string } | null;
    const t = c.teachers as { name_ar?: string } | null;
    const { levels: _l, teachers: _t, ...rest } = c;
    const cid = Number(rest.id);
    const meta = courseMetasMap.get(cid);
    const coIds = (meta?.co_teacher_ids || []).filter((id: number) => id !== Number(rest.teacher_id));
    return {
      ...rest,
      level_name_ar: l?.name_ar ?? null,
      teacher_name_ar: t?.name_ar ?? null,
      cover_url: meta?.cover_url ?? null,
      price_monthly_sar: meta?.price_monthly_sar ?? null,
      co_teacher_ids: coIds,
      co_teacher_names_ar: coIds.map((id: number) => coTeacherNameMap.get(id)).filter(Boolean),
      lesson_count: lessonCounts.get(cid) || 0,
      exam_count: examCounts.get(cid) || 0,
      enrolled_count: enrollCounts.get(cid) || 0,
    };
  });

  const total = count || 0;
  res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/profiles', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/profiles');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);

  let query = sb
    .from('profiles')
    .select('id, email, full_name, role, is_active', { count: 'exact' })
    .is('deleted_at', null);

  if (safeQ) {
    query = query.or(`full_name.ilike.%${safeQ}%,email.ilike.%${safeQ}%,role.ilike.%${safeQ}%`);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: true })
    .range(from, to);
  if (error) {
    throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch profiles' : error.message);
  }

  const total = count || 0;
  res.json({
    items: data || [],
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/enrollments', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/enrollments');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);

  let query = sb
    .from('enrollments')
    .select('id, student_id, course_id, status, students(full_name_ar), courses(title_ar)', { count: 'exact' })
    .is('deleted_at', null);

  if (safeQ) {
    const [{ data: matchStudents }, { data: matchCourses }] = await Promise.all([
      sb
        .from('students')
        .select('id')
        .is('deleted_at', null)
        .or(`full_name_ar.ilike.%${safeQ}%,student_code.ilike.%${safeQ}%`)
        .limit(200),
      sb
        .from('courses')
        .select('id')
        .is('deleted_at', null)
        .or(`title_ar.ilike.%${safeQ}%,title_en.ilike.%${safeQ}%`)
        .limit(200),
    ]);
    const studentIds = ((matchStudents || []) as Array<{ id: number }>).map((s) => Number(s.id)).filter((id) => id > 0);
    const courseIds = ((matchCourses || []) as Array<{ id: number }>).map((c) => Number(c.id)).filter((id) => id > 0);
    const orParts: string[] = [];
    if (studentIds.length > 0) orParts.push(`student_id.in.(${studentIds.join(',')})`);
    if (courseIds.length > 0) orParts.push(`course_id.in.(${courseIds.join(',')})`);
    if (orParts.length === 0) {
      res.json({ items: [], page, limit, total: 0, totalPages: 1 });
      return;
    }
    query = query.or(orParts.join(','));
  }

  const { data, count, error } = await query
    .order('id', { ascending: false })
    .range(from, to);
  if (error) {
    throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch enrollments' : error.message);
  }

  const items = (data || []).map((e: Record<string, unknown>) => {
    const s = e.students as { full_name_ar?: string } | null;
    const c = e.courses as { title_ar?: string } | null;
    const { students: _s, courses: _c, ...rest } = e;
    return {
      ...rest,
      student_name_ar: s?.full_name_ar ?? null,
      course_title_ar: c?.title_ar ?? null,
    };
  });

  const total = count || 0;
  res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/courses/:courseId/workspace', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/courses/:courseId/workspace');
  try {
    const courseId = parsePositiveIntParam(req.params.courseId, 'course id');
    const sb = requireSupabaseAdmin();

  const [courseRes, lessonsRes, examsRes, enrollmentsRes, courseMetasMap, lessonMetasMap] = await Promise.all([
    sb
      .from('courses')
      .select('id, title_ar, title_en, description_ar, level_id, teacher_id, schedule_ar, price_monthly, capacity, is_featured, levels(name_ar), teachers(name_ar)')
      .eq('id', courseId)
      .is('deleted_at', null)
      .maybeSingle(),
    sb
      .from('lessons')
      .select('id, course_id, title_ar, title_en, lesson_date, start_time, duration_min, objectives_ar')
      .eq('course_id', courseId)
      .is('deleted_at', null)
      .order('lesson_date', { ascending: false }),
    sb
      .from('exams')
      .select('id, course_id, title_ar, title_en, exam_date, max_score')
      .eq('course_id', courseId)
      .is('deleted_at', null)
      .order('exam_date', { ascending: false }),
    sb
      .from('enrollments')
      .select('id, student_id, course_id, status, students(full_name_ar)')
      .eq('course_id', courseId)
      .is('deleted_at', null)
      .order('id', { ascending: false }),
    listCourseMetas(sb),
    listLessonMetas(sb),
  ]);

  if (courseRes.error) {
    throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to load course workspace' : courseRes.error.message);
  }
  if (!courseRes.data) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }

  const courseRaw = courseRes.data as Record<string, unknown>;
  const courseMeta = courseMetasMap.get(courseId);
  const coIds = (courseMeta?.co_teacher_ids || []).filter((id) => id !== Number(courseRaw.teacher_id));

  const lessonRows = (lessonsRes.data || []) as Array<Record<string, unknown>>;
  const lessonIds = lessonRows.map((l) => Number(l.id)).filter((id) => id > 0);
  const examRows = (examsRes.data || []) as Array<Record<string, unknown>>;
  const examIds = examRows.map((e) => Number(e.id)).filter((id) => id > 0);

  const lessonTeacherIdsNeeded = new Set<number>();
  for (const l of lessonRows) {
    const lm = lessonMetasMap.get(Number(l.id));
    if (lm?.teacher_id) lessonTeacherIdsNeeded.add(Number(lm.teacher_id));
  }
  const teacherIdsForLookup = Array.from(new Set([...coIds, ...Array.from(lessonTeacherIdsNeeded)]));

  const [lessonLinksRes, examResultsRes, teachersLookupRes, attendanceRes, recitationsRes, evaluationsRes] = await Promise.all([
    lessonIds.length
      ? sb.from('lesson_links').select('id, lesson_id, title_ar, title_en, url, link_type').in('lesson_id', lessonIds)
      : Promise.resolve({ data: [] }),
    examIds.length
      ? sb.from('exam_results').select('exam_id').in('exam_id', examIds)
      : Promise.resolve({ data: [] }),
    teacherIdsForLookup.length
      ? sb.from('teachers').select('id, name_ar').is('deleted_at', null).in('id', teacherIdsForLookup)
      : Promise.resolve({ data: [] }),
    lessonIds.length
      ? sb.from('attendance').select('id, lesson_id, student_id, status, notes, recorded_at').in('lesson_id', lessonIds)
      : Promise.resolve({ data: [] }),
    sb
      .from('recitations')
      .select('id, student_id, course_id, surah_name, ayah_from, ayah_to, tajweed_score, memorization_score, notes_ar, recorded_at, students(full_name_ar)')
      .eq('course_id', courseId)
      .order('recorded_at', { ascending: false })
      .limit(100),
    sb
      .from('evaluations')
      .select('id, student_id, course_id, period, behavior_score, participation_score, summary_ar, created_at, students(full_name_ar)')
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const teacherNameLookup = new Map<number, string>();
  for (const t of (teachersLookupRes.data || []) as Array<{ id: number; name_ar: string }>) {
    teacherNameLookup.set(Number(t.id), String(t.name_ar || ''));
  }

  const cLevel = courseRaw.levels as { name_ar?: string } | null;
  const cTeacher = courseRaw.teachers as { name_ar?: string } | null;
  const { levels: _cl, teachers: _ct, ...courseBase } = courseRaw;
  const courseTitleAr = String(courseRaw.title_ar || '');

  const course = {
    ...courseBase,
    level_name_ar: cLevel?.name_ar ?? null,
    teacher_name_ar: cTeacher?.name_ar ?? null,
    cover_url: courseMeta?.cover_url ?? null,
    price_monthly_sar: courseMeta?.price_monthly_sar ?? null,
    co_teacher_ids: coIds,
    co_teacher_names_ar: coIds.map((id: number) => teacherNameLookup.get(id)).filter(Boolean),
  };

  const lessons = lessonRows.map((l) => {
    const lid = Number(l.id);
    const lm = lessonMetasMap.get(lid);
    const lTeacherId = lm?.teacher_id ?? null;
    return {
      ...l,
      course_title_ar: courseTitleAr,
      weekday_ar: lm?.weekday_ar ?? '',
      is_published: lm ? lm.is_published : true,
      published_at: lm?.published_at ?? null,
      teacher_id: lTeacherId,
      teacher_name_ar: lTeacherId ? teacherNameLookup.get(lTeacherId) ?? null : null,
    };
  });

  const gradedByExam = new Map<number, number>();
  for (const er of (examResultsRes.data || []) as Array<{ exam_id: number }>) {
    const eid = Number(er.exam_id);
    gradedByExam.set(eid, (gradedByExam.get(eid) || 0) + 1);
  }

  const exams = await Promise.all(
    examRows.map(async (ex) => {
      const eid = Number(ex.id);
      const [cfg, submissionCount] = await Promise.all([
        getExamVaultConfig(sb, eid),
        countExamSubmissionFiles(sb, eid),
      ]);
      const gradedCount = gradedByExam.get(eid) || 0;
      return {
        ...ex,
        id: eid,
        course_title_ar: courseTitleAr,
        ...sanitizeExamConfigForViewer(cfg, { isPrivileged: true }),
        submission_count: submissionCount,
        pending_grading_count: Math.max(0, submissionCount - gradedCount),
        graded_count: gradedCount,
      };
    })
  );

  const enrollments = (enrollmentsRes.data || []).map((e: Record<string, unknown>) => {
    const s = e.students as { full_name_ar?: string } | null;
    const { students: _s, ...rest } = e;
    return {
      ...rest,
      student_name_ar: s?.full_name_ar ?? null,
      course_title_ar: courseTitleAr,
    };
  });

  const recitations = ((recitationsRes.data || []) as Array<Record<string, unknown>>).map((r) => {
    const s = r.students as { full_name_ar?: string } | null;
    const { students: _s, ...rest } = r;
    return {
      ...rest,
      student_name_ar: s?.full_name_ar ?? null,
    };
  });

  const evaluations = ((evaluationsRes.data || []) as Array<Record<string, unknown>>).map((ev) => {
    const s = ev.students as { full_name_ar?: string } | null;
    const { students: _s, ...rest } = ev;
    return {
      ...rest,
      student_name_ar: s?.full_name_ar ?? null,
    };
  });

  res.json({
    course,
    lessons,
    lessonLinks: lessonLinksRes.data || [],
    exams,
    enrollments,
    attendance: attendanceRes.data || [],
    recitations,
    evaluations,
  });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/admissions', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/admissions');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);
    const rawStatus = String(req.query.status || '').trim();
    const statusFilter = ['pending', 'approved', 'rejected'].includes(rawStatus) ? rawStatus : '';

    let query = sb
      .from('admission_requests')
      .select(
        'id, student_name, student_age, guardian_name, guardian_email, guardian_phone, preferred_course_id, recommended_level_id, status, created_at, courses(title_ar), levels(name_ar)',
        { count: 'exact' }
      );

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }
    if (safeQ) {
      query = query.or(
        `student_name.ilike.%${safeQ}%,guardian_name.ilike.%${safeQ}%,guardian_email.ilike.%${safeQ}%,guardian_phone.ilike.%${safeQ}%`
      );
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) {
      throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch admission requests' : error.message);
    }

    const pageRows = (data || []) as Array<Record<string, unknown>>;
    const metas = await Promise.all(pageRows.map((ar) => getAdmissionMeta(sb, Number(ar.id))));

    const items = pageRows.map((ar, idx) => {
      const c = ar.courses as { title_ar?: string } | null;
      const l = ar.levels as { name_ar?: string } | null;
      const { courses: _c, levels: _l, ...rest } = ar;
      return {
        ...rest,
        course_title_ar: c?.title_ar ?? null,
        level_name_ar: l?.name_ar ?? null,
        student_email: metas[idx]?.student_email ?? null,
      };
    });

    const total = count || 0;
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/teacher-applications', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/teacher-applications');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const rawStatus = String(req.query.status || '').trim();
    const statusFilter = ['pending', 'approved', 'rejected'].includes(rawStatus) ? rawStatus : '';
    const qLower = q.toLowerCase();

    const allApps = await listTeacherApplications(sb);
    const filtered = allApps.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (!qLower) return true;
      return (
        String(t.name_ar || '').toLowerCase().includes(qLower) ||
        String(t.name_en || '').toLowerCase().includes(qLower) ||
        String(t.email || '').toLowerCase().includes(qLower) ||
        String(t.specialty_ar || '').toLowerCase().includes(qLower) ||
        String(t.phone || '').toLowerCase().includes(qLower)
      );
    });

    const total = filtered.length;
    const items = filtered.slice(from, to + 1);
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/guardian-requests', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/guardian-requests');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const rawStatus = String(req.query.status || '').trim();
    const statusFilter = ['pending', 'approved', 'rejected'].includes(rawStatus) ? rawStatus : '';
    const qLower = q.toLowerCase();

    const allReqs = await listGuardianRequests(sb);
    const filtered = allReqs.filter((g) => {
      if (statusFilter && g.status !== statusFilter) return false;
      if (!qLower) return true;
      return (
        String(g.full_name || '').toLowerCase().includes(qLower) ||
        String(g.email || '').toLowerCase().includes(qLower) ||
        String(g.student_code || '').toLowerCase().includes(qLower) ||
        String(g.student_name || '').toLowerCase().includes(qLower) ||
        String(g.phone || '').toLowerCase().includes(qLower)
      );
    });

    const total = filtered.length;
    const items = filtered.slice(from, to + 1);
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/announcements', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/announcements');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);

    let query = sb
      .from('announcements')
      .select('id, title_ar, body_ar, target_scope, target_course_id, created_at, courses(title_ar)', { count: 'exact' })
      .is('deleted_at', null);

    if (safeQ) {
      const { data: matchCourses } = await sb
        .from('courses')
        .select('id')
        .is('deleted_at', null)
        .or(`title_ar.ilike.%${safeQ}%,title_en.ilike.%${safeQ}%`)
        .limit(200);
      const courseIds = ((matchCourses || []) as Array<{ id: number }>).map((c) => Number(c.id)).filter((id) => id > 0);
      const orParts = [
        `title_ar.ilike.%${safeQ}%`,
        `body_ar.ilike.%${safeQ}%`,
        `target_scope.ilike.%${safeQ}%`,
      ];
      if (courseIds.length > 0) {
        orParts.push(`target_course_id.in.(${courseIds.join(',')})`);
      }
      query = query.or(orParts.join(','));
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) {
      throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch announcements' : error.message);
    }

    const items = (data || []).map((a: Record<string, unknown>) => {
      const c = a.courses as { title_ar?: string } | null;
      const { courses: _c, ...rest } = a;
      return { ...rest, course_title_ar: c?.title_ar ?? null };
    });

    const total = count || 0;
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/exams', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/exams');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);

    let query = sb
      .from('exams')
      .select('id, course_id, title_ar, title_en, exam_date, max_score, courses!inner(title_ar, deleted_at)', { count: 'exact' })
      .is('deleted_at', null)
      .is('courses.deleted_at', null);

    if (safeQ) {
      const { data: matchCourses } = await sb
        .from('courses')
        .select('id')
        .is('deleted_at', null)
        .or(`title_ar.ilike.%${safeQ}%,title_en.ilike.%${safeQ}%`)
        .limit(200);
      const courseIds = ((matchCourses || []) as Array<{ id: number }>).map((c) => Number(c.id)).filter((id) => id > 0);
      const orParts = [
        `title_ar.ilike.%${safeQ}%`,
        `title_en.ilike.%${safeQ}%`,
      ];
      if (courseIds.length > 0) {
        orParts.push(`course_id.in.(${courseIds.join(',')})`);
      }
      query = query.or(orParts.join(','));
    }

    const { data: examsData, count, error } = await query
      .order('exam_date', { ascending: false })
      .range(from, to);
    if (error) {
      throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch exams' : error.message);
    }

    const pageRows = (examsData || []) as Array<Record<string, unknown>>;
    const pageExamIds = pageRows.map((ex) => Number(ex.id)).filter((id) => id > 0);
    const { data: examResultsRows } = pageExamIds.length
      ? await sb.from('exam_results').select('exam_id').in('exam_id', pageExamIds)
      : { data: [] };

    const gradedByExam = new Map<number, number>();
    for (const er of (examResultsRows || []) as Array<{ exam_id: number }>) {
      const eid = Number(er.exam_id);
      gradedByExam.set(eid, (gradedByExam.get(eid) || 0) + 1);
    }

    const items = await Promise.all(
      pageRows.map(async (ex) => {
        const c = ex.courses as { title_ar?: string } | null;
        const { courses: _c, ...rest } = ex;
        const eid = Number(rest.id);
        const [cfg, submissionCount] = await Promise.all([
          getExamVaultConfig(sb, eid),
          countExamSubmissionFiles(sb, eid),
        ]);
        const gradedCount = gradedByExam.get(eid) || 0;
        return {
          ...rest,
          id: eid,
          course_title_ar: c?.title_ar ?? null,
          ...sanitizeExamConfigForViewer(cfg, { isPrivileged: true }),
          submission_count: submissionCount,
          pending_grading_count: Math.max(0, submissionCount - gradedCount),
          graded_count: gradedCount,
        };
      })
    );

    const total = count || 0;
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/certificates', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/certificates');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);

    let query = sb
      .from('certificates')
      .select(
        'id, verification_code, student_id, course_id, title_ar, title_en, grade_label, issued_at, revoked_at, students(full_name_ar), courses(title_ar)',
        { count: 'exact' }
      );

    if (safeQ) {
      const [{ data: matchStudents }, { data: matchCourses }] = await Promise.all([
        sb
          .from('students')
          .select('id')
          .is('deleted_at', null)
          .or(`full_name_ar.ilike.%${safeQ}%,student_code.ilike.%${safeQ}%`)
          .limit(200),
        sb
          .from('courses')
          .select('id')
          .is('deleted_at', null)
          .or(`title_ar.ilike.%${safeQ}%,title_en.ilike.%${safeQ}%`)
          .limit(200),
      ]);
      const studentIds = ((matchStudents || []) as Array<{ id: number }>).map((s) => Number(s.id)).filter((id) => id > 0);
      const courseIds = ((matchCourses || []) as Array<{ id: number }>).map((c) => Number(c.id)).filter((id) => id > 0);
      const orParts = [
        `verification_code.ilike.%${safeQ}%`,
        `title_ar.ilike.%${safeQ}%`,
        `grade_label.ilike.%${safeQ}%`,
      ];
      if (studentIds.length > 0) orParts.push(`student_id.in.(${studentIds.join(',')})`);
      if (courseIds.length > 0) orParts.push(`course_id.in.(${courseIds.join(',')})`);
      query = query.or(orParts.join(','));
    }

    const { data, count, error } = await query
      .order('issued_at', { ascending: false })
      .range(from, to);
    if (error) {
      throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch certificates' : error.message);
    }

    const items = (data || []).map((cert: Record<string, unknown>) => {
      const s = cert.students as { full_name_ar?: string } | null;
      const c = cert.courses as { title_ar?: string } | null;
      const { students: _s, courses: _c, ...rest } = cert;
      return {
        ...rest,
        student_name_ar: s?.full_name_ar ?? null,
        course_title_ar: c?.title_ar ?? null,
      };
    });

    const total = count || 0;
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

app.get('/api/admin/payroll', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/payroll');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);

    let query = sb
      .from('payroll')
      .select(
        'id, teacher_id, month_year, base_amount, bonus_amount, deduction_amount, net_amount, status, teachers(name_ar)',
        { count: 'exact' }
      );

    if (safeQ) {
      const { data: matchTeachers } = await sb
        .from('teachers')
        .select('id')
        .is('deleted_at', null)
        .or(`name_ar.ilike.%${safeQ}%,name_en.ilike.%${safeQ}%`)
        .limit(200);
      const teacherIds = ((matchTeachers || []) as Array<{ id: number }>).map((t) => Number(t.id)).filter((id) => id > 0);
      const orParts = [
        `month_year.ilike.%${safeQ}%`,
        `status.ilike.%${safeQ}%`,
      ];
      if (teacherIds.length > 0) orParts.push(`teacher_id.in.(${teacherIds.join(',')})`);
      query = query.or(orParts.join(','));
    }

    const { data, count, error } = await query
      .order('month_year', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    if (error) {
      throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch payroll records' : error.message);
    }

    const pageRows = (data || []) as Array<Record<string, unknown>>;
    const pageTeacherIds = Array.from(
      new Set(pageRows.map((p) => Number(p.teacher_id)).filter((id) => id > 0))
    );
    const payoutMap = new Map<number, { bank_name: string; iban: string }>();
    if (pageTeacherIds.length > 0) {
      const { data: payoutRows } = await sb
        .from('teacher_payout_details')
        .select('teacher_id, bank_name, iban')
        .in('teacher_id', pageTeacherIds);
      for (const pd of payoutRows || []) {
        const row = pd as { teacher_id: number; bank_name: string; iban: string };
        payoutMap.set(Number(row.teacher_id), { bank_name: row.bank_name, iban: row.iban });
      }
    }

    const items = pageRows.map((p) => {
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

    const total = count || 0;
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

function sanitizeCourseCoverUrlInput(raw?: string | null): string | null {
  const val = String(raw || '').trim();
  if (!val) return null;
  if (val.startsWith('/assets/') || val.startsWith('/api/public/course-covers/')) return val;
  if (/^https:\/\//i.test(val)) return val;
  return null;
}

const teacherIdOrAdminSchema = z.union([
  z.coerce.number().int().positive(),
  z.string().trim().regex(ADMIN_TEACHER_REF_REGEX),
  z.literal(''),
  z.null(),
]);

app.post('/api/admin/courses', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    title_ar: z.string().trim().min(2).max(180),
    title_en: z.string().trim().max(180).optional(),
    description_ar: z.string().trim().max(2500).optional().default(''),
    description_en: z.string().trim().max(2500).optional(),
    level_id: z.coerce.number().int().positive(),
    teacher_id: teacherIdOrAdminSchema.optional().transform((v) => (v === '' || v === null || v === undefined ? null : v)),
    schedule_ar: z.string().trim().max(180).optional().default(''),
    schedule_en: z.string().trim().max(180).optional().default(''),
    price_monthly: z.union([z.coerce.number().min(0).max(100000), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === null || v === undefined ? 0 : Number(v))),
    price_monthly_sar: z.union([z.coerce.number().min(0).max(100000), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === null || v === undefined ? null : Number(v))),
    capacity: z.coerce.number().int().min(1).max(500).optional().default(10),
    cover_url: z.string().trim().max(600).nullable().optional(),
    co_teacher_ids: z.array(z.coerce.number().int().positive()).max(20).optional(),
    co_teacher_admin_ids: z.array(z.string().uuid()).max(20).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid course creation payload' });
    return;
  }

  const {
    title_ar,
    title_en,
    description_ar,
    description_en,
    level_id,
    teacher_id: rawTeacherId,
    schedule_ar,
    schedule_en,
    price_monthly,
    price_monthly_sar,
    capacity,
    cover_url,
    co_teacher_ids,
    co_teacher_admin_ids,
  } = parsed.data;

  const sb = requireSupabaseAdmin();
  const { data: levelRow } = await sb.from('levels').select('id').eq('id', level_id).maybeSingle();
  if (!levelRow) {
    res.status(400).json({ error: 'Selected level does not exist' });
    return;
  }

  const resolvedTeacherId = await resolveTeacherRefToId(sb, rawTeacherId);
  const resolvedAdminCoIds = Array.isArray(co_teacher_admin_ids) && co_teacher_admin_ids.length
    ? await Promise.all(co_teacher_admin_ids.map(async (pid) => (await ensureTeacherForAdminProfile(sb, pid)).id))
    : [];

  const inserted = await insertRowSafe<{ id: number }>('courses', {
    title_ar,
    title_en: title_en?.trim() || title_ar,
    description_ar: description_ar || '',
    description_en: description_en?.trim() || description_ar || '',
    level_id,
    teacher_id: resolvedTeacherId,
    schedule_ar,
    schedule_en: schedule_en?.trim() || schedule_ar,
    price_monthly,
    capacity,
    is_featured: true,
  });

  const cleanCover = sanitizeCourseCoverUrlInput(cover_url);
  const combinedCoTeachers = [
    ...(Array.isArray(co_teacher_ids) ? co_teacher_ids : []),
    ...resolvedAdminCoIds,
  ];
  const cleanCoTeachers = Array.from(new Set(combinedCoTeachers.filter((tid) => tid !== (resolvedTeacherId || 0))));
  if (cleanCover || cleanCoTeachers.length > 0 || price_monthly_sar !== null) {
    await saveCourseMeta(sb, {
      course_id: inserted.id,
      cover_url: cleanCover,
      co_teacher_ids: cleanCoTeachers,
      price_monthly_sar,
      updated_at: new Date().toISOString(),
    });
  }

  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_COURSE', 'course', inserted.id, { title_ar });
  res.status(201).json({ id: inserted.id });
}));

app.patch('/api/admin/courses/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'course id');
  const schema = z.object({
    title_ar: z.string().trim().min(1).max(180).optional(),
    title_en: z.string().trim().max(180).optional(),
    description_ar: z.string().trim().max(2000).optional(),
    description_en: z.string().trim().max(2000).optional(),
    level_id: z.coerce.number().int().positive().optional(),
    teacher_id: teacherIdOrAdminSchema.optional().transform((v) => (v === '' || v === null ? null : v)),
    schedule_ar: z.string().trim().max(180).optional(),
    schedule_en: z.string().trim().max(180).optional(),
    price_monthly: z.coerce.number().min(0).max(100000).optional(),
    price_monthly_sar: z.coerce.number().min(0).max(100000).nullable().optional(),
    capacity: z.coerce.number().int().min(1).max(200).optional(),
    is_featured: z.boolean().optional(),
    cover_url: z.string().trim().max(600).nullable().optional(),
    co_teacher_ids: z.array(z.coerce.number().int().positive()).max(20).optional(),
    co_teacher_admin_ids: z.array(z.string().uuid()).max(20).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid course update payload' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const { cover_url, co_teacher_ids, co_teacher_admin_ids, price_monthly_sar, teacher_id: rawTeacherId, ...restUpdates } = parsed.data;
  const resolvedTeacherId = rawTeacherId !== undefined ? await resolveTeacherRefToId(sb, rawTeacherId) : undefined;
  const courseUpdates = {
    ...restUpdates,
    ...(resolvedTeacherId !== undefined ? { teacher_id: resolvedTeacherId } : {}),
  };

  if (Object.keys(courseUpdates).length > 0) {
    const { error } = await sb.from('courses').update(courseUpdates).eq('id', id).is('deleted_at', null);
    if (error) {
      sendInternalError(res, 'admin-update-course', error, 'Failed to update course');
      return;
    }
  }

  if (cover_url !== undefined || co_teacher_ids !== undefined || co_teacher_admin_ids !== undefined || price_monthly_sar !== undefined) {
    const existingMeta = await getCourseMeta(sb, id);
    const { data: curCourse } = await sb.from('courses').select('teacher_id').eq('id', id).maybeSingle();
    const mainTeacherId = resolvedTeacherId !== undefined ? (resolvedTeacherId ?? 0) : Number(curCourse?.teacher_id || 0);
    const resolvedAdminCoIds = Array.isArray(co_teacher_admin_ids) && co_teacher_admin_ids.length
      ? await Promise.all(co_teacher_admin_ids.map(async (pid) => (await ensureTeacherForAdminProfile(sb, pid)).id))
      : [];
    const baseCoIds = co_teacher_ids !== undefined ? co_teacher_ids : existingMeta?.co_teacher_ids || [];
    const nextCoIds = Array.from(new Set([...baseCoIds, ...resolvedAdminCoIds].filter((tid) => tid !== mainTeacherId)));
    const nextCoverUrl =
      cover_url !== undefined ? sanitizeCourseCoverUrlInput(cover_url) : existingMeta?.cover_url ?? null;
    const nextSar =
      price_monthly_sar !== undefined ? price_monthly_sar : existingMeta?.price_monthly_sar ?? null;
    const keepStorage =
      nextCoverUrl && nextCoverUrl.startsWith('/api/public/course-covers/')
        ? existingMeta?.cover_storage_path ?? null
        : null;
    if (!keepStorage && existingMeta?.cover_storage_path && cover_url !== undefined) {
      await removeCourseCoverFile(sb, existingMeta.cover_storage_path);
    }
    await saveCourseMeta(sb, {
      course_id: id,
      cover_url: nextCoverUrl,
      cover_storage_path: keepStorage,
      cover_mime: keepStorage ? existingMeta?.cover_mime ?? null : null,
      co_teacher_ids: nextCoIds,
      price_monthly_sar: nextSar,
      updated_at: new Date().toISOString(),
    });
  }

  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_COURSE', 'course', id, parsed.data);
  res.json({ ok: true });
}));

function detectImageMagicMime(buffer: Buffer): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp' } | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

app.post(
  '/api/admin/courses/:id/cover',
  examUploadLimiter,
  authenticate,
  requireRole('admin'),
  express.json({ limit: '8mb' }),
  asyncHandler<AuthRequest>(async (req, res) => {
    const id = parsePositiveIntParam(req.params.id, 'course id');
    const schema = z
      .object({
        presetUrl: z.string().trim().max(600).optional(),
        base64Data: z.string().min(1).optional(),
      })
      .refine((v) => Boolean(v.presetUrl || v.base64Data), 'Cover URL or image file is required.');
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid cover upload payload.' });
      return;
    }

    const sb = requireSupabaseAdmin();
    const { data: course } = await sb.from('courses').select('id').eq('id', id).is('deleted_at', null).maybeSingle();
    if (!course) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const { presetUrl, base64Data } = parsed.data;
    const existingMeta = await getCourseMeta(sb, id);

    if (presetUrl) {
      const cleanPreset = sanitizeCourseCoverUrlInput(presetUrl);
      if (!cleanPreset) {
        res.status(400).json({ error: 'Invalid cover image URL.' });
        return;
      }
      if (existingMeta?.cover_storage_path) {
        await removeCourseCoverFile(sb, existingMeta.cover_storage_path);
      }
      await saveCourseMeta(sb, {
        course_id: id,
        cover_url: cleanPreset,
        cover_storage_path: null,
        cover_mime: null,
        co_teacher_ids: existingMeta?.co_teacher_ids || [],
        price_monthly_sar: existingMeta?.price_monthly_sar ?? null,
        updated_at: new Date().toISOString(),
      });
      invalidateOverviewCache();
      res.json({ cover_url: cleanPreset });
      return;
    }

    const base64Clean = base64Data!.includes(',') ? base64Data!.split(',').pop() || '' : base64Data!;
    const buffer = Buffer.from(base64Clean, 'base64');
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Image file must be under 5 MB.' });
      return;
    }

    const detected = detectImageMagicMime(buffer);
    if (!detected) {
      res.status(400).json({ error: 'Unsupported image format. Only valid PNG, JPEG, or WEBP images are allowed.' });
      return;
    }

    const storagePath = await uploadCourseCoverFile(sb, id, buffer, detected.mime, detected.ext);
    if (existingMeta?.cover_storage_path) {
      await removeCourseCoverFile(sb, existingMeta.cover_storage_path);
    }
    const coverUrl = `/api/public/course-covers/${id}?v=${Date.now()}`;
    await saveCourseMeta(sb, {
      course_id: id,
      cover_url: coverUrl,
      cover_storage_path: storagePath,
      cover_mime: detected.mime,
      co_teacher_ids: existingMeta?.co_teacher_ids || [],
      price_monthly_sar: existingMeta?.price_monthly_sar ?? null,
      updated_at: new Date().toISOString(),
    });

    invalidateOverviewCache();
    await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_COURSE_COVER', 'course', id, { bytes: buffer.length });
    res.json({ cover_url: coverUrl });
  })
);

async function hardDeleteLessonCascade(sb: ReturnType<typeof requireSupabaseAdmin>, lessonId: number): Promise<boolean> {
  const { data: lesson } = await sb.from('lessons').select('id').eq('id', lessonId).maybeSingle();
  if (!lesson) return false;
  const { data: materials } = await sb.from('lesson_materials').select('storage_path').eq('lesson_id', lessonId);
  const storagePaths = (materials || [])
    .map((m: { storage_path?: string | null }) => m.storage_path)
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => (p.startsWith(STORAGE_PREFIX) ? p.slice(STORAGE_PREFIX.length) : p));
  if (storagePaths.length > 0) {
    await sb.storage.from(LESSON_MATERIALS_BUCKET).remove(storagePaths).catch(() => {});
  }
  await deleteLessonMeta(sb, lessonId);
  await sb.from('lessons').delete().eq('id', lessonId);
  return true;
}

async function hardDeleteCourseCascade(sb: ReturnType<typeof requireSupabaseAdmin>, courseId: number): Promise<boolean> {
  const { data: course } = await sb.from('courses').select('id').eq('id', courseId).maybeSingle();
  if (!course) return false;

  const [courseMeta, lessonsRes, examsRes] = await Promise.all([
    getCourseMeta(sb, courseId),
    sb.from('lessons').select('id').eq('course_id', courseId),
    sb.from('exams').select('id').eq('course_id', courseId),
  ]);

  for (const l of (lessonsRes.data || []) as Array<{ id: number }>) {
    await hardDeleteLessonCascade(sb, Number(l.id));
  }
  for (const e of (examsRes.data || []) as Array<{ id: number }>) {
    await deleteExamVaultData(sb, Number(e.id));
  }
  if (courseMeta?.cover_storage_path) {
    await removeCourseCoverFile(sb, courseMeta.cover_storage_path);
  }
  await deleteCourseMeta(sb, courseId);
  await sb.from('courses').delete().eq('id', courseId);
  return true;
}

app.delete('/api/admin/courses/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'course id');
  const sb = requireSupabaseAdmin();
  const deleted = await hardDeleteCourseCascade(sb, id);
  if (!deleted) {
    res.status(404).json({ error: 'Course not found' });
    return;
  }
  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'DELETE_COURSE', 'course', id, {});
  res.json({ ok: true });
}));

app.post('/api/admin/lessons', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    course_id: z.coerce.number().int().positive(),
    title_ar: z.string().trim().min(1).max(180),
    title_en: z.string().trim().max(180).optional(),
    lesson_date: z.string().trim().min(4).max(30),
    start_time: z.string().trim().min(2).max(20),
    duration_min: z.coerce.number().int().min(10).max(360).optional().default(45),
    objectives_ar: z.string().trim().max(1500).optional(),
    objectives_en: z.string().trim().max(1500).optional(),
    live_url: z.string().trim().max(600).optional(),
    weekday_ar: z.string().trim().max(80).optional(),
    teacher_id: teacherIdOrAdminSchema.optional().transform((v) => (v === '' || v === null || v === undefined ? null : v)),
    is_published: z.boolean().optional(),
    publish_and_notify: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid lesson payload' });
    return;
  }

  const {
    course_id: courseIdNum,
    title_ar,
    title_en,
    lesson_date,
    start_time,
    duration_min,
    objectives_ar,
    objectives_en,
    live_url,
    weekday_ar,
    teacher_id: rawLessonTeacherId,
    is_published,
    publish_and_notify,
  } = parsed.data;

  const sb = requireSupabaseAdmin();
  const { data: courseRow } = await sb
    .from('courses')
    .select('id, title_ar, title_en')
    .eq('id', courseIdNum)
    .is('deleted_at', null)
    .maybeSingle();
  if (!courseRow) {
    res.status(404).json({ error: 'Target course not found' });
    return;
  }

  const resolvedLessonTeacherId = await resolveTeacherRefToId(sb, rawLessonTeacherId);

  const lesson = await insertRowSafe<{ id: number }>('lessons', {
    course_id: courseIdNum,
    title_ar,
    title_en: title_en?.trim() || title_ar,
    lesson_date,
    start_time,
    duration_min,
    objectives_ar: objectives_ar || '',
    objectives_en: objectives_en || '',
  });

  if (live_url && /^https?:\/\//i.test(live_url)) {
    await insertRowSafe('lesson_links', {
      lesson_id: lesson.id,
      title_ar: 'رابط الحصة المباشرة',
      title_en: 'Live Session Link',
      url: live_url,
      link_type: live_url.includes('meet.google') ? 'meet' : 'zoom',
    });
  }

  const shouldPublish = publish_and_notify !== undefined ? Boolean(publish_and_notify) : is_published !== undefined ? Boolean(is_published) : true;
  const cleanWeekday = String(weekday_ar || '').trim();
  await saveLessonMeta(sb, {
    lesson_id: lesson.id,
    weekday_ar: cleanWeekday,
    is_published: shouldPublish,
    published_at: shouldPublish ? new Date().toISOString() : null,
    teacher_id: resolvedLessonTeacherId,
  });

  let notifiedStudents = 0;
  if (publish_and_notify === true) {
    const scheduleHint = [cleanWeekday, lesson_date, start_time].filter(Boolean).join(' · ');
    notifiedStudents = await notifyCourseLessonPublished(
      sb,
      courseIdNum,
      String(courseRow.title_ar || ''),
      String(courseRow.title_en || courseRow.title_ar || ''),
      title_ar,
      title_en?.trim() || title_ar,
      scheduleHint
    );
  }

  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_LESSON', 'lesson', lesson.id, {
    course_id: courseIdNum,
    is_published: shouldPublish,
    teacher_id: resolvedLessonTeacherId,
    notifiedStudents,
  });
  res.status(201).json({ id: lesson.id, is_published: shouldPublish, notifiedStudents });
}));

app.post('/api/admin/lessons/:id/publish', authenticate, requireRole('admin', 'teacher'), asyncHandler<AuthRequest>(async (req, res) => {
  const lessonId = parsePositiveIntParam(req.params.id, 'lesson id');
  const { sb } = await assertCanManageLesson(req.user!, lessonId);
  const { data: lessonRow } = await sb
    .from('lessons')
    .select('id, course_id, title_ar, title_en, lesson_date, start_time, courses(title_ar, title_en)')
    .eq('id', lessonId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!lessonRow) {
    res.status(404).json({ error: 'Lesson not found' });
    return;
  }

  const existingMeta = await getLessonMeta(sb, lessonId);
  const nextMeta: LessonMetaRecord = {
    lesson_id: lessonId,
    weekday_ar: existingMeta?.weekday_ar || '',
    is_published: true,
    published_at: new Date().toISOString(),
    teacher_id: existingMeta?.teacher_id ?? null,
  };
  await saveLessonMeta(sb, nextMeta);

  const courseInfo = Array.isArray(lessonRow.courses) ? lessonRow.courses[0] : lessonRow.courses;
  const courseObj = courseInfo as { title_ar?: string; title_en?: string } | null;
  const scheduleHint = [nextMeta.weekday_ar, lessonRow.lesson_date, lessonRow.start_time].filter(Boolean).join(' · ');
  const notifiedStudents = await notifyCourseLessonPublished(
    sb,
    Number(lessonRow.course_id),
    courseObj?.title_ar || '',
    courseObj?.title_en || courseObj?.title_ar || '',
    String(lessonRow.title_ar || ''),
    String(lessonRow.title_en || lessonRow.title_ar || ''),
    scheduleHint
  );

  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'PUBLISH_LESSON', 'lesson', lessonId, { notifiedStudents });
  res.json({ ok: true, notifiedStudents, published_at: nextMeta.published_at });
}));

app.patch('/api/admin/lessons/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'lesson id');
  const schema = z.object({
    course_id: z.coerce.number().int().positive().optional(),
    title_ar: z.string().trim().min(1).max(180).optional(),
    title_en: z.string().trim().min(1).max(180).optional(),
    lesson_date: z.string().trim().min(4).max(30).optional(),
    start_time: z.string().trim().min(2).max(20).optional(),
    duration_min: z.coerce.number().int().min(10).max(360).optional(),
    objectives_ar: z.string().trim().max(1000).optional(),
    objectives_en: z.string().trim().max(1000).optional(),
    weekday_ar: z.string().trim().max(80).optional(),
    teacher_id: teacherIdOrAdminSchema.optional().transform((v) => (v === '' || v === null ? null : v)),
    is_published: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid lesson update payload' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const { weekday_ar, is_published, teacher_id: rawLessonTeacherId, ...lessonUpdates } = parsed.data;
  const resolvedLessonTeacherId =
    rawLessonTeacherId !== undefined ? await resolveTeacherRefToId(sb, rawLessonTeacherId) : undefined;

  if (Object.keys(lessonUpdates).length > 0) {
    const { error } = await sb.from('lessons').update(lessonUpdates).eq('id', id).is('deleted_at', null);
    if (error) {
      sendInternalError(res, 'admin-update-lesson', error, 'Failed to update lesson');
      return;
    }
  }

  if (weekday_ar !== undefined || is_published !== undefined || resolvedLessonTeacherId !== undefined) {
    const existingMeta = await getLessonMeta(sb, id);
    const nextPublished = is_published !== undefined ? is_published : existingMeta ? existingMeta.is_published : true;
    await saveLessonMeta(sb, {
      lesson_id: id,
      weekday_ar: weekday_ar !== undefined ? weekday_ar : existingMeta?.weekday_ar || '',
      is_published: nextPublished,
      published_at: nextPublished ? existingMeta?.published_at || new Date().toISOString() : null,
      teacher_id: resolvedLessonTeacherId !== undefined ? resolvedLessonTeacherId : existingMeta?.teacher_id ?? null,
    });
  }

  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_LESSON', 'lesson', id, parsed.data);
  res.json({ ok: true });
}));

app.delete('/api/admin/lessons/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'lesson id');
  const sb = requireSupabaseAdmin();
  const deleted = await hardDeleteLessonCascade(sb, id);
  if (!deleted) {
    res.status(404).json({ error: 'Lesson not found' });
    return;
  }
  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'DELETE_LESSON', 'lesson', id, {});
  res.json({ ok: true });
}));

app.post('/api/admin/teachers/ensure-admin', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    profile_id: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid administrator profile ID' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const targetProfileId = parsed.data.profile_id || req.user!.id;
  const linked = await ensureTeacherForAdminProfile(sb, targetProfileId);
  invalidateOverviewCache();
  if (linked.created) {
    await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_TEACHER', 'teacher', linked.id, {
      teacher_id: linked.id,
      admin_profile_id: targetProfileId,
    });
  }
  res.json({ id: linked.id, name_ar: linked.name_ar, created: linked.created });
}));

app.post('/api/admin/teachers', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    name_ar: z.string().trim().min(2).max(160),
    phone: z.string().trim().min(4).max(40),
    specialty_ar: z.string().trim().min(2).max(200),
    name_en: z.string().trim().max(160).optional(),
    bio_ar: z.string().trim().max(2000).optional(),
    bio_en: z.string().trim().max(2000).optional(),
    qualifications_ar: z.string().trim().max(500).optional(),
    qualifications_en: z.string().trim().max(500).optional(),
    specialty_en: z.string().trim().max(200).optional(),
    hourly_rate: z.coerce.number().min(0).max(50000).optional().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Teacher name, phone number, and subject are required.' });
    return;
  }

  const { name_ar, phone, specialty_ar, name_en, bio_ar, bio_en, qualifications_ar, qualifications_en, specialty_en, hourly_rate } = parsed.data;
  const cleanName = name_ar.trim();
  const cleanPhone = phone.trim();
  const cleanSpecialty = specialty_ar.trim();
  const sb = requireSupabaseAdmin();

  const teacher = await insertRowSafe<{ id: number }>('teachers', {
    profile_id: null,
    name_ar: cleanName,
    name_en: name_en?.trim() || cleanName,
    bio_ar: bio_ar || '',
    bio_en: bio_en || '',
    qualifications_ar: qualifications_ar || '',
    qualifications_en: qualifications_en || '',
    specialty_ar: cleanSpecialty,
    specialty_en: specialty_en?.trim() || cleanSpecialty,
    avatar_url: '/assets/images/teacher_portrait_1.webp',
    hourly_rate,
    is_public: true,
  });

  await Promise.all([
    saveTeacherPhone(sb, teacher.id, cleanPhone),
    sb
      .from('teachers')
      .update({ phone: cleanPhone })
      .eq('id', teacher.id)
      .then(() => undefined, () => undefined),
  ]);

  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_TEACHER', 'teacher', teacher.id, {
    teacher_id: teacher.id,
  });
  res.status(201).json({ id: teacher.id, name_ar: cleanName, phone: cleanPhone, specialty_ar: cleanSpecialty });
}));

app.patch('/api/admin/teachers/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'teacher id');
  const schema = z.object({
    name_ar: z.string().trim().min(1).max(160).optional(),
    name_en: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    specialty_ar: z.string().trim().max(200).optional(),
    specialty_en: z.string().trim().max(200).optional(),
    qualifications_ar: z.string().trim().max(500).optional(),
    qualifications_en: z.string().trim().max(500).optional(),
    bio_ar: z.string().trim().max(2000).optional(),
    bio_en: z.string().trim().max(2000).optional(),
    hourly_rate: z.coerce.number().min(0).max(50000).optional(),
    is_public: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid teacher update payload' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const { phone, ...dbUpdates } = parsed.data;
  if (Object.keys(dbUpdates).length > 0) {
    const { error } = await sb.from('teachers').update(dbUpdates).eq('id', id).is('deleted_at', null);
    if (error) {
      sendInternalError(res, 'admin-update-teacher', error, 'Failed to update teacher');
      return;
    }
  }
  if (phone !== undefined) {
    const cleanPhone = phone.trim();
    await Promise.all([
      saveTeacherPhone(sb, id, cleanPhone),
      sb
        .from('teachers')
        .update({ phone: cleanPhone })
        .eq('id', id)
        .is('deleted_at', null)
        .then(() => undefined, () => undefined),
    ]);
  }
  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_TEACHER', 'teacher', id, {
    updated_fields: Object.keys(parsed.data),
  });
  res.json({ ok: true });
}));

async function purgeEmailTraces(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  rawEmails: Array<string | null | undefined>,
  matchedProfileIds: Array<string | null | undefined> = []
): Promise<number> {
  const emailList = Array.from(
    new Set(rawEmails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))
  );
  const emailSet = new Set(emailList);
  const profileSet = new Set(matchedProfileIds.map((p) => String(p || '').trim()).filter(Boolean));
  if (!emailSet.size && !profileSet.size) return 0;

  const [admMetas, teacherApps, guardianReqs, admRowsRes] = await Promise.all([
    listAdmissionMetas(sb),
    listTeacherApplications(sb),
    listGuardianRequests(sb),
    sb.from('admission_requests').select('id, guardian_email'),
  ]);

  const admIdsToDelete = new Set<number>();
  for (const [admId, meta] of admMetas.entries()) {
    if (
      emailSet.has((meta.student_email || '').toLowerCase()) ||
      (meta.pending_profile_id && profileSet.has(meta.pending_profile_id))
    ) {
      admIdsToDelete.add(admId);
    }
  }
  for (const row of (admRowsRes.data || []) as Array<{ id: number; guardian_email?: string | null }>) {
    if (emailSet.has(String(row.guardian_email || '').trim().toLowerCase())) {
      admIdsToDelete.add(Number(row.id));
    }
  }

  const admIdList = Array.from(admIdsToDelete);
  const teacherAppIds = teacherApps
    .filter((appRec) => emailSet.has((appRec.email || '').toLowerCase()) || (appRec.profile_id && profileSet.has(appRec.profile_id)))
    .map((appRec) => appRec.id);
  const guardianReqIds = guardianReqs
    .filter((gReq) => emailSet.has((gReq.email || '').toLowerCase()) || (gReq.profile_id && profileSet.has(gReq.profile_id)))
    .map((gReq) => gReq.id);

  const tasks: Array<{ label: string; promise: Promise<{ failed: number } | void> }> = [];
  if (emailList.length) {
    tasks.push({
      label: 'consents',
      promise: Promise.resolve(sb.from('consents').delete().in('email', emailList)).then((r) => {
        if (r.error) throw new Error(r.error.message);
      }),
    });
  }
  if (admIdList.length) {
    tasks.push({
      label: 'admissionMetas',
      promise: deleteAdmissionMetasBatch(sb, admIdList),
    });
    tasks.push({
      label: 'admissionRequests',
      promise: Promise.resolve(sb.from('admission_requests').delete().in('id', admIdList)).then((r) => {
        if (r.error) throw new Error(r.error.message);
      }),
    });
  }
  if (teacherAppIds.length) {
    tasks.push({
      label: 'teacherApplications',
      promise: deleteTeacherApplicationsBatch(sb, teacherAppIds),
    });
  }
  if (guardianReqIds.length) {
    tasks.push({
      label: 'guardianRequests',
      promise: deleteGuardianRequestsBatch(sb, guardianReqIds),
    });
  }

  let failedCount = 0;
  const results = await Promise.allSettled(tasks.map((t) => t.promise));
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      const val = result.value as { failed?: number } | void;
      if (val && typeof val.failed === 'number') {
        failedCount += val.failed;
      }
    } else {
      failedCount += 1;
      console.warn(`[purgeEmailTraces] Partial cleanup warning (${tasks[idx]?.label}):`, result.reason);
    }
  });
  return failedCount;
}

async function purgeNonAdminProfileAndAuth(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  profileId: string | null | undefined
): Promise<string | null> {
  if (!profileId) return null;
  invalidateAuthSessionCacheForUser(profileId);
  const { data: prof } = await sb.from('profiles').select('id, email, role').eq('id', profileId).maybeSingle();
  if (prof?.role === 'admin') {
    return prof.email || null;
  }
  const email = prof?.email ? String(prof.email).trim().toLowerCase() : null;

  // Preserve strict FK order: dependent child notifications -> profile -> Supabase Auth user
  const { error: notifErr } = await sb.from('notifications').delete().eq('profile_id', profileId);
  if (notifErr) {
    console.warn(`[purgeProfile] Failed deleting notifications for ${profileId}:`, notifErr.message);
  }
  const { error: profErr } = await sb.from('profiles').delete().eq('id', profileId);
  if (profErr) {
    console.warn(`[purgeProfile] Failed deleting profile ${profileId}:`, profErr.message);
  }

  const [authDelRes, leftover] = await Promise.all([
    sb.auth.admin.deleteUser(profileId),
    email ? findSupabaseAuthUserByEmail(email).catch(() => null) : Promise.resolve(null),
  ]);
  if (authDelRes.error) {
    console.warn(`[purgeProfile] Failed deleting auth user ${profileId}:`, authDelRes.error.message);
  }
  if (leftover && leftover.id !== profileId) {
    const { error: leftoverErr } = await sb.auth.admin.deleteUser(leftover.id);
    if (leftoverErr) {
      console.warn(`[purgeProfile] Failed deleting duplicate auth user ${leftover.id}:`, leftoverErr.message);
    }
  }
  return email;
}

async function hardDeleteTeacherCascade(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  teacherId: number
): Promise<{ deleted: boolean; email?: string | null; cleanupFailed?: number }> {
  const { data: teacher } = await sb
    .from('teachers')
    .select('id, profile_id')
    .eq('id', teacherId)
    .maybeSingle();
  if (!teacher) return { deleted: false };

  const [profileRes, metas] = await Promise.all([
    teacher.profile_id
      ? sb.from('profiles').select('email, role').eq('id', teacher.profile_id).maybeSingle()
      : Promise.resolve({ data: null }),
    listCourseMetas(sb),
  ]);
  const profMeta = profileRes.data as { email?: string; role?: string } | null;
  const profileEmail: string | null = profMeta?.email ?? null;
  const isAdminProfile = profMeta?.role === 'admin';

  // Step 1: Remove/detach child references & Storage metadata BEFORE deleting teachers row
  const coTeacherTasks: Promise<unknown>[] = [];
  for (const [cid, meta] of metas.entries()) {
    if (meta.co_teacher_ids?.includes(teacherId)) {
      coTeacherTasks.push(
        saveCourseMeta(sb, {
          ...meta,
          course_id: cid,
          co_teacher_ids: meta.co_teacher_ids.filter((tid) => tid !== teacherId),
          updated_at: new Date().toISOString(),
        })
      );
    }
  }

  let cleanupFailed = 0;
  const step1Results = await Promise.allSettled([
    sb.from('courses').update({ teacher_id: null }).eq('teacher_id', teacherId),
    sb.from('payroll').delete().eq('teacher_id', teacherId),
    sb.from('teacher_payout_details').delete().eq('teacher_id', teacherId),
    deleteTeacherPhone(sb, teacherId),
    ...coTeacherTasks,
  ]);
  step1Results.forEach((res, idx) => {
    if (res.status === 'rejected') {
      cleanupFailed += 1;
      console.warn(`[hardDeleteTeacher:${teacherId}] Step 1 cleanup warning (#${idx}):`, res.reason);
    }
  });

  // Step 2: Delete teachers parent record BEFORE purging profile/auth
  const { error: teacherDelErr } = await sb.from('teachers').delete().eq('id', teacherId);
  if (teacherDelErr) {
    throw new Error(`Failed deleting teacher ${teacherId}: ${teacherDelErr.message}`);
  }

  // Step 3: Scrub existing audit rows BEFORE deleting non-admin profile
  await Promise.allSettled([
    anonymizeAuditSubject({
      profileId: isAdminProfile ? null : teacher.profile_id,
      entityType: 'teacher',
      entityId: teacherId,
    }),
    ...(!isAdminProfile && teacher.profile_id
      ? [anonymizeAuditSubject({ entityType: 'profile', entityId: teacher.profile_id })]
      : []),
  ]);

  // Step 4: Purge non-admin profile + Auth user + email traces (preserve active admin account & consents)
  if (isAdminProfile) {
    return { deleted: true, email: profileEmail, cleanupFailed };
  }
  const purgedEmail = await purgeNonAdminProfileAndAuth(sb, teacher.profile_id);
  const finalEmail = purgedEmail || profileEmail;
  cleanupFailed += await purgeEmailTraces(sb, [finalEmail], [teacher.profile_id]);
  return { deleted: true, email: finalEmail, cleanupFailed };
}

async function hardDeleteStudentCascade(
  sb: ReturnType<typeof requireSupabaseAdmin>,
  studentId: number
): Promise<{ deleted: boolean; email?: string | null; guardianId?: number | null; cleanupFailed?: number }> {
  const { data: student } = await sb
    .from('students')
    .select('id, profile_id, guardian_id, student_code')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return { deleted: false };

  const [profileRes, guardianReqs] = await Promise.all([
    student.profile_id
      ? sb.from('profiles').select('email').eq('id', student.profile_id).maybeSingle()
      : Promise.resolve({ data: null }),
    listGuardianRequests(sb),
  ]);
  const studentEmail: string | null = (profileRes.data as { email?: string } | null)?.email ?? null;
  const matchingGuardianReqIds = guardianReqs
    .filter(
      (gr) =>
        gr.student_id === studentId ||
        gr.student_code.toUpperCase() === String(student.student_code || '').toUpperCase()
    )
    .map((gr) => gr.id);

  // Step 1: Delete exam vault data & guardian link requests in parallel BEFORE deleting student row
  let cleanupFailed = 0;
  const [examVaultRes, guardianReqRes] = await Promise.allSettled([
    deleteExamDataForStudent(sb, studentId),
    deleteGuardianRequestsBatch(sb, matchingGuardianReqIds),
  ]);
  if (examVaultRes.status === 'fulfilled') {
    cleanupFailed += examVaultRes.value.failed;
  } else {
    cleanupFailed += 1;
    console.warn(`[hardDeleteStudent:${studentId}] Step 1 cleanup warning (#0):`, examVaultRes.reason);
  }
  if (guardianReqRes.status === 'fulfilled') {
    cleanupFailed += guardianReqRes.value.failed;
  } else {
    cleanupFailed += 1;
    console.warn(`[hardDeleteStudent:${studentId}] Step 1 cleanup warning (#1):`, guardianReqRes.reason);
  }

  // Step 2: Delete student row (cascades enrollments, attendance, exam_results, certificates, etc.)
  const { error: stuDelErr } = await sb.from('students').delete().eq('id', studentId);
  if (stuDelErr) {
    throw new Error(`Failed deleting student ${studentId}: ${stuDelErr.message}`);
  }

  const emailsToPurge: Array<string | null> = [studentEmail];
  const profileIdsToPurge: Array<string | null> = [student.profile_id];

  // Step 3: Check remaining siblings and delete orphaned guardian AFTER student row is deleted
  let guardianProfileToPurge: string | null = null;
  let deletedGuardianId: number | null = null;
  if (student.guardian_id) {
    const { count: remainingSiblings } = await sb
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('guardian_id', student.guardian_id);

    if ((remainingSiblings || 0) === 0) {
      deletedGuardianId = Number(student.guardian_id);
      const { data: guardian } = await sb
        .from('guardians')
        .select('id, profile_id, email')
        .eq('id', student.guardian_id)
        .maybeSingle();

      await Promise.allSettled([
        deleteGuardianAuth(sb, student.guardian_id),
        sb.from('guardians').delete().eq('id', student.guardian_id),
      ]);

      if (guardian?.email) emailsToPurge.push(guardian.email);
      if (guardian?.profile_id && guardian.profile_id !== student.profile_id) {
        const [{ count: otherG }, { count: otherS }, { count: otherT }] = await Promise.all([
          sb.from('guardians').select('id', { count: 'exact', head: true }).eq('profile_id', guardian.profile_id),
          sb.from('students').select('id', { count: 'exact', head: true }).eq('profile_id', guardian.profile_id),
          sb.from('teachers').select('id', { count: 'exact', head: true }).eq('profile_id', guardian.profile_id),
        ]);
        if ((otherG || 0) === 0 && (otherS || 0) === 0 && (otherT || 0) === 0) {
          guardianProfileToPurge = guardian.profile_id;
          profileIdsToPurge.push(guardian.profile_id);
        }
      }
    }
  }

  // Step 4: Scrub existing audit rows BEFORE deleting student & orphaned guardian profiles
  await Promise.allSettled([
    anonymizeAuditSubject({ profileId: student.profile_id, entityType: 'student', entityId: studentId }),
    ...(student.profile_id ? [anonymizeAuditSubject({ entityType: 'profile', entityId: student.profile_id })] : []),
    ...(deletedGuardianId
      ? [anonymizeAuditSubject({ profileId: guardianProfileToPurge, entityType: 'guardian', entityId: deletedGuardianId })]
      : []),
    ...(guardianProfileToPurge ? [anonymizeAuditSubject({ entityType: 'profile', entityId: guardianProfileToPurge })] : []),
  ]);

  // Step 5: Purge student & orphaned guardian profiles/Auth users in parallel, then purge email traces
  const profilePurgeResults = await Promise.allSettled([
    purgeNonAdminProfileAndAuth(sb, student.profile_id),
    guardianProfileToPurge ? purgeNonAdminProfileAndAuth(sb, guardianProfileToPurge) : Promise.resolve(null),
  ]);
  let purgedStuEmail: string | null = null;
  profilePurgeResults.forEach((res, idx) => {
    if (res.status === 'fulfilled') {
      if (res.value) emailsToPurge.push(res.value);
      if (idx === 0) purgedStuEmail = res.value;
    } else {
      console.warn(`[hardDeleteStudent:${studentId}] Profile purge warning (#${idx}):`, res.reason);
    }
  });

  cleanupFailed += await purgeEmailTraces(sb, emailsToPurge, profileIdsToPurge);

  return {
    deleted: true,
    email: purgedStuEmail || studentEmail,
    guardianId: student.guardian_id ?? null,
    cleanupFailed,
  };
}

app.delete('/api/admin/teachers/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'teacher id');
  const sb = requireSupabaseAdmin();
  const result = await hardDeleteTeacherCascade(sb, id);
  if (!result.deleted) {
    res.status(404).json({ error: 'Teacher not found' });
    return;
  }
  const cleanupFailed = result.cleanupFailed || 0;
  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'HARD_DELETE_TEACHER', 'teacher', id, {
    teacher_id: id,
    masked_email: maskEmail(result.email),
    ...(cleanupFailed > 0 ? { cleanup_failed: cleanupFailed } : {}),
  });
  res.json(cleanupFailed > 0 ? { ok: true, warnings: { cleanup_failed: cleanupFailed } } : { ok: true });
}));

app.post('/api/admin/students', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email().max(160),
    full_name_ar: z.string().trim().min(2).max(160),
    full_name_en: z.string().trim().max(160).optional(),
    age: z.coerce.number().int().min(3).max(25),
    level_id: z.coerce.number().int().positive().optional().default(1),
    guardian_name: z.string().trim().max(140).optional(),
    guardian_phone: z.string().trim().max(32).optional(),
    guardian_email: z.union([z.string().trim().email().max(160), z.literal('')]).optional(),
    course_id: z.union([z.coerce.number().int().positive(), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v === null || v === undefined ? undefined : v)),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid student email, name, and age (3-25) are required' });
    return;
  }

  const { email, full_name_ar, full_name_en, age, level_id, guardian_name, guardian_phone, guardian_email, course_id } = parsed.data;
  const cleanEmail = email.toLowerCase();
  const cleanName = full_name_ar;
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
    sendInternalError(res, 'admin-create-student-profile', pErr, 'Failed to save student profile');
    return;
  }

  const guardian = await insertRowSafe<{ id: number }>('guardians', {
    full_name: guardian_name || 'ولي أمر',
    phone: guardian_phone || '',
    email: (guardian_email || cleanEmail).toLowerCase(),
    relation: 'ولي أمر',
  });

  const code = await generateUniqueStudentCode();
  const student = await insertRowSafe<{ id: number }>('students', {
    profile_id: user.id,
    guardian_id: guardian.id,
    student_code: code,
    full_name_ar: cleanName,
    full_name_en: full_name_en?.trim() || cleanName,
    age,
    level_id,
    status: 'active',
  });

  if (course_id) {
    await insertRowSafe('enrollments', {
      student_id: student.id,
      course_id,
      status: 'active',
    });
  }

  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_STUDENT', 'student', student.id, {
    student_id: student.id,
  });
  res.status(201).json({ id: student.id, student_code: code, temporary_password: tempPassword });
}));

app.patch('/api/admin/students/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'student id');
  const schema = z.object({
    full_name_ar: z.string().trim().min(1).max(160).optional(),
    full_name_en: z.string().trim().min(1).max(160).optional(),
    age: z.coerce.number().int().min(3).max(25).optional(),
    level_id: z.coerce.number().int().positive().optional(),
    status: z.enum(['active', 'paused', 'graduated']).optional(),
    guardian_name: z.string().trim().max(140).optional(),
    guardian_phone: z.string().trim().max(32).optional(),
    guardian_email: z.string().trim().email().max(160).optional().or(z.literal('')),
    unlink_guardian_account: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid student update payload' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const { data: studentRow } = await sb
    .from('students')
    .select('id, guardian_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!studentRow) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }

  const studentUpdates: Record<string, unknown> = {};
  if (parsed.data.full_name_ar !== undefined) studentUpdates.full_name_ar = parsed.data.full_name_ar;
  if (parsed.data.full_name_en !== undefined) studentUpdates.full_name_en = parsed.data.full_name_en;
  if (parsed.data.age !== undefined) studentUpdates.age = parsed.data.age;
  if (parsed.data.level_id !== undefined) studentUpdates.level_id = parsed.data.level_id;
  if (parsed.data.status !== undefined) studentUpdates.status = parsed.data.status;

  if (Object.keys(studentUpdates).length) {
    await sb.from('students').update(studentUpdates).eq('id', id);
  }

  const guardianUpdates: Record<string, unknown> = {};
  if (parsed.data.guardian_name !== undefined) guardianUpdates.full_name = parsed.data.guardian_name;
  if (parsed.data.guardian_phone !== undefined) guardianUpdates.phone = parsed.data.guardian_phone;
  if (parsed.data.guardian_email !== undefined && parsed.data.guardian_email !== '') {
    guardianUpdates.email = parsed.data.guardian_email.trim().toLowerCase();
  }
  if (parsed.data.unlink_guardian_account) {
    guardianUpdates.profile_id = null;
  }

  if (Object.keys(guardianUpdates).length) {
    if (studentRow.guardian_id) {
      await sb.from('guardians').update(guardianUpdates).eq('id', studentRow.guardian_id);
      if (parsed.data.unlink_guardian_account) {
        await deleteGuardianAuth(sb, studentRow.guardian_id);
      }
    } else if (guardianUpdates.email || guardianUpdates.full_name) {
      const createdGuardian = await insertRowSafe<{ id: number }>('guardians', {
        full_name: String(guardianUpdates.full_name || 'ولي أمر'),
        phone: String(guardianUpdates.phone || ''),
        email: String(guardianUpdates.email || ''),
        relation: 'ولي أمر',
      });
      await sb.from('students').update({ guardian_id: createdGuardian.id }).eq('id', id);
    }
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_STUDENT', 'student', id, {
    updated_fields: Object.keys(parsed.data),
  });
  res.json({ ok: true });
}));

app.patch('/api/admin/students/:id/level', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'student id');
  const schema = z.object({ level_id: z.coerce.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid level_id is required' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const [{ data: stu }, { data: lvl }] = await Promise.all([
    sb.from('students').select('id').eq('id', id).is('deleted_at', null).maybeSingle(),
    sb.from('levels').select('id').eq('id', parsed.data.level_id).maybeSingle(),
  ]);
  if (!stu || !lvl) {
    res.status(404).json({ error: 'Student or level not found' });
    return;
  }
  await sb.from('students').update({ level_id: parsed.data.level_id }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_STUDENT_LEVEL', 'student', id, { level_id: parsed.data.level_id });
  res.json({ ok: true });
}));

app.delete('/api/admin/students/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'student id');
  const sb = requireSupabaseAdmin();
  const result = await hardDeleteStudentCascade(sb, id);
  if (!result.deleted) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }
  const cleanupFailed = result.cleanupFailed || 0;
  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'HARD_DELETE_STUDENT', 'student', id, {
    student_id: id,
    guardian_id: result.guardianId ?? null,
    masked_email: maskEmail(result.email),
    cleanup_failed: cleanupFailed,
  });
  res.json(cleanupFailed > 0 ? { ok: true, warnings: { cleanup_failed: cleanupFailed } } : { ok: true });
}));

app.post('/api/admin/enrollments', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    student_id: z.coerce.number().int().positive(),
    course_id: z.coerce.number().int().positive(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid student_id and course_id are required' });
    return;
  }
  const { student_id: studentId, course_id: courseId } = parsed.data;
  const sb = requireSupabaseAdmin();

  const [{ data: stu }, { data: crs }] = await Promise.all([
    sb.from('students').select('id').eq('id', studentId).is('deleted_at', null).maybeSingle(),
    sb.from('courses').select('id').eq('id', courseId).is('deleted_at', null).maybeSingle(),
  ]);
  if (!stu || !crs) {
    res.status(404).json({ error: 'Student or course not found' });
    return;
  }

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

app.delete('/api/admin/enrollments/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'enrollment id');
  const sb = requireSupabaseAdmin();
  await sb.from('enrollments').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'REMOVE_ENROLLMENT', 'enrollment', id, {});
  res.json({ ok: true });
}));

app.post('/api/admin/admissions/:id/decision', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'admission id');
  const schema = z.object({
    decision: z.enum(['approved', 'rejected']),
    student_email: z.union([z.string().trim().email().max(160), z.literal('')]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid admission decision payload' });
    return;
  }
  const { decision, student_email } = parsed.data;
  const sb = requireSupabaseAdmin();

  const { data: reqRow } = await sb.from('admission_requests').select('*').eq('id', id).maybeSingle();
  if (!reqRow) {
    res.status(404).json({ error: 'Admission request not found' });
    return;
  }
  if (reqRow.status !== 'pending') {
    res.status(409).json({ error: 'This admission request has already been processed.' });
    return;
  }

  const meta = await getAdmissionMeta(sb, id);
  await sb.from('admission_requests').update({ status: decision, reviewed_by: req.user!.id }).eq('id', id);

  let tempPassword: string | undefined;
  let resolvedEmail = (student_email || meta?.student_email || `student.${id}@noorwbayan-academy.com`).trim().toLowerCase();
  let studentCode: string | undefined;

  if (decision === 'approved') {
    let profileId: string;
    const confirmationRedirectUrl = `${resolvePublicBaseUrl(req)}/login?confirmed=1`;
    if (meta?.pending_profile_id) {
      profileId = meta.pending_profile_id;
      await sb.from('profiles').update({ is_active: true }).eq('id', profileId);
      resolvedEmail = meta.student_email;
      if (REQUIRE_EMAIL_VERIFICATION) {
        await sendSignupConfirmationIfNeeded(sb, profileId, resolvedEmail, confirmationRedirectUrl);
      } else {
        await sb.auth.admin.updateUserById(profileId, { email_confirm: true }).catch(() => {});
      }
    } else {
      const { data: existingProfile } = await sb.from('profiles').select('id, is_active').eq('email', resolvedEmail).maybeSingle();
      if (existingProfile) {
        profileId = existingProfile.id;
        if (!existingProfile.is_active) {
          await sb.from('profiles').update({ is_active: true }).eq('id', profileId);
          if (REQUIRE_EMAIL_VERIFICATION) {
            await sendSignupConfirmationIfNeeded(sb, profileId, resolvedEmail, confirmationRedirectUrl);
          } else {
            await sb.auth.admin.updateUserById(profileId, { email_confirm: true }).catch(() => {});
          }
        }
      } else {
        tempPassword = generateTempPassword();
        const { user } = await provisionSupabaseAuthUser(resolvedEmail, tempPassword, reqRow.student_name, 'student');
        profileId = user.id;
        await sb.from('profiles').upsert(
          {
            id: profileId,
            email: resolvedEmail,
            full_name: reqRow.student_name,
            role: 'student',
            is_active: true,
            preferred_lang: 'ar',
          },
          { onConflict: 'id' }
        );
      }
    }

    const guardian = await insertRowSafe<{ id: number }>('guardians', {
      full_name: reqRow.guardian_name,
      phone: reqRow.guardian_phone,
      email: String(reqRow.guardian_email || '').trim().toLowerCase(),
    });

    studentCode = await generateUniqueStudentCode();
    const student = await insertRowSafe<{ id: number }>('students', {
      profile_id: profileId,
      guardian_id: guardian.id,
      student_code: studentCode,
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
      body_ar: `تم قبول طلب انضمامك وتفعيل حسابك بنجاح. كود الطالب: ${studentCode}`,
      body_en: `Your admission request has been approved. Student Code: ${studentCode}`,
    });
    invalidateOverviewCache();
  } else if (meta?.pending_profile_id) {
    await deletePendingAuthProfileIfSafe(sb, meta.pending_profile_id);
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, `ADMISSION_${decision.toUpperCase()}`, 'admission_request', id, {
    admission_id: id,
    masked_email: maskEmail(resolvedEmail),
  });
  void broadcastRealtimeEvent('academic:updated', { kind: 'admission' });
  res.json({
    ok: true,
    student_email: resolvedEmail,
    ...(studentCode ? { student_code: studentCode } : {}),
    ...(tempPassword ? { temporary_password: tempPassword } : {}),
  });
}));

app.post('/api/admin/teacher-applications/:id/decision', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (_req, res) => {
  res.status(403).json({
    error: 'Teacher self-registration and portal activation are disabled.',
    code: 'TEACHER_PORTAL_DISABLED',
  });
}));

app.post('/api/admin/teacher-applications/_disabled_decision/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'teacher application id');
  const schema = z.object({
    decision: z.enum(['approved', 'rejected']),
    hourly_rate: z.coerce.number().min(0).max(50000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid teacher decision payload' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const appRecord = await getTeacherApplication(sb, id);
  if (!appRecord) {
    res.status(404).json({ error: 'Teacher application not found' });
    return;
  }
  if (appRecord.status !== 'pending') {
    res.status(409).json({ error: 'This teacher application has already been processed.' });
    return;
  }

  const { decision, hourly_rate } = parsed.data;
  if (decision === 'approved') {
    if (!appRecord.profile_id) {
      res.status(400).json({ error: 'Missing applicant profile link' });
      return;
    }
    await sb.from('profiles').update({ is_active: true, role: 'teacher' }).eq('id', appRecord.profile_id);
    if (REQUIRE_EMAIL_VERIFICATION) {
      await sendSignupConfirmationIfNeeded(
        sb,
        appRecord.profile_id,
        appRecord.email,
        `${resolvePublicBaseUrl(req)}/login?confirmed=1`
      );
    } else {
      await sb.auth.admin.updateUserById(appRecord.profile_id, { email_confirm: true }).catch(() => {});
    }
    const teacher = await insertRowSafe<{ id: number }>('teachers', {
      profile_id: appRecord.profile_id,
      name_ar: appRecord.name_ar,
      name_en: appRecord.name_en || appRecord.name_ar,
      bio_ar: appRecord.bio_ar || '',
      bio_en: appRecord.bio_ar || '',
      qualifications_ar: appRecord.qualifications_ar || '',
      qualifications_en: appRecord.qualifications_ar || '',
      specialty_ar: appRecord.specialty_ar || '',
      specialty_en: appRecord.specialty_ar || '',
      avatar_url: '/assets/images/teacher_portrait_1.webp',
      hourly_rate: hourly_rate ?? 180,
      is_public: true,
    });
    await insertRowSafe('notifications', {
      profile_id: appRecord.profile_id,
      title_ar: 'تم اعتماد حسابك كمعلم في أكاديمية نور وبيان',
      title_en: 'Teacher Account Approved',
      body_ar: 'مرحباً بك في هيئة التدريس! يمكنك الآن تسجيل الدخول ومتابعة حلقاتك وطلابك.',
      body_en: 'Welcome to our faculty! You can now sign in to manage your courses and students.',
    });
    await saveTeacherApplication(sb, {
      ...appRecord,
      status: 'approved',
      reviewed_by: req.user!.id,
      reviewed_at: new Date().toISOString(),
    });
    invalidateOverviewCache();
    await writeAuditLog(req.user!.id, req.user!.full_name, 'TEACHER_APP_APPROVED', 'teacher', teacher.id, {
      teacher_id: teacher.id,
      application_id: id,
      masked_email: maskEmail(appRecord.email),
    });
    void broadcastRealtimeEvent('academic:updated', { kind: 'teacher' });
    res.json({ ok: true, teacher_id: teacher.id, email: appRecord.email });
    return;
  }

  await saveTeacherApplication(sb, {
    ...appRecord,
    status: 'rejected',
    reviewed_by: req.user!.id,
    reviewed_at: new Date().toISOString(),
  });
  await deletePendingAuthProfileIfSafe(sb, appRecord.profile_id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'TEACHER_APP_REJECTED', 'teacher_application', id, {
    application_id: id,
    masked_email: maskEmail(appRecord.email),
  });
  res.json({ ok: true });
}));

app.post('/api/admin/guardian-requests/:id/decision', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'guardian request id');
  const schema = z.object({ decision: z.enum(['approved', 'rejected']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid guardian decision payload' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const reqRecord = await getGuardianRequest(sb, id);
  if (!reqRecord) {
    res.status(404).json({ error: 'Guardian activation request not found' });
    return;
  }
  if (reqRecord.status !== 'pending') {
    res.status(409).json({ error: 'This guardian activation request has already been processed.' });
    return;
  }

  const { decision } = parsed.data;
  if (decision === 'approved') {
    const { data: guardianRow } = await sb
      .from('guardians')
      .select('id, profile_id')
      .eq('id', reqRecord.guardian_id)
      .maybeSingle();

    if (guardianRow?.profile_id && guardianRow.profile_id !== reqRecord.profile_id) {
      res.status(409).json({ error: 'This student is already linked to another guardian account.' });
      return;
    }

    const { data: targetProfile } = await sb.from('profiles').select('id, role').eq('id', reqRecord.profile_id).maybeSingle();
    const isSharedStudentProfile = Boolean(reqRecord.shared_student_email || targetProfile?.role === 'student');

    if (!isSharedStudentProfile) {
      await sb.from('profiles').update({ is_active: true, role: 'guardian' }).eq('id', reqRecord.profile_id);
    }
    if (REQUIRE_EMAIL_VERIFICATION) {
      await sendSignupConfirmationIfNeeded(
        sb,
        reqRecord.profile_id,
        reqRecord.email,
        `${resolvePublicBaseUrl(req)}/login?confirmed=1`
      );
    }

    await sb
      .from('guardians')
      .update({
        profile_id: reqRecord.profile_id,
        full_name: reqRecord.full_name,
        email: reqRecord.email,
        ...(reqRecord.phone ? { phone: reqRecord.phone } : {}),
        ...(reqRecord.relation ? { relation: reqRecord.relation } : {}),
      })
      .eq('id', reqRecord.guardian_id);

    const existingAuthRec = await getGuardianAuth(sb, reqRecord.guardian_id);
    if (existingAuthRec) {
      await saveGuardianAuth(sb, {
        ...existingAuthRec,
        linked_profile_id: reqRecord.profile_id,
        status: 'approved',
        updated_at: new Date().toISOString(),
      });
    }

    await insertRowSafe('notifications', {
      profile_id: reqRecord.profile_id,
      title_ar: 'تم تفعيل حساب ولي الأمر بنجاح',
      title_en: 'Guardian Account Approved',
      body_ar: `تمت الموافقة على ربط حسابك بالطالب (${reqRecord.student_name} — ${reqRecord.student_code}). يمكنك الآن تسجيل الدخول ببوابة ولي الأمر باستخدام كلمة المرور الخاصة بولي الأمر.`,
      body_en: `Your guardian portal link to ${reqRecord.student_code} is now active. You may sign in via the Guardian tab using your dedicated guardian password.`,
    });

    await saveGuardianRequest(sb, {
      ...reqRecord,
      status: 'approved',
      reviewed_by: req.user!.id,
      reviewed_at: new Date().toISOString(),
    });
    await writeAuditLog(req.user!.id, req.user!.full_name, 'GUARDIAN_APP_APPROVED', 'guardian', reqRecord.guardian_id, {
      guardian_id: reqRecord.guardian_id,
      student_id: reqRecord.student_id,
      student_code: reqRecord.student_code,
      shared_student_email: isSharedStudentProfile,
      masked_email: maskEmail(reqRecord.email),
    });
    void broadcastRealtimeEvent('academic:updated', { kind: 'guardian' });
    res.json({ ok: true, email: reqRecord.email, student_code: reqRecord.student_code });
    return;
  }

  await saveGuardianRequest(sb, {
    ...reqRecord,
    status: 'rejected',
    reviewed_by: req.user!.id,
    reviewed_at: new Date().toISOString(),
  });
  await deleteGuardianAuth(sb, reqRecord.guardian_id);
  if (!reqRecord.shared_student_email) {
    await deletePendingAuthProfileIfSafe(sb, reqRecord.profile_id);
  }
  await writeAuditLog(req.user!.id, req.user!.full_name, 'GUARDIAN_APP_REJECTED', 'guardian_request', id, {
    guardian_request_id: id,
    guardian_id: reqRecord.guardian_id,
    student_id: reqRecord.student_id,
    student_code: reqRecord.student_code,
    masked_email: maskEmail(reqRecord.email),
  });
  res.json({ ok: true });
}));

app.post('/api/admin/announcements', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    title_ar: z.string().trim().min(1).max(200),
    title_en: z.string().trim().max(200).optional(),
    body_ar: z.string().trim().min(1).max(4000),
    body_en: z.string().trim().max(4000).optional(),
    target_scope: z.enum(['all_students', 'course', 'specific_students']),
    target_course_id: z.coerce.number().int().positive().optional(),
    student_ids: z.array(z.coerce.number().int().positive()).max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid announcement payload' });
    return;
  }
  const { title_ar, title_en, body_ar, body_en, target_scope, target_course_id, student_ids } = parsed.data;
  const sb = requireSupabaseAdmin();

  const ann = await insertRowSafe<{ id: number }>('announcements', {
    title_ar,
    title_en: title_en?.trim() || title_ar,
    body_ar,
    body_en: body_en?.trim() || body_ar,
    target_scope,
    target_course_id: target_scope === 'course' && target_course_id ? target_course_id : null,
    created_by: req.user!.id,
  });

  if (target_scope === 'specific_students' && student_ids && student_ids.length) {
    const uniqueSids = Array.from(new Set(student_ids));
    await sb.from('announcement_targets').insert(
      uniqueSids.map((sid) => ({ announcement_id: ann.id, student_id: sid }))
    );
  }

  const targetProfiles = new Set<string>();
  const collectStudentAndGuardianProfiles = (rows: Array<Record<string, unknown>>) => {
    for (const row of rows) {
      if (row.profile_id) targetProfiles.add(String(row.profile_id));
      const rawG = Array.isArray(row.guardians) ? row.guardians[0] : row.guardians;
      const gObj = rawG as { profile_id?: string | null } | null;
      if (gObj?.profile_id) targetProfiles.add(String(gObj.profile_id));
    }
  };

  if (target_scope === 'all_students') {
    const { data } = await sb.from('students').select('profile_id, guardians(profile_id)').is('deleted_at', null);
    collectStudentAndGuardianProfiles((data || []) as Array<Record<string, unknown>>);
  } else if (target_scope === 'course' && target_course_id) {
    const { data } = await sb
      .from('enrollments')
      .select('students!inner(profile_id, deleted_at, guardians(profile_id))')
      .eq('course_id', target_course_id)
      .is('deleted_at', null)
      .is('students.deleted_at', null);
    const studentsList: Array<Record<string, unknown>> = [];
    for (const row of data || []) {
      const s = Array.isArray((row as { students?: unknown }).students)
        ? (row as { students: unknown[] }).students[0]
        : (row as { students?: unknown }).students;
      if (s && typeof s === 'object') studentsList.push(s as Record<string, unknown>);
    }
    collectStudentAndGuardianProfiles(studentsList);
  } else if (target_scope === 'specific_students' && student_ids && student_ids.length) {
    const { data } = await sb
      .from('students')
      .select('profile_id, guardians(profile_id)')
      .in('id', student_ids)
      .is('deleted_at', null);
    collectStudentAndGuardianProfiles((data || []) as Array<Record<string, unknown>>);
  }

  await insertNotificationsBulk(
    sb,
    targetProfiles,
    title_ar,
    title_en?.trim() || title_ar,
    body_ar,
    body_en?.trim() || body_ar
  );

  void broadcastRealtimeEvent('notification:created', { kind: 'notification' });

  res.status(201).json({ id: ann.id });
}));

app.delete('/api/admin/announcements/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'announcement id');
  const sb = requireSupabaseAdmin();
  const { data: ann } = await sb.from('announcements').select('id, title_ar').eq('id', id).maybeSingle();
  if (!ann) {
    res.status(404).json({ error: 'Announcement not found' });
    return;
  }
  await sb.from('announcement_targets').delete().eq('announcement_id', id);
  await sb.from('announcements').delete().eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'DELETE_ANNOUNCEMENT', 'announcement', id, { title_ar: ann.title_ar });
  res.json({ ok: true });
}));

app.post('/api/admin/exams', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const parsed = examCreateOrUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid exam payload', details: parsed.error.flatten().fieldErrors });
    return;
  }
  if ((parsed.data.exam_mode === 'quiz' || parsed.data.exam_mode === 'hybrid') && parsed.data.questions.length === 0) {
    res.status(400).json({ error: 'Online quiz and hybrid exams require at least one question.' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const questions = normalizeQuestions(parsed.data.questions);
  const inserted = await insertRowSafe<{ id: number }>('exams', {
    course_id: parsed.data.course_id,
    title_ar: parsed.data.title_ar,
    title_en: parsed.data.title_en?.trim() || parsed.data.title_ar,
    exam_date: parsed.data.exam_date,
    max_score: parsed.data.max_score,
  });
  await saveExamVaultConfig(sb, {
    exam_id: inserted.id,
    exam_mode: parsed.data.exam_mode,
    instructions_ar: parsed.data.instructions_ar || '',
    instructions_en: parsed.data.instructions_en || parsed.data.instructions_ar || '',
    available_from: parsed.data.available_from || null,
    due_at: parsed.data.due_at || null,
    allow_late_submission: parsed.data.allow_late_submission,
    show_answers_after_submit: parsed.data.show_answers_after_submit,
    question_file: null,
    questions,
    updated_at: new Date().toISOString(),
  });
  if (parsed.data.notify_students) {
    await notifyCourseExamPublished(
      sb,
      parsed.data.course_id,
      parsed.data.title_ar,
      parsed.data.title_en?.trim() || parsed.data.title_ar
    );
  }
  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_EXAM', 'exam', inserted.id, {
    course_id: parsed.data.course_id,
    exam_mode: parsed.data.exam_mode,
    question_count: questions.length,
  });
  void broadcastRealtimeEvent('academic:updated', { kind: 'exam' });
  res.status(201).json({ id: inserted.id });
}));

app.post('/api/admin/certificates', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    student_id: z.coerce.number().int().positive(),
    course_id: z.coerce.number().int().positive(),
    title_ar: z.string().trim().min(2).max(200),
    title_en: z.string().trim().max(200).optional(),
    grade_label: z.string().trim().min(1).max(80),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid certificate payload' });
    return;
  }
  const { student_id, course_id, title_ar, title_en, grade_label } = parsed.data;
  const sb = requireSupabaseAdmin();
  const [{ data: stu }, { data: crs }] = await Promise.all([
    sb.from('students').select('id').eq('id', student_id).is('deleted_at', null).maybeSingle(),
    sb.from('courses').select('id').eq('id', course_id).is('deleted_at', null).maybeSingle(),
  ]);
  if (!stu || !crs) {
    res.status(404).json({ error: 'Student or course not found' });
    return;
  }

  const code = generateCertificateCode();
  const inserted = await insertRowSafe<{ id: number }>('certificates', {
    verification_code: code,
    student_id,
    course_id,
    title_ar,
    title_en: title_en?.trim() || title_ar,
    grade_label,
    issued_by: req.user!.id,
  });

  await writeAuditLog(req.user!.id, req.user!.full_name, 'ISSUE_CERTIFICATE', 'certificate', inserted.id, {
    code,
    student_id,
    course_id,
  });
  void broadcastRealtimeEvent('academic:updated', { kind: 'certificate' });
  res.status(201).json({ id: inserted.id, verification_code: code });
}));

app.post('/api/admin/certificates/:id/revoke', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'certificate id');
  const sb = requireSupabaseAdmin();
  await sb.from('certificates').update({ revoked_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'REVOKE_CERTIFICATE', 'certificate', id, {});
  res.json({ ok: true });
}));

app.delete('/api/admin/certificates/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'certificate id');
  const sb = requireSupabaseAdmin();
  const { data: cert } = await sb
    .from('certificates')
    .select('id, verification_code, revoked_at')
    .eq('id', id)
    .maybeSingle();

  if (!cert) {
    res.status(404).json({ error: 'Certificate not found' });
    return;
  }
  if (!cert.revoked_at) {
    res.status(400).json({ error: 'Only revoked certificates can be deleted. Revoke the certificate first.' });
    return;
  }
  await sb.from('certificates').delete().eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'DELETE_REVOKED_CERTIFICATE', 'certificate', id, {
    verification_code: cert.verification_code,
  });
  res.json({ ok: true });
}));

app.post('/api/admin/payroll', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    teacher_id: z.coerce.number().int().positive(),
    month_year: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must follow YYYY-MM format'),
    base_amount: z.coerce.number().min(0).max(500000),
    bonus_amount: z.coerce.number().min(0).max(500000).optional().default(0),
    deduction_amount: z.coerce.number().min(0).max(500000).optional().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid payroll payload' });
    return;
  }
  const { teacher_id, month_year, base_amount, bonus_amount, deduction_amount } = parsed.data;
  const net = base_amount + bonus_amount - deduction_amount;
  if (net < 0) {
    res.status(400).json({ error: 'Deductions cannot exceed base plus bonus amount.' });
    return;
  }
  const inserted = await insertRowSafe<{ id: number }>('payroll', {
    teacher_id,
    month_year,
    base_amount,
    bonus_amount,
    deduction_amount,
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
  const id = parsePositiveIntParam(req.params.id, 'payroll id');
  const sb = requireSupabaseAdmin();
  await sb.from('payroll').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'MARK_PAYROLL_PAID', 'payroll', id, {});
  res.json({ ok: true });
}));

app.delete('/api/admin/payroll/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = parsePositiveIntParam(req.params.id, 'payroll id');
  const sb = requireSupabaseAdmin();
  const { data: row } = await sb
    .from('payroll')
    .select('id, teacher_id, month_year, net_amount, status')
    .eq('id', id)
    .maybeSingle();
  if (!row) {
    res.status(404).json({ error: 'Payroll record not found' });
    return;
  }
  await sb.from('payroll').delete().eq('id', id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'DELETE_PAYROLL', 'payroll', id, {
    teacher_id: row.teacher_id,
    month_year: row.month_year,
    status: row.status,
  });
  res.json({ ok: true });
}));

app.get('/api/admin/audit-logs', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const stopTimer = startDevEndpointTimer('GET /api/admin/audit-logs');
  try {
    const sb = requireSupabaseAdmin();
    const { page, limit, q, from, to } = parseAdminListQuery(req);
    const safeQ = sanitizePostgrestOrSearch(q);
    const actionFilter = String(req.query.action || '').trim().slice(0, 80);

    let query = sb
      .from('audit_logs')
      .select('id, actor_name, action, entity_type, entity_id, details_json, created_at', { count: 'exact' });

    if (actionFilter && actionFilter !== 'all') {
      query = query.eq('action', actionFilter);
    }
    if (safeQ) {
      query = query.or(
        `actor_name.ilike.%${safeQ}%,action.ilike.%${safeQ}%,entity_type.ilike.%${safeQ}%,entity_id.ilike.%${safeQ}%`
      );
    }

    const { data, count, error } = await query
      .order('id', { ascending: false })
      .range(from, to);
    if (error) {
      throw new AppError(500, process.env.NODE_ENV === 'production' ? 'Failed to fetch audit logs' : error.message);
    }

    const total = count || 0;
    res.json({
      items: data || [],
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } finally {
    stopTimer?.();
  }
}));

app.put('/api/admin/legal/:docType', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const docType = String(req.params.docType || '').trim();
  if (!['terms', 'privacy', 'refund'].includes(docType)) {
    res.status(400).json({ error: 'Invalid legal document type' });
    return;
  }
  const schema = z.object({
    version: z.string().trim().min(1).max(32).optional(),
    title_ar: z.string().trim().min(1).max(200),
    title_en: z.string().trim().min(1).max(200),
    content_ar: z.string().trim().min(1).max(25000),
    content_en: z.string().trim().min(1).max(25000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid legal document payload' });
    return;
  }
  const { version, title_ar, title_en, content_ar, content_en } = parsed.data;
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
  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_LEGAL_DOC', 'legal_document', docType, { version: version || '1.1' });
  res.json({ ok: true });
}));

app.post('/api/admin/admins', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().max(128).optional(),
    confirmGoogleToken: z.string().min(20).max(8192).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid full name, email, and password (min 8 characters) are required.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const reauth = await verifyAdminReauth(sb, req.user!, parsed.data.confirmPassword, parsed.data.confirmGoogleToken);
  if (!reauth.ok) {
    res.status(reauth.status || 401).json({ error: reauth.error, code: reauth.code });
    return;
  }

  const cleanEmail = parsed.data.email.toLowerCase();
  const cleanName = parsed.data.full_name;

  const { data: existingProfile } = await sb
    .from('profiles')
    .select('id')
    .eq('email', cleanEmail)
    .is('deleted_at', null)
    .maybeSingle();
  if (existingProfile) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const { user, alreadyExisted } = await provisionSupabaseAuthUser(cleanEmail, parsed.data.password, cleanName, 'admin');
  if (alreadyExisted) {
    res.status(409).json({ error: 'This email is already registered in Supabase Auth.' });
    return;
  }

  const { error: profErr } = await sb.from('profiles').upsert(
    {
      id: user.id,
      email: cleanEmail,
      full_name: cleanName,
      role: 'admin',
      is_active: true,
      preferred_lang: 'ar',
    },
    { onConflict: 'id' }
  );
  if (profErr) {
    await sb.auth.admin.deleteUser(user.id).catch(() => {});
    sendInternalError(res, 'admin-create-admin-profile', profErr, 'Failed to create administrator profile');
    return;
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, 'CREATE_ADMIN', 'profile', user.id, {
    profile_id: user.id,
    masked_email: maskEmail(cleanEmail),
  });

  res.status(201).json({
    id: user.id,
    email: cleanEmail,
    full_name: cleanName,
    role: 'admin',
  });
}));

app.patch('/api/admin/users/:id/role', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = String(req.params.id);
  const schema = z.object({
    role: z.enum(['student', 'admin', 'guardian']).optional(),
    is_active: z.union([z.boolean(), z.number()]).optional(),
    confirmPassword: z.string().max(128).optional(),
    confirmGoogleToken: z.string().min(20).max(8192).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user role or status payload.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const reauth = await verifyAdminReauth(sb, req.user!, parsed.data.confirmPassword, parsed.data.confirmGoogleToken);
  if (!reauth.ok) {
    res.status(reauth.status || 401).json({ error: reauth.error, code: reauth.code });
    return;
  }

  const { data: target } = await sb.from('profiles').select('id, email, full_name, role, is_active').eq('id', id).maybeSingle();
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const newRole = parsed.data.role || target.role;
  const newActive = parsed.data.is_active !== undefined ? Boolean(parsed.data.is_active) : Boolean(target.is_active);

  if (id === req.user!.id && (newRole !== 'admin' || !newActive)) {
    res.status(400).json({ error: 'You cannot demote or deactivate your own administrator account.' });
    return;
  }

  if (target.role === 'admin' && (newRole !== 'admin' || !newActive)) {
    const { count } = await sb
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true)
      .is('deleted_at', null);
    if ((count || 0) <= 1) {
      res.status(400).json({ error: 'Cannot remove or deactivate the last active administrator account.' });
      return;
    }
  }

  await sb.from('profiles').update({ role: newRole, is_active: newActive }).eq('id', id);
  await sb.auth.admin.updateUserById(id, { user_metadata: { full_name: target.full_name, role: newRole } });
  await bumpProfileTokenVersion(sb, id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'CHANGE_USER_ROLE', 'profile', id, {
    from: target.role,
    to: newRole,
    is_active: newActive,
  });
  res.json({ ok: true });
}));

app.post('/api/admin/users/:id/reset-password', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = String(req.params.id);
  const parsed = z.object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
    confirmPassword: z.string().max(128).optional(),
    confirmGoogleToken: z.string().min(20).max(8192).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'A new password of at least 8 characters is required.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const reauth = await verifyAdminReauth(sb, req.user!, parsed.data.confirmPassword, parsed.data.confirmGoogleToken);
  if (!reauth.ok) {
    res.status(reauth.status || 401).json({ error: reauth.error, code: reauth.code });
    return;
  }

  const { data: target } = await sb
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { error: updErr } = await sb.auth.admin.updateUserById(id, {
    password: parsed.data.newPassword,
    email_confirm: true,
  });
  if (updErr) {
    sendInternalError(res, 'admin-reset-user-password', updErr, 'Failed to reset user password');
    return;
  }

  await bumpProfileTokenVersion(sb, id);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'ADMIN_RESET_USER_PASSWORD', 'profile', id, {
    masked_email: maskEmail(target.email),
    role: target.role,
  });
  res.json({ ok: true });
}));

app.delete('/api/admin/users/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const id = String(req.params.id);
  if (id === String(req.user!.id)) {
    res.status(400).json({ error: 'You cannot delete your own administrator account.' });
    return;
  }
  invalidateAuthSessionCacheForUser(id);

  const sb = requireSupabaseAdmin();
  const { data: target } = await sb
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', id)
    .maybeSingle();

  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (target.role === 'admin' && target.is_active) {
    const { count } = await sb
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true)
      .is('deleted_at', null);
    if ((count || 0) <= 1) {
      res.status(400).json({ error: 'Cannot delete the last active administrator account.' });
      return;
    }
  }

  const [{ data: linkedTeachers }, { data: linkedStudents }, { data: linkedGuardians }] = await Promise.all([
    sb.from('teachers').select('id').eq('profile_id', id),
    sb.from('students').select('id').eq('profile_id', id),
    sb.from('guardians').select('id, email').eq('profile_id', id),
  ]);

  // Step 1: Delete linked student/teacher entities first (FK order before guardian/profile)
  let cleanupFailed = 0;
  const cascadeResults = await Promise.allSettled([
    ...(linkedTeachers || []).map((t) => hardDeleteTeacherCascade(sb, Number((t as { id: number }).id))),
    ...(linkedStudents || []).map((s) => hardDeleteStudentCascade(sb, Number((s as { id: number }).id))),
  ]);
  cascadeResults.forEach((r, idx) => {
    if (r.status === 'fulfilled') {
      cleanupFailed += r.value.cleanupFailed || 0;
    } else {
      cleanupFailed += 1;
      console.warn(`[deleteUser:${id}] Linked entity cascade warning (#${idx}):`, r.reason);
    }
  });

  // Step 2: Detach or delete linked guardians AFTER linked students are removed
  const deletedGuardianIds: number[] = [];
  const guardianTasks = (linkedGuardians || []).map(async (g) => {
    const gid = Number((g as { id: number }).id);
    const { count: remStu } = await sb.from('students').select('id', { count: 'exact', head: true }).eq('guardian_id', gid);
    if ((remStu || 0) === 0) {
      deletedGuardianIds.push(gid);
      await Promise.allSettled([
        deleteGuardianAuth(sb, gid),
        sb.from('guardians').delete().eq('id', gid),
      ]);
    } else {
      await sb.from('guardians').update({ profile_id: null }).eq('id', gid);
    }
  });
  const guardianResults = await Promise.allSettled(guardianTasks);
  guardianResults.forEach((r, idx) => {
    if (r.status === 'rejected') {
      console.warn(`[deleteUser:${id}] Guardian detach warning (#${idx}):`, r.reason);
    }
  });

  // Step 3: Scrub existing audit rows BEFORE deleting profile (actor_id ON DELETE SET NULL)
  await Promise.allSettled([
    anonymizeAuditSubject({ profileId: id, entityType: 'profile', entityId: id }),
    ...deletedGuardianIds.map((gid) => anonymizeAuditSubject({ entityType: 'guardian', entityId: gid })),
  ]);

  // Step 4: Delete notifications -> profiles -> Auth user -> email traces
  const { error: notifErr } = await sb.from('notifications').delete().eq('profile_id', id);
  if (notifErr) {
    console.warn(`[deleteUser:${id}] Notification cleanup warning:`, notifErr.message);
  }
  const { error: profDelErr } = await sb.from('profiles').delete().eq('id', id);
  if (profDelErr) {
    console.warn(`[deleteUser:${id}] Profile cleanup warning:`, profDelErr.message);
  }

  const [, traceRes] = await Promise.allSettled([
    sb.auth.admin.deleteUser(id).then(({ error }) => {
      if (error) console.warn(`[deleteUser:${id}] Auth delete warning:`, error.message);
    }),
    purgeEmailTraces(sb, [target.email, ...(linkedGuardians || []).map((g: { email?: string }) => g.email)], [id]),
  ]);
  if (traceRes.status === 'fulfilled') {
    cleanupFailed += traceRes.value || 0;
  } else {
    cleanupFailed += 1;
    console.warn(`[deleteUser:${id}] Trace purge warning:`, traceRes.reason);
  }

  invalidateOverviewCache();
  await writeAuditLog(req.user!.id, req.user!.full_name, 'HARD_DELETE_USER', 'profile', id, {
    profile_id: id,
    masked_email: maskEmail(target.email),
    role: target.role,
    ...(cleanupFailed > 0 ? { cleanup_failed: cleanupFailed } : {}),
  });
  res.json(cleanupFailed > 0 ? { ok: true, warnings: { cleanup_failed: cleanupFailed } } : { ok: true });
}));

// ============================================================================
// REAL AUTHENTICATED COMMUNITY COMMENTS, DEVELOPMENT SUGGESTIONS & PLACEMENT TEST CMS
// ============================================================================
app.get('/api/public/comments', asyncHandler(async (req, res) => {
  const viewer = await tryAuthenticateOptional(req);
  const sb = requireSupabaseAdmin();
  const all = await listAllComments(sb);
  const visible = all.filter((c) => c.is_visible);
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ comments: visible.map((c) => sanitizeCommentForPublic(c, viewer?.id || null)) });
}));

app.post('/api/comments', authenticate, communityWriteLimiter, asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    rating: z.coerce.number().int().min(1).max(5).default(5),
    content: z.string().trim().min(5).max(800),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Comment must be between 5 and 800 characters with a 1-5 rating.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const id = generateRecordId('c');
  const record = {
    id,
    author_profile_id: req.user!.id,
    author_name: req.user!.full_name,
    author_role: req.user!.role,
    rating: parsed.data.rating,
    content: parsed.data.content,
    is_visible: true,
    replies: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
  await saveComment(sb, record);
  await writeAuditLog(req.user!.id, auditActorName(req.user!), 'CREATE_COMMENT', 'comment', id, {
    rating: record.rating,
    role: req.user!.role,
  });
  res.status(201).json({ comment: sanitizeCommentForPublic(record, req.user!.id) });
}));

app.post('/api/comments/:id/replies', authenticate, communityWriteLimiter, asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    content: z.string().trim().min(2).max(600),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Reply must be between 2 and 600 characters.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const existing = await getCommentById(sb, String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }
  if (!existing.is_visible && req.user!.role !== 'admin' && existing.author_profile_id !== req.user!.id) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  const reply = {
    id: generateRecordId('r'),
    author_profile_id: req.user!.id,
    author_name: req.user!.full_name,
    author_role: req.user!.role,
    content: parsed.data.content,
    created_at: new Date().toISOString(),
  };

  existing.replies = [...(existing.replies || []), reply];
  existing.updated_at = reply.created_at;
  await saveComment(sb, existing);

  if (existing.author_profile_id !== req.user!.id) {
    await insertRowSafe('notifications', {
      profile_id: existing.author_profile_id,
      title_ar: `رد جديد على تعليقك من ${req.user!.full_name}`,
      title_en: `New Reply on Your Review from ${req.user!.full_name}`,
      body_ar: parsed.data.content.slice(0, 140),
      body_en: parsed.data.content.slice(0, 140),
    }).catch(() => {});
  }

  await writeAuditLog(req.user!.id, auditActorName(req.user!), 'REPLY_COMMENT', 'comment', existing.id, {
    reply_id: reply.id,
  });

  res.status(201).json({ comment: sanitizeCommentForPublic(existing, req.user!.id) });
}));

app.delete('/api/comments/:id', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const existing = await getCommentById(sb, String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }
  if (req.user!.role !== 'admin' && existing.author_profile_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden: you can only delete your own comments.' });
    return;
  }
  await deleteCommentRecord(sb, existing.id);
  await writeAuditLog(req.user!.id, auditActorName(req.user!), 'DELETE_COMMENT', 'comment', existing.id, {});
  res.json({ ok: true });
}));

app.patch('/api/admin/comments/:id/visibility', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({ is_visible: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid visibility flag.' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const existing = await getCommentById(sb, String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }
  existing.is_visible = parsed.data.is_visible;
  existing.updated_at = new Date().toISOString();
  await saveComment(sb, existing);
  await writeAuditLog(req.user!.id, req.user!.full_name, 'MODERATE_COMMENT', 'comment', existing.id, {
    is_visible: existing.is_visible,
  });
  res.json({ comment: sanitizeCommentForPublic(existing, req.user!.id) });
}));

app.get('/api/public/suggestions', asyncHandler(async (req, res) => {
  const viewer = await tryAuthenticateOptional(req);
  const sb = requireSupabaseAdmin();
  const all = await listAllSuggestions(sb);
  const publicList = all.filter((s) => s.status !== 'declined');
  res.setHeader('Cache-Control', 'no-cache');
  res.json({ suggestions: publicList.map((s) => sanitizeSuggestionForPublic(s, viewer?.id || null)) });
}));

app.post('/api/suggestions', authenticate, communityWriteLimiter, asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    category: z.enum(['platform', 'curriculum', 'experience', 'other']).default('platform'),
    title: z.string().trim().min(4).max(120),
    description: z.string().trim().min(10).max(1200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Suggestion title (4-120 chars) and details (10-1200 chars) are required.' });
    return;
  }
  const sb = requireSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const id = generateRecordId('s');
  const record = {
    id,
    author_profile_id: req.user!.id,
    author_name: req.user!.full_name,
    author_role: req.user!.role,
    category: parsed.data.category,
    title: parsed.data.title,
    description: parsed.data.description,
    status: 'pending' as const,
    admin_reply: '',
    replied_by_name: null,
    replied_at: null,
    voter_ids: [req.user!.id],
    created_at: nowIso,
    updated_at: nowIso,
  };
  await saveSuggestion(sb, record);
  await writeAuditLog(req.user!.id, auditActorName(req.user!), 'CREATE_SUGGESTION', 'suggestion', id, {
    category: record.category,
    title: record.title,
  });
  res.status(201).json({ suggestion: sanitizeSuggestionForPublic(record, req.user!.id) });
}));

app.post('/api/suggestions/:id/vote', authenticate, communityWriteLimiter, asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const existing = await getSuggestionById(sb, String(req.params.id));
  if (!existing || existing.status === 'declined') {
    res.status(404).json({ error: 'Suggestion not found' });
    return;
  }
  const voters = new Set(existing.voter_ids || []);
  let hasVoted = false;
  if (voters.has(req.user!.id)) {
    voters.delete(req.user!.id);
    hasVoted = false;
  } else {
    voters.add(req.user!.id);
    hasVoted = true;
  }
  existing.voter_ids = Array.from(voters);
  existing.updated_at = new Date().toISOString();
  await saveSuggestion(sb, existing);
  res.json({ votes_count: existing.voter_ids.length, has_voted: hasVoted });
}));

app.delete('/api/suggestions/:id', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const existing = await getSuggestionById(sb, String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Suggestion not found' });
    return;
  }
  if (req.user!.role !== 'admin' && existing.author_profile_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden: you can only delete your own suggestions.' });
    return;
  }
  await deleteSuggestionRecord(sb, existing.id);
  await writeAuditLog(req.user!.id, auditActorName(req.user!), 'DELETE_SUGGESTION', 'suggestion', existing.id, {});
  res.json({ ok: true });
}));

app.patch('/api/admin/suggestions/:id', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const schema = z.object({
    status: z.enum(['pending', 'reviewing', 'planned', 'implemented', 'declined']),
    admin_reply: z.string().trim().max(800).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid suggestion status or reply payload.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const existing = await getSuggestionById(sb, String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Suggestion not found' });
    return;
  }

  const nowIso = new Date().toISOString();
  existing.status = parsed.data.status;
  existing.admin_reply = parsed.data.admin_reply;
  existing.replied_by_name = req.user!.full_name;
  existing.replied_at = nowIso;
  existing.updated_at = nowIso;
  await saveSuggestion(sb, existing);

  if (existing.author_profile_id !== req.user!.id) {
    await insertRowSafe('notifications', {
      profile_id: existing.author_profile_id,
      title_ar: `تحديث على اقتراحك: ${existing.title}`,
      title_en: `Update on Your Suggestion: ${existing.title}`,
      body_ar: parsed.data.admin_reply
        ? `تم تحديث الحالة (${parsed.data.status}): ${parsed.data.admin_reply.slice(0, 120)}`
        : `تم تحديث حالة اقتراحك إلى: ${parsed.data.status}`,
      body_en: parsed.data.admin_reply
        ? `Status updated (${parsed.data.status}): ${parsed.data.admin_reply.slice(0, 120)}`
        : `Your suggestion status is now: ${parsed.data.status}`,
    }).catch(() => {});
  }

  await writeAuditLog(req.user!.id, req.user!.full_name, 'REVIEW_SUGGESTION', 'suggestion', existing.id, {
    status: existing.status,
  });

  res.json({ suggestion: sanitizeSuggestionForPublic(existing, req.user!.id) });
}));

app.get('/api/my/community', authenticate, asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const [allComments, allSuggestions] = await Promise.all([listAllComments(sb), listAllSuggestions(sb)]);
  const myComments = allComments
    .filter((c) => c.author_profile_id === req.user!.id && c.author_role === req.user!.role)
    .map((c) => sanitizeCommentForPublic(c, req.user!.id));
  const mySuggestions = allSuggestions
    .filter((s) => s.author_profile_id === req.user!.id && s.author_role === req.user!.role)
    .map((s) => sanitizeSuggestionForPublic(s, req.user!.id));
  res.json({ comments: myComments, suggestions: mySuggestions });
}));

app.get('/api/admin/community', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const sb = requireSupabaseAdmin();
  const [allComments, allSuggestions] = await Promise.all([listAllComments(sb), listAllSuggestions(sb)]);
  res.json({
    comments: allComments.map((c) => sanitizeCommentForPublic(c, req.user!.id)),
    suggestions: allSuggestions.map((s) => sanitizeSuggestionForPublic(s, req.user!.id)),
  });
}));

app.get('/api/admin/placement-test', authenticate, requireRole('admin'), asyncHandler(async (_req, res) => {
  const sb = requireSupabaseAdmin();
  const [config, { data: submissions }] = await Promise.all([
    getPlacementTestConfig(sb),
    sb
      .from('placement_tests')
      .select('id, child_name, age, parent_email, score, recommended_level_id, created_at, levels(name_ar, name_en)')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  const recentSubmissions = (submissions || []).map((row: Record<string, unknown>) => {
    const lvl = row.levels as { name_ar?: string; name_en?: string } | null;
    const { levels: _l, ...rest } = row;
    return {
      ...rest,
      level_name_ar: lvl?.name_ar ?? '—',
      level_name_en: lvl?.name_en ?? '—',
    };
  });
  res.json({ config, submissions: recentSubmissions });
}));

app.put('/api/admin/placement-test', authenticate, requireRole('admin'), asyncHandler<AuthRequest>(async (req, res) => {
  const questionSchema = z.object({
    id: z.string().trim().min(1).max(60).optional(),
    q_ar: z.string().trim().min(3).max(350),
    q_en: z.string().trim().max(350).optional().default(''),
    opts_ar: z.array(z.string().trim().min(1).max(200)).min(2).max(5),
    opts_en: z.array(z.string().trim().max(200)).optional().default([]),
    correct_index: z.coerce.number().int().min(0).max(4),
  });
  const schema = z.object({
    intro_ar: z.string().trim().min(5).max(400),
    intro_en: z.string().trim().max(400).optional().default(''),
    questions: z.array(questionSchema).min(1).max(20),
    thresholds: z.object({
      intermediate_min_score: z.coerce.number().int().min(1).max(99),
      advanced_min_score: z.coerce.number().int().min(1).max(100),
      advanced_min_age: z.coerce.number().int().min(3).max(22),
    }),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid placement test configuration.', details: parsed.error.flatten().fieldErrors });
    return;
  }

  for (const q of parsed.data.questions) {
    if (q.correct_index >= q.opts_ar.length) {
      res.status(400).json({ error: 'Correct option index exceeds available options for one or more questions.' });
      return;
    }
  }
  if (parsed.data.thresholds.advanced_min_score < parsed.data.thresholds.intermediate_min_score) {
    res.status(400).json({ error: 'Advanced threshold score must be greater than or equal to intermediate score.' });
    return;
  }

  const sb = requireSupabaseAdmin();
  const normalizedQuestions = parsed.data.questions.map((q) => ({
    id: q.id || generateRecordId('pt'),
    q_ar: q.q_ar,
    q_en: q.q_en || q.q_ar,
    opts_ar: q.opts_ar,
    opts_en:
      q.opts_en && q.opts_en.length === q.opts_ar.length
        ? q.opts_en.map((o, idx) => o || q.opts_ar[idx])
        : q.opts_ar,
    correct_index: q.correct_index,
  }));

  const saved = await savePlacementTestConfig(sb, {
    intro_ar: parsed.data.intro_ar,
    intro_en: parsed.data.intro_en || parsed.data.intro_ar,
    questions: normalizedQuestions,
    thresholds: parsed.data.thresholds,
    updated_at: new Date().toISOString(),
  });

  await writeAuditLog(req.user!.id, req.user!.full_name, 'UPDATE_PLACEMENT_TEST', 'placement_test', 'config', {
    question_count: saved.questions.length,
    thresholds: saved.thresholds,
  });

  res.json({ config: saved });
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
      console.error('[supabase-sync-users]', err);
      throw new AppError(
        502,
        IS_PRODUCTION ? 'Supabase sync failed' : err instanceof Error ? err.message : 'Supabase sync failed'
      );
    }
  );
  await writeAuditLog(req.user!.id, req.user!.full_name, 'SYNC_SUPABASE_AUTH', 'supabase', 'auth', result);
  res.json(result);
}));

function isLegacyHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host.endsWith('.up.railway.app') ||
    host === 'noorbayan.academy' ||
    host === 'www.noorbayan.academy'
  );
}

function resolveCanonicalSiteUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL' && /^https?:\/\//i.test(configured)) {
    try {
      const parsed = new URL(configured);
      const host = parsed.hostname.toLowerCase();
      if (host !== 'localhost' && host !== '127.0.0.1' && !isLegacyHost(host)) {
        return parsed.origin;
      }
    } catch {
      // fall back to official site URL
    }
  }
  return OFFICIAL_SITE_URL;
}

function resolvePublicBaseUrl(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured && configured !== 'MY_APP_URL' && /^https?:\/\//i.test(configured)) {
    try {
      const parsed = new URL(configured);
      if (!isLegacyHost(parsed.hostname)) {
        return parsed.origin;
      }
    } catch {
      // fall back to request host
    }
  }
  const protoRaw = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim().toLowerCase();
  const proto = protoRaw === 'http' || protoRaw === 'https' ? protoRaw : 'https';
  const hostRaw = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  const hostNoPort = hostRaw.split(':')[0].toLowerCase();
  if (!hostRaw || isLegacyHost(hostNoPort)) {
    return OFFICIAL_SITE_URL;
  }
  if (IS_PRODUCTION && (hostNoPort === 'localhost' || hostNoPort === '127.0.0.1')) {
    return OFFICIAL_SITE_URL;
  }
  const safeHost = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/.test(hostRaw) ? hostRaw : '';
  return safeHost ? `${proto}://${safeHost}` : OFFICIAL_SITE_URL;
}

function escapeXmlText(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

app.get('/robots.txt', (_req, res) => {
  const baseUrl = resolveCanonicalSiteUrl();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(
    `User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /login\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', asyncHandler(async (_req, res) => {
  const baseUrl = escapeXmlText(resolveCanonicalSiteUrl());
  const staticPaths: Array<{ path: string; priority: string }> = [
    { path: '/', priority: '1.0' },
    { path: '/courses', priority: '0.9' },
    { path: '/teachers', priority: '0.8' },
    { path: '/levels', priority: '0.8' },
    { path: '/placement', priority: '0.9' },
    { path: '/apply', priority: '0.9' },
    { path: '/parents', priority: '0.8' },
    { path: '/games', priority: '0.8' },
    { path: '/verify', priority: '0.7' },
    { path: '/how-it-works', priority: '0.7' },
    { path: '/faq', priority: '0.6' },
    { path: '/contact', priority: '0.7' },
    { path: '/legal/terms', priority: '0.4' },
    { path: '/legal/privacy', priority: '0.4' },
    { path: '/legal/refund', priority: '0.4' },
  ];

  const dynamicUrls: Array<{ path: string; priority: string }> = [];
  try {
    const sb = requireSupabaseAdmin();
    const [{ data: courses }, { data: teachers }, { data: games }] = await Promise.all([
      sb.from('courses').select('id').is('deleted_at', null),
      sb.from('teachers').select('id').is('deleted_at', null).eq('is_public', true),
      sb.from('games').select('slug').eq('is_active', true),
    ]);
    for (const c of courses || []) {
      dynamicUrls.push({ path: `/courses/${c.id}`, priority: '0.8' });
    }
    for (const t of teachers || []) {
      dynamicUrls.push({ path: `/teachers/${t.id}`, priority: '0.7' });
    }
    for (const g of games || []) {
      dynamicUrls.push({ path: `/games/${encodeURIComponent(String(g.slug))}`, priority: '0.7' });
    }
  } catch {
    // Serve static URLs if DB query fails
  }

  const urls = [...staticPaths, ...dynamicUrls]
    .map(
      (u) =>
        `  <url><loc>${baseUrl}${escapeXmlText(u.path)}</loc><priority>${u.priority}</priority></url>`
    )
    .join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}));

// Unmatched API endpoints return structured JSON 404 instead of SPA HTML
app.use('/api', apiNotFoundHandler);

// ============================================================================
// VITE DEV / PRODUCTION STATIC MOUNT + GLOBAL ERROR MIDDLEWARE + GRACEFUL SHUTDOWN
// ============================================================================
function validateProductionConfig(): void {
  try {
    if (!IS_PRODUCTION) return;

    const issues: string[] = [];
    const appUrl = String(process.env.APP_URL || '').trim();
    if (!appUrl || appUrl === 'MY_APP_URL' || !/^https?:\/\//i.test(appUrl)) {
      issues.push('APP_URL is missing or invalid');
    }

    const sessionSecret = String(process.env.SESSION_SECRET || '').trim();
    if (!sessionSecret || sessionSecret.length < 32 || sessionSecret === 'REPLACE_WITH_LONG_RANDOM_SECRET') {
      issues.push('SESSION_SECRET is missing or shorter than 32 characters');
    }

    const ibanKey = String(process.env.IBAN_ENCRYPTION_KEY || '').trim();
    if (!ibanKey || ibanKey.length < 16) {
      issues.push('IBAN_ENCRYPTION_KEY is missing or weak (< 16 chars)');
    }

    const turnstileSecret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
    if (!turnstileSecret) {
      issues.push('TURNSTILE_SECRET_KEY is missing');
    }

    const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!serviceRoleKey) {
      issues.push('SUPABASE_SERVICE_ROLE_KEY is missing');
    }

    if (issues.length > 0) {
      console.error(`[production-config] Configuration warnings (${issues.length}): ${issues.join('; ')}`);
    }
    console.warn(
      '[production-config] Rate limits, lockouts, revoked sessions, and caches are stored in-memory — run a single server instance.'
    );
  } catch (err) {
    console.warn('[production-config] Startup validation check warning:', err instanceof Error ? err.message : err);
  }
}

async function startServer() {
  validateProductionConfig();
  const PORT = Number(process.env.PORT || 3000);
  const httpServer = http.createServer(app);
  let viteServer: ViteDevServer | null = null;

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        ws: { server: httpServer },
      },
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
          const relPath = path.relative(distPath, filePath).split(path.sep).join('/');
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (/^assets\/[^/]+\.(js|css)$/i.test(relPath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (relPath.startsWith('assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
        },
      })
    );

    const indexHtmlTemplate = fs.existsSync(indexHtmlPath)
      ? fs.readFileSync(indexHtmlPath, 'utf8')
      : null;

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      if (/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2|json|map)$/i.test(req.path)) {
        res.status(404).end();
        return;
      }
      if (!indexHtmlTemplate && !fs.existsSync(indexHtmlPath)) {
        res.status(503).json({ error: 'Frontend build missing. Run npm run build first.' });
        return;
      }
      const rawHtml = indexHtmlTemplate || fs.readFileSync(indexHtmlPath, 'utf8');
      const baseUrl = resolveCanonicalSiteUrl();
      const safePath = /^\/[a-zA-Z0-9/_-]*$/.test(req.path) ? req.path : '/';
      const canonicalUrl = `${baseUrl}${safePath === '/' ? '/' : safePath}`;
      const ogImageAbs = `${baseUrl}/assets/images/academy_banner.webp`;
      const hasCanonical = /<link\s+rel="canonical"/i.test(rawHtml);
      let hydratedHtml = rawHtml
        .replace(
          /content="(?:https?:\/\/[^"]*)?\/assets\/images\/academy_banner\.webp"/g,
          `content="${escapeXmlText(ogImageAbs)}"`
        )
        .replace(
          /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
          `<meta property="og:url" content="${escapeXmlText(canonicalUrl)}" />`
        );
      if (hasCanonical) {
        hydratedHtml = hydratedHtml.replace(
          /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
          `<link rel="canonical" href="${escapeXmlText(canonicalUrl)}" />`
        );
      } else {
        hydratedHtml = hydratedHtml.replace(
          '</head>',
          `  <link rel="canonical" href="${escapeXmlText(canonicalUrl)}" />\n  </head>`
        );
      }

      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(hydratedHtml);
    });
  }

  // Global Error Handling Middleware (always registered last)
  app.use(globalErrorHandler);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Noor & Bayan Academy (Supabase PostgreSQL, ${IS_PRODUCTION ? 'production' : 'development'}) running on http://0.0.0.0:${PORT}`
    );
    void ensureUpdatedLevelsCatalog();
    void cleanupExpiredAuditLogs();
    const auditCleanupTimer = setInterval(() => {
      void cleanupExpiredAuditLogs();
    }, 12 * 60 * 60 * 1000);
    auditCleanupTimer.unref();
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
