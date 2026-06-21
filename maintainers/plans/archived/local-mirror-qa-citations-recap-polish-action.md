# Plan — Local-mirror QA round: clickable dual-link citations, update-engine note count, onboarding polish

> **STATUS: ✅ SHIPPED — v3.2.2** *"The One Where Citations Click Through"* (2026-06-19). Merged to
> `main` via PR #14 (merge commit `63a1e3c`), tag `v3.2.2`. All 5 Lots delivered in TDD baby-steps,
> commit-only-green; `/code-review` (high) run → one robustness finding fixed (`f2eedf8`: escape
> `>`/`<`/whitespace in citation link destinations). Three suites green at ship: **RAG 188 · harness
> 311 · local-mirror 84**, `tsc` clean. Golden QA self-run on a throwaway vault confirmed dual-link
> citations, recap note count, and onboarding wording.
> **Scope:** Second brain (runtime) + Installer (rag/ delivered by `/update-engine`).

## Context

A fresh QA campaign (legacy-brain at v3.1.0 → `/update-engine` to v3.2.x → declare a Notion local
mirror) surfaced a set of observations. They split into one real bug, two user-facing improvements,
and a few onboarding-polish items. This plan addresses **all of them** (Thomas chose full scope).

The anchor finding (**B1+F1**): when a mirror-backed answer cites its sources, the citation is
rendered as **plain text** (`` `vault/mirrors/facture/…md` ``) — not clickable, so "the link to the
document does not work". Yet every mirror note already stores everything we need to do better:
`source_url` (a stable, clickable `www.notion.so` link) **and** `source_id` in its frontmatter
(`local-mirror/src/lib/markdown.ts`). The RAG pipeline simply **drops** that metadata on the floor
(no `source_url` column, not in `SearchResult`, not in the rendered citation). Thomas wants each
citation to carry **two** links: 🔗 the working Notion source, and 🧠 the local copy in the brain.

Design decision (grounded in the code): the robust place to emit the links is the **deterministic
`search_vault` MCP output** (engine-owned `rag/`, delivered to every brain by `/update-engine`).
Relying on the constitution's citation convention (`templates/…/CLAUDE.md.template`, the `[[wikilink]]`
guidance) would only reach **new** installs — `update-engine` never touches a brain's `CLAUDE.md`.
The 🧠 local link uses the **`obsidian://open?path=<absolute>`** form (resolves the vault from the
absolute path → no vault-name guess, robust whether the user registered the brain folder or `vault/`
as their Obsidian vault). Obsidian is the brain's default viewer (memory `obsidian-default-viewer`).

## Tracking

