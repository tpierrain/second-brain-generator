# Plan — Rename `bootstrap` → `installer` (clarity for people)

> **Status: ✅ SHIPPED** (2026-06-07, commit `24f1240`). Full rename applied
> (D1 `installer.mjs` · D2 complete · D3 marker `installer-stub` · D4 no shim).
> Net verified: suite **74/74 green**, **E2E install exit 0** + MCP connection OK,
> and the generated `CLAUDE.md` carries **no marker** (end-to-end proof that
> `isInstallerStub` recognizes the new value and overwrites the stub). Only
> remaining mention of "bootstrap": a generic usage in the example vault
> (intentional). Archive — nothing left to resume.

## Motivation (Thomas, 2026-06-07)

"bootstrap" isn't crystal clear to a general audience. **"installer"** is more
faithful to what the script does and **more readable for people**. The driver of
the rename is therefore **user-facing readability** → absolute priority on the
**file name + command + docs**. The rest (internal identifiers, comments) follows
for consistency.

> **Reviewed after the run-node plan (2026-06-07).** The **occurrence counts
> below remain accurate**: the `harden-run-node-smoke-and-coverage` delivery
> introduced **no** new "bootstrap" references. Only **line numbers drifted**
> (lines added in `SETUP.md` ≈ +5, `DEVELOPING.md` ≈ +12) — the pivots have been
> re-anchored in steps 3-5. The executor is still encouraged to **grep** (step 8)
> rather than rely on line numbers, which remain a snapshot.

## Inventory of references (surveyed 2026-06-07, `git ls-files`, excluding `maintainers/`)

**Files to rename:**
- `bootstrap.mjs` → `installer.mjs` (the script itself, 13 internal occurrences)
- `scripts/lib/bootstrap-args.mjs` → `scripts/lib/installer-args.mjs`
- `scripts/lib/bootstrap-args.test.mjs` → `scripts/lib/installer-args.test.mjs`

**CRITICAL reference (pivot of the assisted flow):**
- `CLAUDE.md` (stub, l.47): the **exact command** `node bootstrap.mjs
  --non-interactive --name … --dest … --owner … --lang …` that Claude **copies
  verbatim**. Any typo breaks the Claude-driven install.

