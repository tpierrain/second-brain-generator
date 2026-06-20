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
import { createHash } from "node:crypto";

// ═══════════════════════════════════════════════════════════════════════════
// reconcile-brain — the CONVERGE half of update-engine, extracted (ADR 0026).
//
// `reconcileBrain()` makes the brain's on-disk engine state MATCH a desired-state
// manifest (`target`) by copying engine files, install-if-absent engine skills,
// reconciling .mcp.json, regenerating launchers, running install + (conditional)
// reindex — WITHOUT ever touching the vault, .env, constitution, settings or any
// non-declared / custom skill (the write-allowlist safety core). It takes a
// `sourceDir` (the files to converge FROM) and the four I/O seams, so it runs
// offline and deterministically. It does NOT fetch and does NOT record the engine
// version — those are update-engine's fetch-result concerns (step 7).
//
// Network / npm / reindex / launcher-regeneration are SEAMS injected by the test.
// ═══════════════════════════════════════════════════════════════════════════

async function loadReconciler() {
  return (await import("./reconcile-brain.mjs")).reconcileBrain;
}

async function loadCli() {
  return (await import("./reconcile-brain.mjs")).runReconcileCli;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeFile(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

// The sacred files the reconciler must never touch (write-allowlist safety core).
const SACRED = {
  "CLAUDE.md": "# My personalized constitution\nI tailored this. Do not touch.\n",
  ".env": "GOOGLE_GEMINI_API_KEY=super-secret-do-not-leak\nEMBED_BATCH=4\n",
  ".claude/settings.json": '{\n  "mine": true\n}\n',
  ".claude/skills/zzz-mine/SKILL.md": "---\nname: zzz-mine\n---\nMy home-made skill.\n",
  "vault/my-note.md": "# Mollecuisse\nThe canary that must never be lost.\n",
};

function manifest({ ragVersion = "1.1.0", indexSchemaVersion = 1, extraMerge = [], engineMcpServers = ["vault-rag"] } = {}) {
  return {
    manifestVersion: 1,
    engineVersion: { rag: ragVersion, constitutionTemplate: "1.0.0", scripts: "1.0.0" },
    indexSchemaVersion,
    regimes: {
      replace: ["rag/src/**", "rag/package.json"],
      regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"],
      merge: [".claude/skills/zzz-mine/**", "scripts/update-engine.mjs", ...extraMerge],
    },
    engineMcpServers,
    source: { repo: "https://example.test/launcher.git", ref: "v1.1.0" },
    provenance: {},
  };
}

// A brain at vA: a real engine file + the user's sacred files (no manifest needed —
// the reconciler receives `target` and `local` as objects).
function buildBrain() {
  const dir = mkdtempSync(join(tmpdir(), "sbg-recon-brain-"));
  writeFile(dir, "rag/src/index.ts", "// engine vA\n");
  writeFile(dir, "rag/package.json", '{ "name": "rag", "engineTag": "vA" }\n');
  for (const [rel, content] of Object.entries(SACRED)) writeFile(dir, rel, content);
  return dir;
}

// A fetched source at vB carrying the new engine files (+ optionally a new skill).
function buildSource() {
  const dir = mkdtempSync(join(tmpdir(), "sbg-recon-source-"));
  writeFile(dir, "rag/src/index.ts", "// engine vB\n");
  writeFile(dir, "rag/package.json", '{ "name": "rag", "engineTag": "vB" }\n');
  return dir;
}

// Inject all four I/O seams; record their side effects. regenerateLaunchers writes
// the launcher files (mirrors the real builder) so existence can be asserted.
function seams() {
  const calls = { install: [], reindex: [], regenerate: [] };
  return {
    calls,
    regenerateLaunchers: async ({ brainDir, platform }) => {
      calls.regenerate.push(platform);
      for (const rel of ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"]) {
        writeFile(brainDir, rel, `# regenerated ${rel} (${platform})\n`);
      }
    },
    runInstall: async ({ ragDir }) => calls.install.push(ragDir),
    runReindex: async ({ brainDir }) => calls.reindex.push(brainDir),
    countVaultNotes: async () => 0,
  };
}

function assertSacredUntouched(brainDir, before) {
  for (const rel of Object.keys(SACRED)) {
    assert.equal(
      sha256(join(brainDir, rel)),
      before[rel],
      `SACRED file changed — ${rel} must be byte-identical after a reconcile`,
    );
  }
}

// ── Test 1: the converge core — copy engine files, install a missing engine skill,
//    regenerate launchers, and report what it did, leaving sacred files untouched.
test("reconcileBrain — copies engine files, installs a missing engine skill, regenerates launchers", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  // The source carries a NEW engine skill the brain lacks, declared engine-owned.
  const skillBody = "---\nname: local-mirror\n---\nMirror a Notion zone into the vault.\n";
  writeFile(sourceDir, ".claude/skills/local-mirror/SKILL.md", skillBody);
  const target = manifest({ extraMerge: [".claude/skills/local-mirror/**"] });
  const local = manifest({ ragVersion: "1.0.0" }); // same schema → no reindex
  const before = {};
  for (const rel of Object.keys(SACRED)) before[rel] = sha256(join(brainDir, rel));

  const { calls, ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  // Engine file swapped to vB.
  assert.equal(readFileSync(join(brainDir, "rag/src/index.ts"), "utf8"), "// engine vB\n");
  // Missing engine skill installed from the source, and named in the report.
  assert.equal(readFileSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md"), "utf8"), skillBody);
  assert.deepEqual(report.installedSkills, ["local-mirror"]);
  // Launchers regenerated once for this platform.
  assert.deepEqual(calls.regenerate, ["posix"]);
  assert.ok(existsSync(join(brainDir, "rag/launch.sh")));
  // npm install ran in the brain's rag/.
  assert.deepEqual(calls.install, [join(brainDir, "rag")]);
  // Same index schema → no reindex.
  assert.deepEqual(calls.reindex, []);
  assert.equal(report.reindexed, false);
  // Survival guarantee: not one sacred byte changed.
  assertSacredUntouched(brainDir, before);
});

// ── Test 2: IDEMPOTENCE — the property ADR 0026 hinges on (auto-finalize +
//    SessionStart self-heal run the reconciler repeatedly). A second reconcile over an
//    already-converged brain installs no skill, registers no MCP server, and leaves the
//    just-installed skill byte-identical → zero churn / no auto-commit noise.
test("reconcileBrain — a second run over a converged brain is a true no-op (zero churn)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  writeFile(sourceDir, ".claude/skills/local-mirror/SKILL.md", "---\nname: local-mirror\n---\nMirror.\n");
  // A brain .mcp.json with only vault-rag; the source template adds local-mirror.
  writeFile(brainDir, ".mcp.json", JSON.stringify({ mcpServers: { "vault-rag": { type: "stdio" } } }, null, 2));
  writeFile(
    sourceDir,
    ".mcp.json.template",
    JSON.stringify(
      {
        mcpServers: {
          "vault-rag": { type: "stdio", cwd: "{{PROJECT_ROOT}}" },
          "local-mirror": { type: "stdio", cwd: "{{PROJECT_ROOT}}" },
        },
      },
      null,
      2,
    ),
  );
  const target = manifest({
    extraMerge: [".claude/skills/local-mirror/**"],
    engineMcpServers: ["vault-rag", "local-mirror"],
  });
  const local = manifest({ ragVersion: "1.0.0" });
  const s1 = seams();
  const first = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s1 });
  // First run did the work: installed the skill + registered the server.
  assert.deepEqual(first.installedSkills, ["local-mirror"]);
  assert.deepEqual(first.mcpServersAdded, ["local-mirror"]);

  const skillHash = sha256(join(brainDir, ".claude/skills/local-mirror/SKILL.md"));
  const mcpHash = sha256(join(brainDir, ".mcp.json"));

  const s2 = seams();
  const second = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s2 });

  // Second run: nothing new installed or registered.
  assert.deepEqual(second.installedSkills, [], "an already-present engine skill is not reinstalled");
  assert.deepEqual(second.mcpServersAdded, [], "an already-registered MCP server is not re-added");
  // No churn: the skill file and .mcp.json are byte-identical to after the first run.
  assert.equal(sha256(join(brainDir, ".claude/skills/local-mirror/SKILL.md")), skillHash, "skill must not churn");
  assert.equal(sha256(join(brainDir, ".mcp.json")), mcpHash, ".mcp.json must not churn on a converged brain");
});

