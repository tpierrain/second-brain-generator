import { test } from "node:test";
import assert from "node:assert/strict";

import { extractWikiLinks, lintVault, hasFindings, reportLines } from "./wiki-lint.mjs";

const CLEAN = { danglingLinks: [], orphans: [], staleEntityPages: [], frontmatterViolations: [] };

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

test("extractWikiLinks — ignores [[links]] inside an inline `code` span (Obsidian doesn't linkify code)", () => {
  assert.deepEqual(
    extractWikiLinks("a real [[Foo]] but `[[Bar]]` is just syntax"),
    ["Foo"],
  );
});

test("extractWikiLinks — ignores [[links]] inside a fenced ``` code block, keeps links after it", () => {
  const body = "before [[Keep]]\n```\nexample: [[InCode]]\n```\nafter [[AlsoKeep]]";
  assert.deepEqual(extractWikiLinks(body), ["Keep", "AlsoKeep"]);
});

// ── dangling links: a [[link]] whose target basename matches no note ──────────

test("lintVault — flags a link whose target note is absent, keeps resolved ones", () => {
  const report = lintVault([
    { path: "notes/a.md", frontmatter: {}, body: "[[Missing]] but [[Alice]] exists" },
    { path: "people/Alice.md", frontmatter: {}, body: "" },
  ]);
  assert.deepEqual(report.danglingLinks, [{ from: "notes/a.md", target: "Missing" }]);
});

test("lintVault — the same broken link repeated in one note is reported once", () => {
  const report = lintVault([
    { path: "a.md", frontmatter: {}, body: "[[Missing]] and again [[Missing]]" },
  ]);
  assert.deepEqual(report.danglingLinks, [{ from: "a.md", target: "Missing" }]);
});

test("lintVault — resolves path-form links [[folder/note]] and [[folder/note.md]]", () => {
  const report = lintVault([
    { path: "topics/rag.md", frontmatter: {}, body: "" },
    { path: "notes/x.md", frontmatter: {}, body: "see [[topics/rag]] and [[topics/rag.md]]" },
  ]);
  assert.deepEqual(report.danglingLinks, []);
  assert.deepEqual(report.orphans, ["notes/x.md"]); // topics/rag has an inbound link now
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

test("lintVault — the append-only ledger (actions-log.md) is a raw zone, never an orphan", () => {
  const report = lintVault([
    { path: "actions-log.md", frontmatter: { type: "log" }, body: "" },
    { path: "topic.md", frontmatter: {}, body: "" },
  ]);
  assert.deepEqual(report.orphans, ["topic.md"]);
});

// ── stale entity pages: an entity note left behind by fresher notes citing it ──

test("lintVault — flags an entity page older than the freshest note linking to it", () => {
  const report = lintVault([
    { path: "people/alice.md", frontmatter: { type: "person", updated: "2026-01-01" }, body: "" },
    { path: "notes/meeting.md", frontmatter: { updated: "2026-06-01" }, body: "met [[alice]]" },
  ]);
  assert.deepEqual(report.staleEntityPages, [
    { path: "people/alice.md", updated: "2026-01-01", freshestReference: "2026-06-01" },
  ]);
});

test("lintVault — exactly at the threshold is not stale, and non-entities never are", () => {
  const report = lintVault([
    // entity, freshest reference exactly 90 days later (Jan1→Apr1) — on the border, not past it
    { path: "people/bob.md", frontmatter: { type: "person", updated: "2026-01-01" }, body: "" },
    { path: "notes/a.md", frontmatter: { updated: "2026-04-01" }, body: "[[bob]]" },
    // plain note far behind its reference, but no entity type → never stale
    { path: "notes/plain.md", frontmatter: { updated: "2026-01-01" }, body: "" },
    { path: "notes/b.md", frontmatter: { updated: "2026-12-01" }, body: "[[plain]]" },
  ]);
  assert.deepEqual(report.staleEntityPages, []);
});

// ── frontmatter conformance: required keys present ────────────────────────────

test("lintVault — lists the required frontmatter keys a note is missing", () => {
  const report = lintVault([
    { path: "bad.md", frontmatter: { type: "person" }, body: "" },
    {
      path: "good.md",
      frontmatter: { type: "topic", created: "2026-01-01", updated: "2026-01-02", tags: ["x"] },
      body: "",
    },
  ]);
  assert.deepEqual(report.frontmatterViolations, [
    { path: "bad.md", missing: ["created", "updated", "tags"] },
  ]);
});

test("lintVault — an empty string or empty array counts as a missing required key", () => {
  const report = lintVault([
    { path: "empties.md", frontmatter: { type: "topic", created: "2026-01-01", updated: "", tags: [] }, body: "" },
  ]);
  assert.deepEqual(report.frontmatterViolations, [
    { path: "empties.md", missing: ["updated", "tags"] },
  ]);
});

// ── hasFindings: drives the CLI's binary exit code ────────────────────────────

test("hasFindings — false when every category is empty", () => {
  assert.equal(hasFindings(CLEAN), false);
});

test("hasFindings — true when any single category is non-empty", () => {
  assert.equal(hasFindings({ ...CLEAN, danglingLinks: [{ from: "a", target: "b" }] }), true);
  assert.equal(hasFindings({ ...CLEAN, orphans: ["a.md"] }), true);
  assert.equal(hasFindings({ ...CLEAN, staleEntityPages: [{ path: "e.md" }] }), true);
  assert.equal(hasFindings({ ...CLEAN, frontmatterViolations: [{ path: "f.md", missing: ["type"] }] }), true);
});

// ── reportLines: the human-readable, honest health report ─────────────────────

test("reportLines — a clean vault reports a single reassuring line", () => {
  assert.deepEqual(reportLines(CLEAN), ["✓ Wiki health: clean"]);
});

test("reportLines — a dangling-only report shows just the dangling section", () => {
  const report = { ...CLEAN, danglingLinks: [{ from: "notes/a.md", target: "Missing" }] };
  assert.deepEqual(reportLines(report), [
    "✗ Wiki health: issues found",
    "",
    "Dangling links (1):",
    "  notes/a.md → [[Missing]]",
  ]);
});

test("reportLines — orphans render one path per line", () => {
  const report = { ...CLEAN, orphans: ["c.md", "d.md"] };
  assert.deepEqual(reportLines(report), [
    "✗ Wiki health: issues found",
    "",
    "Orphans (2):",
    "  c.md",
    "  d.md",
  ]);
});

test("reportLines — a stale entity page shows its date and its freshest citation", () => {
  const report = {
    ...CLEAN,
    staleEntityPages: [{ path: "people/alice.md", updated: "2026-01-01", freshestReference: "2026-06-01" }],
  };
  assert.deepEqual(reportLines(report), [
    "✗ Wiki health: issues found",
    "",
    "Stale entity pages (1):",
    "  people/alice.md (updated 2026-01-01, cited as fresh as 2026-06-01)",
  ]);
});

test("reportLines — a frontmatter violation lists the note and its missing keys", () => {
  const report = {
    ...CLEAN,
    frontmatterViolations: [{ path: "bad.md", missing: ["created", "updated", "tags"] }],
  };
  assert.deepEqual(reportLines(report), [
    "✗ Wiki health: issues found",
    "",
    "Frontmatter issues (1):",
    "  bad.md (missing: created, updated, tags)",
  ]);
});
