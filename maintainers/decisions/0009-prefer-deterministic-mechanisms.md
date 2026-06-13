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

This project ships to **non-developers** who run it on **bare machines** (no dev tooling), often
through the **desktop app** (minimal PATH, frozen working directory). In that setting, anything that
depends on a probabilistic guess, an in-memory timer, an LLM remembering to do the right thing, or a
piece of hidden state that can drift, is a **latent failure** — and a failure a non-dev cannot
diagnose. Several earlier ADRs each reached, independently, for the **same answer**: lean on
something **deterministic** and **observable** rather than something clever-but-fragile.

That recurring reasoning was never written down as a principle — only as the local conclusion of
0002, 0005, 0006. This ADR **names it**, so future decisions can cite it instead of re-deriving it.

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

- **0002** — the whole install is **one deterministic script** (`installer.mjs --non-interactive`),
  not a chat sequence the model might fumble.
- **0005** — install gate reversed to **trust + fail-loud**: deterministic pre-flight, GUI-visible
  startup status, sourced post-flight canary — catch loudly rather than prevent probabilistically.
- **0006 (addendum)** — embedder swap is a **natural-language confirm-gate** keyed on a deterministic
  index identity (provider/model/dimension), **never a silent reindex** that would search wrong.
- **debounce-auto-push (2026-06-13)** — the **`Stop` hook event IS the debounce**: N edits in a turn
  → N local commits + **exactly 1 push**, with **no in-memory timer and no state file**. A 60 s
  throttle was explicitly rejected as probabilistic over-engineering. Push is **best-effort, exit 0**;
  a failure self-recovers at the next `Stop`.
- **run-node self-heal** — the hooks **re-resolve** node's location on **every** run (enriched PATH),
  rather than baking a path that can rot when the machine changes.

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
