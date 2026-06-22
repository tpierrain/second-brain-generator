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
- [x] **Capability B — The RAG dependencies actually get installed on Windows** 🧪 TDD *(Bug 2)* _(2026-06-22 · aa6c40f)_
  - [x] `buildRagInstallInvocation()` win32 → materialises the self-heal block + `npm install` into a
    real `.cmd` written **into `rag/`**, invoked by a **space-free relative name** (`cmd /c
    sbg-rag-install.cmd`, cwd=rag/) so a brain path with spaces can't break cmd arg-splitting.
    Injected fs seam (pure, unit-tested); returns `cleanup()`. **Hardened beyond D-A**: an absolute
    temp path could itself carry spaces (`C:\Users\John Doe\…`) — caught before shipping (memory
    `validate-shipped-not-test-instance`).
  - [x] `pathPrependCmd()` kept as single source of truth (ADR 0021-A). POSIX path unchanged.
  - [x] Caller `installer.mjs` passes `ragDir` + calls `cleanup()` after run (pass or fail).
  - [x] `rag-launcher.test.mjs` locks the new contract (3 win32/posix tests). Harness 498/498.
  - [ ] Cross-check on real Windows that `rag/node_modules` is populated (proven by Capability E).
- [x] **Capability C — The supported Node window starts at 22 (Node 20 is dropped, on purpose)** 🧪 TDD *(Bug 3; depends on: —)* _(2026-06-22 · e75f045)_
  - [x] `scripts/lib/node-compat.mjs`: `NODE_WINDOW.min 20 → 22`; updated the actionable below-floor
    message (Node 20 is EOL + no prebuilt binary; install Node 22+ via nvm/volta). New boundary tests
    (20 → fail, 21 → fail, 22 → inclusive floor), fail-first, baby-steps. Header prose realigned.
  - [x] `rag/package.json` `engines.node ">=20" → ">=22"`; `.nvmrc` already `22` (verified).
  - [x] `better-sqlite3` kept at `^12` (lockfile resolves `12.10.1`); **regenerated
    `rag/package-lock.json`** (`--package-lock-only`) so its root entry mirrors `">=22"`, not `">=20"`.
  - [x] **Amended ADR 0020 in place** (dated 2026-06-22): floor 20 → 22; rationale = Node 20 EOL +
    `better-sqlite3 ≥ 12.10` dropped the Node-20 (ABI 115) prebuild; aligns the policy with the CI
    matrix (already 22+ only). STATUS carries the amendment marker.
  - [x] Propagation confirmed: `rag/package.json` + `rag/package-lock.json` are both in the
    `engine-manifest.json` `replace` bucket → brains ≥ 3.0.0 pick up the floor bump on their next
    engine update. **No extra wiring needed.**
  - [x] Harness (504/504) + engine (`rag/` 209/209, native binding builds) tests green.
