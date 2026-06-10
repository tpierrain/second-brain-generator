# Plan — Harden `run-node`: proof on an impoverished PATH + broadened coverage

> **State: SHIPPED** (2026-06-07, in TDD baby-steps; suite green 74/74, fresh bootstrap
> validated on an impoverished PATH — not yet committed). Self-sufficient document:
> it contains all the context needed to execute in a fresh session.
> Discipline: **TDD baby-steps** (skill `tdd-discipline`) — one test at a time,
> red→green→refactor. The launcher is a Node/JS tool (not a Hive back-end).
>
> **Prerequisite**: this plan follows `fix-hooks-node-nvm.md` (SHIPPED + pushed,
> commits `c1d21a7` / `8bfafbf` / `d8c1f17`). It fixes two of its blind spots.

## Origin (design discussion, 2026-06-07)

The previous lot introduced `scripts/run-node.*`: a "self-heal PATH" launcher
through which the 3 hooks go (`{{NODE}}` in `.claude/settings.json.template`),
so that `node` (often installed via nvm/Homebrew) is found despite the **minimal
PATH** of the desktop app. Mechanism proven in the field.

Reviewing the design, **two blind spots** appeared:

### Blind spot A — the install smoke-test does NOT prove the real scenario
The current smoke-test (`bootstrap.mjs`, "Launcher smoke-test" block) runs
`run-node` via `run(...)`, which **inherits the full PATH of the install shell**. Yet
it's precisely that rich PATH that masks the bug: node is always findable there.
The test therefore answers "does node exist somewhere?" and **not** the real
question "will the wrapper, ON ITS OWN, find node when the desktop app calls it
on an impoverished PATH?". It's a near-false-positive.

### Blind spot B — the self-heal coverage is incomplete
`pathPrependSh()` looks in `/usr/local/bin`, `/opt/homebrew/bin`,
`~/.asdf/shims` and the nvm directories. It's **missing** some common locations:
- **`/usr/bin`** — node installed via the **Linux** system package manager
  (`apt`/`dnf`/nodesource). A real gap on Linux.
- **Volta** (`~/.volta/bin`).
- **nodenv** (`~/.nodenv/shims`).
- **fnm** (`~/.local/share/fnm/node-versions/*/installation/bin`, and on macOS
  `~/Library/Application Support/fnm/node-versions/*/installation/bin`).

On the Windows side (`pathPrependCmd()`), it notably misses **Volta**
(`%LOCALAPPDATA%\Volta\bin`).

## Guiding principle (and anti over-engineering guardrail — Thomas style)

We **don't try** to enumerate every version manager forever: that's a losing
race. The **real net** is blind spot A — a smoke-test that **proves at install,
on an impoverished PATH**, that the wrapper finds node on its own;
that way even an **unlisted** manager fails **loudly and early** (actionable
message), instead of breaking silently at runtime. Broadening the coverage
(blind spot B) only **reduces the frequency** at which this smoke-test rejects a
legitimate setup. So: **A is the priority, B is a curated complement** (not exhaustive).

