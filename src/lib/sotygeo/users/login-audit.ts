import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { writeAudit } from "../db";
import { loginAllowed, normalizeEmail } from "../security/invitations";
import { clientIpFromHeaders } from "../security/client-ip";
import { dbRateLimit } from "../security/rate-limit";
import { hashSecret } from "../security/tokens";

async function clientInfo() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const h = getRequest().headers;
  return { ip: clientIpFromHeaders(h), ua: (h.get("user-agent") ?? "").slice(0, 160) };
}

/** Tras un login correcto en Better Auth: audita USER_LOGIN o, si la cuenta no está ACTIVE, USER_LOGIN_FAILED. */
export const recordLogin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const p = (await sql<{ company_id: string; status: string }>`select company_id, status from profiles where user_id = ${context.userId}`)[0];
    if (!p) return { allowed: true, pending: false }; // primer ingreso: getWorkspace decide
    const { ip, ua } = await clientInfo();
    const ok = loginAllowed(p.status);
    await writeAudit(p.company_id, context.userId, ok ? "USER_LOGIN" : "USER_LOGIN_FAILED", "USER", context.userId, JSON.stringify({ ip, ua, ...(ok ? {} : { reason: p.status }) }));
    return { allowed: ok, pending: p.status === "PENDING" };
  });

/** Credenciales rechazadas. Pública, con rate limit y SIEMPRE responde igual (anti-enumeración). */
export const recordLoginFailure = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().max(254).email() }).parse(d))
  .handler(async ({ data }) => {
    const { ip, ua } = await clientInfo();
    const email = normalizeEmail(data.email);
    if (!(await dbRateLimit(`loginfail:ip:${ip}`, 20)) || !(await dbRateLimit(`loginfail:em:${hashSecret(email).slice(0, 16)}`, 10))) return { ok: true };
    const sql = await getSql();
    const p = (await sql<{ user_id: string; company_id: string }>`select user_id, company_id from profiles where lower(email) = ${email}`)[0];
    if (p) await writeAudit(p.company_id, p.user_id, "USER_LOGIN_FAILED", "USER", p.user_id, JSON.stringify({ ip, ua, reason: "BAD_CREDENTIALS" }));
    return { ok: true };
  });
