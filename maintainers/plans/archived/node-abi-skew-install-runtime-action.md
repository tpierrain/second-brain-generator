<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🗺️ ACTION PLAN (created 2026-06-17) — to execute, step-by-step, in TDD. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Action plan — Native-dep ABI skew: align the install-time Node with the runtime Node (A) + self-heal rebuild on mismatch (B)

> **STATUS: 🗺️ ACTION PLAN** (created 2026-06-17). **To execute in TDD** (skill `tdd-discipline`).
> **Folds into v3.1.0** (same tag as node-compat + import) so a single tag cures both *install* and *runtime*.
> **Branch:** continue on `node-compat` (already carries node-compat + import).

---

## 🎯 Why — the field problem (in plain terms)

`better-sqlite3` is a **native** module: a binary moulded for **one** Node ABI. Field signal (several
colleagues, 2026-06-17): after install, the RAG fails with "native module broken / binary not compiled".

Root cause = an **ABI skew**, distinct from the node-compat bug (which was "Node too new → build refused"):
- The **installer** runs `npm install` in `rag/` with **its own shell Node** (e.g. Node 26 → ABI 137).
- The **runtime** launches the MCP server via `rag/launch.sh`, which rebuilds a **self-heal PATH**
  (`pathPrependSh()`) and resolves **whatever Node lands first** there (e.g. a Homebrew `node@22` → ABI 127).
- Binary moulded for 26, loaded by 22 → **mismatch**. Only bites **multi-Node machines** (mono-Node = no skew).
- See memory [[node-abi-skew-not-fixed-by-node-compat]].

**Decision (Thomas, 2026-06-17): do B + A** (belt and braces), fold into v3.1.0. Reject C (replace the
native dep with a pure-JS store — oversized for a risk we can heal).

---

## 📐 Design (frozen)

- **A — Build at install with the SAME Node the launcher will use.** Route the `rag/` `npm install` through
  the **same self-heal PATH** as `launch.sh` (reuse `pathPrependSh()`/`pathPrependCmd()` — single source of
  truth). The binary is then moulded for exactly the Node that will load it. Pure seam:
  `buildRagInstallInvocation(platform)` → `{command, args}` (the OS-right shell + the embedded self-heal
  block + `npm install`). Installer wires `rag/` install through it (replaces the bare `run(NPM, …)`).
- **B — Self-heal rebuild at runtime on ABI mismatch.** When loading `better-sqlite3` throws an ABI error,
  run `npm rebuild better-sqlite3` under the **current** Node, then retry once. Robust forever (survives a
  Node change *after* install). Pure seam `isNativeAbiError(err)` (detect the `NODE_MODULE_VERSION` /
  "compiled against a different Node.js version" / `ERR_DLOPEN_FAILED` family) + a thin loader that rebuilds
  and re-requires. Lives in `rag/` (where better-sqlite3 is used) → ships to the fleet via `update-engine`
  `replace` bucket; cross-platform (ADR 0015); deterministic (ADR 0009).
- **Reach the fleet:** A touches `installer.mjs` (new installs) + the seam in `scripts/lib/` (carried).
  B lives in `rag/src/**` (already in the `replace` bucket) → existing ≥ 3.0.0 brains pick it up on
  `update-engine`. The cure for "I bumped Node and my binding broke" is then **B** (auto-rebuild) +
  re-install for A.
- **No machine path baked**, existence-tested prepends only (like the existing launchers).

---

## 📋 Tracking

- [x] **0. Re-read** the seam files + memory before coding _(done 2026-06-17)_ — `rag-launcher.mjs`
  (`pathPrependSh/Cmd`), `installer.mjs` (rag install at L644-651), `rag/src/lib/vector-store.ts`.
- [x] **1. A — pure seam `buildRagInstallInvocation(platform)` (TDD)** _(done 2026-06-17, in `rag-launcher.mjs`)_
  - [x] 1a. RED→GREEN posix: `{command:"/bin/sh", args:["-c", "<pathPrependSh()>\nexec npm install --silent"]}`.
  - [x] 1b. Triangulate win32: `{command:"cmd", args:["/c", "<pathPrependCmd()>\r\nnpm install --silent"]}`.
  - [x] 1c. Refactor: reuses `pathPrependSh/Cmd` (no copy). 2 tests, rag-launcher suite 15/15.
- [x] **2. A — wire the installer** _(done 2026-06-17)_ — `installer.mjs` step 7/9 now runs the rag install via
  `buildRagInstallInvocation(process.platform)`, fail-loud kept. Sanity: the sh invocation resolves node+npm
  under the self-heal PATH (ABI 141 here). Harness 268/268.
