import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import { haversineKm, parseRoute } from "@/lib/geo";
import { authorize, perm } from "./security/authorize";
import { getResourceScope, scopeOf } from "./security/permissions";
import { keyBelongsTo, isHttpsUrl } from "./security/storage-paths";
import { insert, nid, notify, writeAudit } from "./db";
import {
  assertResourcesFree, assertVehicleHasNoActiveService, planTripForService, queueStatusChange, queueTripForService, readTripId,
} from "./services/tx";
import { publishDomainEvent } from "./events/bus";
import { constrainFilters, getAccessScope, serviceVisible } from "./security/scope";
import { assertTransition, type ServiceStatus } from "./services/machine";
import type {
  AlertRow,
  DocumentRow,
  FuelTransaction,
  MaintenanceOrder,
  ServiceRow,
  ServiceStop,
  Trip,
} from "./types";
import { getWorkspace } from "./workspace";

function forbid(): never {
  throw new Error("No autorizado");
}

async function ctx(userId: string) {
  const ws = await getWorkspace(userId);
  const scope = await getAccessScope(ws.profile);
  const sql = await getSql();
  return { ws, scope, sql };
}

async function getScopedService(
  sql: Awaited<ReturnType<typeof getSql>>,
  scope: Awaited<ReturnType<typeof getAccessScope>>,
  companyId: string,
  serviceId: string,
) {
  const row = (await sql<ServiceRow>`
    select s.*, c.trade_name as client_name, v.economic_number as vehicle_number, d.name as driver_name
    from services s
    left join clients c on c.id = s.client_id
    left join vehicles v on v.id = s.vehicle_id
    left join drivers d on d.id = s.driver_id
    where s.id = ${serviceId} and s.company_id = ${companyId}
  `)[0];
  if (!row || !serviceVisible(scope, row)) forbid();
  return row;
}



export const listServices = createServerFn({ method: "GET" })
  .inputValidator((d: { status?: string | null; clientId?: string | null } | undefined) => d ?? {})
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "services.read");
    const filter = constrainFilters(scope, data);
    let rows = await sql<ServiceRow>`
      select s.*, c.trade_name as client_name, v.economic_number as vehicle_number, d.name as driver_name
      from services s
      left join clients c on c.id = s.client_id
      left join vehicles v on v.id = s.vehicle_id
      left join drivers d on d.id = s.driver_id
      where s.company_id = ${ws.company.id}
      order by s.created_at desc
      limit 200
    `;
    rows = rows.filter((r) => serviceVisible(scope, r));
    if (filter.clientId) rows = rows.filter((r) => r.client_id === filter.clientId);
    if (data.status) rows = rows.filter((r) => r.status === data.status);
    if (scopeOf(ws.profile, "services") !== "COMPANY") {
      return rows.map((row) => ({ ...row, gross_revenue: 0 }));
    }
    return rows;
  });

export const getService = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "services.read");
    const svc = await getScopedService(sql, scope, ws.company.id, data.id);
    const stops = await sql<ServiceStop>`
      select * from service_stops where service_id = ${svc.id} order by sequence
    `;
    const history = await sql<{ id: string; from_status: string; to_status: string; changed_at: string; notes: string }>`
      select id, from_status, to_status, changed_at, notes from service_status_history
      where service_id = ${svc.id} order by changed_at desc
    `;
    const assignments = await sql<{
      id: string;
      vehicle_id: string | null;
      driver_id: string | null;
      assigned_at: string;
      unassigned_at: string | null;
      reason: string;
    }>`select id, vehicle_id, driver_id, assigned_at, unassigned_at, reason from service_assignments
       where service_id = ${svc.id} order by assigned_at desc`;
    const pod = await sql<{
      id: string;
      receiver_name: string;
      receiver_document: string;
      signature: string;
      photo_url: string;
      comments: string;
      captured_at: string;
      latitude: number | null;
      longitude: number | null;
    }>`select id, receiver_name, receiver_document, signature, photo_url, comments, captured_at, latitude, longitude
       from delivery_evidence where service_id = ${svc.id} order by captured_at desc`;
    const costs = await sql<{ id: string; kind: string; amount: number; notes: string }>`
      select id, kind, amount, notes from service_cost_lines where service_id = ${svc.id}
    `;
    const documents = await sql<DocumentRow>`
      select id, owner_type, owner_id, document_type, title, file_url, issued_at::text as issued_at,
             expires_at::text as expires_at, status
      from documents where company_id = ${ws.company.id} and owner_type = 'SERVICE' and owner_id = ${svc.id}
    `;
    const trail =
      svc.vehicle_id
        ? await sql<{ latitude: number; longitude: number; speed: number; recorded_at: string }>`
            select latitude, longitude, speed, recorded_at from gps_positions
            where company_id = ${ws.company.id} and vehicle_id = ${svc.vehicle_id}
            order by recorded_at desc limit 80
          `
        : [];
    const trip = (await sql<Trip>`
      select t.*, s.service_number, v.economic_number as vehicle_number, d.name as driver_name
      from trips t
      join services s on s.id = t.service_id
      left join vehicles v on v.id = t.vehicle_id
      left join drivers d on d.id = t.driver_id
      where t.company_id = ${ws.company.id} and t.service_id = ${svc.id}
      limit 1
    `)[0] ?? null;

    const loads = await sql<{
      id: string;
      load_number: string;
      description: string;
      weight_kg: number;
      volume_m3: number;
      pieces: number;
      status: string;
      reference: string;
    }>`select id, load_number, description, weight_kg, volume_m3, pieces, status, reference
       from service_loads where company_id = ${ws.company.id} and service_id = ${svc.id} order by created_at`;
    const incidents = await sql<{
      id: string;
      type: string;
      severity: string;
      client_visible: boolean;
      status: string;
      title: string;
      description: string;
      occurred_at: string;
      resolved_at: string | null;
    }>`select id, type, severity, status, title, description, occurred_at, resolved_at, client_visible
       from incidents where company_id = ${ws.company.id} and service_id = ${svc.id} order by occurred_at desc`;
    const financeVisible = scopeOf(ws.profile, "services") === "COMPANY";
    const exposedIncidents = scopeOf(ws.profile, "services") === "CLIENT" ? incidents.filter((incident) => incident.client_visible) : incidents;
    const totalCost = costs.reduce((s, c) => s + Number(c.amount), 0);
    const exposedService: ServiceRow = financeVisible ? svc : { ...svc, gross_revenue: 0 };
    const exposedCosts = financeVisible ? costs : [];
    const plan = (
      await sql<{ polyline: string; distance_km: number; duration_min: number }>`
        select polyline, distance_km, duration_min from route_plans where service_id = ${svc.id} limit 1
      `
    )[0];
    return {
      service: exposedService,
      stops,
      history,
      assignments,
      pod,
      costs: exposedCosts,
      documents,
      loads,
      incidents: exposedIncidents,
      trip,
      trip_stops: trip
        ? await sql<{
            id: string;
            company_id: string;
            trip_id: string;
            service_stop_id: string | null;
            sequence: number;
            status: string;
            planned_arrival: string | null;
            actual_arrival: string | null;
            actual_departure: string | null;
          }>`
            select id, company_id, trip_id, service_stop_id, sequence, status,
                   planned_arrival, actual_arrival, actual_departure
            from trip_stops
            where company_id = ${ws.company.id} and trip_id = ${trip.id}
            order by sequence
          `
        : [],
      trail: trail.reverse(),
      route: plan ? parseRoute(plan.polyline) : [],
      planned_distance_km: plan?.distance_km ?? svc.planned_distance_km,
      ...(financeVisible ? { margin: Number(svc.gross_revenue) - totalCost, total_cost: totalCost } : {}),
    };
  });

