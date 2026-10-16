/** Guards de ruta y menú derivados de PERMISOS (UX, no seguridad: el backend repite la validación). */
import type { Role } from "../types.ts";
import { grantsFor, type Grants_, type Resource, type Scope } from "./permissions.ts";

type Req = { permission: string; /** si se indica, el scope del recurso debe ser uno de estos (p. ej. listados globales solo COMPANY) */ scopes?: Scope[] };
const CO: Scope[] = ["COMPANY"];

/** undefined => cualquier usuario autenticado y activo. */
export const ROUTE_REQUIREMENTS: Record<string, Req | undefined> = {
  "/": { permission: "dashboard.read" },
  "/monitor": { permission: "vehicles.read" },
  "/historial": { permission: "vehicles.read" },
  "/portal": { permission: "portal.read" },
  "/servicios": { permission: "services.read" },
  "/inspecciones": { permission: "inspections.read" },
  "/incidencias": { permission: "incidents.read" },
  "/vehiculos": { permission: "vehicles.read", scopes: CO },
  "/gps": { permission: "devices.read" },
  "/conductores": { permission: "drivers.read" },
  "/flotillas": { permission: "fleets.read" },
  "/geocercas": { permission: "geofences.read" },
  "/mantenimiento": { permission: "maintenance.read" },
  "/combustible": { permission: "fuel.read" },
  "/clientes": { permission: "clients.read" },
  "/usuarios": { permission: "users.read" },
  "/enlaces": { permission: "tracking.read" },
  "/documentos": { permission: "documents.read" },
  "/alertas": { permission: "alerts.read" },
  "/reportes": { permission: "reports.generate" },
  "/finanzas": { permission: "reports.generate" },
  "/notificaciones": undefined,
  "/respaldos": { permission: "backups.read" },
  "/conductor": { permission: "driver_app.read" },
};

type G = Role | Grants_;
const asGrants = (g: G): Grants_ => (typeof g === "string" ? grantsFor(g) : g);

export function homeFor(g: G): string {
  const p = asGrants(g).permissions;
  if (p.includes("portal.read")) return "/portal";
  if (p.includes("driver_app.read")) return "/conductor";
  return "/";
}

/** Rutas no listadas (/tracking/$token, /login, /activate…) no se restringen aquí. */
export function canOpenPath(g: G, pathname: string): boolean {
  const grants = asGrants(g);
  const key = Object.keys(ROUTE_REQUIREMENTS)
    .filter((k) => (k === "/" ? pathname === "/" : pathname === k || pathname.startsWith(k + "/")))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return true;
  const req = ROUTE_REQUIREMENTS[key];
  if (!req) return true;
  if (!grants.permissions.includes(req.permission)) return false;
  if (req.scopes) {
    const resource = req.permission.split(".")[0] as Resource;
    const sc = grants.scopes[resource];
    if (!sc || !req.scopes.includes(sc)) return false;
  }
  return true;
}

export function redirectTarget(g: G, pathname: string): string | null {
  const home = homeFor(g);
  if (pathname === "/" && home !== "/") return home;
  if (!canOpenPath(g, pathname)) return home;
  return null;
}
