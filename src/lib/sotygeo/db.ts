import { getSql, type Sql } from "@/lib/db";

export function nid(): string {
  return crypto.randomUUID();
}

export async function insert(sql: Sql, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  await sql.query(
    `insert into ${table} (${cols}) values (${placeholders})`,
    keys.map((k) => row[k] ?? null),
  );
}

export async function writeAudit(
  companyId: string,
  userId: string | null,
  action: string,
  entityKind: string,
  entityId: string | null,
  details = "",
  tx?: Sql,
) {
  // Con `tx` la auditoría entra en la MISMA transacción que la operación auditada.
  const sql = tx ?? (await getSql());
  await insert(sql, "audit_logs", {
    id: nid(),
    company_id: companyId,
    user_id: userId,
    action,
    entity_kind: entityKind,
    entity_id: entityId,
    details,
  });
}

export async function notify(opts: {
  companyId: string;
  userId?: string | null;
  title: string;
  body: string;
  kind: string;
  entityId?: string | null;
  audienceRole?: string | null;
  emailQueued?: boolean;
  /** Ventana de deduplicación en minutos (por defecto 25). */
  dedupeMinutes?: number;
}) {
  const sql = await getSql();
  const recent = await sql<{ id: string }>`
    select id from notifications
    where company_id = ${opts.companyId}
      and kind = ${opts.kind}
      and coalesce(entity_id, '') = ${opts.entityId ?? ""}
      and coalesce(user_id, '') = ${opts.userId ?? ""}
      and coalesce(audience_role, '') = ${opts.audienceRole ?? ""}
      and created_at > now() - make_interval(mins => ${opts.dedupeMinutes ?? 25}::int)
    limit 1
  `;
  if (recent[0]) return;
  await insert(sql, "notifications", {
    id: nid(),
    company_id: opts.companyId,
    user_id: opts.userId ?? null,
    title: opts.title,
    body: opts.body,
    kind: opts.kind,
    entity_id: opts.entityId ?? null,
    audience_role: opts.audienceRole ?? null,
    status: "UNREAD",
    email_queued: opts.emailQueued ?? true,
  });
}
