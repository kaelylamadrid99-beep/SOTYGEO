/** DEPRECATED: la autorización vive en security/permissions.ts + security/authorize.ts. Ningún endpoint usa ya estas funciones; se conservan solo por compatibilidad de tests/imports externos. */
import type { Profile, Role } from "./types.ts";
import { ADMIN_ROLES, MUTATING_ROLES, OPERATOR_ROLES } from "./types.ts";

export function canMutate(role: Role): boolean {
  return MUTATING_ROLES.includes(role);
}

export function canAdmin(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

export function canRestoreBackup(role: Role): boolean {
  return role === "ADMIN";
}

export function canSeeOperations(role: Role): boolean {
  return OPERATOR_ROLES.includes(role);
}

export function clientScope(profile: Profile): string | null {
  return profile.role === "CLIENTE" ? profile.client_id : null;
}

export function driverScope(profile: Profile): string | null {
  return profile.role === "CONDUCTOR" ? profile.driver_id : null;
}

export function canSeeVehicle(
  profile: Profile,
  vehicle: { client_id: string | null; current_driver_id: string | null },
): boolean {
  if (profile.role === "CLIENTE") return vehicle.client_id === profile.client_id;
  if (profile.role === "CONDUCTOR") return vehicle.current_driver_id === profile.driver_id;
  return true;
}

export function assertMutate(role: Role): void {
  if (!canMutate(role)) throw new Error("No autorizado");
}

export function assertAdmin(role: Role): void {
  if (!canAdmin(role)) throw new Error("No autorizado");
}

export function assertRestore(role: Role): void {
  if (!canRestoreBackup(role)) throw new Error("No autorizado para restaurar respaldos");
}
