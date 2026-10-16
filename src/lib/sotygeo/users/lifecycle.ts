import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction, type Tx } from "@/lib/db";
import { insert, nid, writeAudit } from "../db";
import { ROLE_LABEL } from "../format";
import {
  INVALID_INVITATION_MSG, ROLES, activateInputSchema, createInvitationToken,
  inviteInputSchema, invitationState, isInvitationUsable, nextOutboxState, type InviteInput,
} from "../security/invitations";
import { hashSecret } from "../security/tokens";
import { clientIpFromHeaders } from "../security/client-ip";
import { dbRateLimit } from "../security/rate-limit";
import type { Role, Workspace } from "../types";
import { getWorkspace } from "../workspace";
import { authorize } from "../security/authorize";

type Inv = {
  id: string; company_id: string; email: string; full_name: string; phone: string; role: Role;
  driver_id: string | null; client_id: string | null; personnel_id: string | null; token_hash: string;
  status: "INVITED" | "ACCEPTED" | "REVOKED"; email_status: string; expires_at: string;
  used_at: string | null; revoked_at: string | null; created_at: string; created_by: string;
};

const GENERIC_CONFLICT = "No se puede invitar a este correo.";

async function requireAdmin(userId: string, permission: string): Promise<Workspace> {
  const ws = await getWorkspace(userId);
  await authorize(ws.profile, permission);
  return ws;
}

async function clientInfo() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const h = getRequest().headers;
  const ip = clientIpFromHeaders(h);
  return { ip, ua: (h.get("user-agent") ?? "").slice(0, 160) };
}

/** Valida que driver/client/personnel pertenezcan a la empresa del ADMIN (nunca confiar en ids del cliente). */
async function assertRelations(companyId: string, v: Pick<InviteInput, "role" | "driver_id" | "client_id" | "personnel_id">) {
  const sql = await getSql();
  if (v.role === "CONDUCTOR") {
    const d = await sql<{ id: string }>`select id from drivers where id = ${v.driver_id} and company_id = ${companyId}`;
    if (!d[0]) throw new Error("Conductor no válido");
    const used = await sql<{ user_id: string }>`select user_id from profiles where driver_id = ${v.driver_id} and company_id = ${companyId} and status <> 'REVOKED'`;
    const pend = await sql<{ id: string }>`select id from user_invitations where driver_id = ${v.driver_id} and company_id = ${companyId} and status = 'INVITED'`;
    if (used[0] || pend[0]) throw new Error("Ese conductor ya tiene un usuario o invitación");
  }
  if (v.role === "CLIENTE") {
    const c = await sql<{ id: string }>`select id from clients where id = ${v.client_id} and company_id = ${companyId}`;
    if (!c[0]) throw new Error("Cliente no válido");
  }
  if (v.personnel_id) {
    const p = await sql<{ id: string }>`select id from personnel where id = ${v.personnel_id} and company_id = ${companyId}`;
    if (!p[0]) throw new Error("Personal no válido");
  }
}

async function queueInvitationEmail(
  tx: Tx,
  ws: Workspace, inv: Pick<Inv, "email" | "full_name" | "role" | "expires_at">, rawToken: string, origin: string,
) {
  const id = nid();
  await insert(tx, "email_outbox", {
    id, company_id: ws.company.id, recipient: inv.email, template: "INVITATION",
    payload: JSON.stringify({ name: inv.full_name, company: ws.company.name, role: ROLE_LABEL[inv.role], expiresAt: inv.expires_at, link: `${origin}/activate?token=${rawToken}` }),
  });
  return id;
}

