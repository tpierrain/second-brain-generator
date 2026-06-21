import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { bootstrapSessionHooks } from "./hook-bootstrap.mjs";
import { runReconcileCli } from "./reconcile-brain.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// restart-convergence — the END-TO-END proof that a one-time pre-3.2 → v3.3.0
// jump converges in "ONE `/update-engine` + ONE restart", never a SECOND update.
//
// The two halves are unit-tested in isolation elsewhere:
//   • hook-bootstrap.test.mjs — the SessionStart tick DETECTS the hook gap and
//     spawns the reconcile (the spawn is a stub there).
//   • reconcile-brain.test.mjs (12/13) — `reconcileBrain` WIRES the missing hooks
//     into settings.json (there, with sourceDir !== brainDir).
//
// What no test pins yet — and what Thomas's "the framework must handle the double
// update, not the user" question hinges on — is the WIRING of those two halves with
// NO stub between them, on the EXACT path a restart takes: the bootstrap tick driving
// the REAL `runReconcileCli` in **self-heal mode** (`sourceDir === brainDir`, the local
// converge session-status spawns). reconcile-brain tests 6/10 only checked self-heal's
// copy/seed behaviour — never that self-heal still wires hooks + .mcp.json. This file
// closes that gap.
//
// Scope (honest): this proves that, from a post-pass-1 DISK STATE (the new engine files
// — incl. the local-mirror skill source, the 4-hook template, the new session-status —
// already on disk, but settings.json/.mcp.json still pre-3.2), the next restart's
// bootstrap tick converges ALL the wiring in ONE pass and is idempotent on the tick
// after. It does NOT re-run the legacy v3.1.0 orchestrator that lays those files down
// in pass 1 — that is the rig replay's job (manual QA / A2). Here the production
// `spawnReconcile` (detached, async) is injected as a SYNCHRONOUS `runReconcileCli` so
// the converged state can be asserted deterministically — same CLI, same args.
// ═══════════════════════════════════════════════════════════════════════════

