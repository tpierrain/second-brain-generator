# ADR 0022 — `golden-source-sync` is a separate file-writing MCP, decoupled from the RAG by the filesystem

- **STATUS:** ACCEPTED (2026-06-17).
- **Scope:** Second brain (runtime) + Installer — a **new MCP server** installed into the brain and run
  brain-side; it reaches ≥3.0.0 brains via `update-engine` (manifest entry) and ships in fresh installs.
- **Related:** [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md) (why this is
  **not** a `vault-rag` tool — retrieval stays retrieval-only), [`0011-distinct-triggers-indexing-vs-git.md`](0011-distinct-triggers-indexing-vs-git.md)
  (indexing vs git are distinct triggers — golden-source-sync owns neither, it only writes files),
  [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md) (a deterministic
  engine + a thin conversational skill on top), [`0016-update-engine-is-a-skill-not-an-mcp-tool.md`](0016-update-engine-is-a-skill-not-an-mcp-tool.md)
  + [`0019-import-previous-brain-is-a-keyword-skill.md`](0019-import-previous-brain-is-a-keyword-skill.md)
  (same shape for the bootstrap layer — thin skill over a deterministic core),
  [`0012-engine-packaging-four-part-model.md`](0012-engine-packaging-four-part-model.md) +
  [`0015-cross-platform-parity.md`](0015-cross-platform-parity.md) (it must be carried by the engine
  manifest and run on macOS + Windows). PRD + plan:
  [`../plans/prd-golden-source-sync.md`](../plans/prd-golden-source-sync.md),
  [`../plans/golden-source-sync-action.md`](../plans/golden-source-sync-action.md).

## Context

A second brain (local semantic RAG) can only answer on **what it has indexed**. Feeding it from a **live
internal source** (Notion first) today means a manual copy-paste of content into `vault/` + a manual
reindex — error-prone and against the product's "all in natural language" feel. We want the brain plugged
onto **golden sources** — authoritative reference docs that keep changing — so it answers **framed +
sourced + up to date, automatically**.

The brain already owns the two pieces needed once files land in the vault: a **FileWatcher** that
auto-indexes vault writes and de-indexes on delete (`rag/src/lib/vault-watcher.ts`), and an
**auto-commit/push hook** (`scripts/auto-commit.mjs` + the Stop-hook push, ADR 0010). The open question:
*where does the "bring live source content into the vault" capability live, and how does it relate to the
existing `vault-rag` MCP?*

The central target (a hosted central MCP / RAG DB plugged onto all internal sources, for everyone) **does
not exist yet** in the company. We need a **local-first** answer that works today.

## Decision

**Golden-source synchronization is a NEW, separate local MCP server (`golden-source-sync`) that only
writes/deletes Markdown files in the vault, decoupled from the RAG by the filesystem.** It is **not** a
tool added to the `vault-rag` MCP.

- **First-class concept — the Golden Source.** A live reference source is **declared** (a `name`,
  `title`, natural-language `description` used for routing, a `connector`, a `target_dir`), not coded.
  The declaration lives in a **versioned JSON config** (`golden-source-sync.config.json`) written by the
  `setup_source` tool, never hand-edited day-to-day.
- **It writes files, full stop.** `golden-source-sync` **does not index, does not commit, has no
  awareness of the RAG**. It drops clean `.md` (one per source item, named by the stable page id, with
  mandatory frontmatter incl. `source_url` for citation) under `vault/golden-sources/<name>/`; the
  existing FileWatcher reindexes and the hook commits. The only point of contact with the RAG is the
  **vault folder** — the two never talk directly.
- **Hexagonal (ports & adapters), not "The Hive".** A clean API port `IGoldenSourceSync`; the MCP surface
  is a **thin driving adapter** (zod-validate → call the port → serialize, no logic). The outside world
  sits behind SPI ports (`ISourceConnector`, `IVaultWriter`, `IStateStore`, `IClock`). **MVP = one
  connector, Notion.** Other source types plug in later as new SPI adapters — that is the reason for
  ports & adapters here. This is an MCP, **not** a modular-monolith application, so the Hive vocabulary
  (bounded contexts, In-Proc Adapters, microservice extractability) is deliberately **not** used.
- **Private reconciliation state, committed but not indexed.** Per source,
  `.golden-source-sync/<name>.state.json` at the **repo root** (outside `vault/` → never watched/indexed,
  yet committed by `git add .`). It holds the watermark + per-item content hash, enabling **delta-only**
  syncs and **safe deletion** of `.md` when a source page disappears.
- **No `search` tool** (that's the RAG); **no reindex/commit tool** (FileWatcher + hook).

## Guardrails (baked into the engine, asserted by tests)

- **No catastrophic deletion.** A `.md` is deleted **only if the perimeter enumeration fully succeeded**.
  Any API error (429/401/network/truncated pagination) must **never** read as "empty perimeter" → skip
  deletions, mark the sync `partial`, do not advance the watermark, log it.
- **No secret leak.** The connector token lives in an **env var** (`token_env`) — never committed, never
  re-displayed by Claude, never passed through Claude's context.
- **Atomic writes** (temp + rename) so the FileWatcher never indexes a half-written file.
- **Idempotence**: a no-change sync is a no-op (content hash) — no write, no commit, no reindex.

## How it reaches each audience

- **Fresh installs** ship `golden-source-sync` and its bootstrap skill out of the box.
- **Existing ≥3.0.0 brains** receive it via **`update-engine`**: the server is declared in
  `engine-manifest.json` (`engineMcpServers` + the `regimes.replace` globs for `golden-source-sync/src/**`).
  Without that manifest entry, already-installed brains would never get it (the engine self-carry rule).

## Consequences

- **The MCP contract stays clean** (ADR 0006): `vault-rag` keeps doing retrieval only; a separate server
  owns source synchronization.
- **Local-first, zero infra** (positioning §1 of the PRD): works today, no central platform required;
  same concept/contract/connectors as the future central target — only hosting + distribution would
  change, not this code.
- **Pure-JS module, no native deps** (`@notionhq/client`, `notion-to-md`, `gray-matter`, `zod`) → **no
  ABI-skew concern** (ADR 0021 does not apply); a simpler launcher than `rag/`.
- **Extensible by design**: a new golden-source type = a new SPI adapter, no core change.
- **Two-layer install** (ADR 0016/0019 shape): a thin bootstrap skill wires the MCP + creates the folders;
  the deterministic `setup_source` onboards/tests/syncs/explains.

## Rejected alternatives

- **A tool on the `vault-rag` MCP.** Couples retrieval to source-mutation and erodes ADR 0006; mixes
  Notion deps into the RAG package.
- **A plain script (cron/CLI).** A second brain interacts natively with an MCP; an MCP is also a portable,
  stable packaging unit → "where to deploy" stays a packaging variable, not a rewrite. No cron in the MVP:
  freshness rides the existing Phase 2 flow (refresh on the question), which matches the local-first scope.
- **golden-source-sync triggering reindex/commit itself.** Would race the FileWatcher + the hook (double
  commit, half-written indexing). The filesystem decoupling is the whole point.
- **The Hive framing.** This is a single local MCP, not a modular-monolith application — hexagonal
  ports & adapters is the right and sufficient lens.
- **Per-user OAuth read filtering (Model B) now.** Only meaningful in multi-user with heterogeneous
  rights = the central target (§19/§20.1); the single-user local MVP uses a shared scoped token (Option A).
