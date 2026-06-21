---
name: update-engine
description: "Updates your second brain's ENGINE (the RAG search code, launchers and engine-owned scripts) to a newer version, opt-in and without ever touching your notes, .env, constitution, settings or custom skills. Reindexes only if the index format changed. Use when the user asks to update/upgrade their brain's engine, or to check whether an engine update is available."
version: 1.1.0
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
| **missing** engine skills (e.g. `local-mirror`) — _added if absent_ (ADR 0025) | your custom skills **and any engine skill you already have** (`.claude/skills/**`) |
| **missing** engine MCP servers in `.mcp.json` — _added if absent_ (ADR 0025) | any server you added yourself to `.mcp.json` |

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

> **Phrasing — make the ENGINE the visible actor, never the user.** These are things the
> update *will do*, not commands addressed to the reader. Always use an **explicit subject +
> future tense** ("it will fetch a newer engine", "it will never touch what's yours", "it will
> reindex only if the format changed") — **never a bare verb** that could read as an order. This
> matters especially when you answer in a **pro-drop language** (French, Spanish, Italian…),
> where a subjectless present ("récupère un moteur…", "ne touche pas à…") looks like an
> imperative aimed at the user instead of a description of what the engine does.

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

> 🛑 **MANDATORY — whenever ANY engine file changed, you MUST end your chat message by telling
> the user, LOUDLY and in their language, to FULLY RESTART Claude.** This is the **only**
> Desktop-visible channel: Claude Desktop's Code tab renders **no status bar** — just the chat —
> so if you don't say it in the chat, the user never sees it. The core already prints a loud
> **`⚠️ ACTION NEEDED … FULL RESTART`** banner on any swap; **reproduce that intent in the chat,
> don't bury it.** Make it impossible to miss — e.g.:
>
> > ## 🔄 ⚠️ RESTART CLAUDE NOW ⚠️ 🔄
> > Your engine was updated **on disk**, but THIS conversation is still running the **OLD**
> > version. **Fully close Claude and reopen it** (then come back to THIS same conversation) so
> > the update takes effect. Until you restart, your brain keeps using the old engine. 🧠
>
> **Rules for that banner:**
> - **Say it on EVERY update that swapped files** — not only when brand-new skills/MCP/hooks were
>   listed. A steady-state swap of the MCP server, hooks or constitution this conversation loaded
>   is still the OLD code until Claude is reopened. **Never** say "nothing to do on your side",
>   "rien à faire", "you're all set" or anything that implies the update is already live —
>   that directly contradicts the restart and is the bug we are fixing.
> - **A FULL RESTART (close + reopen), then RESUME this same conversation** is the right action.
>   **Do NOT tell them to open a brand-new conversation** — that is the distinct *initial-rooting*
>   rule (a session not yet rooted in the brain), not what picking up new engine code needs.
> - Phrase it **in the user's language**, calmly: it is a one-time, harmless step — the brain
>   wired its own self-healing in the background; one restart and they're done.
> - The **genuine no-op** (the report shows **no** files swapped and **no** reindex) is the only
>   case where you skip the restart banner — don't cry wolf when nothing changed.
>
> _One-time exception (a brain upgrading from a pre-3.2 engine): the first update runs the
> OLD orchestrator, so this report won't yet list the new runtime hooks. They are wired
> silently-but-correctly when the user restarts once — a deterministic reassurance line is
> shown then (localized) by the startup hook. From the next update onward it lands here._
>
> _**Honest one-restart blind spot (F-B7c, the restart NUDGE itself).** The loud "restart
> Claude" cues added in v3.3.0 — the steady-state banner at the end of this report (A1) and the
> persistent `status-line` nudge (A2) — are themselves engine code (`update-engine.mjs`,
> `status-line.mjs`, `scripts/lib/restart-nudge.mjs`). A brain on a **pre-3.3** engine runs the
> **OLD** versions on its **first** `/update-engine`: that first run's report may be silent about
> the restart, and the status-line shows no nudge — we cannot rewrite already-installed code
> retroactively. The fix is self-healing by construction: that first update DELIVERS the new
> versions to disk, so after **one** restart the loud report + the persistent nudge take over and
> every subsequent update is loud. Tell a pre-3.3 upgrader plainly: "restart once after this
> first update — from then on your brain will tell you loudly whenever a restart is needed."_

## Edge cases
- **No source recorded** (`source.repo` is null — e.g. a brain whose launcher had no
  remote) → the core errors clearly; tell the user where a newer engine should be pulled
  from, or that a remote must be wired first.
- **Network / git / npm unavailable** → the core fails loud; relay it. Nothing is left
  half-applied past the failure.
- **Already up to date** → re-pulling the same version is harmless; the engine is swapped
  again and, since the index format didn't move, **no reindex** runs.
- **A new engine skill/server doesn't appear after a single update on a pre-3.2.1 brain**
  (ADR 0025) → expected. The apply runs from the brain's **installed** code, and the skill/MCP
  install logic only landed *during* this update. Simply **run the update once more** (or it
  arrives on the brain's next update): run 1 lays down the new engine code, run 2 executes it
  and installs the missing skill + registers the server. This affects only brains installed
  **before v3.2.1**; from v3.2.1 on, a new engine skill/server lands in a single update.
