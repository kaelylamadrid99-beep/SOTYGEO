create table if not exists companies (
  id text primary key, name text not null, legal_name text not null default '', rfc text not null default '', phone text not null default '', email text not null default '', address text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists profiles (
  user_id text primary key, company_id text not null references companies(id) on delete cascade, role text not null, full_name text not null default '', driver_id text, client_id text, status text not null default 'ACTIVE',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists profiles_company_idx on profiles (company_id);
create table if not exists personnel (
  id text primary key, company_id text not null references companies(id) on delete cascade, full_name text not null, email text not null default '', phone text not null default '', position text not null default '', role text not null default 'OPERADOR', status text not null default 'ACTIVE', user_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text
);
create index if not exists personnel_company_idx on personnel (company_id);
create table if not exists clients (
  id text primary key, company_id text not null references companies(id) on delete cascade, legal_name text not null, trade_name text not null default '', rfc text not null default '', contact_name text not null default '', phone text not null default '', email text not null default '', address text not null default '', lat double precision, lng double precision, status text not null default 'ACTIVE',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text
);
create index if not exists clients_company_idx on clients (company_id);
create table if not exists fleets (
  id text primary key, company_id text not null references companies(id) on delete cascade, client_id text references clients(id) on delete set null, name text not null, description text not null default '', status text not null default 'ACTIVE',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text
);
create index if not exists fleets_company_idx on fleets (company_id);
create index if not exists fleets_client_idx on fleets (client_id);
create table if not exists drivers (
  id text primary key, company_id text not null references companies(id) on delete cascade, user_id text, name text not null, phone text not null default '', email text not null default '', license_number text not null default '', license_type text not null default 'E', license_expires_at date, status text not null default 'AVAILABLE', emergency_contact text not null default '', emergency_phone text not null default '', km_total double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text
);
create index if not exists drivers_company_idx on drivers (company_id);
create table if not exists vehicles (
  id text primary key, company_id text not null references companies(id) on delete cascade, economic_number text not null, license_plate text not null, brand text not null default '', model text not null default '', year integer, vehicle_type text not null default 'TRACTO', status text not null default 'ACTIVE',
  client_id text references clients(id) on delete set null, fleet_id text references fleets(id) on delete set null, current_driver_id text references drivers(id) on delete set null,
  current_latitude double precision, current_longitude double precision, last_speed double precision not null default 0, last_heading double precision not null default 0, last_gps_at timestamptz, motion_state text not null default 'OFFLINE', speed_limit_kmh double precision not null default 90, odometer_km double precision not null default 0, vin text not null default '',
  telemetry_kind text not null default 'LIVE', fuel_type text not null default 'DIESEL', capacity double precision not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text
);
create index if not exists vehicles_company_idx on vehicles (company_id);
create index if not exists vehicles_fleet_idx on vehicles (fleet_id);
create index if not exists vehicles_client_idx on vehicles (client_id);
create unique index if not exists vehicles_company_econ_uidx on vehicles (company_id, economic_number);
create unique index if not exists vehicles_company_plate_uidx on vehicles (company_id, license_plate);
create index if not exists vehicles_driver_idx on vehicles (company_id, current_driver_id);
create table if not exists gps_devices (
  id text primary key, company_id text not null references companies(id) on delete cascade, vehicle_id text references vehicles(id) on delete set null, provider text not null default 'SIMULATOR', device_imei text not null default '', ingest_token text not null default '', status text not null default 'ONLINE',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  ingest_token_hash text not null default '', last_event_key text, last_ingest_at timestamptz, last_recorded_at timestamptz, last_sequence integer
);
create index if not exists gps_devices_company_idx on gps_devices (company_id);
create index if not exists gps_devices_imei_idx on gps_devices (device_imei);
create unique index if not exists gps_devices_company_imei_uidx on gps_devices (company_id, device_imei);
create index if not exists gps_devices_sequence_idx on gps_devices (company_id, id, last_sequence);
create table if not exists gps_positions (
  id text primary key, company_id text not null references companies(id) on delete cascade, vehicle_id text not null, gps_device_id text, latitude double precision not null, longitude double precision not null, speed double precision not null default 0, heading double precision not null default 0, altitude double precision not null default 0, accuracy double precision not null default 12, recorded_at timestamptz not null default now(),
  source text not null default 'LIVE', odometer_km double precision
);
create index if not exists gps_positions_vehicle_idx on gps_positions (vehicle_id, recorded_at desc);
create index if not exists gps_positions_company_time_idx on gps_positions (company_id, recorded_at desc);
create index if not exists gps_positions_vehicle_time_idx on gps_positions (company_id, vehicle_id, recorded_at);
create index if not exists gps_positions_source_time_idx on gps_positions (company_id, vehicle_id, source, recorded_at desc);
create table if not exists geofences (
  id text primary key, company_id text not null references companies(id) on delete cascade, name text not null, type text not null default 'OTRA', client_id text, fleet_id text, lat double precision not null default 0, lng double precision not null default 0, radius_m double precision not null default 600, polygon text not null default '', status text not null default 'ACTIVE',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text
);
create index if not exists geofences_company_idx on geofences (company_id);
create index if not exists geofences_client_idx on geofences (company_id, client_id);
create table if not exists geofence_events (
  id text primary key, company_id text not null references companies(id) on delete cascade, geofence_id text not null, vehicle_id text not null, kind text not null, latitude double precision not null, longitude double precision not null, recorded_at timestamptz not null default now(), dwell_seconds double precision
);
create index if not exists geofence_events_company_idx on geofence_events (company_id, recorded_at desc);
create index if not exists geofence_events_fence_idx on geofence_events (geofence_id, recorded_at desc);
create table if not exists speed_alerts (
  id text primary key, company_id text not null references companies(id) on delete cascade, vehicle_id text not null, driver_id text, speed double precision not null, limit_kmh double precision not null, latitude double precision not null, longitude double precision not null, recorded_at timestamptz not null default now()
);
create index if not exists speed_alerts_company_idx on speed_alerts (company_id, recorded_at desc);
create table if not exists inspections (
  id text primary key, company_id text not null references companies(id) on delete cascade, vehicle_id text not null, driver_id text, user_id text, inspected_at timestamptz not null default now(), status text not null default 'PASS', observations text not null default '', photos text not null default '[]', created_at timestamptz not null default now(),
  signed_by text, signed_at timestamptz, completed_at timestamptz, blocks_vehicle boolean not null default false
);
create index if not exists inspections_company_idx on inspections (company_id, inspected_at desc);
create index if not exists inspections_vehicle_idx on inspections (vehicle_id, inspected_at desc);
create table if not exists inspection_items (
  id text primary key, inspection_id text not null references inspections(id) on delete cascade, category text not null, status text not null, notes text not null default ''
);
create index if not exists inspection_items_insp_idx on inspection_items (inspection_id);
create table if not exists tracking_links (
  id text primary key, company_id text not null references companies(id) on delete cascade, token text not null, vehicle_id text not null, created_by text, expires_at timestamptz not null, revoked_at timestamptz, status text not null default 'ACTIVE', created_at timestamptz not null default now(),
  token_hash text not null default '', hide_driver_name boolean not null default false, hide_license_plate boolean not null default false
);
create unique index if not exists tracking_links_token_idx on tracking_links (token);
create index if not exists tracking_links_company_idx on tracking_links (company_id);
create table if not exists notifications (
  id text primary key, company_id text not null references companies(id) on delete cascade, user_id text, title text not null, body text not null default '', kind text not null default 'INFO', entity_id text, status text not null default 'UNREAD', read_at timestamptz, created_at timestamptz not null default now(), email_queued boolean not null default false,
  audience_role text
);
create index if not exists notifications_company_idx on notifications (company_id, created_at desc);
create index if not exists notifications_user_idx on notifications (company_id, user_id, created_at desc);
create table if not exists notification_reads (
  notification_id text not null references notifications(id) on delete cascade, user_id text not null, read_at timestamptz not null default now(), primary key (notification_id, user_id)
);
create index if not exists notification_reads_user_idx on notification_reads (user_id, read_at desc);
create table if not exists audit_logs (
  id text primary key, company_id text not null references companies(id) on delete cascade, user_id text, action text not null, entity_kind text not null, entity_id text, details text not null default '', created_at timestamptz not null default now()
);
create index if not exists audit_logs_company_idx on audit_logs (company_id, created_at desc);
create table if not exists backups (
  id text primary key, company_id text not null references companies(id) on delete cascade, created_at timestamptz not null default now(), created_by text, filename text not null, size_bytes integer not null default 0, status text not null default 'READY', payload text not null,
  error_code text not null default '', storage_kind text not null default 'DATABASE', storage_key text not null default ''
);
create index if not exists backups_company_idx on backups (company_id, created_at desc);
create table if not exists password_resets (
  id text primary key, email text not null, token text not null, created_at timestamptz not null default now(), used_at timestamptz,
  token_hash text not null default '', expires_at timestamptz, user_id text
);
create index if not exists password_resets_email_idx on password_resets (email);
create table if not exists vehicle_simulations (
  vehicle_id text primary key references vehicles(id) on delete cascade, company_id text not null references companies(id) on delete cascade, sim_route text not null default '[]', sim_progress double precision not null default 0, sim_mode text not null default 'MOVING', is_development boolean not null default true, updated_at timestamptz not null default now()
);
create index if not exists vehicle_simulations_company_idx on vehicle_simulations (company_id);
create table if not exists gps_ingest_events (
  id text primary key, company_id text not null references companies(id) on delete cascade, device_id text not null, event_key text not null, recorded_at timestamptz not null, created_at timestamptz not null default now()
);
create unique index if not exists gps_ingest_events_device_key_uidx on gps_ingest_events (device_id, event_key);
create index if not exists gps_ingest_events_company_idx on gps_ingest_events (company_id, created_at desc);
create table if not exists gps_ingest_errors (
  id text primary key, company_id text, imei text not null default '', reason text not null, created_at timestamptz not null default now()
);
create index if not exists gps_ingest_errors_created_idx on gps_ingest_errors (created_at desc);
create table if not exists domain_events (
  id text primary key, company_id text not null references companies(id) on delete cascade, type text not null, entity_type text not null default '', entity_id text, payload text not null default '{}', created_at timestamptz not null default now()
);
create index if not exists domain_events_company_idx on domain_events (company_id, created_at desc);
create table if not exists job_runs (
  id text primary key, company_id text, job_name text not null, status text not null default 'SUCCESS', started_at timestamptz not null default now(), finished_at timestamptz, details text not null default ''
);
create index if not exists job_runs_name_idx on job_runs (job_name, started_at desc);
create table if not exists services (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_number text not null, client_id text references clients(id) on delete set null, origin text not null default '', destination text not null default '',
  origin_lat double precision, origin_lng double precision, destination_lat double precision, destination_lng double precision,
  scheduled_departure_at timestamptz, scheduled_arrival_at timestamptz, actual_departure_at timestamptz, actual_arrival_at timestamptz,
  vehicle_id text references vehicles(id) on delete set null, driver_id text references drivers(id) on delete set null,
  cargo_description text not null default '', cargo_weight double precision not null default 0, cargo_volume double precision not null default 0, pieces integer not null default 0,
  status text not null default 'PLANNED', priority text not null default 'NORMAL', reference text not null default '', notes text not null default '', require_pod boolean not null default true,
  eta_at timestamptz, eta_prev_at timestamptz, planned_distance_km double precision not null default 0, planned_duration_min double precision not null default 0, actual_distance_km double precision not null default 0, gross_revenue double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text
);
create unique index if not exists services_company_number_uidx on services (company_id, service_number);
create index if not exists services_company_idx on services (company_id, created_at desc);
create index if not exists services_status_idx on services (company_id, status);
create index if not exists services_vehicle_idx on services (vehicle_id);
create index if not exists services_client_idx on services (client_id);
create unique index if not exists services_active_vehicle_uidx on services(company_id, vehicle_id)
  where vehicle_id is not null and status in ('ASSIGNED','AT_ORIGIN','LOADING','LOADED','IN_TRANSIT','AT_DESTINATION','UNLOADING');
create unique index if not exists services_active_driver_uidx on services(company_id, driver_id)
  where driver_id is not null and status in ('ASSIGNED','AT_ORIGIN','LOADING','LOADED','IN_TRANSIT','AT_DESTINATION','UNLOADING');
create table if not exists service_stops (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, kind text not null default 'WAYPOINT', sequence integer not null default 0, name text not null default '', address text not null default '', latitude double precision, longitude double precision,
  planned_arrival timestamptz, actual_arrival timestamptz, planned_departure timestamptz, actual_departure timestamptz, status text not null default 'PENDING', notes text not null default ''
);
create index if not exists service_stops_service_idx on service_stops (service_id, sequence);
create table if not exists service_assignments (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, vehicle_id text references vehicles(id) on delete set null, driver_id text references drivers(id) on delete set null, assigned_at timestamptz not null default now(), unassigned_at timestamptz, assigned_by text, reason text not null default ''
);
create index if not exists service_assignments_service_idx on service_assignments (service_id, assigned_at desc);
create index if not exists service_assignments_active_vehicle_idx on service_assignments (company_id, vehicle_id) where unassigned_at is null;
create index if not exists service_assignments_active_driver_idx on service_assignments (company_id, driver_id) where unassigned_at is null;
create table if not exists service_status_history (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, from_status text not null default '', to_status text not null, changed_at timestamptz not null default now(), changed_by text, notes text not null default ''
);
create index if not exists service_status_history_idx on service_status_history (service_id, changed_at desc);
create table if not exists route_plans (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, distance_km double precision not null default 0, duration_min double precision not null default 0, polyline text not null default '[]', created_at timestamptz not null default now()
);
create index if not exists route_plans_service_idx on route_plans (service_id);
create table if not exists route_points (
  id text primary key, route_plan_id text not null references route_plans(id) on delete cascade, sequence integer not null default 0, latitude double precision not null, longitude double precision not null
);
create index if not exists route_points_plan_idx on route_points (route_plan_id, sequence);
create table if not exists route_deviation_events (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, vehicle_id text, latitude double precision not null, longitude double precision not null, deviation_km double precision not null default 0, recorded_at timestamptz not null default now()
);
create index if not exists route_deviation_service_idx on route_deviation_events (service_id, recorded_at desc);
create index if not exists route_deviation_company_service_idx on route_deviation_events (company_id, service_id, recorded_at desc);
create table if not exists delivery_evidence (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, receiver_name text not null default '', receiver_document text not null default '', signature text not null default '', photo_url text not null default '', comments text not null default '', latitude double precision, longitude double precision, captured_at timestamptz not null default now(), captured_by text,
  photo_key text not null default ''
);
create index if not exists delivery_evidence_service_idx on delivery_evidence (service_id);
create table if not exists documents (
  id text primary key, company_id text not null references companies(id) on delete cascade, owner_type text not null, owner_id text not null, document_type text not null, title text not null default '', file_url text not null default '', storage_key text not null default '', issued_at date, expires_at date, status text not null default 'VALID', metadata text not null default '{}', created_at timestamptz not null default now(), created_by text
);
create index if not exists documents_owner_idx on documents (company_id, owner_type, owner_id);
create index if not exists documents_expires_idx on documents (company_id, expires_at);
create index if not exists documents_status_expiry_idx on documents (company_id, status, expires_at);
create table if not exists maintenance_plans (
  id text primary key, company_id text not null references companies(id) on delete cascade, vehicle_id text not null references vehicles(id) on delete cascade, kind text not null default 'PREVENTIVE', title text not null, interval_km double precision, interval_days integer, interval_hours double precision, last_odometer double precision not null default 0, last_service_at date, next_due_at date, next_due_km double precision, status text not null default 'ACTIVE', created_at timestamptz not null default now()
);
create index if not exists maintenance_plans_vehicle_idx on maintenance_plans (vehicle_id);
create table if not exists maintenance_orders (
  id text primary key, company_id text not null references companies(id) on delete cascade, vehicle_id text not null references vehicles(id) on delete cascade, plan_id text references maintenance_plans(id) on delete set null, kind text not null default 'CORRECTIVE', title text not null, vendor text not null default '', labor_cost double precision not null default 0, parts_cost double precision not null default 0, total_cost double precision not null default 0, odometer_km double precision not null default 0, opened_at timestamptz not null default now(), closed_at timestamptz, status text not null default 'OPEN', observations text not null default '', created_by text
);
create index if not exists maintenance_orders_vehicle_idx on maintenance_orders (company_id, vehicle_id, opened_at desc);
create table if not exists maintenance_items (
  id text primary key, order_id text not null references maintenance_orders(id) on delete cascade, description text not null, quantity double precision not null default 1, unit_cost double precision not null default 0, kind text not null default 'PART'
);
create index if not exists maintenance_items_order_idx on maintenance_items (order_id);
create table if not exists fuel_transactions (
  id text primary key, company_id text not null references companies(id) on delete cascade, vehicle_id text not null references vehicles(id) on delete cascade, driver_id text references drivers(id) on delete set null, service_id text references services(id) on delete set null, liters double precision not null, price_per_liter double precision not null default 0, total double precision not null default 0, odometer double precision not null default 0, station text not null default '', fuel_type text not null default 'DIESEL', transaction_at timestamptz not null default now(), receipt text not null default '', created_by text
);
create index if not exists fuel_transactions_vehicle_idx on fuel_transactions (company_id, vehicle_id, transaction_at desc);
create table if not exists service_cost_lines (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, kind text not null, amount double precision not null default 0, notes text not null default '', created_at timestamptz not null default now()
);
create index if not exists service_cost_lines_service_idx on service_cost_lines (service_id);
create index if not exists service_cost_company_service_idx on service_cost_lines (company_id, service_id, created_at desc);
create table if not exists alerts (
  id text primary key, company_id text not null references companies(id) on delete cascade, type text not null, severity text not null default 'WARNING', status text not null default 'OPEN', title text not null, body text not null default '', entity_type text not null default '', entity_id text, vehicle_id text, driver_id text, service_id text, assigned_to text, created_at timestamptz not null default now(), acknowledged_at timestamptz, resolved_at timestamptz
);
create index if not exists alerts_company_idx on alerts (company_id, created_at desc);
create index if not exists alerts_status_idx on alerts (company_id, status);
create index if not exists alerts_service_idx on alerts (company_id, service_id, created_at desc);
create table if not exists service_loads (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, load_number text not null, description text not null default '', weight_kg double precision not null default 0, volume_m3 double precision not null default 0, pieces integer not null default 0, status text not null default 'PLANNED', reference text not null default '', created_at timestamptz not null default now(), created_by text
);
create unique index if not exists service_loads_company_number_uidx on service_loads(company_id, load_number);
create index if not exists service_loads_service_idx on service_loads(company_id, service_id, created_at desc);
create table if not exists incidents (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text references services(id) on delete set null, vehicle_id text references vehicles(id) on delete set null, driver_id text references drivers(id) on delete set null, type text not null default 'OTHER', severity text not null default 'WARNING', status text not null default 'OPEN', title text not null, description text not null default '', occurred_at timestamptz not null default now(), resolved_at timestamptz, created_at timestamptz not null default now(), created_by text, resolved_by text,
  client_visible boolean not null default false
);
create index if not exists incidents_company_idx on incidents(company_id, occurred_at desc);
create index if not exists incidents_service_idx on incidents(company_id, service_id, occurred_at desc);
create index if not exists incidents_status_idx on incidents(company_id, status, occurred_at desc);
create index if not exists incidents_client_visible_idx on incidents(company_id, client_visible, occurred_at desc);
create table if not exists trips (
  id text primary key, company_id text not null references companies(id) on delete cascade, service_id text not null references services(id) on delete cascade, trip_number text not null, vehicle_id text references vehicles(id) on delete set null, driver_id text references drivers(id) on delete set null, status text not null default 'PLANNED', planned_start_at timestamptz, actual_start_at timestamptz, actual_end_at timestamptz, notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text
);
create unique index if not exists trips_company_number_uidx on trips(company_id, trip_number);
create unique index if not exists trips_service_uidx on trips(service_id);
create index if not exists trips_company_status_idx on trips(company_id, status, created_at desc);
create index if not exists trips_vehicle_idx on trips(company_id, vehicle_id, created_at desc);
create index if not exists trips_driver_idx on trips(company_id, driver_id, created_at desc);
create table if not exists trip_stops (
  id text primary key, company_id text not null references companies(id) on delete cascade, trip_id text not null references trips(id) on delete cascade, service_stop_id text references service_stops(id) on delete set null, sequence integer not null default 0, status text not null default 'PENDING', planned_arrival timestamptz, actual_arrival timestamptz, actual_departure timestamptz, notes text not null default ''
);
create unique index if not exists trip_stops_trip_seq_uidx on trip_stops(trip_id, sequence);
create index if not exists trip_stops_company_idx on trip_stops(company_id, trip_id, sequence);
alter table profiles add column if not exists email text not null default '';
alter table profiles add column if not exists phone text not null default '';
alter table profiles add column if not exists personnel_id text;
alter table profiles add column if not exists invited_by text;
alter table profiles add column if not exists invited_at timestamptz;
alter table profiles add column if not exists accepted_at timestamptz;
alter table profiles add column if not exists activated_at timestamptz;
alter table profiles add constraint profiles_status_chk
  check (status in ('INVITED','PENDING','ACTIVE','SUSPENDED','DISABLED','REVOKED'));
create table if not exists user_invitations (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  email text not null, full_name text not null, phone text not null default '',
  role text not null check (role in ('ADMIN','OPERADOR','SUPERVISOR','CONDUCTOR','CLIENTE')),
  driver_id text, client_id text, personnel_id text, token_hash text not null,
  status text not null default 'INVITED' check (status in ('INVITED','ACCEPTED','REVOKED')),
  email_status text not null default 'PENDING',
  expires_at timestamptz not null, accepted_at timestamptz, used_at timestamptz, revoked_at timestamptz,
  user_id text, created_by text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists user_invitations_token_hash_uq on user_invitations (token_hash);
create index if not exists user_invitations_email_idx on user_invitations (lower(email));
create index if not exists user_invitations_company_idx on user_invitations (company_id, status);
create index if not exists user_invitations_expires_idx on user_invitations (expires_at);
create unique index if not exists user_invitations_one_active_uq on user_invitations (company_id, lower(email)) where status = 'INVITED';
create table if not exists email_outbox (
  id text primary key,
  company_id text references companies(id) on delete cascade,
  recipient text not null, template text not null,
  payload text not null default '{}',
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','SENT','FAILED','DEAD')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text not null default '',
  provider_message_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_outbox_due_idx on email_outbox (status, available_at);
create table if not exists rate_limits (
  key text not null, bucket bigint not null, count integer not null default 0,
  created_at timestamptz not null default now(), primary key (key, bucket)
);
create index if not exists rate_limits_created_idx on rate_limits (created_at);
create table if not exists evidence_blobs (
  key text primary key,
  company_id text not null references companies(id) on delete cascade,
  content_type text not null, bytes bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists evidence_blobs_company_idx on evidence_blobs (company_id);
create table if not exists email_verifications (
  id text primary key, user_id text not null, token_hash text not null,
  expires_at timestamptz not null, used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists email_verifications_token_hash_uq on email_verifications (token_hash);
create index if not exists email_verifications_user_idx on email_verifications (user_id);
create unique index if not exists vehicles_company_id_uidx on vehicles (company_id, id);
create unique index if not exists drivers_company_id_uidx on drivers (company_id, id);
create unique index if not exists clients_company_id_uidx on clients (company_id, id);
create unique index if not exists fleets_company_id_uidx on fleets (company_id, id);
create unique index if not exists gps_devices_company_id_uidx on gps_devices (company_id, id);
create unique index if not exists services_company_id_uidx on services (company_id, id);
create unique index if not exists geofences_company_id_uidx on geofences (company_id, id);
alter table gps_devices add constraint gps_devices_vehicle_company_fk foreign key (company_id, vehicle_id) references vehicles (company_id, id) on delete set null not valid;
alter table gps_positions add constraint gps_positions_vehicle_company_fk foreign key (company_id, vehicle_id) references vehicles (company_id, id) on delete cascade not valid;
alter table gps_positions add constraint gps_positions_device_company_fk foreign key (company_id, gps_device_id) references gps_devices (company_id, id) on delete set null not valid;
alter table vehicles add constraint vehicles_fleet_company_fk foreign key (company_id, fleet_id) references fleets (company_id, id) on delete set null not valid;
alter table vehicles add constraint vehicles_client_company_fk foreign key (company_id, client_id) references clients (company_id, id) on delete set null not valid;
alter table vehicles add constraint vehicles_driver_company_fk foreign key (company_id, current_driver_id) references drivers (company_id, id) on delete set null not valid;
alter table fleets add constraint fleets_client_company_fk foreign key (company_id, client_id) references clients (company_id, id) on delete set null not valid;
alter table services add constraint services_client_company_fk foreign key (company_id, client_id) references clients (company_id, id) not valid;
alter table services add constraint services_vehicle_company_fk foreign key (company_id, vehicle_id) references vehicles (company_id, id) on delete set null not valid;
alter table services add constraint services_driver_company_fk foreign key (company_id, driver_id) references drivers (company_id, id) on delete set null not valid;
alter table service_stops add constraint service_stops_service_company_fk foreign key (company_id, service_id) references services (company_id, id) on delete cascade not valid;
alter table service_loads add constraint service_loads_service_company_fk foreign key (company_id, service_id) references services (company_id, id) on delete cascade not valid;
alter table service_status_history add constraint service_status_history_service_company_fk foreign key (company_id, service_id) references services (company_id, id) on delete cascade not valid;
alter table route_plans add constraint route_plans_service_company_fk foreign key (company_id, service_id) references services (company_id, id) on delete cascade not valid;
alter table service_cost_lines add constraint service_cost_lines_service_company_fk foreign key (company_id, service_id) references services (company_id, id) on delete cascade not valid;
alter table delivery_evidence add constraint delivery_evidence_service_company_fk foreign key (company_id, service_id) references services (company_id, id) on delete cascade not valid;
alter table service_assignments add constraint service_assignments_vehicle_company_fk foreign key (company_id, vehicle_id) references vehicles (company_id, id) on delete set null not valid;
alter table service_assignments add constraint service_assignments_driver_company_fk foreign key (company_id, driver_id) references drivers (company_id, id) on delete set null not valid;
alter table trips add constraint trips_service_company_fk foreign key (company_id, service_id) references services (company_id, id) on delete cascade not valid;
alter table trips add constraint trips_vehicle_company_fk foreign key (company_id, vehicle_id) references vehicles (company_id, id) on delete set null not valid;
alter table trips add constraint trips_driver_company_fk foreign key (company_id, driver_id) references drivers (company_id, id) on delete set null not valid;
alter table geofence_events add constraint geofence_events_fence_company_fk foreign key (company_id, geofence_id) references geofences (company_id, id) on delete cascade not valid;
alter table geofence_events add constraint geofence_events_vehicle_company_fk foreign key (company_id, vehicle_id) references vehicles (company_id, id) on delete cascade not valid;
alter table fuel_transactions add constraint fuel_transactions_vehicle_company_fk foreign key (company_id, vehicle_id) references vehicles (company_id, id) not valid;
alter table fuel_transactions add constraint fuel_transactions_driver_company_fk foreign key (company_id, driver_id) references drivers (company_id, id) on delete set null not valid;
alter table fuel_transactions add constraint fuel_transactions_service_company_fk foreign key (company_id, service_id) references services (company_id, id) on delete set null not valid;

do $$
declare t text;
begin
  foreach t in array array['companies','profiles','personnel','clients','fleets','drivers','vehicles','gps_devices','gps_positions','geofences','geofence_events','speed_alerts','inspections','inspection_items','tracking_links','notifications','notification_reads','audit_logs','backups','password_resets','vehicle_simulations','gps_ingest_events','gps_ingest_errors','domain_events','job_runs','services','service_stops','service_assignments','service_status_history','route_plans','route_points','route_deviation_events','delivery_evidence','documents','maintenance_plans','maintenance_orders','maintenance_items','fuel_transactions','service_cost_lines','alerts','service_loads','incidents','trips','trip_stops','user_invitations','email_outbox','rate_limits','evidence_blobs','email_verifications'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create or replace view public."user" as
  select u.id::text as id,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') as name,
         u.email::text as email,
         (u.email_confirmed_at is not null) as "emailVerified",
         u.created_at as "createdAt", u.updated_at as "updatedAt"
  from auth.users u;
revoke all on public."user" from anon, authenticated, public;
grant select on public."user" to service_role;

create or replace function public.exec_sql(query text, params jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q text := regexp_replace(query, ';\s*$', '');
  i int; n int := coalesce(jsonb_array_length(params),0); v jsonb; lit text; res jsonb;
begin
  for i in reverse n..1 loop
    v := params->(i-1);
    if v is null or jsonb_typeof(v)='null' then lit := 'NULL';
    elsif jsonb_typeof(v)='string' then lit := quote_literal(v#>>'{}');
    elsif jsonb_typeof(v)='number' then lit := '('||(v#>>'{}')||')';
    elsif jsonb_typeof(v)='boolean' then lit := (v#>>'{}');
    else lit := quote_literal(v::text);
    end if;
    q := regexp_replace(q, '\$'||i||'(?![0-9])', replace(lit,'\','\\'), 'g');
  end loop;
  if q ~* '^\s*(select|with|values|table)\y' or q ~* '\yreturning\y' then
    execute 'with t as (' || q || ') select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from t' into res;
  else
    execute q;
    res := '[]'::jsonb;
  end if;
  return res;
end $$;
revoke all on function public.exec_sql(text, jsonb) from public, anon, authenticated;
grant execute on function public.exec_sql(text, jsonb) to service_role;