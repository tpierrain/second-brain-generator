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
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { runReconcileCli } from "./reconcile-brain.mjs";
import { sessionSelfHeal } from "../session-self-heal.mjs";
import { listFilesRelPosix } from "./fs-walk.mjs";
import { matchesAny } from "./glob-match.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// restart-convergence — the FAITHFUL integration proof (F-B7) that a one-time
// pre-3.3.0 → v3.3.0 jump converges EVERY new engine capability in "ONE
// `/update-engine` + ONE restart", never a SECOND update.
//
// Why the previous version of this file LIED (kept here as the lesson, ADR 0026):
// it hand-staged the brain into the post-pass-1 state it WISHED for — it
// pre-placed the local-mirror skill SOURCE, a local-mirror-defining
// `.mcp.json.template`, AND a manifest already declaring
// `engineMcpServers: [..., "local-mirror"]` + a `regimes.merge` listing the skill.
// A REAL pass-1 from a v3.1.0 brain produces NONE of these. The test validated my
// own staging, not reality, so it stayed green while the rig silently failed to
// converge `local-mirror` (the headline v3.3.0 feature) — found in Part B manual QA.
//
// This rewrite sources pass-1 delivery from the REAL launcher (this repo), with a
// genuinely-stale v3.1.0 brain manifest, and drives the REAL self-heal. It is RED
// until Task 2 lands (the engine must DELIVER its desired-state spec + the new
// skill + `.mcp.json.template`, and self-heal must read the DELIVERED spec, not the
// frozen user manifest). Marked `{ todo }` so the suite stays green at commit
// (commit-only-green gate); the flag is removed when the fix turns it green (2g).
//
// The asymmetry this pins (the whole bug): a file-sourced desired-state — the
// `.claude/settings.json.template` hook quartet, which v3.1.0 pass-1 DOES deliver —
// converges; a manifest-sourced desired-state — the skill + the MCP server — does
// NOT, because the manifest is frozen at install version and the sources aren't
// delivered. After the fix, both converge.
// ═══════════════════════════════════════════════════════════════════════════

// The real launcher = this repo's root (scripts/lib/ → up two).
const LAUNCHER = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function writeFile(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

// A genuinely-v3.1.0 brain manifest: vault-rag is the ONLY engine MCP server,
// `regimes.merge` knows NOTHING of the local-mirror skill, and there is no
// `local-mirror` module in `replace`. This is the frozen desired-state that
// update-engine never refreshes (root cause) — pass-1 leaves it untouched.
function v310Manifest() {
  return {
    manifestVersion: 1,
    engineVersion: { rag: "1.0.0", constitutionTemplate: "1.0.0", scripts: "1.0.0" },
    indexSchemaVersion: 1,
    regimes: {
      replace: ["rag/src/**", "rag/package.json"],
      regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"],
      merge: [
        "CLAUDE.md",
        ".claude/settings.json",
        ".claude/skills/coach/**",
        "scripts/auto-commit.mjs",
        "scripts/update-engine.mjs",
      ],
    },
    engineMcpServers: ["vault-rag"],
    source: { repo: String(LAUNCHER), ref: "v3.3.0" },
    provenance: {},
  };
}

// A pre-3.3.0 brain's settings.json: the engine hooks of its era (auto-commit,
// auto-push, the single session-status SessionStart) wired through the brain's OWN
// run-node launcher prefix (so appended hooks inherit it, ADR 0015), plus a
// user-owned key the reconcile must preserve byte-for-byte.
function v310Settings(brainDir) {
  const runNode = `/bin/sh "${brainDir}/scripts/run-node.sh"`;
  const entry = (script) => ({
    matcher: "",
    hooks: [{ type: "command", command: `${runNode} "${brainDir}/scripts/${script}"`, timeout: 20000 }],
  });
  return {
    mine: true,
    hooks: {
      PostToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: `${runNode} "${brainDir}/scripts/auto-commit.mjs"`, timeout: 30000 }] }],
      SessionStart: [entry("session-status.mjs")],
      Stop: [{ matcher: "", hooks: [{ type: "command", command: `${runNode} "${brainDir}/scripts/auto-push.mjs"`, timeout: 30000 }] }],
    },
  };
}

