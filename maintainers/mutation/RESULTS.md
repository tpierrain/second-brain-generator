# Mutation testing — audit results (StrykerJS)

> **Dev-only.** This whole folder lives under `maintainers/` and is **excluded from the
> brain copy** (`scripts/lib/tracked-files.mjs` → `DEV_ONLY_PREFIXES` has `maintainers/`),
> so neither the tooling nor these results are ever deployed into a generated brain.
> See the plan: [`../plans/prospective/mutation-testing-stryker.md`](../plans/prospective/mutation-testing-stryker.md).
> For **what the survivors taught us** (recurring shapes → durable rules), see the
> retrospective: [`RETROSPECTIVE.md`](RETROSPECTIVE.md).

> 📈 **Sections are ordered newest-first (anti-chronological).** The top block is the current
> state; scroll down for the history back to the 2026-06-23 baseline.

## Current scores (latest)

| Package | Mutation score | As of | Detail |
|---|---|---|---|
| **rag** | **90.42 %** | 2026-07-16 (post-B2/B3) | [re-audit #2](#full-rag-re-audit-2--2026-07-16-post-b2b3-hardening) — production-only |
| **scripts** (harness) | **97.27 %** | 2026-06-23 baseline | 3 weak files since hardened to 92–100 % (no full re-audit; `lib/**` already 100 %) |
| **local-mirror** | **78.69 %** | 2026-07-15 | [re-audit](#step-3-hardening--local-mirror-re-audit--2026-07-15) |

Pinned to the release that ships the hardened tests: **v3.4.2**.

---

## Full `rag` re-audit #2 — 2026-07-16 (post-B2/B3 hardening)

**Current `rag` score: 90.42 %** (1279 killed + 5 timeout / 1420 covered, 136 survived, 0 no-coverage).
Run at `concurrency: 4` (honest timeouts). Two changes lifted it from the 82.59 % closer below:

- **B2 — stopped mutating the `fake-embedder.ts` test double** (a test helper, not production code):
  the mutate set drops from 25 → 24 files (1420 vs 1436 mutants). This is a *measurement-correctness*
  fix — the 82.59 % was scoring the wrong thing for those 6 mutants.
- **B3 — hardened the 5 weak-tier files** the earlier closer flagged: `health-check` 63.25 % → 92.31 %,
  `usage-tracker` 55.88 % → 92.65 %, `citation-renderer` 45.45 % → 100 %, `reindex-lock` 75.34 % →
  94.52 %, `status-report` 78.87 % → 100 %.

Per-file, worst-first on the **remaining** survivors (24 files, `fake-embedder` excluded):

| File | Score | Survived | Tier |
|---|---|---|---|
| `search-degradation.ts` | 71.43 % | 2 | small, never hardened |
| `reindex-scheduler.ts` | 74.19 % | 8 | never hardened |
| `index-freshness.ts` | 81.13 % | 10 | never hardened |
| `embedder.ts` | 81.98 % | 20 | **hardened — residual are documented equivalents** |
| `in-process-embedder.ts` | 82.61 % | 8 | never hardened |
| `reindex-reporter.ts` | 83.64 % | 9 | never hardened |
| `openai-compatible-embedder.ts` | 84.00 % | 4 | never hardened |
| `engine-version.ts` | 84.44 % | 7 | never hardened |
| `chunker.ts` | 85.88 % | 12 | **hardened — documented equivalents** |
| `config.ts` | 86.67 % | 4 | **hardened — documented equivalents** |
| `progress-report.ts` | 88.52 % | 7 | never hardened |
| `notify.ts` | 90.91 % | 9 | already decent |
| `health-check.ts` | 92.31 % | 9 | **hardened B3 — effective 100 % (9 documented equivalents)** |
| `vector-store.ts` | 92.47 % | 11 | **hardened — documented equivalents** |
| `usage-tracker.ts` | 92.65 % | 5 | **hardened B3 — 4 equivalents + 1 accepted gap** |
| `indexer.ts` | 94.44 % | 1 | already decent |
| `reindex-lock.ts` | 94.52 % | 4 | **hardened B3 — documented equivalents** |
| `index-manager.ts` | 94.87 % | 4 | **hardened — documented equivalents** |
| `frontmatter-parser.ts` | 97.62 % | 2 | **hardened — documented equivalents** |
| `citation-renderer.ts` | 100.00 % | 0 | **hardened B3** |
| `document-scanner.ts` | 100.00 % | 0 | hardened |
| `native-deps.ts` | 100.00 % | 0 | already 100 % |
| `status-report.ts` | 100.00 % | 0 | **hardened B3** |
| `vault-watcher.ts` | 100.00 % | 0 | hardened |

**Reading it.** Of the 136 survivors, the bulk are **documented equivalent mutants** in the already-hardened
files (embedder 20, chunker 12, vector-store 11, health-check 9, index-manager 4, config 4, reindex-lock 4,
usage-tracker 4, frontmatter-parser 2 → ~70). The rest sit in files never worst-listed (`reindex-scheduler`,
`index-freshness`, the embedder adapters, `reindex-reporter`, `engine-version`, `progress-report`, `notify`) —
a possible future **B4-style** follow-up, non-blocking. Ceiling ~96 % (documented equivalents can't be killed).

## Full `rag` re-audit (closer) — 2026-07-16 [SUPERSEDED by re-audit #2 above]

> ⚠️ **SUPERSEDED** by [re-audit #2](#full-rag-re-audit-2--2026-07-16-post-b2b3-hardening). This closer
> still mutated the `fake-embedder.ts` test double and predated the B3 weak-tier hardening. Kept for
> history — do not quote 82.59 % as the current `rag` score.

After hardening all enumerated Step-2 worst-files, a full-package re-audit lifts **`rag` from
57.23 % → 82.59 %** (1177 killed + 9 timeout / 1436 covered, 250 survived, 0 no-coverage). Run at
`concurrency: 4` (honest timeouts). Per-file, worst-first on the **remaining** survivors:

| File | Score | Survived | Tier |
|---|---|---|---|
| `citation-renderer.ts` | 45.45 % | 18 | never hardened — real gaps |
| `usage-tracker.ts` | 55.88 % | 30 | never hardened — real gaps |
| `fake-embedder.ts` | 62.50 % | 6 | test helper (arguably should be excluded from mutation) |
| `health-check.ts` | 63.25 % | 43 | never hardened — **most survivors in the package** |
| `search-degradation.ts` | 71.43 % | 2 | small |
| `reindex-scheduler.ts` | 74.19 % | 8 | never hardened |
| `reindex-lock.ts` | 75.34 % | 18 | never hardened |
| `status-report.ts` | 78.87 % | 15 | never hardened |
| `index-freshness.ts` | 81.13 % | 10 | never hardened |
| `embedder.ts` | 81.98 % | 20 | **hardened — residual are documented equivalents** |
| `in-process-embedder.ts` | 82.61 % | 8 | never hardened |
| `reindex-reporter.ts` | 83.64 % | 9 | never hardened |
| `openai-compatible-embedder.ts` | 84.00 % | 4 | never hardened |
| `engine-version.ts` | 84.44 % | 7 | never hardened |
| `progress-report.ts` | 85.25 % | 9 | never hardened |
| `chunker.ts` | 85.88 % | 12 | **hardened — documented equivalents** |
| `config.ts` | 86.67 % | 4 | **hardened — documented equivalents** |
| `notify.ts` | 90.91 % | 9 | already decent |
| `vector-store.ts` | 92.47 % | 11 | **hardened — documented equivalents** |
| `indexer.ts` | 94.44 % | 1 | already decent |
| `index-manager.ts` | 94.87 % | 4 | **hardened — documented equivalents** |
| `frontmatter-parser.ts` | 97.62 % | 2 | **hardened — documented equivalents** |
| `document-scanner.ts` | 100.00 % | 0 | hardened |
| `native-deps.ts` | 100.00 % | 0 | already 100 % |
| `vault-watcher.ts` | 100.00 % | 0 | hardened |

**Reading it.** Of the 250 survivors, ~53 are the **documented equivalent mutants** in the already-hardened
files (chunker 12, embedder 20, vector-store 11, index-manager 4, config 4, frontmatter-parser 2) — those
are unkillable by definition. The remaining ~197 sit in files the Step-2 worst-first list never flagged
(they were dwarfed by the near-0 % files at baseline). Highest-leverage next targets, worst-first:
**`health-check.ts` (43), `usage-tracker.ts` (30), `citation-renderer.ts` (18), `reindex-lock.ts` (18),
`status-report.ts` (15)** — ~124 survivors across 5 files. Hardening those alone would move the package
toward ~90-93 %; the practical ceiling is ~96 % (the equivalents can't be killed, so chasing 100 % is
chasing equivalents). *(Done — see re-audit #2 above: 90.42 %.)*

## Step 3 hardening — local-mirror re-audit — 2026-07-15

After hardening the three Step-2 worst-files, a full-package re-audit lifts **local-mirror
from 67.63 % → 78.69 %** (550 killed + 4 timeout / 704 covered, 150 survived). Per-file:

| Area | File | Before | After | Note |
|---|---|---|---|---|
| entry | `index.ts` | 2.2 % | **100 %** | in-memory Client drives the 7 tools end-to-end |
| entry | `server.ts` | 0 % | **85.71 %** | boot seams extracted; 2 equiv. = the entry-point guard |
| adapters | `notion-gateway.ts` | 21.1 % | **97.44 %** | seams injected; 1 equiv. = `new Client({auth})` |
| adapters | `notion-connector.ts` | — | 85.29 % | already decent |
| adapters | (fs-*, system-clock) | — | 81–100 % | already decent |
| domain | `local-mirror.ts` | — | **77.41 %** | 61 survivors — the big Domain Service, next tier |
| lib | `notion-transformers.ts` | 57.3 % | **94.87 %** | hardened 2026-07-15 (helpers exported + case-tested; 6 equiv.) |
| lib | `notion-url.ts` | — | 74.47 % | 12 survivors |
| lib | `fresh-env.ts` / `config.ts` | — | 62.5 % / 71.4 % | small |

Enumerated Step-2 worst-files (`server.ts`, `index.ts`, `notion-gateway.ts`) are **done**.
The remaining weak tier (`notion-transformers.ts` 57 %, `local-mirror.ts` 77 %, `notion-url.ts`
74 %) was not flagged in the Step-2 worst-first list; hardening it is optional follow-up.

## Step 3 hardening — scripts worst-files — 2026-07-15

The three git/vault side-effect scripts, hardened by extracting an injectable core
(git runner / cwd / spawn behind a port) and TDD-ing the glue. Measured per file in a
**fresh disposable worktree** (`--inPlace`) — never reused (a `clear-example-notes`
mutant deletes the worktree's `vault/`, so run-1 corrupts run-2's baseline).

| File | Before | After | Note |
|---|---|---|---|
| `clear-example-notes.mjs` | 28.6 % | **100 %** | 46/46, no equivalents — `runClear(argv, deps)` + `realClearDeps` |
| `auto-push.mjs` | 41.4 % | **92.39 %** | 85/92, 7 equiv. (redundant `.trim()` under `Number()` + the `import.meta.url` guard) |
| `auto-commit.mjs` | 47.5 % | **98.21 %** | 55/56, 1 equiv. (the `if (isEntryPoint(...))→if(true)` guard) |

`scripts/lib/**` was already 100 % → **`scripts/**` is now fully hardened**. Enumerated
Step-2 worst-files across all three packages are done (see the plan's Step 3).

## Baseline run — 2026-06-23 (engine at v3.4.0, commit `49e46a9`) [OLDEST]

> ⚠️ **SUPERSEDED for `rag` and `local-mirror`.** This is the *pre-hardening* photo. For the current
> `rag` score after the weak-tier hardening (B3), read **[Full `rag` re-audit #2 — 2026-07-16
> (post-B2/B3)](#full-rag-re-audit-2--2026-07-16-post-b2b3-hardening)** (**82.59 % → 90.42 %**,
> production-only). The earlier 57.23 % → 82.59 % closer is itself superseded (it still mutated the
> `fake-embedder` test double). For local-mirror see the re-audit above (67.63 % → 78.69 %). Do not
> quote the baseline numbers as the current state.

Faithful scope: every mutant re-runs the **whole package suite** (command runner, no
StrykerJS `node:test` runner). Scores are the durable test-quality signal the project lacked.

| Package | Mutation score | Killed | Timeout | **Survived** | Mutants | Read |
|---|---|---|---|---|---|---|
| **scripts** (harness) | **97.27 %** | 3612 | 21 | 102 | 3735 | excellent — `scripts/lib/**` is 100 % across the board |
| **local-mirror** | **67.63 %** | 458 | 12 | 225 | 695 | moderate |
| **rag** | **57.23 %** | 804 | 7 | 606 | 1417 | weakest — real gaps |

### Worst files (Step 3 hardening targets, worst-first)

**rag/src/lib**
- `document-scanner.ts` **0 %**, `vault-watcher.ts` **0 %** (I/O wirings, no unit test)
- `frontmatter-parser.ts` 11.9 %, `chunker.ts` 27.1 %
- `vector-store.ts` 33.8 %, `embedder.ts` 34.6 %, `index-manager.ts` 39.4 %, `config.ts` 40.0 %
- well covered (≥90 %): `indexer.ts`, `notify.ts`, `native-deps.ts`

**local-mirror/src**
- `server.ts` **0 %**, `index.ts` **2.2 %** (entry points, no unit test)
- `notion-gateway.ts` 21.1 %, `notion-transformers.ts` 57.3 %
- 100 %: `markdown.ts`, `reconcile.ts`, `system-clock.ts`

**scripts** — only 3 weak files (everything else, incl. all of `lib/**`, is 100 %):
- `clear-example-notes.mjs` **28.6 %** (30 survivors)
- `auto-push.mjs` **41.4 %** (51 survivors)
- `auto-commit.mjs` **47.5 %** (21 survivors)
- → all three are the git/vault **side-effect** scripts, hard to unit-test.

## How each package is run (and why)

| Package | Isolation | Why |
|---|---|---|
| rag | `inPlace` (real tree) | sandbox-copy breaks on `engine-version.test.ts` reading the repo-root `engine-manifest.json` + the `better-sqlite3` native module. Non-destructive: files restored after (verified git-clean). |
| local-mirror | `inPlace` (real tree) | same class; non-destructive. |
| scripts | **disposable git worktree** (`git worktree add /tmp/…`, run `inPlace` there) | ⚠️ `inPlace` on the real tree is **DESTRUCTIVE**: a `clear-example-notes` mutant deleted the real `vault/` demo notes. A worktree keeps git present (the `engine-manifest` integrity test needs it) **and** confines any deletion to `/tmp`. |

### Gotchas learned
- **Concurrency must be tuned for big suites.** The 513-test `scripts` suite at Stryker's default
  13 concurrent runners → CPU oversubscription → **mass FALSE timeouts** (a bogus 99.97 % score).
  Fixed with `concurrency: 5`, `timeoutMS: 30000`, `timeoutFactor: 4` → genuine 97.27 %.
  **`rag` hits the same trap** (the command runner re-runs the whole rag suite per mutant): hardening
  `embedder` scored a bogus **100 %** at defaults (98/111 FALSE timeouts) vs an honest **81.98 %**
  once tuned. `stryker.rag.config.mjs` now carries `concurrency: 4` / `timeoutMS: 30000` /
  `timeoutFactor: 4` — a timeout there now means a real infinite loop, not a starved runner.
- **Orphaned children.** Mutants that broke `child-cleanup` left `stub-mcp-server.mjs` fixtures
  spinning at 100 % CPU after the run. Kill leftovers: `pkill -f stub-mcp-server.mjs`.
- **Stryker only mutates files under its project root** → all configs run from the **repo root**
  (cwd), invoked via `npm --prefix maintainers/mutation run mutate:{rag,local-mirror,scripts,all}`.

## Reproduce

```bash
# from the repo root — Stryker installed only here, never in rag/ or local-mirror/ package.json
npm --prefix maintainers/mutation run mutate:rag
npm --prefix maintainers/mutation run mutate:local-mirror
# scripts: run inside a disposable worktree (destructive otherwise)
git worktree add -d /tmp/sbg-mut-scripts
( cd /tmp/sbg-mut-scripts && node "$PWD/../../<repo>/maintainers/mutation/node_modules/@stryker-mutator/core/bin/stryker.js" \
    run "<repo>/maintainers/mutation/stryker.scripts.config.mjs" --inPlace --tempDirName .stryker-tmp )
git worktree remove /tmp/sbg-mut-scripts --force
```

Generated HTML reports + run logs land under `reports/` (git-ignored).
