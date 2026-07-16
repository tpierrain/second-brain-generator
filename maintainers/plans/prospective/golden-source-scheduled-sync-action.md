# Golden-source scheduled sync — action plan (fast-follow after the QA ship)

> **Goal.** Make a golden source refresh **regularly on its own**, driven **from the MCP code** — not
> only lazily at question-time. A timer inside the `golden-source-sync` server ticks every N seconds
> (**default 300 s = 5 min, configurable**); each tick runs a **cheap `check_freshness`** and triggers a
> `sync` **only** for sources reported `behind`. Non-blocking by construction (it's the server's own
> event loop, independent of Claude's turns).
>
> **Decided with Thomas (2026-06-18):**
> - **Scope = "while the brain is open"** — the MCP is a per-session stdio process; the timer ticks only
>   while a brain window/conversation is open. True 24/7 (brain closed) would need an OS daemon
>   (launchd/cron) **on top** — explicitly **out of scope** here (PRD §19 territory).
> - **Per tick = `check_freshness` → `sync` if `behind`** (not a blind `sync(all)`): saves the Notion API
>   and avoids needless indexing toasts.
> - **Timing = fast-follow**: ship the QA round first (`golden-source-qa-postfixes-action.md`), then this.
>
> **Branch:** continue on `golden-source-sync` (or a fresh branch off it post-merge — decide at Step 0).
> No CI → suites run locally. Push/merge/tag **only on Thomas's explicit green light**.
>
> **Confidential:** same QA rules — throwaway brains hold ex-employer Notion data; never copy real
> names/content; purge throwaway brains at the end.
>
> **▶️ Resume contract (survives `/clear`).** This file is the single source of truth for progress. To
> resume: open it, find the **first unchecked box**, continue from there. Tick `- [x]` **only after** the
> matching suite is green / change is committed, and append _(date · commit)_. The memory
> `golden-source-sync-progress` points here.

## Tracking

- [x] **Step 0 — Pre-flight & branching** _(2026-07-16)_
  - [x] 0a — Branch `feat/local-mirror-auto-refresh` created off `main` _(2026-07-16)_
  - [x] 0b — Baseline green: **170 tests pass, `tsc --noEmit` exit 0** in `local-mirror/` _(2026-07-16)_
  - [ ] 0c — Re-read PRD §8 (freshness/routing) — this feature **adds** a scheduled path alongside the
        question-time path; note the doc deltas to do at Step 5
- [x] **Step 1 — Concurrency lock (PREREQUISITE — subsumes a deferred `/code-review` finding)** _(2026-07-16)_
  - [x] 1a — RED: acceptance at the API port — a source already synced by another window must not
        race on `state.json`. `src/test/sync-single-flight.test.ts` _(2026-07-16)_
  - [x] 1b — GREEN: per-source **single-flight lock** `ISyncLock` (port) + `FsSyncLock` adapter
        (lockfile `.local-mirror/<name>.sync.lock`, dead-holder & stale-lock reclaim, 10-min timeout).
        `sync()` acquires → skips (`status: 'skipped'`) if held by another live process; releases in
        `finally`. 6 unit tests (`fs-sync-lock.test.ts`) + 1 acceptance. Lockfiles gitignored. _(2026-07-16)_
  - [x] 1c — Suite green (**177 pass**) + `tsc` clean. _(2026-07-16)_
- [x] **Step 2 — Scheduler (Outside-in TDD, injectable clock)** _(2026-07-16)_
  - [x] 2a — Injectable `setTimer`/`clearTimer` seam on `AutoSyncScheduler` → ticks fire synchronously
        in tests via a `fakeTimer()` (no real 5-min waits), deterministic (ADR 0009). _(2026-07-16)_
  - [x] 2b — RED→GREEN acceptance (Builder → domain, recording proxy): a tick calls `checkFreshness`
        for every source and `sync` **only** for the `behind` one. _(2026-07-16)_
  - [x] 2c — GREEN: `src/auto-sync-scheduler.ts` orchestrates the existing `checkFreshness` + `sync`,
        no new Notion logic. _(2026-07-16)_
  - [x] 2d — Behind-only assertion: an up-to-date source is checked but **not** synced (no write). _(2026-07-16)_
  - [x] 2e — Fail-soft: a source that throws (and even a `listSources` failure) is logged to stderr and
        skipped; the scheduler **keeps ticking** (re-arm in `finally`). _(2026-07-16)_
  - [x] 2f — Suite green (**181 pass**) + `tsc` clean. _(2026-07-16)_
- [x] **Step 3 — Config & lifecycle (wire into the server)** _(2026-07-16)_
  - [x] 3a — Config: **`LOCAL_MIRROR_SYNC_INTERVAL`** (renamed per S6 delta; seconds, **default 300**,
        `0` = disabled). Pure `resolveSyncIntervalSeconds()` (`src/lib/sync-interval.ts`): non-negative
        integer, malformed/negative/fractional → safe default. 4 TDD tests. _(2026-07-16)_
  - [x] 3b — Lifecycle: `startAutoSync()` (`src/auto-sync-boot.ts`) starts the scheduler on boot only
        when interval > 0 **and** ≥1 mirror declared; fail-soft on a config read error. `bootReal()`
        shares ONE api instance between the tools and the scheduler; `installShutdown()` stops it on
        SIGINT/SIGTERM/stdin end+close (no orphan timer). 4 TDD tests. _(2026-07-16)_
  - [x] 3c — Startup log (stderr): `auto-sync every <N>s (sources: …)`, or `auto-sync disabled`, or
        `auto-sync idle: no mirror declared yet`. _(2026-07-16)_
  - [x] 3d — Suite green (**189 pass**) + `tsc` clean; committed. _(2026-07-16)_
- [ ] **Step 4 — Fresh end-to-end validation** (throwaway brain from the branch)
  - [ ] 4a — Install a fresh throwaway brain; declare a source; leave the window open
  - [ ] 4b — Observe an autonomous refresh on a Notion edit **without asking a question** (truthful toast,
        `www.notion.so` citations, no « source d'or »); confirm it does **not** block typing/answers
  - [ ] 4c — Confirm two open windows don't corrupt state (lock holds); `interval=0` disables cleanly
- [ ] **Step 5 — Docs**
  - [ ] 5a — SKILL.md: state that freshness is **also** kept by a background scheduler (default 5 min,
        configurable), while the local-first question-time path stays the immediate one
  - [ ] 5b — PRD §8/§19: record the scheduled path (MVP gains a session-scoped timer; 24/7 daemon still
        the target) — keep CONNECTORS "why/when" in sync
  - [ ] 5c — SETUP/CONNECTORS: document `GOLDEN_SOURCE_SYNC_INTERVAL`
  - [ ] 5d — ADR: timer-in-MCP vs OS daemon, and the single-flight lock (revisits ADR 0009 "prefer
        deterministic" — bounded exception: a configurable timer, with a deterministic test clock)
  - [ ] 5e — Commit (docs)
- [ ] **Step 6 — Ship** (on Thomas's green light): push → PR (codename « The One With… ») →
      `/code-review` → fix accepted findings (TDD) → final QA → merge + tag → archive this plan →
      purge throwaway brains

---

## Design notes (for the implementer)

- **Why a timer is acceptable here despite ADR 0009.** The ADR prefers deterministic event/condition
  over timers, but states the preference is **bounded, not dogma**. Notion has **no push/webhook in this
  MVP**, so polling is the only available signal; we keep it deterministic *in test* via an injectable
  clock, and cheap *in prod* via watermark-only `check_freshness` (content pulled only when behind).
- **Lifetime is honest, not a bug.** "Ticks only while a window is open" is the chosen scope. Document it
  so nobody expects 24/7 freshness from the MCP alone.
- **Multi-window race is real and must be fixed first** (Step 1) — two stdio processes, two schedulers,
  one `state.json`. Single-flight lock, skip-if-locked per tick.
- **Toast truthfulness already shipped** (QA Step 2 / F5): a behind-only tick that writes real new
  content will fire a correct, settled toast — desired. A no-change tick writes nothing → no toast.
- **No new Notion logic.** The scheduler only **orchestrates** the existing `checkFreshness` + `sync`
  engine; all robustness (partial on enumeration failure, watermark freeze, deletion guardrail) is reused.
