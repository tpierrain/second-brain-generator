import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sessionHealth } from "./session-health.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// sessionHealth (ADR 0028, F7) is the SessionStart wrapper. It reports the LAST
// known health instantly (a file read → formatHealthBanner) and re-probes in a
// detached background child. Contract: zero added latency (file read only), the
// re-probe ALWAYS runs (it refreshes the cache for next time), fail-open exit 0.

function seams(overrides = {}) {
  const calls = { spawned: [], emitted: [] };
  const base = {
    brainDir: "/brain",
    readCachedHealth: () => [
      { capability: "rag", status: "ok" },
      { capability: "index", status: "ok" },
    ],
    spawnProbe: (arg) => calls.spawned.push(arg),
    emit: (msg) => calls.emitted.push(msg),
  };
  return { args: { ...base, ...overrides }, calls };
}

test("sessionHealth — cached health all-ok → emits nothing, still spawns the re-probe", async () => {
  const { args, calls } = seams();
  await sessionHealth(args);
  assert.equal(calls.emitted.length, 0);
  assert.deepEqual(calls.spawned, [{ brainDir: "/brain" }]);
});

test("sessionHealth — cached health with a broken capability → emits the loud banner + spawns re-probe", async () => {
  const { args, calls } = seams({
    readCachedHealth: () => [
      { capability: "rag", status: "ok" },
      { capability: "mcp", status: "broken", detail: "unreachable: local-mirror" },
    ],
  });
  await sessionHealth(args);
  assert.equal(calls.emitted.length, 1);
  assert.match(calls.emitted[0], /mcp/);
  assert.match(calls.emitted[0], /⚠️/);
  assert.deepEqual(calls.spawned, [{ brainDir: "/brain" }]);
});

test("sessionHealth — no cached health yet (null) → emits nothing, still spawns re-probe", async () => {
  const { args, calls } = seams({ readCachedHealth: () => null });
  await sessionHealth(args);
  assert.equal(calls.emitted.length, 0);
  assert.deepEqual(calls.spawned, [{ brainDir: "/brain" }]);
});

test("sessionHealth — fail-open: a throwing cache read never propagates, re-probe still spawns", async () => {
  const { args, calls } = seams({
    readCachedHealth: () => {
      throw new Error("engine-health.json corrupt");
    },
  });
  await sessionHealth(args); // must NOT throw
  assert.equal(calls.emitted.length, 0);
  assert.deepEqual(calls.spawned, [{ brainDir: "/brain" }]);
});

test("settings.json.template wires session-health as a SessionStart hook, AFTER session-self-heal", () => {
  const settings = JSON.parse(
    readFileSync(join(REPO_ROOT, ".claude", "settings.json.template"), "utf8"),
  );
  const commands = settings.hooks.SessionStart.flatMap((entry) => entry.hooks.map((h) => h.command));
  const healthIdx = commands.findIndex((c) => c.includes("session-health.mjs"));
  const selfHealIdx = commands.findIndex((c) => c.includes("session-self-heal.mjs"));
  assert.ok(healthIdx >= 0, "session-health.mjs must be wired on SessionStart");
  assert.ok(selfHealIdx >= 0, "session-self-heal.mjs must stay wired on SessionStart");
  assert.ok(selfHealIdx < healthIdx, "health-check must run after self-heal (presence before function)");
});