**User-facing docs (to sweep):** `README.md` (9), `SETUP.md` (19, including the
non-interactive command l.105 and the troubleshooting table l.277-278 —
re-anchored post run-node), `CONNECTORS.md` (2), `.env.example` (1, "done by node
bootstrap.mjs").

**Dev docs:** `DEVELOPING.md` (18, including the test snippet l.106 — re-anchored
post run-node — `… && node bootstrap.mjs < /dev/null`), `.gitignore` (2, comments
l.43/47).

**Code (comments + 1 identifier):** `scripts/lib/rag-launcher.mjs` (5, comments
"written by the bootstrap"), `scripts/lib/claude-md.mjs` (4, including the
**marker** — see D3), `scripts/lib/demo.mjs`, `example-notes.mjs`,
`gemini-key.mjs`, `mcp-smoke.mjs`, `connectors-catalog.mjs` (comments),
`scripts/verify-rag.mjs` (2), `scripts/lib/claude-md.test.mjs` (6, test names +
marker), `bootstrap-args.test.mjs` (1).

**"Tangential" mentions (fix if relevant, otherwise leave):**
`vault/backlog/harnais.md` (1), `.claude/skills/tdd-discipline/SKILL.md` (1).

> The **marker** lives in `scripts/lib/claude-md.mjs`:
> `BOOTSTRAP_STUB_MARKER = "<!-- second-brain-generator:bootstrap-stub -->"`,
> tested by `isBootstrapStub()`. See **D3**.

## Decisions to validate (before executing)

- **D1 — File/command name.** Recommended: **`installer.mjs`** (the "tool noun",
  consistent with the existing English filename) → `node installer.mjs …`.
  Alternative: `install.mjs` (reads as "verb/action"). *To be decided.*
- **D2 — Scope.** Recommended: **full rename** (file + command + docs +
  comments + lib identifiers) → total consistency, no residual "bootstrap"
  that would confuse a future dev. The "minimal" alternative (file + command +
  docs only) is faster but leaves the code inconsistent. *Reco: full.*
- **D3 — Marker `bootstrap-stub` / `isBootstrapStub`.** Recommended (if D2 full):
  rename to `installer-stub` / `isInstallerStub` /
  `INSTALLER_STUB_MARKER = "<!-- second-brain-generator:installer-stub -->"`.
  ⚠️ Benign wrinkle: an already-generated CLAUDE.md carrying the OLD marker would
  no longer be recognized as an "overwritable stub" — no big deal (template +
  checker are renamed together in the same clone; no realistic "half-migrated"
  brain). Alternative: **keep** the marker as-is (invisible to the user, zero
  churn). *To be decided — slight lean toward renaming, for consistency.*
- **D4 — Back-compat shim.** Keep a thin `bootstrap.mjs` that re-runs
  `installer.mjs` while printing "renamed to installer.mjs"? Recommended: **no**
  (young project, no installed base to spare → clean rename). *Reco: no.*

## Sequencing with the other plan

If the **`harden-run-node-smoke-and-coverage.md`** plan is also played: run this
rename **LAST**. It sweeps the entire codebase, **including** the new
comments/refs introduced by the run-node plan (otherwise we'd have to re-sweep).

## Steps

### 1. Rename the files (preserve history)
- `git mv bootstrap.mjs installer.mjs`
- (if D2 full) `git mv scripts/lib/bootstrap-args.mjs scripts/lib/installer-args.mjs`
  and the corresponding `.test.mjs`.

### 2. Fix imports broken by the rename
- `installer.mjs` imports `./scripts/lib/installer-args.mjs` (ex `bootstrap-args`).
- Any other file importing `bootstrap-args` → point it at `installer-args`.
- Run the suite: `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` (broken
  imports surface immediately = net).

### 3. ⚠️ Stub command — `CLAUDE.md` l.47 (THE critical point)
- Replace `node bootstrap.mjs --non-interactive …` with
  `node installer.mjs --non-interactive …`. **Word for word**: this is the command
  Claude copies to drive the install. Test it E2E (step 8).
- `CLAUDE.md.template`: **verified 2026-06-07 — the command is NOT in it** (zero
  "bootstrap" in the template) → nothing to fix here, the stub-command lives only
  in `CLAUDE.md`. (Re-grep before executing in case it changed.)

### 4. User-facing docs
- `README.md`, `SETUP.md` (including l.63/105/211/277-278 — re-anchored post
  run-node; ex-l.58/100/208/272-273), `CONNECTORS.md`,
  `.env.example`: replace `node bootstrap.mjs` → `node installer.mjs`, and the
  phrasings "the bootstrap" → "the installer".
- Keep the **natural French**: the script = "l'installeur" (already "installateur
  interactif" in the old header); in code/command = `installer.mjs`.

### 5. Dev docs
- `DEVELOPING.md` (18 occurrences, including the test snippet l.106 — re-anchored
  post run-node, ex-l.94:
  `cp -R . /tmp/sbg-test && cd /tmp/sbg-test && node installer.mjs < /dev/null`).
- `.gitignore` (comments l.43/47).

### 6. Code comments
- `rag-launcher.mjs`, `claude-md.mjs`, `demo.mjs`, `example-notes.mjs`,
  `gemini-key.mjs`, `mcp-smoke.mjs`, `connectors-catalog.mjs`, `verify-rag.mjs`:
  "the bootstrap" → "the installer". The header of `installer.mjs` itself
  ("interactive installer of the Second Brain Generator") stays right — check the
  consistency of the wording.

### 7. (If D2 full / D3) Identifiers & marker
- `isBootstrapStub` → `isInstallerStub`, `BOOTSTRAP_STUB_MARKER` →
  `INSTALLER_STUB_MARKER` (+ value `…:installer-stub`), in `claude-md.mjs`,
  its imports (`installer.mjs`), and `claude-md.test.mjs` (test names + assertions
  on the marker value).
- ⚠️ If we change the **value** of the marker, update the stub (the CLAUDE.md /
  template that CARRIES the marker comment) so that `isInstallerStub` recognizes
  it. Test that `gen()` still overwrites the stub (cf. `claude-md.test`).

### 8. Checks (the net)
- **Full suite green**: `node --test scripts/lib/*.test.mjs scripts/*.test.mjs`.
- **Residual grep** (excluding `maintainers/` = archives, and excluding `.git`):
  `grep -rni bootstrap . --exclude-dir=maintainers --exclude-dir=.git
  --exclude-dir=node_modules` → must return **only** what we knowingly kept
  (ideally nothing, beyond documented D3/D4 choices).
- **E2E install (proof of the stub command)**: `rm -rf /tmp/brain-rename-test
  && node installer.mjs --non-interactive --name brain-rename-test --dest /tmp
  --owner Test --lang fr` → exit 0, MCP smoke OK. Then verify that the stub
  **generated** in the test brain no longer references `bootstrap.mjs` (in case a
  copied doc mentions it) and that everything points to `installer.mjs`. Clean up.

### 9. Tangential mentions
- `vault/backlog/harnais.md`, `.claude/skills/tdd-discipline/SKILL.md`: fix if
  the mention refers to OUR script; leave if it's a generic usage of the word.

## Guardrails (not to be breached)
- **`git mv`** (not delete+create) → file history is preserved.
- **The stub command is sacred**: prove it E2E after the rename (step 8).
- **Pure rename**: no change of behavior, CLI argument, or generated path. If a
  business test changes its result → it's a bug in the rename, not an intended
  change.
- **Do not rewrite history** nor the `maintainers/plans/` archives (the present
  plan and the previous one talk about "bootstrap" → normal, it's dated).
- **Neutrality / no leak**: unchanged (`grep` for third-party names stays empty).

## Out of scope
- Any functional change (install steps, smoke tests, RAG…): no, another lot.
- Renaming "bootstrap" where it would denote a generic concept unrelated to our
  script (unlikely here).
- Elaborate back-compat (shim, alias) beyond D4.

## Suggested commits (separate)
1. `refactor: renommer bootstrap.mjs → installer.mjs (+ lib args) via git mv`
2. `refactor: commande d'amorce + docs (bootstrap → installeur)`
3. `refactor: commentaires de code (bootstrap → installeur)`
4. (si D3) `refactor: marqueur installer-stub (ex bootstrap-stub)`
