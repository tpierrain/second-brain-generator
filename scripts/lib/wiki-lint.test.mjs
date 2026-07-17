import { test } from "node:test";
import assert from "node:assert/strict";

import { extractWikiLinks, lintVault } from "./wiki-lint.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// wiki-lint — the pure, I/O-free core of the Axis-1 `/lint` wiki-health scanner
// (ADR 0009 rung 1: correctness in a function with no I/O). Given already-parsed
// notes it reports where the wiki bleeds: dangling links, orphans, stale entity
// pages, frontmatter violations. This block covers wikilink extraction.
// ═══════════════════════════════════════════════════════════════════════════

test("extractWikiLinks — pulls a single [[Target]] out of body text", () => {
  assert.deepEqual(extractWikiLinks("see [[Foo]] for details"), ["Foo"]);
});

test("extractWikiLinks — pulls every link in order, ignoring single [brackets]", () => {
  assert.deepEqual(
    extractWikiLinks("[[Zeta]] then a [decoy] and [[Alpha]]"),
    ["Zeta", "Alpha"],
  );
});

test("extractWikiLinks — resolves the target, dropping |alias and #heading", () => {
  assert.deepEqual(
    extractWikiLinks("[[Real Note|shown text]] and [[Page#Section]]"),
    ["Real Note", "Page"],
  );
});

// ── dangling links: a [[link]] whose target basename matches no note ──────────

test("lintVault — flags a link whose target note is absent, keeps resolved ones", () => {
  const report = lintVault([
    { path: "notes/a.md", frontmatter: {}, body: "[[Missing]] but [[Alice]] exists" },
    { path: "people/Alice.md", frontmatter: {}, body: "" },
  ]);
  assert.deepEqual(report.danglingLinks, [{ from: "notes/a.md", target: "Missing" }]);
});

// ── orphans: a note nobody links to ───────────────────────────────────────────

test("lintVault — flags the note with zero inbound links, not the linked ones", () => {
  const report = lintVault([
    { path: "a.md", frontmatter: {}, body: "[[b]]" },
    { path: "b.md", frontmatter: {}, body: "[[a]]" },
    { path: "c.md", frontmatter: {}, body: "nobody links here" },
  ]);
  assert.deepEqual(report.orphans, ["c.md"]);
});

test("lintVault — raw-capture zones (daily/, raw-sources/, inbox/) are never orphans", () => {
  const report = lintVault([
    { path: "daily/2026-07-17.md", frontmatter: {}, body: "" },
    { path: "raw-sources/dump.md", frontmatter: {}, body: "" },
    { path: "inbox/scratch.md", frontmatter: {}, body: "" },
    { path: "topic.md", frontmatter: {}, body: "" },
  ]);
  assert.deepEqual(report.orphans, ["topic.md"]);
});