Design reminder (already decided in `fix-hooks-node-nvm.md`, do NOT revisit): we
**re-resolve** the PATH on every execution (cost ≈ nil: a few `stat`s, drowned in
node's startup) rather than **freezing an absolute path** at install — a frozen
path would break at the next `nvm install` / version change. We
don't auto-install node either (node = THE prerequisite, strongly checked at step 1).

## Steps (TDD, baby-steps — one test at a time)

### 1. Broaden the POSIX coverage — `scripts/lib/rag-launcher.mjs`
- **Test-first** (`rag-launcher.test.mjs`): `pathPrependSh()` must contain
  `/usr/bin`, `$HOME/.volta/bin`, `$HOME/.nodenv/shims`, and the two fnm globs
  (`~/.local/share/fnm/.../installation/bin` and the macOS path
  `~/Library/Application Support/fnm/.../installation/bin`).
- Add the corresponding `add …` in `pathPrependSh()`. ⚠️ **Order**: `add`
  **prepends** (the last `add` ends up at the HEAD of PATH). Keep in mind that
  late additions win — place the user managers (volta/fnm/nodenv)
  AFTER the system paths if you want them to win, or the reverse. Default
  decision: keep the current order (system first, then nvm), add
  volta/fnm/nodenv after. The glob with a space ("Application Support") must
  be quoted correctly in sh (`"$HOME/Library/Application Support/fnm"/...`).
- `buildShLauncher`/`buildNodeRunnerSh` inherit automatically (they call
  `pathPrependSh()`). Verify the existing RAG tests stay green.

### 2. Broaden the Windows coverage — same module
- **Test-first**: `pathPrependCmd()` must contain `%LOCALAPPDATA%\Volta\bin`.
- Add the line `if exist "%LOCALAPPDATA%\\Volta\\bin" set "PATH=…"`.
  (fnm-Windows = painful cmd globbing → **out of scope**, covered by smoke-test A.)

### 3. Testable "impoverished-PATH env" helper — `scripts/lib/rag-launcher.mjs`
- New `minimalPathEnv(platform, baseEnv)`: returns a copy of `baseEnv` where
  **only `PATH` is neutralized**, preserving the rest (HOME, ProgramFiles,
  APPDATA, LOCALAPPDATA, NVM_SYMLINK… which the self-heal needs).
  - **posix** → `PATH: ""` (sh is launched absolute `/bin/sh`, node will come ONLY
    from the self-heal → proof that the wrapper is self-sufficient).
  - **win32** → `PATH: "<SystemRoot>\\System32"` (cmd.exe must stay findable;
    node will come from the self-heal). Use `baseEnv.SystemRoot || "C:\\\\Windows"`.
- **Test-first**: `minimalPathEnv("darwin", {HOME:"/h", PATH:"/usr/local/bin:/x"})`
  → `PATH === ""` and `HOME === "/h"` (preserved). `minimalPathEnv("win32",
  {SystemRoot:"C:\\Windows", ProgramFiles:"C:\\PF", PATH:"…"})` → `PATH` ends
  with `System32` and `ProgramFiles` preserved.

### 4. Harden the install smoke-test — `bootstrap.mjs`
- In the "Launcher smoke-test" block, pass the impoverished env to `run(...)`:
  `run(runner.command, [...], { cwd: TARGET, env: minimalPathEnv(process.platform, process.env) })`.
- Import `minimalPathEnv` from `./scripts/lib/rag-launcher.mjs`.
- Adapt the failure message: it is now the **proof under real conditions**
  (impoverished PATH like the desktop app) → if it rejects, tell the user that their
  node is in an **unusual** location (list the covered locations) and
  that they must either add it or report the case. Keep `process.exit(1)` (loud
  failure, consistent with "the script judges itself").
- ⚠️ Verify that `run()` properly passes `opts.env` to `execFileSync` (it spreads
  `...opts` → yes). On Windows, `command: "cmd"` must stay resolvable via the
  `System32` of the impoverished PATH (hence the helper's choice).

### 5. Hermetic behavioral test — `scripts/run-node.test.mjs`
- Add a case (POSIX, skip win32): create a **temporary HOME** with a fake
  node under a manager directory (e.g. `<tmpHome>/.volta/bin/node`, sh script
  that prints a unique marker), write `run-node.sh` via `buildNodeRunnerSh()`,
  then run it with `env = minimalPathEnv("darwin", { HOME: tmpHome, PATH:
  "/usr/local/bin" })` BUT neutralizing the system node: to make the test
  **deterministic** despite a possible system node, rely on the fact that `add`
  **prepends** → place the fake manager so it's added LAST
  (thus winning); assert that the **marker** of the fake node is indeed printed
  (proof that THIS node ran, not a system node). If the order of the
  `add`s doesn't guarantee the priority of the chosen directory, use instead a
  directory **exclusive** to the temporary HOME (asdf/nvm/volta) AND `PATH: ""`;
  the only node reachable via the temporary $HOME will be the fake one. (Document the
  choice in the test.)
- Goal: prove that the **broadened coverage** (volta/fnm/nodenv) really
  resolves, not just that the chain "forwards to node".

### 6. Suite green & docs
- `node --test scripts/lib/*.test.mjs scripts/*.test.mjs` → all green.
- `DEVELOPING.md` (existing design note on run-node): add a paragraph
  "the smoke-test now runs on an impoverished PATH (real proof, not a false
  positive); coverage = a curated list, the smoke-test is the net for the rest".
- `SETUP.md` (user callout on run-node): clarify that if the install **rejects**
  at the smoke-test, it's because node is in an unusual location → what to do.

## Files touched
- `scripts/lib/rag-launcher.mjs` (POSIX+Win coverage, `minimalPathEnv`) + `.test.mjs`
- `bootstrap.mjs` (smoke-test in impoverished env + import)
- `scripts/run-node.test.mjs` (behavioral coverage test)
- `DEVELOPING.md` / `SETUP.md` (notes)

## Out of scope (anti over-engineering)
- **Exhaustive enumeration** of version managers: no. Curated list +
  smoke-test as the net. fnm-Windows (cmd globbing) explicitly excluded.
- **Frozen absolute node path** at install: no (breaks at the next `nvm install` —
  decision already made).
- **Auto-installation of node**: no (invasive, OS-dependent; node = prerequisite
  strongly checked at step 1 of the bootstrap).
- Reworking the wrapper or the hook format: no — we only broaden the list
  and harden the proof.

## Expected final validation
- Reproduce scenario A: on a machine where node is NOT in `/usr/local/bin`
  (e.g. only Homebrew Apple Silicon or nvm), the old smoke-test passed
  wrongly; the new one (impoverished PATH) must **succeed** because the self-heal covers these
  cases — AND **fail** if we simulate a node in a directory NOT covered (proof that
  the net bites). To be tested by simulating an impoverished PATH + a fake node placed off
  the list.
- Hermetic volta/fnm behavioral test green.
- Full suite green. Validate the **shipped artifact** (generated bootstrap/wrapper), not a
  disposable instance: redo a fresh bootstrap in `/tmp`, verify that the
  smoke-test runs in the impoverished env and that the brain's `run-node` resolves node.

## Suggested commits (separate)
1. `feat(run-node): élargir la couverture PATH (/usr/bin, volta, fnm, nodenv ; volta win)`
2. `feat(bootstrap): smoke-test run-node en PATH appauvri — preuve réelle, plus de faux positif`
3. `test(run-node): preuve hermétique que la couverture élargie résout node`
4. `docs: smoke-test appauvri + emplacements node couverts`