const coordLat = z.number().gte(-90).lte(90).nullable().optional();
const coordLng = z.number().gte(-180).lte(180).nullable().optional();
const dateTime = z.string().nullable().optional();

const upsertServiceInput = z.object({
  id: z.string().min(1).optional(),
  client_id: z.string().min(1).nullable().optional(),
  origin: z.string().trim().min(2).max(240),
  destination: z.string().trim().min(2).max(240),
  origin_lat: coordLat,
  origin_lng: coordLng,
  destination_lat: coordLat,
  destination_lng: coordLng,
  scheduled_departure_at: dateTime,
  scheduled_arrival_at: dateTime,
  cargo_description: z.string().max(500).optional(),
  cargo_weight: z.number().nonnegative().max(1000000).optional(),
  cargo_volume: z.number().nonnegative().max(100000).optional(),
  pieces: z.number().int().nonnegative().max(1000000).optional(),
  priority: z.string().trim().max(30).optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().max(3000).optional(),
  require_pod: z.boolean().optional(),
  gross_revenue: z.number().nonnegative().optional(),
});

export const upsertService = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => upsertServiceInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, sql } = await ctx(context.userId);
    await authorize(ws.profile, perm("services", (data as { id?: unknown }).id));
    if (data.client_id) {
      const ok = await sql<{ id: string }>`select id from clients where id = ${data.client_id} and company_id = ${ws.company.id}`;
      if (!ok[0]) forbid();
    }
    const id = data.id || nid();
    const plannedKm =
      data.origin_lat != null && data.origin_lng != null && data.destination_lat != null && data.destination_lng != null
        ? haversineKm(
            { lat: data.origin_lat, lng: data.origin_lng },
            { lat: data.destination_lat, lng: data.destination_lng },
          )
        : 0;
    // Lectura previa (fuera de la transacción): siguiente número de servicio.
    let serviceNumber = "";
    if (!data.id) {
      const n = await sql<{ n: number | null }>`
        select max(nullif(regexp_replace(service_number, '[^0-9]', '', 'g'), '')::bigint)::int as n
        from services where company_id = ${ws.company.id}
      `;
      serviceNumber = String(Math.max(184, (n[0]?.n ?? 183) + 1)).padStart(6, "0");
    }
    // Servicio + historial + paradas + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      if (data.id) {
        await tx`
          update services set client_id = ${data.client_id ?? null}, origin = ${data.origin}, destination = ${data.destination},
            origin_lat = ${data.origin_lat ?? null}, origin_lng = ${data.origin_lng ?? null},
            destination_lat = ${data.destination_lat ?? null}, destination_lng = ${data.destination_lng ?? null},
            scheduled_departure_at = ${data.scheduled_departure_at ?? null},
            scheduled_arrival_at = ${data.scheduled_arrival_at ?? null},
            cargo_description = ${data.cargo_description ?? ""}, cargo_weight = ${data.cargo_weight ?? 0},
            cargo_volume = ${data.cargo_volume ?? 0}, pieces = ${data.pieces ?? 0},
            priority = ${data.priority ?? "NORMAL"}, reference = ${data.reference ?? ""}, notes = ${data.notes ?? ""},
            require_pod = ${data.require_pod ?? true}, gross_revenue = ${data.gross_revenue ?? 0},
            planned_distance_km = ${plannedKm}, updated_at = now()
          where id = ${id} and company_id = ${ws.company.id}
        `;
      } else {
        await insert(tx, "services", {
          id,
          company_id: ws.company.id,
          service_number: serviceNumber,
          client_id: data.client_id ?? null,
          origin: data.origin,
          destination: data.destination,
          origin_lat: data.origin_lat ?? null,
          origin_lng: data.origin_lng ?? null,
          destination_lat: data.destination_lat ?? null,
          destination_lng: data.destination_lng ?? null,
          scheduled_departure_at: data.scheduled_departure_at ?? null,
          scheduled_arrival_at: data.scheduled_arrival_at ?? null,
          cargo_description: data.cargo_description ?? "",
          cargo_weight: data.cargo_weight ?? 0,
          cargo_volume: data.cargo_volume ?? 0,
          pieces: data.pieces ?? 0,
          status: "PLANNED",
          priority: data.priority ?? "NORMAL",
          reference: data.reference ?? "",
          notes: data.notes ?? "",
          require_pod: data.require_pod ?? true,
          planned_distance_km: plannedKm,
          planned_duration_min: plannedKm > 0 ? (plannedKm / 70) * 60 : 0,
          gross_revenue: data.gross_revenue ?? 0,
          created_by: context.userId,
        });
        await insert(tx, "service_status_history", {
          id: nid(),
          company_id: ws.company.id,
          service_id: id,
          from_status: "",
          to_status: "PLANNED",
          changed_by: context.userId,
          notes: "Alta de servicio",
        });
        if (data.origin) {
          await insert(tx, "service_stops", {
            id: nid(),
            company_id: ws.company.id,
            service_id: id,
            kind: "ORIGIN",
            sequence: 0,
            name: data.origin,
            address: data.origin,
            latitude: data.origin_lat ?? null,
            longitude: data.origin_lng ?? null,
            status: "PENDING",
          });
        }
        if (data.destination) {
          await insert(tx, "service_stops", {
            id: nid(),
            company_id: ws.company.id,
            service_id: id,
            kind: "DESTINATION",
            sequence: 99,
            name: data.destination,
            address: data.destination,
            latitude: data.destination_lat ?? null,
            longitude: data.destination_lng ?? null,
            status: "PENDING",
          });
        }
      }
      await writeAudit(ws.company.id, context.userId, data.id ? "UPDATE" : "SERVICE_CREATE", "SERVICE", id, data.origin, tx);
    });
    return { id };
  });

