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
