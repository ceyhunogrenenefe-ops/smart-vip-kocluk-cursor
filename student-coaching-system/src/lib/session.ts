const TOKEN_KEY = 'coaching_auth_token';

/**
 * VITE_API_BASE_URL tanımlıysa tüm /api istekleri bu adrese gider (kendi barındırdığınız API).
 * Boş bırakın: istekler aynı origin (ör. Vercel) üzerinden gider.
 */
export function resolveApiUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '') || '';
  if (!base) return trimmed;
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${path}`;
}
/** Doğrulama yapmaz; sessiz yüklemede kullanıcıyı JWT ile tamamlamak için yük (client-only). */
export function peekJwtClaims(token: string | null): {
  sub?: string;
  role?: string;
  institution_id?: string | null;
  coach_id?: string | null;
  student_id?: string | null;
} | null {
  if (!token || !token.includes('.')) return null;
  try {
    let b64 = token.split('.')[1];
    const padLen = (4 - (b64.length % 4)) % 4;
    if (padLen) b64 += '='.repeat(padLen);
    const json = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as ReturnType<typeof peekJwtClaims>;
  } catch {
    return null;
  }
}

export const getAuthToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const setAuthToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuthToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

/** JWT göndermez: /api/auth-login gibi oturumsuz istekleri eski Bearer ile bozmamak için. */
export async function fetchPublicPost(pathOrUrl: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(resolveApiUrl(pathOrUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/** Aynı anda çoklu 401 → çoklu window.location Chrome’da "Throttling navigation" üretir; tek yönlendirme. */
let authRedirectToLoginInProgress = false;

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(resolveApiUrl(url), { ...options, headers });

  // Token süresi dolduysa kullanıcıyı otomatik login'e yönlendir.
  // Böylece UI'da "giriş var" görünüp tüm API çağrılarının 401 ile düşmesi engellenir.
  if (res.status === 401) {
    try {
      const payload = await res.clone().json();
      const err = payload?.error;
      const isTokenIssue =
        err === 'Token expired' ||
        err === 'Invalid token' ||
        err === 'Invalid signature' ||
        err === 'Missing token';

      if (isTokenIssue && !authRedirectToLoginInProgress) {
        authRedirectToLoginInProgress = true;
        clearAuthToken();
        localStorage.removeItem('coaching_user');
        localStorage.removeItem('coaching_acting_as');
        window.location.replace('/login');
      }
    } catch {
      // Body parse edilemezse hiç bozmayalım.
    }
  }

  return res;
};

