import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sessionActionsLog } from "./session-actions-log.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ═══════════════════════════════════════════════════════════════════════════
// Track E — SessionStart hook that makes the activity ledger first-class: it
// seeds-if-absent on a real event (rung 3, ADR 0009) so every brain — including
// upgraders that never re-run the installer — gains the ledger, and surfaces a
// one-time note only when it just seeded (quiet otherwise). Fail-open.
// ═══════════════════════════════════════════════════════════════════════════

function seams(overrides = {}) {
  const calls = { emitted: [] };
  const base = {
    seedLog: () => ({ seeded: true, present: true }),
    emit: (v) => calls.emitted.push(v),
  };
  return { args: { ...base, ...overrides }, calls };
}

test("sessionActionsLog — emits once when it just seeded the ledger", () => {
  const { args, calls } = seams();
  const result = sessionActionsLog(args);
  assert.deepEqual(result, { seeded: true });
  assert.deepEqual(calls.emitted, [true]);
});

test("sessionActionsLog — stays silent when the ledger already existed", () => {
  const { args, calls } = seams({ seedLog: () => ({ seeded: false, present: true }) });
  const result = sessionActionsLog(args);
  assert.deepEqual(result, { seeded: false });
  assert.deepEqual(calls.emitted, []);
});

test("sessionActionsLog — fail-open: a seed hiccup never throws nor emits", () => {
  const { args, calls } = seams({
    seedLog: () => {
      throw new Error("odd fs");
    },
  });
  const result = sessionActionsLog(args);
  assert.deepEqual(result, { seeded: false });
  assert.deepEqual(calls.emitted, []);
});

test("settings.json.template wires session-actions-log as a SessionStart hook, AFTER session-wiki-health", () => {
  const settings = JSON.parse(
    readFileSync(join(REPO_ROOT, ".claude", "settings.json.template"), "utf8"),
  );
  const commands = settings.hooks.SessionStart.flatMap((entry) => entry.hooks.map((h) => h.command));
  const actionsIdx = commands.findIndex((c) => c.includes("session-actions-log.mjs"));
  const wikiIdx = commands.findIndex((c) => c.includes("session-wiki-health.mjs"));
  assert.ok(actionsIdx >= 0, "session-actions-log.mjs must be wired on SessionStart");
  assert.ok(wikiIdx >= 0, "session-wiki-health.mjs must stay wired on SessionStart");
  assert.ok(wikiIdx < actionsIdx, "actions-log must run after wiki-health");
});

test("engine-manifest carries session-actions-log in the replace regime", () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "engine-manifest.json"), "utf8"));
  assert.ok(
    manifest.regimes.replace.includes("scripts/session-actions-log.mjs"),
    "the hook must ship to the fleet via the replace regime",
  );
});
