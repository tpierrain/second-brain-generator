#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// session-wiki-health.mjs — SessionStart Axis-1 nudge (Track F). Runs the wiki's
// deterministic health scans on a real event (rung 3 of the determinism ladder,
// ADR 0009) so consolidation / dangling-link maintenance stops depending on the
// user remembering to ask — WITHOUT ever turning a silent auto-write loose.
//
// Determinism ladder: the TRIGGER is a deterministic hook (this), the DETECTION is
// the pure lint + consolidation cores (rung 1), the SURFACE is an additionalContext
// DIRECTIVE the agent relays in the chat (the only Desktop-visible channel), and the
// WRITE stays fully confirmed on-demand (/consolidate = propose → yes), never here.
//
// It surfaces ONLY the self-clearing / true-regression signals (consolidation
// candidates + dangling links); orphans/stale/frontmatter stay in the on-demand
// /lint (a standing backlog would spam every session). See wiki-health-nudge.mjs.
//
// Contract: quiet unless actionable, fail-open (never throws, the hook ALWAYS exits 0).
// Wired as a SessionStart hook AFTER session-self-heal.mjs (cf. .claude/settings.json).
// Cross-OS: pure Node.
// ─────────────────────────────────────────────────────────────────────────────
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readVaultNotes } from "./lib/wiki-lint-io.mjs";
import { lintVault } from "./lib/wiki-lint.mjs";
import { consolidationCandidates } from "./lib/consolidation-candidates.mjs";
import { wikiHealthNudge, buildWikiHealthHookOutput } from "./lib/wiki-health-nudge.mjs";

// Testable core: read the vault (injected), run the two deterministic scans, emit
// the nudge only when there's something actionable. Fail-open — a missing/odd vault
// must never disturb session start.
export function sessionWikiHealth({ readNotes, vaultDir, emit }) {
  try {
    const notes = readNotes(vaultDir);
    const nudge = wikiHealthNudge({
      lintReport: lintVault(notes),
      consolidationReport: consolidationCandidates(notes),
    });
    if (nudge) {
      emit(nudge);
      return { reported: true };
    }
  } catch {
    // swallow — fail-open; a scan hiccup must never break session start.
  }
  return { reported: false };
}

// ── main: wire the real read-only seams (deterministic glue, not unit-tested) ──
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const brainDir = resolve(__dirname, "..");
  const vaultDir = join(brainDir, "vault");
  let nudge = null;

  sessionWikiHealth({
    readNotes: readVaultNotes,
    vaultDir,
    emit: (msg) => (nudge = msg),
  });

  const output = buildWikiHealthHookOutput(nudge);
  if (output) {
    // additionalContext is the ONLY Desktop-visible channel (chat) — see buildWikiHealthHookOutput.
    process.stdout.write(JSON.stringify(output) + "\n");
  }
  process.exit(0); // fail-open: ALWAYS exit 0, never block session start
}
