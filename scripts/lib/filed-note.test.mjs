import { test } from "node:test";
import assert from "node:assert/strict";

import { slugify, filedNotePath, renderFiledNote } from "./filed-note.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// filed-note — the pure, I/O-free core of Track B ("file the good answer back").
// Given a filing spec it builds a note that is conformant to the vault taxonomy
// BY CONSTRUCTION (ADR 0009 rung 1): correct path, complete frontmatter, woven
// [[links]] — so a filed-back answer never re-introduces the very defects /lint
// (Track A) detects. This block covers slugify (title → filename-safe slug).
// ═══════════════════════════════════════════════════════════════════════════

test("slugify — a two-word title becomes kebab-case, lowercased", () => {
  assert.equal(slugify("Jane Doe"), "jane-doe");
});

test("slugify — strips accents to plain ASCII (no accents in filenames)", () => {
  assert.equal(slugify("Café Résumé"), "cafe-resume");
});

test("slugify — collapses punctuation and repeated spaces to single hyphens, trimmed", () => {
  assert.equal(slugify("  RAG & Embeddings!  "), "rag-embeddings");
});

test("slugify — a title with no slug-able characters throws (fail-loud, not empty)", () => {
  assert.throws(() => slugify("!?…"), /empty slug|no slug-able/i);
});

// ── filedNotePath: the vault-relative path implied by type + title (+ date) ────

test("filedNotePath — a living page (topic) is <folder>/<slug>.md, no date", () => {
  assert.equal(
    filedNotePath({ type: "topic", title: "Capacity Management" }),
    "topics/capacity-management.md",
  );
});

test("filedNotePath — a person page lives under people/ (folder is not a naive plural)", () => {
  assert.equal(
    filedNotePath({ type: "person", title: "Jane Doe" }),
    "people/jane-doe.md",
  );
});

test("filedNotePath — a dated type (decision) is <folder>/<date>-<slug>.md", () => {
  assert.equal(
    filedNotePath({ type: "decision", title: "Adopt The Hive", date: "2026-07-17" }),
    "decisions/2026-07-17-adopt-the-hive.md",
  );
});

test("filedNotePath — a meeting is dated too, distinct from an undated topic", () => {
  assert.equal(
    filedNotePath({ type: "meeting", title: "Q3 Review", date: "2026-07-17" }),
    "meetings/2026-07-17-q3-review.md",
  );
});

test("filedNotePath — an unknown type throws, naming the supported types", () => {
  assert.throws(
    () => filedNotePath({ type: "recipe", title: "Whatever" }),
    /unknown type "recipe".*person.*topic.*decision.*meeting/is,
  );
});

test("filedNotePath — a dated type without a date throws (fail-loud)", () => {
  assert.throws(
    () => filedNotePath({ type: "decision", title: "Adopt The Hive" }),
    /decision.*requires a date/i,
  );
});

// ── universe-awareness (ADR 0034): a filed note lands in the active universe ────

test("filedNotePath — an active universe prefixes the path with <universe>/", () => {
  assert.equal(
    filedNotePath({ type: "person", title: "Jane Doe", universe: "acme" }),
    "acme/people/jane-doe.md",
  );
});

test("filedNotePath — a dated type under a universe keeps its date, prefixed", () => {
  assert.equal(
    filedNotePath({ type: "meeting", title: "Q3 Review", date: "2026-07-17", universe: "acme" }),
    "acme/meetings/2026-07-17-q3-review.md",
  );
});

test("filedNotePath — the default universe (and no universe) stays at the vault root", () => {
  assert.equal(filedNotePath({ type: "topic", title: "RAG", universe: "default" }), "topics/rag.md");
  assert.equal(filedNotePath({ type: "topic", title: "RAG" }), "topics/rag.md");
});

// ── renderFiledNote: a taxonomy-conformant { path, content } by construction ───

test("renderFiledNote — throws when today is missing (created/updated would be blank)", () => {
  assert.throws(
    () => renderFiledNote({ type: "topic", title: "X", tags: ["a"], body: "b", links: [] }),
    /today.*required/i,
  );
});

test("renderFiledNote — throws on empty tags (frontmatter conformance would break)", () => {
  assert.throws(
    () =>
      renderFiledNote({ type: "topic", title: "X", tags: [], body: "b", links: [], today: "2026-07-17" }),
    /at least one tag|tags.*required|non-empty/i,
  );
});

test("renderFiledNote — omitted links default to no Related section (not a crash)", () => {
  const note = renderFiledNote({
    type: "topic",
    title: "X",
    tags: ["a"],
    body: "b",
    today: "2026-07-17",
  });
  assert.equal(note.content.includes("## Related"), false);
});

test("renderFiledNote — with no links, omits the Related section entirely", () => {
  const note = renderFiledNote({
    type: "decision",
    title: "Adopt The Hive",
    tags: ["architecture"],
    body: "We go modular monolith.",
    links: [],
    date: "2026-07-17",
    today: "2026-07-17",
  });
  assert.deepEqual(note, {
    path: "decisions/2026-07-17-adopt-the-hive.md",
    content: `---
type: decision
created: 2026-07-17
updated: 2026-07-17
tags: [architecture]
---

# Adopt The Hive

We go modular monolith.
`,
  });
});

test("renderFiledNote — under an active universe, prefixes the path and stamps universe:", () => {
  const note = renderFiledNote({
    type: "topic",
    title: "Capacity Management",
    tags: ["rag"],
    body: "The distilled answer.",
    today: "2026-07-17",
    universe: "acme",
  });
  assert.deepEqual(note, {
    path: "acme/topics/capacity-management.md",
    content: `---
type: topic
created: 2026-07-17
updated: 2026-07-17
tags: [rag]
universe: acme
---

# Capacity Management

The distilled answer.
`,
  });
});

test("renderFiledNote — the default universe stamps no universe: key (root behaviour unchanged)", () => {
  const note = renderFiledNote({
    type: "topic",
    title: "X",
    tags: ["a"],
    body: "b",
    today: "2026-07-17",
    universe: "default",
  });
  assert.equal(note.path, "topics/x.md");
  assert.equal(note.content.includes("universe:"), false);
});

test("renderFiledNote — builds path + conformant frontmatter, body, and woven [[links]]", () => {
  const note = renderFiledNote({
    type: "topic",
    title: "Capacity Management",
    tags: ["rag", "retrieval"],
    body: "The distilled answer.",
    links: ["people/jane-doe", "topics/rag"],
    today: "2026-07-17",
  });
  assert.deepEqual(note, {
    path: "topics/capacity-management.md",
    content: `---
type: topic
created: 2026-07-17
updated: 2026-07-17
tags: [rag, retrieval]
---

# Capacity Management

The distilled answer.

## Related

- [[people/jane-doe]]
- [[topics/rag]]
`,
  });
});