export const assignService = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ serviceId: z.string().min(1), vehicleId: z.string().min(1), driverId: z.string().min(1), reason: z.string().optional() }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "assignments.create");
    const scopedService = await getScopedService(sql, scope, ws.company.id, data.serviceId);
    const svc = { id: scopedService.id, status: scopedService.status };
    const veh = (await sql<{ id: string; current_driver_id: string | null; status: string }>`
      select id, current_driver_id, status from vehicles where id = ${data.vehicleId} and company_id = ${ws.company.id}
    `)[0];
    const drv = (await sql<{ id: string; status: string }>`
      select id, status from drivers where id = ${data.driverId} and company_id = ${ws.company.id}
    `)[0];
    if (!veh || !drv) forbid();
    if (["MAINTENANCE", "OUT_OF_SERVICE", "INACTIVE"].includes(veh.status) || drv.status === "INACTIVE") forbid();
    const latestInspection = (await sql<{ status: string; blocks_vehicle: boolean }>`
      select status, blocks_vehicle from inspections
      where company_id = ${ws.company.id} and vehicle_id = ${veh.id}
      order by inspected_at desc limit 1
    `)[0];
    if (latestInspection?.status === "FAIL" || latestInspection?.blocks_vehicle) {
      throw new Error("La unidad tiene una inspección que bloquea nuevas asignaciones");
    }
    const activeVehicle = (await sql<{ id: string }>`
      select id from services where company_id = ${ws.company.id} and vehicle_id = ${data.vehicleId}
        and status in ('ASSIGNED','AT_ORIGIN','LOADING','LOADED','IN_TRANSIT','AT_DESTINATION','UNLOADING')
        and id <> ${svc.id} limit 1
    `)[0];
    if (activeVehicle) throw new Error("La unidad ya tiene un servicio operativo activo");
    const activeDriver = (await sql<{ id: string }>`
      select id from services where company_id = ${ws.company.id} and driver_id = ${data.driverId}
        and status in ('ASSIGNED','AT_ORIGIN','LOADING','LOADED','IN_TRANSIT','AT_DESTINATION','UNLOADING')
        and id <> ${svc.id} limit 1
    `)[0];
    if (activeDriver) throw new Error("El conductor ya tiene un servicio operativo activo");
    const previous = (await sql<{ vehicle_id: string | null; driver_id: string | null }>`
      select vehicle_id, driver_id from service_assignments
      where service_id = ${svc.id} and unassigned_at is null
      order by assigned_at desc limit 1
    `)[0];
    const plan = await planTripForService(sql, ws.company.id, svc.id); // lecturas ANTES de la transacción
    const cid = ws.company.id;
    await withTransaction(async (tx) => {
      // Re-verificación atómica de la regla de exclusividad (antes de nuestras escrituras).
      assertResourcesFree(tx, cid, svc.id, data.vehicleId, data.driverId);
      await tx`update service_assignments set unassigned_at = now()
        where service_id = ${svc.id} and unassigned_at is null`;
      await insert(tx, "service_assignments", {
        id: nid(),
        company_id: cid,
        service_id: svc.id,
        vehicle_id: data.vehicleId,
        driver_id: data.driverId,
        assigned_by: context.userId,
        reason: data.reason ?? "Asignación operativa",
      });
      await tx`
        update services set vehicle_id = ${data.vehicleId}, driver_id = ${data.driverId}, updated_at = now()
        where id = ${svc.id} and company_id = ${cid}
      `;
      if (previous?.vehicle_id && previous.vehicle_id !== data.vehicleId) {
        await tx`update vehicles set current_driver_id = null, updated_at = now()
          where id = ${previous.vehicle_id} and company_id = ${cid}
            and not exists (
              select 1 from services s where s.company_id = ${cid} and s.vehicle_id = ${previous.vehicle_id}
                and s.id <> ${svc.id}
                and s.status in ('ASSIGNED','AT_ORIGIN','LOADING','LOADED','IN_TRANSIT','AT_DESTINATION','UNLOADING')
            )`;
      }
      await tx`update vehicles set current_driver_id = ${data.driverId}, updated_at = now()
        where id = ${data.vehicleId} and company_id = ${cid}`;
      await queueTripForService(tx, cid, context.userId, {
        id: svc.id, vehicle_id: data.vehicleId, driver_id: data.driverId,
        scheduled_departure_at: scopedService.scheduled_departure_at,
      }, plan);
      if (svc.status === "PLANNED") {
        await queueStatusChange(tx, {
          companyId: cid, userId: context.userId, serviceId: svc.id, from: "PLANNED", to: "ASSIGNED",
          notes: "Unidad y operador asignados", tripId: plan.tripId,
        });
      }
      await writeAudit(cid, context.userId, "SERVICE_ASSIGN", "SERVICE", svc.id, data.vehicleId, tx);
    });
    // Eventos SOLO tras el commit.
    if (svc.status === "PLANNED") {
      publishDomainEvent({ companyId: cid, type: "SERVICE_STATUS_CHANGED", entityType: "SERVICE", entityId: svc.id, payload: { from: "PLANNED", to: "ASSIGNED" } });
    }
    publishDomainEvent({ companyId: cid, type: "SERVICE_ASSIGNED", entityType: "SERVICE", entityId: svc.id });
    return { ok: true };
  });

export const transitionService = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ serviceId: z.string().min(1), to: z.string().min(1), notes: z.string().max(2000).optional() }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "trips.update");
    const base = await getScopedService(sql, scope, ws.company.id, data.serviceId);
    const svc = {
      id: base.id,
      status: base.status,
      require_pod: base.require_pod,
      vehicle_id: base.vehicle_id,
      driver_id: base.driver_id,
    };
    if (scopeOf(ws.profile, "trips") === "ASSIGNED") {
      const veh = svc.vehicle_id
        ? (await sql<{ current_driver_id: string | null }>`select current_driver_id from vehicles where id = ${svc.vehicle_id}`)[0]
        : null;
      if (!veh || veh.current_driver_id !== ws.profile.driver_id) forbid();
    }
    const operationalStates = new Set<ServiceStatus>([
      "ASSIGNED", "AT_ORIGIN", "LOADING", "LOADED", "IN_TRANSIT", "AT_DESTINATION", "UNLOADING",
    ]);
    if (operationalStates.has(data.to as ServiceStatus) && (!svc.vehicle_id || !svc.driver_id)) {
      throw new Error("El servicio requiere unidad y conductor asignados para continuar la operación");
    }
    if (data.to === "IN_TRANSIT" && svc.vehicle_id) {
      const latestInspection = (await sql<{ status: string; blocks_vehicle: boolean }>`
        select status, blocks_vehicle from inspections
        where company_id = ${ws.company.id} and vehicle_id = ${svc.vehicle_id}
        order by inspected_at desc limit 1
      `)[0];
      if (latestInspection?.status === "FAIL" || latestInspection?.blocks_vehicle) {
        throw new Error("La unidad tiene una inspección que bloquea la salida");
      }
    }
    if (data.to === "DELIVERED" && svc.require_pod) {
      const pod = await sql<{ id: string }>`select id from delivery_evidence where service_id = ${svc.id} limit 1`;
      if (!pod[0]) throw new Error("Se requiere prueba de entrega (POD) para cerrar el servicio");
    }
    assertTransition(svc.status as ServiceStatus, data.to as ServiceStatus);
    await changeStatus(ws.company.id, context.userId, svc.id, svc.status, data.to, data.notes ?? "", {
      audit: { action: "STATUS_CHANGE", details: `${svc.status}->${data.to}` },
    });
    if (data.to === "DELIVERED") {
      publishDomainEvent({ companyId: ws.company.id, type: "DELIVERY_COMPLETED", entityType: "SERVICE", entityId: svc.id });
    }
    return { ok: true };
  });

