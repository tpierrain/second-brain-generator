<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- RESUMPTION NOTE for the FR→EN translation chantier. Created 2026-06-10.    -->
<!-- Read this FIRST, then translate-to-english.md (the full plan).             -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# FR→EN translation — progress & resumption note

**Branch:** `chore/translate-to-english` (never work on `main`).
**Full plan:** `maintainers/plans/translate-to-english.md`.
**Net FR (filet):** `git checkout V1`.
**Discipline:** TDD (skill `tdd-discipline`), one commit per lot, green suite before each commit.

## Green-suite commands (run before every commit)

```bash
node --check installer.mjs
node --test scripts/**/*.test.mjs scripts/*.test.mjs   # harness: 128/128 green now
cd rag && npm test                                     # RAG engine (Lot 6)
```

## 📋 Lot checklist (tick as you go)

- [x] **Lot 0** — locale mechanism (`1a0cc47`)
- [x] **Lot 1** — public docs (`4e97310`)
- [x] **Lot 2** — amorce + constitution (`84f8f2f`)
- [x] **Lot 3** — skills (`d8c6eed`)
- [x] **Lot 4** — RAG ADRs (`3a108ab`)
- [x] **Lot 5** — scripts code + tests (`619599e`)
- [x] **Lot 6** — RAG engine + agnostic tests (`2acbf7b`) ✅ suite 114/114, no residual FR in `rag/src`
- [x] **Lot 7** — Demo vault (localized) + locale-aware canary (`a1251ca`) ✅ harness 132/132, grep-proof both locales
- [x] **Lot 8** — Maintainer internal (`bbcd2cc`)
- [x] **Lot 9 (verification)** — full suite + per-language E2E + residual grep (`1d9f9a9`) ✅
- [ ] **Lot 9 (release ceremony)** — PR, GitHub "About" → EN, `V2` tag — **pending maintainer OK** (outward-facing)

## ✅ DONE (committed on the branch)

- **Lot 0 — locale mechanism** (`1a0cc47`). `scripts/lib/locale.mjs`: `resolveLocale(lang)` (en default,
  fr aliases, en fallback) + `chooseLocale(requested, available)` (requested → en → null). Installer
  overlays `templates/<locale>/**` onto the brain after the bulk copy; `templates/` excluded from copy
  (`filterCopyable`). Doc: `templates/README.md`.
- **Lot 1 — public docs** (`4e97310`). README, SETUP, EN-QUOI-C-EST-DIFFERENT, DEVELOPING, CONNECTORS,
  .env.example, docs/img/README.md → EN.
- **Lot 2 — amorce + constitution** (`84f8f2f`). `CLAUDE.md` (stub, marker kept) → EN; root
  `CLAUDE.md.template` → EN (the `en` default); FR preserved as `templates/fr/CLAUDE.md.template`.
- **Lot 3 — skills** (`d8c6eed`). `.claude/skills/**` → EN at root; FR preserved under
  `templates/fr/.claude/skills/**`. `name:` ids unchanged; coach no longer "speaks French" in en.
- **Lot 4 — RAG ADRs** (`3a108ab`). `rag/docs/adr/*` → EN + slug renames (atomicity-…, non-blocking-mcp-startup,
  no-daemon-session-trigger) + cross-links.
- **Lot 5 — scripts code + tests** (`619599e`). All `installer.mjs` + `scripts/**` comments/strings/test
  names → EN; assertions kept language-agnostic. Suite 128/128.
- **Lot 6 — RAG engine + agnostic tests** (`2acbf7b`). All `rag/src/**` (lib + tools + `index.ts`)
  comments/JSDoc/strings/log/error messages + MCP tool descriptions + test names → EN; test assertions
  synced to EN wording where they checked French strings. `tsc --noEmit` clean; `cd rag && npm test`
  114/114 green; no residual FR in `rag/src` (proper nouns excepted).
- **Lot 8 — Maintainer internal** (`bbcd2cc`). All `maintainers/**` prose → EN (ADRs 0001-0008, active +
  archived plans, eval-set.md, retrospectives, benchmarks, README, the plan itself). Numeric-prefixed
  filenames/slugs + cross-refs KEPT (decision: churn > value); commit-message strings + quoted-FR-subject
  kept. Fixed a stray `</content>` corruption at the end of ADR 0008.
