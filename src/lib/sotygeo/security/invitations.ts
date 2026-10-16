/** Lógica pura del ciclo de vida de invitaciones (sin I/O: testeable, isomórfica). */
import { z } from "zod";
import type { Role } from "../types.ts";
import { hashSecret, newSecret } from "./tokens.ts";

export const ROLES = ["ADMIN", "OPERADOR", "SUPERVISOR", "CONDUCTOR", "CLIENTE"] as const;
/** ADMIN solo nace al crear una empresa (registerCompany); nunca por invitación. */
export const INVITABLE_ROLES = ["OPERADOR", "SUPERVISOR", "CONDUCTOR", "CLIENTE"] as const;
export const INVITATION_TTL_HOURS = 72;
export const MAX_EMAIL_ATTEMPTS = 5;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** company_id NO viene del cliente: se toma de la sesión del ADMIN. */
export const inviteInputSchema = z
  .object({
    // eslint-disable-next-line no-control-regex -- rejecting control characters is intentional
    full_name: z.string().trim().min(2).max(120).regex(/^[^<>{}\u0000-\u001f]+$/),
    email: z.string().trim().max(254).email().transform(normalizeEmail),
    phone: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/).default(""),
    role: z.enum(INVITABLE_ROLES),
    driver_id: z.string().min(1).max(64).nullish(),
    client_id: z.string().min(1).max(64).nullish(),
    personnel_id: z.string().min(1).max(64).nullish(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.role === "CONDUCTOR" && !v.driver_id)
      ctx.addIssue({ code: "custom", path: ["driver_id"], message: "Conductor requerido" });
    if (v.role === "CLIENTE" && !v.client_id)
      ctx.addIssue({ code: "custom", path: ["client_id"], message: "Cliente requerido" });
    if (v.role !== "CONDUCTOR" && v.driver_id)
      ctx.addIssue({ code: "custom", path: ["driver_id"], message: "No aplica a este rol" });
    if (v.role !== "CLIENTE" && v.client_id)
      ctx.addIssue({ code: "custom", path: ["client_id"], message: "No aplica a este rol" });
  });
export type InviteInput = z.infer<typeof inviteInputSchema>;

/** Rol y empresa salen de la invitación en BD; `.strict()` rechaza intentos de inyectarlos. */
export const activateInputSchema = z
  .object({
    token: z.string().regex(/^[0-9a-f]{64}$/),
    password: z.string().min(10).max(128),
  })
  .strict();

export function createInvitationToken(now = Date.now(), ttlHours = INVITATION_TTL_HOURS) {
  const raw = newSecret(32); // 256 bits
  return { raw, hash: hashSecret(raw), expiresAt: new Date(now + ttlHours * 3600_000).toISOString() };
}

export type InvitationRow = {
  status: "INVITED" | "ACCEPTED" | "REVOKED";
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
};
export type InvitationState = "INVITED" | "EXPIRED" | "ACCEPTED" | "REVOKED";

export function invitationState(r: InvitationRow, now = Date.now()): InvitationState {
  if (r.status === "REVOKED" || r.revoked_at) return "REVOKED";
  if (r.status === "ACCEPTED" || r.used_at) return "ACCEPTED";
  if (new Date(r.expires_at).getTime() <= now) return "EXPIRED";
  return "INVITED";
}

/** Un token solo sirve si está INVITED. Mensaje único hacia fuera (anti-enumeración). */
export const isInvitationUsable = (r: InvitationRow | null | undefined, now = Date.now()) =>
  !!r && invitationState(r, now) === "INVITED";
export const INVALID_INVITATION_MSG = "Invitación inválida o expirada.";

/** Solo ADMIN crea/gestiona usuarios (users.create). El backend lo verifica; ocultar el botón no basta. */
export const canManageUsers = (role: Role) => role === "ADMIN";

export function loginAllowed(status: string): boolean {
  return status === "ACTIVE" || status === "PENDING";
}

/** Backoff exponencial 1m,2m,4m,... tope 1h. Tras MAX intentos => DEAD. */
export function nextOutboxState(attempts: number, now = Date.now()) {
  const n = attempts + 1;
  if (n >= MAX_EMAIL_ATTEMPTS) return { status: "DEAD" as const, attempts: n, availableAt: null };
  const delayMs = Math.min(60_000 * 2 ** (n - 1), 3600_000);
  return { status: "FAILED" as const, attempts: n, availableAt: new Date(now + delayMs).toISOString() };
}
