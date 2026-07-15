#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// auto-push.mjs — Stop hook. Pushes the pending commits ONCE per turn (the Stop
// event fires once per main-agent turn, whatever the number of edits), so 30
// edits = 30 local commits + 1 push. Best-effort: never blocks the turn, always
// exits 0. auto-commit.mjs (PostToolUse) stays commit-only.
//
// Cross-OS: pure Node, no shell dependency. Repo root derived from the script
// location (not the hook's cwd).
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldPush } from "./lib/git-push.mjs";

// attemptPush — testable core. `git` is an injected runner (args[]) → {out, ok};
// `sleep` is an injected blocking pause (ms). Returns "pushed" | "skipped" |
// "failed". NEVER throws (a throwing runner is swallowed → treated as failure).
export function attemptPush({ git, sleep }) {
  try {
    const hasRemote = git(["remote"]).out.trim().length > 0;
    const autopush =
      git(["config", "--get", "secondbrain.autopush"]).out.trim() === "true";
    const hasUpstream = git([
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]).ok;
    const unpushedCount = hasUpstream
      ? Number(git(["rev-list", "--count", "@{u}..HEAD"]).out.trim()) || 0
      : 0;

    if (!shouldPush({ hasRemote, autopush, hasUpstream, unpushedCount })) {
      return "skipped";
    }
    if (git(["push"]).ok) return "pushed";
    // One retry after a short pause (transient network blip). Still KO → give up,
    // best-effort: the local commits are the safety net, the next Stop catches up.
    sleep(3000);
    if (git(["push"]).ok) return "pushed";
    return "failed";
  } catch {
    // Best-effort: never let a hook failure block the turn.
    return "failed";
  }
}

// ── CLI wiring (the real Stop hook seams, extracted so they are testable) ────
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

// Blocking pause (the hook runs synchronously, under a Claude Code timeout).
export const realSleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export const PUSH_FAILED_WARNING =
  "\n⚠️  PUSH FAILED — local commits OK but not pushed. Check your network; " +
  "the next turn will retry automatically (or run: git push).\n";

// Runs the hook: attempt the push, print a non-blocking warning on failure.
// ALWAYS returns 0 (best-effort). `write` is injected for testing.
export function runHook({ git, sleep, write }) {
  if (attemptPush({ git, sleep }) === "failed") write(PUSH_FAILED_WARNING);
  return 0;
}

// Repo root derived from THIS module's location (one level up from scripts/),
// not the hook's cwd. `metaUrl` is injected so it is testable.
export function repoRoot(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

// Real stdout writer (forwards to process.stdout).
export const realWrite = (s) => process.stdout.write(s);

// The real hook wiring: a git runner bound to the repo root, the blocking sleep
// and the real writer. Injected as one object into runHook at the entry point.
export function realHookDeps(metaUrl) {
  return { git: buildGit(repoRoot(metaUrl)), sleep: realSleep, write: realWrite };
}

// ── CLI entry (the actual Stop hook) ─────────────────────────────────────────
// Guarded so importing this module in tests does NOT run it. Wires the real
// git/sleep/write, then ALWAYS exits 0 (ignores the hook stdin).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runHook(realHookDeps(import.meta.url)));
}
