#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// consolidate-scan.mjs — run FROM the brain folder to list what the wiki needs
// consolidated (Axis 1, Track C): entity/person mentions in raw captures that
// have no page yet (new-page candidates), and entity pages a fresher capture has
// left behind (refresh candidates).
//
// Deterministic, fail-loud, binary (ADR 0009): it exits 0 when there is nothing
// to consolidate / 1 when it finds candidates, so it composes in scripts. It is
// READ-ONLY — the merge (judgment) is the `consolidate` skill's fan-out and the
// write reuses Track B; this script only surfaces WHAT to consolidate.
//
//   node scripts/consolidate-scan.mjs            # scan ./vault
//   node scripts/consolidate-scan.mjs <dir>      # scan another vault path
// ─────────────────────────────────────────────────────────────────────────────
import { join } from "node:path";

import { readVaultNotes } from "./lib/wiki-lint-io.mjs";
import { consolidationCandidates, reportLines, hasCandidates } from "./lib/consolidation-candidates.mjs";
import { isEntrypoint } from "./lib/entrypoint.mjs";

// The scanned vault dir is displayed (and passed to the reader) in POSIX form so
// the output is identical across platforms — on Windows join() yields backslashes
// and resolve() prepends a drive letter. Cf. installer toPosix / document-scanner.
const toPosix = (p) => p.split("\\").join("/");

// Real wiring — the side effects, injected so runConsolidateScan stays unit-testable.
export const realConsolidateDeps = {
  cwd: () => process.cwd(),
  readNotes: readVaultNotes,
  log: (...a) => console.log(...a),
};

// Scan the vault and print an honest list of consolidation candidates. Returns
// the process exit code: 0 nothing to consolidate, 1 candidates found. All side
// effects come through `deps`.
export function runConsolidateScan(argv, deps = realConsolidateDeps) {
  const vaultDir = toPosix(argv[0] ? argv[0] : join(deps.cwd(), "vault"));
  const notes = deps.readNotes(vaultDir);
  const report = consolidationCandidates(notes);
  deps.log(`Scanned ${notes.length} notes under ${vaultDir}`);
  for (const line of reportLines(report)) deps.log(line);
  return hasCandidates(report) ? 1 : 0;
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  process.exit(runConsolidateScan(process.argv.slice(2)));
}
