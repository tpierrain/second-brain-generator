// ─────────────────────────────────────────────────────────────────────────────
// health-check-wiring.mjs — the shared .mcp.json → { isRegistered, callHealthCheck }
// resolution (ADR 0030, F7-bis). All three health-check callers (verify-rag.mjs, the
// installer post-flight, the runtime SessionStart probe) build this pair from the
// brain's parsed .mcp.json and feed it to runActivatedHealthChecks, so the
// server-lookup + MCP round-trip wiring lives in ONE tested place. The real seam
// (callMcpHealthCheck) is injectable so this is unit-testable without spawning.
// ─────────────────────────────────────────────────────────────────────────────

import { callMcpHealthCheck } from "./mcp-health-check.mjs";

export function buildHealthCheckCaller({ mcpServers, platform, timeoutMs, env, callHealthCheck = callMcpHealthCheck }) {
  const servers = mcpServers ?? {};
  return {
    isRegistered: (id) => Object.prototype.hasOwnProperty.call(servers, id),
    // timeoutMs/env are threaded to the seam: the loud gates (verify-rag, installer
    // post-flight) pass 60 s headroom + SBG_NO_NOTIFY; the detached runtime probe
    // leaves them undefined (it wants the default timeout AND the OS notification).
    callHealthCheck: (id) => callHealthCheck({ server: servers[id], platform, timeoutMs, env }),
  };
}
