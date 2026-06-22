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
// reconcile-brain — the RECONCILE half of update-engine, extracted (ADR 0026).
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
  const calls = { install: [], reindex: [], reindexMode: [], regenerate: [] };
  return {
    calls,
    regenerateLaunchers: async ({ brainDir, platform }) => {
      calls.regenerate.push(platform);
      for (const rel of ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"]) {
        writeFile(brainDir, rel, `# regenerated ${rel} (${platform})\n`);
      }
    },
    runInstall: async ({ ragDir }) => calls.install.push(ragDir),
    runReindex: async ({ brainDir, mode = "full" }) => {
      calls.reindex.push(brainDir);
      calls.reindexMode.push(mode);
    },
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
  // The source carries a NEW engine MERGE skill the brain lacks, declared engine-owned
  // (the merge install-if-absent mechanism, illustrated by `coach` now that local-mirror
  // relocated to the staged `engine-skills/` path — F-B7 2b).
  const skillBody = "---\nname: coach\n---\nYour sparring partner.\n";
  writeFile(sourceDir, ".claude/skills/coach/SKILL.md", skillBody);
  const target = manifest({ extraMerge: [".claude/skills/coach/**"] });
  const local = manifest({ ragVersion: "1.0.0" }); // same schema → no reindex
  const before = {};
  for (const rel of Object.keys(SACRED)) before[rel] = sha256(join(brainDir, rel));

  const { calls, ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  // Engine file swapped to vB.
  assert.equal(readFileSync(join(brainDir, "rag/src/index.ts"), "utf8"), "// engine vB\n");
  // Missing engine skill installed from the source, and named in the report.
  assert.equal(readFileSync(join(brainDir, ".claude/skills/coach/SKILL.md"), "utf8"), skillBody);
  assert.deepEqual(report.installedSkills, ["coach"]);
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
  writeFile(sourceDir, ".claude/skills/coach/SKILL.md", "---\nname: coach\n---\nYour sparring partner.\n");
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
    extraMerge: [".claude/skills/coach/**"],
    engineMcpServers: ["vault-rag", "local-mirror"],
  });
  const local = manifest({ ragVersion: "1.0.0" });
  const s1 = seams();
  const first = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s1 });
  // First run did the work: installed the skill + registered the server.
  assert.deepEqual(first.installedSkills, ["coach"]);
  assert.deepEqual(first.mcpServersAdded, ["local-mirror"]);

  const skillHash = sha256(join(brainDir, ".claude/skills/coach/SKILL.md"));
  const mcpHash = sha256(join(brainDir, ".mcp.json"));

  const s2 = seams();
  const second = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s2 });

  // Second run: nothing new installed or registered.
  assert.deepEqual(second.installedSkills, [], "an already-present engine skill is not reinstalled");
  assert.deepEqual(second.mcpServersAdded, [], "an already-registered MCP server is not re-added");
  // No churn: the skill file and .mcp.json are byte-identical to after the first run.
  assert.equal(sha256(join(brainDir, ".claude/skills/coach/SKILL.md")), skillHash, "skill must not churn");
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
  assert.deepEqual(calls.reindexMode, ["full"], "a schema move re-encodes every note → FULL reindex");
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
  writeFile(sourceDir, ".claude/skills/coach/SKILL.md", "---\nname: coach\n---\nYour sparring partner.\n");
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
    extraMerge: [".claude/skills/coach/**"],
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
  assert.deepEqual(installed.installedSkills, ["coach"], "the engine skill is still installed");
  assert.deepEqual(installed.mcpServersAdded, ["local-mirror"], "the engine MCP server is still registered");
  assert.ok(existsSync(join(brainDir, ".claude/skills/coach/SKILL.md")));

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
  writeFile(sourceDir, ".claude/skills/coach/SKILL.md", "---\nname: coach\n---\nYour sparring partner.\n");
  writeFile(brainDir, "engine-manifest.json", JSON.stringify(manifest({ extraMerge: [".claude/skills/coach/**"] }), null, 2));

  const { calls, ...s } = seams();
  const runReconcileCli = await loadCli();
  const report = await runReconcileCli({
    argv: ["--brainDir", brainDir, "--sourceDir", sourceDir, "--platform", "posix"],
    seams: s,
  });

  assert.equal(existsSync(join(brainDir, ".claude/skills/coach/SKILL.md")), true, "the child installs the missing engine skill");
  assert.deepEqual(report.installedSkills, ["coach"]);
  // target = local = the brain's own manifest → schema unchanged → no reindex in the child.
  assert.deepEqual(calls.reindex, [], "the auto-finalize child must not reindex (it converges, it does not migrate)");
});

