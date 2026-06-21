#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// session-self-heal.mjs — SessionStart self-heal (ADR 0026, Layer B). A brain that
// received engine code but never finished converging (e.g. update-engine's
// auto-finalize was interrupted) heals itself silently at the next session start.
//
// Contract (asserted by session-self-heal.test.mjs):
//   • TRUE no-op when converged — the steady state spawns NOTHING and emits NOTHING
//     (fast: just a manifest read + a few existence checks via the pure gate);
//   • heals in the BACKGROUND when a gap exists — re-execs the reconcile CLI as a
//     detached child so the hook never blocks session start, and emits ONE loud line;
//   • fail-open — any error is logged loudly and swallowed; the function NEVER throws
//     and the hook ALWAYS exits 0 (a broken self-heal must never block a session).
//
// Local converge ONLY: no network, no fetch (sourceDir === brainDir). The reconcile
// child uses the brain's own (already-on-disk) manifest as both target and local, so
// it never reindexes — it just installs the missing skills + registers the missing MCP.
//
// Wired as a SessionStart hook BEFORE session-status.mjs (cf. .claude/settings.json).
// Cross-OS: pure Node, no bash/jq dependency.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { detectSelfHealGap } from "./lib/self-heal-detect.mjs";
import { computeApplyPlan } from "./lib/engine-apply-plan.mjs";
import { RESTART_FLAG_REL } from "./lib/restart-nudge.mjs";

export async function sessionSelfHeal({
  brainDir,
  readWanted,
  skillDirExists,
  mcpServerRegistered,
  spawnReconcile,
  emit,
  setRestartPending = () => {},
}) {
  try {
    const { wantedSkillDirs, wantedServerIds } = readWanted();
    const gap = detectSelfHealGap({ wantedSkillDirs, wantedServerIds, skillDirExists, mcpServerRegistered });
    if (!gap.needed) {
      // F-B7d (A2): a fresh, converged session HAS loaded the on-disk engine state, so any
      // restart nudge left by a previous session is now stale → clear it. This is what makes
      // the persistent statusLine nudge disappear exactly when the user has actually restarted.
      setRestartPending(false);
      return { healed: false };
    }

    // F-B7d (A2): a background reconcile is about to converge the brain, but THIS session
    // already loaded the pre-reconcile config → on-disk will be ahead of what's loaded.
    // Mark a restart as PENDING so the persistent statusLine nudges the Desktop user (whose
    // systemMessage we are about to emit is dropped by the Code tab). Cleared by the next
    // fresh, converged session start (the branch just above).
    setRestartPending(true);

    const parts = [
      gap.missingSkills.length ? `skills: ${gap.missingSkills.map((d) => d.split("/").pop()).join(", ")}` : null,
      gap.missingServers.length ? `MCP: ${gap.missingServers.join(", ")}` : null,
    ].filter(Boolean);
    emit(
      `⚠️ ACTION NEEDED — finishing an engine update in the background (${parts.join("; ")}). ` +
        `Until you RESTART Claude (close it and reopen) once this completes, your brain ` +
        `CAN'T use these new capabilities. Restart, then come back here.`,
    );
    spawnReconcile({ brainDir });
    return { healed: true, ...gap };
  } catch (e) {
    const error = e?.message ?? String(e);
    emit(`⚠️ Brain self-heal skipped (non-blocking): ${error}`);
    return { healed: false, error };
  }
}

// ⛔ Build the SessionStart hook output (Thomas's Desktop QA, 2026-06-21). Claude Desktop's Code
// tab renders NEITHER a statusLine NOR `systemMessage` — the ONLY Desktop-visible channel is the
// CHAT. A SessionStart hook's `hookSpecificOutput.additionalContext` IS injected into the agent's
// context, so the agent relays it into the chat. So the restart nudge MUST ride additionalContext,
// phrased as a DIRECTIVE the agent surfaces to the user (not raw user prose Desktop would drop).
// `systemMessage` is kept too — harmless on Desktop (dropped), useful on the CLI (shown).
export function buildSelfHealHookOutput(lines) {
  if (!lines || lines.length === 0) return null;
  const detail = lines.join("\n");
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        `[engine self-heal — RESTART REQUIRED] An engine update is finishing in the background ` +
        `and Claude must be restarted to pick up the new capabilities. You MUST now tell the user, ` +
        `in their language, LOUDLY and unmissably (emoji + a clear heading), to FULLY restart ` +
        `Claude (close it and reopen, then resume THIS conversation). Never imply the update is ` +
        `already live, never say "nothing to do". Relay these specifics:\n${detail}`,
    },
    systemMessage: detail,
  };
}

