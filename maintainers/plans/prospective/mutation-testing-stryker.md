<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔭 PROSPECTIVE (created 2026-06-21, refreshed 2026-06-23) — a          -->
<!-- test-quality investment, not a release blocker. Scope re-pointed at the        -->
<!-- post-v3.4.0 engine; global audit across the three packages (Thomas, 2026-06-23).-->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Mutation testing (Stryker) — global audit of the engine's three packages

## Why (the WHAT)

One root cause of the "everything you ship feels degraded" episode was that **test quality was never
objectified** — we asserted the tests were good instead of measuring it (cf.
`degraded-quality-root-causes-context-loss-and-test-quality`). Mutation testing flips that: it mutates
the production code and checks the suite actually catches the mutation. **Surviving mutants = gaps to
harden.** The mutation score becomes the durable, measurable test-quality signal we lacked.

Decision (Thomas, 2026-06-23): **global audit across all three engine packages**, not one-at-a-time.

## The terrain (as of v3.4.0 — what shapes the approach)

All three packages run on **Node's built-in test runner** (`node --test`), via `tsx` for the TS ones:

| Package | Lang | Test command (today) | ~test files |
|---|---|---|---|
| `scripts/**` (+ `scripts/lib/**`) | `.mjs` (no `package.json`) | `node --test "scripts/*.test.mjs" "scripts/lib/*.test.mjs"` (see `.github/workflows/ci.yml:43`) | 77 |
| `rag/src/**` | TS / ESM | `node --import tsx --test src/lib/*.test.ts` (`rag/package.json`) | 24 |
| `local-mirror/src/**` | TS / ESM | `node --import tsx --test src/**/*.test.ts` (`local-mirror/package.json`) | 23 |

There **is** a CI (`.github/workflows/ci.yml`) — so a mutation job *could* be wired, but see cadence below.

### ⚠️ The hard constraint — no StrykerJS runner for `node:test`

StrykerJS ships official runners for **Jest / Mocha / Vitest / Jasmine / Karma**, **not** for the
built-in `node --test`. Two realistic paths, in tension:

- **A — Stryker `command` runner (recommended, lowest friction).** `testRunner: "command"` just runs
  the package's existing test command and judges on **exit code**. Pros: zero test-framework migration,
  uses the suites we already trust. Cons: **no per-test granularity** (Stryker can't map a mutant to the
  single test that should kill it), so **slower** (every surviving mutant re-runs the whole suite) and no
  per-test reporting. Acceptable for a **periodic audit**; document the speed trade-off.
- **B — migrate the suites to Vitest** to unlock the native runner (incremental, per-test killing,
  faster). Pros: first-class Stryker support, better DX. Cons: a real **migration cost** across ~124 test
  files and three packages — disproportionate **just** to enable mutation testing. Defer unless A proves
  too slow to live with, and treat it as its own plan.

> Lean A first (deterministic, no migration — ADR 0009 spirit). Only escalate to B if the command-runner
> audit is unworkably slow.

### Other setup notes

- `scripts/**` has **no `package.json`** → Stryker needs a config + a place to run. Either add a minimal
  `package.json` at the repo root (or under `scripts/`) carrying a `test` script + the Stryker config, or
  point a root-level `stryker.config.mjs` at the `scripts` globs via the command runner. Keep the launcher
  read-only ethos in mind — config is a dev artifact, fine to add.
- TS packages already run through `tsx`; the command runner re-uses that, so **no separate transpile**
  step for Stryker is needed.
- Stryker requires a **green suite and a clean dry-run** before it mutates. Establish the green baseline
  per package first (Step 0).

## Tracking

- [x] **Step 0 — Green baseline.** Run each package's suite, confirm all green (harness / rag /
  local-mirror) and record the counts. Mutation testing is meaningless on a red or flaky suite.
  _(2026-06-23 · uncommitted)_ — all green: `scripts/**` **513** pass, `rag/src/**` **209** pass,
  `local-mirror/src/**` **87** pass = **809 tests**, 0 fail / 0 skip / 0 todo.
