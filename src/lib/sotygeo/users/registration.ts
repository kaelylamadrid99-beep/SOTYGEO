import { createServerFn } from "@tanstack/react-start";
import { hashPassword } from "better-auth/crypto";
import { withTransaction } from "@/lib/db";
import { insert, nid, writeAudit } from "../db";
import { clientIpFromHeaders } from "../security/client-ip";
import { dbRateLimit } from "../security/rate-limit";
import { createEmailVerification, sendVerificationEmail } from "./email-verification";
import {
  PUBLIC_REGISTRATION_ROLE,
  REGISTRATION_CONFLICT_MSG,
  registerInputSchema,
} from "../security/registration";

async function clientInfo() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const h = getRequest().headers;
  const ip = clientIpFromHeaders(h);
  return { ip, ua: (h.get("user-agent") ?? "").slice(0, 160) };
}

/**
 * Registro público: crea, en UNA transacción, la identidad (user + credential),
 * la empresa y el profile ADMIN del fundador. El perfil nace ACTIVE para que
 * pueda entrar de inmediato: el correo de verificación es opcional (en esta
 * vista previa a menudo no hay SMTP). Si cualquier paso falla no queda nada a
 * medias. El rol y la empresa nunca vienen del cliente.
 *
 * El cliente inicia sesión con `signIn.email`; este endpoint no emite cookies propias.
 */
export const registerCompany = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => registerInputSchema.parse(d))
  .handler(async ({ data }) => {
    const { ip, ua } = await clientInfo();
    if (!(await dbRateLimit(`register:ip:${ip}`, 5, 3600))) {
      throw new Error("Demasiados intentos. Intenta más tarde.");
    }

    // Hash fuera de la transacción: es CPU pura y no debe alargar el lock.
    const passwordHash = await hashPassword(data.password);
    const userId = nid();
    const companyId = nid();
    let verificationToken = "";

    try {
      await withTransaction(async (tx) => {
        const taken = await tx<{ id: string }>`select id from "user" where lower(email) = ${data.email} limit 1`;
        if (taken[0]) throw new Error(REGISTRATION_CONFLICT_MSG);

        // `user.email` es UNIQUE: dos registros simultáneos con el mismo correo
        // no pueden ganar ambos; el perdedor revierte toda su transacción.
        await tx`
          insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
          values (${userId}, ${data.full_name}, ${data.email}, true, now(), now())`;
        await tx`
          insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
          values (${nid()}, ${userId}, 'credential', ${userId}, ${passwordHash}, now(), now())`;

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

        verificationToken = await createEmailVerification(tx, userId);
        await writeAudit(companyId, userId, "COMPANY_REGISTERED", "COMPANY", companyId, JSON.stringify({ ip, ua }), tx);
      });
    } catch (e) {
      if (e instanceof Error && e.message === REGISTRATION_CONFLICT_MSG) throw e;
      const msg = e instanceof Error ? e.message : "";
      if (/unique|duplicate/i.test(msg)) throw new Error(REGISTRATION_CONFLICT_MSG);
      console.error("[register] fallo al crear la empresa", { error: msg.slice(0, 200) });
      throw new Error("No se pudo completar el registro. Intenta de nuevo.");
    }

    // Fuera de la transacción: un fallo de correo no deshace el registro; el
    // usuario puede pedir un nuevo enlace en /verificar-correo.
    let emailSent = false;
    try {
      emailSent = await sendVerificationEmail(data.email, verificationToken);
    } catch (err) {
      console.error("[register] no se pudo enviar la verificación", err instanceof Error ? err.message : err);
    }
    return {
      ok: true as const,
      emailSent,
      previewVerifyPath:
        !emailSent && process.env.NODE_ENV !== "production" && verificationToken
          ? `/verificar-correo?token=${verificationToken}`
          : undefined,
    };
  });