// ── Test 3: triangulate the reindex branch — when the index schema MOVES, the
//    reconciler runs the reindex seam and reports it (test 1 covered the unchanged case).
test("reconcileBrain — index schema moved → reindex runs and is reported", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  const target = manifest({ indexSchemaVersion: 2 }); // brain at schema 1 → moves to 2
  const local = manifest({ ragVersion: "1.0.0", indexSchemaVersion: 1 });

  const { calls, ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  assert.deepEqual(calls.reindex, [brainDir], "schema moved → reindex must run once in the brain");
  assert.equal(report.reindexed, true);
});

// ── Test 4: THE EXTENSIBILITY INVARIANT (the project's promise — users may grow
//    their harness). A user's CUSTOM (non-declared) skill, their own MCP server, and
//    any directory/file they added are NEVER perturbed by a reconcile — even when the
//    same reconcile installs a brand-new ENGINE skill + server. Run TWICE to also cover
//    the auto-finalize child (same code path): both extensions survive byte-identical
//    AND the engine still does its additive job. If a future change ever broke the
//    write-allowlist for user territory, this fails fail-first.
test("reconcileBrain — never disturbs a user's custom skill / MCP server / added files, even while installing engine ones", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  // The user has grown their harness: a private skill, a personal MCP server, and a
  // top-level folder of their own — none of it declared by the engine manifest.
  const myskill = "---\nname: my-private\n---\nMy own private skill — hands off.\n";
  writeFile(brainDir, ".claude/skills/my-private/SKILL.md", myskill);
  writeFile(brainDir, "my-research/2026-notes.md", "# my own folder\nNot an engine path.\n");
  writeFile(
    brainDir,
    ".mcp.json",
    JSON.stringify({ mcpServers: { "vault-rag": { type: "stdio" }, "my-tool": { type: "stdio", command: "node" } } }, null, 2),
  );

  // The fetched engine ships a NEW engine skill + declares both engine MCP servers.
  writeFile(sourceDir, ".claude/skills/local-mirror/SKILL.md", "---\nname: local-mirror\n---\nMirror.\n");
  writeFile(
    sourceDir,
    ".mcp.json.template",
    JSON.stringify(
      { mcpServers: { "vault-rag": { type: "stdio", cwd: "{{PROJECT_ROOT}}" }, "local-mirror": { type: "stdio", cwd: "{{PROJECT_ROOT}}" } } },
      null,
      2,
    ),
  );
  const target = manifest({
    extraMerge: [".claude/skills/local-mirror/**"],
    engineMcpServers: ["vault-rag", "local-mirror"],
  });
  const local = manifest({ ragVersion: "1.0.0" });

  const myskillHash = sha256(join(brainDir, ".claude/skills/my-private/SKILL.md"));
  const myfolderHash = sha256(join(brainDir, "my-research/2026-notes.md"));

  // Run the reconciler TWICE (parent + auto-finalize child are the same code path).
  let installed;
  for (const pass of [1, 2]) {
    const { ...s } = seams();
    const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });
    if (pass === 1) installed = report;
  }

  // The engine DID its additive job (pass 1 installed the new engine skill + server)…
  assert.deepEqual(installed.installedSkills, ["local-mirror"], "the engine skill is still installed");
  assert.deepEqual(installed.mcpServersAdded, ["local-mirror"], "the engine MCP server is still registered");
  assert.ok(existsSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md")));

  // …WITHOUT ever perturbing the user's territory, across both passes.
  assert.equal(sha256(join(brainDir, ".claude/skills/my-private/SKILL.md")), myskillHash, "a custom skill must stay byte-identical");
  assert.equal(sha256(join(brainDir, "my-research/2026-notes.md")), myfolderHash, "a user-added folder must be untouched");
  const mcp = JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8"));
  assert.ok(mcp.mcpServers["my-tool"], "a user-added MCP server must be preserved");
  assert.equal(mcp.mcpServers["my-tool"].command, "node", "the user's MCP server definition must be intact");
});

