# ADR 0009 — Prefer deterministic mechanisms (reliability principle)

- **STATUS:** ACCEPTED (2026-06-13).
- **Related:** [`0002-in-house-installer-vs-plugin.md`](0002-in-house-installer-vs-plugin.md)
  (the install is **one deterministic script**), [`0005-support-desktop-code-tab.md`](0005-support-desktop-code-tab.md)
  (trust + **fail-loud**, deterministic pre-flight, visible startup status),
  [`0006-rag-mcp-is-stable-contract.md`](0006-rag-mcp-is-stable-contract.md)
  (embedder swap = **confirm-gate, never a silent reindex**).
- **Reference instance:** [`../plans/archived/debounce-auto-push.md`](../plans/archived/debounce-auto-push.md)
  (the `Stop` event **is** the debounce — no timer, no state file).

## Context

A second brain is a **trust artifact**: it holds the user's own thinking, and day after day they
**offload** to it — they stop re-checking whether a note was saved, whether an answer really came
from *their* vault, whether today's edits were backed up. That offloading **is** the value; it is
also the exposure. The failures that break a second brain are the **silent** ones — a note not
persisted, a search that answers from *outside* the vault, a push that quietly never happened —
precisely because, by design, the user is no longer watching. A **deterministic, observable**
mechanism is how the brain earns the right to be trusted **unwatched**.

Two facts sharpen this. The brain runs **unattended on the user's machine** — hooks fire on every
edit, the RAG answers in the background — so a flaky step has no human in the loop to catch it. And
it ships to **non-developers on bare machines** (minimal PATH, frozen working directory, often the
desktop app) who **cannot diagnose** a probabilistic glitch when one slips through. So anything that
rests on a guessed timer, an in-memory state that can drift, or "the LLM will remember to do it" is a
**latent, undiagnosable failure** — exactly where a second brain loses trust and never gets it back.

Several earlier ADRs each reached, independently, for the **same answer**: lean on something
**deterministic** and **observable** rather than clever-but-fragile. That reasoning was never written
down as a principle — only as the local conclusion of 0002, 0005, 0006. This ADR **names it**, so
future decisions can cite it instead of re-deriving it.

## Decision

**At equal (or better) reliability, prefer a DETERMINISTIC mechanism over a probabilistic,
LLM-driven, or hidden-state one.** Concretely, in order of preference:

1. **An event or a verifiable condition** over a timer or a guess. The mechanism should be triggered
   by something that *provably* happens (a hook event, a git state queried at the moment, a file that
   exists) rather than by elapsed time or an estimate.
2. **No hidden, driftable state.** A short-lived process that re-derives what it needs each run
   (re-resolve the node path, re-query `git remote`/`@{u}..HEAD`) beats a long-lived cache or a
   state file that can desync. The mechanism should be **stateless** wherever feasible.
3. **Fail loud, never silently wrong.** When the deterministic check can't be satisfied, surface an
   explicit, actionable signal (the constitution's fail-loud posture, the embedder confirm-gate) —
   never a result that quietly lies.
4. **Best-effort and non-blocking where the action is not load-bearing.** A side-effect that may fail
   (a push) exits 0 with a warning and **self-recovers on the next deterministic trigger**, rather
   than blocking or retrying forever. The durable state (local commits) is the safety net.

The LLM (Claude) is **trusted to drive**, but the **reliability** of a step should not *rest* on the
LLM remembering or on timing luck when a deterministic seam is available for roughly the same cost.

## Instances (this principle, already applied)

**In the brain's daily use (the heart of it):**

- **Your notes are persisted on an event, not on a memory** — auto-commit fires on **every**
  `Write|Edit` (PostToolUse hook): a note is committed locally the instant it changes, no batching,
  no "save later". The brain's most basic promise — *your writing is never lost* — rests on the edit
  event itself, not on anyone (human or LLM) remembering to save.
- **debounce-auto-push (2026-06-13)** — the **`Stop` hook event IS the debounce**: N edits in a turn
  → N local commits + **exactly 1 push**, with **no in-memory timer and no state file**. A 60 s
  throttle was explicitly rejected as probabilistic over-engineering. Push is **best-effort, exit 0**;
  a failure self-recovers at the next `Stop`. Changes *when* the brain backs up without ever risking
  the durable copy.
- **The RAG answers FROM the vault, or says so out loud** — the install's **sourced canary** (proves
  the answer came from the vault, not the open web) and the embedder **confirm-gate** keyed on a
  deterministic index identity (provider/model/dimension, ADR 0006): a search **never silently**
  returns from outside the vault or off an incompatible index — it surfaces an explicit signal.
  Trust in the brain's *answers* rests on a checkable identity, not on hope.

**In the installer / onboarding (the aggravating circumstance — non-dev, bare machine):**

- **0002** — the whole install is **one deterministic script** (`installer.mjs --non-interactive`),
  not a chat sequence the model might fumble.
- **0005** — install gate reversed to **trust + fail-loud**: deterministic pre-flight, GUI-visible
  startup status, sourced post-flight canary — catch loudly rather than prevent probabilistically.

**Spanning both (the brain runs on the same bare machine it was installed on):**

- **run-node self-heal** — the hooks **re-resolve** node's location on **every** run (enriched PATH),
  rather than baking a path that can rot when the machine changes — so auto-commit/push and the RAG
  keep working at runtime, not just at install time.

## Consequences

- **A shared vocabulary for design reviews.** "Is there a deterministic seam here?" becomes a
  first-class question, and "we'll just trust the timing / the model to remember" becomes something
  to justify against this ADR.
- **Testability comes for free.** Deterministic, stateless seams are exactly the ones we can unit-test
  with an injected runner (cf. `shouldPush` / `attemptPush({git, sleep})`), which is why this posture
  and the project's TDD discipline reinforce each other.
- **Bounded scope — not dogma.** This is a *preference at equal reliability*, **not** a ban on timers,
  caches, or LLM judgment. Where a deterministic mechanism would be disproportionately complex (cf.
  Thomas's "no over-engineering against an unproven risk"), the probabilistic path is fine — the ADR
  asks that the trade-off be **conscious**, not that determinism win unconditionally.

## Rejected alternatives

- **Leaving the principle implicit** (status quo) — it kept getting re-derived per ADR; naming it once
  is cheaper and makes future decisions citable. That is the whole point of this ADR.
- **A hard rule "deterministic always wins"** — would mandate gold-plating (e.g. a state machine where
  a best-effort exit 0 suffices) and contradict the no-over-engineering rule. Refused in favor of a
  *preference at equal reliability*.
