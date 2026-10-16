import { getSql, withTransaction, type Sql } from "@/lib/db";
import { densify, interpolateRoute, parseRoute } from "@/lib/geo";
import { insert, nid, writeAudit } from "./db";
import { hashSecret, newSecret } from "./security/tokens";
import type { Company, Profile, Workspace } from "./types";

const seedLocks = new Map<string, Promise<Workspace>>();

const C = {
  MTY: { name: "Monterrey, NL", lat: 25.6866, lng: -100.3161 },
  SAL: { name: "Saltillo, Coah.", lat: 25.4232, lng: -101.0053 },
  NLD: { name: "Nuevo Laredo, Tamps.", lat: 27.478, lng: -99.507 },
  CDMX: { name: "Ciudad de México", lat: 19.4326, lng: -99.1332 },
  GDL: { name: "Guadalajara, Jal.", lat: 20.6597, lng: -103.3496 },
  QRO: { name: "Querétaro, Qro.", lat: 20.5888, lng: -100.3899 },
  LEO: { name: "León, Gto.", lat: 21.125, lng: -101.686 },
  SLP: { name: "San Luis Potosí, SLP", lat: 22.1565, lng: -100.9855 },
  TAM: { name: "Tampico, Tamps.", lat: 22.2331, lng: -97.8611 },
  SCB: { name: "Santa Catarina, NL", lat: 25.673, lng: -100.458 },
  TOR: { name: "Torreón, Coah.", lat: 25.5428, lng: -103.4068 },
};

function route(...pts: { lat: number; lng: number }[]) {
  return JSON.stringify(densify(pts, 16));
}

export async function getWorkspace(userId: string): Promise<Workspace> {
  const sql = await getSql();
  const existing = await loadActiveWorkspace(sql, userId);
  if (existing) return existing;

  const inflight = seedLocks.get(userId);
  if (inflight) return inflight;
  const job = provisionWorkspace(sql, userId).finally(() => seedLocks.delete(userId));
  seedLocks.set(userId, job);
  return job;
}

async function loadActiveWorkspace(sql: Sql, userId: string): Promise<Workspace | null> {
  const existing = await sql<Profile>`
    select user_id, company_id, role, full_name, driver_id, client_id, status
    from profiles where user_id = ${userId}
  `;
  const profile = existing[0];
  if (!profile) return null;
  // La transición PENDING -> ACTIVE SOLO ocurre por rutas explícitas de
  // activación (verificación de correo o aceptación de invitación). Activar
  // silenciosamente al leer el workspace invalidaría la verificación de correo.
  if (profile.status === "PENDING") {
    throw new Error("Cuenta pendiente de activación. Revisa tu correo para verificarla.");
  }
  if (profile.status !== "ACTIVE") throw new Error("Cuenta no activa");
  const company = (await sql<Company>`select * from companies where id = ${profile.company_id}`)[0];
  if (!company) throw new Error("Empresa no encontrada");
  return { profile, company };
}

async function provisionWorkspace(sql: Sql, userId: string): Promise<Workspace> {
  const again = await loadActiveWorkspace(sql, userId);
  if (again) return again;

  const users = await sql<{ name: string; email: string }>`
    select name, email from "user" where id = ${userId}
  `;
  const display = users[0]?.name?.trim() || "Operador";
  const email = (users[0]?.email || "").trim().toLowerCase();

  if (email) {
    const orphan = await sql<Profile>`
      select user_id, company_id, role, full_name, driver_id, client_id, status
      from profiles
      where lower(email) = ${email}
        and user_id <> ${userId}
        and status in ('ACTIVE', 'PENDING')
      limit 1
    `;
    if (orphan[0]) {
      try {
        await sql`
          update profiles
          set user_id = ${userId},
              status = 'ACTIVE',
              activated_at = coalesce(activated_at, now()),
              updated_at = now()
          where user_id = ${orphan[0].user_id}
            and status in ('ACTIVE', 'PENDING')
        `;
      } catch {
        /* unique user_id: another request already claimed it */
      }
      const linked = await loadActiveWorkspace(sql, userId);
      if (linked) return linked;
    }
  }

  const demoSeed = process.env["ALLOW_DEMO_SEED"] === "true" && process.env.NODE_ENV !== "production";
  if (demoSeed) {
    try {
      return await seedCompany(sql, userId);
    } catch (err) {
      const seeded = await loadActiveWorkspace(sql, userId);
      if (seeded) return seeded;
      throw err;
    }
  }

  // Sin auto-provisionamiento: la empresa y el profile ADMIN solo se crean en
  // el registro explícito (registerCompany) o al aceptar una invitación. Un
  // usuario autenticado sin workspace es un estado inválido, no una señal para
  // crear una empresa silenciosamente con rol ADMIN.
  throw new Error("Workspace no encontrado. Completa el registro de tu empresa o acepta una invitación.");
}

