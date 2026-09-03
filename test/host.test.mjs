/**
 * Host-half smoke test: lib/index.js is a no-op ESM host entry.
 *
 * Run: node --test "test/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../lib/index.js";

test("host apply exists and runs without throwing", () => {
  assert.equal(typeof apply, "function");
  const ctx = { get: () => undefined, on: () => () => {} };
  apply(ctx); // must not throw
});
