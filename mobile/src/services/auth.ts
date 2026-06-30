import type { LoginResponse, User } from '../types';
import { api } from './api';

/**
 * Auth data helpers (Req 10.2). Token persistence, single-flight refresh, and
 * navigation routing remain owned by `AuthContext`/`api.ts`; these are thin,
 * typed wrappers over the backend auth endpoints for callers that just need the
 * data. Errors propagate as a typed `ApiError` (Req 10.8).
 */

/** Authenticate with an identifier (email/employee id) and password (POST /login). */
export async function login(identifier: string, password: string): Promise<LoginResponse> {
  return (await api.post('/login', { identifier, password })) as unknown as LoginResponse;
}

/** Fetch the authenticated user's profile (GET /me). */
export async function getProfile(): Promise<User> {
  return (await api.get('/me')) as unknown as User;
}

/** Invalidate the current session server-side (POST /logout). */
export async function logout(): Promise<void> {
  await api.post('/logout');
}
