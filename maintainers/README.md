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
  > **Each ADR carries a `Scope:` line** (right under `STATUS`) situating it on the project's
  > backbone — the **launcher↔brain split** of ADR 0001. Three explicit values: **Installer** (how a
  > brain is *created*), **Second brain (runtime)** (the generated brain in *daily use*), or both
  > spelled out as **Second brain (runtime) + Installer**. A reading aid, not a taxonomy: it forces
  > the author to ask "am I deciding about the installer, the second brain, or both?" — and lets a
  > reader filter at a glance.
  - [`0001-launcher-vs-brain.md`](decisions/0001-launcher-vs-brain.md) — reusable read-only launcher
    vs brain created elsewhere; rename `starter` → `generator`.
  - [`0002-in-house-installer-vs-plugin.md`](decisions/0002-in-house-installer-vs-plugin.md) —
    home-grown installer/generator (designed for non-tech users, chat-guided) rather than a Claude
    plugin / marketplace.
  - [`0003-no-brain-capability-upgrade.md`](decisions/0003-no-brain-capability-upgrade.md) —
    no (yet) upgradability of capabilities: disproportionate complexity + simple local iteration
    (home-grown skills); to be reopened on feedback.
  - [`0004-claude-only-for-now.md`](decisions/0004-claude-only-for-now.md) —
    Claude-only for now (vault + RAG already agnostic); cross-platform not ruled out, on
    feedback, with the orchestration layer to adapt.
  - [`0005-support-desktop-code-tab.md`](decisions/0005-support-desktop-code-tab.md) —
    the Code tab (Claude desktop app) becomes an official target (= the same Claude Code, not
    cross-AI). **Revised 2026-06-06**: we flip the install gate → **trust Claude to install +
    fail loud** (failure A unproven; we catch instead of prevent).
  - [`0006-rag-mcp-is-stable-contract.md`](decisions/0006-rag-mcp-is-stable-contract.md) —
    the RAG's MCP surface is a stable public contract (API port); embedder/vector store/chunking
    = interchangeable adapters (SPI). Lets us move off Gemini (→ local) without breaking the
    brains. Complements 0003; generalization of `vault_stats` enacted.
  - [`0007-three-embedder-adapters-privacy-scale.md`](decisions/0007-three-embedder-adapters-privacy-scale.md) —
    three embedder choices (native Gemini **kept** / **OpenAI-compatible** with configurable URL,
    covering OpenAI·Azure·company gateway·Mistral·Ollama / **local**), ~2 impls to code; privacy
    scale by provider; on swap the database stays but the vectors don't (reindex).
    Concretizes 0006, opens the "2nd embedder discussion" of the SPI plan. **Default at install = open.**
  - [`0008-lightrag-graph-rag-deferred.md`](decisions/0008-lightrag-graph-rag-deferred.md) —
    **LightRAG / graph-RAG deferred** (interesting but not now): it's a **different paradigm**
    (LLM **per chunk** at indexing → cost + content leakage, breaks the non-dev/privacy target), not
    an embedder adapter → **orthogonal** to the current effort. Reserved for **Step 7**
    (big machine, opt-in, conditional), **to be settled by the FR eval-set**; **E2GraphRAG preferred**
    on a modest machine. Sequencing decision, not a rejection.
  - [`0009-prefer-deterministic-mechanisms.md`](decisions/0009-prefer-deterministic-mechanisms.md) —
    **reliability principle**: at equal reliability, prefer a **deterministic** mechanism (an event,
    a verifiable git condition, a stateless re-derivation, best-effort exit 0) over a probabilistic /
    LLM-driven / in-memory-timer one. Names a posture already applied piecemeal in 0002/0005/0006;
    reference instance = the `Stop`-event auto-push debounce. A *preference at equal reliability*, not
    a ban on timers/LLM judgment (bounded by the no-over-engineering rule).
- **[`eval-set.md`](eval-set.md)** — 🧪 **dev tool**: the RAG eval-set (Step 2 of the embedder plan).
  Measures the retrieval quality of the current embedder as a **reproducible score** (judge =
  Claude via `claude -p`), on the Flemmr vault → **Gemini baseline** to replay on the local
  embedders (Step 4). `node scripts/run-eval.mjs`. **Dev-only** (excluded from the generated brain).
