// ═══════════════════════════════════════════════════════════════════════════
// install-handoff.mjs — the deterministic end-of-install banner.
//
// Field QA (PR #10) showed the single most-missed step: the install window is
// the LAUNCHER, not the brain. The brain only works in a NEW conversation ROOTED
// in its folder — Desktop first (what non-devs use), terminal second. A free-form
// hand-off kept collapsing back to a bare `cd … && claude` line, which silently
// breaks everything for a non-dev (no auto-commit, repeated permission prompts).
//
// So we make the hand-off DETERMINISTIC (ADR 0009): the installer prints this
// banner verbatim as the very last thing on screen, and the priming CLAUDE.md
// tells the driving model to relay it verbatim instead of composing its own.
//
// Pure builder — returns the banner LINES (no ANSI, so it stays testable). Colour,
// if wanted, is applied at the wiring site in installer.mjs.
// ═══════════════════════════════════════════════════════════════════════════

const RULE = "═".repeat(74);

// Builds the end-of-install hand-off banner.
//   target — absolute path of the created brain folder
//   name   — the brain's name (= basename of target / the --name arg)
//   demo   — the example question to suggest as a first message
export function buildHandoff({ target, name, demo }) {
  return [
    "",
    RULE,
    "  ⚠️  THIS WINDOW IS THE INSTALLER (the launcher) — NOT your second brain.",
    RULE,
    "",
    `  Your brain "${name}" is ready in:  ${target}`,
    "",
    "  To USE it, you must open a NEW conversation ROOTED in that folder.",
    "  Switching the folder of THIS conversation is NOT enough — it must be a new one.",
    "",
    "  🖱️  OPTION 1 — CLAUDE DESKTOP APP  (the common case, no terminal):",
    "      • Open a NEW conversation (New session).",
    "      • Just above the input field, click the FOLDER CHIP (not the ➕).",
    `      • In the Recent menu, pick your brain "${name}"`,
    `        (or “Open folder…” → ${target}).`,
    `      • The ✓ must jump to "${name}" before you write your first message.`,
    "",
    "  ⌨️  OPTION 2 — TERMINAL  (for the more technical):",
    `      cd ${target} && claude`,
    "",
    "  Then ask your first question, e.g.:",
    `      "${demo}"`,
    "      → Claude answers from the vault, sources cited.",
    "",
    RULE,
    "  Optional, later, FROM INSIDE the brain (never re-run the installer for it):",
    "      • Purge the example notes:  node scripts/clear-example-notes.mjs",
    "      • Make it yours: edit CLAUDE.md, add your own notes.",
    RULE,
    "",
  ];
}
