import { useQuery } from '@tanstack/react-query';
import type { DashboardStats } from '../types';
import { getDashboard } from '../services/dashboard';
import { DEFAULT_STALE_TIME, queryKeys } from './queryConfig';

/**
 * Role-scoped dashboard aggregate (Req 3.1, 3.2).
 *
 * Caching: stale-while-revalidate with a 30s window (Req 12.3). The stable
 * `['dashboard']` key dedupes concurrent requests across screens (Req 12.5).
 * Exposes react-query's `data`/`isLoading`/`isError`/`error` to the caller.
 */
export function useDashboard() {
  return useQuery<DashboardStats>({
    queryKey: queryKeys.dashboard(),
    queryFn: getDashboard,
    staleTime: DEFAULT_STALE_TIME,
  });
}