- [x] **Step 1 — Pick the path & wire Stryker (path A, command runner).** _(2026-06-23 · uncommitted)_
  - [x] Add `@stryker-mutator/core` as a dev dependency. **Decision: in a dedicated dev-only workspace
    `maintainers/mutation/` — NOT in `rag/` or `local-mirror/` `package.json`.** Why: the brain runs a
    plain `npm install` (not `--omit=dev`) in `rag/`+`local-mirror/`, so any devDep there would leak
    ~128 packages into every generated brain. `maintainers/` is excluded from the brain copy
    (`scripts/lib/tracked-files.mjs`) → nothing leaks.
  - [x] Author `stryker.config.mjs` per package (3 configs under `maintainers/mutation/`): `testRunner:
    "command"`, the package's exact `node --test …` command, `mutate` globs scoped to **prod** code only
    (`!*.test.*`, and `!local-mirror/src/test/**` the Builder). **`inPlace: true`** — Stryker has no
    native `node:test` runner *and* the command-runner sandbox-copy breaks on (a) cross-package reads
    (e.g. `engine-version.test.ts` reads the repo-root `engine-manifest.json`) and (b) the `better-sqlite3`
    native module. `inPlace` mutates the real files and **restores them after** (verified git-clean;
    git-tracked → trivially recoverable even on SIGKILL).
  - [x] Resolve the `scripts/**` no-`package.json` question. **Decision: run Stryker from the REPO ROOT**
    (cwd) — Stryker only mutates files under its project root, so root-cwd covers all three packages with
    root-relative `mutate` globs. The `scripts/**` command is the exact CI command; no `package.json`
    needed there. Invocation lives in `maintainers/mutation/package.json` scripts (`cd ../..` then the
    locally-installed Stryker bin) — `npm --prefix maintainers/mutation run mutate:{rag,local-mirror,scripts,all}`.
  - [x] Dry-run on a small slice (`rag/src/lib/chunker.ts`). **Validated**: harness works, files restored.
    **Cost finding (drove the scope decision):** full-package-suite per mutant is **~12× slower** than the
    module's own test (chunker: 85 mutants in **33 s** full-suite vs **2.7 s** module-only) — but identical
    score (27 %), so faithful scope chosen (Thomas, 2026-06-23). ⚠️ `scripts/**` re-runs **513 tests/mutant**
    → expect the slowest run by far.
- [x] **Step 2 — Run the global audit** across `scripts/**`, `rag/src/**`, `local-mirror/src/**`.
  Capture the **mutation score** per package as the baseline test-quality signal. _(2026-06-23 ·
  uncommitted; full breakdown + worst-files in [`RESULTS.md`](../../mutation/RESULTS.md))_
  - **scripts 97.27 %** (102 survived / 3735) — `lib/**` 100 %; only `clear-example-notes` 28.6 %,
    `auto-push` 41.4 %, `auto-commit` 47.5 % are weak.
  - **local-mirror 67.63 %** (225 / 695) — `server.ts` 0 %, `index.ts` 2 %, `notion-gateway` 21 %.
  - **rag 57.23 %** (606 / 1417) — `document-scanner`/`vault-watcher` 0 %, `frontmatter-parser` 12 %,
    `chunker` 27 %.
  - ⚠️ **Isolation matters**: `scripts` MUST run in a **disposable git worktree** — `inPlace` on the
    real tree let a `clear-example-notes` mutant delete the real `vault/` demo notes. rag/local-mirror
    run `inPlace` (non-destructive, files restored). Tune `concurrency`/timeout for big suites (the
    513-test scripts suite faked a 99.97 % via mass timeouts at default concurrency 13).