// ── Test 6: SessionStart self-heal mode — sourceDir === brainDir (ADR 0026, Layer B).
//    The brain converges from its OWN on-disk code (no fetch, no network). The reconciler
//    must NEVER copy an engine file onto itself: on Linux `copyFileSync(f, f)` truncates
//    the destination before copying (a real cross-platform footgun, ADR 0015) → it would
//    zero the engine. The self-copy guard makes this a TRUE no-op: nothing is reported as
//    copied and the present engine file stays byte-identical. (Deterministic, OS-independent:
//    asserts the guard via `report.copied`, not via the platform's self-copy behaviour.)
test("reconcileBrain — self-heal mode (sourceDir === brainDir) copies nothing onto itself, engine files preserved", async (t) => {
  const brainDir = buildBrain();
  t.after(() => rmSync(brainDir, { recursive: true, force: true }));
  const engineHash = sha256(join(brainDir, "rag/src/index.ts"));
  const target = manifest({ ragVersion: "1.0.0" });
  const local = manifest({ ragVersion: "1.0.0" }); // same schema → no reindex

  const { ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir: brainDir, target, local, ...s });

  assert.deepEqual(report.copied, [], "no engine file may be copied onto itself (Linux would truncate it)");
  assert.equal(sha256(join(brainDir, "rag/src/index.ts")), engineHash, "the present engine file must stay byte-identical");
});

// The single, nominative vault carve-out (ADR 0026 amended): the ONLY vault path the
// reconciler may ever write — write-if-absent — seeded from the NON-sacred staged copy
// the engine DELIVERS (F-B7b), so it converges in BOTH update and self-heal modes.
const HEALTH_NOTE = "vault/engine-health/health-check.md";
const STAGED_HEALTH_NOTE = "engine-health/health-check.md";

// ── Test 7: UPGRADERS get the canary (ADR 0026, decision B). At a REAL update
//    (sourceDir !== brainDir), if the engine-owned health-check note is absent from the
//    brain, the reconciler SEEDS it from the source (write-if-absent) and runs a paired
//    incremental reindex — even though the index schema did NOT move — so the freshly
//    seeded note is findable (no false `broken`). Without this, an upgrader's vault never
//    receives the dedicated note (vault is sacred + v3.3.0 forces no reindex).
test("reconcileBrain — seeds the engine-health note on an upgrader (absent) and reindexes it", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  const noteBody = "---\ntitle: Engine health check\n---\nQuibblethorne canary — engine-owned.\n";
  writeFile(sourceDir, STAGED_HEALTH_NOTE, noteBody);
  // Same index schema → needsReindex is false; any reindex here is the seed's pairing.
  const target = manifest();
  const local = manifest({ ragVersion: "1.0.0" });

  const { calls, ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  // The note now lives in the brain, byte-identical to the source.
  assert.equal(readFileSync(join(brainDir, HEALTH_NOTE), "utf8"), noteBody, "the health-check note must be seeded");
  // The paired incremental reindex ran so the note is findable — no false `broken`.
  assert.deepEqual(calls.reindex, [brainDir], "seeding the note must trigger a paired reindex");
  assert.deepEqual(calls.reindexMode, ["incremental"], "the seed pairing is INCREMENTAL (only the one note), never a full re-encode");
  assert.equal(report.reindexed, true);
});

