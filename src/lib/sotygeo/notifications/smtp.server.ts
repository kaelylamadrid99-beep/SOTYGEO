import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

/**
 * Cliente SMTP mínimo y sin dependencias (solo `node:net` / `node:tls`).
 * Sirve para Gmail (contraseña de aplicación), Outlook, Zoho, Brevo, Mailgun SMTP, etc.
 *
 *   - Puerto 465  -> TLS implícito (`secure: true`).
 *   - Puerto 587  -> STARTTLS obligatorio antes de autenticar.
 *   - Nunca envía usuario/contraseña en texto plano: si el servidor no ofrece
 *     STARTTLS (y no es loopback) la entrega falla.
 *
 * Este archivo NO importa nada de la app (`@/…`) para poder probarse con `node --test`.
 */

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  /** Tiempo máximo de inactividad del socket. */
  timeoutMs?: number;
};

export type SmtpMessage = {
  /** Cabecera From completa, p. ej. `SOTYGEO <no-reply@dominio.com>`. */
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

type Reply = { code: number; lines: string[] };

const CRLF = "\r\n";

/** Quita CR/LF para impedir inyección de cabeceras. */
function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** Extrae la dirección de `Nombre <a@b.com>` o `a@b.com`. */
export function addressOf(header: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(header);
  const addr = (m ? m[1] : header).trim();
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(addr)) throw new Error("dirección de correo inválida");
  return addr;
}

