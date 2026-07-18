import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcileHooks, detectHookGap, repairEngineHookCommands, repairWin32NodePrefix } from "./hooks-reconcile.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// hooks-reconcile — pure, idempotent reconcile of a brain's settings.json hook
// entries against the engine's template (ADR 0026, the third additive surface
// after skills and .mcp.json servers). ADD only the engine-owned hook entries the
// brain is MISSING, dedup by the engine SCRIPT the hook runs; never overwrite,
// never remove, never touch a user-added entry. The placeholders ({{NODE}},
// {{PROJECT_ROOT}}) in the appended entries are substituted with the brain's own
// node interpreter (parsed from its existing hooks) and its dir.
// ═══════════════════════════════════════════════════════════════════════════

// The engine template (placeholders intact, as it lives on disk).
const templateHooks = {
  SessionStart: [
    { matcher: "", hooks: [{ type: "command", command: '{{NODE}} "{{PROJECT_ROOT}}/scripts/session-self-heal.mjs"', timeout: 20000 }] },
    { matcher: "", hooks: [{ type: "command", command: '{{NODE}} "{{PROJECT_ROOT}}/scripts/session-health.mjs"', timeout: 20000 }] },
    { matcher: "", hooks: [{ type: "command", command: '{{NODE}} "{{PROJECT_ROOT}}/scripts/session-obsidian-hint.mjs"', timeout: 20000 }] },
    { matcher: "", hooks: [{ type: "command", command: '{{NODE}} "{{PROJECT_ROOT}}/scripts/session-status.mjs"', timeout: 20000 }] },
  ],
};

// A v3.1.0-origin brain: SessionStart wires session-status ONLY, with concrete,
// already-substituted paths (its own node interpreter + brain dir).
function v310BrainHooks() {
  return {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: '/usr/local/bin/node "/brains/foo/scripts/session-status.mjs"', timeout: 20000 }] },
    ],
  };
}

test("reconcileHooks — appends an engine SessionStart hook the brain is missing, substituted", () => {
  const { hooks, hooksAdded } = reconcileHooks({
    brainHooks: v310BrainHooks(),
    templateHooks,
    projectRoot: "/brains/foo",
  });

  const commands = hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(
    commands.includes('/usr/local/bin/node "/brains/foo/scripts/session-self-heal.mjs"'),
    "the missing self-heal hook must be appended with the brain's own node + dir substituted",
  );
  assert.ok(commands.includes('/usr/local/bin/node "/brains/foo/scripts/session-health.mjs"'), "session-health appended");
  assert.ok(commands.includes('/usr/local/bin/node "/brains/foo/scripts/session-obsidian-hint.mjs"'), "session-obsidian-hint appended");
  assert.deepEqual(
    hooksAdded.sort(),
    ["scripts/session-health.mjs", "scripts/session-obsidian-hint.mjs", "scripts/session-self-heal.mjs"],
    "hooksAdded names the 3 newly-wired engine scripts (by their script suffix)",
  );
});

test("reconcileHooks — idempotent: a converged brain (all 4 engine hooks present) adds nothing", () => {
  // A v3.3.0 brain already wires the full SessionStart quartet.
  const converged = {
    SessionStart: ["session-self-heal", "session-health", "session-obsidian-hint", "session-status"].map((s) => ({
      matcher: "",
      hooks: [{ type: "command", command: `/usr/local/bin/node "/brains/foo/scripts/${s}.mjs"`, timeout: 20000 }],
    })),
  };
  const { hooks, hooksAdded } = reconcileHooks({ brainHooks: converged, templateHooks, projectRoot: "/brains/foo" });
  assert.deepEqual(hooksAdded, [], "a 2nd pass on a converged brain must be a no-op (nothing added)");
  assert.deepEqual(hooks, converged, "the hooks object is left byte-identical when converged");
});

