import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import { haversineKm, parseRoute } from "@/lib/geo";
import { authorize, perm } from "./security/authorize";
import { clientVehicleView, getResourceScope } from "./security/permissions";
import { scopeOf } from "./security/permissions";
import { insert, nid, writeAudit } from "./db";
import { ingestFix } from "./gps/engine";
import { externalProvider, smartphoneProvider } from "./gps/provider";
import { gpsIngestSchema, assertFixTime, isCorruptFix, rateLimitAllow } from "./gps/validate";
import { eventKey } from "./gps/odometer";
import { ensureJobsStarted } from "./jobs/runner";
import {
  driverActivityReport,
  inspectionReport,
  mileageReport,
  speedReport,
  utilizationReport,
  zoneReport,
  servicePerformanceReport,
  profitabilityReport,
  type ReportFilter,
} from "./reports";
import { downsamplePositions } from "./gps/history";
import { constrainFilters, getAccessScope, canSeeScopedVehicle, notificationVisible, geofenceVisible, filterByAllowed, sanitizeFilterRequest } from "./security/scope";
import { assertOwned } from "./security/ownership";
import { applyRestore, validateBackupPayload } from "./security/restore";
import { hashSecret, newSecret, previewSecret, secretsEqual, tokensEqualPlain } from "./security/tokens";
import type {
  BackupRow,
  Client,
  Driver,
  Fleet,
  FleetUnit,
  Geofence,
  GeofenceEvent,
  GpsDevice,
  GpsPosition,
  Inspection,
  InspectionItem,
  NotificationRow,
  Personnel,
  TrackingLink,
  Vehicle,
} from "./types";
import { getWorkspace } from "./workspace";

function forbid(): never {
  throw new Error("No autorizado");
}

function dayRange(from?: string | null, to?: string | null) {
  const start = from ? new Date(from) : new Date();
  if (!from) start.setHours(0, 0, 0, 0);
  const end = to ? new Date(to) : new Date();
  if (!to) end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

async function scoped(userId: string) {
  const ws = await getWorkspace(userId);
  const scope = await getAccessScope(ws.profile);
  const sql = await getSql();
  return { ws, scope, sql };
}

export const getBootstrap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ws = await getWorkspace(context.userId);
    ensureJobsStarted();
    return ws;
  });

export const getDashboard = createServerFn({ method: "GET" })
  .inputValidator((d: { clientId?: string | null; fleetId?: string | null; from?: string; to?: string } | undefined) => d ?? {})
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "dashboard.read");
    const cid = ws.company.id;
    const { from, to } = dayRange(data.from, data.to);
    const filter = constrainFilters(scope, sanitizeFilterRequest(data));

    const fleetAll = await sql<FleetUnit>`
      select v.*, d.name as driver_name, c.trade_name as client_name, f.name as fleet_name,
             g.provider as gps_provider, g.device_imei as gps_imei
      from vehicles v
      left join drivers d on d.id = v.current_driver_id
      left join clients c on c.id = v.client_id
      left join fleets f on f.id = v.fleet_id
      left join gps_devices g on g.vehicle_id = v.id
      where v.company_id = ${cid}
      order by v.economic_number
    `;
    const fleet = fleetAll.filter((v) => {
      if (!canSeeScopedVehicle(scope, v)) return false;
      if (filter.clientId && v.client_id !== filter.clientId) return false;
      if (filter.fleetId && v.fleet_id !== filter.fleetId) return false;
      if (filter.driverId && v.current_driver_id !== filter.driverId) return false;
      return true;
    });
    const visibleIds = new Set(fleet.map((v) => v.id));
    const kmRows = await mileageReport(sql, cid, {
      from,
      to,
      clientId: filter.clientId,
      fleetId: filter.fleetId,
      vehicleId: filter.vehicleId,
      driverId: filter.driverId,
    });
    const km = kmRows.reduce((s, r) => s + r.km, 0);
    const alerts = await sql<{ n: number; vehicle_id: string }>`
      select count(*)::int as n, vehicle_id from speed_alerts
      where company_id = ${cid} and recorded_at >= ${from} and recorded_at <= ${to}
      group by vehicle_id
    `;
    const inspections = await sql<{ n: number; fail: number; vehicle_id: string }>`
      select count(*)::int as n,
             sum(case when status = 'FAIL' then 1 else 0 end)::int as fail,
             vehicle_id
      from inspections
      where company_id = ${cid} and inspected_at >= ${from} and inspected_at <= ${to}
      group by vehicle_id
    `;
    const geo = await sql<{ n: number; vehicle_id: string }>`
      select count(*)::int as n, vehicle_id from geofence_events
      where company_id = ${cid} and recorded_at >= ${from} and recorded_at <= ${to}
      group by vehicle_id
    `;
    const kpis = {
      moving: fleet.filter((v) => v.motion_state === "MOVING").length,
      stopped: fleet.filter((v) => v.motion_state === "STOPPED").length,
      offline: fleet.filter((v) => v.motion_state === "OFFLINE").length,
      km: Math.round(km * 10) / 10,
      alerts: alerts.filter((a) => visibleIds.has(a.vehicle_id)).reduce((s, a) => s + a.n, 0),
      inspections: inspections.filter((a) => visibleIds.has(a.vehicle_id)).reduce((s, a) => s + a.n, 0),
      geo_events: geo.filter((a) => visibleIds.has(a.vehicle_id)).reduce((s, a) => s + a.n, 0),
      fail_insp: inspections.filter((a) => visibleIds.has(a.vehicle_id)).reduce((s, a) => s + a.fail, 0),
      utilization: fleet.length
        ? Math.round((fleet.filter((v) => v.motion_state === "MOVING").length / fleet.length) * 1000) / 10
        : 0,
    };
    const notifAll = await sql<NotificationRow & { read_row: string | null }>`
      select n.id, n.title, n.body, n.kind, n.entity_id, n.status, n.read_at, n.created_at, n.email_queued,
             n.user_id, n.audience_role, r.user_id as read_row
      from notifications n
      left join notification_reads r on r.notification_id = n.id and r.user_id = ${context.userId}
      where n.company_id = ${cid} order by n.created_at desc limit 40
    `;
    const notifications = notifAll
      .filter((n) => notificationVisible(scope, n))
      .map((n) => ({
        ...n,
        status: (n.read_row || (n.user_id === context.userId && n.status === "READ") ? "READ" : "UNREAD") as NotificationRow["status"],
      }))
      .slice(0, 10);
    const geofences = (await sql<Geofence>`select * from geofences where company_id = ${cid} and status = 'ACTIVE'`).filter(
      (g) => geofenceVisible(scope, g),
    );
    const clients = await sql<Client>`select * from clients where company_id = ${cid} order by trade_name`;
    const fleets = await sql<Fleet>`select * from fleets where company_id = ${cid} order by name`;

    return {
      workspace: ws,
      kpis,
      fleet,
      notifications,
      geofences,
      clients: filterByAllowed(scope.allowedClientIds, clients, (c) => c.id),
      fleets: filterByAllowed(scope.allowedFleetIds, fleets, (f) => f.id),
    };
  });

