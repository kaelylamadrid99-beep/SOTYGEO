import type { Tx } from "@/lib/db";

export const RESTORE_TABLE_ORDER = [
  "clients",
  "fleets",
  "drivers",
  "vehicles",
  "gps_devices",
  "geofences",
  "services",
  "service_loads",
  "service_stops",
  "service_assignments",
  "service_status_history",
  "route_plans",
  "route_points",
  "route_deviation_events",
  "gps_positions",
  "geofence_events",
  "speed_alerts",
  "inspections",
  "inspection_items",
  "delivery_evidence",
  "documents",
  "maintenance_plans",
  "maintenance_orders",
  "maintenance_items",
  "fuel_transactions",
  "service_cost_lines",
  "trip_stops",
  "trips",
  "incidents",
  "alerts",
  "tracking_links",
  "notifications",
  "personnel",
] as const;

export const RESTORE_DELETE_ORDER = [
  "maintenance_items",
  "service_cost_lines",
  "trip_stops",
  "trips",
  "incidents",
  "alerts",
  "fuel_transactions",
  "delivery_evidence",
  "route_deviation_events",
  "route_points",
  "maintenance_orders",
  "maintenance_plans",
  "documents",
  "inspection_items",
  "inspections",
  "geofence_events",
  "speed_alerts",
  "gps_positions",
  "service_status_history",
  "service_assignments",
  "service_stops",
  "service_loads",
  "route_plans",
  "tracking_links",
  "notifications",
  "gps_devices",
  "services",
  "vehicles",
  "geofences",
  "drivers",
  "fleets",
  "clients",
  "personnel",
] as const;