test("reconcileHooks — a USER hook entry is preserved (never removed, never clobbered)", () => {
  const userGroup = {
    matcher: "Write",
    hooks: [{ type: "command", command: '/usr/local/bin/node "/brains/foo/my-own-hook.mjs"', timeout: 5000 }],
  };
  const brainHooks = {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: '/usr/local/bin/node "/brains/foo/scripts/session-status.mjs"', timeout: 20000 }] },
    ],
    // a whole user-owned event the engine template doesn't even mention:
    PreToolUse: [userGroup],
  };
  const { hooks, hooksAdded } = reconcileHooks({ brainHooks, templateHooks, projectRoot: "/brains/foo" });

  assert.deepEqual(hooks.PreToolUse, [userGroup], "the user's own event + entry must survive untouched");
  // session-status kept as the FIRST SessionStart entry, the 3 missing engine ones appended after it:
  assert.equal(hooks.SessionStart[0].hooks[0].command, '/usr/local/bin/node "/brains/foo/scripts/session-status.mjs"');
  assert.equal(hooks.SessionStart.length, 4, "the 3 missing engine hooks are appended, the user's stays in place");
  assert.equal(hooksAdded.length, 3);
});

// ── Cross-OS parity (ADR 0015): the REAL brain hook command is not a bare `node` but
//    a QUOTED launcher invocation — `/bin/sh "<…>/run-node.sh" "<…>/X.mjs"` on posix,
//    `cmd /c "<…>\run-node.cmd" "<…>\X.mjs"` on win32 (the run-node PATH self-heal). The
//    node prefix derived for the appended entries must keep that whole wrapper, not stop
//    at the first quote — and the new entry's script path must be POSIX {{PROJECT_ROOT}}.

test("reconcileHooks — preserves the real run-node launcher prefix (posix), appends a posix path", () => {
  const brainHooks = {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: '/bin/sh "/brains/foo/scripts/run-node.sh" "/brains/foo/scripts/session-status.mjs"', timeout: 20000 }] },
    ],
  };
  const { hooks } = reconcileHooks({ brainHooks, templateHooks, projectRoot: "/brains/foo" });
  const cmds = hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(
    cmds.includes('/bin/sh "/brains/foo/scripts/run-node.sh" "/brains/foo/scripts/session-self-heal.mjs"'),
    "the appended entry must keep the FULL /bin/sh \"…/run-node.sh\" wrapper, not just /bin/sh",
  );
});

test("reconcileHooks — preserves the run-node prefix on win32 (quoted backslash path), posix script path", () => {
  const brainHooks = {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: 'cmd /c "C:\\brains\\foo\\scripts\\run-node.cmd" "C:\\brains\\foo\\scripts\\session-status.mjs"', timeout: 20000 }] },
    ],
  };
  const { hooks } = reconcileHooks({ brainHooks, templateHooks, projectRoot: "C:/brains/foo" });
  const cmds = hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(
    cmds.includes('cmd /c "C:\\brains\\foo\\scripts\\run-node.cmd" "C:/brains/foo/scripts/session-self-heal.mjs"'),
    "win32: keep the quoted run-node.cmd prefix; the new script path uses the posix {{PROJECT_ROOT}}",
  );
});

// ── repairEngineHookCommands — heal the issue-#31 broken win32 hook prefix ──────
//    A brain generated before the fix baked `cmd /c "C:\…\run-node.cmd"` into every
//    hook command; Git Bash (Claude Code's default Windows hook shell) eats the
//    backslashes → `claude`→`laude`, hooks fail. The additive reconcile never
//    rewrites an existing command, so deployed Windows brains stay broken. This
//    narrow, nominative repair rewrites ONLY the broken engine run-node prefix to
//    the forward-slash form, in place, converging at the next self-heal restart.

test("repairEngineHookCommands (win32) — rewrites the broken `cmd /c \"…\\run-node.cmd\"` prefix to forward-slash", () => {
  const brainHooks = {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: 'cmd /c "C:\\Users\\x\\brain\\scripts\\run-node.cmd" "C:/Users/x/brain/scripts/session-self-heal.mjs"', timeout: 20000 }] },
    ],
    Stop: [
      { matcher: "", hooks: [{ type: "command", command: 'cmd /c "C:\\Users\\x\\brain\\scripts\\run-node.cmd" "C:/Users/x/brain/scripts/auto-push.mjs"', timeout: 20000 }] },
    ],
  };
  const { hooks, repaired } = repairEngineHookCommands({ hooks: brainHooks, platform: "win32", projectRoot: "C:/Users/x/brain" });
  assert.equal(
    hooks.SessionStart[0].hooks[0].command,
    'C:/Users/x/brain/scripts/run-node.cmd "C:/Users/x/brain/scripts/session-self-heal.mjs"',
  );
  assert.equal(
    hooks.Stop[0].hooks[0].command,
    'C:/Users/x/brain/scripts/run-node.cmd "C:/Users/x/brain/scripts/auto-push.mjs"',
  );
  assert.deepEqual(repaired.sort(), ["scripts/auto-push.mjs", "scripts/session-self-heal.mjs"]);
});

