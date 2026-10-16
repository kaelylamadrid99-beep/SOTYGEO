/** Auditoría estática de endpoints: lee el código fuente y produce la matriz de cobertura. Sin dependencias. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROLE_GRANTS, type Resource } from "./permissions.ts";

export type EndpointRow = {
  file: string; name: string; method: string; permissions: string[]; authorized: boolean;
  publicReason: string | null; companyIsolated: boolean; viaHelper: string | null;
};

/** Endpoints SIN permiso de recurso, con la razón explícita (cualquier otro sin authorize() es un fallo). */
export const PUBLIC_OR_SESSION_ONLY: Record<string, string> = {
  getPublicTrack: "público por token de seguimiento (hash, expira, revocable)",
  checkInvitation: "público por token de invitación (hash, un solo uso, rate limit)",
  activateAccount: "público por token de invitación (hash, un solo uso, rate limit)",
  recordLoginFailure: "público; respuesta uniforme; rate limit",
  recordLogin: "sesión; solo registra su propio login",
  getBootstrap: "sesión; devuelve únicamente el propio perfil/empresa",
  listNotifications: "sesión; filtradas por empresa + usuario/audiencia",
  markRead: "sesión; solo notificaciones propias",
  markAllRead: "sesión; solo notificaciones propias",
};

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

export function scanEndpoints(root: string): EndpointRow[] {
  const rows: EndpointRow[] = [];
  for (const file of walk(join(root, "src/lib/sotygeo")).filter((f) => !f.includes("/security/") && !f.includes("/jobs/"))) {
    const src = readFileSync(file, "utf8");
    const re = /export const (\w+) = createServerFn\(\{ method: "(GET|POST)"/g;
    const idx: { name: string; method: string; at: number }[] = [];
    for (let m; (m = re.exec(src)); ) idx.push({ name: m[1]!, method: m[2]!, at: m.index });
    idx.forEach((e, i) => {
      const body = src.slice(e.at, idx[i + 1]?.at ?? src.length);
      const perms = [...body.matchAll(/authorize\(\s*ws\.profile,\s*"([\w.]+)"/g)].map((x) => x[1]!);
      for (const m of body.matchAll(/authorize\(\s*ws\.profile,\s*perm\("(\w+)"/g)) perms.push(`${m[1]}.create|update`);
      const helper = /requireAdmin\(context\.userId, "([\w.]+)"\)/.exec(body);
      if (helper) perms.push(helper[1]!);
      const needed = /const needed = [^;]+;/.test(body) && /authorize\(ws\.profile, needed/.test(body);
      if (needed) perms.push(...[...body.matchAll(/"((?:pod|documents|inspections)\.(?:create|read))"/g)].map((x) => x[1]!));
      rows.push({
        file: file.replace(root + "/", ""), name: e.name, method: e.method,
        permissions: [...new Set(perms)], authorized: perms.length > 0,
        publicReason: PUBLIC_OR_SESSION_ONLY[e.name] ?? null,
        // aislamiento por empresa: usa ws.company.id / ctx / scoped / companyId derivado de sesión (nunca data.company_id)
        companyIsolated: /ws\.company\.id|inv\.company_id|profile\.company_id|company_id = \$\{p?\.?company/.test(body) || !!PUBLIC_OR_SESSION_ONLY[e.name],
        viaHelper: helper ? "requireAdmin→authorize" : null,
      });
    });
  }
  return rows;
}

export function scanApiRoutes(root: string): { file: string; auth: boolean; permission: boolean }[] {
  const dir = join(root, "src/routes/api");
  return walk(dir).map((f) => {
    const s = readFileSync(f, "utf8");
    return { file: f.replace(root + "/", ""), auth: /getSessionUser|verifyApiKey|ingest_token|ingestToken|hashSecret|body\?\.token|body\.token/i.test(s) || /openapi/.test(f), permission: /hasPermission|getResourceScope|authorize/.test(s) };
  });
}

/** Perfiles y scope con que cada permiso queda concedido (a partir del catálogo real). */
export function scopesFor(permission: string): string {
  const [res, act] = permission.split(".") as [Resource, string];
  const out: string[] = [];
  for (const [role, grants] of Object.entries(ROLE_GRANTS)) {
    const g = grants[res];
    if (g && (act === "create|update" ? g.actions.some((a) => a === "create" || a === "update") : g.actions.includes(act as never))) out.push(`${role}:${g.scope}`);
  }
  return out.join(", ") || "—";
}
