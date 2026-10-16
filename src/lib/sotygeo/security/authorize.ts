import { writeAudit } from "../db";
import type { Profile } from "../types";
import { ForbiddenError, assertPermission, scopeFromProfile, type AuthzScope } from "./permissions";

export type AuthorizeOpts = { targetId?: string | null };

async function requestId(): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const h = getRequest().headers.get("x-request-id");
    if (h && /^[\w.-]{1,64}$/.test(h)) return h;
  } catch {
    /* fuera de un request */
  }
  return crypto.randomUUID();
}

/** Deja AUTHORIZATION_DENIED con user, empresa, recurso, acción, objetivo y request_id. Nunca registra secretos. */
export async function auditDenied(profile: Profile, permission: string, opts: AuthorizeOpts = {}): Promise<void> {
  const [resource = "", action = ""] = permission.split(".");
  await writeAudit(
    profile.company_id, profile.user_id, "AUTHORIZATION_DENIED", "AUTHZ", opts.targetId ?? null,
    JSON.stringify({ permission, resource, action, target_id: opts.targetId ?? null, role: profile.role, request_id: await requestId() }),
  ).catch(() => undefined);
}

/**
 * Punto único de autorización por endpoint: se llama ANTES de leer o escribir datos.
 * Sin consultas a BD (el perfil ya viene de la sesión).
 */
export async function authorize(profile: Profile, permission: string, opts: AuthorizeOpts = {}): Promise<AuthzScope> {
  const scope = scopeFromProfile(profile);
  try {
    assertPermission(scope, permission);
    return scope;
  } catch (e) {
    if (e instanceof ForbiddenError) await auditDenied(profile, permission, opts);
    throw e;
  }
}

export const perm = (resource: string, id: unknown) => `${resource}.${id ? "update" : "create"}`;
