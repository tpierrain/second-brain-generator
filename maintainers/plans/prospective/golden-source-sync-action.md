<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🚧 ACTIVE — Steps 0–8 done. Step 9 IN PROGRESS: live-Notion QA started against a throwaway personal test zone (10 pages). PROVEN against the real API: setup_source (scope OK), first sync (1 .md/page + correct frontmatter, token only via token_env), delta no-op, watermark, check_freshness. BLOCKING FINDING B1: pages embedding Notion-hosted files/images churn on every sync (notion-to-md emits rotating S3 pre-signed URLs with X-Amz-* params → hash differs → rewrite) → violates "no-change sync rewrites nothing"; fix = normalize/strip X-Amz-* before hashing (TDD) + ADR. STILL NEEDS THOMAS: real rename/delete reconciliation in Notion, installed-brain demo (FileWatcher index + bounded answer + citation). Branch: golden-source-sync. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Action plan — `golden-source-sync`: synchronize golden-source content into the second brain's vault

> **STATUS: 🚧 ACTIVE — not started** (created 2026-06-17). Implements the frozen design in
> [`prd-golden-source-sync.md`](./prd-golden-source-sync.md) (the PRD — copy it next to this plan
> for reference). A **new MCP server** that declares *golden sources* and **synchronizes their
> content** into the local vault as plain Markdown. It **writes/deletes files, full stop**: the
> existing FileWatcher re-indexes and the auto-commit hook commits — `golden-source-sync` has **no
> awareness of the RAG**.
>
> **One-line promise:** the central RAG you don't have yet — but **local, right now**, plugged
> onto your live internal sources.

## Decisions locked for this branch (do not re-litigate)

These were settled before starting; the steps assume them.

- [x] **Packaging** → a **dedicated top-level package `golden-source-sync/`**, sibling to `rag/`
      (own `package.json`, `src/`, `tsconfig`, isolated Notion deps). A standalone **local MCP
      server**, **not** a tool bolted onto the existing `vault-rag` MCP (ADR 0022).
- [x] **Config file format** → **JSON** (`golden-source-sync.config.json`): zero new dependency,
      validated directly by `zod`, consistent with the `state.json` sidecar. Written by
      `setup_source`, not hand-edited daily (§20.4 of the PRD — resolved to JSON here).
- [x] **Branch scope** → **full engine (milestones 1→7) + bootstrap layer + `setup_source`**, all
      in **Outside-in Diamond TDD** with SPI stubs (testable without a live Notion). The **e2e
      milestone 8 (real Notion Team A zone) = manual QA gate by Thomas before merge**, mirroring the
      usual QA-before-main discipline.
- [x] **No native deps** → unlike `rag/` (`better-sqlite3`), this module is **pure JS**
      (`@notionhq/client`, `notion-to-md`, `gray-matter`, `zod` are all pure) → **no ABI-skew
      concern** (ADR 0021 does not apply here). Simpler launcher.

### Inherited from the PRD (frozen, §20)

