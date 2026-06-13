<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: ✅ DELIVERED 2026-06-10 — Lots 0-9 done (translation + E2E verified). -->
<!-- Outward-facing release ceremony (PR / GitHub About / V2 tag) pending user OK. -->
<!-- (created 2026-06-04; original inventory stale — see §0bis.)                 -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — Translate the generator into English (FR → EN)

> **STATUS: ✅ DELIVERED 2026-06-10** (created 2026-06-04 after the `V1` tag on `200f035`;
> reassessed 2026-06-10; **Lots 0-9 delivered** — full FR→EN translation + per-language E2E
> verified. Only the outward-facing release ceremony (PR, GitHub "About", `V2` tag) is pending
> the maintainer's go-ahead).
> Self-contained plan: a fresh Claude session must be able to execute it reading ONLY this
> file + the cited files. **TDD** discipline (skill `tdd-discipline`), **manual** conventional
> commits + co-author Claude.

---

## 0. Decisions made (the "what" and the "why")

Validated with Thomas on 2026-06-04, **completed on 2026-06-10**:

1. **The GENERATOR switches to English — mandatory.** Everything that describes/runs the generator
   is in **English only**: README, SETUP, CONNECTORS, DEVELOPING, `EN-QUOI-C-EST-DIFFERENT`,
   `maintainers/`, code comments & messages, ADRs, **the GitHub description ("About")**,
   **and the new commits**. Goal: **publish the repo publicly** for an international audience.
   The FR of those files disappears (recoverable via git history + the `V1` tag).

2. **GENERATION becomes localized (`--lang`) — the heart of the effort.** In use, an FR user
   **as well as** an EN one must get their second brain **in THEIR preferred language**. So everything the
   generator **produces in the brain** is **parameterizable by language**, not frozen in English:
   - the **constitution** `CLAUDE.md.template`;
   - the **skills** dropped in (`.claude/skills/**/SKILL.md` + `EXAMPLES.md`);
   - the **demo vault** (the `vault/**` files shipped — see §0bis for the source correction).

   ➜ **Architectural consequence**: the existing FR **does not disappear**, it becomes the **`fr`
   locale** of the generated artifacts; we **add** an `en` locale. The `--lang` (which today drives
   the language of the notes) now also selects the language of the generated artifacts.
   Languages at launch: **`en` (default) + `fr`**, extensible mechanism. Default `en` if `--lang`
   absent/unknown.

3. **TRANSLATION scope: COMPLETE.** Meta-generator (→ EN only) **and** generated artifacts
   (→ EN + FR via locales). Nothing remains "accidentally" FR.

4. **Central principle — the TESTS stay LANGUAGE-AGNOSTIC.** It's the user of the
   **generator** who will choose the language of THEIR brain (`--lang` flag). The generator must not
   "hardcode" a language into its assertions: a test must never break because we
   translated some FR↔EN prose.
   - ✅ Assert: **structure** (frontmatter keys, file names, exit codes, element
     counts, presence of a stable marker, valid JSON, idempotence).
   - ❌ No longer assert: an exact FR or EN **sentence**, a word-for-word console message, a
     prose fragment.
   - When a test MUST verify that a text is present, do it via a **stable identifier**
     (constant/key) or an **invariant** ("contains the owner's name", "contains the vault
     path"), not via the translation itself.
   - Reference memory: `feedback-no-string-fragile-asserts`.

5. **🆕 (2026-06-10) Localization of the INSTALLER itself: ARTIFACTS ONLY.** Decided with
   Thomas:
   - **No "language selector" as a separate concept.** `--lang` remains the **single source of
     truth** of the language (notes + locale of the generated artifacts). Adding a second place where
     the language is decided would create a risk of divergence.
   - **Dominant install path = driven by Claude via the bootstrap stub** (`CLAUDE.md`): Claude gathers
     the answers **in chat** then runs `installer.mjs --non-interactive --lang "<language>"`. Since
     **Claude already speaks the user's language**, "the installation happens in the person's
     language" is **already true for free** — no selector to build. The bootstrap stub already asks for the
     "default language for the notes": it's this signal that becomes `--lang`.
   - **The installer's `console.log`s stay EN only** (no i18n catalog). Reason: the
     surface actually seen by the user is **Claude's chat**, not the raw console
     output. The value of localizing the logs is low against its cost → **out of scope**.
   - What is localized (high value, lived daily): **constitution + skills + demo
     vault**. That's what §0.2 covers.

---

## 0bis. 🆕 What CHANGED since the 2026-06-04 freeze (must be integrated)

The repo has moved a lot (the **à-la-carte RAG / D1** effort delivered). The original inventory is
stale on these points:

| Original plan (06-04) | Reality as of 06-10 |
|---|---|
| `bootstrap.mjs` | **`installer.mjs`** (renamed; ~205 lines FR) |
| `scripts/lib/bootstrap-args.mjs` | **`scripts/lib/installer-args.mjs`** |
| marker `second-brain-starter:bootstrap-stub` | **`<!-- second-brain-generator:installer-stub -->`** (read by `isInstallerStub` in `claude-md.mjs`) |
| "Star Wars" demo vault (luke-skywalker, la-force, death-star) | **"Flemmr" universe**: `vault/topics/flemmr.md`, `vault/people/jean-kevin-de-la-glandee.md`, `vault/decisions/2025-11-20-trophee-de-l-inertie.md` |
| demo generated by `example-notes.mjs` | **FALSE**: `example-notes.mjs` only **detects/deletes** notes tagged `exemple`. **Source of truth for the demo content = the versioned `vault/**` files** + `demo.mjs` (canary question + "Mollecuisse" assertion) |
| maintainer ADRs = 1 (`launcher-vs-brain`) | **`maintainers/decisions/0001→0008`** (8 decisions) |
| — | **New FR libs**: `installer-args`, `embedder-choice`, `demo`, `eval-set`, `eval-run`, `eval-judge`, `rag-launcher`, `repo-status`, `mcp-search` (+ `run-node`) |
| — | **New RAG modules**: `in-process-embedder`, `openai-compatible-embedder`, `fake-embedder`, `index-freshness`, `chunker`, `document-scanner`, `frontmatter-parser` (+ tests) |
| — | **New public FR docs**: `EN-QUOI-C-EST-DIFFERENT.md` (≈258 lines), `DEVELOPING.md` |
| — | **New maintainer FR content**: `maintainers/eval-set.md`, `retrospectives/*` (2), `benchmarks/*` (1), active `plans/` (2) + `plans/archived/` (7) |

---

## 1. Inventory to translate (refreshed 2026-06-10)

> Excluding `node_modules`, `.git`, `dist`, `.cache`.
>
> **Two regimes (cf. §0.1 vs §0.2)**:
> - 🇬🇧 **EN only** (meta-generator): public docs *other than* generated artifacts, code, ADRs,
>   maintainer internals. The FR disappears (safety net = `V1` tag).
> - 🌍 **Localized `en`+`fr`** (artifacts produced in the brain): `CLAUDE.md.template`, the
>   **skills** (§B), the **demo vault** (§E-demo). The FR becomes the **`fr` locale**.

### A. Public docs (user-facing) — 🇬🇧 EN only (except `.template`)
- [ ] `README.md` (≈37 kB, the biggest)
- [ ] `SETUP.md` (≈22 kB)
- [ ] `EN-QUOI-C-EST-DIFFERENT.md` (≈258 lines) 🆕
- [ ] `DEVELOPING.md` 🆕
- [ ] `CONNECTORS.md`
- [ ] `CLAUDE.md` (the **bootstrap stub**/installer-stub — **keep the marker**
      `<!-- second-brain-generator:installer-stub -->`, detected by `isInstallerStub` in
      `scripts/lib/claude-md.mjs`)
- [ ] `CLAUDE.md.template` (**generated** constitution → 🌍 localized `en`+`fr`, placeholders `{{…}}` intact)
- [ ] `.env.example` (comments)
- [ ] `docs/img/README.md`
- [ ] **GitHub "About" description** (`gh repo edit --description …`) → EN version 🆕

### B. Generated skills (dropped into each brain) — 🌍 localized `en`+`fr` — `.claude/skills/`
- [ ] `coach/SKILL.md`
- [ ] `improve/SKILL.md`
- [ ] `prepare-1-1/SKILL.md`  *(keep the folder name `prepare-1-1` — not a rename)*
- [ ] `sync/SKILL.md`
- [ ] `sync-sources/SKILL.md`
- [ ] `tdd-discipline/SKILL.md`
- [ ] `EXAMPLES.md`
- ⚠️ The `description:` field of the skills' frontmatter is read/displayed: translate it TOO, but
  check that no test freezes its exact value (otherwise → structural assert).

### C. Code — 🇬🇧 EN only (FR comments + console messages)
- [ ] `installer.mjs` (orchestration: **~205 lines FR**, the big code chunk) 🆕 *(formerly `bootstrap.mjs`)*
- [ ] `scripts/auto-commit.mjs`
- [ ] `scripts/lib/installer-args.mjs` 🆕 *(formerly `bootstrap-args.mjs`)*
- [ ] `scripts/lib/claude-md.mjs`
- [ ] `scripts/lib/connectors-apply.mjs`
- [ ] `scripts/lib/connectors-catalog.mjs`
- [ ] `scripts/lib/connectors-merge.mjs`
- [ ] `scripts/lib/demo.mjs` 🆕 *(canary: see §2 — proper nouns NOT to be translated)*
- [ ] `scripts/lib/embedder-choice.mjs` 🆕 *(3-embedder pedagogy — sensitive user surface)*
- [ ] `scripts/lib/eval-set.mjs`, `eval-run.mjs`, `eval-judge.mjs` 🆕
- [ ] `scripts/lib/example-notes.mjs` *(detector of `exemple` notes — see §2 on the tag)*
- [ ] `scripts/lib/gemini-key.mjs`
- [ ] `scripts/lib/mcp-search.mjs` 🆕
- [ ] `scripts/lib/mcp-smoke.mjs`
- [ ] `scripts/lib/rag-launcher.mjs` 🆕 *(~44 lines FR; also contains the `run-node` shell wrapper
      GENERATED by `buildNodeRunnerSh` — there is NO `scripts/run-node.mjs` file, only its
      test `scripts/run-node.test.mjs` exists)*
- [ ] `scripts/lib/repo-status.mjs` 🆕 *(SessionStart banner, "repo" line + fail-loud guard-rail)*
- [ ] `scripts/lib/tracked-files.mjs`
- [ ] `scripts/lib/__fixtures__/stub-mcp-server.mjs`
- [ ] `rag/src/index.ts`
- [ ] `rag/src/lib/*.ts`: `chunker`, `config`, `document-scanner`, `embedder`, `fake-embedder`,
      `frontmatter-parser`, `in-process-embedder`, `index-freshness`, `index-manager`, `indexer`,
      `openai-compatible-embedder`, `progress-report`, `reindex-lock`, `reindex-reporter`,
      `reindex-scheduler`, `search-degradation`, `status-report`, `usage-tracker`, `vault-watcher`,
      `vector-store`
- [ ] `rag/src/tools/*.ts`: `get-document`, `list-documents`, `reindex`, `search-vault`, `vault-stats`
- [ ] `rag/docs/adr/*.md`: `_template`, `0001`, `0002`, `0003`, `README` — **also rename the
      FR slugs** (`0001-atomicite-document-hash-chunks` → `0001-atomicity-…`, `0002-demarrage-mcp-non-bloquant`
      → `0002-non-blocking-mcp-startup`, `0003-pas-de-daemon-session-declencheur` → `0003-…`) + cross-links.

### D. Tests to MAKE AGNOSTIC (not just "translate") — cf. §0.4
> Refreshed list (includes the tests of the new modules). Per file: break the frozen FR assert
> → rewrite structural → green.

Harness (`scripts/`):
- [ ] `scripts/auto-commit.test.mjs`
- [ ] `scripts/run-node.test.mjs` 🆕
- [ ] `scripts/lib/installer-args.test.mjs` 🆕
- [ ] `scripts/lib/claude-md.test.mjs`
- [ ] `scripts/lib/connectors-apply.test.mjs`, `connectors-catalog.test.mjs`, `connectors-merge.test.mjs`
- [ ] `scripts/lib/demo.test.mjs` 🆕 *(locks the grep-proof canary invariant — keep the invariant, agnostic of prose)*
- [ ] `scripts/lib/embedder-choice.test.mjs` 🆕
- [ ] `scripts/lib/eval-set.test.mjs`, `eval-run.test.mjs`, `eval-judge.test.mjs` 🆕
- [ ] `scripts/lib/example-notes.test.mjs`
- [ ] `scripts/lib/gemini-key.test.mjs`
- [ ] `scripts/lib/mcp-search.test.mjs` 🆕
- [ ] `scripts/lib/mcp-smoke.test.mjs`
- [ ] `scripts/lib/rag-launcher.test.mjs` 🆕
- [ ] `scripts/lib/repo-status.test.mjs` 🆕
- [ ] `scripts/lib/tracked-files.test.mjs`

RAG (`rag/src/`):
- [ ] `config`, `embedder`, `fake-embedder` 🆕, `in-process-embedder` 🆕, `index-freshness` 🆕,
      `index-manager`, `indexer`, `openai-compatible-embedder` 🆕, `progress-report`, `reindex-lock`,
      `reindex-reporter`, `reindex-scheduler`, `search-degradation`, `status-report`, `usage-tracker`,
      `vector-store` (`.test.ts`)
- ⚠️ **Structural keys that look like FR but aren't**: the `exemple` tag (read by
  `isExampleNote`), `type: backlog`, the `vault/backlog/` folder, `harnais.md`. These are
  **identifiers consumed by the code** — decide case by case (cf. §2.2).

### E. Maintainer internals + demo
- [ ] `maintainers/README.md`
- [ ] `maintainers/decisions/0001→0008` (8 files) 🆕
- [ ] `maintainers/eval-set.md` 🆕
- [ ] `maintainers/retrospectives/*` (2) 🆕
- [ ] `maintainers/benchmarks/*` (1) 🆕
- [ ] `maintainers/plans/etude-rag-local-criteres-et-veille.md`, `rag-embedder-plan-action.md` 🆕
- [ ] `maintainers/plans/archived/*` (7 files) 🆕
- [ ] **this plan itself** (`maintainers/plans/translate-to-english.md`) → to translate last
- **Demo vault ("Flemmr" universe, 🌍 localized `en`+`fr`)** — source of truth = versioned `vault/**`
  files (`exemple` tag) + `demo.mjs` (canary):
  - [ ] `vault/README.md`
  - [ ] `vault/backlog/harnais.md`
  - [ ] `vault/backlog/perso.md`
  - [ ] `vault/daily/2026-01-15.md`
  - [ ] `vault/decisions/2025-11-20-trophee-de-l-inertie.md`
  - [ ] `vault/people/jean-kevin-de-la-glandee.md`
  - [ ] `vault/topics/flemmr.md`
  - [ ] `vault/coaching/.gitkeep` *(empty folder — nothing to translate, just preserve the structure)*
  - ⚠️ **Rename the FR slugs per locale**: `jean-kevin-de-la-glandee` → EN equivalent,
    `trophee-de-l-inertie` → `inertia-trophy`, `harnais` → `harness`, `perso` → `personal`.
    `flemmr` is an **invented proper noun** → **unchanged** in both locales (cf. §2.3).

---

## 2. Points of attention (corner-cases not to miss)

1. **Placeholders & markers NOT to translate**: `{{…}}` in the `*.template`; the marker
   **`<!-- second-brain-generator:installer-stub -->`** (otherwise `isInstallerStub` in
   `claude-md.mjs` no longer recognizes the bootstrap stub and the installer no longer replaces it);
   the skill folder names (`prepare-1-1`, `sync-sources`…).
2. **Structural frontmatter vs prose**: `type:`, `tags:`, `name:` (slugs) are **contracts**
   read by the code → translate only if we translate the reader on the other side, **together**. Concrete case:
   the **`exemple`** tag read by `isExampleNote()` (`example-notes.mjs`). **DECIDED (2026-06-10,
   Thomas): option A — we KEEP `exemple` as is**, a stable internal identifier, **not translated**
   (never displayed; avoid coupling a prose translation to a code contract).
3. **🆕 Demo canary (`demo.mjs` + Flemmr vault) — invariant to preserve across languages.**
   The 3-stage canary rests on **invented, language-neutral proper nouns**: "Flemmr",
   "Pélagie de Mollecuisse", "Trophée de l'Inertie", "TRF 98.7%". **The assertion is on the
   token `Mollecuisse`.** ➜ When localizing the vault, **translate only the surrounding prose**; keep the
   proper nouns **identical in both locales** so that `Mollecuisse` survives and the
   grep-proof invariant (the question shares no content word with the notes) holds **per
   locale**. `demo.test.mjs` locks this invariant: keep it, agnostic of prose.
4. **Console messages = user surface, but EN only (cf. §0.5)**: `installer.mjs` talks to the
   user during install. Switch them to EN, NEVER assert the exact text (§0.4).
   **No** console i18n catalog (out of scope).
5. **Conventional commits**: the history stays FR (V1 freezes the FR); the **new** commits of this
   effort in English.
6. **`--lang` drives the language of the GENERATED ARTIFACTS** (DECIDED, §0.2): `CLAUDE.md.template`,
   skills, demo vault become `en` (default) + `fr`. The current FR **becomes the `fr` locale**.
   The form of the mechanism to be designed in **Lot 0**. Default `en` if `--lang` absent/unknown.
7. **`V1` tag = safety net**: `git checkout V1` retrieves the FR.

---

## 2bis. Prerequisite — dedicated branch (NON-negotiable)

The whole effort on a **dedicated branch**, never directly on `main` (broad scope, risk
of breakage during the FR→EN transition). **After Thomas validates THIS refreshed plan**:

```bash
git switch -c chore/translate-to-english   # from main, clean and in sync
```

- One **commit per lot** (§3), green suite at each commit.
- **PR** at the end of the effort (`gh pr create`) to review the diff as a whole before merging onto `main`.

## 3. Proposed breakdown (committable lots, green suite at each lot)

> Order = from least risky (pure prose) to most risky (locale mechanism + agnostic tests).
> One lot = one commit. **Green suite mandatory before each commit.**

- [ ] **Prerequisite** — branch `chore/translate-to-english` created from `main` (§2bis).
- [ ] **Lot 0 — Locale mechanism (TDD, the technical heart)**: language selection for the artifacts.
  - [ ] (a) choose the form (`templates/<lang>/` recommended for long prose: constitution +
        skills + demo);
  - [ ] (b) wire `--lang` → locale (default `en`, fallback `en`) in `installer.mjs` via a pure
        helper **tested** (e.g. `resolveLocale`);
  - [ ] (c) **structural** tests (the chosen locale points to the right folder, fallback OK). As long as
        `en` is not populated, `fr` remains alone: don't break the existing.
- [ ] **Lot 1 — Static meta public docs (A, EN only)**: README, SETUP, `EN-QUOI-C-EST-DIFFERENT`,
      DEVELOPING, CONNECTORS, `.env.example`, `docs/img/README.md`, **+ GitHub description**. Pure
      prose, zero test impact. *Commit: `docs: translate generator docs to English`.*
- [ ] **Lot 2 — Bootstrap stub + constitution (A)**: `CLAUDE.md` (bootstrap stub → **EN only**, keep marker
      `installer-stub`); `CLAUDE.md.template` → **`en` locale** + current FR as **`fr` locale**;
      `{{…}}` preserved; `claude-md.test.mjs` made agnostic.
- [ ] **Lot 3 — Skills (B, localized)**: `en` locale of the 6 SKILL.md + EXAMPLES.md (+ frontmatter
      descriptions); current FR → `fr` locale; no test freezes the prose.
- [ ] **Lot 4 — RAG ADRs (C, EN only)**: `rag/docs/adr/*` + slug rename + cross-links.
- [ ] **Lot 5 — Script code + agnostic tests (C+D, EN only)**: `installer.mjs`, `scripts/**`
      (including the new libs `installer-args`, `embedder-choice`, `demo`, `eval-*`, `rag-launcher`,
      `repo-status`, `mcp-search`, `run-node`). Per file: translate comments/strings EN, then
      **make the test agnostic** (red→green). Sub-lots per folder if too big.
- [ ] **Lot 6 — RAG engine + agnostic tests (C+D, EN only)**: `rag/src/**` (including
      `in-process-embedder`, `openai-compatible-embedder`, `fake-embedder`, `index-freshness`,
      `chunker`, `document-scanner`, `frontmatter-parser`), per group of modules. `cd rag && npm test` green.
- [ ] **Lot 7 — Demo vault (E, localized)**: `en` locale of the `vault/**` files (Flemmr) + current
      FR → `fr` locale; **keep the proper nouns** (Flemmr, Mollecuisse, Trophée de l'Inertie)
      identical (§2.3); rename the prose slugs (`jean-kevin-de-la-glandee`, `harnais`, `perso`,
      `trophee-de-l-inertie`) **per locale**; **keep the `exemple` tag as is** (§2.2, option A);
      `demo.test.mjs` / `example-notes.test.mjs` agnostic (structure, not prose).
- [ ] **Lot 8 — Maintainer internals (E, EN only)**: `maintainers/**` (decisions 0001-0008,
      eval-set, retrospectives, benchmarks, active + archived plans), `DEVELOPING.md`, **and this plan**.
      Last (meta).
- [ ] **Lot 9 — Final**: full suite green (`node --test scripts/**/*.test.mjs scripts/*.test.mjs`
      + `cd rag && npm test` + `node --check installer.mjs` + valid JSON templates); **per-language
      E2E** (`--lang en` AND `--lang fr`); final `grep` of residual FR accents **outside the `fr`
      locale**; closing commit; `STATUS` → ✅ DELIVERED; PR; consider a `V2` tag (first publishable EN
      repo).

---

## 4. Definition of Done

- [ ] **Meta-generator 100% EN**: no more FR prose outside the `fr` locale (`grep -rE
      "é|è|à|ê|ç"` returns only the `fr/` locale + documented false positives). EN GitHub description.
- [ ] **Localized generation OK**: `--lang en` AND `--lang fr` each produce a
      **coherent and complete** brain (constitution + skills + demo in the right language). Default `en`,
      fallback `en`.
- [ ] **Canary preserved per locale**: `Mollecuisse` surfaces and the grep-proof invariant holds in
      `en` as in `fr` (`demo.test.mjs` green in both).
- [ ] **Full suite green**: harness + RAG (`cd rag && npm test`) + `node --check installer.mjs`
      + valid JSON templates.
- [ ] **No test freezes FR or EN prose**: all structural asserts (§0.4).
- [ ] **Per-language E2E** (throwaway copy): one `--lang en` run and one `--lang fr` run, bootstrap stub replaced,
      constitution in the right language, MCP smoke-test OK.
- [ ] `installer-stub` marker and `{{…}}` placeholders intact.
- [ ] `STATUS` → ✅ DELIVERED; `maintainers/README.md` entry up to date; PR merged.

---

## 5. To resume quickly (note to the next session)

> **This plan was refreshed on 2026-06-10** (up-to-date inventory, installer/installer-args/
> installer-stub renames, ADRs 0001-0008, "Flemmr" demo vault, new RAG libs/modules, decision
> "artifacts only / no selector"). It's ready to execute.
>
> **FIRST create the branch** `chore/translate-to-english` (§2bis), NEVER on `main`.
> Then: **Lot 1** (docs, pure prose = a risk-free warm-up) can start right away, but
> the **technical heart = Lot 0** (locale mechanism `--lang` → `en`/`fr`) must be done BEFORE the
> localized lots (2, 3, 7). Load the skill `tdd-discipline`.
> FR safety net = **`V1` tag** (`git checkout V1`).
> The non-negotiable principles:
> 1. **generator in EN** (publishable) but **localized generation** (`--lang` → brain in the
>    user's language, `en`+`fr` at launch);
> 2. **language-agnostic tests**;
> 3. **`--lang` = single source** of the language, **no** separate **selector**, **installer logs in EN**
>    (localization concerns the artifacts, not the console — §0.5).
