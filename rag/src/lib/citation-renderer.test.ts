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

test("a mirror note renders both a real-file local link and a Notion link", () => {
  const text = formatSearchCitations(
    [result({ sourceUrl: "https://www.notion.so/abc" })],
    "/brain/vault"
  );

  // 🧠 local copy: a real-file `file://<absolute>` link, NOT an Obsidian custom
  // scheme. A click (where the renderer routes it) opens the note in the user's
  // DEFAULT Markdown editor (Typora, Obsidian, …) — editor-agnostic, editable.
  assert.ok(
    text.includes("file:///brain/vault/mirrors/facture/a.md"),
    text
  );
  // We must NOT emit the Obsidian-specific custom scheme anymore.
  assert.ok(!text.includes("obsidian://"), text);
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

test("a non-mirror note renders only the local file link, no Notion link", () => {
  const text = formatSearchCitations([result()], "/brain/vault");

  assert.ok(text.includes("file:///brain/vault/mirrors/facture/a.md"), text);
  assert.ok(!text.includes("🔗"), text);
});

test("each citation carries an 'ask me to open citation N' affordance, numbered + editor-agnostic", () => {
  // Claude Desktop only routes http(s), so a 🧠 file:// click can be dropped there
  // too. The block must therefore say, in plain text, how to actually open the note:
  // the user asks Claude, which uses the allowlisted opener to open it in WHATEVER
  // Markdown editor is the OS default (Typora, Obsidian, …) — never Obsidian-specific.
  // The number matches the citation heading so "open citation 2" is unambiguous.
  const text = formatSearchCitations(
    [result(), result({ title: "Second" })],
    "/brain/vault"
  );

  assert.ok(text.includes('open citation 1'), text);
  assert.ok(text.includes('open citation 2'), text);
  // Editor-agnostic wording — the affordance must not promise Obsidian.
  assert.ok(text.includes("Markdown editor"), text);
  assert.ok(!/in Obsidian/.test(text), text);
});
