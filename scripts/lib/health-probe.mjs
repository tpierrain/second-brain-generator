// ─────────────────────────────────────────────────────────────────────────────
// health-probe.mjs — the pure probe registry for the SessionStart health-check
// (ADR 0028, F7). Runs deterministic functional probes over the engine's real
// capabilities and returns a verdict array [{ capability, status, detail }] where
// status ∈ "ok" | "broken" | "unknown".
//
// Pure & injectable (no fs / no search / no MCP handshake here) so the registry is
// trivially testable: the wrapper feeds it the REAL seams (a live canary search,
// the vector store, the MCP ping). Every probe FAILS OPEN to "unknown" — a probe
// must never throw out of runHealthProbes, and "unknown" never cries wolf.
// ─────────────────────────────────────────────────────────────────────────────

const CANARY_TOKEN = "Mollecuisse";

// Wrap a probe so any thrown error becomes a fail-open "unknown" verdict instead of
// propagating out of runHealthProbes (ADR 0028: the hook must always exit 0).
function failOpen(capability, probe) {
  try {
    return probe();
  } catch (err) {
    return { capability, status: "unknown", detail: `probe error: ${err.message}` };
  }
}

function probeRag({ searchVault }) {
  const results = searchVault(CANARY_TOKEN);
  return results.length > 0
    ? { capability: "rag", status: "ok", detail: `canary found (${results.length})` }
    : { capability: "rag", status: "broken", detail: "canary not found in the vault" };
}

function probeIndex({ indexRowCount }) {
  const rows = indexRowCount();
  return rows > 0
    ? { capability: "index", status: "ok", detail: `${rows} rows` }
    : { capability: "index", status: "broken", detail: "index empty or unreadable" };
}

function probeEmbedder({ embedderMode, weightsPresent, keyConfigured }) {
  if (embedderMode === "in-process") {
    return weightsPresent()
      ? { capability: "embedder", status: "ok", detail: "in-process weights present" }
      : { capability: "embedder", status: "broken", detail: "in-process weights missing" };
  }
  return keyConfigured()
    ? { capability: "embedder", status: "ok", detail: `${embedderMode} key configured` }
    : { capability: "embedder", status: "unknown", detail: `${embedderMode} key not configured` };
}

function probeMcp({ engineServers, pingServer }) {
  const dead = engineServers.filter((id) => !pingServer(id));
  return dead.length === 0
    ? { capability: "mcp", status: "ok", detail: `${engineServers.length} servers reachable` }
    : { capability: "mcp", status: "broken", detail: `unreachable: ${dead.join(", ")}` };
}

export function runHealthProbes({ manifest, seams }) {
  const engineServers = manifest.engineMcpServers ?? [];
  return [
    failOpen("rag", () => probeRag(seams)),
    failOpen("index", () => probeIndex(seams)),
    failOpen("embedder", () => probeEmbedder(seams)),
    failOpen("mcp", () => probeMcp({ engineServers, pingServer: seams.pingServer })),
  ];
}
