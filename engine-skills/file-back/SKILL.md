---
name: file-back
description: "File a hard-won answer back into the vault as a durable note (Axis 1): after a substantive exchange, PROPOSE distilling it into a topic / decision / person / meeting page — with a suggested target zone, tags and [[links]] — then write it only once the user says yes. The write goes through a deterministic builder so the note is taxonomy-conformant by construction (never re-introduces the defects /lint reports). Triggered by '/file-back', 'file this back', 'save this answer', 'turn this into a note', 'garde cette réponse', 'classe ça dans mon cerveau', 'fais-en une note durable'."
version: 1.0.0
---

# file-back — file the good answer back ("don't let this evaporate")

> A second brain that only ever captures raw input slowly rots: the hard-won *synthesis* of a good
> exchange evaporates when the session ends. This skill is the "answers filed back" half of the
> Karpathy LLM-Wiki compile discipline (see ADR 0033): when a conversation produced something worth
> keeping, offer to distil it into a durable, well-linked note — so next time the brain *knows* it.

## Principle

One promise: **turn a substantive answer into a durable, conformant note — proposed first, written only on yes.**
- The **judgment is yours** (and the user's): is this worth keeping? what type of note? where does it belong?
- The **write is deterministic** (ADR 0009): the note's path, its frontmatter (`type`/`created`/
  `updated`/`tags`) and its woven `[[links]]` are built by a tested helper, conformant **by
  construction** — so a filed-back note never shows up later in a `/lint` report.
- The **write is confirmed, never silent** (the brain's write posture): propose, let the user say yes.

## When to use it

After an exchange that produced durable value: a synthesised answer, a decision reached, a profile of
a person that emerged, the notes of a meeting. Offer it; do not nag on every trivial turn. Good signals:
the user says "keep this" / "garde ça", or you can feel the answer took real work and would be costly
to reconstruct.

## Procedure

### 1. Decide the shape (judgment)
Pick, from the vault taxonomy (see the constitution, §"Note format"):
- **type** → one of `topic`, `decision`, `person`, `meeting` (the four durable, non-raw zones).
  - `topic` → a cross-cutting concept (`topics/<slug>.md`).
  - `decision` → a dated decision record (`decisions/<date>-<slug>.md`).
  - `person` → a person page (`people/<firstname-lastname>.md`).
  - `meeting` → dated meeting notes (`meetings/<date>-<slug>.md`).
- **title** → a clear, human title (the builder slugifies it: kebab-case, no accents).
- **tags** → at least one (required for conformance).
- **body** → the distilled synthesis, in the user's language. Be concise and self-contained.
- **links** → the existing notes this connects to, as `[[people/jane-doe]]`, `[[topics/rag]]` paths.
  Prefer targets that **already exist** (run `/lint` if unsure) so you don't create dangling links.

### 2. Propose (never write yet)
Show the user, plainly: the **target path**, the **type/tags**, the **[[links]]**, and the **body** you
intend to file. Ask for a yes. Adjust to their edits.

### 3a. New page → write via the deterministic builder
Once confirmed, from the brain folder, pipe a JSON spec to the builder (it stamps today's date, writes
under `vault/`, and **refuses to overwrite**):
```bash
echo '{"type":"topic","title":"Capacity Management","tags":["capacity"],"body":"…","links":["topics/rag"]}' \
  | node scripts/file-back-note.mjs
```
- `date` is required for dated types (`decision`, `meeting`), e.g. `"date":"2026-07-17"`.
- Exit **0** = written (it prints `✓ Filed back: vault/<path>`); relay that path.
- Exit **1** = refused (note already exists) or invalid spec; read the message verbatim — if it already
  exists, this is a *living page*, so go to 3b instead.

### 3b. Existing living page (person / topic) → append a dated section
Filing back never overwrites. When the target already exists, **refine it additively**: append a dated
section and bump its `updated:`. Keep it conformant, mirroring the builder's shape:
```markdown

## 2026-07-17 — <short heading>

<the distilled synthesis>

- [[people/jane-doe]]
```
This edit is the brain's normal confirmed write (the auto-commit hook persists it).

## Guardrails
- **Propose first, write on yes.** This skill never files a note the user hasn't agreed to.
- **Never overwrite.** New pages go through the builder (which refuses to clobber); existing living
  pages are appended to, not replaced.
- **Conformant by construction.** Let the builder produce the frontmatter and links — do not hand-roll
  a note that `/lint` would then flag.
- **Do not run git** (the auto-commit hook persists any accepted change).
- **Prefer existing link targets** so you don't trade evaporation for dangling links.

## Out of scope
- Deciding on its own that an exchange is worth keeping and filing it unattended (always proposed).
- Bulk-consolidating many raw captures into higher-order pages (that is Track C, a separate gesture).
- Merging/deduping against an existing page's *content* beyond appending a dated section (Track C / D).
