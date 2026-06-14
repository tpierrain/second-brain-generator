---
name: update-engine
description: "Updates your second brain's ENGINE (the RAG search code, launchers and engine-owned scripts) to a newer version, opt-in and without ever touching your notes, .env, constitution, settings or custom skills. Reindexes only if the index format changed. Use when the user asks to update/upgrade their brain's engine, or to check whether an engine update is available."
version: 1.0.0
---

# /update-engine — Upgrade your brain's engine (opt-in, non-destructive)

> Brain-side skill. The **engine** is the machinery your brain runs on — the RAG
> search code (`rag/`), the launchers and the engine-owned scripts. This skill swaps
> it for a newer version pinned in the launcher you were generated from, **without
> ever touching what is yours**: your notes, `.env`, constitution (`CLAUDE.md`),
> `.claude/settings.json` and any custom skills are left **byte-for-byte unchanged**.
>
> ⚠️ **This is a thin conversational driver.** All the real, testable work lives in
> the deterministic core `scripts/update-engine.mjs` (ADR 0016). This skill only
> **confirms with the user, runs the core, and reports** — it holds no logic of its own.

## When to use it

- The user asks to **update / upgrade their brain's engine** ("update your engine",
  "is there a new version of my brain?").
- Proactively: because the engine is **observable** (it records its version + where to
  pull from in `engine-manifest.json`), you may **offer** an update — but **never run it
  without the user's explicit go-ahead**.

> **Reporting the current version?** The engine version is the brain's pinned git **TAG** —
> the manifest's `source.ref` (surfaced as the **"Version"** line of `vault_stats` and on the
> status-line), **not** the `rag X.Y.Z` / index-schema "internal build" numbers (ADR 0017).

## Golden rule — OPT-IN, NEVER automatic

Do **not** run the core until the user has clearly confirmed. An engine update changes
code on disk and may trigger a reindex; it must always be a conscious, accepted action.

## What it touches vs NEVER touches

| Updated (engine-owned) | **NEVER touched (yours)** |
| --- | --- |
| `rag/` search code + deps | your **notes** (the whole `vault/`) |
| `rag/launch.*`, `scripts/run-node.*` launchers | `.env` (your keys) |
| engine scripts (`auto-commit`, `auto-push`, `status-line`, `verify-rag`) | `CLAUDE.md` (your constitution) |
| `update-engine` itself (it self-updates) | `.claude/settings.json` |
|  | your custom `.claude/skills/**` |

## Procedure

### Step 1 — Confirm with the user (mandatory, opt-in)
Explain, plainly:
- it pulls a newer engine and swaps in the new code, launchers and engine scripts;
- **your notes, `.env`, constitution, settings and custom skills stay untouched**;
- it will **reindex only if the index format changed** (a few minutes, nothing lost —
  your notes are simply re-encoded);
- **prerequisites**: `git`, `npm` and a network connection (same as at install). Here
  `npm install` means installing the RAG engine's **dependencies locally** — nothing is
  published to or pulled from a package registry.

Then ask for an explicit **yes** before proceeding.

### Step 2 — Run the deterministic core
From the **brain folder**, run:
```bash
node scripts/update-engine.mjs
```
It fetches a **throw-away shallow clone** of the recorded source into a temp dir, applies
exactly the engine-owned files, regenerates the launchers, runs `npm install`, reindexes
**iff** the index format moved, records the new version, and discards the temp dir.

### Step 3 — Report (don't pretend)
- **`exit 0`** → relay the printed summary (new version, how many engine files were
  swapped, whether a reindex ran). Reassure that nothing of theirs was touched.
- **`exit 1`** → **relay the error as-is** and tell the user the brain was not changed
  past the point of failure. **Never claim success when it failed.**

## Edge cases
- **No source recorded** (`source.repo` is null — e.g. a brain whose launcher had no
  remote) → the core errors clearly; tell the user where a newer engine should be pulled
  from, or that a remote must be wired first.
- **Network / git / npm unavailable** → the core fails loud; relay it. Nothing is left
  half-applied past the failure.
- **Already up to date** → re-pulling the same version is harmless; the engine is swapped
  again and, since the index format didn't move, **no reindex** runs.
