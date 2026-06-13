# Plan — Translate the remaining French to English (international OSS)

> **STATUS: ✅ DONE** (created 2026-06-12, completed 2026-06-13). Lot 1 ✅ (`fbd70ba`), Lot 2 ✅
> (`e6e1801`), Lot 3 ✅ (nothing to translate — all residual FR is intentional records/keeps). The
> repo's remaining accented strings are now 100% accounted for as documented intentional keeps
> (loanword `à la carte`, `--lang français` alias, demo proper nouns, the `fr`-locale demo/stopwords).
> Thomas decision (scope question): **"Everything, including archived plans"** — translate ALL
> remaining French prose in the repo, **preserving quoted French** (real commit messages in
> backticks, screenshot quotes, the `starter→générateur` naming analysis which is *about* French).
> The user-facing surface (README, SETUP, CLAUDE.md.template, installer.mjs, rag engine, demo vault)
> is **already English** — what remains is comments / dev-only tools / `maintainers/**` docs.

## Tracking — checkboxes (tick from the markdown)

- [x] **Lot 1** — `.gitignore` + measure scripts (✅ SHIPPED `fbd70ba`)
- [x] **Lot 2** — active maintainer docs + coordinated anchor renames (✅ all 7 anchors repointed to the live EN headings, verified by slugger; the two FR *records* — QA-screenshot quote + real commit message — kept verbatim) _(2026-06-13)_
- [x] **Lot 3** — archived plans: **nothing to translate** — every residual FR string is an
  intentional *record* (the bodies were already EN from the earlier PR #2 effort). Verified file by
  file: French commit-message suggestions in backticks, demo proper-noun slugs, the `--lang français`
  alias, the naming-analysis of "générateur", Thomas's quoted `"A pour l'instant"` decision, and the
  documented "FR-to-keep" list — all kept verbatim by design. _(2026-06-13)_
- [x] **On completion** — STATUS ✅ + `git mv` to `plans/archived/` + refresh README _(2026-06-13)_

## Hard guardrails (the project is in heavy active use — ZERO regression)

- **Docs / comments / log strings only.** NEVER touch functional code, identifiers, control flow,
  ignore patterns, or template substitution tokens (`{{...}}`).
- **`maintainers/**` is never shipped** to a generated brain (excluded in `tracked-files.mjs`) and
  never auto-loaded → translating it has **zero functional impact**. Same for `rag/scripts/measure-*`.
- **Show the diff of every file** so Thomas can review for regressions before commit. Commit per lot.
- Verify after each lot:
  `git grep -nIE "[éèàçêâîôûùœ]" -- ':!templates/fr/**' ':!**/node_modules/**' ':!rag/dist/**'`
  then triage against the intentional-keeps list below.

## Intentional keeps — do NOT translate

- **`templates/fr/**`** — the French locale overlay of the generated brain (French *by design*).
- **`à la carte`** — loanword, common in English (README, DEVELOPING, EN-QUOI…, SETUP).
- **`français`** — the literal value of `--lang` (installer.mjs default, SETUP examples).
- **Proper nouns of the demo**: `Pélagie de Mollecuisse`, `Trophée de l'Inertie`, `Flemmr`,
  `jean-kevin-de-la-glandee` (and other demo people).
- **`/already up to date|déjà à jour/i`** — regex matching git output in BOTH locales
  (`scripts/lib/repo-status.mjs`, `scripts/session-status.mjs`). Bilingual on purpose.
- **The `fr:` demo question** in `scripts/lib/demo.mjs` + the **FR stopwords** in
  `scripts/lib/demo.test.mjs` (test infra for the `fr` locale).
- **Links to the FR Medium articles** in `README.md`.

## Lot 1 — ✅ SHIPPED (`fbd70ba`)

- [x] `.gitignore` (comments only, ignore patterns proven byte-identical)
- [x] `rag/scripts/measure-batch.mts` (comments + log strings)
- [x] `rag/scripts/measure-contention.mts` (comments + log strings + fake test corpus)

Residual FR in these = 0.

## Lot 2 — Active maintainer docs + coordinated anchor renames  ✅ SHIPPED _(2026-06-13)_

⚠️ **Anchor coupling:** several files link to **French section headings** via `#anchor`. Renaming a
heading **breaks its anchor** → must update every referencing link **in the same change**. Known
French heading anchors to rename + their referrers:

- [x] `maintainers/eval-set.md` — line 9 link repointed `#étape-4--brancher-le-local…` →
  `#step-4--wire-up-local--measure-vs-gemini-` (body was already EN). _(2026-06-13)_
- [x] `maintainers/plans/rag-embedder-plan-action.md` — 5 dangling anchor **links** repointed
  (lines 40, 65, 73, 102, 270) to the live eval-set.md `#step-4…` / `#step-4-bis…` / `#step-4-ter…`
  and ADR 0007 `#addendum-d1-…-default-embedder-at-install-settled`; body already EN. _(2026-06-13)_
- [x] `maintainers/decisions/0007-three-embedder-adapters-privacy-scale.md` — addendum heading was
  **already English** (`## Addendum D1 … default embedder at install: SETTLED`); only its inbound
  referrers (above) were stale → fixed. Nothing to translate in the file. _(2026-06-13)_
- [x] `maintainers/plans/etude-rag-local-criteres-et-veille.md` — line 217 link repointed to
  `#step-4--measured-results-local-vs-gemini-2026-06-09`; no other FR prose. _(2026-06-13)_
- [x] `maintainers/plans/auto-open-env-gemini.md` — line 25 is a **field-evidence QA quote** (what
  the user typed + what Claude replied, in TextEdit) → **kept verbatim as a record** (already italic).
  _(2026-06-13)_
- [x] `maintainers/retrospectives/takeaways-embedder-partage-2026-06-09.md` — the only FR is the
  **real commit message** `feat(rag): embedder partagé (createEmbedder mémoïsé)` (commit `2c2994d`,
  in backticks) → **kept verbatim as a record**. _(2026-06-13)_

**Verification:** the 7 repointed anchors were checked against the actual headings with a
github-slugger reproduction — **all resolve** (they were dangling on French slugs before). Re-grep
for `#étape|#étude|défaut-dembedder` returns only this plan file (its own task descriptions).

## Lot 3 — Archived plans (prose translated, quoted French preserved)  ✅ SHIPPED _(2026-06-13)_

**Outcome: nothing to translate.** The explanatory prose in every archived plan was already English
(translated during the earlier PR #2 effort). The only residual FR is exactly the *records* the rule
of thumb says to keep verbatim (real commit messages, CLI invocations actually run, screenshot/decision
quotes, the analysis of a French word). Triaged file by file:

- [x] `launcher-vs-brain.md` — the `starter→générateur` **naming analysis**: French words *under
  analysis* + quoted file contents → **kept** (translating them would destroy the analysis).
- [x] `translate-to-english-PROGRESS.md` — the documented "intentional FR to keep" list + proper-noun
  slugs → **kept** (it literally enumerates the strings to preserve).
- [x] `translate-to-english.md` — loanword `à-la-carte` + demo proper nouns/slugs → **kept**.
- [x] `claude-driven-install.md` — `--lang français` / `language: "français"` alias examples → **kept**.
- [x] `harden-run-node-smoke-and-coverage.md` — **French commit-message suggestions** in backticks
  (records) → **kept verbatim**.
- [x] `fix-hooks-node-nvm.md` — same (French commit-message suggestions in backticks) → **kept**.
- [x] `inprocess-en-canary-fix.md` — only `Pélagie de Mollecuisse` / `jean-kevin-de-la-glandee`
  proper nouns (the canary) → **kept**.
- [x] `install-ux-feedback.md` — `à la carte` anchor + Thomas's quoted decision `"A pour l'instant"`
  (a record) → **kept**.

Already clean (0, nothing to do): `embedder-spi.md`, `onglet-code-desktop.md`, `rename-bootstrap-to-installer.md`.

## On completion

Per the repo convention ([[plan-done-equals-archived]] / `maintainers/README.md` "Definition of
done = archived"): set this plan's STATUS to ✅ and `git mv` it into `plans/archived/`, and refresh
the README's plan list.
