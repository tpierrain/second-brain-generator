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
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function git(args) {
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
}

const dirty = git(["status", "--porcelain"]).out.trim().length > 0;
if (!dirty) process.exit(0);

git(["add", "."]);
git(["commit", "-m", "auto: vault/claude sync"]);
// No push here — the Stop hook (auto-push.mjs) pushes pending commits once per
// turn. The opt-in gate (secondbrain.autopush) + inherited-remote safety now
// live there.
