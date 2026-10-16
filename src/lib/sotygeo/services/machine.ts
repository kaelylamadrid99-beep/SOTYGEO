export const SERVICE_STATUSES = [
  "PLANNED",
  "ASSIGNED",
  "AT_ORIGIN",
  "LOADING",
  "LOADED",
  "IN_TRANSIT",
  "AT_DESTINATION",
  "UNLOADING",
  "DELIVERED",
  "CANCELLED",
] as const;

export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

const ALLOWED: Record<ServiceStatus, ServiceStatus[]> = {
  PLANNED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["AT_ORIGIN", "PLANNED", "CANCELLED"],
  AT_ORIGIN: ["LOADING", "CANCELLED"],
  LOADING: ["LOADED", "CANCELLED"],
  LOADED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["AT_DESTINATION", "CANCELLED"],
  AT_DESTINATION: ["UNLOADING", "CANCELLED"],
  UNLOADING: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: ServiceStatus, to: ServiceStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transición no permitida: ${from} → ${to}`);
  }
}

export const STOP_KINDS = ["ORIGIN", "WAYPOINT", "DESTINATION"] as const;
export type StopKind = (typeof STOP_KINDS)[number];

export const STOP_STATUSES = ["PENDING", "ARRIVED", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];
