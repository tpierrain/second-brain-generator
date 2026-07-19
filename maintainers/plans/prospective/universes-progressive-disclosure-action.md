<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔭 PROSPECTIVE — agreed design, not yet built. Canonical plan for   -->
<!-- the "universes" capability. Ordering: this is the FIRST gate to EXECUTE in  -->
<!-- ../ROADMAP.md (it must land before the migration import).                    -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# 🌌 Universes — a soft, progressively-disclosed retrieval scope

**Decision of record:** [`../../decisions/0034-progressive-disclosure-of-universes.md`](../../decisions/0034-progressive-disclosure-of-universes.md).
Read it first: it carries the *why* (threat model, progressive disclosure, the implicit-default
principle, alternatives rejected). This plan is the *how*.

> **Status (2026-07-19 · `410c694`, branch `docs/universes-progressive-disclosure`):** design agreed and
> committed (this plan + ADR 0034 + ROADMAP Gate 2). **Implementation not started** — resume at the first
> unchecked `- [ ]` (Step 1, data model). Land on a fresh code branch (TDD), keep it generic (no
> `inqom`/`shodo` literals).

## What we are building (the capability)

A single private brain can hold several **universes** (e.g. successive employers, clients, spheres).
When the owner works one universe, retrieval **defaults to that universe's corpus**; a rare explicit
"all universes" query spans them. The whole thing is **invisible and non-constraining for the majority
who never create a second universe**, yet the data layer is **always universe-aware** so opting in later
needs **no migration**.

Governing rules (all from ADR 0034):
- **Soft scope, engine-enforced, relevance not security.** One shared vault + one shared index; a
  `documents.universe` exact-match filter, the active universe **injected by the MCP server** (never by
  the LLM), plus an explicit `allUniverses` override. Never described as isolation.
- **Progressive disclosure.** Visible only once **universe count >= 2**. Below the gate: exactly today's
  behaviour.
- **Implicit default across three surfaces.** Column always populated; frontmatter `universe:` written
  **only when non-default**; default universe lives at the **vault root**, each created universe in its
  own top-level subtree `vault/<universe>/`.
- **`/switch` is the single entry point** (fast-path + no-arg menu: remind, list, create, cancel).

## Strategy

TDD baby-steps, green-only commits (RED-by-design acceptance tests carry `{todo}` until wired). The work
is generic and upstreamed to the launcher: **no `inqom`/`shodo` literals in code, docs or tests** (the
scrub rule); universes named in tests are placeholders (`acme`, `blue`, ...). Land before the migration
import so the regenerated brain is born universe-aware and the 405 notes are stamped at import time.

## Tracking

- [x] **Step 1 — Data model: the always-on, invisible `universe`.** _(2026-07-19 · `e05322e`, branch `feat/universes`)_
  - [x] Add `universe TEXT NOT NULL DEFAULT '<default>'` to the `documents` table; bump
        `INDEX_SCHEMA_VERSION` 1 → 2 (fresh brains born at 2; deployed brains reindex once on upgrade).
  - [x] `frontmatter-parser` extracts `universe` (absent → the default constant); expose it on
        `ParsedDocument`.
  - [x] Indexer threads `universe` into `indexDocument*`; the engine stamps the default when absent.
  - [x] Decide + name the **default universe constant** (one place); note it never renders for a
        single-universe user. → `rag/src/lib/universe.ts` `DEFAULT_UNIVERSE = "default"`.
- [x] **Step 2 — Deterministic default scope (the relevance boundary).** _(2026-07-19 · `f289a92`, branch `feat/universes`)_
  - [x] `searchSimilarIn` filters `WHERE d.universe = ?` **OR** `d.universe = <default>` (owner's
        cross-cutting notes always visible); `universe` becomes a **required internal argument**
        (a `SearchScope { universe, allUniverses? }` object).
  - [x] MCP `search`: the active universe is **injected server-side from persisted state**
        (`active-universe.ts` reader, CACHE_DIR), not taken from the caller; explicit `allUniverses`
        tool param relaxes the filter for the rare cross-universe query.
  - [x] Test: a foreign-universe doc **never** appears in default-scoped results; the override returns
        it. **Mutation** on the scope filter: guard killed-by-test (zero survivors on the filter and the
        universe migration; `universe.ts` 100%; remaining survivors are pre-existing documented
        equivalents `closeDb`/`getDb`).