const TABLE_COLUMNS: Record<(typeof RESTORE_TABLE_ORDER)[number], readonly string[]> = {
  clients: ["id", "company_id", "legal_name", "trade_name", "rfc", "contact_name", "phone", "email", "address", "lat", "lng", "status", "created_by", "updated_by"],
  fleets: ["id", "company_id", "client_id", "name", "description", "status", "created_by", "updated_by"],
  drivers: ["id", "company_id", "user_id", "name", "phone", "email", "license_number", "license_type", "license_expires_at", "status", "emergency_contact", "emergency_phone", "km_total", "created_by", "updated_by"],
  vehicles: ["id", "company_id", "economic_number", "license_plate", "brand", "model", "year", "vehicle_type", "status", "client_id", "fleet_id", "current_driver_id", "current_latitude", "current_longitude", "last_speed", "last_heading", "last_gps_at", "motion_state", "speed_limit_kmh", "odometer_km", "vin", "telemetry_kind", "created_by", "updated_by"],
  gps_devices: ["id", "company_id", "vehicle_id", "provider", "device_imei", "ingest_token", "ingest_token_hash", "status", "last_event_key", "last_ingest_at", "last_recorded_at", "last_sequence"],
  geofences: ["id", "company_id", "name", "type", "client_id", "fleet_id", "lat", "lng", "radius_m", "polygon", "status", "created_by"],
  services: ["id", "company_id", "service_number", "client_id", "origin", "destination", "origin_lat", "origin_lng", "destination_lat", "destination_lng", "scheduled_departure_at", "scheduled_arrival_at", "actual_departure_at", "actual_arrival_at", "vehicle_id", "driver_id", "cargo_description", "cargo_weight", "cargo_volume", "pieces", "status", "priority", "reference", "notes", "require_pod", "eta_at", "eta_prev_at", "planned_distance_km", "planned_duration_min", "actual_distance_km", "gross_revenue", "created_at", "updated_at", "created_by"],
  service_loads: ["id", "company_id", "service_id", "load_number", "description", "weight_kg", "volume_m3", "pieces", "status", "reference", "created_at", "created_by"],
  service_stops: ["id", "company_id", "service_id", "kind", "sequence", "name", "address", "latitude", "longitude", "planned_arrival", "actual_arrival", "planned_departure", "actual_departure", "status", "notes"],
  service_assignments: ["id", "company_id", "service_id", "vehicle_id", "driver_id", "assigned_at", "unassigned_at", "assigned_by", "reason"],
  service_status_history: ["id", "company_id", "service_id", "from_status", "to_status", "changed_at", "changed_by", "notes"],
  route_plans: ["id", "company_id", "service_id", "distance_km", "duration_min", "polyline", "created_at"],
  route_points: ["id", "route_plan_id", "sequence", "latitude", "longitude"],
  route_deviation_events: ["id", "company_id", "service_id", "vehicle_id", "latitude", "longitude", "deviation_km", "recorded_at"],
  gps_positions: ["id", "company_id", "vehicle_id", "gps_device_id", "latitude", "longitude", "speed", "heading", "altitude", "accuracy", "recorded_at"],
  geofence_events: ["id", "company_id", "geofence_id", "vehicle_id", "kind", "latitude", "longitude", "recorded_at", "dwell_seconds"],
  speed_alerts: ["id", "company_id", "vehicle_id", "driver_id", "speed", "limit_kmh", "latitude", "longitude", "recorded_at"],
  inspections: ["id", "company_id", "vehicle_id", "driver_id", "user_id", "inspected_at", "status", "observations", "photos", "signed_by", "signed_at", "completed_at", "blocks_vehicle"],
  inspection_items: ["id", "inspection_id", "category", "status", "notes"],
  delivery_evidence: ["id", "company_id", "service_id", "receiver_name", "receiver_document", "signature", "photo_url", "comments", "latitude", "longitude", "captured_at", "captured_by"],
  documents: ["id", "company_id", "owner_type", "owner_id", "document_type", "title", "file_url", "storage_key", "issued_at", "expires_at", "status", "metadata", "created_at", "created_by"],
  maintenance_plans: ["id", "company_id", "vehicle_id", "kind", "title", "interval_km", "interval_days", "interval_hours", "last_odometer", "last_service_at", "next_due_at", "next_due_km", "status", "created_at"],
  maintenance_orders: ["id", "company_id", "vehicle_id", "plan_id", "kind", "title", "vendor", "labor_cost", "parts_cost", "total_cost", "odometer_km", "opened_at", "closed_at", "status", "observations", "created_by"],
  maintenance_items: ["id", "order_id", "description", "quantity", "unit_cost", "kind"],
  fuel_transactions: ["id", "company_id", "vehicle_id", "driver_id", "service_id", "liters", "price_per_liter", "total", "odometer", "station", "fuel_type", "transaction_at", "receipt", "created_by"],
  service_cost_lines: ["id", "company_id", "service_id", "kind", "amount", "notes", "created_at"],
  trips: ["id", "company_id", "service_id", "trip_number", "vehicle_id", "driver_id", "status", "planned_start_at", "actual_start_at", "actual_end_at", "notes", "created_at", "updated_at", "created_by"],
  trip_stops: ["id", "company_id", "trip_id", "service_stop_id", "sequence", "status", "planned_arrival", "actual_arrival", "actual_departure", "notes"],
  alerts: ["id", "company_id", "type", "severity", "status", "title", "body", "entity_type", "entity_id", "vehicle_id", "driver_id", "service_id", "assigned_to", "created_at", "acknowledged_at", "resolved_at"],
  incidents: ["id", "company_id", "service_id", "vehicle_id", "driver_id", "type", "severity", "status", "title", "description", "occurred_at", "resolved_at", "created_at", "created_by", "resolved_by"],
  tracking_links: ["id", "company_id", "token", "token_hash", "vehicle_id", "created_by", "expires_at", "revoked_at", "status", "hide_driver_name", "hide_license_plate"],
  notifications: ["id", "company_id", "user_id", "title", "body", "kind", "entity_id", "status", "read_at", "email_queued", "audience_role"],
  personnel: ["id", "company_id", "full_name", "email", "phone", "position", "role", "status", "user_id", "created_by"],
};

