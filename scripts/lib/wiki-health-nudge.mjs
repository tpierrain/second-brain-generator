// ─────────────────────────────────────────────────────────────────────────────
// wiki-health-nudge.mjs — the pure, I/O-free core of Track F (ADR 0009 rung 1).
// Given the two STRUCTURED reports (lintVault's + consolidationCandidates'), it
// builds the compact SessionStart chat nudge — or null when nothing actionable.
//
// It surfaces ONLY the self-clearing / true-regression signals: consolidation
// candidates (stateless — they drop off once the page is refreshed) and dangling
// links (real breakage, always worth fixing). Orphans/stale/frontmatter are a
// standing backlog on a real vault → they stay in the on-demand /lint, never at
// session start (the noise guardrail).
// ─────────────────────────────────────────────────────────────────────────────

// Build the Track-F nudge from the two structured reports, or null when there is
// nothing actionable to surface. Pure: no I/O, deterministic.
export function wikiHealthNudge({ lintReport, consolidationReport }) {
  const dangling = lintReport.danglingLinks.length;
  const candidates = consolidationReport.newPages.length + consolidationReport.refreshes.length;
  if (dangling === 0 && candidates === 0) return null;

  const parts = [];
  if (candidates > 0) parts.push(`${candidates} consolidation candidates (offer /consolidate)`);
  if (dangling > 0) parts.push(`${dangling} dangling links (offer /lint)`);
  return parts.join(" and ");
}

// Wrap the nudge into the SessionStart hook output, or null when there's nothing
// to emit. Mirrors buildSelfHealHookOutput (session-self-heal.mjs): the ONLY
// Desktop-visible channel is the CHAT, and a SessionStart hook's
// `hookSpecificOutput.additionalContext` is injected into the agent's context, so
// the agent relays it into the chat. So the nudge rides additionalContext, phrased
// as a DIRECTIVE the agent surfaces to the user. `systemMessage` is kept too —
// dropped on Desktop (harmless), shown on the CLI.
export function buildWikiHealthHookOutput(nudge) {
  if (!nudge) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        `[wiki-health] The vault has pending housekeeping: ${nudge}. Early in your next reply, ` +
        `briefly and in the user's language, tell the user and offer to run the relevant command ` +
        `(/consolidate to promote raw captures into entity/topic pages, /lint for the full health ` +
        `report). This is OPTIONAL housekeeping — mention it once, do not nag, and NEVER auto-file: ` +
        `any consolidation write stays confirmed (propose → the user says yes).`,
    },
    systemMessage: nudge,
  };
}
