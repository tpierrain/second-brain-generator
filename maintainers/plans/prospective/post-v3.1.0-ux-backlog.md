<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 💡 BACKLOG (created 2026-06-17, slimmed 2026-06-23) — live ideas only. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Backlog — post-v3.1.0 UX ideas

> **STATUS: 💡 BACKLOG** (created 2026-06-17, slimmed 2026-06-23, extended 2026-07-19 with three
> universes follow-ups — the third a regression). Captured ideas, **not committed
> work**. Promote one to a real action plan (`*-action.md`, full Tracking section) when it's picked up.
> **Discipline TDD** (skill `tdd-discipline`), deterministic-first (ADR 0009), Mac/Win/Linux parity
> (ADR 0015).
>
> **Pruned 2026-06-23** (git history keeps the detail): the v3.1.0/PR #11 "already shipped" context
> section (folder picker + index-done notification — long since in production), and the **custom
> Kenjaku notification icon** idea (decision: _status quo / won't do_ — no zero-dependency way to set a
> custom left icon on macOS; it conflicts with the zero-extra-install ethos, ADR 0009/0015).

---

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

> ⚠️ **Partly superseded (2026-06-23):** the *passive* half now exists — **ADR 0028** ships a
> non-blocking **background health-check that reports cached health at session start**. What remains
> open here is only the **user-triggered, on-demand aggregating skill** ("am I OK?" answered now, with
> opt-in fixes) layered on top of those same checks. Re-scope around ADR 0028 if picked up.

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

## 💡 Idea — `/switch` should flag the native connectors' single-account limit

Universes model successive **employers / clients / spheres** (ADR 0034). Switching universe usually
means switching the **account** you operate under, but the **native MCP connectors** (Slack, Notion,
Google, mail…) are each bound to **one account** and have **no multi-account** notion. So right after a
`/switch`, those connectors still point at the **previous** account until the user disconnects and
reconnects them to the new one: a silent mismatch (the RAG is re-scoped correctly, the live connectors
are not). Surfaced by Thomas during the universes field-verify (2026-07-19).

- [ ] **Behaviour:** past the disclosure gate (count >= 2), when `/switch` changes the active universe
  **between two created universes** (not the trivial default toggle), append a one-line, non-nagging
  reminder, e.g. *"Native connectors are single-account; if this universe uses different accounts
  (Slack, Notion, Google…), disconnect/reconnect them to match."* Emitted by the **deterministic**
  switch CLI / skill (like the 1→2 onboarding line), never invented by the LLM (ADR 0009).
