#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// lint-vault.mjs — run FROM the brain folder to health-check the wiki (Axis 1).
//
// Deterministic, fail-loud, binary (ADR 0009): it reports where the wiki bleeds
// — dangling [[links]], orphan notes, stale entity pages, malformed frontmatter —
// and exits 0 when clean / 1 when it finds issues, so it composes in scripts.
//
//   node scripts/lint-vault.mjs            # health-check ./vault
//   node scripts/lint-vault.mjs <dir>      # health-check another vault path
// ─────────────────────────────────────────────────────────────────────────────
import { join, resolve } from "node:path";

import { readVaultNotes } from "./lib/wiki-lint-io.mjs";
import { lintVault, reportLines, hasFindings } from "./lib/wiki-lint.mjs";
import { isEntrypoint } from "./lib/entrypoint.mjs";

// Real wiring — the side effects, injected so runLint stays unit-testable.
export const realLintDeps = {
  cwd: () => process.cwd(),
  readNotes: readVaultNotes,
  log: (...a) => console.log(...a),
  error: (...a) => console.error(...a),
};

// Scan the vault and print an honest health report. Returns the process exit
// code: 0 clean, 1 issues found. All side effects come through `deps`.
export function runLint(argv, deps = realLintDeps) {
  const vaultDir = argv[0] ? resolve(argv[0]) : join(deps.cwd(), "vault");
  const notes = deps.readNotes(vaultDir);
  const report = lintVault(notes);
  deps.log(`Scanned ${notes.length} notes under ${vaultDir}`);
  for (const line of reportLines(report)) deps.log(line);
  return hasFindings(report) ? 1 : 0;
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  process.exit(runLint(process.argv.slice(2)));
}
