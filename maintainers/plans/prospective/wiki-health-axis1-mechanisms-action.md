<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🟢 Tracks A + B + C + D + E + F SHIPPED (A/B/C/E/F 2026-07-17, D 2026-  -->
<!-- 07-18). A = `/lint` wiki-health scanner. B = `/file-back` deterministic filer   -->
<!-- (a filed note passes /lint clean, never overwrites). C = `/consolidate`: a      -->
<!-- deterministic candidate finder (stateless "fresher-than-the-page" rule) + a     -->
<!-- fan-out/fan-in skill that writes via B. D = contradiction-flagging folded into  -->
<!-- C's refresh pass (facts live in prose here → LLM judgment; the draft surfaces a  -->
<!-- `### contradictions` block, the human adjudicates, nothing is silently           -->
<!-- overwritten). E = the append-only activity ledger (vault/actions-log.md) becomes -->
<!-- a seeded, first-class artifact, maintained by a SessionStart hook (seed-if-       -->
<!-- absent, never overwrites). F = a SessionStart trigger fires the scans on a real  -->
<!-- event and surfaces them in the chat (Desktop-visible), the write stays confirmed.-->
<!-- All proven on the real 405-note vault. Remaining: cross-cutting retrieval        -->
<!-- measurement + the formal private import (Thomas-side, see §Sequencing).          -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Action plan — give Axis 1 (wiki-health / consolidation) real mechanics

> **Why this plan exists.** The study
> [`llm-wiki-vs-embedding-rag-karpathy-graphify.md`](llm-wiki-vs-embedding-rag-karpathy-graphify.md)
> (§8 audit) established that Kenjaku ships **Axis 2** (retrieval / RAG) as a full versioned, tested,
> auto-updating engine, but ships **Axis 1** (the LLM-Wiki compile / consolidation discipline) as
> **constitution conventions with zero enforcement**. This plan gives Axis 1 some *mechanics*. The
> positioning / lineage rationale (we descend from Karpathy's LLM Wiki, not Graphify) lives in **ADR
> 0033**.
>
> **Architectural placement.** These are **engine features**: they ship to the whole fleet via
> `update-engine` (ADR 0012 packaging, ADR 0025 self-install of new engine skills/servers), they are
> **generic** (never carry private content), and they honour the **determinism ladder** (ADR 0009 —
> deterministic-first, LLM only where judgment is the point). They are **not** the import of any
> private brain (that is a separate, private track — see §Sequencing).

---

## Tracking

- [x] **Track A — The brain can detect where its wiki is bleeding** (`/lint` wiki-health) _(2026-07-17 · 131a72e…767caad)_
  - [x] Dangling `[[links]]` (target note missing) _(131a72e)_
  - [x] Orphan notes (zero inbound links) _(131a72e)_
  - [x] Stale entity pages (`updated:` old while cited in fresher notes) _(2a509fd)_
  - [x] Frontmatter conformance (required `type` / `created` / `updated` / `tags`) _(2a509fd)_
  - [x] Ship as an engine skill + a deterministic script, binary report _(a193743, 767caad)_
- [x] **Track B — The brain files a good answer back** into a durable note (semi-automatic, confirmed write) _(2026-07-17 · 87bf2f7 · `/file-back` engine skill + deterministic `filed-note` core, TDD)_
  - [x] Deterministic core `scripts/lib/filed-note.mjs` (slugify, path, conformant render — 15 tests)
  - [x] Thin CLI `scripts/file-back-note.mjs` (JSON spec on stdin, writes under vault/, never overwrites — 4 tests)
  - [x] Engine skill `engine-skills/file-back/SKILL.md` (propose → confirm → file; append path for living pages)
  - [x] Wired into `update-engine` manifest (`replace` + `scripts` 1.2.0→1.3.0); proven: filed note passes /lint clean
- [x] **Track C — The brain consolidates raw captures** into entity/topic pages, backlinks woven _(2026-07-17 · deterministic candidate finder + `/consolidate` skill, TDD, proven on the real 405-note vault)_
- [x] **Track D — (v2) The brain flags contradictions** between a new note and an entity page's stated fact _(2026-07-18 · folded into Track C's `/consolidate` refresh pass, skill 1.0.0→1.1.0, manifest `scripts` 1.6.0→1.7.0; flag-only, human adjudicates, never silently overwrites)_
- [x] **Track E — Append-only log is first-class** (seeded artifact + hook, not a `sync-sources` side-effect) _(2026-07-17 · e2c71f4 · seeded ledger + SessionStart maintainer hook, TDD, proven end-to-end + on the real 405-note vault)_
- [x] **Track F — Run the Axis-1 mechanics from a deterministic trigger** (a hook/event, not only on-demand) _(2026-07-17 · b81d937 · SessionStart hook `session-wiki-health.mjs` + pure `wiki-health-nudge` core, TDD, proven on the real 405-note vault)_
  - [x] `/lint` (read-only) auto-runs on a real event and surfaces its report _(SessionStart hook; only dangling links surface here, orphans/stale stay on-demand)_
  - [x] `/consolidate` **scan** auto-runs and surfaces candidates — the write stays confirmed (never auto-filed) _(scan only; the merge stays propose → yes)_