- [ ] **The trap (why we can't automate it):** native connector server names are **per-user UUIDs**,
  not pre-authorizable nor introspectable, so we **cannot** tell which connector points at which
  account. The reminder stays **generic advice**, not per-connector automation. Cf.
  [[brain-permission-posture-readonly]].
- [ ] **Relevance, not enforcement:** the RAG universe boundary is unaffected; this only warns the
  human about the **live** side. Keep it once-per-switch, quiet, and only past the gate.

> Links: ADR 0034 (universes), [[brain-permission-posture-readonly]] (UUID connectors, single-account).

## 💡 Idea — make `/local-mirror` universe-aware (parity with `/import --universe`)

`/import` gained `--universe` (ADR 0034 Step 6): imported notes are filed under `vault/<universe>/` and
stamped `universe:` in frontmatter. **`/local-mirror`** also lands content **in the vault** (it
replicates a Notion zone as Markdown), so mirrored notes are **indexed like any vault note** — yet
`local-mirror/src` has **zero** universe-awareness today, so every mirrored note is indexed as
`default` regardless of the active universe. Asymmetry found during the universes field-verify
(2026-07-19): import is universe-aware, the mirror is not.

- [ ] **Behaviour:** stamp mirrored notes with the **active** universe (read from `.vault-rag/`, as the
  engine does) or an explicit declared target; file them under `vault/<universe>/…` for a created
  universe, root for the default. Reuse the pure `stamp-universe.mjs` already used by import;
  **additive**, never clobber an existing `universe:` key.
- [ ] **Not a regression:** mirrors always produced `default` notes; this is an **enhancement**, out of
  scope of the shipped universes plan (which covered `/import` only). Safe to defer.
- [ ] **Deterministic + tested:** pure stamping seam, injected fs, cross-platform (POSIX paths at the
  source, cf. the Windows `vaultRagDir` fix). Promote to an action plan before coding.

> Links: ADR 0034 (universes), the universes plan
> (`universes-progressive-disclosure-action.md` → Step 6, import stamping).

## 🐛 Regression — universes broke `/lint` (make the wiki-health linter universe-aware)

> 🎯 **PICKED UP 2026-07-19 — THIS IS THE NEXT ACTION after the `/clear`.** Fix TDD on
> `scripts/lib/wiki-lint.mjs` (baby-steps, fail-first; tests exist at `wiki-lint.test.mjs`) → `harness:`
> PR → merge `main` → **cut release `v3.6.1`** with a "The One…" codename (mandatory: `update-engine`
> resolves the **latest tag**, not `main` (ADR 0017), so a deployed brain on `v3.6.0` sees nothing
> without a new tag) → the deployed brain then `/update-engine` + full Claude restart → clean `/lint`.
> Patch bump, **no reindex** (harness only, `indexSchemaVersion` unchanged). Scope now covers a **3rd
> false-positive type** found in the field: same-note section anchors `[[#heading]]` (no target file) are
> flagged as dangling too — fix in the same resolver pass.

Introducing universes (`vault/<universe>/`, ADR 0034) **broke the `/lint` wiki-health scanner**: it
predates universes and resolves everything **relative to the vault root**, never the universe root. On a
real single-universe vault (~410 notes filed under `vault/<universe>/`), the report is massively
inflated by **false positives** — surfaced during the universes field-verify (2026-07-19). Two bugs,
**one root cause** (the scanner ignores the leading `<universe>/` path segment), both in engine-owned
`scripts/lib/wiki-lint.mjs`, so a fix reaches every brain via `update-engine`. **Fix it in the launcher,
never patch it inside a deployed brain** (a local patch is clobbered by the manifest `replace` bucket).

- [x] **Bug 1 — resolver blind to universe-relative links** (`buildResolver`, `wiki-lint.mjs:39-52`).
  It registered only 3 keys per note: the full vault-relative path (`<universe>/people/x.md`), its
  extensionless form, and the bare basename (`x`). A wikilink written **universe-relative** (`[[people/x]]`,
  the natural spelling inside a universe) matched **none** → reported "dangling". **Obsidian resolves by
  path suffix**, so these links actually work in Obsidian; the scanner was simply stricter than the
  universe layer added after it. Measured impact: **~628 reported dead links → ~47 real** (~581 false
  positives). _(2026-07-19 — `buildResolver` now registers every path suffix, with/without `.md`; the
  old `basename` helper folded in as the shortest suffix.)_
- [x] **Bug 2 — orphan exclusions blind to the universe prefix** (`wiki-lint.mjs:58` + `:119`).
  `DEFAULT_ORPHAN_EXCLUDE = ["daily/", "raw-sources/", "inbox/", …]` was matched with
  `n.path.startsWith(prefix)`, but paths now start with `<universe>/daily/…` → the exclusions matched
  **nothing**, so raw-capture zones wrongly counted as orphans. Combined with Bug 1 (unresolved inbound
  links), almost every note looked orphaned: **~407/410 reported → ~172 real**. _(2026-07-19 — new
  exported `isUnderZone(path, prefix)` matches a zone at the vault root OR a universe root, one segment
  deep only; triangulated against a naive `includes`.)_
- [x] **Bug 3 — same-note anchors `[[#heading]]` reported as dangling** (found in the field). Extraction
  yielded an empty target for a pure anchor → resolved to null → false dangling. _(2026-07-19 —
  `extractWikiLinks` now drops empty targets; Obsidian resolves `[[#heading]]` within the note.)_
- [x] **Fix (TDD on `wiki-lint.mjs`, already test-covered):** resolution is now **universe-aware** —
  link targets resolve by **path suffix** (Obsidian-style) so a universe-relative spelling resolves, and
  the orphan exclusions are **insensitive to the leading `<universe>/` segment**. POSIX-path discipline
  kept at the source (cf. the Windows `toPosix` fix). Both counters fixed at once; the report is
  trustworthy again. _(2026-07-19 · branch `fix/lint-universe-aware`; wiki-lint 27 tests, consolidation
  18 tests, full suite 732 green; proven end-to-end on a universe fixture through `lint-vault.mjs`.)_
- [x] **Audited `/consolidate` (2026-07-19) — CONFIRMED bitten, doubly.** `consolidation-candidates.mjs`
  imports the SAME `buildResolver` (L14, used L51/L62) → a universe-relative `[[people/x]]` that IS filed
  won't resolve → **false "new-page candidate"** (risk: creating duplicate person pages that already
  exist). AND `isCapture` (L26) matches capture zones with `path.startsWith("daily/"|"meetings/"|…)` (L18),
  which never matches `<universe>/daily/…` → **capture zones missed entirely**. Net: `/consolidate` is
  unreliable on a universe vault (report lies in both directions). **Good news:** `buildResolver` is
  **shared**, so fixing it once cures the resolver-blindness in BOTH `/lint` and `/consolidate`; the
  `startsWith`-prefix zone checks (wiki-lint orphan-exclude L119 + this `isCapture` L26) need the same
  universe-prefix-insensitive treatment. **Do NOT run `/consolidate` on a deployed universe brain until
  v3.6.1 ships.**
- [x] **Audited `/file-back` (2026-07-19) — NOT bitten by this regression.** `file-back-note.mjs` +
  `filed-note.mjs` only **write** a conformant note (path derived from the type taxonomy); they use
  neither `buildResolver` nor a zone `startsWith`, so the resolver/zone universe blind spot doesn't
  touch them. Its universe **placement** (writing under `vault/<universe>/…`) is a separate concern —
  the import-stamping item above (universes plan Step 6), not this linter fix.
- [ ] **Not part of this regression:** the frontmatter findings the linter reports (~163: missing
  `updated`/`tags`) are **universe-independent** and genuinely actionable — don't discount them once the
  false positives are removed. That triage is **brain-side content work**, not launcher work.

> Why it matters (the reflex "the tool lies at scale"): the answer is **not** to hand-patch hundreds of
> links, but to make the linter universe-aware so the report stops lying. Links: ADR 0034 (universes),
> [[cross-platform-ci-is-the-arbiter]] (POSIX-at-the-source), [[validate-shipped-not-test-instance]]
> (fix the engine source, not the deployed brain), the axis-1 wiki-health plan
> (`wiki-health-axis1-mechanisms-action.md`).