export type BackupDump = { tables: Record<string, Record<string, unknown>[]> };

type TableName = (typeof RESTORE_TABLE_ORDER)[number];
const NO_COMPANY: readonly TableName[] = ["inspection_items", "route_points", "maintenance_items"];

function requireString(record: Record<string, unknown>, key: string, table: string, index: number): string {
  const value = record[key];
  if (typeof value !== "string" || !value) throw new Error(`Fila incompatible en ${table}#${index}`);
  return value;
}

export function validateBackupPayload(raw: unknown): BackupDump {
  if (!raw || typeof raw !== "object") throw new Error("Respaldo incompatible");
  const tables = (raw as { tables?: unknown }).tables;
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) throw new Error("Respaldo incompatible");
  const source = tables as Record<string, unknown>;
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const name of RESTORE_TABLE_ORDER) {
    const list = source[name];
    if (list == null) { out[name] = []; continue; }
    if (!Array.isArray(list)) throw new Error(`Tabla ${name} incompatible`);
    out[name] = list.map((row, i) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Fila incompatible en ${name}#${i}`);
      const rec = row as Record<string, unknown>;
      requireString(rec, "id", name, i);
      return rec;
    });
  }
  return { tables: out };
}

function ids(dump: BackupDump, table: TableName): Set<string> {
  return new Set((dump.tables[table] ?? []).map((r) => String(r.id)).filter(Boolean));
}

function assertRef(dump: BackupDump, table: TableName, field: string, parentTable: TableName): void {
  const parentIds = ids(dump, parentTable);
  for (const [i, row] of (dump.tables[table] ?? []).entries()) {
    const value = row[field];
    if (value != null && value !== "" && !parentIds.has(String(value))) {
      throw new Error(`Referencia inválida ${table}#${i}.${field}`);
    }
  }
}

export function validateBackupRelations(dump: BackupDump): void {
  assertRef(dump, "fleets", "client_id", "clients");
  assertRef(dump, "vehicles", "client_id", "clients");
  assertRef(dump, "vehicles", "fleet_id", "fleets");
  assertRef(dump, "vehicles", "current_driver_id", "drivers");
  assertRef(dump, "gps_devices", "vehicle_id", "vehicles");
  assertRef(dump, "geofences", "client_id", "clients");
  assertRef(dump, "geofences", "fleet_id", "fleets");
  assertRef(dump, "services", "client_id", "clients");
  assertRef(dump, "services", "vehicle_id", "vehicles");
  assertRef(dump, "services", "driver_id", "drivers");
  assertRef(dump, "service_loads", "service_id", "services");
  assertRef(dump, "service_stops", "service_id", "services");
  assertRef(dump, "service_assignments", "service_id", "services");
  assertRef(dump, "service_assignments", "vehicle_id", "vehicles");
  assertRef(dump, "service_assignments", "driver_id", "drivers");
  assertRef(dump, "service_status_history", "service_id", "services");
  assertRef(dump, "route_plans", "service_id", "services");
  assertRef(dump, "route_points", "route_plan_id", "route_plans");
  assertRef(dump, "route_deviation_events", "service_id", "services");
  assertRef(dump, "route_deviation_events", "vehicle_id", "vehicles");
  assertRef(dump, "gps_positions", "vehicle_id", "vehicles");
  assertRef(dump, "gps_positions", "gps_device_id", "gps_devices");
  assertRef(dump, "geofence_events", "geofence_id", "geofences");
  assertRef(dump, "geofence_events", "vehicle_id", "vehicles");
  assertRef(dump, "speed_alerts", "vehicle_id", "vehicles");
  assertRef(dump, "speed_alerts", "driver_id", "drivers");
  assertRef(dump, "inspections", "vehicle_id", "vehicles");
  assertRef(dump, "inspections", "driver_id", "drivers");
  assertRef(dump, "inspection_items", "inspection_id", "inspections");
  assertRef(dump, "delivery_evidence", "service_id", "services");
  assertRef(dump, "maintenance_plans", "vehicle_id", "vehicles");
  assertRef(dump, "maintenance_orders", "vehicle_id", "vehicles");
  assertRef(dump, "maintenance_orders", "plan_id", "maintenance_plans");
  assertRef(dump, "maintenance_items", "order_id", "maintenance_orders");
  assertRef(dump, "fuel_transactions", "vehicle_id", "vehicles");
  assertRef(dump, "fuel_transactions", "driver_id", "drivers");
  assertRef(dump, "fuel_transactions", "service_id", "services");
  assertRef(dump, "service_cost_lines", "service_id", "services");
  assertRef(dump, "trips", "service_id", "services");
  assertRef(dump, "trips", "vehicle_id", "vehicles");
  assertRef(dump, "trips", "driver_id", "drivers");
  assertRef(dump, "trip_stops", "trip_id", "trips");
  assertRef(dump, "trip_stops", "service_stop_id", "service_stops");
  assertRef(dump, "incidents", "service_id", "services");
  assertRef(dump, "incidents", "vehicle_id", "vehicles");
  assertRef(dump, "incidents", "driver_id", "drivers");
  assertRef(dump, "alerts", "vehicle_id", "vehicles");
  assertRef(dump, "alerts", "driver_id", "drivers");
  assertRef(dump, "alerts", "service_id", "services");
  assertRef(dump, "tracking_links", "vehicle_id", "vehicles");
}

