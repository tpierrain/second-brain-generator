<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔭 PROSPECTIVE / STUDY — design + risk analysis only, no code yet.  -->
<!-- Direction DECIDED by Thomas (2026-06-21). Implementation = the existing     -->
<!-- plan golden-source-scheduled-sync-action.md (to be enriched, not redone).   -->
<!-- This is the LAST topic of the v3.3.0 version (ship it at the very end).      -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Study — auto-refresh of Notion local mirrors (consequences & what to harden)

> **What this is.** A doc-only study (NO code) of letting a declared **Notion local mirror** refresh
> itself in the background, **after Thomas settled the direction** (2026-06-21). It focuses on the two
> things Thomas asked for: **(1) the consequences + what we must harden** if we poll every ~5 minutes,
> and **(2) what to do if the user asks a question about a mirrored source *between* two polls.**
>
> **Position in the roadmap.** This is the **LAST topic of v3.3.0** — to be done **at the very end of
> the current PR**, after the QA gate. Nothing here is started.

---

## Decision (settled with Thomas, 2026-06-21)

- [x] **The rest of the brain (the vault) keeps its current heuristic — unchanged:** answer
  **immediately** from the local vault, refresh **in parallel**, and amend the answer if the refresh
  changed something. We do NOT touch this.
- [x] **Notion mirrors get a different treatment: a background auto-refresh** — but **only for users
  who have set up / activated at least one mirror.** (No mirror declared → nothing runs.)
- [x] **Mechanism = a timer *inside the `local-mirror` MCP server* (which already runs in our context
  when a mirror exists), polling every ~5 min:** each tick does a **cheap `check_freshness`** (does
  the remote Notion zone hold edits newer than our local copy?) and triggers a **`sync`** only for the
  sources reported `behind` (handling adds / edits / deletions). It is **not** an OS daemon: the MCP is
  a per-session process, so the timer ticks **only while a brain window is open**, and dies with it.

> **This is not new ground — we already designed it.** The existing plan
> [`../golden-source-scheduled-sync-action.md`](../golden-source-scheduled-sync-action.md) (written
> 2026-06-18, before we renamed "golden-source" → "local-mirror") already specifies exactly this:
> timer-in-MCP, default 300 s / configurable, `check_freshness`→`sync` if `behind`, session-scoped
> lifetime, **and a concurrency lock as Step 1**. **That plan is the implementation reference.** This
> study only (a) confirms the direction, (b) deepens the *consequences & hardening*, and (c) adds the
> **in-interval question** behaviour, which that plan does not yet cover. When we implement, rename its
> "golden-source" terminology to "local-mirror" and fold in §"In-interval question" below.

---

## Tracking — checkboxes

- [x] **S1 — Direction confirmed (poll-in-MCP, mirrors only, opt-in by having a mirror)** _(2026-06-21)_
- [x] **S2 — Consequences + what to harden, written** _(2026-06-21)_
- [x] **S3 — In-interval-question behaviour, analysed + recommended** _(2026-06-21)_
- [x] **S4 — Open questions surfaced (incl. the 5-vs-10-min wording)** _(2026-06-21)_
- [x] **S5 — 🧭 Thomas answers the few remaining open questions** _(2026-07-16 — Q1..Q5 all settled; see S4)_
- [ ] **S6 — (last topic of v3.3.0) implement via `golden-source-scheduled-sync-action.md`** _(ready to start — deltas folded in below)_

---

## S2 — Consequences & what we MUST harden

> Ordered by how much they can bite. The good news: most are already named in the existing plan's
> "Design notes" — this expands them.

### 1. Several brain windows open at once = several pollers (the #1 risk)

The MCP is **one stdio process per brain window**. Open two windows on the same brain → **two timers**,
each polling and potentially **syncing the same source at the same time** → corrupted sidecar state
(`.local-mirror/<name>.state.json`, currently last-write-wins), half-written Markdown, duplicated work,
duplicated commits. This is exactly the open question already parked in memory
(`mcp-concurrent-brain-windows`).

