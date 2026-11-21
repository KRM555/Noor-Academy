import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let browserClient: SupabaseClient | null = null;

export function isBrowserSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getBrowserSupabase(): SupabaseClient | null {
  if (!isBrowserSupabaseConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

function generateOAuthState(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildGoogleOAuthPopupRequest(): Promise<{ state: string; url: string }> {
  if (!isBrowserSupabaseConfigured()) {
    throw new Error('Google OAuth via Supabase is not configured.');
  }
  const state = generateOAuthState();
  const redirectTo = `${window.location.origin}/auth/google-callback?oauth_state=${encodeURIComponent(state)}`;
  const oauthClient = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await oauthClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error || !data?.url) {
    throw new Error(error?.message || 'Unable to start Google Sign-In');
  }
  return { state, url: data.url };
}

export function waitForGoogleOAuthToken(
  state: string,
  popup: Window | null,
  timeoutMs = 120_000
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let pollTimer: number | null = null;
    let timeoutTimer: number | null = null;
    let channel: BroadcastChannel | null = null;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (channel) {
        try {
          channel.close();
        } catch {
          // ignore
        }
      }
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
    };

    const finishSuccess = (token: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(token);
    };

    const finishError = (msg: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(msg));
    };

    const handlePayload = (payload: { type?: string; state?: string; access_token?: string; error?: string } | null) => {
      if (!payload || payload.type !== 'NB_GOOGLE_OAUTH') return;
      if (payload.state && payload.state !== state) return;
      if (payload.error) {
        finishError(payload.error);
        return;
      }
      if (payload.access_token) {
        finishSuccess(payload.access_token);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      handlePayload(event.data);
    };

    window.addEventListener('message', onMessage);

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('nb_google_oauth');
        channel.onmessage = (event) => handlePayload(event.data);
      } catch {
        // ignore
      }
    }

    pollTimer = window.setInterval(async () => {
      if (settled) return;
      try {
        const res = await fetch(`/api/auth/oauth-handoff/${encodeURIComponent(state)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as { ready?: boolean; access_token?: string | null; error?: string | null };
          if (data.ready) {
            if (data.error) {
              finishError(data.error);
              return;
            }
            if (data.access_token) {
              finishSuccess(data.access_token);
              return;
            }
          }
        }
      } catch {
        // ignore transient poll error
      }
      if (popup && popup.closed) {
        // Give one brief moment for in-flight handoff before reporting cancellation
        window.setTimeout(() => {
          if (!settled) {
            finishError('Google sign-in window was closed before completing.');
          }
        }, 1200);
      }
    }, 1200);

    timeoutTimer = window.setTimeout(() => {
      finishError('Google sign-in timed out. Please try again.');
    }, timeoutMs);
  });
}
