export type Role = "ADMIN" | "OPERADOR" | "SUPERVISOR" | "CONDUCTOR" | "CLIENTE";

export type MotionState = "MOVING" | "STOPPED" | "OFFLINE";
export type VehicleStatus =
  | "ACTIVE"
  | "AVAILABLE"
  | "ASSIGNED"
  | "IN_SERVICE"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE"
  | "INACTIVE";
export type FuelType = "DIESEL" | "GASOLINE" | "GAS" | "ELECTRIC" | "HYBRID";
export type DriverStatus = "AVAILABLE" | "ASSIGNED" | "ON_ROUTE" | "INACTIVE";
export type GeofenceType = "BASE" | "CLIENTE" | "OPERACION" | "RESTRINGIDA" | "OTRA";
export type InspectionStatus = "PASS" | "WARNING" | "FAIL";
export type GpsProviderKind = "EXTERNAL" | "SMARTPHONE" | "SIMULATOR";
export type NotificationKind =
  | "INCIDENT"
  | "GPS_OFFLINE"
  | "VEHICLE_ALERT"
  | "GEOFENCE_ENTER"
  | "GEOFENCE_EXIT"
  | "INSPECTION_FAIL"
  | "LICENSE_EXPIRING"
  | "DOCUMENT_EXPIRING"
  | "MAINTENANCE_DUE"
  | "ETA_DELAY"
  | "ROUTE_DEVIATION"
  | "FUEL_ANOMALY"
  | "INFO";

export type Profile = {
  user_id: string;
  company_id: string;
  role: Role;
  full_name: string;
  driver_id: string | null;
  client_id: string | null;
  status: string;
};

export type Company = {
  id: string;
  name: string;
  legal_name: string;
  rfc: string;
  phone: string;
  email: string;
  address: string;
};

export type Workspace = {
  profile: Profile;
  company: Company;
};

export type Client = {
  id: string;
  company_id: string;
  legal_name: string;
  trade_name: string;
  rfc: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  lat: number | null;
  lng: number | null;
  status: string;
};

export type Fleet = {
  id: string;
  company_id: string;
  client_id: string | null;
  name: string;
  description: string;
  status: string;
  client_name?: string | null;
  vehicle_count?: number;
};

export type Driver = {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  email: string;
  license_number: string;
  license_type: string;
  license_expires_at: string | null;
  status: DriverStatus;
  emergency_contact: string;
  emergency_phone: string;
  km_total: number;
};

export type Vehicle = {
  id: string;
  company_id: string;
  economic_number: string;
  license_plate: string;
  brand: string;
  model: string;
  year: number | null;
  vehicle_type: string;
  status: VehicleStatus;
  client_id: string | null;
  fleet_id: string | null;
  current_driver_id: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  last_speed: number;
  last_heading: number;
  last_gps_at: string | null;
  motion_state: MotionState;
  speed_limit_kmh: number;
  odometer_km: number;
  vin: string;
  fuel_type?: FuelType | string;
  capacity?: number;
  active?: boolean;
};

export type GpsDevice = {
  id: string;
  company_id: string;
  vehicle_id: string | null;
  provider: GpsProviderKind;
  device_imei: string;
  ingest_token: string;
  status: string;
  vehicle_number?: string | null;
  token_preview?: string;
  // Simulator configuration is stored in vehicle_simulations, not gps_devices.
  // These are joined read-only fields used by the development UI.
  sim_route?: string;
  sim_progress?: number;
  sim_mode?: "MOVING" | "STOPPED" | "OFFLINE";
};

export type GpsPosition = {
  id: string;
  vehicle_id: string;
  gps_device_id: string | null;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude: number;
  accuracy: number;
  recorded_at: string;
  source?: string;
};

export type Geofence = {
  id: string;
  company_id: string;
  name: string;
  type: GeofenceType;
  client_id: string | null;
  fleet_id: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  polygon: string;
  status: string;
};

export type GeofenceEvent = {
  id: string;
  geofence_id: string;
  vehicle_id: string;
  kind: "ENTER" | "EXIT";
  latitude: number;
  longitude: number;
  recorded_at: string;
  dwell_seconds: number | null;
  geofence_name?: string;
  vehicle_number?: string;
};

export type Inspection = {
  id: string;
  company_id: string;
  vehicle_id: string;
  driver_id: string | null;
  user_id: string | null;
  inspected_at: string;
  status: InspectionStatus;
  observations: string;
  photos: string;
  vehicle_number?: string | null;
  driver_name?: string | null;
};

export type InspectionItem = {
  id: string;
  inspection_id: string;
  category: string;
  status: InspectionStatus;
  notes: string;
};

