---
name: import
description: "Imports / migrates the notes from a PREVIOUS second brain (or any external vault) into THIS brain — recover, transport, bring over, re-home, transfer your old notes / anciennes notes from another folder. Use when the user wants to import / importer, migrate / migrer, transport / transporter, recover / récupérer, or bring in the content of an old / previous second brain — e.g. 'importe mes anciennes notes depuis <chemin>' or 'migrate my old brain'. Safe + opt-in: shows a plan, confirms, copies the vault content only, never overwrites, skips demo notes, then reindexes."
version: 1.0.0
---

# /import — Re-home a previous brain's notes into this one (opt-in, non-destructive)

> Brain-side skill. It brings the **notes (and attachments)** of a *previous* second brain —
> or any external Obsidian-style vault — **into this brain's `vault/`**, safely. It copies
> only your **content**, never the old engine, `.git` or `.claude`.
>
> ⚠️ **This is a thin conversational driver.** All the real, testable work lives in the
> deterministic core `scripts/import-brain.mjs` + `scripts/lib/import-vault.mjs` (ADR 0009/0019).
> This skill only **asks for the source, shows the plan, confirms, runs the core, reindexes,
> and reports** — it holds no logic of its own.

## When to use it

Load this whenever the user wants to bring in notes from elsewhere, in plain language and in
any language — **no special vocabulary required**:

- *"importe / migre / rapatrie / récupère mes anciennes notes depuis `<chemin>`"*
- *"import / migrate / transport / recover my old (or previous) second brain"*
- *"I had a brain before v3 — bring its notes over"*

> 🧬 **Flavour, not a trigger (you never need to say it):** we nickname this the **Kenjaku**
> move — *transplanting a mind into a new vessel*. It is pure lore for the README/prose. **A
> user who has never heard of it must trigger the import with ordinary words** — and they do.

## Golden rule — OPT-IN, confirm before any write

The core's **plan** phase performs **zero writes**. Show the plan, then get an explicit **yes**
before the **apply** phase copies anything. Importing other people's old notes into a brain is a
conscious, accepted action.

## What it touches vs NEVER touches

| Imported (your content) | **NEVER touched** |
| --- | --- |
| the source vault's notes (`.md`) | the old engine (`rag/`, launchers, scripts) |
| attachments (images/PDFs) travelling with them | the source's `.git`, `.claude`, `.obsidian`, dotfiles |
| subfolder structure + accented names (preserved) | **your existing notes** — a name collision is **skipped**, never overwritten |
|  | demo / example notes (`tags: [exemple]`) — left behind |
|  | this brain's `.env`, `CLAUDE.md`, settings, skills |

## Procedure

### Step 1 — Get the source path (native picker first, copy-paste fallback)
**Try the native folder picker first** — typing a path is a wall for non-dev users. From the
**brain folder**, run:
```bash
node scripts/pick-folder.mjs "Choose the folder of your previous brain"
```
- **It prints a path (exit 0)** → use that path as `<source>` for Steps 2–3 (reuse it for both,
  don't pop the dialog twice).
- **It exits non-zero** (the user cancelled, or there's no GUI — headless / CI) → **fall back** to
  asking the user to type / paste the folder of their **old brain**.

The core accepts **either** a brain root (it resolves to `<root>/vault`) **or** a `vault/` folder
directly.

> ⚠️ **The footgun, say it plainly:** they want to point at their **old brain folder**, not copy
> the whole folder by hand. The skill copies the *vault content only* — pointing at the brain root
> is fine and safe.

### Step 2 — Show the plan (no writes)
From the **brain folder**, run:
```bash
node scripts/import-brain.mjs "<source>"
```
Relay the printed plan: how many notes/attachments would be imported, how many **collisions** (will
be skipped, never overwritten), how many **example** notes skipped. Then ask for an explicit **yes**.

### Step 3 — Apply (only after confirmation)
```bash
node scripts/import-brain.mjs "<source>" --apply
```
It copies the planned files into `vault/`, preserving subfolders, **never overwriting** a collision.

### Step 4 — Reindex (so the imported notes are searchable)
The new notes must be indexed before the RAG can find them. Incremental indexing is enough — we only
**added** files:
```bash
npm run index --prefix rag
```
*(On a large vault the first pass can take a few minutes; nothing is lost — the notes are encoded.)*

### Step 5 — Report (don't pretend)
- **`exit 0`** → relay the summary (copied / skipped counts). Confirm their existing notes were left
  untouched, and that demo notes did not travel.
- **`exit 1`** → **relay the error as-is** (e.g. "source not found", "nothing to import — wrong
  folder?", "cannot import a brain into itself"). **Never claim success when it failed.**

## After the import — manual follow-ups (mention these)
- **Constitution not merged (v1).** If the old brain had a personalised `CLAUDE.md`, this skill does
  **not** auto-merge it. Offer to help fold any wanted personalisations in by hand.
- **`.env` and connectors** belong to the *new* brain — they were set up at install; the import does
  not touch them. If the old brain used different keys/connectors, wire them here separately.

## Edge cases
- **Source not found / empty** → the core fails loud ("is this the right folder?"); relay it.
- **`source === dest`** (pointing at this same brain) → the core refuses; you can't import a brain
  into itself.
- **All collisions** (re-importing the same notes) → 0 copied, everything skipped; nothing overwritten.
