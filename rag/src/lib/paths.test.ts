import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { resolvePath } from "./config.js";

// Step 1 (engine-packaging Phase 0): config.ts must read vault/cache/env from the
// environment, defaulting to today's relative paths. `resolvePath` is the pure,
// testable seam: an env value wins (resolved to absolute), otherwise the
// historical fallback is kept verbatim — the regression guard for existing brains.

test("resolvePath — an absolute env value is returned (resolved)", () => {
  const abs = resolve("/srv/brains/acme/vault");
  assert.equal(resolvePath(abs, "/fallback"), abs);
});

test("resolvePath — unset env → the historical fallback is kept verbatim", () => {
  const fallback = resolve("/brain/vault");
  assert.equal(resolvePath(undefined, fallback), fallback);
});

test("resolvePath — empty / whitespace-only env → fallback (not the cwd)", () => {
  const fallback = resolve("/brain/vault");
  assert.equal(resolvePath("", fallback), fallback);
  assert.equal(resolvePath("   ", fallback), fallback);
});

test("resolvePath — a relative env value is resolved against the cwd", () => {
  assert.equal(resolvePath("data/vault", "/fallback"), resolve("data/vault"));
});
