<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: ✅ SHIPPED AND PUSHED (2026-06-03) — archive, nothing left to resume. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — "install my second brain" onboarding driven by Claude

> **STATUS: ✅ SHIPPED AND PUSHED (2026-06-03).** All sections A→E shipped. Last commit
> of the series `af406b8`. Archive kept for the *why*; nothing to resume.

## Summary of what was shipped

The user starts from Claude Code + the repo URL, **a single instruction**; Claude asks the
questions out loud then delegates **all** the machinery to the deterministic script `bootstrap.mjs`
(principle: determinism in the script, Claude = minimal wrapping). Sections checked:

- **(A)** `--non-interactive` mode + `scripts/lib/bootstrap-args.mjs` (`parseAnswers` → flags
  `--name/--owner/--lang`, env `SB_*`, precedence flag > env > default).
- **(B)** auto `git init` of the brain (`git-init.mjs`).
- **(C)** `CLAUDE.md` stub rewritten as a self-install notice (`bootstrap-stub` marker kept).
- **(D)** README docs option A/B + SETUP + DEVELOPING.
- **(E)** tests + e2e.

The **Gemini key is deferred** to `.env` (never chat/argv).

## E2E validation (✅ DONE 2026-06-03)

The e2e ran in a **disposable copy** (`mktemp -d`, detached copy without `.git`) via
`node bootstrap.mjs --non-interactive`: exit 0; `CLAUDE.md` stub (`bootstrap-stub` marker)
properly **replaced** by the real constitution; `.mcp.json` + `.claude/settings.json` generated;
auto `git init` (1 commit); `.env` with empty key; RAG deps installed; MCP smoke-test OK (5 tools);
then vault note + `auto-commit.mjs` → local commit without a remote, **no push, no error**.
Additionally locked by the non-regression test `scripts/auto-commit.test.mjs`.

> **Remains outside Claude's scope:** the real **interactive** test of the wizard (questions +
> connectors at the keyboard) that only Thomas can drive in a real terminal.

---

## Original detailed plan

# PLAN — Claude-assisted install ("Claude-driven onboarding")

> **Purpose of this file**: self-sufficient plan. A **fresh** Claude session must be able
> to execute it reading ONLY this file + the cited source files. Written in `tmp/`
> (gitignored) → doesn't ship to the user. Repo: `second-brain-starter` (the *template*,
> not a user brain). **Mandatory TDD** discipline (load the skill `tdd-discipline`).
> **Manual** commits (no auto-commit hook in this repo). Neutrality: no hardcoded
> name/absolute path (placeholders `{{…}}` only in the `*.template`).

---

## 0. Objective (the "why" / the target UX)

Allow a user (e.g. **Hossam**, DevOps engineer, tomorrow morning) to install their second
brain **starting only from Claude Code + the repo URL** (to which they have access), with **a
single instruction**. Claude asks the questions out loud, then **delegates all the machinery
to the deterministic script `bootstrap.mjs`**, and finishes with 2 manual instructions.

### Target flow
```
USER (in Claude Code, outside the repo):
  "Create me a second brain named 'mon-cerveau' from this starter: <URL>.
    Make a COPY of it (not a clone linked to this repo), then install it following its CLAUDE.md.
    Ask me the necessary questions, but do NOT ask me for my Gemini key."

CLAUDE:
  1. git clone --depth 1 <URL> mon-cerveau   (then DELETE mon-cerveau/.git → detached copy)
  2. cd mon-cerveau ; reads CLAUDE.md (= the stub = the self-install NOTICE)
  3. asks the questions IN CHAT: project name, your name, your context, language (NOT the key)
  4. node bootstrap.mjs --non-interactive --name "…" --owner "…" --context "…" --lang "…"
     → the SCRIPT does everything: git init, generates files, installs RAG, smoke-test (deterministic)
  5. relays the result + states the 2 final steps:
       a. "paste your Gemini key into .env" (never in the chat)
       b. "do you want a REMOTE git repository (backup + multi-machine)?" → cf. §Decisions
       c. "close/reopen Claude Code in 'mon-cerveau'" (activates the RAG MCP server)
```

---

## 1. Determinism — who does what (GUIDING PRINCIPLE, not to be betrayed)

Claude is **not** reliable for executing a long mechanical sequence. Therefore:

- **Everything mechanical + critical + repeatable → `bootstrap.mjs`** (deterministic,
  idempotent, self-verifying: it ends with the MCP smoke-test and `process.exit(1)` if it breaks).
