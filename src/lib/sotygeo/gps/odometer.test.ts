import assert from "node:assert/strict";
import { test } from "node:test";
import { computeOdometerDelta } from "./odometer.ts";

const base = {
  from: { lat: 25.67, lng: -100.31 },
  to: { lat: 25.675, lng: -100.31 },
  fromAt: "2026-01-01T12:00:00.000Z",
  toAt: "2026-01-01T12:05:00.000Z",
  previousOdometerKm: 1000,
};

test("acepta avance razonable por haversine", () => {
  const r = computeOdometerDelta(base);
  assert.equal(r.rejected, false);
  assert.ok(r.deltaKm > 0);
});

test("rechaza rollback de odómetro de dispositivo", () => {
  const r = computeOdometerDelta({ ...base, deviceOdometerKm: 900 });
  assert.equal(r.rejected, true);
  assert.equal(r.reason, "odometer_rollback");
});

test("rechaza salto imposible de odómetro de dispositivo", () => {
  const r = computeOdometerDelta({ ...base, deviceOdometerKm: 1100 });
  assert.equal(r.rejected, true);
  assert.equal(r.reason, "odometer_jump");
});

test("rechaza time_rollback", () => {
  const r = computeOdometerDelta({ ...base, toAt: "2026-01-01T11:00:00.000Z" });
  assert.equal(r.rejected, true);
  assert.equal(r.reason, "time_rollback");
});

test("ignora jitter GPS", () => {
  const r = computeOdometerDelta({ ...base, to: { lat: 25.67001, lng: -100.31 } });
  assert.equal(r.rejected, false);
  assert.equal(r.reason, "jitter");
});
