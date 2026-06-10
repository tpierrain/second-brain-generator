<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: ✅ SHIPPED (2026-06-03) — archive. Decision: decisions/0001-launcher-vs-brain.md -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — switch the install model (launcher ↔ brain)

> **STATUS: ✅ SHIPPED (2026-06-03).** The corresponding architecture decision is recorded in
> [`../../decisions/0001-launcher-vs-brain.md`](../../decisions/0001-launcher-vs-brain.md). Archive
> kept for the step detail (R, A→G).

---

## Original detailed plan

# PLAN — Launcher / brain decoupling ("the bootstrap CREATES the folder")

> **Purpose of this file**: self-sufficient plan. A **fresh** Claude session must be able
> to execute it reading ONLY this file + the cited source files. Written in `tmp/`
> (gitignored) → doesn't ship to the user. Repo: `second-brain-starter` (the *template*).
> **Mandatory TDD** discipline (load the skill `tdd-discipline`). **Manual** commits.
> Neutrality: no hardcoded name/absolute path (placeholders `{{…}}` only in the `*.template`).
> **Strict multi-OS (Windows included)**: see §4.

---

## 0. Objective (the "why")

Remove **the root cause** of all our git corner-cases: we **recycled the clone** of the starter
as the brain (in-place transform) → hence strip-remote, maintainer guardrail, `wasStub` gating…

**New model:** we **decouple**.
- **Launcher** = the cloned starter repo. **READ-ONLY source, reusable**: a single launcher
  on a machine can bootstrap several brains. The bootstrap **never** writes inside it.
- **Brain** = a **fresh folder that the bootstrap CREATES itself** (name + location given).
  Since we're the ones creating it, dropping the files in, then `git init` inside → **no link
  to the starter, by construction**. No more git surgery.

```
~/second-brain-starter   (cloned launcher, REUSABLE, never modified)
   └─ node bootstrap.mjs --name perso     → creates  <dest>/perso/   (git init, 0 remote)
   └─ node bootstrap.mjs --name boulot     → creates  <dest>/boulot/  (git init, 0 remote)
```

Role of **Claude** (stub): clone the launcher, ask the questions (**name**, **location**,
context, language), run **ONE** command. The bootstrap decides and does everything.

---

## 1. Determinism (guiding principle, not to be betrayed)

Mechanical + critical + repeatable → **in `bootstrap.mjs`** (deterministic, idempotent, self-verifying
via smoke-test + non-zero exit). Claude = minimal conversational wrapping (gather the answers,
1 command, relay the verdict + final instructions). We do NOT entrust the install sequence to Claude.

---

## 2. Current state of the code (facts VERIFIED 2026-06-03 — don't re-explore)

