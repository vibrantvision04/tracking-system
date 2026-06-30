import { useQuery } from '@tanstack/react-query';
import type { Complaint } from '../types';
import { getComplaint, listComplaints } from '../services/complaints';
import { DEFAULT_STALE_TIME, queryKeys } from './queryConfig';

/**
 * Read-only complaints hooks (Req 7.x). The backend scopes the feed by JWT
 * role. Caching uses the 30s stale-while-revalidate window (Req 12.3); stable
 * keys dedupe concurrent identical queries (Req 12.5).
 */

/** Scoped complaints list. */
export function useComplaints() {
  return useQuery<Complaint[]>({
    queryKey: queryKeys.complaints(),
    queryFn: listComplaints,
    staleTime: DEFAULT_STALE_TIME,
  });
}

/** A single complaint by id. Disabled until an id is provided. */
export function useComplaint(id?: number | string) {
  return useQuery<Complaint>({
    queryKey: queryKeys.complaint(id ?? ''),
    queryFn: () => getComplaint(id as number | string),
    enabled: id !== undefined && id !== null && id !== '',
    staleTime: DEFAULT_STALE_TIME,
  });
}
