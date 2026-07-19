import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sessionUniverseReminder } from "./session-universe.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// sessionUniverseReminder is the ADR-0034 SessionStart core: it reads the universe
// state (injected), and emits the chat reminder naming the active universe ONLY
// past the progressive-disclosure gate (>= 2 universes). Fail-open: never throws.

function seams(overrides = {}) {
  const calls = { emitted: [] };
  const base = {
    dir: "/brain/.vault-rag",
    readState: () => ({ registry: ["acme"], active: "acme" }),
    emit: (msg) => calls.emitted.push(msg),
  };
  return { args: { ...base, ...overrides }, calls };
}

test("sessionUniverseReminder — single-universe brain (empty registry) → quiet", () => {
  const { args, calls } = seams({ readState: () => ({ registry: [], active: "default" }) });
  sessionUniverseReminder(args);
  assert.deepEqual(calls.emitted, []);
});

test("sessionUniverseReminder — two universes → emits the active-universe reminder", () => {
  const { args, calls } = seams();
  sessionUniverseReminder(args);
  assert.equal(calls.emitted.length, 1);
  assert.match(calls.emitted[0], /Active universe: 'acme'/);
});

test("sessionUniverseReminder — reads FROM the given state dir", () => {
  const seen = [];
  const { args } = seams({ readState: (dir) => (seen.push(dir), { registry: [], active: "default" }) });
  sessionUniverseReminder(args);
  assert.deepEqual(seen, ["/brain/.vault-rag"]);
});

test("sessionUniverseReminder — fail-open: a throwing readState never propagates, emits nothing", () => {
  const { args, calls } = seams({
    readState: () => {
      throw new Error("state unreadable");
    },
  });
  sessionUniverseReminder(args); // must NOT throw
  assert.deepEqual(calls.emitted, []);
});

test("settings.json.template wires session-universe as a SessionStart hook, AFTER session-self-heal", () => {
  const settings = JSON.parse(
    readFileSync(join(REPO_ROOT, ".claude", "settings.json.template"), "utf8"),
  );
  const commands = settings.hooks.SessionStart.flatMap((entry) => entry.hooks.map((h) => h.command));
  const universeIdx = commands.findIndex((c) => c.includes("session-universe.mjs"));
  const selfHealIdx = commands.findIndex((c) => c.includes("session-self-heal.mjs"));
  assert.ok(universeIdx >= 0, "session-universe.mjs must be wired on SessionStart");
  assert.ok(selfHealIdx >= 0, "session-self-heal.mjs must stay wired on SessionStart");
  assert.ok(selfHealIdx < universeIdx, "universe reminder must run after self-heal (the restart nudge keeps priority)");
});
