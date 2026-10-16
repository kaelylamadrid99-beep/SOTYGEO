import assert from "node:assert/strict";
import { test } from "node:test";
import { grantsFor, hasPermission, profileCan, scopeFromProfile } from "./permissions.ts";
import { allowsId, buildAccessScope } from "./scope.ts";
import type { Profile } from "../types.ts";

function profile(role: Profile["role"], extra: Partial<Profile> = {}): Profile {
  return { user_id: "u1", company_id: "c1", role, full_name: "Test", driver_id: null, client_id: null, status: "ACTIVE", ...extra };
}

test("ADMIN permissions", () => {
  assert.ok(grantsFor("ADMIN").permissions.some((p) => p.startsWith("vehicles.")));
  assert.ok(profileCan(profile("ADMIN"), "vehicles.read"));
});

test("CLIENTE restricted", () => {
  assert.equal(profileCan(profile("CLIENTE", { client_id: "cl1" }), "users.create"), false);
});

test("PENDING bloqueado", () => {
  assert.equal(hasPermission(scopeFromProfile(profile("ADMIN", { status: "PENDING" })), "vehicles.read"), false);
});

test("scopes CLIENTE/CONDUCTOR", () => {
  assert.equal(buildAccessScope(profile("CONDUCTOR", { driver_id: "d1" })).forcedDriverId, "d1");
  const s = buildAccessScope(profile("CLIENTE", { client_id: "cl1" }));
  assert.equal(s.forcedClientId, "cl1");
  assert.equal(allowsId(s.allowedClientIds, "cl2"), false);
  assert.equal(allowsId(null, "x"), true);
});
