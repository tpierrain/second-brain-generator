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

// Frontmatter `type` values that make a note a curated "entity page" (subject to
// the stale rule). Configurable via options.entityTypes.
const DEFAULT_ENTITY_TYPES = ["person", "topic", "company", "project", "concept"];

// A note goes stale when the freshest note linking to it is this many days newer.
const DEFAULT_STALE_DAYS = 90;

// Frontmatter keys every note is expected to carry. Configurable via options.
const DEFAULT_REQUIRED_FRONTMATTER = ["type", "created", "updated", "tags"];

// A required key counts as present only if it holds a non-empty value.
function isPresent(value) {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

const DAY_MS = 86_400_000;
function daysBetween(laterIso, earlierIso) {
  return (Date.parse(laterIso) - Date.parse(earlierIso)) / DAY_MS;
}

// Scan already-parsed `notes` ({ path, frontmatter, body }) and report where the
// wiki bleeds. Pure: no I/O, order-preserving, deterministic. `options`:
//   orphanExclude — path prefixes whose notes are never flagged as orphans.
//   entityTypes  — frontmatter `type` values treated as entity pages.
//   staleDays    — how many days behind its freshest reference makes an entity stale.
export function lintVault(notes, options = {}) {
  const orphanExclude = options.orphanExclude ?? DEFAULT_ORPHAN_EXCLUDE;
  const entityTypes = options.entityTypes ?? DEFAULT_ENTITY_TYPES;
  const staleDays = options.staleDays ?? DEFAULT_STALE_DAYS;
  const requiredFrontmatter = options.requiredFrontmatter ?? DEFAULT_REQUIRED_FRONTMATTER;

  const known = new Set(notes.map((n) => basename(n.path)));
  const danglingLinks = [];
  const inbound = new Set();
  const freshestReference = new Map(); // target basename → newest linking note's `updated`
  for (const note of notes) {
    for (const target of extractWikiLinks(note.body)) {
      if (!known.has(target)) {
        danglingLinks.push({ from: note.path, target });
        continue;
      }
      inbound.add(target);
      const when = note.frontmatter.updated;
      const seen = freshestReference.get(target);
      if (when && (!seen || Date.parse(when) > Date.parse(seen))) {
        freshestReference.set(target, when);
      }
    }
  }
  const orphans = notes
    .filter((n) => !inbound.has(basename(n.path)))
    .filter((n) => !orphanExclude.some((prefix) => n.path.startsWith(prefix)))
    .map((n) => n.path);

  const staleEntityPages = [];
  for (const note of notes) {
    if (!entityTypes.includes(note.frontmatter.type)) continue;
    const freshest = freshestReference.get(basename(note.path));
    const updated = note.frontmatter.updated;
    if (freshest && updated && daysBetween(freshest, updated) > staleDays) {
      staleEntityPages.push({ path: note.path, updated, freshestReference: freshest });
    }
  }
  const frontmatterViolations = [];
  for (const note of notes) {
    const missing = requiredFrontmatter.filter((key) => !isPresent(note.frontmatter[key]));
    if (missing.length > 0) frontmatterViolations.push({ path: note.path, missing });
  }
  return { danglingLinks, orphans, staleEntityPages, frontmatterViolations };
}
