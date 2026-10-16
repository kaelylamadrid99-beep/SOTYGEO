import assert from "node:assert/strict";
import test from "node:test";
import { signToken, verifyToken } from "./signing.server.ts";

const SECRET = "x".repeat(40);
const NOW = 1_800_000_000_000;

test("un token válido verifica con las mismas partes", () => {
  const t = signToken(SECRET, "evidence-file", ["k1", "u1"], 60, NOW);
  assert.equal(verifyToken(SECRET, "evidence-file", ["k1", "u1"], t, NOW + 1000), true);
});

test("expira", () => {
  const t = signToken(SECRET, "evidence-file", ["k1", "u1"], 60, NOW);
  assert.equal(verifyToken(SECRET, "evidence-file", ["k1", "u1"], t, NOW + 61_000), false);
});

test("no sirve para otra clave, otro usuario ni otro scope", () => {
  const t = signToken(SECRET, "evidence-file", ["k1", "u1"], 60, NOW);
  assert.equal(verifyToken(SECRET, "evidence-file", ["k2", "u1"], t, NOW), false);
  assert.equal(verifyToken(SECRET, "evidence-file", ["k1", "u2"], t, NOW), false);
  assert.equal(verifyToken(SECRET, "evidence-upload", ["k1", "u1"], t, NOW), false);
});

test("partes que concatenadas coinciden NO colisionan", () => {
  const t = signToken(SECRET, "s", ["a|b", "c"], 60, NOW);
  assert.equal(verifyToken(SECRET, "s", ["a", "b|c"], t, NOW), false);
});

test("secreto distinto, token manipulado o basura => falso", () => {
  const t = signToken(SECRET, "s", ["a"], 60, NOW);
  assert.equal(verifyToken("y".repeat(40), "s", ["a"], t, NOW), false);
  const [exp, sig] = t.split(".");
  assert.equal(verifyToken(SECRET, "s", ["a"], `${Number(exp) + 999}.${sig}`, NOW), false);
  for (const bad of ["", "abc", "1.2", `${exp}.${"z".repeat(64)}`]) assert.equal(verifyToken(SECRET, "s", ["a"], bad, NOW), false);
});
