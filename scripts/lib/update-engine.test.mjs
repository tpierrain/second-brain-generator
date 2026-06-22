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
// THE GATE — outside-in acceptance / SURVIVAL test for `update-engine` (Phase 1).
//
// One coarse-grained test that drives the whole feature from the outside: a brain
// pinned at engine vA, a launcher source at vB > vA → `updateEngine()` must swap in
// the new engine (rag/src, the .sh+.cmd launchers, the engine-owned scripts incl.
// itself), run `npm install`, reindex IFF the index schema moved, and leave the
// user's notes / `.env` / `CLAUDE.md` / `.claude/settings.json` / custom skills
// BYTE-IDENTICAL (ADR 0003 / 0012 / 0014).
//
// GREEN since Step 4: `scripts/update-engine.mjs` (the apply core) now exists, so these
// guards ENFORCE (the `{ todo }` flags were dropped). The core is loaded lazily per
// test so a regression that removes it fails THIS file fail-first, not the whole load.
//
// Network / npm / reindex / launcher-regeneration are SEAMS injected by the test
// (no real git, npm or ONNX) so the gate is deterministic and offline. The launchers
// are REGENERATED (ADR 0015 "launcher-regeneration"), not copied from the clone: they
// are pure, machine-independent `rag-launcher.mjs` builder output and aren't even
// git-tracked, so a `git clone` would not carry them. The gate therefore injects a
// `regenerateLaunchers` seam (like `runInstall`/`runReindex`) and asserts it ran once
// for the platform, with BOTH `.sh` AND `.cmd` halves present. Cross-platform
// (ADR 0015): the scenario is run under BOTH a posix and a win32 `platform`.
// ═══════════════════════════════════════════════════════════════════════════

async function loadCore() {
  // Lazy so a missing core fails THIS guard (fail-first), not the whole file load.
  return (await import("../update-engine.mjs")).updateEngine;
}

// ── formatReport: the human summary the brain-side skill prints (Step 6) ──────
// Pure (report object → string) so the wording is unit-tested; the CLI entry holds
// only the untestable I/O wiring (ADR 0009).
import { formatReport, defaultCountVaultNotes } from "../update-engine.mjs";

// F2: the default count must match what the indexer actually treats as a note —
// the document-scanner excludes `_template.md`, `.gitkeep` and the `.obsidian/`
// dir, so the recap number doesn't overstate what's searchable.
test("defaultCountVaultNotes — counts vault .md but skips scanner-excluded files", async () => {
  const brainDir = mkdtempSync(join(tmpdir(), "sbg-count-"));
  writeFile(brainDir, "vault/topics/a.md", "# A\n");
  writeFile(brainDir, "vault/people/b.md", "# B\n");
  writeFile(brainDir, "vault/_template.md", "# tpl\n"); // scanner-excluded
  writeFile(brainDir, "vault/.gitkeep", ""); // scanner-excluded (and not .md)
  writeFile(brainDir, "vault/.obsidian/workspace.md", "# obsidian\n"); // excluded dir
  writeFile(brainDir, "vault/notes.txt", "not markdown");

  const n = await defaultCountVaultNotes({ brainDir });

  assert.equal(n, 2);
});

test("defaultCountVaultNotes — a brain with no vault returns 0", async () => {
  const brainDir = mkdtempSync(join(tmpdir(), "sbg-count-empty-"));
  assert.equal(await defaultCountVaultNotes({ brainDir }), 0);
});

test("formatReport — schema moved → reports the new version, the swap, and that a reindex ran", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts", "rag/package.json", "scripts/auto-commit.mjs"],
    regenerated: true,
    reindexed: true,
  });
  assert.match(out, /v1\.1\.0/);
  assert.match(out, /1\.1\.0/); // rag version
  assert.match(out, /3/); // file count
  assert.match(out, /reindex/i);
  // The survival promise is restated to the user.
  assert.match(out, /untouched|notes|\.env/i);
});

test("formatReport — schema unchanged → states no reindex was needed (never a misleading 'reindexed')", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: true,
    reindexed: false,
  });
  assert.match(out, /no reindex|unchanged/i);
  assert.doesNotMatch(out, /reindexed —/);
});

// ADR 0026 (decision B): on an upgrader the schema does NOT move, but seeding the
// engine-health note triggers an INCREMENTAL reindex of that one note. The report must
// be honest — never claim "the index format changed" (it didn't) — and say only the
// health-check note was added/indexed, the user's other notes were not re-encoded.
test("formatReport — health-note seed reindex → honest incremental message, not 'index format changed'", () => {
  const out = formatReport({
    ref: "v3.3.0",
    engineVersion: { rag: "1.1.4" },
    copied: ["rag/src/index.ts"],
    regenerated: true,
    reindexed: true,
    reindexReason: "health-note-seed",
  });
  assert.doesNotMatch(out, /format changed/i, "must not claim the index format changed on a seed-only reindex");
  assert.match(out, /health[- ]check note|incremental/i, "names the incremental health-check seed");
});

