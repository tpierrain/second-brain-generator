# ADR 0013 — Resume multi-session work via the maintainer's single open PR

- **STATUS:** ACCEPTED (2026-06-14).
- **Scope:** **Generator development (maintainer workflow)** — neither the installer nor the brain
  runtime, but *how Thomas drives long, multi-session plans on this repo*. (First ADR carrying this
  third scope value; see the README note that process/workflow decisions are recorded here too.)
- **Related:** [`DEVELOPING.md` "Dev rules" §7](../../DEVELOPING.md) (the **operative** rule — *what to
  do*; this ADR is the *why*), the per-plan **Session protocol** section (e.g.
  [`../plans/engine-packaging-phase0-action.md`](../plans/engine-packaging-phase0-action.md)),
  [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md) (same posture: a
  **discoverable, deterministic anchor** beats recall and guessing).

## Context

Long plans run across **many fresh sessions** — one big step per window, to dodge context rot (Claude
Code on the web/tablet; ephemeral containers; the committed docs are the external memory). Two recurring
frictions appeared while running the engine-packaging Phase 0 plan:

- The maintainer should **not have to remember or restate** the work branch, nor "where we are", at the
  start of each new session.
- A naive *"resume the in-progress plan"* hits an **egg-and-chicken**: the plan — which holds the branch
  name **and** the progress checklist — lives **on the work branch**. A session that starts from `main`
  cannot learn the branch from the plan, because it can't read the plan until it's on the branch.

We also want **zero ambiguity** about which line of work is "in flight", and **no merge-conflict risk**
from several parallel branches/PRs.

## Decision

Anchor resumption on **the maintainer's single open PR**.

- **Invariant — at most ONE open PR authored by `tpierrain` at a time.** The agent **never opens a
  second** while one of his is open, and **never merges/closes** it on its own. Other people's / bots'
  open PRs **don't count** (scope strictly to `author:tpierrain`). This removes the ambiguity and the
  conflict risk.
- **Trigger — "reprends le plan où on en était sur la PR ouverte."** The agent then: lists the **open
  PRs authored by `tpierrain`** → expects **exactly one** → **checks out its head branch** → reads that
  branch's plan **Progress checklist** → does **the first unchecked `- [ ]` big step**.
- **Discoverable from anywhere.** The open PR is queryable from **any** starting branch (even `main`),
  which **closes the egg-and-chicken gap** — the branch name no longer needs to be known up front.
- **Ambiguity → a menu, never a guess.** If several of his PRs are open, the agent **lists them**
  (number, title, head branch, last-updated) and asks him to **pick** — he selects from a menu, with no
  need to recall any name. If **zero**, it asks whether to start one. It **never** picks on its own.
- **Source of truth = the plan's checklist** on the PR branch, ticked in the **same commit** that
  finishes a big step (so the last pushed commit always reflects the true state); the **PR body mirrors
  it** for at-a-glance tracking.
- **One big step per fresh window; stop and ask before the next** (the per-plan Session protocol).

## Consequences

- The everyday resume command is **one self-describing sentence**; the maintainer never recalls a
  branch or PR name, and a fresh window self-locates.
- **Clear division of record, no drift:** the *operative* rule lives in `DEVELOPING.md` §7 (terse,
  "what"); this ADR holds the *why + alternatives + consequences*. The rule links here; each fact has a
  single home.
- **Honest boundary:** a local hook cannot stop a human from clicking "New PR" on GitHub. The invariant
  binds **the agent's** behaviour (won't open a 2nd, flags any extra it sees), which covers the practical
  risk. A *hard* guarantee would need GitHub branch-protection / an Action — **deferred** (unproven
  need, and it fights the no-over-engineering rule).
- **Establishes a habit:** structural **process / maintainer-workflow** decisions are recorded as ADRs
  too (precedent: 0009–0011 for engineering discipline; this one for the dev workflow).

## Rejected alternatives

- **Branch name written in the plan only** — the egg-and-chicken above: unreadable from `main`. (The very
  friction that prompted this ADR.)
- **A pointer file on `main`** naming the active branch — an extra moving part to keep in sync; the open
  PR **already is** that pointer, natively and without maintenance.
- **Scan `plans/` for `STATUS: 🚧 IN PROGRESS`** — works only once already on the branch; doesn't solve
  discovery from `main`, and is ambiguous if two plans are mid-flight.
- **Mention the branch every session** — exactly the recall burden we set out to remove.
- **Auto-pick when several PRs are open** — risks resuming the wrong line of work; a menu is cheap and
  safe.

This matches the project's determinism posture (ADR 0009): a **discoverable, deterministic anchor** over
recall and probabilistic guessing.
