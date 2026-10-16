import assert from "node:assert/strict";
import { test } from "node:test";
import { detectFenceTransition } from "./fence.ts";

test("ENTER / EXIT", () => {
  assert.equal(detectFenceTransition(false, true), "ENTER");
  assert.equal(detectFenceTransition(true, false), "EXIT");
  assert.equal(detectFenceTransition(true, true), null);
  assert.equal(detectFenceTransition(false, false), null);
});
