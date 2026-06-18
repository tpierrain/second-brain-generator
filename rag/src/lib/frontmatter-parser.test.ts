import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "./frontmatter-parser.js";

test("prefers the frontmatter title over the filename fallback", () => {
  // Golden-source pages are named by Notion pageId (a UUID) and carry the real title
  // only in the frontmatter — with no '# Heading' in the body. Without this precedence,
  // parsed.title would be the UUID and the title chunk would be useless for retrieval.
  const raw = "---\ntitle: Naxos\nmirror: travel\n---\n";

  const parsed = parseDocument(raw, "mirrors/travel/8c1f2a3b.md");

  assert.equal(parsed.title, "Naxos");
});
