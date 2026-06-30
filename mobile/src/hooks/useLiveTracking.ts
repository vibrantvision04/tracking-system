import { useQuery } from '@tanstack/react-query';
import type { VehicleTelemetry } from '../types';
import {
  getMyTracking,
  getWardTracking,
  getZoneTracking,
} from '../services/tracking';
import {
  TELEMETRY_STALE_TIME,
  TRACKING_REFETCH_INTERVAL,
  queryKeys,
} from './queryConfig';

/** Live-tracking scope, selecting the role-appropriate endpoint. */
export type TrackingScope = 'my' | 'ward' | 'zone';

const fetchers: Record<TrackingScope, () => Promise<VehicleTelemetry[]>> = {
  my: getMyTracking,
  ward: getWardTracking,
  zone: getZoneTracking,
};

/**
 * Live vehicle telemetry for the given scope (Req 4.1, 4.2).
 *
 * Polls on a fixed ≤15s interval (Req 4.3) via `refetchInterval`. The `enabled`
 * flag lets callers bind polling to navigation focus / app foreground so
 * requests stop on blur/background (Req 4.4, wired in task 17.1). The
 * `['tracking', scope]` key dedupes concurrent identical queries (Req 12.5).
 */
export function useLiveTracking(scope: TrackingScope, enabled = true) {
  return useQuery<VehicleTelemetry[]>({
    queryKey: queryKeys.tracking(scope),
    queryFn: fetchers[scope],
    enabled,
    staleTime: TELEMETRY_STALE_TIME,
    refetchInterval: enabled ? TRACKING_REFETCH_INTERVAL : false,
  });
}