async function changeStatus(
  companyId: string, userId: string, serviceId: string, from: string, to: string, notes: string,
  opts: { audit?: { action: string; details: string } } = {},
) {
  await withTransaction(async (tx) => {
    const tripId = await readTripId(tx, companyId, serviceId); // lectura antes de escribir
    await queueStatusChange(tx, { companyId, userId, serviceId, from, to, notes, tripId });
    if (opts.audit) await writeAudit(companyId, userId, opts.audit.action, "SERVICE", serviceId, opts.audit.details, tx);
  });
  publishDomainEvent({ companyId, type: "SERVICE_STATUS_CHANGED", entityType: "SERVICE", entityId: serviceId, payload: { from, to } });
}

export const addServiceStop = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    serviceId: z.string().min(1),
    name: z.string().trim().min(1).max(240),
    address: z.string().max(400).optional(),
    kind: z.string().trim().max(30).optional(),
    lat: z.number().gte(-90).lte(90).nullable().optional(),
    lng: z.number().gte(-180).lte(180).nullable().optional(),
  }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "stops.create");
    await getScopedService(sql, scope, ws.company.id, data.serviceId);
    if (!data.name.trim()) throw new Error("La parada requiere nombre");
    const seq = await sql<{ n: number }>`select coalesce(max(sequence),0)::int as n from service_stops where service_id = ${data.serviceId}`;
    const stopId = nid();
    const sequence = (seq[0]?.n ?? 0) + 1;
    const tripId = await readTripId(sql, ws.company.id, data.serviceId);
    await withTransaction(async (tx) => {
      await insert(tx, "service_stops", {
        id: stopId,
        company_id: ws.company.id,
        service_id: data.serviceId,
        kind: data.kind ?? "WAYPOINT",
        sequence,
        name: data.name,
        address: data.address ?? data.name,
        latitude: data.lat ?? null,
        longitude: data.lng ?? null,
        status: "PENDING",
      });
      if (tripId) {
        await insert(tx, "trip_stops", {
          id: nid(),
          company_id: ws.company.id,
          trip_id: tripId,
          service_stop_id: stopId,
          sequence,
          status: "PENDING",
          planned_arrival: null,
        });
      }
    });
    return { ok: true, id: stopId };
  });

export const createPod = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    serviceId: z.string().min(1),
    receiver_name: z.string().trim().min(1).max(160),
    receiver_document: z.string().max(120).optional(),
    comments: z.string().max(2000).optional(),
    signature: z.string().max(2_000_000).optional(),
    photo_url: z.string().max(10_000).optional(),
    photo_key: z.string().max(300).optional(),
    latitude: z.number().gte(-90).lte(90).nullable().optional(),
    longitude: z.number().gte(-180).lte(180).nullable().optional(),
  }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "pod.create");
    const svc = await getScopedService(sql, scope, ws.company.id, data.serviceId);
    if (scopeOf(ws.profile, "pod") === "ASSIGNED" && svc.driver_id !== ws.profile.driver_id) forbid();
    if (!data.receiver_name.trim()) throw new Error("El receptor es obligatorio");
    // La clave de Storage debe ser de ESTA empresa y de ESTE servicio (nunca una ruta elegida por el cliente).
    if (data.photo_key && !keyBelongsTo(data.photo_key, ws.company.id, "POD", svc.id)) forbid();
    if ((svc.status === "DELIVERED" || svc.status === "CANCELLED") && scopeOf(ws.profile, "pod") === "ASSIGNED") forbid();
    const id = nid();
    const tripId = svc.status === "UNLOADING" ? await readTripId(sql, ws.company.id, svc.id) : null;
    // POD + parada + cambio de estado + auditoría: TODO o NADA.
    await withTransaction(async (tx) => {
      await insert(tx, "delivery_evidence", {
        id,
        company_id: ws.company.id,
        service_id: svc.id,
        receiver_name: data.receiver_name,
        receiver_document: data.receiver_document ?? "",
        signature: data.signature ?? "",
        photo_url: data.photo_url ?? "",
        photo_key: data.photo_key ?? "",
        comments: data.comments ?? "",
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        captured_by: context.userId,
      });
      await tx`update service_stops set status = 'COMPLETED', actual_arrival = coalesce(actual_arrival, now()), actual_departure = coalesce(actual_departure, now())
        where service_id = ${svc.id} and company_id = ${ws.company.id} and kind = 'DESTINATION'`;
      if (svc.status === "UNLOADING") {
        await queueStatusChange(tx, {
          companyId: ws.company.id, userId: context.userId, serviceId: svc.id,
          from: svc.status, to: "DELIVERED", notes: "POD registrado", tripId,
        });
      }
      await writeAudit(ws.company.id, context.userId, "DELIVERY_COMPLETE", "SERVICE", svc.id, data.receiver_name, tx);
    });
    if (svc.status === "UNLOADING") {
      publishDomainEvent({ companyId: ws.company.id, type: "SERVICE_STATUS_CHANGED", entityType: "SERVICE", entityId: svc.id, payload: { from: svc.status, to: "DELIVERED" } });
      publishDomainEvent({ companyId: ws.company.id, type: "DELIVERY_COMPLETED", entityType: "SERVICE", entityId: svc.id });
    }
    return { id };
  });

const loadInput = z.object({
  id: z.string().optional(),
  serviceId: z.string().min(1),
  loadNumber: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  weightKg: z.number().nonnegative().optional(),
  volumeM3: z.number().nonnegative().optional(),
  pieces: z.number().int().nonnegative().optional(),
  status: z.string().max(40).optional(),
  reference: z.string().max(120).optional(),
});

