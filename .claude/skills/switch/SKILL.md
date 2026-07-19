---
name: switch
description: "Switch the ACTIVE UNIVERSE of this brain, or create a new one (ADR 0034). A universe is a soft retrieval scope (e.g. successive employers, clients, spheres): when you work one universe, searches default to its notes plus your cross-cutting ones. Use when the user wants to switch / change / set the current universe / context / scope, list their universes, or create / add a new universe / context (e.g. 'switch to the acme universe', 'change de contexte', 'crée un univers Blue Team', 'in which universe am I?', 'liste mes univers'). This is invisible until a second universe exists. It does NOT touch notes and needs no reindex — it only re-points which universe is active."
version: 1.0.0
---

# /switch — Change or create the active universe (opt-in, no reindex)

> Brain-side skill. A **universe** (ADR 0034) is a **soft, engine-enforced retrieval scope** over
> the one shared vault: while a universe is active, `search_vault` returns that universe's notes
> **plus** your cross-cutting (default) notes, and nothing from the others, unless you explicitly
> ask for "all universes". It is a **relevance** feature, never an isolation wall (a bug, Obsidian,
> git or grep can cross it, and for a private brain that is fine).
>
> ⚠️ **This is a thin conversational driver.** All the real, testable logic lives in the
> deterministic core `scripts/set-active-universe.mjs` + `scripts/lib/universes.mjs` (ADR 0009).
> This skill only **reads the current state, runs that core, and reports** — it holds no logic and
> makes no scope decision of its own (the engine reads the active pointer itself, per search).

## When to use it

Load this whenever the user wants to change context or manage universes, in plain language, any
language:

- *"switch to the acme universe"* · *"passe sur l'univers acme"* · *"change de contexte"*
- *"create a universe Blue Team"* · *"crée un univers Blue Team"* · *"add a new context"*
- *"which universe am I in?"* · *"dans quel univers je suis ?"* · *"liste mes univers"*

> 🧭 **Progressive disclosure.** Below two universes there is nothing to manage: a brain with a
> single (default) universe behaves exactly as today. Do **not** volunteer universes to a
> single-universe user. But if they explicitly ask to create one, this skill is the way in.

## Golden rules

- **No writes to notes, no reindex.** Switching only re-points the active-universe pointer under
  `<brain>/.vault-rag/`. The engine reads it live on the next search. Never offer a reindex here.
- **The core is the single surface.** Natural language ("create a universe X") and `/switch X`
  route to the **same** script, so there is never a diverging path (ADR 0009).
- **Creating a universe is create-and-switch** (git `switch -c` ergonomics): register the name and
  make it active in one move. The name is normalized to a safe kebab slug (e.g. "Blue Team" →
  `blue-team`); the reserved name `default` cannot be created.

## Procedure

### Fast path — `/switch <name>` or "switch to <name>"

Run, from the brain folder:
```bash
node scripts/set-active-universe.mjs "<name>"
```
- **exit 0** → relay the confirmation ("switched to '<name>'") and remind, in one line, that
  searches now stay in that universe plus your cross-cutting notes (say *"search all universes"* to
  span them).
- **exit 1, "unknown universe"** → the name is not registered. Show the `available:` list the core
  printed, and **offer to create it** (create-and-switch) or pick an existing one. Do not create
  silently.

### No-argument menu — `/switch` alone

1. Read the state (no writes):
   ```bash
   node scripts/set-active-universe.mjs current   # the active universe
   node scripts/set-active-universe.mjs list      # all universes, * marks the active one
   ```
2. Present the menu in chat: **remind** the current universe, **list** the available ones, and offer
   - **switch** to one of them → fast path above,
   - **➕ create a new universe** (create-and-switch) → `create` below,
   - **✖️ cancel** (stay put) → do nothing.

### Create a new universe — "create a universe <name>"

Run:
```bash
node scripts/set-active-universe.mjs create "<name>"
```
- **exit 0, "created and switched to '<slug>'"** → this is the moment a brain may cross from one to
  two universes. Relay the confirmation and, **only if this is now the second universe**, give the
  one-time framing: *"You now have two universes. Searches stay in the active one plus your
  cross-cutting notes; say 'search all universes' to span them. New notes you capture while this
  universe is active will file under `vault/<slug>/`."*
- **exit 1** → relay the reason as-is (`reserved` = `default` is not creatable; `empty` = the name
  had no usable characters), and ask for another name.

## What it does NOT do

- It does **not** move or re-stamp existing notes (that is `/import --universe` at import time, or a
  future one-shot re-stamp). Switching is only about *where new work and default searches point*.
- It does **not** delete a universe. A created universe is a self-contained `vault/<slug>/` subtree,
  so a future "delete this universe" stays a trivial `rm -rf` + prune + reindex — not built here.
