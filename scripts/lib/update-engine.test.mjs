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
async function runUpdate({ brainDir, sourceDir, platform }) {
  const updateEngine = await loadCore();
  const calls = { install: [], reindex: [], regenerate: [] };
  const report = await updateEngine({
    brainDir,
    platform,
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
    assert.equal(m.source.ref, "v1.1.0", "manifest source.ref must record the pulled ref");

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
