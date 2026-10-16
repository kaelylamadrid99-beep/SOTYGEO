import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyConcurrentSequences, claimSequence, isDuplicateEventKey,
  nextOutboxAttempt, selectOutboxBatch, shouldRunScheduledJob,
} from "./idempotency.ts";

test("shouldRunScheduledJob", () => {
  assert.equal(shouldRunScheduledJob(0), true);
  assert.equal(shouldRunScheduledJob(1), false);
});

test("claimSequence anti-rollback", () => {
  assert.equal(claimSequence(null, 1), true);
  assert.equal(claimSequence(5, 6), true);
  assert.equal(claimSequence(5, 5), false);
  assert.equal(claimSequence(5, 4), false);
});

test("concurrent sequences", () => {
  const r = applyConcurrentSequences(10, [9, 11, 11, 12, 8, 15]);
  assert.equal(r.final, 15);
  assert.deepEqual(r.accepted, [11, 12, 15]);
  assert.deepEqual(r.rejected, [9, 11, 8]);
});

test("event_key + outbox", () => {
  const seen = new Set<string>();
  assert.equal(isDuplicateEventKey(seen, "a"), false);
  assert.equal(isDuplicateEventKey(seen, "a"), true);
  const batch = selectOutboxBatch([
    { id: "1", delivered: true, attempts: 1 },
    { id: "2", delivered: false, attempts: 0 },
    { id: "3", delivered: false, attempts: 5 },
  ], 5, 10);
  assert.deepEqual(batch.map((r) => r.id), ["2"]);
  assert.equal(nextOutboxAttempt(batch[0]!, true).delivered, true);
});
