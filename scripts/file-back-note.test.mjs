import { test } from "node:test";
import assert from "node:assert/strict";

import { runFileBack } from "./file-back-note.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// file-back-note — the thin CLI glue over the pure filed-note core (ADR 0009
// rung 2). It reads a JSON filing spec on stdin, injects today's date, writes a
// taxonomy-conformant note under vault/, and NEVER overwrites (fail-loud). All
// side effects come through an injected `deps` port so the glue stays testable.
// Binary exit: 0 written / 1 refused-or-error.
// ═══════════════════════════════════════════════════════════════════════════

function fakeDeps(overrides = {}) {
  const logs = [];
  const errors = [];
  const writes = [];
  const existing = new Set(overrides.existing ?? []);
  const deps = {
    cwd: () => "/brain",
    today: () => "2026-07-17",
    readInput: () => overrides.input ?? "{}",
    exists: (p) => existing.has(p),
    writeFile: (p, content) => writes.push({ path: p, content }),
    log: (line) => logs.push(line),
    error: (line) => errors.push(line),
  };
  return { deps, logs, errors, writes };
}

test("runFileBack — writes a conformant note under vault/, logs the path, exits 0", () => {
  const spec = JSON.stringify({
    type: "topic",
    title: "Capacity Management",
    tags: ["rag"],
    body: "The distilled answer.",
    links: ["topics/rag"],
  });
  const { deps, logs, writes } = fakeDeps({ input: spec });
  const code = runFileBack([], deps);
  assert.equal(code, 0);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/brain/vault/topics/capacity-management.md");
  assert.match(writes[0].content, /^---\ntype: topic\ncreated: 2026-07-17\nupdated: 2026-07-17\n/);
  assert.match(writes[0].content, /## Related\n\n- \[\[topics\/rag\]\]\n$/);
  assert.deepEqual(logs, ["✓ Filed back: vault/topics/capacity-management.md"]);
});

test("runFileBack — refuses to overwrite an existing note, writes nothing, exits 1", () => {
  const spec = JSON.stringify({ type: "topic", title: "RAG", tags: ["x"], body: "b" });
  const { deps, errors, writes } = fakeDeps({
    input: spec,
    existing: ["/brain/vault/topics/rag.md"],
  });
  const code = runFileBack([], deps);
  assert.equal(code, 1);
  assert.equal(writes.length, 0);
  assert.match(errors[0], /topics\/rag\.md already exists.*never overwrites/i);
});

test("runFileBack — invalid JSON on stdin is a fail-loud error, exits 1", () => {
  const { deps, errors, writes } = fakeDeps({ input: "{not json" });
  const code = runFileBack([], deps);
  assert.equal(code, 1);
  assert.equal(writes.length, 0);
  assert.match(errors[0], /invalid json spec/i);
});

test("runFileBack — a spec the core rejects (empty tags) surfaces as exit 1, no write", () => {
  const spec = JSON.stringify({ type: "topic", title: "X", tags: [], body: "b" });
  const { deps, errors, writes } = fakeDeps({ input: spec });
  const code = runFileBack([], deps);
  assert.equal(code, 1);
  assert.equal(writes.length, 0);
  assert.match(errors[0], /at least one tag|non-empty/i);
});
