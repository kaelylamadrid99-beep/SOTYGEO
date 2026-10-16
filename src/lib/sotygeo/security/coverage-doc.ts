import { scanApiRoutes, scanEndpoints, scopesFor } from "./endpoint-audit.ts";

/** Recurso → tablas cubiertas por la autorización backend. Los secretos permanecen backend-only; el aislamiento por empresa lo aplica el scope de sesión. */
const RLS: Record<string, string> = {
  dashboard: "n/a (agregados vía backend)", users: "profiles, personnel (ADMIN)", roles: "n/a", vehicles: "vehicles + client_vehicles",
  drivers: "drivers", fleets: "fleets", clients: "clients", services: "services (+ stops/loads/route_plans)", trips: "trips",
  assignments: "service_assignments", stops: "service_stops", pod: "delivery_evidence (inmutable)", documents: "documents",
  maintenance: "maintenance_orders/plans", fuel: "fuel_transactions", inspections: "inspections", incidents: "incidents",
  geofences: "geofences/geofence_events", alerts: "alerts", reports: "n/a (calculado en backend)", audit: "audit_logs (COMPANY/OWN)",
  backups: "backend-only (payload)", devices: "backend-only (ingest_token)", tracking: "backend-only (token)",
  roles_: "",
};

export function coverageMarkdown(root: string): string {
  const eps = scanEndpoints(root).sort((a, b) => a.name.localeCompare(b.name));
  const L = [
    "# Cobertura de autorización por endpoint",
    "",
    "> **Generado** por `scripts/gen-coverage.ts` leyendo el código. `tests/endpoints.test.ts` falla si este archivo difiere o si aparece un endpoint sin `authorize()`.",
    "",
    "Columnas: **Backend** = el handler llama `authorize()` antes de tocar datos; **Empresa** = consulta limitada por la empresa de la sesión;",
    "**BD** = cobertura de tablas que debe respetar el scope/autorización del backend; no se depende de RLS de Supabase en este stack;",
    "**Test** = cubierto por tests automatizados (`motor` = matriz de permisos/scopes; los handlers NO tienen test de integración).",
    "",
    "| Endpoint | Método | Permiso | Scope por perfil | Backend | Empresa | RLS | Test |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const e of eps) {
    const perm = e.permissions.length ? e.permissions.join(", ") : `(sesión) ${e.publicReason ?? "SIN AUTORIZACIÓN"}`;
    const res = e.permissions[0]?.split(".")[0] ?? "";
    const scope = e.permissions.length ? [...new Set(e.permissions.map(scopesFor))].join(" · ") : "—";
    L.push(`| ${e.name} | ${e.method} | ${perm} | ${scope} | ${e.authorized || e.publicReason ? "✓" : "✗"} | ${e.companyIsolated ? "✓" : "✗"} | ${RLS[res] ?? "—"} | ${e.authorized ? "motor" : e.publicReason ? "estático" : "✗"} |`);
  }
  L.push("", "## Rutas HTTP (`src/routes/api`)", "", "| Archivo | Autenticación/token | Permiso |", "|---|---|---|");
  for (const r of scanApiRoutes(root)) L.push(`| ${r.file} | ${r.auth ? "✓" : "✗"} | ${r.permission ? "✓" : "n/a"} |`);
  L.push("");
  return L.join("\n");
}