function writeFile(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

// The engine's SessionStart quartet, as it lives in settings.json.template.
const templateHooks = {
  SessionStart: ["session-self-heal", "session-health", "session-obsidian-hint", "session-status"].map((s) => ({
    matcher: "",
    hooks: [{ type: "command", command: `{{NODE}} "{{PROJECT_ROOT}}/scripts/${s}.mjs"`, timeout: 20000 }],
  })),
};

// A pre-3.2 brain settings.json: SessionStart wires session-status ONLY, with a
// user-owned key the reconcile must preserve, and concrete substituted paths.
function preV32Settings(brainDir) {
  return {
    mine: true,
    hooks: {
      SessionStart: [
        { matcher: "", hooks: [{ type: "command", command: `/usr/local/bin/node "${brainDir}/scripts/session-status.mjs"`, timeout: 20000 }] },
      ],
    },
  };
}

function manifest() {
  return {
    manifestVersion: 1,
    engineVersion: { rag: "1.1.5", constitutionTemplate: "1.0.0", scripts: "1.0.0" },
    indexSchemaVersion: 1,
    regimes: {
      replace: ["rag/src/**", "rag/package.json"],
      regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"],
      merge: [".claude/skills/local-mirror/**", "scripts/update-engine.mjs"],
    },
    engineMcpServers: ["vault-rag", "local-mirror"],
    source: { repo: "https://example.test/launcher.git", ref: "v3.3.0" },
    provenance: {},
  };
}

// The brain exactly as pass 1 left it: the new engine files (incl. the local-mirror
// skill SOURCE + the new templates) are on disk, but settings.json/.mcp.json are still
// pre-3.2 (pass 1's legacy orchestrator copied files but reconciled no wiring).
function buildPostPass1Brain() {
  const dir = mkdtempSync(join(tmpdir(), "sbg-restart-converge-"));
  // Engine files (present after pass 1's copy).
  writeFile(dir, "rag/src/index.ts", "// engine v3.3.0\n");
  writeFile(dir, "rag/package.json", '{ "name": "rag" }\n');
  writeFile(dir, "engine-manifest.json", JSON.stringify(manifest(), null, 2) + "\n");
  // The local-mirror skill SOURCE, laid on disk by pass 1 (so self-heal can wire it).
  writeFile(dir, ".claude/skills/local-mirror/SKILL.md", "---\nname: local-mirror\n---\nMirror a Notion zone.\n");
  // The new templates pass 1 delivered (the desired state the restart converges TO).
  // settings.json.template is a full settings file → the hooks live under a `hooks` key.
  writeFile(dir, ".claude/settings.json.template", JSON.stringify({ hooks: templateHooks }, null, 2) + "\n");
  writeFile(
    dir,
    ".mcp.json.template",
    JSON.stringify({ mcpServers: { "vault-rag": { type: "stdio", cwd: "{{PROJECT_ROOT}}" }, "local-mirror": { type: "stdio", cwd: "{{PROJECT_ROOT}}" } } }, null, 2) + "\n",
  );
  // The still-pre-3.2 wiring: session-status only, vault-rag only.
  writeFile(dir, ".claude/settings.json", JSON.stringify(preV32Settings(dir), null, 2) + "\n");
  writeFile(dir, ".mcp.json", JSON.stringify({ mcpServers: { "vault-rag": { type: "stdio" } } }, null, 2) + "\n");
  return dir;
}

// No-op I/O seams (no npm install / reindex / launcher build in a unit test).
function seams() {
  const calls = { install: [], reindex: [] };
  return {
    calls,
    regenerateLaunchers: async () => {},
    runInstall: async () => calls.install.push(true),
    runReindex: async () => calls.reindex.push(true),
    countVaultNotes: async () => 0,
  };
}

// The restart's bootstrap tick, wired to the REAL reconcile CLI as session-status does
// — but SYNCHRONOUSLY, so the converged state is observable. sourceDir === brainDir.
async function restartTick(brainDir, { calls, ...s }) {
  const brainHooks = JSON.parse(readFileSync(join(brainDir, ".claude/settings.json"), "utf8")).hooks ?? {};
  let reconcileError = null;
  let reconcilePromise = Promise.resolve();
  const r = bootstrapSessionHooks({
    brainHooks,
    templateHooks,
    brainDir,
    message: "one-time reassurance",
    // The production tick spawns this DETACHED (fire-and-forget); here we run the SAME
    // CLI in-process and capture its promise so the test can await full convergence
    // before asserting the on-disk state.
    spawnReconcile: ({ brainDir }) => {
      reconcilePromise = runReconcileCli({
        argv: ["--brainDir", brainDir, "--sourceDir", brainDir, "--platform", "posix"],
        seams: s,
      }).catch((e) => {
        reconcileError = e;
      });
    },
    emit: () => {},
  });
  await reconcilePromise;
  return { ...r, reconcileError };
}

test("restart-convergence — ONE restart's bootstrap tick wires the missing hooks + the local-mirror MCP (self-heal, no 2nd update)", async (t) => {
  const brainDir = buildPostPass1Brain();
  t.after(() => rmSync(brainDir, { recursive: true, force: true }));

  const r = await restartTick(brainDir, seams());
  assert.equal(r.reconcileError, null, "the spawned reconcile CLI must not error");
  assert.equal(r.bootstrapped, true, "the tick detects the pre-3.2 hook gap and fires the reconcile");

  // The 3 runtime hooks are now wired into settings.json, with the brain's own node + dir.
  const settings = JSON.parse(readFileSync(join(brainDir, ".claude/settings.json"), "utf8"));
  const cmds = settings.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  for (const h of ["session-self-heal", "session-health", "session-obsidian-hint"]) {
    assert.ok(cmds.includes(`/usr/local/bin/node "${brainDir}/scripts/${h}.mjs"`), `${h} must be wired after the restart tick`);
  }
  assert.ok(cmds.includes(`/usr/local/bin/node "${brainDir}/scripts/session-status.mjs"`), "the existing session-status entry stays wired");
  assert.equal(settings.mine, true, "the user-owned settings key must be preserved");

  // The local-mirror MCP server is now registered in .mcp.json (the user's vault-rag kept).
  const mcp = JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8"));
  assert.ok(mcp.mcpServers["local-mirror"], "local-mirror must be registered after the restart tick");
  assert.ok(mcp.mcpServers["vault-rag"], "the existing vault-rag server must be preserved");
  // The skill source pass 1 laid down is present → the skill is installed (discoverable).
  assert.ok(existsSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md")), "the local-mirror skill is on disk");
});

test("restart-convergence — the tick AFTER convergence is a true no-op (no second update needed, no churn)", async (t) => {
  const brainDir = buildPostPass1Brain();
  t.after(() => rmSync(brainDir, { recursive: true, force: true }));

  // First restart converges.
  await restartTick(brainDir, seams());
  const settingsAfter = readFileSync(join(brainDir, ".claude/settings.json"), "utf8");
  const mcpAfter = readFileSync(join(brainDir, ".mcp.json"), "utf8");

  // Second restart: the gap is gone → the tick must NOT fire the reconcile, and nothing churns.
  const r2 = await restartTick(brainDir, seams());
  assert.equal(r2.bootstrapped, false, "a converged brain's tick is a TRUE no-op — no second update is ever required");
  assert.equal(readFileSync(join(brainDir, ".claude/settings.json"), "utf8"), settingsAfter, "settings.json must be byte-identical on the 2nd tick");
  assert.equal(readFileSync(join(brainDir, ".mcp.json"), "utf8"), mcpAfter, ".mcp.json must be byte-identical on the 2nd tick");
});
