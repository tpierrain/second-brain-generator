import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseNote, readVaultNotes } from "./wiki-lint-io.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// wiki-lint-io — the fs adapter (ADR 0009 rung 2) that reads a real vault into
// the parsed-note shape { path, frontmatter, body } the pure lint core consumes.
// parseNote is a dependency-free frontmatter reader (the launcher ships no
// gray-matter); readVaultNotes walks the vault and parses every .md file.
// ═══════════════════════════════════════════════════════════════════════════

test("parseNote — reads scalar frontmatter, an inline tags list, and the body", () => {
  const raw = "---\ntype: person\ncreated: 2026-01-01\nupdated: 2026-02-02\ntags: [a, b]\n---\nBody with [[Link]]";
  assert.deepEqual(parseNote(raw), {
    frontmatter: { type: "person", created: "2026-01-01", updated: "2026-02-02", tags: ["a", "b"] },
    body: "Body with [[Link]]",
  });
});

test("parseNote — a note without frontmatter yields empty frontmatter and the raw body", () => {
  assert.deepEqual(parseNote("# Just a title\n[[Link]]"), {
    frontmatter: {},
    body: "# Just a title\n[[Link]]",
  });
});

function vaultFixture(tree) {
  const dir = mkdtempSync(join(tmpdir(), "sbg-lint-"));
  for (const [rel, content] of Object.entries(tree)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test("readVaultNotes — parses every .md note with a relative POSIX path, skips non-md", (t) => {
  const dir = vaultFixture({
    "people/alice.md": "---\ntype: person\n---\nhi [[bob]]",
    "notes/b.md": "no frontmatter here",
    "attachments/pic.png": "binary",
  });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(readVaultNotes(dir).sort((a, b) => a.path.localeCompare(b.path)), [
    { path: "notes/b.md", frontmatter: {}, body: "no frontmatter here" },
    { path: "people/alice.md", frontmatter: { type: "person" }, body: "hi [[bob]]" },
  ]);
});
