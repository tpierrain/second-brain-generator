# `maintainers/` — the generator's dev context

> ⚠️ **Versioned, but NEVER shipped to the end user.**
> This folder travels between the **maintainer's** machines (git sync across laptops) and stays
> visible in the cloned launcher. But it is **excluded from the bootstrap copy**: it **never**
> lands in a generated brain. The exclusion is coded in
> [`scripts/lib/tracked-files.mjs`](../scripts/lib/tracked-files.mjs) (`DEV_ONLY_PREFIXES` — which
> also excludes the **eval-set tooling**, see below), tested in `tracked-files.test.mjs`.
> It is also not auto-loaded by Claude (only `CLAUDE.md` and the skills are).
>
> **So:** anything that should only serve the development of the generator — and above all not
> pollute a user's brain — goes here. Nothing secret for all that (no keys: see `.gitignore`).

## Contents

- **`decisions/`** — the architecture decisions (ADRs): the *why*, durable.
  - [`0001-launcher-vs-brain.md`](decisions/0001-launcher-vs-brain.md) — reusable read-only launcher
    vs brain created elsewhere; rename `starter` → `generator`.
  - [`0002-installateur-maison-vs-plugin.md`](decisions/0002-installateur-maison-vs-plugin.md) —
    home-grown installer/generator (designed for non-tech users, chat-guided) rather than a Claude
    plugin / marketplace.
  - [`0003-pas-upgrade-capacites-cerveaux.md`](decisions/0003-pas-upgrade-capacites-cerveaux.md) —
    no (yet) upgradability of capabilities: disproportionate complexity + simple local iteration
    (home-grown skills); to be reopened on feedback.
  - [`0004-claude-only-pour-l-instant.md`](decisions/0004-claude-only-pour-l-instant.md) —
    Claude-only for now (vault + RAG already agnostic); cross-platform not ruled out, on
    feedback, with the orchestration layer to adapt.
  - [`0005-support-onglet-code-desktop.md`](decisions/0005-support-onglet-code-desktop.md) —
    the Code tab (Claude desktop app) becomes an official target (= the same Claude Code, not
    cross-AI). **Revised 2026-06-06**: we flip the install gate → **trust Claude to install +
    fail loud** (failure A unproven; we catch instead of prevent).
  - [`0006-le-mcp-du-rag-est-un-contrat-stable.md`](decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md) —
    the RAG's MCP surface is a stable public contract (API port); embedder/vector store/chunking
    = interchangeable adapters (SPI). Lets us move off Gemini (→ local) without breaking the
    brains. Complements 0003; generalization of `vault_stats` enacted.
  - [`0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md) —
    three embedder choices (native Gemini **kept** / **OpenAI-compatible** with configurable URL,
    covering OpenAI·Azure·company gateway·Mistral·Ollama / **local**), ~2 impls to code; privacy
    scale by provider; on swap the database stays but the vectors don't (reindex).
    Concretizes 0006, opens the "2nd embedder discussion" of the SPI plan. **Default at install = open.**
  - [`0008-lightrag-et-graph-rag-differes.md`](decisions/0008-lightrag-et-graph-rag-differes.md) —
    **LightRAG / graph-RAG deferred** (interesting but not now): it's a **different paradigm**
    (LLM **per chunk** at indexing → cost + content leakage, breaks the non-dev/privacy target), not
    an embedder adapter → **orthogonal** to the current effort. Reserved for **Step 7**
    (big machine, opt-in, conditional), **to be settled by the FR eval-set**; **E2GraphRAG preferred**
    on a modest machine. Sequencing decision, not a rejection.
- **[`eval-set.md`](eval-set.md)** — 🧪 **dev tool**: the RAG eval-set (Step 2 of the embedder plan).
  Measures the retrieval quality of the current embedder as a **reproducible score** (judge =
  Claude via `claude -p`), on the Flemmr vault → **Gemini baseline** to replay on the local
  embedders (Step 4). `node scripts/run-eval.mjs`. **Dev-only** (excluded from the generated brain).
- **`plans/`** — implementation plans, with a `STATUS` at the top (SHIPPED / IN PROGRESS / ABANDONED).
  **Shipped** plans are moved to **`plans/archived/`**; only the plans still **open** stay at the
  root of `plans/`.
  - [`rag-embedder-plan-action.md`](plans/rag-embedder-plan-action.md) — **🗺️ action plan**
    that **orchestrates** the embedder effort into **self-contained steps** (port → eval-set →
    OpenAI-compatible adapter → measurement → onboarding → conditional levers), with a **progress
    table** to drive it session by session (a `/clear` between each). A layer above the SPI plan +
    study + ADR 0007. **STATUS: 🗺️ ACTION PLAN.**
  - [`etude-rag-local-criteres-et-veille.md`](plans/etude-rag-local-criteres-et-veille.md) — **study/watch**:
    offer a **range of RAG alternatives according to people's needs/constraints** (privacy, budget,
    machine power, OS, install friction). Office / big-machine / API-endpoint profiles +
    **refreshed** watch (EmbeddingGemma, bge-m3, Qwen3, E2GraphRAG…), **privacy scale by
    provider**, plain-language "embedder ≠ chat LLM", eval-first. **STATUS: 🔬 STUDY — nothing
    enacted.** *(feeds the SPI plan + ADR 0007)*
  - [`translate-to-english.md`](plans/translate-to-english.md) — full FR → EN translation of the
    generator (docs, skills, code, demo), tests made language-agnostic, on a dedicated branch.
    **STATUS: TODO — pushed to the VERY END.**
  - **`plans/archived/`** — shipped plans (archive, kept for the detail of the steps):
    - [`embedder-spi.md`](plans/archived/embedder-spi.md) — abstract the RAG's embedder behind an
      `Embedder` SPI port + stamp the index with an identity (provider/model/dimension) to make a
      swap **safe** (natural-language confirm-gate, never a silent reindex). Concretizes
      ADR 0006 + its addendum. **STATUS: ✅ SHIPPED** (Step 1 of the action plan; keeps Gemini as the
      only impl + a test FakeEmbedder; 2nd real embedder = Step 3).
    - [`onglet-code-desktop.md`](plans/archived/onglet-code-desktop.md) — make install/usage from the
      **Claude desktop app (Code tab)** reliable: trust Claude + fail loud + sourced demo.
      **STATUS: DONE.** (ADR 0005 + 0006)
    - [`claude-driven-install.md`](plans/archived/claude-driven-install.md) — "install my second
      brain" onboarding driven by Claude. **STATUS: SHIPPED.**
    - [`launcher-vs-brain.md`](plans/archived/launcher-vs-brain.md) — switch of the install model. **STATUS: SHIPPED.**
    - [`harden-run-node-smoke-and-coverage.md`](plans/archived/harden-run-node-smoke-and-coverage.md) —
      harden the `run-node` wrapper (smoke-test in an impoverished PATH, broadened coverage). **STATUS: SHIPPED.**
    - [`fix-hooks-node-nvm.md`](plans/archived/fix-hooks-node-nvm.md) — silent hooks when `node` comes
      from nvm (resolved by `run-node`). **STATUS: SHIPPED.**
    - [`rename-bootstrap-to-installer.md`](plans/archived/rename-bootstrap-to-installer.md) — rename
      `bootstrap` → `installer`. **STATUS: SHIPPED.**
- **`retrospectives/`** — 📝 **takeaway-oriented retros**: the **story** of a notable session
  (the starting question, the path investigation→measurement→fix, the transferable lessons). To be
  distinguished from ADRs (the *why* of a decision) and plans (the *what/how*): here it's the
  **raw material for an article**, the lessons learned. **Convention**: one file per session,
  `retrospectives/takeaways-<topic>-<YYYY-MM-DD>.md`; catchy title + one or more lessons as
  numbered **"Takeaway"** items + a section of **transferable meta-lessons**. Dev-only (prefix
  `maintainers/`), never copied into a generated brain.
  - [`takeaways-embedder-partage-2026-06-09.md`](retrospectives/takeaways-embedder-partage-2026-06-09.md) —
    "When the *small architectural refinement* reveals a ×50 on latency": the architecture question
    asked **before** wiring, the ×50 due to `createEmbedder()` per request, the fix (shared hot ONNX
    session), 7 meta-lessons (port ≠ perf guarantee; the symptom's magnitude ≠ the cause's; weight
    the worst case by its frequency…). *(Step 4-quater of the embedder plan.)*
  - [`takeaways-install-embedder-choix-2026-06-09.md`](retrospectives/takeaways-install-embedder-choix-2026-06-09.md) —
    "Removing an obligation made the install *better* verified": un-forcing the Gemini key → the
    all-local option self-proves (canary without a key); the pure/tested decision core under an I/O
    shell; a single gate (`geminiKeyRequired`) that flushes out a bug at the periphery (the status
    hook); a new default shipped by **detection** (not by global flip). 6 meta-lessons. *(Step 5 of the embedder plan.)*

- **`benchmarks/`** — 📊 **reproducible measurements** (volumes, throughput, RAM, latencies): the raw
  numbers of a run, with a replayable protocol. To be distinguished from the retros (the story/the lessons).
  - [`stress-test-in-process-vault-reel-2026-06-09.md`](benchmarks/stress-test-in-process-vault-reel-2026-06-09.md) —
    1st stress-test of the **all-local in-process** embedder on a **real dense vault** (271 notes /
    2,764 chunks): **~5 min 48 s**, **peak RAM ~2.9 GB** (batch cap held, vs 8.5 GB without),
    **0 errors**, retrieval quality **3/3** (isolated fact / nuance / multi-hop). Replayable protocol +
    measurement pitfalls. *(Validates the all-local default outside the demo.)*

## History

This folder replaces the old Claude "memory" (which lived outside the repo, in
`~/.claude/projects/…/memory/`, tied to the machine's absolute path → not portable across laptops).
The durable content was brought back here to be **versioned and syncable**. The reusable working
rules, for their part, have joined their natural home:
- test discipline (non-brittle asserts on strings) → skill `tdd-discipline`;
- neutrality exception (Thomas Pierrain's name) → [`DEVELOPING.md`](../DEVELOPING.md).
