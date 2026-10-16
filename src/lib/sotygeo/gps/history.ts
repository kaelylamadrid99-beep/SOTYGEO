export type TimedPoint = {
  recorded_at: string;
  latitude?: number;
  longitude?: number;
};

/**
 * Downsample a GPS trail for presentation. Never loads the full history into
 * the UI: the caller is expected to already paginate/limit at the SQL layer.
 * Always keeps first and last points so the path endpoints stay exact.
 */
export function downsamplePositions<T extends TimedPoint>(points: T[], maxPoints = 2000): T[] {
  if (maxPoints < 2) return points.slice(0, Math.max(0, maxPoints));
  if (points.length <= maxPoints) return points;
  const last = points.length - 1;
  const inner = maxPoints - 2;
  const out: T[] = [points[0]!];
  if (inner <= 0) {
    out.push(points[last]!);
    return out;
  }
  for (let i = 1; i <= inner; i++) {
    const idx = Math.round((i * last) / (inner + 1));
    const point = points[idx];
    if (point && point !== out[out.length - 1]) out.push(point);
  }
  if (out[out.length - 1] !== points[last]) out.push(points[last]!);
  return out;
}

export function pageWindow(opts: { cursor?: string | null; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 2000);
  const cursor = opts.cursor ?? null;
  return { limit, cursor };
}