// Finding A (ADR 0025 fix QA): an upgrader must SEE that the update delivered the
// flagship engine skill + registered its MCP server — that is the whole point of
// v3.2.1. Silent delivery leaves the user unaware they finally have the feature.
test("formatReport — names the engine skill(s) it installed and the MCP server(s) it registered", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: false,
    installedSkills: ["local-mirror"],
    mcpServersAdded: ["local-mirror"],
  });
  assert.match(out, /local-mirror/);
  assert.match(out, /skill/i);
  assert.match(out, /server|mcp/i);
});

// F-B2 (ADR 0026): an upgrade that wired the v3.3.0 runtime hooks into settings.json must
// NAME them (the user finally has self-heal / health / obsidian-hint) AND fold them into the
// "restart needed" count — a newly-wired SessionStart hook is on disk but loads only at the
// next session start, exactly like a new skill/MCP.
test("formatReport — names the runtime hook(s) it wired and counts them as needing a restart", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: false,
    installedSkills: [],
    mcpServersAdded: [],
    hooksAdded: ["scripts/session-self-heal.mjs", "scripts/session-health.mjs", "scripts/session-obsidian-hint.mjs"],
  });
  assert.match(out, /session-self-heal/);
  assert.match(out, /hook/i, "the wired hooks must be named as such");
  assert.match(out, /\b3\b/, "3 wired hooks count as 3 capabilities needing a restart");
  assert.match(out, /action needed/i);
  assert.match(out, /restart/i);
});

// F1.6 (ADR 0026, point 4): a freshly-installed skill/MCP is on disk but NOT live in
// the CURRENT conversation (Layer B config-freeze). The report must LOUDLY say so and
// tell the user to restart — instead of today's silence that reads as "already usable".
test("formatReport — when capabilities are installed, loudly says they aren't active in THIS conversation yet and to restart", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: false,
    installedSkills: ["local-mirror"],
    mcpServersAdded: ["local-mirror"],
  });
  assert.match(out, /not (yet )?active|aren't active/i);
  assert.match(out, /this conversation/i);
  assert.match(out, /restart/i);
  // Strong framing (Thomas): not a polite "to load them" — make the consequence of
  // NOT restarting explicit, so the user actually does it.
  assert.match(out, /action needed/i);
  assert.match(out, /can(?:no|')?t use|won't work/i);
});

// F4: the field finding — a full app restart, then RESUMING this same conversation,
// is enough to pick up a freshly-installed skill+MCP. A brand-new conversation is NOT
// required for that (that's the distinct initial-rooting rule, for a never-rooted
// session). The notice must say "restart and come back here", not muddy it by offering
// "or start a new conversation" as if one were needed just to load new capabilities.
test("formatReport — the activation notice says a restart + resuming THIS conversation is enough, not a brand-new one", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: false,
    installedSkills: ["local-mirror"],
    mcpServersAdded: ["local-mirror"],
  });
  // Restart, then come back to THIS conversation (resume) — the lighter sufficient action.
  assert.match(out, /reopen/i);
  assert.match(out, /come back here|this (same )?conversation/i);
  // Do NOT present a brand-new conversation as required for picking up capabilities.
  assert.doesNotMatch(out, /new conversation/i);
});

// F1.6: the "counter" the user reads = how many new capabilities they just gained
// (skills + MCP servers), plus the "run once more" residual-bootstrap fallback for
// the rare case a follow-up pass is still needed.
test("formatReport — counts the new capabilities and offers the 'run once more' fallback", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: false,
    installedSkills: ["local-mirror"],
    mcpServersAdded: ["local-mirror"],
  });
  assert.match(out, /\b2\b/); // 1 skill + 1 MCP server = 2 new capabilities
  assert.match(out, /once more/i);
  assert.match(out, /update-engine/);
});

// F-B7d (ship-blocker A1): a steady-state update that swapped engine CODE — but added
// no brand-new skill/MCP/hook — STILL needs a restart: the running MCP server / hooks /
// constitution this session loaded are the OLD ones until Claude is reopened. The report
// must say so LOUDLY (the disease: a "✅ done" with no restart line reads as "already
// live" → the improvement stays trapped behind a stale session). But this is the generic
// restart banner, NOT the new-capability path: no capability counter, no "run once more".
test("formatReport — steady-state code swap (no new capability) still loudly says to restart, without the counter / 'run once more'", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: false,
    installedSkills: [],
    mcpServersAdded: [],
  });
  assert.match(out, /restart/i, "swapped engine code → the running session is stale → restart");
  assert.match(out, /action needed/i);
  // Reserved-signal discipline: the capability counter + residual-bootstrap fallback are
  // for ACTUAL new capabilities only — never on a plain code swap.
  assert.doesNotMatch(out, /once more/i);
  assert.doesNotMatch(out, /new capabilit/i);
});