- [x] **Step 3 — Triage & kill surviving mutants.** _(2026-07-15)_ For each survivor, decide: add the
  missing assertion (the usual outcome), or mark it an accepted equivalent/ignored mutant with a reason.
  **TDD** the new assertions (`tdd-discipline`); green-only commits. **All three packages' enumerated
  worst-files are now hardened** (3-rag, 3-local-mirror, 3-scripts done); the optional weak-tier
  follow-ups (local-mirror `notion-transformers`/`local-mirror.ts`/`notion-url`) remain non-blocking.
  - **Attack order (Thomas, 2026-06-25): worst-first → `rag` → `local-mirror` → `scripts`.** Start with
    `rag` (lowest global score 57 %), 0 %-files first: `document-scanner`, `vault-watcher`, then
    `frontmatter-parser` (12 %), `chunker` (27 %). `rag`/`local-mirror` run `inPlace` (non-destructive);
    ⚠️ `scripts` **only** in a disposable git worktree (a `clear-example-notes` mutant deleted the real
    `vault/` during the audit).
  - [ ] **3-rag** — harden `rag/src/**` survivors.
    - [x] `document-scanner.ts` **0 % → 100 %** (24/24) — DI `readDir` port + `rootDir`, real-fs
      integration test, dropped the unreachable `.gitkeep` exclusion. _(2026-06-25 · `861fa89`)_
    - [x] `vault-watcher.ts` **0 % → 100 %** (26/26) — extracted pure `isIgnoredPath`, injected the
      watch factory, deterministic real-chokidar adapter test. _(2026-06-25 · `fd290c9`)_
    - [x] `frontmatter-parser.ts` **11.9 % → 97.6 %** (82/84) — full prefix→type table, title
      precedence, tag coercion; 2 documented equivalent mutants (heading-regex anchors masked by
      greedy `.+` + `.trim()`). _(2026-06-25 · `384e6f7`)_
    - [x] `chunker.ts` **27.1 % → 85.9 %** (73/85) — section/heading structure, `(intro)`
      default, empty-section drop, long-content `splitAtParagraphs` (blank-line collapse +
      piece trims), title trim + index order, exact packing boundary. The 12 residual
      survivors are documented equivalent mutants (effective 73/73 = 100 % on non-equivalents).
      _(2026-06-25 · `f7f5a6a`)_
    - [x] `vector-store.ts` **33.8 % → 92.47 %** (134 killed + 1 timeout / 146) — DB-injectable
      `*In` cores tested in-memory (search ranking/limit/filters, stats, list, hash, remove,
      source_url round-trip), `cosineSimilarity` pinned by an identical-vector (=1) and an
      asymmetric pair (=0.8) case, `applySchema` idempotency + out-of-band column migrations, and
      a real-fs `getDb()` singleton test (`vector-store.singleton.test.ts`) for the thin wrappers.
      The 11 residual survivors are documented equivalents: 6 in the native-ABI rebuild path
      (`ragRoot`/`rebuildBetterSqlite`, only on an ABI mismatch — invocation covered by
      `native-deps.test.ts`), `getDb`'s `if(!db)→if(true)` (harmless on a file-backed DB), and 4
      in `closeDb` (shutdown cleanup, no unit-observable contract) → effective 100 % on
      non-equivalents. _(2026-06-26)_
    - [x] `embedder.ts` **34.6 % → 81.98 %** (89 killed + 2 timeout / 111) — extracted/exported the
      pure network seams (`embedWithRetry`, `buildGeminiClient`, `shouldLogProgress`) + injectable
      `sleep` on `EmbedDeps`; pinned request shape, empty-response → `[]`, the 429 backoff cadence
      (20 s→40 s) and the once-per-50 heartbeat. The 20 survivors are all documented equivalents /
      integration-only glue (real Gemini/quota wiring, real-timer `sleep`, cosmetic `console.error`
      text, the unreachable post-loop `return []`, and `selectEmbedder`'s baseURL/apiKey defaults
      landing in a private field observed only through an injected fetch it does not wire) → effective
      91/91 = 100 % on non-equivalents. Also tuned `stryker.rag.config.mjs` (concurrency 4 / timeout)
      to kill the false-timeout bogus-100 % trap — see RESULTS.md. _(2026-07-15 · `5502322`)_
    - [x] `index-manager.ts` **39.44 % → 94.87 %** (74 killed / 0 timeout / 4 survived) — Option B
      (minimal extraction + injection, "test the glue too"), TDD baby-steps. The 4 residual survivors
      are documented equivalents: the `defaultStorePorts` default wiring to the real fs/DB (only
      exercised in a real reindex) — effective 74/74 = 100 % on non-equivalents. _(2026-07-15 · `b950d6b`)_
      - [x] Extract + export pure `shouldSkip(force, existingHash, hash)` (= `!force && existingHash
        === hash`); truth-table test → killed the L121 incremental cluster.
      - [x] Export `classifyWall(errors)`; tested the local-cap-over-429 **priority** (both walls
        present) + a non-matching / empty error → `null`.
      - [x] Export `sha256(content)`; pinned with the NIST `"abc"` SHA-256 vector.
      - [x] Added injectable `ReindexStorePorts` (scan, readFile, getDocumentHash, removeDeletedDocs,
        currentIndexSchemaVersion, currentIndexIdentity, stampIndexIdentity, indexDocument) on
        `runReindex`, threaded from `reindex` via `ReindexOptions.ports`, defaulted to the real module
        fns. TDD'd the **unlocked path** with fakes: happy path (scan/index/prune, identity stamp,
        `lock.release()`, INJECTED embedder used, chunk materialisation, reporter meta), incremental
        skip, read-error push, `shouldStamp` gating (stamp vs no-stamp on force), source_url wiring,
        default-force omitted.
      - [x] Re-ran `mutate:rag -- --mutate rag/src/lib/index-manager.ts`, documented residual
        equivalents in the test header, committed green. _(2026-07-15 · `b950d6b`)_
    - [x] `config.ts` **43.33 % → 86.67 %** (26 killed / 4 survived) — composition root:
      extracted injectable `loadEnvFile(path, override, deps)` (reused by the import-time load
      + `readGeminiKey` reload), pinned the frozen path/number constants + a `resolvePath`
      truth-table + a `GEMINI_API_KEY` empty-string-safe invariant. The 4 residual survivors are
      documented equivalents (real-dotenv default dep, the unreachable key fallback when a key is
      present, the `.env` re-read closure exercised only on empty-startup onboarding) → effective
      26/26 = 100 % on non-equivalents. _(2026-07-15 · `42bda19`)_
    - **3-rag enumerated worst-files DONE** (document-scanner, vault-watcher, frontmatter-parser,
      chunker, vector-store, embedder, index-manager, config). The other `rag/src/lib/*.ts` were
      not flagged weak by the Step 2 audit; a full-`rag` re-audit (refresh RESULTS.md) is the
      natural closer before moving on.
  - [x] **3-local-mirror** — harden `local-mirror/src/**` survivors. Enumerated worst-files done +
    re-audit closer (67.63 % → 78.69 %). _(2026-07-15)_
    - [x] `server.ts` **0 % → 85.71 %** (10 killed + 2 timeout / 14) — composition root: extracted
      + exported the boot seams (`buildDeps`, `buildApi`, `boot(BootDeps)`, `fatal`) and named the
      real wiring (`createRealServer`, `createRealTransport`, `realBootDeps`) so no inline arrows
      survive; TDD'd with fakes (connect spy, log/exit spies, `instanceof` on the real factories).
      Guarded the top-level boot behind an `import.meta.url` entry-point check so importing for tests
      is side-effect-free. Also tuned `stryker.local-mirror.config.mjs` (concurrency 4 / timeout 30 s)
      to kill the false-timeout trap (bogus 87.5 % with 14/16 "timeouts" at defaults → honest 56 %
      pre-refactor). The 2 residual survivors are documented equivalents: the entry-point guard +
      its `boot(realBootDeps).catch(fatal)` body (run only when server.ts IS the process) → effective
      12/12 = 100 % on non-equivalents. _(2026-07-15)_
    - [x] `index.ts` **2.2 % → 100 %** (45/45, no equivalents) — the MCP tool surface: drove the
      REAL registered tools through an in-memory `Client`/`InMemoryTransport` pair (`mcp-tools.test.ts`),
      asserting server name/version, the 7 tool names, every tool + input-field description is non-empty,
      and each `callTool` maps its (snake_case) args to the right port method and returns the exact
      `asText` envelope. End-to-end kills names, descriptions, zod schemas, handlers and `asText`.
      _(2026-07-15)_
    - [x] `notion-gateway.ts` **21 % → 97.44 %** (38/38, 1 documented equivalent) — the real
      `@notionhq/client` adapter: exported the pagination logic behind a minimal `NotionDbClient`
      slice (data-source paging + older-shape fallback) and injected a notion-to-md factory into
      `NotionSdkGateway` so the transformer wiring (`parseChildPages`, the 3 custom transformers,
      each invoked to prove delegation), `search` arg-mapping/response and the `pageToMarkdown`
      `?? ''` fallback are all unit-testable. The 1 residual survivor is the `new Client({auth})`
      real-SDK construction (live-network-only) → effective 38/38 = 100 % on non-equivalents.
      _(2026-07-15)_
    - [x] **Full `local-mirror` re-audit (closer)** — **67.63 % → 78.69 %** (550 killed + 4 timeout /
      704 covered). Confirms the three hardened files (index 100 %, server 85.71 %, notion-gateway
      97.44 %) lifted the package. RESULTS.md refreshed with the per-file table. _(2026-07-15)_
    - **3-local-mirror enumerated worst-files DONE** (`server.ts`, `index.ts`, `notion-gateway.ts` —
      the three the Step 2 audit flagged weak).
    - [x] **3-local-mirror OPTIONAL weak tier DONE** (NOT in the Step-2 worst-first list — a follow-up
      Thomas green-lit 2026-07-15). `local-mirror` runs `inPlace` (non-destructive, files restored),
      no worktree needed; config bridled (concurrency 4). Worst-first: _(2026-07-15)_
      - [x] `notion-transformers.ts` **57.26 % → 94.87 %** (111/117, 6 documented equivalents) —
        exported the pure helpers (`notionPageUrl`, `rowTitle`, `propertyToText`, `rowFields`) and
        unit-tested each `propertyToText` switch case (rich_text/select/status/multi_select/number
        incl. 0/date with→end/url/email/phone/unsupported + empties), `rowTitle` join + fallbacks,
        `rowFields` title/empty dropping, and `linkToPageToMarkdown`'s `?? ''` id fallback + page_id
        precedence. The 6 equivalents: the three `?? []` fallbacks mutated to a string-sentinel
        array (`.map(...).join('')` → '' either way) + the redundant `.filter(type !== 'title')`
        (title's propertyToText is '' → dropped downstream anyway) → effective 100 % on
        non-equivalents. _(2026-07-15)_
      - [x] `notion-url.ts` **74.47 % → 97.87 %** (46 killed / 1 survived) — leaf URL lib:
        killed the relative-mention regex anchors (`foo/<id32>` + `/<id32>/child` untouched,
        dashed `/<uuid>` absolutized with dashes stripped), the app.notion.com guard (embedded
        fragment untouched via `^`, `http://` rewritten via `https?`), and the `extractPageId`
        throw cluster by pinning the error message. The 1 residual survivor is a documented
        equivalent (line 33 `canonical === url ? whole : …` rebuilds the identical string) →
        effective 46/46 = 100 % on non-equivalents. _(2026-07-15)_
      - [x] `local-mirror.ts` **77 % → 98.52 %** (264 killed + 2 timeout / 4 survived) — the big
        Domain Service. Exported the pure helpers (`aggregateHealth`, `aggregateStatus`,
        `aggregateReports`, `failedReport`, `maxLastEditedTime`, `rootPageIdOf`,
        `configFromRequest`, `errorMessage`) and unit-tested them directly (branches like
        `aggregateHealth`'s `unknown` verdict are unreachable via the public API); strengthened the
        `setupSource`/`healthCheck` message + per-check-detail assertions; added sync/freshness edge
        tests (unknown source, empty-perimeter-never-synced stays `ok`, NEW-vs-TRACKED write-error
        persistence, frozen watermark on partial, `sync("all")` over rejecting sources, empty remote
        not-behind); covered `removeSource` some-not-every + null-state cleanup and `configOrThrow`
        name lookup; added a `withUnreadableConfig` builder seam. The 4 residual survivors are
        documented equivalents (L110 ×2 post-upsert sync never `failed`; L388 length-0 shortcut ==
        `every([])`; L398 `>` vs `>=` on equal values) → effective 100 % on non-equivalents.
        _(2026-07-15)_
  - [x] **3-scripts** — harden `scripts/**` survivors *(disposable worktree mandatory —
    a `clear-example-notes` mutant deletes the real `vault/`; never reuse a worktree, its vault
    gets corrupted by run-1 mutants)*. Worst-first: `clear-example-notes` 28.6 %, `auto-push`
    41.4 %, `auto-commit` 47.5 % (the git/vault side-effect scripts).
    - [x] `clear-example-notes.mjs` **28.6 % → 100 %** (46/46, no equivalents) — extracted
      `main` into an injectable `runClear(argv, deps)` with a `realClearDeps` real-wiring default
      (cwd/clear/spawnSync/platform/log/error behind a port); TDD'd every branch with a
      recording fake (nothing-to-do, per-file + count report, `npm`/`npm.cmd`+shell by platform,
      spawn arg shape, reindex-failure → 1, `--no-reindex` skip) + a vault-scope test (an
      exemple-tagged note OUTSIDE `vault/` is left untouched) + direct `realClearDeps` tests
      (console forwarding, real fn identity). _(2026-07-15)_
    - [x] `auto-push.mjs` **41.4 % → 92.39 %** (85/92, 7 documented equivalents) —
      extracted the untested Stop-hook CLI seams (`buildGit(repo, execFile)`, `realSleep`,
      `runHook({git,sleep,write})`, `repoRoot(metaUrl)`, `realWrite`, `realHookDeps`) so the
      real git-runner mapping (ok / stdout+stderr on failure / null→''), the warning glue and
      the repo-root derivation are all unit-tested; rewrote the fake git to key on the FULL
      command (`args.join(" ")`) so mutating any arg string (`--get`, `@{u}..HEAD`, …) is caught,
      and mirrored real trailing-newline output to pin the `.trim()`s; added the retry-success
      path (pause is exactly 3000ms) + the autopush-gating case. The 7 equivalents are the
      redundant `.trim()` under `Number()` (Number() already trims) + the 6 mutants inside the
      `import.meta.url` entry-point guard (only run when the file IS the process) → effective
      100 % on non-equivalents. _(2026-07-15)_
    - [x] `auto-commit.mjs` **47.5 % → 98.21 %** (55/56, 1 documented equivalent) —
      extracted the top-level side-effect script into an injectable core (`buildGit`,
      `attemptCommit({git})`, `repoRoot`, `isEntryPoint`, `COMMIT_MESSAGE`); unit-tested the
      dirty/clean branches, the exact stage+commit commands (message included), the git-runner
      mapping, and `isEntryPoint`. Fixed a latent macOS symlink bug in the entry guard
      (`realpathSync` both sides — the tmpdir `/var`→`/private/var` symlink) and dropped the
      redundant `process.exit(0)` (work is synchronous → Node exits 0 on its own; NOT exiting at
      import keeps the module unit-testable under mutation, which is what kills the `isEntryPoint`
      condition mutants). Kept the subprocess integration tests — they kill the entry-body
      mutants a pure import cannot. The 1 survivor is the `if (isEntryPoint(...))→if(true)` guard
      (only matters when the file IS the process) → effective 100 % on non-equivalents.
      _(2026-07-15)_
    - **3-scripts enumerated worst-files DONE** (`clear-example-notes` 100 %, `auto-push` 92.39 %,
      `auto-commit` 98.21 %) — the only three files the Step-2 audit flagged weak. All of
      `scripts/lib/**` was already 100 %, so `scripts/**` is now fully hardened.
- [x] **Step 4 — Sustainable cadence + durable guardrails.** _(2026-06-25)_ Decided after the question
  "how do we stop badly-written tests from recurring?" — three layers, cheapest/most-deterministic first:
  - [x] **Floor guard (runs every CI test pass, free): a sibling test is mandatory.** `rag/src/lib/lib-coverage-guard.test.ts`
    fails loud if any `src/lib/*.ts` lacks its `*.test.ts` (`EXEMPT` empty by design). Catches the
    "no test at all" gap (the document-scanner/vault-watcher 0 %) instantly, no mutation run needed. _(`9d33204`)_
  - [x] **Per-change non-regression check (on demand, fast): `npm --prefix maintainers/mutation run mutate:changed [baseRef]`**
    (`mutate-changed.mjs`) mutates only the changed prod files vs `main`, grouped by package; `scripts/**`
    reported-but-skipped (needs the disposable worktree). Run it on a branch that touches `rag`/`local-mirror` logic.
  - [x] **Convention (the root cause): "test the glue too".** "Pure I/O glue, no test" is the exact
    dismissal that produced the 0 %; extract the logic behind a port and TDD it. Engraved in
    `maintainers/CONVENTIONS.md`.
  - **No per-commit blocking gate** (command-runner cost) and **no merge gate**. Periodic full audit =
    re-run `mutate:all` before a release / when test quality is in doubt, refresh [`RESULTS.md`](../../mutation/RESULTS.md).
  - **Baseline (2026-06-23, see RESULTS.md):** scripts **97.27 %**, local-mirror **67.63 %**, rag **57.23 %**
    (rag/src/lib hardening in progress under Step 3-rag).
- [ ] **Step 5 (conditional) — Escalate to Vitest (path B)** *only if* the command-runner audit is too
  slow to run regularly. Spin it off as its own migration plan; do not scope-creep it here.
- [x] **Step 6 — Retrospective: what the surviving mutants reveal about our TDD practice → durable
  rules.** _(2026-07-15)_ Read across all 14 `test(...)` hardening commits (3 parallel readers, one per
  package). **All 6 candidate clusters CONFIRMED, none refuted, + 3 new infra-shaped clusters found.**
  Rules engraved with the belt-and-suspenders split; the one cheaply-mechanical cluster (C1) got a
  deterministic lint. **Full write-up: [`../../mutation/RETROSPECTIVE.md`](../../mutation/RETROSPECTIVE.md).**
  - [x] **Gather the evidence.** 3 parallel agents diffed the test files + read the commit bodies for
    rag (8 files) / local-mirror (6) / scripts (3), classifying each added assertion/seam. _(2026-07-15)_
  - [x] **Cluster the survivor patterns** — all six confirmed by cross-package evidence:
    - [x] **C1 Loose outcome assertions** — confirmed (`notion-url` `extractPageId`, `embedder`
      `buildGeminiClient`, `setupSource`/`healthCheck` messages, exact log payloads). Least frequent but
      real wherever a throw existed.
    - [x] **C2 Partial return-shape assertions** — confirmed (`asText` envelope, `aggregateReports`
      all-counts, `failedReport`, whole request envelope, whole command list). Moderate.
    - [x] **C3 No triangulation on boundaries/operators** — confirmed, 2nd most frequent (`>`/`>=` on
      `maxLastEditedTime`/chunker packing, `&&`/`||` filters, regex `^`/`$` anchors, asymmetric cosine,
      retry off-by-last, `%50` heartbeat).
    - [x] **C4 Untested pure glue / unreachable branches** — confirmed as the **#1 score driver**
      (all 0 % files). Existing "test the glue too" convention was **too narrow** → broadened in
      CONVENTIONS.md §5bis (pure unreachable branches, top-level scripts, composition roots).
    - [x] **C5 Membership on empty/single collections** — confirmed (`removeSource`/`status`/pagination
      loop needed ≥2 unsorted elements + a decoy).
    - [x] **C6 Optional-chaining / default-arg / `??`-vs-`&&`** — confirmed as the **most frequent**
      (8/8 rag files; every `?.`/`??`/default needed its null/absent twin).
    - [x] **+ 3 NEW clusters** (not in the candidate list): CLI/script fakes keyed on the FULL command
      (arg-string mutants), composition-root/entry-guard (one integration test earns the guard back),
      LLM-facing string surfaces (names/descriptions invisible to behavioural tests).
  - [x] **Root-cause each cluster to a TDD habit** — happy-path-only inputs (C6), one-sided examples
    with no boundary triangulation (C3), asserting the value I expected not the whole contract (C2),
    bare "it threw" (C1), trivial collections (C5), and "pure glue isn't worth a test" as a design
    dismissal (C4). Tied to [[degraded-quality-root-causes-context-loss-and-test-quality]].
  - [x] **Draft durable rules** — one per confirmed cluster, each with why + how-to-apply, phrased to
    have PREVENTED the survivor. Homes (belt-and-suspenders, Thomas 2026-07-15):
    - [x] global `tdd-discipline` skill § "Qualité des assertions" — the 5 language-agnostic habits
      (C1/C2/C3/C5/C6 + reachability-as-design-smell); `rules/testing.md` points to it.
    - [x] repo-local `maintainers/CONVENTIONS.md` §5ter — the 3 infra-shaped clusters + equivalent-mutant
      literacy + the Stryker false-timeout trap; §5bis broadened for C4.
  - [x] **Engrave + record** — done in both homes (above). Memory: the durable rules now live in the
    skill + CONVENTIONS (pointers, not copies); the chantier pointer memory refreshed to reflect Step 6.
  - [x] **Lightweight guardrail (ADR 0009 spirit)** — only C1 is cheaply mechanical → built
    `scripts/lib/assert-matcher-lint.mjs` + repo-wide `*.test.mjs` guard (TDD baby-steps; fails CI loud
    on any `assert.throws/rejects` with no matcher; dev-only via `DEV_ONLY_PREFIXES`). The other clusters
    stay written rules (no cheap reliable check) — on-demand net is `mutate:changed`. _(2026-07-15)_

## Why deferred (not gating)

v3.4.0 ships with full suites green. Mutation testing **raises confidence in the tests**; it does not
change shippable behaviour. So it's a quality investment to schedule on its own, not under release
pressure. Links: [[degraded-quality-root-causes-context-loss-and-test-quality]],
[[prefer-deterministic-adr-0009]], [[validate-shipped-not-test-instance]].
