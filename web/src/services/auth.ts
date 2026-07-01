import type { AuthTokens, AuthUser } from "@/lib/types";
import { setTokens, clearTokens, getUserFromToken } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function login(email: string, password: string): Promise<{ user: AuthUser }> {
  const res = await fetch(`${API}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let msg = "Invalid credentials";
    try {
      const err = await res.json();
      msg = err.error || msg;
    } catch {}
    throw new Error(msg);
  }

  const data: AuthTokens = await res.json();
  setTokens(data.access_token, data.refresh_token);

  const user = getUserFromToken();
  if (!user) throw new Error("Failed to decode user info");

  return { user: { id: user.id, email: user.email, role: user.role as "ADMIN" | "USER" } };
}

export async function logout(): Promise<void> {
  try {
    const token = localStorage.getItem("swift_access_token");
    if (token) {
      await fetch(`${API}/api/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch {
    // Ignore logout errors
  } finally {
    clearTokens();
  }
}

export async function refreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem("swift_refresh_token");
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API}/api/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data: AuthTokens = await res.json();
    setTokens(data.access_token, data.refresh_token || refreshToken);
    return true;
  } catch {
    return false;
  }
}

export function getCurrentUser(): AuthUser | null {
  const user = getUserFromToken();
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role as "ADMIN" | "USER" };
}