// ── Test 8: WRITE-IF-ABSENT + the index is its own membership oracle (ADR 0026,
//    decision B + finding #6). Once the health-check note is present, a later update-time
//    reconcile must NEVER re-write it (write-if-absent, a user may have edited it). It DOES
//    re-pair a cheap INCREMENTAL reindex though: keying the index pass off the note's
//    on-disk PRESENCE (not a one-shot "just copied" flag) is what makes a seeded-but-
//    unindexed note — left by a prior update that crashed before indexing — self-heal on
//    the next run, with no durable false `broken`. The incremental pass skips every
//    already-indexed note via its content-hash cache, so this is a fast no-op, never a
//    full re-encode of the user's notes.
test("reconcileBrain — never re-writes an existing health note, but re-pairs a cheap incremental reindex", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  writeFile(sourceDir, STAGED_HEALTH_NOTE, "---\ntitle: src\n---\nQuibblethorne (source copy).\n");
  // The brain already carries its OWN health note (a user could even have edited it).
  writeFile(brainDir, HEALTH_NOTE, "---\ntitle: mine\n---\nQuibblethorne (brain copy, kept).\n");
  const target = manifest();
  const local = manifest({ ragVersion: "1.0.0" }); // same schema → only the incremental health pairing
  const noteHash = sha256(join(brainDir, HEALTH_NOTE));

  const { calls, ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  assert.equal(sha256(join(brainDir, HEALTH_NOTE)), noteHash, "an existing health note must never be overwritten");
  assert.deepEqual(calls.reindexMode, ["incremental"], "an upgrader's present health note re-pairs a CHEAP incremental pass, never a full re-encode");
  assert.equal(report.reindexed, true);
});

// ── Test 9: the carve-out is SCOPED to a single path (ADR 0026, decision B safety
//    invariant: "one path only"). Even when the source's vault carries other notes, the
//    reconciler seeds ONLY vault/engine-health/health-check.md — never any user note.
test("reconcileBrain — seeds ONLY the engine-health path, never another vault note", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  writeFile(sourceDir, STAGED_HEALTH_NOTE, "---\ntitle: health\n---\nQuibblethorne.\n");
  // A decoy "user" note sitting in the source vault — must NOT be copied into the brain.
  writeFile(sourceDir, "vault/some-demo-note.md", "# A note that is NOT the engine canary\n");
  const target = manifest();
  const local = manifest({ ragVersion: "1.0.0" });

  const { ...s } = seams();
  await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  assert.ok(existsSync(join(brainDir, HEALTH_NOTE)), "the engine-health note is seeded");
  assert.equal(
    existsSync(join(brainDir, "vault/some-demo-note.md")),
    false,
    "no other vault note may be seeded — the carve-out is one path only",
  );
});

// ── Test 10: self-heal mode (sourceDir === brainDir) SEEDS from the brain's OWN staged
//    copy (F-B7b). The pre-3.3.0 upgrader's old in-process update never seeds the note and
//    has no auto-finalize → convergence falls to the restart's self-heal, which runs with
//    sourceDir === brainDir. Because the note's source ships at the NON-sacred staged path
//    `engine-health/health-check.md` (delivered onto the brain's disk), self-heal CAN seed
//    the vault note (src `engine-health/…` ≠ dest `vault/engine-health/…`, no self-copy),
//    pairing a cheap incremental reindex so the canary is findable.
test("reconcileBrain — self-heal mode seeds the vault note from the brain's own staged copy (F-B7b)", async (t) => {
  const brainDir = buildBrain();
  t.after(() => rmSync(brainDir, { recursive: true, force: true }));
  // The update delivered the staged note onto the brain's disk (non-sacred `replace`); the
  // restart's self-heal (sourceDir === brainDir) must STILL seed the vault from it.
  const noteBody = "---\ntitle: Engine health check\n---\nQuibblethorne canary.\n";
  writeFile(brainDir, STAGED_HEALTH_NOTE, noteBody);
  const target = manifest({ ragVersion: "1.0.0" });
  const local = manifest({ ragVersion: "1.0.0" });

  const { calls, ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir: brainDir, target, local, ...s });

  assert.equal(readFileSync(join(brainDir, HEALTH_NOTE), "utf8"), noteBody, "self-heal must seed the vault note from the brain's own staged copy");
  assert.deepEqual(calls.reindexMode, ["incremental"], "the self-heal seed pairs a cheap incremental reindex");
  assert.equal(report.reindexed, true);
});