export const getFleetLive = createServerFn({ method: "GET" })
  .inputValidator((d: { clientId?: string | null; fleetId?: string | null; vehicleId?: string | null; motion?: string | null } | undefined) => d ?? {})
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "vehicles.read");
    const filter = constrainFilters(scope, sanitizeFilterRequest(data));
    let rows = await sql<FleetUnit>`
      select v.*, d.name as driver_name, c.trade_name as client_name, f.name as fleet_name,
             g.provider as gps_provider, g.device_imei as gps_imei
      from vehicles v
      left join drivers d on d.id = v.current_driver_id
      left join clients c on c.id = v.client_id
      left join fleets f on f.id = v.fleet_id
      left join gps_devices g on g.vehicle_id = v.id
      where v.company_id = ${ws.company.id}
      order by v.economic_number
    `;
    rows = rows.filter((r) => canSeeScopedVehicle(scope, r));
    if (filter.clientId) rows = rows.filter((r) => r.client_id === filter.clientId);
    if (filter.fleetId) rows = rows.filter((r) => r.fleet_id === filter.fleetId);
    if (filter.vehicleId) rows = rows.filter((r) => r.id === filter.vehicleId);
    if (filter.driverId) rows = rows.filter((r) => r.current_driver_id === filter.driverId);
    if (data.motion) rows = rows.filter((r) => r.motion_state === data.motion);
    if (getResourceScope(scope, "vehicles") === "LIMITED_CLIENT") {
      // Cliente: SOLO la vista limitada (sin placas, VIN, odómetro, conductor, IMEI…). ETA del servicio activo.
      const etas = await sql<{ vehicle_id: string; eta_at: string | null }>`
        select vehicle_id, min(eta_at) as eta_at from services
        where company_id = ${ws.company.id} and client_id = ${scope.forcedClientId} and vehicle_id is not null
          and status not in ('DELIVERED','CANCELLED','CLOSED') group by vehicle_id`;
      const etaBy = new Map(etas.map((e) => [e.vehicle_id, e.eta_at]));
      rows = rows.map((r) => ({ ...(clientVehicleView(r as never, etaBy.get(r.id) ?? null) as object), company_id: r.company_id, license_plate: "", vin: "", year: null, vehicle_type: "", client_id: r.client_id, fleet_id: null, current_driver_id: null, last_speed: 0, last_heading: 0, speed_limit_kmh: 0, odometer_km: 0, driver_name: null, client_name: null, fleet_name: null, gps_provider: null, gps_imei: null }) as unknown as FleetUnit);
    }
    const geofences = (await sql<Geofence>`select * from geofences where company_id = ${ws.company.id} and status = 'ACTIVE'`).filter(
      (g) => geofenceVisible(scope, g),
    );
    return { units: rows, geofences };
  });

export const listCatalog = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "dashboard.read");
    const cid = ws.company.id;
    const [clients, fleets, drivers, vehicles] = await Promise.all([
      sql<Client>`select * from clients where company_id = ${cid} order by trade_name`,
      sql<Fleet>`select f.*, c.trade_name as client_name,
        (select count(*)::int from vehicles v where v.fleet_id = f.id) as vehicle_count
        from fleets f left join clients c on c.id = f.client_id
        where f.company_id = ${cid} order by f.name`,
      sql<Driver>`select * from drivers where company_id = ${cid} order by name`,
      sql<Vehicle>`select * from vehicles where company_id = ${cid} order by economic_number`,
    ]);
    return {
      workspace: ws,
      clients: filterByAllowed(scope.allowedClientIds, clients, (c) => c.id),
      fleets: filterByAllowed(scope.allowedFleetIds, fleets, (f) => f.id),
      drivers: filterByAllowed(scope.allowedDriverIds, drivers, (d) => d.id),
      vehicles: vehicles.filter((v) => canSeeScopedVehicle(scope, v)),
    };
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "clients.read");
    const rows = await sql<Client>`select * from clients where company_id = ${ws.company.id} order by trade_name`;
    return filterByAllowed(scope.allowedClientIds, rows, (c) => c.id);
  });

export const upsertClient = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<Client> & { legal_name: string; trade_name: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, perm("clients", (data as { id?: unknown }).id));
    const sql = await getSql();
    const id = data.id || nid();
    if (data.id) await assertOwned(sql, "clients", data.id, ws.company.id);
    // Escritura + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      if (data.id) {
        await tx`
          update clients set legal_name = ${data.legal_name}, trade_name = ${data.trade_name},
            rfc = ${data.rfc ?? ""}, contact_name = ${data.contact_name ?? ""}, phone = ${data.phone ?? ""},
            email = ${data.email ?? ""}, address = ${data.address ?? ""}, lat = ${data.lat ?? null},
            lng = ${data.lng ?? null}, status = ${data.status ?? "ACTIVE"}, updated_at = now(), updated_by = ${context.userId}
          where id = ${id} and company_id = ${ws.company.id}
        `;
      } else {
        await insert(tx, "clients", {
          id, company_id: ws.company.id, legal_name: data.legal_name, trade_name: data.trade_name,
          rfc: data.rfc ?? "", contact_name: data.contact_name ?? "", phone: data.phone ?? "",
          email: data.email ?? "", address: data.address ?? "", lat: data.lat ?? null, lng: data.lng ?? null,
          status: data.status ?? "ACTIVE", created_by: context.userId,
        });
      }
      await writeAudit(ws.company.id, context.userId, data.id ? "UPDATE" : "CREATE", "CLIENT", id, data.trade_name, tx);
    });
    return { id };
  });

export const listFleets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "fleets.read");
    const rows = await sql<Fleet>`
      select f.*, c.trade_name as client_name,
        (select count(*)::int from vehicles v where v.fleet_id = f.id) as vehicle_count
      from fleets f left join clients c on c.id = f.client_id
      where f.company_id = ${ws.company.id}
      order by f.name
    `;
    return filterByAllowed(scope.allowedFleetIds, rows, (f) => f.id);
  });

