import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown } from "./chunker.js";
import { CHUNK_MAX_CHARS } from "./config.js";

test("title-only doc (empty body) still yields at least one chunk carrying the title", () => {
  // A Notion page with a meaningful title but no body (the live F8 case: 0 chunkable lines)
  // used to produce 0 chunks and get silently dropped → invisible to search.
  const chunks = chunkMarkdown("", "Naxos");

  assert.ok(chunks.length >= 1, "a titled doc must never collapse to 0 chunks");
  assert.ok(
    chunks.some((c) => c.content.includes("Naxos")),
    "the title must be present in the vectorized text"
  );
});

test("a doc with a body still gets its title seeded as a search signal", () => {
  const chunks = chunkMarkdown(
    "## History\n\nThis is a substantial passage recounting the island history in detail.",
    "Naxos"
  );

  assert.ok(
    chunks.some((c) => c.section === "(title)" && c.content === "Naxos"),
    "the title chunk must be present alongside the body chunks"
  );
  assert.ok(
    chunks.some((c) => c.content.includes("island history")),
    "the body chunks must still be produced"
  );
});

test("no title given → behaves as before (body-only chunks)", () => {
  const chunks = chunkMarkdown(
    "## History\n\nThis is a substantial passage recounting the island history in detail."
  );

  assert.ok(chunks.every((c) => c.section !== "(title)"));
  assert.ok(chunks.some((c) => c.content.includes("island history")));
});

test("each heading becomes its own section chunk, in order, as `heading\\n\\nbody`", () => {
  const md =
    "# Alpha\n\nThe first section body has plenty of real words here.\n\n## Beta\n\nThe second section body has plenty of real words too.";

  const chunks = chunkMarkdown(md);

  // The heading text drives the section name (regex capture + trim), the body lines
  // are joined under it, and the chunk content is exactly `heading\n\nbody`.
  assert.deepEqual(chunks, [
    { section: "Alpha", content: "Alpha\n\nThe first section body has plenty of real words here.", index: 0 },
    { section: "Beta", content: "Beta\n\nThe second section body has plenty of real words too.", index: 1 },
  ]);
});

test("body before any heading lands under `(intro)`, and empty-body sections are dropped", () => {
  // Text precedes the first heading → it must be captured under the synthetic
  // `(intro)` heading; the trailing heading with no body must NOT yield a chunk.
  const chunks = chunkMarkdown(
    "Introductory text with clearly enough meaningful words here.\n\n# Empty Section"
  );

  assert.deepEqual(chunks, [
    { section: "(intro)", content: "(intro)\n\nIntroductory text with clearly enough meaningful words here.", index: 0 },
  ]);
});

test("a section longer than CHUNK_MAX_CHARS is split into ordered pieces under the same section", () => {
  // Three ~4000-char paragraphs → `heading\n\nbody` exceeds the 8000-char ceiling,
  // so splitAtParagraphs must break it on paragraph boundaries (never mid-paragraph),
  // keep the pieces in order, and keep them all under the same heading.
  const p1 = "ALPHA" + "a".repeat(3995);
  const p2 = "BETA" + "b".repeat(3996);
  const p3 = "GAMMA" + "g".repeat(3995);
  const md = `# Big\n\n${p1}\n\n${p2}\n\n${p3}`;

  const chunks = chunkMarkdown(md);

  assert.equal(chunks.length, 3, "must split into 3 pieces, not collapse to one");
  assert.ok(chunks.every((c) => c.section === "Big"), "every piece keeps its section");
  assert.deepEqual(chunks.map((c) => c.index), [0, 1, 2], "pieces stay in order");
  // First piece carries the heading joined to the first paragraph by a blank line.
  assert.ok(chunks[0].content.startsWith("Big\n\nALPHA"));
  assert.ok(chunks[1].content.startsWith("BETA"));
  assert.ok(chunks[2].content.startsWith("GAMMA"));
  // No piece is padded with stray leading/trailing whitespace (the trims).
  assert.ok(chunks.every((c) => c.content === c.content.trim()));
});

test("a multi-line body keeps its line-breaks when flushed by the next heading; mid-line #'s stay in the body", () => {
  // `# Head` has a two-line body flushed when `## Next` arrives (joins body on \n, not "");
  // the trailing heading whitespace is trimmed; `Refer to ## later` starts with text, so its
  // mid-line `##` must NOT be promoted to a heading (the `^` anchor).
  const md =
    "# Head  \n\nFirst meaningful line of text\nSecond meaningful line of text\n\n## Next\n\nRefer to ## later in this sufficiently long line";

  const chunks = chunkMarkdown(md);

  assert.deepEqual(chunks, [
    { section: "Head", content: "Head\n\nFirst meaningful line of text\nSecond meaningful line of text", index: 0 },
    { section: "Next", content: "Next\n\nRefer to ## later in this sufficiently long line", index: 1 },
  ]);
});

