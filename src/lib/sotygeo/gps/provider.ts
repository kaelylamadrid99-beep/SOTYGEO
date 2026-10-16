import { bearingDeg, interpolateRoute, parseRoute, type LatLng } from "../../geo.ts";
import type { GpsFix, GpsProviderKind } from "../types.ts";

export interface GPSProviderInterface {
  readonly kind: GpsProviderKind;
}

export type SimVehicle = {
  id: string;
  gps_device_id: string | null;
  sim_route: string;
  sim_progress: number;
  sim_mode: string;
  speed_limit_kmh: number;
};

/**
 * Development/testing only. Production ingest uses External or Smartphone
 * providers; the rest of the system only sees GpsFix through ingestFix().
 */
export class SimulatorGPSProvider implements GPSProviderInterface {
  readonly kind = "SIMULATOR" as const;

  next(vehicle: SimVehicle, now: Date): { fix: GpsFix; progress: number } | null {
    if (vehicle.sim_mode === "OFFLINE") return null;
    const pts = parseRoute(vehicle.sim_route);
    if (pts.length < 2) return null;
    let progress = Number(vehicle.sim_progress) || 0;
    const moving = vehicle.sim_mode === "MOVING";
    if (moving) {
      progress += 0.018;
      if (progress >= 1) progress -= 1;
    }
    const pos = interpolateRoute(pts, progress);
    const nxt = interpolateRoute(pts, Math.min(0.999, progress + 0.012));
    const heading = bearingDeg(pos, nxt);
    const wave = Math.sin(now.getTime() / 7000 + progress * 9);
    const speeding = moving && wave > 0.72;
    const speed = moving ? (speeding ? vehicle.speed_limit_kmh + 12 + wave * 8 : 58 + wave * 16) : 0;
    return {
      progress,
      fix: {
        vehicleId: vehicle.id,
        deviceId: vehicle.gps_device_id,
        latitude: pos.lat,
        longitude: pos.lng,
        speed: Math.max(0, speed),
        heading,
        altitude: 540,
        accuracy: 8,
        recordedAt: now.toISOString(),
      },
    };
  }
}

export class ExternalGPSProvider implements GPSProviderInterface {
  readonly kind = "EXTERNAL" as const;

  parse(body: {
    imei?: string;
    latitude?: number;
    longitude?: number;
    speed?: number;
    heading?: number;
    altitude?: number;
    accuracy?: number;
    recorded_at?: string;
  }): Omit<GpsFix, "vehicleId" | "deviceId"> {
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Coordenadas inválidas");
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Coordenadas inválidas");
    return {
      latitude: lat,
      longitude: lng,
      speed: Number(body.speed) || 0,
      heading: Number(body.heading) || 0,
      altitude: Number(body.altitude) || 0,
      accuracy: Number(body.accuracy) || 15,
      recordedAt: body.recorded_at || new Date().toISOString(),
    };
  }
}

export class SmartphoneGPSProvider implements GPSProviderInterface {
  readonly kind = "SMARTPHONE" as const;

  fromBrowser(lat: number, lng: number, speed = 0, heading = 0, accuracy = 20): Omit<GpsFix, "vehicleId" | "deviceId"> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Coordenadas inválidas");
    return {
      latitude: lat,
      longitude: lng,
      speed,
      heading,
      altitude: 0,
      accuracy,
      recordedAt: new Date().toISOString(),
    };
  }
}

export const simulatorProvider = new SimulatorGPSProvider();
export const externalProvider = new ExternalGPSProvider();
export const smartphoneProvider = new SmartphoneGPSProvider();

export function waypointRoute(...pts: LatLng[]): string {
  return JSON.stringify(pts);
}
