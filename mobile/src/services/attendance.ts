import type { AttendanceReportRecord, AttendanceStatus, Paginated } from '../types';
import { api } from './api';

/**
 * Attendance report listing (Req 6.x). The backend applies JWT scope and the
 * supplied filters, returning a `Paginated<AttendanceReportRecord>`.
 * Errors propagate as a typed `ApiError` (Req 10.8).
 */
export interface AttendanceReportParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: AttendanceStatus;
  date?: string; // YYYY-MM-DD
}

/** Fetch a scoped, filtered, paginated attendance report (GET /attendance/list). */
export async function getAttendanceReport(
  params: AttendanceReportParams = {}
): Promise<Paginated<AttendanceReportRecord>> {
  return (await api.get('/attendance/list', { params })) as unknown as Paginated<
    AttendanceReportRecord
  >;
}
