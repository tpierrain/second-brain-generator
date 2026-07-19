# ADR 0034 — Universes: a soft retrieval scope, governed by progressive disclosure (not an isolation wall)

- **STATUS:** ACCEPTED (2026-07-19).
- **Scope:** Second brain (runtime) primarily (RAG engine, the `/switch` skill, a SessionStart
  reminder hook); Installer secondarily (a fresh brain is born universe-aware, and `/import` gains a
  `--universe` stamp). No change to the sacred constitution surface.
- **Related:** [`0009-prefer-deterministic-mechanisms.md`](0009-prefer-deterministic-mechanisms.md) (the engine, not the LLM,
  enforces the default scope); [`0007-three-embedder-adapters-privacy-scale.md`](0007-three-embedder-adapters-privacy-scale.md)
  (a cross-universe union needs a shared embedder, so all unionable universes share one); [`0019-import-previous-brain-is-a-keyword-skill.md`](0019-import-previous-brain-is-a-keyword-skill.md)
  (import gains `--universe`); plan
  [`../plans/prospective/universes-progressive-disclosure-action.md`](../plans/prospective/universes-progressive-disclosure-action.md).

## Crux

**Prior art (why this isn't NIH):** the governing idea is **progressive disclosure** (Tesler; Nielsen /
NN-g): a feature the majority never needs must stay invisible until a user opts in, then become fully
capable. The switch ergonomics borrow **git's `switch` / `switch -c`** (one verb for the frequent move,
create-and-switch folded in as a convenience). We deliberately do **not** adopt tenant-isolation
"realms" (Keycloak-style): a single-user private brain does not have a cross-tenant *security* boundary
to defend. The decision: a **universe** is a **soft, engine-enforced default retrieval scope over one
shared vault and one shared index**, framed as a **relevance** feature (do not pollute one context's
work with another's), **not** a confidentiality wall. It is **always on in the data layer** (every note
carries a universe, default implicit) and **invisible in the UX** until a second universe exists.

## Context

A single personal brain will, over a career, span several contexts (successive employers, clients,
spheres). The user wants, when working one context, retrieval to default to that context's corpus, and,
rarely, to query across all of them explicitly. The tempting framing is "confidentiality wall between
contexts." For a **single-user, private, local** brain that framing solves a **non-threat**: content
from context A surfacing while working context B is the owner seeing their own note, i.e. **noise**, not
a breach. The real problem is **relevance and focus**, which is a *scoping* problem, not an *isolation*
problem.

