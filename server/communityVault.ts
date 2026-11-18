import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { APPLICATION_VAULT_BUCKET } from './applicationVault.ts';

export type CommunityRole = 'student' | 'teacher' | 'guardian' | 'admin';

export interface CommentReplyRecord {
  id: string;
  author_profile_id: string;
  author_name: string;
  author_role: CommunityRole;
  content: string;
  created_at: string;
}

export interface CommunityCommentRecord {
  id: string;
  author_profile_id: string;
  author_name: string;
  author_role: CommunityRole;
  rating: number;
  content: string;
  is_visible: boolean;
  replies: CommentReplyRecord[];
  created_at: string;
  updated_at: string;
}

export type SuggestionCategory = 'platform' | 'curriculum' | 'experience' | 'other';
export type SuggestionStatus = 'pending' | 'reviewing' | 'planned' | 'implemented' | 'declined';

export interface AcademySuggestionRecord {
  id: string;
  author_profile_id: string;
  author_name: string;
  author_role: CommunityRole;
  category: SuggestionCategory;
  title: string;
  description: string;
  status: SuggestionStatus;
  admin_reply: string;
  replied_by_name: string | null;
  replied_at: string | null;
  voter_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface PlacementQuestionItem {
  id: string;
  q_ar: string;
  q_en: string;
  opts_ar: string[];
  opts_en: string[];
  correct_index: number;
}

export interface PlacementTestConfig {
  intro_ar: string;
  intro_en: string;
  questions: PlacementQuestionItem[];
  thresholds: {
    intermediate_min_score: number;
    advanced_min_score: number;
    advanced_min_age: number;
  };
  updated_at: string;
}

const DEFAULT_PLACEMENT_CONFIG: PlacementTestConfig = {
  intro_ar: 'أجب مع طفلك عن الأسئلة التالية لنرشح لك المستوى والحلقة الأنسب له.',
  intro_en: 'Complete these short questions with your child to receive an instant level recommendation.',
  questions: [
    {
      id: 'pt-1',
      q_ar: '١. هل يميز الطفل شكل الحروف العربية وصوتها بالفتحة والكسرة والضمة؟',
      q_en: '1. Can the child recognize Arabic letters and their short vowels (Fatha, Kasra, Damma)?',
      opts_ar: ['لا يعرف الحروف بعد', 'يميز معظم الحروف والحركات', 'يقرأ الكلمات بالحركات بطلاقة تامة'],
      opts_en: ['Not yet', 'Recognizes most letters & vowels', 'Reads voweled words fluently'],
      correct_index: 1,
    },
    {
      id: 'pt-2',
      q_ar: '٢. اختر الكلمة التي تبدأ بحرف مضموم:',
      q_en: '2. Which Arabic word starts with a Damma vowel?',
      opts_ar: ['كَتَبَ', 'عِلْمٌ', 'كُتُبٌ'],
      opts_en: ['كَتَبَ (Ka-ta-ba)', 'عِلْمٌ (Il-mun)', 'كُتُبٌ (Ku-tu-bun)'],
      correct_index: 2,
    },
    {
      id: 'pt-3',
      q_ar: '٣. ما مستوى حفظ الطفل من جزء عمّ؟',
      q_en: '3. How much of Juz Amma has the child memorized?',
      opts_ar: ['أتمّ حفظ جزء عمّ كاملاً', 'يحفظ من 5 إلى 15 سورة قصيرة', 'لم يبدأ الحفظ بعد أو يحفظ أقل من 5 سور'],
      opts_en: ['Completed Juz Amma', 'Memorized 5–15 short Surahs', 'Just starting (< 5 Surahs)'],
      correct_index: 0,
    },
    {
      id: 'pt-4',
      q_ar: '٤. في كلمة "مِنْكُمْ"، ما الحكم التجويدي للنون الساكنة قبل الكاف؟',
      q_en: '4. What is the Tajweed rule of Noon Sakinah in "مِنْكُمْ"?',
      opts_ar: ['إظهار حلقي', 'إدغام بغنة', 'إخفاء حقيقي'],
      opts_en: ['Izhar Halqi', 'Idgham with Ghunnah', 'Ikhfa Haqiqi'],
      correct_index: 2,
    },
    {
      id: 'pt-5',
      q_ar: '٥. هل يستطيع الطفل القراءة مباشرة من المصحف الشريف بالتشكيل؟',
      q_en: '5. Can the child read directly from the Mushaf with diacritics?',
      opts_ar: ['يحتاج للتأسيس أولاً', 'يقرأ جملاً قصيرة ببطء', 'يقرأ من المصحف بثقة وانطلاق'],
      opts_en: ['Needs foundational reading first', 'Reads short phrases slowly', 'Reads from Mushaf smoothly'],
      correct_index: 1,
    },
  ],
  thresholds: {
    intermediate_min_score: 50,
    advanced_min_score: 80,
    advanced_min_age: 9,
  },
  updated_at: new Date().toISOString(),
};

let bucketEnsuredAt = 0;
let commentsCache: { data: CommunityCommentRecord[]; expiresAt: number } | null = null;
let suggestionsCache: { data: AcademySuggestionRecord[]; expiresAt: number } | null = null;
let placementCache: { data: PlacementTestConfig; expiresAt: number } | null = null;

async function ensureBucket(sb: SupabaseClient): Promise<void> {
  if (Date.now() - bucketEnsuredAt < 60_000) return;
  const { data: bucket } = await sb.storage.getBucket(APPLICATION_VAULT_BUCKET);
  if (!bucket) {
    const { error } = await sb.storage.createBucket(APPLICATION_VAULT_BUCKET, {
      public: false,
      fileSizeLimit: 512 * 1024,
    });
    if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
      throw new Error(`Vault bucket init failed: ${error.message}`);
    }
  }
  bucketEnsuredAt = Date.now();
}