// F-B7d (A1) — the don't-cry-wolf boundary: a genuine no-op (nothing swapped, nothing
// regenerated, no new capability — the brain was already up to date) must NOT mention a
// restart. The restart banner is reserved for an update that actually changed on-disk code.
test("formatReport — a true no-op (nothing swapped or regenerated) does NOT cry restart", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: [],
    regenerated: false,
    reindexed: false,
    installedSkills: [],
    mcpServersAdded: [],
  });
  assert.doesNotMatch(out, /restart/i);
  assert.doesNotMatch(out, /once more/i);
});

// F2: the recap must surface the number the USER cares about — how many notes their
// brain holds — not just the maintainer-facing "N engine files swapped" count.
test("formatReport — surfaces the vault note count", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: false,
    vaultNoteCount: 9,
  });
  assert.match(out, /9 notes/);
});

test("formatReport — pluralizes the vault note count (1 note, not '1 note(s)')", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: false,
    vaultNoteCount: 1,
  });
  assert.match(out, /1 note\b/);
  assert.doesNotMatch(out, /note\(s\)/);
});

test("formatReport — when reindexed, hints that searchability catches up as indexing finishes", () => {
  const out = formatReport({
    ref: "v1.1.0",
    engineVersion: { rag: "1.1.0" },
    copied: ["rag/src/index.ts"],
    regenerated: false,
    reindexed: true,
    vaultNoteCount: 9,
  });
  assert.match(out, /9 note/);
  assert.match(out, /indexing|searchable|catches up/i);
});

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeFile(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

// The files a user has made their own — Personal Extensions + Content. The gate's
// whole point: these must come out byte-for-byte unchanged. (vault note carries the
// "Mollecuisse" canary so a stray reindex-from-scratch wouldn't silently lose it.)
const SACRED = {
  "CLAUDE.md": "# My personalized constitution\nI tailored this. Do not touch.\n",
  ".env": "GOOGLE_GEMINI_API_KEY=super-secret-do-not-leak\nEMBED_BATCH=4\n",
  ".claude/settings.json": '{\n  "mine": true,\n  "permissions": { "allow": ["Bash(open:*)"] }\n}\n',
  ".claude/skills/zzz-mine/SKILL.md": "---\nname: zzz-mine\n---\nMy home-made skill.\n",
  "vault/my-note.md": "# Mollecuisse\nThe canary that must never be lost.\n",
};

// Engine files, keyed by manifest regime. vA = what the brain ships now; the source
// builder writes the SAME paths with vB content so the swap is observable.
function engineFiles(tag) {
  return {
    replace: {
      "rag/src/index.ts": `// engine ${tag}\nexport const VERSION = "${tag}";\n`,
      "rag/package.json": `{ "name": "rag", "engineTag": "${tag}" }\n`,
    },
    regenerate: {
      "rag/launch.sh": `#!/usr/bin/env bash\n# launcher ${tag}\n`,
      "rag/launch.cmd": `@rem launcher ${tag}\r\n`,
      "scripts/run-node.sh": `#!/usr/bin/env bash\n# run-node ${tag}\n`,
      "scripts/run-node.cmd": `@rem run-node ${tag}\r\n`,
    },
    // Engine-owned scripts live under the manifest's `merge` regime but are
    // REPLACED in Phase 1 (Option 1) — incl. update-engine.mjs itself (self-update).
    engineScripts: {
      "scripts/auto-commit.mjs": `// auto-commit ${tag}\n`,
      "scripts/auto-push.mjs": `// auto-push ${tag}\n`,
      "scripts/status-line.mjs": `// status-line ${tag}\n`,
      "scripts/verify-rag.mjs": `// verify-rag ${tag}\n`,
      "scripts/update-engine.mjs": `// update-engine ${tag} (self-updating)\n`,
    },
  };
}

// fingerprint, as engine-source records it (self-describing sha256) — used to assert
// the provenance base is preserved / refreshed correctly after the swap (Step 5).
function fp(content) {
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

function manifest({ ragVersion, indexSchemaVersion, ref, provenance = {} }) {
  return JSON.stringify(
    {
      manifestVersion: 1,
      engineVersion: { rag: ragVersion, constitutionTemplate: "1.0.0", scripts: "1.0.0" },
      indexSchemaVersion,
      regimes: {
        replace: ["rag/src/**", "rag/package.json"],
        regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"],
        merge: [
          "CLAUDE.md",
          ".claude/settings.json",
          ".claude/skills/zzz-mine/**",
          "scripts/auto-commit.mjs",
          "scripts/auto-push.mjs",
          "scripts/status-line.mjs",
          "scripts/verify-rag.mjs",
          "scripts/update-engine.mjs",
        ],
      },
      engineMcpServers: ["vault-rag"],
      source: { repo: "https://example.test/launcher.git", ref },
      provenance,
    },
    null,
    2,
  );
}

function flat(files) {
  return { ...files.replace, ...files.regenerate, ...files.engineScripts };
}

// A brain pinned at vA: engine files (vA) + the user's sacred files + manifest.
function buildBrain() {
  const dir = mkdtempSync(join(tmpdir(), "sbg-brain-"));
  for (const [rel, content] of Object.entries(flat(engineFiles("vA")))) writeFile(dir, rel, content);
  for (const [rel, content] of Object.entries(SACRED)) writeFile(dir, rel, content);
  writeFile(
    dir,
    "engine-manifest.json",
    manifest({
      ragVersion: "1.0.0",
      indexSchemaVersion: 1,
      ref: "v1.0.0",
      // The base the engine last delivered: a user merge file (CLAUDE.md) + a vA
      // engine script. Step 5 must PRESERVE the former (never re-delivered) and
      // REFRESH the latter (re-delivered as vB).
      provenance: {
        "CLAUDE.md": fp(SACRED["CLAUDE.md"]),
        "scripts/auto-commit.mjs": fp(engineFiles("vA").engineScripts["scripts/auto-commit.mjs"]),
      },
    }),
  );
  return dir;
}

// A freshly-cloned launcher source at vB: engine files (vB) + its manifest. (It does
// NOT carry the brain's sacred files — those belong to the brain alone.)
function buildSource({ indexSchemaVersion }) {
  const dir = mkdtempSync(join(tmpdir(), "sbg-source-"));
  for (const [rel, content] of Object.entries(flat(engineFiles("vB")))) writeFile(dir, rel, content);
  writeFile(dir, "engine-manifest.json", manifest({ ragVersion: "1.1.0", indexSchemaVersion, ref: "v1.1.0" }));
  return dir;
}

// Snapshot the sacred files' bytes so we can prove byte-identity after the upgrade.
function snapshotSacred(brainDir) {
  const snap = {};
  for (const rel of Object.keys(SACRED)) snap[rel] = sha256(join(brainDir, rel));
  return snap;
}

function assertSacredUntouched(brainDir, before) {
  for (const rel of Object.keys(SACRED)) {
    assert.equal(
      sha256(join(brainDir, rel)),
      before[rel],
      `SACRED file changed — ${rel} must be byte-identical after an engine upgrade`,
    );
  }
}

// Run the core with the network/npm/reindex SEAMS stubbed. fetchSource hands back the
// prepared source dir (stands in for `git clone --depth 1 --branch <ref>`); the calls
// object records the side effects we assert on.
async function runUpdate({ brainDir, sourceDir, platform, resolveLatestTag, countVaultNotes }) {
  const updateEngine = await loadCore();
  const calls = { install: [], reindex: [], regenerate: [], finalize: [] };
  const report = await updateEngine({
    brainDir,
    platform,
    countVaultNotes: countVaultNotes ?? (async () => 0),
    // Auto-finalize (ADR 0026, Layer A): the real seam re-execs the reconciler in a
    // fresh child process. Stubbed here so no test spawns a real node process; we just
    // record that update-engine asked for the finalize pass with the right inputs.
    finalizeReconcile: async ({ brainDir: bd, sourceDir: sd, platform: p }) => {
      calls.finalize.push({ brainDir: bd, sourceDir: sd, platform: p });
    },
    // The launcher's latest release tag on the remote (ADR 0017). Default = the
    // target's version; overridable to exercise the offline/no-tag fallback. The
    // committed launcher manifest has NO `source`, so this — not target.source —
    // is the single thing that advances the brain's recorded ref.
    resolveLatestTag: resolveLatestTag ?? (async () => "v1.1.0"),
    fetchSource: async ({ repo, ref }) => {
      calls.fetch = { repo, ref };
      return sourceDir;
    },
    regenerateLaunchers: async ({ brainDir: bd, platform: p }) => {
      // The real seam calls the rag-launcher.mjs builders (pure, machine-independent).
      // ADR 0015: BOTH halves are (re)written regardless of the host platform.
      calls.regenerate.push(p);
      for (const rel of ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"]) {
        writeFile(bd, rel, `# regenerated ${rel} (${p})\n`);
      }
    },
    runInstall: async ({ ragDir }) => {
      calls.install.push(ragDir);
    },
    runReindex: async ({ brainDir: bd }) => {
      calls.reindex.push(bd);
    },
  });
  return { report, calls };
}

for (const platform of ["posix", "win32"]) {
  test(`gate [${platform}] — engine swapped to vB, schema moved → reindex, user files untouched`, async (t) => {
    const brainDir = buildBrain();
    const sourceDir = buildSource({ indexSchemaVersion: 2 }); // schema 1 → 2
    t.after(() => {
      rmSync(brainDir, { recursive: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
    });
    const before = snapshotSacred(brainDir);

    const { calls } = await runUpdate({ brainDir, sourceDir, platform });

    // 0. The engine was fetched at the RESOLVED latest tag (not the brain's pinned
    //    ref) — this is what makes the displayed Version actually advance (ADR 0017).
    assert.equal(calls.fetch.ref, "v1.1.0", "must fetch the resolved latest tag, not the old pinned ref");

    // 1. Every COPIED engine file now carries the vB bytes — the `replace` bucket and
    //    the engine-owned scripts (incl. update-engine.mjs self-update). The launchers
    //    are not copied: they are regenerated (asserted just below).
    const expected = { ...engineFiles("vB").replace, ...engineFiles("vB").engineScripts };
    for (const [rel, content] of Object.entries(expected)) {
      assert.equal(
        readFileSync(join(brainDir, rel), "utf8"),
        content,
        `engine file not upgraded to vB — ${rel}`,
      );
    }
    // 1.bis The launchers were REGENERATED (ADR 0015), not copied: the seam ran once
    //       for this platform, and BOTH `.sh` and `.cmd` halves are present.
    assert.deepEqual(calls.regenerate, [platform], "launchers must be regenerated once, for this platform");
    assert.ok(existsSync(join(brainDir, "rag/launch.sh")), "the .sh launcher must exist");
    assert.ok(existsSync(join(brainDir, "rag/launch.cmd")), "the .cmd launcher must exist");
    assert.ok(existsSync(join(brainDir, "scripts/run-node.sh")), "the .sh node-runner must exist");
    assert.ok(existsSync(join(brainDir, "scripts/run-node.cmd")), "the .cmd node-runner must exist");

    // 2. npm install ran in the brain's rag/.
    assert.deepEqual(calls.install, [join(brainDir, "rag")], "npm install must run once in <brain>/rag");

    // 3. Index schema moved (1 → 2) → reindex ran in the brain.
    assert.deepEqual(calls.reindex, [brainDir], "schema moved → reindex must run once in the brain");

    // 4. THE SURVIVAL GUARANTEE: not one sacred byte changed.
    assertSacredUntouched(brainDir, before);

    // 5. The brain's manifest now records the new version + the ref it pulled.
    const m = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));
    assert.equal(m.engineVersion.rag, "1.1.0", "manifest engineVersion.rag must be bumped to the target");
    assert.equal(m.indexSchemaVersion, 2, "manifest indexSchemaVersion must follow the target");
    assert.equal(m.source.ref, "v1.1.0", "manifest source.ref must ADVANCE to the resolved latest tag");

    // 6. PROVENANCE RE-SEED (Step 5): the base for the re-delivered engine script is
    //    refreshed to vB, while the user merge file's base (never touched) is preserved
    //    — so Phase 2's 3-way still detects any edit the user made to CLAUDE.md.
    assert.equal(
      m.provenance["scripts/auto-commit.mjs"],
      fp(engineFiles("vB").engineScripts["scripts/auto-commit.mjs"]),
      "re-delivered engine script's provenance base must be refreshed to vB",
    );
    assert.equal(
      m.provenance["CLAUDE.md"],
      fp(SACRED["CLAUDE.md"]),
      "an untouched user merge file's provenance base must be preserved",
    );
  });
}

// ── Auto-finalize (ADR 0026, Layer A): after a successful update, update-engine
//    re-execs the freshly-written reconciler in a fresh child process — given the SAME
//    sourceDir it fetched — so the just-installed converge logic runs in ONE invocation
//    (kills the 2-cycle). Here we assert the wiring: the seam is invoked once, last,
//    with the brain + the fetched source.
test("gate — auto-finalizes once after the update, handing the child the fetched source (ADR 0026)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource({ indexSchemaVersion: 1 });
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  const { calls } = await runUpdate({ brainDir, sourceDir, platform: "posix" });

  assert.deepEqual(
    calls.finalize,
    [{ brainDir, sourceDir, platform: "posix" }],
    "update-engine must auto-finalize exactly once, handing the child the brain dir + the fetched source",
  );
});

// ── #1 (code-review): a best-effort auto-finalize child failure must NEVER turn an
//    already-recorded, already-successful update into a reported FAILURE. The update is
//    done + recorded at step 7; step 8 (auto-finalize) is a finisher on top. A flaky
//    npm install / ABI hiccup in the fresh child must fail SOFT — updateEngine still
//    RESOLVES with the recorded report (the CLI never prints "the brain was NOT changed").
test("gate — a failing auto-finalize child does NOT reject the update (fail-soft, ADR 0026)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource({ indexSchemaVersion: 1 });
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  const updateEngine = await loadCore();
  const report = await updateEngine({
    brainDir,
    platform: "posix",
    countVaultNotes: async () => 7,
    resolveLatestTag: async () => "v1.1.0",
    fetchSource: async () => sourceDir,
    regenerateLaunchers: async () => {},
    runInstall: async () => {},
    runReindex: async () => {},
    // The finalize child blows up (flaky npm install in the fresh process, ABI skew…).
    finalizeReconcile: async () => {
      throw new Error("npm install failed in the auto-finalize child");
    },
  });

  // The update still succeeded: it resolved with the recorded report, and the manifest
  // already advanced — a finisher failure must never read as "the brain was NOT changed".
  assert.equal(report.engineVersion.rag, "1.1.0");
  const m = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));
  assert.equal(m.engineVersion.rag, "1.1.0", "the update is recorded even if auto-finalize fails");
});