- **Claude = minimal conversational wrapping**: (a) gather the answers in natural language,
  (b) call **ONE exact command**, (c) relay the script's verdict + 2 final instructions,
  (d) handle the "remote repo" conversation (case by case, not mechanizable).
- Anti-drift guardrails written into the stub: **exact command to copy** (not to
  interpret), `--non-interactive` **mandatory**, idempotence, **key never as an argument**.

> We do NOT entrust the install steps to Claude. The ~9 steps stay in the script.

---

## 2. Current state of the code (verified facts — to avoid re-exploring)

- **`bootstrap.mjs`** (root, ~290 l.): 9 numbered steps `X/9`. `interactive = stdin.isTTY`.
  - Helper `ask(prompt, def)` → returns `def` if `!rl` (non-TTY).
  - **Non-interactive today = raw default values** (ownerName=""), connectors
    skipped, example notes kept. ⇒ NO way to inject the answers. **TO ADD.**
  - Generation via `gen(tpl, out, canOverwrite)`; `gen(CLAUDE.md.template → CLAUDE.md,
    isBootstrapStub)` ⇒ replaces the stub with the real constitution.
  - `.env`: copied from `.env.example` (key `GOOGLE_GEMINI_API_KEY=` **empty**); key written
    only if provided. Deferring the key = leave it empty → step 8/9 "indexing deferred".
  - **❗ The bootstrap does NOT do `git init`.** It assumes a `.git` already present (clone / Use
    this template). In the "detached copy" flow (we delete `.git`), it must be added.
- **`scripts/auto-commit.mjs`**: PostToolUse hook. **ALREADY handles the absence of a remote**:
  `const hasRemote = git(["remote"]).out.trim().length > 0; if (hasRemote && !push) …`.
  ⇒ "no to the remote repo" = local commit, **no push attempted, no error**. ✅ (To be
  locked by a non-regression test.)