- [x] **Step 3 — Active-universe state + the `/switch` skill.** _(2026-07-19 · `27aa642`, branch `feat/universes`)_
  - [x] Persisted state at brain-root `.vault-rag/`: `active-universe` (per-machine, gitignored) +
        `universes.json` (committed registry). Deterministic core `scripts/set-active-universe.mjs` +
        `scripts/lib/universes.mjs` (read/write pointer + registry, name normalization to a safe kebab
        slug, guarded switch + create-and-switch). Engine reader `active-universe.ts` now anchored on
        the same `.vault-rag/` (config `VAULT_RAG_DIR`), env-independent.
  - [x] `/switch` skill (`.claude/skills/switch/SKILL.md`, thin driver): `/switch <name>` fast-path;
        no-arg menu = remind current, list available, **➕ create new** (create-and-switch), **✖️
        cancel**. Create = register a name + switch (no separate store). Reserved `default`, no reindex.
  - [x] Natural language ("create a universe X") routes to the **same** deterministic script via
        `parseSwitchArgs`/`runSwitchCli` (one canonical surface). Manifest self-carries the new engine
        files (skill in `merge`, `set-active-universe.mjs` in `replace`; `scripts/lib/**` + `rag/src/**`
        already covered).

> ⏭️ **Deferred to Gate 4 (fleet), by design (ADR 0034 §Consequences).** The manifest
> `indexSchemaVersion` stays `1` here and the `engineVersion` vector is unbumped: bumping the manifest
> schema is what triggers the one-shot upgrade reindex across the fleet, and that retirement of the
> "v3.2.x → current = no reindex" simplification is a **coordinated** Gate-4 action (see the
> fleet-upgrade plan). The engine **code** constant is already `2` (fresh brains are born at 2).
- [x] **Step 4 — Progressive disclosure (the visibility gate).** _(2026-07-19 · `dc2ff38`, branch `feat/universes`)_
  - [x] Deterministic gate `isMultiverse(registry)` (`scripts/lib/universes.mjs`): true only once
        universe count >= 2 (the implicit default plus one created). Single universe → total silence.
  - [x] SessionStart reminder hook `scripts/session-universe.mjs` (pure core `scripts/lib/universe-reminder.mjs`):
        rides `additionalContext` (the only Desktop-visible channel = chat) + `systemMessage` (CLI),
        announces the active universe **only past the gate**, fail-open. Wired in the settings template
        after `session-self-heal` (asserted by test).
  - [x] One-time 1 → 2 onboarding: `createAndSwitch` returns a deterministic `openedGate` flag (true
        only when the FIRST universe is created); `runSwitchCli` appends the onboarding line **only**
        then, and the `/switch` skill relays it verbatim (the LLM never counts universes, ADR 0009).
- [ ] **Step 5 — File layout per created universe (organization + future one-shot delete).**
  - [ ] Capture routes a new note's file to `vault/<active>/...` for a created universe, or the **root**
        for the default; keep the type-folders nested inside.
  - [ ] `detectType` (folder → type) **strips a leading universe segment** before matching (`inqom/daily/`
        → `daily`).
  - [ ] Confirm a future "delete a universe" is `rm -rf vault/<u>/` + `DELETE ... WHERE universe=?` +
        reindex (do **not** build the command now; just keep the layout that makes it trivial).
- [ ] **Step 6 — Import stamping (feeds the migration gate).**
  - [ ] `/import` (`import-vault`) gains `--universe <name>`: stamp the imported notes' frontmatter
        (additive, never clobbering existing keys) and route their files under `vault/<name>/`.
  - [ ] Test: importing with `--universe` stamps every note and leaves other frontmatter intact.
- [ ] **Step 7 — Docs behind the gate.**
  - [ ] Mention universes in the engine-owned note-format / `CLAUDE.engine.md` **as an advanced, opt-in
        section** (never in the sacred layer, never implying it is required).
  - [ ] `.env.example` / SETUP note if any config surfaces (likely none).

## Verification

- [ ] Full JS + RAG suites green (`node --test` + `npm test`); CI matrix green (Windows included).
- [ ] Manual: a fresh single-universe brain is byte-for-byte "today" (no universe folder, no frontmatter
      key, no reminder). Creating a second universe surfaces `/switch`, the reminder, and scopes search.
- [ ] Mutation score on the scope filter (Step 2) confirms the guard is covered.

## Sequencing

This is the **first gate to execute** in [`../ROADMAP.md`](../ROADMAP.md): a Bucket-1 note-convention /
structure change, so it lands **before** the migration import (else the regenerated brain and its 405
imported notes would need re-stamping later). It does **not** block the *generate* of the fresh brain
(the folder can be created independently), only the *import* step.