- **Lot 9 — Verification** (`1d9f9a9`). Full suite green (harness 132/132, RAG 114/114, `node --check`,
  JSON templates valid). **Per-language E2E**: throwaway `--lang en` AND `--lang fr` both exit 0 — verified
  correct slugs (en: inertia-trophy/harness/personal; fr: trophee/harnais/perso), `demo-locale.mjs` marker,
  NO en-slug orphans in the fr brain, stub replaced, localized constitution + skills, MCP smoke-test OK.
  Final residual-FR content grep clean (only loanword "à la carte", links to FR Medium articles, and the
  intentional `français` alias / fr stopwords remain). **Installer fix surfaced by the E2E**: the canary
  question is now resolved to the INSTALLED locale (`DEMO_BY_LOCALE[chosenLocale]`) so an fr brain
  probes/suggests the fr question against its fr vault (was always 'en' from the launcher-root export).
  Remaining: outward-facing release ceremony (PR / GitHub About / V2 tag) — pending maintainer OK.
- **Lot 7 — Demo vault + locale-aware canary** (`a1251ca`). Root `vault/**` → EN (Flemmr), FR preserved
  verbatim under `templates/fr/vault/**`. Slugs renamed at root (`inertia-trophy`, `harness`, `personal`;
  `flemmr`/`jean-kevin-de-la-glandee` kept = proper nouns). `demo.mjs` now locale-aware via a tiny
  `demo-locale.mjs` marker (`en` at root, `fr` via overlay) + `DEMO_BY_LOCALE`; canary token `Mollecuisse`
  identical both locales. `demo.test.mjs` locks grep-proof for BOTH locales. New `locale-overlay.mjs`
  (TDD 3/3): the vault is replaced WHOLESALE on overlay (renamed slugs ⇒ no en-slug orphans in an fr brain);
  installer wired to it. SETUP/README demo prose aligned to EN vocab (Inertia Trophy, DNR, new slug).
  EN vocab is fixed by `eval-set.mjs` (already EN): Do-Nothing Rate (DNR), Inertia Trophy, Hammock as a
  Service, slogan "Do nothing. We've got it covered.". Harness suite 132/132.

## 🔑 KEY DECISIONS / refinements made during execution (carry these forward)

1. **Architecture form (refines plan §1a):** the **repo root holds the default `en` locale**;
   `templates/<locale>/` holds *additional* locales (currently only `fr`). The launcher self-tests
   against the root (its RAG config `rag/src/lib/config.ts` resolves `VAULT_DIR` to `<root>/vault`), so
   keeping the default at the root is what lets the launcher self-test without knowing about locales.
   `chooseLocale` returns `null` for `en`/unknown → keep root; the locale dir for present alternates.
2. **`demo.mjs` + `demo.test.mjs` were DEFERRED from Lot 5 to Lot 7** — the grep-proof canary
   (`DEMO_QUESTION` vs the answer cluster) is tightly coupled to the **vault language**. Translate them
   WITH the EN vault so the invariant can be validated for real (and provide a FR `DEMO_QUESTION` for the
   `fr` locale). See "Lot 7" below.