- [x] Read access model = **Option A** (shared integration token), single-user local-first MVP (§20.1).
- [x] Declaration = config file is the **versioned source of truth**, **written by** `setup_source` (§20.2).
- [x] MCP server name = **`golden-source-sync`** (§20.3).
- [x] **No `search` tool** (that's the RAG); **no reindex/commit tool** (FileWatcher + hook do it).

## How to use this plan (mandatory reading)

- **One step ≈ one session.** Prefer a **`/clear` between steps**. Each step says which files to
  load, what to do, and how to know it's done.
- **At the start of a step**, tell Claude: *"We're tackling Step N of
  `maintainers/plans/golden-source-sync-action.md`"*. Claude reads **this file + the PRD + the
  files cited by the step**, nothing else.
- **During** a step, Claude **ticks the sub-boxes as it goes**. **At the end**, it ticks the step
  box + notes _(date · commit)_ — the memory that survives `/clear`s.
- **Dev discipline (every code step): TDD mandatory** — outside-in, acceptance tests at the API port
  driven by the **driving (MCP-shaped) adapter** with SPI stubbed (skill `outside-in-diamond-tdd` as
  the TDD method), skill `tdd-discipline` for leaf libs. Baby-steps, fail-first, refactor non-optional. **Commit only
  green.** Conventional commits, co-author Claude, **English** artifacts.
- **Sequence guardrail**: do NOT build the real `NotionConnector` (Step 4) before the API port +
  VaultWriter + StateStore exist (Steps 1→3). Do NOT touch deletion reconciliation (Step 5 — the
  riskiest) until delta-write is proven (Step 3).

## Target package layout (Step 0 establishes it)

```
golden-source-sync/
  package.json            # type:module; deps: @modelcontextprotocol/sdk, zod, gray-matter,
                          #   @notionhq/client, notion-to-md ; dev: tsx, typescript, @types/node
  tsconfig.json
  src/
    index.ts              # MCP server = driving adapter (zod validate → call API port → serialize)
    domain/
      golden-source-sync.ts   # IGoldenSourceSync (API port) + the Domain Service
      ports.ts                # SPI: ISourceConnector, IVaultWriter, IStateStore, IClock
      types.ts                # SourceState, SyncReport, FreshnessReport, SetupResult, …
      reconcile.ts            # pure delta/deletion logic (perimeter vs state map)
    adapters/
      notion-connector.ts     # ISourceConnector (search scoped + full pagination, notion-to-md)
      fs-vault-writer.ts      # IVaultWriter — atomic write (temp + rename), delete
      fs-state-store.ts       # IStateStore — sidecar .golden-source-sync/<name>.state.json
      system-clock.ts         # IClock
    lib/
      config.ts               # paths (VAULT_DIR reuse pattern), sidecar dir, config file loc
      markdown.ts             # frontmatter assembly via gray-matter
      content-hash.ts         # sha256 of the PRODUCED markdown
    test/
      builder.ts              # aGoldenSourceSync().withNotionPages([...]).build() → API port
      *.test.ts               # acceptance tests at the API port
.golden-source-sync/          # sidecar dir at REPO ROOT (committed, NOT under vault/ → not indexed)
vault/golden-sources/<name>/  # produced .md (indexed by FileWatcher)
```

> **Why the sidecar at repo root, not in `vault/`** (verified in code): `rag/src/lib/vault-watcher.ts`
> watches **only `VAULT_DIR`** → a sidecar under `.golden-source-sync/` at repo root is **never
> indexed**, yet `auto-commit.mjs` does `git add .` → it **is committed**. Exactly the §7 contract.

---

## Tracking — checkboxes (live-monitorable in this file)

> Tick as you go. Sub-boxes follow progress *within* a step; the step box + _(date · commit)_ is
> the durable memory. **Commit only green.**

- [x] **Step 0 — Branch + package skeleton + integration scaffolding** _(2026-06-17 · fee5cc8)_
  - [x] `git checkout -b golden-source-sync` off `main` (v3.1.0 already shipped) — branch present, `main` ancestor of HEAD
  - [x] `golden-source-sync/` package: `package.json`, `tsconfig.json`, `npm i`, `test` script wired (`node --import tsx --test src/**/*.test.ts`)
  - [x] Deps added: `@modelcontextprotocol/sdk` `^1.12.0`, `zod` `^4.4.3`, `gray-matter` `^4.0.3`, `@notionhq/client` `^5.22.0`, `notion-to-md` `^3.1.9`
  - [x] `npm test` / `tsc --noEmit` green on a placeholder test (CI-of-self proven); `golden-source-sync/dist/` git-ignored, `node_modules` excluded, `package-lock.json` committed
- [x] **Step 1 — Hexagon skeleton: API port + MCP transport** _(2026-06-17 · 60ca25d)_
  - [x] `IGoldenSourceSync` API port defined (`setupSource`/`listSources`/`sync`/`checkFreshness`/`status`/`removeSource`) — `domain/golden-source-sync.ts`; SPI ports in `domain/ports.ts`, DTOs in `domain/types.ts`
  - [x] MCP server (`index.ts`) declares the 6 tools (zod), 1:1 translation of the port, **no logic** (`createMcpServer(api)`; composition root + stdio boot deferred to Step 8)
  - [x] `aGoldenSourceSync()` Builder wiring the Domain Service with in-memory SPI fakes (+ `aNotionGoldenSource()` fixture)
  - [x] First acceptance test red→green at the API port: `listSources()` returns empty (+ triangulation: a declared never-synced source listed with empty state; + MCP smoke). 3 green, `tsc --noEmit` exit 0
- [x] **Step 2 — VaultWriter (SPI) + atomic write** _(2026-06-17 · 31974e4)_
  - [x] `IVaultWriter` + `FsVaultWriter` (temp file in target dir + `rename`; idempotent `delete`) — tested on a real temp vault (4 tests)
  - [x] `markdown.ts`: mandatory frontmatter (`golden_source`, `source_id`, `title`, `source_url`, `last_edited_time`) via gray-matter — timestamps stay quoted strings
  - [x] Acceptance: a `sync` over stubbed page(s) writes `golden-sources/<name>/<pageId>.md` with frontmatter (+ triangulation: N pages → N files). 9 green, `tsc --noEmit` exit 0
  - [ ] Manual check: the live FileWatcher picks it up (deferred to Step 9 QA)
- [x] **Step 3 — StateStore + watermark + delta** _(2026-06-17 · 2fb99de)_
  - [x] `IStateStore` + `FsStateStore` on the sidecar (schema §10, `schemaVersion:1`) — atomic write (temp + rename), `load` returns null on ENOENT (3 tests on a real temp sidecar)
  - [x] `content-hash.ts` over the **produced markdown** (`sha256:` prefix, classic TDD, 2 tests); per-item persistence in the state map
  - [x] Delta: a 2nd sync with no upstream change = **no-op** (`written:0`, `unchanged:N`); watermark = **max of perimeter** (PRD §16 sub-page trap)
  - [x] Acceptance: idempotence + watermark-only-advances-on-full-success (a per-item fetch failure ⇒ `partial`, readable file kept, watermark frozen). 17 green, `tsc --noEmit` exit 0
- [x] **Step 4 — NotionConnector (SPI), read-only, tested alone** _(2026-06-17 · 3dddb67)_
  - [x] `ISourceConnector` + `NotionConnector`: `listItems` (scoped `search` + **full pagination** via cursor), title from the `title`-typed property, `lastEditedTime`, `fetchContent` (`notion-to-md`); non-page results skipped
  - [x] URL→pageId extraction (`lib/notion-url.ts`, dashed UUID, 4 tests); token from env var (`token_env`) in `buildNotionConnector`, **never logged** (error names the var, not the token)
  - [x] Unit-tested against a stubbed `NotionGateway` (mapping + pagination + delegation, 4 tests; factory env plumbing, 2 tests). Real SDK isolated in `adapters/notion-gateway.ts`. Robustness (429/401/truncation) deferred to Step 5/§12. 27 green, `tsc --noEmit` exit 0
- [x] **Step 5 — Deletion reconciliation + reliable-perimeter guardrail (riskiest, isolated)** _(2026-06-17 · 2415ac2)_
  - [x] `reconcile.ts` pure: perimeter vs state map → `pagesToDelete` (set difference, 2 leaf tests)
  - [x] **Guardrail §7**: delete a `.md` **only if** perimeter enumeration **fully succeeded**; on any error → **skip deletions**, mark `partial`, do not advance watermark (`freezeAsPartial`)
  - [x] Acceptance: rename → same file; deletion → `.md` removed; **enumeration error → ZERO deletion**; **empty perimeter over a non-empty corpus → ZERO deletion** (lost-scope guard); sub-page edit → watermark = max (covered in `sync-delta`)
  - [x] Robustness (§12) — the deletion-critical parts: **truncated pagination ⇒ throw ⇒ no reconciliation** (`NotionConnector`, `has_more`+no-cursor); **401 distinct from "0 pages"** (401 throws → freeze; genuine 0-pages on first sync = ok; 0-over-non-empty = frozen). _Deferred to gateway/integration hardening (Step 8/9): 429 backoff+jitter+cap and the per-source single-writer lock — the §7 guardrail already makes a 429 damage-free (partial + resume), and single-session local concurrency on the same source is not a proven risk._
- [x] **Step 6 — `setup_source` (onboarding)** _(2026-06-17 · 5ed03a5)_
  - [x] Tool: root-page URL + token env name → test scope (scoped `search` returns only the zone; 0 pages ⇒ clear "root not connected" message; enumeration/401 error distinct from "0 pages") — domain `setupSource`, 3 acceptance tests at the API port
  - [x] First sync + sidecar write + **writes the config file** (`golden-source-sync.config.json`, §20.2) — `FsConfigStore` SPI adapter (atomic temp+rename, `{schemaVersion:1, golden_sources:[...]}`, 6 tests on a real temp file)
  - [x] Step-by-step explanation in `SetupResult.message`; token guided into env via `token_env` only, **never through Claude's context** (MCP `setup_source` tool takes `token_env`, never the token — Step 1). 43 green, `tsc --noEmit` exit 0
- [x] **Step 7 — `check_freshness` / `status` / `remove_source`** _(2026-06-17 · c5f7fac)_
  - [x] `check_freshness`: watermark-only check — enumerate perimeter metadata (no content fetched, nothing written), `remoteWatermark = max(last_edited_time)`, `behind` if remote ahead of local (incl. never-synced) (4 acceptance tests)
  - [x] `status`: last sync, watermark, item count, lateness (= `describe` for one source; never-synced ⇒ `never`; unknown ⇒ clear reject) (3 acceptance tests)
  - [x] `remove_source`: de-register from the config (versioned truth); **opt-in `cleanup`** also deletes every synced `.md` (from the state map) + the sidecar state (`IStateStore.delete` added, `FsStateStore.delete` idempotent ENOENT-swallow); unknown source = graceful no-op (3 acceptance + 1 adapter test)
  - [x] Refactor: extracted `maxLastEditedTime` helper (reused by `sync` + `checkFreshness`); removed dead `notImplemented`. 54 green, `tsc --noEmit` exit 0
- [x] **Step 8 — Integration + bootstrap layer + docs** _(2026-06-18 · 9c04927→3fc2b55)_
  - [x] Composition root + stdio boot: `lib/config.ts` (path/env resolution, loads `.env` for the token, TDD), `adapters/system-clock.ts` (IClock), `server.ts` (wires the real FS/Notion SPI into the Domain Service, `StdioServerTransport`); `index.ts` stays pure. Proven by a live MCP handshake + `tools/list` exposing the 6 tools _(9c04927)_
  - [x] Register the server: `.mcp.json.template` entry (always-on, boots empty without config) + **`engine-manifest.json`** (`engineMcpServers` += `golden-source-sync`; `engineVersion` += `golden-source-sync 0.1.0`; `regimes.replace` += `golden-source-sync/src/**` + `package.json`/`package-lock.json`/`tsconfig.json`; `regimes.regenerate` += `launch.sh`/`launch.cmd`) _(0b6197d)_
  - [x] Launcher self-heal (PATH-poor / bare Mac): `buildGoldenSourceShLauncher`/`Cmd` + `applyGoldenSourceLauncher` in `rag-launcher.mjs` (same self-heal as `rag/`, NO install invocation — pure JS, ADR 0021 N/A; TDD, 4 tests); installer generates + applies them + `npm install golden-source-sync`; `update-engine` regenerates them + installs its deps (guarded by package.json presence) _(0b6197d)_
  - [x] **Bootstrap skill (layer 1)**: `.claude/skills/golden-source/SKILL.md` — thin driver (intent → gather declaration → token into `.env` → call the MCP tool → report); covers the one-time `.mcp.json` wiring + `npm install` for brains that predate the feature; declared in the manifest `merge` regime (self-carry) _(d52a59c)_
  - [x] Routing guidance lives in the **harness** (CLAUDE.md template §4 *Golden sources* subsection + the skill `description`), via the `description` field — **not baked into the MCP** (§8) _(d52a59c)_
  - [x] Docs: README (skill row) / SETUP §6(d) / CONNECTORS (*Golden sources* section) mention; **ADR already recorded as 0022** ("Golden Source as a first-class concept + filesystem decoupling", Scope: Second brain runtime + Installer) — written up front, no new ADR needed _(3fc2b55)_
- [ ] **Step 9 — Manual Notion QA gate (the demo) + ship**  _(IN PROGRESS — 2026-06-18)_
  - **QA run setup (privacy):** a throwaway PERSONAL Notion test zone was used (10 pages). Its
    content is private (ex-employer data) and **must never be reused** in examples/docs/commits/memory;
    the local scratch (`/tmp/gss-qa`) holding the mirrored content was **purged**. The QA integration
    token stays only in `.env` (gitignored). Re-running the QA re-aspirates from scratch — nothing
    private is retained on disk.
  - **Proven against the LIVE Notion API (golden-source-sync side):**
    - [x] `setup_source` (token via `token_env` in `.env`) → scope confirmed, first sync OK
    - [x] One `.md` per page, named by pageId, mandatory frontmatter present
          (`golden_source` + `source_id` + `title` + `source_url` + `last_edited_time`); atomic write
    - [x] Token never in the config file (only `token_env`), never logged
    - [x] Delta: `check_freshness` reports up-to-date; sidecar state lives outside the vault
    - [x] Watermark advances to the perimeter max on a fully successful sync
  - **BLOCKING FINDING B1 — image/file pages churn every sync.** Pages embedding Notion-hosted
    files/images are rewritten on EVERY sync even with no upstream change (2/10 in the test zone).
    Root cause: `notion-to-md` emits the asset as a Notion **S3 pre-signed URL**
    (`prod-files-secure.s3…amazonaws.com/…?X-Amz-Date=…&X-Amz-Expires=…&X-Amz-Signature=…`); the
    `X-Amz-*` query params rotate on every API call → markdown bytes differ → `contentHash` differs
    → rewrite. Violates acceptance criterion "a no-change sync rewrites nothing" (noise commits +
    needless re-embedding), and the stored URLs expire (~1h) so they're useless anyway.
    - [x] **Fix B1 (TDD):** strip the volatile signing params (`X-Amz-*`, plus notion.so
          `signature`/`expirationTimestamp`) from attachment URLs — applied to BOTH the written
          markdown AND the hash input (same bytes), since the canonical body is what gets written.
          **DECIDED (Thomas, 2026-06-18): the WRITTEN file keeps the canonical param-stripped URL**
          (no placeholder; signed URLs expire ~1h anyway). Pure leaf lib
          `src/lib/strip-volatile-urls.ts` (4 baby-step tests: SigV4, notion.so preserve-stable,
          no-over-strip, B1 stability invariant) wired into `NotionConnector.fetchContent` (1 test).
          Surgical (other links/params untouched). _(2026-06-18 · TDD · 63/63 tests, tsc clean)_
    - [x] **ADR** for the golden-source markdown contract: asset-URL normalization + provenance
          strategy (see "Provenance" note below). Follow the ADR Scope-field convention.
          _(2026-06-18 · [`decisions/0023-canonicalize-volatile-presigned-urls-before-hashing.md`](../decisions/0023-canonicalize-volatile-presigned-urls-before-hashing.md))_
  - **Provenance / "tags" strategy (decided — to be documented in the ADR above):** provenance lives
    in **frontmatter** (`golden_source: <name>`) + the **`golden-sources/<name>/` folder**, NOT as
    hashtags injected into the body (the body stays a faithful mirror). Open lever (RAG side, not sync):
    carry `golden_source` from frontmatter into chunk metadata so answers can label/filter by source.
  - **PROVEN LIVE via the QA driver against the real Notion zone (2026-06-18):**
    - [x] **B1 no-churn** — 3 consecutive no-change syncs all `0 written / 10 unchanged` (incl. the 2 image/file pages that used to churn).
    - [x] **Create** a Notion page → new `.md` (new pageId) appears, count 10→11.
    - [x] **Rename** a page → SAME file (UUID) rewritten, no duplicate/orphan (`written:2` = renamed child + its parent whose child-link title moved).
    - [x] **Edit content** → page re-fetched + `.md` rewritten with the exact new words (grep-confirmed), idempotent afterwards.
    - [x] **Delete** the created page → `deleted:1`, the `.md` removed, count 11→10.
    - [x] **Semantic search** over the synced files (in-process embedder, scratch index): synced→indexed (11/11)→retrievable. _(Retrieval QUALITY on this noisy corpus is a vault-rag matter, ADR 0006 — out of scope here.)_
  - [x] **`sync("all")` fan-out finding (surfaced during QA) — FIXED (TDD, 2026-06-18, `224504a`):** the tool/JSDoc/PRD §9 advertised `"all"` but the domain returned `failed` for it. Implemented as a CONTAINED PARALLEL fan-out (`Promise.allSettled` → sources run concurrently, one failure never aborts the others), aggregate report with per-source breakdown (`SyncReport.sources`) + worst-of status; deterministic concurrency proof. 66/66 green.
  - **STILL NEEDS THOMAS — Block B (installed brain, REAL registration UX):**
    - [ ] **Block B environment (DECISION Thomas 2026-06-18):** the scratch-`.env` driver path proved the
      MECHANICS (Block A); the **add-a-source use case** must be exercised through the **real product UX**,
      not by hand-pasting tokens into the driver's `.env`. So run Block B on a **fresh THROWAWAY brain**
      installed from the `golden-source-sync` branch (the `golden-source-sync` MCP is wired at install) —
      **never the user's real private brain** (a personal brain folder). The MCP only lives in a session **rooted in the brain**
      (the list is frozen at session start → the launcher session can't call `setup_source`), so open a
      **NEW conversation ROOTED in the throwaway brain**. Purge the brain after QA. _(The driver's
      `setup2`/`setup3`/`perimeters` remain only a deterministic fallback for the mechanics.)_
      - [ ] Install the throwaway brain (`installer.mjs --non-interactive …`, in-process embedder, OUTSIDE the launcher) and confirm `/mcp` lists `golden-source-sync`.
    - [ ] **Declare the sources through the REAL conversational onboarding** (the `golden-source` skill gathers the 5 fields → token only into the brain's `.env`, never the chat → `setup_source`), config built AT test time:
      - [ ] **Source A first** — onboard from scratch (1st source, empty config) → proves the from-zero onboarding UX.
      - [ ] **Add Source B — nested/overlapping**, declared WHILE A already exists → proves **append** (config grows, A untouched). Token B on a parent zone that CONTAINS source A's Agicap zone → **B ⊇ A**, same workspace. Verify: (a) **A stays at its 10 pages** (token A does NOT spill into B's larger zone = no-leak on the A side); (b) B's page count; (c) the overlapping Agicap pages exist in **both** `golden-sources/qa-a/` AND `golden-sources/qa-b/` with **distinct provenance** frontmatter (`golden_source: qa-a` vs `qa-b`), no collision (real nested-sources / dual-provenance case, by design). _(Thomas has created zone+token B.)_
      - [ ] **Add Source C — disjoint + DEEP**, declared WHILE A+B already exist. Token C on a zone with NO overlap with A/B, subpages nested several levels deep. Verify: (a) **strict no-leak** — C's pages never appear in A/B and vice-versa (textbook disjoint-perimeter isolation); (b) **access cascade at depth** — sharing the C root grants access all the way down, deep pages are mirrored; (c) **parent→child link rendering** across multiple levels. _(Note: Notion `search` returns the shared subtree FLAT regardless of depth → depth tests the cascade + rendering, NOT pagination; real cursor pagination + the §12 truncation guardrail would need VOLUME >100 pages — deferred, not part of C.)_ _(Thomas has created the 3rd connector.)_
    - [ ] **Index purge on delete** — proven at the file level (`.md` removed, Block A); the FileWatcher de-indexing it needs this installed brain.
    - [ ] **Routing**: a topic-X question refreshes source X only, not Y/Z (harness-level, §8).
    - [ ] **Installed-brain demo**: **FileWatcher indexes** the golden files → brain answers **bounded + clickable citation** (§17)
  - [ ] On green: PR, `/code-review`, fix findings TDD, merge, tag (codename "The One With…"), **archive this plan** (`git mv` → `plans/archived/`, STATUS ✅ + proof)

---

## Pre-release usability backlog — questions to answer SERIOUSLY before merge

> Surfaced during the Step 9 QA (Thomas, 2026-06-18). These are **usability** improvements about how a
> source is **registered** and **exploited**; to be decided (and the cheap ones implemented) **before
> we merge/publish** this capability. Two intertwined topics.

- [ ] **Topic 1 — Source routing by theme/keywords (register side + exploitation side).**
  - **What exists today:** each source already carries a free-text `description` ("topics covered" — the
    routing key, PRD §2). The `golden-source` skill routes on it ("if the question matches a source's
    description, sync THAT source first, then search; never sync all of them"). So routing is **LLM-judgment
    over the description**, harness-level (§8), not in the MCP.
  - **Questions to settle:**
    - [ ] Is the free-text `description` enough, or do we add **structured `keywords`/`topics`** to the
          config for more deterministic routing? (Trade-off: structure = reliability vs. rigidity.)
    - [ ] **Ambiguity policy:** a question matching **several** sources → sync all matching? A question
          matching **none** → sync nothing, or fall back to `sync("all")`? (We now HAVE a contained
          parallel `sync("all")`.)
    - [ ] How reliable is the LLM routing in practice (measure on real questions)? Do we need a confidence
          floor / an explicit "which source(s)?" confirmation when unsure?
    - [ ] Carry `golden_source` (frontmatter) into **chunk metadata** so answers can **label/filter by
          source** (RAG-side lever already noted) — does routing need it?
- [ ] **Topic 2 — Background freshness without OS cron (the "naïve strategy to start with").**
  - **Key insight (unblocks the naïve path):** ADR 0022 rejected **OS-level cron** (launchd / Task
    Scheduler — cross-platform pain, separate process). But the MCP server is a **long-lived stdio
    process** (lives while a brain window is open) → a simple **in-process `setInterval`** can, every N
    minutes, run the cheap watermark-only `check_freshness` on each source and **catch up the behind ones
    in the background**, with **no OS cron**, cross-platform for free. This is NOT what ADR 0022 forbade.
  - **Questions to settle:**
    - [ ] Is **refresh-on-question** (current Phase 2 design) **enough** for the MVP, or do we add the
          in-process background timer?
    - [ ] If timer: **interval default** (Thomas floated 3–5 min — likely too aggressive; pick a sane
          default + make it configurable), **opt-in vs default-on**, and accept that it **only runs while a
          brain window is open** (process lifetime). For a personal brain, is that acceptable?
    - [ ] **API cost / rate limits / battery:** `check_freshness` hits Notion per source per tick even when
          idle — debounce / backoff / "skip if synced < X ago".
    - [ ] **Concurrency coupling (IMPORTANT):** a background timer **amplifies** the cross-process same-source
          race (two windows auto-refreshing the same source) → this **reinforces** the deferred **single-writer
          lock per source** (Step 5 deferral). Decide the lock together with the timer, not after.
    - [ ] Where the timer lives (composition root / a `FreshnessScheduler` SPI à la `rag/`'s
          `reindex-scheduler`) and how it's tested deterministically (injected clock + fake connector).
  - **Decision principle:** prefer the **deterministic, in-process, fail-loud** option (ADR 0009) — start
    naïve (interval + check_freshness + contained catch-up), measure, only then consider more.
- [ ] **Topic 3 — Signpost the MCP's value & position it vs the "central MCP" target (positioning + a visual).**
  - **Why:** the value of mirroring a golden source **locally into your second brain** isn't self-evident on
    its own — it only clicks when contrasted with the **end-state target**: a **central, shared MCP** that
    every employee's assistant queries live (the 24/7 org-wide source of truth, PRD §19). We should make
    explicit that **local golden-source aspiration is the pragmatic, intermediate step** for people/teams who
    **don't yet have** such a central MCP in their company — same retrieval value, available **right now,
    locally**, with no infra to stand up.
  - **To produce (before merge):**
    - [ ] **Document the MCP's interest & concrete usages** (README / SETUP / CONNECTORS) — what a golden
          source is *for* (search + cite live internal knowledge from your brain), when to reach for it, and
          its limits (refreshes while a window is open, per-user token/scope, not 24/7).
    - [ ] **Reassure security-minded readers — the integration-point governance story.** Spell out, in plain
          language, *why this is safe by construction*: a sync goes through a **Notion integration point** on
          which **specific, least-privilege rights** are set (Read content only) and which is **scoped to a
          precise Notion zone** (a single shared root sub-tree, nothing outside it). That scoping is the
          mitigation. And crucially, **nothing can be aspirated without the Notion administrators' approval**:
          the integration only ever sees what an admin has **explicitly shared** with it — no admin share = no
          access, full stop. So data aspiration is **admin-gated and zone-bounded**, not a blanket export.
    - [ ] **A visual diff of the two approaches**, side by side, so the trade-off is obvious at a glance:
          - **(A) Local golden-source mirror (this MVP)** — each person's brain pulls a Notion zone into its
            own vault; **decentralized, zero infra, opt-in, available today**; freshness bounded by session
            lifetime; one token/scope per user.
          - **(B) Central shared MCP (the target, §19)** — one always-on org service the assistants query
            live; **centralized, 24/7, single source of truth, shared governance/cost**; needs the company to
            build & operate it.
          - [ ] Render it as a small **ASCII/diagram** in the docs (and/or a slide-ready figure) — N brains →
                N local mirrors **vs** N brains → 1 central MCP — making clear (A) is the **on-ramp** to (B),
                not a competitor to it.
    - [ ] **Frame the migration story:** when an org later stands up a central MCP, the local golden source
          is **superseded, not wasted** (same concept, same `description`/routing mental model) — say so, so
          adopters aren't afraid of a dead end.

---

## Acceptance criteria (MVP — from PRD §17)

- [x] `setup_source` with a root-page **URL** + token env → tests scope, does 1st sync, explains steps. _(domain-proven, Step 6)_
- [x] Read-content scoped token → access to the sub-tree only (0 pages if root not connected). _(0-pages "root not connected" message domain-proven, Step 6; real scope cascade = Step 9 real-vault QA)_
- [ ] Sync produces `golden-sources/<name>/<pageId>.md`: frontmatter `source_url` + `last_edited_time` + `golden_source`; **atomic write**.
- [ ] The existing FileWatcher indexes these files **with no RAG change**; the hook commits them.
- [x] **Rename** of a Notion page → rewrites the same file (no duplicate/orphan). _(domain-proven, Step 5)_
- [x] **Deletion / out-of-scope** of a page → the `.md` is deleted _(domain-proven, Step 5)_; **purged from the index** = Step 9 real-vault QA.
- [x] **Perimeter enumeration error (429/401/network) → ZERO deletion**; sync `partial`, watermark not advanced. _(domain-proven, Step 5; + empty-perimeter lost-scope guard)_
- [x] Sub-page edit detected (watermark = max of perimeter). _(Step 3)_
- [x] Delta only: a no-change sync rewrites nothing (no noise commit/reindex). _(Step 3)_
- [ ] Routing: a PA question refreshes `team-a`, not `team-b`.
- [ ] Bounded answer + clickable citation; no secret in repo/logs; two sources without perimeter leak.

## Risks & guardrails

- **Catastrophic deletion** (the #1 risk): an API error must NEVER read as "empty perimeter". Step 5
  isolates this; the guardrail is non-negotiable and gets its own acceptance test.
- **Secret leakage**: token only via env (`token_env`), never committed, never re-displayed by Claude.
- **Engine upgradability**: if the server is not in `engine-manifest.json`, already-installed brains
  never receive it via `update-engine` (the "self-carry" lesson) → Step 8 is not optional.
- **No cron**: refreshes only while a session is open (24/7 = the central target, §19).

---

*Plan derived from the frozen PRD `prd-golden-source-sync.md`. Three branch-level decisions taken up
front: dedicated top-level package · JSON config · full engine + bootstrap in TDD with the real-Notion
e2e as a manual QA gate before merge.*