export const listLoads = createServerFn({ method: "GET" })
  .inputValidator((d: { serviceId?: string } | undefined) => d ?? {})
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "services.read");
    let rows = await sql<{ id: string; service_id: string; load_number: string; description: string; weight_kg: number; volume_m3: number; pieces: number; status: string; reference: string; created_at: string }>`
      select * from service_loads where company_id = ${ws.company.id} order by created_at desc limit 300
    `;
    if (data.serviceId) {
      await getScopedService(sql, scope, ws.company.id, data.serviceId);
      rows = rows.filter((r) => r.service_id === data.serviceId);
    } else {
      const services = await sql<{ id: string; client_id: string | null; vehicle_id: string | null; driver_id: string | null }>`select id, client_id, vehicle_id, driver_id from services where company_id = ${ws.company.id}`;
      const visible = new Set(services.filter((r) => serviceVisible(scope, r)).map((r) => r.id));
      rows = rows.filter((r) => visible.has(r.service_id));
    }
    return rows;
  });

export const upsertLoad = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => loadInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "services.update");
    const service = await getScopedService(sql, scope, ws.company.id, data.serviceId);
    const existing = data.id ? (await sql<{ id: string }>`select id from service_loads where id = ${data.id} and company_id = ${ws.company.id} and service_id = ${service.id}`)[0] : null;
    if (data.id && !existing) forbid();
    const duplicate = await sql<{ id: string }>`select id from service_loads where company_id = ${ws.company.id} and load_number = ${data.loadNumber.trim()} and id <> ${data.id ?? ""} limit 1`;
    if (duplicate[0]) throw new Error("El número de carga ya existe");
    const id = data.id ?? nid();
    await withTransaction(async (tx) => {
    if (data.id) {
      await tx`update service_loads set load_number=${data.loadNumber.trim()}, description=${data.description ?? ""}, weight_kg=${data.weightKg ?? 0}, volume_m3=${data.volumeM3 ?? 0}, pieces=${data.pieces ?? 0}, status=${data.status ?? "PLANNED"}, reference=${data.reference ?? ""} where id=${id} and company_id=${ws.company.id}`;
    } else {
      await insert(tx, "service_loads", { id, company_id: ws.company.id, service_id: service.id, load_number: data.loadNumber.trim(), description: data.description ?? "", weight_kg: data.weightKg ?? 0, volume_m3: data.volumeM3 ?? 0, pieces: data.pieces ?? 0, status: data.status ?? "PLANNED", reference: data.reference ?? "", created_by: context.userId });
    }
    await writeAudit(ws.company.id, context.userId, data.id ? "LOAD_UPDATE" : "LOAD_CREATE", "LOAD", id, service.service_number, tx);
    });
    return { id };
  });

const incidentInput = z.object({
  id: z.string().min(1).optional(),
  serviceId: z.string().min(1).nullable().optional(),
  vehicleId: z.string().min(1).nullable().optional(),
  driverId: z.string().min(1).nullable().optional(),
  type: z.string().min(1).max(40),
  severity: z.string().min(1).max(20),
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  occurredAt: dateTime.optional(),
  clientVisible: z.boolean().optional(),
});

export const listIncidents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "incidents.read");
    let rows = await sql<any>`
      select i.*, v.economic_number as vehicle_number, d.name as driver_name, s.service_number
      from incidents i
      left join vehicles v on v.id = i.vehicle_id
      left join drivers d on d.id = i.driver_id
      left join services s on s.id = i.service_id
      where i.company_id = ${ws.company.id}
      order by i.occurred_at desc limit 300
    `;
    const services = await sql<{ id: string; client_id: string | null; vehicle_id: string | null; driver_id: string | null }>`select id, client_id, vehicle_id, driver_id from services where company_id = ${ws.company.id}`;
    const visibleServices = new Set(services.filter((r) => serviceVisible(scope, r)).map((r) => r.id));
    rows = rows.filter((r: any) => {
      if (r.service_id) return visibleServices.has(r.service_id);
      if (r.vehicle_id) return !scope.allowedVehicleIds || scope.allowedVehicleIds.includes(r.vehicle_id);
      if (r.driver_id) return !scope.allowedDriverIds || scope.allowedDriverIds.includes(r.driver_id);
      return getResourceScope(scope, "incidents") === "COMPANY";
    });
    if (scopeOf(ws.profile, "services") === "CLIENT") {
      return rows.filter((r: any) => r.client_visible === true);
    }
    return rows;
  });

export const createIncident = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => incidentInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "incidents.create");
    if (data.serviceId) {
      const service = await getScopedService(sql, scope, ws.company.id, data.serviceId);
      if (data.vehicleId && service.vehicle_id && data.vehicleId !== service.vehicle_id) forbid();
      if (data.driverId && service.driver_id && data.driverId !== service.driver_id) forbid();
    }
    if (data.vehicleId) constrainFilters(scope, { vehicleId: data.vehicleId });
    if (data.driverId) constrainFilters(scope, { driverId: data.driverId });
    if (scopeOf(ws.profile, "incidents") === "OWN" && !data.serviceId && !data.vehicleId && !data.driverId) forbid();
    const id = nid();
    const clientVisible = Boolean(data.clientVisible) && scopeOf(ws.profile, "incidents") === "COMPANY";
    await withTransaction(async (tx) => {
    await insert(tx, "incidents", { id, company_id: ws.company.id, service_id: data.serviceId ?? null, vehicle_id: data.vehicleId ?? null, driver_id: data.driverId ?? null, type: data.type.toUpperCase(), severity: data.severity.toUpperCase(), status: "OPEN", title: data.title.trim(), description: data.description ?? "", occurred_at: data.occurredAt ?? new Date().toISOString(), client_visible: clientVisible, created_by: context.userId });
    await writeAudit(ws.company.id, context.userId, "INCIDENT_CREATE", "INCIDENT", id, data.title, tx);
    });
    const incidentTitle = `Nueva incidencia: ${data.title.trim()}`;
    const incidentBody = data.description?.trim() || `Incidencia de severidad ${data.severity.toUpperCase()}`;
    await Promise.all(
      (["ADMIN", "OPERADOR"] as const).map((audienceRole) =>
        notify({
          companyId: ws.company.id,
          title: incidentTitle,
          body: incidentBody,
          kind: "INCIDENT",
          entityId: id,
          audienceRole,
        }),
      ),
    );
    publishDomainEvent({ companyId: ws.company.id, type: "INCIDENT_CREATED", entityType: "INCIDENT", entityId: id });
    return { id };
  });

