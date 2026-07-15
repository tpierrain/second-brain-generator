#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// clear-example-notes.mjs — run FROM the brain folder to remove the fictional
// example notes (Flemmr, Pélagie, …) after the first-launch wiring test.
//
// Tag-based (frontmatter `tags: [..., exemple]`), so it works regardless of the
// installed locale (the FR/EN example files have different names). It deletes the
// tagged notes and re-indexes the RAG so the brain "forgets" them. The vault
// README and the harness backlog are NOT tagged → preserved by construction.
//
//   node scripts/clear-example-notes.mjs              # delete + re-index
//   node scripts/clear-example-notes.mjs --no-reindex # delete only (tests/CI)
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { clearExampleNotes } from "./lib/example-notes.mjs";
import { needsShell } from "./lib/spawn-shell.mjs";

// Deletes the exemple-tagged notes under <rootDir>/vault. Returns deleted paths
// (empty if there is no vault/ — nothing to do).
export function clearExamples(rootDir) {
  const vaultDir = join(rootDir, "vault");
  if (!existsSync(vaultDir)) return [];
  return clearExampleNotes(vaultDir);
}

// Real wiring for runClear — the actual side effects, injected so the glue is
// unit-testable (spawnSync/console/cwd/platform behind a port).
export const realClearDeps = {
  cwd: () => process.cwd(),
  clear: clearExamples,
  spawnSync,
  platform: process.platform,
  log: (...a) => console.log(...a),
  error: (...a) => console.error(...a),
};

// Deletes the example notes and re-indexes the RAG (unless --no-reindex).
// Returns the process exit code. All side effects come through `deps`.
export function runClear(argv, deps = realClearDeps) {
  const root = deps.cwd();
  const noReindex = argv.includes("--no-reindex");

  const deleted = deps.clear(root);
  if (deleted.length === 0) {
    deps.log("Nothing to do: no example notes found (already removed).");
    return 0;
  }
  for (const f of deleted) deps.log(`  🗑️  removed ${f}`);
  deps.log(`✓ ${deleted.length} example note(s) removed.`);

  if (noReindex) return 0;

  const NPM = deps.platform === "win32" ? "npm.cmd" : "npm";
  const r = deps.spawnSync(NPM, ["run", "--silent", "reindex"], {
    cwd: join(root, "rag"),
    stdio: "inherit",
    // npm.cmd needs a shell since Node ≥ 18.20 (CVE-2024-27980) or EINVAL; no-op POSIX (ADR 0031).
    shell: needsShell(NPM, deps.platform),
  });
  if (r.status !== 0) {
    deps.error("✗ re-index failed — run it by hand:  cd rag && npm run reindex");
    return 1;
  }
  deps.log("✓ RAG re-indexed — your brain has forgotten the example notes.");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runClear(process.argv.slice(2)));
}
