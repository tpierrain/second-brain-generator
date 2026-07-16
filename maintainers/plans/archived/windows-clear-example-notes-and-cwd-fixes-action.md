<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- This is the ONE canonical plan for this chantier.                             -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

> **STATUS: ✅ SHIPPED (2026-07-16, in TDD) — branch `fix/windows-clear-example-notes`, release v3.4.1.**
> All three pure-Windows findings fixed in baby-steps: **B3** (CRLF-tolerant frontmatter regex in
> `scripts/lib/example-notes.mjs`), **B2** (entrypoint guard extracted to a pure `isEntrypoint`
> predicate in `scripts/lib/entrypoint.mjs` using `pathToFileURL`), **B1** (`.\` path-qualified
> install invocation in `scripts/lib/rag-launcher.mjs`). PROVEN end-to-end: on a CRLF temp vault the
> purge deletes the `exemple`-tagged note and keeps the machinery (was a silent no-op before). Sweep
> confirmed no other separator-less `cmd /c <name>` invocation. Green: engine 329/329, scripts 564/564.
> **Scope: Second brain (runtime) — brain-side scripts + install invocation. No engine (`rag/`) touched.**

# Plan — Windows follow-ups on top of v3.4.0: silent `clear-example-notes` + hardened-cwd install

## Context

A colleague installed v3.4.0 ("The One Where Windows Installs Clean", PR #17) on a hardened
corporate Windows machine (Visma) and filed a high-quality follow-up report. The original three
v3.3.x bugs are confirmed fixed; **three new pure-Windows findings remain**, all invisible on
macOS/Linux (strings coincide by chance, LF line endings). The report ships exact root causes,
minimal fixes and a regression test — verified against the current tree, all three still present.

Source report (local, not versioned — private machine context, do not commit it):
`~/Downloads/second-brain-generator-windows-node20-report (1).md`.

**Severity (assessed):**
- 🔴 **Serious — bugs B2+B3 combine into a silent no-op of `clear-example-notes` on ALL Windows.**
  After install + import, the documented purge command does nothing (no output, no error), so the
  RAG keeps answering from the fictional demo notes (Flemmr, Pélagie) as if real. This breaks the
  product's core promise (*"answers from YOUR vault, cites its sources"*) and violates the
  fail-loud preference (ADR 0009). It is silent, which is the worst failure mode.
- 🟠 **Install blocker but loud — bug B1 (`NoDefaultCurrentDirectoryInExePath`).** Fails the install
  at step 8/10 with a clear message, only on hardened/corporate Windows where that env var is set.
- 🟢 No security issue, no data corruption.

## Provenance — since when? (git archaeology, 2026-06-25)

**NOT a regression from v3.4.0.** B2+B3 are latent debt present since the demo-purge feature was
born; v3.4.0 (PR #17) only hardened Windows *install* and surfaced the path by getting a colleague
to finally exercise the purge on a real Windows machine. B1 is the only finding that touches the
v3.4.0 perimeter.

- **B3** (frontmatter regex LF-only, `scripts/lib/example-notes.mjs:14`) — introduced **`2b09cfc`**,
  2026-06-03 (*"bootstrap — étape 6/9 « vider les notes d'exemple »"*) → present since the **very
  first** version of the purge mechanism.
- **B2** (hand-rolled `file://` entrypoint guard, `scripts/clear-example-notes.mjs:58`) — introduced
  **`e993af4`**, 2026-06-10 (*"offer yes/no deletion of example notes after the demo answer"*) →
  present since the interactive-deletion flow was added.
- **Why never caught:** on macOS/Linux the `file://` strings coincide by chance and LF is the
  default, so both are invisible there; the reporter is likely the first to run the purge on a real
  Windows checkout (CRLF + direct invocation), the only setup that triggers both at once.

## Tracking

- [ ] **Step 0 — Branch + decision recap**
  - [ ] Create branch `fix/windows-clear-example-notes` off `main`
  - [x] Confirm scope with Thomas _(2026-07-16 · re-scoped: fix all 3; B2 → **extract a pure `isEntrypoint(metaUrl, argv1)` predicate** for fail-first testing; B3 → **minimal CRLF-tolerant regex**, NOT a gray-matter dependency in the lean launcher scripts; release = **standalone patch v3.4.1**)_
- [ ] **Step 1 — 🔴 Make `clear-example-notes` actually work on Windows (the serious one)**
  - [x] B3 — `isExampleNote()` tolerates CRLF frontmatter (`scripts/lib/example-notes.mjs:14`) — **minimal regex fix, no gray-matter dep** (keep the launcher scripts lean / bare-node) _(2026-07-16)_
    - [x] RED: add failing test in `scripts/lib/example-notes.test.mjs` — `isExampleNote(fmExemple.replace(/\n/g, "\r\n"))` must be `true` (current fixtures are all LF, so they never caught it) _(saw `false !== true`)_
    - [x] GREEN: regex `/^---\n.../` → `/^---\r?\n([\s\S]*?)\r?\n---/` (inner `tags:` capture already stops at `]`, unaffected)
    - [x] Refactor + suite green (`node --test scripts/lib/example-notes.test.mjs` → 8/8) — refactor: RAS
  - [x] B2 — entrypoint guard via `pathToFileURL` (`scripts/clear-example-notes.mjs:72`) _(2026-07-16)_
    - [x] Extract a pure predicate `isEntrypoint(metaUrl, argv1)` → new `scripts/lib/entrypoint.mjs`; call site becomes `if (isEntrypoint(import.meta.url, process.argv[1]))` _(behavior-preserving extraction: 561/561 still green)_
    - [x] RED: cross-platform demonstrator — `isEntrypoint` is `false` for a path with a **space** (`/Users/John Doe/…`), because `file://${argv1}` keeps the literal space while `import.meta.url` is `%20`-encoded (same failure class as Windows backslashes/drive letter, no Windows needed) _(saw `false !== true`)_
    - [x] GREEN: `import { pathToFileURL } from "node:url"` → `metaUrl === pathToFileURL(argv1).href` _(entrypoint 3/3, full scripts suite 564/564)_
    - [x] Refactor + green — refactor: RAS (one-line predicate)
  - [x] Verify the combo end-to-end intent (B2 masked B3): with both fixed, running the script on a **CRLF** temp vault deletes the `exemple`-tagged note and keeps the `harness` note _(2026-07-16 · proven by hand: `🗑️ removed demo.md`, harness preserved, exit 0)_
- [x] **Step 2 — 🟠 Hardened-Windows install: explicit relative `.\` invocation** _(2026-07-16)_
  - [x] B1 — `buildRagInstallInvocation()` (`scripts/lib/rag-launcher.mjs:177`)
    - [x] RED: corrected the existing win32 test's expectation from the bare name to the path-qualified `.\\sbg-rag-install.cmd` (the old assertion encoded the bug) → saw deep-equal mismatch
    - [x] GREEN: `args: ["/c", name]` → `args: ["/c", `.\\${name}`]`
    - [x] Refactor + green (rag-launcher 21/21; full scripts suite 564/564); aligned the function doc-comment. Siblings (lines 130/228 `local-mirror\\launch.cmd`, `rag\\launch.cmd`) carry a separator → NOT affected, left untouched
- [ ] **Step 3 — Sibling-pattern sweep (the report explicitly asks for it)**
  - [x] Grep the repo for other `file://${process.argv[1]}` entrypoint guards _(2026-06-25 · NONE found outside `clear-example-notes.mjs` — B2 is contained)_
  - [x] Check whether the RAG engine's frontmatter parser shares the LF assumption _(2026-06-25 · NO — `rag/src/lib/frontmatter-parser.ts` uses the `gray-matter` lib, which handles CRLF; the LF bug is confined to the hand-rolled regex in `scripts/lib/example-notes.mjs`. Engine retrieval on CRLF vaults is NOT degraded.)_
  - [x] Grep for other bare-relative `cmd /c <name>` invocations that rely on implicit cwd search → qualify with `.\` (or absolute) _(2026-07-16 · swept `"/c"` across `scripts/` + `installer.mjs`: siblings 130/228 carry a separator = safe; `installer.mjs:553` uses `join(TARGET, …)` = absolute + separator = safe. The ONLY separator-less bare name was B1's, now fixed.)_
  - [x] For any remaining hit: add/extend a regression test before fixing (baby-steps) _(none remaining → no extra test needed)_
- [x] **Step 4 — Wrap up** _(2026-07-16)_
  - [x] Full engine + scripts test suites green (engine 329/329, scripts 564/564); `rag/` NOT touched → no `tsc` run needed
  - [x] Release **v3.4.1** (standalone patch) — version is tag-driven (no root `package.json`/CHANGELOG in this repo); tag + GitHub release with a "The One With…" codename at merge
  - [x] PR off `main`, English title + body; pre-flight English-artifact ritual
  - [x] On ship: `git mv` this plan to `archived/` with a ✅ STATUS + proof _(no plans README exists → nothing to update)_

## Notes / open questions

- [x] Decide whether this is a patch release (v3.4.1) on its own or bundled — _(2026-07-16 · Thomas: standalone **v3.4.1**)_
- [ ] The report's "staging/move dance" (§ at the bottom) is **environmental, NOT a generator bug** — do not act on it.
- [ ] Keep the colleague's regression-test names/intent; they pinpoint exactly why LF fixtures missed B3.
