// ─────────────────────────────────────────────────────────────────────────────
// engine-fetch.mjs — resolve + fetch the pinned launcher ref a brain records in
// `source: {repo, ref}` (plan Step 2). Shallow-clones that ref into a fresh temp
// dir and returns the dir — the REAL implementation of the Gate's `fetchSource`
// seam (drop-in: same `{repo, ref} → dir` contract). It also reads the FETCHED
// engine-manifest.json so the apply step (Step 3/4) can compare versions/schema.
//
// git spawn + temp-dir creation are INJECTED so the unit tests run offline and
// deterministically (no network, no real git). Cross-platform (ADR 0015): the
// clone argv is platform-agnostic — git is a real .exe on Windows (no shell
// wrapper, unlike npm.cmd), so no `process.platform` branch is needed here.
// ─────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The exact git argv to shallow-clone a single pinned ref into `dir`. Pure so the
// command is unit-asserted and proven identical on every platform.
export function buildCloneArgs({ repo, ref, dir }) {
  return ["clone", "--depth", "1", "--branch", ref, "--single-branch", repo, dir];
}

// Shallow-clone the recorded launcher at the pinned ref into a fresh temp dir and
// return that dir (drop-in for the Gate's `fetchSource` seam). `git` (args[] →
// {out, ok}) and `makeTempDir` are injected so tests stub the spawn (offline).
export async function fetchSource({
  repo,
  ref,
  git = defaultGit,
  makeTempDir = () => mkdtempSync(join(tmpdir(), "sbg-engine-src-")),
  removeDir = (d) => rmSync(d, { recursive: true, force: true }),
}) {
  if (!repo) {
    throw new Error(
      "update-engine: no source repo recorded in the brain's manifest — cannot fetch an update automatically.",
    );
  }
  const dir = makeTempDir();
  const { ok, out } = git(buildCloneArgs({ repo, ref, dir }));
  if (!ok) {
    removeDir(dir); // never leave a half-cloned temp dir behind
    throw new Error(`update-engine: git clone of ${repo}@${ref} failed.\n${out}`);
  }
  return dir;
}

// Read the FETCHED launcher's engine-manifest.json → the target the brain compares
// against: the engineVersion vector, indexSchemaVersion and regimes that drive the
// apply plan (Step 3). Pure read (the dir is already on disk from fetchSource).
export function readTargetManifest(dir, read = (p) => readFileSync(p, "utf8")) {
  return JSON.parse(read(join(dir, "engine-manifest.json")));
}

// Real git runner (args[] → {out, ok}), shared convention with auto-push.mjs. Used
// by the core's CLI wiring, never by the unit tests (which inject `git`).
function defaultGit(args) {
  try {
    const out = execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { out: out ?? "", ok: true };
  } catch (e) {
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, ok: false };
  }
}