// ── Test 10b: self-heal with NOTHING staged seeds nothing (safety). A brain with no staged
//    note and no vault note stays untouched — no phantom note, no needless reindex.
test("reconcileBrain — self-heal with no staged note seeds nothing, no reindex", async (t) => {
  const brainDir = buildBrain();
  t.after(() => rmSync(brainDir, { recursive: true, force: true }));
  const target = manifest({ ragVersion: "1.0.0" });
  const local = manifest({ ragVersion: "1.0.0" });

  const { calls, ...s } = seams();
  await reconcile({ brainDir, platform: "posix", sourceDir: brainDir, target, local, ...s });

  assert.equal(existsSync(join(brainDir, HEALTH_NOTE)), false, "nothing staged → nothing seeded");
  assert.deepEqual(calls.reindex, [], "nothing seeded → no reindex");
});

// ── Test 11: finding #6 — a seeded-but-unindexed note can NEVER become a permanent
//    false `broken`. The seed (2.quater) precedes runInstall/runReindex; if either throws
//    AFTER the note was copied (a flaky npm install in the fresh update process, an ABI
//    hiccup), the note is on disk but was never indexed. The reconciler must key its index
//    pass off the note's ON-DISK PRESENCE so a RETRY re-pairs the (incremental) reindex and
//    the canary becomes findable — not off a one-shot "did I just copy it" flag that the
//    retry can never re-arm. RED before the fix: run 2 sees the note present, does NOT
//    reindex, and the canary stays invisible forever.
test("reconcileBrain — a note seeded by an update that then crashed pre-index is reindexed on the retry (#6)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  writeFile(sourceDir, STAGED_HEALTH_NOTE, "---\ntitle: health\n---\nQuibblethorne — engine-owned.\n");
  const target = manifest();
  const local = manifest({ ragVersion: "1.0.0" }); // same schema → no schema-driven reindex

  // Run 1: the note is seeded, then the fresh process's npm install throws → the whole
  // reconcile rejects AFTER the note already landed on disk (the partial-failure window).
  const s1 = seams();
  s1.runInstall = async () => {
    throw new Error("npm install failed in the fresh update process (flaky network)");
  };
  await assert.rejects(
    reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s1 }),
    /npm install failed/,
    "run 1 must surface the install failure (fail-loud in the reconciler)",
  );
  assert.ok(existsSync(join(brainDir, HEALTH_NOTE)), "the note was seeded before the crash — it is on disk, unindexed");
  assert.deepEqual(s1.calls.reindex, [], "run 1 crashed before the reindex → the note is NOT indexed yet");

  // Run 2 (the user re-runs update-engine as instructed): the note is present-but-unindexed.
  // The reconciler must STILL reindex it (incremental) so it becomes findable.
  const s2 = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s2 });

  assert.deepEqual(s2.calls.reindex, [brainDir], "the retry must reindex the present-but-unindexed note");
  assert.deepEqual(s2.calls.reindexMode, ["incremental"], "the retry's pairing is incremental (only the one note)");
  assert.equal(report.reindexed, true, "the canary can never stay a permanent false `broken`");
});