/** Entrega best-effort FUERA de la transacción. Fallo => FAILED + backoff; nunca borra la cuenta. */
export async function deliverOutbox(ids?: string[]): Promise<{ sent: number; failed: number }> {
  const sql = await getSql();
  const due = ids?.length
    ? await sql<{ id: string }>`select id from email_outbox where id = any(${ids}) and (status in ('PENDING','FAILED') or (status = 'PROCESSING' and updated_at < now() - interval '5 minutes')) and available_at <= now()`
    : await sql<{ id: string }>`select id from email_outbox where (status in ('PENDING','FAILED') or (status = 'PROCESSING' and updated_at < now() - interval '5 minutes')) and available_at <= now() order by available_at limit 20`;
  const { sendEmail, invitationEmail, accountActivatedEmail } = await import("../notifications/email.server");
  let sent = 0, failed = 0;
  for (const { id } of due) {
    // Claim atómico: solo un worker procesa cada fila.
    const claimed = await sql<{ id: string; recipient: string; template: string; payload: string; attempts: number; company_id: string }>`
      update email_outbox set status = 'PROCESSING', updated_at = now()
      where id = ${id} and (status in ('PENDING','FAILED') or (status = 'PROCESSING' and updated_at < now() - interval '5 minutes')) returning id, recipient, template, payload, attempts, company_id`;
    const row = claimed[0];
    if (!row) continue;
    try {
      const p = JSON.parse(row.payload) as Record<string, string>;
      const body = row.template === "INVITATION"
        ? invitationEmail(p as never) : accountActivatedEmail(p as never);
      const res = await sendEmail({ to: row.recipient, ...body });
      if (!res.ok) throw new Error(res.error ?? "fallo de entrega");
      // Al enviar se borra el payload: ya no queda el token en claro.
      await sql`update email_outbox set status = 'SENT', sent_at = now(), payload = '{}', last_error = '', provider_message_id = ${res.providerMessageId ?? ''}, updated_at = now() where id = ${id}`;
      await sql`update user_invitations set email_status = 'SENT', updated_at = now() where company_id = ${row.company_id} and lower(email) = ${row.recipient.toLowerCase()} and status = 'INVITED' and ${row.template} = 'INVITATION'`;
      sent++;
    } catch (e) {
      const n = nextOutboxState(row.attempts);
      const msg = (e instanceof Error ? e.message : "error").slice(0, 200);
      await sql`update email_outbox set status = ${n.status}, attempts = ${n.attempts}, available_at = ${n.availableAt ?? new Date().toISOString()},
        last_error = ${msg}, payload = ${n.status === "DEAD" ? "{}" : row.payload}, updated_at = now() where id = ${id}`;
      await sql`update user_invitations set email_status = 'FAILED', updated_at = now() where company_id = ${row.company_id} and lower(email) = ${row.recipient.toLowerCase()} and status = 'INVITED' and ${row.template} = 'INVITATION'`;
      failed++;
    }
  }
  return { sent, failed };
}

async function originOf(): Promise<string> {
  const { resolveAppOrigin } = await import("../notifications/email.server");
  return resolveAppOrigin();
}

// ───────────────────────── ADMIN ─────────────────────────

export const listUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ws = await requireAdmin(context.userId, "users.read");
    const sql = await getSql();
    const members = await sql<{ user_id: string; full_name: string; email: string; role: Role; status: string; driver_id: string | null; client_id: string | null; activated_at: string | null }>`
      select user_id, full_name, email, role, status, driver_id, client_id, activated_at from profiles where company_id = ${ws.company.id} order by full_name`;
    const invs = await sql<Inv>`
      select * from user_invitations where company_id = ${ws.company.id} and status <> 'ACCEPTED' order by created_at desc`;
    return {
      members,
      invitations: invs.map((i) => ({
        id: i.id, full_name: i.full_name, email: i.email, role: i.role, driver_id: i.driver_id, client_id: i.client_id,
        state: invitationState(i), email_status: i.email_status, expires_at: i.expires_at,
      })),
    };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => inviteInputSchema.parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await requireAdmin(context.userId, "users.create");
    const sql = await getSql();
    // Evita usar el dominio de la empresa como relé de spam (por usuario y por empresa).
    if (!(await dbRateLimit(`invite:user:${context.userId}`, 30, 3600)) || !(await dbRateLimit(`invite:co:${ws.company.id}`, 100, 86400))) {
      throw new Error("Demasiadas invitaciones. Intenta más tarde.");
    }
    await assertRelations(ws.company.id, data);
    // Anti-enumeración entre empresas: mismo mensaje para cualquier conflicto.
    const taken = await sql<{ id: string }>`select id from "user" where lower(email) = ${data.email}`;
    const prof = await sql<{ user_id: string }>`select user_id from profiles where lower(email) = ${data.email}`;
    const pend = await sql<{ id: string }>`select id from user_invitations where company_id = ${ws.company.id} and lower(email) = ${data.email} and status = 'INVITED'`;
    if (prof[0] || pend[0]) throw new Error(GENERIC_CONFLICT);
    if (taken[0]) {
      const hasProfile = await sql<{ user_id: string }>`select user_id from profiles where user_id = ${taken[0].id}`;
      if (hasProfile[0]) throw new Error(GENERIC_CONFLICT);
    }
    const t = createInvitationToken();
    const origin = await originOf();
    const id = nid();
    let outboxId = "";
    await withTransaction(async (tx) => {
      await insert(tx, "user_invitations", {
        id, company_id: ws.company.id, email: data.email, full_name: data.full_name, phone: data.phone,
        role: data.role, driver_id: data.driver_id ?? null, client_id: data.client_id ?? null,
        personnel_id: data.personnel_id ?? null, token_hash: t.hash, expires_at: t.expiresAt, created_by: context.userId,
      });
      outboxId = await queueInvitationEmail(tx, ws, { email: data.email, full_name: data.full_name, role: data.role, expires_at: t.expiresAt }, t.raw, origin);
      await writeAudit(ws.company.id, context.userId, "USER_INVITED", "USER", id, JSON.stringify({ email: data.email, role: data.role }), tx);
    });
    const r = await deliverOutbox([outboxId]);
    return { id, email: data.email, state: "INVITED" as const, emailSent: r.sent === 1 };
  });

