# Mutation testing — audit results (StrykerJS)

> **Dev-only.** This whole folder lives under `maintainers/` and is **excluded from the
> brain copy** (`scripts/lib/tracked-files.mjs` → `DEV_ONLY_PREFIXES` has `maintainers/`),
> so neither the tooling nor these results are ever deployed into a generated brain.
> See the plan: [`../plans/prospective/mutation-testing-stryker.md`](../plans/prospective/mutation-testing-stryker.md).
> For **what the survivors taught us** (recurring shapes → durable rules), see the
> retrospective: [`RETROSPECTIVE.md`](RETROSPECTIVE.md).

## Baseline run — 2026-06-23 (engine at v3.4.0, commit `49e46a9`)

> ⚠️ **SUPERSEDED for `rag` and `local-mirror`.** This is the *pre-hardening* photo. For the current
> package scores after Step 3, read **[Full `rag` re-audit — 2026-07-16](#full-rag-re-audit-closer--2026-07-16)**
> (**57.23 % → 82.59 %**) and the local-mirror re-audit below (67.63 % → 78.69 %). Do not quote the
> baseline numbers as the current state.

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

## Full `rag` re-audit (closer) — 2026-07-16

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
chasing equivalents).

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
