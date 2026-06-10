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

// Deletes the exemple-tagged notes under <rootDir>/vault. Returns deleted paths
// (empty if there is no vault/ — nothing to do).
export function clearExamples(rootDir) {
  const vaultDir = join(rootDir, "vault");
  if (!existsSync(vaultDir)) return [];
  return clearExampleNotes(vaultDir);
}

function main(argv) {
  const root = process.cwd();
  const noReindex = argv.includes("--no-reindex");

  const deleted = clearExamples(root);
  if (deleted.length === 0) {
    console.log("Nothing to do: no example notes found (already removed).");
    return 0;
  }
  for (const f of deleted) console.log(`  🗑️  removed ${f}`);
  console.log(`✓ ${deleted.length} example note(s) removed.`);

  if (noReindex) return 0;

  const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = spawnSync(NPM, ["run", "--silent", "reindex"], {
    cwd: join(root, "rag"),
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("✗ re-index failed — run it by hand:  cd rag && npm run reindex");
    return 1;
  }
  console.log("✓ RAG re-indexed — your brain has forgotten the example notes.");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
