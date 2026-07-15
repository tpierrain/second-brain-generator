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
  const chunks = chunkMarkdown("## History\n\nSome island history.", "Naxos");

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
  const chunks = chunkMarkdown("## History\n\nSome island history.");

  assert.ok(chunks.every((c) => c.section !== "(title)"));
  assert.ok(chunks.some((c) => c.content.includes("island history")));
});

test("each heading becomes its own section chunk, in order, as `heading\\n\\nbody`", () => {
  const md = "# Alpha\n\nFirst body.\n\n## Beta\n\nSecond body.";

  const chunks = chunkMarkdown(md);

  // The heading text drives the section name (regex capture + trim), the body lines
  // are joined under it, and the chunk content is exactly `heading\n\nbody`.
  assert.deepEqual(chunks, [
    { section: "Alpha", content: "Alpha\n\nFirst body.", index: 0 },
    { section: "Beta", content: "Beta\n\nSecond body.", index: 1 },
  ]);
});

test("body before any heading lands under `(intro)`, and empty-body sections are dropped", () => {
  // Text precedes the first heading → it must be captured under the synthetic
  // `(intro)` heading; the trailing heading with no body must NOT yield a chunk.
  const chunks = chunkMarkdown("Intro text.\n\n# Empty Section");

  assert.deepEqual(chunks, [
    { section: "(intro)", content: "(intro)\n\nIntro text.", index: 0 },
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
  const md = "# Head  \n\nFirst line\nSecond line\n\n## Next\n\nRefer to ## later";

  const chunks = chunkMarkdown(md);

  assert.deepEqual(chunks, [
    { section: "Head", content: "Head\n\nFirst line\nSecond line", index: 0 },
    { section: "Next", content: "Next\n\nRefer to ## later", index: 1 },
  ]);
});

test("the title is trimmed and seeded first, then body chunks follow in increasing index order", () => {
  const chunks = chunkMarkdown("## History\n\nSome history.", "  Naxos  ");

  assert.deepEqual(chunks[0], { section: "(title)", content: "Naxos", index: 0 });
  assert.equal(chunks[1].index, 1, "the body chunk follows the title (index increments, not decrements)");
});

test("a heading-only section (empty body) between two headings yields no chunk", () => {
  // `# A` has no body before `# B` → it must be skipped entirely, not emitted as
  // an empty `A\n\n` chunk.
  const chunks = chunkMarkdown("# A\n\n# B\n\nbody");

  assert.deepEqual(chunks, [{ section: "B", content: "B\n\nbody", index: 0 }]);
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

// ── Equivalent mutants (mutation audit, Step 3-rag) ──────────────────────────
// Stryker reaches ~85.9% here; the 12 remaining survivors are EQUIVALENT mutants —
// they cannot change observable behaviour, so no test can kill them. Effective score
// on non-equivalent mutants is 73/73 = 100%. Grouped by reason:
//   • `currentBody.length > 0` → `>= 0` / `true` (lines 35, 44): the only currentBody
//     of length 0 is an empty section, which is filtered downstream by the
//     `if (!bodyTrimmed) continue` guard — so pushing it changes nothing.
//   • `fullText.length <= MAX` → `<` / `false` (line 66): on content that fits, the
//     split path is the identity (splitAtParagraphs returns the whole as one piece),
//     so "always split" and the exact `<` boundary produce the same single chunk.
//   • `current.length > 0` → `>= 0` / `true` (line 15) and `if (current.trim())` →
//     `if (current)` / `if (true)` (line 22): `current` is only empty/whitespace-only
//     before the first paragraph or after a trimmed body, neither of which co-occurs
//     with the surrounding condition — the guard never actually fires differently.
//   • heading regex `(.+)$` → `(.+)` (drop `$`) and `\s+` → `\s`: `.+` is greedy (so
//     `$` is redundant) and `headingMatch[1].trim()` erases the extra-space difference.


