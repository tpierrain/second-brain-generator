import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

// NON-REGRESSION test: locks in the "no remote" behavior of auto-commit.mjs
// (local commit, NO push attempted, NO error). This is the foundation of the
// "no remote repository = safe" decision (cf. PLAN §3.4 / §5.E).
// Green right away: we characterize an already-correct behavior, not an addition.

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_SCRIPT = join(HERE, "auto-commit.mjs");

// auto-commit.mjs derives the repo root from ITS position (resolve(scriptDir, "..")).
// So we reconstruct <tmp>/scripts/auto-commit.mjs with the repo at <tmp>.
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "auto-commit-"));
  mkdirSync(join(root, "scripts"));
  copyFileSync(REAL_SCRIPT, join(root, "scripts", "auto-commit.mjs"));
  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  // commit everything (including the copied script) → clean tree at the start
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "init"]);
  return { root, git };
}

function runAutoCommit(root) {
  return execFileSync("node", [join(root, "scripts", "auto-commit.mjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Creates a local bare repo serving as the `origin` remote, and returns its commit count.
function addBareRemote(root, git) {
  const bare = mkdtempSync(join(tmpdir(), "auto-commit-remote-"));
  execFileSync("git", ["init", "--bare", "-q", bare]);
  git(["remote", "add", "origin", bare]);
  // remote actually *pushable* without an upstream → a bare `git push` succeeds if
  // allowed. So the OFF test proves it's the GATE that blocks, not a failure.
  git(["config", "push.default", "current"]);
  const headCount = () => {
    try {
      return Number(
        execFileSync("git", ["--git-dir", bare, "rev-list", "--count", "HEAD"], {
          encoding: "utf8",
        }).trim(),
      );
    } catch {
      return 0; // no HEAD on the remote yet = nothing has been pushed
    }
  };
  return { bare, headCount };
}

test("auto-commit — no remote: local commit, no push, no error", () => {
  const { root, git } = makeRepo();
  try {
    const before = git(["rev-list", "--count", "HEAD"]).trim();
    writeFileSync(join(root, "note.md"), "# a note\n");

    runAutoCommit(root); // must NOT throw (exit 0)

    const after = git(["rev-list", "--count", "HEAD"]).trim();
    assert.equal(Number(after), Number(before) + 1, "one local commit created");
    assert.equal(git(["remote"]).trim(), "", "no remote configured");
    assert.equal(git(["status", "--porcelain"]).trim(), "", "clean tree after commit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("auto-commit — clean tree: no commit created (idempotent)", () => {
  const { root, git } = makeRepo();
  try {
    const before = git(["rev-list", "--count", "HEAD"]).trim();
    runAutoCommit(root); // nothing to commit → exit 0 doing nothing
    const after = git(["rev-list", "--count", "HEAD"]).trim();
    assert.equal(after, before, "no superfluous commit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Layer 1: explicit OPT-IN push ───────────────────────────────────────────
// The presence of a remote is NOT enough: auto-commit only pushes if the user
// has explicitly enabled it (git config secondbrain.autopush true).
// Guarantees that an inherited remote (clone linked to the generator) NEVER
// receives the notes.

test("auto-commit — remote present but autopush OFF (default): local commit, NO push", () => {
  const { root, git } = makeRepo();
  const { bare, headCount } = addBareRemote(root, git);
  try {
    writeFileSync(join(root, "note.md"), "# private\n");
    runAutoCommit(root); // exit 0
    assert.equal(git(["status", "--porcelain"]).trim(), "", "local commit OK");
    assert.equal(headCount(), 0, "the remote receives NOTHING (no push)");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

// auto-commit is now COMMIT-ONLY: the push moved to the Stop hook (auto-push.mjs)
// so it happens once per turn, not once per edit. auto-commit must NEVER push —
// even with a remote AND autopush ON. (The push itself is covered by
// auto-push.test.mjs / git-push.test.mjs.)
test("auto-commit — autopush ON: still COMMIT-ONLY, never pushes (push moved to Stop hook)", () => {
  const { root, git } = makeRepo();
  const { bare, headCount } = addBareRemote(root, git);
  try {
    git(["config", "secondbrain.autopush", "true"]);
    writeFileSync(join(root, "note.md"), "# to back up\n");
    runAutoCommit(root); // exit 0
    assert.equal(git(["status", "--porcelain"]).trim(), "", "local commit OK");
    assert.equal(headCount(), 0, "the remote receives NOTHING — push is no longer auto-commit's job");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});