export const resolveIncident = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "incidents.update");
    const row = (await sql<{ id: string; service_id: string | null; vehicle_id: string | null; driver_id: string | null }>`select id, service_id, vehicle_id, driver_id from incidents where id=${data.id} and company_id=${ws.company.id}`)[0];
    if (!row) forbid();
    if (row.service_id) await getScopedService(sql, scope, ws.company.id, row.service_id);
    if (row.vehicle_id) constrainFilters(scope, { vehicleId: row.vehicle_id });
    if (row.driver_id) constrainFilters(scope, { driverId: row.driver_id });
    await withTransaction(async (tx) => {
      await tx`update incidents set status='RESOLVED', resolved_at=now(), resolved_by=${context.userId} where id=${row.id} and company_id=${ws.company.id}`;
      await writeAudit(ws.company.id, context.userId, "INCIDENT_RESOLVE", "INCIDENT", row.id, "", tx);
    });
    return { ok: true };
  });

const routePlanInput = z.object({
  serviceId: z.string().min(1),
  distanceKm: z.number().nonnegative().optional(),
  durationMin: z.number().nonnegative().optional(),
  points: z.array(z.object({ latitude: z.number().gte(-90).lte(90), longitude: z.number().gte(-180).lte(180) })).min(2),
});

export const upsertRoutePlan = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => routePlanInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "services.update");
    const service = await getScopedService(sql, scope, ws.company.id, data.serviceId);
    const distanceKm =
      data.distanceKm ??
      data.points.slice(1).reduce(
        (sum, p, i) =>
          sum +
          haversineKm(
            { lat: data.points[i]!.latitude, lng: data.points[i]!.longitude },
            { lat: p.latitude, lng: p.longitude },
          ),
        0,
      );
    const durationMin = data.durationMin ?? (distanceKm / 70) * 60;
    const planId = nid();
    // Reemplazo del plan (borrar + insertar puntos + actualizar servicio + auditoría): TODO o NADA.
    await withTransaction(async (tx) => {
      await tx`delete from route_plans where service_id = ${service.id} and company_id = ${ws.company.id}`;
      await insert(tx, "route_plans", { id: planId, company_id: ws.company.id, service_id: service.id, distance_km: distanceKm, duration_min: durationMin, polyline: JSON.stringify(data.points.map((point) => ({ lat: point.latitude, lng: point.longitude }))) });
      for (const [index, point] of data.points.entries()) {
        await insert(tx, "route_points", { id: nid(), route_plan_id: planId, sequence: index, latitude: point.latitude, longitude: point.longitude });
      }
      await tx`update services set planned_distance_km = ${distanceKm}, planned_duration_min = ${durationMin}, updated_at = now() where id = ${service.id} and company_id = ${ws.company.id}`;
      await writeAudit(ws.company.id, context.userId, "ROUTE_PLAN_UPSERT", "SERVICE", service.id, `${distanceKm.toFixed(1)} km`, tx);
    });
    return { id: planId, distanceKm, durationMin };
  });

export const addServiceCost = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ serviceId: z.string().min(1), kind: z.string().min(1), amount: z.number().nonnegative(), notes: z.string().optional() }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "services.update");
    const service = await getScopedService(sql, scope, ws.company.id, data.serviceId);
    const id = nid();
    await withTransaction(async (tx) => {
      await insert(tx, "service_cost_lines", { id, company_id: ws.company.id, service_id: service.id, kind: data.kind.trim().toUpperCase(), amount: data.amount, notes: data.notes ?? "" });
      await writeAudit(ws.company.id, context.userId, "SERVICE_COST", "SERVICE", service.id, `${data.kind}: ${data.amount}`, tx);
    });
    return { id };
  });

const maintenanceOrderInput = z.object({
  id: z.string().min(1),
  observations: z.string().max(3000).optional(),
});

export const closeMaintenanceOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => maintenanceOrderInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "maintenance.update");
    const order = (await sql<{ id: string; vehicle_id: string }>`select id, vehicle_id from maintenance_orders where id = ${data.id} and company_id = ${ws.company.id}`)[0];
    if (!order) forbid();
    constrainFilters(scope, { vehicleId: order.vehicle_id });
    // Lecturas ANTES de escribir (no dependen de esta orden: se excluye por id).
    const remaining = await sql<{ id: string }>`
      select id from maintenance_orders
      where company_id = ${ws.company.id} and vehicle_id = ${order.vehicle_id}
        and status <> 'CLOSED' and id <> ${order.id}
      limit 1
    `;
    const latestInspection = remaining[0]
      ? undefined
      : (await sql<{ status: string; blocks_vehicle: boolean }>`
          select status, blocks_vehicle from inspections
          where company_id = ${ws.company.id} and vehicle_id = ${order.vehicle_id}
          order by inspected_at desc limit 1
        `)[0];
    const releaseVehicle = !remaining[0] && latestInspection?.status !== "FAIL" && !latestInspection?.blocks_vehicle;
    await withTransaction(async (tx) => {
      await tx`update maintenance_orders set status = 'CLOSED', closed_at = coalesce(closed_at, now()), observations = coalesce(${data.observations ?? null}, observations) where id = ${order.id} and company_id = ${ws.company.id}`;
      if (releaseVehicle) {
        // La condición not exists se re-evalúa DENTRO de la transacción (otra orden abierta entre tanto).
        await tx`update vehicles set status = 'ACTIVE', updated_at = now()
          where id = ${order.vehicle_id} and company_id = ${ws.company.id} and status = 'MAINTENANCE'
            and not exists (select 1 from maintenance_orders where company_id = ${ws.company.id} and vehicle_id = ${order.vehicle_id} and status <> 'CLOSED' and id <> ${order.id})`;
      }
      await writeAudit(ws.company.id, context.userId, "MAINTENANCE_CLOSE", "MAINTENANCE", order.id, "", tx);
    });
    return { ok: true };
  });