function encodeWord(value: string): string {
  const v = clean(value);
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function b64Lines(content: string): string {
  return (Buffer.from(content, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join(CRLF);
}

/** Construye el mensaje MIME (multipart/alternative: texto + HTML). */
export function buildMime(msg: SmtpMessage, now: Date = new Date()): string {
  const from = clean(msg.from);
  const domain = addressOf(from).split("@")[1] ?? "localhost";
  const boundary = `=_sotygeo_${randomUUID().replace(/-/g, "")}`;
  const headers = [
    `From: ${encodeFromHeader(from)}`,
    `To: ${addressOf(clean(msg.to))}`,
    `Subject: ${encodeWord(msg.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(msg.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(msg.html),
    `--${boundary}--`,
    "",
  ];
  return [...headers, "", ...body].join(CRLF);
}

function encodeFromHeader(from: string): string {
  const m = /^(.*?)\s*<([^<>]+)>$/.exec(from);
  if (!m) return from;
  const name = (m[1] ?? "").replace(/^"|"$/g, "");
  return name ? `${encodeWord(name)} <${m[2]}>` : `<${m[2]}>`;
}

/** Dot-stuffing (RFC 5321 §4.5.2) y terminador de DATA. */
function dataPayload(mime: string): string {
  return mime.replace(/^\./gm, "..") + CRLF + "." + CRLF;
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

class Session {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = "";
  private queue: Reply[] = [];
  private waiter: { resolve: (r: Reply) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;
  private pending: string[] = [];
  private timeoutMs: number;

  constructor(socket: net.Socket | tls.TLSSocket, timeoutMs: number) {
    this.timeoutMs = timeoutMs;
    this.socket = socket;
    this.attach(socket);
  }

  private attach(socket: net.Socket | tls.TLSSocket) {
    socket.setEncoding("utf8");
    socket.setTimeout(this.timeoutMs, () => this.fail(new Error("tiempo de espera agotado con el servidor SMTP")));
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.parse();
    });
    socket.on("error", (e) => this.fail(e));
    socket.on("close", () => this.fail(new Error("conexión SMTP cerrada")));
  }

  private fail(err: Error) {
    if (this.failure) return;
    this.failure = err;
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w.reject(err);
    }
    this.socket.destroy();
  }

  private parse() {
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      this.pending.push(line);
      // Última línea de una respuesta: "250 texto" (la continuación es "250-texto").
      if (/^\d{3}( |$)/.test(line)) {
        const lines = this.pending;
        this.pending = [];
        const reply: Reply = { code: Number(line.slice(0, 3)), lines };
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = null;
          w.resolve(reply);
        } else {
          this.queue.push(reply);
        }
      }
    }
  }

  read(): Promise<Reply> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  async expect(codes: number[], what: string): Promise<Reply> {
    const r = await this.read();
    if (!codes.includes(r.code)) {
      throw new Error(`SMTP ${what}: ${r.lines[r.lines.length - 1] ?? r.code}`);
    }
    return r;
  }

  write(data: string) {
    if (this.failure) throw this.failure;
    this.socket.write(data);
  }

  async command(line: string, codes: number[], what: string): Promise<Reply> {
    this.write(line + CRLF);
    return this.expect(codes, what);
  }

  async upgradeToTls(host: string): Promise<void> {
    const plain = this.socket;
    plain.removeAllListeners("data");
    plain.removeAllListeners("close");
    plain.removeAllListeners("error");
    plain.setTimeout(0);
    const secure = tls.connect({ socket: plain as net.Socket, servername: net.isIP(host) ? undefined : host });
    await new Promise<void>((resolve, reject) => {
      secure.once("secureConnect", () => resolve());
      secure.once("error", reject);
    });
    this.socket = secure;
    this.buffer = "";
    this.pending = [];
    this.attach(secure);
  }

  get encrypted(): boolean {
    return this.socket instanceof tls.TLSSocket;
  }

  end() {
    this.socket.destroy();
  }
}

function connect(cfg: SmtpConfig, timeoutMs: number): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const servername = net.isIP(cfg.host) ? undefined : cfg.host;
    const socket = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, servername })
      : net.connect({ host: cfg.host, port: cfg.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("no se pudo conectar al servidor SMTP (tiempo agotado)"));
    }, timeoutMs);
    socket.once(cfg.secure ? "secureConnect" : "connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** Envía un mensaje. Lanza Error con un mensaje sin secretos si algo falla. */
export async function sendViaSmtp(cfg: SmtpConfig, msg: SmtpMessage): Promise<{ messageId?: string }> {
  const timeoutMs = cfg.timeoutMs ?? 15_000;
  const envelopeFrom = addressOf(clean(msg.from));
  const envelopeTo = addressOf(clean(msg.to));
  const mime = buildMime(msg);
  const messageId = /^Message-ID: <(.+)>$/m.exec(mime)?.[1];

  const socket = await connect(cfg, timeoutMs);
  const s = new Session(socket, timeoutMs);
  try {
    await s.expect([220], "saludo");
    let ehlo = await s.command(`EHLO sotygeo.local`, [250], "EHLO");

    if (!cfg.secure) {
      const offersStartTls = ehlo.lines.some((l) => /STARTTLS/i.test(l));
      if (offersStartTls) {
        await s.command("STARTTLS", [220], "STARTTLS");
        await s.upgradeToTls(cfg.host);
        ehlo = await s.command(`EHLO sotygeo.local`, [250], "EHLO");
      } else if (cfg.user && !isLoopback(cfg.host)) {
        throw new Error("el servidor SMTP no ofrece STARTTLS; no se enviarán credenciales sin cifrar");
      }
    }

    if (cfg.user && cfg.pass) {
      if (!s.encrypted && !isLoopback(cfg.host)) throw new Error("conexión SMTP sin cifrar");
      const mechs = ehlo.lines.join(" ").toUpperCase();
      if (mechs.includes("AUTH") && mechs.includes("PLAIN")) {
        const token = Buffer.from(`\u0000${cfg.user}\u0000${cfg.pass}`, "utf8").toString("base64");
        await s.command(`AUTH PLAIN ${token}`, [235], "autenticación");
      } else {
        await s.command("AUTH LOGIN", [334], "autenticación");
        await s.command(Buffer.from(cfg.user, "utf8").toString("base64"), [334], "autenticación");
        await s.command(Buffer.from(cfg.pass, "utf8").toString("base64"), [235], "autenticación");
      }
    }

    await s.command(`MAIL FROM:<${envelopeFrom}>`, [250], "remitente");
    await s.command(`RCPT TO:<${envelopeTo}>`, [250, 251], "destinatario");
    await s.command("DATA", [354], "DATA");
    s.write(dataPayload(mime));
    await s.expect([250], "entrega");
    try {
      s.write("QUIT" + CRLF);
    } catch {
      /* ya enviado */
    }
    return { messageId };
  } finally {
    s.end();
  }
}