/**
 * @deprecated El auto-provisionamiento silencioso de empresa/ADMIN fue eliminado
 * del flujo de getWorkspace() conforme al plan maestro. Esta función se conserva
 * solo como referencia histórica y no debe invocarse.
 */

// async function createEmptyCompany(
//   sql: Sql,
//   userId: string,
//   display: string,
//   email: string,
// ): Promise<Workspace> {
//   const companyId = nid();
//   const name = display && display !== "Operador" ? display : "Mi flota";
//   try {
//     await withTransaction(async (tx) => {
//       const exists = await tx<{ user_id: string }>`select user_id from profiles where user_id = ${userId}`;
//       if (exists[0]) return;
//       await insert(tx, "companies", {
//         id: companyId,
//         name,
//         legal_name: name,
//         rfc: "",
//         phone: "",
//         email: email || "",
//         address: "",
//       });
//       await insert(tx, "profiles", {
//         user_id: userId,
//         company_id: companyId,
//         role: "ADMIN",
//         full_name: display,
//         email: email || "",
//         status: "ACTIVE",
//         activated_at: new Date().toISOString(),
//       });
//       await writeAudit(
//         companyId,
//         userId,
//         "COMPANY_REGISTERED",
//         "COMPANY",
//         companyId,
//         JSON.stringify({ via: "auto-provision" }),
//         tx,
//       );
//     });
//   } catch {
//     const raced = await loadActiveWorkspace(sql, userId);
//     if (raced) return raced;
//     throw new Error("No se pudo crear la empresa");
//   }
//   const created = await loadActiveWorkspace(sql, userId);
//   if (!created) throw new Error("No se pudo crear la empresa");
//   return created;
// }

