# ADR 0001 — Reusable launcher vs brain created elsewhere

- **STATUS:** ACCEPTED (2026-06-03) — supersedes the "transform in-place" approach.
- **Associated implementation plan:** [`../plans/archived/launcher-vs-brain.md`](../plans/archived/launcher-vs-brain.md) (DELIVERED).

## Context

The root cause of every git corner-case (strip-remote, maintainer guardrail, `wasStub`
gating) was **recycling the starter clone as the user's brain**. We separate the two roles.

## Decision

- **Launcher** = the cloned generator repo. **Read-only, REUSABLE source**: a single launcher
  on one machine can bootstrap several different brains. The bootstrap **never** writes into it
  (its `CLAUDE.md` stays the bootstrap stub, its `rag/` stays without `node_modules`).
- **Brain** = a **fresh folder that the bootstrap CREATES itself** (name + location provided by
  the user). Since we are the ones creating it and dropping the files into it, then running
  `git init` inside → **no link back to the launcher, by construction**. No more git surgery.

### Renaming `starter` → `generator`

`second-brain-starter` → **`second-brain-generator`** ("Second Brain Generator").
"starter"/"template" carried the wrong model (in-place seed / copy-and-modify);
"generator" = a tool that PRODUCES brains, reusable, never modified → matches the
launcher↔brain architecture. The "seed" metaphor is kept (= the brain you grow, ≠ the generator).

## Rules that follow

- We **refuse** an **existing** target folder (guarantees the bootstrap is the one creating it).
- We delete **nothing**: the launcher stays, the user throws it away if they want.
- Copy = the launcher's **tracked** files (`git ls-files`, in pure Node) → auto-excludes `.git`,
  `node_modules`, `.env`, and the dev files (`DEVELOPING.md`, `maintainers/` — cf.
  `filterCopyable`).
- `{{PROJECT_ROOT}}` (auto-commit hook) and all operations (generation, `git init`,
  `npm install`, smoke-test) point at the **target**, not the launcher.
- **Opt-in push (`secondbrain.autopush`) KEPT**; **strip-remote + `CLAUDE.local.md` guardrail
  REMOVED** (no longer needed).
- "Use this template" (GitHub) = just a way to obtain the launcher, no longer "your repo from
  day 1".

## Multi-OS consequences (Windows included)

- Default location computed in Node: `path.join(os.homedir(), name)` — NEVER a literal `~/…`.
  `--dest <dir>` to override. All paths via `path.join`/`path.resolve`.
- Tracked-file copy in **pure Node** (`git ls-files -z` + `fs` copy), NOT `git archive | tar`
  (shell pipe + tar = fragile on Windows).
- `{{PROJECT_ROOT}}` in `settings.json` (JSON): a Windows path `C:\…` breaks escaping →
  write `/` (Node accepts them on Windows) or JSON-escape.
- Refuse-if-exists via `existsSync`; `git`/`npm` with `cwd` on the target.

## Claude's role (bootstrap stub)

Clone the launcher, ask the questions (name, location, language), run **ONE** bootstrap command
`--non-interactive`. The bootstrap decides and does everything (determinism in the script,
Claude = minimal conversational wrapping).
