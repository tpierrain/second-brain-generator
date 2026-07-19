<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔭 PROSPECTIVE — agreed design, not yet built. Canonical plan for   -->
<!-- the "universes" capability. Ordering: this is the FIRST gate to EXECUTE in  -->
<!-- ../ROADMAP.md (it must land before the migration import).                    -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# 🌌 Universes — a soft, progressively-disclosed retrieval scope

**Decision of record:** [`../../decisions/0034-progressive-disclosure-of-universes.md`](../../decisions/0034-progressive-disclosure-of-universes.md).
Read it first: it carries the *why* (threat model, progressive disclosure, the implicit-default
principle, alternatives rejected). This plan is the *how*.

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

- [ ] **Step 1 — Data model: the always-on, invisible `universe`.**
  - [ ] Add `universe TEXT NOT NULL DEFAULT '<default>'` to the `documents` table; bump
        `INDEX_SCHEMA_VERSION` 1 → 2 (fresh brains born at 2; deployed brains reindex once on upgrade).
  - [ ] `frontmatter-parser` extracts `universe` (absent → the default constant); expose it on
        `ParsedDocument`.
  - [ ] Indexer threads `universe` into `indexDocument*`; the engine stamps the default when absent.
  - [ ] Decide + name the **default universe constant** (one place); note it never renders for a
        single-universe user.
- [ ] **Step 2 — Deterministic default scope (the relevance boundary).**
  - [ ] `searchSimilarIn` filters `WHERE d.universe = ?` **OR** `d.universe = <default>` (owner's
        cross-cutting notes always visible); `universe` becomes a **required internal argument**.
  - [ ] MCP `search`: the active universe is **injected server-side from persisted state**, not taken
        from the caller; add an explicit `allUniverses` (relax filter) for the rare cross-universe query.
  - [ ] Test: a foreign-universe doc **never** appears in default-scoped results; the override returns
        it. Run **mutation testing** on the filter (assert the guard is killed-by-test).
- [ ] **Step 3 — Active-universe state + the `/switch` skill.**
  - [ ] Persisted state (e.g. `.vault-rag/active-universe`) + a small **deterministic** script
        (`set-active-universe.mjs`) to read/write it; a `universes.json` registry (list of created
        universes).
  - [ ] `/switch` skill (thin conversational driver): `/switch <name>` fast-path; no-arg menu = remind
        current, list available, **➕ create new** (create-and-switch, git `switch -c`), **✖️ cancel**.
        Create = register a name + switch (cheap: no separate store).
  - [ ] Natural language ("create a universe X") routes to the **same** deterministic script (one
        canonical surface, no diverging path).
- [ ] **Step 4 — Progressive disclosure (the visibility gate).**
  - [ ] Deterministic gate: surface anything **only when universe count >= 2**. Single universe → total
        silence (no menu prompt, no reminder).
  - [ ] SessionStart reminder hook (chat-surfaced, statusline is invisible in Desktop): announces the
        active universe **only past the gate**. Wire after the existing SessionStart hooks.
  - [ ] One-time inline onboarding when crossing count 1 → 2 ("you now have 2 universes; searches stay
        in the active one; say 'all universes' to span them").
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
