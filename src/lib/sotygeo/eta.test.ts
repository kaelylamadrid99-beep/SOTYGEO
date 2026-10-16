import assert from "node:assert/strict";
import { test } from "node:test";
import { computeEta, etaDelayMinutes } from "./eta.ts";

test("computeEta usa distancia directa cuando no hay path", () => {
  const r = computeEta({
    current: { lat: 25.67, lng: -100.31 },
    destination: { lat: 25.68, lng: -100.30 },
    speedKmh: 60,
    now: new Date("2026-01-01T12:00:00Z"),
  });
  assert.ok(r.remainingKm > 0);
  assert.ok(r.minutes >= 0);
  assert.equal(r.speedUsed, 60);
});

test("computeEta usa velocidad histórica si la actual es baja", () => {
  const r = computeEta({
    current: { lat: 0, lng: 0 },
    destination: { lat: 1, lng: 0 },
    speedKmh: 5,
    historicalAvgKmh: 80,
    now: new Date("2026-01-01T00:00:00Z"),
  });
  assert.equal(r.speedUsed, 80);
});

test("etaDelayMinutes positivo cuando ETA es posterior al plan", () => {
  assert.equal(etaDelayMinutes("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z"), 30);
  assert.equal(etaDelayMinutes(null, "2026-01-01T10:00:00Z"), 0);
});
