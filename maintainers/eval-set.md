<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS : 🧪 DEV TOOL (shipped 2026-06-09) — Step 2 of the embedder plan.     -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# RAG eval-set — measuring retrieval quality (judge = Claude)

> **What it's for.** This is the **measurement instrument** of [Step 2 of the embedder
> plan](plans/rag-embedder-plan-action.md): it turns "is this embedder good?" into a
> **reproducible numeric score**. It establishes the **Gemini baseline**; in [Step 4](plans/rag-embedder-plan-action.md#étape-4--brancher-le-local--mesurer-vs-gemini-),
> we replay the **same** harness on the local embedders (bge-m3, EmbeddingGemma) to compare them
> **on real-world content**, not on English leaderboards.
>
> **Dev-only.** Excluded from the generated brain (`DEV_ONLY_PREFIXES` in
> [`../scripts/lib/tracked-files.mjs`](../scripts/lib/tracked-files.mjs)): it serves to choose the
> embedder **of the launcher**, it has no value on a user's side (Flemmr notes purged).

## How it works

For each eval-set question: we run `search_vault` (via the **real** `vault-rag` MCP server, the
actual contract), then we ask **Claude** (`claude -p`) to judge **whether the returned passages are
enough to answer** — it relies only on the passages, not on its own knowledge. The judge ends with
`VERDICT: PASS` / `VERDICT: FAIL`; the score = `PASS / total`.

The baseline's corpus = the **shipped example vault** (Flemmr, parodic → invented, hence
public-safe, versioned and **replayable by anyone**). The 1st question reuses the **grep-proof
canary** from `demo.mjs` (answer "Mollecuisse" not findable by keyword → real semantic proof).

## Running it

From the repo root, with a **Gemini key in `.env`** (search embeds the questions) and the
**`claude` CLI** in the PATH:

```bash
node scripts/run-eval.mjs
```