export const resendInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(64) }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await requireAdmin(context.userId, "users.create");
    if (!(await dbRateLimit(`resend:${context.userId}`, 10)) || !(await dbRateLimit(`resend:co:${ws.company.id}`, 60, 3600))) throw new Error("Demasiados intentos");
    const sql = await getSql();
    const inv = (await sql<Inv>`select * from user_invitations where id = ${data.id} and company_id = ${ws.company.id}`)[0];
    if (!inv || inv.status !== "INVITED") throw new Error("Invitación no encontrada");
    const t = createInvitationToken();
    const origin = await originOf();
    let outboxId = "";
    await withTransaction(async (tx) => {
      // Reemplaza el hash: el token anterior deja de existir (nunca dos válidos a la vez).
      await tx`update user_invitations set token_hash = ${t.hash}, expires_at = ${t.expiresAt}, email_status = 'PENDING', updated_at = now()
               where id = ${inv.id} and company_id = ${ws.company.id} and status = 'INVITED'`;
      await tx`update email_outbox set status = 'DEAD', payload = '{}', updated_at = now()
               where company_id = ${ws.company.id} and recipient = ${inv.email} and template = 'INVITATION' and status in ('PENDING','FAILED')`;
      outboxId = await queueInvitationEmail(tx, ws, { email: inv.email, full_name: inv.full_name, role: inv.role, expires_at: t.expiresAt }, t.raw, origin);
      await writeAudit(ws.company.id, context.userId, "USER_INVITATION_RESENT", "USER", inv.id, "", tx);
    });
    const r = await deliverOutbox([outboxId]);
    return { emailSent: r.sent === 1 };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(64) }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await requireAdmin(context.userId, "users.update");
    await withTransaction(async (tx) => {
      const revoked = await tx<{ id: string }>`update user_invitations set status = 'REVOKED', revoked_at = now(), updated_at = now() where id = ${data.id} and company_id = ${ws.company.id} and status = 'INVITED' returning id`;
      if (!revoked[0]) throw new Error("Invitación no encontrada");
      await tx`update email_outbox set status = 'DEAD', payload = '{}' where company_id = ${ws.company.id} and status in ('PENDING','FAILED') and recipient = (select email from user_invitations where id = ${data.id})`;
      await writeAudit(ws.company.id, context.userId, "USER_MEMBERSHIP_CHANGED", "USER", data.id, "REVOKED", tx);
    });
  });

/**
 * Cuenta otros ADMIN activos DENTRO de la transacción, tras bloquear (FOR UPDATE) las
 * filas ADMIN de la empresa: dos administradores que se suspenden a la vez se
 * serializan y el segundo ve que ya no queda otro.
 */
async function otherActiveAdminsLocked(tx: Tx, companyId: string, exceptUserId: string): Promise<number> {
  const admins = await tx<{ user_id: string; status: string }>`
    select user_id, status from profiles where company_id = ${companyId} and role = 'ADMIN' order by user_id for update`;
  return admins.filter((a) => a.status === "ACTIVE" && a.user_id !== exceptUserId).length;
}

async function loadMember(ws: Workspace, userId: string) {
  const sql = await getSql();
  const m = (await sql<{ user_id: string; role: Role; status: string }>`select user_id, role, status from profiles where user_id = ${userId} and company_id = ${ws.company.id}`)[0];
  if (!m) throw new Error("Usuario no encontrado");
  return m;
}

