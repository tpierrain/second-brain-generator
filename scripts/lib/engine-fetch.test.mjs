import { test } from "node:test";
import assert from "node:assert/strict";

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCloneArgs,
  buildLsRemoteArgs,
  fetchSource,
  readTargetManifest,
  resolveLatestTag,
} from "./engine-fetch.mjs";

// A scripted git seam: returns {out, ok} (the auto-push convention) and records
// every argv it was handed, so a test asserts both the command and the side effect.
function fakeGit({ ok = true, out = "" } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return { out, ok };
  };
  return { git, calls };
}

// ═══════════════════════════════════════════════════════════════════════════
// engine-fetch — resolve + fetch the pinned launcher ref (plan Step 2).
// Shallow-clones the launcher repo at the brain's recorded `source.{repo,ref}`
// into a fresh temp dir and hands that dir back — the REAL implementation of the
// Gate's `fetchSource` seam. git spawn + temp-dir creation are injected so the
// unit tests run offline and deterministically (no network, no real git).
// Cross-platform (ADR 0015): the clone argv is platform-agnostic (git is a .exe
// on Windows, no shell needed) — proven identical under posix AND win32.
// ═══════════════════════════════════════════════════════════════════════════

test("buildCloneArgs — a shallow, single-branch clone of the pinned ref into dir", () => {
  assert.deepEqual(
    buildCloneArgs({ repo: "https://example.test/launcher.git", ref: "v2.0.0", dir: "/tmp/src" }),
    ["clone", "--depth", "1", "--branch", "v2.0.0", "--single-branch", "https://example.test/launcher.git", "/tmp/src"],
  );
});

test("buildLsRemoteArgs — lists the remote's tag refs only (no dereferenced ^{} dupes)", () => {
  assert.deepEqual(
    buildLsRemoteArgs("https://example.test/launcher.git"),
    ["ls-remote", "--tags", "--refs", "https://example.test/launcher.git"],
  );
});

test("fetchSource — clones the recorded {repo, ref} into a fresh temp dir and returns it", async () => {
  const { git, calls } = fakeGit();
  const dir = await fetchSource({
    repo: "https://example.test/launcher.git",
    ref: "v2.0.0",
    git,
    makeTempDir: () => "/tmp/sbg-src-XXXX",
  });

  assert.equal(dir, "/tmp/sbg-src-XXXX", "fetchSource returns the temp dir it cloned into");
  assert.deepEqual(calls, [
    buildCloneArgs({ repo: "https://example.test/launcher.git", ref: "v2.0.0", dir: "/tmp/sbg-src-XXXX" }),
  ], "git is invoked exactly once with the shallow clone argv targeting the temp dir");
});

test("fetchSource — a failed clone throws a clear error AND removes the orphan temp dir", async () => {
  const { git } = fakeGit({ ok: false, out: "fatal: repository not found" });
  const removed = [];

  await assert.rejects(
    () =>
      fetchSource({
        repo: "https://example.test/missing.git",
        ref: "v9.9.9",
        git,
        makeTempDir: () => "/tmp/sbg-src-DOOMED",
        removeDir: (d) => removed.push(d),
      }),
    /git clone[\s\S]*v9\.9\.9[\s\S]*repository not found/,
    "the error names the ref and relays git's stderr",
  );
  assert.deepEqual(removed, ["/tmp/sbg-src-DOOMED"], "the half-cloned temp dir must be cleaned up");
});

test("fetchSource — a brain with no recorded repo fails clearly without spawning git", async () => {
  const { git, calls } = fakeGit();
  let made = false;

  await assert.rejects(
    () => fetchSource({ repo: null, ref: "v2.0.0", git, makeTempDir: () => { made = true; return "/tmp/x"; } }),
    /no source repo recorded/,
    "an absent repo (launcher had no remote) yields an actionable error",
  );
  assert.deepEqual(calls, [], "git is never spawned when there is nothing to clone");
  assert.equal(made, false, "no temp dir is created for a clone that cannot happen");
});

test("resolveLatestTag — parses `git ls-remote --tags` and returns the HIGHEST semver tag", () => {
  const out = [
    "abc123\trefs/tags/v1.0.0",
    "def456\trefs/tags/v1.2.0",
    "789aaa\trefs/tags/v1.10.0",
    "000bbb\trefs/tags/v1.1.0",
  ].join("\n");
  const { git, calls } = fakeGit({ out });

  const tag = resolveLatestTag({ repo: "https://example.test/launcher.git", git });

  assert.equal(tag, "v1.10.0", "numeric ordering: v1.10.0 beats v1.2.0");
  assert.deepEqual(
    calls,
    [["ls-remote", "--tags", "--refs", "https://example.test/launcher.git"]],
    "ls-remote is run once against the recorded repo",
  );
});

test("resolveLatestTag — no recorded repo → null, git never spawned (caller falls back)", () => {
  const { git, calls } = fakeGit();
  assert.equal(resolveLatestTag({ repo: null, git }), null);
  assert.deepEqual(calls, [], "no remote → no git");
});

test("resolveLatestTag — git failure (offline / unreachable) → null (fall back to pinned ref)", () => {
  const { git } = fakeGit({ ok: false, out: "fatal: could not read from remote" });
  assert.equal(resolveLatestTag({ repo: "https://example.test/launcher.git", git }), null);
});

test("resolveLatestTag — a remote with no semver tag → null", () => {
  const out = ["abc\trefs/tags/nightly", "def\trefs/tags/latest"].join("\n");
  const { git } = fakeGit({ out });
  assert.equal(resolveLatestTag({ repo: "https://example.test/launcher.git", git }), null);
});

test("readTargetManifest — reads the fetched manifest → target version vector + index schema", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sbg-fetched-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, "engine-manifest.json"),
    JSON.stringify({
      manifestVersion: 1,
      engineVersion: { rag: "1.1.0", constitutionTemplate: "1.0.0", scripts: "1.0.0" },
      indexSchemaVersion: 2,
      regimes: { replace: ["rag/src/**"] },
    }),
  );

  const target = readTargetManifest(dir);

  assert.deepEqual(target.engineVersion, { rag: "1.1.0", constitutionTemplate: "1.0.0", scripts: "1.0.0" });
  assert.equal(target.indexSchemaVersion, 2);
  assert.deepEqual(target.regimes, { replace: ["rag/src/**"] });
});

// ADR 0015 — git is a real executable on BOTH platforms (no npm.cmd-style shell
// wrapper), so the clone needs no `process.platform` branch. Proven by running the
// same fetch with a posix AND a win32 temp-dir path: each is honored verbatim and
// the argv only ever differs in that trailing dir — never in shape or quoting.
for (const { platform, dir } of [
  { platform: "posix", dir: "/tmp/sbg-src-AAA" },
  { platform: "win32", dir: "C:\\Users\\me\\AppData\\Local\\Temp\\sbg-src-AAA" },
]) {
  test(`fetchSource [${platform}] — clones into the platform's temp dir, no shell/quoting`, async () => {
    const { git, calls } = fakeGit();
    const got = await fetchSource({
      repo: "https://example.test/launcher.git",
      ref: "v2.0.0",
      git,
      makeTempDir: () => dir,
    });
    assert.equal(got, dir, "the platform-native temp dir is returned verbatim");
    assert.deepEqual(calls[0], [
      "clone", "--depth", "1", "--branch", "v2.0.0", "--single-branch",
      "https://example.test/launcher.git", dir,
    ]);
  });
}
