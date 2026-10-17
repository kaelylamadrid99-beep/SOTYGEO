import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { clientIpFromHeaders } from "../security/client-ip";
import { dbRateLimit } from "../security/rate-limit";

const MIN_RESPONSE_MS = 400;

/** Reenvío del correo de confirmación (Lovable Cloud). Siempre responde igual. */
export const resendEmailVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().max(254).email() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { getRequest } = await import("@tanstack/react-start/server");
    const ip = clientIpFromHeaders(getRequest().headers);
    if (await dbRateLimit(`verify-resend:ip:${ip}`, 5, 3600)) {
      try {
        const { publicAuthClient, requestOrigin } = await import("./cloud-auth.server");
        const origin = await requestOrigin();
        const { error } = await publicAuthClient().auth.resend({
          type: "signup",
          email: data.email.trim().toLowerCase(),
          options: { emailRedirectTo: `${origin}/login` },
        });
        if (error) console.error("[verify-email] reenvío", error.message);
      } catch (err) {
        console.error("[verify-email] reenvío falló", err instanceof Error ? err.message : err);
      }
    }
    const wait = MIN_RESPONSE_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return { ok: true as const };
  });