- `exit 0` = eval carried out (the **score may be low** — it's a *measurement*, not a failure).
- `exit 1` = **operational** failure (no key, index KO, MCP dead, or **unreadable verdict** =
  judge that didn't follow the format → we don't publish an invalid score).
- Optional: `EVAL_JUDGE_MODEL=<model>` to pin a judge model (e.g. a Haiku, cheaper).

> **Reproducibility.** The judge is an LLM → the score is **stable**, not bit-exact. The instruction
> is binary and objective (are the passages enough, yes/no) → low variance. Enough to separate
> embedders (study §6: a local script gives 90% of the value, without heavy infra).

## Gemini baseline — **80% (8/10)** _(2026-06-09)_

First reference number, current embedder **Gemini**, on the Flemmr example vault (7 notes):

| | Questions | Score |
|---|---|---|
| **Gemini (baseline)** | 8 PASS / 10 | **80.0%** |

The **2 misses** are **real retrieval failures** (not an eval-set bug): the answer does exist in the
vault, but the returned passages weren't enough for the judge.

- *"How much did Flemmr raise in its Series A…?"* — fact present in `vault/topics/flemmr.md`.
- *"What is Flemmr's slogan?"* — slogan present in the **same** file.

> This is exactly the signal an eval-set must capture: we **do not fix** the question or the vault to
> push the number up — that would drain the measurement of its meaning. 80% is the **ground truth**
> that the local embedders (Step 4) will have to match or beat, **under the same harness**.
> (Note: small corpus → a single run; if Step 4 calls for finer granularity, average a few runs.)

## Adding / editing a question

Edit [`../scripts/lib/eval-set.mjs`](../scripts/lib/eval-set.mjs): an item =
`{ question, expect }` (the natural-language question + the **expected** answer, the ground-truth
that good retrieval should make it possible to give). Guardrail: `eval-set.test.mjs` requires ≥ 8
well-formed questions and at least one anchored on the Mollecuisse canary.

Deliberately mix **easy** questions (the answer-term is in the notes → they test the floor) and
**synonym** questions (grep-resistant → they test meaning): a weak embedder drops off on the latter.

## The files

| File | Role | Tested |
|---|---|---|
| `scripts/lib/eval-set.mjs` | The Flemmr questions (data, source of truth) | structural |
| `scripts/lib/eval-judge.mjs` | Judge prompt, verdict reading, score (PURE) | ✅ unit |
| `scripts/lib/eval-run.mjs` | Orchestration `search → judge → verdict → score` (PURE, injected deps) | ✅ unit |
| `scripts/lib/mcp-search.mjs` | N `search_vault` requests over **one** MCP session | ✅ (MCP stub) |
| `scripts/run-eval.mjs` | Executable: wires index + real MCP + `claude -p` | — (I/O, like `verify-rag`) |

## Step 4 — measured results (local vs Gemini) _(2026-06-09)_

Three embedders, **same harness**, same Flemmr vault, **same session** (on AC power), via Ollama +
the OpenAI-compatible adapter (`EMBEDDING_PROVIDER=openai-compatible`, `EMBEDDING_BASE_URL=http://localhost:11434/v1`):

| Embedder | Location | Dim | **FR score** | Miss(es) | Index 7 notes (warm) | Disk | Resident RAM |
|---|---|---|---|---|---|---|---|
| **EmbeddingGemma** | 🟢 local | 768 | **90% (9/10)** | Series A | ~1.3 s | 621 MB | ~0.67 GB (Metal GPU) |
| **bge-m3** | 🟢 local | 1024 | **90% (9/10)** | Q1 (idle employee) | ~1.7 s | 1.2 GB | ~0.66 GB (Metal GPU) |
| **Gemini** (baseline) | 🔴 cloud | 3072 | **80% (8/10)** | Series A + slogan | ~20.8 s | 0 | 0 (key+quota+network) |

**Anti-fallback (proven)**: distinct index stamps (`index_meta` = provider/model/dimension),
vectors stored at the right dimension, **0 Gemini calls** during the local runs (quota counter frozen).

**Honest reading** — the robust signal is **"no quality penalty in going local"**: both locals
**match or beat** Gemini here. But the 90 vs 80 = **a single question's gap**, within the
noise (LLM judge variance + **tiny corpus** where top-k brings back almost everything), and **each
model misses a different question** → the defensible conclusion is **"local at least at parity"**, not
"local beats Gemini". Latency: on 7 notes the local indexes ~15× faster (no network/throttle);
the gap widens at the scale of a real vault, with encoding remaining **one-off**.

> **Reproduce**: `rm -f rag/.cache/vault.db*` then, for a local one,
> `EMBEDDING_PROVIDER=openai-compatible EMBEDDING_BASE_URL=http://localhost:11434/v1 EMBEDDING_API_KEY= EMBEDDING_MODEL_NAME=<embeddinggemma|bge-m3> EMBEDDING_DIMENSION=<768|1024> node scripts/run-eval.mjs`
> ; without the `EMBEDDING_*` = native Gemini. Local prerequisite: Ollama + `ollama pull <model>`.

## Step 4-bis — viability of in-process "Gemma inside" (WITHOUT Ollama) _(2026-06-09)_

Same harness, same Flemmr vault, but the embedder runs **inside the RAG's Node process**
(Transformers.js v4 + EmbeddingGemma-300m **ONNX q8**), **without a server or app** — wired by
`EMBEDDING_PROVIDER=in-process` (no URL, no key). Verdict of the **3 validations**:

| Validation | Result | Measured detail (this Mac, Apple Silicon) |
|---|---|---|
| **V1 — cross-OS install** | ✅ **OK Mac+Windows** | `npm i @huggingface/transformers` → `onnxruntime-node@1.24.3` **bundles** the pre-built binaries `win32/x64`, `win32/arm64`, `darwin/arm64`, `linux/x64+arm64`; `requirements=[]` everywhere (only the Linux CUDA GPU is remote) → **nothing to compile, nothing to download, offline-friendly**. ⚠️ **Mac Intel (darwin/x64) not supported** by this version (Apple Silicon ✅). |
| **V2 — CPU latency** | ✅ **tenable** | Weights download **~28 s once only** (cached afterwards); cold start with cached weights = **675 ms** (load+1st embed); warm throughput **8–9 ms/text (~110/s)**, **without a Metal GPU**; 768-dim vector **normalized** (‖v‖=1). |
| **V3 — quality (quantized)** | ✅ **Ollama parity (90%)** | eval-set replayed: **90% (9/10)**, = EmbeddingGemma via Ollama, **> Gemini 80%**. Only miss: "Series A" (same as Ollama). |
| **V4 — footprint (disk + RAM)** | ⚖️ **local price accepted** | **Disk**: +~550 MB in `node_modules` (onnxruntime binaries for all OSes; ~35 MB actually loaded on Mac) + ~150–300 MB of weights in the HF cache on first use. **RAM**: model loaded = **~1.1–1.6 GB resident** (variance of the onnxruntime CPU arenas), **stable** whatever the vault's size (the indexer embeds **doc by doc**, `indexer.ts:46`). |

**MCP startup is NOT slowed down (measured).** Boot → "MCP running on stdio" handshake =
**~0.5–0.7 s**, **identical** in Gemini default and in `in-process`. Reasons: `server.connect()` happens
**before** any embedding (`index.ts:257`); the model is **never imported statically** (only a
**lazy** `await import("@huggingface/transformers")` + a **memoized** pipeline); it only loads on the
**1st search** (or on the background reindex, non-blocking). In Gemini default, `InProcessEmbedder` is
not even instantiated → **zero impact**. The cost (~675 ms of loading per process launch, weights
cached) is therefore **paid on the 1st search, not at boot**. The only possible RAM bloat (~2.1 GB): a
**single** note of several hundred chunks encoded in one batch — an edge case, fixable by slicing if it
ever bites.

**The V3 lesson (important).** EmbeddingGemma **requires its task prompts** (`task: search result |
query: …` on the search side, `title: none | text: …` on the document side). Ollama applies them
internally; in-process **it's up to us**. Without them, raw q8 = **80%** (and the *Mollecuisse* canary
misses); with them, **90%**. So the gap came from **misusing the model, not from the quantization** —
the quantized↔Ollama parity is **confirmed, not assumed** (exactly what the plan asked us to verify).

