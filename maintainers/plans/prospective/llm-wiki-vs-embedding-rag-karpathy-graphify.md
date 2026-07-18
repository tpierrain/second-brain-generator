<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔬 STUDY / WATCH (created 2026-07-17) — NOTHING DECIDED, capture only. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Study — "LLM Wiki" (Karpathy) / Graphify: compiled-wiki retrieval as an alternative (or complement) to embedding-RAG

> **STATUS: 🔬 STUDY / WATCH** (created 2026-07-17). **Nothing is decided here.** This is a
> capture of a pattern that surfaced repeatedly (X / GitHub, July 2026) and that sits **right on
> the crux of Kenjaku's engine**: how a second brain retrieves. It is the **sibling** of the
> embedder watch [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md):
> that note studies *which embedder* powers our vector RAG; **this** note studies a **different
> retrieval philosophy** that questions whether we need embeddings + a vector index at all for
> some of the value.
>
> **Origin:** a cluster of July 2026 posts Thomas flagged (chewa., MyWestLord, cyrilXBT,
> SpikeCalls, andreysuperior, Wes Roth). Stripped of the marketing hooks ("76k stars in 48h", "a
> guy in China revived a dead 15k-note Obsidian vault"), 4 of the 6 point at **the same idea**.

---

## Kenjaku's origin story — need-first, LLM-Wiki by design, then Axis 1 lapsed

> This is the framing that matters most, so it leads.

**Where Kenjaku came from.** Kenjaku did **not** start from an idea to copy — it started from a
**concrete personal need**: a second brain that actually works. From **day one**, the brief to Claude
was explicit: **evaluate whether Karpathy's "LLM Wiki" ideas could serve that need**, not adopt them
blindly. The originating private brain's `PLAN` states the **need first**, then **deliberately imports
four LLM-Wiki ideas** (a 3-layer *raw / wiki / schema* architecture, an append-only global log, a
`/lint` wiki-health operation, "good answers filed back"), and even runs a "Karpathy-style critique" of
its own first plan. So the wiki / curation discipline (**Axis 1**, defined precisely in §3) was there
**by design, from the very start** — need-driven, with a public pattern weighed **against** that need.

**How the gap opened (the honest arc).** What eroded Axis 1 was **success on Axis 2**: the sheer power
of the answers, and then the **RAG (which came second)**, pulled all the investment toward retrieval
and let the **curation / consolidation / lint discipline quietly lapse**. The RAG is an **augmentation
of the LLM-Wiki principle, not a departure from it** — but its success **eclipsed** the compile
discipline. **Reclaiming Axis 1 is precisely what this study, and its action plan
([`wiki-health-axis1-mechanisms-action.md`](wiki-health-axis1-mechanisms-action.md)), are for** — and
the §8 audit confirms Axis 1 is, today, under-invested.

---

## 1. The idea — Karpathy's "LLM Wiki"

Instead of stateless RAG over **raw** documents (embed everything, vector-search at every
question), an LLM agent **compiles** the sources **at ingestion time** into a persistent, growing
directory of **interlinked Markdown files**: entity pages, topic summaries, explicit cross-links,
flagged contradictions. You then point a coding agent (Claude Code) at that already-digested folder
and ask your questions; the agent **navigates** the compiled wiki rather than re-deriving meaning
from raw text each time.

- **RAG is stateless**; the LLM Wiki is a **compounding artifact** that gets richer with each source.
- Knowledge is **compiled once, kept current** (adding a source updates entity pages, revises
  summaries, flags conflicts) instead of re-retrieved from scratch.
- Source: Karpathy's gist `llm-wiki.md`.

## 2. Graphify — the implementation that made the buzz

[`safishamsi/graphify`](https://github.com/safishamsi/graphify) (also
[`Graphify-Labs/graphify`](https://github.com/Graphify-Labs/graphify)), MIT, on-device:

- `uv tool install graphifyy` (double `y`), then `graphify install` registers it as a Claude Code
  skill / MCP tool set.
- **Deterministic AST pass first** (tree-sitter, no LLM) extracts structure from code; **then Claude
  subagents in parallel** extract concepts, relationships and design rationale from docs, papers,
  images.
- Output: a local knowledge graph (`graph.json` / `graph.html` / `GRAPH_REPORT.md`); a `--obsidian`
  flag writes the whole graph as a **fully-linked Obsidian vault**.
- Headline claims: **0 vector databases**, **~71.5x fewer tokens per query**, persistent across
  sessions, "honest about what it found vs guessed", nothing leaves the machine by default.

> Note: Graphify's centre of gravity is **codebases** (typed edges: calls, imports, defs, refs). The
> *code* is only partially relevant to us; the **retrieval philosophy** is what matters.

## 3. Why it matters for Kenjaku — and where Kenjaku already sits

The "LLM Wiki *vs* RAG" framing is a **false opposition** once you split the pattern into **two
independent axes**:

- **Axis 1 — compile (ingestion / write).** An LLM digests raw sources into interlinked Markdown:
  entity pages, topic summaries, cross-links, flagged contradictions. The compounding artifact.
- **Axis 2 — retrieve (query / read).** How you find things: the agent **navigates** the wiki
  (grep / read / follow `[[links]]`, "0 vector DB" à la Graphify) **or** you **embed and
  semantic-search**.

On that grid, **Kenjaku is not an alternative to the LLM Wiki — it is a superset of it**:

- **Axis 1:** Kenjaku *is* an LLM Wiki. Its vault is interlinked Markdown (Obsidian wikilinks;
  entity notes for people, meetings, decisions, topics) written and linked by Claude
  **in-conversation**. Same artifact as Karpathy's; the only difference is **cadence** — Kenjaku
  compiles incrementally (in chat) rather than in a batch "point Graphify at a folder" pass.
- **Axis 2:** Kenjaku **added** the embedding RAG (vector index + `vault-rag` MCP, `Embedder` SPI
  over in-process ONNX / Ollama / Gemini) **on top of** the wiki, as a **recall accelerator** once
  the vault outgrows pure agent-navigation. It did not replace the wiki.

> **How this superset actually came to be** — need-first, LLM-Wiki by design from day one, then Axis 1
> lapsing under the success of the answers and the RAG — is told up front in **"Kenjaku's origin
> story"** at the top of this note. The two-axis definitions in this section are what that story
> refers to.

**Compatible or exclusive? Complementary.** The only genuine either/or is the *retrieval mechanism
at query time*, and even there the two cover each other's blind spots: embeddings give **semantic
recall** (find the right note even if poorly linked or differently worded) but are flat and
structure-blind; agent-navigation gives **precision and reasoning** (follow links, read the entity
page, cross-check) but misses what isn't linked. The strongest design **chains them**: RAG for
recall → wiki-navigation for precision. And the unifying point: **the better Axis 1 is compiled,
the better BOTH retrievals get** — richer entity pages and links improve navigation *and* yield
better chunks to embed.

## 4. What is worth stealing (and what is not)

**Worth a spike — the ingestion-time consolidation layer.** The genuinely new idea is *compiling*
knowledge as notes enter (entity pages, topic summaries, explicit cross-links, contradiction flags),
not just chunk-and-embed. That is the piece a pure embedding-RAG lacks, and it is the kind of thing
that would make a Kenjaku vault "smarter" **without touching the search engine or the MCP contract**.
It rhymes with the "Contextual Retrieval" lever already parked in the sibling note (§5 there) — same
family: enrich/consolidate before retrieval.

**The real reminder Karpathy gives us.** Not "drop the RAG" but "**don't let Axis 1 (the
compile/consolidation discipline) atrophy just because a RAG exists**". The RAG is only ever as good
as the notes it indexes. The originating brain shipped explicit wiki-health mechanisms (`/lint`,
append-only log, "answers filed back"); the open question is whether Kenjaku still carries their
equivalents, or whether the vector index quietly became the only retrieval investment.

**Adjacent, low-lift.** The `--obsidian` fully-linked output overlaps with what Kenjaku already
emits; the explicit-links angle could feed navigation / citations.

**Treat with skepticism — the numbers.** The "71.5x fewer tokens" is measured **vs re-reading raw
files**, not **vs a competent RAG**. Kenjaku's RAG already does not re-read everything, so the real
delta against Kenjaku is **unproven** and must be measured, not swallowed. Same discipline as the
embedder watch: **eval-first, measure, don't assume** (that note's §6).

## 5. Relationship to existing work

- Sibling: [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md) —
  embedder alternatives for the *vector* RAG. This note is the *retrieval-paradigm* companion.
- The `Embedder` SPI plan [`embedder-spi.md`](embedder-spi.md) and the stable MCP contract
  (ADR 0006) mean a consolidation layer could be added **behind** the contract, as an
  ingestion-side transform, without breaking the harness.
- Any decision to actually pursue this belongs in an **ADR** ("embedding-RAG vs compiled-wiki
  retrieval"), not in this capture note.

## 6. Low-signal items from the same cluster (parked, not pursued)

- **andreysuperior** — Obsidian-as-a-service business angle ($1,500/mo/client). Product
  positioning, zero engine value.
- **Wes Roth / "Fable"** — promo for a note-taking app; no architectural idea.
- **cyrilXBT / SpikeCalls** — re-shares of the Karpathy/Graphify article already covered above.

---

## 7. Tracking — possible next steps (nothing committed)

- [ ] Decide whether this warrants an ADR ("embedding-RAG vs compiled-wiki retrieval") or stays a watch note
- [ ] Read Graphify's actual extraction pipeline (AST pass + subagent prompts) for reusable ideas on the **consolidation layer**, ignoring the code-graph specifics
- [ ] Frame a tiny spike: an **ingestion-time consolidation** step (entity/topic pages + cross-links) on top of the current vault, measured against today's embedding-RAG on the FR eval-set
- [ ] Confirm/deny the token-efficiency claim **against Kenjaku's RAG** (not vs raw-file reading) before quoting any multiplier
- [x] Audit whether Kenjaku still carries the wiki-health disciplines of its originating brain (a `/lint`-equivalent, an append-only log, "answers filed back") or whether the vector index became the only retrieval investment — **done (2026-07-17), see §8: intuition confirmed, Axis 1 ships as conventions only, zero enforcement**
- [ ] Cross-link this note from the sibling `etude-rag-local-criteres-et-veille.md` if the direction firms up

## 8. Audit result — is Axis 1 under-invested in Kenjaku? (2026-07-17)

**Verdict: yes, clearly.** Kenjaku ships Axis 2 (retrieval / RAG) as a complete, versioned, tested,
auto-updating engine, and ships Axis 1 (wiki-health / consolidation) as **writing conventions in the
constitution template with zero deterministic enforcement**. The constitution carries the *spirit*
of an LLM wiki; the *mechanics* went entirely into the RAG.

Discipline-by-discipline (evidence gathered across `CLAUDE.md.template`, the shipped
`.claude/skills/**`, `rag/**`, `scripts/**`):

| Axis-1 discipline | Status | Note |
|---|---|---|
| Wiki-health / `/lint` (orphans, dangling links, stale pages) | **ABSENT** | No lint skill, link-checker, orphan/stale scanner anywhere shipped |
| Append-only log | **PARTIAL** | A convention (dailies never edited) + a `vault/actions-log.md` idiom inside `sync-sources`, but no standing/seeded artifact or hook |
| "Answers filed back" (good Q&A → durable note) | **ABSENT** | No skill/hook turns a good answer into a filed knowledge page |
| Backlink / entity-page consolidation | **ABSENT** as mechanism | `[[wikilink]]` syntax is documented; nothing actively cross-links, merges topics, or propagates a new person into a `people/` page — purely implicit, in-conversation |
| Contradiction flagging | **ABSENT** | No rule/skill detects or flags contradictions between notes |

**Contrast (Axis 2).** `rag/` is ~9k source lines (chunker, 3-adapter Embedder SPI, SQLite vector
store, incremental index manager + single-writer lock, vault watcher, quota/degradation), plus
`local-mirror/` (~14k lines) and deterministic harness scripts (`verify-rag.mjs`, `reindex-trigger`,
`rag-launcher`), a versioned `engine-manifest.json` + `update-engine` skill, and mutation-tested
coverage. The constitution devotes a full named section to the RAG. **No comparable code, test, or
constitution section exists for any Axis-1 discipline.**

**Implication (for a future ADR / spike, not decided here).** The highest-leverage move is not a new
retrieval engine but **giving Axis 1 some mechanics**: a wiki-health check (orphans / dangling links
/ stale entity pages), a light "file the good answer back" reflex, and consolidation prompts — all of
which also *improve the RAG* (better notes ⇒ better chunks). This is the concrete shape the §7 spike
could take.

## 9. Sources

- [Karpathy — LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Graphify repo — safishamsi/graphify](https://github.com/safishamsi/graphify) · [Graphify-Labs mirror](https://github.com/Graphify-Labs/graphify)
- [AnalyticsVidhya — from Karpathy's LLM Wiki to Graphify](https://www.analyticsvidhya.com/blog/2026/04/graphify-guide/)
- [MindStudio — what is Karpathy's LLM Wiki](https://www.mindstudio.ai/blog/andrej-karpathy-llm-wiki-knowledge-base-claude-code)
- Origin posts (X, July 2026): [chewa. — graphify/76k stars](https://x.com/chewadot/status/2075300253969035393) · [MyWestLord — Karpathy method in Claude Code](https://x.com/mywestlord/status/2076703919871348767) · [SpikeCalls article](https://x.com/spikecalls/status/2069815843186176126)