export const listDocuments = createServerFn({ method: "GET" })
  .inputValidator((d: { ownerType?: string; ownerId?: string } | undefined) => d ?? {})
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "documents.read");
    const ownerType = data.ownerType?.trim().toUpperCase();
    let rows = await sql<DocumentRow>`
      select id, owner_type, owner_id, document_type, title, file_url, issued_at::text as issued_at,
             expires_at::text as expires_at, status
      from documents where company_id = ${ws.company.id}
      order by created_at desc limit 500
    `;
    const privileged = scopeOf(ws.profile, "documents") === "COMPANY";
    if (!privileged) {
      const visibleVehicles = new Set(scope.allowedVehicleIds ?? []);
      const services = await sql<{ id: string; client_id: string | null; vehicle_id: string | null; driver_id: string | null }>`
        select id, client_id, vehicle_id, driver_id from services where company_id = ${ws.company.id}`;
      const visibleServices = new Set(services.filter((r) => serviceVisible(scope, r)).map((r) => r.id));
      rows = rows.filter((r) => {
        if (r.owner_type === "VEHICLE") return visibleVehicles.has(r.owner_id);
        if (r.owner_type === "DRIVER") return scope.forcedDriverId === r.owner_id;
        if (r.owner_type === "CLIENT") return scope.forcedClientId === r.owner_id;
        if (r.owner_type === "SERVICE") return visibleServices.has(r.owner_id);
        return false;
      });
    }
    if (ownerType) rows = rows.filter((r) => r.owner_type.toUpperCase() === ownerType);
    if (data.ownerId) {
      if (!rows.some((r) => r.owner_id === data.ownerId)) return [];
      rows = rows.filter((r) => r.owner_id === data.ownerId);
    }
    return rows;
  });

const documentInput = z.object({
  owner_type: z.string().trim().min(1).max(30),
  owner_id: z.string().trim().min(1),
  document_type: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(240),
  file_url: z.string().max(2000).optional(),
  storage_key: z.string().max(300).optional(),
  issued_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const upsertDocument = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => documentInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, sql } = await ctx(context.userId);
    await authorize(ws.profile, perm("documents", (data as { id?: unknown }).id));
    const ownerType = data.owner_type.trim().toUpperCase();
    if (!data.owner_id.trim() || !data.document_type.trim() || !data.title.trim()) throw new Error("Datos de documento incompletos");
    if (data.issued_at && data.expires_at && new Date(data.expires_at).getTime() < new Date(data.issued_at).getTime()) {
      throw new Error("La fecha de vencimiento no puede ser anterior a la emisión");
    }
    const tables: Record<string, string> = { CLIENT: "clients", DRIVER: "drivers", VEHICLE: "vehicles", FLEET: "fleets", SERVICE: "services" };
    const table = tables[ownerType];
    if (!table) throw new Error("Tipo de propietario inválido");
    const owner = await sql.query(`select id from ${table} where id = $1 and company_id = $2 limit 1`, [data.owner_id, ws.company.id]);
    if (!owner[0]) forbid();
    // Enlaces externos solo https; archivos propios solo por clave de Storage privado de ESTA empresa.
    if (data.file_url && !isHttpsUrl(data.file_url)) throw new Error("El enlace debe ser https");
    if (data.storage_key && !keyBelongsTo(data.storage_key, ws.company.id, "DOCUMENT")) forbid();
    const id = nid();
    await withTransaction(async (tx) => {
      await insert(tx, "documents", {
        id, company_id: ws.company.id, owner_type: ownerType, owner_id: data.owner_id,
        document_type: data.document_type.trim(), title: data.title.trim(), file_url: data.file_url ?? "", storage_key: data.storage_key ?? "",
        issued_at: data.issued_at ?? null, expires_at: data.expires_at ?? null,
        status: data.expires_at && new Date(data.expires_at).getTime() < Date.now() ? "EXPIRED" : "VALID",
        created_by: context.userId,
      });
      await writeAudit(ws.company.id, context.userId, "DOCUMENT_UPLOAD", "DOCUMENT", id, data.title, tx);
    });
    return { id };
  });

export const listMaintenance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "maintenance.read");
    let rows = await sql<MaintenanceOrder>`
      select o.*, v.economic_number as vehicle_number
      from maintenance_orders o join vehicles v on v.id = o.vehicle_id
      where o.company_id = ${ws.company.id}
      order by o.opened_at desc limit 200
    `;
    if (scope.allowedVehicleIds) rows = rows.filter((r) => scope.allowedVehicleIds!.includes(r.vehicle_id));
    let plans = await sql<{
      id: string;
      vehicle_id: string;
      title: string;
      kind: string;
      next_due_at: string | null;
      next_due_km: number | null;
      status: string;
      vehicle_number: string | null;
    }>`
      select p.id, p.vehicle_id, p.title, p.kind, p.next_due_at::text as next_due_at, p.next_due_km, p.status,
             v.economic_number as vehicle_number
      from maintenance_plans p join vehicles v on v.id = p.vehicle_id
      where p.company_id = ${ws.company.id}
    `;
    if (scope.allowedVehicleIds) plans = plans.filter((p) => scope.allowedVehicleIds!.includes(p.vehicle_id));
    return { orders: rows, plans };
  });

const maintenanceInput = z.object({
  vehicle_id: z.string().min(1),
  title: z.string().trim().min(2).max(240),
  kind: z.string().trim().max(40).optional(),
  vendor: z.string().max(180).optional(),
  labor_cost: z.number().nonnegative().max(1_000_000).optional(),
  parts_cost: z.number().nonnegative().max(1_000_000).optional(),
  odometer_km: z.number().nonnegative().max(10_000_000).optional(),
  observations: z.string().max(3000).optional(),
});

export const upsertMaintenanceOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => maintenanceInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, perm("maintenance", (data as { id?: unknown }).id));
    constrainFilters(scope, { vehicleId: data.vehicle_id });
    const veh = (await sql<{ id: string; odometer_km: number }>`
      select id, odometer_km from vehicles where id = ${data.vehicle_id} and company_id = ${ws.company.id}
    `)[0];
    if (!veh) forbid();
    const activeService = (await sql<{ id: string }>`
      select id from services
      where company_id = ${ws.company.id} and vehicle_id = ${veh.id}
        and status in ('ASSIGNED','AT_ORIGIN','LOADING','LOADED','IN_TRANSIT','AT_DESTINATION','UNLOADING')
      limit 1
    `)[0];
    if (activeService) throw new Error("La unidad tiene un servicio operativo activo");
    const labor = data.labor_cost ?? 0;
    const parts = data.parts_cost ?? 0;
    const id = nid();
    // Orden + unidad a MANTENIMIENTO + auditoría: TODO o NADA, con re-verificación atómica del servicio activo.
    await withTransaction(async (tx) => {
      assertVehicleHasNoActiveService(tx, ws.company.id, veh.id);
      await insert(tx, "maintenance_orders", {
        id,
        company_id: ws.company.id,
        vehicle_id: veh.id,
        kind: data.kind ?? "CORRECTIVE",
        title: data.title,
        vendor: data.vendor ?? "",
        labor_cost: labor,
        parts_cost: parts,
        total_cost: labor + parts,
        odometer_km: data.odometer_km ?? veh.odometer_km,
        observations: data.observations ?? "",
        created_by: context.userId,
      });
      await tx`update vehicles set status = 'MAINTENANCE', updated_at = now() where id = ${veh.id} and company_id = ${ws.company.id}`;
      await writeAudit(ws.company.id, context.userId, "MAINTENANCE_CREATE", "MAINTENANCE", id, veh.id, tx);
    });
    return { id };
  });

