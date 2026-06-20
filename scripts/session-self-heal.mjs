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
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { detectSelfHealGap } from "./lib/self-heal-detect.mjs";

export async function sessionSelfHeal({
  brainDir,
  readManifest,
  skillDirExists,
  mcpServerRegistered,
  spawnReconcile,
  emit,
}) {
  try {
    const manifest = readManifest();
    const gap = detectSelfHealGap({ manifest, skillDirExists, mcpServerRegistered });
    if (!gap.needed) return { healed: false };

    const parts = [
      gap.missingSkills.length ? `skills: ${gap.missingSkills.map((d) => d.split("/").pop()).join(", ")}` : null,
      gap.missingServers.length ? `MCP: ${gap.missingServers.join(", ")}` : null,
    ].filter(Boolean);
    emit(
      `⚙️ Finishing an engine update in the background (${parts.join("; ")}). ` +
        `Restart the app once it completes to load the new capabilities.`,
    );
    spawnReconcile({ brainDir });
    return { healed: true, ...gap };
  } catch (e) {
    const error = e?.message ?? String(e);
    emit(`⚠️ Brain self-heal skipped (non-blocking): ${error}`);
    return { healed: false, error };
  }
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
    readManifest: () => JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8")),
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
    emit: (msg) => lines.push(msg),
  })
    .then(() => {
      if (lines.length > 0) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: { hookEventName: "SessionStart" },
            systemMessage: lines.join("\n"),
          }) + "\n",
        );
      }
      process.exit(0); // fail-open: ALWAYS exit 0, never block session start
    })
    .catch(() => process.exit(0));
}
