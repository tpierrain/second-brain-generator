import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "./frontmatter-parser.js";
import { DEFAULT_UNIVERSE } from "./universe.js";

test("prefers the frontmatter title over the filename fallback", () => {
  // Local-mirror pages are named by Notion pageId (a UUID) and carry the real title
  // only in the frontmatter — with no '# Heading' in the body. Without this precedence,
  // parsed.title would be the UUID and the title chunk would be useless for retrieval.
  const raw = "---\ntitle: Naxos\nmirror: travel\n---\n";

  const parsed = parseDocument(raw, "mirrors/travel/8c1f2a3b.md");

  assert.equal(parsed.title, "Naxos");
});

test("exposes the mirror source_url from the frontmatter (clickable Notion link)", () => {
  const raw = "---\ntitle: Naxos\nsource_url: https://www.notion.so/abc\n---\n";

  const parsed = parseDocument(raw, "mirrors/travel/8c1f2a3b.md");

  assert.equal(parsed.sourceUrl, "https://www.notion.so/abc");
});

test("sourceUrl is null when the note has no source_url (non-mirror note)", () => {
  const raw = "---\ntitle: Plain\n---\n# Plain\n";

  const parsed = parseDocument(raw, "topics/plain.md");

  assert.equal(parsed.sourceUrl, null);
});

// --- type detection ---------------------------------------------------------

const PREFIX_TYPES: [string, string][] = [
  ["daily/", "daily"],
  ["people/", "person"],
  ["topics/", "topic"],
  ["decisions/", "decision"],
  ["meetings/", "meeting"],
  ["prep-1-1/", "prep-1-1"],
  ["prep-day/", "prep-day"],
  ["backlog/", "backlog"],
  ["coaching/", "coaching"],
  ["initiatives/", "initiative"],
  ["raw-sources/", "raw-source"],
  ["briefings/", "briefing"],
  ["domains/", "domain"],
  ["drafts/", "draft"],
  ["articles/", "article"],
];

for (const [prefix, expectedType] of PREFIX_TYPES) {
  test(`maps the "${prefix}" folder to type "${expectedType}"`, () => {
    const parsed = parseDocument("body", `${prefix}note.md`);
    assert.equal(parsed.type, expectedType);
  });
}

test("an explicit frontmatter type overrides the folder prefix", () => {
  const parsed = parseDocument("---\ntype: custom\n---\n", "topics/x.md");
  assert.equal(parsed.type, "custom");
});

test("falls back to type \"other\" for an unknown folder", () => {
  const parsed = parseDocument("body", "unknown-folder/x.md");
  assert.equal(parsed.type, "other");
});

// --- title extraction -------------------------------------------------------

test("trims surrounding whitespace from the frontmatter title", () => {
  const parsed = parseDocument("---\ntitle: '  Naxos  '\n---\n", "topics/x.md");
  assert.equal(parsed.title, "Naxos");
});

test("a blank frontmatter title does not win (falls through to the heading)", () => {
  const parsed = parseDocument("---\ntitle: '   '\n---\n# Real Heading\n", "topics/x.md");
  assert.equal(parsed.title, "Real Heading");
});

test("uses the first Markdown H1 heading when there is no frontmatter title", () => {
  const parsed = parseDocument("intro\n\n# The Heading\n\nbody", "topics/x.md");
  assert.equal(parsed.title, "The Heading");
});

test("falls back to the filename (without .md) when there is no title nor heading", () => {
  const parsed = parseDocument("just a body, no heading", "topics/sub/my-note.md");
  assert.equal(parsed.title, "my-note");
});

test("only treats a '#' at the start of a line as a heading", () => {
  // "C# is great" has a mid-line '# ' that must NOT be read as an H1 heading,
  // otherwise the title would become "is great" instead of the filename.
  const parsed = parseDocument("C# is great here\n", "topics/csharp.md");
  assert.equal(parsed.title, "csharp");
});

test("trims the extracted heading title", () => {
  const parsed = parseDocument("# Heading with trailing spaces   \nbody", "topics/x.md");
  assert.equal(parsed.title, "Heading with trailing spaces");
});

test("strips only the trailing .md extension from the filename", () => {
  // The '$' anchor matters: a literal '.md' earlier in the name must survive.
  const parsed = parseDocument("body", "topics/v2.md-notes.md");
  assert.equal(parsed.title, "v2.md-notes");
});

// --- tags -------------------------------------------------------------------

test("coerces every frontmatter tag to a string", () => {
  const parsed = parseDocument("---\ntags: [alpha, 42]\n---\n", "topics/x.md");
  assert.deepEqual(parsed.tags, ["alpha", "42"]);
});

test("yields an empty tag list when tags is absent or not an array", () => {
  assert.deepEqual(parseDocument("body", "topics/x.md").tags, []);
  assert.deepEqual(
    parseDocument("---\ntags: not-a-list\n---\n", "topics/x.md").tags,
    []
  );
});

// --- universe (ADR 0034) ----------------------------------------------------

test("falls back to the default universe when the frontmatter has none", () => {
  const parsed = parseDocument("---\ntitle: T\n---\n", "topics/x.md");
  assert.equal(parsed.universe, DEFAULT_UNIVERSE);
});

test("reads an explicit non-default universe from the frontmatter", () => {
  const parsed = parseDocument("---\nuniverse: acme\n---\n", "topics/x.md");
  assert.equal(parsed.universe, "acme");
});

test("ignores a non-string universe value (falls back to the default)", () => {
  const parsed = parseDocument("---\nuniverse: [not, a, string]\n---\n", "topics/x.md");
  assert.equal(parsed.universe, DEFAULT_UNIVERSE);
});

test("a blank universe does not win (falls back to the default)", () => {
  const parsed = parseDocument("---\nuniverse: '   '\n---\n", "topics/x.md");
  assert.equal(parsed.universe, DEFAULT_UNIVERSE);
});

test("trims surrounding whitespace from an explicit universe", () => {
  const parsed = parseDocument("---\nuniverse: '  acme  '\n---\n", "topics/x.md");
  assert.equal(parsed.universe, "acme");
});

// --- passthrough ------------------------------------------------------------

test("returns the body content with the frontmatter stripped", () => {
  const parsed = parseDocument("---\ntitle: T\n---\nhello world\n", "topics/x.md");
  assert.equal(parsed.content.trim(), "hello world");
  assert.equal(parsed.frontmatter.title, "T");
});
