<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🗺️ ACTION PLAN (created 2026-06-17) — to execute, step-by-step, in TDD. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Action plan — Import UX: native folder picker (no copy-paste) + index-done notification

> **STATUS: 🗺️ ACTION PLAN** (created 2026-06-17). **To execute in TDD** (skill `tdd-discipline`).
> **Folds into v3.1.0 / PR #11** — these two UX features must land **before** the PR #11 push
> (Thomas's call). **Branch:** continue on `node-compat` (carries node-compat + import + ABI skew).
> **The `doctor` / "am I OK?" skill is OUT of this plan** → captured as a backlog idea only (step 7).
> Written so a fresh post-`/clear` session can execute it without re-discovering anything.

---

## 🎯 Why — two field UX frictions (observed during the 2026-06-17 import QA)

1. **Copy-paste of a directory path is a wall for non-dev users.** The `import` skill asks the user to
   *type* the path of their old brain. Without a **native folder picker**, ordinary users are stuck.
2. **Blind wait during reindex.** After an import, indexing runs (watcher / reindex) with no signal the
   user can act on → *"j'attendais pour rien avant de demander"*. We want a **notification when indexing
   finishes**.

Both are solved with the **same proven seam pattern** already used by `scripts/lib/open-env.mjs`
(CASE B `.env` auto-open): `buildXCommand(platform, …)` → `{command, args}` (or `null`) +
`shouldX(env, platform)` guard + a best-effort wrapper with an **injected `spawn`** that **never throws**.

---

## 📐 Design (frozen) — mirror `open-env.mjs`, stay deterministic (ADR 0009) + Mac/Win/Linux parity (ADR 0015)

### Feature 1 — Native folder picker for `import`
- **New seam `scripts/lib/folder-picker.mjs`** (pure + injectable, mirrors `open-env.mjs`):
  - `buildFolderPickerCommand(platform, prompt)` → `{command, args}` or `null`:
    - `darwin` → `{ command: "osascript", args: ["-e", `POSIX path of (choose folder with prompt "${prompt}")`] }`
    - `win32` → `powershell -NoProfile -Command` with `System.Windows.Forms.FolderBrowserDialog`,
      writing `$f.SelectedPath` to stdout only on `OK`.
    - `linux` → `{ command: "zenity", args: ["--file-selection", "--directory", `--title=${prompt}`] }`
    - else → `null`.
  - `shouldPickFolder(env, platform)` → `false` if `env.SBG_NO_PICKER`, `env.CI`, or
    `linux && !DISPLAY && !WAYLAND_DISPLAY`; else `true`.
  - `pickFolder({ platform, env, prompt, spawnSync })` → runs the command, returns the **trimmed path**
    on success, or `null` on cancel / non-zero exit / empty stdout / throw / guard-off. `spawnSync` injected.
- **New thin CLI `scripts/pick-folder.mjs`**: prints the chosen absolute path to stdout (exit 0), or
  exits **non-zero** when cancelled / no GUI. (Separate CLI — NOT folded into `import-brain.mjs` — so the
  skill picks **once** and reuses the path for BOTH plan and `--apply`, avoiding a double dialog.)
- **Wire the `import` skill** (`.claude/skills/import/SKILL.md` **and** `templates/fr/.claude/skills/import/SKILL.md`):
  Step 1 becomes: *"Try `node scripts/pick-folder.mjs`; if it prints a path, use it as `<source>`; if it
  exits non-zero (cancelled / headless), fall back to asking the user to type the path."* The FR template
  stays **in French** (product locale — do not anglicize).

### Feature 2 — Index-done notification
- **New seam `rag/src/lib/notify.ts`** (rag is TypeScript, like `native-deps.ts`):
  - `buildNotifyCommand(platform, { title, body })` → `{command, args}` or `null`:
    - `darwin` → `{ command: "osascript", args: ["-e", `display notification "${body}" with title "${title}"`] }`
    - `win32` → `powershell -NoProfile -Command` toast (best-effort; swallow if unsupported).
    - `linux` → `{ command: "notify-send", args: [title, body] }`
    - else → `null`.
  - `shouldNotify(env, platform)` → `false` if `env.SBG_NO_NOTIFY`, `env.CI`, or linux without a display; else `true`.
  - `notifyDone({ platform, env, title, body, spawn })` → best-effort, **never throws**, returns `{ notified }`.
- **Debounce by relevance:** notify **only when `result.indexed > 0`** (real new/changed notes), never on
  an all-unchanged pass → no spam on every MCP server start.
- **Wire in `rag/src/index.ts`** via a local `notifyIfIndexed(result)` helper at the 3 completion sites:
  1. **CLI mode** completion (after `reindex(force)`, ~L282) — the `import` Step 4 path.
  2. **MCP auto-reindex on server start** (~L293) — the **watcher/background** path that actually fired in
     the live QA (imported files picked up in the background).
  3. **MCP `reindex` tool** handler (~L174) — what Claude calls explicitly.
- **Keep automated flows silent:** set `SBG_NO_NOTIFY=1` in the **installer's** indexing step + the
  **post-flight smoke-test** + `scripts/verify-rag.mjs`, so install/QA don't pop a toast.

> **No machine path baked, existence-tested commands only, best-effort (exit 0 / never throw), injected
> spawn for tests** — same guarantees as `open-env.mjs`.

---

## 📋 Tracking

- [x] **0. Re-read grounding** before coding _(2026-06-17)_: `open-env.mjs` (seam template),
  `rag-launcher.mjs` (`buildRagInstallInvocation` win pattern), `import-brain.mjs` + `import/SKILL.md`
  (+ FR template), `rag/src/index.ts` completion sites confirmed.
- [x] **1. Feature 1 — folder-picker seam (TDD, `scripts/lib/folder-picker.mjs`)** _(2026-06-17 · 15/15)_
  - [x] 1a. RED→GREEN: `buildFolderPickerCommand("darwin", prompt)` → `osascript … choose folder`.
  - [x] 1b. Triangulate `win32` → powershell `FolderBrowserDialog`; `linux` → `zenity`; unknown → `null`.
  - [x] 1c. `shouldPickFolder` guards (`SBG_NO_PICKER`, `CI`, linux no-display).
  - [x] 1d. `pickFolder` with **injected `spawnSync`**: success → trimmed path; cancel/non-zero/empty/throw/guard-off → `null`.
  - [x] 1e. Refactor — RAS (seam mirrors `open-env.mjs` cleanly); suite green.
- [x] **2. Feature 1 — wire into the `import` flow** _(2026-06-17)_
  - [x] 2a. New `scripts/pick-folder.mjs` (prints path / exits non-zero). Guard-off path proven (exit 1); real osascript pop = manual QA.
  - [x] 2b. Update `.claude/skills/import/SKILL.md` Step 1 (picker-first, copy-paste fallback).
  - [x] 2c. Mirror in `templates/fr/.claude/skills/import/SKILL.md` (**French preserved**).
- [x] **3. Feature 2 — notify seam (TDD, `rag/src/lib/notify.ts`)** _(2026-06-17 · 13/13)_
  - [x] 3a. RED→GREEN: `buildNotifyCommand("darwin", …)` → `osascript … display notification`.
  - [x] 3b. Triangulate `win32` → powershell toast; `linux` → `notify-send`; unknown → `null`.
  - [x] 3c. `shouldNotify` guards (`SBG_NO_NOTIFY`, `CI`, linux no-display).
  - [x] 3d. `notifyDone` with **injected `spawn`**: guard-on+cmd → `{notified:true}`; guard-off / spawn-throws → `{notified:false}`, never throws.
  - [x] 3e. Refactor; suite green.
- [x] **4. Feature 2 — wire into `rag/src/index.ts`** _(2026-06-17)_
  - [x] 4a. Local `notifyIfIndexed(result)` (calls `notifyDone` when `result.indexed > 0`).
  - [x] 4b. Call it at the 3 sites (CLI / MCP auto-reindex / reindex tool). Watcher catch-up left silent (toast on every note edit = spam).
  - [x] 4c. Set `SBG_NO_NOTIFY=1` in installer indexing + post-flight + `scripts/verify-rag.mjs`.
- [x] **5. Suites green** _(2026-06-17)_ — harness **270/270** (255 + 15), rag **164/164** (151 + 13), `tsc` clean.
- [x] **6. Docs — README "Notes for Claude Desktop users" + SETUP §8 pointer** _(2026-06-17)_
  - [x] 6a. New `## 📝 Notes for Claude Desktop users` section in `README.md`, just before `## What's next?` ("one warm engine per open brain").
  - [x] 6b. `SETUP.md` §8 Troubleshooting → one-line pointer to that README section.
- [x] **7. Backlog — capture the `doctor` idea (+ note these 2 shipped)** _(2026-06-17)_
  - [x] 7a. New `maintainers/plans/post-v3.1.0-ux-backlog.md` (💡 BACKLOG, checkboxes): the **`doctor` / "am I OK?"
    check-up skill** + folder-picker / index-notify noted as shipped in PR #11.
- [x] **8. Integrate into PR #11 + push** _(2026-06-17 · `3518975`)_
  - [x] 8a. Committed features + docs + backlog + this plan in `3518975`; `b41e1f6` (QA 8c) + `5b0237a` (this plan) rode along.
  - [x] 8b. `git push` `node-compat` → `0ace9c5..3518975` → PR #11 reflects everything.
  - [ ] 8c. Then resume the v3.1.0 ship tracker (`node-abi-skew-install-runtime-action.md` step 8d merge+tag / 8e archive) on Thomas's explicit go.

> Cocher `- [x]` _(date · commit)_ à chaque étape terminée — mémoire qui survit aux `/clear`.

---

## 🧭 État pour reprise (après `/clear`)

- **➡️ PROCHAINE ACTION = étape 1** (seam `folder-picker.mjs` en TDD), puis 2→8. Tout le design est figé ci-dessus.
- **Repo** `~/Dev/second-brain-generator`, branche **`node-compat`** (PR #11 ouverte). **Arbre propre**, sauf
  **1 commit local non poussé** `b41e1f6` (QA 8c) — il partira avec le push de l'étape 8b.
- **Discipline TDD** (skill `tdd-discipline`) : seams purs d'abord, `spawn`/`spawnSync` **injectés** (pas de
  dialogue/toast réel en test), un seul test à la fois, fail-first.
- **Réutiliser SANS recopier** : le moule `open-env.mjs` (`buildOpenEnvCommand` + `shouldOpenEnv` +
  wrapper best-effort injecté). Le `cmd /c` Windows : voir `buildRagInstallInvocation` dans `rag-launcher.mjs`.
- **Runners de test** : harness = `scripts/lib/*.test.mjs` (node `--test`) ; rag = `npm test --prefix rag`
  (`node --import tsx --test src/lib/*.test.ts`). `tsc` doit rester clean côté rag.
- **Garde-fous** : best-effort exit 0 / never throw ; pas de chemin machine en dur ; notif seulement si
  `indexed > 0` ; `SBG_NO_PICKER` / `SBG_NO_NOTIFY` respectés ; Mac+Win+Linux (ADR 0015) ; déterministe (ADR 0009).
- **Périmètre** : ces 2 features + docs + backlog `doctor` → **dans PR #11 avant push** ; **merge/tag v3.1.0
  reste l'étape 8d** du plan ABI, sur feu vert explicite séparé. **`doctor` ne se code PAS ici.**
- **Mémoires liées** : [[mcp-concurrent-brain-windows]] (à mettre à jour : cycle de vie MCP adossé au process
  `claude` parent), [[node-compat-then-import-plans]], [[abi-skew-fix-resume]], [[prefer-deterministic-adr-0009]],
  [[auto-open-env-shipped]] (le précédent seam GUI), [[run-node-self-heal-design]].
