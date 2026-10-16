import type { DriverStatus, MotionState, Role, VehicleStatus } from "./types";

export const num = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });
export const num0 = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

export const dtFmt = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});
export const dateFmt = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });
export const timeFmt = new Intl.DateTimeFormat("es-MX", { timeStyle: "medium" });

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return dtFmt.format(d);
}

export function fmtDay(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return dateFmt.format(d);
}

export function fmtKm(v: number | null | undefined): string {
  return `${num.format(v ?? 0)} km`;
}

export const MOTION_LABEL: Record<MotionState, string> = {
  MOVING: "En movimiento",
  STOPPED: "Detenido",
  OFFLINE: "Sin conexión",
};

export const VEHICLE_LABEL: Record<VehicleStatus, string> = {
  ACTIVE: "Activo",
  AVAILABLE: "Disponible",
  ASSIGNED: "Asignado",
  IN_SERVICE: "En servicio",
  MAINTENANCE: "Mantenimiento",
  OUT_OF_SERVICE: "Fuera de servicio",
  INACTIVE: "Inactivo",
};

export const FUEL_TYPES = [
  { id: "DIESEL", label: "Diésel" },
  { id: "GASOLINE", label: "Gasolina" },
  { id: "GAS", label: "Gas" },
  { id: "ELECTRIC", label: "Eléctrico" },
  { id: "HYBRID", label: "Híbrido" },
] as const;

export const DRIVER_LABEL: Record<DriverStatus, string> = {
  AVAILABLE: "Disponible",
  ASSIGNED: "Asignado",
  ON_ROUTE: "En ruta",
  INACTIVE: "Inactivo",
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  OPERADOR: "Operador",
  SUPERVISOR: "Supervisor",
  CONDUCTOR: "Conductor",
  CLIENTE: "Cliente",
};

export const GEOFENCE_LABEL: Record<string, string> = {
  BASE: "Base",
  CLIENTE: "Cliente",
  OPERACION: "Operación",
  RESTRINGIDA: "Restringida",
  OTRA: "Otra",
};

export const PROVIDER_LABEL: Record<string, string> = {
  SIMULATOR: "Simulador",
  EXTERNAL: "GPS externo",
  SMARTPHONE: "Smartphone",
};

export const NOTIF_LABEL: Record<string, string> = {
  GPS_OFFLINE: "GPS sin conexión",
  VEHICLE_ALERT: "Alerta de vehículo",
  GEOFENCE_ENTER: "Entrada a geocerca",
  GEOFENCE_EXIT: "Salida de geocerca",
  INSPECTION_FAIL: "Inspección con problema",
  LICENSE_EXPIRING: "Licencia por vencer",
  INFO: "Aviso",
};

export const VEHICLE_TYPES = [
  { id: "TRACTO", label: "Tractocamión" },
  { id: "CAJA_SEC", label: "Caja seca" },
  { id: "REFRIGERADO", label: "Refrigerado" },
  { id: "PLATAFORMA", label: "Plataforma" },
  { id: "VAN", label: "Van" },
  { id: "PICKUP", label: "Pickup" },
] as const;