test("the title is trimmed and seeded first, then body chunks follow in increasing index order", () => {
  const chunks = chunkMarkdown(
    "## History\n\nSome substantial history worth several meaningful words.",
    "  Naxos  "
  );

  assert.deepEqual(chunks[0], { section: "(title)", content: "Naxos", index: 0 });
  assert.equal(chunks[1].index, 1, "the body chunk follows the title (index increments, not decrements)");
});

test("a heading-only section (empty body) between two headings yields no chunk", () => {
  // `# A` has no body before `# B` → it must be skipped entirely, not emitted as
  // an empty `A\n\n` chunk.
  const chunks = chunkMarkdown("# A\n\n# B\n\nThe B section carries a real body with enough words here.");

  assert.deepEqual(chunks, [
    { section: "B", content: "B\n\nThe B section carries a real body with enough words here.", index: 0 },
  ]);
});

test("when splitting a long section, blank-line runs collapse and each piece is whitespace-trimmed", () => {
  // A run of 3+ newlines must collapse to a single paragraph separator (\n\n+),
  // and each emitted piece must be trimmed of stray edge whitespace.
  const huge = "x".repeat(CHUNK_MAX_CHARS); // forces the split path
  const md = `# Big\n\nPARA-A\n\n\nPARA-B   \n\n   ${huge}`;

  const chunks = chunkMarkdown(md);

  // The 3-newline run between A and B is normalized to a single blank line.
  assert.ok(chunks[0].content.includes("PARA-A\n\nPARA-B"));
  assert.ok(!chunks[0].content.includes("PARA-A\n\n\nPARA-B"));
  // No piece carries leading/trailing whitespace (the two trims in splitAtParagraphs).
  assert.ok(chunks.every((c) => c.content === c.content.trim()));
});

test("packing fills a piece up to exactly CHUNK_MAX_CHARS before splitting (no off-by-one early split)", () => {
  // `H\n\n` + p1 reaches exactly CHUNK_MAX_CHARS → it must NOT split yet (boundary is
  // `> max`, not `>= max`); the small p2 then overflows → 2 pieces, not 3.
  const p1 = "y".repeat(CHUNK_MAX_CHARS - 3); // 1 ("H") + 2 ("\n\n") + (max-3) === max
  const p2 = "zzzzz";
  const md = `# H\n\n${p1}\n\n${p2}`;

  const chunks = chunkMarkdown(md);

  assert.equal(chunks.length, 2, "the heading+p1 piece packs up to the limit; only p2 spills over");
});

// ── Degenerate-body pruning (Track A) ────────────────────────────────────────
// Empty template scaffolds (`---` rules, placeholder comments, bare list stubs)
// carry no searchable content but pollute the index. They are pruned — while the
// title chunk and the F8 title-only invariant above stay untouched.

test("a section whose body carries no meaningful text (a `---` rule) is pruned", () => {
  // A divider-only section has zero letters/digits → it is index noise, not content.
  const chunks = chunkMarkdown(
    "# Real\n\nThis is a clearly substantial paragraph with plenty of real words.\n\n# Divider\n\n---"
  );

  assert.deepEqual(chunks, [
    {
      section: "Real",
      content: "Real\n\nThis is a clearly substantial paragraph with plenty of real words.",
      index: 0,
    },
  ]);
});

test("a stub body with only a handful of meaningful chars (a placeholder comment) is pruned", () => {
  // `<!-- TODO -->` has just 4 letters — far below the meaningful floor → still index noise,
  // even though it is not literally empty of letters. Forces a count-and-threshold, not a
  // "has at least one letter" test.
  const chunks = chunkMarkdown(
    "# Real\n\nThis is a clearly substantial paragraph with plenty of real words.\n\n# Stub\n\n<!-- TODO -->"
  );

  assert.deepEqual(chunks, [
    {
      section: "Real",
      content: "Real\n\nThis is a clearly substantial paragraph with plenty of real words.",
      index: 0,
    },
  ]);
});