test("gate — schema UNCHANGED → engine still swapped but NO reindex", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource({ indexSchemaVersion: 1 }); // same schema as the brain
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  const before = snapshotSacred(brainDir);

  const { calls } = await runUpdate({ brainDir, sourceDir, platform: "posix" });

  assert.equal(
    readFileSync(join(brainDir, "rag/src/index.ts"), "utf8"),
    engineFiles("vB").replace["rag/src/index.ts"],
    "engine must still be swapped even when the index schema did not move",
  );
  assert.deepEqual(calls.install, [join(brainDir, "rag")], "npm install must still run");
  assert.deepEqual(calls.reindex, [], "schema unchanged → reindex must NOT run");
  assertSacredUntouched(brainDir, before);
});

// ── ANTI-REGRESSION (PR #10 QA findings): update-engine must apply the SAME two
//    refinements the installer does over the manifest globs (see engine-copy-select):
//    F1 — never leak the dev-only scripts/lib/eval-*/mcp-search.* into a brain;
//    F2 — never overwrite the brain's locale-owned scripts/lib/demo-locale.mjs.
//    The source declares `scripts/lib/**` under `replace` (as the real launcher does),
//    so a naive glob copy would drag both in.
test("gate — F1/F2: dev-only files never land, and the brain keeps its installed locale", async (t) => {
  const brainDir = mkdtempSync(join(tmpdir(), "sbg-brain-loc-"));
  const sourceDir = mkdtempSync(join(tmpdir(), "sbg-source-loc-"));
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  // A brain installed with --lang fr: its demo-locale marker reads "fr".
  const brainLocaleFr = '// demo-locale (fr overlay)\nexport const BRAIN_LOCALE = "fr";\n';
  writeFile(brainDir, "scripts/lib/demo-locale.mjs", brainLocaleFr);
  writeFile(brainDir, "scripts/lib/engine-fetch.mjs", "// engine-fetch vA\n");
  writeFile(brainDir, "rag/src/index.ts", "// engine vA\n");
  for (const [rel, content] of Object.entries(SACRED)) writeFile(brainDir, rel, content);
  writeFile(
    brainDir,
    "engine-manifest.json",
    JSON.stringify(
      {
        manifestVersion: 1,
        engineVersion: { rag: "1.0.0", constitutionTemplate: "1.0.0", scripts: "1.0.0" },
        indexSchemaVersion: 1,
        regimes: { replace: ["rag/src/**", "scripts/lib/**"], regenerate: [], merge: [] },
        source: { repo: "https://example.test/launcher.git", ref: "v1.0.0" },
        provenance: {},
      },
      null,
      2,
    ),
  );

  // The fetched source: a newer engine-fetch, dev-only files, a ROOT demo-locale ("en")
  // and the fr/en locale owners under templates/.
  writeFile(sourceDir, "rag/src/index.ts", "// engine vB\n");
  writeFile(sourceDir, "scripts/lib/engine-fetch.mjs", "// engine-fetch vB\n");
  writeFile(sourceDir, "scripts/lib/eval-set.mjs", "// dev-only eval tooling\n");
  writeFile(sourceDir, "scripts/lib/mcp-search.mjs", "// dev-only mcp-search\n");
  writeFile(sourceDir, "scripts/lib/demo-locale.mjs", '// root\nexport const BRAIN_LOCALE = "en";\n');
  writeFile(sourceDir, "templates/fr/scripts/lib/demo-locale.mjs", 'export const BRAIN_LOCALE = "fr";\n');
  writeFile(sourceDir, "templates/en/scripts/lib/demo-locale.mjs", 'export const BRAIN_LOCALE = "en";\n');
  writeFile(
    sourceDir,
    "engine-manifest.json",
    JSON.stringify(
      {
        manifestVersion: 1,
        engineVersion: { rag: "1.1.0", constitutionTemplate: "1.0.0", scripts: "1.0.0" },
        indexSchemaVersion: 1,
        regimes: { replace: ["rag/src/**", "scripts/lib/**"], regenerate: [], merge: [] },
        source: { repo: "https://example.test/launcher.git", ref: "v1.1.0" },
        provenance: {},
      },
      null,
      2,
    ),
  );

  await runUpdate({ brainDir, sourceDir, platform: "posix" });

  // A real engine lib WAS swapped to vB…
  assert.equal(readFileSync(join(brainDir, "scripts/lib/engine-fetch.mjs"), "utf8"), "// engine-fetch vB\n");
  // …but F1: the dev-only files never landed.
  assert.equal(existsSync(join(brainDir, "scripts/lib/eval-set.mjs")), false, "F1: eval-* must not leak into the brain");
  assert.equal(existsSync(join(brainDir, "scripts/lib/mcp-search.mjs")), false, "F1: mcp-search must not leak into the brain");
  // …and F2: the brain KEEPS its installed fr locale marker (not overwritten by root "en").
  assert.equal(
    readFileSync(join(brainDir, "scripts/lib/demo-locale.mjs"), "utf8"),
    brainLocaleFr,
    "F2: update-engine must not overwrite the brain's locale-owned demo-locale.mjs (fr→en regression)",
  );
});

