import { z } from "zod";

export const gpsIngestSchema = z.object({
  imei: z.string().trim().min(8).max(32),
  token: z.string().trim().min(8).max(128),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  speed: z.number().gte(0).lte(400).optional(),
  heading: z.number().gte(0).lte(360).optional(),
  altitude: z.number().gte(-500).lte(9000).optional(),
  accuracy: z.number().gt(0).lte(5000).optional(),
  recorded_at: z.string().optional(),
  event_id: z.string().trim().min(1).max(128).optional(),
  sequence: z.number().int().nonnegative().optional(),
  odometer_km: z.number().gte(0).optional(),
});

export type GpsIngestInput = z.infer<typeof gpsIngestSchema>;

const FUTURE_SKEW_MS = 5 * 60_000;
const STALE_MS = 7 * 24 * 3600_000;

export function assertFixTime(recordedAt: string, now = Date.now()): Date {
  const t = new Date(recordedAt);
  if (Number.isNaN(t.getTime())) throw new Error("Timestamp inválido");
  if (t.getTime() - now > FUTURE_SKEW_MS) throw new Error("Timestamp futuro no permitido");
  if (now - t.getTime() > STALE_MS) throw new Error("Timestamp demasiado antiguo");
  return t;
}

export function isCorruptFix(lat: number, lng: number): boolean {
  if (lat === 0 && lng === 0) return true;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  return false;
}

type Bucket = { times: number[] };
const buckets = new Map<string, Bucket>();

/**
 * Process-local rate limiter (in-memory Map).
 *
 * This is an immediate in-process guard, NOT a distributed limiter.
 * Multiple instances (A, B, C) each keep their own counters, so the
 * effective limit is per-instance. Adequate for single-process preview
 * and as a first line of defense. Shared rate-limit state (Redis / KV /
 * DB) would be required for multi-instance production — do not introduce
 * that infrastructure here unless the project already has it.
 */
export function rateLimitAllow(key: string, now = Date.now(), perMinute = 60): boolean {
  let b = buckets.get(key);
  if (!b) {
    b = { times: [] };
    buckets.set(key, b);
  }
  b.times = b.times.filter((t) => now - t < 60_000);
  if (b.times.length >= perMinute) return false;
  const lastSecond = b.times.filter((t) => now - t < 1000).length;
  if (lastSecond >= 5) return false;
  b.times.push(now);
  return true;
}
