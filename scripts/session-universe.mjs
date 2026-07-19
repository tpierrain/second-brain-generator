#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// session-universe.mjs — SessionStart universe reminder (ADR 0034 Step 4). On a
// real event (rung 3 of the determinism ladder, ADR 0009) it reads the universe
// state and, ONLY past the progressive-disclosure gate (>= 2 universes), surfaces
// which universe is active so the owner never silently searches the wrong scope.
//
// Below the gate it says nothing at all: a single-universe brain behaves exactly
// as today (progressive disclosure). The SURFACE is an additionalContext directive
// the agent relays in the chat (the only Desktop-visible channel); no writes here.
//
// Contract: quiet below the gate, fail-open (never throws, ALWAYS exits 0).
// Wired as a SessionStart hook AFTER session-self-heal.mjs (cf. .claude/settings.json).
// Cross-OS: pure Node.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readRegistry, readActiveUniverse, vaultRagDir } from "./lib/universes.mjs";
import { universeReminder, buildUniverseHookOutput } from "./lib/universe-reminder.mjs";

// Testable core: read the universe state (injected), build the reminder, emit it
// only past the gate. Fail-open — odd/missing state must never disturb session start.
export function sessionUniverseReminder({ readState, dir, emit }) {
  try {
    const { registry, active } = readState(dir);
    const nudge = universeReminder({ registry, active });
    if (nudge) {
      emit(nudge);
      return { reported: true };
    }
  } catch {
    // swallow — fail-open; a state hiccup must never break session start.
  }
  return { reported: false };
}

// ── main: wire the real read-only seams (deterministic glue, not unit-tested) ──
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const io = {
    existsSync,
    readFileSync: (p) => readFileSync(p, "utf-8"),
  };
  const brainDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let nudge = null;

  sessionUniverseReminder({
    dir: vaultRagDir(brainDir),
    readState: (dir) => ({
      registry: readRegistry(io, dir),
      active: readActiveUniverse(io, dir),
    }),
    emit: (msg) => (nudge = msg),
  });

  const output = buildUniverseHookOutput(nudge);
  if (output) {
    // additionalContext is the ONLY Desktop-visible channel (chat) — see buildUniverseHookOutput.
    process.stdout.write(JSON.stringify(output) + "\n");
  }
  process.exit(0); // fail-open: ALWAYS exit 0, never block session start
}
