# Plan — Translate the remaining French to English (international OSS)

> **STATUS: 🚧 IN PROGRESS** (created 2026-06-12). Lot 1 ✅ SHIPPED (`fbd70ba`). Lots 2 & 3 pending.
> Thomas decision (scope question): **"Everything, including archived plans"** — translate ALL
> remaining French prose in the repo, **preserving quoted French** (real commit messages in
> backticks, screenshot quotes, the `starter→générateur` naming analysis which is *about* French).
> The user-facing surface (README, SETUP, CLAUDE.md.template, installer.mjs, rag engine, demo vault)
> is **already English** — what remains is comments / dev-only tools / `maintainers/**` docs.

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

`.gitignore` (comments only, patterns proven byte-identical), `rag/scripts/measure-batch.mts`,
`rag/scripts/measure-contention.mts` (comments + log strings + fake test corpus). Residual FR = 0.

## Lot 2 — Active maintainer docs + coordinated anchor renames  ⬜ TODO

⚠️ **Anchor coupling:** several files link to **French section headings** via `#anchor`. Renaming a
heading **breaks its anchor** → must update every referencing link **in the same change**. Known
French heading anchors to rename + their referrers:

- `maintainers/eval-set.md` — French headings `#étape-4--résultats-mesurés-local-vs-gemini-2026-06-09`,
  `#étape-4-bis--viabilité-de-lin-process--gemma-inside--sans-ollama-2026-06-09`,
  `#étape-4-ter--corpus-dense--plafonnement-de-lot-2026-06-09` + French prose.
- `maintainers/plans/rag-embedder-plan-action.md` — its OWN French heading
  `#étape-4--brancher-le-local--mesurer-vs-gemini-` (referenced from eval-set.md:9) + the anchor links
  at lines ~40, 65, 73, 102, 270 (to eval-set.md and ADR 0007).
- `maintainers/decisions/0007-three-embedder-adapters-privacy-scale.md` — heading
  `#addendum-d1-2026-06-09--défaut-dembedder-à-linstallation--tranché` (referenced from the action plan).
- `maintainers/plans/etude-rag-local-criteres-et-veille.md` — line 217 anchor link + any FR prose.
- `maintainers/plans/auto-open-env-gemini.md` — line ~25 is a **quoted French screenshot** ("C'est
  ouvert — …") → **preserve as a quote** (or gloss in English), don't silently rewrite.
- `maintainers/retrospectives/takeaways-embedder-partage-2026-06-09.md` — FR prose.

**Method:** translate the headings, then `git grep -n "#étape\|#addendum-d1\|#étude"` and update ALL
referrers; re-grep to confirm no dangling French anchors remain.

## Lot 3 — Archived plans (prose translated, quoted French preserved)  ⬜ TODO

Files with FR (line counts at creation): `launcher-vs-brain.md` (8 — contains the
`starter→générateur` **naming analysis**, inherently about French → keep the French *words under
analysis*), `translate-to-english-PROGRESS.md` (8 — partly the documented "intentional FR to keep"
list), `translate-to-english.md` (4), `claude-driven-install.md` (3 — French `--lang français`
examples + `--context` notes), `harden-run-node-smoke-and-coverage.md` (3 — **French commit-message
suggestions** in backticks → keep verbatim, they're records), `fix-hooks-node-nvm.md` (2 — same),
`inprocess-en-canary-fix.md` (3), `install-ux-feedback.md` (1). `embedder-spi.md`,
`onglet-code-desktop.md`, `rename-bootstrap-to-installer.md` = already clean (0).

Rule of thumb: **translate explanatory prose**, **keep verbatim** anything that is a *record* (real
commit messages, CLI invocations actually run, screenshot quotes, the analysis of a French word).

## On completion

Per the repo convention ([[plan-done-equals-archived]] / `maintainers/README.md` "Definition of
done = archived"): set this plan's STATUS to ✅ and `git mv` it into `plans/archived/`, and refresh
the README's plan list.ir
