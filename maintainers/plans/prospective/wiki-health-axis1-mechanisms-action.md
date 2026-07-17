<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🟢 Tracks A + B SHIPPED (2026-07-17). Track A = `/lint` wiki-health   -->
<!-- scanner (TDD, proven on the real 405-note vault). Track B = `/file-back`      -->
<!-- deterministic filer (TDD, proven: a filed note passes /lint clean, never      -->
<!-- overwrites). Both are engine skills. Tracks C–E still prospective.            -->
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
- [ ] **Track C — The brain consolidates raw captures** into entity/topic pages, backlinks woven
- [ ] **Track D — (v2) The brain flags contradictions** between a new note and an entity page's stated fact
- [ ] **Track E — Append-only log is first-class** (seeded artifact + hook, not a `sync-sources` side-effect)
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

**WHAT.** On demand (or scheduled), the brain reviews recent raw captures (`meetings/`, `daily/`) and
**promotes / updates** the higher-order pages: propagate a newly-mentioned person into `people/`, merge
topic fragments, weave backlinks. This is the heart of the compile discipline and where the audit found
the biggest gap (raw capture dominates; higher-order consolidation lags).

- [ ] A consolidation skill reusing the `sync-sources` fan-out/fan-in shape
- [ ] Bounded, resumable, and honest about what it changed (a diff/report the user reviews)

## Track D — (v2) Contradiction flagging

**WHAT.** When a new note asserts something that conflicts with an entity page's stated fact, the brain
flags it for the user rather than letting the wiki hold two truths. Needs LLM judgment → later rung.

- [ ] Fold into Track A's report or Track C's pass, not a standalone engine at first

## Track E — Append-only log, first-class

**WHAT.** The append-only activity log becomes a seeded, maintained artifact (not a by-product of a
`sync-sources` run), so the "what happened" ledger always exists.

- [ ] Seed the artifact at install + maintain it via a hook bound to a real event (rung 3, ADR 0009)

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
