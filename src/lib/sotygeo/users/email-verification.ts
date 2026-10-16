import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql, withTransaction, type Sql } from "@/lib/db";
import { insert, nid, writeAudit } from "../db";
import { clientIpFromHeaders } from "../security/client-ip";
import { dbRateLimit } from "../security/rate-limit";
import { hashSecret, newSecret } from "../security/tokens";

export const VERIFICATION_TTL_HOURS = 24;
const INVALID = "Enlace inválido o expirado";
const MIN_RESPONSE_MS = 400;

async function clientIp() {
  const { getRequest } = await import("@tanstack/react-start/server");
  return clientIpFromHeaders(getRequest().headers);
}

/** Crea (dentro de la transacción del llamador) un token de verificación; devuelve el token en claro. */
export async function createEmailVerification(db: Sql, userId: string): Promise<string> {
  const raw = newSecret(32);
  // Un solo enlace válido a la vez: los anteriores quedan inutilizables.
  await db`update email_verifications set used_at = now() where user_id = ${userId} and used_at is null`;
  await insert(db, "email_verifications", {
    id: nid(),
    user_id: userId,
    token_hash: hashSecret(raw),
    expires_at: new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600_000).toISOString(),
  });
  return raw;
}

/** Envía el enlace de verificación (best-effort, fuera de transacción). */
export async function sendVerificationEmail(email: string, rawToken: string): Promise<boolean> {
  const { resolveAppOrigin, sendEmail, emailVerificationEmail } = await import("../notifications/email.server");
  const link = `${resolveAppOrigin()}/verificar-correo?token=${rawToken}`;
  const res = await sendEmail({ to: email, ...emailVerificationEmail(link) });
  return res.ok && !res.skipped;
}

export const verifyEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const ip = await clientIp();
    if (!(await dbRateLimit(`verify-email:${ip}`, 20))) throw new Error(INVALID);
    const sql = await getSql();
    const hashed = hashSecret(data.token);
    const row = (await sql<{ id: string; user_id: string; used_at: string | null }>`
      select id, user_id, used_at::text as used_at from email_verifications
      where token_hash = ${hashed} and expires_at > now()
    `)[0];
    if (!row) throw new Error(INVALID);

    const alreadyVerified = async (db: typeof sql, userId: string) => {
      const user = (await db<{ verified: boolean }>`
        select "emailVerified" as verified from "user" where id = ${userId}
      `)[0];
      return Boolean(user?.verified);
    };

    // Idempotente: un segundo clic (o Strict Mode) no debe fallar si ya se activó.
    if (row.used_at) {
      if (await alreadyVerified(sql, row.user_id)) return { ok: true as const };
      throw new Error(INVALID);
    }

    await withTransaction(async (tx) => {
      const used = await tx<{ id: string }>`
        update email_verifications set used_at = now()
        where id = ${row.id} and used_at is null and expires_at > now() returning id`;
      if (!used[0]) {
        if (await alreadyVerified(tx, row.user_id)) return;
        throw new Error(INVALID);
      }
      await tx`update "user" set "emailVerified" = true, "updatedAt" = now() where id = ${row.user_id}`;
      const activated = await tx<{ company_id: string }>`
        update profiles set status = 'ACTIVE', activated_at = now(), updated_at = now()
        where user_id = ${row.user_id} and status = 'PENDING' returning company_id`;
      if (activated[0]) {
        await writeAudit(activated[0].company_id, row.user_id, "USER_ACTIVATED", "USER", row.user_id, JSON.stringify({ ip, via: "email-verification" }), tx);
      }
    });
    return { ok: true as const };
  });

/** Reenvío anti-enumeración: siempre responde igual y tarda lo mismo. */
export const resendEmailVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().max(254).email() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const ip = await clientIp();
    const email = data.email.trim().toLowerCase();
    const allowed =
      (await dbRateLimit(`verify-resend:ip:${ip}`, 5, 3600)) &&
      (await dbRateLimit(`verify-resend:em:${hashSecret(email).slice(0, 16)}`, 3, 3600));
    if (allowed) {
      try {
        const sql = await getSql();
        const p = (await sql<{ user_id: string }>`
          select user_id from profiles where lower(email) = ${email} and status = 'PENDING' limit 1`)[0];
        if (p) {
          const raw = await withTransaction((tx) => createEmailVerification(tx, p.user_id));
          await sendVerificationEmail(email, raw);
        }
      } catch (err) {
        console.error("[verify-email] reenvío falló", err instanceof Error ? err.message : err);
      }
    }
    const wait = MIN_RESPONSE_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return { ok: true as const };
  });