// ── Lot A (ADR 0025): an engine update INSTALLS a missing engine-declared MERGE skill
//    (additive, install-if-absent) — illustrated by `coach` (local-mirror relocated to
//    the staged engine-skills/ path, F-B7 2b) — while never touching a non-declared /
//    custom skill.
test("gate — installs a MISSING engine-declared skill (install-if-absent); custom skill stays untouched", async (t) => {
  const brainDir = buildBrain(); // ships zzz-mine (custom), NO coach skill
  const sourceDir = mkdtempSync(join(tmpdir(), "sbg-source-skill-"));
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  const before = snapshotSacred(brainDir);

  // The fetched launcher carries the engine files (vB) + a NEW engine skill, and its
  // manifest declares that skill path as engine-owned (under `merge`).
  for (const [rel, content] of Object.entries(flat(engineFiles("vB")))) writeFile(sourceDir, rel, content);
  const skillBody = "---\nname: coach\n---\nYour sparring partner.\n";
  writeFile(sourceDir, ".claude/skills/coach/SKILL.md", skillBody);
  writeFile(
    sourceDir,
    "engine-manifest.json",
    JSON.stringify(
      {
        manifestVersion: 1,
        engineVersion: { rag: "1.1.0", constitutionTemplate: "1.0.0", scripts: "1.0.0" },
        indexSchemaVersion: 1,
        regimes: {
          replace: ["rag/src/**", "rag/package.json"],
          regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"],
          merge: [
            "CLAUDE.md",
            ".claude/settings.json",
            ".claude/skills/coach/**", // the NEW engine skill, declared engine-owned
            "scripts/auto-commit.mjs",
            "scripts/auto-push.mjs",
            "scripts/status-line.mjs",
            "scripts/verify-rag.mjs",
            "scripts/update-engine.mjs",
          ],
        },
        engineMcpServers: ["vault-rag"],
        source: { repo: "https://example.test/launcher.git", ref: "v1.1.0" },
        provenance: {},
      },
      null,
      2,
    ),
  );

  assert.equal(
    existsSync(join(brainDir, ".claude/skills/coach/SKILL.md")),
    false,
    "precondition: the brain must lack the engine skill before the update",
  );

  const { report } = await runUpdate({ brainDir, sourceDir, platform: "posix" });

  // The engine installed the missing skill from the fetched source…
  assert.equal(
    readFileSync(join(brainDir, ".claude/skills/coach/SKILL.md"), "utf8"),
    skillBody,
    "a missing engine-declared merge skill must be installed on update",
  );
  // …and the report names it (so the user SEES they got the feature, finding A).
  assert.deepEqual(
    report.installedSkills,
    ["coach"],
    "the report must name the engine skill(s) it installed",
  );
  // …and the user's custom skill + every sacred file stayed byte-identical.
  assertSacredUntouched(brainDir, before);
});

