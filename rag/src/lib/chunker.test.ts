import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkMarkdown } from "./chunker.js";

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
