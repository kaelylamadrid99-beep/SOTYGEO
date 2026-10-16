import { haversineKm } from "@/lib/geo";
import type { Sql } from "@/lib/db";

export type ReportFilter = {
  clientId?: string | null;
  fleetId?: string | null;
  vehicleId?: string | null;
  driverId?: string | null;
  from: string;
  to: string;
};

function vehicleWhere(filter: ReportFilter, alias = "v", startIndex = 4) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = startIndex;
  if (filter.clientId) {
    params.push(filter.clientId);
    clauses.push(`${alias}.client_id = $${i++}`);
  }
  if (filter.fleetId) {
    params.push(filter.fleetId);
    clauses.push(`${alias}.fleet_id = $${i++}`);
  }
  if (filter.vehicleId) {
    params.push(filter.vehicleId);
    clauses.push(`${alias}.id = $${i++}`);
  }
  if (filter.driverId) {
    params.push(filter.driverId);
    clauses.push(`${alias}.current_driver_id = $${i++}`);
  }
  return { extra: clauses.length ? ` and ${clauses.join(" and ")}` : "", params };
}

export async function mileageReport(sql: Sql, companyId: string, filter: ReportFilter) {
  const { extra, params } = vehicleWhere(filter);
  const vehicles = await sql.query<{
    id: string; economic_number: string; license_plate: string; driver_name: string | null; fleet_name: string | null;
  }>(
    `select v.id, v.economic_number, v.license_plate, d.name as driver_name, f.name as fleet_name
     from vehicles v
     left join drivers d on d.id = v.current_driver_id
     left join fleets f on f.id = v.fleet_id
     where v.company_id = $1 ${extra}
     order by v.economic_number`,
    [companyId, ...params],
  );
  if (!vehicles.length) return [];
  const vehicleIds = vehicles.map((v) => v.id);
  const points = await sql.query<{ vehicle_id: string; latitude: number; longitude: number; recorded_at: string }>(
    `select vehicle_id, latitude, longitude, recorded_at
     from gps_positions
     where company_id = $1 and vehicle_id = any($2::text[]) and recorded_at >= $3 and recorded_at <= $4
     order by vehicle_id, recorded_at asc`,
    [companyId, vehicleIds, filter.from, filter.to],
  );
  const byVehicle = new Map<string, typeof points>();
  for (const point of points) {
    const list = byVehicle.get(point.vehicle_id) ?? [];
    list.push(point);
    byVehicle.set(point.vehicle_id, list);
  }
  return vehicles.map((v) => {
    const pts = byVehicle.get(v.id) ?? [];
    let km = 0;
    for (let i = 1; i < pts.length; i++) {
      km += haversineKm(
        { lat: Number(pts[i - 1]!.latitude), lng: Number(pts[i - 1]!.longitude) },
        { lat: Number(pts[i]!.latitude), lng: Number(pts[i]!.longitude) },
      );
    }
    return { vehicle_id: v.id, economic_number: v.economic_number, license_plate: v.license_plate, driver_name: v.driver_name, fleet_name: v.fleet_name, points: pts.length, km: Math.round(km * 10) / 10 };
  });
}

export async function speedReport(sql: Sql, companyId: string, filter: ReportFilter) {
  const { extra, params } = vehicleWhere(filter);
  return sql.query<{
    id: string;
    vehicle_id: string;
    economic_number: string;
    driver_name: string | null;
    speed: number;
    limit_kmh: number;
    latitude: number;
    longitude: number;
    recorded_at: string;
  }>(
    `select a.id, a.vehicle_id, v.economic_number, d.name as driver_name,
            a.speed, a.limit_kmh, a.latitude, a.longitude, a.recorded_at
     from speed_alerts a
     join vehicles v on v.id = a.vehicle_id
     left join drivers d on d.id = a.driver_id
     where a.company_id = $1 and a.recorded_at >= $2 and a.recorded_at <= $3 ${extra}
     order by a.recorded_at desc`,
    [companyId, filter.from, filter.to, ...params],
  );
}

export async function zoneReport(sql: Sql, companyId: string, filter: ReportFilter) {
  const { extra, params } = vehicleWhere(filter);
  return sql.query<{
    id: string;
    geofence_name: string;
    geofence_type: string;
    economic_number: string;
    kind: string;
    recorded_at: string;
    dwell_seconds: number | null;
  }>(
    `select e.id, g.name as geofence_name, g.type as geofence_type, v.economic_number,
            e.kind, e.recorded_at, e.dwell_seconds
     from geofence_events e
     join geofences g on g.id = e.geofence_id
     join vehicles v on v.id = e.vehicle_id
     where e.company_id = $1 and e.recorded_at >= $2 and e.recorded_at <= $3 ${extra}
     order by e.recorded_at desc`,
    [companyId, filter.from, filter.to, ...params],
  );
}

