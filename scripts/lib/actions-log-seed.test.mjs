import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  initialActionsLog,
  seedActionsLog,
  buildActionsLogHookOutput,
  ACTIONS_LOG_REL,
} from "./actions-log-seed.mjs";
import { extractWikiLinks } from "./wiki-lint.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// Track E — the append-only activity ledger becomes a seeded, first-class
// artifact. These tests lock the two properties the seed MUST hold: it is
// /lint-conformant (frontmatter + no dangling link from the format example) so a
// freshly-seeded brain stays lint-clean, and it matches the sync-sources append
// convention so appends keep working.
// ═══════════════════════════════════════════════════════════════════════════

test("initialActionsLog — carries conformant frontmatter dated with the injected day", () => {
  const seed = initialActionsLog("2026-07-17");
  assert.match(seed, /^---\n/);
  assert.match(seed, /\ntype: log\n/);
  assert.match(seed, /\ncreated: 2026-07-17\n/);
  assert.match(seed, /\nupdated: 2026-07-17\n/);
  assert.match(seed, /\ntags: \[[^\]]+\]\n/);
});

test("initialActionsLog — the format example is fenced, so it yields no dangling link", () => {
  const seed = initialActionsLog("2026-07-17");
  const body = seed.replace(/^---\n[\s\S]*?\n---\n/, "");
  assert.deepEqual(extractWikiLinks(body), []);
});

test("seedActionsLog — writes the initial ledger when absent, reports it seeded", () => {
  const brainDir = mkdtempSync(join(tmpdir(), "actions-log-"));
  const result = seedActionsLog({ brainDir, today: "2026-07-17" });
  assert.deepEqual(result, { seeded: true, present: true });
  assert.equal(
    readFileSync(join(brainDir, ACTIONS_LOG_REL), "utf8"),
    initialActionsLog("2026-07-17"),
  );
});

test("seedActionsLog — never overwrites an existing ledger, reports not seeded", () => {
  const brainDir = mkdtempSync(join(tmpdir(), "actions-log-"));
  const dest = join(brainDir, ACTIONS_LOG_REL);
  mkdirSync(join(brainDir, "vault"), { recursive: true });
  writeFileSync(dest, "## [2026-07-10] shipped Track E — #eng [[people/thomas]]\n");

  const result = seedActionsLog({ brainDir, today: "2026-07-17" });

  assert.deepEqual(result, { seeded: false, present: true });
  assert.equal(readFileSync(dest, "utf8"), "## [2026-07-10] shipped Track E — #eng [[people/thomas]]\n");
});

test("buildActionsLogHookOutput — surfaces a one-time note when it just seeded the ledger", () => {
  const output = buildActionsLogHookOutput(true);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(output.hookSpecificOutput.additionalContext, /actions-log\.md/);
  assert.match(output.hookSpecificOutput.additionalContext, /append/i);
  assert.match(output.systemMessage, /ledger/i);
});

test("buildActionsLogHookOutput — stays silent (null) when nothing was seeded", () => {
  assert.equal(buildActionsLogHookOutput(false), null);
});