test("gate — an ALREADY-PRESENT engine skill is preserved byte-identical (never clobbered, install-if-absent)", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = mkdtempSync(join(tmpdir(), "sbg-source-skill2-"));
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  // The brain already carries a USER-CUSTOMIZED coach skill.
  const customized = "---\nname: coach\n---\nMY OWN tweaks — do not overwrite.\n";
  writeFile(brainDir, ".claude/skills/coach/SKILL.md", customized);
  const beforeHash = sha256(join(brainDir, ".claude/skills/coach/SKILL.md"));

  // The fetched launcher carries a DIFFERENT version of the same skill + declares it.
  for (const [rel, content] of Object.entries(flat(engineFiles("vB")))) writeFile(sourceDir, rel, content);
  writeFile(sourceDir, ".claude/skills/coach/SKILL.md", "---\nname: coach\n---\nEngine default.\n");
  writeFile(
    sourceDir,
    "engine-manifest.json",
    JSON.stringify(
      {
        manifestVersion: 1,
        engineVersion: { rag: "1.1.0", constitutionTemplate: "1.0.0", scripts: "1.0.0" },
        indexSchemaVersion: 1,
        regimes: {
          replace: ["rag/src/**", "rag/package.json"],
          regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"],
          merge: [".claude/skills/coach/**", "scripts/update-engine.mjs"],
        },
        engineMcpServers: ["vault-rag"],
        source: { repo: "https://example.test/launcher.git", ref: "v1.1.0" },
        provenance: {},
      },
      null,
      2,
    ),
  );

  await runUpdate({ brainDir, sourceDir, platform: "posix" });

  assert.equal(
    sha256(join(brainDir, ".claude/skills/coach/SKILL.md")),
    beforeHash,
    "a present (customized) engine skill must be preserved byte-identical — install-if-absent never overwrites",
  );
});

