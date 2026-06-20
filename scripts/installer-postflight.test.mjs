import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────────────────────
// #4 (code-review) regression guard for the installer post-flight.
//
// installer.mjs is one big top-level script with no injectable seam for the
// post-flight, so we can't drive it end-to-end deterministically. But the bug was
// structural: the embedder-READY branch dropped the `expectTools` smoke and verified
// ONLY the functional health_check, so a regression dropping a vault-rag tool
// (get_document / list_documents / vault_stats) would pass green. This guard pins the
// invariant at the source level: the READY branch must keep BOTH the structural tool
// -surface check (smokeTestMcp + expectTools: EXPECT_TOOLS) AND the functional gate
// (runActivatedHealthChecks). Cheap, deterministic, and it fails fail-first if either
// is ever removed from the ready path.
// ─────────────────────────────────────────────────────────────────────────────

const installerSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "installer.mjs"),
  "utf8",
);

// The embedder-ready branch: from `else if (embedderIsReady)` to the next top-level
// `} else {` (the not-ready branch). The structural + functional checks live here.
function readyBranch() {
  const start = installerSrc.indexOf("else if (embedderIsReady)");
  assert.notEqual(start, -1, "the post-flight must have an embedderIsReady branch");
  const end = installerSrc.indexOf("\n  } else {", start);
  assert.notEqual(end, -1, "the embedderIsReady branch must be followed by the not-ready else branch");
  return installerSrc.slice(start, end);
}

test("post-flight ready path STILL asserts the vault-rag tool surface (smokeTestMcp + expectTools)", () => {
  const branch = readyBranch();
  assert.match(
    branch,
    /smokeTestMcp\(/,
    "the embedder-ready post-flight must run a structural MCP smoke",
  );
  assert.match(
    branch,
    /expectTools:\s*EXPECT_TOOLS/,
    "the structural smoke must assert the full EXPECT_TOOLS surface on the ready path",
  );
});

test("post-flight ready path STILL runs the functional health_check gate", () => {
  const branch = readyBranch();
  assert.match(branch, /runActivatedHealthChecks\(/, "the ready path must keep the functional gate");
  assert.match(branch, /gateBlockers\(/, "the ready path must adjudicate via gateBlockers");
});

test("EXPECT_TOOLS still enumerates the four core vault-rag tools", () => {
  for (const tool of ["search_vault", "get_document", "list_documents", "vault_stats"]) {
    assert.match(installerSrc, new RegExp(`["']${tool}["']`), `EXPECT_TOOLS must include ${tool}`);
  }
});
