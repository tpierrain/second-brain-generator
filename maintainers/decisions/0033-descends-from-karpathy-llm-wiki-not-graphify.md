# ADR 0033 — Kenjaku descends from Karpathy's LLM Wiki (prior art), not from Graphify

- **STATUS:** ACCEPTED (2026-07-17).
- **Scope:** Project positioning + Second brain (runtime). No installer surface. This is a
  lineage / positioning decision; it also **frames** the Axis-1 engine features it justifies (plan
  [`../plans/prospective/wiki-health-axis1-mechanisms-action.md`](../plans/prospective/wiki-health-axis1-mechanisms-action.md)).
- **Related:** study
  [`../plans/prospective/llm-wiki-vs-embedding-rag-karpathy-graphify.md`](../plans/prospective/llm-wiki-vs-embedding-rag-karpathy-graphify.md)
  (the two-axis model + the wiki-health audit);
  [`0007-three-embedder-adapters-privacy-scale.md`](0007-three-embedder-adapters-privacy-scale.md)
  and [`0008-lightrag-graph-rag-deferred.md`](0008-lightrag-graph-rag-deferred.md) (the Axis-2 / RAG
  investment this is the counterweight to).

## Crux

**Prior art (why this isn't NIH):** this project's retrieval philosophy is **Andrej Karpathy's
"LLM Wiki"** pattern — an LLM compiles sources into an interlinked Markdown wiki you point an agent at,
rather than a stateless embed-and-search index. We adopted it **deliberately and credited it from day
one** (the originating private brain's `README` / `PLAN` cite Karpathy, and the clarifying write-up by
Leo @defileo). **Graphify** is a **sibling** implementation of the **same public idea**, not our source.
The decision: **position Kenjaku as a *superset* of the LLM Wiki** — a personal second brain that keeps
the wiki (Axis 1) **and** adds an embedding RAG (Axis 2) **and** connectors — and **defend against
"you copied Graphify" with the truth, not with a false priority claim**: common public ancestor +
independent implementation + credited prior art + a different problem domain.

## Context

A cluster of July 2026 posts spotlighted Graphify (a code-knowledge-graph tool for coding agents) as
"the" implementation of Karpathy's LLM Wiki. Because Kenjaku's vault *is* an interlinked Markdown wiki,
the surface resemblance invites a "did you copy Graphify?" reflex. The dates settle it, and they do
**not** support a "we were first" story — so we must not lean on one:

| Element | Date | Source |
|---|---|---|
| Karpathy's "LLM Wiki" idea | ~early April 2026 | the posts frame Graphify as shipping "48 h after Karpathy posted" |
| **Graphify** repo created | **2026-04-03** | GitHub API `created_at` |
| **Originating private brain** (first commit; credits Karpathy the same day) | **2026-04-16** | `git log` |
| **This launcher (Kenjaku)** (first commit) | **2026-06-02** | `git log` |

So Graphify slightly **predates** the originating brain, and both descend from Karpathy's **publicly
posted** idea. "We were first" is false and trivially refuted; it is also unnecessary.

Two further facts matter. **(1)** Different problem domains: Graphify's centre of gravity is a
*codebase* knowledge graph (typed edges: calls, imports, defs) for coding agents; Kenjaku is a
*personal* second brain (connectors, briefings, 1-1s, decisions) with a RAG. **(2)** The two-axis model
(study, §3): the LLM Wiki is not an alternative to our RAG — Kenjaku is a **superset** that already has
the wiki artifact and *added* the vector RAG on top.

## Decision

1. **Adopt and credit Karpathy's "LLM Wiki" as the acknowledged prior art** for the retrieval
   philosophy (per the repo's "name the prior art / not-NIH" convention). Keep the credit visible in
   public-facing docs, never claim the pattern as ours.
2. **Position Kenjaku as a superset of the LLM Wiki**, not a competitor to Graphify: personal second
   brain = LLM wiki (Axis 1) + embedding RAG (Axis 2) + connectors. State the differentiator (personal
   knowledge + connectors, **not** a code-knowledge-graph for coding agents) wherever the comparison
   arises.
3. **Do not claim temporal priority over Graphify.** The defensible, truthful stance on "you copied
   Graphify" is: *common public ancestor (Karpathy), independent implementation, credited prior art,
   different problem domain.* This is stronger than a date race and cannot be refuted.
4. **Invest in Axis-1 mechanics** (wiki-health `/lint`, file-back, consolidation) as **engine features**
   — the counterweight to the heavy Axis-2 investment the audit exposed — per the plan cited above.

## Consequences

- **Positive.** A truthful, un-refutable positioning; a documented lineage that survives `/clear` and
  travels with the repo; a clear product boundary vs Graphify; a justified investment direction (Axis 1).
- **Cost / trade-off.** We explicitly **forgo** the (tempting, punchier) "we did it before Graphify"
  narrative because it is false. Marketing must lead with *"a personal second brain built on Karpathy's
  LLM Wiki, plus a private RAG and connectors"*, not with a priority claim.
- **Non-goal.** This ADR does not adopt Graphify's code, its knowledge-graph format, or its
  code-agent framing; the Axis-1 mechanics are brain-flavoured (people/topics/decisions), designed
  independently.
