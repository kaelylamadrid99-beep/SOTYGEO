/**
 * Modelo de autorización de SOTYGEO — ÚNICA fuente de verdad (pura, isomórfica, sin I/O).
 * ROLE → PERMISSION (resource.action) → SCOPE. El backend, el menú, los guards de ruta y
 * docs/ROLE_PERMISSION_MATRIX.md (generado) salen de ESTE archivo. Los permisos son configuración
 * de seguridad de la plataforma: no existe API para crearlos ni editarlos en runtime.
 */
import type { Role } from "../types.ts";

export type Scope = "COMPANY" | "OWN" | "ASSIGNED" | "CLIENT" | "LIMITED_CLIENT";
export type Action = "read" | "create" | "update" | "delete" | "manage" | "generate" | "export" | "restore" | "disable";

/**
 * Recursos (nombres en plural). `driver_app` y `portal` son recursos de EXPERIENCIA (no de datos): permiten
 * proteger /conductor y /portal con el mismo mecanismo en lugar de `role === ...`.
 * `devices` (GPS) y `tracking` (enlaces públicos) se separan de `vehicles` porque exponen secretos/enlaces
 * y deben poder concederse por separado.
 */
export const CATALOG = {
  dashboard: ["read"],
  users: ["read", "create", "update", "disable"],
  roles: ["read", "manage"],
  permissions: ["read", "manage"],
  vehicles: ["read", "create", "update", "delete"],
  drivers: ["read", "create", "update", "delete"],
  fleets: ["read", "create", "update", "delete"],
  clients: ["read", "create", "update", "delete"],
  services: ["read", "create", "update", "delete"],
  trips: ["read", "create", "update", "delete"],
  assignments: ["read", "create", "update", "delete"],
  stops: ["read", "create", "update", "delete"],
  pod: ["read", "create", "update", "delete"],
  documents: ["read", "create", "update", "delete"],
  maintenance: ["read", "create", "update", "delete"],
  fuel: ["read", "create", "update", "delete"],
  inspections: ["read", "create", "update"],
  incidents: ["read", "create", "update"],
  geofences: ["read", "create", "update", "delete"],
  alerts: ["read", "create", "update"],
  reports: ["read", "generate", "export"],
  audit: ["read"],
  backups: ["read", "create", "restore"],
  settings: ["read", "update"],
  devices: ["read", "create", "update"],
  tracking: ["read", "create", "update"],
  driver_app: ["read"],
  portal: ["read"],
} as const satisfies Record<string, readonly Action[]>;

export type Resource = keyof typeof CATALOG;
export const ALL_PERMISSIONS: string[] = Object.entries(CATALOG).flatMap(([r, a]) => a.map((x) => `${r}.${x}`));

type Grant = { actions: readonly Action[]; scope: Scope };
type Grants = Partial<Record<Resource, Grant>>;
const g = (scope: Scope, ...actions: Action[]): Grant => ({ actions, scope });
const C = "COMPANY" as const;
const RCU: Action[] = ["read", "create", "update"];
const CRUD: Action[] = ["read", "create", "update", "delete"];

/**
 * pod.delete NO se concede a nadie: la evidencia operativa es inmutable (corrección = flujo versionado/auditado futuro).
 * permissions.manage NO se concede a nadie: los permisos no se editan en runtime.
 * security.manage no existe en el catálogo => denegado para todos.
 */
