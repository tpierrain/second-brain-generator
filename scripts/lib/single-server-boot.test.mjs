import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

// F7-ter invariant (ADR 0030 §4/§6): a probe must NEVER boot a `vault-rag` server when
// one may already be running. The server-booting builder is `buildHealthCheckCaller`
// (scripts/lib/health-check-wiring.mjs → MCP stdio child). The runtime probe and
// verify-rag must read HEADLESS instead (buildHeadlessHealthCheckCaller). Only the
// installer post-flight may boot — nothing runs at install time, and booting under the
// real .mcp.json/PATH/ABI is the deployment test (ADR 0021). This guard pins exactly
// that, so a future edit can't silently re-introduce the `fc2e4bb` regression.
const BOOTING_BUILDER = "buildHealthCheckCaller";

test("the runtime probe never imports the server-booting builder (headless only)", () => {
  assert.ok(
    !read("scripts/health-probe-run.mjs").includes(BOOTING_BUILDER),
    "health-probe-run.mjs must read headless, never boot a 2nd vault-rag",
  );
});

test("verify-rag never imports the server-booting builder (headless only)", () => {
  assert.ok(
    !read("scripts/verify-rag.mjs").includes(BOOTING_BUILDER),
    "verify-rag.mjs must read headless, never boot a 2nd vault-rag",
  );
});

test("the installer post-flight is the one place that still boots (positive control)", () => {
  // Proves the detector actually works: the SAME substring IS present where a boot is
  // legitimate — otherwise the two guards above could pass on a typo and prove nothing.
  assert.ok(
    read("installer.mjs").includes(BOOTING_BUILDER),
    "installer post-flight is the only legitimate server boot (ADR 0021)",
  );
});
