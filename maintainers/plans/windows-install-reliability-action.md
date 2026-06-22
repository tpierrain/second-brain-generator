<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 📝 DRAFT — awaiting Thomas's validation before any production code. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Action plan — Windows install reliability (Node ≥ 22, clean non-interactive install)

> **STATUS: 📝 DRAFT — plan only, no production code yet** (created 2026-06-22, branch
> `windows-install-reliability`). Thomas decided: **Bug 3 → raise the Node floor to 22+**, and
> **review this plan before any code is written**. Two sub-decisions are still open below
> (marked 🔸 DECIDE) — confirm them and I start the TDD baby-steps.

## Crux

A clean **non-interactive install fails on Windows** with **Node 20 and no Visual Studio C++
toolchain**. Field report (Daniel Martin, 2026-06-21). Three independent, **verified-in-code** bugs
all surface **late** (steps 8–10, after 295 files are copied, the constitution generated and
`git init` run), so the user wastes a full ~2-minute run before seeing a cryptic failure. None of
them affect macOS/Linux. This plan fixes the three bugs, **raises the supported Node floor to 22**
(Node 20 is EOL April 2026 and no longer has a `better-sqlite3` prebuilt binary), adds a **fail-fast
preflight**, and **closes the CI gap** that let all three slip.

## Why these slipped (the real lesson)

The CI net exists ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), ADR 0020 §4) but
has **two blind spots** that exactly match the three bugs:

- It tests **Node 22 / 24 / 26 only — never Node 20** → Bug 3 (no Node-20 prebuild) is invisible.
- It runs harness unit tests + `npm ci` in `rag/` + engine tests, but **never executes
  `installer.mjs` end-to-end** → Bugs 1 & 2 (spawn-correctness in the *installer* path) are never
  exercised, on Windows or anywhere.

So the fixes are only half the work; the other half is **making the net actually cover the install
path** (Capability E) — otherwise the next Windows regression slips the same way.

## How to use this plan (mandatory reading)

- **One capability = one focused session.** `/clear` between capabilities. Each is self-contained.
- **TDD mandatory** (skill `tdd-discipline`): baby-steps, fail-first, refactor non-optional, one
  test at a time. Pure seams unit-tested; green-only commits (memory `commit-only-green-todo-gate`).
- **Tick the sub-boxes as you go**; on completion tick the capability box + note _(date · commit)_.
- **Artifacts in English** (commit/PR/ADR/doc); conversation stays FR.
- **Plan done = archived** (`git mv` to `archived/` + STATUS ✅ with proof, same change).

## Tracking — checkboxes (live-monitorable in this file)

- [x] **🔸 DECIDE (pre-flight, Thomas) — two open sub-decisions** _(2026-06-22 — Thomas: follow both recos)_
  - [x] **D-A — Bug 2 implementation = temp `.cmd` file** (keeps ADR 0021-A self-heal SSOT, executed
    correctly on Windows). _(decided 2026-06-22)_
  - [x] **D-B — new ADR 0031 = yes** (spawn Windows `.cmd`/`.bat` through a shell). Bug 3 + Bug 4 →
    amend ADR 0020 in place. _(decided 2026-06-22)_
- [x] **Capability A — A clean install no longer dies spawning `npm`/`npx` on Windows** 🧪 TDD *(Bug 1)* _(2026-06-22 · ed3da64)_
  - [x] Pure seam `needsShell(cmd, platform)` — `win32` + `/\.(cmd|bat)$/i` → `true`; `.exe`/POSIX →
    `false`; case-insensitive. 4 unit tests, fail-first. _(scripts/lib/spawn-shell.mjs)_
  - [x] Wired into `installer.mjs` `run()` (prereq check + local-mirror install).
  - [x] Wired into `scripts/lib/mcp-smoke.mjs` + `mcp-search.mjs` `spawn()`.
  - [x] **Audit widened the scope** — the SAME EINVAL bug existed at **6 more npm/npx spawn sites**
    (not flagged in the report): `engine-seams.mjs` (update-engine install/reindex — the *fleet
    upgrade* path), `verify-rag.mjs` (CASE-B verify), `headless-health-check.mjs` +
    `health-probe-run.mjs` (probes), `clear-example-notes.mjs` (purge), `run-eval.mjs` (dev). All
    routed through `needsShell`. OS-command spawns (`explorer`/`osascript`/`tasklist`/`open`/`xdg-open`
    — `.exe`/POSIX) are N/A. Recorded in ADR 0031.
  - [x] `node --test` green (496/496).
- [ ] **Capability B — The RAG dependencies actually get installed on Windows** 🧪 TDD *(Bug 2; depends on: D-A, A)*
  - [ ] Reproduce in a test: the current win32 `buildRagInstallInvocation` emits a **multi-line**
    `cmd /c` arg → assert the new shape runs `npm install` reliably (RED on the old shape).
  - [ ] Implement D-A's choice (temp `.cmd`) in `scripts/lib/rag-launcher.mjs`
    `buildRagInstallInvocation()` — **keep `pathPrependCmd()` as the single source of truth**
    (ADR 0021-A), just stop passing it as a multi-line `cmd /c` argument. POSIX path unchanged
    (`sh -c` handles `\n`).
  - [ ] Update the caller `installer.mjs` (line ~741) if the seam now returns a temp-file handle to
    clean up.
  - [ ] Update `scripts/lib/rag-launcher.test.mjs` to lock the new contract.
  - [ ] `npm ci` in `rag/` on Windows now populates `node_modules` (proven by Capability E).
