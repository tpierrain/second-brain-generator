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

- [ ] **1. Bump `better-sqlite3` → v12** _(applied + verified locally 2026-06-15, **uncommitted**)_
  - [x] 1a. `rag/package.json`: `^11.0.0 → ^12.0.0`; lockfile regenerated (`12.10.1`).
  - [x] 1b. Green on **Node 25**: rag **141/141**, `tsc --noEmit` clean, native smoke (open/WAL/prepare/
    transaction) OK.
  - [ ] 1c. Re-confirm on a clean checkout (`npm ci` in `rag/`) before committing.
- [ ] **2. Declare the supported Node window**
  - [ ] 2a. Add `"engines": { "node": ">=22" }` to `rag/package.json` (and root `package.json` if present).
  - [ ] 2b. Add a `.nvmrc` (e.g. `22` or the current LTS) at the repo root + brain template if relevant.
  - [ ] 2c. Decide the **lower bound** consciously: ≥ 22 (drop 20?) — note it; it must match better-sqlite3's
    window and what the installer/CI enforce.
- [ ] **3. Installer preflight Node check (TDD)**
  - [ ] 3a. **Pure seam** `scripts/lib/node-compat.mjs` → `checkNode(version, window)` → `{ ok, message }`.
    RED→GREEN: in-window → ok; below → fail-loud message ("Node 18 detected; this engine needs ≥22 — use
    nvm/volta to switch"); above declared ceiling → warn but allow (forward-friendly). Triangulate the
    boundaries.
  - [ ] 3b. Wire it into `installer.mjs` **before** the `npm install` of the engine; on hard-fail, exit
    non-zero with the message (don't pretend). Keep it launcher-side (exclude from the brain like
    `install-handoff` if it's purely install-time — decide & test, cf. [[qa-pr10-and-update-engine-fix]]).
- [ ] **4. CI matrix (the net)**
  - [ ] 4a. `.github/workflows/ci.yml`: matrix `node: [22, 24, 26]` × `os: [macos-latest, windows-latest]`
    (parity ADR 0015); steps = `npm ci && npm test` in `rag/` + `node --test scripts/lib/*.test.mjs`.
  - [ ] 4b. Confirm the matrix **goes red on the pre-bump state** (sanity: it would have caught Yann's
    conflict) then green on the bump.
- [ ] **5. ADR 0020 — "Node compatibility policy for native deps"**
  - [ ] 5a. Decision: declared Node window (`engines`), CI matrix as the gate, keep-native-deps-fresh
    (watch `better-sqlite3` + `onnxruntime`), propagation to the fleet via `update-engine`, installer
    preflight as the fail-loud guide. Scope: **Installer + Second brain (runtime)**. Apply the Scope
    convention ([[adr-scope-field-convention]]).
- [ ] **6. Docs**
  - [ ] 6a. README/SETUP: a short "Node version" note (supported window; "Node 24+ is covered since
    v3.0.1"); existing brains get it via `update-engine` if their binding breaks after a Node bump.
- [ ] **7. Suites green + empirical** — harness `node --test scripts/lib/*.test.mjs`; `npm test --prefix rag`;
  `(cd rag && npx tsc --noEmit)`. **Empirical:** a **fresh install on Node 24/25** completes (native
  binding loads, post-flight canary OK). **On ne commit que du vert** ([[commit-only-green-todo-gate]]).
- [ ] **8. Ship** — PR from `node-compat`, `/code-review`, QA, merge; **tag `v3.0.1`**. Tick this plan
  _(date · commit)_ and **archive** it in `maintainers/plans/archived/` ([[plan-done-equals-archived]]).
  Verify the fleet picks it up via `update-engine`.

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