- [x] **Capability D — An incompatible setup fails in ~5 s with an actionable message, not ~2 min** 🧪 TDD *(Bug 4; depends on: C)* _(2026-06-22 · 04af194)_
  - [x] Extended the step-1 preflight (`node-compat.mjs` + installer step `1/10`, right after the
    version-window check): `checkNativePrebuild({platform, arch, abi})` (abi = `process.versions.modules`)
    confirms a `better-sqlite3` prebuilt ships for this triple, else requires a C++ toolchain
    (`detectCppToolchain`), else **hard fails in step 1** with an actionable message ("switch to Node 22–26
    (nvm/volta) … or install a C++ build toolchain").
  - [x] **Pure, unit-tested seam** (ADR 0009): **decided offline known-matrix** (`PREBUILT_ABIS` 22→26 ×
    `PREBUILT_PLATFORMS`) over a network HEAD — install stays offline. `hasPrebuiltBinary` extracted as the
    single matrix predicate so the installer only probes for a compiler when no prebuilt exists (no spawn
    on the happy path). 10 new tests, fail-first.
  - [x] Launcher-side only (`node-compat` already excluded from the brain). Cross-platform (`{platform,
    arch}` matrix). ADR 0020 amended in place (point 3 + dated amendment).
- [x] **Capability E — CI actually exercises the Windows install path (close the blind spot)** *(depends on: A, B, C)* _(2026-06-22 · be41a3c)_
  - [x] `ci.yml`: **confirmed** the harness suites run on `windows-latest` via the
    `scripts/*.test.mjs` + `scripts/lib/*.test.mjs` glob (507 tests) — the new `needsShell`,
    `node-compat` and `rag-launcher` seams are all in it, so they're meaningful on Windows.
    *(Known pre-existing gap, out of scope: `rag/postinstall-restart-notice.test.mjs` (4 tests) is run
    by neither the harness glob nor `rag/`'s `src/lib/*.test.ts` — parked.)*
  - [x] Added an `install-e2e` job: **executes `installer.mjs --non-interactive` end-to-end on
    `windows-latest`** (temp dest, `--embedder in-process`, no key) and asserts a clean exit +
    `rag/node_modules/better-sqlite3` populated — the exact check Bugs 1 & 2 would have failed.
  - [x] **No Node-20 cell** (dropped on purpose). Matrix stays 22/24/26; the Cap-C preflight tests
    prove "Node < 22 fails loud". e2e pinned to Node 22 (the floor; spawn EINVAL is version-insensitive).
- [x] **Capability F — The Windows CI is actually GREEN (fix 2 pre-existing path false-negatives)** 🧪 *(discovered 2026-06-22: the CI exists and runs, but has been RED on Windows for days — blocking the Ship gate)* _(2026-06-22 · 79c198b; Windows-green PROVEN run 27979285365 harness 505/505)_
  - [x] **Root cause (confirmed from the CI logs, not guessed):** 2 harness tests fail **only on
    Windows** (macOS green) because their *expected* values compare against the **raw `brainDir`**
    (backslashes on Windows) while the production code correctly emits **posix-normalised** paths
    (`{{PROJECT_ROOT}}` is posix — the documented contract, twin of `installer.mjs` `toPosix`). So the
    **code is right; the test expectations are not cross-OS**. Fixed the tests, not the source.
    - [x] `reconcile-brain.test.mjs` (588–590): assert the **added** hook commands against
      the posix-normalised brainDir (no-op on macOS → no regression; matches the code on Windows).
    - [x] `update-engine.test.mjs` (899): assert the registered MCP server's `cwd` against
      the posix-normalised brainDir (CI log: actual `C:/…` vs expected `C:\…`).
  - [x] **Method note:** the backslash can't be reproduced on macOS, so the *red* proof is the Windows
    CI run itself (logs captured); macOS stays green (non-regression); the green proof is the next CI run.
  - [x] Harness green on macOS locally (511/511). _(audited: only these 2 of 492 tests were red; the
    `session-status … untouched` assertion compares a verbatim-preserved entry, consistent on either OS.)_
  - [x] **CI green on Windows** (the real gate) — **proven** (run 27979285365: harness step 505/505,
    0 fail on `windows-latest`). The 2 path false-negatives are fixed for real. _(2026-06-22 · 79c198b)_
- [x] **Capability G — The REST of the Windows CI is green (cascade revealed once F unblocked the harness step)** 🧪 *(discovered 2026-06-22 on PR #17 / run 27979285365; closed 2026-06-22 · run 27983652044 ALL GREEN)*
  - [x] **F proven green on CI**: harness step is **505/505, 0 fail on `windows-latest`** (run 27979285365). The 2 path false-negatives are fixed for real.
  - [x] **G1 — engine tests (`rag/`) red on Windows (2 tests).** `rag/src/lib/citation-renderer.test.ts` (tests "a mirror note renders both…" + "a non-mirror note renders only…"). **Root cause confirmed:** the test passed a **hardcoded POSIX root `"/brain/vault"`** and expected `file:///brain/vault/…`; on Windows `resolve()` prepends the current drive, so production correctly emits `file:///D:/brain/vault/…` → mismatch. **Test false-negative, NOT a prod bug** (a real Windows vaultRoot is a `C:\…` path → URL correct). **Fix:** build the expected URL the same way production does — `pathToFileURL(resolve(VAULT, relPath)).href` with `VAULT = resolve("/brain/vault")` (OS-appropriate absolute). macOS green (7/7, no-op there); the green proof on Windows is the next CI run. _(2026-06-22 · 15b22d4)_
  - [x] **G2 — `install-e2e` `--embedder in-process` forces a slow/stuck ONNX index on the runner.** **Decision (plan's "lighter/no-embedder path" option):** switch the e2e to **`--embedder gemini` WITHOUT a key** → `embedderReady` false → **indexing deferred**, no ONNX download. The job still exercises the EXACT spawn surface Bugs 1 & 2 broke (prereq npm/npx `.cmd`, rag-install `.cmd`, MCP smoke `npx.cmd` — all run before indexing, regardless of embedder), and the `rag/node_modules/better-sqlite3` assertion is unchanged (rag install is unconditional). `CI=true` skips the editor pop + Obsidian register → exits 0 headless. Added `timeout-minutes: 20` as a belt. **Proven locally** (macOS, `CI=true`): exit 0, `better-sqlite3` present, "indexing deferred". _(2026-06-22 · e078f61)_
  - [x] **G3 — the installer HANGS ON EXIT on Windows (the real blocker G2 unmasked).** With G2 making the install fast, run 27981499668 showed the truth in the logs: the installer reaches **"✓ Installation complete"** + full banner in **~1m45s**, then **never exits** — step 5 sat idle until the 20-min `timeout-minutes` belt fired. **Root cause (real prod bug, not a CI artifact):** the post-flight MCP smoke spawns `cmd.exe /c npx.cmd … vault-rag` (shell, ADR 0031), so `child.kill()` reaps only the shell — the **node grandchild is orphaned and keeps the inherited stdout pipe open** → the parent's event loop never drains → hang. A real Windows user would see the success banner then a frozen terminal. macOS reaps the whole tree → exits clean (why it never surfaced). **Fix (TDD, pure seam · ADR 0009):** new `scripts/lib/child-cleanup.mjs` — `buildTreeKill(platform, pid)` (win32 → `taskkill /pid <pid> /T /F`, `null` off Windows; 6 unit tests fail-first) + `terminateChild(child, {platform, spawn})` that kills, tree-kills the orphan on win32, then **destroys the child's stdio + `unref()`s** so the loop drains regardless. Wired into BOTH `mcp-smoke.mjs` and `mcp-search.mjs` `finish()`. **Fleet reach:** `scripts/lib/**` is in `engine-manifest.json`'s `replace` bucket → brains ≥ 3.0.0 pick up the exit-clean teardown on `update-engine` (same hang affects runtime `verify-rag` / health probes on Windows). **ADR 0031 amended in place** (Cleanup section). Harness 513/513; local e2e exits 0 in ~6 s, no regression. _(2026-06-22 · pending commit)_
  - [x] Re-run CI on the PR; **all Windows cells green** (the real gate). **PROVEN — run 27983652044
    `success`:** Node 22/24/26 · windows-latest ✓, Installer e2e · windows-latest ✓ (installer step
    **39 s**, was a 20-min timeout before G3), Node 22/24/26 · macos-latest ✓ (no regression). _(2026-06-22)_
- [ ] **Ship** *(depends on: A–G)*
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
