---
name: lint
description: "Health-check the vault's wiki (Axis 1): report where it bleeds — dangling [[links]], orphan notes nobody links to, stale entity pages left behind by fresher notes, and malformed frontmatter. Runs a deterministic scanner and reads its binary report, then proposes (never silently applies) fixes. Triggered by '/lint', 'lint my vault', 'check my wiki health', 'what links are broken', 'où mon wiki fuit', 'vérifie la santé de mes notes'."
version: 1.0.0
---

# lint — wiki-health check ("where is my wiki bleeding?")

> The retrieval side of the brain (the RAG) is a versioned, tested engine. The **curation**
> side — keeping the wiki itself healthy: links that resolve, notes woven in, entity pages kept
> fresh — is this skill's job. It is the deterministic half of the Karpathy "LLM-Wiki compile"
> discipline (see ADR 0033): the scan is exact and fail-loud; the *judgment* of what to fix is
> yours (and the user's).

## Principle

One promise: **an honest, binary health report of the vault, then help acting on it.**
- The **scan is deterministic** (ADR 0009): pure code over the parsed notes, no LLM guessing.
- The **fixes are proposed, never silently written** (the brain's write posture): surface the
  problem, suggest the gesture, let the user say yes.

## Procedure

### 1. Run the scanner
From the brain folder:
```bash
node scripts/lint-vault.mjs
```
- Exit **0** = clean (say so plainly, do not invent problems).
- Exit **1** = issues found; the report lists them by category. Read it verbatim.
- To check a different path: `node scripts/lint-vault.mjs <vault-dir>`.

### 2. Read the report — four categories
- **Dangling links** `from → [[target]]`: a `[[link]]` whose target note does not exist.
  Usually a typo, a renamed/moved note, or a note that was meant to be written and never was.
- **Orphans**: a note with **zero inbound links** (raw-capture zones `daily/`, `raw-sources/`,
  `inbox/` are already excluded — they are legitimately unlinked). An orphan is knowledge that
  is filed but never woven in, so the wiki (and the RAG's neighbourhood signal) can't reach it.
- **Stale entity pages**: a curated entity page (`type: person|topic|company|project|concept`)
  whose `updated:` trails the freshest note that cites it by more than the threshold (default
  90 days). The world moved on; the canonical page didn't.
- **Frontmatter issues**: a note missing a required key (`type` / `created` / `updated` /
  `tags`), so it indexes and sorts poorly.

### 3. Propose fixes (never apply silently)
Group the findings and, for the ones worth acting on, **suggest the concrete gesture** and ask
before writing:
- **Dangling** → fix the target spelling, or create the missing note (offer to synthesize it
  from the vault, like `open-note` does), or remove the dead link.
- **Orphan** → propose where to weave it in: which existing note(s) should gain a `[[link]]` to
  it, or which entity/topic page it belongs under.
- **Stale entity page** → offer to refresh it from the fresher notes that cite it (a Track-C
  consolidation gesture) and bump `updated:`.
- **Frontmatter** → offer to add the missing keys (run `date` for correct `created`/`updated`).

Prioritise: dangling links and frontmatter are cheap, high-signal fixes; orphans and stale pages
are judgment calls — present them, don't force them.

## Guardrails
- **Report first, write never-without-consent.** This skill diagnoses; it does not rewrite the
  vault on its own.
- **Trust the exit code.** `0` means clean — do not manufacture findings to look useful.
- **Do not run git** (the auto-commit hook persists any accepted change).
- The scanner is **read-only** and **offline** (no network, no LLM): safe to run anytime.

## Out of scope
- Bulk auto-fixing the whole vault unattended (a future, explicit gesture).
- Contradiction detection between a note and an entity page's stated fact (needs LLM judgment —
  a later track).
