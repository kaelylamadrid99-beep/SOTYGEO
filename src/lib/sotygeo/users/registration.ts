import { createServerFn } from "@tanstack/react-start";
import { withTransaction } from "@/lib/db";
import { insert, nid, writeAudit } from "../db";
import { clientIpFromHeaders } from "../security/client-ip";
import { dbRateLimit } from "../security/rate-limit";
import {
  PUBLIC_REGISTRATION_ROLE,
  REGISTRATION_CONFLICT_MSG,
  registerInputSchema,
} from "../security/registration";

async function clientInfo() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const h = getRequest().headers;
  return { ip: clientIpFromHeaders(h), ua: (h.get("user-agent") ?? "").slice(0, 160) };
}

/**
 * Registro público: crea la cuenta en Lovable Cloud (que envía el correo de
 * confirmación), la empresa y el perfil ADMIN del fundador. El rol y la empresa
 * nunca vienen del cliente.
 */
export const registerCompany = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => registerInputSchema.parse(d))
  .handler(async ({ data }) => {
    const { ip, ua } = await clientInfo();
    if (!(await dbRateLimit(`register:ip:${ip}`, 5, 3600))) {
      throw new Error("Demasiados intentos. Intenta más tarde.");
    }
    const { publicAuthClient, requestOrigin } = await import("./cloud-auth.server");
    const origin = await requestOrigin();

    const { data: signUp, error } = await publicAuthClient().auth.signUp({
      email: data.email,
      password: data.password,
      options: { emailRedirectTo: `${origin}/login`, data: { full_name: data.full_name } },
    });
    if (error) {
      if (/registered|exists/i.test(error.message)) throw new Error(REGISTRATION_CONFLICT_MSG);
      console.error("[register] signUp", error.message);
      throw new Error(error.message);
    }
    const userId = signUp.user?.id;
    // Supabase returns a user with no identities when the email already exists.
    if (!userId || (signUp.user?.identities && signUp.user.identities.length === 0)) {
      throw new Error(REGISTRATION_CONFLICT_MSG);
    }

    const companyId = nid();
    try {
      await withTransaction(async (tx) => {
        await insert(tx, "companies", {
          id: companyId,
          name: data.company_name,
          legal_name: data.legal_name || data.company_name,
          rfc: data.rfc,
          phone: data.company_phone,
          email: data.email,
        });
        await insert(tx, "profiles", {
          user_id: userId,
          company_id: companyId,
          role: PUBLIC_REGISTRATION_ROLE,
          full_name: data.full_name,
          email: data.email,
          status: "ACTIVE",
          activated_at: new Date().toISOString(),
        });
        await writeAudit(companyId, userId, "COMPANY_REGISTERED", "COMPANY", companyId, JSON.stringify({ ip, ua }), tx);
      });
    } catch (e) {
      const { deleteAuthUser } = await import("./auth-accounts");
      await deleteAuthUser(userId).catch(() => undefined);
      console.error("[register] fallo al crear la empresa", e instanceof Error ? e.message : e);
      throw new Error("No se pudo completar el registro. Intenta de nuevo.");
    }

    return { ok: true as const, emailSent: true, needsConfirmation: !signUp.session };
  });