export const upsertFleet = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<Fleet> & { name: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, perm("fleets", (data as { id?: unknown }).id));
    const sql = await getSql();
    await assertOwned(sql, "clients", data.client_id ?? null, ws.company.id);
    const id = data.id || nid();
    if (data.id) await assertOwned(sql, "fleets", data.id, ws.company.id);
    // Escritura + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      if (data.id) {
        await tx`
          update fleets set name = ${data.name}, description = ${data.description ?? ""},
            client_id = ${data.client_id ?? null}, status = ${data.status ?? "ACTIVE"},
            updated_at = now(), updated_by = ${context.userId}
          where id = ${id} and company_id = ${ws.company.id}
        `;
      } else {
        await insert(tx, "fleets", {
          id, company_id: ws.company.id, name: data.name, description: data.description ?? "",
          client_id: data.client_id ?? null, status: data.status ?? "ACTIVE", created_by: context.userId,
        });
      }
      await writeAudit(ws.company.id, context.userId, data.id ? "UPDATE" : "CREATE", "FLEET", id, data.name, tx);
    });
    return { id };
  });

export const assignVehicleFleet = createServerFn({ method: "POST" })
  .inputValidator((d: { vehicleId: string; fleetId: string | null }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, "fleets.update");
    const sql = await getSql();
    await assertOwned(sql, "vehicles", data.vehicleId, ws.company.id);
    await assertOwned(sql, "fleets", data.fleetId, ws.company.id);
    await withTransaction(async (tx) => {
      await tx`update vehicles set fleet_id = ${data.fleetId}, updated_at = now()
        where id = ${data.vehicleId} and company_id = ${ws.company.id}`;
      await writeAudit(ws.company.id, context.userId, "ASSIGN", "VEHICLE", data.vehicleId, `fleet=${data.fleetId}`, tx);
    });
  });

export const listDrivers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "drivers.read");
    const rows = await sql<Driver>`select * from drivers where company_id = ${ws.company.id} order by name`;
    return filterByAllowed(scope.allowedDriverIds, rows, (d) => d.id);
  });

export const upsertDriver = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<Driver> & { name: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, perm("drivers", (data as { id?: unknown }).id));
    const sql = await getSql();
    const id = data.id || nid();
    // Escritura + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      if (data.id) {
        await tx`
          update drivers set name = ${data.name}, phone = ${data.phone ?? ""}, email = ${data.email ?? ""},
            license_number = ${data.license_number ?? ""}, license_type = ${data.license_type ?? "E"},
            license_expires_at = ${data.license_expires_at ?? null}, status = ${data.status ?? "AVAILABLE"},
            emergency_contact = ${data.emergency_contact ?? ""}, emergency_phone = ${data.emergency_phone ?? ""},
            updated_at = now(), updated_by = ${context.userId}
          where id = ${id} and company_id = ${ws.company.id}
        `;
      } else {
        await insert(tx, "drivers", {
          id, company_id: ws.company.id, name: data.name, phone: data.phone ?? "", email: data.email ?? "",
          license_number: data.license_number ?? "", license_type: data.license_type ?? "E",
          license_expires_at: data.license_expires_at ?? null, status: data.status ?? "AVAILABLE",
          emergency_contact: data.emergency_contact ?? "", emergency_phone: data.emergency_phone ?? "",
          created_by: context.userId,
        });
      }
      await writeAudit(ws.company.id, context.userId, data.id ? "UPDATE" : "CREATE", "DRIVER", id, data.name, tx);
    });
    return { id };
  });

export const listVehicles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "vehicles.read");
    let rows = await sql<FleetUnit>`
      select v.*, d.name as driver_name, c.trade_name as client_name, f.name as fleet_name,
             g.provider as gps_provider, g.device_imei as gps_imei
      from vehicles v
      left join drivers d on d.id = v.current_driver_id
      left join clients c on c.id = v.client_id
      left join fleets f on f.id = v.fleet_id
      left join gps_devices g on g.vehicle_id = v.id
      where v.company_id = ${ws.company.id}
      order by v.economic_number
    `;
    rows = rows.filter((r) => canSeeScopedVehicle(scope, r));
    if (getResourceScope(scope, "vehicles") === "LIMITED_CLIENT") {
      // Cliente: SOLO la vista limitada (sin placas, VIN, odómetro, conductor, IMEI…). ETA del servicio activo.
      const etas = await sql<{ vehicle_id: string; eta_at: string | null }>`
        select vehicle_id, min(eta_at) as eta_at from services
        where company_id = ${ws.company.id} and client_id = ${scope.forcedClientId} and vehicle_id is not null
          and status not in ('DELIVERED','CANCELLED','CLOSED') group by vehicle_id`;
      const etaBy = new Map(etas.map((e) => [e.vehicle_id, e.eta_at]));
      rows = rows.map((r) => ({ ...(clientVehicleView(r as never, etaBy.get(r.id) ?? null) as object), company_id: r.company_id, license_plate: "", vin: "", year: null, vehicle_type: "", client_id: r.client_id, fleet_id: null, current_driver_id: null, last_speed: 0, last_heading: 0, speed_limit_kmh: 0, odometer_km: 0, driver_name: null, client_name: null, fleet_name: null, gps_provider: null, gps_imei: null }) as unknown as FleetUnit);
    }
    return rows;
  });

export const upsertVehicle = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<Vehicle> & { economic_number: string; license_plate: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, perm("vehicles", (data as { id?: unknown }).id));
    const sql = await getSql();
    await assertOwned(sql, "clients", data.client_id ?? null, ws.company.id);
    await assertOwned(sql, "fleets", data.fleet_id ?? null, ws.company.id);
    await assertOwned(sql, "drivers", data.current_driver_id ?? null, ws.company.id);
    const id = data.id || nid();
    if (data.id) await assertOwned(sql, "vehicles", data.id, ws.company.id);
    // Escritura + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      if (data.id) {
        await tx`
          update vehicles set economic_number = ${data.economic_number}, license_plate = ${data.license_plate},
            brand = ${data.brand ?? ""}, model = ${data.model ?? ""}, year = ${data.year ?? null},
            vehicle_type = ${data.vehicle_type ?? "TRACTO"}, status = ${data.status ?? "ACTIVE"},
            client_id = ${data.client_id ?? null}, fleet_id = ${data.fleet_id ?? null},
            current_driver_id = ${data.current_driver_id ?? null}, speed_limit_kmh = ${data.speed_limit_kmh ?? 90},
            vin = ${data.vin ?? ""}, fuel_type = ${data.fuel_type ?? "DIESEL"}, capacity = ${data.capacity ?? 0},
            active = ${data.status === "INACTIVE" || data.status === "OUT_OF_SERVICE" ? false : true},
            updated_at = now(), updated_by = ${context.userId}
          where id = ${id} and company_id = ${ws.company.id}
        `;
      } else {
        await insert(tx, "vehicles", {
          id, company_id: ws.company.id, economic_number: data.economic_number, license_plate: data.license_plate,
          brand: data.brand ?? "", model: data.model ?? "", year: data.year ?? null,
          vehicle_type: data.vehicle_type ?? "TRACTO", status: data.status ?? "ACTIVE",
          client_id: data.client_id ?? null, fleet_id: data.fleet_id ?? null,
          current_driver_id: data.current_driver_id ?? null, speed_limit_kmh: data.speed_limit_kmh ?? 90,
          vin: data.vin ?? "", fuel_type: data.fuel_type ?? "DIESEL", capacity: data.capacity ?? 0,
          active: data.status === "INACTIVE" || data.status === "OUT_OF_SERVICE" ? false : true,
          created_by: context.userId,
        });
      }
      await writeAudit(
        ws.company.id,
        context.userId,
        data.id ? "UPDATE" : "CREATE",
        "VEHICLE",
        id,
        data.current_driver_id ? `driver=${data.current_driver_id}` : data.economic_number,
        tx,
      );
    });
    return { id };
  });