- [ ] **Cross-cutting — Measure the effect on retrieval** on the eval-set (better notes ⇒ better chunks)
- [ ] **Sequencing decided** — import-before vs import-after (see §Sequencing; recommendation recorded)

---

## Track A — `/lint`: detect where the wiki is bleeding (start here)

**WHAT.** The brain (and the user) can run one command and get an honest, binary health report of the
vault: what links point nowhere, what notes nobody links to, what entity pages have gone stale, what
frontmatter is malformed. This is the highest-leverage, lowest-risk Axis-1 mechanic and the most
"Kenjaku" (deterministic, fail-loud).

- [x] A deterministic scanner (pure JS, injected fs) that, given a vault path, returns a structured
      report: `danglingLinks[]`, `orphans[]`, `staleEntityPages[]`, `frontmatterViolations[]`
      _(`scripts/lib/wiki-lint.mjs`, 25 tests · 131a72e, 2a509fd)_
  - [x] TDD, rung 1 of the determinism ladder (ADR 0009): correctness in an I/O-free function, faked fs
        _(the pure core takes already-parsed notes; the fs adapter `wiki-lint-io.mjs` is the rung-2 seam)_
  - [x] Stale rule = an entity page (`type: person|topic|…`) whose `updated:` predates the newest note
        that `[[links]]` to it by more than a threshold (config, default e.g. 90 days) _(2a509fd)_
  - [x] Orphan rule = a note with zero inbound `[[links]]` (excluding `daily/`, `raw-sources/`, inbox) _(131a72e)_
- [x] A thin CLI wrapper with a **binary exit code** (rung 2): `exit 0` clean / `exit 1` + report
      _(`scripts/lint-vault.mjs`, injected deps port · a193743)_
- [x] An **engine skill** (`engine-skills/`) so the brain can run it conversationally and read the report
      _(`engine-skills/lint/SKILL.md` · 767caad)_
- [x] Wire into `update-engine` manifest so the fleet receives it (ADR 0012 / 0025)
      _(manifest `replace` + `engineVersion.scripts` 1.1.0→1.2.0 · 767caad)_
- [x] Measure: run against a **real** vault (see §Sequencing), not the 7-note demo — the demo cannot
      exercise orphan/stale/dangling logic meaningfully _(405-note vault: found the path-form link
      resolution bug — dangling 795→47, orphans 352→175 once fixed · 24b6c7f)_

## Track B — File the good answer back

**WHAT.** After a substantive exchange, the brain offers to distil the answer into a durable note
(topic / decision / entity page) with backlinks, so hard-won synthesis stops evaporating at the end of
a session. This is the "answers filed back" Karpathy discipline, absent today.

- [x] A convention + a light skill that proposes (never silently writes) a filed-back note, with a
      suggested target zone and `[[links]]` _(`engine-skills/file-back/SKILL.md`)_
  - [x] Writes stay **confirmed** (brain posture) — propose, the user says yes _(SKILL step 2: propose → yes)_
  - [x] Reuse the note taxonomy already documented in the constitution template _(`filed-note.mjs` FOLDER
        map + dated types mirror CLAUDE.md.template §"Note format"; frontmatter conformant by construction)_

> **Design note.** The deterministic kernel is the *note builder*, not the *judgment*: given a spec it
> emits a taxonomy-conformant `{ path, content }` (right zone, complete frontmatter, woven `[[links]]`)
> and **refuses to overwrite** — so a filed-back answer never re-introduces the defects Track A detects
> (proven: `file-back-note.mjs` output passes `/lint` clean). Refining an *existing* living page stays a
> confirmed conversational append (a dated section), which is the right rung of ADR 0009 for a
> judgment-laden merge, not a risky YAML round-trip.

