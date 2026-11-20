const LEGACY_TOKEN_KEY = 'nb_auth_token';
const IFRAME_TOKEN_KEY = 'nb_iframe_session';
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
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}
