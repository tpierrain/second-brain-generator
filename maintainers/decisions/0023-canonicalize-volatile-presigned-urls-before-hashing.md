# ADR 0023 — Canonicalize Notion's volatile presigned attachment URLs before hashing/writing

- **STATUS:** ACCEPTED (2026-06-18).
- **Scope:** Second brain (runtime) — a behavior of the `golden-source-sync` MCP (Notion SPI adapter);
  it reaches ≥3.0.0 brains via `update-engine` (the server is already in the engine manifest) and ships
  in fresh installs.
- **Related:** [`0022-golden-source-sync-separate-file-writing-mcp.md`](0022-golden-source-sync-separate-file-writing-mcp.md)
  (the idempotence guardrail this protects — "a no-change sync is a no-op (content hash)"),
  [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md) (a deterministic,
  stateless string transform — no LLM, no heuristic). PRD + plan:
  [`../plans/prd-golden-source-sync.md`](../plans/prd-golden-source-sync.md),
  [`../plans/golden-source-sync-action.md`](../plans/golden-source-sync-action.md).

## Context

`golden-source-sync` keys its delta on a **content hash of the produced Markdown** (ADR 0022 idempotence
guardrail): a page is rewritten/reindexed only when its hash changes. Notion serves every image, file and
PDF behind a **short-lived presigned URL**, and `notion-to-md` embeds that URL **verbatim** in the body.
Those URLs carry **rotating signing query params** — AWS SigV4 (`X-Amz-Signature`, `X-Amz-Date`,
`X-Amz-Credential`, `X-Amz-Expires`, …) for S3-hosted assets, and `signature` + `expirationTimestamp` for
`file.notion.so` assets — that Notion **re-signs on every fetch**.

Field QA (finding **B1**) confirmed the consequence: any page containing an attachment **churned at every
sync** — same content, different signature → different body → different hash → needless rewrite, reindex
and commit. That defeats the delta entirely for the exact pages (rich docs with screenshots) golden
sources are most useful for.

## Decision

**Strip the rotating signing query params from attachment URLs before the body reaches the content hash
or the vault writer.** The asset's **path is stable** (the S3 object key / notion.so file id never
changes between fetches); only the signature rotates. Removing the volatile params yields a **stable
canonical URL** that still uniquely identifies the asset, so an unchanged page hashes identically and the
sync is a true no-op.

- **What is stripped:** query params whose (case-insensitive) key starts with `x-amz-`, plus the exact
  keys `signature` and `expirationTimestamp`. **Everything else is preserved verbatim** — the object path
  and stable params (`table`, `id`, `spaceId`, `downloadName`, a legitimate `?utm_source=…` on an ordinary
  link). The transform is surgical and **never over-strips** a non-presigned link.
- **Where:** in the **Notion SPI adapter** (`NotionConnector.fetchContent`), via a pure leaf lib
  `src/lib/strip-volatile-urls.ts`. Presigned-URL rotation is a Notion artifact, so the canonicalization
  is a connector concern; the domain, the hash and the writer stay unaware of it. Because the canonical
  body is what gets **written**, the vault file is itself stable (no churn on disk either).

## Consequences

- **B1 fixed:** attachment-bearing pages now report `unchanged` across syncs; no needless write/reindex/commit.
- **Stored attachment URLs are de-signed**, so they are **not directly fetchable** — but presigned URLs
  expire anyway and were never durable. The durable, clickable citation is the **frontmatter `source_url`**
  (the Notion page), which is unaffected. The body URL remains a faithful stable identifier of the asset.
- **Deterministic & stateless** (ADR 0009): same input → same output, no network, no LLM.
- **Extensible:** other connectors with their own presigned schemes extend the small volatile-key set in
  one place.

## Provenance (the golden-source markdown contract)

Provenance is carried by the **frontmatter** (`golden_source: <name>`, `source_id`, `source_url`,
`last_edited_time`) plus the **`golden-sources/<name>/` folder** — **not** by hashtags injected into the
body. The body stays a **faithful mirror** of the source (only the volatile signing params are stripped),
so it never diverges from Notion by our own additions. The open, RAG-side lever (out of scope for the sync
MCP) is to carry `golden_source` from frontmatter into chunk metadata so answers can label/filter by source.

## Rejected alternatives

- **Strip for hashing only, keep the signed URL in the written file.** The file would then keep the *first*
  signature forever (since an unchanged hash skips the rewrite) — a guaranteed-expired link frozen on disk.
  Canonicalizing the written body too is strictly better.
- **Strip ALL query params from every URL.** Over-strips legitimate params on ordinary links and on
  notion.so files (`table`/`id`/`spaceId`/`downloadName`), losing information. The fix targets only the
  known volatile keys.
- **Re-fetch and diff rendered images / ignore image blocks in the hash.** Heavy and lossy; the URL-level
  canonicalization is the minimal, deterministic fix.
