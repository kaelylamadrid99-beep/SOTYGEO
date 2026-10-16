/** Filtro de eventos realtime por empresa + scope. Puro y testeable. Deny-by-default. */
import type { DomainEvent } from "./bus.ts";

export type EventViewer = {
  companyId: string;
  vehiclesScope: string | null; // scope del recurso "vehicles"
  allowedVehicleIds: string[] | null;
};

export type Decision =
  | { kind: "deny" }
  | { kind: "allow"; event: DomainEvent }
  | { kind: "check-service"; serviceId: string; event: DomainEvent };

const VEHICLE_TYPES = new Set(["GPS_POSITION_UPDATED", "VEHICLE_STATUS_CHANGED", "GPS_OFFLINE"]);
const SERVICE_TYPES = new Set(["SERVICE_STATUS_CHANGED", "SERVICE_ASSIGNED", "DELIVERY_COMPLETED", "ETA_DELAY"]);

export function decideEvent(v: EventViewer, e: DomainEvent): Decision {
  if (e.companyId !== v.companyId) return { kind: "deny" }; // multiempresa SIEMPRE
  if (v.vehiclesScope === "COMPANY") return { kind: "allow", event: e }; // staff: evento completo
  const t = e.type;
  if (e.entityType === "VEHICLE" && VEHICLE_TYPES.has(t) && e.entityId) {
    if (!v.allowedVehicleIds?.includes(e.entityId)) return { kind: "deny" };
    const p = (e.payload ?? {}) as Record<string, unknown>;
    // Payload mínimo: nunca velocidad interna, conductor ni identificadores.
    const payload = t === "GPS_POSITION_UPDATED" ? { lat: p["lat"], lng: p["lng"], motion: p["motion"] }
      : t === "VEHICLE_STATUS_CHANGED" ? { to: p["to"] } : {};
    return { kind: "allow", event: { companyId: e.companyId, type: t, entityType: "VEHICLE", entityId: e.entityId, payload, at: e.at } };
  }
  if (e.entityType === "SERVICE" && SERVICE_TYPES.has(t) && e.entityId) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const payload = t === "SERVICE_STATUS_CHANGED" ? { to: p["to"] } : {};
    return { kind: "check-service", serviceId: e.entityId, event: { companyId: e.companyId, type: t, entityType: "SERVICE", entityId: e.entityId, payload, at: e.at } };
  }
  return { kind: "deny" }; // ROUTE_DEVIATION, MAINTENANCE_DUE, FUEL_ANOMALY, DOCUMENT_*, INCIDENT_*… son internos
}
