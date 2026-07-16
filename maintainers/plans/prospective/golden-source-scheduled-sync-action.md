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
  - [x] 0c — Re-read PRD §8 (freshness/routing) — this feature **adds** a scheduled path alongside the
        question-time path; doc deltas captured for Step 5 _(2026-07-16)_:
        - **§8 ln 264** currently states *"No cron → it only refreshes while a session is open"*; must
          now record the **session-scoped scheduled path** (autonomous refresh, no question needed)
          alongside the question-time Phase 1/2/3 flow → feeds **5b**.
        - **Naming drift**: PRD/plan write `GOLDEN_SOURCE_SYNC_INTERVAL`, but the shipped env var
          (Step 3a, S6 delta) is **`LOCAL_MIRROR_SYNC_INTERVAL`** → fixed in **5c** below.
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
  - [x] 4a — Install a fresh throwaway brain; declare a source; leave the window open _(2026-07-16)_:
        `~/lm-qa-autorefresh` installed from the branch (in-process, post-flight green); mirror
        `personal-home` declared via `setup_source`; window left open.
  - [x] 4b — Autonomous refresh on a Notion edit **without asking a question** — PROVEN _(2026-07-16)_:
        with a standalone rig booted against the brain (`LOCAL_MIRROR_SYNC_INTERVAL=30`, real token in
        `.env`), the boot log armed `auto-sync every 30s (sources: personal-home)`; a Notion edit to
        "Page funky" (`last_edited_time` 16:51:00Z) was picked up by a background tick with **zero
        question and zero explicit `sync` call** → `.md` rewritten, `watermark` advanced to 16:51:00Z,
        `lastSyncStatus: ok`. Citation truthfulness confirmed on the Desktop screenshot:
        « 🧠 copie locale · 🔗 source Notion », **no « source d'or »**. Non-blocking by construction
        (scheduler lives in the server event loop, independent of Claude turns).
  - [ ] 4c — Two open windows don't corrupt state (lock holds) — **NOT integration-tested** (QA ran with
        a single window); the single-flight lock stays covered by Step 1 (6 unit + 1 acceptance). Decide:
        run the 2-window integration test, or accept unit coverage. · `interval=0` disables cleanly —
        **PROVEN** live _(2026-07-16)_: `[local-mirror] auto-sync disabled (LOCAL_MIRROR_SYNC_INTERVAL=0)`.
  - [x] 4d — **Auto-arm on first mirror (fixes finding #1 below, option (a))** _(2026-07-16 · `3024606`)_: a re-triggerable,
        idempotent `AutoSyncSupervisor` (`src/auto-sync-supervisor.ts`) wraps the boot decision so it can be
        (re-)attempted; `createMcpServer` gained an optional `onSourceDeclared` hook fired after every
        `setup_source`; `bootReal` wires the hook to `supervisor.ensureRunning()` (fail-soft) so declaring the
        FIRST mirror mid-session arms the scheduler with **no restart**. TDD: 4 supervisor unit tests
        (idempotent arm · idle-then-arm · stop+re-arm · stop no-op) + 2 acceptance at the tool surface
        (hook fires after `setup_source`, not for other tools). **Suite 198 green, `tsc` clean.**

> **🔴 Step 4 finding — boot-time gating hides the feature in the session that declares the first mirror.
> FIXED via option (a), see 4d _(2026-07-16)_.**
> The scheduler decided ONCE at boot (`auto-sync-boot.ts`): if no mirror was declared **at that moment**,
> it logged `auto-sync idle: no mirror declared yet` and never armed for the session. So a user who declared
> their FIRST mirror mid-session got **no background refresh until they restarted the brain** — exactly the
> session in which they'd test it and (wrongly) conclude "it doesn't work". Observed live: the real Desktop
> QA session stayed `idle` the whole time; the refreshes Thomas saw were the **question-time** path
> (his own relances), not the timer. **Resolved (4d):** the `AutoSyncSupervisor` makes the boot decision
> re-triggerable + idempotent, and a `setup_source` → `onSourceDeclared` hook arms it the moment the first
> mirror is declared — no restart. Option (b) (doc + nudge) is subsumed; the silent no-op is gone.

> **🔴 Step 4 finding #2 — same-minute edits were silently lost by the background path (FIXED).**
> Notion stamps page `last_edited_time` at **minute granularity** (`…T16:51:00.000Z`). `checkFreshness`
> compared watermarks with strict `>`, so any edit made in the **same minute** as (but after) a sync left
> the timestamp unchanged → `behind = false` → the tick never re-synced → the `.md` stayed frozen on a
> mid-typing snapshot **indefinitely** (until an edit in a later minute). Reproduced live in QA (vault stuck
> on "J'e" while Notion showed the full "Je rajoute une ligne ici pour la QA."; a manual `sync()` — content
> hash — fixed it, proving the gap is watermark-only). **Fix (TDD, on the branch, `bdfa87c`):** a
> watermark is "provisional" when the last sync landed in its own minute; once that minute has **elapsed**,
> `checkFreshness` reports `behind` for **one** corrective sync (its content hash catches the missed edit,
> its later `lastSyncAt` clears the flag → no loop, ≤1 extra sync per active minute). Deterministic via the
> injected clock (ADR 0009). New: `epochMinute()` + `LocalMirror.watermarkMayHideSameMinuteEdit()`; builder
> gained an advanceable `MutableClock` + `advanceClockTo()`. 3 acceptance tests at the `ILocalMirror` port
> (reproduce · no mid-minute churn · no re-sync loop). **Suite 192 green, `tsc` clean.** _(2026-07-16 · `bdfa87c`)_
- [ ] **Step 5 — Docs**
  - [x] 5a — SKILL.md: state that freshness is **also** kept by a background scheduler (default 5 min,
        configurable), while the local-first question-time path stays the immediate one _(2026-07-16)_:
        added the "Freshness is also kept on its own, in the background" note to the local-first routing section.
  - [x] 5b — PRD §8/§19: record the scheduled path (MVP gains a session-scoped timer; 24/7 daemon still
        the target) — keep CONNECTORS "why/when" in sync _(2026-07-16)_: §8 gained a "session-scoped background
        scheduler" bullet, §19 freshness row updated; CONNECTORS "Stays fresh on its own" bullet added.
  - [x] 5c — SETUP/CONNECTORS: document `LOCAL_MIRROR_SYNC_INTERVAL` (the actual shipped var; the old
        `GOLDEN_SOURCE_SYNC_INTERVAL` name never shipped — S6 rename) _(2026-07-16)_: documented in SETUP.md (d),
        CONNECTORS.md (Local mirrors) and `.env.example` (ADVANCED/OPTIONAL block).
  - [x] 5d — ADR: timer-in-MCP vs OS daemon, and the single-flight lock (revisits ADR 0009 "prefer
        deterministic" — bounded exception: a configurable timer, with a deterministic test clock) _(2026-07-16)_:
        **ADR 0032** written (session-scoped refresh timer + single-flight lock, rung 4 of ADR 0009); 0009 gains a
        back-reference to it.
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
