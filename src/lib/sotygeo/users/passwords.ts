import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { clientIpFromHeaders } from "../security/client-ip";
import { dbRateLimit } from "../security/rate-limit";

const MIN_RESPONSE_MS = 400;

/** Always succeeds (anti-enumeration). The reset email is sent by Lovable Cloud. */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().max(254).email() }).parse(d))
  .handler(async ({ data }) => {
    const started = Date.now();
    const { getRequest } = await import("@tanstack/react-start/server");
    const ip = clientIpFromHeaders(getRequest().headers);
    const email = data.email.trim().toLowerCase();
    if (await dbRateLimit(`pwreset:${ip}`, 8)) {
      try {
        const { publicAuthClient, requestOrigin } = await import("./cloud-auth.server");
        const origin = await requestOrigin();
        const { error } = await publicAuthClient().auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/restablecer`,
        });
        if (error) console.error("[pwreset]", error.message);
      } catch (err) {
        console.error("[pwreset] fallo", err instanceof Error ? err.message : err);
      }
    }
    const wait = MIN_RESPONSE_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return { ok: true };
  });
