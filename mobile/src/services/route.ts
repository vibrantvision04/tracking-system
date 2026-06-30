import type { DriverRouteResponse } from '../types';
import { api } from './api';

/**
 * Driver route endpoint (Req 9.x). Returns the driver's real ward, route
 * geometry, lane-point completion, and current position. The backend responds
 * with HTTP 404 when no route is assigned, which surfaces as an `ApiError`
 * with `kind: 'not_found'` (Req 10.8).
 */
export async function getMyRoute(): Promise<DriverRouteResponse> {
  return (await api.get('/routes/my')) as unknown as DriverRouteResponse;
}
