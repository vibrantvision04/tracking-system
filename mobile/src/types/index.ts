export interface User {
  id: number;
  email: string;
  role: 'driver' | 'supervisor' | 'zone_manager' | 'open_depot_operator' | 'road_sweeper';
  name: string;
  employee_id?: string;
  contact_no?: string;
}

export interface AttendanceRecord {
  id: string;
  driver_name: string;
  helper_present: boolean;
  helper_name?: string;
  vehicle_id?: number;
  punch_in_at: string;
}

export interface LanePoint {
  id: number;
  latitude: number;
  longitude: number;
  sequence_number: number;
  status: 'achieved' | 'pending' | 'missed' | 'upcoming';
}

export interface RouteDetails {
  id: number;
  route_name: string;
  is_sequential: boolean;
  geojson?: string;
}

export interface MyRouteResponse {
  ward: {
    id: number;
    name: string;
  };
  route: RouteDetails;
  lane_points: LanePoint[];
  checkpoints: any[];
}

export interface Alert {
  id: string;
  type:
    | 'overspeed'
    | 'lane_point_missed'
    | 'vehicle_stopped'
    | AlertType;
  message: string;
  severity: 'minor' | 'major' | AlertSeverity;
  created_at: string;
  acknowledged: boolean;
  // Non-breaking extensions for the unified vehicle-alert feed
  read?: boolean;
  source?: 'automatic' | 'manual';
  vehicle_number?: string;
  sender_role?: string;
}

export interface Blockage {
  id: string;
  lane_point_id: number;
  lane_point_name: string;
  driver_name: string;
  vehicle_number: string;
  photo_url: string;
  gps_lat: number;
  gps_lng: number;
  submitted_at: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface OpenDepot {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  submitted: boolean;
}

export interface LiveVehicle {
  vehicle_id: number;
  vehicle_number: string;
  driver_name: string;
  lat: number;
  lng: number;
  speed: number;
  last_update: string;
  status: 'moving' | 'stopped' | 'idle' | VehicleStatus;
  // Non-breaking extension: telemetry ignition state
  ignition?: boolean;
}

// ============================================================================
// Backend response models (mobile-backend-integration)
// Mirror the backend response shapes. See design.md "Data Models".
// ============================================================================

// ---- Auth / Profile ----
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}
export interface LoginResponse extends AuthTokens {
  user: User;
}
// User (existing): { id, email, role, name, employee_id?, contact_no? }

// ---- Dashboard (Req 3.2) ----
export interface DashboardStats {
  coverage_percent: number;
  total_vehicles: number;
  running_vehicles: number;
  completed_routes: number;
  pending_routes: number;
  active_drivers: number;
  attendance_present: number;
  attendance_total: number;
  alert_count: number;
  complaint_count: number;
}

// ---- Vehicle telemetry (Req 4.2) ----
export type VehicleStatus = 'running' | 'idle' | 'stopped' | 'offline';
export interface VehicleTelemetry {
  vehicle_id: number;
  vehicle_number: string;
  driver_name: string;
  lat: number;
  lng: number;
  speed: number;
  ignition: boolean;
  status: VehicleStatus; // derived server-side, never a fixed default
  last_update: string; // ISO timestamp
}

// ---- Coverage (Req 5.2) ----
export interface CoverageSummary {
  date: string;
  total_lane_points: number;
  completed_lane_points: number;
  remaining_lane_points: number;
  coverage_percent: number;
  covered_distance_km: number;
  pending_distance_km: number;
}
export interface WardCoverage {
  ward_id: number;
  ward_name: string;
  coverage_percent: number;
  vehicles_active: number;
  drivers_present: number;
}
export interface ZoneCoverage {
  zone: { id: number; name: string; total_wards: number; total_vehicles: number };
  coverage_percent: number;
  active_vehicles: number;
  drivers_present: number;
  wards: WardCoverage[];
}

// ---- Attendance report (Req 6.2) ----
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave';
export interface AttendanceReportRecord {
  id: string;
  employee_name: string;
  date: string;
  status: AttendanceStatus;
  check_in?: string;
  check_out?: string;
}
export interface Paginated<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// ---- Complaint (read-only) (Req 7.2) ----
export type ComplaintPriority = 'low' | 'medium' | 'high' | 'critical';
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export interface Complaint {
  id: number;
  title: string;
  description: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assigned_vehicle?: string;
  assigned_driver?: string;
  location?: { lat: number; lng: number; address?: string };
  images: string[];
  created_at: string;
  updated_at: string;
}

// ---- Vehicle alert (Req 8) ----
export type AlertType =
  | 'overspeed'
  | 'geofence_entry'
  | 'geofence_exit'
  | 'idle'
  | 'ignition'
  | 'offline'
  | 'battery'
  | 'harsh_braking'
  | 'manual';
export type AlertSeverity = 'minor' | 'major' | 'critical';
export interface VehicleAlert {
  id: string;
  type: AlertType;
  source: 'automatic' | 'manual';
  message: string;
  severity: AlertSeverity;
  vehicle_number?: string;
  created_at: string;
  read: boolean; // per-user read state (Req 8.9)
  sender_role?: string; // for manual alerts
}
export interface AlertFeed {
  alerts: VehicleAlert[];
  unread_count: number;
}
export interface ManualAlertRequest {
  recipient_role: 'supervisor' | 'driver';
  recipient_ids: number[];
  message: string;
  severity: AlertSeverity;
}

// ---- Driver route (Req 9.2) ----
export interface DriverRouteResponse {
  ward: { id: number; name: string }; // real ward, not "Mock Ward"
  route: RouteDetails; // existing interface
  lane_points: LanePoint[]; // status computed from coverage
  completed_lane_points: number;
  remaining_lane_points: number;
  coverage_percent: number;
  current_position?: { lat: number; lng: number; updated_at: string };
}

// ---- Error taxonomy (Req 10.3) ----
export type ApiErrorKind =
  | 'unauthorized' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'server' // 500
  | 'timeout' // request timeout
  | 'offline' // no connectivity
  | 'unknown';
export interface ApiError {
  kind: ApiErrorKind;
  status?: number;
  message: string;
}
