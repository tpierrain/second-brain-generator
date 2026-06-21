import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { smokeTestMcp } from "./mcp-smoke.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB = join(HERE, "__fixtures__", "stub-mcp-server.mjs");

const EXPECTED = ["search_vault", "get_document", "list_documents", "vault_stats"];

test("success: the server answers, all expected tools present", async () => {
  const res = await smokeTestMcp({
    command: process.execPath, // current node (cross-OS)
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000,
  });

  assert.equal(res.ok, true);
  for (const t of EXPECTED) assert.ok(res.tools.includes(t), `missing tool: ${t}`);
  assert.equal(res.error, undefined);
});

test("missing tool: ok=false even if the server answers", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000,
    env: { STUB_TOOLS: "search_vault,get_document,list_documents" }, // vault_stats missing
  });

  assert.equal(res.ok, false);
  assert.ok(res.tools.includes("search_vault")); // the actual list stays exposed
  assert.ok(!res.tools.includes("vault_stats"));
  assert.match(res.error ?? "", /vault_stats/); // the error names the missing one
});

test("timeout: silent server → ok=false, error timeout", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 300,
    env: { STUB_MODE: "silent" },
  });

  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /timeout/i);
});

test("sourced probe: search_vault cites a vault source → ok=true, probeText matches /vault\\//", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000,
    probe: { tool: "search_vault", args: { query: "demo" }, expectText: /vault\// },
  });

  assert.equal(res.ok, true);
  assert.match(res.probeText ?? "", /vault\//); // the response does cite a vault source
  assert.equal(res.error, undefined);
});

test("unsourced probe: empty/down RAG → ok=false, error names the missing source", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000,
    env: { STUB_SEARCH: "norag" }, // "No results found in the vault."
    probe: { tool: "search_vault", args: { query: "demo" }, expectText: /vault\// },
  });

  assert.equal(res.ok, false);
  assert.ok(res.tools.includes("search_vault")); // structural OK, it's the probe that fails
  assert.match(res.error ?? "", /source/i); // the error names the missing source
});

test("probe without expectText: returns the tool's text, ok=true when the call doesn't error", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000,
    env: { STUB_SEARCH: "health" },
    probe: { tool: "health_check", args: {} }, // no expectText → caller interprets probeText
  });

  assert.equal(res.ok, true);
  assert.equal(res.error, undefined);
  assert.equal(JSON.parse(res.probeText ?? "{}").status, "ok"); // structured verdict round-tripped
});

test("dying server: detected fast, ok=false, error ≠ timeout", async () => {
  const res = await smokeTestMcp({
    command: process.execPath,
    args: [STUB],
    cwd: HERE,
    expectTools: EXPECTED,
    timeoutMs: 5000, // large timeout: hitting it means we did NOT detect the death
    env: { STUB_MODE: "crash" },
  });

  assert.equal(res.ok, false);
  assert.ok(res.error, "an error must be set");
  assert.doesNotMatch(res.error ?? "", /timeout/i);
});
