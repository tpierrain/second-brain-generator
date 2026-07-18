<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔭 PROSPECTIVE / ANALYSIS (2026-06-21) — design captured, not yet an  -->
<!-- ADR, NOT implemented. Provisional direction agreed; decide + write the ADR     -->
<!-- when a release actually changes the constitution (see "Why this is non-blocking"). -->
<!-- SEQUENCING DECIDED (2026-07-18): fresh-install "green" (legacy-safe) ships       -->
<!-- BEFORE the personal-brain migration; the deployed fleet's re-layering + the      -->
<!-- broader big-jump upgrade experience (completeness, what-you-gained notes,        -->
<!-- pre-flight reindex preview) + heavy QA are deferred AFTER it. See "Sequencing    -->
<!-- decision" below.                                                                 -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Propagating engine improvements into user-editable provided files (constitution + shipped skills)

## The problem (the WHAT)

A brain has files that are **both upstream-provided AND user-editable** — chiefly the **constitution
`CLAUDE.md`** and the **shipped skills** (`coach`, `prepare-1-1`, …). Today the reconciler protects them
perfectly but **at the cost of zero propagation**:

- `CLAUDE.md` and `.claude/settings.json` are `SACRED_FILES` (`scripts/lib/engine-apply-plan.mjs:32`) →
  **never written by any engine path**. So an engine improvement to the constitution **never reaches an
  existing brain** — and note: it is frozen **regardless of whether the user ever edited it** (it is not
  "edit once → frozen"; it is "frozen, period").
- Shipped skills are `installSkills` = **install-if-absent** (ADR 0025): an already-present skill (possibly
  user-edited) is left **byte-identical**, so skill bugfixes/improvements never reach a brain that has it.

The reconciliation guarantee ("only ever modify what comes from the engine, and only when absent") is
**safe by construction** (write-allowlist + sacred scrub, ADR 0012). The open question is the *other* half:
**how to deliver improvements to these files without ever clobbering the user's edits.**

## Provisional decision (agreed with Thomas 2026-06-21, to confirm + ADR after the demo)

**Option 3 as the foundation, options 2/1 as the safety net.**

- **3 — Separate engine-managed content from personal content *inside* the file** (the foundation).
  The constitution carries an **engine-managed block** (delimited, e.g. `<!-- ENGINE:BEGIN -->…<!-- ENGINE:END -->`)
  that moves back into the **`replace`** regime (always refreshed, like `rag/src`), plus **personal zones**
  that stay `sacred`. This **eliminates conflicts by construction** — no base to store, no merge algorithm,
  no conflict UX, **deterministic** (aligns with ADR 0009). It maps the file's reality: most of `CLAUDE.md`
  is engine machinery; the personalization (owner, role, language, persona) is localized. Composes with an
  **include / layered** model (`CLAUDE.md` engine-owned `@import`s a `CLAUDE.personal.md` sacred → nothing
  to merge at all). _Prior art: Ansible "BEGIN/END MANAGED BLOCK", managed blocks in `/etc/hosts` / `known_hosts`._
- **2 — 3-way merge** (the net for "the engine block was edited anyway", and for legacy migration).
  Store the **base** (the originally-provided version); at upgrade have `base` / `theirs` / `new` → auto-apply
  clean hunks, surface only real conflicts. This is what ADR 0012 already promised ("merge 3-way, hunk by
  hunk"). **Feasible here because the constitution is already template-rendered** (`constitutionTemplate`
  version in the manifest) → the base is recoverable by re-rendering the install-time template version with
  the same personalization params. _Prior art: git 3-way merge._
- **1 — Conffile fallback** (the simplest net). On conflict: **keep theirs**, drop the new version
  **alongside** (`CLAUDE.md.new`), and **tell the user**. Manual merge, zero auto-merge risk.
  _Prior art: Debian `dpkg` conffiles / `ucf`, `.rpmnew`._

Always **opt-in and non-destructive**: no silent overwrite, ever. The same logic would replace the frozen
install-if-absent behavior for shipped skills.

## Open questions / caveats (for the ADR)

- [ ] **Legacy migration is the hard part.** Existing brains have a **monolithic** `CLAUDE.md` with personal
  edits scattered anywhere — the `ENGINE:BEGIN/END` boundary cannot be inferred retroactively without risk
  of capturing a personal edit inside the engine block. Option 3 needs a migration story (likely lean on the
  2/1 net for the first jump, or introduce the boundary only on fresh installs + a guided one-time migration).
  _(Sequencing + safety framing decided 2026-07-18, see "Sequencing decision": fresh installs get the
  boundary; deployed monoliths stay sacred/untouched and are re-layered later via an opt-in, QA'd upgrade,
  never inferred blindly. The retro-fit split algorithm itself still to design.)_