export const listDevices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "devices.read");
    if (scopeOf(ws.profile, "vehicles") !== "COMPANY") {
      const rows = await sql<GpsDevice>`
        select d.id, d.company_id, d.vehicle_id, d.provider, d.device_imei, '' as ingest_token, d.status,
               v.economic_number as vehicle_number
        from gps_devices d left join vehicles v on v.id = d.vehicle_id
        where d.company_id = ${ws.company.id}
        order by d.device_imei
      `;
      return rows.filter((d) => !d.vehicle_id || allowsVehicle(scope, d.vehicle_id));
    }
    const rows = await sql<GpsDevice & { ingest_token_hash?: string }>`
      select d.id, d.company_id, d.vehicle_id, d.provider, d.device_imei, '' as ingest_token, d.status,
             v.economic_number as vehicle_number, s.sim_route, s.sim_progress, s.sim_mode
      from gps_devices d
      left join vehicles v on v.id = d.vehicle_id
      left join vehicle_simulations s on s.vehicle_id = d.vehicle_id and s.company_id = d.company_id
      where d.company_id = ${ws.company.id}
      order by d.device_imei
    `;
    return rows;
  });

function allowsVehicle(scope: Awaited<ReturnType<typeof getAccessScope>>, vehicleId: string) {
  return !scope.allowedVehicleIds || scope.allowedVehicleIds.includes(vehicleId);
}

export const upsertDevice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    id: z.string().optional(),
    provider: z.enum(["EXTERNAL", "SMARTPHONE", "SIMULATOR"]),
    device_imei: z.string().trim().min(3).max(32),
    vehicle_id: z.string().nullable().optional(),
    status: z.string().max(30).optional(),
    sim_route: z.string().max(100_000).optional(),
    sim_progress: z.number().finite().min(0).max(1).optional(),
    sim_mode: z.enum(["MOVING", "STOPPED", "OFFLINE"]).optional(),
  }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, perm("devices", (data as { id?: unknown }).id));
    const sql = await getSql();
    await assertOwned(sql, "vehicles", data.vehicle_id ?? null, ws.company.id);
    const id = data.id || nid();
    const plain = data.id ? null : newSecret(24);
    const tokenHash = plain ? hashSecret(plain) : null;
    if (data.id) {
      const existing = (await sql<{ id: string }>`select id from gps_devices where id = ${id} and company_id = ${ws.company.id}`)[0];
      if (!existing) forbid();
    }
    // Validación de la ruta ANTES de escribir (antes el dispositivo se guardaba y luego fallaba la validación).
    const simRoute = data.sim_route ?? "[]";
    const wantsSimulation = data.provider === "SIMULATOR" && !!data.vehicle_id;
    if (wantsSimulation && simRoute !== "[]" && parseRoute(simRoute).length < 2) {
      throw new Error("La ruta del simulador debe contener al menos 2 puntos válidos");
    }
    // Dispositivo + simulación + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      if (data.id) {
        await tx`
          update gps_devices set provider = ${data.provider}, device_imei = ${data.device_imei},
            vehicle_id = ${data.vehicle_id ?? null}, status = ${data.status ?? "ONLINE"},
            updated_at = now()
          where id = ${id} and company_id = ${ws.company.id}
        `;
      } else {
        await insert(tx, "gps_devices", {
          id, company_id: ws.company.id, provider: data.provider, device_imei: data.device_imei,
          vehicle_id: data.vehicle_id ?? null, ingest_token: "", ingest_token_hash: tokenHash, status: data.status ?? "ONLINE",
        });
      }
      if (wantsSimulation) {
        await tx`
          insert into vehicle_simulations (vehicle_id, company_id, sim_route, sim_progress, sim_mode, is_development)
          values (${data.vehicle_id}, ${ws.company.id}, ${simRoute}, ${data.sim_progress ?? 0}, ${data.sim_mode ?? "MOVING"}, true)
          on conflict (vehicle_id) do update set
            sim_route = excluded.sim_route, sim_progress = excluded.sim_progress, sim_mode = excluded.sim_mode,
            is_development = true, updated_at = now()
        `;
      }
      await writeAudit(ws.company.id, context.userId, data.id ? "UPDATE" : "CREATE", "GPS", id, data.device_imei, tx);
    });
    return { id, plaintext_token: plain, token_preview: plain ? previewSecret(plain) : undefined };
  });

export const listGeofences = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "geofences.read");
    const rows = await sql<Geofence>`select * from geofences where company_id = ${ws.company.id} order by name`;
    return rows.filter((g) => geofenceVisible(scope, g));
  });

export const upsertGeofence = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<Geofence> & { name: string; type: Geofence["type"]; lat: number; lng: number }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, perm("geofences", (data as { id?: unknown }).id));
    const sql = await getSql();
    await assertOwned(sql, "clients", data.client_id ?? null, ws.company.id);
    const id = data.id || nid();
    // Escritura + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      if (data.id) {
        await tx`
          update geofences set name = ${data.name}, type = ${data.type}, client_id = ${data.client_id ?? null},
            lat = ${data.lat}, lng = ${data.lng}, radius_m = ${data.radius_m ?? 600},
            polygon = ${data.polygon ?? ""}, status = ${data.status ?? "ACTIVE"}, updated_at = now()
          where id = ${id} and company_id = ${ws.company.id}
        `;
      } else {
        await insert(tx, "geofences", {
          id, company_id: ws.company.id, name: data.name, type: data.type, client_id: data.client_id ?? null,
          lat: data.lat, lng: data.lng, radius_m: data.radius_m ?? 600, polygon: data.polygon ?? "",
          status: data.status ?? "ACTIVE", created_by: context.userId,
        });
      }
      await writeAudit(ws.company.id, context.userId, data.id ? "UPDATE" : "CREATE", "GEOFENCE", id, data.name, tx);
    });
    return { id };
  });

