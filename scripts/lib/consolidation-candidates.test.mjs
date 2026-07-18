import { test } from "node:test";
import assert from "node:assert/strict";

import { consolidationCandidates, hasCandidates, reportLines } from "./consolidation-candidates.mjs";

// ═══════════════════════════════════════════════════════════════════════════
// consolidation-candidates — the pure, I/O-free core of Track C ("consolidate
// raw captures into entity/topic pages", ADR 0009 rung 1). Given already-parsed
// notes it surfaces WHAT needs consolidating, grouped by target page: entity
// mentions that lack a page (new-page candidates) and entity pages a fresher
// capture has left behind (refresh candidates). Resumability is STATELESS: a
// capture is a candidate purely because it is fresher than the page it feeds
// (or that page doesn't exist yet). The LLM fan-out does the merge; the write
// reuses Track B. Reuses Track A's link extraction + resolver + note shape.
// ═══════════════════════════════════════════════════════════════════════════

test("consolidationCandidates — an empty vault yields no candidates", () => {
  assert.deepEqual(consolidationCandidates([]), { newPages: [], refreshes: [] });
});

test("consolidationCandidates — only captures drive candidates; a curated page's mention is ignored", () => {
  const notes = [
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "[[Marie Dupont]] a tranché.",
    },
    {
      path: "topics/rag.md",
      frontmatter: { type: "topic", updated: "2026-07-15" },
      body: "See [[Some Missing Concept]].",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes), {
    newPages: [
      { target: "Marie Dupont", sources: [{ path: "meetings/2026-07-15-revue.md", updated: "2026-07-15" }] },
    ],
    refreshes: [],
  });
});

test("consolidationCandidates — the same missing target across two captures groups into one candidate, sources sorted", () => {
  const notes = [
    {
      path: "meetings/2026-07-16-suivi.md",
      frontmatter: { type: "meeting", updated: "2026-07-16" },
      body: "Point avec [[Marie Dupont]].",
    },
    {
      path: "daily/2026-07-15.md",
      frontmatter: { type: "daily", updated: "2026-07-15" },
      body: "Échange [[Marie Dupont]] sur le RAG.",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes), {
    newPages: [
      {
        target: "Marie Dupont",
        sources: [
          { path: "daily/2026-07-15.md", updated: "2026-07-15" },
          { path: "meetings/2026-07-16-suivi.md", updated: "2026-07-16" },
        ],
      },
    ],
    refreshes: [],
  });
});

test("consolidationCandidates — distinct new-page candidates come out sorted by target (deterministic)", () => {
  const notes = [
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "[[Zoe Zeta]] then [[Alice Alpha]].",
    },
  ];
  assert.deepEqual(
    consolidationCandidates(notes).newPages.map((c) => c.target),
    ["Alice Alpha", "Zoe Zeta"],
  );
});

test("consolidationCandidates — a mention resolving to an existing (not-stale) page is not a new-page candidate", () => {
  const notes = [
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "[[people/marie-dupont]] a tranché.",
    },
    {
      path: "people/marie-dupont.md",
      frontmatter: { type: "person", updated: "2026-07-15" },
      body: "Head of Platform.",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes), { newPages: [], refreshes: [] });
});

// ── refresh candidates: an entity page a fresher capture has left behind ───────

test("consolidationCandidates — an entity page older than a capture citing it is a refresh candidate", () => {
  const notes = [
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "On a reparlé de [[topics/rag]] en profondeur.",
    },
    {
      path: "topics/rag.md",
      frontmatter: { type: "topic", updated: "2026-04-01" },
      body: "Retrieval-augmented generation.",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes), {
    newPages: [],
    refreshes: [
      {
        page: "topics/rag.md",
        updated: "2026-04-01",
        sources: [{ path: "meetings/2026-07-15-revue.md", updated: "2026-07-15" }],
      },
    ],
  });
});

test("consolidationCandidates — refreshes group multiple fresher captures per page and come out sorted", () => {
  const notes = [
    { path: "topics/rag.md", frontmatter: { type: "topic", updated: "2026-04-01" }, body: "RAG." },
    { path: "people/alice.md", frontmatter: { type: "person", updated: "2026-03-01" }, body: "Alice." },
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "Reparlé de [[topics/rag]].",
    },
    {
      path: "daily/2026-07-16.md",
      frontmatter: { type: "daily", updated: "2026-07-16" },
      body: "[[topics/rag]] et [[people/alice]].",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes), {
    newPages: [],
    refreshes: [
      {
        page: "people/alice.md",
        updated: "2026-03-01",
        sources: [{ path: "daily/2026-07-16.md", updated: "2026-07-16" }],
      },
      {
        page: "topics/rag.md",
        updated: "2026-04-01",
        sources: [
          { path: "daily/2026-07-16.md", updated: "2026-07-16" },
          { path: "meetings/2026-07-15-revue.md", updated: "2026-07-15" },
        ],
      },
    ],
  });
});

