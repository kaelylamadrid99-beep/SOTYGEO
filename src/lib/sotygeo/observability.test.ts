import assert from "node:assert/strict";
import { test } from "node:test";
import { newRequestId, resolveRequestId } from "./observability.ts";

test("newRequestId", () => {
  const a = newRequestId();
  assert.equal(a.length, 16);
  assert.notEqual(a, newRequestId());
});

test("resolveRequestId", () => {
  assert.equal(resolveRequestId(new Headers({ "x-request-id": "abc" })), "abc");
  assert.equal(resolveRequestId(new Headers()).length, 16);
});
