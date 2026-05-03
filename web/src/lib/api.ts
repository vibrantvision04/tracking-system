// ═══════════════════════════════════════
// API Client — talks to Go backend
// ═══════════════════════════════════════
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
// Automatically infer WebSocket URL based on the API URL
const WS = process.env.NEXT_PUBLIC_WS_URL || API.replace(/^http/, "ws") + "/ws/track";

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts?.headers },
  });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

export function post<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function put<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function del<T = unknown>(path: string): Promise<T> {
  return api<T>(path, { method: "DELETE" });
}

export function wsUrl(): string { return WS; }
export { API as API_URL };