export const setUserStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ user_id: z.string().min(1).max(64), status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]) }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await requireAdmin(context.userId, "users.disable");
    const m = await loadMember(ws, data.user_id);
    if (m.status === "REVOKED") throw new Error("Membresía revocada");
    // El historial (servicios, POD, auditoría) NO se toca: solo cambia el estado.
    await withTransaction(async (tx) => {
      if (data.status !== "ACTIVE" && m.role === "ADMIN" && (await otherActiveAdminsLocked(tx, ws.company.id, m.user_id)) < 1)
        throw new Error("No puedes desactivar al único administrador activo");
      await tx`update profiles set status = ${data.status}, updated_at = now() where user_id = ${m.user_id} and company_id = ${ws.company.id}`;
      await writeAudit(ws.company.id, context.userId, data.status === "ACTIVE" ? "USER_ENABLED" : "USER_DISABLED", "USER", m.user_id, data.status, tx);
    });
    if (data.status !== "ACTIVE") {
      const { revokeSessions } = await import("./auth-accounts");
      await revokeSessions(m.user_id).catch(() => undefined);
    }
  });

export const changeUserRole = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    user_id: z.string().min(1).max(64), role: z.enum(ROLES),
    driver_id: z.string().max(64).nullish(), client_id: z.string().max(64).nullish(),
  }).parse(d))
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const ws = await requireAdmin(context.userId, "roles.manage");
    const m = await loadMember(ws, data.user_id);
    // Promover a ADMIN es una decisión de un ADMIN existente (roles.manage), no de una invitación.
    if (data.role === "ADMIN") {
      if (data.driver_id || data.client_id) throw new Error("Datos de rol no válidos");
    } else {
      const rel = inviteInputSchema.safeParse({ full_name: "x x", email: "a@b.co", role: data.role, driver_id: data.driver_id, client_id: data.client_id });
      if (!rel.success) throw new Error("Datos de rol no válidos");
      if (data.role !== m.role || data.driver_id || data.client_id) await assertRelationsForChange(ws.company.id, rel.data, m.user_id);
    }
    await withTransaction(async (tx) => {
      if (m.role === "ADMIN" && data.role !== "ADMIN" && (await otherActiveAdminsLocked(tx, ws.company.id, m.user_id)) < 1)
        throw new Error("Debe quedar al menos un administrador activo");
      await tx`update profiles set role = ${data.role}, driver_id = ${data.role === "CONDUCTOR" ? data.driver_id ?? null : null},
               client_id = ${data.role === "CLIENTE" ? data.client_id ?? null : null}, updated_at = now()
               where user_id = ${m.user_id} and company_id = ${ws.company.id}`;
      await writeAudit(ws.company.id, context.userId, "USER_ROLE_CHANGED", "USER", m.user_id, `${m.role}->${data.role}`, tx);
    });
    // El Access Scope se recalcula en cada request desde profiles: no hay permisos cacheados.
  });

async function assertRelationsForChange(companyId: string, v: InviteInput, userId: string) {
  const sql = await getSql();
  if (v.role === "CONDUCTOR") {
    const d = await sql<{ id: string }>`select id from drivers where id = ${v.driver_id} and company_id = ${companyId}`;
    if (!d[0]) throw new Error("Conductor no válido");
    const used = await sql<{ user_id: string }>`select user_id from profiles where driver_id = ${v.driver_id} and company_id = ${companyId} and user_id <> ${userId}`;
    if (used[0]) throw new Error("Ese conductor ya tiene un usuario");
  }
  if (v.role === "CLIENTE") {
    const c = await sql<{ id: string }>`select id from clients where id = ${v.client_id} and company_id = ${companyId}`;
    if (!c[0]) throw new Error("Cliente no válido");
  }
}

// ───────────────────────── PÚBLICO (sin sesión) ─────────────────────────

async function findUsable(token: string): Promise<Inv | null> {
  const sql = await getSql();
  const inv = (await sql<Inv>`select * from user_invitations where token_hash = ${hashSecret(token)}`)[0];
  if (!inv || !isInvitationUsable(inv)) return null;
  const co = await sql<{ id: string }>`select id from companies where id = ${inv.company_id}`;
  return co[0] ? inv : null;
}

const tokenOnly = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

