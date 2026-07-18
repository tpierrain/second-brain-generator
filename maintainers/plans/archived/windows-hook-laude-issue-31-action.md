# Fix issue #31 — Windows hooks fail with "'laude' is not recognized"

> **Status:** ✅ SHIPPED. PR #35 squash-merged to `main` (commit `55ee6b7`, 2026-07-18) — "The One
> Where Git Bash Ate the c". All cross-platform CI green; the Windows execution regression test
> (`scripts/win-hook-exec.test.mjs`) ran live under Git Bash AND PowerShell on windows-latest. Root
> cause + fix + deployed-fleet in-place repair all landed. Archived per the plan-done rule.
>
> **Remaining, non-blocking:** (a) post the drafted reply on issue #31 (thank @anunnakian) — the
> auto-mode classifier blocked the public comment during the autonomous run, so it awaits Thomas
> (draft kept). (b) A space in the brain path (`C:\Users\John Doe\…`) is a separate, pre-existing
> Git Bash limitation (#16451), not a regression — track separately if it surfaces.

## The problem (the WHAT)

On Windows, a generated brain shows a hook error at **every SessionStart** and after **every prompt**
(Stop hook = `auto-push`):

```
'laude' is not recognized as an internal or external command, operable program or batch file.
```

i.e. `claude` with the leading `c` stripped. Reported by @anunnakian (Mohamed), 2026-07-17.

## Investigation so far (2026-07-18, from macOS)

- All 6 SessionStart hooks + the Stop hook go through `run-node.cmd`; generated command shape (win32,
  from `nodeHookCommand` in `scripts/lib/rag-launcher.mjs:210` + the settings template) is:
  `cmd /c "<brain>\scripts\run-node.cmd" "<brain>/scripts/<script>.mjs"` → then `node %*`.
- **No `claude` token exists** in any hook command, in `run-node.cmd` (`buildNodeRunnerCmd`), or in the
  hook scripts. `session-self-heal.mjs` spawns `process.execPath` (node), not `claude`. The only
  `spawnSync("claude")` in the repo is `scripts/run-eval.mjs` (an eval tool, never wired as a hook).
- So the `laude` does NOT originate from a `claude` token in our code — matches Mohamed's own grep.
- **Cannot reproduce or explain the `c`-strip from macOS.** Decided (with Thomas) to **reproduce on the
  Windows CI runner** — the arbiter — rather than fix blind (cf. memory `cross-platform-ci-is-the-arbiter`).
- Candidate real fragility spotted: the nested `cmd /c "A" "B"` (two quoted tokens) hits cmd.exe's
  documented quote-stripping rule when Claude Code re-wraps the command in `cmd /s /c "…"`. Unproven as
  THE cause; must not regress working fleet machines.

## Tracking

- [x] Write a Windows-CI **diagnostic** test (`scripts/win-hook-laude-repro.test.mjs`): materializes the
      real `run-node.cmd` + a `probe.mjs`, builds the exact hook command (template + `JSON.parse`), and
      executes it through several invocation forms (A: `cmd /c <cmd>`, B: `cmd /d /s /c "<cmd>"`,
      C: `shell:true`, D/E: a **candidate fix** form with NO nested `cmd /c`). Logs stdout/stderr/exit of
      each; always passes (evidence only). _(2026-07-18)_
- [x] Open a **draft PR** for `fix/windows-hook-laude-31` so CI runs — **draft PR #35** open. _(2026-07-18)_
- [x] Read the **windows-latest** job log; identify which form reproduces `laude`/`not recognized`, and
      whether a candidate form runs the probe cleanly (`PROBE_OK`). **Done (round 2, matrix shell×string).**
      _(2026-07-18)_

### Evidence captured (round 2, windows-latest — `bash` = Git Bash, the shell Claude Code uses)

| command string | **bash** | cmd | pwsh |
|---|---|---|---|
| shipped `cmd /c "WIN\path" "posix"` | ❌ `UNNER~1' is not recognized` | ❌ | ✅ |
| no-nested `"posix/run-node.cmd" "posix/script"` | ✅ `PROBE_OK` | ❌ | ❌ parse |

- **Root cause = `laude` solved.** Under Git Bash, the shipped `cmd /c "C:\…\run-node.cmd"` command has
  its backslashes treated as escapes → a char is **eaten** (`RUNNER`→`UNNER`), cmd then fails with
  `is not recognized`. Same mechanism as Mohamed's `claude`→`laude` (leading `c` eaten). The nested
  `cmd /c` + Windows-backslash path is the fragility.
- **Dilemma:** the shipped form works under **pwsh** but breaks under **bash**; the no-nested form works
  under **bash** but breaks under **pwsh** (needs `&`). **No single quoted string works under both.** →
  the correct fix depends on which shell Claude Code deterministically uses for hooks on Windows
  (asked the claude-code-guide agent; likely Git Bash, but must confirm to avoid regressing pwsh users).
  If hooks support an **exec form** (`command`+`args` array, no shell), that bypasses quoting entirely
  and is the preferred fix.

- [x] Confirm Claude Code's deterministic Windows hook shell (+ exec-form question). **Git Bash by
      default, PowerShell fallback if Git Bash absent (sourced via claude-code-guide). No universal
      quoted string exists across bash+pwsh; the UNQUOTED forward-slash command IS universal (bash/cmd/
      pwsh) for space-free paths (round 4). Exec-form via cmd.exe re-hits the strip bug with spaces.**
      _(2026-07-18)_
- [x] Write the **real fix** + a permanent **regression test** (TDD). `nodeHookCommand(win32)` now emits
      a bare forward-slash `run-node.cmd` path (no nested `cmd /c`, no backslash); template keeps the
      script quoted → the built command runs the probe under Git Bash AND PowerShell (proven live on
      windows-latest: `scripts/win-hook-exec.test.mjs`, test #663 ran `ok`). POSIX unchanged.
      _(2026-07-18)_
- [x] **Remove the temporary diagnostic** test — replaced by `scripts/win-hook-exec.test.mjs`. _(2026-07-18)_
- [x] Ensure the fix reaches the **deployed fleet**. **Discovered the plan's assumption was WRONG: the
      settings.json reconcile is ADDITIVE-only (never rewrites an existing command), so `nodeHookCommand`
      alone fixes only NEW installs.** Added a narrow, nominative in-place **repair**
      (`repairEngineHookCommands` / `repairWin32NodePrefix`) that heals the broken `cmd /c "…\run-node.cmd"`
      prefix in both hook commands and the top-level statusLine, idempotently (no churn on converged/posix
      brains, never touches a user hook). Converges at the next self-heal restart; `update-engine`
      names the healed commands. `rag-launcher.mjs` is engine-owned (`replace` bucket) → travels via
      update-engine. No reindex needed (no schema change). _(2026-07-18)_
- [x] Green cross-platform CI (all Windows jobs) — run `29640368190` fully green, Windows execution
      test ran `ok` (not skipped). _(2026-07-18)_
- [x] Retitle+undraft PR #35 as the fix (English), `Fixes #31`, merge to `main`. **Squash-merged,
      commit `55ee6b7`.** _(2026-07-18)_
- [~] Reply on issue #31 with the root cause + fix; thank Mohamed. **Drafted, but the auto-mode
      classifier blocked the public comment during the autonomous run → awaits Thomas (draft kept in
      the session).** _(2026-07-18)_
- [x] Archive this plan (`git mv` to `archived/` + STATUS ✅ with the merge commit) per the plan-done
      rule. **This change.** _(2026-07-18)_

## Notes for the autonomous resume

- Do NOT ship a fix that isn't proven green on the Windows CI (arbiter). Enumerate ALL `not ok` in a red
  log, not just the first screen (lesson from the #33 POSIX fix, which took two rounds for that reason).
- Repo conventions: artifacts in English, TDD baby-steps, commit only green, one canonical plan (this).
