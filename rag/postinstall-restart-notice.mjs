// ─────────────────────────────────────────────────────────────────────────────
// postinstall-restart-notice.mjs — the deterministic "message in a bottle" that makes
// the FIRST engine update of a pre-3.3 brain tell the user, IN THE CHAT, to restart.
//
// THE PROBLEM IT SOLVES. On a pre-3.3 brain, `/update-engine` runs the OLD orchestrator
// (frozen code) + the OLD skill — both silent about restart. Yet that update replaces the
// constitution (CLAUDE.md), the engine code and the MCP server, all of which Claude loaded
// at session start and will keep using until it is fully restarted. We cannot rewrite the
// already-installed old code retroactively. BUT the old orchestrator ALWAYS runs
// `npm install` in rag/ with stdio:"inherit", and npm ALWAYS runs the `postinstall` of the
// package.json THEN ON DISK — which is the NEW one (it lives in the `replace` regime and is
// copied BEFORE install). So THIS new script runs UNDER the old orchestrator, deterministically,
// on the very first update, and its stdout flows straight into the chat the agent reports from.
//
// FIRE ONLY DURING AN UPDATE, NEVER A FRESH INSTALL. The deterministic signal: at postinstall
// time the new rag/package.json is on disk (new rag version) but the manifest still records the
// OLD version (the orchestrator rewrites the manifest AFTER npm install). So recorded != package
// ⇒ an update is mid-flight. On a fresh install both equal the shipped version ⇒ silent.
//
// FAIL-SOFT: a postinstall that throws would abort `npm install` and break the update. The CLI
// wrapper swallows everything (dynamic import + .catch in package.json) and this module never
// throws — printing a nudge is a convenience, never a blocker.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function shouldNudgeRestart({ manifestExists, recordedRagVersion, packageRagVersion }) {
  return manifestExists && recordedRagVersion !== packageRagVersion;
}

// Phrased as a DIRECTIVE to the AGENT (the only renderer of the Desktop chat), not as raw user
// prose. It rides npm's stdout (stdio:"inherit") into the agent's tool result, so the agent reads
// it while reporting the update and surfaces the restart to the user — even on a pre-3.3 brain
// whose OLD skill/core would otherwise stay silent.
export function restartNoticeBanner() {
  const bar = "═".repeat(74);
  return [
    "",
    bar,
    "⚠️ ⚠️ ⚠️  ENGINE UPDATE — AGENT, READ THIS AND ACT  ⚠️ ⚠️ ⚠️",
    bar,
    "The second brain's engine was just updated ON DISK: its constitution",
    "(CLAUDE.md), engine code and MCP server have been REPLACED. Claude loaded all",
    "of these when THIS conversation started, so it is STILL running the OLD brain —",
    "the new constitution and capabilities are NOT active in this conversation.",
    "",
    "👉 YOU MUST now tell the user, in their language, LOUDLY and unmissably (emoji +",
    "   a clear heading), to FULLY RESTART Claude — close it completely and reopen it,",
    "   then resume THIS same conversation. Until they restart, the update has no effect.",
    "   This restart is mandatory, not a suggestion — do NOT downplay it.",
    bar,
    "",
  ].join("\n");
}

// Thin I/O glue (NOT unit-tested — the testable logic is shouldNudgeRestart + restartNoticeBanner).
// Paths are resolved from THIS file, not cwd, so it works whoever invokes npm. NEVER called at
// import time (so tests stay side-effect-free) — only the package.json `postinstall` wrapper calls
// it, inside a .catch, and this body is itself try/caught: a hiccup must never abort `npm install`.
export function main() {
  try {
    const ragDir = dirname(fileURLToPath(import.meta.url)); // this file lives at <brain>/rag/
    const pkg = JSON.parse(readFileSync(join(ragDir, "package.json"), "utf8"));
    const manifestPath = resolve(ragDir, "..", "engine-manifest.json");
    const manifestExists = existsSync(manifestPath);
    const recordedRagVersion = manifestExists
      ? JSON.parse(readFileSync(manifestPath, "utf8"))?.engineVersion?.rag
      : undefined;
    if (shouldNudgeRestart({ manifestExists, recordedRagVersion, packageRagVersion: pkg.version })) {
      process.stdout.write(restartNoticeBanner() + "\n");
    }
  } catch {
    // fail-soft: printing the nudge is a convenience, never a blocker for npm install.
  }
}