async function listJsonFiles(sb: SupabaseClient, folder: string): Promise<string[]> {
  await ensureBucket(sb);
  const all: string[] = [];
  const limit = 500;
  for (let offset = 0; offset < 5000; offset += limit) {
    const { data: files } = await sb.storage.from(APPLICATION_VAULT_BUCKET).list(folder, { limit, offset });
    if (!files || !files.length) break;
    for (const f of files) {
      if (f.name.endsWith('.json')) all.push(f.name);
    }
    if (files.length < limit) break;
  }
  return all;
}

async function readJson<T>(sb: SupabaseClient, objectPath: string): Promise<T | null> {
  await ensureBucket(sb);
  const { data, error } = await sb.storage.from(APPLICATION_VAULT_BUCKET).download(objectPath);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(sb: SupabaseClient, objectPath: string, payload: unknown): Promise<void> {
  await ensureBucket(sb);
  const body = Buffer.from(JSON.stringify(payload), 'utf-8');
  const { error } = await sb.storage.from(APPLICATION_VAULT_BUCKET).upload(objectPath, body, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) {
    throw new Error(`Failed to persist community data: ${error.message}`);
  }
}

async function deleteJson(sb: SupabaseClient, objectPath: string): Promise<void> {
  await ensureBucket(sb);
  await sb.storage.from(APPLICATION_VAULT_BUCKET).remove([objectPath]);
}

function validateSafeId(id: string): string {
  const clean = id.trim();
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(clean)) {
    throw new Error('Invalid identifier format');
  }
  return clean;
}

export function generateRecordId(prefix: 'c' | 'r' | 's' | 'pt'): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