export const listGeofenceEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "geofences.read");
    const rows = await sql<GeofenceEvent & { client_id: string | null; current_driver_id: string | null }>`
      select e.*, g.name as geofence_name, v.economic_number as vehicle_number,
             v.client_id, v.current_driver_id
      from geofence_events e
      join geofences g on g.id = e.geofence_id
      join vehicles v on v.id = e.vehicle_id
      where e.company_id = ${ws.company.id}
      order by e.recorded_at desc
      limit 200
    `;
    return rows.filter((e) => canSeeScopedVehicle(scope, e));
  });

export const getRouteHistory = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ vehicleId: z.string().min(1), from: z.string(), to: z.string() }).superRefine((v, ctx) => { if (new Date(v.from).getTime() >= new Date(v.to).getTime()) ctx.addIssue({ code: "custom", message: "El inicio debe ser anterior al fin", path: ["from"] }); if (new Date(v.to).getTime() - new Date(v.from).getTime() > 90 * 24 * 3600_000) ctx.addIssue({ code: "custom", message: "El rango máximo es de 90 días", path: ["to"] }); }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "vehicles.read");
    const veh = (await sql<Vehicle>`select * from vehicles where id = ${data.vehicleId} and company_id = ${ws.company.id}`)[0];
    if (!veh || !canSeeScopedVehicle(scope, veh)) forbid();
    const points = await sql<GpsPosition>`
      select id, vehicle_id, gps_device_id, latitude, longitude, speed, heading, altitude, accuracy, recorded_at, source
      from gps_positions
      where company_id = ${ws.company.id} and vehicle_id = ${data.vehicleId}
        and recorded_at >= ${data.from} and recorded_at <= ${data.to}
      order by recorded_at asc
      limit 10000
    `;
    let km = 0;
    for (let i = 1; i < points.length; i++) {
      km += haversineKm(
        { lat: Number(points[i - 1]!.latitude), lng: Number(points[i - 1]!.longitude) },
        { lat: Number(points[i]!.latitude), lng: Number(points[i]!.longitude) },
      );
    }
    const sampled = downsamplePositions(points, 2000);
    return {
      vehicle: veh,
      points: sampled,
      km: Math.round(km * 10) / 10,
      truncated: points.length >= 10000,
      downsampled: sampled.length < points.length,
    };
  });

export const listTrackingLinks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "tracking.read");
    const rows = await sql<Omit<TrackingLink, "token"> & { client_id: string | null; current_driver_id: string | null }>`
      select t.id, t.company_id, t.vehicle_id, t.created_by, t.expires_at, t.revoked_at, t.status,
             v.economic_number as vehicle_number, v.client_id, v.current_driver_id
      from tracking_links t join vehicles v on v.id = t.vehicle_id
      where t.company_id = ${ws.company.id}
      order by t.created_at desc
    `;
    const now = Date.now();
    return rows
      .filter((r) => canSeeScopedVehicle(scope, r))
      .map((r) => ({
        ...r,
        status: r.revoked_at ? "REVOKED" : new Date(r.expires_at).getTime() < now ? "EXPIRED" : r.status,
      }));
  });

export const createTrackingLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ vehicleId: z.string().min(1), hours: z.number().finite().positive().max(24 * 30) }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, "tracking.create");
    const sql = await getSql();
    const id = nid();
    const token = newSecret(24);
    const expires = new Date(Date.now() + Math.max(1, data.hours) * 3600_000).toISOString();
    const veh = (await sql<{ id: string }>`select id from vehicles where id = ${data.vehicleId} and company_id = ${ws.company.id}`)[0];
    if (!veh) forbid();
    await withTransaction(async (tx) => {
      await insert(tx, "tracking_links", {
        id, company_id: ws.company.id, token: "", token_hash: hashSecret(token), vehicle_id: data.vehicleId,
        created_by: context.userId, expires_at: expires, status: "ACTIVE",
      });
      await writeAudit(ws.company.id, context.userId, "CREATE", "TRACKING_LINK", id, data.vehicleId, tx);
    });
    return { id, token, expires_at: expires };
  });

export const revokeTrackingLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, "tracking.update");
    const sql = await getSql();
    await withTransaction(async (tx) => {
      await tx`
        update tracking_links set revoked_at = now(), status = 'REVOKED'
        where id = ${data.id} and company_id = ${ws.company.id}
      `;
      await writeAudit(ws.company.id, context.userId, "REVOKE", "TRACKING_LINK", data.id, "", tx);
    });
  });

export const getPublicTrack = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().min(16).max(256) }).parse(d))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const hashed = hashSecret(data.token);
    const links = await sql<{
      id: string;
      company_id: string;
      vehicle_id: string;
      expires_at: string;
      revoked_at: string | null;
      status: string;
      hide_driver_name: boolean;
      hide_license_plate: boolean;
      token_hash: string;
      token: string;
    }>`
      select id, company_id, vehicle_id, expires_at, revoked_at, status,
             token_hash, token,
             coalesce(hide_driver_name, false) as hide_driver_name,
             coalesce(hide_license_plate, false) as hide_license_plate
      from tracking_links
      where token_hash = ${hashed} or token = ${data.token}
      limit 1
    `;
    const link = links[0];
    if (!link || link.revoked_at || link.status === "REVOKED") throw new Error("Enlace no válido");
    if (new Date(link.expires_at).getTime() < Date.now()) throw new Error("Enlace expirado");
    if (!link.token_hash && link.status === "ACTIVE") throw new Error("Enlace sin credencial segura");
    // Legacy migration: accept one old plaintext token once, then clear it.
    if (link.token) {
      await sql`update tracking_links set token_hash = ${hashed}, token = '' where id = ${link.id}`;
    }
    const units = await sql<FleetUnit>`
      select v.*, d.name as driver_name, c.trade_name as client_name, f.name as fleet_name,
             g.provider as gps_provider, g.device_imei as gps_imei
      from vehicles v
      left join drivers d on d.id = v.current_driver_id
      left join clients c on c.id = v.client_id
      left join fleets f on f.id = v.fleet_id
      left join gps_devices g on g.vehicle_id = v.id
      where v.id = ${link.vehicle_id} and v.company_id = ${link.company_id}
    `;
    const unit = units[0];
    if (!unit) throw new Error("Unidad no encontrada");
    const trail = await sql<GpsPosition>`
      select id, vehicle_id, gps_device_id, latitude, longitude, speed, heading, altitude, accuracy, recorded_at
      from gps_positions where vehicle_id = ${unit.id} and company_id = ${link.company_id}
      order by recorded_at desc limit 40
    `;
    return {
      economic_number: unit.economic_number,
      license_plate: link.hide_license_plate ? "" : unit.license_plate,
      motion_state: unit.motion_state,
      last_speed: unit.last_speed,
      last_gps_at: unit.last_gps_at,
      current_latitude: unit.current_latitude,
      current_longitude: unit.current_longitude,
      driver_name: link.hide_driver_name ? null : unit.driver_name,
      expires_at: link.expires_at,
      trail: trail.reverse(),
    };
  });

