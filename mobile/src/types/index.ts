export interface User {
  id: number;
  email: string;
  role: 'driver' | 'supervisor' | 'zone_manager' | 'open_depot_operator';
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
  type: 'overspeed' | 'lane_point_missed' | 'vehicle_stopped';
  message: string;
  severity: 'minor' | 'major';
  created_at: string;
  acknowledged: boolean;
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
  status: 'moving' | 'stopped' | 'idle';
}
