// ─────────────────────────────────────────────────────────────────────────────
// headless-health-check.mjs — the runtime probe's HEADLESS `callHealthCheck` seam
// (ADR 0030 §4/§6, F7-ter). It replaces the MCP round-trip (which would boot a 2nd
// `vault-rag` next to the live one) with a read-only, light-depth read of the on-disk
// state via the headless CLI (rag/src/health-check-cli.ts). No server boot, no spawn
// of a duplicate MCP. The CLI runner is injected so this is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";

// The real headless reader: run rag/src/health-check-cli.ts (read-only, no server, no
// reindex, no watcher — ADR 0030 §4) from the brain folder and capture its JSON line.
// Mirrors how health-probe-run.mjs spawns notify-cli (`npx tsx rag/src/<cli>.ts`); npx
// is a shell-wrapped .cmd on Windows (ADR 0015).
function defaultRunCli({ brainDir, platform = process.platform, depth = "light" }) {
  const npx = platform === "win32" ? "npx.cmd" : "npx";
  const res = spawnSync(npx, ["tsx", "rag/src/health-check-cli.ts", "--depth", depth], {
    cwd: brainDir,
    encoding: "utf8",
    // Light depth never loads ONNX, but keep parity with the loud gates: no startup toast.
    env: { ...process.env, SBG_NO_NOTIFY: "1" },
    windowsHide: true,
  });
  return res.stdout ?? "";
}

// Modules that expose a HEADLESS reader (no MCP boot needed). Today only vault-rag —
// its data/function (index, canary, embedder) is disk-readable via the headless CLI.
// A module without one (e.g. local-mirror, whose health lives in its MCP server) is
// NOT booted at runtime (the F7-ter North): it reports `unknown` — benign, no alarm.
const HEADLESS_READERS = new Set(["vault-rag"]);

export async function callHeadlessHealthCheck({ module, brainDir, platform, depth = "light", runCli }) {
  if (!HEADLESS_READERS.has(module)) {
    return {
      status: "unknown",
      checks: [
        { name: "headless", status: "unknown", detail: `${module}: no headless probe — not checked at runtime` },
      ],
    };
  }
  const stdout = await runCli({ brainDir, platform, depth });
  // Fail-open (ADR 0028/0030): a headless read that prints nothing parseable (CLI crash,
  // tsx missing, partial output) → "unknown", never a false "broken" that cries wolf.
  try {
    return JSON.parse(stdout);
  } catch {
    return {
      status: "unknown",
      checks: [
        { name: "health_check", status: "unknown", detail: "headless read returned a non-JSON verdict" },
      ],
    };
  }
}

// Mirrors buildHealthCheckCaller (the MCP one) so runActivatedHealthChecks is fed the
// same { isRegistered, callHealthCheck } shape — but callHealthCheck reads HEADLESS
// (no server boot) instead of an MCP round-trip. Used by the detached runtime probe.
export function buildHeadlessHealthCheckCaller({ mcpServers, brainDir, platform, depth = "light", runCli = defaultRunCli }) {
  const servers = mcpServers ?? {};
  return {
    isRegistered: (id) => Object.prototype.hasOwnProperty.call(servers, id),
    callHealthCheck: (id) => callHeadlessHealthCheck({ module: id, brainDir, platform, depth, runCli }),
  };
}