- [ ] **Capability C — The supported Node window starts at 22 (Node 20 is dropped, on purpose)** 🧪 TDD *(Bug 3; depends on: —)*
  - [ ] `scripts/lib/node-compat.mjs`: `NODE_WINDOW.min 20 → 22`; update the actionable below-floor
    message ("install Node 22+ via nvm/volta — Node 20 is EOL and has no prebuilt binary"). Test the
    new boundary (21 → fail, 22 → ok). RED first.
  - [ ] `rag/package.json` `engines.node ">=20" → ">=22"`; `.nvmrc` already `22` (verify).
  - [ ] `rag/package.json` `better-sqlite3 "^12.0.0"` → keep `^12` (its prebuild story is fine on
    Node 22+); **regenerate `rag/package-lock.json`** so it no longer pins a Node-20-only assumption.
    *(No version pin to 12.9.0 — that was the "keep Node 20" path we rejected.)*
  - [ ] **Amend ADR 0020 in place** (dated addendum): floor 20 → 22; rationale = `engines.node`
    declared 20.x but `better-sqlite3 ≥ 12.10` **stopped publishing Node-20 (ABI 115) prebuilds**, and
    Node 20 is **EOL April 2026**. Note this *aligns the policy with the CI matrix*, which already
    tests 22+ only.
  - [ ] Propagation note: `rag/package.json` + lockfile live in `update-engine`'s `replace` bucket →
    brains ≥ 3.0.0 pick up the floor bump on their next engine update (ADR 0020 §"How the fix reaches
    the fleet"). Confirm no extra wiring needed.
  - [ ] Harness + engine tests green.
- [ ] **Capability D — An incompatible setup fails in ~5 s with an actionable message, not ~2 min** 🧪 TDD *(Bug 4; depends on: C)*
  - [ ] Extend the step-1 preflight (`node-compat.mjs` / installer step `1/10`): after the
    version-window check, **verify the native-dep story for the running Node ABI**
    (`process.versions.modules`) — a `better-sqlite3` prebuilt exists for `{abi, platform, arch}`, or a
    C++ toolchain is present. If neither → **hard fail in step 1** with "switch to Node 22+ (nvm/volta)".
  - [ ] Keep it a **pure, unit-tested seam** (ADR 0009 deterministic preflight); decide offline-vs-HEAD
    check (prefer an offline `node-abi`/known-matrix check over a network HEAD so install stays offline).
  - [ ] Launcher-side only (excluded from the brain, like the rest of the preflight). Cross-platform.
- [ ] **Capability E — CI actually exercises the Windows install path (close the blind spot)** *(depends on: A, B, C)*
  - [ ] `ci.yml`: the harness suites already run on `windows-latest` → the new `needsShell` /
    preflight / `rag-launcher` seams are covered there. **Confirm** they run and are meaningful.
  - [ ] Add a job step that **executes `installer.mjs --non-interactive …` end-to-end on
    `windows-latest`** (into a temp dest, `--embedder in-process` or a no-key path) and asserts a clean
    exit + `rag/node_modules` populated — the check that would have caught Bugs 1 & 2.
  - [ ] **Do NOT add a Node-20 cell** (we dropped 20 on purpose). Matrix stays 22/24/26; the preflight
    test (Capability C) is what proves "Node < 22 fails loud".
- [ ] **Ship** *(depends on: A–E)*
  - [ ] Full suite green (harness + `rag/`), `tsc` clean, CI green on macOS **and** Windows.
  - [ ] PR with a "The One Where…" codename (memory `release-naming-the-one-with`); body in English.
  - [ ] Tag + GitHub release (QA-before-main discipline, ADR 0020 context).
  - [ ] **Pre-flight EN ritual** (CLAUDE rules `language.md`) before commit/PR/release.
  - [ ] Archive this plan (`git mv` → `archived/`, STATUS ✅ + proof) in the ship change.

## Files in scope (verified)

| File | Bug | Change |
|---|---|---|
| `installer.mjs` `run()` (~146) | 1 | `shell:true` for win32 `.cmd`/`.bat` |
| `scripts/lib/mcp-smoke.mjs` `spawn` (11) | 1 | same shell guard |
| `scripts/lib/mcp-search.mjs` `spawn` (14) | 1 | same shell guard |
| `scripts/lib/rag-launcher.mjs` `buildRagInstallInvocation` (141) | 2 | stop multi-line `cmd /c`; temp `.cmd` (D-A), keep `pathPrependCmd()` SSOT |
| `installer.mjs` rag-install caller (~741) | 2 | adapt to new seam shape |
| `scripts/lib/node-compat.mjs` `NODE_WINDOW` (14) | 3,4 | floor → 22; native-dep preflight |
| `rag/package.json` + `rag/package-lock.json` | 3 | `engines ">=22"`; regen lock |
| `maintainers/decisions/0020-*.md` | 3,4 | amend in place (floor → 22, ABI-prebuild rationale) |
| `maintainers/decisions/0031-*.md` (new, if D-B yes) | 1 | spawn `.cmd`/`.bat` through a shell |
| `.github/workflows/ci.yml` | E | run `installer.mjs` e2e on windows-latest |

## Out of scope (parked)

- **node:sqlite / WASM SQLite** (drop the native dep entirely). The biggest robustness win, but its
  own chantier with regression risk — already rejected once (ADR 0021 alt C). Revisit later; raising
  the floor to 22 makes it non-urgent.
- Touching `onnxruntime`/`@huggingface/transformers` (broad prebuilds — not the bottleneck; YAGNI).