export function projectRestoreRow(table: TableName, row: Record<string, unknown>, companyId: string): Record<string, unknown> {
  const columns = TABLE_COLUMNS[table];
  const copy: Record<string, unknown> = {};
  for (const col of columns) if (col in row) copy[col] = row[col];
  if (!NO_COMPANY.includes(table)) copy.company_id = companyId;
  if ("ingest_token" in copy) copy.ingest_token = "";
  if ("token" in copy) copy.token = "";
  if (typeof copy.id !== "string" || !copy.id) throw new Error(`Fila incompatible en ${table}`);
  return copy;
}

export async function applyRestore(tx: Tx, companyId: string, dump: BackupDump): Promise<void> {
  const { insert } = await import("../db");
  validateBackupRelations(dump);

  for (const table of RESTORE_DELETE_ORDER) {
    if (NO_COMPANY.includes(table)) {
      if (table === "inspection_items") {
        await tx.query("delete from inspection_items where inspection_id in (select id from inspections where company_id = $1)", [companyId]);
      } else if (table === "route_points") {
        await tx.query("delete from route_points where route_plan_id in (select id from route_plans where company_id = $1)", [companyId]);
      } else {
        await tx.query("delete from maintenance_items where order_id in (select id from maintenance_orders where company_id = $1)", [companyId]);
      }
    } else {
      await tx.query(`delete from ${table} where company_id = $1`, [companyId]);
    }
  }

  for (const table of RESTORE_TABLE_ORDER) {
    for (const rec of dump.tables[table] ?? []) await insert(tx, table, projectRestoreRow(table, rec, companyId));
  }

  // Verificación DENTRO de la transacción: si algún conteo no coincide, se revierte TODO.
  for (const table of RESTORE_TABLE_ORDER) {
    const expected = (dump.tables[table] ?? []).length;
    const count = table === "inspection_items"
      ? "(select count(*) from inspection_items where inspection_id in (select id from inspections where company_id = $1))"
      : table === "route_points"
        ? "(select count(*) from route_points where route_plan_id in (select id from route_plans where company_id = $1))"
        : table === "maintenance_items"
          ? "(select count(*) from maintenance_items where order_id in (select id from maintenance_orders where company_id = $1))"
          : `(select count(*) from ${table} where company_id = $1)`;
    tx.assert(`${count} = $2`, [companyId, expected], `Integridad de restauración fallida en ${table}`);
  }
}