- **`scripts/lib/claude-md.mjs`**: `BOOTSTRAP_STUB_MARKER = "<!-- second-brain-starter:bootstrap-stub -->"`
  ; `isBootstrapStub(content)` = contains the marker. **The rewrite of the stub MUST keep
  this exact marker** (otherwise the bootstrap no longer replaces it → breaks DEVELOPING #3).
- **`CLAUDE.md`** (root) = the current stub (marker present): says "the installer is
  interactive, you can't drive it, tell the user to launch it themselves". **TO INVERT.**
- **`.claude/settings.json.template`**: auto-commit hook (`{{PROJECT_ROOT}}/scripts/auto-commit.mjs`)
  + permissions (git add/commit/push/init? → **check `git init` is allowed**, otherwise add it
  to the whitelist: currently no `Bash(git init:*)`).
- **Harness tests**: `node --test scripts/lib/*.test.mjs` (27 green). Engine: `cd rag && npm test`.
- **`tmp/` is gitignored** (this plan lives there). `PLAN-*.md` at the root would NOT be.

---

## 3. Decisions already made with Thomas (locked)

1. **Copy, not linked clone**: grab the files then **detach** (`rm -rf .git`); folder
   at the **right name from the start**.
2. **Gemini key deferred to `.env`**: Claude installs everything except the key; the key never
   transits through the chat nor the command line. Index built at the 1st start of the MCP.
3. **Local `git init` = automatic and indispensable** (foundation of auto-commit). This is NOT the
   question asked to the user.
4. **The "remote repo" question at the very end, with the explicit STAKES**:
   phrase ≈ *"Do you want a **remote** git repo so that your second brain has a **backup**,
   or is even **usable from multiple machines**?"*
   - **If NO**: do nothing. Everything stays versioned locally, nothing is lost; the
     auto-commit hook **doesn't attempt to push** (already handled) → no error. Possibility to add
     one later. **Verify/guarantee by test** that "no remote" breaks nothing.
   - **If YES**: ask for **platform** (GitHub / GitLab / Azure DevOps…) + **name**. Create/wire
     the remote (`gh repo create` if available, otherwise `git remote add` + `git push -u`, otherwise guide).
     GitHub = simple case; other platforms = best-effort + guidance if CLI/auth absent.
5. **Determinism**: cf. §1. Machinery in the script; Claude = minimal wrapping.

---

## 4. Incompressible constraints (to accept/document, not to "solve")

- **Final restart**: the RAG engine is an MCP server loaded at the **start** of Claude
  Code → reopen Claude Code in the folder after install. Unavoidable.
- **Access to the private repo**: as long as the repo is private, cloning/downloading requires
  **access** (GitHub account with rights). Unavoidable until going public.
- **Remote repo creation**: depends on the platform + the local auth → the most
  fragile part, handled best-effort by Claude (not by the script).

---

## 5. Work (ordered, each in TDD)

### A. Non-interactive mode DRIVEN by flags — `bootstrap.mjs` [TDD]
**New** `scripts/lib/bootstrap-args.mjs`: **pure** function `parseAnswers(argv, env, defaults)`.
- Recognizes: `--name`, `--owner`, `--context`, `--lang` (forms `--x v` AND `--x=v`); flag
  `--non-interactive` (alias `--yes`/`--no-input`) → `nonInteractive: true`.
- Precedence: **flags > env** (`SB_PROJECT_NAME`, `SB_OWNER_NAME`, `SB_OWNER_CONTEXT`,
  `SB_LANGUAGE`) **> defaults** provided.
- **NEVER accepts the Gemini key** (security: no secret in argv).
- Returns `{ projectName, ownerName, ownerContext, language, nonInteractive }`.

**Test** `scripts/lib/bootstrap-args.test.mjs` (red first):
- `--name=mon-cerveau --owner "Jane Doe"` → correct parse of both forms.
- precedence flag > env > default; absent → defaults.
- `--non-interactive` → `nonInteractive:true`.
- no key/secret recognized even if `--gemini-key xxx` passed (ignored).

**Wiring in `bootstrap.mjs` (§2 Personalization)**:
- At the top: `const cli = parseAnswers(process.argv.slice(2), process.env, { projectName:
  defaultProject, ownerName: gitUser, ownerContext: "professional use", language: "français" })`.
- `const interactive = stdin.isTTY && !cli.nonInteractive;`
- **Non-interactive** branch: use `cli.*` (instead of the current raw defaults). Interactive
  branch: prompts pre-filled with `cli.*` as defaults.
- **Key**: in non-interactive, always defer (`geminiKey=""`). Never read from argv.
- Connectors + example notes: **stay skipped** in non-interactive (current behavior OK).

### B. `git init` if no repo — `bootstrap.mjs` [light-TDD]
- Pure helper (in `bootstrap-args.mjs` or a small `git-init.mjs`) `shouldInitGit(root)` =
  `!existsSync(join(root, ".git"))`. Trivial test.
- In `bootstrap.mjs`, **right after the file generation (§4)**: if `shouldInitGit`,
  `git init` + `git add -A` + `git commit -m "chore: initialisation du second cerveau"`.
  Idempotent (skip if `.git` present). Message `ok("local git repo initialized")`.
- **Do NOT renumber** the `X/9` (to avoid doc drift): integrate this sub-step into the existing
  generation step, without a new numbered header.
- Add `Bash(git init:*)` to the whitelist of `.claude/settings.json.template`.
- The git side-effect is integration → covered by the e2e (§7), not an artificial unit test.

### C. Rewrite the `CLAUDE.md` stub → SELF-INSTALL NOTICE [keep the marker]
File `CLAUDE.md` (root). **Keep `<!-- second-brain-starter:bootstrap-stub -->`** at the top.
Content = runbook **addressed to Claude**, imperative and short:
- **Preamble**: "This repo is not installed yet. If the user asks to create/install
  their second brain, follow these steps EXACTLY."
- **Step 1 — (if starting from a URL, repo not yet local)**: `git clone --depth 1 <URL> <name>`
  then **`rm -rf <name>/.git`** (detached copy), `cd <name>`. *(Often already done if Claude reads this
  file from inside the repo.)*
- **Step 2 — Ask the questions IN CHAT, grouped**: project/folder name, user's name,
  context, language. **DO NOT ask for the Gemini key.**
- **Step 3 — Run the EXACT command** (copy, do not paraphrase):
  `node bootstrap.mjs --non-interactive --name "<name>" --owner "<user name>" --context "<context>" --lang "<language>"`
  ⚠️ `--non-interactive` mandatory (otherwise keyboard block). Idempotent. The script does EVERYTHING
  (git init, files, RAG install, smoke-test) and **judges success itself** (non-zero exit
  = failure → relay the error, don't "pretend").
- **Step 4 — Relay + 2 (3) final instructions**:
  a. "Paste your Gemini key into `.env` (line `GOOGLE_GEMINI_API_KEY=`)." — never in the chat.
  b. **Remote repo question** (phrasing §3.4, with backup/multi-machine stakes). If yes →
     platform + name → create/wire (gh/glab/az or `git remote add` + guidance). If no → do
     nothing (the hook won't push, that's certain).
  c. "Close and reopen Claude Code in `<name>`" → activates the RAG MCP server (indexes at startup).
- **Guardrails** reminded: exact command, key never as an argument, idempotence, don't make things up.

> ⚠️ The `CLAUDE.md.template` (the REAL generated constitution) is a **distinct** file — don't
> confuse it. Here we only touch the `CLAUDE.md` **stub**.

### D. Docs — README + SETUP + DEVELOPING
- **README** ("Ready to try?" section): add **"Option A — Claude-assisted start
  (the simplest)"** = the copy-paste prompt (cf. §0), + the 2 final steps + "no to
  the remote = safe". Keep **"Option B — Manual (`node bootstrap.mjs`)"**. Keep the
  Connectors section (already shipped).
- **SETUP**: document the flags `--non-interactive --name/--owner/--context/--lang`; the
  auto `git init`; the remote repo decision (+ "no remote = no push = safe"); the deferred
  key. Align the step numbers if needed.
- **DEVELOPING**: backlog → mark "`--non-interactive` option" **shipped**; add a design note
  "Claude-driven onboarding (determinism: script does everything, Claude = wrapping)".

### E. Tests & e2e
- `scripts/lib/bootstrap-args.test.mjs` (cf. A).
- **"No remote" non-regression**: `scripts/auto-commit.test.mjs` — create a temp repo
  (`git init` in tmpdir), modify a file, run `auto-commit.mjs`, assert: 1 commit
  created, **no remote**, no error/no push. (Medium complexity: spawn git + node.)
- Full suite green: `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` + `cd rag &&
  npm test` + `node --check bootstrap.mjs`.
- **E2E at the target** (disposable copy, see §6): clone → `rm -rf .git` → `node bootstrap.mjs
  --non-interactive --name test-brain --owner "Hossam" --context "DevOps" --lang français`.
  Assert: `CLAUDE.md` is no longer the stub (marker absent), `.mcp.json` + `.claude/settings.json`
  generated, `.git` present (git-inited), `.env` present (empty key), RAG deps installed, MCP smoke-test
  OK. Then write a vault note + run `auto-commit.mjs` → local commit, no push error.

---

## 6. E2E procedure (disposable copy, WITHOUT a destructive rm -rf on the template)
```bash
# Fresh folder, timestamped by the caller if needed (no Date.now in a workflow script).
SBS=/tmp/sbs-e2e-claude-driven
rsync -a --exclude node_modules --exclude .git --exclude rag/.cache \
  ~/Dev/second-brain-starter/ "$SBS"/
cd "$SBS"
# Simulate the "detached copy": no .git (rsync excluded it) → bootstrap must git-init.
node bootstrap.mjs --non-interactive --name test-brain --owner "Hossam" --context "agent DevOps" --lang français
# Checks: see §5.E.
```
*(The real interactive test of the connectors/questions wizard remains for Thomas to do in a real
terminal — Claude can't drive a keyboard prompt.)*

---

## 7. Recommended execution order
1. **A** (parseAnswers + test → red→green) then wire into bootstrap.
2. **B** (git init + permission whitelist).
3. `node --check bootstrap.mjs` + green test suite.
4. **C** (rewrite CLAUDE.md stub, marker kept) — verify `isBootstrapStub` still true.
5. **D** (docs).
6. **E** (non-regression tests + e2e §6).
7. **Manual commit + push** (conventional message, co-author Claude). Not before everything is green.

---

## 8. To RESUME after a /clear
- Tell Claude: **"Resume the plan in `tmp/PLAN-claude-driven-install.md`"**.
- Claude: read this file in full, then `DEVELOPING.md` (auto-loaded), load the skill
  **`tdd-discipline`**, and execute §5 in the §7 order. Strict TDD, manual commits, neutrality.
- Keep the **§1 principle** sacred: determinism in the script, Claude minimal.
- **Living tracking**: section §9 (checkboxes) is the source of truth of progress — Claude
  updates it at every step taken.
- **State at the time of writing this plan**: nothing of A–E started. The previous commit
  (`feat(connectors)…`) is already pushed and independent.

---

## 9. TRACKING — checkboxes (dashboard, single source of truth)

> Updated by Claude at every baby-step / step taken. Item detail: §5 + §7.

### A. Flag-driven non-interactive mode (`parseAnswers` + wiring) ✅ DONE
- [x] Test 1 — form `--x=v` (red→green)
- [x] Test 2 — form `--x v` (space) (red→green)
- [x] Test 3 — precedence flags > env > defaults; absent → defaults (red→green)
- [x] Test 4 — `--non-interactive` (+ alias `--yes`/`--no-input`) → `nonInteractive:true` (red→green)
- [x] Test 5 — key/secret NEVER recognized (`--gemini-key xxx` ignored) — guard test (already green: whitelist `VALUE_FLAGS`, flagged)
- [x] `parseAnswers` returns `{ projectName, ownerName, ownerContext, language, nonInteractive }`
- [x] Wiring `bootstrap.mjs`: `const cli = parseAnswers(...)` + `interactive = isTTY && !cli.nonInteractive`
- [x] Non-interactive branch uses `cli.*`; interactive branch pre-filled with `cli.*`
- [x] Key always deferred in non-interactive (`geminiKey=""`), never read from argv (via `ask()`→"" when `rl=null`; `parseAnswers` reads no key)
- [x] Suite green: 32 tests (27 + 5), `node --check bootstrap.mjs` OK

### B. `git init` if no repo ✅ DONE
- [x] Pure helper `shouldInitGit(root)` + test (`scripts/lib/git-init.mjs` + `.test.mjs`, red→green, 2 tests)
- [x] Wiring `bootstrap.mjs` (after §4 generation, without a new numbered header): `git init -q` + `add -A` + `commit`, idempotent (skip if `.git`), non-fatal commit if no git identity
- [x] `Bash(git init:*)` added to the whitelist `.claude/settings.json.template`
- [x] Suite green: 34 tests, JSON template + `node --check bootstrap.mjs` OK
- [~] Real git side-effect = integration → covered by the e2e §E (no artificial unit test)

### C. Rewrite the `CLAUDE.md` stub → SELF-INSTALL NOTICE ✅ DONE
- [x] Marker `<!-- second-brain-starter:bootstrap-stub -->` kept at the top
- [x] Runbook addressed to Claude (steps 1→4: detached copy, questions in chat without the key, exact `--non-interactive` command, 3 final instructions including remote repo) + guardrails
- [x] `isBootstrapStub(CLAUDE.md)` still true after rewrite (verified) → the bootstrap will indeed replace the stub
- [x] Neutrality: no personal name / absolute path (placeholders `<name>`, `<REPO_URL>`)

### D. Docs ✅ DONE
- [x] README — "Option A: Claude-assisted start" (copy-paste prompt + 3 final gestures + "no to the remote = safe") + "Option B: manual" (ex-3 steps)
- [x] SETUP §2 — sub-section flags `--non-interactive --name/--owner/--context/--lang` (+ env `SB_*`, precedence), auto git init, deferred key, remote repo decision; git init mention in the numbered list
- [x] DEVELOPING — backlog `--non-interactive` marked shipped + design note "Claude-driven onboarding" (determinism: script does everything, Claude = wrapping)

### E. Tests & e2e ✅ DONE
- [x] `bootstrap-args.test.mjs` complete (cf. A) — 5 green tests (forms `--x=v`/`--x v`, precedence, alias `--non-interactive`, anti-secret guard)
- [x] "No remote" non-regression: `scripts/auto-commit.test.mjs` (2 tests) — local commit without a remote = no push/no error; clean tree = no superfluous commit. Characterization test (green from the start, flagged)
- [x] Full suite green: 36 harness (`scripts/lib/*.test.mjs` + `scripts/*.test.mjs`) + 76 RAG engine (`cd rag && npm test`) + `node --check bootstrap.mjs` OK
- [x] E2E disposable copy (§6) green — `--owner "Hossam" --context "agent DevOps"`: stub replaced (marker absent), `.mcp.json` + `.claude/settings.json` generated, `.git` git-inited (1 commit), `.env` empty key, RAG deps installed, MCP smoke-test OK (5 tools), Hossam injected; then vault note + `auto-commit.mjs` → local commit, no push, no error

### Final ✅ DONE
- [x] Manual commit + push (conventional, co-author Claude) — `af406b8` pushed on `main` (also carries the not-yet-pushed A–D commits). All green before push.
