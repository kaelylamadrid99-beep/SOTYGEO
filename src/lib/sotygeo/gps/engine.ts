import { getSql, withTransaction } from "@/lib/db";
import { motionFrom, parsePolygon, pointInCircle, pointInPolygon } from "@/lib/geo";
import { insert, nid, notify } from "../db";
import { publishDomainEvent } from "../events/bus";
import type { GpsFix } from "../types";
import { simulatorProvider, type SimVehicle } from "./provider";
import { computeOdometerDelta, eventKey } from "./odometer";
import { assertFixTime, isCorruptFix } from "./validate";
import { detectFenceTransition } from "./fence";

export { detectFenceTransition } from "./fence";

function insideFence(
  lat: number,
  lng: number,
  fence: { lat: number; lng: number; radius_m: number; polygon: string },
): boolean {
  const ring = parsePolygon(fence.polygon);
  if (ring.length >= 3) return pointInPolygon({ lat, lng }, ring);
  return pointInCircle({ lat, lng }, fence);
}

const tickLocks = new Map<string, Promise<void>>();
const fenceDebounce = new Map<string, number>();

export type IngestResult = { ingested: boolean; duplicate?: boolean; reason?: string };

/** Sentinellas de control de flujo: abortan la transacción sin ser errores reales. */
class DuplicateFix extends Error {}
class ReplayedSequence extends Error {}

