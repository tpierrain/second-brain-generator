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
- [ ] **Lot 7** — Demo vault (localized) + demo canary
- [ ] **Lot 8** — Maintainer internal
- [ ] **Lot 9** — Final (full suite, E2E per language, residual grep, PR)

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
