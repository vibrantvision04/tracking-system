import { useQuery } from '@tanstack/react-query';
import type { CoverageSummary, ZoneCoverage } from '../types';
import {
  getMyCoverage,
  getWardsCoverage,
  getZoneCoverage,
  type WardsCoverageResponse,
} from '../services/coverage';
import { DEFAULT_STALE_TIME, queryKeys } from './queryConfig';

/**
 * Coverage hooks (Req 5.x). All scope by JWT role server-side and accept an
 * optional `date` (YYYY-MM-DD); when omitted the backend uses the current day.
 * Caching uses the 30s stale-while-revalidate window (Req 12.3); date-keyed
 * queries dedupe across screens (Req 12.5).
 */

/** Driver's own daily coverage summary. */
export function useCoverage(date?: string) {
  return useQuery<CoverageSummary>({
    queryKey: queryKeys.coverageMy(date),
    queryFn: () => getMyCoverage(date),
    staleTime: DEFAULT_STALE_TIME,
  });
}

/** Supervisor per-ward coverage list. */
export function useWardsCoverage(date?: string) {
  return useQuery<WardsCoverageResponse>({
    queryKey: queryKeys.coverageWards(date),
    queryFn: () => getWardsCoverage(date),
    staleTime: DEFAULT_STALE_TIME,
  });
}

/** Zone manager zone coverage with per-ward breakdown. */
export function useZoneCoverage(date?: string) {
  return useQuery<ZoneCoverage>({
    queryKey: queryKeys.coverageZone(date),
    queryFn: () => getZoneCoverage(date),
    staleTime: DEFAULT_STALE_TIME,
  });
}
