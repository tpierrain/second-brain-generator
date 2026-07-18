<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🧭 LIVING — ordering authority across the active plans.               -->
<!-- This file owns the CROSS-PLAN ORDER only. It never duplicates a plan's         -->
<!-- content (checkboxes, done/remains, commits): each plan stays the single        -->
<!-- source of truth for its own state; this is the map that says which goes first. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# 🧭 ROADMAP — cross-plan ordering authority

**What this is.** A single place that answers *"which plan moves next, and what must ship before
what?"* when several plans are in flight at once. It is a **map + a gate-list**, deliberately thin:
pointers, not copies. Each plan below remains the **canonical** owner of its own steps, commits and
remaining work; do not restate that here (anti-context-rot). Open a plan to work it; open this file
to know the **order**.

> Sibling conventions: `maintainers/CONVENTIONS.md` (checkboxes on every step; one canonical plan =
> the repo's; plan-done = archived). Memory pointer: `fleet-upgrade-sequencing`.

---

## The invariant (the one order not to re-invert)

Decided with Thomas 2026-07-18. When juggling plans, keep this sequence:

1. 🟢 **Green** — legacy-**safe** fresh-install layering of the constitution (new engine-owned
   `CLAUDE.engine.md` in the `replace` regime; `CLAUDE.md` **stays** in `SACRED_FILES`, so deployed
   monolithic brains are never clobbered). **Must ship BEFORE the migration's *generate* step**, so
   the regenerated personal brain is born two-layer.
2. 🧠 **Migration generate** — Track D of the migration plan (generate → import 405 notes → layer the
   private capabilities). Depends on green.
3. 🔴 **Fleet re-layering + big-jump upgrade experience** — retro-fit already-deployed monolithic
   brains (~v3.2.x) and build the broader upgrade UX: **(A)** completeness across a big jump,
   **(B)** "what you gained" notes (reuse the *The One With…* codenames), **(C)** pre-flight reindex
   preview said *before* upgrading. Heavy QA on fixtures reproduced from the release tag(s).
   **Deferred to AFTER the migration.**

**Why deferring 🔴 is safe:** the constitution is `sacred`, `constitutionTemplate` is frozen at
`1.0.0`, and `indexSchemaVersion` has been `1` continuously since before v3.2.1 → a **v3.2.x →
current jump triggers NO reindex**, and `update-engine` is state-convergent (one jump converges).
Nothing forces the fleet's upgrade in the interim.

---

## Tracking (the gates, in order)

- [ ] **Gate 1 — 🟢 Green: legacy-safe fresh-install layering.**
  - [ ] Add engine-owned `CLAUDE.engine.md` (`replace`), keep `CLAUDE.md` in `SACRED_FILES`
        (`scripts/lib/engine-apply-plan.mjs`); thin sacred `CLAUDE.md` `@import`s it.
  - [ ] Do-no-harm QA: a reproduced legacy brain updating past green is untouched (no `CLAUDE.md`
        clobber, no reindex, no behaviour change).
  - [ ] **Canonical plan:** `prospective/engine-managed-file-merge-strategy.md` → §"Sequencing decision".
- [ ] **Gate 2 — 🧠 Migration generate (depends on Gate 1).**
  - [ ] Track D: generate brain → `/import` ~405 notes → layer private capabilities.
  - [ ] **Canonical plan:** `prospective/second-brain-migration-and-engine-upstream-action.md` → Track D.
- [ ] **Gate 3 — 🔴 Fleet re-layering + big-jump upgrade experience (deferred until after Gate 2).**
  - [ ] (A) Completeness across a big jump (frozen files: constitution + shipped user-skills).
  - [ ] (B) Benefit-framed changelog spanning the jump (*The One With…* substrate).
  - [ ] (C) Pre-flight preview: apply plan **and** reindex decision, shown before applying.
  - [ ] QA fixtures reproduced from the release **tag(s)** + synthetic personal edits; first enumerate
        the versions actually deployed.
  - [ ] Likely graduates to its own plan ("engine upgrade experience for the deployed fleet");
        F-B7e (constitution re-layering) becomes one component of it.
  - [ ] **Canonical plan:** `prospective/engine-managed-file-merge-strategy.md` → §"Sequencing decision" (deferred half).

> Determinism note (once green exists): consider a lightweight guard that fails loud if a release
> bumps `constitutionTemplate` before green has shipped — turning this ordering invariant into an
> enforced gate rather than a written one (ADR 0009 spirit).

---

## The map — active plans

| Plan (canonical) | What it delivers | Gate | Status |
| --- | --- | --- | --- |
| `prospective/engine-managed-file-merge-strategy.md` | Propagate engine improvements into user-editable provided files (constitution + shipped skills) without clobbering edits. | 1 & 3 | 🔭 Prospective / analysis; sequencing decided. |
| `prospective/second-brain-migration-and-engine-upstream-action.md` | Migrate the pre-existing personal brain (~405 notes) + upstream the generic delta. | 2 | In progress: Tracks A/B/C DONE (PR #29/#30/#32); **Track D next**; F post-migration. |

> Other in-flight plans on their own branches (e.g. wiki-health axis 1, marketing page) are **not
> part of this fleet-upgrade ordering** and are tracked by their own plans + memory pointers; they
> are listed here only if/when they gain a cross-plan dependency.

---

## How to use this file

- **Picking up work after a `/clear`:** read the invariant, find the **first unchecked gate**, open
  its canonical plan, and resume at that plan's first `- [ ]`.
- **Finishing a gate:** check it here **and** in its canonical plan, with _(date · commit)_. Keep the
  two in sync; if they ever disagree, the **canonical plan wins** (this file is only the order).
- **Adding a plan to the fleet order:** add one row to the map + one gate, both as pointers. Never
  paste the plan's internal steps here.