// Builds a fresh v3.1.0 brain on disk: stale manifest, pre-3.3 settings.json,
// .mcp.json = [vault-rag] only, a vault note, and NO skill / NO templates / NO spec.
function buildV310Brain() {
  const dir = mkdtempSync(join(tmpdir(), "sbg-restart-converge-"));
  writeFile(dir, "engine-manifest.json", JSON.stringify(v310Manifest(), null, 2) + "\n");
  writeFile(dir, ".claude/settings.json", JSON.stringify(v310Settings(dir), null, 2) + "\n");
  writeFile(dir, ".mcp.json", JSON.stringify({ mcpServers: { "vault-rag": { type: "stdio", command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: dir } } }, null, 2) + "\n");
  writeFile(dir, "vault/notes/some-user-note.md", "# A user note\nkept across the update.\n");
  // The skills a v3.1.0 brain ALREADY has on disk — so the stale manifest's declared
  // skills are all satisfied and the ONLY genuine gap is local-mirror (which the frozen
  // manifest doesn't even name). Without this the gate would fire on a phantom missing
  // `coach`, masking the real bug it must catch (a blind gate that misses local-mirror).
  writeFile(dir, ".claude/skills/coach/SKILL.md", "---\nname: coach\n---\nYour sparring partner.\n");
  return dir;
}

// Simulate pass-1 (the v3.1.0 orchestrator running against the fetched v3.3.0
// engine): copy every launcher file that the FETCHED target's `replace` +
// `regenerate` regimes own, via the real fs walk + glob dialect. It lays the engine
// FILES down but — exactly like the old code — installs NO merge skill, reconciles
// NO wiring, and REFRESHES the brain manifest NOT AT ALL. So after this:
//   • the hook template (in `replace`) IS on disk  → hooks can converge;
//   • the skill (in `merge`) + `.mcp.json.template` (in no regime) + the spec
//     (does not exist yet) are NOT on disk        → skill + MCP cannot converge.
function simulatePass1FromRealLauncher(brainDir) {
  const target = JSON.parse(readFileSync(join(LAUNCHER, "engine-manifest.json"), "utf8"));
  const copyGlobs = [...(target.regimes.replace ?? []), ...(target.regimes.regenerate ?? [])];
  for (const rel of listFilesRelPosix(LAUNCHER)) {
    if (!matchesAny(copyGlobs, rel)) continue;
    const dest = join(brainDir, rel.split("/").join(sep));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(join(LAUNCHER, rel.split("/").join(sep))));
  }
}

// No-op heavy I/O seams (no npm install / reindex / launcher regen in a unit test).
function seams() {
  const calls = { install: 0, reindex: 0 };
  return {
    calls,
    regenerateLaunchers: async () => {},
    runInstall: async () => { calls.install++; },
    runReindex: async () => { calls.reindex++; },
    countVaultNotes: async () => 1,
  };
}

// The restart's self-heal, in SELF-HEAL mode (sourceDir === brainDir), driven through
// the REAL reconcile CLI — the exact path session-self-heal's detached child takes,
// run synchronously here so the converged disk state is observable.
async function selfHealReconcile(brainDir) {
  await runReconcileCli({
    argv: ["--brainDir", brainDir, "--sourceDir", brainDir, "--platform", "posix"],
    seams: seams(),
  });
}

function readSettings(brainDir) {
  return JSON.parse(readFileSync(join(brainDir, ".claude/settings.json"), "utf8"));
}
function sessionStartScripts(settings) {
  return (settings.hooks?.SessionStart ?? []).flatMap((g) => (g.hooks ?? []).map((h) => h.command));
}

