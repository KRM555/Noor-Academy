import type { AuthUser } from '../types';

const LEGACY_TOKEN_KEY = 'nb_auth_token';
const IFRAME_TOKEN_KEY = 'nb_iframe_session';
const SESSION_USER_HINT_KEY = 'nb_session_user';
const CSRF_COOKIE_NAME = 'nb_csrf';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Purge any legacy persisted auth token from localStorage to minimize XSS blast radius
try {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
} catch {
  // Ignore storage restrictions
}

function isEmbeddedIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

let inMemoryIframeToken: string | null = null;

export function getStoredToken(): string | null {
  if (!isEmbeddedIframe()) return null;
  if (inMemoryIframeToken) return inMemoryIframeToken;
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(IFRAME_TOKEN_KEY) : null;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
  if (!isEmbeddedIframe()) {
    inMemoryIframeToken = null;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(IFRAME_TOKEN_KEY);
      }
    } catch {
      // Ignore
    }
    return;
  }
  inMemoryIframeToken = token;
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (token) {
        sessionStorage.setItem(IFRAME_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(IFRAME_TOKEN_KEY);
      }
    }
  } catch {
    // Ignore
  }
}

export function getStoredSessionHint(): AuthUser | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(SESSION_USER_HINT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AuthUser> | null;
        if (parsed && parsed.id && parsed.role) {
          return parsed as AuthUser;
        }
      }
    }
    const token = getStoredToken();
    if (token) {
      const [payloadB64] = token.split('.');
      if (payloadB64) {
        const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
          Array.from(atob(b64))
            .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
            .join('')
        );
        const claims = JSON.parse(json) as {
          id?: string;
          role?: AuthUser['role'];
          guardianId?: number;
          exp?: number;
        };
        if (claims?.id && claims?.role && typeof claims.exp === 'number' && claims.exp > Date.now()) {
          return {
            id: claims.id,
            email: '',
            full_name: '',
            role: claims.role,
            preferred_lang: 'ar',
            ...(claims.guardianId ? { guardian_id: Number(claims.guardianId) } : {}),
          };
        }
      }
    }
  } catch {
    // Ignore storage or parse failures
  }
  return null;
}

export function setStoredSessionHint(user: AuthUser | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (user && user.id && user.role) {
      sessionStorage.setItem(
        SESSION_USER_HINT_KEY,
        JSON.stringify({
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          preferred_lang: user.preferred_lang,
          ...(user.guardian_id ? { guardian_id: user.guardian_id } : {}),
        })
      );
    } else {
      sessionStorage.removeItem(SESSION_USER_HINT_KEY);
    }
  } catch {
    // Ignore storage restrictions
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  for (const part of document.cookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return part.slice(idx + 1).trim();
      }
    }
  }
  return null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const method = String(options.method || 'GET').toUpperCase();
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE_NAME);
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const res = await fetch(url, {
    ...options,
    credentials: options.credentials || 'same-origin',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errObj = data as { error?: string; code?: string };
    throw new ApiError(errObj.error || `Request failed (${res.status})`, res.status, errObj.code);
  }
  return data as T;
}