// ── Lot B (ADR 0025): an engine update RECONCILES .mcp.json against the manifest's
//    engineMcpServers — registering a newly-shipped engine server (local-mirror) from
//    the fetched .mcp.json.template (cwd → the brain dir), while preserving every
//    existing server (vault-rag + any user-added one) and staying idempotent.
test("gate — registers a missing engine MCP server in .mcp.json (from the template), preserving existing servers", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = mkdtempSync(join(tmpdir(), "sbg-source-mcp-"));
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  // The brain's .mcp.json: only vault-rag + a user-added server (must both survive).
  writeFile(
    brainDir,
    ".mcp.json",
    JSON.stringify(
      {
        mcpServers: {
          "vault-rag": { type: "stdio", command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: brainDir, env: {} },
          "my-tool": { type: "stdio", command: "node", args: ["my-tool.js"], cwd: brainDir, env: {} },
        },
      },
      null,
      2,
    ),
  );

  // The fetched launcher: engine files (vB) + a .mcp.json.template declaring both
  // engine servers with the {{PROJECT_ROOT}} placeholder + a manifest listing them.
  for (const [rel, content] of Object.entries(flat(engineFiles("vB")))) writeFile(sourceDir, rel, content);
  writeFile(
    sourceDir,
    ".mcp.json.template",
    JSON.stringify(
      {
        mcpServers: {
          "vault-rag": { type: "stdio", command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: "{{PROJECT_ROOT}}", env: {} },
          "local-mirror": { type: "stdio", command: "npx", args: ["tsx", "local-mirror/src/server.ts"], cwd: "{{PROJECT_ROOT}}", env: {} },
        },
      },
      null,
      2,
    ),
  );
  writeFile(
    sourceDir,
    "engine-manifest.json",
    JSON.stringify(
      {
        manifestVersion: 1,
        engineVersion: { rag: "1.1.0", constitutionTemplate: "1.0.0", scripts: "1.0.0" },
        indexSchemaVersion: 1,
        regimes: {
          replace: ["rag/src/**", "rag/package.json"],
          regenerate: ["rag/launch.sh", "rag/launch.cmd", "scripts/run-node.sh", "scripts/run-node.cmd"],
          merge: ["scripts/update-engine.mjs"],
        },
        engineMcpServers: ["vault-rag", "local-mirror"],
        source: { repo: "https://example.test/launcher.git", ref: "v1.1.0" },
        provenance: {},
      },
      null,
      2,
    ),
  );

  const { report } = await runUpdate({ brainDir, sourceDir, platform: "posix" });

  const mcp = JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8"));
  // The missing engine server is now registered, with its cwd pointing at THIS brain.
  assert.ok(mcp.mcpServers["local-mirror"], "the missing engine server must be registered on update");
  // The report names only the server it actually ADDED (vault-rag was already there).
  assert.deepEqual(
    report.mcpServersAdded,
    ["local-mirror"],
    "the report must name the MCP server(s) it registered (only the newly-added one)",
  );
  // {{PROJECT_ROOT}} is substituted POSIX-normalised (cf. reconcile-brain.mjs / installer
  // toPosix), so on Windows the expectation must normalise too — a no-op on POSIX.
  assert.equal(mcp.mcpServers["local-mirror"].cwd, brainDir.split("\\").join("/"), "{{PROJECT_ROOT}} must resolve to the brain dir");
  assert.deepEqual(
    mcp.mcpServers["local-mirror"].args,
    ["tsx", "local-mirror/src/server.ts"],
    "the server definition must come from the fetched template",
  );
  // Existing servers — engine AND user-added — are preserved untouched.
  assert.ok(mcp.mcpServers["vault-rag"], "the existing vault-rag server must be preserved");
  assert.ok(mcp.mcpServers["my-tool"], "the user-added server must be preserved");
});

