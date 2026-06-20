import { test } from "node:test";
import assert from "node:assert/strict";
import { obsidianHealth, formatObsidianHint } from "./obsidian-health.mjs";

const CFG = "/Users/u/Library/Application Support/obsidian/obsidian.json";

function makeSeams(files = {}) {
  return {
    platform: "darwin",
    env: {},
    home: "/Users/u",
    existsSync: (p) => p in files,
    readFileSync: (p) => files[p],
  };
}

test("obsidianHealth — no obsidian.json (not installed) → unknown, installed:false", () => {
  const result = obsidianHealth("/Users/u/brain/vault", makeSeams({}));
  assert.equal(result.status, "unknown");
  assert.equal(result.installed, false);
});

test("obsidianHealth — installed but this vault not registered → unknown, installed:true, registered:false", () => {
  const cfg = JSON.stringify({ vaults: { abc: { path: "/Users/u/other-vault" } } });
  const result = obsidianHealth("/Users/u/brain/vault", makeSeams({ [CFG]: cfg }));
  assert.equal(result.status, "unknown");
  assert.equal(result.installed, true);
  assert.equal(result.registered, false);
});

test("obsidianHealth — installed and this vault registered → ok", () => {
  const cfg = JSON.stringify({ vaults: { abc: { path: "/Users/u/brain/vault", ts: 1 } } });
  const result = obsidianHealth("/Users/u/brain/vault", makeSeams({ [CFG]: cfg }));
  assert.deepEqual(result, { status: "ok", installed: true, registered: true });
});

test("obsidianHealth — never reports broken, even on a corrupt obsidian.json (fail-soft → unknown)", () => {
  const result = obsidianHealth("/Users/u/brain/vault", makeSeams({ [CFG]: "{ not json" }));
  assert.equal(result.status, "unknown");
  assert.notEqual(result.status, "broken");
});

test("formatObsidianHint — ok → null (quiet, no nag when all good)", () => {
  assert.equal(formatObsidianHint({ status: "ok", installed: true, registered: true }), null);
});

test("formatObsidianHint — not installed → soft install nudge mentioning obsidian.md", () => {
  const hint = formatObsidianHint({ status: "unknown", installed: false, registered: false });
  assert.ok(hint, "expected a hint string");
  assert.match(hint, /obsidian\.md/i);
  assert.doesNotMatch(hint, /broken|error|fail/i);
});

test("formatObsidianHint — installed but unregistered → 'Open folder as vault' nudge", () => {
  const hint = formatObsidianHint({ status: "unknown", installed: true, registered: false });
  assert.ok(hint, "expected a hint string");
  assert.match(hint, /Open folder as vault/i);
});
