#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// health-probe-run.mjs — the DETACHED probe child (ADR 0028, F7). Spawned by
// session-health.mjs at SessionStart, it runs the functional health probes with
// the REAL seams (a live canary search, the vector store, the engine MCP handshake),
// persists the fresh verdict to engine-health.json, and OS-notifies the moment a
// capability becomes NEWLY broken. Runs in the background → session start never waits.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runHealthProbes } from "./lib/health-probe.mjs";

export async function runProbeChild({ runProbes, readPriorVerdict, writeVerdict, notify }) {
  const verdict = runProbes();
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

// Total fail-open vitals: every field forces its seam to "unknown" (never a false
// "broken") when the rag helper can't run at all (spawn/parse failure).
const UNKNOWN_VITALS = {
  embedderMode: "unknown",
  keyConfigured: false,
  embedderReady: false,
  indexRows: -1,
  canaryHits: 0,
};

// Run the rag-side headless vitals helper (it owns the embedder + vector store the
// .mjs cannot import) and parse its single JSON line. Any failure → UNKNOWN_VITALS.
function gatherRagVitals({ brainDir, platform }) {
  try {
    const out = spawnSync(npxExe(platform), ["tsx", "rag/src/health-vitals.ts"], {
      cwd: brainDir,
      encoding: "utf8",
      windowsHide: true,
    });
    const parsed = JSON.parse((out.stdout ?? "").trim());
    return parsed && !parsed.error ? { ...UNKNOWN_VITALS, ...parsed } : UNKNOWN_VITALS;
  } catch {
    return UNKNOWN_VITALS;
  }
}

// Presence ping (Thomas's choice: presence, no live handshake) — an engine MCP server
// is "reachable" when it's registered in .mcp.json AND the entry file its args point
// at still exists on disk. A registered-but-vanished entry → not reachable → "broken".
function makePresencePinger(brainDir) {
  const mcpPath = join(brainDir, ".mcp.json");
  let servers = {};
  try {
    servers = JSON.parse(readFileSync(mcpPath, "utf8")).mcpServers ?? {};
  } catch {
    servers = {};
  }
  return (id) => {
    const def = servers[id];
    if (!def) return false;
    // The launch entry is the last arg that looks like a path into the brain
    // (e.g. ["tsx", "rag/src/index.ts"]); if none, presence in .mcp.json is enough.
    const entry = (def.args ?? []).find((a) => typeof a === "string" && a.includes("/"));
    return entry ? existsSync(join(brainDir, entry)) : true;
  };
}

// ── main: wire the real I/O seams (deterministic glue, not unit-tested) ───────
// Runs in the DETACHED background child (loading the embedder + searching takes
// seconds) so session start never waits. Writes engine-health.json and OS-notifies
// only on a newly-broken capability. Fail-open: ALWAYS exit 0.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const brainDir = resolve(flag("brainDir") ?? join(__dirname, ".."));
  const platform = flag("platform") ?? process.platform;
  const healthFile = join(brainDir, "engine-health.json");
  const manifest = JSON.parse(readFileSync(join(brainDir, "engine-manifest.json"), "utf8"));

  const vitals = gatherRagVitals({ brainDir, platform });
  const seams = {
    // "embedder ran, found nothing" → broken; "embedder unavailable" → throw → unknown.
    searchVault: () => {
      if (!vitals.embedderReady) throw new Error("embedder unavailable");
      return new Array(vitals.canaryHits);
    },
    indexRowCount: () => {
      if (vitals.indexRows < 0) throw new Error("index unreadable");
      return vitals.indexRows;
    },
    embedderMode: vitals.embedderMode,
    weightsPresent: () => vitals.embedderReady,
    keyConfigured: () => vitals.keyConfigured,
    pingServer: makePresencePinger(brainDir),
  };

  runProbeChild({
    runProbes: () => runHealthProbes({ manifest, seams }),
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
  })
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
}