// "<…>/local-mirror/**" → "<…>/local-mirror" (mirror reconcile-brain's skill-dir derivation).
function skillGlobToDir(glob) {
  return glob.replace(/\/\*\*?$/, "");
}

// Derive the engine's DESIRED-STATE from the files it DELIVERS to this brain (F-B7 2g),
// proven by restart-convergence.test.mjs. NEVER the frozen `engineMcpServers`/manifest
// regimes alone — update-engine never refreshes those, which is the whole bug:
//   • wanted skills  = engine merge skills (computeApplyPlan, for v3.3.0+ skills) ∪ the
//                      staged `engine-skills/<name>/` dirs (upgrader-bound skills the
//                      sacred scrub forbids delivering under `.claude/skills/`);
//   • wanted servers = keys of the delivered `.mcp.json.template` (the local-mirror
//                      server arrives here once pass-1 lays the template on disk).
export function deriveWanted(brainDir) {
  const manifest = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));
  const mergeSkillDirs = computeApplyPlan(manifest).installSkills.map(skillGlobToDir);

  const stagingDir = join(brainDir, "engine-skills");
  const stagedSkillDirs = existsSync(stagingDir)
    ? readdirSync(stagingDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `.claude/skills/${e.name}`)
    : [];

  const templatePath = join(brainDir, ".mcp.json.template");
  const wantedServerIds = existsSync(templatePath)
    ? Object.keys(JSON.parse(readFileSync(templatePath, "utf8")).mcpServers ?? {})
    : [];

  return {
    wantedSkillDirs: [...new Set([...mergeSkillDirs, ...stagedSkillDirs])],
    wantedServerIds,
  };
}

// ── main: wire the real I/O seams (deterministic glue, not unit-tested) ───────
// The reconcile runs DETACHED in the background (its npm install / launcher regen
// can outlast the hook timeout) so session start never blocks. The brain converges
// from its OWN on-disk code (sourceDir === brainDir) → no network, no reindex.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const brainDir = resolve(__dirname, "..");
  const reconcileCli = join(__dirname, "lib", "reconcile-brain.mjs");
  const lines = [];

  sessionSelfHeal({
    brainDir,
    // Desired-state from the files the engine DELIVERS, never the frozen manifest
    // (F-B7 2g): wanted skills = engine merge skills ∪ staged `engine-skills/`;
    // wanted MCP servers = keys of the delivered `.mcp.json.template`.
    readWanted: () => deriveWanted(brainDir),
    skillDirExists: (dir) => existsSync(join(brainDir, dir)),
    mcpServerRegistered: (() => {
      const mcpPath = join(brainDir, ".mcp.json");
      const ids = existsSync(mcpPath)
        ? new Set(Object.keys(JSON.parse(readFileSync(mcpPath, "utf8")).mcpServers ?? {}))
        : new Set();
      return (id) => ids.has(id);
    })(),
    spawnReconcile: ({ brainDir: dir }) => {
      const child = spawn(
        process.execPath,
        [reconcileCli, "--brainDir", dir, "--sourceDir", dir, "--platform", process.platform],
        // detached + unref → survives the hook process; windowsHide → no console flash on Windows.
        { detached: true, stdio: "ignore", windowsHide: true },
      );
      child.unref();
    },
    // A2: persist the "restart pending" flag under the gitignored .cache/ so the statusLine
    // (status-line.mjs) can show the Desktop-visible nudge. Fail-soft: a flag-write hiccup
    // must never break self-heal, so swallow errors (the systemMessage line still ships).
    setRestartPending: (pending) => {
      const flagPath = join(brainDir, RESTART_FLAG_REL);
      try {
        if (pending) {
          mkdirSync(dirname(flagPath), { recursive: true });
          writeFileSync(flagPath, "restart needed to finish the engine update\n");
        } else {
          rmSync(flagPath, { force: true });
        }
      } catch {
        /* fail-soft: the nudge is a convenience, never a blocker */
      }
    },
    emit: (msg) => lines.push(msg),
  })
    .then(() => {
      const output = buildSelfHealHookOutput(lines);
      if (output) {
        // additionalContext is the ONLY Desktop-visible channel (chat) — see buildSelfHealHookOutput.
        process.stdout.write(JSON.stringify(output) + "\n");
      }
      process.exit(0); // fail-open: ALWAYS exit 0, never block session start
    })
    .catch(() => process.exit(0));
}