- **`bootstrap.mjs`** (~360 l.): `const ROOT = resolve(dirname(fileURLToPath(import.meta.url)))`
  (l.33) then `process.chdir(ROOT)` (l.34). **Everything operates on ROOT** (= the script's own folder):
  - `defaultProject` = basename of ROOT (l.113).
  - `replacements` (l.171-178): `{{PROJECT_ROOT}}: toPosix(ROOT)`, `{{PROJECT_NAME}}`,
    `{{OWNER_NAME}}`, `{{OWNER_CONTEXT}}`, `{{LANGUAGE}}`, `{{TMP_DIR}}: toPosix(tmpdir())`, `{{SOURCE_1}}`.
    **`toPosix()` already exists** and converts to forward-slash → settles the JSON/Windows issue for paths.
  - `gen(tpl, out, canOverwrite)` (l.182-194): substitutes `replacements` then writes `out`.
    Calls l.200-202: CLAUDE.md (overwrite stub via `isBootstrapStub`), .mcp.json, .claude/settings.json.
  - `.env` copied from `.env.example` (l.205-206), key written only if provided.
  - **Git block (l.~213-250)**: uses `planGitSetup({hasDotGit, wasStub, isMaintainer})` +
    `git init`/`remote remove`/`commit` on ROOT. ← **TO REMOVE/REPLACE** (in-place model).
  - Connectors (step 5), example notes (6), `npm install` rag (7, `join(ROOT,"rag")` l.313),
    index (8), smoke-test (9, reads `join(ROOT,".mcp.json")` l.341, `cwd: srv.cwd ?? ROOT` l.354).
- **`scripts/lib/git-init.mjs`**: `planGitSetup(...)` (Layer 2). ← **TO REMOVE** (+ its test
  `git-init.test.mjs`). No more in-place mode → no more strip-remote nor guardrail.
- **`scripts/auto-commit.mjs`**: **Layer 1 = push opt-in** (`secondbrain.autopush`). ← **KEEP**
  as-is (`auto-commit.test.mjs` too: 4 tests, including bare remote = behavioral check).
- **`scripts/lib/bootstrap-args.mjs`**: `parseAnswers(argv, env, defaults)` →
  `{projectName, ownerName, ownerContext, language, nonInteractive}`. Flags `--name/--owner/--context/--lang`
  (forms `--x v` AND `--x=v`), env `SB_*`, precedence flag>env>default; alias `--non-interactive/--yes/--no-input`.
  **Never accepts a secret.** ← **TO EXTEND**: add the location (`--dest`, env `SB_DEST`).
- **Tests**: `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` (40 green). Engine:
  `cd rag && npm test` (76) + `npx tsc --noEmit`.
- **Last commit** `c5d3627` (Layers 1+2). This plan **supersedes** Layer 2 (deliberate removal).
- **`tmp/` gitignored** (this plan lives there). `toPosix` = internal helper of bootstrap.mjs (look for its def).

---

## 3. Decisions locked with Thomas

1. **We refuse an EXISTING target folder.** Guarantees that the bootstrap is indeed the one creating the folder.
   No "put a brain into an existing repo" handling.
2. **We delete NOTHING.** The launcher stays in place, reusable; the user discards it if they want.
3. **Launcher = read-only.** The bootstrap never writes into the launcher (its CLAUDE.md stays
   the stub, its `rag/` stays without `node_modules`). Reusable for N brains.
4. **Copy = TRACKED files** of the launcher (`git -C <launcher> ls-files -z`) → auto-excludes `.git`,
   `node_modules`, `.env`, and the gitignored `CLAUDE.local.md` / `tmp/`.
   ⚠️ **CORRECTION (verified 2026-06-03)**: `DEVELOPING.md` is **TRACKED** (not gitignored),
   so `ls-files` includes it. **Thomas's decision: denylist in the copy** — `bootstrap.mjs`
   explicitly excludes `DEVELOPING.md` (constant `DEV_ONLY = new Set(["DEVELOPING.md"])`).
   We do NOT untrack it (it stays versioned/public). Tests, templates, `rag/` source → copied (OK).
5. **Layer 1 (push opt-in) kept; Layer 2 removed.**
6. **"Use this template" (GitHub)**: ~~recast as "just a way to obtain the launcher"~~
   → **REVISED 2026-06-03 (Thomas): REMOVED from the README.** In the local-first model (the brain
   is created by the bootstrap, 0 remote by default), "Use this template" adds nothing and risks
   reviving the old mental model ("this repo = my project"). We keep only `git clone <URL>`.
7. **README/SETUP rewritten in step E AFTER the code (A→C→D)** — Thomas's choice, to avoid any
   doc/code gap. Do NOT touch the README's in-place narrative before E (the 7 occ. "Use this
   template" + "a single folder / no second folder" will be replaced in one block in E).

---

## 4. Strict multi-OS (Windows included) — incompressible

- **Default location computed in Node**: `path.join(os.homedir(), name)`. **NEVER** a literal `~/…`.
  `--dest <parent>` overrides → target = `join(dest ?? homedir(), name)`. All paths
  via `path.join`/`path.resolve` (never a manual `/` concat).
- **PURE Node copy**: `git ls-files -z` (NUL → handles spaces/accents) + `mkdir` parents + `fs`
  copy. **NOT** `git archive | tar` (shell pipe + tar fragile on Windows).
- **`{{PROJECT_ROOT}}`** must stay forward-slash in the JSON → use `toPosix(TARGET)`
  (helper already present). Verify the generated `.claude/settings.json` stays valid JSON.
- `existsSync` for the refuse-if-exists; `git`/`npm` launched with explicit `cwd: join(target, …)`.
- No bash/jq/tar/sqlite3 dependency (consistent with the repo's philosophy).

---

## 5. Work (ordered, each in TDD) — = the "big steps"

### R. Rename `second-brain-starter` → `second-brain-generator` [to do FIRST]
> **Why this name.** "starter" = a seed we grow **in place** = the in-place model
> we're ABANDONING → wrong. "template" = something we copy/modify → wrong too.
> **"generator"** = a tool that **PRODUCES** outputs, **reusable**, **unmodified** →
> maps 1:1 onto "a read-only launcher generates N brains". The name tells the architecture.
> Chosen name: **Second Brain Generator** (en) / `second-brain-generator` (repo) / "générateur de
> second cerveau" (fr).

**R1 — Text (in-repo), to commit separately BEFORE A**:
- **Compound forms** (direct replacement, same length → ASCII banner alignment preserved):
  `Second Brain Starter` → `Second Brain Generator`; `second-brain-starter` → `second-brain-generator`.
  Known files: `.env.example`, `.gitignore`, `CLAUDE.md` (stub), `DEVELOPING.md`, `README.md`,
  `bootstrap.mjs` (comment l.3 + banner l.60). Safe command (zsh → list the files, not `$VAR`):
  `perl -i -pe 's/second-brain-starter/second-brain-generator/g; s/Second Brain Starter/Second Brain Generator/g' <files>`
- **bootstrap-stub marker** (keep in sync!): `<!-- second-brain-starter:bootstrap-stub -->`
  → `<!-- second-brain-generator:bootstrap-stub -->` in **`scripts/lib/claude-md.mjs`**
  (`BOOTSTRAP_STUB_MARKER`) AND **`CLAUDE.md`** (l.1) AND **`DEVELOPING.md`** (l.52). The test
  `claude-md.test.mjs` imports the constant (doesn't hardcode the string) → stays green. Verify
  `isBootstrapStub(CLAUDE.md) === true` afterward.
- **"starter" used ALONE** (≈30 occ.) — **designating the PROJECT** → "générateur" (correct FR:
  "le générateur enforce…", "récupérer le générateur"). Files: `README.md`, `CLAUDE.md`
  (stub, e.g. "Récupérer le générateur"), `SETUP.md`, `CONNECTORS.md`, `bootstrap.mjs`
  (comments + message "lien vers le générateur retiré"), `scripts/auto-commit.mjs`,
  `scripts/auto-commit.test.mjs`, `scripts/lib/git-init.mjs`, `scripts/lib/git-init.test.mjs`
  (⚠️ git-init.* will be removed anyway in step D), `.claude/skills/EXAMPLES.md`,
  `.claude/skills/tdd-discipline/SKILL.md`, `example-notes.mjs`. **By hand / targeted** (no
  blind replacement: "le creator/generator" ≠ wanted everywhere — think case by case).
- **"seed" metaphor: KEPT** (describes the *brain* we grow, ≠ the generator that
  produces it). Lives in `README.md` (L17-18, 212-213, 216, 230, 392-393). **Only adjustment**: L17
  "it's a **seed** (a *starter*)" conflates repo=seed → reword to "the **generator**
  **produces** a seed/skeleton you grow". (Confirm the fate of the metaphor with
  Thomas if in doubt — default: keep + recast L17.)
- **Checks**: `git grep -niE "second[ -]brain[ -]starter"` empty; `isBootstrapStub(CLAUDE.md)` true;
  harness + RAG suites green; `node --check bootstrap.mjs`. **Neutrality** OK.
- **Commit**: `chore: renommage second-brain-starter → second-brain-generator`.

**R2 — Remote GitHub repo (optional, doable IN session)**:
`gh repo rename second-brain-generator` (from the repo) then `git remote set-url origin <new-url>`.
GitHub **redirects** the old URL automatically. (If no `gh`/rights → guide Thomas.)

**R3 — Local folder on disk (MANUAL by Thomas, OUTSIDE the session)**:
⚠️ **Don't do this from an active Claude session**: the session is anchored on the path, and the
auto-memory is indexed on it (`~/.claude/projects/-Users-tpierrain-Dev-second-brain-starter/`).
Procedure to give to Thomas: close Claude Code, then
```bash
mv ~/Dev/second-brain-starter ~/Dev/second-brain-generator
mv ~/.claude/projects/-Users-tpierrain-Dev-second-brain-starter \
   ~/.claude/projects/-Users-tpierrain-Dev-second-brain-generator   # preserves the memory
```
then reopen Claude Code in `~/Dev/second-brain-generator`.

### A. Target resolution — `bootstrap-args.mjs` [TDD]
- Extend `parseAnswers`: recognize `--dest`/`--dest=` + env `SB_DEST` (precedence flag>env>default).
  Add a field for the location to the return (e.g. `destParent`, default `undefined`).
- **New PURE function** `resolveTargetDir({ name, destParent, home })` → absolute path of the
  target = `path.join(destParent ?? home, name)`. (Pure → `home` injected, no `os.homedir()`
  call inside, for testability + determinism.)
- **Tests** (red first): default = `join(home, name)`; `--dest` → `join(dest, name)`; forms
  `--dest v` and `--dest=v`; precedence flag>env>default; never a secret recognized (existing guard).

### B. Refuse-if-exists + list of tracked files [light-TDD]
- Small PURE helper to parse the `git ls-files -z` output → array of relative paths
  (split on `\0`, filter empties). Trivial test on a string `"a\0b/c\0"`.
- The refuse-if-exists (`existsSync(target)`) and the real copy (`fs`) are side-effects →
  covered by the e2e §6 (no artificial unit test). The error **message** if the target
  exists must be clear (but **do not** assert on the string in a test — cf. anti-fragile rule).

### C. Refactor `bootstrap.mjs` toward the TARGET model [the big piece]
- Introduce `TARGET` = `resolveTargetDir(...)`. **Refuse** (non-zero exit, clear message) if
  `existsSync(TARGET)`. Otherwise `mkdirSync(TARGET, { recursive: true })`.
- **Copy the tracked files** ROOT(launcher)→TARGET: `git -C ROOT ls-files -z` → for each,
  `mkdir` the parent in TARGET + `fs` copy. (ROOT stays intact.)
- **Redirect EVERYTHING to TARGET**: `gen()` writes into TARGET (templates read from TARGET, which
  received them in the copy); `.env` into TARGET; `{{PROJECT_ROOT}} = toPosix(TARGET)`; `npm install`
  in `join(TARGET,"rag")`; smoke-test reads `join(TARGET,".mcp.json")`, `cwd` = TARGET.
- **Brain git, trivial**: `git init` in TARGET + `add -A` + commit "initialisation du
  second cerveau" (non-fatal commit if no git identity). **Always** init (fresh folder),
  **no** conditional, **no** remote, **no** deletion. Remove `process.chdir(ROOT)`
  or replace it with explicit path usage (caution: no longer depend on cwd).
- `defaultProject`: derive from `--name` (otherwise fallback "second-brain"), no longer basename of ROOT.

### D. Removal of Layer 2
- Delete `scripts/lib/git-init.mjs` + `scripts/lib/git-init.test.mjs` + the import/usage
  `planGitSetup` in `bootstrap.mjs`. (Layer 1 / `auto-commit.mjs` **unchanged**.)
- Remove from `.claude/settings.json.template` the `Bash(git init:*)` permission? **No** — the
  bootstrap still does `git init` (but in the TARGET); and the user-side hook doesn't need it.
  Leave as-is unless inconsistent (verify).

### E. `CLAUDE.md` stub + README + SETUP [keep the stub marker]
- **`CLAUDE.md` stub** (keep `<!-- second-brain-starter:bootstrap-stub -->`): new runbook.
  - Step 1: clone the **launcher** (normal clone) `git clone --depth 1 <URL> <launcher-dir>`; `cd`.
    Clarify: **reusable launcher**, the bootstrap **creates a separate brain folder**.
  - Step 2: questions IN CHAT — **brain name**, **location** (default `~/<name>`), context,
    language. **Not the Gemini key.**
  - Step 3: ONE exact command
    `node bootstrap.mjs --non-interactive --name "<name>" --dest "<parent-location>" --owner "<user>" --context "<ctx>" --lang "<language>"`
    (`--dest` optional). The script **creates the folder**, refuses if it exists, does everything, judges success.
  - Step 4: relay + 3 final instructions → (a) key in `<brain>/.env`; (b) optional remote
    repo → if yes: `git remote add` + `git config secondbrain.autopush true`; if no: nothing
    (push opt-in off = no leak); (c) **reopen Claude Code in the CREATED BRAIN FOLDER**.
  - Guardrails: exact command, key never as an argument, idempotence (re-run = other name/clean
    failure if it exists), don't make things up.
- **README**: Option A (assisted) → minimal prompt *"Install me a second brain named `<name>`
  from `<URL>`"* + explain launcher↔brain + 3 final gestures. Option B ("Use this
  template") = just obtain the launcher.
- **SETUP**: §2 (the bootstrap creates the folder, refuses if it exists, reusable launcher, copy
  tracked files, 0 link by construction); flags `--name/--dest/...`; §7 push opt-in (already).

### F. Tests & e2e (multi-OS-safe)
- Unit A+B green (`resolveTargetDir`, parse `ls-files -z`).
- Full suite green: `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` (without git-init.*),
  `cd rag && npm test` + `npx tsc --noEmit`, `node --check bootstrap.mjs`.
- **E2E** (disposable copy of the launcher, see §6):
  - run 1: `--name perso --dest <tmp>` → assert: `<tmp>/perso` **created**; `.git` present **fresh**
    (1 commit, `git remote` **empty**); CLAUDE.md **is no longer the stub**; `.mcp.json` +
    `.claude/settings.json` generated (+ valid JSON, `{{PROJECT_ROOT}}` in `/`); `.env` empty key;
    `rag/node_modules` present; MCP smoke-test OK; **launcher INTACT** (its CLAUDE.md still
    the stub, no `rag/node_modules` added, the launcher's `git status` unchanged).
  - run 2: **reuse the same launcher** `--name boulot --dest <tmp>` → `<tmp>/boulot` created, OK
    → proves reusability.
  - run 3: refuse if it exists → re-run `--name perso` → **non-zero exit**, `<tmp>/perso` unchanged.
  - no-leak: write a note in `<tmp>/perso/vault` + run its `scripts/auto-commit.mjs` →
    local commit, `secondbrain.autopush` absent, `git remote` empty → no push (check via a bare
    repo as in `auto-commit.test.mjs`, **not** via a message string).

### G. Commit + push (manual, conventional, co-author Claude) — when everything is green.

---

## 6. E2E procedure (disposable copy, multi-OS in spirit)
```bash
# Disposable launcher (current working tree, without .git/node_modules/dev). We RE-init a .git
# to simulate a real cloned launcher (git ls-files needs a repo).
LAUNCH=$(mktemp -d)
rsync -a --exclude node_modules --exclude .git --exclude 'rag/.cache' --exclude 'rag/dist' \
  --exclude CLAUDE.local.md --exclude DEVELOPING.md --exclude tmp \
  <repo>/ "$LAUNCH"/
cd "$LAUNCH" && git init -q && git add -A && git -c user.email=t@e -c user.name=t commit -qm snap
DEST=$(mktemp -d)
node bootstrap.mjs --non-interactive --name perso  --dest "$DEST" --owner Hossam --context DevOps --lang français
node bootstrap.mjs --non-interactive --name boulot --dest "$DEST" --owner Hossam --context DevOps --lang français
# Checks: see §5.F. The launcher ($LAUNCH) must stay INTACT.
```
*(The real interactive test remains for Thomas to do in a real terminal — Claude doesn't drive a keyboard.)*

---

## 7. Execution order (= big steps, one per session after /clear)
0. **R** (rename → `second-brain-generator`, R1 text + commit; R2 GitHub optional; R3 folder = manual Thomas).
1. **A** (resolveTargetDir + --dest, TDD) → suite green.
2. **B** (parse ls-files -z, TDD).
3. **C** (refactor bootstrap → TARGET) + `node --check`.
4. **D** (removal of Layer 2).
5. **E** (stub + docs; verify `isBootstrapStub` still true).
6. **F** (e2e §6) — multi-brains + intact launcher + refuse-if-exists + no-leak.
7. **G** (commit + push) — only when everything is green.

---

## 8. To RESUME after a /clear
- Say: **"Resume the plan in `tmp/PLAN-launcher-vs-brain.md`, go to step <X>"**.
- Claude: read this file in full, load the skill **`tdd-discipline`**, execute the step via §5/§7.
- Keep sacred: determinism (§1), launcher read-only (§3), multi-OS (§4), strict TDD,
  **no assert on message strings** (test the real state/behavior).
- **Living tracking**: §9 (checkboxes) = source of truth of progress — update it at every step.

---

## 9. TRACKING — checkboxes (dashboard, single source of truth)

### R. Rename → `second-brain-generator` [FIRST]
- [x] R1 compound forms (`Second Brain Starter`/`second-brain-starter`) replaced; ASCII banner realigned (50 ch.)
- [x] R1 bootstrap-stub marker in sync (claude-md.mjs + CLAUDE.md + DEVELOPING.md); `isBootstrapStub` true ✓
- [x] R1 "starter" alone (project sense) → "générateur"; "seed" metaphor kept + L17 recast; "starter" remains only in `git-init.*` (removed in D)
- [x] R1 checks (git grep compound forms empty; 40 harness + 76 RAG + tsc + `node --check` green) + commit `chore: renommage …`
- [x] R2 GitHub repo renamed (`gh repo rename second-brain-generator`, remote auto-updated → `…/second-brain-generator.git`, fetch OK); R1 commit pushed
- [ ] R3 local folder — **manual by Thomas outside the session** (mv folder + mv memory folder)

### A. Target resolution (`resolveTargetDir` + `--dest`)
- [x] Test default = `join(home, name)` (red→green) + triangulation `destParent` → `join(dest, name)`
- [x] Test `--dest` (forms `v` and `=v`) → `destParent` (red→green)
- [x] Test precedence flag (`--dest`) > env (`SB_DEST`) > default
- [x] `parseAnswers` returns `destParent` (default `undefined`); anti-secret guard still green; `onlyDefaults` deepEqual updated (new field)
- [x] Suite green (44 harness tests) + `node --check bootstrap.mjs`

### B. Refuse-if-exists + parse `ls-files -z`
- [x] Pure helper `parseLsFilesZ` (`scripts/lib/tracked-files.mjs`): `"a\0b/c\0"` → `["a","b/c"]`, `""` → `[]` (red→green)
- [x] Pure helper `filterCopyable` + denylist `DEV_ONLY={DEVELOPING.md}` (`tracked-files.mjs`, red→green) — §3.4
- [ ] (side-effects refuse/copy → covered by e2e §F)

### C. Refactor `bootstrap.mjs` → TARGET model
- [x] `TARGET` resolved (`resolveTargetDir`); refuse if `existsSync(TARGET)` (exit 1, clear msg); `mkdir` otherwise
- [x] Copy of tracked files launcher→TARGET (pure Node, `ls-files -z` + `filterCopyable`); ROOT read-only
- [x] `gen` (templates read in TARGET) / `.env` / `{{PROJECT_ROOT}}=toPosix(TARGET)` / `npm install` / connectors / notes / smoke → all on TARGET
- [x] `git init` + commit in TARGET (always, 0 remote, 0 deletion); `chdir(ROOT)` removed; defaultProject `--name` ?? "second-brain"
- [x] `node --check bootstrap.mjs` OK; harness suite 47 green + RAG + tsc green

### D. Removal of Layer 2
- [x] `git-init.mjs` + `git-init.test.mjs` deleted; `planGitSetup` usage already removed in C; 0 residual ref
- [x] Layer 1 (`auto-commit.mjs`) unchanged and still green (43 harness after removing the 4 git-init tests)
- [x] `.claude/settings.json.template` verified: `git init` permission kept (consistent on the user-brain side)
- [x] DEVELOPING.md: 2 refs to `git-init.mjs` recast (`tracked-files.mjs`/`resolveTargetDir`)

### E. Stub + docs
- [x] `CLAUDE.md` stub rewritten (stub marker kept; launcher↔brain runbook, `--dest`, refuse-if-exists, 3 final instructions on `<brain>`)
- [x] `isBootstrapStub(CLAUDE.md)` still true; `CLAUDE.md.template` WITHOUT a marker (constitution ≠ stub)
- [x] README: "model" section rewritten (launcher↔brain, 0 link by construction), Option A (prompt + 3 gestures on `<brain>`), Option B (clone launcher → bootstrap creates folder → cd brain), "Use this template" recast as "a way to obtain the launcher" (§3.6), seed metaphor kept
- [x] SETUP §2 rewritten (creates the folder, refuse-if-exists, copy tracked files, `--dest`/`SB_DEST`, 0 link — removal of the Layer 2 strip-remote narrative); §3 (`cd <brain>`); §7 (other machine = clone of the brain, NOT bootstrap)
- [x] Neutrality: no personal name / hardcoded absolute path (placeholders `~/<name>`, `<location>`); in-place contradictions grep empty (apart from the recast "Use this template")

### F. Tests & e2e
- [x] Unit A+B green (`resolveTargetDir`, `parseLsFilesZ`, `filterCopyable`)
- [x] Full suite green: 43 harness (without git-init.*) + 76 RAG + tsc + `node --check`
- [x] E2E run1 (perso created, **E stub replaced**, intact launcher) + run2 (boulot, reusability) + run3 (refuse-if-exists, exit 1)
- [x] E2E no-leak: autopush **off** → **no push** (empty bare) + local commit OK; flip autopush=true + upstream → push follows the local (opt-in OK both ways)

### Final
- [x] Manual commits + push as we go (C `edc32b1`, D `e0096ce`, E `0ff9d01`, removal of "Use this template" `695705f`) — all green, all on origin/main
- [ ] **R3 reminded to Thomas** (cf. §11) — local folder + memory rename (manual gesture, Claude closed)

---

## 11. 🏁 CLOSING REMINDER — to bring up to Thomas once EVERYTHING is finished (after G)

> ⚠️ **For Claude (last session):** when A→G are finished/pushed, **give these instructions back
> to Thomas** (he explicitly asked: "you'll tell me how to do it at that point"). It's
> **R3**: align the **local folder** with the repo's new name. **You (Claude) do NOT do it** —
> the session is anchored on the path and the auto-memory is indexed on it.

**Message to give to Thomas:**

R3 = rename the folder on your disk (the GitHub repo is already `second-brain-generator`; the
local folder is still named `…second-brain-starter`). To do with **Claude Code closed**:

```bash
mv ~/Dev/second-brain-starter ~/Dev/second-brain-generator
mv ~/.claude/projects/-Users-tpierrain-Dev-second-brain-starter \
   ~/.claude/projects/-Users-tpierrain-Dev-second-brain-generator   # preserves the auto-memory
```

Then reopen Claude Code in `~/Dev/second-brain-generator`. The 2nd `mv` preserves the memory
(indexed by the project path). Non-blocking / purely cosmetic: could be done at any
time, but it's the last gesture that "closes" the rename end to end.

## 10. State (UPDATED 2026-06-03, end of session — step C finished)
**Done & committed locally (NOT yet pushed to origin):**
- **R** finished: R1 (text rename, commit `1c0ee33`, pushed), R2 (GitHub repo renamed
  `second-brain-generator`, remote updated, pushed). **R3 (mv local folder + memory folder) =
  remains to be done MANUALLY by Thomas, Claude Code closed** (cf. §5.R3).
- **A** committed `e7449f4` (`--dest`/`SB_DEST` + pure `resolveTargetDir`, 44 tests green).
- **B** committed `0e45b00` (pure `parseLsFilesZ`).
- **C** committed + **pushed** `edc32b1`: `bootstrap.mjs` refactored to the TARGET model
  (target resolution, refuse-if-exists, pure Node tracked-files copy, everything redirected to TARGET,
  trivial 0-remote `git init`, no more `chdir`/`planGitSetup`). Pure helper `filterCopyable` +
  denylist `DEVELOPING.md` (`tracked-files.mjs`, TDD red→green).
  **E2E validated** (§6, faithful launcher with DEVELOPING.md tracked): run1 perso (.git fresh 1 commit
  0 remote, CLAUDE.md de-stubbed, .mcp.json/settings.json generated + valid JSON, PROJECT_ROOT in
  `/`, .env empty key, rag/node_modules, **DEVELOPING.md NOT copied**, CLAUDE.local.md absent);
  run2 boulot (launcher reusability); run3 refuse-if-exists (exit 1, perso unchanged);
  **launcher stayed INTACT** (CLAUDE.md stub, no node_modules, git status unchanged).
- **D** committed + **pushed** `e0096ce`: `git-init.mjs`/`git-init.test.mjs` deleted, refs
  DEVELOPING.md recast, Layer 1 intact. Suite **43 harness + 76 RAG + tsc + `node --check`** green.
- **E** **coded, to commit**: `CLAUDE.md` stub rewritten (stub kept, launcher↔brain runbook,
  `--dest`, refuse-if-exists); README (model + Options A/B + "Use this template" recast); SETUP
  §2/§3/§7 rewritten. `isBootstrapStub` still true, `CLAUDE.md.template` without a marker, 43 harness green.
- ✅ **A, B, C, D pushed to origin/main**; E in the working tree.

**TO DO next = step F** (full e2e §6: multi-brains + intact launcher + refuse-if-exists +
**autopush no-leak** via a bare repo). Then G (final commit). ⚠️ After G: remind R3 to Thomas (cf. §11).

**Reminders:** This plan supersedes Layer 2 (removed in D) and the "in-place transform". Layer 1
(push opt-in) kept. Reference memory: `install-model-launcher-vs-brain`,
`feedback-no-string-fragile-asserts`.