- **`plans/`** — implementation plans, each with a `STATUS` line at the **top**
  (🗺️ ACTION PLAN / 🔬 STUDY / ⏳ PENDING / IN PROGRESS / ✅ SHIPPED / ABANDONED).
  > **Definition of done = archived.** The moment a plan ships, in the **same change**: set its top
  > `STATUS` to ✅ (with the proof — commit SHAs / what was verified) **and `git mv` it into
  > [`plans/archived/`](plans/archived/)**. Never leave a shipped plan at the root, and never delete it
  > (the archive keeps the step-by-step detail). Only plans still **open** — action plans mid-flight,
  > living studies, pending fixes — stay at the root of `plans/`.
  - **Active (root of `plans/`):**
    - [`rag-embedder-plan-action.md`](plans/rag-embedder-plan-action.md) — **🗺️ action plan**
      that **orchestrates** the embedder effort into **self-contained steps** (port → eval-set →
      OpenAI-compatible adapter → measurement → onboarding → conditional levers), with a **progress
      table** to drive it session by session (a `/clear` between each). A layer above the SPI plan +
      study + ADR 0007. **STATUS: 🗺️ ACTION PLAN** — Steps 1–5 shipped; Steps 6/7 (reranker /
      big-machine graph-RAG) **conditional**, opened only if a quality ceiling is hit.
    - [`etude-rag-local-criteres-et-veille.md`](plans/etude-rag-local-criteres-et-veille.md) — **study/watch**:
      offer a **range of RAG alternatives according to people's needs/constraints** (privacy, budget,
      machine power, OS, install friction). Office / big-machine / API-endpoint profiles +
      **refreshed** watch (EmbeddingGemma, bge-m3, Qwen3, E2GraphRAG…), **privacy scale by
      provider**, plain-language "embedder ≠ chat LLM", eval-first. **STATUS: 🔬 STUDY — nothing
      enacted.** *(feeds the SPI plan + ADR 0007)*
  - **`plans/archived/`** — shipped/closed plans (kept for the detail of the steps):
    - [`debounce-auto-push.md`](plans/archived/debounce-auto-push.md) — **debounce the auto-push**: keep
      per-edit local commits, but move `git push` out of the per-edit hook to a **`Stop` hook**
      (push once per turn) to avoid micro-pushes / rate-limiting. Indexing already debounced +
      incremental (no change). **STATUS: ✅ SHIPPED** (2026-06-13; 157/157 tests; empirically proven —
      5 edits/turn → 1 push, KO non-blocking, off/no-remote skip silently).
    - [`auto-open-env-gemini.md`](plans/archived/auto-open-env-gemini.md) — make the **installer open
      `.env` itself** on the Gemini-key path (CASE B), deterministically (tested seam
      `scripts/lib/open-env.mjs`, guard `SBG_NO_OPEN_ENV`), instead of relying on the Claude-driven
      amorce. **STATUS: ✅ SHIPPED** (2026-06-13; proven end-to-end + real-Mac TextEdit confirm).
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
    - [`translate-to-english.md`](plans/archived/translate-to-english.md) — full FR → EN translation of
      the generator (docs, skills, code, demo), tests made language-agnostic, on a dedicated branch.
      **STATUS: ✅ DELIVERED 2026-06-10** (PR #2 merged into `main`, `V2` tag; FR preserved via `--lang fr`).
    - [`translate-to-english-PROGRESS.md`](plans/archived/translate-to-english-PROGRESS.md) — lot-by-lot
      resumption note for the translation chantier (companion of the plan above). **STATUS: ✅ SHIPPED.**
    - [`inprocess-en-canary-fix.md`](plans/archived/inprocess-en-canary-fix.md) — fix the **in-process +
      EN** post-flight canary failure: the winning chunk ranked #9 but `SEARCH_DEFAULT_LIMIT` was 5.
      Fix "Both": raise the limit 5→8 **and** re-phrase the EN inertia-trophy note so the chunk ranks #1.
      **STATUS: ✅ SHIPPED 2026-06-10** (commits `4dc2200` + `aa60ede`; EN & FR in-process exit 0).
    - [`install-ux-feedback.md`](plans/archived/install-ux-feedback.md) — changes from the **v2 EN
      install field test** (location question, embedder wording, Desktop-first recap, example-notes
      purge, installer menu, README findability). Items A→G. **STATUS: ✅ SHIPPED 2026-06-10**
      (E `e993af4`, F `a16711c`, G `03717ce`).
    - [`translate-remaining-french-to-english.md`](plans/archived/translate-remaining-french-to-english.md) —
      mop-up of the **last French** left after PR #2, in dev-only surfaces (comments, measure scripts,
      `maintainers/**`). Lot 1 = `.gitignore` + measure scripts; Lot 2 = repoint 7 dangling cross-doc
      `#anchor` links onto the live EN headings; Lot 3 = archived plans (nothing to translate — all
      residual FR is intentional records/keeps). **STATUS: ✅ SHIPPED 2026-06-13** (`fbd70ba`, `e6e1801`).
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