export const ROLE_GRANTS: Record<Role, Grants> = {
  ADMIN: {
    dashboard: g(C, "read"),
    users: g(C, "read", "create", "update", "disable"),
    roles: g(C, "read", "manage"),
    permissions: g(C, "read"),
    vehicles: g(C, ...CRUD), drivers: g(C, ...CRUD), fleets: g(C, ...CRUD), clients: g(C, ...CRUD),
    services: g(C, ...CRUD), trips: g(C, ...CRUD), assignments: g(C, ...CRUD), stops: g(C, ...CRUD),
    pod: g(C, ...RCU), documents: g(C, ...CRUD), maintenance: g(C, ...CRUD), fuel: g(C, ...CRUD),
    inspections: g(C, ...RCU), incidents: g(C, ...RCU), geofences: g(C, ...CRUD), alerts: g(C, ...RCU),
    reports: g(C, "read", "generate", "export"), audit: g(C, "read"),
    backups: g(C, "read", "create", "restore"), settings: g(C, "read", "update"),
    devices: g(C, ...RCU), tracking: g(C, ...RCU),
  },
  // Comportamiento operativo existente (escritura sobre la operación), SIN usuarios/roles/permisos/backups/auditoría/settings.
  OPERADOR: {
    dashboard: g(C, "read"),
    vehicles: g(C, ...RCU), drivers: g(C, ...RCU), fleets: g(C, ...RCU), clients: g(C, ...RCU),
    services: g(C, ...RCU), trips: g(C, ...RCU), assignments: g(C, ...RCU), stops: g(C, ...RCU),
    pod: g(C, ...RCU), documents: g(C, ...RCU), maintenance: g(C, ...RCU), fuel: g(C, ...RCU),
    inspections: g(C, ...RCU), incidents: g(C, ...RCU), geofences: g(C, ...RCU), alerts: g(C, ...RCU),
    reports: g(C, "read", "generate", "export"),
    devices: g(C, ...RCU), tracking: g(C, ...RCU),
  },
  // «Control operativo de su empresa». Lista del documento de requisitos + lo mínimo necesario
  // (stops, tracking, clients.read, devices.read) — ver docs/AUTHORIZATION_ARCHITECTURE.md §Decisiones.
  SUPERVISOR: {
    dashboard: g(C, "read"),
    services: g(C, ...CRUD), trips: g(C, ...RCU), assignments: g(C, ...RCU), stops: g(C, ...RCU),
    vehicles: g(C, ...RCU), drivers: g(C, ...RCU), fleets: g(C, "read", "update"), clients: g(C, "read"),
    alerts: g(C, "read", "update"), geofences: g(C, ...RCU), inspections: g(C, ...RCU),
    maintenance: g(C, ...RCU), fuel: g(C, ...RCU), pod: g(C, ...RCU), documents: g(C, ...RCU),
    incidents: g(C, ...RCU), reports: g(C, "read", "generate", "export"), audit: g(C, "read"),
    devices: g(C, "read"), tracking: g(C, ...RCU),
  },
  CONDUCTOR: {
    dashboard: g("OWN", "read"),
    services: g("ASSIGNED", "read"),
    trips: g("ASSIGNED", "read", "update"),
    assignments: g("ASSIGNED", "read"),
    stops: g("ASSIGNED", "read"),
    vehicles: g("ASSIGNED", "read"),
    inspections: g("OWN", ...RCU),
    incidents: g("OWN", ...RCU),
    pod: g("ASSIGNED", ...RCU),
    documents: g("OWN", "read"),
    alerts: g("OWN", "read"),
    audit: g("OWN", "read"),
    driver_app: g("OWN", "read"),
  },
  CLIENTE: {
    dashboard: g("CLIENT", "read"),
    services: g("CLIENT", "read"),
    trips: g("CLIENT", "read"),
    pod: g("CLIENT", "read"),
    documents: g("CLIENT", "read"),
    alerts: g("CLIENT", "read"),
    reports: g("CLIENT", "read"),
    vehicles: g("LIMITED_CLIENT", "read"),
    portal: g("CLIENT", "read"),
  },
};

export type Grants_ = { permissions: string[]; scopes: Partial<Record<Resource, Scope>> };

export function grantsFor(role: Role): Grants_ {
  const permissions: string[] = [];
  const scopes: Partial<Record<Resource, Scope>> = {};
  for (const [res, grant] of Object.entries(ROLE_GRANTS[role]) as [Resource, Grant][]) {
    scopes[res] = grant.scope;
    for (const a of grant.actions) permissions.push(`${res}.${a}`);
  }
  return { permissions, scopes };
}

/** Lo mínimo que el motor necesita del AccessScope (AccessScope lo satisface estructuralmente). */
export type AuthzScope = {
  userId: string;
  companyId: string;
  role: Role;
  membershipStatus: string;
  permissions: string[];
  scopes: Partial<Record<Resource, Scope>>;
  forcedDriverId: string | null;
  forcedClientId: string | null;
  allowedVehicleIds?: string[] | null;
};

export type Target = {
  company_id?: string | null;
  /** Dueño/creador del recurso (OWN). */
  user_id?: string | null;
  created_by?: string | null;
  /** Conductor asignado al recurso (ASSIGNED). */
  driver_id?: string | null;
  current_driver_id?: string | null;
  client_id?: string | null;
  id?: string | null;
};