- **Harden:** a **single-flight lock per source** — a lockfile (e.g. `.local-mirror/<name>.sync.lock`)
  with a **stale-lock timeout** (a crashed process must not wedge the source forever). A tick that
  finds the source locked **skips** it rather than racing. (This is **Step 1** of the existing plan,
  marked PREREQUISITE — keep it first.)

### 2. The "cheap" check is not free — Notion API & quota

`check_freshness` hits Notion (it enumerates the zone's `last_edited_time` to compute the remote
watermark). Every 5 min × N sources × M windows can become a lot of Notion calls, and Notion
**rate-limits** (~3 req/s). A `sync` of a `behind` source is heavier still.

- **Harden:** the single-flight lock (item 1) caps it to **one poller effectively syncing at a time**;
  `check_freshness` stays watermark-only (no content pulled unless `behind`); **back off on 429/401/
  network errors** (don't retry-storm a throttled or unauthorized source); never pull full content just
  to decide.

### 3. Who commits & re-indexes what the timer writes (the subtle one)

A `sync` driven by the **MCP's own timer** writes Markdown to `vault/mirrors/<name>/` **without going
through any Claude tool call**. Consequences:

- **Indexing: OK automatically.** The RAG **FileWatcher** re-indexes files shortly after they hit disk
  — it doesn't care who wrote them. So search/citation freshness follows.
- **Git commit: NOT automatic.** `auto-commit` is a `PostToolUse(Write|Edit)` hook — it fires on
  **Claude's** edits, not on a background writer. So timer-written notes sit **uncommitted** until the
  next time Claude happens to edit something (then `git add .` sweeps them — non-deterministic timing).
  - **Harden:** the background sync should **commit its own** `vault/mirrors/<name>/` subtree at the end
    of a successful tick (deterministic), reusing the same "auto: …" commit convention. Push stays
    governed by the existing opt-in gate (`secondbrain.autopush` + the Stop-hook debounce) — a
    background tick should **not** push on its own beyond that gate.

### 4. Commit / toast noise

A source that changes often → a commit (and possibly a "mirror refreshed" toast) every few minutes.
That can feel noisy.

- **Harden:** a no-change tick writes nothing → **no commit, no toast** (already true: behind-only
  sync). For an actual change, **one settled toast** (the truthful-toast work already shipped, QA F5),
  not a per-file flood; consider a minimum quiet interval between user-visible notifications (anti-nag,
  like `runtimeObsidianHint`). Commits can stay silent (they're just local history).

### 5. Offline / token missing / Notion down

The timer must treat "can't reach Notion" or "no token in `.env`" as a **benign no-op**, never a
blocking error, never a scary banner.

- **Harden:** every tick is wrapped fail-soft; an error logs to stderr, leaves state `partial`, and the
  loop **keeps ticking** (one bad tick never kills the scheduler). Token read headlessly from `.env`
  (`fresh-env`); absent → silent skip.

### 6. Resource use & lifecycle

A timer in a long-lived process must not leak or outlive the session.

- **Harden:** start the scheduler at server boot **only if** interval > 0 **and** ≥1 source is declared;
  **stop it cleanly** on shutdown (SIGINT/SIGTERM/stdin close) so no orphan timer; `interval = 0`
  disables it entirely (escape hatch).

### 7. Determinism / testability (ADR 0009)

A wall-clock timer is the kind of thing ADR 0009 tells us to avoid — but the preference is **bounded,
not dogma**, and here polling is the **only** available signal (Notion has no webhook in this MVP).

- **Harden:** keep it deterministic **in tests** via an **injectable clock/timer port** (ticks fire
  synchronously in tests — no real 5-min waits); cheap **in prod** via watermark-only checks. Record the
  bounded exception in an ADR (item already in the existing plan, Step 5d).

---

## S3 — What if the user asks about a mirrored source *between* two polls?

This is Thomas's explicit question. The risk: the user asks about the mirrored zone right after a remote
change but before the next 5-min tick → the brain answers from a copy that's a few minutes stale.

**Recommendation — mirror the vault heuristic, then reset the timer:**

- [x] **Answer immediately from the local mirror** (it's already indexed) — never make the user wait on
  a network round-trip. This keeps mirrors consistent with the rest of the brain ("local-first, amend
  in parallel"). _(adopted 2026-07-16, Q3)_
- [x] **In parallel, trigger an on-demand `check_freshness` (→ `sync` if behind) for that source**, so
  that if the local copy was stale, the brain can **amend / append** its answer ("⟳ I just refreshed
  *<source>* — one page changed, here's the update"). Same single-flight lock as the timer (if a tick
  is already syncing, just await/skip — don't double-sync). _(adopted 2026-07-16, Q3)_
- [x] **Reset the poll timer for that source after this on-demand refresh** — we just verified it, so
  there's no point re-polling it 30 s later. The next automatic tick is rescheduled to "now + interval".
  _(adopted 2026-07-16, Q3)_

**Two design points to nail when implementing this:**

- *How does the MCP know the user "asked about this source"?* The MCP doesn't see the user's question —
  **Claude** does, and the `local-mirror` **skill** decides to call a tool. So the trigger is: when the
  skill resolves a question to a mirrored source, it calls a `check_freshness`/`sync` (or a future
  `touch`/refresh-ahead tool); the **MCP resets that source's timer whenever any successful sync runs**
  (manual, on-demand, or scheduled). Net effect = "recent activity defers the next poll."
- *Speed vs freshness trade-off:* the recommended path keeps answers **fast** (local-first) and accepts a
  brief amend if needed. The alternative — block the answer on a synchronous `check_freshness` before
  responding — guarantees freshness but adds a Notion round-trip to every such question; **not
  recommended** as the default (it breaks the "answer immediately" promise), though it could be an
  opt-in "strict freshness" mode later.

---

## S4 — Open questions for Thomas (small; the direction is settled)

- [x] **Q1 — One interval or two?** → **ANSWERED (2026-07-16): one interval.** A single ~5-min interval
  of cheap `check_freshness` → `sync`-if-`behind` (option a), plus "reset the timer after an on-demand
  refresh" (S3). No separate slower full-sync cadence for v1.
- [x] **Q2 — Default interval & configurability.** → **ANSWERED (2026-07-16): 300 s default,
  env-configurable** (`LOCAL_MIRROR_SYNC_INTERVAL`, `0` = off). Auto-refresh is **on by default**
  whenever ≥1 mirror is declared (no extra opt-in beyond having a mirror). Per-mirror override deferred
  (one global value for v1 unless a need appears).
- [x] **Q3 — On-demand refresh: amend-after or answer-stale-silently?** → **ANSWERED (2026-07-16):
  answer local-first AND refresh in parallel to amend** (the S3 recommendation). Consistent with the
  rest of the brain ("local-first, amend in parallel").
- [x] **Q4 — Toast policy on a background change.** → **ANSWERED (2026-07-16): one settled toast per
  real change, plus a minimum quiet interval** (anti-nag) so a fast-moving source doesn't toast every
  few minutes. A no-change tick stays silent; commits can stay silent (local history only).
- [x] **Q5 — Localize the user-facing lines** → **ANSWERED (2026-07-16): English-only for v1**, like
  the other runtime hooks today. Localization can come later if needed.

---

## Implementation = the existing plan (do NOT re-plan from scratch)

When S5 is answered and we reach the end of the v3.3.0 PR, **execute
[`../golden-source-scheduled-sync-action.md`](../golden-source-scheduled-sync-action.md)** with these
deltas folded in:

- [ ] Rename its "golden-source" terminology to **"local-mirror"** (the module was renamed).
- [ ] Keep **Step 1 (single-flight lock)** first — it's the multi-window race fix (S2 item 1).
- [ ] Add the **commit-its-own-subtree** behaviour (S2 item 3) — not in the original plan.
- [ ] Add the **in-interval on-demand refresh + timer-reset** (S3) — not in the original plan.
- [ ] Confirm the new env/config + the scheduler lifecycle reach **upgraders** (the F-B2 reconciler
  already carries engine-owned config; the MCP code itself ships via `/update-engine`).
