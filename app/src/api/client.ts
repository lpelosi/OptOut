// Fetch-based API client with token storage + automatic refresh on 401.
import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const ACCESS_KEY = 'optout.access';
const REFRESH_KEY = 'optout.refresh';

type Tokens = { accessToken: string; refreshToken: string };

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

// Listeners notified when auth state changes (sign in / out).
const listeners = new Set<(signedIn: boolean) => void>();
export function onAuthChange(fn: (signedIn: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function emit(signedIn: boolean) {
  listeners.forEach((fn) => fn(signedIn));
}

export async function loadTokens(): Promise<boolean> {
  accessToken = await SecureStore.getItemAsync(ACCESS_KEY);
  refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  return !!accessToken && !!refreshToken;
}

export async function setTokens(t: Tokens) {
  accessToken = t.accessToken;
  refreshToken = t.refreshToken;
  await SecureStore.setItemAsync(ACCESS_KEY, t.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken);
  emit(true);
}

export async function clearTokens() {
  const rt = refreshToken;
  accessToken = null;
  refreshToken = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  if (rt) void rawPost('/api/auth/logout', { refreshToken: rt }).catch(() => {});
  emit(false);
}

export function isSignedIn() {
  return !!accessToken;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshing) {
    refreshing = rawPost('/api/auth/refresh', { refreshToken })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        await setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function rawPost(path: string, body: unknown) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

type Options = { method?: string; body?: unknown; auth?: boolean };

// Core request helper. Retries once after a refresh on 401.
export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const doFetch = () =>
    fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 401 && auth && refreshToken) {
    const ok = await tryRefresh();
    if (ok) {
      res = await doFetch();
    } else {
      await clearTokens();
    }
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Request failed (${res.status})`);
  }
  return data as T;
}