export class ForbiddenError extends Error {
  readonly status = 403;
  readonly permission: string;
  constructor(permission: string) {
    super("No autorizado"); // mensaje estable: no filtra qué permiso falta
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

export function scopeFromProfile(p: {
  user_id: string; company_id: string; role: Role; status: string; driver_id: string | null; client_id: string | null;
}): AuthzScope {
  const { permissions, scopes } = grantsFor(p.role);
  return {
    userId: p.user_id, companyId: p.company_id, role: p.role, membershipStatus: p.status,
    permissions, scopes,
    forcedDriverId: p.role === "CONDUCTOR" ? p.driver_id : null,
    forcedClientId: p.role === "CLIENTE" ? p.client_id : null,
  };
}

export const hasPermission = (s: Pick<AuthzScope, "permissions" | "membershipStatus">, perm: string): boolean =>
  s.membershipStatus === "ACTIVE" && s.permissions.includes(perm);

export const getResourceScope = (s: Pick<AuthzScope, "scopes">, resource: Resource): Scope | null =>
  s.scopes[resource] ?? null;

export function assertPermission(s: Pick<AuthzScope, "permissions" | "membershipStatus">, perm: string): void {
  if (!hasPermission(s, perm)) throw new ForbiddenError(perm);
}

export function assertCompanyAccess(s: Pick<AuthzScope, "companyId">, companyId: string | null | undefined): void {
  if (companyId && companyId !== s.companyId) throw new ForbiddenError("company");
}

/** ¿El objetivo cae dentro del scope del recurso? Un target sin los campos requeridos por el scope se DENIEGA. */
export function scopeAllows(s: AuthzScope, resource: Resource, target?: Target): boolean {
  const scope = s.scopes[resource];
  if (!scope) return false;
  if (target?.company_id && target.company_id !== s.companyId) return false; // multiempresa SIEMPRE
  if (scope === "COMPANY") return true;
  if (!target) return true; // sin target (lista/creación): el filtrado por scope lo aplica la consulta
  switch (scope) {
    case "OWN":
      return (
        (!!target.user_id && target.user_id === s.userId) ||
        (!!target.created_by && target.created_by === s.userId) ||
        (!!s.forcedDriverId && target.driver_id === s.forcedDriverId)
      );
    case "ASSIGNED": {
      const d = target.driver_id ?? target.current_driver_id;
      return !!s.forcedDriverId && !!d && d === s.forcedDriverId;
    }
    case "CLIENT":
      return !!s.forcedClientId && target.client_id === s.forcedClientId;
    case "LIMITED_CLIENT":
      return (
        !!s.forcedClientId && target.client_id === s.forcedClientId &&
        (!target.id || !s.allowedVehicleIds || s.allowedVehicleIds.includes(target.id))
      );
  }
}

/** can(scope, resource, action, target?) = autenticado + membresía ACTIVE + empresa + permiso + scope + pertenencia. */
export function can(s: AuthzScope, resource: Resource, action: Action, target?: Target): boolean {
  return hasPermission(s, `${resource}.${action}`) && scopeAllows(s, resource, target);
}

export function assertResourceAccess(s: AuthzScope, resource: Resource, action: Action, target?: Target): void {
  if (!can(s, resource, action, target)) throw new ForbiddenError(`${resource}.${action}`);
}

/** Proyección segura de vehículo para LIMITED_CLIENT: lista blanca (nunca "select *"). */
export const CLIENT_VEHICLE_FIELDS = [
  "id", "economic_number", "brand", "model", "status", "current_latitude", "current_longitude",
  "last_gps_at", "motion_state", "eta_at",
] as const;

export function clientVehicleView(v: Record<string, unknown>, eta: string | null = null) {
  return {
    id: v["id"], economic_number: v["economic_number"], brand: v["brand"], model: v["model"], status: v["status"],
    current_latitude: v["current_latitude"] ?? null, current_longitude: v["current_longitude"] ?? null,
    last_gps_at: v["last_gps_at"] ?? null, motion_state: v["motion_state"], eta_at: eta,
  };
}

/** Scope del recurso para un perfil (sin I/O). Úsese en lugar de comparar `role === ...`. */
export function scopeOf(
  p: { user_id: string; company_id: string; role: Role; status: string; driver_id: string | null; client_id: string | null },
  resource: Resource,
): Scope | null {
  return getResourceScope(scopeFromProfile(p), resource);
}

/** hasPermission para un perfil (frontend: UX, no seguridad). */
export const profileCan = (
  p: { user_id: string; company_id: string; role: Role; status: string; driver_id: string | null; client_id: string | null },
  perm: string,
): boolean => hasPermission(scopeFromProfile(p), perm);
