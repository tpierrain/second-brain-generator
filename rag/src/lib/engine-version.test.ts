import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  engineVersionVector,
  loadEngineVersion,
  formatEngineVersionReport,
} from "./engine-version.js";

test("engine version vector: surfaces the rag semver from package.json contents", () => {
  assert.deepEqual(engineVersionVector({ version: "1.1.0" }), { rag: "1.1.0" });
});

test("loadEngineVersion: reads the live rag/package.json (not a hardcoded copy)", () => {
  const pkgPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../package.json"
  );
  const { version } = JSON.parse(readFileSync(pkgPath, "utf-8"));

  assert.equal(loadEngineVersion().rag, version);
});

test("engine report: surfaces the rag version and the schema versions (running + stamped)", () => {
  const report = formatEngineVersionReport(
    { rag: "1.1.0" },
    { stamped: 1, running: 1 }
  );

  assert.match(report, /1\.1\.0/);
  assert.match(report, /\b1\b/); // schema version surfaced
});

test("engine report: a schema drift shows BOTH numbers (stamped ≠ running, visible)", () => {
  const report = formatEngineVersionReport(
    { rag: "2.0.0" },
    { stamped: 1, running: 2 }
  );

  assert.match(report, /1/);
  assert.match(report, /2/);
});

test("engine report: an index stamped before schema versioning is not shown as \"undefined\"/\"null\"", () => {
  const report = formatEngineVersionReport(
    { rag: "1.1.0" },
    { stamped: null, running: 1 }
  );

  assert.ok(!/undefined|null/.test(report), "no raw undefined/null in the prose");
});
