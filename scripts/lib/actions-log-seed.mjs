// ─────────────────────────────────────────────────────────────────────────────
// actions-log-seed.mjs — Track E: make the append-only activity ledger a SEEDED,
// first-class artifact instead of a `sync-sources` side-effect. This is the pure
// core (ADR 0009 rung 1): the seed CONTENT and the SessionStart hook OUTPUT, both
// I/O-free. The fs write-if-absent seam lives below (`seedActionsLog`), mirroring
// staged-health-note.mjs.
//
// The seed is /lint-conformant BY CONSTRUCTION so a freshly-seeded brain stays
// clean (Track F "silent on day one"): it carries the required frontmatter, is a
// non-entity `type: log` (never stale), the linter orphan-excludes it (a grep-able
// ledger is a raw zone, like daily/), and the format example lives in a code fence
// so `extractWikiLinks` never mistakes it for a real (dangling) link.
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// The ledger's canonical home — the exact path `sync-sources` appends to (Step 5).
export const ACTIONS_LOG_REL = "vault/actions-log.md";

// The initial ledger: conformant frontmatter + a header that documents the
// append-only, grep-able convention, with the entry format shown inside a code
// fence (so it is documentation, not a linkified `[[link]]`). `today` is injected
// (no ambient clock in the pure core) as an ISO `YYYY-MM-DD` string.
export function initialActionsLog(today) {
  return `---
type: log
created: ${today}
updated: ${today}
tags: [activity-log, ledger]
---

# Activity log

Append-only ledger of what you did through this brain — one flat line per action,
newest appended at the bottom, never rewritten (a grep-able file). \`sync-sources\`
appends here automatically; you can append by hand too.

Format — one \`##\` line per action:

\`\`\`markdown
## [YYYY-MM-DD] <action> — #channel [[people/recipient]]
\`\`\`

Usage: *"what did I do about X?"* → \`grep -i "X" ${ACTIONS_LOG_REL}\`.
`;
}

// Write the initial ledger into the brain if it is not already there — the fs seam
// (ADR 0009 rung 2). NEVER overwrites an existing ledger (it may hold real history).
// Idempotent: safe to call at install AND on every SessionStart. Returns whether it
// wrote this time (`seeded`) and whether the ledger is now present (`present`).
export function seedActionsLog({ brainDir, today }) {
  const dest = join(brainDir, ACTIONS_LOG_REL);
  if (existsSync(dest)) return { seeded: false, present: true };
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, initialActionsLog(today));
  return { seeded: true, present: existsSync(dest) };
}

// Wrap the seed outcome into the SessionStart hook output — or null when nothing
// was seeded (the ledger already existed → stay SILENT, the noise guardrail Track F
// locked). Mirrors buildWikiHealthHookOutput: the only Desktop-visible channel is
// the chat, so the note rides `additionalContext` as a DIRECTIVE the agent relays,
// once, when an upgrader's brain first gains the ledger. `systemMessage` is kept for
// the CLI (dropped on Desktop, harmless).
export function buildActionsLogHookOutput(seeded) {
  if (!seeded) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        `[activity-log] I just created your append-only activity ledger at ${ACTIONS_LOG_REL}. ` +
        `Early in your next reply, briefly and in the user's language, mention it once: it is where ` +
        `sync-sources appends one grep-able line per action taken through the brain (and where you ` +
        `can file actions by hand). Mention it a single time, do not nag.`,
    },
    systemMessage: `Created the append-only activity ledger (${ACTIONS_LOG_REL}).`,
  };
}
