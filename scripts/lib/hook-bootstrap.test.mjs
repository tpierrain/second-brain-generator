import { test } from "node:test";
import assert from "node:assert/strict";

import { bootstrapSessionHooks } from "./hook-bootstrap.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// hook-bootstrap — the SessionStart bootstrap tick (ADR 0026). On a pre-3.2 brain,
// `session-status` is the ONLY wired SessionStart hook, so it anchors the one-time
// jump to the v3.3.0 runtime trio: it detects the hook-wiring drift (brain
// settings.hooks vs the now-current template) and, if a gap exists, spawns the
// detached reconcile ONCE + emits one belt line. Converged → TRUE no-op (the steady
// state the bootstrap keeps free). Fail-soft: never throws (a broken bootstrap must
// never block a session start).
// ═══════════════════════════════════════════════════════════════════════════

const templateHooks = {
  SessionStart: ["session-self-heal", "session-health", "session-obsidian-hint", "session-status"].map((s) => ({
    matcher: "",
    hooks: [{ type: "command", command: `{{NODE}} "{{PROJECT_ROOT}}/scripts/${s}.mjs"`, timeout: 20000 }],
  })),
};

const v310BrainHooks = {
  SessionStart: [
    { matcher: "", hooks: [{ type: "command", command: '/usr/local/bin/node "/brains/foo/scripts/session-status.mjs"', timeout: 20000 }] },
  ],
};

function spy() {
  const calls = { spawned: [], emitted: [] };
  return {
    calls,
    spawnReconcile: (arg) => calls.spawned.push(arg),
    emit: (msg) => calls.emitted.push(msg),
  };
}

test("bootstrapSessionHooks — a hook gap → spawns the reconcile once + emits the belt line", () => {
  const { calls, spawnReconcile, emit } = spy();
  const r = bootstrapSessionHooks({
    brainHooks: v310BrainHooks,
    templateHooks,
    brainDir: "/brains/foo",
    message: "the one-time reassurance line",
    spawnReconcile,
    emit,
  });
  assert.equal(r.bootstrapped, true);
  assert.deepEqual(calls.spawned, [{ brainDir: "/brains/foo" }], "the reconcile is spawned exactly once, for this brain");
  assert.deepEqual(calls.emitted, ["the one-time reassurance line"], "the localized belt line is emitted");
  assert.deepEqual(r.missingHooks.sort(), ["scripts/session-health.mjs", "scripts/session-obsidian-hint.mjs", "scripts/session-self-heal.mjs"]);
});

test("bootstrapSessionHooks — a converged brain → TRUE no-op (no spawn, no emit)", () => {
  const converged = {
    SessionStart: ["session-self-heal", "session-health", "session-obsidian-hint", "session-status"].map((s) => ({
      matcher: "",
      hooks: [{ type: "command", command: `/usr/local/bin/node "/brains/foo/scripts/${s}.mjs"`, timeout: 20000 }],
    })),
  };
  const { calls, spawnReconcile, emit } = spy();
  const r = bootstrapSessionHooks({ brainHooks: converged, templateHooks, brainDir: "/brains/foo", message: "x", spawnReconcile, emit });
  assert.equal(r.bootstrapped, false);
  assert.deepEqual(calls.spawned, [], "a converged brain spawns nothing (zero steady-state overhead)");
  assert.deepEqual(calls.emitted, [], "a converged brain emits nothing");
});

test("bootstrapSessionHooks — fail-soft: a spawn error is swallowed (never blocks the session)", () => {
  const calls = { emitted: [] };
  const r = bootstrapSessionHooks({
    brainHooks: v310BrainHooks,
    templateHooks,
    brainDir: "/brains/foo",
    message: "x",
    spawnReconcile: () => {
      throw new Error("spawn boom");
    },
    emit: (m) => calls.emitted.push(m),
  });
  assert.equal(r.bootstrapped, false);
  assert.match(r.error, /spawn boom/);
  assert.equal(calls.emitted.length, 1, "exactly one non-blocking line is emitted on failure");
  assert.match(calls.emitted[0], /non-blocking/i);
});
