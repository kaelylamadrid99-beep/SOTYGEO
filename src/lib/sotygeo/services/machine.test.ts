import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTransition, canTransition } from "./machine.ts";

test("transiciones válidas", () => {
  assert.equal(canTransition("PLANNED", "ASSIGNED"), true);
  assert.equal(canTransition("IN_TRANSIT", "AT_DESTINATION"), true);
  assert.equal(canTransition("UNLOADING", "DELIVERED"), true);
});

test("transiciones inválidas", () => {
  assert.equal(canTransition("PLANNED", "DELIVERED"), false);
  assert.equal(canTransition("DELIVERED", "IN_TRANSIT"), false);
  assert.throws(() => assertTransition("PLANNED", "IN_TRANSIT"), /no permitida/);
});
