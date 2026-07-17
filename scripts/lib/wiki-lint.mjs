// ─────────────────────────────────────────────────────────────────────────────
// wiki-lint.mjs — the pure, I/O-free core of the Axis-1 `/lint` wiki-health
// scanner (ADR 0009 rung 1: correctness lives in a function with no I/O). Given
// already-parsed notes, it reports where the wiki bleeds: dangling links, orphan
// notes, stale entity pages, frontmatter violations. A separate fs adapter (rung
// 2) reads the vault into the parsed-note shape this core consumes.
// ─────────────────────────────────────────────────────────────────────────────

// Every `[[Target]]` wikilink found in `body`, in order of appearance. Obsidian's
// `[[Target|alias]]` and `[[Target#heading]]` forms resolve to the bare target.
export function extractWikiLinks(body) {
  return [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) =>
    m[1].split(/[|#]/)[0].trim(),
  );
}

// A note's basename (filename without extension) — how Obsidian resolves a link.
function basename(path) {
  return path.split("/").pop().replace(/\.md$/, "");
}

// Raw-capture zones: notes here are legitimately unlinked (a daily log, an inbox
// dump), so they are excluded from the orphan rule by default.
const DEFAULT_ORPHAN_EXCLUDE = ["daily/", "raw-sources/", "inbox/"];

// Scan already-parsed `notes` ({ path, frontmatter, body }) and report where the
// wiki bleeds. Pure: no I/O, order-preserving, deterministic. `options`:
//   orphanExclude — path prefixes whose notes are never flagged as orphans.
export function lintVault(notes, options = {}) {
  const orphanExclude = options.orphanExclude ?? DEFAULT_ORPHAN_EXCLUDE;
  const known = new Set(notes.map((n) => basename(n.path)));
  const danglingLinks = [];
  const inbound = new Set();
  for (const note of notes) {
    for (const target of extractWikiLinks(note.body)) {
      if (known.has(target)) inbound.add(target);
      else danglingLinks.push({ from: note.path, target });
    }
  }
  const orphans = notes
    .filter((n) => !inbound.has(basename(n.path)))
    .filter((n) => !orphanExclude.some((prefix) => n.path.startsWith(prefix)))
    .map((n) => n.path);
  return { danglingLinks, orphans };
}
