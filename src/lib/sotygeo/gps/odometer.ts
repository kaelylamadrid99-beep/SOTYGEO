import { haversineKm, type LatLng } from "../../geo.ts";

export type OdometerSample = {
  from: LatLng | null;
  to: LatLng;
  fromAt: string | null;
  toAt: string;
  reportedSpeedKmh?: number;
  deviceOdometerKm?: number | null;
  previousOdometerKm: number;
};

export type OdometerResult = {
  deltaKm: number;
  nextOdometerKm: number;
  rejected: boolean;
  reason: string | null;
};

const JITTER_KM = 0.02;
const MAX_IMPLIED_KMH = 180;
const MAX_STEP_KM = 80;
const MIN_DT_MS = 800;

export function computeOdometerDelta(sample: OdometerSample): OdometerResult {
  const prev = sample.previousOdometerKm || 0;
  if (sample.deviceOdometerKm != null && Number.isFinite(sample.deviceOdometerKm)) {
    if (sample.deviceOdometerKm + 0.05 < prev) {
      return { deltaKm: 0, nextOdometerKm: prev, rejected: true, reason: "odometer_rollback" };
    }
    const delta = Math.max(0, sample.deviceOdometerKm - prev);
    if (delta > MAX_STEP_KM) {
      return { deltaKm: 0, nextOdometerKm: prev, rejected: true, reason: "odometer_jump" };
    }
    return { deltaKm: delta, nextOdometerKm: sample.deviceOdometerKm, rejected: false, reason: null };
  }

  if (!sample.from) {
    return { deltaKm: 0, nextOdometerKm: prev, rejected: false, reason: "no_previous" };
  }

  const toMs = new Date(sample.toAt).getTime();
  const fromMs = sample.fromAt ? new Date(sample.fromAt).getTime() : NaN;
  if (!Number.isFinite(toMs)) {
    return { deltaKm: 0, nextOdometerKm: prev, rejected: true, reason: "bad_timestamp" };
  }
  if (Number.isFinite(fromMs) && toMs + 250 < fromMs) {
    return { deltaKm: 0, nextOdometerKm: prev, rejected: true, reason: "time_rollback" };
  }
  const dtMs = Number.isFinite(fromMs) ? toMs - fromMs : 0;
  if (dtMs > 0 && dtMs < MIN_DT_MS) {
    return { deltaKm: 0, nextOdometerKm: prev, rejected: false, reason: "duplicate_time" };
  }

  const distance = haversineKm(sample.from, sample.to);
  if (!Number.isFinite(distance) || distance < JITTER_KM) {
    return { deltaKm: 0, nextOdometerKm: prev, rejected: false, reason: "jitter" };
  }
  if (distance > MAX_STEP_KM) {
    return { deltaKm: 0, nextOdometerKm: prev, rejected: true, reason: "impossible_jump" };
  }
  if (dtMs > 0) {
    const implied = distance / (dtMs / 3_600_000);
    if (implied > MAX_IMPLIED_KMH) {
      return { deltaKm: 0, nextOdometerKm: prev, rejected: true, reason: "impossible_speed" };
    }
  }
  return { deltaKm: distance, nextOdometerKm: prev + distance, rejected: false, reason: null };
}

export function eventKey(input: {
  deviceId: string;
  eventId?: string | null;
  sequence?: number | null;
  recordedAt: string;
  latitude: number;
  longitude: number;
}): string {
  if (input.eventId) return `evt:${input.eventId}`;
  if (input.sequence != null) return `seq:${input.sequence}`;
  const lat = input.latitude.toFixed(5);
  const lng = input.longitude.toFixed(5);
  return `fix:${input.recordedAt}|${lat}|${lng}`;
}
