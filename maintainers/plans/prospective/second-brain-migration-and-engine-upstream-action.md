# Migrate a pre-existing second brain into a generated brain — capability gap analysis & strategy

> **Branch:** to be created off `main` for the launcher-bound work (Tracks A/B/C generic).
> Track A (chunker) may also continue in the `test/rag-mutation-hardening` context since it pairs
> with mutation testing on `chunker`.
> **Status:** planned, not started (2026-07-11).
> This is the **canonical** plan (repo = single source of truth). The plan-mode scratch file
> `~/.claude/plans/shimmering-snacking-tome.md` is superseded.

## Context

A pre-existing personal second brain (the **source brain**, older engine `rag@1.0.0`, ~405 notes)
predates this launcher and is not linked to it. The goal is twofold:

1. **Don't lose the corpus** — migrate its 405 notes into a freshly generated brain.
2. **Close the functional delta** — the source brain accumulated capabilities this launcher does
   not have yet (custom skills, constitution disciplines, an embedder tweak), and vice-versa.

Decided routing (**two tracks**): **generic** wins are de-identified and pushed **upstream into
this launcher** so every future brain *and* every upgrader (via `update-engine`) benefits;
**private/employer-specific** capabilities land **only in the migrated personal brain**, never in
this public repo.

Key finding on `/import`: it copies **vault notes + attachments only** (demo skipped, never
overwrites). It does **not** migrate skills, hooks, `.mcp.json`, or `CLAUDE.md` — that is the whole
"functional delta" to port by hand.

> Public/private guardrail (non-negotiable): nothing naming the former employer, colleagues,
> Slack channels, account emails, product teams, or private KPIs may enter this repo. Every
> launcher-bound artifact is de-identified first.

## Tracking

- [ ] **Track A — Engine: embedder/chunker degenerate-chunk pruning** (upstream to launcher)
      — code shipped on `feat/chunker-degenerate-body-pruning` (dd13be0, 2026-07-17), mutation-proven;
      only the source-vault re-measurement (~105) remains, to run from Thomas's pre-existing brain.
- [ ] **Track B — Skills: classify & route** (generic → launcher, private → personal brain)
- [ ] **Track C — Constitution merge** (distill generic disciplines to template; keep newer template wins)
- [ ] **Track D — Corpus migration** (generate brain → `/import` 405 notes → layer private capabilities)
- [ ] **Track E — Canonical plan** relocated to `maintainers/plans/prospective/` — ✅ done (this file, 2026-07-11)

---

## Track A — Engine: embedder/chunker degenerate-chunk pruning

**WHAT:** stop embedding degenerate section bodies (empty template scaffolds, `---`, placeholders)
while keeping the F8 findability floor (title-only pages stay searchable).

**Evidence (measured, read-only, on the source vault):** 105 prunable chunks / ~4459 total = **2.4 %**;
**zero false positives** (all empty template scaffolds). F8-safe **by invariant**: the `(title)`
chunk is seeded unconditionally (`chunker.ts:56-58`) from a title that is never empty (`extractTitle`
falls back to the filename, `frontmatter-parser.ts:48-60`); the `isSubstantialBody` filter applies
**only** to section bodies, never to the title chunk → every doc keeps ≥1 chunk. Gain is primarily
**index-noise / search-quality**, secondarily a small one-time quota saving.

- [x] Add `isSubstantialBody(body)` + `MIN_BODY_MEANINGFUL_CHARS = 25` (count `\p{L}\p{N}` only) to
      `rag/src/lib/chunker.ts`, applied **only** inside the section loop (keep the unconditional
      `(title)` chunk untouched). _(2026-07-17 · dd13be0)_
- [x] TDD baby-steps (fail-first, one test at a time). Test cases: _(2026-07-17 · dd13be0)_
  - [x] title-only page still yields ≥1 chunk (F8 guard) — the invariant, as an explicit test
        (pre-existing empty-body test + new "title + degenerate body → title chunk survives").
  - [x] degenerate section (`---`, `<!-- ... -->`, `- ` stub) is pruned.
  - [x] substantial section is kept.
  - [x] threshold false-positive guards: URL-only + code-snippet → **KEPT**; image-only (no alt) +
        stub → **pruned**; boundary triangulated (`>= 25` inclusive: 25 kept / 24 pruned) + char
        class (punctuation/whitespace don't count).
- [x] Keep `rag/src/lib/indexer.ts`'s **loud 0-chunk surface** as backstop. Do **NOT** adopt the
      source brain's silent `persist-0-chunk-with-hash` (it pairs with a no-title-chunk design and
      would re-open the F8 silent-drop). _(verified intact at `indexer.ts:44-49`, untouched · 2026-07-17)_
