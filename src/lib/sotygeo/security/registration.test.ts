import { test } from "node:test";
import assert from "node:assert/strict";
import { INVITATION_ONLY_ROLES, PUBLIC_REGISTRATION_ROLE, registerInputSchema } from "./registration.ts";
import { activateInputSchema } from "./invitations.ts";

const valid = {
  company_name: "Transportes Norte",
  full_name: "Ana López",
  email: "  Ana@Example.COM ",
  password: "una-clave-segura",
};

test("registro válido normaliza correo y RFC", () => {
  const r = registerInputSchema.parse({ ...valid, rfc: "tsm980412ab3" });
  assert.equal(r.email, "ana@example.com");
  assert.equal(r.rfc, "TSM980412AB3");
  assert.equal(r.legal_name, "");
});

test("registro público solo crea ADMIN; los demás roles requieren invitación", () => {
  assert.equal(PUBLIC_REGISTRATION_ROLE, "ADMIN");
  for (const r of ["OPERADOR", "SUPERVISOR", "CONDUCTOR", "CLIENTE"] as const) {
    assert.ok(INVITATION_ONLY_ROLES.includes(r));
  }
});

test("el cliente NO puede inyectar rol, empresa ni estado", () => {
  for (const extra of [{ role: "ADMIN" }, { role: "CONDUCTOR" }, { company_id: "x" }, { status: "ACTIVE" }, { user_id: "u" }]) {
    assert.equal(registerInputSchema.safeParse({ ...valid, ...extra }).success, false, JSON.stringify(extra));
  }
});

test("rechaza contraseña corta, correo inválido, HTML en nombres y RFC mal formado", () => {
  assert.equal(registerInputSchema.safeParse({ ...valid, password: "corta" }).success, false);
  assert.equal(registerInputSchema.safeParse({ ...valid, email: "no-es-correo" }).success, false);
  assert.equal(registerInputSchema.safeParse({ ...valid, company_name: "<script>" }).success, false);
  assert.equal(registerInputSchema.safeParse({ ...valid, rfc: "123" }).success, false);
});

test("activación rechaza campos extra (rol/empresa vienen de la invitación)", () => {
  const token = "a".repeat(64);
  assert.equal(activateInputSchema.safeParse({ token, password: "una-clave-segura" }).success, true);
  assert.equal(activateInputSchema.safeParse({ token, password: "una-clave-segura", role: "ADMIN" }).success, false);
  assert.equal(activateInputSchema.safeParse({ token, password: "una-clave-segura", company_id: "c" }).success, false);
});
