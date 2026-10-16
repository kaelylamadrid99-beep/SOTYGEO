/**
 * Observabilidad ligera (Fase 8) — sin dependencias externas.
 */
import { randomBytes } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = {
  requestId?: string;
  companyId?: string | null;
  userId?: string | null;
  jobName?: string;
  event?: string;
  ms?: number;
  [key: string]: unknown;
};

export function newRequestId(): string {
  return randomBytes(8).toString("hex");
}

export function resolveRequestId(headers: Headers | null | undefined): string {
  if (!headers) return newRequestId();
  const existing =
    headers.get("x-request-id")?.trim() ||
    headers.get("x-correlation-id")?.trim() ||
    headers.get("cf-ray")?.trim();
  return existing && existing.length <= 128 ? existing : newRequestId();
}

function serialize(fields: LogFields): string {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (typeof v === "string" && v.length > 500) safe[k] = `${v.slice(0, 500)}…`;
    else safe[k] = v;
  }
  try {
    return JSON.stringify(safe);
  } catch {
    return JSON.stringify({ error: "unserializable_fields" });
  }
}

export function logStructured(level: LogLevel, message: string, fields: LogFields = {}): void {
  const line = serialize({ ts: new Date().toISOString(), level, msg: message, ...fields });
  try {
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } catch { /* ignore */ }
}

export function logJobFailure(jobName: string, err: unknown, fields: LogFields = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  logStructured("error", "job_failed", { jobName, event: "JOB_FAILED", error: message.slice(0, 400), ...fields });
}

export function logJobComplete(jobName: string, ms: number, fields: LogFields = {}): void {
  logStructured("info", "job_complete", { jobName, event: "JOB_COMPLETE", ms, ...fields });
}
