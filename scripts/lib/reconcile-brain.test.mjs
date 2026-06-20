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

// Tiny indirection so the helpers above read cleanly; resolves the lazily-loaded export.
async function reconcile(args) {
  const reconcileBrain = await loadReconciler();
  return reconcileBrain(args);
}