## Track C — Consolidate raw captures into entity/topic pages

**WHAT.** On demand (or scheduled), the brain reviews recent raw captures (`meetings/`, `daily/`,
`raw-sources/`) and **promotes / updates** the higher-order pages: propagate a newly-mentioned person
into `people/`, merge topic fragments, weave backlinks. This is the heart of the compile discipline and
where the audit found the biggest gap (raw capture dominates; higher-order consolidation lags).

> **Design (agreed 2026-07-17).** Same three-rung shape as Tracks A/B: a **deterministic candidate
> finder** (rung 1) surfaces *what* needs consolidating; the **LLM fan-out** (`sync-sources` shape) does
> the *merge* (judgment); the **write reuses Track B** (`filed-note` builder for new pages, confirmed
> dated append for living pages — never overwrites). **Resumability is stateless** (owner's call): a
> capture is a candidate purely because it is **fresher than the page it feeds** (or that page doesn't
> exist yet) — no state file to seed or corrupt, most in the spirit of ADR 0009. Once a page is
> refreshed its `updated:` moves past the capture, so the candidate drops off on its own.

- [x] **Deterministic candidate finder** (`scripts/lib/consolidation-candidates.mjs`, pure/I/O-free, TDD
      rung 1) — reuses Track A's `extractWikiLinks` + resolver + note shape. Given parsed notes it returns
      candidates grouped by target page _(17 tests)_
  - [x] *new-page* — an entity/person `[[mention]]` in a **capture** note that resolves to **no page**
        (grouped by target, with its source captures + a count = signal strength)
  - [x] *refresh* — an existing **entity page** cited by a **capture** note that is **fresher** than the
        page's `updated:` (reuses `buildResolver`, now exported from wiki-lint; stateless, no threshold)
  - [x] Capture zones (`meetings/`, `daily/`, `raw-sources/`, `inbox/`) and entity types configurable;
        deterministic ordering (sorted by target, sources sorted) + `hasCandidates` / `reportLines`
- [x] **Thin CLI** (rung 2) over the fs adapter — reads the vault, prints a human candidate report,
      binary exit (0 nothing to consolidate / 1 candidates found) _(`scripts/consolidate-scan.mjs`, 3 tests)_
- [x] **Consolidation skill** (`engine-skills/consolidate/`) reusing the `sync-sources` fan-out/fan-in
      shape: one sub-agent per candidate drafts the merge; **propose → confirm → write via Track B**
      _(`engine-skills/consolidate/SKILL.md`)_
- [x] Bounded, resumable (stateless), and honest about what it changed (a diff/report the user reviews)
      _(skill steps 2 "bound the batch", 4 "propose as a reviewable diff", 6 "report + stateless resume")_
- [x] Wire into `update-engine` manifest so the fleet receives it (ADR 0012 / 0025) _(`scripts/consolidate-scan.mjs`
      declared in `replace`; core + skill ride `scripts/lib/**` + `engine-skills/**`; `scripts` 1.3.0→1.4.0;
      installer + self-heal enumerate `engine-skills/` dynamically → no hardcoded list)_
- [x] Measure on a **real** vault (the 405-note local corpus), not the demo — the scan meaningfully
      exercised both rules: 3 new-page candidates (entities cited in captures with no page) + 9 refresh
      candidates (entity/topic pages a fresher meeting/transcript overtook, one cited by 3), exit 1,
      read-only. The stateless "fresher-than-the-page" rule fires exactly where consolidation lags.

## Track D — (v2) Contradiction flagging

**WHAT.** When a new note asserts something that conflicts with an entity page's stated fact, the brain
flags it for the user rather than letting the wiki hold two truths. Needs LLM judgment → later rung.

> **Shipped (2026-07-18).** Folded into Track C's `/consolidate` refresh pass exactly as this track
> prescribed ("not a standalone engine at first"), skill `1.0.0 → 1.1.0`.
>
> **Why no deterministic engine (grounding, not laziness).** In this vault **facts live in prose**: the
> living `people/` and `topics/` pages accrete *dated appended sections* (constitution §"Note format"),
> and frontmatter is only metadata (`type/created/updated/tags`), never structured facts. So there is no
> `field = A` vs `field = B` seam to diff deterministically, contradiction detection is irreducibly LLM
> judgment over prose (rung 5+ of ADR 0009). Inventing a deterministic "contradiction engine" against a
> prose corpus would be over-engineering against an unproven risk, so the detection rides the LLM merge
> that Track C already runs, and the deterministic part is the pairing Track C *already* surfaces (a page
> + the fresher captures citing it = the refresh candidates). No new finder was needed.
>
> **What changed.** The refresh drafting sub-agent now watches for a capture that CONFLICTS with a fact
> the page states (changed role, reversed decision, different number/date/owner) and returns it under a
> `### contradictions` block instead of folding it in as an addition. The propose step surfaces conflicts
> FIRST and distinctly (⚠️ page says X, capture says Y); the user adjudicates (keep / adopt / dated
> "as of" both); a contradicting claim is **never** appended without that explicit decision. Strictly
> conservative: it can only make the human catch a conflict, it never makes the wiki worse.

- [x] Fold into Track A's report or Track C's pass, not a standalone engine at first _(Track C's refresh
      pass; see the shipped note above)_

> **Optional deterministic complement (not built, needs Thomas's call).** A *structural* sibling that IS
> deterministic and testable: flag **colliding entity pages** (two curated `person`/`topic` pages that
> resolve to the same link key), the structural precondition for "the wiki holds two truths". That is a
> different mechanic from semantic contradiction (it would fold into Track A's `/lint` report, TDD rung
> 1), deliberately left out tonight to avoid substituting a deterministic proxy for the LLM feature Track
> D actually asked for. Consider if false negatives from the LLM path prove to be a problem.

## Track E — Append-only log, first-class

**WHAT.** The append-only activity log becomes a seeded, maintained artifact (not a by-product of a
`sync-sources` run), so the "what happened" ledger always exists.

> **Shipped (2026-07-17 · e2c71f4).** Same three-rung shape as Tracks A/B/F. A pure core
> (`scripts/lib/actions-log-seed.mjs`, 6 tests) owns the /lint-conformant seed content and a
> write-if-absent fs seam that never overwrites real history; a SessionStart hook
> (`scripts/session-actions-log.mjs`, 5 tests) is the maintainer on a real event. The seed carries
> `type: log` frontmatter and fences its format example (so it is neither a frontmatter violation nor
> a dangling link), and `actions-log.md` joins the linter's raw-zone orphan exclusion — proven
> lint-clean through the real rung-2 reader. `sync-sources` (en + fr) reconciled: the ledger is now a
> seeded artifact to append to. Wired fleet-wide (manifest `replace` + `scripts` 1.5.0 → 1.6.0,
> settings template after `session-wiki-health`, delivered by `reconcileHooks` add-if-absent).

- [x] Seed the artifact at install + maintain it via a hook bound to a real event (rung 3, ADR 0009)
  - [x] Pure core: `/lint`-conformant seed content + write-if-absent fs seam (never overwrites) +
        the SessionStart hook output builder (quiet unless it just seeded) _(6 tests)_
  - [x] SessionStart hook seeds-if-absent on a real event → upgraders that never re-run the installer
        still gain the ledger; a one-time chat note, then silent _(5 tests, fail-open)_
  - [x] Installer seeds it for fresh brains from the first run
  - [x] Linter: `actions-log.md` joins the raw-zone orphan exclusion (a grep-able ledger is not a wiki
        node) — proven lint-clean on the real rung-2 reader; a fresh brain stays silent on day one
  - [x] Wired fleet-wide (manifest `replace` + `scripts` 1.5.0 → 1.6.0, settings template, reconcileHooks);
        `sync-sources` docs (en + fr) reconciled

## Track F — Run the Axis-1 mechanics from a deterministic trigger

**WHAT (owner's ask, 2026-07-17).** Today `/lint` and `/consolidate` are **on-demand only** (a
conversational trigger). The goal: let them fire **on their own**, from a **deterministic hook bound to a
real event** (rung 3 of ADR 0009), so wiki-health stops depending on the user remembering to ask — while
never turning a silent auto-write loose.

- [x] Pick the **event** (deterministic, verifiable): **SessionStart** — the established maintenance
      rendez-vous (self-heal / health / obsidian-hint / status already fire there). No timer, no counter:
      the scans are **stateless** (a candidate exists purely because a capture is fresher than its page),
      so the event alone is enough; the hook stays quiet when there's nothing actionable.
- [x] **`/lint` is read-only → safe to auto-run**: the scan fires on SessionStart. **Only dangling links**
      surface here (true regressions); orphans/stale/frontmatter are a standing backlog on a real vault →
      they stay in the on-demand `/lint` (the noise guardrail, locked by a test).
- [x] **`/consolidate` writes → auto-run only the SCAN**: candidates surface on the event, the merge/write
      **stays confirmed** (propose → the user says yes). Never auto-file. The directive itself carries this
      posture ("OPTIONAL housekeeping … NEVER auto-file … stays confirmed").
- [x] Honour the determinism ladder: **trigger** deterministic (SessionStart hook, rung 3), **detection**
      deterministic (`lintVault` + `consolidationCandidates`, rung 1), **surface** an `additionalContext`
      directive the agent relays in the chat (rung 6, the only Desktop-visible channel), **merge** stays
      LLM+confirmed on-demand.
- [ ] Sibling to Track E (both are "maintain Axis 1 via a hook on a real event, not a by-product") — share
      the wiring/lesson where they overlap _(Track E still prospective; reuse this hook's shape when built)_
- [x] Keep the on-demand skills working unchanged; the hook is an **addition**, not a replacement
      (`/lint` and `/consolidate` skills untouched; the hook only reuses their pure cores)

> **Shipped (2026-07-17 · b81d937).** `scripts/session-wiki-health.mjs` (fail-open SessionStart hook) +
> `scripts/lib/wiki-health-nudge.mjs` (pure core, 7 tests), wired as the 5th SessionStart group after
> `session-self-heal`, carried in the manifest (`scripts` 1.4.0 → 1.5.0), delivered fleet-wide by the
> existing `reconcileHooks` add-if-absent. Surface channel = `additionalContext` (chat, Desktop-visible),
> mirroring `buildSelfHealHookOutput`. A linter false positive surfaced en passant and was fixed at the
> root: `extractWikiLinks` now ignores `[[links]]` inside fenced/inline code (Obsidian doesn't linkify
> code), so the shipped demo vault is lint-clean and a **fresh brain stays silent on day one**. Proven on
> the real 405-note vault (nudge: 12 consolidation candidates + 47 dangling links); full suite 642/642.

---

## Sequencing — import the private brain BEFORE or AFTER building the linter?

**The question (owner, 2026-07-17):** do I import my old brain first and then test the linter etc., or
build the linter first and import after?

**Key realisation that dissolves the dilemma.** These are **two different tracks on two different
artifacts**:
- The **linter / Axis-1 mechanics** are **engine features** (generic, ship to the fleet). Their
  *development* needs a **real, messy, rich corpus** to be worth anything — the 7-note demo cannot
  exercise orphan / stale / dangling logic.
- The **import** moves **private content** into the personal brain (its own chantier:
  [`second-brain-migration-and-engine-upstream-action.md`](second-brain-migration-and-engine-upstream-action.md)).
- **We already have a real 733-note vault locally** (the originating private brain). So "having a real
  corpus to build the linter against" is **available today** and does **not** block on the formal import.

**Recommendation (deterministic-first, validate on real not demo — [[validate-shipped-not-test-instance]]):**

- [x] **Build Track A (`/lint`) now, using the real local vault as the dev/test corpus** (read-only
      fixture) — it is the linter's killer use case and its only honest test bed
      _(done 2026-07-17 — the real vault immediately paid off by exposing the path-form link bug)_
- [ ] **Then run the formal import** into the generated brain — by then the linter is ready to
      health-check the arriving notes, and the import becomes the linter's first real job (compile-on-
      ingestion, the Karpathy discipline applied to the migration itself)
- [ ] **Then iterate Track A + Track C against the imported vault** and measure on the eval-set

> **In one line:** you don't have to choose. Build the linter **against the real vault you already
> have** (independent of the migration's timing); run the **formal import once the linter exists** so
> the imported notes land already health-checked. Only if the import is imminent anyway does
> "import-first" become strictly better — the linter's *development* never has to wait for it.

---

## Related

- Study: [`llm-wiki-vs-embedding-rag-karpathy-graphify.md`](llm-wiki-vs-embedding-rag-karpathy-graphify.md)
- Positioning / lineage: [`../../decisions/0033-descends-from-karpathy-llm-wiki-not-graphify.md`](../../decisions/0033-descends-from-karpathy-llm-wiki-not-graphify.md)
- Determinism ladder: [`../../decisions/0009-prefer-deterministic-mechanisms.md`](../../decisions/0009-prefer-deterministic-mechanisms.md)
- Engine packaging / self-install: ADR 0012, ADR 0025
- Import chantier (private content): [`second-brain-migration-and-engine-upstream-action.md`](second-brain-migration-and-engine-upstream-action.md)
- Sibling RAG watch: [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md)
