<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🗺️ ACTION PLAN (created 2026-06-15) — to execute, step-by-step, in TDD. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Action plan — Node-version compatibility for native deps (unblock install on Node 24/25/26) → **v3.0.1**

> **STATUS: 🗺️ ACTION PLAN** (created 2026-06-15). **To execute in TDD.**
> **Origin:** field feedback (Yann DANOT, 2026-06-15) — `better-sqlite3@^11` doesn't declare Node ≥ 24
> support → on Node 24/25/26 the install either fails to build the native binding or forces the user to
> **downgrade Node globally**. v3.0.1 fixes this for everyone installing on a modern Node.
> **Ships as v3.0.1** (patch: a compatibility fix, no new feature). **Branch: `node-compat`** (deps + CI → branch + PR).
> **Sequence (decided):** this plan ships **BEFORE** [`import-second-brain-action.md`](import-second-brain-action.md)
> (v3.1.0). A reliable install on modern Node is the **foundation** the import skill stands on — and a
> migrant must do a fresh install first. Patch first, feature second.

---

## 🎯 Why (and why now)

- The only ABI-bound surface is **native modules**. Inventory: **`better-sqlite3`** (the real one) and,
  more tolerant, **`onnxruntime`** (via `@huggingface/transformers`). Everything else is pure JS,
  insensitive to the Node version.
- `better-sqlite3@12.10.1` declares `engines.node: 20.x || 22.x || 23.x || 24.x || 25.x || 26.x` → the
  clean fix to Yann's wall.
- You just launched v3 ("install yours now") → a broken install on Node 24+ **kills launch momentum**.
  This is a tiny, low-risk patch; ship it fast.
- **It propagates to the existing fleet:** `rag/package.json` + lockfile are in the `replace` bucket, so
  brains ≥ 3.0.0 pick up the fix via `update-engine` (the cure for "I bumped Node and my binding broke").

---

## 📐 Design (frozen)

- **Bump** `better-sqlite3 ^11 → ^12` (already applied + verified locally — see Tracking 1).
- **Declare the supported Node window** in `rag/package.json` `engines` (+ `.nvmrc`) so it's explicit and
  enforceable — single source of truth for the preflight + CI.
- **Installer preflight (fail-loud, ADR 0009):** a **pure seam** that compares `process.version` to the
  window and prints a clear, actionable verdict **before** `npm install` (the step that otherwise blows
  up cryptically). Cross-platform (ADR 0015).
- **CI matrix = the net:** GitHub Actions running `npm ci && npm test` (rag) + `node --test scripts/lib/*.test.mjs`
  (harness) across **Node 22 / 24 / 26**, on macOS **and** Windows (parity, ADR 0015). This is what turns
  "a colleague finds it at install time" into "my build goes red first".
- **Don't bump onnxruntime/transformers blindly** — it ships broad prebuilds; list it as a *watch* item in
  the ADR, bump only if a real conflict surfaces.

---

## 📋 Tracking

- [x] **1. Bump `better-sqlite3` → v12** _(2026-06-15 · 75a2576)_
  - [x] 1a. `rag/package.json`: `^11.0.0 → ^12.0.0`; lockfile regenerated (`12.10.1`).
  - [x] 1b. Green on **Node 25**: rag **141/141**, `tsc --noEmit` clean, native smoke (open/WAL/prepare/
    transaction) OK.
  - [x] 1c. Re-confirmed on a clean checkout (`rm -rf node_modules && npm ci` in `rag/`, Node 25) → builds
    the native binding, rag **141/141**, smoke `better-sqlite3 v12.10.1 OK`.
- [x] **2. Declare the supported Node window** _(2026-06-15)_
  - [x] 2a. `rag/package.json` `"engines": { "node": ">=20" }` (no root `package.json` — harness is bare .mjs).
  - [x] 2b. `.nvmrc` = `22` (clean LTS inside the window) at repo root.
  - [x] 2c. **Lower bound = 20** (conscious): matches better-sqlite3@12's own floor (`20.x`); no reason to
    drop 20. Mirrored by `NODE_WINDOW = {min:20,max:26}` (installer preflight) + the CI matrix. Noted in ADR 0020.