- [x] **3. B — pure seam `isNativeAbiError(err)` (rag/, TDD)** _(done 2026-06-17, `rag/src/lib/native-deps.ts`)_
  - [x] 3a. true on `NODE_MODULE_VERSION`; true on "Could not locate the bindings file" (missing/unbuilt);
    **false** on an unrelated error (SQLITE_CORRUPT/ENOENT → never rebuild blindly). 3 tests.
- [x] **4. B — self-heal loader** `loadNativeWithRebuild` (try → on `isNativeAbiError` rebuild once → retry,
  else propagate ; at most one rebuild, no loop) ; routed `vector-store.ts` through it _(done 2026-06-17)_.
  - [x] 4a. Unit-tested with an **injected** rebuild fn (fail-once-then-ok → rebuild called once → success).
  - [x] 4b. Guards: unrelated error → no rebuild + propagates ; still-broken after rebuild → fails loud
    (one rebuild). 6 tests total. **native-deps suite green ; tsc clean.**
  - [x] 4c. **🐛 BUG caught by the empirical step & fixed:** the ABI error fires on `new Database()`, NOT on
    `require("better-sqlite3")` (binding loads lazily in the ctor). Wrapping the `require` would never heal →
    `vector-store.ts` now wraps the **construction** (`openDatabase`). Unit-green code would have shipped broken.
- [x] **5. Suites green** _(done 2026-06-17)_ — harness **268/268**, rag **147/147**, `tsc` clean.
- [x] **6. Empirical proof — a real two-Node skew** _(done 2026-06-17)_
  - [x] 6a. Fetched an isolated Node 22 (ABI 127) tarball → `~/sbg-abi-proof/node-v22.12.0-darwin-arm64/bin`
    (path also in `~/sbg-abi-proof/.n22path`); current node = 25 (ABI 141). **No brew/system change.**
  - [x] 6b. **Bug reproduced (RED):** `~/sbg-abi-proof/repro` has better-sqlite3@12 built under node25;
    `new Database()` under node22 → `NODE_MODULE_VERSION 141 requires 127 / ERR_DLOPEN_FAILED`. The exact screen.
  - [x] 6d. **B heals it (end-to-end):** under node22 against the node25 binary → mismatch caught → real
    `npm rebuild better-sqlite3` under node22 → retry → DB operational (`{x:7}`). Proven via `~/sbg-abi-proof/repro/heal.mjs`.
  - [x] 6c. **A heals it (principle) — PROVEN 2026-06-17:** install with node22 first on PATH (what
    `buildRagInstallInvocation` does) → binary ABI 127 → loads under node22 with **no** rebuild
    (`probe-a.mjs`: `{x:7}`, `rebuild attempted: false`). Counter-check: the same binary under node25
    (ABI 141) → skew detected → confirms aligning install-node to runtime-node removes the skew.
  - [x] 6e. Clean up: `rm -rf ~/sbg-abi-proof` _(done 2026-06-17)_.
- [x] **7. ADR + docs** _(done 2026-06-17)_ — **new ADR 0021** (`align-install-node-with-runtime-node-and-self-heal-abi`)
  captures the skew dimension (install-node ≡ runtime-node by construction via A + runtime self-heal via B),
  cross-linked to ADR 0020/0009/0015/0012 ; **SETUP §8** troubleshooting row added (auto-rebuild on first
  start after a Node change + manual `npm rebuild better-sqlite3`) ; memory
  [[node-abi-skew-not-fixed-by-node-compat]] flipped → ✅ fixed.