async function seedCompany(sql: Sql, userId: string): Promise<Workspace> {
  const users = await sql<{ name: string; email: string }>`
    select name, email from "user" where id = ${userId}
  `;
  const display = users[0]?.name?.trim() || "Operaciones";
  const email = users[0]?.email || "";

  const companyId = nid();
  const company: Company = {
    id: companyId,
    name: "Sierra Madre",
    legal_name: "Transportes Sierra Madre S.A. de C.V.",
    rfc: "TSM980412AB3",
    phone: "81 8123 4400",
    email: "ops@sierramadre.mx",
    address: "Av. Revolución 2450, Monterrey, N.L.",
  };
  await insert(sql, "companies", company);

  const profile: Profile = {
    user_id: userId,
    company_id: companyId,
    role: "ADMIN",
    full_name: display,
    driver_id: null,
    client_id: null,
    status: "ACTIVE",
  };
  await insert(sql, "profiles", {
    ...profile,
    email,
  });

  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const hours = (h: number) => iso(now + h * 3600_000);
  const days = (d: number) => new Date(now + d * 86400_000).toISOString().slice(0, 10);

  const clientSpecs = [
    { legal: "Alimentos del Valle S.A. de C.V.", trade: "Alimentos del Valle", rfc: "AVA010215XY1", contact: "Laura Méndez", phone: "81 8001 2200", email: "logistica@alimentosdelvalle.mx", address: "Parque Industrial Guadalupe, N.L.", city: C.MTY },
    { legal: "Aceros del Golfo S.A.P.I.", trade: "Aceros del Golfo", rfc: "AGO850630QR2", contact: "Ricardo Peña", phone: "81 8155 0090", email: "embarques@acerosdelgolfo.mx", address: "Av. Universidad 1200, Monterrey", city: C.SCB },
    { legal: "Comercial del Bajío S.A.", trade: "Comercial Bajío", rfc: "CBA920118HH3", contact: "Sofía Rivas", phone: "477 718 4400", email: "compras@comercialbajio.mx", address: "Blvd. Aeropuerto 800, León, Gto.", city: C.LEO },
    { legal: "Retail del Norte S.A. de C.V.", trade: "Retail del Norte", rfc: "RDN000512WW7", contact: "Patricia Nava", phone: "867 712 5511", email: "cedis@retaildelnorte.mx", address: "Blvd. Colosio, Nuevo Laredo", city: C.NLD },
  ];
  const clientIds = clientSpecs.map(() => nid());
  for (let i = 0; i < clientSpecs.length; i++) {
    const c = clientSpecs[i]!;
    await insert(sql, "clients", {
      id: clientIds[i],
      company_id: companyId,
      legal_name: c.legal,
      trade_name: c.trade,
      rfc: c.rfc,
      contact_name: c.contact,
      phone: c.phone,
      email: c.email,
      address: c.address,
      lat: c.city.lat,
      lng: c.city.lng,
      status: "ACTIVE",
      created_by: userId,
    });
  }

  const fleetSpecs = [
    { name: "Flotilla Norte", desc: "Corredor MTY–Laredo–Saltillo", client: 0 },
    { name: "Flotilla Centro", desc: "Bajío y CDMX", client: 2 },
    { name: "Última milla", desc: "Distribución urbana NL", client: 1 },
  ];
  const fleetIds = fleetSpecs.map(() => nid());
  for (let i = 0; i < fleetSpecs.length; i++) {
    const f = fleetSpecs[i]!;
    await insert(sql, "fleets", {
      id: fleetIds[i],
      company_id: companyId,
      client_id: clientIds[f.client],
      name: f.name,
      description: f.desc,
      status: "ACTIVE",
      created_by: userId,
    });
  }

  const driverSpecs = [
    { name: "María López", phone: "81 1550 2211", email: "maria.lopez@sierramadre.mx", lic: "NL-882194", type: "E", exp: days(48), status: "ON_ROUTE" },
    { name: "Juan Hernández", phone: "81 1550 2212", email: "juan.hernandez@sierramadre.mx", lic: "NL-441902", type: "E", exp: days(120), status: "ON_ROUTE" },
    { name: "Pedro Castillo", phone: "844 120 3344", email: "pedro.castillo@sierramadre.mx", lic: "COA-11920", type: "E", exp: days(9), status: "ASSIGNED" },
    { name: "Ana Torres", phone: "81 1550 2288", email: "ana.torres@sierramadre.mx", lic: "NL-330112", type: "C", exp: days(200), status: "ON_ROUTE" },
    { name: "Luis Vega", phone: "867 440 1900", email: "luis.vega@sierramadre.mx", lic: "TAM-22011", type: "E", exp: days(70), status: "AVAILABLE" },
    { name: "Miguel Soto", phone: "442 300 1188", email: "miguel.soto@sierramadre.mx", lic: "QRO-88102", type: "E", exp: days(14), status: "ON_ROUTE" },
  ];
  const driverIds = driverSpecs.map(() => nid());
  for (let i = 0; i < driverSpecs.length; i++) {
    const d = driverSpecs[i]!;
    await insert(sql, "drivers", {
      id: driverIds[i],
      company_id: companyId,
      name: d.name,
      phone: d.phone,
      email: d.email,
      license_number: d.lic,
      license_type: d.type,
      license_expires_at: d.exp,
      status: d.status,
      emergency_contact: "Familia " + d.name.split(" ")[1],
      emergency_phone: "81 8000 0000",
      km_total: 18000 + i * 4200,
      created_by: userId,
    });
  }

  const vehicleSpecs = [
    { n: "SM-01", plate: "NL-81-AA1", brand: "Kenworth", model: "T680", year: 2023, type: "TRACTO", fleet: 0, client: 0, driver: 0, route: route(C.MTY, C.SLP, C.QRO, C.CDMX), progress: 0.42, mode: "MOVING", limit: 90, provider: "SIMULATOR" as const },
    { n: "SM-02", plate: "NL-81-AA2", brand: "Freightliner", model: "Cascadia", year: 2022, type: "TRACTO", fleet: 0, client: 3, driver: 1, route: route(C.SAL, C.MTY, C.NLD), progress: 0.61, mode: "MOVING", limit: 85, provider: "SIMULATOR" as const },
    { n: "SM-03", plate: "NL-81-BB3", brand: "Volvo", model: "VNL", year: 2021, type: "CAJA_SEC", fleet: 1, client: 2, driver: 5, route: route(C.GDL, C.LEO, C.QRO, C.MTY), progress: 0.28, mode: "MOVING", limit: 90, provider: "EXTERNAL" as const },
    { n: "SM-04", plate: "NL-81-CC4", brand: "International", model: "LT", year: 2020, type: "REFRIGERADO", fleet: 1, client: 2, driver: 3, route: route(C.LEO, C.QRO, C.CDMX), progress: 0.15, mode: "STOPPED", limit: 80, provider: "SIMULATOR" as const },
    { n: "SM-05", plate: "NL-81-DD5", brand: "Kenworth", model: "T800", year: 2019, type: "PLATAFORMA", fleet: 0, client: 1, driver: 2, route: route(C.TOR, C.SAL, C.MTY), progress: 0.33, mode: "OFFLINE", limit: 90, provider: "SIMULATOR" as const },
    { n: "SM-06", plate: "NL-81-EE6", brand: "Mercedes-Benz", model: "Sprinter", year: 2024, type: "VAN", fleet: 2, client: 1, driver: 4, route: route(C.MTY, C.SCB, C.MTY), progress: 0.55, mode: "MOVING", limit: 70, provider: "SMARTPHONE" as const },
    { n: "SM-07", plate: "NL-81-FF7", brand: "Freightliner", model: "M2", year: 2022, type: "CAJA_SEC", fleet: 2, client: 0, driver: null, route: route(C.MTY, C.SAL), progress: 0.1, mode: "STOPPED", limit: 90, provider: "SIMULATOR" as const },
    { n: "SM-08", plate: "NL-81-GG8", brand: "Kenworth", model: "T680", year: 2024, type: "TRACTO", fleet: 1, client: 0, driver: null, route: route(C.MTY, C.TAM), progress: 0.08, mode: "MOVING", limit: 95, provider: "EXTERNAL" as const },
  ];
  const vehicleIds = vehicleSpecs.map(() => nid());
  const deviceIds = vehicleSpecs.map(() => nid());
  for (let i = 0; i < vehicleSpecs.length; i++) {
    const v = vehicleSpecs[i]!;
    const pts = parseRoute(v.route);
    const pos = interpolateRoute(pts, v.progress);
    const moving = v.mode === "MOVING";
    const lastGps = v.mode === "OFFLINE" ? hours(-0.7) : hours(-0.01);
    const speed = moving ? 72 : 0;
    await insert(sql, "vehicles", {
      id: vehicleIds[i],
      company_id: companyId,
      economic_number: v.n,
      license_plate: v.plate,
      brand: v.brand,
      model: v.model,
      year: v.year,
      vehicle_type: v.type,
      status: i === 6 ? "MAINTENANCE" : "ACTIVE",
      client_id: clientIds[v.client],
      fleet_id: fleetIds[v.fleet],
      current_driver_id: v.driver == null ? null : driverIds[v.driver],
      current_latitude: pos.lat,
      current_longitude: pos.lng,
      last_speed: speed,
      last_heading: 210,
      last_gps_at: lastGps,
      motion_state: v.mode === "OFFLINE" ? "OFFLINE" : moving ? "MOVING" : "STOPPED",
      speed_limit_kmh: v.limit,
      odometer_km: 120000 + i * 18000,
      vin: `3WKST680${2020 + i}00${100 + i}`,
      telemetry_kind: v.provider === "SIMULATOR" ? "SIMULATED" : "LIVE",
      fuel_type: v.type === "REFRIGERADO" ? "DIESEL" : "DIESEL",
      capacity: v.type === "VAN" ? 3.5 : v.type === "TRACTO" ? 20 : 12,
      active: i !== 6,
      created_by: userId,
    });
    const token = nid().replace(/-/g, "").slice(0, 24);
    await insert(sql, "gps_devices", {
      id: deviceIds[i],
      company_id: companyId,
      vehicle_id: vehicleIds[i],
      provider: v.provider,
      device_imei: `35693803${100000 + i}`,
      ingest_token: "",
      ingest_token_hash: hashSecret(token),
      status: v.mode === "OFFLINE" ? "OFFLINE" : "ONLINE",
    });
    if (v.provider === "SIMULATOR") {
      await insert(sql, "vehicle_simulations", {
        vehicle_id: vehicleIds[i],
        company_id: companyId,
        sim_route: v.route,
        sim_progress: v.progress,
        sim_mode: v.mode,
        is_development: true,
      });
    }
  }

  const fences = [
    { name: "Patio base Monterrey", type: "BASE", lat: C.MTY.lat, lng: C.MTY.lng, r: 900, poly: "" },
    { name: "CEDIS Alimentos del Valle", type: "CLIENTE", lat: C.MTY.lat + 0.04, lng: C.MTY.lng + 0.03, r: 700, poly: "" },
    { name: "Caseta Palmillas", type: "OPERACION", lat: 20.35, lng: -99.9, r: 1200, poly: "" },
    { name: "Zona restringida Santa Catarina", type: "RESTRINGIDA", lat: C.SCB.lat, lng: C.SCB.lng, r: 500, poly: JSON.stringify([
      { lat: C.SCB.lat - 0.02, lng: C.SCB.lng - 0.02 },
      { lat: C.SCB.lat - 0.02, lng: C.SCB.lng + 0.02 },
      { lat: C.SCB.lat + 0.02, lng: C.SCB.lng + 0.02 },
      { lat: C.SCB.lat + 0.02, lng: C.SCB.lng - 0.02 },
    ]) },
    { name: "Taller Saltillo", type: "OTRA", lat: C.SAL.lat, lng: C.SAL.lng, r: 450, poly: "" },
  ];
  const fenceIds = fences.map(() => nid());
  for (let i = 0; i < fences.length; i++) {
    const f = fences[i]!;
    await insert(sql, "geofences", {
      id: fenceIds[i],
      company_id: companyId,
      name: f.name,
      type: f.type,
      client_id: f.type === "CLIENTE" ? clientIds[0] : null,
      lat: f.lat,
      lng: f.lng,
      radius_m: f.r,
      polygon: f.poly,
      status: "ACTIVE",
      created_by: userId,
    });
  }

  for (let i = 0; i < vehicleSpecs.length; i++) {
    const v = vehicleSpecs[i]!;
    const pts = parseRoute(v.route);
    if (pts.length < 2) continue;
    const steps = 28;
    for (let s = 0; s < steps; s++) {
      const t = Math.max(0, v.progress - (steps - s) * 0.018);
      const pos = interpolateRoute(pts, ((t % 1) + 1) % 1);
      const when = iso(now - (steps - s) * 22 * 60_000);
      const moving = v.mode === "MOVING" || s < steps - 4;
      const speed = moving ? 60 + ((s * 7) % 28) : 0;
      const speeding = i === 0 && s % 9 === 0;
      const useSpeed = speeding ? 102 : speed;
      await insert(sql, "gps_positions", {
        id: nid(),
        company_id: companyId,
        vehicle_id: vehicleIds[i],
        gps_device_id: deviceIds[i],
        latitude: pos.lat,
        longitude: pos.lng,
        speed: v.mode === "OFFLINE" && s > steps - 6 ? 0 : useSpeed,
        heading: 200,
        altitude: 550,
        accuracy: 10,
        recorded_at: v.mode === "OFFLINE" && s > steps - 3 ? hours(-0.8) : when,
      });
      if (speeding) {
        await insert(sql, "speed_alerts", {
          id: nid(),
          company_id: companyId,
          vehicle_id: vehicleIds[i],
          driver_id: v.driver == null ? null : driverIds[v.driver],
          speed: 102,
          limit_kmh: v.limit,
          latitude: pos.lat,
          longitude: pos.lng,
          recorded_at: when,
        });
      }
    }
  }

  await insert(sql, "geofence_events", {
    id: nid(), company_id: companyId, geofence_id: fenceIds[0], vehicle_id: vehicleIds[0],
    kind: "EXIT", latitude: C.MTY.lat, longitude: C.MTY.lng, recorded_at: hours(-6.2), dwell_seconds: 2400,
  });
  await insert(sql, "geofence_events", {
    id: nid(), company_id: companyId, geofence_id: fenceIds[2], vehicle_id: vehicleIds[0],
    kind: "ENTER", latitude: 20.35, longitude: -99.9, recorded_at: hours(-2.1), dwell_seconds: null,
  });
  await insert(sql, "geofence_events", {
    id: nid(), company_id: companyId, geofence_id: fenceIds[2], vehicle_id: vehicleIds[0],
    kind: "EXIT", latitude: 20.36, longitude: -99.91, recorded_at: hours(-1.7), dwell_seconds: 1440,
  });
  await insert(sql, "geofence_events", {
    id: nid(), company_id: companyId, geofence_id: fenceIds[1], vehicle_id: vehicleIds[5],
    kind: "ENTER", latitude: C.MTY.lat + 0.04, longitude: C.MTY.lng + 0.03, recorded_at: hours(-1.1), dwell_seconds: null,
  });

  // Demo TMS flow: services, loads, stops, route, POD, costs, incidents,
  // documents, maintenance and fuel are seeded so the application starts
  // with an end-to-end operational picture instead of empty modules.
  const seededServices = [
    {
      id: nid(), number: "000184", client: 0, vehicle: 0, driver: 0, status: "IN_TRANSIT",
      origin: C.MTY, destination: C.QRO, priority: "HIGH", revenue: 28000, requirePod: true,
      reference: "OC-AVL-184", cargo: "Alimentos refrigerados", weight: 18200, pieces: 28,
      departure: hours(-3.8), arrival: hours(4.2), eta: hours(2.1), route: [C.MTY, C.SLP, C.QRO],
    },
    {
      id: nid(), number: "000185", client: 3, vehicle: 1, driver: 1, status: "DELIVERED",
      origin: C.MTY, destination: C.NLD, priority: "NORMAL", revenue: 24400, requirePod: true,
      reference: "OC-RDN-185", cargo: "Mercancía seca", weight: 14000, pieces: 42,
      departure: hours(-30), arrival: hours(-20), eta: hours(-20), route: [C.MTY, C.NLD],
    },
    {
      id: nid(), number: "000186", client: 2, vehicle: 2, driver: 5, status: "ASSIGNED",
      origin: C.GDL, destination: C.QRO, priority: "NORMAL", revenue: 19800, requirePod: true,
      reference: "OC-CB-186", cargo: "Paquetería industrial", weight: 9600, pieces: 31,
      departure: hours(5), arrival: hours(10), eta: hours(10), route: [C.GDL, C.LEO, C.QRO],
    },
    {
      id: nid(), number: "000187", client: 0, vehicle: 3, driver: 3, status: "AT_DESTINATION",
      origin: C.LEO, destination: C.CDMX, priority: "HIGH", revenue: 22150, requirePod: true,
      reference: "OC-AVL-187", cargo: "Cadena de frío", weight: 11200, pieces: 18,
      departure: hours(-8), arrival: hours(-1), eta: hours(-0.2), route: [C.LEO, C.QRO, C.CDMX],
    },
  ];

  for (const svc of seededServices) {
    const rad = (n: number) => (n * Math.PI) / 180;
    const distanceKm = svc.route.slice(1).reduce((sum, point, i) => {
      const from = svc.route[i]!;
      const to = point;
      const dLat = rad(to.lat - from.lat);
      const dLng = rad(to.lng - from.lng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
      return sum + 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }, 0);
    await insert(sql, "services", {
      id: svc.id, company_id: companyId, service_number: svc.number, client_id: clientIds[svc.client],
      origin: svc.origin.name, destination: svc.destination.name, origin_lat: svc.origin.lat, origin_lng: svc.origin.lng,
      destination_lat: svc.destination.lat, destination_lng: svc.destination.lng,
      scheduled_departure_at: svc.departure, scheduled_arrival_at: svc.arrival,
      actual_departure_at: svc.status === "PLANNED" ? null : svc.departure,
      actual_arrival_at: ["AT_DESTINATION", "DELIVERED"].includes(svc.status) ? hours(-0.8) : null,
      vehicle_id: vehicleIds[svc.vehicle], driver_id: driverIds[svc.driver],
      cargo_description: svc.cargo, cargo_weight: svc.weight, cargo_volume: 48, pieces: svc.pieces,
      status: svc.status, priority: svc.priority, reference: svc.reference,
      notes: svc.status === "AT_DESTINATION" ? "Esperando descarga y confirmación de receptor." : "Servicio operativo de demostración.",
      require_pod: svc.requirePod, eta_at: svc.eta, planned_distance_km: distanceKm,
      planned_duration_min: Math.max(1, (distanceKm / 70) * 60), actual_distance_km: svc.status === "DELIVERED" ? distanceKm * 0.98 : distanceKm * 0.41,
      gross_revenue: svc.revenue, created_by: userId,
    });
    const history = svc.status === "DELIVERED"
      ? ["PLANNED", "ASSIGNED", "AT_ORIGIN", "LOADING", "LOADED", "IN_TRANSIT", "AT_DESTINATION", "UNLOADING", "DELIVERED"]
      : svc.status === "AT_DESTINATION"
        ? ["PLANNED", "ASSIGNED", "AT_ORIGIN", "LOADING", "LOADED", "IN_TRANSIT", "AT_DESTINATION"]
        : svc.status === "IN_TRANSIT"
          ? ["PLANNED", "ASSIGNED", "AT_ORIGIN", "LOADING", "LOADED", "IN_TRANSIT"]
          : ["PLANNED", "ASSIGNED"];
    for (let i = 0; i < history.length; i++) {
      await insert(sql, "service_status_history", {
        id: nid(), company_id: companyId, service_id: svc.id, from_status: i ? history[i - 1]! : "",
        to_status: history[i]!, changed_at: hours(-24 + i * 2), changed_by: userId, notes: "Historial inicial de servicio",
      });
    }
    for (let i = 0; i < svc.route.length; i++) {
      const pt = svc.route[i]!;
      await insert(sql, "service_stops", {
        id: nid(), company_id: companyId, service_id: svc.id, kind: i === 0 ? "ORIGIN" : i === svc.route.length - 1 ? "DESTINATION" : "WAYPOINT",
        sequence: i === 0 ? 0 : i === svc.route.length - 1 ? 99 : i, name: pt.name, address: pt.name,
        latitude: pt.lat, longitude: pt.lng, planned_arrival: null,
        actual_arrival: i === svc.route.length - 1 && svc.status !== "IN_TRANSIT" ? hours(-1) : null,
        status: i === svc.route.length - 1 && svc.status === "DELIVERED" ? "DELIVERED" : i === 0 ? "COMPLETED" : "PENDING",
      });
    }
    await insert(sql, "route_plans", {
      id: nid(), company_id: companyId, service_id: svc.id, distance_km: distanceKm, duration_min: Math.max(1, (distanceKm / 70) * 60),
      polyline: JSON.stringify(svc.route.map((p) => ({ lat: p.lat, lng: p.lng }))),
    });
    await insert(sql, "service_loads", {
      id: nid(), company_id: companyId, service_id: svc.id, load_number: `C-${svc.number}`, description: svc.cargo,
      weight_kg: svc.weight, volume_m3: 48, pieces: svc.pieces, status: svc.status === "DELIVERED" ? "DELIVERED" : "LOADED", reference: svc.reference, created_by: userId,
    });
  }

  const delivered = seededServices[1]!;
  await insert(sql, "delivery_evidence", {
    id: nid(), company_id: companyId, service_id: delivered.id, receiver_name: "Patricia Nava", receiver_document: "INE-DEMO-185",
    signature: "signed-demo", photo_url: "", comments: "Entrega completa y sin observaciones.", latitude: C.NLD.lat, longitude: C.NLD.lng,
    captured_at: hours(-20), captured_by: userId,
  });

  const serviceCosts = [
    [seededServices[0]!.id, "FUEL", 4200, "Carga de combustible durante tránsito"],
    [seededServices[0]!.id, "TOLL", 1640, "Casetas corredor Bajío"],
    [seededServices[0]!.id, "DRIVER", 1850, "Viático operativo"],
    [seededServices[1]!.id, "FUEL", 3600, "Combustible viaje terminado"],
    [seededServices[1]!.id, "TOLL", 1180, "Casetas Laredo"],
    [seededServices[3]!.id, "OTHER", 950, "Maniobras en destino"],
  ] as const;
  for (const [serviceId, kind, amount, notes] of serviceCosts) {
    await insert(sql, "service_cost_lines", { id: nid(), company_id: companyId, service_id: serviceId, kind, amount, notes });
  }

  await insert(sql, "incidents", {
    id: nid(), company_id: companyId, service_id: seededServices[0]!.id, vehicle_id: vehicleIds[0], driver_id: driverIds[0],
    type: "DELAY", severity: "WARNING", status: "OPEN", title: "Tráfico en corredor San Luis", description: "ETA ajustada por congestión.",
    occurred_at: hours(-0.5), created_by: userId,
  });
  await insert(sql, "incidents", {
    id: nid(), company_id: companyId, service_id: seededServices[1]!.id, vehicle_id: vehicleIds[1], driver_id: driverIds[1],
    type: "OTHER", severity: "INFO", status: "RESOLVED", title: "Entrega confirmada", description: "POD recibido correctamente.",
    occurred_at: hours(-20), resolved_at: hours(-19.8), created_by: userId, resolved_by: userId,
  });

  await insert(sql, "documents", {
    id: nid(), company_id: companyId, owner_type: "VEHICLE", owner_id: vehicleIds[0], document_type: "POLIZA",
    title: "Póliza SM-01", file_url: "", issued_at: days(-120), expires_at: days(40), status: "VALID", created_by: userId,
  });
  await insert(sql, "documents", {
    id: nid(), company_id: companyId, owner_type: "DRIVER", owner_id: driverIds[2], document_type: "LICENCIA",
    title: "Licencia Pedro Castillo", file_url: "", issued_at: days(-400), expires_at: days(9), status: "EXPIRING", created_by: userId,
  });
  await insert(sql, "documents", {
    id: nid(), company_id: companyId, owner_type: "SERVICE", owner_id: delivered.id, document_type: "POD",
    title: "POD 000185", file_url: "", issued_at: days(-1), expires_at: null, status: "VALID", created_by: userId,
  });

  await insert(sql, "maintenance_plans", {
    id: nid(), company_id: companyId, vehicle_id: vehicleIds[0], kind: "PREVENTIVE", title: "Servicio 10,000 km",
    interval_km: 10000, interval_days: 90, last_odometer: 118000, last_service_at: days(-80),
    next_due_at: days(10), next_due_km: 128000, status: "ACTIVE",
  });
  await insert(sql, "maintenance_orders", {
    id: nid(), company_id: companyId, vehicle_id: vehicleIds[6], kind: "CORRECTIVE", title: "Revisión de frenos",
    vendor: "Taller Norte", labor_cost: 1800, parts_cost: 4200, total_cost: 6000, odometer_km: 228400,
    status: "OPEN", observations: "Derivado de inspección con FAIL.", created_by: userId,
  });
  await insert(sql, "maintenance_orders", {
    id: nid(), company_id: companyId, vehicle_id: vehicleIds[4], kind: "CORRECTIVE", title: "Diagnóstico eléctrico",
    vendor: "Taller Saltillo", labor_cost: 900, parts_cost: 700, total_cost: 1600, odometer_km: 192100,
    status: "CLOSED", opened_at: hours(-72), closed_at: hours(-60), observations: "Prueba completada.", created_by: userId,
  });

  const fuelRows = [
    [vehicleIds[0]!, driverIds[0]!, seededServices[0]!.id, 420, 25.3, 121340],
    [vehicleIds[0]!, driverIds[0]!, seededServices[0]!.id, 380, 25.1, 123020],
    [vehicleIds[1]!, driverIds[1]!, seededServices[1]!.id, 400, 25.6, 142880],
  ] as const;
  for (const [vehicleId, driverId, serviceId, liters, price, odometer] of fuelRows) {
    await insert(sql, "fuel_transactions", {
      id: nid(), company_id: companyId, vehicle_id: vehicleId, driver_id: driverId, service_id: serviceId,
      liters, price_per_liter: price, total: liters * price, odometer, station: "GAS DEMO", fuel_type: "DIESEL", created_by: userId,
    });
  }

  await insert(sql, "alerts", {
    id: nid(), company_id: companyId, type: "ETA_DELAY", severity: "WARNING", status: "OPEN",
    title: "Retraso de ETA 000184", body: "La unidad reporta llegada posterior a la ventana programada.", entity_type: "SERVICE",
    entity_id: seededServices[0]!.id, vehicle_id: vehicleIds[0], driver_id: driverIds[0], service_id: seededServices[0]!.id,
  });
  await insert(sql, "alerts", {
    id: nid(), company_id: companyId, type: "MAINTENANCE_DUE", severity: "CRITICAL", status: "OPEN",
    title: "SM-07 fuera de servicio", body: "Existe una orden de mantenimiento correctivo abierta.", entity_type: "VEHICLE",
    entity_id: vehicleIds[6], vehicle_id: vehicleIds[6],
  });

  const inspCats = ["LLANTAS", "LUCES", "LIQUIDOS", "LIMPIEZA", "CARROCERIA", "MOTOR", "FRENOS", "EQUIPO_SEGURIDAD"];
  async function seedInspection(
    vehicle: string,
    driver: string | null,
    status: string,
    when: string,
    failCat?: string,
  ) {
    const id = nid();
    await insert(sql, "inspections", {
      id,
      company_id: companyId,
      vehicle_id: vehicle,
      driver_id: driver,
      user_id: userId,
      inspected_at: when,
      status,
      observations: status === "FAIL" ? "Fuga menor de aceite y desgaste irregular." : status === "WARNING" ? "Presión baja en llanta de tracción." : "Unidad en condiciones de operación.",
      photos: "[]",
    });
    for (const cat of inspCats) {
      const st = cat === failCat ? status : "PASS";
      await insert(sql, "inspection_items", {
        id: nid(),
        inspection_id: id,
        category: cat,
        status: st,
        notes: st === "PASS" ? "" : "Revisar en taller",
      });
    }
  }
  await seedInspection(vehicleIds[0]!, driverIds[0]!, "PASS", hours(-20));
  await seedInspection(vehicleIds[1]!, driverIds[1]!, "WARNING", hours(-8), "LLANTAS");
  await seedInspection(vehicleIds[4]!, driverIds[2]!, "FAIL", hours(-3), "FRENOS");
  await seedInspection(vehicleIds[5]!, driverIds[4]!, "PASS", hours(-1));

  for (const spec of [
    { vehicleId: vehicleIds[0]!, expiresAt: hours(48), status: "ACTIVE" },
    { vehicleId: vehicleIds[1]!, expiresAt: hours(-2), status: "EXPIRED" },
    { vehicleId: vehicleIds[2]!, expiresAt: hours(24), revokedAt: hours(-1), status: "REVOKED" },
  ]) {
    const seedToken = newSecret(24);
    await insert(sql, "tracking_links", {
      id: nid(), company_id: companyId, token: "", token_hash: hashSecret(seedToken), vehicle_id: spec.vehicleId,
      created_by: userId, expires_at: spec.expiresAt, revoked_at: spec.revokedAt ?? null, status: spec.status,
    });
  }

  const staff = [
    { name: "Roberto Salinas", email: "roberto.salinas@sierramadre.mx", phone: "81 8123 4401", pos: "Jefe de operaciones", role: "SUPERVISOR" },
    { name: "Elena Cruz", email: "elena.cruz@sierramadre.mx", phone: "81 8123 4402", pos: "Despachadora", role: "OPERADOR" },
    { name: display, email, phone: "81 8123 4400", pos: "Administración", role: "ADMIN" },
  ];
  for (const s of staff) {
    await insert(sql, "personnel", {
      id: nid(),
      company_id: companyId,
      full_name: s.name,
      email: s.email,
      phone: s.phone,
      position: s.pos,
      role: s.role,
      status: "ACTIVE",
      user_id: s.role === "ADMIN" ? userId : null,
      created_by: userId,
    });
  }

  const notes: Array<[string, string, string, string | null]> = [
    ["GPS_OFFLINE", "GPS sin conexión SM-05", "La unidad no reporta desde el corredor Torreón–Saltillo.", vehicleIds[4]!],
    ["VEHICLE_ALERT", "Exceso de velocidad SM-01", "102 km/h sobre límite 90 en corredor Querétaro.", vehicleIds[0]!],
    ["GEOFENCE_ENTER", "Entrada a Caseta Palmillas", "SM-01 ingresó a geocerca de operación.", fenceIds[2]!],
    ["GEOFENCE_EXIT", "Salida de patio base", "SM-01 salió de base Monterrey.", fenceIds[0]!],
    ["INSPECTION_FAIL", "Inspección con problema SM-05", "Frenos en FAIL. Unidad no debe circular hasta corrección.", vehicleIds[4]!],
    ["LICENSE_EXPIRING", "Licencia próxima a vencer", "Pedro Castillo vence en 9 días.", driverIds[2]!],
  ];
  for (const n of notes) {
    await insert(sql, "notifications", {
      id: nid(),
      company_id: companyId,
      user_id: userId,
      title: n[1],
      body: n[2],
      kind: n[0],
      entity_id: n[3],
      status: "UNREAD",
      email_queued: true,
      created_at: hours(-Math.random() * 5),
    });
  }

  await writeAudit(companyId, userId, "COMPANY_SEEDED", "COMPANY", companyId, `Flota inicial SOTYGEO para ${display}`);
  await writeAudit(companyId, userId, "CREATE", "USER", userId, "Usuario administrador inicial");
  return { profile, company };
}
