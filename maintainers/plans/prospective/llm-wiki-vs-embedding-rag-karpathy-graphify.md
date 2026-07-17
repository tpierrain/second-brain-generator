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

**Lineage (confirmed, not retrofitted theory).** The private second brain Kenjaku was extracted
from **started explicitly from Karpathy's "LLM Wiki" pattern**: a 3-layer *raw / wiki / schema*
architecture, an append-only global log, a `/lint` wiki-health operation, "good answers filed
back" — then grew a RAG as it scaled. The RAG is an **augmentation of the principle, not a
departure from it**.

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
- [ ] Audit whether Kenjaku still carries the wiki-health disciplines of its originating brain (a `/lint`-equivalent, an append-only log, "answers filed back") or whether the vector index became the only retrieval investment
- [ ] Cross-link this note from the sibling `etude-rag-local-criteres-et-veille.md` if the direction firms up

## 8. Sources

- [Karpathy — LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Graphify repo — safishamsi/graphify](https://github.com/safishamsi/graphify) · [Graphify-Labs mirror](https://github.com/Graphify-Labs/graphify)
- [AnalyticsVidhya — from Karpathy's LLM Wiki to Graphify](https://www.analyticsvidhya.com/blog/2026/04/graphify-guide/)
- [MindStudio — what is Karpathy's LLM Wiki](https://www.mindstudio.ai/blog/andrej-karpathy-llm-wiki-knowledge-base-claude-code)
- Origin posts (X, July 2026): [chewa. — graphify/76k stars](https://x.com/chewadot/status/2075300253969035393) · [MyWestLord — Karpathy method in Claude Code](https://x.com/mywestlord/status/2076703919871348767) · [SpikeCalls article](https://x.com/spikecalls/status/2069815843186176126)