- [~] **8. Ship v3.1.0 — THE canonical ship tracker for the 3 lots (node-compat + import + ABI skew)** _(IN PROGRESS — resume HERE)_
  - [x] 8a. **Push + PR** _(done 2026-06-17)_ — branch `node-compat` force-pushed (the lone stale remote commit
    `75a2576`, same change as local `ac6fcd4`, was overwritten — nothing lost). **PR #11 is OPEN**, `node-compat → main`,
    retitled **"v3.1.0 — The One With The Kenjaku-Style Import From Your Previous Brain (and Some Node Compatibility
    Bugfixes)"** with the simple Nouveauté/Corrections body. → https://github.com/tpierrain/second-brain-generator/pull/11
    *(No active CI on this repo — `ci.yml` shipped in the branch but GitHub Actions isn't wired, so don't wait on it.)*
  - [x] 8b. **`/code-review`** on PR #11 (read-only) _(done 2026-06-17)_ — high-effort, 7 real findings.
    **Pre-merge candidates (recommend fixing before the v3.1.0 tag):** (1) `rag/src/lib/vector-store.ts:27`
    — the runtime self-heal spawns `npm.cmd` **without `shell:true`** → `EINVAL` on Windows (whole 20–26
    window) → **Windows self-heal is dead** (breaks ADR 0015 parity + the ADR 0021 headline). Fix: route via
    `cmd /c npm rebuild …` (mirror `buildRagInstallInvocation`) or `{shell:true}`. (2) `rag/src/lib/native-deps.ts:14`
    — `isNativeAbiError` only matches `NODE_MODULE_VERSION` / "Could not locate the bindings file"; misses
    arch/self-register family ("incompatible architecture", "Module did not self-register", dlopen "symbol not
    found") → those rebuild-curable skews don't self-heal. **Non-blocking robustness:** (3) `import-vault.mjs:31`
    source-is-a-file → cryptic ENOTDIR vs the friendly fail-loud message (add `statSync(...).isDirectory()`);
    (4) `import-brain.mjs:52` "nothing was changed past this point" is false on a mid-copy failure; (5)
    `import-vault.mjs:24` self-import guard bypassed by a relative/symlink source (data still safe via collisions
    — `resolve()/realpathSync` both sides); (6) `import-brain.mjs:33` parseArgs silently drops a 2nd positional
    (unquoted "My Notes" → wrong source); (7) `node-compat.mjs:17` `checkNode` on a malformed version → NaN →
    silent `{ok:true}` (latent). **Verified NOT bugs:** runtime is `npx tsx src/` so `ragRoot()` rebuild cwd is
    correct; the retry's module-cache is sane (a throwing `.node` require isn't cached → retry reloads the rebuilt
    binary). **(1)+(2) fixed in TDD before QA — see 8b-fix below.**
    - [x] **8b-fix. (1)+(2) fixed in TDD before QA** _(done 2026-06-17, Thomas's call "on corrige avant la QA")_:
      (1) new pure seam `buildRebuildInvocation(platform)` in `rag/src/lib/native-deps.ts` (win32 → `cmd /c npm rebuild …`,
      posix → `npm rebuild …`); `vector-store.ts` `rebuildBetterSqlite` routes through it → no more `npm.cmd` EINVAL on Windows.
      (2) `isNativeAbiError` BINDING_FAILURE_SIGNS extended with `incompatible architecture` (arch skew) + `did not self-register`
      (NAPI); the unrelated-error guard (SQLITE_CORRUPT/ENOENT → false) still holds. **RAG 151/151 (+4), harness 255/255,
      tsc clean.** Findings #3–#7 left as documented non-blocking follow-ups.
  - [x] 8c. **Manual QA** _(done 2026-06-17, node25/ABI 141, launcher `node-compat` PR #11 HEAD — all green)_. Run from
    `$HOME` (outside the launcher); brain created under `$HOME/sbg-qa/qa-3-1-0`.
    - [x] 8c-1. **Node version** _(done)_ — `node -v` → `v25.6.0` (ABI 141), **in-window 20–26 → no warn**, exercises the
      node-compat lot. The node-compat fix means: < 20 hard-fails at "1/9" with the actionable message; > 26 warns but proceeds.
    - [x] 8c-2. **Fresh install (in-process, no key)** _(done)_ — `node <launcher>/installer.mjs --non-interactive --name
      qa-3-1-0 --dest "$HOME/sbg-qa" --owner QA --lang en --embedder in-process` → **exit 0**; "1/9" printed `v25.6.0` (no warn);
      `run-node smoke-test OK`; index 7/7; **9/9 post-flight OK — Mollecuisse canary FROM the vault**; Desktop-first hand-off banner verbatim.
    - [x] 8c-3. **Deterministic RAG check** _(done)_ — `cd "$HOME/sbg-qa/qa-3-1-0" && node scripts/verify-rag.mjs` → **exit 0**
      = RAG operational, **no ABI error on `new Database()`** (binary moulded for the runtime Node by A).
    - [x] 8c-4. **Import a fake old brain (the import lot)** _(done)_ — throwaway vault `$HOME/sbg-qa/fake-old-brain` with a
      sub-folder note carrying canary **`Quibrillon-7742`**, a 36-byte attachment, a demo note, an `.obsidian/`.
      `import-brain.mjs <vault>` → plan **2 to import / 1 example skipped / 0 collision**; `--apply` → copied, **attachment
      bytes identical (`cmp` OK)**, demo note + `.obsidian/` **excluded**, no overwrite. ⚠️ **Gotcha (NOT a bug):** the demo-skip
      tag is **`exemple`** (FR product locale), **not** `example` — a first fake note tagged `[example]` was (correctly) NOT
      skipped; fixed to `[exemple]` → skipped. Reindex (force) → **8 docs** (+1 = the imported note). **`search_vault` for the
      codename → canary `Quibrillon-7742` FOUND from the imported note.** (NB: the single *import commit* fires via the brain-side
      auto-commit hook inside a rooted conversation — raw CLI leaves the files untracked, which is expected.)
    - [x] 8c-5. **Self-heal (the ABI lot)** _(done — baseline)_ — mono-Node machine (ABI 141 everywhere) → **no skew**, as
      expected; brain starts & answers (no "native module broken") — proven by verify-rag **and** the `search_vault` probe
      (both open `new Database()` cleanly). Real 2-Node skew firing already proven empirically at **ÉTAPE 6** (node22↔node25).
    - [ ] 8c-6. **Cleanup** the QA brain + fake vault (`rm -rf "$HOME/sbg-qa"`). A green QA unblocks 8d. _(pending Thomas's go.)_
  - [ ] 8d. **Merge PR #11 + annotated tag `v3.1.0`** with the codename + the release note (✨ import / 🐛 Node compat /
    🐛 SQLite self-heal). Reminder: fresh installs consume `main` HEAD → **merge only QA-validated** ; the fleet ≥3.0.0
    advances only at the semver tag. **push/merge/tag = outbound → only on Thomas's explicit green light.**
  - [ ] 8e. **Archive the 3 plans** ([[plan-done-equals-archived]]): `git mv` → `maintainers/plans/archived/` + STATUS ✅
    with the merge commit/tag, for `node-abi-skew-install-runtime-action.md`, `import-second-brain-action.md`,
    `node-compat-native-deps-action.md`. Update any plan index/README.

> Cocher `- [x]` _(date · commit)_ à chaque étape terminée — mémoire qui survit aux `/clear`.

> 🧭 **Reprise post-`/clear` (v3.1.0 ship)** : **v3.0.0 est DÉJÀ shippée** (PR #10 mergée `f22068f` + tag) ; il ne
> reste QUE **v3.1.0** via **PR #11** (`node-compat → main`, déjà ouverte + à jour, pas de rebase à faire). Prochaine
> action = **8b `/code-review`**, puis 8c QA, puis 8d merge+tag, puis 8e archive. Ce plan = le tracker de ship des
> 3 lots. Voir [[abi-skew-fix-resume]], [[node-compat-then-import-plans]], [[release-naming-the-one-with]].

---

## 🧭 État pour reprise (après `/clear`)

- **➡️ PROCHAINE ACTION = étape 6c** (prouver le principe de A), puis **6e** (nettoyage `rm -rf ~/sbg-abi-proof`),
  puis **7** (ADR/docs) et **8** (ship sur feu vert Thomas). **A+B sont CODÉS + VERTS + COMMITÉS** (voir commit
  ci-dessous) ; B est **prouvé end-to-end** (6d) ; reste juste la démo de A + la doc.
- **Pour 6c** (tout est déjà en place dans `~/sbg-abi-proof/`) : Node 22 isolé = `$(cat ~/sbg-abi-proof/.n22path)`
  (ABI 127) ; `~/sbg-abi-proof/repro` a un better-sqlite3@12. Faire un install **avec le bin node22 en tête de
  PATH** (ce que fait A via `pathPrependSh`) → binaire ABI 127 → charge sous node22 **sans rebuild**. C'est la
  démo « aligner install-node sur runtime-node supprime le skew ».
- **Repo** `~/Dev/second-brain-generator`, branche **`node-compat`** (porte déjà node-compat + import).
- **Discipline TDD** : seams purs d'abord (A: `buildRagInstallInvocation` ; B: `isNativeAbiError` + loader
  avec rebuild **injecté** pour le test) → pas besoin du 2ᵉ Node pour le cœur ; 2ᵉ Node seulement à l'étape 6.
- **Réutiliser** : `pathPrependSh/Cmd` de `rag-launcher.mjs` (NE PAS recopier le bloc self-heal).
- **Garde-fous** : pas de chemin machine en dur ; un seul rebuild (pas de boucle) ; fail-loud ; ne PAS
  rebuild sur une erreur non-ABI ; Mac + Windows (ADR 0015) ; déterministe (ADR 0009).
- **Mémoires liées** : [[node-abi-skew-not-fixed-by-node-compat]], [[run-node-self-heal-design]],
  [[node-compat-then-import-plans]], [[release-gate-demos-done]], [[prefer-deterministic-adr-0009]].
