import type { DashboardStats } from '../types';
import { api } from './api';

/**
 * Fetch the role-scoped dashboard aggregate (Req 3.1, 3.2).
 *
 * The backend derives the scope from the JWT, so no parameters are needed.
 * Errors propagate as a typed `ApiError` from the API client (Req 10.8).
 */
export async function getDashboard(): Promise<DashboardStats> {
  // The response interceptor unwraps `response.data.data`, so the resolved
  // value is the typed payload itself rather than an AxiosResponse.
  return (await api.get('/dashboard')) as unknown as DashboardStats;
}
