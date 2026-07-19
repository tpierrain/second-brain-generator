# Migrate a pre-existing second brain into a generated brain — capability gap analysis & strategy

> **Status:** in progress upstream (refreshed 2026-07-17). **Track A DONE** (merged to `main` via
> PR #29, squash `9448230`, cross-platform CI green). **Track B DONE** and **merged to `main`** via
> PR #30 (squash `2420fdc`) — the 2 generic skills now ship at `engine-skills/open-note` and
> `engine-skills/mcp-token-expired`. **Next: Track C** (constitution merge). Tracks D/F not started.
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

## Strategy: migrate early, explore later

The single most important sequencing decision: **migrate the personal brain as soon as the generic
delta is upstreamed — do not gate migration on open-ended product exploration.**

Rationale: while the source brain stays a hand-built harness decoupled from this launcher, every
product improvement made here has to be *re-ported by hand* to the personal brain. Once migrated, the
personal brain is a **clean launcher instance**, so any engine improvement shipped afterwards flows
back to it automatically via `update-engine`. Closing that loop early is the whole point — later
exploration then benefits the personal brain for free instead of doubling the work. Migrating early
does **not** lock anything in: `update-engine` is designed to propagate engine changes after the fact.
The only class of change worth deciding *before* generating is one that alters **vault structure / note
conventions** — a content-layer concern, adjustable post-hoc, not a blocker.

This splits the work into **three bodies**, in order:

1. **Catch the launcher up** (Tracks A / B-generic / C-generic) — prerequisite, else the freshly
   generated brain regresses below the source brain. **Track A is already all-but-done here.**
2. **Migrate** (Track D) — generate → `/import` → layer private capabilities.
3. **Product exploration** (Track F) — net-new ideas (regular content ingestion, new capture flows,
   inspiration from other second brains). **After** migration, flowing back via `update-engine`.

## Tracking

- [x] **Track A — Engine: embedder/chunker degenerate-chunk pruning** (upstream to launcher)
      — DONE: merged to `main` via PR #29 (squash `9448230`, 2026-07-17), cross-platform CI green;
      mutation-proven; re-measurement confirmed (105 exact).
- [x] **Track B — Skills: classify & route** (generic → launcher, private → personal brain)
      — DONE and **merged to `main`** (PR #30, squash `2420fdc`): 2 generic skills upstreamed as
      English `engine-skills/` sources (`open-note`, `mcp-token-expired`), delivery proven to fresh
      installs + upgraders. Private skills classified (stay in personal brain, layered in Track D).
      _(2026-07-17 · PR #30 / 2420fdc)_
- [x] **Track C — Constitution merge** (distill generic disciplines to template; keep newer template wins)
      — DONE: 6 generic disciplines ported to `templates/fr/CLAUDE.md.template` (de-identified, no
      em-dash, neutral phrasing) + generic embedder-agnostic quota note; template's newer wins verified
      not regressed. Two items **deliberately deferred** (`_inbox` autostash = source flags it
      prototype; macOS `pbcopy` workaround = orphan, no host feature). _(2026-07-17 · branch
      `feat/constitution-merge-track-c`)_
- [ ] **Track D — Corpus migration** (generate brain → `/import` 405 notes → layer private capabilities)
- [x] **Track E — Canonical plan** relocated to `maintainers/plans/prospective/` — done (this file, 2026-07-11)
- [ ] **Track F — Product exploration** (regular content ingestion + ideas from other second brains) — *post-migration; may be prepared in parallel*

Recommended order: **A → generic B/C → ship launcher → D (generate → import → layer private) → F**.

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
- [x] Re-run the read-only measurement after the change to confirm the pruned count matches (~105).
      _(confirmed 2026-07-17: **exactly 105** prunable chunks across 405 docs — 63 docs affected,
      2.59% of body chunks — all degenerate scaffolds (`---`, empty comments, bare bullets), **zero
      false positives**; title chunks untouched → F8 preserved. Read-only, no writes to the vault.)_
- [x] Merge `feat/chunker-degenerate-body-pruning` to `main` once the measurement confirms.
      _(PR #29, squash `9448230`, 2026-07-17 — cross-platform CI green: Node 22/24/26 × macOS/Windows.)_

> **Note on the source brain's companion hardenings (NOT in this branch).** The source brain shipped
> the chunk filter together with three more tweaks on 2026-07-07: Gemini-boilerplate stripping,
> top-k per-doc dedup in search, and transient-network retry in the embedder. These are **generic**
> and worth a follow-up upstream pass if the launcher targets transcript-fed vaults — but they are
> out of scope for this branch, which is chunker-only. Track separately if desired.

Representative files: `rag/src/lib/chunker.ts`, `rag/src/lib/chunker.test.ts`,
`rag/src/lib/indexer.ts`, `engine-manifest.json`.

---

## Track B — Skills: classify & route

**Generic → launcher (de-identified):**

- [x] `open-note` — open/synthesize a vault note from natural-language intent. Genericized to a
      neutral user + placeholder examples; ships English at `engine-skills/open-note/`.
      _(2026-07-17 · 235bae2)_
- [x] `mcp-token-expired` — connector reconnection guidance on auth errors. Contractor/Gmail-specific
      caveat generalized to a neutral "connector unavailable by design" note; ships English at
      `engine-skills/mcp-token-expired/`. _(2026-07-17 · 235bae2)_
- [x] ~~(Optional) extract the *pattern* of the source brain's structured-report skill~~ — **dropped
      on decision**: the report was for a past context, will not be regenerated → not ported (not even
      the pattern). _(2026-07-17)_

**Private → personal brain ONLY (never this repo):** — classified; actioned in Track D (layering).

- [ ] `refresh-*` (security / quality / deploy KPI refreshers — `refresh-aikido`, `refresh-deploys`,
      `refresh-sonar`), `setup-kpi`, and the concrete report skill (`rapport-etonnement`, nominative
      content) stay in the personal brain. _(classified 2026-07-17; layered in Track D)_
- [ ] The employer Slack connector and KPI data files (`scripts/data/*.json`) stay private
      (personal brain's `.mcp.json` / `scripts/`). _(classified 2026-07-17; layered in Track D)_

**Already gained for free at install (nothing to do):** `coach`, `improve`, `local-mirror`,
`prepare-1-1`, `tdd-discipline`, `update-engine`, `import`.

---

## Track C — Constitution merge

**Port INTO the launcher template (generic disciplines it lacks or has weaker):**

- [x] 4-phase main flux + diagram; "never ask permission to sync". _(already present in the template
      §4, confirmed no regression · 2026-07-17)_
- [x] Proactive action-item verification (check execution traces before reporting an action as "to do").
      _(ported as a question-first 3-phase block in the template §backlog, de-identified · 2026-07-17)_
- [x] Day-of-week ambiguity resolution (compute both dates, ask a one-line disambiguation).
      _(ported to §5 Règles générales, portable-Node dates · 2026-07-17)_
- [x] Context-rot thresholds (keep main session ~150–200k; sub-agents return ~500-token digests).
      _(threshold + "context window is a capacity not a cruise regime" framing added to §5 delegation · 2026-07-17)_
- [x] RAG quota guardrails (daily cap, query reserve, single-writer lock) — template's RAG section is thinner.
      _(ported as a GENERIC, embedder-agnostic note — single-writer lock + query reserve — NO Gemini
      numbers, since the launcher is multi-embedder · 2026-07-17)_
- [x] ~~`vault/_inbox/` autostash safety net~~; "never write to Claude Code local memory, everything to the repo".
      _memory-in-repo ported to §5 (generic rationale: portability + survives `/clear`). **`_inbox`
      autostash DEFERRED** — the source brain itself flags it "prototype, evaluate before porting to
      the product"; no host feature in the template yet. · 2026-07-17_
- [x] Obsidian namespace routing vs default-editor routing; Slack permalink sourcing discipline.
      _Resolution: the template's **cross-platform default-editor routing is the newer win** (the
      source brain's hard `obsidian://` routing is older) → brought the **FR** template to parity with
      the **EN** base's editor-routing section (FR was missing it); Obsidian stays optional/recommended.
      Slack permalink discipline genericized into a source-agnostic "Sourçage et traçabilité" mini-section
      in **both** templates. · 2026-07-17_
- [ ] ~~macOS `pbcopy` UTF-8 workaround (guarded as macOS-only).~~ **DEFERRED** — orphan: it is bound
      to the source brain's Slack-draft-to-clipboard feature, which does not exist in the template.
      Re-port only if a clipboard/draft feature lands. _(2026-07-17)_

**Keep the template's newer wins the source brain predates (do NOT regress):**

- [x] Fail-loud RAG rule; native-tools-over-Bash discipline; first-launch wiring test;
      cross-platform editor routing; local-mirror citation pattern (🧠 local + 🔗 source).
      _(all verified still present in the template, no regression from the merge · 2026-07-17)_

**Mandatory scrub before anything touches the template:** remove all people names, Slack channel
names/IDs, org/account emails, product-team names, and any private-project references. _(Applied:
`git diff` scrub confirmed zero private terms leaked · 2026-07-17.)_

> **Two constitution templates, kept in parity.** The launcher ships a root **EN base**
> `CLAUDE.md.template` (copied for every brain) and a **FR overlay** `templates/fr/CLAUDE.md.template`
> (applied for `--lang fr`, a deliberate product localization). Every Track C port landed in **both**
> (EN in English, FR in French, no em-dash). The 564 harness tests stay green (incl. the
> constitution-mirror-citations parity test).
>
> **Discovered drift (out of Track C scope, follow-up):** the FR overlay is still missing the EN base's
> §4 **"Local mirrors"** routing section (the `mcp__local-mirror__*` tool table + routing rule) — a
> localization gap for `fr` brains, unrelated to the source-brain merge. Track separately: a FR↔EN
> constitution parity pass.

---

## Track D — Corpus migration (personal brain)

> **Cross-plan order:** this is Gate 3 of [`../ROADMAP.md`](../ROADMAP.md) — it depends on Gate 1
> (green) **and** Gate 2 (universes) landing first (see the prerequisites below).

- [ ] Generate a fresh brain from the launcher (after Track A + generic bits of B/C have landed
      upstream), choosing the embedder consciously (privacy trade-off).
  - [ ] **Prerequisite (engine):** the *legacy-safe fresh-install constitution layering* ("green") must land
        in the launcher FIRST, so the regenerated brain is **born two-layer** and future constitution
        improvements keep flowing to it. See the "Sequencing decision" in
        `engine-managed-file-merge-strategy.md`. Skipping it would make this brand-new brain a future
        monolithic-legacy case.
  - [ ] **Prerequisite (engine): universes** (ADR 0034) must land too, so the brain is born
        universe-aware and `/import --universe` can stamp the notes at import time. Canonical plan:
        `universes-progressive-disclosure-action.md` (ROADMAP Gate 2).
- [ ] From the **new** brain, run `/import --universe <name>` pointing at the source vault → 405 notes +
      attachments, **stamped into their universe** (demo skipped, no overwrite).
- [ ] Reindex; verify with a canary query (`node scripts/verify-rag.mjs` → exit 0).
- [ ] Layer the **private** skills (Track B) and the **merged** constitution (Track C) into the new
      brain (these are the parts that never go through the launcher).

> **Not a fleet fixture.** The source brain is **not** a Kenjaku brain (it only supplies the notes to
> `/import`), so it is **not** a legacy-upgrade fixture. Re-layering the brains already deployed from an
> earlier Kenjaku release, and its substantial QA (completeness across a big jump, a "what you gained"
> changelog, a pre-flight reindex preview), is a **separate, deferred** chantier: see
> `engine-managed-file-merge-strategy.md` §"Sequencing decision". Deferring it is safe: those brains are
> sacred/working today and a v3.2.x → current jump triggers no reindex (`indexSchemaVersion` unchanged).

---

## Track F — Product exploration (post-migration)

**WHY here:** open-ended R&D on the launcher itself — how a second brain captures and ingests
content over time. Explicitly sequenced **after** migration so it never delays it, and so every
result flows back to the (now clean) personal brain via `update-engine`. Can be *prepared* in
parallel (a research pass on how popular second-brain tools handle continuous capture) without
blocking A→D.

- [ ] Research pass — survey patterns from other second brains / PKM tools (regular content
      ingestion, capture inbox flows, review/resurfacing loops, marketing-visible ideas). Deliver a
      triaged idea list, not a build order.
- [ ] Triage the ideas against the launcher's design; decide which are engine-owned (propagate via
      `update-engine`) vs. content-convention (adjust in each brain).
- [ ] For any note-convention change, note it may be cleaner to fold into the generate step for
      *future* brains — but never a blocker for the already-migrated personal brain.

### Sequencing lens for incoming ideas — "migrate before or after?" (avoid re-embed churn)

**The concern (Thomas, 2026-07-17):** before feeding in articles/tweets about other second brains,
decide whether to migrate the personal corpus **before or after** adopting any idea, to avoid
re-embedding ~405 notes twice.

**How re-embedding actually works (so we don't over-worry):** the RAG is **content-hash incremental** —
only notes whose **text changes** re-embed, never the whole vault, and never on engine/skill/hook
changes. The migration itself embeds everything **once** (the `/import` + reindex). The **cost of any
later re-embed is governed by the embedder**: `in-process` = free + offline, re-embed anytime at no
quota cost; an **API embedder** (Gemini/OpenAI/…) = quota + time for the touched notes.

**Triage each incoming idea into one of two buckets:**

- [ ] **Bucket 1 — changes vault STRUCTURE or NOTE CONVENTIONS** (frontmatter shape, folder layout,
      section/heading conventions, tagging scheme). These rewrite note **content** → they *would*
      re-embed the touched notes. **Cheaper to decide BEFORE generating** (fold into the generate /
      `/import` step) so the single big embed already lands in the final shape. → **may justify holding
      the migration.**
- [ ] **Bucket 2 — engine / skill / hook / behavior** (capture inbox flows, resurfacing loops, new MCP
      tools, constitution rules, sync cadences). These **don't touch note content** → **no re-embed**.
      Safe to add **AFTER** migration; they flow back to the migrated brain via `update-engine`. →
      **migrate-early is fine; do not hold the migration for these.**

**Net recommendation:** bring the articles; triage each idea into Bucket 1 vs 2. **Only Bucket-1 items
justify migrating later**; everything else → migrate now, layer afterwards. And if the personal brain
uses the **in-process** embedder, even Bucket-1 re-embeds are cheap/offline, which further weakens the
"must decide before" pressure — the only hard reason to wait would be a big structural convention we're
confident about up front.

---

## Sequencing & rationale

Recommended order: **A (engine)** → distill generic **C** + generic **B** into the launcher →
cut/ship the launcher → **generate** the brain → **D** import → layer private B/C on top → **F**
exploration. Upstream-first means the freshly generated brain already carries the wins; the private,
non-shareable layer is applied last, directly in the personal brain; exploration comes last and
benefits the personal brain automatically because the loop is now closed.

## Verification

- Track A: `npm test` in `rag/`; Stryker mutation run on `chunker`; re-run the read-only pruning
  measurement (expect ~105 pruned on the source vault).
- Track D: `verify-rag` canary from the new brain (exit 0) proves the 405 notes are searchable.