export const listInspections = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "inspections.read");
    const rows = await sql<Inspection>`
      select i.*, v.economic_number as vehicle_number, d.name as driver_name
      from inspections i
      join vehicles v on v.id = i.vehicle_id
      left join drivers d on d.id = i.driver_id
      where i.company_id = ${ws.company.id}
      order by i.inspected_at desc
      limit 200
    `;
    if (!scope.allowedVehicleIds) return rows;
    return rows.filter((r) => scope.allowedVehicleIds!.includes(r.vehicle_id));
  });

export const getInspection = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "inspections.read");
    const insp = (await sql<Inspection>`select * from inspections where id = ${data.id} and company_id = ${ws.company.id}`)[0];
    if (!insp) throw new Error("No encontrada");
    if (scope.allowedVehicleIds && !scope.allowedVehicleIds.includes(insp.vehicle_id)) forbid();
    if (scope.forcedDriverId && insp.driver_id && insp.driver_id !== scope.forcedDriverId) forbid();
    const items = await sql<InspectionItem>`select * from inspection_items where inspection_id = ${insp.id}`;
    return { inspection: insp, items };
  });

const inspectionInput = z.object({
  vehicle_id: z.string().min(1),
  driver_id: z.string().min(1).nullable().optional(),
  observations: z.string().max(3000).optional(),
  photos: z.array(z.string().max(200000)).max(20).optional(),
  items: z.array(z.object({ category: z.string().trim().min(1).max(80), status: z.enum(["PASS", "WARNING", "FAIL"]), notes: z.string().max(1000).optional() })).min(1).max(50),
});

export const createInspection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inspectionInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "inspections.create");
    const veh = (await sql<{ economic_number: string; current_driver_id: string | null; client_id: string | null }>`
      select economic_number, current_driver_id, client_id from vehicles where id = ${data.vehicle_id} and company_id = ${ws.company.id}
    `)[0];
    if (!veh) forbid();
    if (!canSeeScopedVehicle(scope, { id: data.vehicle_id, client_id: veh.client_id, current_driver_id: veh.current_driver_id })) forbid();
    const ownInspections = scopeOf(ws.profile, "inspections") === "OWN";
    if (ownInspections && veh.current_driver_id !== ws.profile.driver_id) forbid();
    const inspectionDriverId = ownInspections ? ws.profile.driver_id : data.driver_id ?? null;
    if (ownInspections && data.driver_id && data.driver_id !== ws.profile.driver_id) forbid();
    if (inspectionDriverId) {
      const driver = (await sql<{ id: string }>`select id from drivers where id = ${inspectionDriverId} and company_id = ${ws.company.id} limit 1`)[0];
      if (!driver) forbid();
    }
    const statuses = data.items.map((i) => i.status);
    const status = statuses.includes("FAIL") ? "FAIL" : statuses.includes("WARNING") ? "WARNING" : "PASS";
    const blocksVehicle = statuses.includes("FAIL");
    const id = nid();
    // Inspección + ítems + bloqueo de unidad + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      await insert(tx, "inspections", {
        id,
        company_id: ws.company.id,
        vehicle_id: data.vehicle_id,
        driver_id: inspectionDriverId,
        user_id: context.userId,
        inspected_at: new Date().toISOString(),
        status,
        observations: data.observations ?? "",
        photos: JSON.stringify(data.photos ?? []),
        blocks_vehicle: blocksVehicle,
        signed_by: context.userId,
        signed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      for (const item of data.items) {
        await insert(tx, "inspection_items", {
          id: nid(),
          inspection_id: id,
          category: item.category,
          status: item.status,
          notes: item.notes ?? "",
        });
      }
      if (blocksVehicle) {
        await tx`update vehicles set status = 'MAINTENANCE', updated_at = now() where id = ${data.vehicle_id} and company_id = ${ws.company.id}`;
      }
      await writeAudit(ws.company.id, context.userId, "CREATE", "INSPECTION", id, status, tx);
    });
    if (status !== "PASS") {
      const { notify } = await import("./db");
      await notify({
        companyId: ws.company.id,
        title: `Inspección con problema ${veh.economic_number}`,
        body: data.observations || `Resultado ${status}`,
        kind: "INSPECTION_FAIL",
        entityId: id,
      });
    }
    return { id, status };
  });

export const runReport = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    const raw = (d ?? {}) as Record<string, unknown>;
    const kind = String(raw.kind ?? "");
    const from = String(raw.from ?? "");
    const to = String(raw.to ?? "");
    const filters = sanitizeFilterRequest(raw);
    return { kind, from, to, ...filters };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "reports.generate");
    const filter: ReportFilter = {
      ...constrainFilters(scope, data),
      from: data.from,
      to: data.to,
    };
    switch (data.kind) {
      case "mileage":
        return { kind: data.kind, rows: await mileageReport(sql, ws.company.id, filter) };
      case "speed":
        return { kind: data.kind, rows: await speedReport(sql, ws.company.id, filter) };
      case "zones":
        return { kind: data.kind, rows: await zoneReport(sql, ws.company.id, filter) };
      case "inspections":
        return { kind: data.kind, rows: await inspectionReport(sql, ws.company.id, filter) };
      case "utilization":
        return { kind: data.kind, rows: await utilizationReport(sql, ws.company.id, filter) };
      case "drivers":
        return { kind: data.kind, rows: await driverActivityReport(sql, ws.company.id, filter) };
      case "services":
        return { kind: data.kind, rows: await servicePerformanceReport(sql, ws.company.id, filter) };
      case "profitability":
        return { kind: data.kind, rows: await profitabilityReport(sql, ws.company.id, filter) };
      default:
        throw new Error("Reporte no soportado");
    }
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    const rows = await sql<NotificationRow & { read_row: string | null }>`
      select n.id, n.title, n.body, n.kind, n.entity_id, n.status, n.read_at, n.created_at, n.email_queued,
             n.user_id, n.audience_role, r.user_id as read_row
      from notifications n
      left join notification_reads r on r.notification_id = n.id and r.user_id = ${context.userId}
      where n.company_id = ${ws.company.id}
      order by n.created_at desc limit 80
    `;
    return rows.filter((n) => notificationVisible(scope, n)).map((n) => ({
      ...n,
      status: (n.read_row || (n.user_id === context.userId && n.status === "READ") ? "READ" : "UNREAD") as NotificationRow["status"],
    }));
  });

export const markRead = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    const row = (await sql<NotificationRow>`
      select id, title, body, kind, entity_id, status, read_at, created_at, email_queued, user_id, audience_role
      from notifications where id = ${data.id} and company_id = ${ws.company.id}
    `)[0];
    if (!row || !notificationVisible(scope, row)) forbid();
    await sql.query(
      `insert into notification_reads (notification_id, user_id, read_at)
       values ($1, $2, now())
       on conflict (notification_id, user_id) do update set read_at = now()`,
      [data.id, context.userId],
    );
  });

