import { test } from "node:test";
import assert from "node:assert/strict";
import { restartNudgeSegment, isRestartPending, RESTART_FLAG_REL } from "./restart-nudge.mjs";

// F-B7d (A2, hardened after Thomas's rig QA): a pre-3.3 brain's FIRST /update-engine runs
// the OLD orchestrator → silent report → the user doesn't restart → the new skill/MCP stay
// unloaded in the stale session. The OLD core never converges and never sets the flag, so a
// flag-only nudge would NEVER fire in that session. status-line therefore decides "restart
// pending" from EITHER signal: an on-disk delivered-but-not-installed GAP (covers the stale
// same-session window — the new status-line.mjs runs on the next refresh and sees the gap),
// OR the explicit FLAG (covers converged-but-this-session-hasn't-loaded-it).
test("isRestartPending — an on-disk gap alone → pending (the silent-first-update fix)", () => {
  assert.equal(isRestartPending({ flagExists: false, gapNeeded: true }), true);
});

test("isRestartPending — the flag alone → pending (converged-but-not-loaded)", () => {
  assert.equal(isRestartPending({ flagExists: true, gapNeeded: false }), true);
});

test("isRestartPending — neither signal → not pending (a converged, loaded brain stays clean)", () => {
  assert.equal(isRestartPending({ flagExists: false, gapNeeded: false }), false);
});

test("isRestartPending — both signals → still just pending (idempotent)", () => {
  assert.equal(isRestartPending({ flagExists: true, gapNeeded: true }), true);
});

// F-B7d (ship-blocker A2): the SessionStart self-heal nudge must reach Desktop, which
// drops `systemMessage` — so it rides the PERSISTENT statusLine instead. status-line.mjs
// calls this pure decider with "is a restart pending?" (the on-disk flag), and shows a
// loud, unmissable segment until a fresh session has loaded the converged engine.
test("restartNudgeSegment — pending → a loud, unmissable restart segment", () => {
  const seg = restartNudgeSegment(true);
  assert.ok(seg, "a pending restart must produce a segment");
  assert.match(seg, /restart/i);
  assert.match(seg, /⚠️/);
});

test("restartNudgeSegment — not pending → no segment (null), so the status line stays clean", () => {
  assert.equal(restartNudgeSegment(false), null);
});

// The flag the self-heal writes / status-line reads lives under the gitignored .cache/ so
// it never reaches the user's git history (cross-machine noise) — a per-checkout marker.
test("RESTART_FLAG_REL — a stable, gitignored .cache-relative path", () => {
  assert.match(RESTART_FLAG_REL, /^\.cache\//);
});
