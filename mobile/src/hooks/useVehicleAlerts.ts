import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AlertFeed, ManualAlertRequest } from '../types';
import {
  getAlerts,
  markAlertRead,
  sendManualAlert,
  type AlertScope,
} from '../services/alerts';
import { DEFAULT_STALE_TIME, queryKeys } from './queryConfig';

export type { AlertScope } from '../services/alerts';

/**
 * Unified vehicle-alerts feed for the given scope (Req 8.2-8.4, 8.9).
 *
 * Returns the `AlertFeed` (`alerts` + `unread_count`). Caching uses the 30s
 * stale-while-revalidate window (Req 12.3); the `['alerts', scope]` key dedupes
 * concurrent identical queries (Req 12.5).
 */
export function useVehicleAlerts(scope: AlertScope) {
  return useQuery<AlertFeed>({
    queryKey: queryKeys.alerts(scope),
    queryFn: () => getAlerts(scope),
    staleTime: DEFAULT_STALE_TIME,
  });
}

/**
 * Mark an alert read for the current user (Req 8.10). On success it invalidates
 * every alerts query so the feed and unread count refresh across scopes.
 */
export function useMarkAlertRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markAlertRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

/**
 * Send a manual alert (Req 8.5-8.7). Recipient permissions are enforced
 * server-side. On success it invalidates the alerts queries so a newly created
 * alert appears in the feed.
 */
export function useSendManualAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: ManualAlertRequest) => sendManualAlert(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