export const markAllRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await sql.query(
      `insert into notification_reads (notification_id, user_id, read_at)
       select n.id, $2, now()
       from notifications n
       where n.company_id = $1
         and (
           n.user_id = $2
           or (n.user_id is null and n.audience_role = $3)
           or (n.user_id is null and n.audience_role is null and $3 not in ('CLIENTE', 'CONDUCTOR'))
         )
       on conflict (notification_id, user_id) do update set read_at = excluded.read_at`,
      [ws.company.id, context.userId, scope.role],
    );
  });

/** audit.read: COMPANY => toda la empresa; OWN (conductor) => solo sus propios eventos. Nunca otro scope. */
export const listAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, sql } = await scoped(context.userId);
    const az = await authorize(ws.profile, "audit.read");
    const own = getResourceScope(az, "audit") !== "COMPANY";
    return sql<{ id: string; action: string; entity_kind: string; details: string; created_at: string; user_id: string | null }>`
      select id, action, entity_kind, details, created_at, user_id from audit_logs
      where company_id = ${ws.company.id} and (${!own} or user_id = ${ws.profile.user_id})
      order by created_at desc limit 100`;
  });

export const listPersonnel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, sql } = await scoped(context.userId);
    await authorize(ws.profile, "users.read");
    const people = await sql<Personnel>`select * from personnel where company_id = ${ws.company.id} order by full_name`;
    const audit = await sql<{ id: string; action: string; entity_kind: string; details: string; created_at: string; user_id: string | null }>`
      select id, action, entity_kind, details, created_at, user_id from audit_logs
      where company_id = ${ws.company.id} order by created_at desc limit 40
    `;
    return { workspace: ws, people, audit };
  });

export const upsertPersonnel = createServerFn({ method: "POST" })
  .inputValidator((d: Partial<Personnel> & { full_name: string; role: Personnel["role"] }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, perm("users", (data as { id?: unknown }).id));
    const sql = await getSql();
    const id = data.id || nid();
    // Escritura + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      if (data.id) {
        await tx`
          update personnel set full_name = ${data.full_name}, email = ${data.email ?? ""}, phone = ${data.phone ?? ""},
            position = ${data.position ?? ""}, role = ${data.role}, status = ${data.status ?? "ACTIVE"}, updated_at = now()
          where id = ${id} and company_id = ${ws.company.id}
        `;
      } else {
        await insert(tx, "personnel", {
          id, company_id: ws.company.id, full_name: data.full_name, email: data.email ?? "",
          phone: data.phone ?? "", position: data.position ?? "", role: data.role,
          status: data.status ?? "ACTIVE", created_by: context.userId,
        });
      }
      await writeAudit(ws.company.id, context.userId, data.id ? "UPDATE" : "CREATE", "USER", id, data.full_name, tx);
    });
    return { id };
  });

export const updateMyRole = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ role: z.enum(["ADMIN", "OPERADOR", "SUPERVISOR", "CONDUCTOR", "CLIENTE"]) }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, "roles.manage");
    await withTransaction(async (tx) => {
      // Un ADMIN no puede degradarse si es el último ADMIN activo de la empresa:
      // eso dejaría la empresa sin administración (bloqueo operativo irreversible).
      if (ws.profile.role === "ADMIN" && data.role !== "ADMIN") {
        const others = await tx<{ n: number }>`
          select count(*)::int as n from profiles
          where company_id = ${ws.company.id} and role = 'ADMIN' and status = 'ACTIVE' and user_id <> ${context.userId}`;
        if ((others[0]?.n ?? 0) === 0) {
          throw new Error("No puedes cambiar tu rol: eres el único ADMIN activo de la empresa.");
        }
      }
      await tx`update profiles set role = ${data.role}, updated_at = now() where user_id = ${context.userId}`;
      await writeAudit(ws.company.id, context.userId, "UPDATE", "USER", context.userId, data.role, tx);
    });
  });

export const listBackups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, "backups.read");
    const sql = await getSql();
    return sql<BackupRow>`
      select id, created_at, created_by, filename, size_bytes, status
      from backups where company_id = ${ws.company.id} order by created_at desc
    `;
  });

const BACKUP_TABLES = [
  "clients", "fleets", "drivers", "vehicles", "gps_devices", "geofences",
  "services", "service_loads", "service_stops", "service_assignments", "service_status_history",
  "route_plans", "route_points", "route_deviation_events", "gps_positions",
  "geofence_events", "speed_alerts", "inspections", "inspection_items",
  "delivery_evidence", "documents", "maintenance_plans", "maintenance_orders",
  "maintenance_items", "fuel_transactions", "service_cost_lines", "trips", "trip_stops", "incidents", "alerts",
  "tracking_links", "notifications", "personnel",
];

