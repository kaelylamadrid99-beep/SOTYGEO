import { getRequest } from "@tanstack/react-start/server";
import { env } from "@/lib/env.server";
import type { EmailMessage } from "./templates";

/**
 * Real transactional email delivery. This is the ONLY surface the rest of
 * the app should call (`sendEmail`) — swapping or adding a provider means
 * editing this file only, mirroring the GPS provider adapter pattern in
 * `../gps/provider.ts`.
 *
 * Configuration (server env — never expose these to the client, never write
 * them into a committed `.env` file; set them where the app is deployed):
 *
 *   RESEND_API_KEY   Linked Resend connector key — enables gateway delivery.
 *   LOVABLE_API_KEY  Server-only gateway authorization.
 *   EMAIL_FROM       e.g. "SOTYGEO <no-reply@tu-dominio.com>". Must be a
 *                    domain verified with the provider, or delivery is
 *                    rejected.
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE
 *                    Alternativa sin dominio propio (p. ej. Gmail con contraseña
 *                    de aplicación: smtp.gmail.com, 465, tu@gmail.com). Puerto 465 =
 *                    TLS implícito; 587 = STARTTLS. EMAIL_FROM por defecto = SMTP_USER.
 *   EMAIL_PROVIDER   Optional override ("resend" | "smtp" | "console"). Defaults to
 *                    "resend" when RESEND_API_KEY is set, else "smtp" when SMTP_HOST
 *                    is set, else "console".
 *   BETTER_AUTH_URL / APP_URL
 *                    Public origin used to build authentication links. In
 *                    production one of these is mandatory and must be HTTPS;
 *                    request Host headers are never used for auth links there.
 *                    Local/preview may derive the origin from the request only
 *                    after checking it against the non-production allowlist.
 *
 * Without RESEND_API_KEY the module never throws: it logs the message to the
 * server console instead so local/dev/preview keeps working without secrets.
 * `emailProviderConfigured` lets callers/ops surface that state if useful.
 */

type EmailResult = { ok: boolean; skipped?: boolean; error?: string; providerMessageId?: string };

function resolveProvider(): "resend" | "smtp" | "console" {
  const explicit = env("EMAIL_PROVIDER");
  if (explicit === "resend" || explicit === "smtp" || explicit === "console") return explicit;
  if (env("RESEND_API_KEY")) return "resend";
  if (env("SMTP_HOST")) return "smtp";
  return "console";
}

function resolveFrom(provider: string): string {
  const explicit = env("EMAIL_FROM");
  if (explicit) return explicit;
  if (provider === "smtp" && env("SMTP_USER")) return `SOTYGEO <${env("SMTP_USER")}>`;
  return "SOTYGEO <onboarding@resend.dev>";
}

/** True when a real provider is configured. Safe to surface in ops/health UI. */
export const emailProviderConfigured = Boolean(env("RESEND_API_KEY") || env("SMTP_HOST"));

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const provider = resolveProvider();
  // En producción un correo "omitido" NO es un éxito: invitaciones, verificación y
  // recuperación parecerían enviadas sin que nadie las reciba.
  if (process.env.NODE_ENV === "production") {
    const problem =
      provider === "console" ? "proveedor de correo no configurado (RESEND_API_KEY o SMTP_HOST)"
      : provider === "resend" && !env("RESEND_API_KEY") ? "RESEND_API_KEY no configurado"
       : provider === "resend" && !env("LOVABLE_API_KEY") ? "autorización de correo no configurada"
      : provider === "smtp" && !env("SMTP_HOST") ? "SMTP_HOST no configurado"
      : null;
    if (problem) {
      console.error("[email] configuración inválida en producción", { error: problem, to: redact(message.to) });
      return { ok: false, error: problem };
    }
  }
  try {
    if (provider === "resend") return await deliverViaResend(message);
    if (provider === "smtp") return await deliverViaSmtp(message);
    return deliverToConsole(message);
  } catch (err) {
    console.error("[email] fallo de entrega", {
      to: redact(message.to),
      error: err instanceof Error ? err.message : err,
    });
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }
}

async function deliverViaResend(message: EmailMessage): Promise<EmailResult> {
  const apiKey = env("RESEND_API_KEY");
  const gatewayKey = env("LOVABLE_API_KEY");
  if (!apiKey || !gatewayKey) return { ok: false, error: "Conexión de Resend no configurada." };
  // The default Resend sender is owner-only for tests; other recipients require EMAIL_FROM on a verified domain.
  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gatewayKey}`,
      "X-Connection-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resolveFrom("resend"),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Avoid logging a provider response if it unexpectedly echoes credentials.
    const safeBody = body.split(apiKey).join("[redacted]").split(gatewayKey).join("[redacted]");
    console.error("[email] Resend respondió error", { status: res.status, body: safeBody });
    return { ok: false, error: `Resend ${res.status}: ${safeBody}` };
  }
  const out = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, providerMessageId: out.id };
}

async function deliverViaSmtp(message: EmailMessage): Promise<EmailResult> {
  const host = env("SMTP_HOST");
  if (!host) return deliverToConsole(message, "SMTP_HOST no configurado");
  const secureFlag = env("SMTP_SECURE")?.toLowerCase();
  const port = Number(env("SMTP_PORT") ?? (secureFlag === "false" ? 587 : 465));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("SMTP_PORT inválido");
  const secure = secureFlag ? secureFlag === "true" : port === 465;
  try {
    const { sendViaSmtp } = await import("./smtp.server");
    const out = await sendViaSmtp(
      { host, port, secure, user: env("SMTP_USER"), pass: env("SMTP_PASS") },
      { from: resolveFrom("smtp"), to: message.to, subject: message.subject, html: message.html, text: message.text },
    );
    return { ok: true, providerMessageId: out.messageId };
  } catch (err) {
    // El mensaje de smtp.server.ts nunca incluye la contraseña.
    const reason = err instanceof Error ? err.message : "error desconocido";
    console.error("[email] SMTP falló", { host, port, to: redact(message.to), error: reason.slice(0, 200) });
    return { ok: false, error: reason };
  }
}

function deliverToConsole(message: EmailMessage, reason?: string): EmailResult {
  // Never log the body: password-reset mail includes the raw token in `text`.
  console.warn(
    `[email] sin proveedor real configurado${reason ? ` (${reason})` : ""} — mensaje registrado, no enviado`,
    { to: redact(message.to), subject: message.subject },
  );
  return { ok: true, skipped: true };
}

function redact(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${(user ?? "").slice(0, 2)}***@${domain}`;
}

/**
 * Public origin to embed in email links (password reset, etc). Prefers an
 * explicit env override; otherwise derives it from the current request's
 * forwarded host, same logic the auth broker uses so preview/deployed/local
 * all resolve correctly without configuration.
 */
export function resolveAppOrigin(): string {
  const explicit = env("APP_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const req = getRequest();
  const origin = req.headers.get("origin");
  if (origin) return origin;
  return new URL(req.url).origin;
}

export { passwordResetEmail, emailVerificationEmail, notificationEmail, invitationEmail, accountActivatedEmail } from "./templates";
