import { test } from "node:test";
import assert from "node:assert/strict";
import { callHeadlessHealthCheck, buildHeadlessHealthCheckCaller } from "./headless-health-check.mjs";

// callHeadlessHealthCheck (ADR 0030 §4/§6, F7-ter) is the runtime probe's HEADLESS
// `callHealthCheck`: it reads a module's on-disk state read-only (light depth) instead
// of doing an MCP round-trip that would boot a 2nd server next to the live one. Only
// vault-rag has a headless reader (rag/src/health-check-cli.ts) today; the CLI runner
// is injected so this is unit-testable without spawning anything.

test("callHeadlessHealthCheck — vault-rag → runs the headless CLI and returns its parsed verdict", async () => {
  let ran = null;
  const runCli = (opts) => {
    ran = opts;
    return '{"status":"ok","checks":[{"name":"canary","status":"ok","detail":"present (light)"}]}';
  };
  const verdict = await callHeadlessHealthCheck({
    module: "vault-rag",
    brainDir: "/brain",
    platform: "darwin",
    depth: "light",
    runCli,
  });
  assert.equal(verdict.status, "ok");
  assert.equal(verdict.checks[0].name, "canary");
  assert.ok(ran, "the headless CLI was actually invoked");
});

test("callHeadlessHealthCheck — a module with no headless reader → unknown, never boots/spawns", async () => {
  let called = false;
  const runCli = () => {
    called = true;
    return "{}";
  };
  const verdict = await callHeadlessHealthCheck({ module: "local-mirror", brainDir: "/brain", runCli });
  assert.equal(verdict.status, "unknown");
  assert.equal(called, false, "no headless reader → the runner is never invoked (no boot)");
});

test("callHeadlessHealthCheck — non-JSON CLI output → unknown (fail-open, never a false broken)", async () => {
  const verdict = await callHeadlessHealthCheck({
    module: "vault-rag",
    brainDir: "/brain",
    runCli: () => "tsx: command not found\n",
  });
  assert.equal(verdict.status, "unknown");
});

test("buildHeadlessHealthCheckCaller — isRegistered reads .mcp.json; callHealthCheck routes through the headless reader", async () => {
  const { isRegistered, callHealthCheck } = buildHeadlessHealthCheckCaller({
    mcpServers: { "vault-rag": { command: "sh" } },
    brainDir: "/brain",
    platform: "darwin",
    runCli: () => '{"status":"ok","checks":[]}',
  });
  assert.equal(isRegistered("vault-rag"), true);
  assert.equal(isRegistered("local-mirror"), false);
  const verdict = await callHealthCheck("vault-rag");
  assert.equal(verdict.status, "ok");
});