export async function inspectionReport(sql: Sql, companyId: string, filter: ReportFilter) {
  const { extra, params } = vehicleWhere(filter);
  return sql.query<{
    id: string;
    economic_number: string;
    driver_name: string | null;
    inspected_at: string;
    status: string;
    observations: string;
  }>(
    `select i.id, v.economic_number, d.name as driver_name, i.inspected_at, i.status, i.observations
     from inspections i
     join vehicles v on v.id = i.vehicle_id
     left join drivers d on d.id = i.driver_id
     where i.company_id = $1 and i.inspected_at >= $2 and i.inspected_at <= $3 ${extra}
     order by i.inspected_at desc`,
    [companyId, filter.from, filter.to, ...params],
  );
}

export async function utilizationReport(sql: Sql, companyId: string, filter: ReportFilter) {
  const mileage = await mileageReport(sql, companyId, filter);
  const { extra, params } = vehicleWhere(filter);
  const samples = await sql.query<{
    vehicle_id: string;
    moving: number;
    stopped: number;
    total: number;
  }>(
    `select p.vehicle_id,
            sum(case when p.speed >= 5 then 1 else 0 end)::int as moving,
            sum(case when p.speed < 5 then 1 else 0 end)::int as stopped,
            count(*)::int as total
     from gps_positions p
     join vehicles v on v.id = p.vehicle_id
     where p.company_id = $1 and p.recorded_at >= $2 and p.recorded_at <= $3 ${extra}
     group by p.vehicle_id`,
    [companyId, filter.from, filter.to, ...params],
  );
  const byId = new Map(samples.map((s) => [s.vehicle_id, s]));
  return mileage.map((m) => {
    const s = byId.get(m.vehicle_id);
    const total = s?.total || 0;
    const moving = s?.moving || 0;
    const pct = total ? Math.round((moving / total) * 1000) / 10 : 0;
    return { ...m, samples: total, moving, utilization_pct: pct };
  });
}

export async function driverActivityReport(sql: Sql, companyId: string, filter: ReportFilter) {
  const driverClause = filter.driverId ? ` and d.id = $2` : "";
  const drivers = await sql.query<{ id: string; name: string }>(
    `select d.id, d.name from drivers d where d.company_id = $1${driverClause} order by d.name`,
    filter.driverId ? [companyId, filter.driverId] : [companyId],
  );
  if (!drivers.length) return [];
  const driverIds = drivers.map((d) => d.id);
  // Apply the same vehicle dimensions as the report filter so a driver report
  // cannot accidentally ignore client/fleet/unit constraints.
  const { extra: vehicleExtra, params: vehicleParams } = vehicleWhere(filter, "v", 3);
  const vehicleRows = await sql.query<{ driver_id: string; vehicle_id: string }>(
    `select current_driver_id as driver_id, id as vehicle_id
     from vehicles v
     where v.company_id = $1 and v.current_driver_id = any($2::text[])${vehicleExtra}` ,
    [companyId, driverIds, ...vehicleParams],
  );
  const allowedVehicleIds = vehicleRows.map((v) => v.vehicle_id);
  if (!allowedVehicleIds.length) return drivers.map((d)=>({driver_id:d.id,name:d.name,vehicles:0,km:0,speed_alerts:0,inspections:0}));
  const points = await sql.query<{ driver_id: string; vehicle_id: string; latitude: number; longitude: number; recorded_at: string }>(
    `select v.current_driver_id as driver_id, p.vehicle_id, p.latitude, p.longitude, p.recorded_at
     from gps_positions p join vehicles v on v.id = p.vehicle_id
     where p.company_id=$1 and p.recorded_at >= $2 and p.recorded_at <= $3
       and v.current_driver_id = any($4::text[]) and p.vehicle_id = any($5::text[])
     order by p.vehicle_id, p.recorded_at`,
    [companyId, filter.from, filter.to, driverIds, allowedVehicleIds],
  );
  const kms = new Map<string, number>();
  for (let i=1;i<points.length;i++) {
    const a=points[i-1]!, b=points[i]!;
    if (a.vehicle_id !== b.vehicle_id) continue;
    const current=kms.get(b.driver_id)??0;
    kms.set(b.driver_id, current+haversineKm({lat:Number(a.latitude),lng:Number(a.longitude)},{lat:Number(b.latitude),lng:Number(b.longitude)}));
  }
  const alertRows = await sql.query<{ driver_id: string; n: number }>(
    `select a.driver_id, count(*)::int as n
     from speed_alerts a
     where a.company_id=$1 and a.driver_id = any($2::text[])
       and a.vehicle_id = any($3::text[]) and a.recorded_at >= $4 and a.recorded_at <= $5
     group by a.driver_id`,
    [companyId, driverIds, allowedVehicleIds, filter.from, filter.to],
  );
  const inspRows = await sql.query<{ driver_id: string; n: number }>(
    `select i.driver_id, count(*)::int as n
     from inspections i
     where i.company_id=$1 and i.driver_id = any($2::text[])
       and i.vehicle_id = any($3::text[]) and i.inspected_at >= $4 and i.inspected_at <= $5
     group by i.driver_id`,
    [companyId, driverIds, allowedVehicleIds, filter.from, filter.to],
  );
  const alertMap = new Map(alertRows.map((r)=>[r.driver_id,Number(r.n)]));
  const inspMap = new Map(inspRows.map((r)=>[r.driver_id,Number(r.n)]));
  const vehCount = new Map<string, number>();
  for (const v of vehicleRows) vehCount.set(v.driver_id, (vehCount.get(v.driver_id)??0)+1);
  return drivers.map((d)=>({driver_id:d.id,name:d.name,vehicles:vehCount.get(d.id)??0,km:Math.round((kms.get(d.id)??0)*10)/10,speed_alerts:alertMap.get(d.id)??0,inspections:inspMap.get(d.id)??0}));
}


