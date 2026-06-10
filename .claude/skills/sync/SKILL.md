---
name: sync
description: "Synchronizes the git repo between machines mid-session. Commits local changes, pulls --rebase from origin, handles conflicts interactively, and pushes."
version: 1.0.0
---

# /sync — Cross-machine repo synchronization

> User command. Useful when working on several machines (personal / work laptop)
> and you want to pull in changes pushed from the other without leaving the session.

## When to use it

- When you've worked on another machine and want to pull the changes in here.
- Mid-session, without having to quit and relaunch Claude Code.
- Complements the `SessionStart` hook (which pulls at startup) for mid-session cases.

> ℹ️ Requires a **configured git remote** (`origin`). For purely local use, this skill is useless.

## Procedure

### Step 1 — Local state
```bash
git status --porcelain
```
**Clean** → go to step 3. **Dirty** → step 2.

### Step 2 — Commit local changes
```bash
git add .
git commit -m "auto: vault/claude sync"
```
Creates a safe restore point before the rebase.

### Step 3 — Fetch and rebase
```bash
git fetch origin
git rebase origin/$(git branch --show-current)
```
**Success** → summary + step 5. **Conflict** → step 4.

### Step 4 — Conflict handling
1. List the conflicting files: `git diff --name-only --diff-filter=U`
2. Show the diff of each with context.
3. Ask the user:
   > **Conflict on N file(s).** Options:
   > - **merge**: I resolve and we continue the rebase
   > - **abort**: `git rebase --abort` — back to the previous state (the local commit is safe)
4. If **merge**: resolve intelligently (vault content = often append-only → keep both versions), `git add` the resolved files, `git rebase --continue`.
5. If **abort**: `git rebase --abort`, report that the local commit is intact, stop.

### Step 5 — Push and summary
```bash
git push
```
Show: local commit yes/no, files pulled in from the other machine, push status.

## Edge cases
- **Nothing to sync**: repo clean + up to date → "Nothing to synchronize (commit abc1234)."
- **Network unavailable**: `git fetch` fails → report, local changes intact.
- **Complex conflict** (binaries, restructuring): recommend a manual resolution.