- [x] **3. Installer preflight Node check (TDD)** _(2026-06-15)_
  - [x] 3a. **Pure seam** `scripts/lib/node-compat.mjs` → `checkNode(version, window)` + shared `NODE_WINDOW`.
    6 tests (in-window ok / below-floor fail-loud / above-ceiling warn-but-allow / on-floor / on-ceiling /
    shared-constant), triangulated boundaries. **node-compat 6/6.**
  - [x] 3b. Wired into `installer.mjs` step 1 **before** `npm install` (replaced the inline `≥18` check):
    hard-fail → `err` + `missing=true` → exit non-zero; above-ceiling → `ok` + `warn`. Kept **launcher-side**
    (excluded from the brain via `tracked-files` prefix, like `install-handoff`) — exclusion unit-tested.
- [x] **4. CI matrix (the net)** _(2026-06-15)_
  - [x] 4a. `.github/workflows/ci.yml`: matrix `node: [22, 24, 26]` × `os: [macos-latest, windows-latest]`
    (parity ADR 0015); steps = harness `node --test "scripts/*.test.mjs" "scripts/lib/*.test.mjs"` +
    `npm ci && npm test` + `npx tsc --noEmit` in `rag/` (the `npm ci` is what **builds the native binding**).
  - [ ] 4b. Confirm green on CI once the branch is pushed (the pre-bump red is a thought-experiment:
    `better-sqlite3@^11` lacked 24/25/26 in `engines` → `npm ci` would have failed on those cells).
- [x] **5. ADR 0020 — "Node compatibility policy for native deps"** _(2026-06-15)_
  - [x] 5a. Four-part policy (keep-native-deps-fresh · declared window · fail-loud preflight · CI matrix),
    propagation to the fleet via `update-engine`. Scope: **Installer + Second brain (runtime)** (Scope
    convention [[adr-scope-field-convention]] applied).
- [x] **6. Docs** _(2026-06-15)_
  - [x] 6a. README + SETUP: bumped the prereq to **Node ≥ 20**, added "Node 24/25/26 covered since v3.0.1"
    and the preflight/troubleshooting notes.
- [x] **7. Suites green + empirical** _(2026-06-15)_ — harness **245/245** (`scripts/*` + `scripts/lib/*`),
  rag **141/141**, `tsc --noEmit` clean. **Empirical on Node 25:** clean `npm ci` builds the native binding;
  `better-sqlite3 v12.10.1` open/WAL/prepare/transaction OK. **Committed green only** ([[commit-only-green-todo-gate]]).
- [ ] **8. Ship** — PR from `node-compat`, `/code-review`, QA, merge; **tag `v3.0.1`**. Tick this plan
  _(date · commit)_ and **archive** it in `maintainers/plans/archived/` ([[plan-done-equals-archived]]).
  Verify the fleet picks it up via `update-engine`. **(post-démos — Thomas's call.)**

> Cocher `- [x]` _(date · commit)_ à chaque étape — mémoire qui survit aux `/clear`.

---

## 🧭 État pour reprise (après `/clear`)

- **Repo** `~/Dev/second-brain-generator`. **Le bump est DÉJÀ dans l'arbre de travail, non commité**
  (`rag/package.json` + `rag/package-lock.json`) et **vérifié vert sur Node 25** — démarrer en confirmant
  sur `npm ci` propre, créer la branche `node-compat`, committer ce 1er pas, puis enchaîner 2→8.
- **Discipline** : TDD (skill `tdd-discipline`) pour le seam preflight (étape 3) ; le reste = config/CI/docs.
- **Inventaire natif à surveiller** : `better-sqlite3` (ABI), `onnxruntime` (via `@huggingface/transformers`,
  prebuilds larges). Les autres deps = JS pur, hors sujet.
- **Garde-fous** : fail-loud avant `npm install` (ADR 0009) ; parité Mac/Windows en CI (ADR 0015) ; ne
  PAS bumper onnxruntime sans conflit prouvé (YAGNI) ; le fix se diffuse au parc via `update-engine`.
- **Séquence** : **CE plan (v3.0.1) AVANT** [[import-second-brain-action]] (v3.1.0). Voir aussi
  [[engine-packaging-phase1-active]], [[prefer-deterministic-adr-0009]], [[checkbox-plans-convention]].
