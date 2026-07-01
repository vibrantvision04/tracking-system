let API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
if (API && !API.startsWith("http")) {
  API = "https://" + API;
}
const WS = process.env.NEXT_PUBLIC_WS_URL || API.replace(/^http/, "ws") + "/ws/track";

const TOKEN_KEYS = {
  access: "swift_access_token",
  refresh: "swift_refresh_token",
};

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEYS.access);
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEYS.refresh);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEYS.access, access);
  localStorage.setItem(TOKEN_KEYS.refresh, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEYS.access);
  localStorage.removeItem(TOKEN_KEYS.refresh);
}

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function getUserFromToken(): { id: number; email: string; role: string } | null {
  const token = getStoredAccessToken();
  if (!token) return null;
  const claims = decodeJWT(token);
  if (!claims || typeof claims.user_id !== "number") return null;
  return { id: claims.user_id as number, email: String(claims.email || ""), role: String(claims.role || "") };
}

export function isTokenExpired(token: string): boolean {
  const claims = decodeJWT(token);
  if (!claims || typeof claims.exp !== "number") return true;
  return Date.now() >= claims.exp * 1000;
}

let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) return false;
      const res = await fetch(`${API}/api/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token || refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

import { toast } from "react-toastify";

type FetchOpts = RequestInit & { skipAuth?: boolean; skipToast?: boolean };

export async function api<T = unknown>(path: string, opts?: FetchOpts): Promise<T> {
  const { skipAuth, skipToast, ...fetchOpts } = opts || {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOpts.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = getStoredAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const doFetch = async (): Promise<T> => {
    const res = await fetch(`${API}${path}`, { ...fetchOpts, headers });

    if (res.status === 401 && !skipAuth && !path.startsWith("/api/login") && !path.startsWith("/api/refresh")) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        const newToken = getStoredAccessToken();
        headers["Authorization"] = `Bearer ${newToken}`;
        const retryRes = await fetch(`${API}${path}`, { ...fetchOpts, headers });
        if (retryRes.ok) return retryRes.json();
        if (retryRes.status === 401) {
          clearTokens();
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          throw new Error("Session expired");
        }
        // Non-401 retry failure: throw the error normally
        let errorMsg = `API Error: ${retryRes.status} ${retryRes.statusText}`;
        try { const errBody = await retryRes.json(); errorMsg = errBody.error || errorMsg; } catch {}
        if (!skipToast) toast.error(errorMsg);
        throw new Error(errorMsg);
      }
    }

    if (!res.ok) {
      let errorMsg = `API Error: ${res.status} ${res.statusText}`;
      try {
        const errBody = await res.json();
        errorMsg = errBody.error || errorMsg;
      } catch {}
      if (!skipToast) toast.error(errorMsg);
      throw new Error(errorMsg);
    }

    return res.json();
  };

  try {
    return await doFetch();
  } catch (err: any) {
    if (err.name !== "AbortError" && !skipToast && !err.message.includes("Session expired")) {
      toast.error(err.message || "Connection failed");
    }
    throw err;
  }
}

export function get<T = unknown>(path: string, opts?: FetchOpts): Promise<T> {
  return api<T>(path, { ...opts, method: "GET" });
}

export function post<T = unknown>(path: string, body?: unknown, opts?: FetchOpts): Promise<T> {
  return api<T>(path, { ...opts, method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export function put<T = unknown>(path: string, body?: unknown, opts?: FetchOpts): Promise<T> {
  return api<T>(path, { ...opts, method: "PUT", body: body ? JSON.stringify(body) : undefined });
}

export function del<T = unknown>(path: string, opts?: FetchOpts): Promise<T> {
  return api<T>(path, { ...opts, method: "DELETE" });
}

export function wsUrl(): string {
  return WS;
}
export { API as API_URL };