export const listFuel = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "fuel.read");
    let rows = await sql<FuelTransaction>`
      select f.*, v.economic_number as vehicle_number
      from fuel_transactions f join vehicles v on v.id = f.vehicle_id
      where f.company_id = ${ws.company.id}
      order by f.transaction_at desc limit 200
    `;
    if (scope.allowedVehicleIds) rows = rows.filter((r) => scope.allowedVehicleIds!.includes(r.vehicle_id));
    return rows;
  });

const fuelInput = z.object({
  vehicle_id: z.string().min(1),
  liters: z.number().positive().max(10000),
  price_per_liter: z.number().nonnegative().max(1000),
  odometer: z.number().nonnegative().max(10_000_000).optional(),
  station: z.string().max(180).optional(),
  fuel_type: z.string().trim().max(30).optional(),
  driver_id: z.string().min(1).nullable().optional(),
  service_id: z.string().min(1).nullable().optional(),
});

export const upsertFuel = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => fuelInput.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, perm("fuel", (data as { id?: unknown }).id));
    const veh = (await sql<{ id: string }>`select id from vehicles where id = ${data.vehicle_id} and company_id = ${ws.company.id}`)[0];
    if (!veh) forbid();
    constrainFilters(scope, { vehicleId: data.vehicle_id });
    if (data.driver_id) {
      constrainFilters(scope, { driverId: data.driver_id });
      const driver = (await sql<{ id: string }>`select id from drivers where id = ${data.driver_id} and company_id = ${ws.company.id}`)[0];
      if (!driver) forbid();
    }
    if (data.service_id) {
      const service = await getScopedService(sql, scope, ws.company.id, data.service_id);
      if (service.vehicle_id && service.vehicle_id !== data.vehicle_id) forbid();
      if (data.driver_id && service.driver_id && service.driver_id !== data.driver_id) forbid();
    }
    const id = nid();
    await insert(sql, "fuel_transactions", {
      id,
      company_id: ws.company.id,
      vehicle_id: data.vehicle_id,
      driver_id: data.driver_id ?? null,
      service_id: data.service_id ?? null,
      liters: data.liters,
      price_per_liter: data.price_per_liter,
      total: data.liters * data.price_per_liter,
      odometer: data.odometer ?? 0,
      station: data.station ?? "",
      fuel_type: data.fuel_type ?? "DIESEL",
      created_by: context.userId,
    });
    return { id };
  });

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "alerts.read");
    let rows = await sql<AlertRow & { vehicle_id: string | null; driver_id: string | null; service_id: string | null }>`
      select id, type, severity, status, title, body, entity_type, entity_id, created_at, acknowledged_at, resolved_at,
             vehicle_id, driver_id, service_id
      from alerts where company_id = ${ws.company.id}
      order by created_at desc limit 300
    `;
    if (scope.forcedClientId || scope.forcedDriverId || scope.allowedVehicleIds) {
      const services = await sql<{ id: string; client_id: string | null; vehicle_id: string | null; driver_id: string | null }>`
        select id, client_id, vehicle_id, driver_id from services where company_id = ${ws.company.id}`;
      const serviceIds = new Set(services.filter((s) => serviceVisible(scope, s)).map((s) => s.id));
      rows = rows.filter((r) => {
        if (r.vehicle_id && scope.allowedVehicleIds) return scope.allowedVehicleIds.includes(r.vehicle_id);
        if (r.driver_id && scope.forcedDriverId) return r.driver_id === scope.forcedDriverId;
        if (r.service_id) return serviceIds.has(r.service_id);
        return false;
      });
    }
    if (scopeOf(ws.profile, "alerts") === "CLIENT") {
      const clientAlertTypes = new Set(["ETA_DELAY", "ROUTE_DEVIATION"]);
      return rows.filter((r) => clientAlertTypes.has(r.type));
    }
    return rows;
  });

export const ackAlert = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; resolve?: boolean }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "alerts.update");
    const alert = (await sql<{ vehicle_id: string | null; driver_id: string | null; service_id: string | null }>`
      select vehicle_id, driver_id, service_id from alerts where id = ${data.id} and company_id = ${ws.company.id}
    `)[0];
    if (!alert) forbid();
    if (alert.vehicle_id) constrainFilters(scope, { vehicleId: alert.vehicle_id });
    if (alert.driver_id) constrainFilters(scope, { driverId: alert.driver_id });
    if (alert.service_id) await getScopedService(sql, scope, ws.company.id, alert.service_id);
    await withTransaction(async (tx) => {
      if (data.resolve) {
        await tx`update alerts set status = 'RESOLVED', resolved_at = now(), acknowledged_at = coalesce(acknowledged_at, now())
          where id = ${data.id} and company_id = ${ws.company.id}`;
      } else {
        await tx`update alerts set status = 'ACKED', acknowledged_at = now()
          where id = ${data.id} and company_id = ${ws.company.id}`;
      }
      await writeAudit(ws.company.id, context.userId, data.resolve ? "ALERT_RESOLVE" : "ALERT_ACK", "ALERT", data.id, "", tx);
    });
  });

export const fuelMetrics = createServerFn({ method: "GET" })
  .inputValidator((d: { vehicleId: string } ) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { ws, scope, sql } = await ctx(context.userId);
    await authorize(ws.profile, "fuel.read");
    constrainFilters(scope, { vehicleId: data.vehicleId });
    const rows = await sql<FuelTransaction>`
      select * from fuel_transactions where company_id = ${ws.company.id} and vehicle_id = ${data.vehicleId}
      order by odometer asc
    `;
    let km = 0;
    let liters = 0;
    let cost = 0;
    for (let i = 1; i < rows.length; i++) {
      const dOdo = Number(rows[i]!.odometer) - Number(rows[i - 1]!.odometer);
      if (dOdo > 0 && dOdo < 2000) km += dOdo;
      liters += Number(rows[i]!.liters);
      cost += Number(rows[i]!.total);
    }
    if (rows[0]) {
      liters = rows.reduce((s, r) => s + Number(r.liters), 0);
      cost = rows.reduce((s, r) => s + Number(r.total), 0);
    }
    return {
      km_per_liter: liters > 0 && km > 0 ? Math.round((km / liters) * 10) / 10 : 0,
      cost_per_km: km > 0 ? Math.round((cost / km) * 100) / 100 : 0,
      liters_per_100km: km > 0 ? Math.round((liters / km) * 1000) / 10 : 0,
      liters,
      cost,
    };
  });

