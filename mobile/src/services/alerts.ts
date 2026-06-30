import type { AlertFeed, ManualAlertRequest } from '../types';
import { api } from './api';

/**
 * Unified vehicle-alerts endpoints (Req 8.x). The backend scopes the feed by
 * JWT role and validates the manual-alert recipient matrix server-side.
 * Errors propagate as a typed `ApiError` (Req 10.8).
 */
export type AlertScope = 'my' | 'ward' | 'zone';

/** Scoped unified alert feed with unread count (GET /alerts/{scope}). */
export async function getAlerts(scope: AlertScope): Promise<AlertFeed> {
  return (await api.get(`/alerts/${scope}`)) as unknown as AlertFeed;
}

/** Mark an alert read for the current user (POST /alerts/{id}/read). */
export async function markAlertRead(id: string): Promise<AlertFeed> {
  // Backend returns the updated feed (with the new unread count).
  return (await api.post(`/alerts/${id}/read`)) as unknown as AlertFeed;
}

/** Send a manual alert; recipient permissions are enforced server-side (POST /alerts/manual). */
export async function sendManualAlert(req: ManualAlertRequest): Promise<void> {
  await api.post('/alerts/manual', req);
}
