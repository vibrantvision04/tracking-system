import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AttendanceReportRecord, Paginated } from '../types';
import {
  getAttendanceReport,
  type AttendanceReportParams,
} from '../services/attendance';
import { DEFAULT_STALE_TIME, queryKeys } from './queryConfig';

/**
 * Scoped, filtered, paginated attendance report (Req 6.1, 6.3, 6.4, 6.5).
 *
 * Supports pagination plus search/status/date filters via `params`. The params
 * are part of the query key so each filter/page combination is cached and
 * deduped independently (Req 12.5). `keepPreviousData` keeps the prior page on
 * screen while the next page loads, avoiding layout flashes during pagination
 * (Req 12.1). Caching uses the 30s stale-while-revalidate window (Req 12.3).
 *
 * Callers are responsible for debouncing the `search` value before passing it
 * here (Req 12.2, wired at the screen level in task 19.1).
 */
export function useAttendanceReport(params: AttendanceReportParams = {}) {
  return useQuery<Paginated<AttendanceReportRecord>>({
    queryKey: queryKeys.attendanceReport(params as Record<string, unknown>),
    queryFn: () => getAttendanceReport(params),
    staleTime: DEFAULT_STALE_TIME,
    placeholderData: keepPreviousData,
  });
}
