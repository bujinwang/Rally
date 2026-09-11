import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '../config/api';

// Auth endpoints must never trigger the refresh-on-401 path (it would recurse
// or mask a genuine bad-credentials response).
const AUTH_FREE_PATHS = ['/auth/refresh', '/auth/login', '/auth/register'];

const isAbsoluteUrl = (url: string): boolean => /^https?:\/\//i.test(url);

async function readTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  try {
    const [accessToken, refreshToken] = await Promise.all([
      AsyncStorage.getItem(ACCESS_TOKEN_KEY),
      AsyncStorage.getItem(REFRESH_TOKEN_KEY),
    ]);
    return { accessToken, refreshToken };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

async function persistTokens(tokens: { accessToken?: string; refreshToken?: string }): Promise<void> {
  try {
    if (tokens.accessToken) await AsyncStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) await AsyncStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } catch {
    /* storage not critical */
  }
}

/** Remove stored tokens (used when refresh fails). */
export async function clearAuthTokens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* storage not critical */
  }
}

/**
 * Exchange the stored refresh token for a new pair. Returns the new access
 * token, or null on failure (tokens are cleared in that case).
 */
export async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = await readTokens();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      await clearAuthTokens();
      return null;
    }

    const body = await response.json().catch(() => null);
    const tokens = body?.data?.tokens ?? body?.tokens;
    if (!tokens?.accessToken) {
      await clearAuthTokens();
      return null;
    }

    await persistTokens(tokens);
    return tokens.accessToken as string;
  } catch {
    return null;
  }
}

/**
 * Shared fetch wrapper: attaches `Authorization: Bearer <accessToken>` when a
 * token is stored, and on a 401 `UNAUTHORIZED` attempts exactly one refresh and
 * retries the original request once. Guests (no stored token) send no header,
 * so the token-free join/read flows are unaffected.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = isAbsoluteUrl(input) ? input : `${API_BASE_URL}${input}`;
  const { accessToken } = await readTokens();

  const withAuth = (token: string | null, base: RequestInit): RequestInit => ({
    ...base,
    headers: {
      ...((base.headers as Record<string, string> | undefined) || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const response = await fetch(url, withAuth(accessToken, init));

  if (response.status !== 401) return response;
  if (AUTH_FREE_PATHS.some((path) => url.includes(path))) return response;

  // Confirm it is an auth failure (clone so the caller can still read the body).
  let isUnauthorized = true;
  try {
    const body = await response.clone().json();
    if (body?.error?.code && body.error.code !== 'UNAUTHORIZED') {
      isUnauthorized = false;
    }
  } catch {
    /* non-JSON 401 — treat as auth failure */
  }
  if (!isUnauthorized) return response;

  const newToken = await refreshAccessToken();
  if (!newToken) return response;

  return fetch(url, withAuth(newToken, init));
}

export default authFetch;
