# Plan — Translate the remaining French to English (international OSS)

> **STATUS: 🚧 IN PROGRESS** (created 2026-06-12). Lot 1 ✅ SHIPPED (`fbd70ba`). Lots 2 & 3 pending.
> Thomas decision (scope question): **"Everything, including archived plans"** — translate ALL
> remaining French prose in the repo, **preserving quoted French** (real commit messages in
> backticks, screenshot quotes, the `starter→générateur` naming analysis which is *about* French).
> The user-facing surface (README, SETUP, CLAUDE.md.template, installer.mjs, rag engine, demo vault)
> is **already English** — what remains is comments / dev-only tools / `maintainers/**` docs.

## Tracking — checkboxes (tick from the markdown)

- [x] **Lot 1** — `.gitignore` + measure scripts (✅ SHIPPED `fbd70ba`)
- [ ] **Lot 2** — active maintainer docs + coordinated anchor renames
- [ ] **Lot 3** — archived plans (prose only, quoted French preserved)
- [ ] **On completion** — STATUS ✅ + `git mv` to `plans/archived/` + refresh README

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

## Lot 2 — Active maintainer docs + coordinated anchor renames  ⬜ TODO

⚠️ **Anchor coupling:** several files link to **French section headings** via `#anchor`. Renaming a
heading **breaks its anchor** → must update every referencing link **in the same change**. Known
French heading anchors to rename + their referrers:

- [ ] `maintainers/eval-set.md` — body already EN; only the **link** at line 9 points at a French
  anchor (`#étape-4--brancher-le-local…` in the action plan). NB: eval-set's own headings are ALREADY
  English (`## Step 4`, `## Step 4-bis`, `## Step 4-ter`) → the inbound `#étape-4…` links from other
  files are **already dangling** and must be repointed to `#step-4…` / `#step-4-bis…` / `#step-4-ter…`.
- [ ] `maintainers/plans/rag-embedder-plan-action.md` — fix the dangling anchor **links** at lines
  ~40, 65, 73, 77, 102, 270 (to eval-set.md `#step-4…` and ADR 0007 `#addendum…`); body already EN.
- [ ] `maintainers/decisions/0007-three-embedder-adapters-privacy-scale.md` — check the addendum
  heading `#addendum-d1…défaut-dembedder…` (still French?) → translate heading + repoint its referrers.
- [ ] `maintainers/plans/etude-rag-local-criteres-et-veille.md` — line 217 anchor link + any FR prose.
- [ ] `maintainers/plans/auto-open-env-gemini.md` — line ~25 is a **quoted French screenshot** ("C'est
  ouvert — …") → **preserve as a quote** (or gloss in English), don't silently rewrite.
- [ ] `maintainers/retrospectives/takeaways-embedder-partage-2026-06-09.md` — FR prose.

**Method:** translate the headings, then `git grep -n "#étape\|#addendum-d1\|#étude"` and update ALL
referrers; re-grep to confirm no dangling French anchors remain.

## Lot 3 — Archived plans (prose translated, quoted French preserved)  ⬜ TODO

Files with FR (line counts at creation). **Rule of thumb: translate explanatory prose, keep verbatim
any *record*** (real commit messages, CLI invocations actually run, screenshot quotes, the analysis
of a French word):

- [ ] `launcher-vs-brain.md` (8 — contains the `starter→générateur` **naming analysis**, inherently
  about French → keep the French *words under analysis*)
- [ ] `translate-to-english-PROGRESS.md` (8 — partly the documented "intentional FR to keep" list)
- [ ] `translate-to-english.md` (4)
- [ ] `claude-driven-install.md` (3 — French `--lang français` examples + `--context` notes)
- [ ] `harden-run-node-smoke-and-coverage.md` (3 — **French commit-message suggestions** in backticks
  → keep verbatim, they're records)
- [ ] `fix-hooks-node-nvm.md` (2 — same)
- [ ] `inprocess-en-canary-fix.md` (3)
- [ ] `install-ux-feedback.md` (1)

Already clean (0, nothing to do): `embedder-spi.md`, `onglet-code-desktop.md`, `rename-bootstrap-to-installer.md`.

## On completion

Per the repo convention ([[plan-done-equals-archived]] / `maintainers/README.md` "Definition of
done = archived"): set this plan's STATUS to ✅ and `git mv` it into `plans/archived/`, and refresh
the README's plan list.