- [ ] **Editing an engine *instruction*** (not just adding one's own) — prose doesn't override like CSS;
  decide whether that's supported (probably via the personal zone / overrides, or accepted as out-of-scope).
- [ ] **Where the base lives** for option 2 (store the rendered base, or the template version + params to
  re-render). Keep it engine-owned, read-only to the user.
- [ ] **`engine-manifest.json` itself** is currently in **no regime** — confirm it is engine-owned (it should
  travel in `replace`) and never user-edited (the "read-only little paper" Thomas described).
- [ ] **Skills** follow the same model (managed vs user-authored; user-authored already fully safe via the
  `SACRED_TREES` `.claude/skills/` rule).

## Why this is non-blocking today

Upgrading an **already-configured** brain (edited constitution, custom skills) is **safe right now**, for three
independent reasons — so this enhancement is not required to ship any current release:

1. **No release has ever changed the constitution.** `constitutionTemplate` has been `1.0.0` across every
   version (rag 1.1.0 → 1.1.5) → there is literally nothing to propagate yet.
2. **The reconciler never clobbers user-edited files** — `CLAUDE.md` is `SACRED`, custom skills live under
   the `.claude/skills/` sacred tree, the vault and `.env` are sacred (write-allowlist, ADR 0012).
3. **A stale constitution cannot break the engine** — it is instructions for Claude, not code the engine
   executes; the RAG / MCP / hooks work regardless of its content.

This enhancement becomes relevant only the day a release *does* change the constitution (a `constitutionTemplate`
bump). Until then, the current install-if-absent / sacred behavior is the correct, safe default.

## Sequencing decision (2026-07-18) — after the personal-brain migration; broaden to the fleet's upgrade experience

**Decision.** Build the *legacy re-layering* (retro-fitting existing monolithic brains) **after** the personal
second-brain migration (`second-brain-migration-and-engine-upstream-action.md`, Track D). Ship **only** the
*legacy-safe fresh-install layering* **before** that migration's generate step, so the regenerated personal
brain is born two-layer. This surfaced while realising the concern is broader than the constitution merge: it
is the **whole upgrade experience for the brains already deployed in the field** from an earlier Kenjaku
release (the pre-layering, monolithic-constitution line, ~v3.2.x).

- [ ] **Fresh-install layering ("green") is a prerequisite of the migration's generate step, and must be
      legacy-SAFE by construction.** Do **not** remove `CLAUDE.md` from `SACRED_FILES`
      (`scripts/lib/engine-apply-plan.mjs:32`): that would expose every deployed monolithic brain to a clobber
      on its next update. Instead **add a new engine-owned constitution layer file** (e.g. `CLAUDE.engine.md`,
      in `replace`, absent from `SACRED_FILES`) that a fresh, thin, sacred `CLAUDE.md` `@import`s. Deployed
      monolithic brains keep their sacred `CLAUDE.md` untouched (they simply lack the new file).
  - [ ] **Green-time "do-no-harm" QA (required before releasing green):** prove a reproduced legacy brain
        updating past green is untouched — no clobber of its `CLAUDE.md`, no reindex, no behaviour change.
- [ ] **The heavy re-layering QA is safely deferred to AFTER the migration.** The deployed fleet is safe in the
      interim, for the reasons in "Why this is non-blocking": sacred `CLAUDE.md`, `constitutionTemplate` frozen
      at `1.0.0`, a stale constitution cannot break the engine. Nothing forces their upgrade.
- [ ] **The deferred chantier is the fleet's UPGRADE EXPERIENCE, not only the constitution merge.** Scope:
  - [ ] **(A) Completeness across a big jump.** `update-engine` is **state-convergent** (fetch the latest ref,
        apply the current manifest's regimes → one jump converges to target; the manifest + reconciler are
        present since before v3.2.1), so no intermediate versions are replayed. The remaining completeness gap
        is exactly the **frozen** files: the constitution (this plan) and the shipped user-skills under
        `.claude/skills/` (`coach`, `prepare-1-1`, … install-if-absent). Close them the same way.
  - [ ] **(B) Tell the user what they gained.** A human, benefit-framed changelog spanning the jump (from the
        brain's recorded ref to target), surfaced at upgrade. Reuse the "The One With…" release codenames as the
        substrate; suited to non-technical owners.
  - [ ] **(C) Pre-flight preview (say it BEFORE upgrading).** A dry-run that computes the apply plan **and the
        reindex decision** (recorded vs target `indexSchemaVersion`) and shows it before applying: what lands,
        and whether notes will be re-encoded + the rough cost. Today `update-engine` reports reindex only
        *after* (`scripts/update-engine.mjs:15`, `runReindex` IFF the schema moved); expose it *ahead*.
  - [ ] **Grounded reindex fact:** `indexSchemaVersion` has been **`1` continuously** since before v3.2.1
        (introduced 2026-06-14, never changed) through today → a **v3.2.x → current jump triggers NO reindex**.
        A reindex only ever fires if the index format changes in the future — exactly when (C) earns its keep.
  - [ ] **QA fixtures:** reproduce legacy brains from the release **tag(s)** (checkout the deployed version, run
        the installer) + **synthetic** personal edits to exercise the nasty boundary cases. Never use real
        deployed brains' private content. First step: **enumerate the versions actually deployed** so QA covers
        the real span.
- [ ] **This deferred chantier likely graduates to its own plan** ("engine upgrade experience for the deployed
      fleet") when picked up; F-B7e (constitution re-layering) becomes one component of it.

> Cross-ref: the reciprocal prerequisite note lives in the migration plan's Track D.

## Next steps (post-demo)

- [ ] Promote this analysis into a dedicated **ADR** (lead with a Crux; name the prior art — §6quater/§6quinquies
  of `CONVENTIONS.md`); amend ADR 0012 in place if it changes the merge-regime mechanics.
- [ ] Decide the legacy-migration path (the gating caveat above).
- [ ] Plan + TDD the implementation as its own change, **not** under release pressure.
