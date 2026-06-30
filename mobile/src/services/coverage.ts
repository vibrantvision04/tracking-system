import type { CoverageSummary, WardCoverage, ZoneCoverage } from '../types';
import { api } from './api';

/**
 * Coverage endpoints (Req 5.x). The backend scopes results by JWT role.
 * An optional `date` (YYYY-MM-DD) selects the operational day; when omitted
 * the backend defaults to the current day. Errors propagate as `ApiError`.
 */

/** Wards coverage list returned by GET /coverage/wards. */
export interface WardsCoverageResponse {
  date: string;
  wards: WardCoverage[];
}

function dateParams(date?: string) {
  return date ? { params: { date } } : undefined;
}

/** Driver's own daily coverage summary (GET /coverage/my). */
export async function getMyCoverage(date?: string): Promise<CoverageSummary> {
  return (await api.get('/coverage/my', dateParams(date))) as unknown as CoverageSummary;
}

/** Supervisor per-ward coverage (GET /coverage/wards). */
export async function getWardsCoverage(date?: string): Promise<WardsCoverageResponse> {
  return (await api.get('/coverage/wards', dateParams(date))) as unknown as WardsCoverageResponse;
}

/** Zone manager zone coverage with per-ward breakdown (GET /coverage/zone). */
export async function getZoneCoverage(date?: string): Promise<ZoneCoverage> {
  return (await api.get('/coverage/zone', dateParams(date))) as unknown as ZoneCoverage;
}
