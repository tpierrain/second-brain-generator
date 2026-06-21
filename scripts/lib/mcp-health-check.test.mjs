import { test } from "node:test";
import assert from "node:assert/strict";
import { callMcpHealthCheck } from "./mcp-health-check.mjs";

// The real callHealthCheck seam (ADR 0030, F7-bis): does an MCP round-trip via
// smokeTestMcp, calls the module's standard `health_check`, and parses its structured
// { status, checks[] } verdict. smoke is injected so the seam is unit-tested without
// spawning a process. The three callers feed this to runActivatedHealthChecks.

const SERVER = { command: "node", args: ["rag/src/index.ts"], cwd: "/brain" };

test("a server whose health_check returns ok → the parsed verdict is returned", async () => {
  const verdict = { status: "ok", checks: [{ name: "canary", status: "ok", detail: "found (8)" }] };
  const result = await callMcpHealthCheck({
    server: SERVER,
    smoke: async () => ({ ok: true, tools: ["health_check"], probeText: JSON.stringify(verdict) }),
  });
  assert.deepEqual(result, verdict);
});

test("a registered server that won't answer the handshake → broken (determined deadness)", async () => {
  const result = await callMcpHealthCheck({
    server: SERVER,
    smoke: async () => ({ ok: false, tools: [], error: "timeout" }),
  });
  assert.equal(result.status, "broken");
  assert.match(result.checks[0].detail, /timeout/);
});

test("a server that answers with a non-JSON verdict → unknown (cannot conclude, never a false broken)", async () => {
  const result = await callMcpHealthCheck({
    server: SERVER,
    smoke: async () => ({ ok: true, tools: ["health_check"], probeText: "not a verdict" }),
  });
  assert.equal(result.status, "unknown");
});

test("timeoutMs and env are forwarded to the smoke seam (in-process headroom + no toast)", async () => {
  let seen;
  await callMcpHealthCheck({
    server: SERVER,
    timeoutMs: 60000,
    env: { SBG_NO_NOTIFY: "1" },
    smoke: async (opts) => {
      seen = opts;
      return { ok: true, tools: ["health_check"], probeText: JSON.stringify({ status: "ok", checks: [] }) };
    },
  });
  assert.equal(seen.timeoutMs, 60000);
  assert.deepEqual(seen.env, { SBG_NO_NOTIFY: "1" });
});

test("on Windows, an npx/npm server command gets the .cmd suffix (ADR 0015 parity)", async () => {
  let seenCommand;
  await callMcpHealthCheck({
    server: { command: "npx", args: ["tsx", "rag/src/index.ts"], cwd: "/brain" },
    platform: "win32",
    smoke: async (opts) => {
      seenCommand = opts.command;
      return { ok: true, tools: ["health_check"], probeText: JSON.stringify({ status: "ok", checks: [] }) };
    },
  });
  assert.equal(seenCommand, "npx.cmd");
});
