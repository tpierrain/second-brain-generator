import { test } from "node:test";
import assert from "node:assert/strict";

import { extractWikiLinks, lintVault, hasFindings, reportLines, isUnderZone } from "./wiki-lint.mjs";

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

test("extractWikiLinks — drops a same-note anchor [[#heading]] (no target file), keeps real links", () => {
  assert.deepEqual(
    extractWikiLinks("jump to [[#Section]] then see [[Foo]]"),
    ["Foo"],
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

// ── isUnderZone: a zone prefix, insensitive to a leading <universe>/ segment ───

test("isUnderZone — matches at the vault root and at a universe root, but not one level deeper", () => {
  assert.equal(isUnderZone("daily/x.md", "daily/"), true); //        vault root
  assert.equal(isUnderZone("acme/daily/x.md", "daily/"), true); //   universe root
  assert.equal(isUnderZone("acme/foo/daily/x.md", "daily/"), false); // nested deeper → not a zone
  assert.equal(isUnderZone("acme/notes/mydaily.md", "daily/"), false); // substring, not a segment
});

test("isUnderZone — a file-basename zone matches at both roots (actions-log.md)", () => {
  assert.equal(isUnderZone("actions-log.md", "actions-log.md"), true);
  assert.equal(isUnderZone("acme/actions-log.md", "actions-log.md"), true);
  assert.equal(isUnderZone("acme/logs/actions-log.md", "actions-log.md"), false);
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

test("lintVault — resolves a universe-relative link [[people/alice]] to <universe>/people/alice.md", () => {
  // Inside a universe (ADR 0034) notes live under `<universe>/…` and are linked
  // universe-relative; Obsidian resolves those by path suffix, so the linter must too.
  const report = lintVault([
    { path: "acme/people/alice.md", frontmatter: {}, body: "" },
    { path: "acme/daily/2026-07-19.md", frontmatter: {}, body: "met [[people/alice]]" },
  ]);
  assert.deepEqual(report.danglingLinks, []);
  assert.ok(!report.orphans.includes("acme/people/alice.md")); // it now has an inbound link
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

test("lintVault — raw-capture zones stay excluded under a universe prefix (<universe>/daily/…)", () => {
  // ADR 0034: paths gain a leading `<universe>/` segment. The orphan exclusions
  // must match through it, else every raw capture wrongly counts as an orphan.
  const report = lintVault([
    { path: "acme/daily/2026-07-19.md", frontmatter: {}, body: "" },
    { path: "acme/inbox/scratch.md", frontmatter: {}, body: "" },
    { path: "acme/actions-log.md", frontmatter: { type: "log" }, body: "" },
    { path: "acme/topic.md", frontmatter: {}, body: "" },
  ]);
  assert.deepEqual(report.orphans, ["acme/topic.md"]);
});

test("lintVault — the engine's own work-zones (meetings/, briefings/, prep-1-1/, coaching/) are never orphans", () => {
  // The shipped skills write these and nobody links back to a meeting write-up or
  // a 1-1 prep — legitimately unlinked by design, so not rot. Universe-insensitive.
  const report = lintVault([
    { path: "meetings/2026-07-15-revue.md", frontmatter: {}, body: "" },
    { path: "briefings/2026-07-18.md", frontmatter: {}, body: "" },
    { path: "acme/prep-1-1/alice.md", frontmatter: {}, body: "" },
    { path: "acme/coaching/2026-07-19.md", frontmatter: {}, body: "" },
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

test("lintVault — raw-capture zones are exempt from required frontmatter, curated notes still held", () => {
  // A raw dump (an imported transcript, an inbox scratch) is not a curated wiki
  // node — holding it to the full taxonomy is the same category error as calling
  // it an orphan. But curated work-zones (meetings/ etc.) DO carry frontmatter, so
  // a missing key there is genuine rot and must still surface. No dates invented.
  const report = lintVault([
    { path: "raw-sources/transcripts/2026-07-19.md", frontmatter: {}, body: "" },
    { path: "acme/inbox/scratch.md", frontmatter: {}, body: "" },
    { path: "acme/actions-log.md", frontmatter: {}, body: "" },
    { path: "meetings/2026-07-15-revue.md", frontmatter: { type: "meeting" }, body: "" },
  ]);
  assert.deepEqual(report.frontmatterViolations, [
    { path: "meetings/2026-07-15-revue.md", missing: ["created", "updated", "tags"] },
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
