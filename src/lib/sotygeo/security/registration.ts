/** Lógica pura del registro público de empresa (sin I/O: testeable). */
import { z } from "zod";
import type { Role } from "../types.ts";
import { normalizeEmail } from "./invitations.ts";

/** El registro público SOLO crea el ADMIN fundador. Nunca viene del cliente. */
export const PUBLIC_REGISTRATION_ROLE: Role = "ADMIN";

/** Roles que únicamente entran por invitación de un ADMIN. */
export const INVITATION_ONLY_ROLES: readonly Role[] = ["OPERADOR", "SUPERVISOR", "CONDUCTOR", "CLIENTE"];

export const REGISTRATION_CONFLICT_MSG = "No se pudo crear la cuenta con ese correo.";

// eslint-disable-next-line no-control-regex -- rejecting control characters is intentional
const safeText = /^[^<>{}\u0000-\u001f]+$/;

/**
 * `.strict()`: cualquier campo extra (role, company_id, user_id, status…) hace
 * fallar la validación. El cliente no puede elegir rol ni empresa.
 */
export const registerInputSchema = z
  .object({
    company_name: z.string().trim().min(2).max(120).regex(safeText),
    legal_name: z.string().trim().max(160).regex(safeText).or(z.literal("")).default(""),
    rfc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})?$/, "RFC inválido")
      .default(""),
    company_phone: z.string().trim().max(30).regex(/^[0-9+()\-\s]*$/).default(""),
    full_name: z.string().trim().min(2).max(120).regex(safeText),
    email: z.string().trim().max(254).email().transform(normalizeEmail),
    password: z.string().min(10).max(128),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerInputSchema>;
