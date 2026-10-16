import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { getSql, withTransaction } from "@/lib/db";
import { insert, nid, writeAudit } from "../db";
import { clientIpFromHeaders } from "../security/client-ip";
import { dbRateLimit } from "../security/rate-limit";
import { hashSecret, newSecret } from "../security/tokens";

async function insertAudit(tx: Parameters<typeof writeAudit>[6], companyId: string, userId: string) {
  await writeAudit(companyId, userId, "USER_PASSWORD_CHANGED", "USER", userId, JSON.stringify({ via: "password-reset" }), tx);
}

async function clientInfo() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const h = getRequest().headers;
  return { ip: clientIpFromHeaders(h) };
}

const MIN_RESPONSE_MS = 400;

/**
 * Always succeeds (anti-enumeration). Emails go through Resend.
 * - Límite por IP Y por correo (evita bombardear un buzón ajeno).
 * - Un solo enlace vigente: al pedir uno nuevo se invalidan los anteriores.
 * - Tiempo de respuesta mínimo constante: existir o no la cuenta no cambia la latencia.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().max(254).email() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { ip } = await clientInfo();
    const email = data.email.trim().toLowerCase();
    const allowed =
      (await dbRateLimit(`pwreset:${ip}`, 8)) &&
      (await dbRateLimit(`pwreset:em:${hashSecret(email).slice(0, 16)}`, 3, 3600));
    if (allowed) {
      try {
        const sql = await getSql();
        const user = (await sql<{ id: string; name: string }>`
          select id, name from "user" where lower(email) = ${email}
        `)[0];
        if (user) {
          const raw = newSecret(32);
          await withTransaction(async (tx) => {
            await tx`update password_resets set used_at = now() where user_id = ${user.id} and used_at is null`;
            await insert(tx, "password_resets", {
              id: nid(),
              email,
              token: "",
              token_hash: hashSecret(raw),
              user_id: user.id,
              expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            });
          });
          const { resolveAppOrigin, sendEmail, passwordResetEmail } = await import("../notifications/email.server");
          const link = `${resolveAppOrigin()}/restablecer?token=${raw}`;
          const res = await sendEmail({ to: email, ...passwordResetEmail(link) });
          if (!res.ok) console.error("[pwreset] no se pudo enviar el correo", res.error);
        }
      } catch (err) {
        // Nunca revelar el fallo al llamador (misma respuesta siempre).
        console.error("[pwreset] fallo", err instanceof Error ? err.message : err);
      }
    }
    const wait = MIN_RESPONSE_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return { ok: true };
  });

export const completePasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(16).max(128), password: z.string().min(10).max(128) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { ip } = await clientInfo();
    if (!(await dbRateLimit(`pwreset-ok:${ip}`, 10))) throw new Error("Enlace inválido o expirado");
    const sql = await getSql();
    const row = (await sql<{ id: string; user_id: string | null; expires_at: string | null; used_at: string | null }>`
      select id, user_id, expires_at::text as expires_at, used_at::text as used_at
      from password_resets where token_hash = ${hashSecret(data.token)}
    `)[0];
    if (!row?.user_id || row.used_at) throw new Error("Enlace inválido o expirado");
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("Enlace inválido o expirado");
    }
    const passwordHash = await hashPassword(data.password);
    const userId = row.user_id;
    await withTransaction(async (tx) => {
      const updated = await tx<{ id: string }>`
        update password_resets
        set used_at = now()
        where id = ${row.id} and user_id = ${userId} and used_at is null and expires_at > now()
        returning id
      `;
      tx.assert(`(select count(*) from password_resets where id = $1 and used_at is not null) = 1`, [row.id], "enlace inválido o expirado");
      if (!updated[0]) throw new Error("enlace inválido o expirado");

      const { setCredentialPasswordHash } = await import("./auth-accounts");
      await setCredentialPasswordHash(userId, passwordHash, tx);
      await tx`delete from session where "userId" = ${userId}`;

      const profile = (await tx<{ company_id: string }>`
        select company_id from profiles where user_id = ${userId} limit 1
      `)[0];
      if (profile) {
        await insertAudit(tx, profile.company_id, userId);
      }
    });
    return { ok: true };
  });