export type TrackingLink = {
  id: string;
  company_id: string;
  token?: string;
  vehicle_id: string;
  created_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  status: string;
  vehicle_number?: string | null;
};

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  kind: string;
  entity_id: string | null;
  status: "UNREAD" | "READ";
  read_at: string | null;
  created_at: string;
  email_queued: boolean;
  user_id?: string | null;
  audience_role?: string | null;
};

export type Personnel = {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  role: Role;
  status: string;
  user_id: string | null;
};

export type SpeedAlert = {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  speed: number;
  limit_kmh: number;
  latitude: number;
  longitude: number;
  recorded_at: string;
  vehicle_number?: string | null;
  driver_name?: string | null;
};

export type BackupRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  filename: string;
  size_bytes: number;
  status: string;
  error_code?: string;
  storage_kind?: string;
};

export type FleetUnit = Vehicle & {
  driver_name: string | null;
  client_name: string | null;
  fleet_name: string | null;
  gps_provider: string | null;
  gps_imei: string | null;
};

export type GpsFix = {
  vehicleId: string;
  deviceId: string | null;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude: number;
  accuracy: number;
  recordedAt: string;
  eventId?: string | null;
  sequence?: number | null;
  odometerKm?: number | null;
  source?: "LIVE" | "SIMULATOR" | "EXTERNAL" | "SMARTPHONE";
};

export type Trip = {
  id: string;
  company_id: string;
  service_id: string;
  trip_number: string;
  vehicle_id: string | null;
  driver_id: string | null;
  status: string;
  planned_start_at: string | null;
  actual_start_at: string | null;
  actual_end_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  service_number?: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
};

export type ServiceRow = {
  id: string;
  company_id: string;
  service_number: string;
  client_id: string | null;
  origin: string;
  destination: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  scheduled_departure_at: string | null;
  scheduled_arrival_at: string | null;
  actual_departure_at: string | null;
  actual_arrival_at: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  cargo_description: string;
  cargo_weight: number;
  cargo_volume: number;
  pieces: number;
  status: string;
  priority: string;
  reference: string;
  notes: string;
  require_pod: boolean;
  eta_at: string | null;
  eta_prev_at: string | null;
  planned_distance_km: number;
  planned_duration_min: number;
  actual_distance_km: number;
  gross_revenue: number;
  created_at: string;
  client_name?: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
};

export type ServiceStop = {
  id: string;
  service_id: string;
  kind: string;
  sequence: number;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  planned_arrival: string | null;
  actual_arrival: string | null;
  planned_departure: string | null;
  actual_departure: string | null;
  status: string;
  notes: string;
};

export type DocumentRow = {
  id: string;
  owner_type: string;
  owner_id: string;
  document_type: string;
  title: string;
  file_url: string;
  issued_at: string | null;
  expires_at: string | null;
  status: string;
};

export type MaintenanceOrder = {
  id: string;
  vehicle_id: string;
  kind: string;
  title: string;
  vendor: string;
  labor_cost: number;
  parts_cost: number;
  total_cost: number;
  odometer_km: number;
  opened_at: string;
  closed_at: string | null;
  status: string;
  observations: string;
  vehicle_number?: string | null;
};

export type FuelTransaction = {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  service_id: string | null;
  liters: number;
  price_per_liter: number;
  total: number;
  odometer: number;
  station: string;
  fuel_type: string;
  transaction_at: string;
  receipt: string;
  vehicle_number?: string | null;
};

export type AlertRow = {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

export const INSPECTION_CATEGORIES = [
  { id: "LLANTAS", label: "Llantas" },
  { id: "LUCES", label: "Luces" },
  { id: "LIQUIDOS", label: "Líquidos" },
  { id: "LIMPIEZA", label: "Limpieza" },
  { id: "CARROCERIA", label: "Carrocería" },
  { id: "MOTOR", label: "Motor" },
  { id: "FRENOS", label: "Frenos" },
  { id: "EQUIPO_SEGURIDAD", label: "Equipo de seguridad" },
] as const;

export const OPERATOR_ROLES: Role[] = ["ADMIN", "OPERADOR", "SUPERVISOR"];
export const MUTATING_ROLES: Role[] = ["ADMIN", "OPERADOR", "SUPERVISOR"];
export const ADMIN_ROLES: Role[] = ["ADMIN"];

export type ServiceLoad = {
  id: string;
  service_id: string;
  load_number: string;
  description: string;
  weight_kg: number;
  volume_m3: number;
  pieces: number;
  status: string;
  reference: string;
  created_at: string;
};

export type Incident = {
  id: string;
  service_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  client_visible?: boolean;
  occurred_at: string;
  resolved_at: string | null;
  vehicle_number?: string | null;
  driver_name?: string | null;
  service_number?: string | null;
};
