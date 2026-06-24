<img src="docs/img/kenjaku.png" alt="Kenjaku — the Second Brain Generator's mascot" align="right" width="150">

# Your work, remembered — and it cites its sources

> **One page to *show* what this is.** A visual companion to the [README](README.md) and to
> [“What makes it different”](EN-QUOI-C-EST-DIFFERENT.md). Skim the boards, steal the pitch, point
> people here.

**Ask it like you'd ask a personal assistant — no dev skills required — and pull up any decision or
piece of info from your work in seconds, always with the sources.** *In Claude Desktop or on the
command line, your call.*

---

## The pitch, three lengths

**One-liner.**
> A second brain you **own**: your notes in plain Markdown, searched **by meaning**, answering in
> seconds **with the sources** — private on your machine by default.

**30 seconds.**
> Instead of digging through Slack, mail, Drive and your meeting notes, you just **ask**. Your second
> brain answers right away from your own notes — **by meaning, not keywords**, even across languages —
> and **always shows where it got it**. It's **yours**: a folder of Markdown files in your private git
> repo, indexed **on your machine by default** (nothing leaves it). After a one-time, guided setup,
> there's **nothing left to do** — backup, freshness and recovery run on their own. You just talk to it.

**2 minutes (the talk intro).**
> A bare LLM forgets everything between chats and answers from its training — so it can make things up.
> A SaaS note app locks your data in one tool, in a closed format. This is the third way: the project
> is a **generator**, not a product. It produces **your own** second brain — a vault of Markdown notes,
> linked by `[[wikilinks]]`, **Obsidian-compatible**, versioned in **your** git repo. A local **RAG**
> engine (an open **MCP** server) gives it **semantic search** that's **grounded**: every answer traces
> back to the originating note or message, with its date. Privacy is a **conscious choice you make at
> install** — fully on-device (a tiny Google model, *EmbeddingGemma*), an API key (Gemini, OpenAI, or
> your **company's own endpoint**), or local Ollama. And it's **engineered, not cobbled together**:
> auto-commit on every change, incremental re-indexing, deterministic checks that **prove** the answer
> came from your vault and not the Internet, and an engine that **updates itself** without ever touching
> your notes. The honest part: the **search** is local, but the LLM that **reasons** is still Claude
> (cloud) — and it's **Claude-only for now**. Everything else is yours, in the open.

---

## How a question flows — answer now, verify in the background

<img src="docs/img/board-flow.svg" alt="A question gets an immediate answer from your vault by semantic search (Phase 1), while external sources sync in the background (Phase 2), the answer is amended if something new is found (Phase 3), and everything is persisted with an automatic git commit (Phase 4) — the stale-while-revalidate pattern applied to memory." width="100%">

The web's **stale-while-revalidate** pattern, applied to your memory: you get a **fast** answer from
what's already indexed; freshness catches up **behind the scenes** and only **amends** the answer if
there's genuinely something new. *([details in EN-QUOI §2](EN-QUOI-C-EST-DIFFERENT.md#2-how-it-works-answer-right-away-verify-afterwards))*

---

## What it is — and what it is *not*

| ✅ What it **is** | ⛔ What it is **not** |
|---|---|
| **Yours**, in an open format (Markdown + `[[wikilinks]]`, Obsidian-compatible, your git repo) | **Not "100% private" end-to-end** — the **search** is local by default, but the LLM that **reasons** is still Claude (cloud) |
| **Grounded** — answers cite their sources, with dates; a canary **proves** it queried your vault | **Not zero-install** — daily *use* needs no skill, but the one-time setup (~15 min) assumes git + Node |
| **Cross-cutting** — Slack + Drive + mail + transcripts + your notes, in one place | **Not (yet) multi-AI** — Claude-only for the driving layer (vault + engine stay agnostic) |
| **Zero-chore** — backup, indexing, freshness, recovery, engine updates run on their own | **Not a synced fleet** — each generated brain is self-sufficient and evolves locally |

*Honesty is part of the approach — the full owned-up limitations are in
[EN-QUOI §7](EN-QUOI-C-EST-DIFFERENT.md#7-what-it-is-not-the-owned-up-limitations).*

---

## vs a bare LLM (ChatGPT / Claude alone)

<!-- Illustrated board: drop docs/img/board-vs-llm.png (prompt in docs/marketing-image-prompts.md), then uncomment:
<img src="docs/img/board-vs-llm.png" alt="Bare LLM vs your second brain" width="100%"> -->
> 🎨 *Illustrated board coming — generate `board-vs-llm.png` from
> [`docs/marketing-image-prompts.md`](docs/marketing-image-prompts.md) and drop it in `docs/img/`.*

| | A bare LLM | Your second brain |
|---|---|---|
| **Memory** | Only what you re-paste; forgotten after the chat | **Persistent**, grows with every question |
| **Grounding** | Answers from training — can make things up | **From your notes**, with the source and its date |
| **Scope** | A single walled conversation | **Cross-cutting** across all your tools |
| **Ownership** | Hosted, ephemeral | **Yours**, in Markdown, in your git repo |

---

## vs other "second brains" — a generator, not a product

<!-- Illustrated board: drop docs/img/board-generator.png (prompt in docs/marketing-image-prompts.md), then uncomment:
<img src="docs/img/board-generator.png" alt="A generator, not a product: one launcher produces many independent, owned brains" width="100%"> -->
> 🎨 *Illustrated board coming — generate `board-generator.png` from
> [`docs/marketing-image-prompts.md`](docs/marketing-image-prompts.md) and drop it in `docs/img/`.*

A useful second brain is **personal** — what serves a Head of Engineering, a PM or a researcher has
little in common. So this repo ships **the machinery + a method**, not a one-size-fits-all app. Everyone
**generates their own**; you share the **generator**, never the brain.

| | Classic "second brain" tools | This approach |
|---|---|---|
| **What's delivered** | A finished product, identical for everyone | A **generator** that produces **your** instance |
| **Your data** | At the vendor's, closed format | **At home**, in Markdown, in your git repo |
| **Scope** | Walled to a single tool | **Cross-cutting** across your tools |
| **Customization** | Settings in a closed UI | **Your `CLAUDE.md` constitution + your skills**, editable |

*The market landscape (Notion AI, Mem, Reflect, Tana, Obsidian plugins, Khoj, AnythingLLM, NotebookLM,
Glean…) is situated in [EN-QUOI §9](EN-QUOI-C-EST-DIFFERENT.md#9-for-the-record--and-compared-to-the-market-apps).*

---

## Privacy, à la carte — *you* decide who touches your data

<!-- Illustrated board: drop docs/img/board-privacy.png (prompt in docs/marketing-image-prompts.md), then uncomment:
<img src="docs/img/board-privacy.png" alt="Three embedding options on a privacy spectrum" width="100%"> -->
> 🎨 *Illustrated board coming — generate `board-privacy.png` from
> [`docs/marketing-image-prompts.md`](docs/marketing-image-prompts.md) and drop it in `docs/img/`.*

Most tools **impose** a search engine on you. Here the embedding engine is an **interchangeable
adapter** you pick at install — without breaking your notes or skills.

| Option | Privacy | For whom | Engine |
|---|---|---|---|
| 🟢 **On your machine** *(recommended ≥ 12 GB RAM, not Intel Mac)* | **Nothing leaves** · free · offline | Non-dev, nothing to install | **EmbeddingGemma**, on-device (ONNX) |
| 🟡 **With an API key** | Your notes' text goes to the provider you pick | Small machine / Intel Mac | **Gemini** / OpenAI / Mistral / **your company endpoint** |
| 🟢 **Local via Ollama** *(advanced)* | **Nothing leaves** either | Comfortable installing an app | Any Ollama model (e.g. `bge-m3`) |

> 🧠 **The embedder is *not* "ChatGPT on your machine".** It's a tiny vectorization model; the AI that
> **reasons and answers is still Claude**. Changing option re-encodes in a few minutes — no note lost.
> *([the “à la carte RAG”, EN-QUOI §6](EN-QUOI-C-EST-DIFFERENT.md#6-the-à-la-carte-rag-you-pick-your-engine-according-to-your-constraints))*

---

## Under the hood — one stable port, swappable adapters

<img src="docs/img/board-hexagon.svg" alt="A hexagonal RAG: at the center a stable MCP API port (search_vault, get_document, list_documents, vault_stats, reindex) that the whole harness depends on; around it, swappable SPI adapters — the embedder (local EmbeddingGemma, an API key, or Ollama), the SQLite vector store, and the chunking strategy." width="100%">

The engine is a **hexagon** (*The Hive* pattern): the **MCP surface is a stable contract** the whole
harness trusts, while the **embedder, vector store and chunking are interchangeable adapters**. That's
what makes "pick your privacy at install" **safe** — you swap the adapter, your notes and skills don't
move. *([ADR 0006](maintainers/decisions/0006-rag-mcp-is-stable-contract.md) ·
[ADR 0007](maintainers/decisions/0007-three-embedder-adapters-privacy-scale.md))*

---

## Qualities & engineering — *battle-tested, not cobbled together*

The reason it keeps working instead of merely *seeming* to: every load-bearing step is **deterministic,
tested and fail-loud**. The through-line — **fail loudly rather than pretend**.

<!-- Illustrated board: drop docs/img/board-reliability.png (prompt in docs/marketing-image-prompts.md), then uncomment:
<img src="docs/img/board-reliability.png" alt="The reliability stack" width="100%"> -->
> 🎨 *Illustrated board coming — generate `board-reliability.png` from
> [`docs/marketing-image-prompts.md`](docs/marketing-image-prompts.md) and drop it in `docs/img/`.*

**A · Grounded in truth (no hallucination).**
- **Semantic RAG grounding** — answers come *from your vault*, with the source note and its date.
- **Synthetic canary** — a made-up fact ("Pélagie de Mollecuisse / Flemmr"), unfindable outside the
  vault and keyword-proof, **proves** the answer is real retrieval, not invention.
- **Fail-loud verification** — `verify-rag` exits `0` only once the canary answers; otherwise it says so.
- **Background health-check**, non-blocking, re-checks the canary each session. *(ADR 0028)*
- **Index identity stamp + confirm-gate** — swapping embedders never silently corrupts the index. *(ADR 0006)*

**B · Determinism over guesswork.** *(the ladder of [ADR 0009](maintainers/decisions/0009-prefer-deterministic-mechanisms.md))*
- **Pure functions** with injected dependencies, unit-tested with fakes.
- **Binary exit-code tools** — a *verdict* (0/1), not a vibe.
- **Real event triggers, not timers** — auto-commit fires on a file edit; auto-push on the Stop event.
- **Bounded scheduler + injected clock** — a write burst coalesces into one incremental reindex.
- **PID + timestamp locking** — no two windows reindex at once.
- **LLM only where judgment is the point** (onboarding chat, wording) — never on a load-bearing step.

**C · Self-healing, desired-state.** *(SRE / GitOps prior art)*
- **Idempotent reconciler** converges the brain to its desired state — the pattern behind Kubernetes,
  GitOps, Terraform, Chef/Puppet, DSC. *(ADR 0026)*
- **Structural write-allowlist** — the reconciler can only *add* engine-delivered things when absent;
  it **never overwrites** your vault or constitution.
- **Self-upgradable engine** — your brain updates itself on request; **your notes, keys, constitution,
  settings and custom skills are never touched**. *(ADR 0012 / 0014 / 0025)*
- **No hidden, driftable state** — short-lived hooks re-derive what they need each run (`run-node`
  re-resolves the toolchain; `auto-push` re-queries the remote).

**D · Experience-first performance.**
- **Stale-while-revalidate** — instant answer, freshness in the background.
- **Incremental reindex** — only the delta is re-embedded, within seconds of an edit.
- **On-device embeddings** — *EmbeddingGemma* runs locally (it's designed to run even on a phone).

**E · Architecture — The Hive (hexagonal).**
- **Ports & adapters** — a **stable MCP API port** the whole harness depends on, behind which the
  **embedder, vector store and chunking are swappable adapters**. *(ADR 0006 / 0007)*
- **Open by construction** — open **protocol** (MCP) + open **format** (Markdown + `[[wikilinks]]`) +
  open **license** (Apache-2.0) → **zero lock-in**.

**F · Proven engineering.**
- **TDD baby-steps**, **green-only commits** (never commit red); **outside-in diamond TDD** for the harness.
- **Eval-set** — retrieval quality is *measured*, not asserted (see below).
- **ADR-governed** — 31 architectural decisions, each with an explicit `Scope:` and a `Crux`.
- **[Coming] Mutation testing** (Stryker) — a reliability score for the test suite itself *(in progress)*.

---

## Reliability, measured

- **Retrieval quality**: the local **"Gemma inside"** embedder scores **90%** on the project's
  [eval-set](maintainers/eval-set.md) — equal to Ollama, above the Gemini baseline (80%) — measured on
  real notes, not English leaderboards.
- **Test-suite strength**: a **mutation-testing** score (Stryker) is on its way — *this section will be
  filled with the number once it lands.*

---

## Who it's for

- **Managers, Heads of Engineering** — track your teams, your 1-1s, what's expected of you.
- **Product managers & designers** — keep the thread of product decisions and the *why we settled on it*.
- **Consultants, researchers, freelancers** — consolidate a domain, never lose a client's context.

> **No need to be a geek.** If you can *chat* with Claude, you can use it. Daily use is pure
> conversation; only the one-time install is technical, and it's guided end-to-end.

---

## Going further

- [README](README.md) — the full tour (install, under the hood, connectors).
- [What makes it different](EN-QUOI-C-EST-DIFFERENT.md) — the in-depth differentiators.
- [SETUP](SETUP.md) — step-by-step, privacy, remote repo, troubleshooting.
- [`maintainers/decisions/`](maintainers/decisions/) — the ADRs (the *why* of each stance).
- Thomas Pierrain's article series → [medium.com/@tpierrain](https://medium.com/@tpierrain).

<sub>Made with 🧠 by **Thomas Pierrain** — VP Tech at [shodo](https://shodo.io/). **Apache-2.0.**</sub>
