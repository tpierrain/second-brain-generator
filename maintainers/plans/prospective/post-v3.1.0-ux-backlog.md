<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 💡 BACKLOG (created 2026-06-17) — ideas, not committed work. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Backlog — post-v3.1.0 UX ideas

> **STATUS: 💡 BACKLOG** (created 2026-06-17). Captured ideas, **not committed work**. Promote one
> to a real action plan (`*-action.md`, full Tracking section) when it's picked up. **Discipline TDD**
> (skill `tdd-discipline`), deterministic-first (ADR 0009), Mac/Win/Linux parity (ADR 0015).

---

## ✅ Already shipped in v3.1.0 / PR #11 (for context)

- [x] **Native folder picker for `import`** — seam `scripts/lib/folder-picker.mjs` + CLI
  `scripts/pick-folder.mjs`, wired into the `import` skill (EN + FR template), copy-paste fallback.
  _(2026-06-17 · PR #11)_
- [x] **Index-done OS notification** — seam `rag/src/lib/notify.ts`, fired only when `indexed > 0` at
  the 3 reindex completion sites (CLI / MCP auto-reindex / `reindex` tool), silent in automated flows
  via `SBG_NO_NOTIFY`. _(2026-06-17 · PR #11)_

---

## 💡 Idea — custom (Kenjaku) icon on the index-done notification

The index-done toast (`rag/src/lib/notify.ts`) currently shows the **sending app's icon**
(Script Editor, since `osascript` emits it on macOS). Nice-to-have: show the README's **Kenjaku**
artwork instead, for brand polish.

- [ ] **Decide it's worth it first.** It conflicts with the project ethos (zero extra install,
  Mac/Win/Linux parity, deterministic best-effort — ADR 0009/0015). Captured here as cosmetic only.
- [ ] **Known macOS constraint (the blocker):** `display notification` (AppleScript) **cannot** set a
  custom left icon — macOS always uses the emitting app's icon. There is **no zero-dependency** way to
  change it.
- [ ] **Options, all costly:**
  - [ ] A. **Status quo** — generic icon, 0 cost, works everywhere (current design). _Recommended._
  - [ ] B. `terminal-notifier -contentImage <kenjaku.png>` — shows Kenjaku as a **right-side thumbnail**
    (not the left icon). Cost: a **brew dependency**, **macOS-only** (fall back to `osascript` elsewhere),
    and on recent macOS the **left** icon stays unchangeable without `-sender <bundleID>` of a real
    installed app.
  - [ ] C. Ship a **code-signed `.app` bundle** carrying the icon — heavy (signing, bundling,
    cross-platform divergence); disproportionate for a best-effort toast.
- [ ] If ever pursued: prefer B behind the existing `shouldNotify`/seam guards, ship the Kenjaku PNG in
  the repo, and degrade to plain `osascript` when `terminal-notifier` is absent.

## 💡 Idea — coalesce the index-done toast across a slow multi-batch burst (ex-R2-4)

During a **slow, multi-batch sync** (e.g. a golden source whose pages come in over the Notion API in
spurts), the user can see the "Indexing complete — N notes" toast fire **two or three times** instead
of once. Each count is **truthful** (never a wrong number, never a broken index, never a lost note) —
it's purely **cosmetic**: several toasts where one would be nicer. Surfaced in golden-source QA round 2
(observation Obs3 / F5 / "R2-4"); **deliberately dropped** from the golden-source ship — it is an
**auto-indexation concern, not a golden-source one** (the two are decoupled by design: the MCP only
writes files, the watcher only watches them; no code link, and we keep it that way).

- [ ] **Root cause:** `IndexingBurst` (`rag/src/lib/notify.ts`) only coalesces waves that overlap
  within the **5 s debounce** (`reindex-scheduler.ts`). When a writer pauses **longer than the
  debounce** (network round-trips, rate-limit backoff), each spurt looks like a fully-settled burst →
  its own "complete" toast.
- [ ] **The trap (why "perfect" is off the table):** a single toast with the grand total would need the
  indexer to know "the writer isn't done". The only ways to know are **(a)** the writer signals it →
  **couples golden-source to the indexer, explicitly refused** (keep them decoupled); or **(b)** a
  longer trailing **quiet period** before toasting — purely indexer-side, **no coupling**.
- [ ] **Option, if ever pursued (decoupled):** add a **grace window** in the notify path — after a burst
  settles, wait ~10–15 s of total silence before toasting; any new write resets it and keeps
  accumulating; confirmed silence → one toast with the cumulative total. It's a **heuristic timer**
  (pick the duration, env-tunable), in mild tension with ADR 0009 "prefer deterministic" — **justified
  only** because no deterministic signal exists without re-introducing the forbidden coupling.
  Injectable like the scheduler's `setTimer`/`clearTimer`, so testable without real time.
- [ ] **Estimate:** ~30 min code+test+green, + a manual re-verify on a throwaway brain (the bug only
  shows under real multi-batch conditions). **Do NOT** scope it back into golden-source if picked up —
  it lives in `rag/` (auto-indexation), generic across import / sources-sync / golden-source / manual saves.

> Links: [[prefer-deterministic-adr-0009]]. Keep golden-source-sync and auto-indexation **decoupled**
> (filesystem-only boundary) — this idea must never re-introduce a code link between them.

## 💡 Idea — a `doctor` / "am I OK?" check-up skill

A brain-side, **read-only**, opt-in self-diagnosis the user can trigger in plain language
(*"est-ce que tout va bien ?"*, *"is my brain healthy?"*). Aggregates the checks we already own into
one friendly report, with **opt-in fixes** (never silent writes).

- [ ] **Promote to an action plan** before coding (this is just the idea capture).
- [ ] **Aggregate existing deterministic checks** (reuse, don't reinvent):
  - [ ] `scripts/verify-rag.mjs` — does the RAG answer FROM the vault (canary)?
  - [ ] `vault_stats` (MCP) — doc/chunk counts, index freshness.
  - [ ] `node-compat` `checkNode` — Node version in the supported range.
  - [ ] `native-deps` — `better-sqlite3` ABI healthy (no skew).
  - [ ] `embedder-choice` — which embedder is configured, is its key/endpoint present.
  - [ ] git / rooting — is the conversation really rooted in the brain (not a temp dir)? remote/push wired?
  - [ ] RAM headroom — warn if tight given the configured embedder (cf. README "one warm engine per brain").
- [ ] **Design constraints**: read-only by default; any fix is **opt-in** and confirmed; deterministic
  seams (ADR 0009); cross-platform (ADR 0015); a **skill**, not an MCP tool (ADR 0016).
- [ ] **Report**: a single human-readable summary (✅ / ⚠️ / ❌ per check) + the exact one-liner to fix
  each ⚠️/❌, in the brain's locale.

> Links: [[prefer-deterministic-adr-0009]], the `import` UX plan
> (`import-ux-folder-picker-and-index-notify-action.md`), the ABI-skew plan
> (`node-abi-skew-install-runtime-action.md`).

---

## 💡 Idea — auto-finalize `update-engine` (kill the visible 2-cycle self-heal)

Surfaced during the v3.2.2 QA (upgrading a real brain from **v3.1.0**). `/update-engine` runs the
`scripts/update-engine.mjs` **loaded at command start** — i.e. the *old* installed version (Node does
not reload a module mid-run). So any improvement to the update *process itself* (e.g. v3.2.1's
install-missing-skill + reconcile `.mcp.json` per ADR 0025, v3.2.2's "your vault holds N notes" recap
line) lands on disk but is **not executed** in the same run — the user must launch `/update-engine` a
**second time** for the freshly-installed orchestrator to apply it. Field symptom: a v3.1.0 brain
upgraded to v3.2.2 in one run gets the new `rag/` code but **no local-mirror skill, no MCP entry, no
note-count line**, and the recap **doesn't even warn** a second run is needed → the next local-mirror
onboarding runs *without the skill* and improvises (no 2-option disambiguation, weaker token guard).

- [ ] **Promote to an action plan** before coding (idea capture only).
- [ ] **Deterministic auto-finalize (ADR 0009):** once the new `update-engine.mjs` is copied, re-invoke
  **the freshly-written script** in a child process (`execFileSync(node, [<brainDir>/scripts/update-engine.mjs, "--finalize"])`)
  to run the *new* orchestrator's reconcile-skills/MCP + recount + recap in the SAME `/update-engine`.
- [ ] **Guard against loops/recursion:** `--finalize` must NOT re-fetch / re-resolve a newer tag nor
  re-spawn itself (single bounded hop); idempotent (install-if-absent, reconcile-if-missing already are).
- [ ] **Fallback wording:** if auto-finalize can't run (headless, spawn blocked), the **first** recap
  must explicitly say *"run `/update-engine` once more to finish installing new skills/servers"* —
  today it says nothing. Cross-platform (ADR 0015); deterministic, fail-loud.

> Note: the 2-cycle is **inherent to self-update** — even a v3.2.1→v3.2.2 hop won't show the new
> note-count line on the run that introduces it. Auto-finalize makes it invisible going forward.
> Links: [[prefer-deterministic-adr-0009]], ADR 0025 (install-if-absent skills + MCP reconcile).

## 💡 Idea — `local-mirror` always names the two Notion modes, even when intent is clear

Surfaced during the same QA. When the user says *"je voudrais brancher une réplication Notion"*, the
brain should make them **aware there are two distinct modes** before routing: the **native Notion
connector** (live, ad-hoc read/write) vs the **local-mirror MCP** (a durable offline copy indexed by
the RAG). The skill already encodes a *balanced 2-option question* — but **only for the genuine grey
zone**; on an obviously-mirror request it says *"don't ask — just route"*, so the user never learns the
other mode exists. Thomas wants a one-line framing even when the intent is clear.

- [ ] **Refine the routing rule in `.claude/skills/local-mirror/SKILL.md`** (`§ Disambiguate first`):
  keep "don't ask a full question when obvious", but add: *even when routing directly, name both modes
  in ONE neutral line and state which one you're taking* (e.g. *"Two ways to touch Notion: the live
  connector, or a local mirror for offline RAG search — you clearly want the mirror, so I'll set that
  up."*). Wording-only (no code); product-localized strings stay per-locale.
- [ ] **Don't regress the grey-zone behavior** — the full balanced 2-option question still applies when
  the intent is genuinely ambiguous.

> Links: the `local-mirror` skill, [[golden-source-sync-progress]].
