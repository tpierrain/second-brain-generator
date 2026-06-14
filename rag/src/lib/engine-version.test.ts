import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  engineVersionVector,
  loadEngineVersion,
  formatEngineVersionReport,
  manifestEngineVersion,
  loadManifestEngineVersion,
} from "./engine-version.js";

test("engine version vector: surfaces the rag semver from package.json contents", () => {
  assert.deepEqual(engineVersionVector({ version: "1.1.0" }), { rag: "1.1.0" });
});

test("manifestEngineVersion — source.ref (the install-time git tag) is THE version, verbatim", () => {
  assert.equal(manifestEngineVersion({ source: { ref: "v3.0.0" } }), "v3.0.0");
});

test("manifestEngineVersion — a non-semver ref (branch/commit) is shown verbatim, never invented", () => {
  assert.equal(manifestEngineVersion({ source: { ref: "engine-packaging" } }), "engine-packaging");
});

test("manifestEngineVersion — no source (the launcher) falls back to engineVersion.rag", () => {
  assert.equal(manifestEngineVersion({ engineVersion: { rag: "1.1.0" } }), "1.1.0");
});

test("manifestEngineVersion — source present but ref empty → falls back to rag", () => {
  assert.equal(
    manifestEngineVersion({ source: { ref: "" }, engineVersion: { rag: "1.1.0" } }),
    "1.1.0"
  );
});

test("manifestEngineVersion — nothing usable / invalid manifest → null (never invent)", () => {
  assert.equal(manifestEngineVersion({ manifestVersion: 1 }), null);
  assert.equal(manifestEngineVersion(null), null);
  assert.equal(manifestEngineVersion(undefined), null);
  assert.equal(manifestEngineVersion("nope"), null);
});

test("loadEngineVersion: reads the live rag/package.json (not a hardcoded copy)", () => {
  const pkgPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../package.json"
  );
  const { version } = JSON.parse(readFileSync(pkgPath, "utf-8"));

  assert.equal(loadEngineVersion().rag, version);
});

test("loadManifestEngineVersion: reads the brain-root engine-manifest.json (../../../ from rag/src/lib)", () => {
  // Mirror the loader's own resolution against the live file, so the test never
  // hardcodes a value (which would drift as the manifest is restamped).
  const manifestPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../engine-manifest.json"
  );
  const expected = manifestEngineVersion(
    JSON.parse(readFileSync(manifestPath, "utf-8"))
  );

  assert.equal(loadManifestEngineVersion(), expected);
});

test("loadManifestEngineVersion: never throws (fail-silent → null when the manifest is absent)", () => {
  assert.doesNotThrow(() => loadManifestEngineVersion());
});

test("engine report: the headline 'Version' is the engine TAG, NOT the mechanical rag vector (ADR 0017)", () => {
  const report = formatEngineVersionReport(
    "v3.0.0",
    { rag: "1.1.0" },
    { stamped: 1, running: 1 }
  );

  // The single source of truth for "what version am I": the tag, on the
  // headline. The rag vector is demoted to a clearly-labelled "internal build".
  assert.match(report, /Version:\s*v3\.0\.0/);
  assert.match(report, /internal build:[^\n]*rag 1\.1\.0/);
  assert.match(report, /schema[^\n]*running 1[^\n]*stamped 1/);
});

test("engine report: no manifest tag (null) → headline falls back to the rag vector, never blank", () => {
  const report = formatEngineVersionReport(
    null,
    { rag: "1.1.0" },
    { stamped: 1, running: 1 }
  );

  assert.match(report, /Version:\s*rag 1\.1\.0/);
});

test("engine report: a schema drift shows BOTH numbers (stamped ≠ running, visible)", () => {
  const report = formatEngineVersionReport(
    "v3.0.0",
    { rag: "2.0.0" },
    { stamped: 1, running: 2 }
  );

  assert.match(report, /running 2/);
  assert.match(report, /stamped 1/);
});

test("engine report: an index stamped before schema versioning is not shown as \"undefined\"/\"null\"", () => {
  const report = formatEngineVersionReport(
    "v3.0.0",
    { rag: "1.1.0" },
    { stamped: null, running: 1 }
  );

  assert.ok(!/undefined|null/.test(report), "no raw undefined/null in the prose");
});
