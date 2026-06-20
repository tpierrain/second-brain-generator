// ─────────────────────────────────────────────────────────────────────────────
// mcp-health-check.mjs — the real `callHealthCheck` seam (ADR 0030, F7-bis). Does
// an MCP round-trip via smokeTestMcp, calls the module's standard `health_check`
// tool, and parses its structured { status, checks[] } verdict. The three callers
// (installer post-flight, verify-rag, runtime probe) feed this to the pure
// runActivatedHealthChecks; smokeTestMcp is injected so this is unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import { smokeTestMcp } from "./mcp-smoke.mjs";

export async function callMcpHealthCheck({ server, platform = process.platform, smoke = smokeTestMcp }) {
  // npx/npm are shell-wrapped .cmd on Windows (cf. installer/verify-rag, ADR 0015).
  const command =
    platform === "win32" && /^(npx|npm)$/.test(server.command) ? `${server.command}.cmd` : server.command;
  const res = await smoke({
    command,
    args: server.args ?? [],
    cwd: server.cwd,
    probe: { tool: "health_check", args: {} },
  });
  // A registered server that won't even complete the handshake is wired-but-dead:
  // a DETERMINED break (mirrors the old presence/MCP probe), not an "unknown".
  if (!res.ok) {
    return {
      status: "broken",
      checks: [{ name: "reachability", status: "broken", detail: res.error ?? "server unreachable" }],
    };
  }
  // The server answered but with a non-verdict body → a contract violation we cannot
  // interpret: "unknown" (never a false "broken"), mirroring the no-cry-wolf rule.
  try {
    return JSON.parse(res.probeText);
  } catch {
    return {
      status: "unknown",
      checks: [{ name: "health_check", status: "unknown", detail: "health_check returned a non-JSON verdict" }],
    };
  }
}