test("repairEngineHookCommands — idempotent: an already-fixed brain is left byte-identical (no repair, no churn)", () => {
  const fixed = {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: 'C:/Users/x/brain/scripts/run-node.cmd "C:/Users/x/brain/scripts/session-self-heal.mjs"', timeout: 20000 }] },
    ],
  };
  const { hooks, repaired } = repairEngineHookCommands({ hooks: fixed, platform: "win32", projectRoot: "C:/Users/x/brain" });
  assert.deepEqual(repaired, []);
  assert.deepEqual(hooks, fixed);
});

test("repairEngineHookCommands — a USER hook (no run-node.cmd) is never touched", () => {
  const brainHooks = {
    PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: 'cmd /c "C:\\tools\\my-own.cmd" "arg"', timeout: 5000 }] }],
  };
  const { hooks, repaired } = repairEngineHookCommands({ hooks: brainHooks, platform: "win32", projectRoot: "C:/Users/x/brain" });
  assert.deepEqual(repaired, []);
  assert.deepEqual(hooks, brainHooks);
});

test("repairEngineHookCommands (posix) — no-op: the /bin/sh run-node.sh prefix is fine, never rewritten", () => {
  const brainHooks = {
    SessionStart: [
      { matcher: "", hooks: [{ type: "command", command: '/bin/sh "/brains/foo/scripts/run-node.sh" "/brains/foo/scripts/session-self-heal.mjs"', timeout: 20000 }] },
    ],
  };
  const { hooks, repaired } = repairEngineHookCommands({ hooks: brainHooks, platform: "darwin", projectRoot: "/brains/foo" });
  assert.deepEqual(repaired, []);
  assert.deepEqual(hooks, brainHooks);
});

test("repairWin32NodePrefix — repairs a single command string (used for statusLine too), else returns it unchanged", () => {
  assert.equal(
    repairWin32NodePrefix('cmd /c "C:\\Users\\x\\brain\\scripts\\run-node.cmd" "C:/Users/x/brain/scripts/status-line.mjs"', "C:/Users/x/brain"),
    'C:/Users/x/brain/scripts/run-node.cmd "C:/Users/x/brain/scripts/status-line.mjs"',
  );
  // already fixed → unchanged (no churn)
  assert.equal(
    repairWin32NodePrefix('C:/Users/x/brain/scripts/run-node.cmd "C:/Users/x/brain/scripts/status-line.mjs"', "C:/Users/x/brain"),
    'C:/Users/x/brain/scripts/run-node.cmd "C:/Users/x/brain/scripts/status-line.mjs"',
  );
});

// ── detectHookGap — the pure bootstrap drift gate (mirrors detectSelfHealGap) ──
// session-status uses it to decide whether to spawn the one-time reconcile on a
// pre-3.2 brain. A converged brain → not needed → the hook stays a TRUE no-op.

test("detectHookGap — a v3.1.0 brain missing the 3 runtime hooks → needed, named", () => {
  const gap = detectHookGap({ brainHooks: v310BrainHooks(), templateHooks });
  assert.equal(gap.needed, true);
  assert.deepEqual(
    gap.missingHooks.sort(),
    ["scripts/session-health.mjs", "scripts/session-obsidian-hint.mjs", "scripts/session-self-heal.mjs"],
  );
});

test("detectHookGap — a converged brain → not needed (steady-state no-op)", () => {
  const converged = {
    SessionStart: ["session-self-heal", "session-health", "session-obsidian-hint", "session-status"].map((s) => ({
      matcher: "",
      hooks: [{ type: "command", command: `/usr/local/bin/node "/brains/foo/scripts/${s}.mjs"`, timeout: 20000 }],
    })),
  };
  assert.equal(detectHookGap({ brainHooks: converged, templateHooks }).needed, false);
});
