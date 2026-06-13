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

// ── CLI entry (the actual Stop hook) ─────────────────────────────────────────
// Guarded so importing this module in tests does NOT run it. Wires the real git
// runner + a real blocking pause, then ALWAYS exits 0 (best-effort, ignores the
// hook stdin). A failed push only prints a non-blocking warning.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const git = (args) => {
    try {
      const out = execFileSync("git", args, {
        cwd: REPO,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { out: out ?? "", ok: true };
    } catch (e) {
      return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, ok: false };
    }
  };
  // Blocking pause (the hook runs synchronously, under a Claude Code timeout).
  const sleep = (ms) =>
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

  if (attemptPush({ git, sleep }) === "failed") {
    process.stdout.write(
      "\n⚠️  PUSH FAILED — local commits OK but not pushed. Check your network; " +
        "the next turn will retry automatically (or run: git push).\n",
    );
  }
  process.exit(0);
}
