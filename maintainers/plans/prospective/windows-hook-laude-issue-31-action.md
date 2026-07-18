# Fix issue #31 — Windows hooks fail with "'laude' is not recognized"

> **Status:** in progress. Branch `fix/windows-hook-laude-31` (off `main`, which already has #33).
> Autonomous chantier — resume at the first unchecked `- [ ]`. This is the canonical plan.

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
- [ ] Open a **draft PR** for `fix/windows-hook-laude-31` so CI runs (CI triggers on `pull_request`; a
      bare push to this branch does NOT trigger it — `ci.yml` push branches = `[main, node-compat]`).
- [ ] Read the **windows-latest** job log; identify which form reproduces `laude`/`not recognized`, and
      whether the candidate form (D/E) runs the probe cleanly (`PROBE_OK`).
- [ ] From that evidence, write the **real fix** at the source (likely `nodeHookCommand` / the settings
      template quoting) + a permanent **regression test** (TDD; assert the command executes the probe on
      win32). Keep POSIX behaviour unchanged.
- [ ] **Remove the temporary diagnostic** test once the mechanism is captured by the regression test.
- [ ] Ensure the fix reaches the **deployed fleet**: `rag-launcher.mjs` is engine-owned (`scripts/lib/**`
      in the manifest `replace` bucket) → verify it travels via `update-engine`; deployed brains re-render
      launchers/settings on reconcile. Confirm no reindex needed.
- [ ] Green cross-platform CI (all Windows jobs). Retitle the PR as the fix (English, "The One With…"
      codename optional), reference issue #31 (`Fixes #31`), merge to `main`.
- [ ] Reply on issue #31 with the root cause + fix; thank Mohamed.
- [ ] Archive this plan (`git mv` to `archived/` + STATUS ✅ with the merge commit) per the plan-done rule.

## Notes for the autonomous resume

- Do NOT ship a fix that isn't proven green on the Windows CI (arbiter). Enumerate ALL `not ok` in a red
  log, not just the first screen (lesson from the #33 POSIX fix, which took two rounds for that reason).
- Repo conventions: artifacts in English, TDD baby-steps, commit only green, one canonical plan (this).
