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

test("a non-mirror note renders only the local link, no Notion link", () => {
  const text = formatSearchCitations([result()], "/brain/vault");

  assert.ok(text.includes("obsidian://open?path="), text);
  assert.ok(!text.includes("🔗"), text);
});
