import type { Profile, Role, Workspace } from "../types.ts";
import { grantsFor, type Resource, type Scope } from "./permissions.ts";

export type AccessScope = {
  companyId: string;
  userId: string;
  role: Role;
  forcedClientId: string | null;
  forcedDriverId: string | null;
  allowedClientIds: string[] | null;
  allowedFleetIds: string[] | null;
  allowedVehicleIds: string[] | null;
  allowedDriverIds: string[] | null;
  membershipStatus: string;
  /** "resource.action" concedidos al rol (ver security/permissions.ts). */
  permissions: string[];
  scopes: Partial<Record<Resource, Scope>>;
};

export type FilterRequest = {
  clientId?: string | null;
  fleetId?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
};

export type ConstrainedFilter = {
  clientId: string | null;
  fleetId: string | null;
  vehicleId: string | null;
  driverId: string | null;
};

const EMPTY_IDS: string[] = [];

export function allowsId(allowed: string[] | null, id: string | null | undefined): boolean {
  if (!id) return true;
  if (allowed === null) return true;
  return allowed.includes(id);
}

export function buildAccessScope(
  profile: Profile,
  rel: {
    vehicleIds?: string[];
    fleetIds?: string[];
    driverIds?: string[];
    clientIds?: string[];
  } = {},
): AccessScope {
  const grants = grantsFor(profile.role);
  const common = { membershipStatus: profile.status, permissions: grants.permissions, scopes: grants.scopes };

  if (profile.role === "CLIENTE") {
    const clientId = profile.client_id;
    return {
      companyId: profile.company_id,
      userId: profile.user_id,
      role: profile.role,
      forcedClientId: clientId,
      forcedDriverId: null,
      allowedClientIds: clientId ? [clientId] : EMPTY_IDS,
      allowedFleetIds: rel.fleetIds ?? EMPTY_IDS,
      allowedVehicleIds: rel.vehicleIds ?? EMPTY_IDS,
      allowedDriverIds: rel.driverIds ?? EMPTY_IDS,
      ...common,
    };
  }

  if (profile.role === "CONDUCTOR") {
    const driverId = profile.driver_id;
    return {
      companyId: profile.company_id,
      userId: profile.user_id,
      role: profile.role,
      forcedClientId: null,
      forcedDriverId: driverId,
      allowedClientIds: rel.clientIds ?? EMPTY_IDS,
      allowedFleetIds: rel.fleetIds ?? EMPTY_IDS,
      allowedVehicleIds: rel.vehicleIds ?? EMPTY_IDS,
      allowedDriverIds: driverId ? [driverId] : EMPTY_IDS,
      ...common,
    };
  }

  return {
    companyId: profile.company_id,
    userId: profile.user_id,
    role: profile.role,
    forcedClientId: null,
    forcedDriverId: null,
    allowedClientIds: null,
    allowedFleetIds: null,
    allowedVehicleIds: null,
    allowedDriverIds: null,
    ...common,
  };
}

/** Canonical P0 access layer: company and allowed ids always come from the session profile. */
export async function getAccessScope(profile: Profile): Promise<AccessScope> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  if (profile.role === "CLIENTE") {
    if (!profile.client_id) return buildAccessScope(profile);
    // CLIENTE → SERVICIO → VEHÍCULO ASIGNADO (no "todos los vehículos del cliente").
    const vehicles = await sql<{ id: string; fleet_id: string | null; current_driver_id: string | null }>`
      select distinct v.id, v.fleet_id, v.current_driver_id from vehicles v
      join services s on s.vehicle_id = v.id and s.company_id = v.company_id
      where v.company_id = ${profile.company_id} and s.client_id = ${profile.client_id} and s.status <> 'CANCELLED'
    `;
    const fleets = await sql<{ id: string }>`
      select id from fleets where company_id = ${profile.company_id} and client_id = ${profile.client_id}
    `;
    const driverIds = [...new Set(vehicles.map((v) => v.current_driver_id).filter((x): x is string => Boolean(x)))];
    return buildAccessScope(profile, {
      vehicleIds: vehicles.map((v) => v.id),
      fleetIds: fleets.map((f) => f.id),
      driverIds,
      clientIds: [profile.client_id],
    });
  }
  if (profile.role === "CONDUCTOR") {
    if (!profile.driver_id) return buildAccessScope(profile);
    const vehicles = await sql<{ id: string; client_id: string | null; fleet_id: string | null }>`
      select id, client_id, fleet_id from vehicles
      where company_id = ${profile.company_id} and current_driver_id = ${profile.driver_id}
    `;
    return buildAccessScope(profile, {
      vehicleIds: vehicles.map((v) => v.id),
      fleetIds: [...new Set(vehicles.map((v) => v.fleet_id).filter((x): x is string => Boolean(x)))],
      clientIds: [...new Set(vehicles.map((v) => v.client_id).filter((x): x is string => Boolean(x)))],
      driverIds: [profile.driver_id],
    });
  }
  return buildAccessScope(profile);
}

