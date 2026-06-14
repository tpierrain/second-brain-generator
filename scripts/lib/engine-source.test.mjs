import { test } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import {
  fingerprint,
  selectMergeFiles,
  buildProvenance,
  buildSource,
  enrichManifest,
  recordSourceAndProvenance,
} from "./engine-source.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// engine-source — pure helpers the installer uses to enrich the brain's
// engine-manifest.json with `source: {repo, ref}` (where to pull a future update
// from) and `provenance` (a base sha256 per `merge` file, seeding Phase 2's 3-way).
// Pure by design: the installer does the git/FS I/O and passes the facts in.
// ═══════════════════════════════════════════════════════════════════════════

test("fingerprint — self-describing sha256 of the content", () => {
  // A known SHA-256: the digest of the empty string.
  assert.equal(
    fingerprint(""),
    "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("selectMergeFiles — an exact merge entry selects only that file", () => {
  const manifest = { regimes: { merge: ["CLAUDE.md"] } };
  const candidates = ["CLAUDE.md", "rag/src/index.ts"];
  assert.deepEqual(selectMergeFiles(manifest, candidates), ["CLAUDE.md"]);
});

test("selectMergeFiles — a `**` glob selects the whole subtree, nothing outside it", () => {
  const manifest = { regimes: { merge: [".claude/skills/coach/**"] } };
  const candidates = [
    ".claude/skills/coach/SKILL.md",
    ".claude/skills/coach/lib/helper.mjs",
    ".claude/skills/zzz-mine/SKILL.md", // a home-made skill → must NOT be selected
    "vault/note.md",
  ];
  assert.deepEqual(selectMergeFiles(manifest, candidates), [
    ".claude/skills/coach/SKILL.md",
    ".claude/skills/coach/lib/helper.mjs",
  ]);
});

test("buildProvenance — fingerprints each file's content, keyed by path", () => {
  const fileMap = { "CLAUDE.md": "my constitution", "scripts/auto-commit.mjs": "// engine" };
  assert.deepEqual(buildProvenance(fileMap), {
    "CLAUDE.md": fingerprint("my constitution"),
    "scripts/auto-commit.mjs": fingerprint("// engine"),
  });
});

test("buildSource — an exact tag at HEAD is the most reproducible ref", () => {
  assert.deepEqual(
    buildSource({ repo: "git@github.com:me/launcher.git", tag: "v2.0.0", branch: "main", commit: "deadbeef" }),
    { repo: "git@github.com:me/launcher.git", ref: "v2.0.0" },
  );
});

test("buildSource — no tag → fall back to the branch (still clone-able)", () => {
  assert.deepEqual(
    buildSource({ repo: "git@github.com:me/launcher.git", tag: null, branch: "main", commit: "deadbeef" }),
    { repo: "git@github.com:me/launcher.git", ref: "main" },
  );
});

test("buildSource — no tag, detached/unknown branch → fall back to the commit", () => {
  assert.deepEqual(
    buildSource({ repo: "git@github.com:me/launcher.git", tag: null, branch: null, commit: "deadbeef" }),
    { repo: "git@github.com:me/launcher.git", ref: "deadbeef" },
  );
});

test("buildSource — a launcher with no remote records repo:null (update-engine then asks)", () => {
  assert.deepEqual(
    buildSource({ repo: "", tag: "v1.0.0", branch: "main", commit: "abc" }),
    { repo: null, ref: "v1.0.0" },
  );
});

test("enrichManifest — sets source + provenance, preserves the rest, never mutates the input", () => {
  const original = {
    manifestVersion: 1,
    engineVersion: { rag: "1.1.0" },
    regimes: { merge: ["CLAUDE.md"] },
    provenance: {},
  };
  const source = { repo: "git@github.com:me/launcher.git", ref: "v1.1.0" };
  const provenance = { "CLAUDE.md": fingerprint("c") };

  const enriched = enrichManifest(original, { source, provenance });

  assert.deepEqual(enriched, {
    manifestVersion: 1,
    engineVersion: { rag: "1.1.0" },
    regimes: { merge: ["CLAUDE.md"] },
    source,
    provenance,
  });
  // The input object is left untouched (still the empty provenance, still no source).
  assert.deepEqual(original.provenance, {});
  assert.equal("source" in original, false);
});

// ── The thin I/O orchestrator the installer calls (real fs, git facts injected) ──

function writeFile(root, rel, content) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

test("recordSourceAndProvenance — writes source + fingerprints ONLY the merge files into the brain's manifest", (t) => {
  const brainDir = mkdtempSync(join(tmpdir(), "sbg-src-io-"));
  t.after(() => rmSync(brainDir, { recursive: true, force: true }));

  writeFile(
    brainDir,
    "engine-manifest.json",
    JSON.stringify({
      manifestVersion: 1,
      engineVersion: { rag: "1.1.0" },
      regimes: {
        replace: ["rag/src/**"],
        merge: ["CLAUDE.md", ".claude/settings.json", ".claude/skills/coach/**", "scripts/auto-commit.mjs"],
      },
      provenance: {},
    }),
  );
  // merge files (get a provenance seed):
  writeFile(brainDir, "CLAUDE.md", "my constitution");
  writeFile(brainDir, ".claude/settings.json", '{"generated":true}');
  writeFile(brainDir, ".claude/skills/coach/SKILL.md", "coach skill");
  writeFile(brainDir, "scripts/auto-commit.mjs", "// auto-commit");
  // NON-merge files (must NEVER be fingerprinted — user property / engine replace):
  writeFile(brainDir, "vault/my-note.md", "Mollecuisse");
  writeFile(brainDir, ".claude/skills/zzz-mine/SKILL.md", "home-made");
  writeFile(brainDir, "rag/src/index.ts", "// engine");
  writeFile(brainDir, ".env", "GOOGLE_GEMINI_API_KEY=secret");

  recordSourceAndProvenance({
    brainDir,
    git: { repo: "git@github.com:me/launcher.git", tag: "v1.1.0", branch: "main", commit: "abc" },
  });

  const m = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));
  assert.deepEqual(m.source, { repo: "git@github.com:me/launcher.git", ref: "v1.1.0" });
  assert.deepEqual(m.provenance, {
    "CLAUDE.md": fingerprint("my constitution"),
    ".claude/settings.json": fingerprint('{"generated":true}'),
    ".claude/skills/coach/SKILL.md": fingerprint("coach skill"),
    "scripts/auto-commit.mjs": fingerprint("// auto-commit"),
  });
  // The rest of the manifest is preserved.
  assert.equal(m.engineVersion.rag, "1.1.0");
});