// The engine's SessionStart quartet, as it lives in settings.json.template (placeholders intact).
function templateSessionStart() {
  return {
    hooks: {
      PostToolUse: [
        { matcher: "Write|Edit", hooks: [{ type: "command", command: '{{NODE}} "{{PROJECT_ROOT}}/scripts/auto-commit.mjs"', timeout: 30000 }] },
      ],
      SessionStart: ["session-self-heal", "session-health", "session-obsidian-hint", "session-status"].map((s) => ({
        matcher: "",
        hooks: [{ type: "command", command: `{{NODE}} "{{PROJECT_ROOT}}/scripts/${s}.mjs"`, timeout: 20000 }],
      })),
    },
  };
}

// A v3.1.0-origin brain settings.json: SessionStart wires session-status ONLY (the 3
// runtime hooks added after v3.1.0 are missing), with concrete already-substituted paths.
function v310Settings(brainDir) {
  return {
    mine: true, // a user-owned key the reconcile must preserve
    hooks: {
      PostToolUse: [
        { matcher: "Write|Edit", hooks: [{ type: "command", command: `/usr/local/bin/node "${brainDir}/scripts/auto-commit.mjs"`, timeout: 30000 }] },
      ],
      SessionStart: [
        { matcher: "", hooks: [{ type: "command", command: `/usr/local/bin/node "${brainDir}/scripts/session-status.mjs"`, timeout: 20000 }] },
      ],
    },
  };
}

// ── Test 12: F-B2 — the engine-owned SessionStart hooks must reach UPGRADERS.
//    settings.json is SACRED to the write-allowlist, but the reconciler additively merges
//    engine-owned hook entries from settings.json.template (the THIRD additive surface,
//    twin of the .mcp.json reconcile). A v3.1.0 brain wired session-status only → after a
//    real update it gains session-self-heal / session-health / session-obsidian-hint, with
//    the brain's OWN node interpreter + dir substituted, the user's `mine` key and existing
//    hook entries untouched, and `hooksAdded` reported.
test("reconcileBrain — wires the missing engine SessionStart hooks into settings.json (F-B2)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  writeFile(brainDir, ".claude/settings.json", JSON.stringify(v310Settings(brainDir), null, 2) + "\n");
  writeFile(sourceDir, ".claude/settings.json.template", JSON.stringify(templateSessionStart(), null, 2) + "\n");
  const target = manifest();
  const local = manifest({ ragVersion: "1.0.0" });

  const { ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  assert.deepEqual(
    report.hooksAdded.sort(),
    ["scripts/session-health.mjs", "scripts/session-obsidian-hint.mjs", "scripts/session-self-heal.mjs"],
    "the 3 runtime hooks missing on a v3.1.0 brain must be reported as wired",
  );
  const settings = JSON.parse(readFileSync(join(brainDir, ".claude/settings.json"), "utf8"));
  const cmds = settings.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
  // Appended hooks substitute {{PROJECT_ROOT}}, which the engine emits POSIX-normalised
  // (cf. reconcile-brain.mjs / installer toPosix). On Windows brainDir has backslashes, so
  // the expectation must normalise too — a no-op on POSIX, the real contract on win32.
  const root = brainDir.split("\\").join("/");
  assert.ok(cmds.includes(`/usr/local/bin/node "${root}/scripts/session-self-heal.mjs"`), "self-heal wired with the brain's node + dir");
  assert.ok(cmds.includes(`/usr/local/bin/node "${root}/scripts/session-health.mjs"`), "session-health wired");
  assert.ok(cmds.includes(`/usr/local/bin/node "${root}/scripts/session-obsidian-hint.mjs"`), "session-obsidian-hint wired");
  assert.equal(settings.mine, true, "a user-owned settings key must be preserved");
  assert.equal(settings.hooks.SessionStart[0].hooks[0].command, `/usr/local/bin/node "${brainDir}/scripts/session-status.mjs"`, "the existing session-status entry stays first, untouched");
});

