import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSearchCitations } from "./citation-renderer.js";
import type { SearchResult } from "./vector-store.js";

function result(over: Partial<SearchResult> = {}): SearchResult {
  return {
    path: "mirrors/facture/a.md",
    title: "A note",
    type: "note",
    section: "Intro",
    content: "hello world",
    score: 0.42,
    ...over,
  };
}

test("a mirror note renders both a clickable local (obsidian) and Notion link", () => {
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/abc" })],
    "/brain/vault"
  );

  // 🧠 local copy: obsidian://open?path=<absolute, encoded> resolves the vault
  // from the absolute path (no vault-name guess).
  assert.ok(
    text.includes(
      "obsidian://open?path=" +
        encodeURIComponent("/brain/vault/mirrors/facture/a.md")
    ),
    text
  );
  // 🔗 Notion source: rendered as-is (already canonicalized at write time).
  assert.ok(text.includes("https://www.notion.so/abc"), text);
});

test("the Notion link is angle-bracket wrapped so a ')' in the URL can't break the markdown", () => {
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/a(b)c" })],
    "/brain/vault"
  );

  // CommonMark: a <…> link destination may contain parentheses → the closing
  // ')' of the URL no longer terminates the markdown link early.
  assert.ok(text.includes("(<https://www.notion.so/a(b)c>)"), text);
});

test("a '>' or space in the Notion url is percent-encoded so it can't break the <…> destination", () => {
  // parseDocument reads source_url from ANY note's frontmatter without validation
  // (hand-written / imported notes), so the renderer — the robust boundary — must
  // also survive characters that '<…>' wrapping alone doesn't: '>' closes the
  // destination early, and a raw space is illegal inside it.
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/a>b c" })],
    "/brain/vault"
  );

  assert.ok(text.includes("(<https://www.notion.so/a%3Eb%20c>)"), text);
});

test("a non-mirror note renders only the local link, no Notion link", () => {
  const text = formatSearchCitations([result()], "/brain/vault");

  assert.ok(text.includes("obsidian://open?path="), text);
  assert.ok(!text.includes("🔗"), text);
});

test("each citation carries an 'ask me to open citation N' affordance, numbered", () => {
  // The 🧠 obsidian:// click is silently dropped by Claude Desktop (custom schemes).
  // The block must therefore say, in plain text, how to actually open the note:
  // the user asks Claude, which uses the allowlisted opener. The number matches
  // the citation heading so "open citation 2" is unambiguous.
  const text = formatSearchCitations(
    [result(), result({ title: "Second" })],
    "/brain/vault"
  );

  assert.ok(text.includes('open citation 1'), text);
  assert.ok(text.includes('open citation 2'), text);
});
