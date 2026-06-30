import type { VehicleTelemetry } from '../types';
import { api } from './api';

/**
 * Live tracking endpoints return `{ vehicles: VehicleTelemetry[] }`; these
 * helpers unwrap and return the array directly (Req 4.x). The backend scopes
 * the result by the caller's JWT, so no query params are sent.
 * Errors propagate as a typed `ApiError` (Req 10.8).
 */
interface TrackingResponse {
  vehicles: VehicleTelemetry[];
}

/** Vehicles in the supervisor's ward scope (GET /tracking/ward). */
export async function getWardTracking(): Promise<VehicleTelemetry[]> {
  const res = (await api.get('/tracking/ward')) as unknown as TrackingResponse;
  return res.vehicles;
}

/** Vehicles in the zone manager's zone scope (GET /tracking/zone). */
export async function getZoneTracking(): Promise<VehicleTelemetry[]> {
  const res = (await api.get('/tracking/zone')) as unknown as TrackingResponse;
  return res.vehicles;
}

/** The driver's own assigned vehicle (GET /tracking/my). */
export async function getMyTracking(): Promise<VehicleTelemetry[]> {
  const res = (await api.get('/tracking/my')) as unknown as TrackingResponse;
  return res.vehicles;
}
