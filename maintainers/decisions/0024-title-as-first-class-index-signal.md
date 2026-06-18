# ADR 0024 — The title is a first-class index signal (never drop a doc to 0 chunks)

- **STATUS:** ACCEPTED (2026-06-18).
- **Scope:** Second brain (runtime) — a behavior of the RAG engine (`rag/`); it reaches ≥3.0.0 brains via
  `update-engine` (engine-owned code) and ships in fresh installs. **Index format unchanged** (still
  `chunks` rows) → no schema bump, no forced reindex; new pages simply gain a title chunk on their next
  (re)index.
- **Related:** [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md)
  (a deterministic, stateless transform — no LLM, no heuristic),
  [`0022-golden-source-sync-separate-file-writing-mcp.md`](0022-golden-source-sync-separate-file-writing-mcp.md)
  (golden-source pages — the live trigger — are named by Notion pageId and carry their title only in the
  frontmatter). QA findings **F8** (silent indexing drop) and **F11** (title-blind retrieval):
  [`../plans/golden-source-qa-feedback.md`](../plans/golden-source-qa-feedback.md).

## Context

Field QA surfaced two findings that turned out to share **one root cause** in the RAG engine — **not** in
`golden-source-sync` nor in the file watcher (both were proven to work: the write was detected and a
catch-up reindex ran).

- **F8 — a page silently vanished from the index.** Re-running the indexer on the disposable brain showed
  `scanned:31, indexed:0, skipped:30` — one file accounted for nowhere. Cause: `chunkMarkdown` chunks the
  **body only**; a "meaningful title, empty body" page (the common Notion case, and exactly how a freshly
  created or title-only page looks) produced **0 chunks**, and `indexer.ts` did `if (doc.chunks.length === 0)
  continue;` — dropping it **without counting it** (not indexed, not skipped, not error). The
  `scanned == indexed + skipped + errors` invariant was silently violated.
- **F11 — title-blind retrieval.** Even for pages *with* a body, the **title was never vectorized**, so a
  query matching only the title (e.g. "Greek island" → a page titled "Naxos") could not retrieve it.

## Decision

**Guarantee every document yields at least one chunk, and make its title a vectorized search signal.**

1. **Seed a dedicated title chunk** (`section: "(title)"`, `content: <title>`) at the front of every doc's
   chunks in `chunkMarkdown(content, title?)`. A title-only page now produces ≥1 chunk (fixes F8); every
   page's title is now embedded and searchable (fixes F11). Body chunking is otherwise unchanged.
2. **The title is resolved from the frontmatter first.** `extractTitle` now prefers an explicit
   frontmatter `title:` over the body `# Heading` / filename fallback. Golden-source pages are named by
   Notion pageId (a UUID) with the real title only in the frontmatter — without this, the seeded chunk
   would carry the UUID and be useless for retrieval.
3. **Never drop a doc silently.** `indexer.ts` no longer `continue`s past a 0-chunk doc unaccounted for:
   should one ever occur (it cannot for real docs now), it is **surfaced as an error** so the
   `scanned == indexed + skipped + errors` invariant always holds (fail loud, ADR 0009).

## Consequences

- **F8 + F11 fixed** with one deterministic, stateless change; title-only and title-heavy pages are both
  indexed and findable.
- **+1 chunk per document** (the title). Negligible storage; a strong, cheap retrieval signal.
- **No schema change, no forced reindex.** Existing brains pick up title chunks incrementally as pages
  change, or all at once on an explicit `--force` reindex.
- **The invariant is now enforced**, so a future chunking gap surfaces as a loud error instead of a
  vanished document.

## Rejected alternatives

- **Prefix the title onto every body chunk instead of a separate chunk.** Mutates existing chunk content
  (larger blast radius, harder to reason about) for no extra retrieval benefit over a dedicated title
  chunk. The separate chunk is additive and surgical.
- **Index 0-chunk docs as empty (persist with no chunks).** Keeps them invisible to search — the original
  bug, merely counted. Seeding a title chunk makes them actually findable.
- **Fix it in `golden-source-sync` (write a body that repeats the title).** Pushes a RAG concern into the
  mirror and pollutes the faithful body; other note sources would still be title-blind. The fix belongs in
  the engine, where it covers every document.