export async function ingestFix(
  companyId: string,
  fix: GpsFix & { eventId?: string | null; sequence?: number | null; odometerKm?: number | null },
): Promise<IngestResult> {
  if (isCorruptFix(fix.latitude, fix.longitude)) return { ingested: false, reason: "corrupt" };
  try {
    assertFixTime(fix.recordedAt);
  } catch (err) {
    return { ingested: false, reason: err instanceof Error ? err.message : "timestamp" };
  }

  const sql = await getSql();
  const vehicles = await sql<{
    id: string;
    economic_number: string;
    current_driver_id: string | null;
    speed_limit_kmh: number;
    current_latitude: number | null;
    current_longitude: number | null;
    last_gps_at: string | null;
    odometer_km: number;
    motion_state: string;
  }>`
    select id, economic_number, current_driver_id, speed_limit_kmh, current_latitude, current_longitude,
           last_gps_at, odometer_km, motion_state
    from vehicles where id = ${fix.vehicleId} and company_id = ${companyId}
  `;
  const vehicle = vehicles[0];
  if (!vehicle) return { ingested: false, reason: "vehicle_missing" };

  const key = eventKey({
    deviceId: fix.deviceId || fix.vehicleId,
    eventId: fix.eventId,
    sequence: fix.sequence,
    recordedAt: fix.recordedAt,
    latitude: fix.latitude,
    longitude: fix.longitude,
  });

  const motion = motionFrom(fix.speed, fix.recordedAt);
  const odo = computeOdometerDelta({
    from:
      vehicle.current_latitude != null && vehicle.current_longitude != null
        ? { lat: Number(vehicle.current_latitude), lng: Number(vehicle.current_longitude) }
        : null,
    to: { lat: fix.latitude, lng: fix.longitude },
    fromAt: vehicle.last_gps_at,
    toAt: fix.recordedAt,
    reportedSpeedKmh: fix.speed,
    deviceOdometerKm: fix.odometerKm,
    previousOdometerKm: Number(vehicle.odometer_km) || 0,
  });

  // Transacción integral: claim idempotente + secuencia + posición + estado del
  // vehículo/dispositivo se confirman TODO o NADA. Dos ingestas concurrentes del
  // mismo dispositivo no pueden producir posiciones huérfanas ni retroceder
  // last_sequence: el guard `last_sequence < $seq` dentro del UPDATE hace la
  // comprobación y el avance atómicos (resuelve la carrera read-then-write).
  try {
    await withTransaction(async (tx) => {
      if (fix.deviceId) {
        const claimed = await tx.query<{ id: string }>(
          `insert into gps_ingest_events (id, company_id, device_id, event_key, recorded_at)
           values ($1, $2, $3, $4, $5)
           on conflict (device_id, event_key) do nothing
           returning id`,
          [nid(), companyId, fix.deviceId, key, fix.recordedAt],
        );
        if (!claimed[0]) throw new DuplicateFix();

        if (fix.sequence != null) {
          const advanced = await tx.query<{ id: string }>(
            `update gps_devices
             set last_event_key = $1, last_ingest_at = now(), last_recorded_at = $2,
                 last_sequence = $3, status = 'ONLINE', updated_at = now()
             where id = $4 and company_id = $5
               and (last_sequence is null or last_sequence < $3)
             returning id`,
            [key, fix.recordedAt, fix.sequence, fix.deviceId, companyId],
          );
          if (!advanced[0]) throw new ReplayedSequence();
        } else {
          await tx`
            update gps_devices
            set last_event_key = ${key}, last_ingest_at = now(), last_recorded_at = ${fix.recordedAt},
                status = 'ONLINE', updated_at = now()
            where id = ${fix.deviceId} and company_id = ${companyId}
          `;
        }
      }

      await insert(tx, "gps_positions", {
        id: nid(),
        company_id: companyId,
        vehicle_id: fix.vehicleId,
        gps_device_id: fix.deviceId,
        latitude: fix.latitude,
        longitude: fix.longitude,
        speed: fix.speed,
        heading: fix.heading,
        altitude: fix.altitude,
        accuracy: fix.accuracy,
        recorded_at: fix.recordedAt,
        source: fix.source ?? "LIVE",
        odometer_km: odo.nextOdometerKm,
      });

      // El estado "actual" del vehículo solo avanza hacia adelante: un paquete
      // con timestamp viejo se conserva como historia (gps_positions) pero no
      // puede retroceder posición/odómetro/estado (jitter o reordenamiento).
      await tx`
        update vehicles
        set current_latitude = ${fix.latitude},
            current_longitude = ${fix.longitude},
            last_speed = ${fix.speed},
            last_heading = ${fix.heading},
            last_gps_at = ${fix.recordedAt},
            motion_state = ${motion},
            odometer_km = ${odo.nextOdometerKm},
            updated_at = ${fix.recordedAt}
        where id = ${fix.vehicleId} and company_id = ${companyId}
          and (last_gps_at is null or last_gps_at < ${fix.recordedAt})
      `;
    });
  } catch (err) {
    if (err instanceof DuplicateFix) return { ingested: false, duplicate: true, reason: "duplicate" };
    if (err instanceof ReplayedSequence) {
      // Fuera de la transacción (ya revertida): registrar el rechazo sin dejar rastro del claim.
      await insert(sql, "gps_ingest_errors", { id: nid(), company_id: companyId, imei: "", reason: "replay_sequence" });
      return { ingested: false, reason: "replay_sequence" };
    }
    throw err;
  }

  publishDomainEvent({
    companyId,
    type: "GPS_POSITION_UPDATED",
    entityType: "VEHICLE",
    entityId: vehicle.id,
    payload: { speed: fix.speed, lat: fix.latitude, lng: fix.longitude, motion },
  });
  if (motion !== vehicle.motion_state) {
    publishDomainEvent({
      companyId,
      type: "VEHICLE_STATUS_CHANGED",
      entityType: "VEHICLE",
      entityId: vehicle.id,
      payload: { from: vehicle.motion_state, to: motion },
    });
  }

  if (fix.speed > Number(vehicle.speed_limit_kmh) + 0.5) {
    await insert(sql, "speed_alerts", {
      id: nid(),
      company_id: companyId,
      vehicle_id: vehicle.id,
      driver_id: vehicle.current_driver_id,
      speed: fix.speed,
      limit_kmh: vehicle.speed_limit_kmh,
      latitude: fix.latitude,
      longitude: fix.longitude,
      recorded_at: fix.recordedAt,
    });
    await insertAlert(companyId, {
      type: "SPEEDING",
      severity: fix.speed > Number(vehicle.speed_limit_kmh) + 20 ? "CRITICAL" : "WARNING",
      title: `Exceso de velocidad ${vehicle.economic_number}`,
      body: `${Math.round(fix.speed)} km/h (límite ${vehicle.speed_limit_kmh})`,
      entityType: "VEHICLE",
      entityId: vehicle.id,
      vehicleId: vehicle.id,
      driverId: vehicle.current_driver_id,
    });
    await notify({
      companyId,
      title: `Exceso de velocidad ${vehicle.economic_number}`,
      body: `${Math.round(fix.speed)} km/h (límite ${vehicle.speed_limit_kmh})`,
      kind: "VEHICLE_ALERT",
      entityId: vehicle.id,
    });
    publishDomainEvent({ companyId, type: "SPEED_ALERT", entityType: "VEHICLE", entityId: vehicle.id });
  }

  const fences = await sql<{
    id: string;
    name: string;
    type: string;
    lat: number;
    lng: number;
    radius_m: number;
    polygon: string;
  }>`select id, name, type, lat, lng, radius_m, polygon from geofences where company_id = ${companyId} and status = 'ACTIVE'`;

  for (const fence of fences) {
    const isInside = insideFence(fix.latitude, fix.longitude, fence);
    const prevLat = vehicle.current_latitude;
    const prevLng = vehicle.current_longitude;
    const wasInside =
      prevLat != null && prevLng != null ? insideFence(Number(prevLat), Number(prevLng), fence) : false;
    const transition = detectFenceTransition(wasInside, isInside);
    if (!transition) continue;
    const debounceKey = `${vehicle.id}:${fence.id}:${transition}`;
    const last = fenceDebounce.get(debounceKey) ?? 0;
    const nowMs = new Date(fix.recordedAt).getTime();
    if (nowMs - last < 45_000) continue;
    fenceDebounce.set(debounceKey, nowMs);

    let dwell: number | null = null;
    if (transition === "EXIT") {
      const lastEnter = await sql<{ recorded_at: string }>`
        select recorded_at from geofence_events
        where company_id = ${companyId} and geofence_id = ${fence.id} and vehicle_id = ${vehicle.id} and kind = 'ENTER'
        order by recorded_at desc limit 1
      `;
      if (lastEnter[0]) {
        dwell = Math.max(0, (nowMs - new Date(lastEnter[0].recorded_at).getTime()) / 1000);
      }
    }
    await insert(sql, "geofence_events", {
      id: nid(),
      company_id: companyId,
      geofence_id: fence.id,
      vehicle_id: vehicle.id,
      kind: transition,
      latitude: fix.latitude,
      longitude: fix.longitude,
      recorded_at: fix.recordedAt,
      dwell_seconds: dwell,
    });
    await notify({
      companyId,
      title: transition === "ENTER" ? `Entrada a ${fence.name}` : `Salida de ${fence.name}`,
      body: `${vehicle.economic_number} · ${fence.type}`,
      kind: transition === "ENTER" ? "GEOFENCE_ENTER" : "GEOFENCE_EXIT",
      entityId: fence.id,
    });
    publishDomainEvent({
      companyId,
      type: transition === "ENTER" ? "GEOFENCE_ENTER" : "GEOFENCE_EXIT",
      entityType: "GEOFENCE",
      entityId: fence.id,
    });
  }

  await maybeUpdateServiceTracking(companyId, vehicle.id, fix, odo.deltaKm);
  return { ingested: true };
}