**Anti-fallback (proven)**: full reindex (`7 indexed`) under stamp `index_meta` =
`transformers-js`/`embeddinggemma-300m-ONNX`/`768`, **0 network calls** during the eval (offline).

> **Verdict 4-bis → VIABLE as default.** In-process removes the **only** serious objection to
> all-local (the Ollama friction) **without giving up anything**: `npm`-only install on Mac (Apple
> Silicon) AND Windows, tenable one-off latency, quality **at Ollama parity (90%)** and above Gemini.
> → **candidate #1 for the default in D1.** Honest reservations: (a) **RAM** — the ~1.5 GB is only true
> **at rest/in search**; **when indexing a dense corpus it climbs to ~6 GB** (cf. Step 4-ter
> below), comfortable at 16 GB+, **swaps on 8 GB** (vs ~0 for Gemini, remote); (b) **Mac Intel** outside
> `onnxruntime-node` 1.24.3 coverage; (c) the Flemmr corpus is
> small (90 vs 80 = one question, cf. the limit below); (d) pre-built binaries **volatile** →
> re-check the matrix at each `onnxruntime-node` bump.

> **Reproduce**: `rm -f rag/.cache/vault.db*` then
> `EMBEDDING_PROVIDER=in-process node scripts/run-eval.mjs` (no URL, no key; weights downloaded on the
> 1st run then cached). Without the `EMBEDDING_*` = native Gemini. *(The "current embedder: Gemini"
> label printed by the script is cosmetic and hard-coded — the measurement really is in-process, proven
> by the stamp and the reindex.)*

## Step 4-ter — dense corpus: batch cap _(2026-06-09)_

The 4-bis viability was measured on Flemmr (7 notes). **Test on a real dense personal vault (264 notes,
2709 chunks, avg 10.3/note)** — temporary copy, **in-process** embedder (nothing leaves), neutral
persistence — corrects this snapshot on two points and reveals a mandatory fix:

| | **Current prod** (batch = all chunks of a note) | **Batch capped at 16 chunks** |
|---|---|---|
| Issue | ❌ **stall** (killed at ~12 min, stuck on a 78-chunk note) | ✅ **264/264 indexed** |
| Resident RAM peak | **8.5 GB** and climbing | **6.1 GB** (OS: 6.55 GB) |
| Total time | never finished | **7 min 27 s** |
| Throughput | — | **6 chunks/s** · 0.6 note/s · load 0.8 s · rest 1.67 GB |

