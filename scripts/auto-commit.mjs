#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// auto-commit.mjs — deterministic vault persistence. Called by the PostToolUse
// hook (Write|Edit): commits on every file modification — hence the "auto: …"
// commits. COMMIT-ONLY: it never pushes. The push is debounced to once per turn
// by the Stop hook (scripts/auto-push.mjs), so N edits = N local commits + 1
// push (avoids a network push per edit + its blocking retry pause).
//
// Cross-OS: pure Node, no shell dependency. The repo root is derived from the
// script location (not the hook's cwd).
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Builds the real git runner bound to `repo`. `execFile` is injected (default:
// execFileSync) so the ok/failure mapping is unit-testable without a real git.
export function buildGit(repo, execFile = execFileSync) {
  return (args) => {
    try {
      const out = execFile("git", args, {
        cwd: repo,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { out: out ?? "", ok: true };
    } catch (e) {
      return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, ok: false };
    }
  };
}

export const COMMIT_MESSAGE = "auto: vault/claude sync";

// Commit-only vault persistence: if the tree is dirty, stage everything and
// commit (never pushes — the Stop hook does that once per turn). Returns
// "committed" | "clean". `git` is the injected runner. NEVER throws for a clean
// tree; a failing git runner is best-effort (the local commit is the safety net).
export function attemptCommit({ git }) {
  const dirty = git(["status", "--porcelain"]).out.trim().length > 0;
  if (!dirty) return "clean";
  git(["add", "."]);
  git(["commit", "-m", COMMIT_MESSAGE]);
  return "committed";
}

// Repo root derived from THIS module's location (one level up from scripts/),
// not the hook's cwd. `metaUrl` is injected so it is testable.
export function repoRoot(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

// Is THIS module the process entry point (invoked as the hook), vs merely
// imported by a test? Compare REAL paths — import.meta.url is already symlink-
// resolved by Node, so we realpath argv[1] too (macOS /var → /private/var).
export function isEntryPoint(argv1, metaUrl) {
  try {
    // A falsy/absent argv1 makes realpathSync throw → caught → false (imported case).
    return realpathSync(argv1) === fileURLToPath(metaUrl);
  } catch {
    return false;
  }
}

// ── CLI entry (the actual PostToolUse hook) ──────────────────────────────────
// Guarded so importing this module in tests does NOT run it. Commit-only; the
// push moved to the Stop hook (auto-push.mjs). No explicit process.exit: the
// work is fully synchronous (execFileSync), so Node exits 0 on its own — and
// NOT exiting at import time keeps the module unit-testable under mutation.
if (isEntryPoint(process.argv[1], import.meta.url)) {
  attemptCommit({ git: buildGit(repoRoot(import.meta.url)) });
}
