#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// health-probe-run.mjs — the DETACHED probe child (ADR 0028 + 0030, F7/F7-bis).
// Spawned by session-health.mjs at SessionStart, it reads every ACTIVATED engine
// module's health HEADLESS (read-only, light depth — ADR 0030 §4/§6, F7-ter): it
// runs the SAME health-check definition (rag/src/health-check-cli.ts) the installer
// post-flight and verify-rag use, but WITHOUT booting a server. It persists the fresh
// verdict to engine-health.json and OS-notifies the moment a capability becomes NEWLY
// broken. Runs in the background → session start never waits.
//
// HEADLESS, never an MCP round-trip (revises fc2e4bb): a vault-rag MCP server is a
// private stdio child of Claude — booting one here would test a DIFFERENT process, not
// the live one, and waste resources. The light disk read catches the only truly silent
// failure (a live server answering from DEGRADED DATA: empty/stale index, embedder gone).
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runActivatedHealthChecks } from "./lib/health-check-runner.mjs";
import { buildHeadlessHealthCheckCaller } from "./lib/headless-health-check.mjs";

export async function runProbeChild({ runProbes, readPriorVerdict, writeVerdict, notify }) {
  const verdict = await runProbes();
  // Notify ONLY on a NEWLY broken capability (broken now AND not broken before) so a
  // still-broken capability never re-nags every session; a fresh break is loud once.
  const wasBroken = new Set(
    (readPriorVerdict() ?? []).filter((p) => p.status === "broken").map((p) => p.capability),
  );
  const newlyBroken = verdict.filter((p) => p.status === "broken" && !wasBroken.has(p.capability));
  writeVerdict(verdict);
  for (const probe of newlyBroken) notify(probe);
  return { verdict, newlyBroken };
}

// npx is a shell-wrapped `.cmd` on Windows (unlike a real .exe) → platform switch,
// mirroring engine-seams.mjs's npm handling (ADR 0015).
const npxExe = (platform) => (platform === "win32" ? "npx.cmd" : "npx");

// Map the runner's per-module verdict onto the persisted shape session-health.mjs +
// formatHealthBanner read ({ capability, status, detail }). The structured `checks` are
// carried through too (ADR 0030 F7-ter, baby-step 5) so the banner can name each cause +
// its corrective gesture; `detail` keeps the flattened summary for the notification text
// and any legacy reader.
export function toBannerVerdict(modules) {
  return modules.map((m) => {
    const checks = m.checks ?? [];
    const bad = checks.filter((ch) => ch.status !== "ok");
    const detail = bad.length ? bad.map((ch) => `${ch.name}: ${ch.detail}`).join("; ") : m.status;
    return { capability: m.module, status: m.status, detail, checks };
  });
}

// ── main: wire the real I/O seams (deterministic glue, not unit-tested) ───────
// Runs in the DETACHED background child (a real health_check round-trip per module
// loads the embedder + searches → seconds) so session start never waits. Writes
// engine-health.json and OS-notifies only on a newly-broken capability. Fail-open:
// ALWAYS exit 0.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const brainDir = resolve(flag("brainDir") ?? join(__dirname, ".."));
  const platform = flag("platform") ?? process.platform;

  // FAIL-OPEN (#5): a missing/corrupt/partially-written (mid-update) engine-manifest.json
  // or .mcp.json must NEVER make this detached child exit non-zero. The JSON.parse reads
  // used to run synchronously OUTSIDE the promise chain → an uncaught throw escaped the
  // .catch and left the verdict cache silently un-refreshed. Wrap the WHOLE body so any
  // throw — sync read or async probe — routes to exit 0 (ALWAYS, the header's contract).
  try {
    const healthFile = join(brainDir, "engine-health.json");
    const manifest = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));
    const mcpServers = JSON.parse(readFileSync(join(brainDir, ".mcp.json"), "utf8")).mcpServers ?? {};

    const { isRegistered, callHealthCheck } = buildHeadlessHealthCheckCaller({
      mcpServers,
      brainDir,
      platform,
      // Light depth: file/DB reads only, zero ONNX (ADR 0030 §6) — the per-session probe
      // must never slow startup. The deeper full read (real embed+search) is verify-rag's job.
      depth: "light",
    });

    await runProbeChild({
      runProbes: async () => {
        const { modules } = await runActivatedHealthChecks({ manifest, isRegistered, callHealthCheck });
        return toBannerVerdict(modules);
      },
      readPriorVerdict: () =>
        existsSync(healthFile) ? JSON.parse(readFileSync(healthFile, "utf8")).verdict ?? null : null,
      writeVerdict: (verdict) => writeFileSync(healthFile, JSON.stringify({ verdict }, null, 2) + "\n"),
      notify: (probe) => {
        const child = spawn(
          npxExe(platform),
          ["tsx", "rag/src/notify-cli.ts", "Second brain — health check", `${probe.capability} is broken: ${probe.detail}`],
          { cwd: brainDir, detached: true, stdio: "ignore", windowsHide: true },
        );
        child.unref();
      },
    });
  } catch {
    // fail-open: swallow everything (a broken probe must never block / fail a session).
  }
  process.exit(0); // ALWAYS exit 0
}
