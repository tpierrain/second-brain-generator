# ADR 0032 — Refresh a local mirror on a session-scoped timer, serialized by a single-flight lock

- **STATUS:** ACCEPTED (2026-07-16).
- **Scope:** Second brain (runtime) — the `local-mirror` MCP server. No installer surface; ships to the
  existing fleet via `update-engine`'s `replace` bucket like the rest of the engine code.
- **Related:** [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md) — this
  is **rung 4 of that ladder** ("when time genuinely matters, a bounded scheduler with an injected clock +
  a lock — not a sprinkled `setTimeout`") applied to local-mirror, the exact twin of the `ReindexScheduler`
  + `reindex-lock` pair it already cites.
  [`../../rag/docs/adr/0003-no-daemon-session-trigger.md`](../../rag/docs/adr/0003-no-daemon-session-trigger.md)
  — the RAG's "no daemon, the session is the trigger" stance; this ADR stays **inside** that boundary (the
  timer lives and dies with the session, it is not an OS daemon).
  Plan: [`../plans/prospective/golden-source-scheduled-sync-action.md`](../plans/prospective/golden-source-scheduled-sync-action.md).

## Crux

Notion exposes **no push/webhook** in this MVP, so the only signal that a mirrored zone changed is to
**poll** it. We keep a mirror fresh **without a question** by running a bounded scheduler **inside the MCP
server** (injected clock; cadence `LOCAL_MIRROR_SYNC_INTERVAL`, default 300 s, `0` disables): each tick does
a cheap watermark-only `check_freshness` and a `sync` **only** for sources reported `behind`. Because a
mirror can be open in **two windows** (two stdio processes, one `state.json`), every `sync` takes a
**per-source single-flight lock** (advisory lockfile) and skips if another live process holds it. The timer
is **session-scoped by design** — honest, not a bug: true 24/7 freshness (brain closed) would need an OS
daemon on top, deliberately out of scope.

## Context

A local mirror (ADR-adjacent to the connectors story, PRD §8) is a one-way local copy of a Notion zone,
indexed and cited by the RAG. Its freshness first rode **only** the question-time path: on an in-perimeter
question the harness fires `check_freshness` and, if behind, `sync` (PRD §8, Phase 2). That leaves a real
gap — a mirror the user isn't currently asking about drifts silently until the next relevant question. We
want it to **catch up on its own** while the brain is open, without reintroducing the latency the local-first
doctrine avoids and without a hidden moving part that "spoils" (the ADR 0003 fear).

Three constraints shape the answer:

- **No webhook** → polling is the only available mechanism. Polling is the industry-standard fallback when a
  source has no push channel; we make it cheap (watermark-only check, content pulled only when behind) and
  deterministic in test (injected clock).
- **Concurrency is real** → the MCP is a per-session stdio process, so two windows = two schedulers writing
  one `state.json`. Unserialized, two ticks can race a source's sidecar/vault. This is the classic
  **single-flight** problem (a.k.a. request coalescing / mutual exclusion).
- **Lifetime must stay honest** → ADR 0003 forbids an indexing daemon; we respect its spirit by keeping the
  timer **in the server's own event loop**, so it exists exactly while a window is open and needs no
  supervision, no launchd/cron, no off-session failure mode.

## Decision

**A bounded, session-scoped scheduler in the MCP server, serialized by a per-source single-flight lock.**

1. **`AutoSyncScheduler`** (`src/auto-sync-scheduler.ts`) arms one tick, and each tick re-arms the next in a
   `finally` (a single bad tick can never break the loop). `setTimer`/`clearTimer` are **injected** so tests
   fire ticks synchronously via a fake clock (rung 4 of ADR 0009), never a real 5-minute wait. Per tick:
   `listSources` → for each, `check_freshness`; `sync` **only** if `behind`. Fully **fail-soft**: a source
   that throws (401/429/network), and even a `listSources` failure, is logged to stderr and skipped.
2. **Config at the boundary** — `resolveSyncIntervalSeconds(LOCAL_MIRROR_SYNC_INTERVAL)`: a non-negative
   integer in seconds, **default 300**, `0` = disabled; malformed/negative/fractional falls back to the
   default (never crashes boot).
3. **Single-flight lock** (`ISyncLock` port / `FsSyncLock` adapter, ADR 0009 twin of `reindex-lock`): `sync`
   acquires a per-source advisory lockfile, **skips** (`status: 'skipped'`) if another live process holds it,
   releases in `finally`; dead-holder and stale-lock (10-min) reclaim. This is what makes two open windows
   safe on one `state.json`.
4. **Re-triggerable arming** (`AutoSyncSupervisor`) — the boot decision (arm only when a mirror is already
   declared) is made **idempotent and re-attemptable**, and a `setup_source` → `onSourceDeclared` hook calls
   it, so declaring the **first** mirror mid-session arms the scheduler **without a restart**. (Without this,
   the session that declares the first mirror would be the one session where the feature silently does
   nothing — the trap noted in the plan's Step 4 finding #1.)

The scheduler adds **no Notion logic**: it only orchestrates the existing `checkFreshness` + `sync` engine,
reusing every robustness guarantee (partial-on-enumeration-failure, watermark freeze, deletion guardrail,
and the provisional-watermark fix for same-minute edits).

## Consequences

- **Determinism = testability, again.** The injected clock and injected lock storage are exactly the seams
  the unit suite drives — the scheduler, the supervisor, the interval parser and the lock are each covered
  without real timers or real files racing. "Bounded scheduler + injected clock + lock" is the ADR 0009
  shape, not a fresh invention.
- **Cheap in production.** A tick that finds nothing behind pulls no content and writes nothing (no toast); a
  behind tick writes real new content and fires one correct, settled toast.
- **Honest, documented lifetime.** "Ticks only while a window is open" is stated in SKILL.md, SETUP.md,
  CONNECTORS.md and PRD §8/§19. Nobody should expect 24/7 freshness from the MCP alone.
- **Escape hatch.** `LOCAL_MIRROR_SYNC_INTERVAL=0` disables the timer cleanly and falls back to the
  question-time path — proven live.
- **Invariant not to violate (inherits ADR 0003):** do not promote this into an OS daemon "to do it
  properly". If off-session freshness becomes a real need, it justifies a **new ADR** that supersedes this
  boundary — not a quiet addition.

## Rejected alternatives

- **Question-time refresh only (status quo before this).** Simplest, but a mirror the user isn't currently
  asking about drifts silently. The whole point of a mirror is to be *already* fresh when the question comes.
- **An OS daemon (launchd/cron) for true 24/7.** Solves off-session freshness but reintroduces exactly the
  silent failure mode and operational weight ADR 0003 rejects for indexing. Kept as the *central target*
  (PRD §19), not this MVP.
- **A sprinkled `setTimeout` with no lock.** Would tick, but two windows would race `state.json` and tests
  would depend on wall-clock. Rung 4 of ADR 0009 exists precisely to forbid this shape.
- **A read-through / on-search sync.** Rejected in PRD §8 (`local-mirror` exposes no `search`): it would
  reintroduce network latency into the local-first answer and trap routing logic inside the MCP.