export const createBackup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, "backups.create");
    const sql = await getSql();
    const dump: Record<string, unknown> = { company: ws.company, tables: {} };
    for (const table of BACKUP_TABLES) {
      const hasCompanyId = !["route_points", "inspection_items", "maintenance_items"].includes(table);
      (dump.tables as Record<string, unknown>)[table] = hasCompanyId
        ? await sql.query(`select * from ${table} where company_id = $1`, [ws.company.id])
        : table === "inspection_items"
          ? await sql.query(`select ii.* from inspection_items ii join inspections i on i.id = ii.inspection_id where i.company_id = $1`, [ws.company.id])
          : table === "route_points"
            ? await sql.query(`select rp.* from route_points rp join route_plans r on r.id = rp.route_plan_id where r.company_id = $1`, [ws.company.id])
            : await sql.query(`select mi.* from maintenance_items mi join maintenance_orders mo on mo.id = mi.order_id where mo.company_id = $1`, [ws.company.id]);
    }
    const payload = JSON.stringify(dump);
    const id = nid();
    const filename = `sotygeo-${ws.company.name.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    await withTransaction(async (tx) => {
      await insert(tx, "backups", {
        id, company_id: ws.company.id, created_by: context.userId, filename,
        size_bytes: payload.length, status: "READY", payload,
      });
      await writeAudit(ws.company.id, context.userId, "CREATE", "BACKUP", id, filename, tx);
    });
    return { id, filename, size_bytes: payload.length };
  });

export const downloadBackup = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, "backups.read");
    const sql = await getSql();
    const rows = await sql<{ filename: string; payload: string }>`
      select filename, payload from backups where id = ${data.id} and company_id = ${ws.company.id}
    `;
    if (!rows[0]) throw new Error("Respaldo no encontrado");
    return rows[0];
  });

export const restoreBackup = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; confirm: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await getWorkspace(context.userId);
    await authorize(ws.profile, "backups.restore");
    if (data.confirm !== "RESTAURAR") throw new Error("Confirmación inválida");
    const sql = await getSql();
    const rows = await sql<{ payload: string; filename: string }>`
      select payload, filename from backups where id = ${data.id} and company_id = ${ws.company.id}
    `;
    const row = rows[0];
    if (!row) throw new Error("Respaldo no encontrado");
    await sql`update backups set status = 'VALIDATING' where id = ${data.id} and company_id = ${ws.company.id}`;
    let dump;
    try {
      dump = validateBackupPayload(JSON.parse(row.payload));
    } catch {
      await sql`update backups set status = 'FAILED', error_code = 'INVALID_PAYLOAD' where id = ${data.id}`;
      throw new Error("No se pudo restaurar el respaldo");
    }
    const cid = ws.company.id;
    await sql`update backups set status = 'RESTORING' where id = ${data.id}`;
    try {
      await withTransaction(async (tx) => {
        await applyRestore(tx, cid, dump);
      });
      await sql`update backups set status = 'SUCCESS', error_code = '' where id = ${data.id}`;
      await writeAudit(ws.company.id, context.userId, "BACKUP_RESTORE", "BACKUP", data.id, row.filename);
      return { ok: true };
    } catch {
      await sql`update backups set status = 'FAILED', error_code = 'RESTORE_FAILED' where id = ${data.id}`;
      await writeAudit(ws.company.id, context.userId, "BACKUP_RESTORE", "BACKUP", data.id, "failed");
      throw new Error("No se pudo restaurar el respaldo");
    }
  });



const smartphoneFixInput = gpsIngestSchema.pick({ latitude: true, longitude: true, speed: true, heading: true }).extend({
  vehicleId: z.string().min(1),
});

export const postSmartphoneFix = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => smartphoneFixInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await scoped(context.userId);
    await authorize(ws.profile, "trips.update");
    const veh = (await sql<Vehicle>`select * from vehicles where id = ${data.vehicleId} and company_id = ${ws.company.id}`)[0];
    if (!veh || !canSeeScopedVehicle(scope, veh)) forbid();
    if (scopeOf(ws.profile, "trips") === "ASSIGNED" && veh.current_driver_id !== ws.profile.driver_id) forbid();
    if (!rateLimitAllow(`smartphone:${context.userId}`, Date.now(), 120)) throw new Error("Demasiadas actualizaciones GPS");
    const parsed = smartphoneProvider.fromBrowser(data.latitude, data.longitude, data.speed ?? 0, data.heading ?? 0);
    const device = (await sql<{ id: string }>`select id from gps_devices where vehicle_id = ${veh.id} and provider = 'SMARTPHONE' limit 1`)[0];
    await ingestFix(ws.company.id, { ...parsed, vehicleId: veh.id, deviceId: device?.id ?? null, source: "SMARTPHONE" });
    return { ok: true };
  });

/** Error de ingesta con código HTTP para que la ruta pública responda 401/422/429 en vez de 400 genérico. */
export class IngestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "IngestError";
    this.status = status;
  }
}

export async function ingestExternal(body: unknown) {
  const sql = await getSql();
  const parsedBody = gpsIngestSchema.safeParse(body);
  if (!parsedBody.success) {
    await insert(sql, "gps_ingest_errors", { id: nid(), imei: String((body as { imei?: string })?.imei ?? "").slice(0, 64), reason: "validation" });
    throw new IngestError("Datos de ingestión inválidos", 422);
  }
  const input = parsedBody.data;
  if (isCorruptFix(input.latitude, input.longitude)) {
    await insert(sql, "gps_ingest_errors", { id: nid(), imei: input.imei, reason: "corrupt_fix" });
    throw new IngestError("Posición corrupta", 422);
  }
  const recordedAt = input.recorded_at ? assertFixTime(input.recorded_at).toISOString() : new Date().toISOString();
  const devices = await sql<{
    id: string;
    company_id: string;
    vehicle_id: string | null;
    ingest_token: string;
    ingest_token_hash: string;
  }>`
    select id, company_id, vehicle_id, ingest_token, ingest_token_hash
    from gps_devices
    where device_imei = ${input.imei}
    order by updated_at desc
    limit 10
  `;
  const authenticatedDevices = devices.filter((candidate) => {
    const okHash = candidate.ingest_token_hash ? secretsEqual(input.token, candidate.ingest_token_hash) : false;
    const okLegacy = candidate.ingest_token ? tokensEqualPlain(candidate.ingest_token, input.token) : false;
    return Boolean(candidate.vehicle_id && (okHash || okLegacy));
  });
  if (authenticatedDevices.length > 1) {
    await insert(sql, "gps_ingest_errors", { id: nid(), imei: input.imei, reason: "ambiguous_device" });
    throw new IngestError("Dispositivo ambiguo: credencial duplicada", 409);
  }
  const device = authenticatedDevices[0];
  if (!device || !device.vehicle_id) {
    await insert(sql, "gps_ingest_errors", { id: nid(), imei: input.imei, reason: "unknown_device" });
    throw new IngestError("Dispositivo no registrado", 401);
  }
  // Límite por dispositivo YA autenticado (clave = id interno, no el IMEI público).
  if (!rateLimitAllow(`device:${device.id}`)) {
    throw new IngestError("Demasiadas solicitudes", 429);
  }
  const okHash = device.ingest_token_hash ? secretsEqual(input.token, device.ingest_token_hash) : false;
  const okLegacy = device.ingest_token ? tokensEqualPlain(device.ingest_token, input.token) : false;
  if (!okHash && !okLegacy) {
    await insert(sql, "gps_ingest_errors", { id: nid(), imei: input.imei, reason: "bad_token" });
    throw new IngestError("Token inválido", 401);
  }
  // Legacy devices created before token hashing are accepted once, then migrated
  // to a hash and the plaintext credential is cleared from storage.
  if (okLegacy && !okHash) {
    await sql`update gps_devices
      set ingest_token_hash = ${hashSecret(input.token)}, ingest_token = '', updated_at = now()
      where id = ${device.id} and company_id = ${device.company_id}`;
  }
  const parsed = externalProvider.parse(input);
  const result = await ingestFix(device.company_id, {
    ...parsed,
    recordedAt,
    vehicleId: device.vehicle_id,
    deviceId: device.id,
    eventId: input.event_id,
    sequence: input.sequence,
    odometerKm: input.odometer_km,
    source: "EXTERNAL",
  });
  if (result.duplicate) return { ok: true, duplicate: true };
  if (!result.ingested) throw new IngestError(result.reason || "No ingerido", 422);
  return { ok: true, event_key: eventKey({ deviceId: device.id, eventId: input.event_id, sequence: input.sequence, recordedAt, latitude: input.latitude, longitude: input.longitude }) };
}

