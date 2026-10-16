import { haversineKm, type LatLng } from "../geo.ts";

export type EtaInput = {
  current: LatLng;
  destination: LatLng;
  speedKmh: number;
  remainingPath?: LatLng[] | null;
  historicalAvgKmh?: number | null;
  remainingDistanceKm?: number | null;
  now?: Date;
};

export type EtaResult = {
  remainingKm: number;
  speedUsed: number;
  estimatedArrivalAt: string;
  minutes: number;
};

export function computeEta(input: EtaInput): EtaResult {
  const now = input.now ?? new Date();
  let remaining = input.remainingDistanceKm != null && Number.isFinite(input.remainingDistanceKm)
    ? Math.max(0, input.remainingDistanceKm)
    : 0;
  if (!remaining && input.remainingPath && input.remainingPath.length >= 2) {
    remaining = 0;
    for (let i = 1; i < input.remainingPath.length; i++) {
      remaining += haversineKm(input.remainingPath[i - 1]!, input.remainingPath[i]!);
    }
    remaining += haversineKm(input.current, input.remainingPath[0]!);
  } else if (!remaining) {
    remaining = haversineKm(input.current, input.destination);
  }
  const cruise = input.speedKmh >= 15 ? input.speedKmh : input.historicalAvgKmh && input.historicalAvgKmh >= 20 ? input.historicalAvgKmh : 62;
  const hours = remaining / Math.max(cruise, 5);
  const minutes = Math.round(hours * 60);
  const eta = new Date(now.getTime() + minutes * 60_000);
  return {
    remainingKm: Math.round(remaining * 10) / 10,
    speedUsed: cruise,
    estimatedArrivalAt: eta.toISOString(),
    minutes,
  };
}

export function etaDelayMinutes(scheduledArrivalAt: string | null | undefined, etaAt: string | null | undefined): number {
  if (!scheduledArrivalAt || !etaAt) return 0;
  const a = new Date(scheduledArrivalAt).getTime();
  const b = new Date(etaAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 60_000);
}

/** Isolated ETA calculator. Map providers can later replace the distance/speed inputs. */
export const ETAService = {
  estimate(input: EtaInput): EtaResult {
    return computeEta(input);
  },
  delayMinutes: etaDelayMinutes,
};
