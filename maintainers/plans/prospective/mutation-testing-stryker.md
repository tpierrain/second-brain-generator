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

- [ ] **Step 0 — Green baseline.** Run each package's suite, confirm all green (harness / rag /
  local-mirror) and record the counts. Mutation testing is meaningless on a red or flaky suite.
- [ ] **Step 1 — Pick the path & wire Stryker (path A, command runner).**
  - [ ] Add `@stryker-mutator/core` as a dev dependency (root or per-package — decide while wiring).
  - [ ] Author `stryker.config.mjs` per package (or one root config with three runs): `testRunner:
    "command"`, the package's `node --test …` command, `mutate` globs scoped to **prod** code only
    (exclude `*.test.*`, `dist/**`, `node_modules/**`).
  - [ ] Resolve the `scripts/**` no-`package.json` question (minimal `package.json` vs root config).
  - [ ] Dry-run on a **small slice** first (e.g. one `rag/src/lib` module) to validate the harness and
    measure per-mutant wall-clock before the full run.
- [ ] **Step 2 — Run the global audit** across `scripts/**`, `rag/src/**`, `local-mirror/src/**`.
  Capture the **mutation score** per package as the baseline test-quality signal.
- [ ] **Step 3 — Triage & kill surviving mutants.** For each survivor, decide: add the missing
  assertion (the usual outcome), or mark it an accepted equivalent/ignored mutant with a reason. **TDD**
  the new assertions (`tdd-discipline`); green-only commits.
- [ ] **Step 4 — Decide a sustainable cadence.** No per-commit gate today; likely a **periodic local
  audit** (and/or an opt-in, non-blocking CI job — *not* a merge gate, given command-runner cost).
  Record the chosen cadence + the baseline score here so it survives `/clear`s.
- [ ] **Step 5 (conditional) — Escalate to Vitest (path B)** *only if* the command-runner audit is too
  slow to run regularly. Spin it off as its own migration plan; do not scope-creep it here.

## Why deferred (not gating)

v3.4.0 ships with full suites green. Mutation testing **raises confidence in the tests**; it does not
change shippable behaviour. So it's a quality investment to schedule on its own, not under release
pressure. Links: [[degraded-quality-root-causes-context-loss-and-test-quality]],
[[prefer-deterministic-adr-0009]], [[validate-shipped-not-test-instance]].
