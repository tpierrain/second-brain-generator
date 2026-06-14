# ADR 0014 — Ship `update-engine` proactively, before mass deployment (not on stale-feedback)

- **STATUS:** ACCEPTED (2026-06-14).
- **Scope:** Second brain (runtime) + Installer — the update capability is part of what the installer
  bakes into every brain, and runs brain-side.
- **Related:** [`0012`](0012-engine-packaging-four-part-model.md) (the four-part model + phasing this
  ADR re-times — Phase 1 = Track A), [`0003`](0003-no-brain-capability-upgrade.md) (the sovereignty
  invariant kept: opt-in, non-destructive), [`0001`](0001-launcher-vs-brain.md) (the launcher↔brain
  link severed by construction — the coupling this re-introduces, explicitly and pinned),
  [`engine-packaging-study.md` §6](../plans/engine-packaging-study.md) (the phasing this corrects), the
  Phase 0 deliverable [`engine-manifest.json`](../../engine-manifest.json) (the ownership map an update
  rides on).

## Context

The study (§6) phased the work and gave **Phase 1 (`update-engine`, Track A)** a **reactive** trigger:
*"on first real 'my brain is stale' feedback."* That trigger optimised for not re-paying the
launcher→brain decoupling cost of ADR 0001 before a real need proved it worth it.

New information re-weights the trade-off: the second brain is about to be **deployed to many
non-technical profiles** (a client's staff, and beyond). The maintainer **will** refactor the engine
(RAG + constitution + hooks) — ADR 0012 already records that intent.

The reactive trigger hits an **egg-and-chicken** that ADR 0013 should have made us suspicious of:
`update-engine` is a **brain-side** capability. If brains are deployed **without** it, then the day an
engine improvement ships, those brains have **no mechanism to receive it**. "We'll add the updater
later" presupposes the very updater that isn't there — so the fallback becomes "have each
non-technical user re-run an install-like procedure by hand." That manual migration of already-deployed
brains is **exactly the nightmare** ADR 0003's sovereignty invariant exists to spare non-technical
users. The **first** migration is therefore the hardest, and it lands on the least-equipped people.

## Decision

**Build and ship `update-engine` *now*, before the mass deployment — not on later feedback.** The
update capability must be **present in every brain at install time**, so that future engine
improvements flow in through a mechanism that was always there.

- **Re-time only — no change to the model or the invariant.** ADR 0012's four-part model and ADR 0003's
  sovereignty invariant stand unchanged: the update is **opt-in**, **non-destructive** of Content and
  Personal Extensions, **manifest-driven** (only the Engine bucket of `engine-manifest.json` is
  touched), reindex-if-the-schema-moved. We move *when* Phase 1 happens (now), not *what* it is.
- **The coupling ADR 0001 severed is re-introduced deliberately** — explicit, **pinned**, and
  **user-triggered**, never a standing remote or a silent auto-update. The offline/"forever as
  generated" guarantee is preserved by pinning the source (and, where applicable, a vendored fallback).
- **Bootstrap rule:** a capability that must one day reach already-deployed non-technical brains has to
  be **in the brain before deployment**. Adding it retroactively has no carrier and falls back to manual
  migration — the outcome the product exists to avoid.

## Consequences

- **Phase 1 is the active next step**, not a deferred option. The study §6 trigger is corrected
  accordingly (proactive, pre-deployment).
- **No stranded early adopters:** every brain deployed at the client carries the updater from day one;
  the first real engine refactor flows in opt-in, content untouched.
- **We pay the ADR 0001 coupling cost now.** Accepted: the cost of an explicit, pinned, opt-in re-pull
  is far below the cost of hand-migrating a fleet of non-technical users' brains. The invariant keeps the
  coupling from becoming sovereignty loss.
- **Demo safety (this week):** the work proceeds **on the PR branch only**; **no merge to `main` before
  the Mon/Tue client demos**, and only after the maintainer has tested the whole restructuring locally
  (ADR 0012 / draft-PR rule).

## Rejected alternatives

- **Keep the reactive trigger ("wait for stale feedback").** Egg-and-chicken: the feedback arrives on
  brains that have no updater to act on it; the first migration is then manual for non-technical users.
- **Add `update-engine` to deployed brains later, ad hoc.** No carrier exists once they're deployed →
  collapses to "re-run install by hand," the exact friction we reject.
- **Jump straight to a registry/npm package (Track B) to distribute the engine.** Premature (study §6,
  ADR 0001): re-pays the offline/self-sufficiency cost before the user base justifies it. Track A
  (pinned re-pull) delivers the capability now while staying self-hosted.