- [x] Run mutation testing on `chunker` (Stryker) to confirm the new guard is covered.
      _(87.37% — 83 killed / 12 documented equivalent survivors; the new `isSubstantialBody` guard
      contributes **zero** survivors, boundary + char-class mutants all killed · 2026-07-17)_
- [x] Ensure `chunker.ts` is engine-owned in `engine-manifest.json` so the fix reaches upgraders via
      `update-engine`. _(`rag/src/**` already in the manifest `replace` bucket · verified 2026-07-17)_
- [ ] Re-run the read-only measurement after the change to confirm the pruned count matches (~105).
      _(needs the source vault path — Thomas's pre-existing brain, not in this repo; run from there.)_

Representative files: `rag/src/lib/chunker.ts`, `rag/src/lib/chunker.test.ts`,
`rag/src/lib/indexer.ts`, `engine-manifest.json`.

---

## Track B — Skills: classify & route

**Generic → launcher (de-identified):**

- [ ] `open-note` — open/synthesize a vault note from natural-language intent. Genericize any
      hard-coded vault-path / Obsidian-namespace assumptions.
- [ ] `mcp-token-expired` — connector reconnection guidance on auth errors. Strip the
      contractor/Gmail-specific caveat (make it a generic "connector unavailable" note).
- [ ] (Optional) extract the *pattern* of the source brain's structured-report skill as a generic
      "structured report" skill — with **no** names / executive-committee content.

**Private → personal brain ONLY (never this repo):**

- [ ] `refresh-*` (security / quality / deploy KPI refreshers), `setup-kpi`, and the concrete
      report skill (nominative content) stay in the personal brain.
- [ ] The employer Slack connector and KPI data files (`scripts/data/*.json`) stay private
      (personal brain's `.mcp.json` / `scripts/`).

**Already gained for free at install (nothing to do):** `coach`, `improve`, `local-mirror`,
`prepare-1-1`, `tdd-discipline`, `update-engine`, `import`.

---

## Track C — Constitution merge

**Port INTO the launcher template (generic disciplines it lacks or has weaker):**

- [ ] 4-phase main flux + diagram; "never ask permission to sync".
- [ ] Proactive action-item verification (check execution traces before reporting an action as "to do").
- [ ] Day-of-week ambiguity resolution (compute both dates, ask a one-line disambiguation).
- [ ] Context-rot thresholds (keep main session ~150–200k; sub-agents return ~500-token digests).
- [ ] RAG quota guardrails (daily cap, query reserve, single-writer lock) — template's RAG section is thinner.
- [ ] `vault/_inbox/` autostash safety net; "never write to Claude Code local memory, everything to the repo".
- [ ] Obsidian namespace routing vs default-editor routing; Slack permalink sourcing discipline.
- [ ] macOS `pbcopy` UTF-8 workaround (guarded as macOS-only).

**Keep the template's newer wins the source brain predates (do NOT regress):**

- [ ] Fail-loud RAG rule; native-tools-over-Bash discipline; first-launch wiring test;
      cross-platform editor routing; local-mirror citation pattern (🧠 local + 🔗 source).

**Mandatory scrub before anything touches the template:** remove all people names, Slack channel
names/IDs, org/account emails, product-team names, and any private-project references.

---

## Track D — Corpus migration (personal brain)

- [ ] Generate a fresh brain from the launcher (after Track A + generic bits of B/C have landed
      upstream), choosing the embedder consciously (privacy trade-off).
- [ ] From the **new** brain, run `/import` pointing at the source vault → 405 notes + attachments
      (demo skipped, no overwrite).
- [ ] Reindex; verify with a canary query (`node scripts/verify-rag.mjs` → exit 0).
- [ ] Layer the **private** skills (Track B) and the **merged** constitution (Track C) into the new
      brain (these are the parts that never go through the launcher).

---

## Sequencing & rationale

Recommended order: **A (engine)** → distill generic **C** + generic **B** into the launcher →
cut/ship the launcher → **generate** the brain → **D** import → layer private B/C on top.
Upstream-first means the freshly generated brain already carries the wins; the private, non-shareable
layer is applied last, directly in the personal brain.

## Verification

- Track A: `npm test` in `rag/`; Stryker mutation run on `chunker`; re-run the read-only pruning
  measurement (expect ~105 pruned on the source vault).
- Track D: `verify-rag` canary from the new brain (exit 0) proves the 405 notes are searchable.