The engine confirms this is cheap: search is a single, deterministic, tested chokepoint
(`searchSimilarIn`) over a brute-force cosine scan of a `chunks` table joined to `documents`. A scope is
one exact-match `WHERE` clause on a `documents.universe` column. Genuine isolation (separate indices, or
separate vault trees, or separate repos) was considered and rejected: it fragments the connected wiki
graph, forces a single embedder across stores, complicates every vault-walking skill and every source
connector, and, above all, delays the personal-brain migration it was meant to enable (the migration
plan's own strategy is "migrate early, explore later"). A soft default scope preserves all of that.

## Decision

1. **A universe is a soft default scope, enforced by the engine, over one shared vault + one shared
   index.** `documents` gains a `universe TEXT NOT NULL DEFAULT '<default>'` column. `searchSimilarIn`
   applies `WHERE d.universe = <active>` (and always ORs in the default universe, so the owner's
   cross-cutting notes stay visible everywhere). The active universe is **injected by the MCP server**
   from persisted state, **never supplied by the LLM**, so it cannot be forgotten or overridden by the
   model (ADR 0009). An explicit `allUniverses` override relaxes the filter for the rare cross-cutting
   query. This is a **relevance boundary, not a security boundary**, and must never be described as
   isolation: a bug, a future skill, Obsidian, git or grep can cross it, and for a private brain that is
   acceptable. A genuine data-at-rest requirement is answered by disk/repo encryption, which is
   orthogonal to universes.

2. **Progressive disclosure governs the UX.** The mechanism is always on in the data layer, but the
   concept is **invisible and non-constraining until a second universe exists**. The visibility gate is
   deterministic: **universe count >= 2**. Below it, no `/switch` prompt, no SessionStart mention,
   nothing: a brain with a single (default) universe behaves exactly as today.

3. **The default is implicit across three surfaces, one principle.** (a) The **column** is always
   populated (the engine stamps the default when frontmatter is absent). (b) The **frontmatter** carries
   `universe:` **only when non-default** (absence means default), so the majority's notes stay clean.
   (c) The **file layout** puts the default universe at the **vault root** (today's `daily/`, `topics/`,
   `backlog/`, ... unchanged), and each **created** universe in its own top-level subtree
   `vault/<universe>/...`. The same implicit-when-default / explicit-when-created rule unifies data,
   frontmatter and disk.

4. **`/switch` is the single entry point.** `/switch <name>` is the fast path; `/switch` with no
   argument opens a chat menu that reminds the current universe, lists the available ones, offers
   "create a new universe" (create-and-switch, git `switch -c` style), and offers cancel (stay put).
   The state write goes through a deterministic script; the skill is a thin conversational driver over
   it. Crossing the count-1-to-2 threshold triggers a one-time inline onboarding.

5. **Per-universe directories buy future one-shot deletion, not a wall.** Because a created universe is
   a self-contained subtree, a future GDPR-style "delete this universe" is `rm -rf vault/<universe>/` +
   `DELETE ... WHERE universe = ?` + reindex. The capability is not built now; the layout makes it a
   later one-liner.

## Consequences

- **The connected wiki, the embedder choice and the migration are all preserved.** One vault, one
  index: cross-universe `[[links]]` still resolve, the embedder stays a free per-brain choice, and the
  Bucket-1 note-convention change is small enough to land before the import rather than blocking it.
- **A cross-universe union requires a shared embedder** (comparable vectors). Because there is one index
  here, union "just works"; the constraint only bites if isolation is ever revisited (ADR 0007).
- **Schema bump.** Adding the column moves `INDEX_SCHEMA_VERSION` to 2. A freshly generated brain is
  born at 2 (free). Deployed brains reindex once on their next engine upgrade: this **retires the
  "v3.2.x -> current triggers no reindex" simplification** the fleet ROADMAP leaned on; `update-engine`
  handles it with a warning, and it is a one-shot. This is a Gate-4 (fleet) concern, not a blocker here.
- **Type detection must ignore a leading universe segment** (folder-to-type keyed on `daily/` etc. now
  sees `inqom/daily/...`).
- **Multi-window concurrency is deferred.** A single global active-universe state file means two Desktop
  windows share one active universe. For a single user this is acceptable; per-session state is YAGNI
  until proven.

## Alternatives considered

- **Option 1 hardened (chosen):** shared vault + index, exact-match `universe` column, engine-injected
  default filter, explicit union override. Cheapest, preserves everything, right for the private-brain
  threat model.
- **Option 2 (separate index per universe):** a structural wall for the RAG only; leaves every
  file-level reader (Obsidian, git, grep, raw read, future skills) able to cross. A half-wall for a
  non-threat: rejected.
- **Option 3 (separate vault trees + indices):** closes the file-level readers too, but fragments the
  wiki graph, forces a single embedder, turns every source/skill into a per-universe routing problem,
  and delays the migration. Rejected as a concrete, heavy answer to a possible, mild risk.
- **Model B (separate brains / repos):** maximal isolation, but the switch becomes "reopen another
  brain," cross-cutting synthesis is lost, and the owner admits cross-universe queries are rare, which
  removes the main reason to keep one brain. Rejected; kept as the escape hatch a created-universe
  subtree can graduate into if a real external boundary ever appears.
