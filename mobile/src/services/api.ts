import axios from 'axios';
import type { ApiError, ApiErrorKind } from '../types';
import { redactMessage } from '../utils/redact';
import { secureStorage } from './secureStorage';
import { KEYS } from './storageKeys';
import { API_BASE_URL } from '../config/env';

export const BASE_URL = API_BASE_URL;

// Re-exported from the dependency-free `storageKeys` module so existing
// `import { KEYS } from '../services/api'` consumers keep working while
// avoiding a circular import between this client and `secureStorage`.
export { KEYS } from './storageKeys';

export const api = axios.create({
  baseURL: BASE_URL + '/api/mobile',
  timeout: 10000,
});

// Auto-logout bridge (Req 1.6): the API client owns token clearing on a failed
// refresh, but it cannot touch React state. AuthContext registers a handler here
// so that when the single-flight refresh is rejected (session is unrecoverable)
// the app can transition back to Login by clearing the in-memory user.
let authFailureHandler: (() => void) | null = null;

/**
 * Register a callback invoked whenever a refresh attempt fails and the session
 * can no longer be recovered. AuthContext uses this to force `setUser(null)` so
 * the navigator routes to Login. Pass `null` to unregister (e.g. on unmount).
 */
export function setAuthFailureHandler(fn: (() => void) | null) {
  authFailureHandler = fn;
}

/**
 * Maps any failure (axios error, network error, or arbitrary thrown value) to the
 * typed {@link ApiError} taxonomy so calling screens can branch on `error.kind`
 * instead of inspecting raw status codes (Req 10.3, 10.4).
 *
 * Mapping: 401 -> 'unauthorized', 403 -> 'forbidden', 404 -> 'not_found',
 * 5xx -> 'server', request timeout (ECONNABORTED) -> 'timeout',
 * no connectivity / network error -> 'offline', anything else -> 'unknown'.
 */
export function toApiError(error: any): ApiError {
  // Already mapped — keep idempotent so repeated mapping is safe.
  if (error && typeof error === 'object' && typeof error.kind === 'string' && 'message' in error) {
    return error as ApiError;
  }

  const status: number | undefined = error?.response?.status;
  const serverMessage: string | undefined =
    error?.response?.data?.message ?? error?.response?.data?.error;
  const baseMessage: string =
    serverMessage ?? error?.message ?? (typeof error === 'string' ? error : 'Request failed');
  // Log hygiene (Req 11.5): never surface token/credential values in the
  // error message that screens display or that may be logged downstream.
  const message: string = redactMessage(baseMessage);

  let kind: ApiErrorKind;
  if (status !== undefined) {
    if (status === 401) kind = 'unauthorized';
    else if (status === 403) kind = 'forbidden';
    else if (status === 404) kind = 'not_found';
    else if (status >= 500) kind = 'server';
    else kind = 'unknown';
  } else if (error?.code === 'ECONNABORTED') {
    // Axios sets ECONNABORTED when the configured `timeout` is exceeded.
    kind = 'timeout';
  } else if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error' || error?.request) {
    // No response received and the request was made -> no connectivity.
    kind = 'offline';
  } else {
    kind = 'unknown';
  }

  return status !== undefined
    ? { kind, status, message }
    : { kind, message };
}

api.interceptors.request.use(
  async (config) => {
    const token = await secureStorage.get(KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(toApiError(error))
);

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

function processRefreshQueue(token: string | null, error: any) {
  refreshQueue.forEach((p) => {
    if (token) p.resolve(token);
    else p.reject(error);
  });
  refreshQueue = [];
}

// Bounded retry for idempotent GETs (Req 10.6).
// Total attempts (initial + retries) is capped at MAX_RETRY_ATTEMPTS. Only GET
// requests are eligible, and only on transient failures: network errors (no
// response received) or HTTP 5xx. POST/PUT/PATCH/DELETE are NEVER auto-retried.
// 401 is handled exclusively by the refresh flow above and never reaches here.
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True when the failure is transient and the request is a safe-to-retry GET. */
function isRetryableGet(error: any): boolean {
  const config = error?.config;
  if (!config || typeof config.method !== 'string') return false;
  if (config.method.toLowerCase() !== 'get') return false;

  const status: number | undefined = error?.response?.status;
  if (status !== undefined) {
    // Only server-side (5xx) transient failures retry; 4xx (incl. 401) do not.
    return status >= 500;
  }
  // No response received -> transient network error / timeout.
  return true;
}

api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success === true && response.data.data !== undefined) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refresh = await secureStorage.get(KEYS.REFRESH_TOKEN);
        if (!refresh) throw new Error('No refresh token');

        const res = await axios.post(`${BASE_URL}/api/mobile/refresh`, {
          refresh_token: refresh,
        });
        const { access_token, refresh_token } = res.data.data;
        await secureStorage.set(KEYS.ACCESS_TOKEN, access_token);
        await secureStorage.set(KEYS.REFRESH_TOKEN, refresh_token);

        processRefreshQueue(access_token, null);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (err) {
        const apiError = toApiError(error);
        processRefreshQueue(null, apiError);
        await secureStorage.clear();
        // Notify the app that the session is unrecoverable so it can route back
        // to Login (Req 1.6). Best-effort: a missing/throwing handler must never
        // mask the original auth failure we are about to reject with.
        try {
          authFailureHandler?.();
        } catch {
          // ignore — auto-logout notification is best-effort
        }
        return Promise.reject(apiError);
      } finally {
        isRefreshing = false;
      }
    }

    // Bounded retry for idempotent GETs on transient failures (Req 10.6).
    // 401 is handled above; anything reaching here is eligible for retry only
    // if it is a GET and the failure is transient (network error or 5xx).
    if (originalRequest && isRetryableGet(error)) {
      const attempt = (originalRequest._retryCount ?? 0) + 1;
      if (attempt < MAX_RETRY_ATTEMPTS) {
        originalRequest._retryCount = attempt;
        // Exponential backoff: 300ms, 600ms, ...
        await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
        return api(originalRequest);
      }
    }

    return Promise.reject(toApiError(error));
  }
);