test(
  "F-B7 — ONE restart's self-heal converges the local-mirror skill + MCP + the new hooks from a REAL v3.1.0 pass-1 (no 2nd update), idempotent after",
  { todo: true },
  async (t) => {
    const brainDir = buildV310Brain();
    t.after(() => rmSync(brainDir, { recursive: true, force: true }));

    simulatePass1FromRealLauncher(brainDir);
    await selfHealReconcile(brainDir);

    // 1) The new SessionStart hooks are wired (this half ALREADY converges pre-fix —
    //    the template is a delivered `replace` file — and must keep converging).
    const settings = readSettings(brainDir);
    const cmds = sessionStartScripts(settings);
    for (const script of ["session-self-heal.mjs", "session-health.mjs", "session-obsidian-hint.mjs", "session-status.mjs"]) {
      assert.ok(cmds.some((c) => c.includes(`/scripts/${script}`)), `${script} must be wired after the restart`);
    }
    assert.equal(settings.mine, true, "the user-owned settings key must be preserved");

    // 2) The local-mirror MCP server is now registered, vault-rag preserved (RED pre-fix:
    //    no `.mcp.json.template` delivered + the frozen manifest never names local-mirror).
    const mcp = JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers["local-mirror"], "local-mirror MCP must be registered after the restart");
    assert.ok(mcp.mcpServers["vault-rag"], "the existing vault-rag server must be preserved");

    // 3) The local-mirror skill is on disk (RED pre-fix: the skill lives in `merge`,
    //    so pass-1 never delivered its source).
    assert.ok(existsSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md")), "the local-mirror skill must be on disk after the restart");

    // 4) The NEXT restart is a true no-op — convergence is reached in ONE pass.
    const settingsAfter = readFileSync(join(brainDir, ".claude/settings.json"), "utf8");
    const mcpAfter = readFileSync(join(brainDir, ".mcp.json"), "utf8");
    await selfHealReconcile(brainDir);
    assert.equal(readFileSync(join(brainDir, ".claude/settings.json"), "utf8"), settingsAfter, "settings.json must be byte-identical on the 2nd restart");
    assert.equal(readFileSync(join(brainDir, ".mcp.json"), "utf8"), mcpAfter, ".mcp.json must be byte-identical on the 2nd restart");
  },
);

// Reads the engine's DESIRED-STATE the way the fixed self-heal must (2d/2e): the
// DELIVERED `engine-spec.json` if present, else the frozen user manifest. Pre-fix the
// spec is never delivered → this falls back to the stale manifest → the gate sees no
// gap (the bug). Post-fix the spec carries local-mirror → the gate fires.
function readDesiredState(brainDir) {
  const specPath = join(brainDir, "engine-spec.json");
  const path = existsSync(specPath) ? specPath : join(brainDir, "engine-manifest.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

test(
  "F-B7/1c — terminal stuck state: the 4 hooks are ALREADY wired but local-mirror is still missing; the next restart STILL converges it (the gate must not rely on the hook gap alone)",
  { todo: true },
  async (t) => {
    const brainDir = buildV310Brain();
    t.after(() => rmSync(brainDir, { recursive: true, force: true }));

    // Reach the rig's exact stuck state: pass-1 done, then a PRIOR restart already
    // wired the hook quartet — but left local-mirror's skill + MCP unconverged and the
    // manifest frozen. The bootstrap hook-gap gate is now SATISFIED, so convergence can
    // only come from session-self-heal reading the engine's desired-state.
    simulatePass1FromRealLauncher(brainDir);
    const fourHooks = ["session-self-heal", "session-health", "session-obsidian-hint", "session-status"];
    const runNode = `/bin/sh "${brainDir}/scripts/run-node.sh"`;
    const stuck = v310Settings(brainDir);
    stuck.hooks.SessionStart = fourHooks.map((s) => ({
      matcher: "",
      hooks: [{ type: "command", command: `${runNode} "${brainDir}/scripts/${s}.mjs"`, timeout: 20000 }],
    }));
    writeFile(brainDir, ".claude/settings.json", JSON.stringify(stuck, null, 2) + "\n");
    assert.ok(!existsSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md")), "precondition: skill absent");
    assert.ok(!JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8")).mcpServers["local-mirror"], "precondition: MCP absent");

    // The real self-heal gate + heal: it must DETECT the skill/MCP gap (despite the
    // satisfied hook gap) and run the reconcile that converges it.
    let reconcilePromise = Promise.resolve();
    const res = await sessionSelfHeal({
      brainDir,
      readManifest: () => readDesiredState(brainDir),
      skillDirExists: (dir) => existsSync(join(brainDir, dir)),
      mcpServerRegistered: (id) => Boolean(JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8")).mcpServers?.[id]),
      spawnReconcile: ({ brainDir: dir }) => {
        reconcilePromise = selfHealReconcile(dir);
      },
      emit: () => {},
    });
    await reconcilePromise;

    assert.equal(res.healed, true, "self-heal must detect the skill/MCP gap even when the 4 hooks are already wired");
    assert.ok(existsSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md")), "the local-mirror skill must converge from the terminal stuck state");
    assert.ok(JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8")).mcpServers["local-mirror"], "the local-mirror MCP must converge from the terminal stuck state");
  },
);