**Root cause**: `embedDocuments` receives **all the chunks of a note at once** (`indexer.ts:46`).
A long note (sync/1-1 transcript = **78 chunks of ~2000 tokens**) creates a batch whose attention in
**O(seq²)×batch** blows up onnxruntime. 17 notes of the vault exceed 20 chunks, 6 exceed 50.

### Sweep of the cap 4 / 8 / 16 _(2026-06-09, shipped)_

Cap implemented in `InProcessEmbedder.embedDocuments` (TDD, constant `EMBED_BATCH`,
configurable `batchSize?`) — at the adapter level, since the RAM constraint is **specific to
in-process ONNX** (Gemini/OpenAI go through the network); it thus protects **all** callers.
Sweep on the same dense vault (264 notes / 2709 chunks), in-process, neutral persistence:

| batch cap | RSS peak *(in-process)* | total time | throughput |
|---|---|---|---|
| 16 | 5.35 GB | 7.42 min | 6.1 chunks/s |
| 8 | 3.82 GB | 6.52 min | 6.9 chunks/s |
| **4 ✅ chosen** | **3.16 GB** | **5.31 min** | **8.5 chunks/s** |

**Counter-intuitive result: the SMALL batch wins on BOTH axes** (RAM *and* time). On CPU, large
batches × long sequences inflate attention without vectorizing any better; small batches keep a
cache-friendly working set. **Quality is unchanged** (each text is embedded independently — batching
doesn't touch the vectors; the 90% from 4-bis holds). → **`EMBED_BATCH = 4` locked in.**

> ⚠️ **in-process RSS vs OS**: these peaks are read via `process.memoryUsage().rss` **inside** the process —
> ~0.7-0.8 GB below the external OS RSS (the batch 16 measured at 6.1 GB OS above = 5.35 GB here). **Estimated
> real OS peak of batch 4 ≈ 3.8-4 GB.** Reproduce (from `rag/`): `node --import tsx scripts/measure-batch.mts <4|8|16>`
> — dense vault via the argument or `$MEASURE_VAULT`; with nothing = the repo's example vault.

**Three lessons (invisible on Flemmr):**
1. **Current prod is not safe on a real vault** → **capping the batch size is MANDATORY**
   (Step 4-ter of the plan, TDD, blocking for the option-1 default). **✅ Shipped (batch=4).**
2. **RAM during indexing ≫ 1.5 GB**: with batch=4, **OS peak ≈ 3.8-4 GB** (vs ~6 GB at batch 16) → **fits
   comfortably on 12 GB, and plausibly on 8 GB** (to confirm on a real machine). The ~1.5 GB only
   holds at rest/search.
3. **Throughput ≪ 110/s**: the "8-9 ms/text" was on **short** text; real chunks brush against the
   max context → **8.5 chunks/s at batch 4** (~13× slower than the marketing). Cold index of a real vault
   ≈ **5.3 min**, **once** (incremental by hash afterwards).

> **Verdict D1 — to reconsider for Step 5**: batch 4 lowers the OS peak from ~6 GB (batch 16) to
> ~3.8-4 GB. The enacted threshold "16 GB+ → in-process ⭐ / ≤ 8 GB → API ⭐" was calibrated on 6 GB; with ~4 GB,
> **a 12 GB threshold (or even 8 GB) becomes defensible**. To be settled by Thomas when locking in the
> machine-detection threshold (Step 5) — the measurement doesn't decide the UX on its own. **Doesn't invalidate
> choice C** (3 explicit options); the API-key option (RAM ~0) stays relevant on a very small machine / Mac Intel.

## Step 4 — discriminate more finely (known limit)

The Flemmr corpus (7 notes) is small → embedder discrimination is **limited** (top-k brings back
almost everything, hence the neck-and-neck above). To **really** separate EmbeddingGemma vs bge-m3
(and settle D1 on numbers that separate), point the same harness at a **richer** corpus
(Thomas's real brain, or a realistic sample): only the question set changes, the rest of the
instrument is unchanged.