- [x] **Lot 1 — B1+F1: clickable dual-link citations (engine-side, TDD)** _(2026-06-19)_
  - [x] 1a. Schema: add nullable `source_url TEXT` column to `documents` + out-of-band `ALTER` migration _(vector-store, commit on branch)_
  - [x] 1b. `indexDocument`: accept + persist `sourceUrl` (upsert) _(via `indexDocumentIn` seam)_
  - [x] 1c. Indexing path threads `source_url` from frontmatter into `PreparedDoc` _(`ParsedDocument.sourceUrl`)_
  - [x] 1d. `SearchResult` + `searchSimilar` SQL: select & return `sourceUrl` _(via `searchSimilarIn` seam)_
  - [x] 1e. Citation renderer in `search_vault`: clickable 🧠 local (obsidian://) + 🔗 Notion (when present) _(`formatSearchCitations`; removed dead duplicate `tools/search-vault.ts`)_
  - [x] 1f. (new installs only) constitution template citation convention mentions the dual link _(`templates/fr/CLAUDE.md.template`)_
- [x] **Lot 2 — F2: update-engine recap shows vault note count (+ reindex state)** _(2026-06-19)_
  - [x] 2a. `updateEngine` returns `vaultNoteCount` (via injectable `countVaultNotes` seam, default = count vault `.md` files)
  - [x] 2b. `formatReport` adds a user-facing "your vault holds N note(s)" line (+ "searchable as the reindex finishes")
  - [x] 2c. Unit tests on `formatReport` wording (pure function)
- [x] **Lot 3 — P1: make the restart message coherent in the local-mirror skill** _(2026-06-19; leads with "set up now, no restart — restart only later for first-class tools")_
- [x] **Lot 4 — onboarding polish (skill wording)** _(2026-06-19)_
  - [x] 4a. P2 — gather/confirm `token_env` **before** writing any `.env` placeholder (no PERSO→FACTURE dance)
  - [x] 4b. P3 — verify post-sync via the `status` tool / structured `setup_source` result, **never** a compound shell command
  - [x] 4c. P4 — reconcile the two counts in the recap wording (pages mirrored vs notes indexed/"ready to search")
- [x] **Lot 5 — Ship** _(2026-06-19 · PR #14 merge `63a1e3c` · tag `v3.2.2`)_ — 3 suites green + tsc, PR, `/code-review` (1 finding fixed `f2eedf8`), merge, tag, plan archived, QA brains purged

---

## Lot 1 — Clickable dual-link citations (the anchor)

**Why engine-side:** `rag/` is engine-owned and delivered by `/update-engine`; the constitution is not.
So the *links themselves* must come from the deterministic `search_vault` output.

**Files & wiring (all in `rag/`):**

- `rag/src/lib/vector-store.ts`
  - `applySchema` (`~L60-92`): add `source_url TEXT` to the `documents` `CREATE TABLE`, **and** an
    out-of-band migration mirroring the existing `index_meta.index_schema_version` pattern
    (`~L90-92`): `if (!hasColumn(database, "documents", "source_url")) ALTER TABLE documents ADD COLUMN source_url TEXT`.
    Nullable on purpose → existing rows grandfather to `null` (no forced reindex). *(local-mirror is
    unshipped, so there is no installed base of mirror notes to migrate; freshly-synced/indexed mirror
    notes get `source_url` populated.)*
  - `indexDocument` (`L194-235`): add a `sourceUrl: string | null` param; include `source_url` in the
    `INSERT … ON CONFLICT DO UPDATE` of the `documents` upsert (`L211-220`).
  - `SearchResult` (`L249-256`): add `sourceUrl?: string | null`.
  - `searchSimilar` (`L258-315`): select `d.source_url` in the SQL (`L266-271`), map it into the result.
- `rag/src/lib/index-manager.ts`
  - `runReindex` (`L126`): `parseDocument` already exposes `parsed.frontmatter`. Read
    `parsed.frontmatter.source_url` (string | undefined) into the `PreparedDoc` it pushes (`L128-139`).
  - `persist` callback (`L162-175`): pass the threaded `sourceUrl` to `indexDocument`.
  - `PreparedDoc` type (in `rag/src/lib/indexer.ts`): add `sourceUrl?: string | null`.
- `rag/src/index.ts` — citation renderer in `search_vault` (`L105-112`). Replace the plain-text
  `**Path:** \`vault/${r.path}\`` with clickable links:
  - **🧠 local copy (every result):** `obsidian://open?path=${encodeURIComponent(resolve(VAULT_DIR, r.path))}`
    rendered as a Markdown link. `VAULT_DIR` is already imported (`L27`); `resolve` from `path` (`L46`).
    Using `path=` (absolute) sidesteps the Obsidian vault-name / vault-root ambiguity.
  - **🔗 Notion source (only when `r.sourceUrl`):** a Markdown link to `r.sourceUrl` (already the stable
    `www.notion.so` form — canonicalized at write time in `local-mirror/src/adapters/notion-connector.ts`).
  - Keep the relative path visible as readable text too (so it stays grep-/copy-friendly).

**Helper to reuse (no new URL logic):** `canonicalizeNotionUrl` /
`local-mirror/src/lib/notion-url.ts` already guarantees `source_url` is clickable; the RAG side just
forwards it. Do **not** re-derive Notion URLs in `rag/` (keep the boundary clean — `rag/` stays
unaware of Notion; it only renders whatever `source_url` the note carries).

**1f (new installs, secondary):** in `templates/fr/CLAUDE.md.template` citation guidance (`~L122`,
`~L235`), add one line: when a cited note comes from a mirror, present both the 🔗 source and the
🧠 local copy. This is a **product/localized** file (`--lang fr`) → write it in French per the
localization carve-out. It only benefits new brains; the deterministic MCP output (1e) is what reaches
upgraders.

**Tests (TDD):** in-memory SQLite round-trip — index a doc with a `source_url` frontmatter, assert
`searchSimilar` returns `sourceUrl`; a doc without it returns `null`. Renderer: a pure formatter unit
returns the obsidian link for any note and the Notion link only when `sourceUrl` is set.

---

## Lot 2 — update-engine recap: vault note count

**Why:** the recap shows "172 engine files swapped" (a maintainer/troubleshooter number) but **not** the
number the user cares about — how many notes their brain holds. The count already exists:
`getStats().docCount` (`rag/src/lib/vector-store.ts:345-357`).

**Files (`scripts/`):**
- `scripts/update-engine.mjs`
  - `updateEngine` (`L105-212`): add an injectable seam `countVaultNotes = defaultCountVaultNotes`
    (same pattern as `runReindex` / `runInstall`, `L111-112`), call it after step 6, put the result on
    the returned report (`L211`) as `vaultNoteCount`. Default impl reads the count from the brain's RAG
    index (lightest deterministic path — run a tiny node invocation against the built `rag/` `getStats`,
    or read `documents` count read-only; pick during TDD, keep it behind the seam so the unit test
    injects a stub).
  - `formatReport` (`L84-103`): add a user-facing line, e.g.
    `   • your vault holds ${vaultNoteCount} note(s)` and, when `reindexed`, hint that searchability
    catches up as indexing finishes. `formatReport` is pure + unit-tested → assert the new wording.

**Test:** `formatReport` with `{ vaultNoteCount: 9, reindexed: false }` → contains the count line;
`reindexed: true` → also mentions indexing in progress.

---

## Lot 3 — P1: coherent restart message

**Symptom:** the flow first presents "Restart Claude Code" as a required step, then walks it back when
challenged ("non, pas forcément — I drive the module directly"). The contradiction erodes trust.

**Root cause:** `.claude/skills/local-mirror/SKILL.md` — the *"Already-installed brain that predates
this feature"* section (`L165-188`) leads with restart instructions for picking up the `.mcp.json`
entry, while the model can (and did) run `setup_source` by **driving the module code directly**, no
restart needed for the first onboarding.

**Fix (wording only):** reorder/clarify so the single coherent message is up front: *"I can set up your
mirror right now without restarting — I drive the local-mirror module directly. A restart is only
needed **later**, if/when you want the `mcp__local-mirror__*` tools available as first-class tools in
the session."* Keep the existing accurate note (`L187-188`: token read fresh at call-time, no restart).
No code change.

---

## Lot 4 — onboarding polish (skill wording)

All in `.claude/skills/local-mirror/SKILL.md` (no code; the deterministic helpers already behave):

- **4a (P2)** — Onboarding flow (`L101-124`): make explicit that the model must **gather and confirm
  `token_env` with the user FIRST**, and only **then** run `node scripts/open-env.mjs <token_env>`.
  Writing the placeholder before the name is settled is what produced the `NOTION_TOKEN_PERSO` →
  `NOTION_TOKEN_FACTURE` placeholder dance. The "ONE path, no chat paste-block" rule (`L112-122`) and
  the idempotent `ensureEnvPlaceholder` (`scripts/lib/env-placeholder.mjs`) are already correct — the
  fix is sequencing.
- **4b (P3)** — Post-`setup_source` verification: add an explicit instruction to report from the
  **structured `setup_source` result** and the **`status <name>` tool** (`local-mirror` exposes it —
  returns config, watermark, item count, last-sync status), and to **never** verify where files landed
  via a compound shell command (`cd … && cat … && ls … && find …`) — that triggers a needless
  permission prompt. The skill currently doesn't mandate shell; it just isn't explicit that the tool is
  the way → the model improvised. Make it explicit.
- **4c (P4)** — Recap wording: reconcile the two numbers the user sees — *"N pages mirrored"*
  (`setup_source`) vs the *"N notes ready to search"* OS toast (the RAG watcher,
  `rag/src/lib/notify.ts`). Add a one-line framing so they read as the same content at two stages
  ("written to disk" → "indexed & searchable"), not two conflicting totals.

---

## Verification (end-to-end)

1. **Unit/integration suites green** (the three packages + tsc), commit-only-green at each baby-step:
   - `rag/`: `npm test` (vector-store round-trip + renderer)
   - `local-mirror/`: `npm test` (unchanged, regression guard)
   - root harness: `npm test`
   - `tsc` clean across packages
2. **Manual golden check on a throwaway brain** (rebuilt from this branch):
   - Re-sync a small mirror, ask a question whose answer cites a mirror note → confirm the citation
     shows a **clickable 🧠 local** link (opens the note in Obsidian) **and** a **clickable 🔗 Notion**
     link (opens the live page). A non-mirror note shows only 🧠.
   - Run `/update-engine` from an older brain → recap now states the **vault note count**.
   - Walk the onboarding → no premature `.env` placeholder, no "restart required then not", no
     shell-based verification prompt.
3. Confirm `update-engine` still delivers the new `rag/` code to an upgraded brain (the links reach
   upgraders without a constitution change).

## Confidentiality (QA carve-out)

The QA zone is **private client data**. NEVER reuse the mirror name, page titles, URLs, Notion IDs
or any client business content (the workspace slug, product names, internal squad names, the UUIDs) in the
repo, commits or PR. Purge the throwaway brains (`~/legacy-brain` and any `~/gss-qa*`) when done.

## Backlog / deferred (not in this plan)

- Earlier QA backlog from the rename round: F2/F5/F10/O1 (see memory `golden-source-sync-progress`).
- Note: this campaign also *incidentally* showed `local-mirror` absent from `.mcp.json` after the
  v3.2.x update (the model added it by hand). Likely because the unshipped module isn't in the pulled
  manifest yet → **not a regression to fix here**; revisit when local-mirror actually ships and the
  `engineMcpServers` reconcile (ADR 0025) can see it. Flagged, not actioned.