test("consolidationCandidates — a capture with no updated date can't be proven fresher, so it's no refresh (fail-safe)", () => {
  const notes = [
    {
      path: "daily/2026-07-15.md",
      frontmatter: { type: "daily" }, // no `updated` → freshness unknown
      body: "[[topics/rag]] encore.",
    },
    { path: "topics/rag.md", frontmatter: { type: "topic", updated: "2026-01-01" }, body: "RAG." },
  ];
  assert.deepEqual(consolidationCandidates(notes), { newPages: [], refreshes: [] });
});

test("consolidationCandidates — captureZones is configurable: a bespoke zone drives candidates, defaults don't", () => {
  const notes = [
    {
      path: "journal/2026-07-15.md",
      frontmatter: { type: "journal", updated: "2026-07-15" },
      body: "[[Marie Dupont]].",
    },
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "[[Someone Else]].",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes, { captureZones: ["journal/"] }), {
    newPages: [
      { target: "Marie Dupont", sources: [{ path: "journal/2026-07-15.md", updated: "2026-07-15" }] },
    ],
    refreshes: [],
  });
});

test("consolidationCandidates — an entity page fresher than the capture citing it is not a refresh candidate", () => {
  const notes = [
    {
      path: "meetings/2026-04-01-vieux.md",
      frontmatter: { type: "meeting", updated: "2026-04-01" },
      body: "Première mention de [[topics/rag]].",
    },
    {
      path: "topics/rag.md",
      frontmatter: { type: "topic", updated: "2026-07-15" },
      body: "Retrieval-augmented generation, à jour.",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes), { newPages: [], refreshes: [] });
});

test("consolidationCandidates — a capture citing a resolved NON-entity note (another capture) is not a refresh", () => {
  const notes = [
    {
      path: "meetings/2026-07-16-suivi.md",
      frontmatter: { type: "meeting", updated: "2026-07-16" },
      body: "Fait suite à [[meetings/2026-07-15-revue]].",
    },
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "Revue archi.",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes), { newPages: [], refreshes: [] });
});

// ── new-page candidates: an entity mentioned in a capture but with no page ─────

test("consolidationCandidates — a capture's unresolved mention is a new-page candidate", () => {
  const notes = [
    {
      path: "meetings/2026-07-15-revue.md",
      frontmatter: { type: "meeting", updated: "2026-07-15" },
      body: "[[Marie Dupont]] a tranché : on part sur du RAG local.",
    },
  ];
  assert.deepEqual(consolidationCandidates(notes), {
    newPages: [
      { target: "Marie Dupont", sources: [{ path: "meetings/2026-07-15-revue.md", updated: "2026-07-15" }] },
    ],
    refreshes: [],
  });
});

// ── hasCandidates: the binary signal the CLI turns into an exit code ───────────

test("hasCandidates — an empty report is false (nothing to consolidate)", () => {
  assert.equal(hasCandidates({ newPages: [], refreshes: [] }), false);
});

test("hasCandidates — true when only new-page candidates exist", () => {
  assert.equal(hasCandidates({ newPages: [{ target: "X", sources: [] }], refreshes: [] }), true);
});

test("hasCandidates — true when only refresh candidates exist", () => {
  assert.equal(hasCandidates({ newPages: [], refreshes: [{ page: "topics/x.md", updated: "2026-01-01", sources: [] }] }), true);
});

// ── reportLines: an honest, human-readable rendering of the candidates ─────────

test("reportLines — a clean report is one reassuring line (nothing to consolidate)", () => {
  assert.deepEqual(reportLines({ newPages: [], refreshes: [] }), ["✓ Nothing to consolidate"]);
});

test("reportLines — renders both sections with counts, sources, and a titled header", () => {
  const report = {
    newPages: [
      {
        target: "Marie Dupont",
        sources: [{ path: "daily/2026-07-15.md" }, { path: "meetings/2026-07-16.md" }],
      },
    ],
    refreshes: [
      { page: "topics/rag.md", updated: "2026-04-01", sources: [{ path: "meetings/2026-07-15-revue.md" }] },
    ],
  };
  assert.deepEqual(reportLines(report), [
    "✗ Consolidation candidates found",
    "",
    "New pages to create (1):",
    "  [[Marie Dupont]] — cited by 2: daily/2026-07-15.md, meetings/2026-07-16.md",
    "",
    "Entity pages to refresh (1):",
    "  topics/rag.md (updated 2026-04-01) — 1 fresher: meetings/2026-07-15-revue.md",
  ]);
});
