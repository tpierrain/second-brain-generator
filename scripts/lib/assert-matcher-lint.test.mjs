import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findLooseAssertions } from "./assert-matcher-lint.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests — the pure scanner
// ─────────────────────────────────────────────────────────────────────────────

test("flags a bare assert.throws with no matcher", () => {
  const found = findLooseAssertions("assert.throws(() => f());");
  assert.deepEqual(found, [{ line: 1, method: "throws" }]);
});

test("a matcher as 2nd argument is accepted (not flagged)", () => {
  assert.deepEqual(findLooseAssertions("assert.throws(() => f(), /boom/);"), []);
  assert.deepEqual(findLooseAssertions("assert.throws(() => f(), MyError);"), []);
});

test("flags a loose call spanning multiple lines, reporting the opening line", () => {
  const src = "const x = 1;\nassert.throws(\n  () => f(),\n);\n";
  assert.deepEqual(findLooseAssertions(src), [{ line: 2, method: "throws" }]);
});

test("commas nested inside the callback body are NOT a 2nd argument", () => {
  assert.deepEqual(findLooseAssertions("assert.throws(() => f(a, b));"), [
    { line: 1, method: "throws" },
  ]);
});

test("commas inside an object/array argument are NOT a 2nd argument", () => {
  assert.deepEqual(findLooseAssertions("assert.rejects(run({ a: 1, b: 2 }));"), [
    { line: 1, method: "rejects" },
  ]);
});

test("commas inside a string literal are NOT a 2nd argument", () => {
  assert.deepEqual(findLooseAssertions('assert.throws(() => f(","));'), [
    { line: 1, method: "throws" },
  ]);
});

test("detects assert.rejects too, and awaited calls", () => {
  assert.deepEqual(findLooseAssertions("await assert.rejects(p());"), [
    { line: 1, method: "rejects" },
  ]);
  assert.deepEqual(findLooseAssertions("await assert.rejects(p(), /x/);"), []);
});

test("reports every loose call in a file, sorted by line", () => {
  const src = "assert.throws(() => a());\nassert.rejects(b(), /ok/);\nassert.throws(() => c());\n";
  assert.deepEqual(findLooseAssertions(src), [
    { line: 1, method: "throws" },
    { line: 3, method: "throws" },
  ]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Repo-wide guard — no loose throws/rejects may enter the tree (fail-loud).
// This is the deterministic net for the C1 cluster. EXEMPT is empty by design;
// the guard's own test file is skipped because it carries loose examples as fixtures.
// ─────────────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const SCAN_ROOTS = ["scripts", "rag/src", "local-mirror/src"];
const SELF = relative(REPO_ROOT, fileURLToPath(import.meta.url));
const EXEMPT = new Set([SELF]);

function collectTestFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectTestFiles(full));
    else if (/\.test\.(mjs|ts)$/.test(name)) out.push(full);
  }
  return out;
}

test("no loose assert.throws/rejects anywhere in the engine test suites", () => {
  const offenders = [];
  for (const root of SCAN_ROOTS) {
    for (const file of collectTestFiles(join(REPO_ROOT, root))) {
      const rel = relative(REPO_ROOT, file);
      if (EXEMPT.has(rel)) continue;
      for (const { line, method } of findLooseAssertions(readFileSync(file, "utf8"))) {
        offenders.push(`${rel}:${line} — assert.${method}(…) has no matcher/message`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Loose throw/reject assertions found (assert the message/matcher, not just that it threw — CONVENTIONS.md §5ter):\n${offenders.join("\n")}`,
  );
});