test("the meaningful-char floor is inclusive: exactly 25 is kept, 24 is pruned", () => {
  // Locks the `>=` boundary (kills `> 25`): a body with exactly MIN_BODY_MEANINGFUL_CHARS
  // meaningful chars survives; one fewer is pruned to nothing (no title here).
  const body25 = "abcdefghijklmnopqrstuvwxy"; // 25 letters
  const body24 = "abcdefghijklmnopqrstuvwx"; // 24 letters

  assert.deepEqual(chunkMarkdown(`# S\n\n${body25}`), [
    { section: "S", content: `S\n\n${body25}`, index: 0 },
  ]);
  assert.deepEqual(chunkMarkdown(`# S\n\n${body24}`), []);
});

test("only letters/digits count toward the floor — punctuation and whitespace don't lift a stub over it", () => {
  // 24 letters padded with punctuation/spaces still scores 24 meaningful → pruned.
  // Kills a mutant that would count all characters instead of just \p{L}\p{N}.
  const chunks = chunkMarkdown("# S\n\nabcdefghijklmnopqrstuvwx  ...  ???  ---  !!!");

  assert.deepEqual(chunks, []);
});

test("a URL-only section is KEPT — a saved link carries enough alphanumerics to be real content", () => {
  // Decision (Track A): a bookmark-style section holding just a link is real, searchable
  // content, not scaffold noise → kept (the URL's letters/digits clear the floor).
  const chunks = chunkMarkdown("# Link\n\nhttps://example.com/some/long/article-path-here");

  assert.deepEqual(chunks, [
    { section: "Link", content: "Link\n\nhttps://example.com/some/long/article-path-here", index: 0 },
  ]);
});

test("a code-snippet-only section is KEPT — code carries searchable identifiers/keywords", () => {
  // Decision (Track A): a fenced code block is real content whose identifiers clear the
  // floor → kept, not scaffold noise.
  const chunks = chunkMarkdown(
    "# Snippet\n\n```ts\nconst total = items.reduce((a, b) => a + b, 0);\n```"
  );

  assert.deepEqual(chunks, [
    {
      section: "Snippet",
      content: "Snippet\n\n```ts\nconst total = items.reduce((a, b) => a + b, 0);\n```",
      index: 0,
    },
  ]);
});

test("an image-only section with no descriptive alt text is pruned — nothing textual to search", () => {
  // Decision (Track A): a bare image embed with an empty/near-empty alt has no searchable
  // text → pruned. (A descriptive alt would clear the floor and keep it — covered by the
  // substantial-body cases.)
  const chunks = chunkMarkdown("# Pic\n\n![](assets/x.png)");

  assert.deepEqual(chunks, []);
});

test("a bare list-marker stub (`- `) is pruned — zero meaningful chars", () => {
  const chunks = chunkMarkdown("# Todo\n\n- ");

  assert.deepEqual(chunks, []);
});

test("a titled page whose only section body is degenerate still yields the title chunk (F8)", () => {
  // The body (`---`) is pruned as noise, yet the unconditional title chunk survives →
  // an effectively title-only page stays embedded and findable by title. The pruning
  // filter must NEVER reach the title chunk.
  const chunks = chunkMarkdown("# Heading\n\n---", "Naxos");

  assert.deepEqual(chunks, [{ section: "(title)", content: "Naxos", index: 0 }]);
});

// ── Equivalent mutants (mutation audit, Step 3-rag + Track A) ─────────────────
// Stryker reaches 87.37% here (83 killed / 12 survived); the 12 survivors are all
// EQUIVALENT mutants — they cannot change observable behaviour, so no test can kill
// them. Effective score on non-equivalent mutants is 83/83 = 100%. The Track A
// `isSubstantialBody` guard added mutants that are ALL killed (boundary + char-class
// tests) — it contributes zero survivors. Grouped by reason:
//   • `currentBody.length > 0` → `>= 0` / `true` (lines 48, 57): the only currentBody
//     of length 0 is an empty section, whose body has 0 meaningful chars and so is
//     filtered downstream by the `isSubstantialBody` guard — pushing it changes nothing.
//   • `fullText.length <= MAX` → `<` / `false` (line 79): on content that fits, the
//     split path is the identity (splitAtParagraphs returns the whole as one piece),
//     so "always split" and the exact `<` boundary produce the same single chunk.
//   • `current.length > 0` → `>= 0` / `true` (line 15) and `if (current.trim())` →
//     `if (current)` / `if (true)` (line 22): `current` is only empty/whitespace-only
//     before the first paragraph or after a trimmed body, neither of which co-occurs
//     with the surrounding condition — the guard never actually fires differently.
//   • heading regex `(.+)$` → `(.+)` (drop `$`) and `\s+` → `\s`: `.+` is greedy (so
//     `$` is redundant) and `headingMatch[1].trim()` erases the extra-space difference.


