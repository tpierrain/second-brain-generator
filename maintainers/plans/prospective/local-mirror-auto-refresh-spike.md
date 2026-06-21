<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔭 PROSPECTIVE / SPIKE — design only, no code yet. Awaiting Thomas's -->
<!-- go/no-go on the recommendation + the open questions at the bottom.          -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Design spike — should a declared local mirror refresh itself automatically?

> **What this is.** A **design spike, doc-only, NO code** (Thomas's explicit gate, 2026-06-21):
> capture the problem, survey the state of the art, lay out 2–4 options with their trade-offs, make
> one recommendation, and surface the open questions Thomas must answer **before** any TDD work
> starts. Read it, then decide go/no-go fast — the fear was a big chantier; the finding of this spike
> is that the recommended path is **small and already-precedented** (the reconciler tick we just
> shipped for F-B2).
>
> **Scope guard.** This spike does **not** change the on-demand `local-mirror sync` UX that exists
> today (the user asks, the brain refreshes). It only studies whether — and how — a mirror could also
> refresh **on its own**, without the user asking.

---

## Tracking — checkboxes (live-monitorable in this file)

> The spike itself is the deliverable; these boxes track that each design question got a written
> answer. The **implementation outline** further down is a *proposal* (unchecked) — it only becomes
> live work if Thomas says GO.

- [x] **S0 — Problem + constraints stated** _(2026-06-21)_
- [x] **S1 — State of the art surveyed (name the standard, anti-NIH)** _(2026-06-21)_
- [x] **S2 — Options laid out with trade-offs (≥3)** _(2026-06-21)_
- [x] **S3 — Recommendation made + justified** _(2026-06-21)_
- [x] **S4 — Open questions for Thomas surfaced** _(2026-06-21)_
- [ ] **S5 — 🧭 Thomas's decision (go / no-go + answers to the open questions)** _(awaiting)_
- [ ] **S6 — (if GO) promote the implementation outline into a real TDD action plan** _(conditional)_

---

## S0 — Problem & constraints

**Problem.** A *local mirror* is a one-way local copy of a Notion zone, replicated into the vault as
Markdown so the **offline RAG** can search & cite it (see the `local-mirror` skill + PRD). Today a
mirror only moves forward when the **user explicitly asks** ("refresh my product mirror"). Between
asks, the local copy silently drifts behind the live Notion zone — and the user has no reason to
remember to refresh. The brain can then **confidently cite a stale local copy**. We want a mirror to
**keep itself reasonably fresh on its own**, so "search my Notion" stays trustworthy without manual
upkeep.

**Hard constraints (inherited from the repo's standing rules):**

- [x] **No daemon, no OS scheduler.** ADR 0009 prefers a deterministic, event/condition-triggered,
  stateless, fail-loud/best-effort mechanism over a timer/background-service. We have a strong
  in-repo precedent: the **SessionStart reconciler tick** (`session-self-heal.mjs`, ADR 0026) —
  level-triggered, drift-gated, detached, fail-open. The auto-push debounce (ADR 0010) is the same
  family.
- [x] **Never block session start.** Any work must be a true no-op when nothing is stale, and run
  **detached** (`detached:true` + `stdio:"ignore"` + `windowsHide:true` + `.unref()`) when it does
  fire — exactly like self-heal.
- [x] **Cross-OS parity (ADR 0015).** Pure Node, no shell/`jq` dependency; the win32/darwin/linux
  branches all unit-covered.
- [x] **Fail-soft.** Offline / Notion down / token missing must degrade to a benign no-op + at most a
  soft line — **never** a scary banner, never an exit ≠ 0 that blocks a session.
- [x] **Reaches upgraders.** A new SessionStart hook must be added to `.claude/settings.json.template`
  **and** ride the F-B2 reconciler's engine-owned-hooks merge so already-installed brains get it
  (now proven, cf. the v3.3.0 QA plan Step 7b).
- [x] **The vault stays sacred-ish.** Mirror notes live under `vault/mirrors/<name>/`; a refresh only
  ever rewrites *that* subtree (the mirror owns it), never user notes.

**What we already have (verified — so no schema change is needed):**

- [x] `SourceState` (`local-mirror/src/domain/types.ts`) already stores **`lastSyncAt`** (ISO),
  **`watermark`** (max `last_edited_time` at last successful sync) and **`lastSyncStatus`**
  (`ok|partial|failed|never`). → **staleness is computable locally** as `now − lastSyncAt > N`, no
  network, no new fields.
- [x] The local-mirror MCP already exposes **`sync(name | "all")`** (incremental, content-hash
  cached, returns a `SyncReport`), **`check_freshness(name)`** (light, watermark-only, *pulls
  nothing but does hit Notion for the remote watermark*), **`list_sources()`** and **`status(name)`**
  (`local-mirror/src/index.ts`).
- [x] The RAG **FileWatcher reindexes files a moment after they hit disk** (per the skill) — so notes
  written by a background refresh get indexed automatically **as long as the `vault-rag` MCP is
  running**. The mirror is unaware of the RAG by design (PRD §7).
- [x] `scripts/session-self-heal.mjs` + its pure gate `scripts/lib/self-heal-detect.mjs` are the
  **exact structural template** to copy: pure injectable gate (no I/O) → unit-tested in isolation;
  thin `main` that wires real I/O seams and spawns a detached child; one soft `systemMessage`;
  `process.exit(0)` always.

**One material difference from self-heal — call it out loudly.** Self-heal is **local-only** (no
network: `sourceDir === brainDir`). A mirror refresh is a **network** operation (it talks to Notion).
So this feature would, for the first time, let **session start trigger a network call**. That raises
the bar on fail-soft (offline must be a clean no-op) and on *frequency* (we should not wake Notion on
every single session). This is the dominant design tension and drives the options below.

---

## S1 — State of the art (so we don't reinvent the wheel)

The "keep a local replica fresh" problem is old and well-charted. The relevant families:

| Family | Canonical examples | Trigger | Fit for us |
|---|---|---|---|
| **Polling on a timer / scheduler** | `cron`, systemd timers, `launchd`, Windows Task Scheduler; `git fetch` cron; Dropbox/`rclone` periodic sync | wall-clock interval, runs whether or not you're using the app | ❌ daemon/scheduler — violates ADR 0009 + the no-daemon constraint; cross-OS scheduler wiring is exactly the burden we avoid; refreshes (and churns commits/pushes) while the user is away. |
| **Event/condition-triggered "lazy" refresh** | HTTP caches w/ TTL + revalidation (`Cache-Control: max-age`, `stale-while-revalidate`); package managers checking "index older than N" on invocation; **our own SessionStart reconciler tick**; `git` "your branch is behind" on interactive use | something the user *already does* (opens a session) + a **staleness/TTL gate** | ✅ matches ADR 0009 and our precedent exactly; no daemon; only runs when the brain is actually in use. |
| **Push / webhook-driven** | Notion API webhooks, GitHub webhooks, CDC/streaming replication | the source notifies us of a change | ❌ requires a persistent listener (a daemon/endpoint), public reachability, secret management; massive overkill for a personal offline mirror. |
| **Manual / on-demand** | "pull to refresh"; `git pull` by hand; today's `local-mirror sync` | the user asks | ✅ the safe baseline; the whole point is to *reduce* this friction, but it stays the fallback. |

**The standard we are mimicking** is the **TTL-gated lazy revalidation** pattern (HTTP's
`stale-while-revalidate` is the precise name): serve the local copy immediately, and *if it's older
than the TTL*, kick off a background revalidation so the **next** read is fresh — never block the
current one. Mapped onto our world: **SessionStart is the "read", staleness is the TTL, the detached
background `sync` is the revalidation.** This is also exactly the shape of our shipped reconciler tick
(level-triggered, drift-gated, idempotent, detached) — so we are reusing an in-repo pattern, not
inventing one.

---

## S2 — Options

### Option A — Session-triggered staleness refresh, no daemon  ⭐ (recommended)

A new SessionStart hook `scripts/session-mirror-refresh.mjs`, built as a near-clone of
`session-self-heal.mjs`:

- A **pure gate** (`lib/mirror-staleness.mjs`, unit-tested, no I/O): given `list_sources()` state +
  `now` + a threshold `N`, return the list of mirrors whose `lastSyncAt` is older than `N` (or
  `never`). True no-op when none are stale.
- The thin `main`: if any mirror is stale → **spawn a detached background `sync`** for those mirrors
  (reuse the MCP/port; or a tiny headless CLI over the same `ILocalMirror`), emit **one soft line**
  ("🔄 Refreshing your *<title>* mirror in the background — it'll be current in a moment."), and
  `exit 0`. Offline / token-missing / Notion-down → caught, benign no-op (maybe a one-time soft note),
  never blocks.
- Reaches upgraders via the template + the F-B2 reconciler hooks merge.

**Pros:** deterministic + ADR-0009-aligned; zero new infra; reuses a proven template and the existing
incremental, content-hash `sync` (a no-change refresh is cheap); only runs when the brain is in use;
the FileWatcher reindexes the result automatically.
**Cons:** a stale mirror is only refreshed *the next time you open a session* (not "live"); session
start now triggers a network call (mitigated: gated by staleness + fail-soft offline); needs answers
on the open questions below (default `N`, concurrency lock, commit/push of background-written files).

**Two sub-variants for the gate (decision needed — see open questions):**

- **A1 — gate on local time only** (`now − lastSyncAt > N`): purely local, **zero network at session
  start** to *decide*. The `sync` itself is incremental, so if Notion didn't change it's a cheap
  no-op fetch. Simplest; may do a "nothing changed" fetch occasionally.
- **A2 — gate on `check_freshness` first**: only spawn a `sync` if Notion actually reports a newer
  watermark. Avoids no-op fetches, but `check_freshness` **is itself a network call at session start**
  — which partly defeats "don't wake Notion every session". Best combined *with* a local-time
  pre-gate (only call `check_freshness` once we're already past `N`).

### Option B — OS scheduler / background daemon

Wire a `launchd`/Task Scheduler/cron entry at install that periodically runs a headless `sync`.

**Pros:** mirror stays fresh even if you never open the brain; "truly automatic".
**Cons:** ❌ direct violation of ADR 0009 (timer/daemon) and the no-daemon constraint; per-OS
scheduler wiring is brittle and exactly the cross-OS burden we avoid; runs (and commits/pushes, waking
the network + auth) while the user is away; a failing background job is invisible/hard to reason
about; uninstall/cleanup story is messy. **Rejected.**

### Option C — Notion webhooks / push-driven

Subscribe to Notion change events and refresh on notification.

**Pros:** near-real-time freshness; no polling.
**Cons:** ❌ needs a persistent listener (daemon/public endpoint), Notion webhook plumbing + secret
management, and is wildly disproportionate for a personal, offline, single-user mirror. **Rejected.**

### Option D — Stay on-demand (status quo, do nothing)

Keep refresh purely manual; optionally just **surface staleness** ("your *Team A* mirror is 9 days
behind — want me to refresh it?") at use-time without auto-refreshing.

**Pros:** zero risk; no background network, no churn, no concurrency questions; the user stays in
control.
**Cons:** the drift problem persists; the brain can still cite a stale copy if the user doesn't act.
**A useful middle ground:** the **staleness *surfacing*** part of D is cheap and low-risk and could
ship **independent of (or before)** A — a soft "this mirror is N days behind" hint is valuable even
without auto-refresh.

---

## S3 — Recommendation

**Recommend Option A (session-triggered staleness refresh, no daemon), A1 gate (local-time) as the
default**, with **D's staleness-surfacing as a cheap companion / fallback**:

1. It is the only option consistent with ADR 0009 + the no-daemon constraint, and it **reuses a
   pattern we already shipped and proved** (the SessionStart reconciler tick). That makes it *small*:
   a pure gate + a thin detached-spawn `main` + one template hook entry + the reconciler-merge it
   already inherits. The TDD surface is a handful of baby-steps.
2. The local-time gate (A1) keeps session start **network-free for the decision** and leans on the
   already-incremental `sync` so a no-change refresh is cheap — the simplest thing that works. We can
   add A2's `check_freshness` pre-flight later *only if* no-op fetches prove wasteful.
3. Pair it with D's **staleness surfacing** so that even when auto-refresh is throttled (or fails
   offline), the brain *tells* the user "this is N days behind" and tempers its confidence when citing
   a stale mirror — which is the real user-facing win.

This is forward-looking, not urgent: it's a polish on top of an already-working on-demand flow. The
recommendation is to **build A1 + the staleness surfacing**, and treat A2 / per-mirror tuning as
conditional follow-ups.

---

## S4 — Open questions for Thomas (please answer before S6)

> These are genuine product/UX trade-offs, not implementation trivia. The TDD plan can't be finalized
> without them.

- [ ] **Q1 — Default staleness threshold `N`?** What feels right as the out-of-the-box freshness
  window — e.g. **6h**, **24h**, or **a few days**? (Notion zones for "team docs" change slowly;
  too-small `N` = needless fetches/commits.) Default proposal: **24h**.
- [ ] **Q2 — Per-mirror override?** Should `N` be configurable per mirror (a field in
  `local-mirror.config.json`), or one global default is enough for v1? (Proposal: global default
  now, per-mirror field later if asked.)
- [ ] **Q3 — Gate variant A1 vs A2?** Local-time gate only (network-free decision, may do occasional
  no-op fetches), or call `check_freshness` first (avoids no-op syncs but hits Notion at session
  start)? (Proposal: **A1**, escalate to A2 only if no-op fetches prove costly.)
- [ ] **Q4 — Concurrency: what if a refresh is already running?** A long `sync` can outlast the
  session, or two Desktop windows can both fire. Self-heal does *not* guard this. Do we want a
  **lockfile** (e.g. `.local-mirror/<name>.refresh.lock` with a stale-lock timeout) so a second
  session doesn't double-sync? (Proposal: yes, a simple timestamped lockfile, fail-soft if stale.)
- [ ] **Q5 — Who commits & pushes the background-written notes?** ⚠️ This is the subtlest point. The
  `auto-commit` hook is **`PostToolUse(Write|Edit)`** — it fires on **Claude's** tool calls, **not**
  when a *detached background process* writes files. So a background `sync` writes Markdown that
  auto-commit **won't** immediately catch (the next time Claude edits anything, `git add .` would
  sweep them — eventually committed, but not deterministically right after the refresh). Options:
  (a) the background refresh job does its **own** `git add/commit` at the end (most deterministic);
  (b) rely on the next Claude edit to sweep them (lazy, non-deterministic timing); (c) leave them
  uncommitted until the user does something. And push is opt-in (`secondbrain.autopush` + the Stop
  debounce). **Proposal: (a)** — the background job commits its own mirror subtree, mirroring the
  determinism of auto-commit; push stays governed by the existing opt-in gate.
- [ ] **Q6 — Token availability in a detached process.** The Notion token lives in `.env`
  (`token_env`). A detached background sync must load it headlessly (`lib/fresh-env.ts` exists) — and
  if it's absent/expired, degrade to a **clean no-op** (never a scary failure). Confirm: silent
  no-op + at most a soft "couldn't reach Notion to refresh *<name>*" line, once.
- [ ] **Q7 — Message localization.** Runtime hooks are English-only today (per the language rule:
  source strings English; product localization is the carve-out). The soft refresh line is
  user-facing product copy — **localize it (FR rendering) like the F-B2 self-heal message, or keep
  English for now?** (Proposal: English source string, localize at render alongside the other
  runtime hook messages when we do that pass.)
- [ ] **Q8 — Failure / backoff.** If `lastSyncStatus` is `failed`/`partial`, do we retry every
  session (could hammer a broken source) or back off (e.g. don't retry for `M` hours after a
  failure)? (Proposal: simple — retry next session, but never block; revisit if a flapping source
  proves annoying.)
- [ ] **Q9 — Do we even want auto-refresh, or just D's staleness surfacing first?** The lowest-risk
  ship is **D alone** (tell the user "N days behind", temper citation confidence) with **no**
  background network at all. Is auto-refresh (A) worth the concurrency/commit questions above, or do
  we start with surfacing and add A later? **This is the real go/no-go.**

---

## (Conditional) S6 — Implementation outline if Thomas says GO

> NOT started. Promote into a standalone `*-action.md` only after S5. TDD baby-steps, green-only
> commits, artifacts in English. Listed here so the size is visible: it's small.

- [ ] **Pure staleness gate** `scripts/lib/mirror-staleness.mjs` (+ `.test.mjs`): `(sources, now, N)`
  → stale list; covers `never`, exactly-`N`, future-dated `lastSyncAt`, empty list. (mirror
  `self-heal-detect.mjs`.)
- [ ] **The hook** `scripts/session-mirror-refresh.mjs` (+ `.test.mjs` on the pure orchestration via
  injected seams): no-op when nothing stale (spawn nothing, emit nothing); stale → emit one soft line
  + spawn detached `sync`; fail-open (`exit 0` always); offline/token-missing → benign.
- [ ] **Concurrency lock** (per Q4 answer): timestamped lockfile under `.local-mirror/`, stale-lock
  timeout, fail-soft.
- [ ] **Commit coupling** (per Q5 answer): background job commits its own mirror subtree (option a),
  or document the chosen alternative.
- [ ] **Headless refresh entry**: confirm a detached process can drive `sync` over `ILocalMirror`
  with `.env` loaded (reuse `fresh-env`), or add a tiny `local-mirror` CLI seam.
- [ ] **Staleness surfacing** (D companion): the `local-mirror` skill / `status` output tells the
  user "N days behind" and tempers confidence when citing a stale mirror.
- [ ] **Wire the hook**: add the 5th `SessionStart` entry to `.claude/settings.json.template`; confirm
  the F-B2 reconciler's engine-owned-hooks merge carries it to upgraders (regression test).
- [ ] **Cross-OS (ADR 0015)**: detached-spawn shape (`detached`/`stdio:"ignore"`/`windowsHide`/
  `unref`) + lockfile path on darwin/win32/linux all unit-covered.
- [ ] **ADR**: a short ADR (or an amendment to ADR 0026's reconciler-tick family) recording
  "SessionStart staleness-gated mirror refresh, no daemon" with the `Scope:` field; name the
  `stale-while-revalidate` prior art (anti-NIH); crux block on top.
- [ ] **Suites green + tsc clean**; manual QA: a deliberately-stale mirror in a rooted Desktop session
  refreshes in the background and the soft line shows; offline → clean no-op.
