# Golden-source QA fixes — TDD implementation plan (pre-release)

> **Goal:** ship a version **today** for a demo + to put in colleagues' hands. This plan turns the
> stopped QA (findings F1–F11 + O1, captured in `golden-source-qa-feedback.md`) into a prioritized,
> green-only TDD execution. Branch: **`golden-source-sync`** (4 unpushed commits already on it).
>
> **Scope decided (Thomas, 2026-06-18):** release-blockers + cheap UX. In order:
> **F8(+F11) → F6 → F3 → F4+F1 → F9 → F7.** Deferred to post-release backlog: **F2, F5, F10, O1.**
>
> **Discipline.** Outside-in / TDD, **commit only green**, `feat`/`fix` and `docs` commits separated,
> one human client (Thomas) between each step. ⚠️ **No CI** — run suites locally. Push/merge/tag only
> on Thomas's explicit green light. ⚠️ **Confidential:** the QA Notion zones (ex-employer perso + the
> client zone) hold private data — token lives ONLY in the disposable brain's `.env`, never in chat,
> repo, PR or memory; purge `/tmp/gss-qa` + the disposable brain at the end.

---

## Tracking

- [x] **Step 1 — F8 + F11: title-aware indexing (RAG side, the demo blocker)** _(2026-06-18)_
  - [x] 1a. Failing test: a "title-only / empty-body" doc must yield ≥ 1 chunk _(chunker.test.ts)_
  - [x] 1b. Failing test: the title is injected as a search signal (present in vectorized text)
  - [x] 1c. Implement: seed a title chunk (frontmatter title preferred); never drop a doc to 0 chunks
  - [x] 1d. Invariant test (indexer level): a 0-chunk doc is surfaced as an error, never silently dropped
  - [ ] 1e. Field re-validation on `~/gss-qa-brain` (`--force` reindex → Naxos indexed, ≥1 chunk) — **needs Thomas (disposable brain)**
  - [x] 1f. Commit (fix) + docs/ADR note (ADR 0024)
- [x] **Step 2 — F6: canonicalize Notion URLs (MCP side)** _(2026-06-18)_
  - [x] 2a. Failing test: `app.notion.com/p/<uuid>` → `https://www.notion.so/<id32>`
  - [x] 2b. Failing test: inline body links normalized; stable `www.notion.so` links preserved
  - [x] 2c. Implement canonicalizer in `notion-url.ts`; wire into `source_url` + body
  - [x] 2d. Non-regression: **no `app.notion.com/p/` ever emitted** (frontmatter + inline)
  - [x] 2e. Commit (fix) + docs
- [x] **Step 3 — F3: read the token at call-time, not at boot (MCP side)** _(2026-06-18)_
  - [x] 3a. Failing test: token absent at boot, added to `.env` later → `buildNotionConnector` reads it, no restart
  - [x] 3b. Implement: fresh `.env` read seam (`fresh-env.ts`) at token resolution time
  - [x] 3c. Commit (fix) + docs
- [x] **Step 4 — F4 + F1: skill wording (no prod code)** _(2026-06-18)_
  - [x] 4a. F1: FR user-facing term "source de vérité" (never "source d'or") + terminology directive
  - [x] 4b. F4: restart instruction = "quit & relaunch Claude Desktop, reopen the **same** conversation"
        (NOT "new conversation"); do **not** suggest `/mcp` in Desktop (it opens the Directory; CLI-only)
  - [x] 4c. Commit (docs)
- [x] **Step 5 — F9: exploit what the sync just wrote (skill)** _(2026-06-18)_
  - [x] 5a. After a sync, announce the titles of written/updated pages
  - [x] 5b. Before concluding "nothing in the vault", list the perimeter titles (cheap) + temper confidence
        when the index may lag the disk
  - [x] 5c. Commit (docs)
- [x] **Step 6 — F7: narrate the long, silent calls (skill)** _(2026-06-18)_
  - [x] 6a. Narrate before `setup_source` / first sync (steps + rough duration)
  - [x] 6b. Commit (docs)
