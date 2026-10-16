import { getSql } from "@/lib/db";

import { rateBucket } from "./rate-bucket";

/**
 * Rate limit compartido entre instancias (contador por ventana en Postgres).
 * Falla CERRADO: si la base no responde, se deniega (endpoints sensibles).
 */
export async function dbRateLimit(key: string, max: number, windowSec = 60, now = Date.now()): Promise<boolean> {
  try {
    const sql = await getSql();
    const rows = await sql<{ count: number }>`
      insert into rate_limits (key, bucket, count) values (${key.slice(0, 200)}, ${rateBucket(now, windowSec)}, 1)
      on conflict (key, bucket) do update set count = rate_limits.count + 1
      returning count`;
    return (rows[0]?.count ?? max + 1) <= max;
  } catch {
    return false;
  }
}
