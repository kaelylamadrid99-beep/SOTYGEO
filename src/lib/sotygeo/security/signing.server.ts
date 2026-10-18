/**
 * Tokens firmados de vida corta (HMAC-SHA256). Sin alias `@/` ni dependencias
 * del framework: testeable con `node --test`. Server-only (usa node:crypto).
 *
 * Formato: `${exp}.${hmac-hex}`; el HMAC cubre scope + partes + exp, de modo que un
 * token emitido para una subida no sirve para una descarga ni para otro usuario.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 32;

const g = globalThis as typeof globalThis & { __sotygeoDevSigningSecret__?: string };

/** Secreto de firma: BETTER_AUTH_SECRET. En producción es obligatorio (sin fallback). */
export function signingSecret(): string {
  const s = (process.env.APP_SIGNING_SECRET ?? process.env.BETTER_AUTH_SECRET)?.trim();
  if (s && s.length >= MIN_SECRET_LENGTH) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`BETTER_AUTH_SECRET (mín. ${MIN_SECRET_LENGTH} caracteres) es obligatorio en producción`);
  }
  g.__sotygeoDevSigningSecret__ ??= randomBytes(32).toString("hex");
  return g.__sotygeoDevSigningSecret__;
}

function mac(secret: string, scope: string, parts: readonly string[], exp: number): string {
  // JSON evita ambigüedades de concatenación entre partes ("a|b" + "c" vs "a" + "b|c").
  return createHmac("sha256", secret).update(JSON.stringify([scope, ...parts, exp])).digest("hex");
}

export function signToken(secret: string, scope: string, parts: readonly string[], ttlSec: number, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSec;
  return `${exp}.${mac(secret, scope, parts, exp)}`;
}

export function verifyToken(secret: string, scope: string, parts: readonly string[], token: string, now = Date.now()): boolean {
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token ?? "");
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isSafeInteger(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(mac(secret, scope, parts, exp), "hex");
  const given = Buffer.from(m[2]!, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const UPLOAD_TTL_SEC = 300;
export const FILE_URL_TTL_SEC = 60;

export const signUploadToken = (a: { key: string; userId: string; contentType: string }, now = Date.now()) =>
  signToken(signingSecret(), "evidence-upload", [a.key, a.userId, a.contentType], UPLOAD_TTL_SEC, now);
export const verifyUploadToken = (token: string, a: { key: string; userId: string; contentType: string }, now = Date.now()) =>
  verifyToken(signingSecret(), "evidence-upload", [a.key, a.userId, a.contentType], token, now);

export const signFileToken = (a: { key: string; userId: string }, now = Date.now()) =>
  signToken(signingSecret(), "evidence-file", [a.key, a.userId], FILE_URL_TTL_SEC, now);
export const verifyFileToken = (token: string, a: { key: string; userId: string }, now = Date.now()) =>
  verifyToken(signingSecret(), "evidence-file", [a.key, a.userId], token, now);
