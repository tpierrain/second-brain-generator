# ADR 0008 — LightRAG / graph-RAG: deferred (interesting, but not now)

- **STATUS:** ACCEPTED (2026-06-08) for the **direction**: we **do not wire in** LightRAG (nor a
  graph-RAG) in the current effort; we **reserve it for later**, conditioned on a measurement. This
  is a **sequencing and scope** decision, not a definitive rejection.
- **Related:**
  [`0006-le-mcp-du-rag-est-un-contrat-stable.md`](0006-le-mcp-du-rag-est-un-contrat-stable.md)
  (the MCP contract stays stable; a graph-RAG would live *behind* that contract, not in its place),
  [`0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md)
  (the current effort is about the swappable **embedder** — a different layer from LightRAG's),
  [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md) (the LLM that *answers*
  stays Claude → already bounds the privacy promise; LightRAG would add an LLM **at indexing**).
- **Associated plan:** [`../plans/rag-embedder-plan-action.md`](../plans/rag-embedder-plan-action.md)
  (Step 7 "big-machine profile", **conditional**, where this lead lands) and the study
  [`../plans/etude-rag-local-criteres-et-veille.md`](../plans/etude-rag-local-criteres-et-veille.md)
  §4 (graph path; E2GraphRAG).

## Context

Thomas asked to evaluate **LightRAG** (`HKUDS/LightRAG`, MIT, ~36k stars, Python `lightrag-hku`,
EMNLP 2025 paper) for the second brain. It's a **knowledge-graph-based RAG engine**: at indexing,
**an LLM reads each chunk** to extract **entities + relations + keywords** and build a knowledge
graph, which it then combines with embeddings at search time ("dual-level" retrieval: precise
entities + broad themes, + one-hop neighbors). Its explicit promise: approach the **multi-hop**
quality of Microsoft GraphRAG at a **fraction** of its cost (it drops the "community reports" and
does incremental updates). Usable as a **lib or a server**, with file stores by default (KV + vector
+ graph + doc-status) or prod backends (Postgres / Neo4j / Milvus / Qdrant…). **Pluggable** embedder
(OpenAI, Ollama, HuggingFace, Gemini…). **Can run 100% local** (Ollama for the LLM *and* the
embeddings; documented "offline" guide).

The real question isn't "is LightRAG good?" (it is, in its niche) but **"does it fit THIS product,
NOW, given our invariants?"**.

## Decision

**We do not wire in LightRAG (nor a graph-RAG) in the embedder effort. We defer it** to Step 7
("big-machine profile", opt-in, conditional), **to open only if the measurement (eval-set, Steps
2/4) reveals a quality ceiling** that dense RAG + a possible reranker (Step 6) don't lift — and even
there, **E2GraphRAG remains preferred** over LightRAG on a modest machine (see Alternatives). The
reasons:

### 1. LightRAG isn't an *embedder* — it's a different retrieval paradigm

The entire current effort (ADR 0007 + action plan) makes the **embedder** swappable **behind a
frozen MCP contract** (ADR 0006). LightRAG doesn't plug in like an embedder adapter: it **replaces
the entire search engine** and **reuses zero** of our `Embedder` SPI. It's **orthogonal** to the
effort — not one more brick inside it, but another layer.

> **⚠️ Removing the ambiguity: LightRAG ≠ embedder; it *uses* one, pluggable like ours.**
> At the **embedder level**, it's **not** another paradigm. Inside, LightRAG calls an **embedder**
> that plays **exactly the same role** as ours (text in, vector out) and that is **pluggable the
> same way** (OpenAI, Ollama, Gemini, HuggingFace…): our `OpenAiCompatibleEmbedder` (ADR 0007) would
> plug in there **identically**. The "swappable embedder" paradigm is therefore **common to both**.
> What differs isn't the embedder but what sits **around** it:
>
> ```
>         Dense RAG (ours)                         LightRAG
>    ┌────────────────────────┐        ┌──────────────────────────────────┐
>    │ chunk → EMBEDDER → vec  │        │ chunk → EMBEDDER → vec            │ ← same brick
>    │                        │        │   +                              │
>    │                        │        │ chunk → LLM → entities/relations  │ ← THE extra layer
>    │                        │        │            → graph + vectors      │
>    └────────────────────────┘        └──────────────────────────────────┘
> ```
>
> Two nuances: (a) LightRAG **embeds *more things*** — not just the chunks but also the extracted
> **entities** and **relations** — but it's the *same* embedder called more often, not an embedder
> of another nature; (b) the real "other paradigm" is the **LLM-per-chunk step** that builds the
> graph (cf. §2), absent from our dense RAG.
>
> **Practical consequence:** the embedder work (ADR 0007 + plan) **would stay valid and reusable**
> even if we adopted LightRAG one day — we'd throw nothing away, we'd **slot a layer on top**. That's
> precisely the meaning of "orthogonal" here.

| | Current RAG (dense) | LightRAG (graph) |
|---|---|---|
| Indexing | embed-and-store, **zero LLM** | **one LLM call per chunk** (entity/relation extraction) |
| Stores | SQLite (vectors) | KV + vector + **graph** + doc-status |
| What we swap | the **embedder**, behind the MCP contract | **the whole engine** |
| Indexing cost | low | medium (per-chunk LLM tax) |
| Multi-hop / cross-doc synthesis | weak | strong |
| Operational complexity | low | medium (graph + vectors + KV) |

### 2. The "LLM per chunk" hits our cost AND privacy model head-on

Today our indexing **sends nothing to an LLM** (only the embedder possibly talks to the cloud; local
**doesn't leave** — level 1 of ADR 0007's privacy scale). LightRAG, by contrast, **runs the whole
vault through an LLM at indexing**:

- **in the cloud** → real cost **+ data leaving** (and no longer just "no training": content, not
  just vectors);
- **locally** → you need a **beefy local LLM that's good at entity extraction** (not the little
  EmbeddingGemma ~0.3 GB); yet extraction is demanding, so a small model produces a **poor graph**.

In both cases, it **pulverizes the "Achille's bare Mac" target** (non-dev, max privacy, minimal
friction) that guides ADR 0007 and Decision D1.

### 3. The gain is only demonstrated **where we are not (yet)**

LightRAG's flattering numbers (60–85% "win" vs NaiveRAG/GraphRAG; ~610,000 tokens → < 100 tokens at
retrieval vs GraphRAG) come from the **paper itself**, on **legal / medical / finance corpora, in
English, heavily structured into entities/relations**. For a **personal FR second brain** (notes,
transcripts, emails), the multi-hop benefit is **plausible but not measured**. Adopting it on the
faith of those benchmarks would violate our rule **"we measure before choosing"** (eval-set, action
plan Steps 2/4).

### 4. The real trigger is a **use**, not a tech

The graph only pays off if questions to the brain are **multi-hop / cross-document synthesis** ("how
is X related to Y via Z", "give me the synthesis of everything touching…"). If the real use is mostly
**factual lookup** ("find what I noted about X"), a single relevant chunk is enough and the graph is
only **unrealized complexity**. **Decision: we wait until we have the eval-set AND a usage signal**
before investing.

## Consequences

- **The embedder effort isn't disrupted**: we finish port + 3 adapters + eval-set + measurement
  (Steps 1-4) without a graph detour.
- **The lead is mapped, not lost**: it lives at Step 7, **conditioned on a measured ceiling**, and
  will be decided **on our own FR eval-set** (not on the paper's benchmarks), against E2GraphRAG.
- **If we ever open it**, the invariant holds: a graph-RAG would integrate **behind the stable MCP
  contract** (ADR 0006), not by breaking the surface exposed to the user harness. And it would own
  being a **big-machine profile + strong local LLM**, **opt-in**, **never the default**.
- **Cost of deciding this way**: we give up (for now) a possible multi-hop gain; we accept that as
  long as no measurement and no usage call for it.

## Rejected alternatives

- **Wiring in LightRAG now** — changes the paradigm, adds an LLM at indexing (cost + content leak),
  breaks the non-dev/privacy target, and isn't measured on our FR corpus. Deferred (not rejected).
- **LightRAG as the default graph path when the day comes** — on a modest machine, **E2GraphRAG** is
  preferred: it targets the graph benefit **without the "LLM per chunk" tax** (study §4). LightRAG
  would remain the choice **only** under a beefy-machine + strong-local-LLM profile, after
  measurement.
- **Microsoft GraphRAG** — even heavier (extraction + community reports, costly updates); off-target
  for a personal second brain.
