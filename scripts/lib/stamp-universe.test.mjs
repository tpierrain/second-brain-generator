import { test } from "node:test";
import assert from "node:assert/strict";
import { stampUniverse } from "./stamp-universe.mjs";

// stampUniverse adds an additive `universe:` key to a note's frontmatter for the
// import router (ADR 0034 Step 6). It NEVER clobbers existing keys, and never
// touches a note that already declares a universe.

test("stampUniverse adds the universe key to existing frontmatter, keeping other keys and body", () => {
  const raw = "---\ntype: daily\ntags: [a, b]\n---\n\n# Title\n\nBody.\n";
  const out = stampUniverse(raw, "acme");

  assert.match(out, /^---\n/);
  assert.match(out, /universe: acme/);
  // Existing keys untouched.
  assert.match(out, /type: daily/);
  assert.match(out, /tags: \[a, b\]/);
  // Body preserved verbatim.
  assert.match(out, /# Title\n\nBody\.\n$/);
});

test("stampUniverse never clobbers a note that already declares a universe", () => {
  const raw = "---\ntype: topic\nuniverse: blue\n---\n\nBody.\n";
  // A different requested universe must NOT overwrite the existing one.
  assert.equal(stampUniverse(raw, "acme"), raw);
});

test("stampUniverse creates a minimal frontmatter block when the note has none", () => {
  const raw = "# Loose note\n\nNo frontmatter here.\n";
  const out = stampUniverse(raw, "acme");
  assert.equal(out, "---\nuniverse: acme\n---\n\n# Loose note\n\nNo frontmatter here.\n");
});
