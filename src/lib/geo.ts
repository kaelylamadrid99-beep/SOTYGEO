export type LatLng = { lat: number; lng: number };

const R = 6371;

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function pathKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1]!, points[i]!);
  return total;
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function pointInCircle(p: LatLng, fence: LatLng & { radius_m: number }): boolean {
  return haversineKm(p, fence) * 1000 <= fence.radius_m;
}

export function pointInPolygon(p: LatLng, ring: LatLng[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const intersect =
      a.lng > p.lng !== b.lng > p.lng &&
      p.lat < ((b.lat - a.lat) * (p.lng - a.lng)) / (b.lng - a.lng || 1e-12) + a.lat;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function parsePolygon(raw: string | null | undefined): LatLng[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as LatLng[];
    return Array.isArray(v) ? v.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  } catch {
    return [];
  }
}

export function densify(points: LatLng[], stepKm = 18): LatLng[] {
  if (points.length < 2) return points.slice();
  const out: LatLng[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const d = Math.max(haversineKm(a, b), 0.001);
    const n = Math.max(1, Math.round(d / stepKm));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function interpolateRoute(points: LatLng[], t: number): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  if (points.length === 1 || t <= 0) return points[0]!;
  if (t >= 1) return points[points.length - 1]!;
  const seg: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1]!, points[i]!);
    seg.push(total);
  }
  if (total === 0) return points[0]!;
  const target = t * total;
  for (let i = 1; i < seg.length; i++) {
    if (target <= seg[i]!) {
      const span = seg[i]! - seg[i - 1]!;
      const u = span === 0 ? 0 : (target - seg[i - 1]!) / span;
      const a = points[i - 1]!;
      const b = points[i]!;
      return { lat: a.lat + (b.lat - a.lat) * u, lng: a.lng + (b.lng - a.lng) * u };
    }
  }
  return points[points.length - 1]!;
}

export function parseRoute(raw: string | null | undefined): LatLng[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as LatLng[];
    return Array.isArray(v) ? v.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
  } catch {
    return [];
  }
}

export function motionFrom(speed: number, lastGpsAt: string | null, now = Date.now()): "MOVING" | "STOPPED" | "OFFLINE" {
  if (!lastGpsAt) return "OFFLINE";
  const age = now - new Date(lastGpsAt).getTime();
  if (!Number.isFinite(age) || age > 8 * 60_000) return "OFFLINE";
  return speed >= 5 ? "MOVING" : "STOPPED";
}
