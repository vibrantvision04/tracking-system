import type { Complaint } from '../types';
import { api } from './api';

/**
 * Read-only complaints endpoints (Req 7.x). The backend scopes the feed by JWT
 * role. The list endpoint returns `{ complaints: Complaint[] }`; this helper
 * unwraps and returns the array. Errors propagate as a typed `ApiError`.
 */
interface ComplaintsResponse {
  complaints: Complaint[];
}

/** Scoped complaints list (GET /complaints). */
export async function listComplaints(): Promise<Complaint[]> {
  const res = (await api.get('/complaints')) as unknown as ComplaintsResponse;
  return res.complaints;
}

/** A single complaint by id (GET /complaints/{id}). */
export async function getComplaint(id: number | string): Promise<Complaint> {
  return (await api.get(`/complaints/${id}`)) as unknown as Complaint;
}
