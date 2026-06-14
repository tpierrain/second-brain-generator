import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEngineVersion } from "./engine-version.mjs";

test("formatEngineVersion — semver tag ref → 'engine <tag>'", () => {
  assert.equal(
    formatEngineVersion({ source: { repo: "https://x", ref: "v1.1.0" } }),
    "engine v1.1.0",
  );
});

test("formatEngineVersion — non-semver ref (branch/commit) shown verbatim, never invented", () => {
  assert.equal(
    formatEngineVersion({ source: { ref: "engine-packaging" } }),
    "engine engine-packaging",
  );
  assert.equal(formatEngineVersion({ source: { ref: "e6bfba0" } }), "engine e6bfba0");
});

test("formatEngineVersion — no source (launcher) → falls back to engineVersion.rag", () => {
  assert.equal(
    formatEngineVersion({ engineVersion: { rag: "1.1.0" } }),
    "engine 1.1.0",
  );
});

test("formatEngineVersion — source present but ref empty → falls back to rag", () => {
  assert.equal(
    formatEngineVersion({ source: { repo: "https://x", ref: "" }, engineVersion: { rag: "1.1.0" } }),
    "engine 1.1.0",
  );
});

test("formatEngineVersion — no source and no rag → null (never invent)", () => {
  assert.equal(formatEngineVersion({ manifestVersion: 1 }), null);
});

test("formatEngineVersion — missing/invalid manifest → null", () => {
  assert.equal(formatEngineVersion(null), null);
  assert.equal(formatEngineVersion(undefined), null);
  assert.equal(formatEngineVersion("nope"), null);
  assert.equal(formatEngineVersion(42), null);
});
