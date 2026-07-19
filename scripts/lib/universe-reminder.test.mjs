import { test } from "node:test";
import assert from "node:assert/strict";
import {
  universeReminder,
  buildUniverseHookOutput,
} from "./universe-reminder.mjs";
import { DEFAULT_UNIVERSE } from "./universes.mjs";

// ── universeReminder: the SessionStart nudge, gated by progressive disclosure ──
test("universeReminder stays silent for a single-universe brain (below the gate)", () => {
  assert.equal(universeReminder({ registry: [], active: DEFAULT_UNIVERSE }), null);
});

test("universeReminder names the active universe and lists all once the gate is open", () => {
  const nudge = universeReminder({ registry: ["acme", "blue"], active: "acme" });
  assert.match(nudge, /Active universe: 'acme'/);
  // The full list, default first, appears so the user knows what to switch/span to.
  assert.match(nudge, /default, acme, blue/);
  // And the count (3) is stated.
  assert.match(nudge, /of 3/);
});

test("universeReminder falls back to the default when the active pointer is blank", () => {
  // Gate is open (a universe was created) but the active pointer is unset/blank →
  // the owner is on their cross-cutting default corpus, and we say so by name.
  const nudge = universeReminder({ registry: ["acme"], active: "" });
  assert.match(nudge, /Active universe: 'default'/);
});

// ── buildUniverseHookOutput: wrap the nudge for the SessionStart hook ─────────
test("buildUniverseHookOutput returns null when there is no nudge (gate closed)", () => {
  assert.equal(buildUniverseHookOutput(null), null);
});

test("buildUniverseHookOutput rides additionalContext (chat) and keeps systemMessage (CLI)", () => {
  const out = buildUniverseHookOutput("Active universe: 'acme' (of 2: default, acme).");

  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  // The chat channel embeds the fact AND instructs the agent to relay it.
  assert.match(out.hookSpecificOutput.additionalContext, /Active universe: 'acme'/);
  assert.match(out.hookSpecificOutput.additionalContext, /all universes/);
  assert.match(out.hookSpecificOutput.additionalContext, /switch/);
  // The CLI channel carries the raw fact.
  assert.equal(out.systemMessage, "Active universe: 'acme' (of 2: default, acme).");
});
