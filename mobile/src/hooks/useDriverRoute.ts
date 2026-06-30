import { useQuery } from '@tanstack/react-query';
import type { DriverRouteResponse } from '../types';
import { getMyRoute } from '../services/route';
import { DEFAULT_STALE_TIME, queryKeys } from './queryConfig';

/**
 * The authenticated driver's assigned route (Req 9.x).
 *
 * The backend responds with HTTP 404 when no route is assigned, which surfaces
 * as a typed `ApiError` with `kind: 'not_found'` on `error` so the screen can
 * render an Empty_State (Req 9.5). Caching uses the 30s stale-while-revalidate
 * window (Req 12.3). A 404 is a definitive answer, so it is not retried.
 */
export function useDriverRoute() {
  return useQuery<DriverRouteResponse>({
    queryKey: queryKeys.driverRoute(),
    queryFn: getMyRoute,
    staleTime: DEFAULT_STALE_TIME,
    retry: false,
  });
}