3. **Intentional FR kept** (do NOT flag in the final grep): `/déjà à jour/i` regex alternation in
   `repo-status.mjs` + `session-status.mjs` (matches French git output), the `français` alias and default
   in `locale.mjs` / `installer.mjs`, and demo proper nouns (Flemmr, Pélagie de Mollecuisse, Trophée de
   l'Inertie, Jean-Kévin de la Glandée, Mollecuisse) everywhere.
4. **`exemple` tag is a stable internal id** (read by `isExampleNote`) — kept verbatim, NOT translated
   (plan §2.2 option A).
5. **GitHub "About" description** (currently FR) → update to EN **at the very end (post-merge)** with
   `gh repo edit --description "..."`, to avoid an EN-description / FR-content-on-main mismatch.
6. **Slug-rename rule (refines Lot 7):** translated TERMS get translated slugs (`trophee-de-l-inertie`
   → `inertia-trophy`, `harnais` → `harness`, `perso` → `personal`); KEPT proper-noun slugs stay
   (`flemmr`, `jean-kevin-de-la-glandee` — the person's NAME is kept per `eval-set.mjs` canon + decision
   #3). The `people/jean-kevin-de-la-glandee` slug is therefore NOT renamed (proper noun), unlike what
   the original Lot 7 note suggested.
7. **Overlay must REPLACE the vault wholesale (refines plan §1a):** per-locale renamed slugs break the
   in-place-merge overlay (Lot 0) — a plain `cpSync` merge leaves en-slug orphans (`harness.md`, …) in an
   fr brain. `scripts/lib/locale-overlay.mjs` (`WHOLESALE_DIRS = ["vault"]`) wipes `TARGET/vault` before
   copying; other dirs (skills, constitution, `demo-locale.mjs` marker) still merge in place (same paths).
8. **Locale-aware demo (D from Lot 7 question):** `demo-locale.mjs` exports `BRAIN_LOCALE` (`en` at root,
   `fr` shipped via `templates/fr/scripts/lib/demo-locale.mjs` overlay). `demo.mjs` reads it to pick from
   `DEMO_BY_LOCALE`. No `.env`/installer plumbing: `verify-rag` (in an fr brain) and the launcher self-test
   (en root) both resolve automatically.

## 🔭 REMAINING

### Lot 7 — Demo vault (localized) + demo canary
- Root `vault/**` (Flemmr universe) → EN (the `en` default); preserve FR as `templates/fr/vault/**`.
- **Keep proper nouns identical in both locales** (Flemmr, Mollecuisse, Pélagie de Mollecuisse, Trophée
  de l'Inertie / its EN slug, etc.) so the `Mollecuisse` canary survives per locale.
- **Rename prose slugs per locale**: `jean-kevin-de-la-glandee` → EN equiv, `trophee-de-l-inertie` →
  `inertia-trophy`, `harnais` → `harness`, `perso` → `personal`. `flemmr` unchanged.
- **Keep the `exemple` tag** in the notes (do not translate it).
- **Then handle the deferred `demo.mjs` + `demo.test.mjs`:** translate `DEMO_QUESTION` to EN at root
  (grep-proof against the EN vault), keep `DEMO_EXPECT = /Mollecuisse/i`; update the test's FR `STOPWORDS`
  to EN and the `CANARI_CLUSTER` slug paths to the new EN slugs; re-validate grep-proof. Provide a FR
  `DEMO_QUESTION` for the `fr` locale (decide mechanism: locale-aware export, or keep the FR question with
  the fr vault). ALSO update `scripts/lib/example-notes.test.mjs` / eval-set references if they point at
  renamed vault slugs (e.g. `harnais.md`).
- Gate: `node --test` green (demo.test + example-notes.test) against the EN root vault.

### Lot 8 — Maintainer internal (EN unique)
`maintainers/**` (decisions 0001-0008, eval-set.md, retrospectives, benchmarks, plans active + archived),
**and the plan `translate-to-english.md` itself** (also update its stale ADR-slug refs), and **this
PROGRESS file** can be deleted at the end. Last (meta).

### Lot 9 — Final
- Full suite green: harness + `cd rag && npm test` + `node --check installer.mjs` + JSON templates valid.
- **E2E per language**: a throwaway install `--lang en` AND `--lang fr` — verify the constitution, skills
  and demo vault land in the right language; the bootstrap stub is replaced; MCP smoke-test OK; the
  `fr` overlay (`templates/fr/**`) actually applies.
- Final residual-FR grep **outside the `fr` locale**: `grep -rnE "é|è|à|ê|ç" …` excluding `templates/fr/`,
  the documented intentional keeps (decision #3 above), and proper nouns.
- Update GitHub "About" to EN (decision #5). `STATUT` → ✅ LIVRÉ in the plan. Update `maintainers/README.md`.
  Open the PR. Consider a `V2` tag.
