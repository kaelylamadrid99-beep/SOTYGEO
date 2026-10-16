import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INVITABLE_ROLES,
  activateInputSchema,
  createInvitationToken,
  invitationState,
  inviteInputSchema,
  isInvitationUsable,
  loginAllowed,
  type InvitationRow,
} from "./invitations.ts";
import { hashSecret } from "./tokens.ts";

const base = { full_name: "Luis Pérez", email: "Luis@Example.com", phone: "" };

test("roles invitables: OPERADOR, SUPERVISOR, CONDUCTOR, CLIENTE (nunca ADMIN)", () => {
  assert.deepEqual([...INVITABLE_ROLES], ["OPERADOR", "SUPERVISOR", "CONDUCTOR", "CLIENTE"]);
  assert.equal(inviteInputSchema.safeParse({ ...base, role: "ADMIN" }).success, false);
});

test("invitación de OPERADOR y SUPERVISOR", () => {
  for (const role of ["OPERADOR", "SUPERVISOR"] as const) {
    const r = inviteInputSchema.parse({ ...base, role });
    assert.equal(r.role, role);
    assert.equal(r.email, "luis@example.com");
  }
});

test("invitación de CONDUCTOR exige driver_id y CLIENTE exige client_id", () => {
  assert.equal(inviteInputSchema.safeParse({ ...base, role: "CONDUCTOR" }).success, false);
  assert.equal(inviteInputSchema.parse({ ...base, role: "CONDUCTOR", driver_id: "d1" }).driver_id, "d1");
  assert.equal(inviteInputSchema.safeParse({ ...base, role: "CLIENTE" }).success, false);
  assert.equal(inviteInputSchema.parse({ ...base, role: "CLIENTE", client_id: "c1" }).client_id, "c1");
  assert.equal(inviteInputSchema.safeParse({ ...base, role: "OPERADOR", driver_id: "d1" }).success, false);
});

test("crear invitación: company_id, status o user_id manipulados se rechazan", () => {
  for (const extra of [{ company_id: "otra-empresa" }, { status: "ACCEPTED" }, { user_id: "u" }, { expires_at: "2099-01-01" }]) {
    assert.equal(inviteInputSchema.safeParse({ ...base, role: "OPERADOR", ...extra }).success, false, JSON.stringify(extra));
  }
});

test("aceptar invitación: el invitado no puede cambiar rol ni empresa", () => {
  const ok = { token: "a".repeat(64), password: "una-clave-segura" };
  assert.equal(activateInputSchema.safeParse(ok).success, true);
  for (const extra of [{ role: "ADMIN" }, { role: "SUPERVISOR" }, { company_id: "otra" }, { email: "x@y.co" }]) {
    assert.equal(activateInputSchema.safeParse({ ...ok, ...extra }).success, false, JSON.stringify(extra));
  }
  assert.equal(activateInputSchema.safeParse({ ...ok, token: "nohex" }).success, false);
});

test("token: solo se guarda el hash y expira a las 72 h", () => {
  const now = Date.UTC(2026, 0, 1);
  const t = createInvitationToken(now);
  assert.match(t.raw, /^[0-9a-f]{64}$/);
  assert.notEqual(t.hash, t.raw);
  assert.equal(t.hash, hashSecret(t.raw));
  assert.equal(new Date(t.expiresAt).getTime() - now, 72 * 3600_000);
});

test("invitación expirada, reutilizada o revocada no es utilizable", () => {
  const now = Date.now();
  const future = new Date(now + 3600_000).toISOString();
  const past = new Date(now - 1000).toISOString();
  const stamp = new Date(now).toISOString();
  const row = (o: Partial<InvitationRow>): InvitationRow => ({ status: "INVITED", used_at: null, revoked_at: null, expires_at: future, ...o });
  assert.equal(invitationState(row({}), now), "INVITED");
  assert.equal(isInvitationUsable(row({}), now), true);
  assert.equal(invitationState(row({ expires_at: past }), now), "EXPIRED");
  assert.equal(isInvitationUsable(row({ expires_at: past }), now), false);
  assert.equal(invitationState(row({ used_at: stamp }), now), "ACCEPTED");
  assert.equal(isInvitationUsable(row({ status: "ACCEPTED", used_at: stamp }), now), false);
  assert.equal(isInvitationUsable(row({ status: "REVOKED", revoked_at: stamp }), now), false);
  assert.equal(isInvitationUsable(null, now), false);
});

test("login permitido para ACTIVE y PENDING; bloqueado si está suspendida", () => {
  assert.equal(loginAllowed("ACTIVE"), true);
  assert.equal(loginAllowed("PENDING"), true);
  assert.equal(loginAllowed("SUSPENDED"), false);
  assert.equal(loginAllowed("DISABLED"), false);
  assert.equal(loginAllowed("REVOKED"), false);
  assert.equal(loginAllowed("INVITED"), false);
});