// ── Test 5: the CLI entry the auto-finalize child process runs (ADR 0026). It parses
//    --brainDir/--sourceDir, loads the brain's OWN (just-updated) manifest as both
//    target and local (so it converges from the fetched source with no reindex), and
//    reconciles with the real seams. Here the seams are stubbed; we assert it installed
//    the missing engine skill the brain manifest declares.
test("runReconcileCli — parses flags, loads the brain manifest, and converges from the source", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  // The source carries a new engine skill; the brain's manifest declares it engine-owned.
  writeFile(sourceDir, ".claude/skills/local-mirror/SKILL.md", "---\nname: local-mirror\n---\nMirror.\n");
  writeFile(brainDir, "engine-manifest.json", JSON.stringify(manifest({ extraMerge: [".claude/skills/local-mirror/**"] }), null, 2));

  const { calls, ...s } = seams();
  const runReconcileCli = await loadCli();
  const report = await runReconcileCli({
    argv: ["--brainDir", brainDir, "--sourceDir", sourceDir, "--platform", "posix"],
    seams: s,
  });

  assert.equal(existsSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md")), true, "the child installs the missing engine skill");
  assert.deepEqual(report.installedSkills, ["local-mirror"]);
  // target = local = the brain's own manifest → schema unchanged → no reindex in the child.
  assert.deepEqual(calls.reindex, [], "the auto-finalize child must not reindex (it converges, it does not migrate)");
});

// Tiny indirection so the helpers above read cleanly; resolves the lazily-loaded export.
async function reconcile(args) {
  const reconcileBrain = await loadReconciler();
  return reconcileBrain(args);
}
