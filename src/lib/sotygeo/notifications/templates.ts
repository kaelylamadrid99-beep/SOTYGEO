/** Isomorphic email copy. Keep this file free of server APIs so it can be tested and imported from client-reachable modules. */

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const AMP = "\u0026";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, `${AMP}amp;`)
    .replace(/</g, `${AMP}lt;`)
    .replace(/>/g, `${AMP}gt;`)
    .replace(/"/g, `${AMP}quot;`)
    .replace(/'/g, `${AMP}#39;`);
}

export function emailVerificationEmail(link: string): Pick<EmailMessage, "subject" | "html" | "text"> {
  const safeLink = escapeHtml(link);
  const subject = "Confirma tu correo — SOTYGEO";
  const text = [
    "Recibimos un registro de empresa en SOTYGEO con este correo.",
    "",
    `Confirma tu correo para activar la cuenta (válido por 24 horas): ${link}`,
    "",
    "Si tú no te registraste, ignora este correo: la cuenta no se activará.",
  ].join("\n");
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a212c;">',
    '  <p style="letter-spacing:0.28em;font-size:12px;color:#6f7a89;text-transform:uppercase;">SOTYGEO</p>',
    '  <h1 style="font-size:20px;margin:8px 0 16px;">Confirma tu correo</h1>',
    '  <p style="font-size:14px;line-height:1.5;">Para activar tu cuenta confirma que este correo es tuyo. El enlace es válido por 24 horas.</p>',
    '  <p style="margin:24px 0;">',
    `    <a href="${safeLink}" style="background:#1a212c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">Confirmar correo</a>`,
    "  </p>",
    '  <p style="font-size:12px;color:#6f7a89;line-height:1.5;">Si tú no te registraste, ignora este correo: la cuenta no se activará.</p>',
    "</div>",
  ].join("\n");
  return { subject, html, text };
}

export function passwordResetEmail(link: string): Pick<EmailMessage, "subject" | "html" | "text"> {
  const safeLink = escapeHtml(link);
  const subject = "Restablecer tu contraseña — SOTYGEO";
  const text = [
    "Recibimos una solicitud para restablecer tu contraseña en SOTYGEO.",
    "",
    `Abre este enlace para elegir una nueva contraseña (válido por 1 hora): ${link}`,
    "",
    "Si tú no solicitaste esto, puedes ignorar este correo — tu contraseña no cambiará.",
  ].join("\n");
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a212c;">',
    '  <p style="letter-spacing:0.28em;font-size:12px;color:#6f7a89;text-transform:uppercase;">SOTYGEO</p>',
    '  <h1 style="font-size:20px;margin:8px 0 16px;">Restablecer tu contraseña</h1>',
    '  <p style="font-size:14px;line-height:1.5;">Recibimos una solicitud para restablecer tu contraseña. Este enlace es válido por 1 hora.</p>',
    '  <p style="margin:24px 0;">',
    `    <a href="${safeLink}" style="background:#1a212c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">Elegir nueva contraseña</a>`,
    "  </p>",
    '  <p style="font-size:12px;color:#6f7a89;line-height:1.5;">Si tú no solicitaste esto, ignora este correo — tu contraseña no cambiará.</p>',
    "</div>",
  ].join("\n");
  return { subject, html, text };
}

export function notificationEmail(title: string, body: string): Pick<EmailMessage, "subject" | "html" | "text"> {
  const subject = `SOTYGEO · ${title}`;
  const text = `${title}\n\n${body}\n\n— SOTYGEO`;
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a212c;">',
    '  <p style="letter-spacing:0.28em;font-size:12px;color:#6f7a89;text-transform:uppercase;">SOTYGEO</p>',
    `  <h1 style="font-size:20px;margin:8px 0 16px;">${escapeHtml(title)}</h1>`,
    `  <p style="font-size:14px;line-height:1.5;">${escapeHtml(body)}</p>`,
    "</div>",
  ].join("\n");
  return { subject, html, text };
}

function shell(title: string, bodyHtml: string, cta?: { label: string; href: string }, foot = ""): string {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#1a212c;">',
    '  <p style="letter-spacing:0.28em;font-size:12px;color:#6f7a89;text-transform:uppercase;">SOTYGEO</p>',
    `  <h1 style="font-size:20px;margin:8px 0 16px;">${escapeHtml(title)}</h1>`,
    bodyHtml,
    cta
      ? `  <p style="margin:24px 0;"><a href="${escapeHtml(cta.href)}" style="background:#1a212c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;">${escapeHtml(cta.label)}</a></p>`
      : "",
    foot ? `  <p style="font-size:12px;color:#6f7a89;line-height:1.5;">${escapeHtml(foot)}</p>` : "",
    "</div>",
  ].join("\n");
}

export function invitationEmail(o: { name: string; company: string; role: string; link: string; expiresAt: string }) {
  const when = new Date(o.expiresAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
  const subject = "Activa tu cuenta — SOTYGEO";
  const text = [
    `Hola, ${o.name}:`, "", "Se ha creado una cuenta para ti en SOTYGEO.",
    `Empresa: ${o.company}`, `Rol: ${o.role}`, "",
    `Para activar tu cuenta abre: ${o.link}`, `Este enlace expira el ${when}.`, "",
    "Si no reconoces esta invitación, ignora este correo.",
  ].join("\n");
  const html = shell(
    `Hola, ${o.name}`,
    `  <p style="font-size:14px;line-height:1.5;">Se ha creado una cuenta para ti en SOTYGEO.</p><p style="font-size:14px;line-height:1.6;">Empresa: <b>${escapeHtml(o.company)}</b><br/>Rol: <b>${escapeHtml(o.role)}</b></p>`,
    { label: "ACTIVAR MI CUENTA", href: o.link },
    `Este enlace expira el ${when}. Si no reconoces esta invitación, ignora este correo.`,
  );
  return { subject, html, text };
}

export function accountActivatedEmail(o: { name: string; company: string; role: string; link: string }) {
  const subject = "Tu cuenta fue activada — SOTYGEO";
  const text = [`Hola, ${o.name}:`, "", "Tu cuenta ha sido activada correctamente.", `Empresa: ${o.company}`, `Rol: ${o.role}`, "", `Iniciar sesión: ${o.link}`].join("\n");
  const html = shell(
    "Tu cuenta ha sido activada correctamente",
    `  <p style="font-size:14px;line-height:1.6;">Empresa: <b>${escapeHtml(o.company)}</b><br/>Rol: <b>${escapeHtml(o.role)}</b></p><p style="font-size:14px;">Ya puedes ingresar a SOTYGEO.</p>`,
    { label: "INICIAR SESIÓN", href: o.link },
  );
  return { subject, html, text };
}
