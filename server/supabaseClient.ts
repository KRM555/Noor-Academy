import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function requireSupabaseAdmin(): SupabaseClient {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error('Supabase server credentials (SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY) are required.');
  }
  return client;
}

export function getSupabaseAnon(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;
  if (!anonClient) {
    anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return anonClient;
}

export function createEphemeralSupabaseAnon(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase anon credentials (SUPABASE_URL & SUPABASE_ANON_KEY) are required.');
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/**
 * Safely inserts a row into a BIGSERIAL table via PostgREST.
 * Handles Postgres sequence lag (23505 duplicate key on *_pkey) after explicit-ID migrations.
 */
export async function insertRowSafe<T extends Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>
): Promise<T> {
  const sb = requireSupabaseAdmin();
  const first = await sb.from(table).insert(row).select('*').single();
  if (!first.error && first.data) {
    return first.data as T;
  }

  if (first.error?.code === '23505' && first.error.message.includes('_pkey')) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: latest } = await sb
        .from(table)
        .select('id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextId = Number((latest as { id?: number } | null)?.id || 0) + 1 + attempt;
      const retry = await sb.from(table).insert({ ...row, id: nextId }).select('*').single();
      if (!retry.error && retry.data) {
        return retry.data as T;
      }
      if (retry.error?.code !== '23505' || !retry.error.message.includes('_pkey')) {
        throw new Error(retry.error?.message || `Insert into ${table} failed`);
      }
    }
  }

  throw new Error(first.error?.message || `Insert into ${table} failed`);
}

export function getSupabaseLaunchStatus() {
  let supabaseHost: string | null = null;
  if (process.env.SUPABASE_URL) {
    try {
      supabaseHost = new URL(process.env.SUPABASE_URL).hostname;
    } catch {
      supabaseHost = null;
    }
  }
  return {
    supabaseConfigured: isSupabaseConfigured(),
    supabaseUrlPresent: Boolean(process.env.SUPABASE_URL),
    supabaseAnonPresent: Boolean(process.env.SUPABASE_ANON_KEY),
    supabaseServiceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    viteSupabasePresent: Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY),
    supabaseHost,
    sessionSecretConfigured: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 24),
    nodeEnv: process.env.NODE_ENV || 'development',
    demoLoginEnabled: false,
    databaseEngine: 'supabase_postgresql' as const,
  };
}

export async function getSupabaseLiveHealth() {
  const base = getSupabaseLaunchStatus();
  const client = getSupabaseAdmin();
  if (!client) {
    return {
      ...base,
      authConnected: false,
      authUsersCount: 0,
      schemaApplied: false,
      connectionError: 'Supabase credentials are not configured',
    };
  }

  let authConnected = false;
  let authUsersCount = 0;
  let schemaApplied = false;
  let connectionError: string | null = null;

  try {
    const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) {
      connectionError = error.message;
    } else {
      authConnected = true;
      authUsersCount = data?.users?.length || 0;
    }
  } catch (err) {
    connectionError = err instanceof Error ? err.message : 'Auth check failed';
  }

  try {
    const { error: schemaErr } = await client.from('courses').select('id', { count: 'exact', head: true });
    if (!schemaErr) {
      schemaApplied = true;
    }
  } catch {
    schemaApplied = false;
  }

  return {
    ...base,
    authConnected,
    authUsersCount,
    schemaApplied,
    connectionError,
  };
}

export async function pingSupabaseDatabase(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const startedAt = Date.now();
  const client = getSupabaseAdmin();
  if (!client) {
    return {
      connected: false,
      latencyMs: Date.now() - startedAt,
      error: 'Supabase is not configured',
    };
  }

  try {
    const { error } = await client.from('levels').select('id', { count: 'exact', head: true });
    const latencyMs = Date.now() - startedAt;
    if (error) {
      return { connected: false, latencyMs, error: error.message };
    }
    return { connected: true, latencyMs };
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : 'Database ping failed',
    };
  }
}

export async function findSupabaseAuthUserByEmail(email: string) {
  const client = requireSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data: listed, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }
    const users = listed?.users || [];
    const match = users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (match) return match;
    if (users.length < perPage) break;
  }
  return null;
}

export async function verifyVerifiedGoogleToken(sb: SupabaseClient, accessToken: string) {
  const { data: authData, error: authErr } = await sb.auth.getUser(accessToken);
  if (authErr || !authData?.user?.email) {
    return null;
  }
  const sbUser = authData.user;
  const appProviders = Array.isArray(sbUser.app_metadata?.providers)
    ? (sbUser.app_metadata.providers as string[])
    : [];
  const identityProviders = Array.isArray(sbUser.identities)
    ? sbUser.identities.map((id) => id.provider).filter((p): p is string => Boolean(p))
    : [];
  const allProviders = new Set([...appProviders, ...identityProviders]);
  if (!sbUser.email_confirmed_at || !sbUser.email || !allProviders.has('google')) {
    return null;
  }
  const cleanEmail = sbUser.email.trim().toLowerCase();
  const fullName = String(
    sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || cleanEmail.split('@')[0]
  ).trim();
  return { user: sbUser, email: cleanEmail, fullName };
}

export async function provisionSupabaseAuthUser(
  email: string,
  password: string,
  fullName: string,
  role: 'student' | 'teacher' | 'admin' | 'guardian'
) {
  const client = requireSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await findSupabaseAuthUserByEmail(normalizedEmail);
  if (existing) {
    return { user: existing, alreadyExisted: true };
  }

  const { data, error } = await client.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (error || !data.user) {
    throw new Error(error?.message || 'Failed to create Supabase Auth user');
  }
  return { user: data.user, alreadyExisted: false };
}

export async function syncUsersToSupabaseAuth(
  users: Array<{ email: string; full_name: string; role: string }>
): Promise<{ created: number; existing: number; errors: string[] }> {
  const client = requireSupabaseAdmin();

  const existingEmails = new Set<string>();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data: listed, error: listErr } = await client.auth.admin.listUsers({ page, perPage });
    if (listErr) {
      throw new Error(listErr.message);
    }
    const batch = listed?.users || [];
    for (const u of batch) {
      if (u.email) existingEmails.add(u.email.toLowerCase());
    }
    if (batch.length < perPage) break;
  }

  let created = 0;
  let existing = 0;
  const errors: string[] = [];

  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    if (!email) continue;
    if (existingEmails.has(email)) {
      existing++;
      continue;
    }
    const tempPassword = `NB-${crypto.randomBytes(8).toString('base64url')}`;
    const { error } = await client.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: user.full_name, role: user.role },
    });
    if (error) {
      errors.push(`${email}: ${error.message}`);
    } else {
      created++;
      existingEmails.add(email);
    }
  }

  return { created, existing, errors };
}

export async function requestSupabasePasswordReset(email: string, redirectTo?: string) {
  const client = getSupabaseAnon() || getSupabaseAdmin();
  if (!client) return { sent: false, reason: 'not_configured' as const };
  const { error } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) return { sent: false, reason: error.message };
  return { sent: true as const };
}

export async function broadcastRealtimeEvent(
  event: string,
  payload: { kind?: string } = {}
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;
  try {
    const channel = client.channel('noor-bayan-live');
    await channel.httpSend(event, {
      ...(payload.kind ? { kind: payload.kind } : {}),
      emittedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[realtime] broadcast warning:', err instanceof Error ? err.message : err);
  }
}
