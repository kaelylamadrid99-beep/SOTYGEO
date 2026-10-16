/**
 * Piezas de escritura compuestas para operaciones de servicio.
 * Patrón obligatorio con `withTransaction` (ver src/lib/db.ts):
 *   1) FASE DE LECTURA  -> plan... / read... (solo SELECT, antes de abrir la transacción)
 *   2) FASE DE ESCRITURA -> queue... (solo escrituras, dentro de withTransaction)
 * Sin imports de valores con alias para poder probarse con node:test.
 */
import type { Sql, Tx } from "@/lib/db";

export const ACTIVE_SERVICE_STATUSES = [
  "ASSIGNED", "AT_ORIGIN", "LOADING", "LOADED", "IN_TRANSIT", "AT_DESTINATION", "UNLOADING",
] as const;
const ACTIVE_SQL = ACTIVE_SERVICE_STATUSES.map((s) => `'${s}'`).join(",");

export interface TripPlan {
  tripId: string;
  exists: boolean;
  tripNumber: string;
  stops: { id: string; sequence: number; planned_arrival: string | null }[];
}

export interface TripService {
  id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  scheduled_departure_at: string | null;
}

/** LECTURAS: decide el viaje (existente o nuevo) y las paradas a reflejar. */
export async function planTripForService(sql: Sql, companyId: string, serviceId: string): Promise<TripPlan> {
  const existing = (await sql<{ id: string }>`
    select id from trips where service_id = ${serviceId} and company_id = ${companyId} limit 1
  `)[0];
  let tripNumber = "";
  if (!existing) {
    const maxRow = await sql<{ n: number | null }>`
      select max(nullif(regexp_replace(trip_number, '[^0-9]', '', 'g'), '')::bigint)::int as n
      from trips where company_id = ${companyId}
    `;
    tripNumber = `V-${String(Math.max(1, (maxRow[0]?.n ?? 0) + 1)).padStart(6, "0")}`;
  }
  const stops = await sql<{ id: string; sequence: number; planned_arrival: string | null }>`
    select id, sequence, planned_arrival from service_stops
    where company_id = ${companyId} and service_id = ${serviceId} order by sequence
  `;
  return { tripId: existing?.id ?? crypto.randomUUID(), exists: !!existing, tripNumber, stops };
}

/** ESCRITURAS: crea/actualiza el viaje y sus paradas. */
export async function queueTripForService(tx: Tx, companyId: string, userId: string, service: TripService, plan: TripPlan) {
  if (plan.exists) {
    await tx`update trips set vehicle_id = ${service.vehicle_id}, driver_id = ${service.driver_id}, updated_at = now()
      where id = ${plan.tripId} and company_id = ${companyId}`;
  } else {
    await tx`
      insert into trips (id, company_id, service_id, trip_number, vehicle_id, driver_id, status, planned_start_at, notes, created_by)
      values (${plan.tripId}, ${companyId}, ${service.id}, ${plan.tripNumber}, ${service.vehicle_id}, ${service.driver_id}, 'PLANNED',
        ${service.scheduled_departure_at}, 'Viaje de ejecución asociado al servicio', ${userId})
      on conflict (service_id) do update
        set vehicle_id = excluded.vehicle_id, driver_id = excluded.driver_id, updated_at = now()
    `;
  }
  for (const stop of plan.stops) {
    // trip_id se resuelve en SQL: si otro proceso creó el viaje antes (on conflict), se usa el real.
    await tx`
      insert into trip_stops (id, company_id, trip_id, service_stop_id, sequence, status, planned_arrival)
      values (${crypto.randomUUID()}, ${companyId},
        (select id from trips where service_id = ${service.id} and company_id = ${companyId}),
        ${stop.id}, ${stop.sequence}, 'PENDING', ${stop.planned_arrival})
      on conflict (trip_id, sequence) do update
        set service_stop_id = excluded.service_stop_id, planned_arrival = excluded.planned_arrival
    `;
  }
}

/** LECTURA: id del viaje asociado (o null). */
export async function readTripId(sql: Sql, companyId: string, serviceId: string): Promise<string | null> {
  const trip = (await sql<{ id: string }>`
    select id from trips where company_id = ${companyId} and service_id = ${serviceId} limit 1
  `)[0];
  return trip?.id ?? null;
}

export function tripStatusFor(to: string): string {
  return to === "IN_TRANSIT" ? "IN_TRANSIT"
    : to === "DELIVERED" ? "COMPLETED"
    : to === "CANCELLED" ? "CANCELLED"
    : to === "ASSIGNED" ? "DISPATCHED"
    : "PLANNED";
}

/** ESCRITURAS: cambio de estado del servicio, su viaje (si existe) e historial. */
export async function queueStatusChange(
  tx: Tx,
  a: { companyId: string; userId: string; serviceId: string; from: string; to: string; notes: string; tripId: string | null },
) {
  await tx`
    update services
    set status = ${a.to},
        actual_departure_at = case when ${a.to} = 'IN_TRANSIT' then coalesce(actual_departure_at, now()) else actual_departure_at end,
        actual_arrival_at = case when ${a.to} = 'DELIVERED' then now() else actual_arrival_at end,
        updated_at = now()
    where id = ${a.serviceId} and company_id = ${a.companyId}
  `;
  if (a.tripId) {
    await tx`
      update trips
      set status = ${tripStatusFor(a.to)},
          actual_start_at = case when ${a.to} = 'IN_TRANSIT' then coalesce(actual_start_at, now()) else actual_start_at end,
          actual_end_at = case when ${a.to} = 'DELIVERED' then now() else actual_end_at end,
          updated_at = now()
      where id = ${a.tripId} and company_id = ${a.companyId}
    `;
  }
  await tx`
    insert into service_status_history (id, company_id, service_id, from_status, to_status, changed_by, notes)
    values (${crypto.randomUUID()}, ${a.companyId}, ${a.serviceId}, ${a.from}, ${a.to}, ${a.userId}, ${a.notes})
  `;
}

/** ASERCIONES atómicas (dentro de la transacción) de la regla "un servicio activo por unidad/conductor". */
export function assertResourcesFree(tx: Tx, companyId: string, serviceId: string, vehicleId: string, driverId: string) {
  tx.assert(
    `not exists (select 1 from services where company_id = $1 and vehicle_id = $2 and id <> $3 and status in (${ACTIVE_SQL}))`,
    [companyId, vehicleId, serviceId],
    "La unidad ya tiene un servicio operativo activo",
  );
  tx.assert(
    `not exists (select 1 from services where company_id = $1 and driver_id = $2 and id <> $3 and status in (${ACTIVE_SQL}))`,
    [companyId, driverId, serviceId],
    "El conductor ya tiene un servicio operativo activo",
  );
}

/** ASERCIÓN atómica: la unidad no tiene servicio operativo activo (p. ej. antes de enviarla a mantenimiento). */
export function assertVehicleHasNoActiveService(tx: Tx, companyId: string, vehicleId: string) {
  tx.assert(
    `not exists (select 1 from services where company_id = $1 and vehicle_id = $2 and status in (${ACTIVE_SQL}))`,
    [companyId, vehicleId],
    "La unidad tiene un servicio operativo activo",
  );
}
