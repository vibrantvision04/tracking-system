/**
 * Shared react-query configuration for the mobile data layer.
 *
 * Centralizes query-key factories and per-resource cache timings so every hook
 * uses consistent keys (enabling request deduplication across screens, Req 12.5)
 * and stale-while-revalidate caching windows (Req 12.3).
 */

/** Default stale window: serve cached data for 30s while revalidating in the
 * background (stale-while-revalidate, Req 12.3). */
export const DEFAULT_STALE_TIME = 30_000;

/** Live telemetry goes stale quickly; it is refreshed on a fixed interval. */
export const TELEMETRY_STALE_TIME = 0;

/** Fixed live-tracking poll interval (Req 4.3: 15 seconds or less). */
export const TRACKING_REFETCH_INTERVAL = 15_000;

/** Stable query-key factories. Reusing identical keys across screens lets
 * react-query dedupe concurrent identical queries (Req 12.5). */
export const queryKeys = {
  dashboard: () => ['dashboard'] as const,
  tracking: (scope: string) => ['tracking', scope] as const,
  coverageMy: (date?: string) => ['coverage', 'my', date ?? 'today'] as const,
  coverageWards: (date?: string) => ['coverage', 'wards', date ?? 'today'] as const,
  coverageZone: (date?: string) => ['coverage', 'zone', date ?? 'today'] as const,
  attendanceReport: (params: Record<string, unknown>) =>
    ['attendance', 'report', params] as const,
  complaints: () => ['complaints'] as const,
  complaint: (id: number | string) => ['complaints', id] as const,
  alerts: (scope: string) => ['alerts', scope] as const,
  driverRoute: () => ['driverRoute'] as const,
};
