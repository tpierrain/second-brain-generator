import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionObsidianHint } from "./session-obsidian-hint.mjs";

test("sessionObsidianHint — a hint is computed → emitted, reported:true", () => {
  const emitted = [];
  const result = sessionObsidianHint({
    computeHint: () => "open folder as vault",
    emit: (m) => emitted.push(m),
  });
  assert.deepEqual(emitted, ["open folder as vault"]);
  assert.deepEqual(result, { reported: true });
});

test("sessionObsidianHint — no hint (null) → nothing emitted, reported:false", () => {
  const emitted = [];
  const result = sessionObsidianHint({ computeHint: () => null, emit: (m) => emitted.push(m) });
  assert.deepEqual(emitted, []);
  assert.deepEqual(result, { reported: false });
});

test("sessionObsidianHint — computeHint throws → swallowed (fail-open), reported:false", () => {
  const result = sessionObsidianHint({
    computeHint: () => {
      throw new Error("boom");
    },
    emit: () => assert.fail("must not emit"),
  });
  assert.deepEqual(result, { reported: false });
});
