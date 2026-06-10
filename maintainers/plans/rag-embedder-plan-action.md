<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🗺️ ACTION PLAN (created 2026-06-08) — orchestration, step-by-step execution. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Action plan — RAG: make the embedder swappable (3 adapters) + measure + onboard

> **STATUS: 🗺️ ACTION PLAN** (created 2026-06-08).
> **Orchestration layer** on top of the docs already written — it doesn't replace them, it
> **sequences** them:
> - the *why* → ADR [`../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md)
>   (+ [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md));
> - the *how* of the port → plan [`embedder-spi.md`](archived/embedder-spi.md) **(✅ DELIVERED — archived)**;
> - the *what to measure* → study [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md).

## How to use this plan (mandatory reading)

- **One step = one session.** Do a **`/clear` between each step**. Each step is **self-contained**:
  it says which files to load, what to do, and how to know it's finished.
- **At the start of each session**, tell Claude: *"We're tackling Step N of the plan
  `maintainers/plans/rag-embedder-plan-action.md`"*. Claude reads **this file** + the files cited
  by the step, and **nothing else is needed**.
- **During** a step, Claude **ticks the sub-boxes as it goes** (you can follow along live in
  this file). **At the end**, it ticks the step's box + notes _(date · commit)_ — that's the **memory
  that survives `/clear`s**.
- **Dev discipline** (steps that touch code): **TDD mandatory** — skill `tdd-discipline`,
  and `outside-in-diamond-tdd` for the back-end/Hive scope. **Manual**, conventional commits,
  co-author Claude. Baby-steps, fail-first, refactor non-optional.
- **Sequence guard-rail**: do NOT code a 2nd adapter (Step 3) **before** the port is in
  place (Step 1). Do NOT launch the quality levers (Steps 6-7) **before** the measurement (Step 4)
  proves a need.

## Tracking — checkboxes (live-monitorable in this file)

> Tick as you go. The **sub-boxes** let you follow progress *while* a step
> runs (especially the TDD baby-steps). When a step is finished: tick its box + note _(date · commit)_.

- [x] **D1 — Decide the install default** 🧭 *(Thomas's decision, **AFTER Steps 4 AND 4-bis**; depends on: 4, 4-bis)* — **DECIDED: option C (explicit 3-way choice), ADAPTIVE reco (16 GB+ → in-process ⭐ ; ≤ 8 GB or Intel Mac → API key ⭐)** _(2026-06-09)_
  - [x] Cross-testing the adapters **together** (Thomas + Claude), on the basis of the measurements (Steps 4 + 4-bis) _(2026-06-09)_
  - [x] Decide the default — **in-process "Gemma inside"** retained as the **recommended default** (viability proven Step 4-bis), presented in an **explicit 3-way choice** (option C): 1=in-process ⭐ / 2=API key (Gemini or enterprise endpoint) / 3=Ollama (advanced); Intel Mac guard-rail (option 1 hidden) _(2026-06-09)_
  - [x] Record (ADR 0007 addendum) with the *why* + the **mandatory free/paid key framing** for option 2 → [`../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md`](../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md#addendum-d1-2026-06-09--défaut-dembedder-à-linstallation--tranché) _(2026-06-09)_
- [x] **Step 1 — `Embedder` port + safe index** 🧪 TDD *(depends on: —)* _(2026-06-08 · 2ac9698→bf2ead8)_
  - [x] `index_meta` stamp — round-trip (written at indexing, read back) _(2026-06-08 · 2ac9698)_
  - [x] Identity guard — divergent/absent identity → "stale index" signal, no false results _(2026-06-08 · 7e9fdec)_
  - [x] Extract the `Embedder` port; `GeminiEmbedder` implements the existing one (behavior unchanged) _(2026-06-08 · 9d3b869)_
  - [x] Inject the port into the 2 consumers (`index-manager` stamps; `search-vault`/`index.ts` consults the guard) _(2026-06-08 · 99abe61, 7fc678b)_
  - [x] Single selection point `createEmbedder()` (in `embedder.ts`, not `config.ts`: import cycle) — without a multi-provider `switch` _(2026-06-08 · a49f861)_
  - [x] *(option)* deterministic `FakeEmbedder` + test _(2026-06-08 · bf2ead8)_
  - [x] `npm test` (`rag/` folder) green (91/91); `embedder-spi.md` archived → `plans/archived/`
- [x] **Step 2 — Local eval-set (judge = Claude)** 🧪 *(depends on: —)* — **instrument + Gemini baseline 80% (8/10) DELIVERED** _(2026-06-09 · e64f2bb, 0448c03)_
  - [x] Representative vault chosen: **Flemmr example vault** (invented → public-safe, versioned, **replayable by all**). A richer corpus = deferred to Step 4 (decided with Thomas) _(2026-06-09)_
  - [x] Questions written: **10** (small Flemmr corpus → ~10 rather than 15-20; mix of easy + grep-resistant; 1st = `demo.mjs` canary) _(2026-06-09 · e64f2bb)_
  - [x] "Search + Claude judgment" script → reproducible score: `scripts/run-eval.mjs` + tested pure core; `claude -p` judge **validated end-to-end** (PASS on relevant passage, FAIL on off-topic); **dev-only** (excluded from the brain); documented [`../eval-set.md`](../eval-set.md) _(2026-06-09 · e64f2bb, 0448c03)_
  - [x] **Gemini baseline measured and recorded** ✅ — **80% (8/10)** on the Flemmr vault, recorded in [`../eval-set.md`](../eval-set.md#baseline-gemini--80-810-2026-06-09). The `claude -p` exit 1 block was indeed **environmental** (Claude quota/usage from the day before, reset) — not a code bug: `claude -p` works again, the eval ran from end to end. The 2 misses are **real retrieval failures** (answer present in the vault, insufficient passages) → honest baseline, we don't inflate it _(2026-06-09)_
- [x] **Step 3 — OpenAI-compatible adapter (URL+key)** 🧪 TDD *(depends on: 1)* — **delivered, 98/98 green** _(2026-06-09 · d321365)_
  - [x] `OpenAiCompatibleEmbedder`: `{model,input}` → `data[].embedding`; `embedDocuments`/`embedQuery` (shared `embed()` helper; `fetch` injected to test the envelope without network) _(2026-06-09)_
  - [x] `identity` (provider/model/dimension) filled from config — `providerId="openai-compatible"`; dimension = invalidation key (read **before** any embed since stamped upstream) _(2026-06-09)_
  - [x] Wired into `createEmbedder()` via `.env` — **pure** selection function `selectEmbedder(env)` (testable); `EMBEDDING_PROVIDER` + `EMBEDDING_BASE_URL` + `EMBEDDING_API_KEY` + `EMBEDDING_MODEL_NAME` + `EMBEDDING_DIMENSION`; documented in `.env.example` _(2026-06-09)_
  - [x] Bearer auth if key present; **no** `Authorization` header if key empty (local); non-ok response → **loud error** (never a silently empty vector in the index) _(2026-06-09)_
  - [x] Tested against an OpenAI-compatible endpoint **and** against local Ollama (`localhost:11434/v1`): envelope/headers/errors/selection proven in unit tests (`openai-compatible-embedder.test.ts`, 98/98 green) **AND a real live smoke done in Step 4** (Ollama installed via cask, `embeddinggemma`/`bge-m3` pulled, indexing+search of the Flemmr vault 100% local proven by the `index_meta` stamp) _(2026-06-09)_
- [x] **Step 4 — Wire up local + MEASURE vs Gemini** 📊 *(depends on: 1,2,3)* — **measured: local ≥ Gemini on Flemmr FR (90%/90%/80%), no quality penalty** _(2026-06-09 · 2a5f63f)_
  - [x] Wire up EmbeddingGemma (via Ollama + adapter #3) — `embeddinggemma` pulled, 768-dim, score **90% (9/10)** _(2026-06-09)_
  - [x] Wire up bge-m3 — `bge-m3` pulled, 1024-dim, score **90% (9/10)** _(2026-06-09)_
  - [x] Re-index the representative vault for each — DB purged + full reindex per model, distinct `index_meta` stamp (anti-fallback proof) _(2026-06-09)_
  - [x] Run the eval-set on each, vs Gemini (baseline re-measured same session = **80% (8/10)**, reproduced from yesterday) _(2026-06-09)_
  - [x] Table of quantified results (FR quality + footprint/latency) → recorded [`../eval-set.md`](../eval-set.md#étape-4--résultats-mesurés-local-vs-gemini-2026-06-09) _(2026-06-09)_
  - [~] **Office default decision**: measurement + **recorded reco** (local viable, lightweight EmbeddingGemma natural candidate); quantified answer to Dimitry written. **Final decision = D1 (Thomas)** — small corpus ⇒ fine decision EmbeddingGemma vs bge-m3 to be redone on a rich corpus before recording
- [x] **Step 4-bis — Standalone RAG MCP "Gemma inside" (in-process embedder, WITHOUT a server)** 🧪 TDD *(depends on: 1, 4)* — **VIABLE as default: npm-only install Mac+Win, tenable latency, 90% quality = Ollama** _(2026-06-09 · 86ea386)_
  - [x] `InProcessEmbedder implements Embedder` via Transformers.js v4 (`@huggingface/transformers@4.2`) — `feature-extraction` pipeline, **EmbeddingGemma-300m-ONNX** (q8), `embedDocuments`/`embedQuery`, mean pooling + L2 normalization; **injectable** pipeline (logic tested **without** weights); **memoized** (loaded once) _(2026-06-09)_
  - [x] `identity` = `providerId="transformers-js"` / model / 768; wired into `selectEmbedder()` via `EMBEDDING_PROVIDER=in-process` (no URL, no key) + `.env.example`; weights downloaded+cached on first use, **loud failure naming the model** if DL impossible (never an empty vector) _(2026-06-09)_
  - [x] **V1 — cross-OS install**: `npm i @huggingface/transformers` → `onnxruntime-node@1.24.3` **bundles** the pre-built binaries `win32/x64+arm64`, `darwin/arm64`, `linux/x64+arm64`; `requirements=[]` everywhere (only remote CUDA GPU on Linux) → **nothing to compile or download, offline-friendly Mac+Win**. ⚠️ **Intel Mac (darwin/x64) not covered** by this version _(2026-06-09)_
  - [x] **V2 — CPU latency**: weights download ~28 s **once** (cached); cold start with cached weights **675 ms**; warm throughput **8–9 ms/text (~110/s)** without Metal GPU → tenable (one-off encoding) _(2026-06-09)_
  - [x] **V3 — quality re-measured (quantized)**: in-process q8 eval-set = **90% (9/10)** = EmbeddingGemma via Ollama, **> Gemini 80%**. **Parity confirmed, not assumed.** Discovery: the gap came from the **EmbeddingGemma task prompts** (raw q8 = 80%; q8 + prompts = 90%), not from quantization _(2026-06-09)_
  - [x] Viability table + **verdict "VIABLE as default"** recorded [`../eval-set.md`](../eval-set.md#étape-4-bis--viabilité-de-lin-process--gemma-inside--sans-ollama-2026-06-09) → feeds D1. `npm test` **green (109/109)**; MCP contract **unchanged** _(2026-06-09)_
- [x] **Step 4-ter — Embedding batch capping (in-process hardening)** 🧪 TDD *(depends on: 4-bis; **BLOCKING for option 1 delivered in Step 5**)* — **delivered: `EMBED_BATCH=4` (measured sweet-spot), 111/111 green, MCP contract unchanged** _(2026-06-09)_
  - [x] Bounded sub-batches in **`InProcessEmbedder.embedDocuments`** (constant `EMBED_BATCH` + configurable `batchSize?`) — placed in the adapter because the RAM constraint is **specific to in-process ONNX** (Gemini/OpenAI = network) → protects all callers; `embedQuery` unchanged _(2026-06-09)_
  - [x] **4/8/16** sweep on the dense corpus (264 notes): **counter-intuitive — the small batch wins on both axes** (batch 4 = ~3.2 GB in-proc peak / 5.3 min / 8.5 ch/s; batch 16 = 5.35 GB / 7.4 min). Quality unchanged. Constant **frozen at 4**; reusable script `rag/scripts/measure-batch.mts` (dev-only, excluded from the brain) _(2026-06-09)_
  - [x] `npm test` green (rag 111/111; scripts 92/92); MCP contract unchanged; numbers + in-proc/OS RSS caveat recorded [`../eval-set.md`](../eval-set.md#balayage-du-plafond-4--8--16-2026-06-09); **note for Step 5: OS peak ~3.8-4 GB → D1 threshold to reconsider (12 GB or even 8 GB)** _(2026-06-09)_
- [x] **Step 4-quater — Shared embedder (process memoization, in-process hardening)** 🧪 TDD *(depends on: 4-bis; **BLOCKING for option 1 delivered in Step 5**)* — **delivered: `createEmbedder()` memoized → 1 shared warm ONNX session, 112/112 green, MCP contract unchanged** _(2026-06-09)_
  - [x] **Discovery (probe `rag/scripts/measure-contention.mts`, dev-only)**: the MCP server reindexes INSIDE its process (startup auto-reindex + watcher) → search and indexing share the CPU. But `search_vault` called `createEmbedder()` **on every request** → fresh instance, empty `private` memoization → in-process: **ONNX session reloaded on every search (~440 ms at idle)** and **2 concurrent sessions** (search + indexing) over-reserve the cores → **search up to ×50 (25 s!)**. Gemini didn't show it (free client, embed = network, zero local CPU) _(2026-06-09)_
  - [x] **TDD fix (baby-step): `createEmbedder()` memoizes at module level** → search AND auto-reindex share the same warm instance/session. Provider frozen at the 1st selection (swap = restart Claude Code, already the case); Gemini key still read **lazily** at embed time (pasting the key afterwards still works) _(2026-06-09)_
  - [x] **Proven end-to-end** via the real `createEmbedder()`: search at idle **510 → 35 ms (p95)**, search during background indexing **25,429 → 810 ms (p95)**. The small batch=4 (4-ter) naturally airs out the event-loop. `worker_thread` deemed unnecessary (no over-engineering: 0.7 s in a rare window = initial indexing, the incremental is sub-second) _(2026-06-09)_
- [x] **Step 5 — Onboarding / install (3-way choice + adaptive reco)** 🧪 *(depends on: D1, 3, **4-ter**, **4-quater**)* — **DELIVERED: adaptive install flow, Gemini key un-forced; in-process end-to-end smoke (canary without key) + verify-rag exit 0** _(2026-06-09 · 7be29f6→4e83c5e)_
  - [x] **Detect the machine** (`os.totalmem()` + Intel Mac `darwin/x64`) → **adaptive reco**: **threshold frozen at 12 GB** (Thomas) → ≥ 12 GB & not Intel Mac = option 1 ⭐; otherwise = option 2 ⭐. PURE logic tested (`scripts/lib/embedder-choice.mjs`, `recommendedEmbedderKey`) _(2026-06-09 · 7be29f6)_
  - [x] **Present the 3 options** (confidentiality order, ⭐ on the machine reco); **option 1 hidden + renumbered on Intel Mac** (`buildEmbedderOptions`); option 2 = sub-choice **Gemini OR OpenAI-compatible endpoint** (URL/model/dimension/key) interactively _(2026-06-09 · 26f6961)_
  - [x] **Option 2 (Gemini)** → **"free ≠ private"** framing displayed **before** the key (interactive installer + bootstrap stub) _(2026-06-09 · 26f6961, 4e83c5e)_
  - [x] **Stop *forcing* the Gemini key**: `geminiKeyRequired(env)` gates the installer, `verify-rag` and `session-status`; options 1/3 → `EMBEDDING_PROVIDER` in `.env`, key step skipped; `--embedder` (non-interactive) otherwise machine reco _(2026-06-09 · 4f620c1, d17a6d8, 26f6961)_
  - [x] Reuse the pedagogical tables (confidentiality scale / embedder≠LLM / reusable-on-swap) at the choice point (interactive installer + bootstrap stub + SETUP) _(2026-06-09 · 26f6961, 4e83c5e)_
  - [x] `verify-rag` passes with the retained embedder — **proven end-to-end in-process WITHOUT a key** (Mollecuisse canary, `exit 0`); `embedderReady` drives indexing + post-flight _(2026-06-09 · d17a6d8, 26f6961)_
- [ ] **Step 6 — Local reranker** 🧪 *(conditional; depends on: 4 + observed ceiling)* _(… · …)_
  - [ ] Add local reranking behind a clean abstraction
  - [ ] Measure the gain on the eval-set → ship only if a quantified gain
- [ ] **Step 7 — Big-machine profile** 🧪 *(conditional; depends on: 4 + persistent ceiling)* _(… · …)_
  - [ ] Wire up a "max quality" embedder (big Qwen3 / Nemotron-8B) and/or evaluate E2GraphRAG
  - [ ] Measure vs the office default; document as opt-in (not the default)

---

## Decision D1 — Decide the install-time default embedder 🧭

> **✅ RESOLVED (2026-06-09) → option C: explicit 3-way choice at install**, **recommended default
> ADAPTIVELY based on the machine** (see below). Recorded in an **ADR 0007 addendum**
> ([link](../decisions/0007-trois-adaptateurs-embedder-et-echelle-confidentialite.md#addendum-d1-2026-06-09--défaut-dembedder-à-linstallation--tranché)).
> The section below is kept as a **trace of the reasoning**. The implementation = **Step 5**.
>
> **🎚️ ADAPTIVE reco (Thomas's directive, 2026-06-09) — the install detects the machine:**
> - **Capable machine (16 GB+ RAM, Apple Silicon / Windows)** → ⭐ **option 1 (in-process)**: private,
>   free, nothing to install. *(requires batch capping, Step 4-ter — otherwise it explodes, see dense test.)*
> - **Small machine (≤ 8 GB RAM) OR Intel Mac** → ⭐ **option 2 (API key)**: Gemini, OpenAI, or **any
>   provider, including the company's endpoint**. **Why**: in-process climbs to **~6 GB during
>   indexing** → swaps on 8 GB; and it's **unavailable on Intel Mac**. API = RAM ~0, it stays light.
> - **Exact threshold** (8/12/16 GB?) to be **finalized after Step 4-ter** (the RAM peak depends on the retained batch cap).
>
> **Type:** Thomas's **product/UX** decision (no code). Taken AFTER Steps 4 AND 4-bis, at
> the end of **tests done together** (Thomas + Claude) on the adapters. Blocks only Step 5.
>
> **🎯 Preference stated by Thomas (2026-06-08, refined 2026-06-09):** the **ideal** default is
> the PURELY LOCAL one, and **even better the LOCAL IN-PROCESS "Gemma inside"** (Step 4-bis: embedder
> embedded in the MCP, **zero server/app to install**) — **strong product argument**: *"we don't send
> your data to a provider, AND you install nothing more"* (level 1 of the confidentiality
> scale, without the Ollama friction). We retain it **if Step 4-bis proves its viability**
> (Mac **and** Windows install without build tools, tenable CPU latency, quantized quality at parity of the
> 90% measured at Step 4). Otherwise, fall back to local-via-Ollama (power-user) or an API option. **This is
> precisely what the tests decide — not intuition.**

- **Load:** the results of Steps 4 (Ollama measurement) **and 4-bis** (in-process viability: install
  Mac+Win, latency, quality); ADR 0007 §"Open questions" (point 1) + § confidentiality scale;
  the repo's `CLAUDE.md` (install philosophy "always generic, as few questions as possible").
- **The question:** which default embedder, and what install UX around it? Leads (to be decided *by
  the tests*):
  - **All-local IN-PROCESS by default** *(privileged target)* — zero key/cloud **and zero separate
    install** (Gemma embedded in the MCP), max privacy; **conditioned on Step 4-bis**.
  - **Local via Ollama** — max privacy too, but **separate app to install** → rather power-user.
  - **A** — simple single default + swap via `.env` afterwards.
  - **B** — A + a **mini-question** only for the enterprise case ("OpenAI/Azure mandated?").
  - **C** — explicit 3-way choice right at install (clearer, more friction).
- **Done:** the decision is **recorded** (short addendum to ADR 0007, or a new ADR if it warrants it),
  with its *why* **backed by the numbers from Steps 4 + 4-bis**. The D1 boxes are ticked.

---

## Step 1 — The `Embedder` port + an index safe against swaps 🧪

> **The founding instrument.** Without it, nothing is cleanly swappable. **Keep Gemini as the only
> real impl** (+ a possible test `FakeEmbedder`). **Introduces NO 2nd real adapter.**

- **Prerequisite:** none (it's the base).
- **Load:** plan [`embedder-spi.md`](archived/embedder-spi.md) **in full** (it's self-contained) + the
  files it cites (`rag/src/lib/embedder.ts`, `config.ts`, `vector-store.ts`, `index-manager.ts`,
  `tools/search-vault.ts`, `index.ts`, `tools/reindex.ts`, `embedder.test.ts`).
- **Do:** execute the plan's TDD refactor map (`embedder-spi.md` §5), in order:
  stamp round-trip → identity guard → extract the port → inject into the 2 consumers →
  single selection point `createEmbedder()` → (option) `FakeEmbedder`.
- **Done:** `npm test` (`rag/` folder) green; the `Embedder` port exists; the index is stamped
  (provider/model/dimension); an identity swap triggers the **"stale index" signal** +
  confirm-gate (no false results); the MCP contract has **not** moved. Conventional commits per
  baby-step.
- **On exit:** tick the Step 1 boxes; move `embedder-spi.md` to `plans/archived/`
  when it's delivered (see convention `maintainers/README.md`).

---

## Step 2 — The local eval-set (judge = Claude) 🧪

> **The lever that turns "risky" into "measured".** Little code, huge value. Independent of
> Step 1 (can be done before/in parallel), but **indispensable before Step 4**.

- **Prerequisite:** none. *(Ideally the Step 1 port is there, but not required to build
  the eval-set itself.)*
- **Load:** study [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md)
  §6; `scripts/verify-rag.mjs` (the "Mollecuisse" canary = the eval seed already there).
- **Do:** build **15-20 questions → expected answer/passages** on a **representative vault**
  (Thomas's real brain or a realistic sample, rich in entities/relations). A local script like
  `verify-rag` that, for each question: runs the search, and has **Claude judge the relevance**
  (LLM-as-judge; occasional use = acceptable). Output = a reproducible **quantified score**.
- **Done:** a script that produces a **reproducible** eval score on the current embedder (Gemini),
  serving as a **baseline**. Documented (how to add/rerun it). Conventional commit.
- **Guard-rail:** no heavy infra (LangFuse & co) — a local script gives 90% of the value (study §6).

---

## Step 3 — The OpenAI-compatible adapter (configurable URL + key) 🧪

> **The highest-leverage impl** (ADR 0007 §3): one adapter → OpenAI, Azure, enterprise
> gateway, Mistral, **and local via Ollama** (`localhost` URL). It's the "2nd impl" whose
> *prior discussion* (plan `embedder-spi.md` §0.2) was decided by ADR 0007.

- **Prerequisite:** **Step 1 delivered** (the port exists).
- **Load:** ADR 0007 (§1 schema, §2 "keep Gemini native", §3 envelope-vs-letter); plan
  `embedder-spi.md` §2 (port signature, intent→dialect table); `rag/src/lib/config.ts`
  (`createEmbedder()`, single selection point).
- **Do (TDD):** implement `OpenAiCompatibleEmbedder implements Embedder` — sends `{model, input}`
  to `<baseURL>/embeddings`, reads `data[].embedding`; `identity` = provider/model/dimension;
  `embedDocuments`/`embedQuery` (the "taskType" doesn't exist on the OpenAI side → treated the same). Wire it
  into `createEmbedder()` (the selection `switch`, e.g. via `EMBEDDING_PROVIDER` + `EMBEDDING_BASE_URL`
  + key). **Touches neither the port nor the MCP contract.**
- **Done:** `npm test` green; we can point the embedder at an OpenAI-compatible endpoint **and** at
  a local Ollama (`http://localhost:11434/v1`) via `.env`, without touching the harness. The stamp
  reflects the new provider/model → swap = confirm-gate (Step 1). Conventional commits.

---

## Step 4 — Wire up local + MEASURE vs Gemini 📊

> **The quantified answer to Dimitry** + the choice of the "office" default. We decide **only** by the
> measurement (all the quality literature is cloud+English — study §3/§5).

- **Prerequisite:** **Steps 1, 2, 3 delivered**.
- **Load:** study §3 (candidates: **EmbeddingGemma**, **bge-m3**; footprint §1.3); the eval
  script (Step 2).
- **Do:** via Ollama + the OpenAI-compatible adapter (Step 3), wire up **EmbeddingGemma** and
  **bge-m3**, re-index a representative vault, and **run the eval-set (Step 2)** on each, **vs
  Gemini** (baseline). Compare FR quality **and** real footprint/latency (Mac/PC).
- **Done:** a **table of quantified results** (Gemini vs EmbeddingGemma vs bge-m3) on the real
  FR corpus → **office default decision** recorded (study/ADR addendum). Quantified answer to
  Dimitry written. Step 4 boxes ticked.
- **Conditional exit:** if a local embedder **equals/approaches** Gemini → we have the
  free+private default. If a quality **ceiling** is observed → Steps 6/7 become relevant.

---

## Step 4-bis — Standalone RAG MCP "Gemma inside": the in-process embedder, WITHOUT a server 🧪

> **The step that can unblock the ideal default.** Step 4 proved that local **equals Gemini** in
> quality — but via **Ollama** (separate app to install), a deal-breaker friction for a non-dev. This
> step tests the **viability of an embedder embedded in the MCP itself** (Transformers.js + Gemma in
> ONNX): *"paste nothing, it works"*. If it passes, it's **the** #1 candidate for the default in D1.
> Watch recorded: study [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md) **§3 ter**.

- **Prerequisite:** **Step 1 delivered** (the `Embedder` port) + **Step 4 delivered** (the 90%/80%
  baseline to match); eval-set (Step 2).
- **Load:** study **§3 ter** (the in-process watch + the 3 validations + sources); `rag/src/lib/embedder.ts`
  (port + `selectEmbedder`); `rag/src/lib/openai-compatible-embedder.ts` (the model of an adapter:
  `identity`, `embed()`, loud failure, injected dep); the eval script (Step 2).
- **Do (TDD, baby-steps):** implement `InProcessEmbedder implements Embedder` via **Transformers.js
  v4** (`@huggingface/transformers`, `feature-extraction` pipeline, **EmbeddingGemma-300m-ONNX** in q8) —
  `embedDocuments`/`embedQuery`, mean pooling + normalization; **injectable pipeline** to test the
  envelope logic **without** downloading the weights (same spirit as the injected `fetch` of Step 3).
  `identity = { providerId: "transformers-js", model, dimension: 768 }`. Wire it into `selectEmbedder()`
  via `EMBEDDING_PROVIDER=in-process` (**no URL, no key**). Weights downloaded+cached on first use,
  **loud failure** if DL impossible (never an empty vector in the index). **Touches neither the port nor the
  MCP contract.**
- **Validate empirically (the 3, outside unit tests):**
  - **V1 — cross-OS (HARD requirement: Mac AND Windows at parity)**: on a **bare Mac AND a bare Windows**,
    `npm i` pulls the **pre-built** `onnxruntime-node` binaries without build tools / without Python (the
    impoverished environment of the Code tab). *The touchstone of the default — if it breaks on one of the two OSes, it's
    not the default.*
  - **V2 — CPU latency**: vault indexing + search, without Metal GPU → measure, judge tenable for
    a non-dev (encoding is one-off; q8/q4 help).
  - **V3 — quality re-measured**: replay the eval-set with the in-process adapter (**quantized** model)
    → score **vs 90% (Ollama)** and **80% (Gemini)**. **Confirm parity**; don't assume that
    quantized = identical.
- **Done:** the adapter exists (`npm test` green), wired via `.env`; a **viability table**
  recorded (Mac+Win install OK? · latency · in-process score vs Ollama vs Gemini) + a **verdict
  "viable as default / not viable"** → feeds **D1**. MCP contract **unchanged**. Conventional
  commits per baby-step.
- **Conditional exit:** **viable** → #1 candidate for the all-local default in D1 (Ollama relegated to the
  power-user, API endpoint to the enterprise). **Not viable** (install KO on one OS, deal-breaker latency,
  or quantized quality collapsing) → documented fallback to local-via-Ollama and/or API endpoint.