async function maybeUpdateServiceTracking(
  companyId: string,
  vehicleId: string,
  fix: GpsFix,
  deltaKm: number,
) {
  const sql = await getSql();
  const open = await sql<{
    id: string;
    destination_lat: number | null;
    destination_lng: number | null;
    scheduled_arrival_at: string | null;
    eta_at: string | null;
    actual_distance_km: number;
  }>`
    select id, destination_lat, destination_lng, scheduled_arrival_at, eta_at, actual_distance_km
    from services
    where company_id = ${companyId} and vehicle_id = ${vehicleId}
      and status in ('ASSIGNED','AT_ORIGIN','LOADING','LOADED','IN_TRANSIT','AT_DESTINATION','UNLOADING')
    order by updated_at desc limit 1
  `;
  const svc = open[0];
  if (!svc) return;

  if (deltaKm > 0) {
    await sql`update services set actual_distance_km = actual_distance_km + ${deltaKm}, updated_at = now() where id = ${svc.id} and company_id = ${companyId}`;
  }

  const route = await sql<{ sequence: number; latitude: number; longitude: number }>`
    select rp.sequence, rp.latitude, rp.longitude
    from route_points rp
    join route_plans r on r.id = rp.route_plan_id
    where r.company_id = ${companyId} and r.service_id = ${svc.id}
    order by rp.sequence
  `;

  let remainingKm = 0;
  if (route.length >= 2) {
    let nearestIdx = 0;
    let nearestKm = Number.POSITIVE_INFINITY;
    route.forEach((point, idx) => {
      const d = distanceKm(fix.latitude, fix.longitude, Number(point.latitude), Number(point.longitude));
      if (d < nearestKm) { nearestKm = d; nearestIdx = idx; }
    });
    for (let i = nearestIdx; i < route.length - 1; i += 1) {
      remainingKm += distanceKm(Number(route[i]!.latitude), Number(route[i]!.longitude), Number(route[i + 1]!.latitude), Number(route[i + 1]!.longitude));
    }
    if (nearestKm > 0.8) {
      const recent = await sql<{ id: string }>`
        select id from route_deviation_events
        where company_id = ${companyId} and service_id = ${svc.id}
          and recorded_at > now() - interval '15 minutes'
        limit 1
      `;
      if (!recent[0]) {
        await insert(sql, "route_deviation_events", {
          id: nid(), company_id: companyId, service_id: svc.id, vehicle_id: vehicleId,
          latitude: fix.latitude, longitude: fix.longitude, deviation_km: nearestKm, recorded_at: fix.recordedAt,
        });
        await insertAlert(companyId, {
          type: "ROUTE_DEVIATION",
          severity: nearestKm > 3 ? "CRITICAL" : "WARNING",
          title: "Desviación de ruta",
          body: `Unidad fuera de la ruta ${nearestKm.toFixed(1)} km`,
          entityType: "SERVICE", entityId: svc.id, vehicleId, serviceId: svc.id,
        });
        publishDomainEvent({ companyId, type: "ROUTE_DEVIATION", entityType: "SERVICE", entityId: svc.id, payload: { deviationKm: nearestKm } });
      }
    }
  }

  if (remainingKm <= 0 && svc.destination_lat != null && svc.destination_lng != null) {
    remainingKm = distanceKm(fix.latitude, fix.longitude, Number(svc.destination_lat), Number(svc.destination_lng));
  }

  if (remainingKm > 0) {
    const { computeEta, etaDelayMinutes } = await import("../eta");
    const eta = computeEta({
      current: { lat: fix.latitude, lng: fix.longitude },
      destination: { lat: Number(svc.destination_lat ?? fix.latitude), lng: Number(svc.destination_lng ?? fix.longitude) },
      speedKmh: fix.speed,
      remainingDistanceKm: remainingKm,
    });
    await sql`
      update services set eta_prev_at = eta_at, eta_at = ${eta.estimatedArrivalAt}, updated_at = now()
      where id = ${svc.id} and company_id = ${companyId}
    `;
    const delay = etaDelayMinutes(svc.scheduled_arrival_at, eta.estimatedArrivalAt);
    if (delay > 30) {
      await insertAlert(companyId, {
        type: "ETA_DELAY",
        severity: delay > 90 ? "CRITICAL" : "WARNING",
        title: "Retraso de ETA",
        body: `Servicio retrasado ${delay} min`,
        entityType: "SERVICE", entityId: svc.id, vehicleId, serviceId: svc.id,
      });
      publishDomainEvent({ companyId, type: "ETA_DELAY", entityType: "SERVICE", entityId: svc.id });
    }
  }
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRad(aLat), lat2 = toRad(bLat);
  const dLat = lat2 - lat1, dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function insertAlert(
  companyId: string,
  a: {
    type: string;
    severity: string;
    title: string;
    body: string;
    entityType: string;
    entityId?: string | null;
    vehicleId?: string | null;
    driverId?: string | null;
    serviceId?: string | null;
    /**
     * Ventana de deduplicación en minutos (por defecto 40). `null` = mientras exista
     * una alerta OPEN del mismo tipo/entidad no se crea otra (condiciones persistentes
     * como "documento vencido" no deben regenerarse cada 40 min).
     */
    dedupeMinutes?: number | null;
  },
) {
  const sql = await getSql();
  const windowMin = a.dedupeMinutes === undefined ? 40 : a.dedupeMinutes;
  const recent = await sql<{ id: string }>`
    select id from alerts
    where company_id = ${companyId} and type = ${a.type}
      and coalesce(entity_id,'') = ${a.entityId ?? ""}
      and status = 'OPEN'
      and (${windowMin}::int is null or created_at > now() - make_interval(mins => ${windowMin}::int))
    limit 1
  `;
  if (recent[0]) return;
  await insert(sql, "alerts", {
    id: nid(),
    company_id: companyId,
    type: a.type,
    severity: a.severity,
    status: "OPEN",
    title: a.title,
    body: a.body,
    entity_type: a.entityType,
    entity_id: a.entityId ?? null,
    vehicle_id: a.vehicleId ?? null,
    driver_id: a.driverId ?? null,
    service_id: a.serviceId ?? null,
  });
}

export async function tickCompany(companyId: string): Promise<void> {
  const inflight = tickLocks.get(companyId);
  if (inflight) return inflight;
  const job = (async () => {
    const sql = await getSql();
    const now = new Date();
    const vehicles = await sql<
      SimVehicle & { economic_number: string; last_gps_at: string | null }
    >`
      select v.id, s.sim_route, s.sim_progress, s.sim_mode,
             v.speed_limit_kmh, v.economic_number, v.last_gps_at,
             d.id as gps_device_id
      from vehicles v
      join vehicle_simulations s on s.vehicle_id = v.id and s.company_id = v.company_id
      join gps_devices d on d.vehicle_id = v.id and d.company_id = v.company_id and d.provider = 'SIMULATOR'
      where v.company_id = ${companyId}
        and v.active = true
        and v.status in ('ACTIVE', 'AVAILABLE', 'ASSIGNED', 'IN_SERVICE')
        and s.is_development = true
    `;
    for (const v of vehicles) {
      const step = simulatorProvider.next(v, now);
      if (!step) continue;
      await ingestFix(companyId, { ...step.fix, eventId: `sim:${v.id}:${now.toISOString()}`, source: "SIMULATOR" });
      await sql`update vehicle_simulations set sim_progress = ${step.progress}, updated_at = now()
        where vehicle_id = ${v.id} and company_id = ${companyId}`;
    }

    const stale = await sql<{ id: string; economic_number: string; motion_state: string }>`
      select id, economic_number, motion_state from vehicles
      where company_id = ${companyId}
        and active = true
        and status in ('ACTIVE', 'AVAILABLE', 'ASSIGNED', 'IN_SERVICE')
        and (last_gps_at is null or last_gps_at < now() - interval '8 minutes')
    `;
    for (const v of stale) {
      if (v.motion_state !== "OFFLINE") {
        await sql`update vehicles set motion_state = 'OFFLINE' where id = ${v.id} and company_id = ${companyId}`;
        await notify({
          companyId,
          title: `GPS sin conexión ${v.economic_number}`,
          body: "La unidad no reporta posición desde hace más de 8 minutos.",
          kind: "GPS_OFFLINE",
          entityId: v.id,
        });
        await insertAlert(companyId, {
          type: "GPS_OFFLINE",
          severity: "CRITICAL",
          title: `GPS sin conexión ${v.economic_number}`,
          body: "Sin reporte por más de 8 minutos.",
          entityType: "VEHICLE",
          entityId: v.id,
          vehicleId: v.id,
        });
        publishDomainEvent({ companyId, type: "GPS_OFFLINE", entityType: "VEHICLE", entityId: v.id });
      } else {
        await sql`update vehicles set motion_state = 'OFFLINE' where id = ${v.id} and company_id = ${companyId}`;
      }
    }
  })().finally(() => tickLocks.delete(companyId));
  tickLocks.set(companyId, job);
  return job;
}
