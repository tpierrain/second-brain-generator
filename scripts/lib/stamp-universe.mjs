// ─────────────────────────────────────────────────────────────────────────────
// stamp-universe.mjs — pure, dependency-free frontmatter stamper for the import
// router (ADR 0034 Step 6). Adds an additive `universe:` key to a note so its
// retrieval scope travels with the file. The launcher ships no gray-matter on the
// scripts side, so this is a focused string transform (mirrors wiki-lint-io's
// dependency-free frontmatter reader).
//
// Rules: additive only — never clobber an existing key, and a note that ALREADY
// declares a universe is returned untouched (an explicit scope always wins).
// ─────────────────────────────────────────────────────────────────────────────

// Matches a leading YAML frontmatter block: capture(1) = its inner lines,
// capture(2) = the body after the closing fence. CRLF-tolerant.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Returns `raw` with `universe: <name>` added to its frontmatter. If the note has
 * no frontmatter, a minimal block carrying only the universe is prepended. If it
 * already declares a `universe:` key, `raw` is returned UNCHANGED (never clobber).
 * Pure: no I/O.
 */
export function stampUniverse(raw, universe) {
  const match = raw.match(FRONTMATTER);
  if (!match) {
    // No frontmatter → create a minimal one, keep the body verbatim.
    return `---\nuniverse: ${universe}\n---\n\n${raw}`;
  }
  const [, inner, body] = match;
  if (/^universe:/m.test(inner)) return raw; // already scoped → leave it alone
  return `---\n${inner}\nuniverse: ${universe}\n---\n${body}`;
}