- [ ] **Step 7 — Fresh end-to-end validation + publish**
  - [ ] 7a. Fresh disposable-brain install from the branch; point a golden source at the **client zone**
        (title-heavy Notion = exactly the F8 case) → setup, sync, ask → cited + found
  - [x] 7b. Full suites green (harness **287** + golden-source-sync **74** + rag **172**), `tsc` clean _(2026-06-18)_
  - [ ] 7c. PR + `/code-review` + fix findings TDD
  - [ ] 7d. Merge + tag (codename "The One With…") + archive delivered plans
  - [ ] 7e. Purge `/tmp/gss-qa` + disposable brain(s)

---

## Step 1 — F8 + F11: title-aware indexing (RAG) — **PROVEN ROOT CAUSE**

**This was wrongly suspected to be a golden-source-sync / watcher / atomic-write bug. It is NOT.**
Empirical proof on the real disposable brain (`~/gss-qa-brain`):
- `rag/.cache/watcher.log`: the write **was detected** and the catch-up reindex **did run**
  (`scanned:31`) — the watcher and the trigger work. A chokidar spike confirmed atomic temp+rename
  writes are caught (add + change, no `.tmp` noise).
- Re-running `npx tsx rag/src/index.ts --once` on the brain: `scanned:31, indexed:0, skipped:30` →
  **one file silently vanishes** (31 ≠ 30 + 0).
- Exact cause: **`rag/src/lib/indexer.ts:42`** → `if (doc.chunks.length === 0) continue;` drops any doc
  that produced **0 chunks**, without counting it (not indexed, not skipped, not error).
- **`rag/src/lib/chunker.ts` `chunkMarkdown`** chunks only the **body** and ignores the frontmatter
  title; a "title-only, empty-body" page (verified on the real file: 0 chunkable lines) → 0 chunks →
  dropped. The test brain itself correctly diagnosed "title only, no content."

**This single root cause is also F11** (title-blind retrieval): the title is never vectorized.

**Fix (unifies F8 + F11):** guarantee every document yields **≥ 1 chunk carrying its title**.
- The title comes from `parseDocument` (`parsed.title`) in `index-manager.ts` Phase 1 (~l.126), where
  `chunkMarkdown(parsed.content)` is called — that's where the title is available to seed.
- Approach: seed a dedicated title chunk (e.g. `section: "(title)"`, `content: <title>`) **and**/or
  prefix the title to the body chunks, so: title-only pages get indexed + findable (F8), and the title
  is a strong search signal for all pages (F11). Keep it minimal and deterministic.

**Tests (baby-steps):** (1a) title-only doc → ≥1 chunk; (1b) title present in the vectorized text;
(1d) index-manager invariant `scanned == indexed + skipped + errors` (no silent drop).
**Field re-validation (1e):** `--force` reindex of `~/gss-qa-brain` → Naxos becomes 1 doc with ≥1
chunk; "Grèce / île grecque" query returns it (the real F11 test, previously masked by F8).

> Files: `rag/src/lib/chunker.ts`, `rag/src/lib/indexer.ts`, `rag/src/lib/index-manager.ts`
> (+ their `*.test.ts`). RAG-side only — no coupling to the MCP. Consider an ADR note (title as a
> first-class index signal).

## Step 2 — F6: canonicalize Notion URLs (MCP)

