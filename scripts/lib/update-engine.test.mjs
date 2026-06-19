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
import { formatReport } from "../update-engine.mjs";

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
async function runUpdate({ brainDir, sourceDir, platform, resolveLatestTag }) {
  const updateEngine = await loadCore();
  const calls = { install: [], reindex: [], regenerate: [] };
  const report = await updateEngine({
    brainDir,
    platform,
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

// ── Lot A (ADR 0025): an engine update INSTALLS a missing engine-declared skill
//    (additive, install-if-absent) so the flagship local-mirror skill reaches
//    upgraders — while never touching a non-declared / custom skill.
test("gate — installs a MISSING engine-declared skill (install-if-absent); custom skill stays untouched", async (t) => {
  const brainDir = buildBrain(); // ships zzz-mine (custom), NO local-mirror skill
  const sourceDir = mkdtempSync(join(tmpdir(), "sbg-source-skill-"));
  t.after(() => {
    rmSync(brainDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  });
  const before = snapshotSacred(brainDir);

  // The fetched launcher carries the engine files (vB) + a NEW engine skill, and its
  // manifest declares that skill path as engine-owned (under `merge`).
  for (const [rel, content] of Object.entries(flat(engineFiles("vB")))) writeFile(sourceDir, rel, content);
  const skillBody = "---\nname: local-mirror\n---\nMirror a Notion zone into the vault.\n";
  writeFile(sourceDir, ".claude/skills/local-mirror/SKILL.md", skillBody);
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
            ".claude/skills/local-mirror/**", // the NEW engine skill, declared engine-owned
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
    existsSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md")),
    false,
    "precondition: the brain must lack the engine skill before the update",
  );

  const { report } = await runUpdate({ brainDir, sourceDir, platform: "posix" });

  // The engine installed the missing skill from the fetched source…
  assert.equal(
    readFileSync(join(brainDir, ".claude/skills/local-mirror/SKILL.md"), "utf8"),
    skillBody,
    "a missing engine-declared skill must be installed on update (so upgraders get local-mirror)",
  );
  // …and the report names it (so the user SEES they got the feature, finding A).
  assert.deepEqual(
    report.installedSkills,
    ["local-mirror"],
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

  // The brain already carries a USER-CUSTOMIZED local-mirror skill.
  const customized = "---\nname: local-mirror\n---\nMY OWN tweaks — do not overwrite.\n";
  writeFile(brainDir, ".claude/skills/local-mirror/SKILL.md", customized);
  const beforeHash = sha256(join(brainDir, ".claude/skills/local-mirror/SKILL.md"));

  // The fetched launcher carries a DIFFERENT version of the same skill + declares it.
  for (const [rel, content] of Object.entries(flat(engineFiles("vB")))) writeFile(sourceDir, rel, content);
  writeFile(sourceDir, ".claude/skills/local-mirror/SKILL.md", "---\nname: local-mirror\n---\nEngine default.\n");
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
          merge: [".claude/skills/local-mirror/**", "scripts/update-engine.mjs"],
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
    sha256(join(brainDir, ".claude/skills/local-mirror/SKILL.md")),
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
  assert.equal(mcp.mcpServers["local-mirror"].cwd, brainDir, "{{PROJECT_ROOT}} must resolve to the brain dir");
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