// ============================================================================
// COMMENTS / REVIEWS
// ============================================================================
export async function listAllComments(sb: SupabaseClient): Promise<CommunityCommentRecord[]> {
  if (commentsCache && Date.now() < commentsCache.expiresAt) {
    return commentsCache.data;
  }
  const files = await listJsonFiles(sb, 'community/comments');
  const items = await Promise.all(files.map((name) => readJson<CommunityCommentRecord>(sb, `community/comments/${name}`)));
  const clean = items
    .filter((x): x is CommunityCommentRecord => Boolean(x && x.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  commentsCache = { data: clean, expiresAt: Date.now() + 20_000 };
  return clean;
}

export async function getCommentById(sb: SupabaseClient, id: string): Promise<CommunityCommentRecord | null> {
  const safeId = validateSafeId(id);
  return readJson<CommunityCommentRecord>(sb, `community/comments/${safeId}.json`);
}

export async function saveComment(sb: SupabaseClient, record: CommunityCommentRecord): Promise<void> {
  const safeId = validateSafeId(record.id);
  await writeJson(sb, `community/comments/${safeId}.json`, record);
  commentsCache = null;
}

export async function deleteCommentRecord(sb: SupabaseClient, id: string): Promise<void> {
  const safeId = validateSafeId(id);
  await deleteJson(sb, `community/comments/${safeId}.json`);
  commentsCache = null;
}

export function sanitizeCommentForPublic(c: CommunityCommentRecord, viewerId?: string | null) {
  return {
    id: c.id,
    author_name: c.author_name,
    author_role: c.author_role,
    rating: c.rating,
    content: c.content,
    is_visible: c.is_visible,
    is_mine: Boolean(viewerId && c.author_profile_id === viewerId),
    replies: (c.replies || []).map((r) => ({
      id: r.id,
      author_name: r.author_name,
      author_role: r.author_role,
      content: r.content,
      created_at: r.created_at,
      is_mine: Boolean(viewerId && r.author_profile_id === viewerId),
    })),
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

// ============================================================================
// ACADEMY DEVELOPMENT SUGGESTIONS
// ============================================================================
export async function listAllSuggestions(sb: SupabaseClient): Promise<AcademySuggestionRecord[]> {
  if (suggestionsCache && Date.now() < suggestionsCache.expiresAt) {
    return suggestionsCache.data;
  }
  const files = await listJsonFiles(sb, 'community/suggestions');
  const items = await Promise.all(files.map((name) => readJson<AcademySuggestionRecord>(sb, `community/suggestions/${name}`)));
  const clean = items
    .filter((x): x is AcademySuggestionRecord => Boolean(x && x.id))
    .sort((a, b) => {
      const voteDiff = (b.voter_ids?.length || 0) - (a.voter_ids?.length || 0);
      if (voteDiff !== 0) return voteDiff;
      return b.created_at.localeCompare(a.created_at);
    });
  suggestionsCache = { data: clean, expiresAt: Date.now() + 20_000 };
  return clean;
}

export async function getSuggestionById(sb: SupabaseClient, id: string): Promise<AcademySuggestionRecord | null> {
  const safeId = validateSafeId(id);
  return readJson<AcademySuggestionRecord>(sb, `community/suggestions/${safeId}.json`);
}

export async function saveSuggestion(sb: SupabaseClient, record: AcademySuggestionRecord): Promise<void> {
  const safeId = validateSafeId(record.id);
  await writeJson(sb, `community/suggestions/${safeId}.json`, record);
  suggestionsCache = null;
}

export async function deleteSuggestionRecord(sb: SupabaseClient, id: string): Promise<void> {
  const safeId = validateSafeId(id);
  await deleteJson(sb, `community/suggestions/${safeId}.json`);
  suggestionsCache = null;
}

export function sanitizeSuggestionForPublic(s: AcademySuggestionRecord, viewerId?: string | null) {
  const voters = Array.isArray(s.voter_ids) ? s.voter_ids : [];
  return {
    id: s.id,
    author_name: s.author_name,
    author_role: s.author_role,
    category: s.category,
    title: s.title,
    description: s.description,
    status: s.status,
    admin_reply: s.admin_reply || '',
    replied_by_name: s.replied_by_name || null,
    replied_at: s.replied_at || null,
    votes_count: voters.length,
    has_voted: Boolean(viewerId && voters.includes(viewerId)),
    is_mine: Boolean(viewerId && s.author_profile_id === viewerId),
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

// ============================================================================
// EDITABLE PLACEMENT TEST CONFIG
// ============================================================================
export async function getPlacementTestConfig(sb: SupabaseClient): Promise<PlacementTestConfig> {
  if (placementCache && Date.now() < placementCache.expiresAt) {
    return placementCache.data;
  }
  const saved = await readJson<PlacementTestConfig>(sb, 'community/placement-test.json');
  const resolved =
    saved && Array.isArray(saved.questions) && saved.questions.length > 0
      ? saved
      : DEFAULT_PLACEMENT_CONFIG;
  placementCache = { data: resolved, expiresAt: Date.now() + 60_000 };
  return resolved;
}

export async function savePlacementTestConfig(sb: SupabaseClient, config: PlacementTestConfig): Promise<PlacementTestConfig> {
  const next: PlacementTestConfig = {
    ...config,
    updated_at: new Date().toISOString(),
  };
  await writeJson(sb, 'community/placement-test.json', next);
  placementCache = { data: next, expiresAt: Date.now() + 60_000 };
  return next;
}

export function sanitizePlacementConfigForPublic(cfg: PlacementTestConfig) {
  return {
    intro_ar: cfg.intro_ar,
    intro_en: cfg.intro_en,
    questions: cfg.questions.map((q) => ({
      id: q.id,
      q_ar: q.q_ar,
      q_en: q.q_en || q.q_ar,
      opts_ar: q.opts_ar,
      opts_en: q.opts_en && q.opts_en.length === q.opts_ar.length ? q.opts_en : q.opts_ar,
    })),
    updated_at: cfg.updated_at,
  };
}
