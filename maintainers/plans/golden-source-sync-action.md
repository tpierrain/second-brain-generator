<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🚧 ACTIVE — Steps 0–6 done (skeleton + API port + MCP transport + VaultWriter + StateStore/watermark/delta + NotionConnector SPI + deletion reconciliation/guardrail + setup_source onboarding/FsConfigStore). Next: Step 7 (check_freshness/status/remove_source). Branch: golden-source-sync. -->
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
      milestone 8 (real Notion PA/SC zone) = manual QA gate by Thomas before merge**, mirroring the
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
- [ ] **Step 7 — `check_freshness` / `status` / `remove_source`**
  - [ ] `check_freshness`: watermark-only check (behind? by how much?) without pulling
  - [ ] `status`: last sync, watermark, item count, lag
  - [ ] `remove_source`: de-register (+ optional cleanup of folder + sidecar)
- [ ] **Step 8 — Integration + bootstrap layer + docs**
  - [ ] Register the server: `.mcp.json.template` entry + **`engine-manifest.json`** (`engineMcpServers` += `golden-source-sync`, `regimes.replace` += `golden-source-sync/src/**` + its `package.json`/`tsconfig`)
  - [ ] Launcher self-heal (PATH-poor / bare Mac, like `rag/launch.*` + `run-node`); installer awareness
  - [ ] **Bootstrap skill (layer 1)**: `.claude/skills/golden-source/SKILL.md` — thin driver: "sync the \<zone\> golden source from Notion" → wires MCP via `connectors-apply.mjs` pattern, creates `golden-sources/` + `.golden-source-sync/`, then hands off to `setup_source`
  - [ ] Routing guidance lives in the **harness** (CLAUDE.md template / skill), via the `description` field — **not baked into the MCP** (§8)
  - [ ] Docs: README/SETUP/CONNECTORS mention; **ADR** for "Golden Source as a first-class concept + filesystem decoupling" (Scope: Second brain runtime + Installer)
- [ ] **Step 9 — Manual Notion QA gate (the demo) + ship**
  - [ ] Real PA/SC zone: `setup_source` → scope test → 1st sync → FileWatcher indexes → second brain answers **bounded + clickable citation** (§17)
  - [ ] Verify de-index on delete on the real vault; two sources without perimeter leak
  - [ ] On green: PR, `/code-review`, fix findings TDD, merge, tag (codename "The One With…"), **archive this plan** (`git mv` → `plans/archived/`, STATUS ✅ + proof)

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
- [ ] Routing: a PA question refreshes `pa-sc`, not `comex`.
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
