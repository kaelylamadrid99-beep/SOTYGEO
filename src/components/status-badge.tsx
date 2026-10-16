import { Badge } from "@/components/ui/badge";
import { DRIVER_LABEL, GEOFENCE_LABEL, MOTION_LABEL, PROVIDER_LABEL, VEHICLE_LABEL } from "@/lib/sotygeo/format";

const tone: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  MOVING: "success",
  STOPPED: "warning",
  OFFLINE: "danger",
  ACTIVE: "success",
  MAINTENANCE: "warning",
  INACTIVE: "default",
  AVAILABLE: "success",
  ASSIGNED: "info",
  ON_ROUTE: "info",
  IN_SERVICE: "info",
  OUT_OF_SERVICE: "danger",
  PASS: "success",
  WARNING: "warning",
  FAIL: "danger",
  UNREAD: "warning",
  READ: "default",
  BASE: "info",
  CLIENTE: "success",
  OPERACION: "warning",
  RESTRINGIDA: "danger",
  ENTER: "success",
  EXIT: "info",
  SIMULATOR: "default",
  EXTERNAL: "info",
  SMARTPHONE: "success",
  REVOKED: "danger",
  EXPIRED: "warning",
};

const labels: Record<string, string> = {
  ...MOTION_LABEL,
  ...VEHICLE_LABEL,
  ...DRIVER_LABEL,
  ...GEOFENCE_LABEL,
  ...PROVIDER_LABEL,
  PASS: "Aprobado",
  WARNING: "Advertencia",
  FAIL: "Falla",
  UNREAD: "No leída",
  READ: "Leída",
  ENTER: "Entrada",
  EXIT: "Salida",
  ACTIVE: "Activo",
  REVOKED: "Revocado",
  EXPIRED: "Expirado",
  ONLINE: "En línea",
};

export function StatusBadge({ value }: { value: string }) {
  return <Badge variant={tone[value] ?? "default"}>{labels[value] ?? value.replaceAll("_", " ")}</Badge>;
}
