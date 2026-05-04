// ═══════════════════════════════════════
// Types matching Go backend responses
// ═══════════════════════════════════════
export interface GpsDevice {
  id: number;
  imei: string;
  serial_no: string;
  sim_no: string;
  device_type: string;
  is_active: boolean;
  created_at: string;
  vehicle?: Vehicle | null;
}

export interface VehicleType {
  id: number;
  name: string;
  icon_color: string | null;
}

export interface Vehicle {
  id: number;
  registration_no: string;
  chassis_no: string;
  is_owned: boolean;
  vehicle_type_id: number | null;
  is_active: boolean;
  vehicle_type: VehicleType | null;
  gps_device: GpsDevice | null;
  status: "running" | "idle" | "stopped" | "offline";
}

export interface LivePosition {
  imei: string;
  lat: number;
  lng: number;
  speed: number;
  angle: number;
  ignition: boolean | null;
  timestamp: string;
}

export interface GpsDataPoint {
  time: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  ignition: boolean | null;
  satellites: number;
}

export interface MovementReport {
  id: number;
  vehicle_id: number;
  imei: string;
  report_date: string;
  total_distance: number;
  average_speed: number;
  max_speed: number;
  total_active_duration: string;
  total_idle_duration: string;
  total_stoppage_duration: string;
  in_parking_duration: string;
  total_ignition_on_duration: string;
  actual_ignition_on_duration: string;
  total_running_duration: string;
  fuel_in_ltr: number;
  fuel_consumption: number;
  overspeed_count: string;
  overspeed_distance: number;
  alert: number;
  start_time: string;
  end_time: string;
  registration_no?: string;
  vehicle_type?: string;
  zone?: string;
  ward?: string;
}

export interface Alert {
  id: number;
  imei: string;
  vehicle_id: number | null;
  alert_type: string;
  detail: string;
  latitude: number | null;
  longitude: number | null;
  alert_time: string;
  severity: "high" | "medium" | "low";
  is_resolved: boolean;
  registration_no?: string;
}