// ── Test 13: idempotence + A2 invariant — a SECOND reconcile over a converged brain wires
//    nothing AND leaves settings.json byte-identical (no auto-commit churn). settings.json is
//    written ONLY when a hook is actually added.
test("reconcileBrain — a converged brain's settings.json is left byte-identical (no hook churn)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  writeFile(brainDir, ".claude/settings.json", JSON.stringify(v310Settings(brainDir), null, 2) + "\n");
  writeFile(sourceDir, ".claude/settings.json.template", JSON.stringify(templateSessionStart(), null, 2) + "\n");
  const target = manifest();
  const local = manifest({ ragVersion: "1.0.0" });

  const s1 = seams();
  const first = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s1 });
  assert.equal(first.hooksAdded.length, 3, "first run wires the 3 missing hooks");
  const settingsHash = sha256(join(brainDir, ".claude/settings.json"));

  const s2 = seams();
  const second = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s2 });
  assert.deepEqual(second.hooksAdded, [], "a converged brain wires nothing");
  assert.equal(sha256(join(brainDir, ".claude/settings.json")), settingsHash, "settings.json must be byte-identical on the 2nd run (no churn)");
});

// ── Test 14: F-B7 2d — STAGED skills converge on upgraders. A new upgrader-bound
//    skill ships at the NON-sacred `engine-skills/<name>/` path (the sacred scrub forbids
//    delivering under `.claude/skills/`). reconcileBrain install-if-absent's it into
//    `.claude/skills/<name>/` ALONGSIDE the merge-skill install, and folds it into
//    `installedSkills`. This is how local-mirror reaches a pre-3.3.0 brain at restart.
test("reconcileBrain — installs a STAGED engine-skills/ skill the brain is missing (F-B7 2d)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  const skillBody = "---\nname: local-mirror\n---\nMirror a Notion zone into the vault.\n";
  writeFile(sourceDir, "engine-skills/local-mirror/SKILL.md", skillBody);
  const target = manifest(); // local-mirror is NOT a merge skill — it is staged
  const local = manifest({ ragVersion: "1.0.0" });

  const { ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  assert.equal(readFileSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md"), "utf8"), skillBody, "the staged skill lands under .claude/skills/");
  assert.ok(report.installedSkills.includes("local-mirror"), "a staged skill is reported in installedSkills");
});

// ── Test 15: F-B7 2e — the engine MCP servers to register are derived from the keys of
//    the DELIVERED `.mcp.json.template`, NOT the frozen `manifest.engineMcpServers` (which
//    update-engine never refreshes — the root cause). Here the manifest is STALE (only
//    vault-rag) but the delivered template carries local-mirror → it must STILL register.
test("reconcileBrain — registers MCP servers from the DELIVERED template keys, not the frozen manifest (F-B7 2e)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource();
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  writeFile(brainDir, ".mcp.json", JSON.stringify({ mcpServers: { "vault-rag": { type: "stdio" } } }, null, 2));
  writeFile(
    sourceDir,
    ".mcp.json.template",
    JSON.stringify(
      { mcpServers: { "vault-rag": { type: "stdio", cwd: "{{PROJECT_ROOT}}" }, "local-mirror": { type: "stdio", cwd: "{{PROJECT_ROOT}}" } } },
      null,
      2,
    ),
  );
  // The manifest is FROZEN at v3.1.0: it names ONLY vault-rag. The delivered template is
  // the source of truth → local-mirror must register despite the stale manifest.
  const target = manifest({ engineMcpServers: ["vault-rag"] });
  const local = manifest({ ragVersion: "1.0.0" });

  const { ...s } = seams();
  const report = await reconcile({ brainDir, platform: "posix", sourceDir, target, local, ...s });

  assert.deepEqual(report.mcpServersAdded, ["local-mirror"], "the template's local-mirror server registers even though the manifest is stale");
  const mcp = JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8"));
  assert.ok(mcp.mcpServers["local-mirror"], "local-mirror is now in .mcp.json");
  assert.ok(mcp.mcpServers["vault-rag"], "vault-rag is preserved");
});

// Tiny indirection so the helpers above read cleanly; resolves the lazily-loaded export.
async function reconcile(args) {
  const reconcileBrain = await loadReconciler();
  return reconcileBrain(args);
}