export async function servicePerformanceReport(sql: Sql, companyId: string, filter: ReportFilter) {
  const rows = await sql<Record<string, unknown>>`
    select s.service_number, c.trade_name as client_name, s.status, s.origin, s.destination,
           s.planned_distance_km, s.actual_distance_km, s.gross_revenue,
           coalesce(sc.total_cost, 0) as total_cost,
           coalesce(ii.incident_count, 0) as incident_count,
           coalesce(pp.pod_count, 0) as pod_count
    from services s
    left join clients c on c.id = s.client_id
    left join vehicles v on v.id = s.vehicle_id
    left join (
      select service_id, sum(amount) as total_cost
      from service_cost_lines where company_id = ${companyId}
      group by service_id
    ) sc on sc.service_id = s.id
    left join (
      select service_id, count(*)::int as incident_count
      from incidents where company_id = ${companyId}
      group by service_id
    ) ii on ii.service_id = s.id
    left join (
      select service_id, count(*)::int as pod_count
      from delivery_evidence where company_id = ${companyId}
      group by service_id
    ) pp on pp.service_id = s.id
    where s.company_id = ${companyId}
      and s.created_at >= ${filter.from}
      and s.created_at <= ${filter.to}
      and (${filter.clientId ?? null} is null or s.client_id = ${filter.clientId ?? null})
      and (${filter.fleetId ?? null} is null or v.fleet_id = ${filter.fleetId ?? null})
      and (${filter.vehicleId ?? null} is null or s.vehicle_id = ${filter.vehicleId ?? null})
      and (${filter.driverId ?? null} is null or s.driver_id = ${filter.driverId ?? null})
    order by s.created_at desc
    limit 500
  `;
  return rows.map((r) => {
    const revenue = Number(r.gross_revenue) || 0;
    const cost = Number(r.total_cost) || 0;
    return { ...r, total_cost: cost, gross_margin: revenue - cost, margin_pct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0 };
  });
}

export async function profitabilityReport(sql: Sql, companyId: string, filter: ReportFilter) {
  const rows = await sql<Record<string, unknown>>`
    select date_trunc('day', s.created_at)::date::text as day,
           count(*)::int as services, coalesce(sum(s.gross_revenue),0) as revenue,
           coalesce(sum(sc.total_cost),0) as costs
    from services s
    left join vehicles v on v.id = s.vehicle_id
    left join (select service_id, sum(amount) as total_cost from service_cost_lines where company_id = ${companyId} group by service_id) sc on sc.service_id = s.id
    where s.company_id = ${companyId}
      and s.created_at >= ${filter.from}
      and s.created_at <= ${filter.to}
      and (${filter.clientId ?? null} is null or s.client_id = ${filter.clientId ?? null})
      and (${filter.fleetId ?? null} is null or v.fleet_id = ${filter.fleetId ?? null})
      and (${filter.vehicleId ?? null} is null or s.vehicle_id = ${filter.vehicleId ?? null})
      and (${filter.driverId ?? null} is null or s.driver_id = ${filter.driverId ?? null})
    group by 1 order by 1
  `;
  return rows.map((r) => ({ ...r, margin: Number(r.revenue) - Number(r.costs), margin_pct: Number(r.revenue) > 0 ? Math.round(((Number(r.revenue)-Number(r.costs))/Number(r.revenue))*10000)/100 : 0 }));
}