test("gate — no tag resolvable (offline / no semver tag) → fall back to the pinned ref, update still applies", async (t) => {
  const brainDir = buildBrain(); // pinned at v1.0.0
  const sourceDir = buildSource({ indexSchemaVersion: 1 });
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  const { calls } = await runUpdate({
    brainDir,
    sourceDir,
    platform: "posix",
    resolveLatestTag: async () => null, // remote unreachable / no semver tag
  });

  // The fetch falls back to the brain's recorded ref → the update still proceeds…
  assert.equal(calls.fetch.ref, "v1.0.0", "no resolvable tag → fetch the pinned ref (never undefined)");
  // …and the recorded ref stays the pinned one (we never invent a version).
  const m = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));
  assert.equal(m.source.ref, "v1.0.0", "with no resolvable tag the ref is preserved, not blanked");
});

// F2 (2a): the core returns the vault note count (via an injectable seam, like
// runReindex) so the recap can surface it. The seam is called and its value flows
// onto the returned report.
test("gate — returns the vault note count from the injected seam", async (t) => {
  const brainDir = buildBrain();
  const sourceDir = buildSource({ indexSchemaVersion: 1 });
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });

  const { report } = await runUpdate({
    brainDir,
    sourceDir,
    platform: "posix",
    countVaultNotes: async () => 42,
  });

  assert.equal(report.vaultNoteCount, 42);
});