**Root cause (located):** `golden-source-sync/src/lib/markdown.ts:29` copies `source_url: item.url`
verbatim; `src/adapters/notion-connector.ts:73` sets `url: page.url`. The API currently returns
`https://app.notion.com/p/<slug>-<id32>`, which **fails in the browser** ("Oops, error loading this
page") — breaking both inline links and **citations** (confirmed live).

**Fix:** a canonicalizer (extend `src/lib/notion-url.ts`, which already has `extractPageId`) turning any
Notion URL / `source_id` into `https://www.notion.so/<id32-no-dashes>`. Apply to **`source_url`** and
to **inline links** in the fetched markdown body.
**Decision:** Option 1 (canonical live Notion link) — simplest, keeps the "open in Notion" affordance.
Option 2 (point the citation at the local vault `.md`) is more robust but loses the live link → noted
as a future toggle, not for today.
**Tests:** `app.notion.com/p/<uuid>` → `www.notion.so/<id32>`; preserve already-canonical
`www.notion.so`; rewrite inline links; **non-regression: no `app.notion.com/p/` ever emitted**.

> Files: `golden-source-sync/src/lib/notion-url.ts` (+ test), `markdown.ts`, `notion-connector.ts`.

## Step 3 — F3: token at call-time (MCP)

**Root cause:** the token is read **once at boot** (dotenv into `process.env`, frozen — see
`golden-source-sync/lib/config.ts` loading `.env`, and `buildNotionConnector` reading `token_env` from
`process.env`). A token added mid-session is invisible → `setup_source` fails → forced restart
(reproduced on adding a 2nd source too).

**Fix:** when a tool needs the secret, **re-read the `.env` file fresh at call-time** (parse the file
for the `token_env` key), not the boot-frozen `process.env`. Keep the token out of Claude's context
(tools take `token_env` only; never log the value).
**Tests (Outside-in):** token absent at boot, written to the `.env` file afterwards → `setup_source`
resolves it **without a restart**.

> Files: `golden-source-sync/src/adapters/notion-connector.ts` (`buildNotionConnector`) + a fresh-env
> reader seam; possibly `lib/config.ts`. Pull the fix with a failing acceptance test.

## Step 4 — F4 + F1: skill wording (`.claude/skills/golden-source/SKILL.md`)

- **F1:** FR user-facing term is **"source de vérité"** (never "source d'or" — a literal calque seen
  live). Keep EN/identifiers unchanged (`golden-source`, `golden_source`, `golden-sources/`). Fix the FR
  trigger example (l.3) and add a terminology directive so the agent stays consistent.
- **F4:** when a restart is unavoidable (interim before F3 ships everywhere), the instruction must be
  **"quit & relaunch Claude Desktop, then reopen the *same* conversation"** — NOT "open a new
  conversation" (it duplicates pinned/named conversations and risks two brains on one vault). Do **not**
  suggest `/mcp` in Desktop: live, `/mcp` opens the connectors **Directory**, it does not reconnect the
  local MCP — that shortcut is CLI-only.

## Step 5 — F9: exploit the delta (skill)

After a sync, **announce the titles** of the written/updated pages ("I pulled in: Naxos"). Before
concluding "nothing in the vault", **list the perimeter titles** (cheap) alongside the RAG/grep, and
**temper confidence** when the index may lag the disk. (A confident false negative — reinforced by a
`behind=false` check — was the most dangerous live behavior.)

## Step 6 — F7: narrate the silent waits (skill)

Before `setup_source` / the first sync, the agent **narrates** the steps and rough duration ("I'll
explore the perimeter (~1 min on a large zone), then download & convert each page"), and gives a
**figured recap** at the end. (Real MCP progress notifications = deferred; the skill narration is the
cheap, high-value part for onboarding confidence.)

---

## Deferred to post-release backlog (NOT today)

- [ ] **F2** — `.env` token UX (auto-write placeholder line, reorder secrets to the top, reuse
      `scripts/lib/open-env.mjs`, aerate `.env.example`). The one "big piece" — strong UX, but sizeable.
- [ ] **F5** — indexing toast under-counts (fires mid-debounce). RAG notifier (`notify.ts`), minor.
- [ ] **F10** — background freshness (no auto-sync). Already in the usability backlog
      (`6387ac2`, in-process `setInterval`, opt-in, concurrency coupling). Design topic.
- [ ] **O1** — retrieval dedup on overlapping zones (B ⊇ A duplicates content/index). Decide later
      (dedup by `source_id`, choose the provenance to cite — ties into F6).

---

## Proven-green baseline (do not re-test)

Overlap B⊇A + double-provenance, freshness detection, incremental delta sync, `sync("all")` fan-out,
Fix B1 (volatile signed-URL params). The engine is sound; the findings are UX + 2 real bugs (F6, F3) +
1 RAG indexing gap (F8/F11).
