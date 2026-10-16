import assert from "node:assert/strict";
import { test } from "node:test";
import { assertFixTime, isCorruptFix, rateLimitAllow } from "./validate.ts";

test("isCorruptFix", () => {
  assert.equal(isCorruptFix(0, 0), true);
  assert.equal(isCorruptFix(25.6, -100.3), false);
});

test("assertFixTime rechaza futuro y muy antiguo", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");
  assert.throws(() => assertFixTime("not-a-date", now));
  assert.throws(() => assertFixTime(new Date(now + 3600_000).toISOString(), now));
  assert.throws(() => assertFixTime(new Date(now - 40 * 24 * 3600_000).toISOString(), now));
  assert.ok(assertFixTime(new Date(now - 60_000).toISOString(), now) instanceof Date);
});

test("rateLimitAllow cupo por minuto", () => {
  const key = `t-${Math.random()}`;
  const t0 = 1_000_000;
  for (let i = 0; i < 60; i++) assert.equal(rateLimitAllow(key, t0 + i * 1000, 60), true);
  assert.equal(rateLimitAllow(key, t0 + 59_500, 60), false);
});

test("rateLimitAllow ráfaga 5/s", () => {
  const key = `b-${Math.random()}`;
  const t0 = 2_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rateLimitAllow(key, t0 + i * 10, 60), true);
  assert.equal(rateLimitAllow(key, t0 + 50, 60), false);
});
