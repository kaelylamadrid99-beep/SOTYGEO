import type { Sql } from "@/lib/db";

export type OwnedTable =
  | "clients"
  | "fleets"
  | "drivers"
  | "vehicles"
  | "geofences"
  | "gps_devices"
  | "services";

export async function assertOwned(
  sql: Sql,
  table: OwnedTable,
  id: string | null | undefined,
  companyId: string,
): Promise<void> {
  if (!id) return;
  const rows = await sql.query<{ id: string }>(
    `select id from ${table} where id = $1 and company_id = $2 limit 1`,
    [id, companyId],
  );
  if (!rows[0]) throw new Error("No autorizado");
}
