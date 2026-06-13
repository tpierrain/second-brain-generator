# ADR 0010 — Debounce auto-push to the `Stop` hook (push once per turn, not per edit)

- **STATUS:** ACCEPTED (2026-06-13).
- **Scope:** Second brain (runtime) — the brain's git backup behavior on the user's machine.
- **Related:** [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md)
  (this decision is its **reference instance** — the event *is* the debounce).
- **Implementation plan:** [`../plans/archived/debounce-auto-push.md`](../plans/archived/debounce-auto-push.md)
  (✅ SHIPPED — step-by-step detail, full corner-case list, 6 commits, empirical proof).

## Context

The brain persists notes with a `PostToolUse Write|Edit → auto-commit.mjs` hook: a local commit on
**every** edit. That part is wanted and kept. The problem was that the **same** hook also **pushed**:
once `git config secondbrain.autopush true` is set, every edit fired a **network `git push`** — plus
a blocking `sleepSync(3000)` retry on failure. On a normal turn (dozens of edits) that meant **dozens
of pushes**, which Thomas felt directly on his own brain (Inqom Rain) as "wasted time" and which
risks **rate-limiting** on GitHub/GitLab. Only the *push* cadence is the issue — the per-edit local
commits are fine.

## Decision

**Split the hook. Keep the commit per edit; move the push to a once-per-turn `Stop` hook.**

```
PostToolUse "Write|Edit"  →  auto-commit.mjs   (git add + commit, PER EDIT)        ← now commit-only
Stop                       →  auto-push.mjs     (git push pending commits, 1×/TURN) ← new
```

Visually, over a single exchange — many edits, many local commits, **one** push at the end:

```
┌─────────────────────────  ONE TURN (one exchange)  ─────────────────────────┐
│                                                                             │
│   edit      edit      edit      edit      edit       ···  (any number)      │
│    │         │         │         │         │                                │
│    ▼         ▼         ▼         ▼         ▼                                 │
│  commit    commit    commit    commit    commit     ← auto-commit.mjs       │
│  (local · instant · one per edit · NO network)                              │
│                                                                             │
└──────────────────────────────────────────────────────────  Stop  ──────────┘
                                                                │
                                                                ▼
                                          1 × git push     ← auto-push.mjs
                                          pushes ALL pending commits (@{u}..HEAD)
                                          best-effort: exit 0, retry next Stop
```

- **Why the `Stop` event.** It fires **once per main-agent turn**, whatever the number of edits, so
  **the event itself is the debounce** — no in-memory timer (the hook is an ephemeral process), no
  state file to drift. 30 edits → 30 local commits + **1 push**.
- **Auto-catch-up.** The push sends **all** pending commits (`@{u}..HEAD`), not "the last commit". A
  failed turn's commits are simply pushed at the next `Stop`.
- **Best-effort, never blocking.** `auto-push.mjs` **always `exit 0`** (a `Stop` hook returning 0
  doesn't block the turn). One retry after a short pause; still KO → a non-blocking `⚠️ PUSH FAILED`
  and the commits stay local. The **durable local commits are the safety net.**
- **Opt-in preserved.** Still gated on `secondbrain.autopush=true` **and** a real remote — an
  inherited launcher remote never receives the private notes (the guarantee of ADR 0002 / the install
  flow is unchanged, just relocated to the push hook).

## Alternatives rejected

- **Keep the per-edit push** (status quo) — the very problem (micro-pushes + blocking retry).
- **A 60 s throttle / time window** — probabilistic, needs in-memory or on-disk state, and adds
  complexity against an **unproven** need. The `Stop` event gives exact once-per-turn behavior for
  free; a throttle stays a trivial future add **if** a real case ever demands it.
- **A state-file debounce** ("mark dirty, flush later") — introduces exactly the **driftable hidden
  state** ADR 0009 warns against; the event removes the need for any state.
- **`git pull --rebase` before pushing** (handle multi-machine races here) — that is the **`/sync`
  skill's** job. `auto-push` stays a **one-way, best-effort** push; the loser of a race retries at the
  next `Stop`. Keeping sync out of the hook keeps the hook deterministic and fast.

## Consequences & corner cases

- **No upstream** → skip cleanly (no automatic `-u`; that stays wired at install time).
- **Turns with no edit** → `@{u}..HEAD` empty → **no network call**.
- **Multi-window / multi-machine** → non-fast-forward races are possible; best-effort by design, the
  loser repushes next `Stop`. **Documented limit, not handled here** (use `/sync`).
- **Hook timeout** raised to 30 s (the one retry/pause no longer slows every save).
- **Already-generated brains** (Inqom Rain) have **frozen** settings → **manual backport** (procedure
  in the plan): copy `auto-push.mjs` + `lib/git-push.mjs`, make `auto-commit.mjs` commit-only, add the
  `Stop` block to `<brain>/.claude/settings.json`, reopen a fresh conversation.
- This is the concrete **reference instance of ADR 0009**: a pure tested `shouldPush(...)` (rung 1) +
  an injectable `attemptPush({git, sleep})`, driven by a real **event** (rung 3), best-effort `exit 0`.

## Validation status (honest boundary — we merge with this gap open)

- **Proven.** Logic: 14 unit tests (`shouldPush` matrix 5/5, `attemptPush` 5/5, `auto-commit` never
  pushes 4/4). Empirical (real git + a push-counting shim): N edits in a turn → N commits + **exactly
  1 push**; push KO → `exit 0` + warning + local commits intact; no-remote / `autopush=off` → silent
  skip.
- **Not yet observed in a live Claude Code session:** that the `Stop` hook fires **exactly once per
  turn** and that returning `exit 0` does **not** block the turn — these rest on **documented hook
  semantics**, not an observed run (the simulation invoked `auto-push.mjs` directly). **Accepted at
  merge** because the failure mode is benign: if `Stop` misbehaves, the push simply doesn't happen and
  the **local commits stay safe — nothing is lost**. To be confirmed in real use on Inqom Rain; if it
  ever proves wrong, revisit here.