export const checkInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenOnly.parse(d))
  .handler(async ({ data }) => {
    const { ip } = await clientInfo();
    if (!(await dbRateLimit(`inv-check:${ip}`, 20))) throw new Error(INVALID_INVITATION_MSG);
    const inv = await findUsable(data.token);
    if (!inv) throw new Error(INVALID_INVITATION_MSG);
    const sql = await getSql();
    const co = (await sql<{ name: string }>`select name from companies where id = ${inv.company_id}`)[0];
    return { company: co?.name ?? "", email: inv.email, role: ROLE_LABEL[inv.role], name: inv.full_name };
  });

export const activateAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => activateInputSchema.parse(d))
  .handler(async ({ data }) => {
    const { ip, ua } = await clientInfo();
    if (!(await dbRateLimit(`activate:${ip}`, 10))) throw new Error(INVALID_INVITATION_MSG);
    const inv = await findUsable(data.token);
    if (!inv) throw new Error(INVALID_INVITATION_MSG);
    let userId = "";
    let createdAuth = false;

    try {
      await withTransaction(async (tx) => {
        const company = (await tx<{ id: string; name: string }>`select id, name from companies where id = ${inv.company_id}`)[0];
        if (!company) throw new Error(INVALID_INVITATION_MSG);

        // Identity lookup, credential creation, invitation acceptance and profile
        // creation are one transaction. Concurrent acceptance races therefore
        // roll back completely instead of leaving orphaned auth rows.
        const existing = (await tx<{ id: string }>`select id from "user" where lower(email) = ${inv.email.toLowerCase()} limit 1`)[0];
        if (existing) {
          const hasProfile = await tx<{ user_id: string }>`select user_id from profiles where user_id = ${existing.id} limit 1`;
          if (hasProfile[0]) throw new Error(INVALID_INVITATION_MSG);
          userId = existing.id;
        } else {
          const { createCredentialUser } = await import("./auth-accounts");
          userId = await createCredentialUser(
            { email: inv.email, password: data.password, name: inv.full_name, emailVerified: true }, // el enlace de invitación llegó a ese correo
            tx,
          );
          createdAuth = true;
        }

        await tx`update user_invitations set status = 'ACCEPTED', accepted_at = now(), used_at = now(), user_id = ${userId}, updated_at = now()
                 where id = ${inv.id} and status = 'INVITED' and revoked_at is null and expires_at > now()`;
        tx.assert(`(select count(*) from user_invitations where id = $1 and status = 'ACCEPTED' and user_id = $2) = 1`, [inv.id, userId], "invitación no disponible");
        await insert(tx, "profiles", {
          user_id: userId, company_id: inv.company_id, role: inv.role, full_name: inv.full_name, email: inv.email, phone: inv.phone,
          driver_id: inv.driver_id, client_id: inv.client_id, personnel_id: inv.personnel_id, status: "ACTIVE", invited_by: inv.created_by,
          invited_at: inv.created_at, accepted_at: new Date().toISOString(), activated_at: new Date().toISOString(),
        });
        if (inv.personnel_id) await tx`update personnel set user_id = ${userId}, updated_at = now() where id = ${inv.personnel_id} and company_id = ${inv.company_id}`;
        const origin = await originOf();
        const outId = nid();
        await insert(tx, "email_outbox", {
          id: outId, company_id: inv.company_id, recipient: inv.email, template: "ACTIVATED",
          payload: JSON.stringify({ name: inv.full_name, company: company.name, role: ROLE_LABEL[inv.role], link: `${origin}/login` }),
        });
        await writeAudit(inv.company_id, userId, "USER_INVITATION_ACCEPTED", "USER", inv.id, JSON.stringify({ ip, ua }), tx);
        await writeAudit(inv.company_id, userId, "USER_ACTIVATED", "USER", userId, JSON.stringify({ ip, ua }), tx);
      });
    } catch (err) {
      // The transaction already rolls back any newly-created Better Auth rows.
      // Never expose the reason to the caller (anti-enumeration / invitation secrecy),
      // but keep it in the server log: otherwise a bad origin config or a DB outage
      // looks exactly like "invalid invitation".
      const reason = err instanceof Error ? err.message : String(err);
      if (reason !== INVALID_INVITATION_MSG) console.error("[activate] fallo al activar la invitación", reason.slice(0, 200));
      throw new Error(INVALID_INVITATION_MSG);
    }
    await deliverOutbox().catch(() => undefined);
    return { ok: true, reusedAccount: !createdAuth };
  });

export const publicSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const n = await sql<{ n: number }>`select count(*)::int as n from companies`;
  return { needsBootstrap: (n[0]?.n ?? 0) === 0 };
});
