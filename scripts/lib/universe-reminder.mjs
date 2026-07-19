// ─────────────────────────────────────────────────────────────────────────────
// universe-reminder.mjs — the pure, I/O-free core of the SessionStart universe
// reminder (ADR 0034 Step 4). Given the committed registry and the active-universe
// pointer, it builds the compact chat nudge naming the active universe, or null
// when the progressive-disclosure gate is closed (a single-universe brain says
// nothing at all — exactly today's behaviour).
//
// Mirrors wiki-health-nudge.mjs: a pure nudge builder plus a hook-output wrapper.
// The ONLY Desktop-visible channel is the CHAT, and a SessionStart hook's
// `hookSpecificOutput.additionalContext` is injected into the agent's context, so
// the agent relays it into the chat; `systemMessage` is kept too (CLI-only).
// ─────────────────────────────────────────────────────────────────────────────
import { isMultiverse, listAllUniverses, DEFAULT_UNIVERSE } from "./universes.mjs";

/**
 * Builds the SessionStart reminder from the registry + active pointer, or null
 * when the gate is closed (fewer than two universes). Pure: no I/O, deterministic.
 */
export function universeReminder({ registry, active }) {
  if (!isMultiverse(registry)) return null;
  const current = active || DEFAULT_UNIVERSE;
  const all = listAllUniverses(registry);
  return `Active universe: '${current}' (of ${all.length}: ${all.join(", ")}).`;
}

/**
 * Wraps the nudge into the SessionStart hook output, or null when there is nothing
 * to emit. Mirrors buildWikiHealthHookOutput: the nudge rides `additionalContext`
 * (the only Desktop-visible channel), phrased as a DIRECTIVE the agent relays to
 * the user; `systemMessage` carries the raw fact (dropped on Desktop, shown on CLI).
 */
export function buildUniverseHookOutput(nudge) {
  if (!nudge) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        `[universe] ${nudge} Early in your next reply, briefly and in the user's language, ` +
        `remind the user which universe is active and that searches stay scoped to it plus ` +
        `their cross-cutting (default) notes. They can say "search all universes" to span them, ` +
        `or /switch to change universe. Mention it once, do not nag.`,
    },
    systemMessage: nudge,
  };
}
