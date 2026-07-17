---
name: consolidate
description: "Consolidate raw captures into durable entity/topic pages (Axis 1, Track C): review recent meetings / daily / transcripts and PROMOTE their substance into the higher-order wiki — create the page for a person mentioned but never filed, refresh a topic page a fresher note left behind, weave the backlinks. A deterministic scan surfaces WHAT needs consolidating; parallel read-only sub-agents draft each merge; you PROPOSE, the user confirms, and the write reuses the /file-back builder (never overwrites). Triggered by '/consolidate', 'consolidate my captures', 'promote my raw notes', 'update my entity pages', 'compile my wiki', 'consolide mes captures', 'mets à jour mes pages', 'promeus mes notes brutes'."
version: 1.0.0
---

# consolidate — promote raw captures into the durable wiki ("compile the notes")

> A second brain accretes raw capture fast (meetings, daily logs, transcripts) but the *higher-order*
> pages — the person, the topic, the project — lag behind: a name gets mentioned ten times and still has
> no page, a topic page goes stale while fresher notes discuss it. This skill is the "compile" half of
> the Karpathy LLM-Wiki discipline (see ADR 0033): on demand, it promotes the substance of raw captures
> into the entity/topic pages and weaves the backlinks, so the wiki (and the RAG's neighbourhood signal)
> stays current.

## Principle

One promise: **turn what raw captures already say into durable, well-linked pages — proposed first, written only on yes.**
- **Detection is deterministic** (ADR 0009): a pure scanner lists exactly what needs consolidating.
- **The merge is judgment** (LLM): parallel read-only sub-agents draft each page, never the main context
  (the `sync-sources` fan-out/fan-in shape, to avoid context rot).
- **The write is deterministic and confirmed** (reuse Track B / `/file-back`): a new page goes through
  the builder (conformant by construction, refuses to overwrite); a living page gets a confirmed dated
  append. So consolidation never re-introduces the defects `/lint` reports.
- **Bounded, resumable (stateless), honest**: a capture is a candidate purely because it is *fresher
  than the page it feeds* (or that page doesn't exist). Refresh a page and its `updated:` moves past the
  capture, so the candidate drops off on its own — no state file, nothing to seed or corrupt.

## Procedure

### 1. Scan for candidates (deterministic)
From the brain folder:
```bash
node scripts/consolidate-scan.mjs
```
- Exit **0** = nothing to consolidate (say so plainly, do not invent work).
- Exit **1** = candidates found; the report has two sections. Read it verbatim.
  - **New pages to create** — an entity/person `[[mentioned]]` in captures but with **no page** yet,
    with the count of citing captures (its signal strength) and their paths.
  - **Entity pages to refresh** — a curated page a **fresher** capture has left behind, with the
    captures that overtook it.
- To scan a different path: `node scripts/consolidate-scan.mjs <vault-dir>`.

### 2. Bound the batch (judgment)
Do not consolidate everything blindly. Prioritise by signal: a name cited by many captures is worth a
page; a one-off mention or an obvious typo is not (that is a `/lint` dangling-link fix, not a page).
Pick a handful; tell the user what you're leaving for later.

### 3. Fan out — one read-only sub-agent per candidate (parallel, a single message)
Reuse the `sync-sources` architecture: each sub-agent reads **only its candidate's source captures** and
returns a compact draft (~500 tokens), so the raw text never floods the main context. Sub-agents are
**READ-ONLY** and use **native tools only** (`Read` on the vault files — never a shell like `grep`/`cat`/
`node -e` to load or split text; that re-triggers auth prompts and some are refused outright).

```
Agent(
  description="Draft consolidation for <candidate>",
  prompt="""
You are a wiki-consolidation drafting agent. READ-ONLY. Native tools only.

TASK:
1. Read ONLY these source captures via the Read tool: <list the candidate's source paths>.
2. For a NEW page: distil who/what this is from what the captures actually say — a person's role, a
   topic's definition and current state. For a REFRESH: read the existing page too and draft the dated
   section that folds in what the fresher captures add (do NOT restate what the page already holds).
3. Return a compact draft (~500 tokens max):

## Draft — <target>
### type        # person | topic (the durable zone this belongs to)
### tags        # at least one
### body        # the distilled synthesis, in the user's language, self-contained
### links       # existing notes to weave in as [[people/...]] / [[topics/...]] paths (prefer targets that EXIST)
### sources     # [[raw-sources/...]] / [[meetings/...]] backlinks this was distilled from

RULES:
- Do NOT invent anything absent from the captures.
- Backlinks kebab-case, no accents, never a first name alone.
- NEVER a shell (grep/cat/node -e/awk/sed/jq…) to read or split content — use the Read tool; summarise by reasoning.
"""
)
```

### 4. Synthesise + propose (main context, never write yet)
Collect the drafts. For each, show the user plainly: the **target path**, **type/tags**, the **[[links]]**
and **sources**, and the **body** (or, for a refresh, the dated section to append). Ask for a yes. Adjust
to their edits. Present it as a reviewable diff — this is the honesty requirement.

### 5a. New page → write via the deterministic builder (Track B)
Once confirmed, pipe a JSON spec to the `/file-back` builder (it stamps today's date, writes under
`vault/`, and **refuses to overwrite**):
```bash
echo '{"type":"topic","title":"Capacity Management","tags":["capacity"],"body":"…","links":["topics/rag","raw-sources/2026-07-15-revue"]}' \
  | node scripts/file-back-note.mjs
```
- Exit **0** = written (prints `✓ Filed back: vault/<path>`); relay the path.
- Exit **1** = refused (already exists) or invalid → it's a living page, go to 5b.

### 5b. Existing page (refresh) → append a dated section
Filing never overwrites. Append a dated section that folds in what's new and bump the page's `updated:`,
mirroring the builder's shape (this is the brain's normal confirmed write; the auto-commit hook persists it):
```markdown

## 2026-07-17 — <what the fresher captures add>

<the distilled update>

- [[meetings/2026-07-15-revue]]
```

### 6. Report what changed + resumability
List the pages created/refreshed and what you deliberately skipped. Because detection is stateless,
re-running `consolidate-scan` after the writes will show the consolidated candidates gone (their pages
now sit at or past the captures' dates) — so a next pass naturally resumes on what's left.

## Guardrails
- **Propose first, write on yes.** Never consolidate a page the user hasn't agreed to.
- **Never overwrite.** New pages go through the builder (which refuses to clobber); existing pages are
  appended to, not rewritten.
- **Conformant by construction.** Let the builder produce frontmatter/links so `/lint` stays clean.
- **Read-only sub-agents, native tools only** (no shell for text) — the `sync-sources` constraint.
- **Do not run git** (the auto-commit hook persists any accepted change).
- **Trust the exit code.** `0` = nothing to consolidate; don't manufacture work.

## Out of scope
- Deciding on its own to consolidate and writing unattended (always proposed, always confirmed).
- Flagging a *contradiction* between a capture and a page's stated fact (Track D — needs deeper judgment;
  here we fold in additively, we don't adjudicate conflicts).
- The one-shot "file this exchange back" gesture (that is `/file-back`, Track B — a single note, not a
  batch promotion of existing captures).