---

## Step 4-ter — Embedding batch capping (in-process hardening) 🧪

> **Discovered by the dense-corpus test (2026-06-09, real personal vault = 264 notes / 2709 chunks).** The
> 4-bis viability was measured on Flemmr (7 notes) → a misleading snapshot. On a real vault,
> `embedDocuments` receives **all the chunks of a note at once**: a long note (sync/1-1
> transcript = **78 chunks of ~2000 tokens**) creates a batch whose O(seq²)×batch attention **makes
> onnxruntime explode** → **8.5 GB RSS and climbing, stall** (process killed at ~12 min, stuck). It's a
> **MANDATORY fix**, not an edge-case: without it, the option 1 default crashes on a dense
> user. Numbers recorded [`../eval-set.md`](../eval-set.md#étape-4-ter--corpus-dense--plafonnement-de-lot-2026-06-09).

- **Prerequisite:** **Step 4-bis delivered** (`InProcessEmbedder`).
- **Load:** `rag/src/lib/in-process-embedder.ts` (`embedDocuments`); `rag/src/lib/indexer.ts`
  (`indexPreparedDocs` calls `ports.embed(all the chunks of the doc)`); the `eval-set.md` numbers.
- **Do (TDD, baby-steps):** split the embedding into **bounded sub-batches** (constant `EMBED_BATCH`,
  value to be tuned) instead of one batch per document. At the right level: either in `InProcessEmbedder.embedDocuments`
  (bounds every call), or in the indexer (bounds the orchestration). **Touches neither the port nor the MCP contract.**
- **Measure:** replay the dense corpus; **sweep batch 4 / 8 / 16** for the RAM↔time trade-off (measured
  ref.: batch 16 = peak **6.1 GB**, **7 min 27 s**, **6 chunks/s**; without a cap = explodes). Freeze the constant.
- **Done:** full index of a real vault **without a RAM explosion** (target: hold on 8 GB?), peak + time
  recorded; `npm test` green; MCP contract unchanged. Conventional commits per baby-step.

---

## Step 4-quater — Shared embedder: a single warm ONNX session 🧪

> **Discovered while tackling Step 5 (Thomas's architecture question).** The MCP server reindexes INSIDE its
> process (startup auto-reindex + as-you-go watcher) → **search shares the CPU with
> indexing**. Measured (`rag/scripts/measure-contention.mts`): `search_vault` called
> `createEmbedder()` **on every request**, and since the pipeline memoization was `private` (per instance),
> each search **reloaded an ONNX session** (~440 ms even at idle); worse, search and reindex
> created **two concurrent sessions** → core over-reservation → **search up to ×50 (25 s)**.
> Invisible with Gemini (free client, embed = network). **MANDATORY fix**: without it, the option 1
> default gives a sluggish search.

- **Prerequisite:** **Step 4-bis delivered** (`InProcessEmbedder`).
- **Load:** `rag/src/lib/embedder.ts` (`createEmbedder`/`selectEmbedder`); `rag/src/index.ts`
  (`search_vault` line ~58) + `rag/src/lib/index-manager.ts` (`reindex` line ~60) — the 2 callers.
- **Do (TDD, baby-step):** **memoize `createEmbedder()` at module level** → one process singleton,
  shared by the search AND the auto-reindex (a single warm ONNX session). Provider frozen at the 1st
  selection (a swap already goes through a Claude Code restart); Gemini key still read
  **lazily** at embed time. **Touches neither the port nor the MCP contract.**
- **Prove:** replay the probe via the **real** `createEmbedder()` → search at idle **510 → 35 ms
  (p95)**, search during background indexing **25,429 → 810 ms (p95)**. The batch=4 (4-ter) naturally
  airs out the event-loop between sub-batches. `worker_thread` deemed unnecessary (0.7 s in a rare window —
  the initial indexing; the incremental is sub-second).
- **Done:** `createEmbedder()` memoized; `npm test` green (rag 112/112); MCP contract unchanged; numbers
  recorded here. Conventional commits per baby-step.

---

## Step 5 — Onboarding / install: the embedder choice, made crystal clear 🧪

> Today the install **forces** a Gemini key (`installer.mjs`, `scripts/verify-rag.mjs`,
> `gemini-key.mjs`, `.env.example`, `CLAUDE.md` bootstrap stub step 4). This step adapts the flow according to the
> **D1 Decision**, and **capitalizes on the pedagogical artifacts** (ADR 0007 requirement).

- **Prerequisite:** **D1 Decision recorded** (✅) + **Step 3 delivered** (✅) + **Step 4-ter delivered** (the
  batch capping, otherwise the recommended option 1 explodes on a dense user).
- **Load:** **D1** addendum of ADR 0007 (the table of the 3 options + the free/paid key framing
  + the adaptive reco); ADR 0007 §"Pedagogical requirement"; study §1.3 (embedder≠LLM), §privacy
  (scale), §2 (reusable-on-swap); memory `rag-adapters-pedagogy-requirement` +
  `local-embedder-in-process-path` (real footprint numbers); the onboarding files that **force**
  Gemini today (`installer.mjs`, `scripts/verify-rag.mjs`, `gemini-key.mjs`, `.env.example`, `CLAUDE.md`
  bootstrap stub step 4); `rag/src/lib/embedder.ts` (`selectEmbedder` — the `EMBEDDING_PROVIDER` already wired).
- **Do — the install flow (option C, explicit 3-way choice, ADAPTIVE reco):**
  1. **Detect the machine**: total RAM (`os.totalmem()`) + OS/arch (Intel Mac `darwin/x64` = option 1
     unavailable). From that, deduce the **reco**: **16 GB+** machine → ⭐ option 1 (in-process); **≤ 8 GB** or
     **Intel Mac** → ⭐ **option 2 (API key)**. *(Exact threshold to be frozen with the RAM peak from Step 4-ter.)*
  2. **Present the 3 options** (sorted by confidentiality), the recommended option at the top with "⭐ recommended
     for your machine": **1.** everything on your machine, nothing to install (in-process); **2.** with an API key —
     **Gemini, OpenAI, or any provider, including your company's endpoint**; **3.** local
     via Ollama (advanced). On Intel Mac, **hide option 1**.
  3. **If option 2 chosen**: display the **"free ≠ private"** framing (free Gemini = data
     exploited; paid ~tens of cents/month = non-exploitation; enterprise endpoint = tenant), then
     open `.env` for the key (current logic, but **conditioned on this choice**).
  4. **If option 1 or 3 chosen**: **stop forcing** the Gemini key — write `EMBEDDING_PROVIDER=in-process`
     (or the Ollama config) in `.env`, **skip** the key step.
  5. **Reuse the 3 pedagogical tables** (confidentiality scale / embedder≠LLM / reusable-on-swap)
     at the choice point — always "table + verdict in one sentence, zero jargon".
- **Done:** a non-dev installs with the **reco adapted to their machine** without friction; on a small machine, the API
  (Gemini/OpenAI/enterprise) is clearly recommended and **explained** (why: RAM); the key is requested
  **only** if option 2; **`verify-rag` passes with the retained embedder** (in-process included — Mollecuisse
  canary already proven). Conventional commits.

---

## Step 6 — Local reranker *(conditional)* 🧪

> **Only if Step 4 shows a ceiling.** The "best quality/cost ratio" is a **hypothesis
> NOT proven in local/FR** (study §5) → to **measure**, not to assume.

- **Prerequisite:** Step 4 delivered **and** a quality ceiling observed.
- **Load:** study §5 (rerankers: `bge-reranker-v2-m3`, `Qwen3-Reranker`); the eval script.
- **Do (TDD):** add a local reranking step **after** the dense search, behind a clean
  abstraction (same spirit as the `Embedder` port). **Measure the gain** on the eval-set.
- **Done:** **quantified** gain (or absence of gain → we don't ship). Decision recorded.

---

## Step 7 — Big-machine profile *(conditional)* 🧪

> **Only if Step 4 proves a ceiling** that the reranker doesn't lift — accepting the machine cost.

- **Prerequisite:** Steps 4 (+6) delivered and a persistent ceiling.
- **Load:** study §3 (big Qwen3 / Nemotron-8B), §4 (**E2GraphRAG** — the graph route *without an LLM per
  chunk*, to prefer over LightRAG on a modest machine); ADR
  [`../decisions/0008-lightrag-et-graph-rag-differes.md`](../decisions/0008-lightrag-et-graph-rag-differes.md)
  (the *why* of deferring LightRAG / graph-RAG: LLM per chunk → cost + leak; to measure on the
  FR eval-set; E2GraphRAG preferred).
- **Do:** wire up a "max quality" embedder (opt-in) and/or evaluate E2GraphRAG; **measure** vs the
  office default. Reserve for the big-machine profile (not the default — study criteria 1-4).
- **Done:** big-machine profile documented + measured, **opt-in**, without degrading the default.

---

## Reminder of the invariants (never to be breached)

- **The MCP contract doesn't move** (ADR 0006) — embedder/reranker/store are interchangeable SPI.
- **Embedder swap = confirm-gate, never a silent reindex** (ADR 0006 addendum); stamp on
  **provider+model+dimension** (not the dimension alone — it's a trap).
- **We keep Gemini native** (taskType) — we don't replace it with OpenAI-compatible (ADR 0007 §2).
- **We measure before choosing** (eval-set), and before any quality lever.
- **HARD cross-platform: the retained solution works under Windows AS WELL AS under Mac** (Thomas's
  requirement, 2026-06-09). Any default candidate (in-process, Ollama…) must prove it on **both** bare
  OSes — not just on the dev Mac.
- **The launcher stays generic**; no over-engineering against an unproven risk (Thomas's way of
  working).