export async function resolveAccessScope(ws: Workspace): Promise<AccessScope> {
  return getAccessScope(ws.profile);
}

export function sanitizeFilterRequest(raw: unknown): FilterRequest {
  if (!raw || typeof raw !== "object") {
    return { clientId: null, fleetId: null, vehicleId: null, driverId: null };
  }
  const rec = raw as Record<string, unknown>;
  const pick = (camel: string, snake: string) => {
    const value = rec[camel] ?? rec[snake];
    return typeof value === "string" && value.trim() ? value : null;
  };
  return {
    clientId: pick("clientId", "client_id"),
    fleetId: pick("fleetId", "fleet_id"),
    vehicleId: pick("vehicleId", "vehicle_id"),
    driverId: pick("driverId", "driver_id"),
  };
}

export function constrainFilters(scope: AccessScope, req: FilterRequest = {}): ConstrainedFilter {
  const safe = sanitizeFilterRequest(req);
  let clientId = safe.clientId ?? null;
  if (scope.forcedClientId) {
    if (clientId && clientId !== scope.forcedClientId) throw new Error("No autorizado");
    clientId = scope.forcedClientId;
  } else if (clientId && !allowsId(scope.allowedClientIds, clientId)) {
    throw new Error("No autorizado");
  }

  let driverId = safe.driverId ?? null;
  if (scope.forcedDriverId) {
    if (driverId && driverId !== scope.forcedDriverId) throw new Error("No autorizado");
    driverId = scope.forcedDriverId;
  } else if (driverId && !allowsId(scope.allowedDriverIds, driverId)) {
    throw new Error("No autorizado");
  }

  const fleetId = safe.fleetId ?? null;
  if (fleetId && !allowsId(scope.allowedFleetIds, fleetId)) throw new Error("No autorizado");

  const vehicleId = safe.vehicleId ?? null;
  if (vehicleId && !allowsId(scope.allowedVehicleIds, vehicleId)) throw new Error("No autorizado");

  return { clientId, fleetId, vehicleId, driverId };
}

export function canSeeScopedVehicle(
  scope: AccessScope,
  vehicle: { id?: string; client_id: string | null; current_driver_id: string | null; fleet_id?: string | null },
): boolean {
  if (scope.forcedClientId) {
    return vehicle.client_id === scope.forcedClientId && (!vehicle.id || allowsId(scope.allowedVehicleIds, vehicle.id));
  }
  if (scope.forcedDriverId) return vehicle.current_driver_id === scope.forcedDriverId;
  if (vehicle.id && !allowsId(scope.allowedVehicleIds, vehicle.id)) return false;
  return true;
}

export function serviceVisible(
  scope: AccessScope,
  row: { client_id: string | null; vehicle_id: string | null; driver_id: string | null },
): boolean {
  if (scope.forcedClientId && row.client_id !== scope.forcedClientId) return false;
  if (scope.forcedDriverId && row.driver_id !== scope.forcedDriverId) return false;
  if (scope.allowedClientIds && row.client_id && !scope.allowedClientIds.includes(row.client_id)) return false;
  if (scope.allowedVehicleIds && row.vehicle_id && !scope.allowedVehicleIds.includes(row.vehicle_id)) return false;
  if (scope.allowedDriverIds && row.driver_id && !scope.allowedDriverIds.includes(row.driver_id)) return false;
  return true;
}

export function geofenceVisible(
  scope: AccessScope,
  fence: { client_id: string | null; fleet_id?: string | null },
): boolean {
  if (scope.forcedClientId) return fence.client_id === scope.forcedClientId;
  if (scope.forcedDriverId) {
    if (fence.client_id && !allowsId(scope.allowedClientIds, fence.client_id)) return false;
    if (fence.fleet_id && !allowsId(scope.allowedFleetIds, fence.fleet_id)) return false;
    return Boolean(fence.client_id || fence.fleet_id);
  }
  if (scope.allowedClientIds) {
    if (fence.client_id) return scope.allowedClientIds.includes(fence.client_id);
    if (fence.fleet_id) return allowsId(scope.allowedFleetIds, fence.fleet_id);
    return false;
  }
  if (fence.fleet_id && !allowsId(scope.allowedFleetIds, fence.fleet_id)) return false;
  return true;
}

export function notificationVisible(
  scope: AccessScope,
  row: { user_id?: string | null; audience_role?: string | null },
): boolean {
  if (row.user_id) return row.user_id === scope.userId;
  if (row.audience_role) return row.audience_role === scope.role;
  // Untargeted company notices are internal by default. Externalized notices
  // must name their audience explicitly (e.g. CLIENTE) instead of relying on a
  // broad company-wide bucket.
  return scope.role !== "CLIENTE" && scope.role !== "CONDUCTOR";
}

export function filterByAllowed<T>(allowed: string[] | null, rows: T[], idOf: (row: T) => string): T[] {
  if (!allowed) return rows;
  const set = new Set(allowed);
  return rows.filter((row) => set.has(idOf(row)));
}
