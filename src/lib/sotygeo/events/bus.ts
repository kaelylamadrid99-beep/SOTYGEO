/**
 * Bus de eventos de dominio.
 *
 * - Entrega LOCAL inmediata a los suscriptores de la misma instancia.
 * - Además persiste cada evento en `domain_events` (PostgreSQL). Las demás
 *   instancias (serverless / varias réplicas) lo leen con `fetchDomainEventsSince`
 *   (polling corto desde el stream SSE). Cada evento lleva un `id` para que el
 *   receptor descarte el que ya recibió por la vía local.
 */
type Handler = (event: DomainEvent) => void;

export type DomainEvent = {
  id?: string;
  companyId: string;
  type: string;
  entityType?: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  at?: string;
};

const listeners = new Set<Handler>();

function newEventId(): string {
  const a = new Uint8Array(12);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function publishDomainEvent(event: DomainEvent): void {
  const full: DomainEvent = { ...event, id: event.id ?? newEventId(), at: event.at ?? new Date().toISOString() };
  for (const h of listeners) {
    try {
      h(full);
    } catch {
      /* isolate subscriber errors */
    }
  }
  void persistDomainEvent(full);
}

async function persistDomainEvent(e: DomainEvent): Promise<void> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    await sql`
      insert into domain_events (id, company_id, type, entity_type, entity_id, payload)
      values (${e.id!}, ${e.companyId}, ${e.type}, ${e.entityType ?? ""}, ${e.entityId ?? null}, ${JSON.stringify(e.payload ?? {})})
      on conflict (id) do nothing
    `;
  } catch (err) {
    // Persistir es best-effort: la entrega local ya ocurrió.
    console.error("[events] no se pudo persistir el evento", err instanceof Error ? err.message : err);
  }
}

/** Eventos de una empresa con `created_at >= since`, en orden. El llamador deduplica por `id`. */
export async function fetchDomainEventsSince(companyId: string, since: string, limit = 200): Promise<Array<DomainEvent & { createdAt: string }>> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql<{ id: string; type: string; entity_type: string; entity_id: string | null; payload: string; created_at: string }>`
    select id, type, entity_type, entity_id, payload, created_at::text as created_at
    from domain_events
    where company_id = ${companyId} and created_at >= ${since}::timestamptz
    order by created_at asc, id asc
    limit ${limit}
  `;
  return rows.map((r) => {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(r.payload || "{}") as Record<string, unknown>;
    } catch {
      /* payload ilegible => vacío */
    }
    return { id: r.id, companyId, type: r.type, entityType: r.entity_type || undefined, entityId: r.entity_id, payload, at: new Date(r.created_at).toISOString(), createdAt: r.created_at };
  });
}

export function subscribeDomainEvents(handler: Handler): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export const EVENT_TYPES = [
  "GPS_POSITION_UPDATED",
  "VEHICLE_STATUS_CHANGED",
  "GEOFENCE_ENTER",
  "GEOFENCE_EXIT",
  "SPEED_ALERT",
  "GPS_OFFLINE",
  "SERVICE_STATUS_CHANGED",
  "SERVICE_ASSIGNED",
  "DELIVERY_COMPLETED",
  "DOCUMENT_EXPIRING",
  "ROUTE_DEVIATION",
  "ETA_DELAY",
  "MAINTENANCE_DUE",
  "FUEL_ANOMALY",
  "INSPECTION_FAIL",
] as const;
