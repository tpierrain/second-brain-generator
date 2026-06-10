<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: 🔬 STUDY / WATCH (created 2026-06-08) — NOTHING DECIDED, exploration. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Study — Offer a range of RAG alternatives to suit people's needs and constraints

> **STATUS: 🔬 STUDY / WATCH** (created 2026-06-08, **watch refreshed 2026-06-08** via
> multi-source research + adversarial verification — see §8). **Nothing is decided here** — it's the
> exploration note that will feed decisions (ADR) and the implementation plan
> [`embedder-spi.md`](embedder-spi.md). The concrete choice of an embedder/strategy is made **after
> measurement** (see §6), not on intuition.
>
> **The thesis (reframed with Thomas, 2026-06-08).** The goal is **not** "get out of Gemini" —
> that's just *one* case. The goal is: **offer several RAG alternatives, and help each person
> choose the right one based on THEIR needs and THEIR constraints** (privacy, budget, machine power, OS,
> corpus type, tolerance for install friction). "Getting out of Gemini" is *one* answer among
> others, for the free + private profile. The `Embedder` SPI port is the mechanism that makes this
> **range** possible without breaking the harness or the MCP contract.
>
> **Origin:** request from **Dimitry Ernot** ("being able to use something other than Google Gemini" —
> Betclic has a packaged ChatGPT + Claude Code; his wife uses a Mistral tool) + leads from **Gaël Bernier**
> (VIF feedback at the Nantes Communities Night, 28/05: LightRAG/GraphRAG, LangFuse, LLM-as-judge,
> human-in-the-loop).

---

## 1. The axes of needs / constraints (what drives the choice)

The study is **not** looking for a single "winner": it's looking to **map user profiles onto
RAG profiles**. The axes that tip a person's choice one way or another:

- **Privacy** — must the vault stay **on-device** (nothing to the cloud), or is sending to a third-party
  API acceptable?
- **Budget** — must it be free, or is an API cost tolerated?
- **Machine power** — modest **office** machine (no GPU) vs **big machine** (GPU/RAM).
- **OS** — must run on **Mac AND PC (Windows)** (ideally Linux).
- **Install friction** — **non-dev** (zero install, "just paste a key") vs **dev/power-user**
  (willing to install Ollama, a model, etc.).
- **Corpus type & quality target** — corpus rich in entities/relations + need for multi-hop
  reasoning (→ GraphRAG) vs simple semantic search; quality requirement in **French**.

### 1.1 — The default the generator targets (Thomas's constraints, validated 2026-06-08)

The **default profile** the generator must serve (core target: non-dev like "Achille's bare
Mac") **ideally ticks every** one of these — Thomas acknowledges that ticking them *all at once*
"is going to be tricky", hence the **measurement** (§6) and the **multi-tier offering** (§1.2):

1. **Free** — no payment.
2. **Privacy** — local / **on-device**.
3. **Cross-platform** — Mac AND PC (Windows), no NVIDIA GPU dependency.
4. **Runs on an office machine** — modest machine, no dedicated GPU.

### 1.2 — The multi-tier RAG offering (the real ambition)

Rather than a single choice, **a range of profiles**, selectable (via `.env` / installer),
each addressing a set of constraints:

| RAG profile | For whom (needs/constraints) | Likely stack |
|---|---|---|
| **Office** (personal default) | Non-dev, free, private, modest machine, Mac/PC | Light local embedder (**EmbeddingGemma** or **bge-m3**) via Ollama, flat retrieval + local reranker |
| **Big machine** (opt-in) | Dev/power-user, GPU/RAM, max quality, free+private | Big local embedder (**Qwen3** / Nemotron-8B), heavy reranking, possibly **light GraphRAG** (E2GraphRAG) |
| **API endpoint (OpenAI-compatible)** (opt-in) | • either *zero local install* (personal key) • or **in a company** with an OpenAI/Azure **approved by the company** (Dimitry's case) | **A single "OpenAI-compatible" adapter, configurable URL + key** → public OpenAI, **Azure OpenAI**, company **internal gateway**, **Mistral**… (+ current Gemini via its native adapter) |

> **What makes this architecturally possible:** the **`Embedder` SPI port** (plan
> [`embedder-spi.md`](embedder-spi.md)) + the index identity stamp. It's what lets us
> offer **several profiles** (office / big machine / API endpoint) without touching the
> harness or the MCP contract (ADR
> [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)).
>
> **🎯 The "OpenAI-compatible" adapter is the concrete impl with the highest leverage.** Since OpenAI's
> embeddings API (`/v1/embeddings`) is the **de facto standard**, **a single** adapter with a
> **configurable URL** covers almost the entire ecosystem: public OpenAI, **Azure OpenAI**, a company's
> internal gateway, **Mistral**, and even **Ollama running locally** (which also exposes this API). You
> switch backend by **changing one URL in `.env`**, without a single extra line of code. For
> **Dimitry's enterprise audience** (OpenAI/Azure already approved by the employer), it's **probably the
> best default**: zero install, zero Ollama, and **confidentiality is already settled by the
> company** (no additional approval to request). ⚠️ It's still **cloud** (notes go out to the
> endpoint at indexing time) — so "provider approved by the employer", *not* "100% on-device".
> → It opens the **prior discussion** required by the SPI plan ([`embedder-spi.md`](embedder-spi.md) §0.2)
> before any 2nd concrete impl: the OpenAI-compatible adapter is the natural first candidate.

### 1.3 — Deflating the "resources" jargon: embedder ≠ chat LLM

> **The confusion to clear up first.** People mix up two **very** different families of models:
>
> | | **Embedder** (what RAG needs) | **Chat LLM** (NO need to run it) |
> |---|---|---|
> | Role | Turns a text into a list of numbers (to retrieve) | Holds a conversation, reasons, writes (like ChatGPT) |
> | Size | **tiny** (300M–600M parameters) | **huge** (7B–70B, i.e. 20 to 200× bigger) |
> | On a regular laptop | **yes, easily** | **no**, requires a big machine/GPU |
>
> "Local RAG" does **NOT mean** "running ChatGPT on your laptop". The chat (the answer)
> stays **Claude, in the cloud**. The only thing we'd run locally is the **small**
> model that *encodes* the notes.

**Concrete numbers** (target = regular PM laptop: MacBook Air M2 16 GB, or Windows ultrabook 16 GB,
**without a gamer's graphics card**):

| Model | Disk | RAM in use | No dedicated GPU? | Realistic on this laptop? |
|---|---|---|---|---|
| **EmbeddingGemma** (300M) | ~0.3–0.6 GB | **< 200 MB** | ✅ designed for it | ✅✅ **a breeze**, even 8 GB |
| **bge-m3** (568M) | 1.2 GB | ~1–2 GB | ✅ | ✅ very good on 16 GB |
| **Qwen3-0.6B** | ~0.6–1.2 GB | ~1–2 GB | ✅ | ✅ ok |
| Qwen3-**8B** (big) | ~8–16 GB | ~8–16 GB | ❌ wants a real GPU | ❌ not on this laptop |
| GraphRAG **+ local LLM** | ≥ 5 GB (the LLM) | ≥ 8–16 GB | ❌ GPU practically required | ❌ **no** (indexing 1h–3h) |

- **Encoding the vault = one-off** (a few minutes to ~15 min for a few thousand notes; only to be
  redone when the content changes).
- **Asking a question = encoding one sentence = < 1 s.** Encoding is *cheap*; it's *generating the
  answer* that costs — and that's Claude (cloud).

⇒ **Verdict**: a **light local embedder is perfectly realistic** on a regular PM laptop
(EmbeddingGemma is *purpose-built* for it). It's **GraphRAG-with-a-local-LLM** that isn't → hence
its filing under "big-machine profile, not the default" (§4).

### Honest framing — where privacy really stops

The brain **runs in Claude** (ADR
[`../decisions/0004-claude-only-pour-l-instant.md`](../decisions/0004-claude-only-pour-l-instant.md)).
So the layer that **answers** already sends questions + retrieved passages to Anthropic (cloud). **The
only piece we can make 100% local is the RAG** (embeddings + index + search).

⇒ The **achievable and honest** objective: *"the RAG no longer depends on a paid cloud API
(Google); the vault is encoded and searched entirely on the machine"*. That's real, shippable, and
answers Dimitry precisely (get out of Google) **and** criteria 1–4. Don't oversell "everything is
private": the LLM that answers stays Claude.

### Confidentiality scale by provider (the real install pitch)

**Two reflexes to internalize:**
1. **Confidentiality is not a matter of code, but of endpoint + tier.** The OpenAI-compatible
   adapter is **neutral plumbing**: it's the URL + the key (hence the provider and its plan)
   put in the `.env` that *decide* the privacy level. The same code is "leaky" or
   "rock-solid" depending on where you point it.
2. **"No training" ≠ "it doesn't leave the machine".** Any API option (even Azure) still sends
   the vault content to the provider **at indexing time**. The **only** level where *nothing*
   leaves is **local**.

| Level | Option | Does content leave? | Trained on your data? | Good to know |
|---|---|---|---|---|
| 🟢 **1** | **Local** (EmbeddingGemma / bge-m3) | **No** — nothing leaves | n/a | Max confidentiality, **free**, no key |
| 🟢 **2** | **Azure OpenAI** / enterprise gateway | yes, but stays within the company's **tenant** | **No** (contractual guarantees) | **The most rock-solid in cloud**; already approved by the employer (Dimitry's case) |
| 🟡 **3** | **OpenAI API** | yes | **No, by default** (since 2023) | ≠ consumer ChatGPT; ~30-day anti-abuse retention then deletion. **Simpler than Gemini** (no fiddling) |
| 🟡 **4** | **Mistral** (paid, EU) | yes | **No** when paid | Hosted in the **EU** (GDPR bonus); ⚠️ check the free-tier terms |
| 🔴 **5** | **Any FREE tier** | yes | ⚠️ **often yes** (product improvement) | **The trap.** Free Gemini is one of them → paying a few cents (enabling billing) moves it to ~level 3 |

> **The bottom line:** the "pay ~13 cents to opt out of training" dance is a **quirk of the
> free Gemini tier**, not a fatality. **OpenAI API** = no training by default;
> **Azure** = the most solid (and the natural gateway for the enterprise world); **local** = the question no
> longer arises. ⚠️ Policies are **volatile** (verification frozen early 2026) → recheck the
> official pages at the date of use before making it a public argument.

---

## 2. The technical finding that conditions everything

The index stores the vectors as a **raw `Float32` BLOB**, **without any trace of the model** (no provider, no
**dimension**) — see `rag/src/lib/vector-store.ts`. Yet each embedder has its own dimension
(Gemini ≈ 768–3072 depending on config, bge-m3 = 1024, nomic = 768, Qwen3-8B = 4096). Swapping **without
reindexing** ⇒ search **silently wrong**. Hence, in the SPI plan: **identity stamp
+ confirm-gate** (we explain, we wait for the "yes", never a reindex behind your back).

**What is reusable on an embedder swap (and what is not):**

| Element | Reusable? |
|---|---|
| The **Markdown notes** (the source) | ✅ always — they never move |
| The **structure** of the database (SQLite, documents/chunks tables) | ✅ identical whatever the embedder |
| The **chunking** | ✅ if the splitting strategy is unchanged |
| The **vectors** (stored embeddings) | ❌ **NEVER** from one embedder to another → **reindex mandatory** |

Each embedder encodes in its **own space**: two vectors from different models are not
comparable, **even at equal dimension**. ⚠️ Equal dimension is therefore a **trap** (a guard that
only checked the dimension would let an incompatible swap through → wrong search) → the stamp
**must** identify on **provider + model + dimension**, not the dimension alone. **Good news:**
reindexing = re-encoding the notes (a few minutes), **the notes are never lost** and the database
is not rebuilt from scratch.

---

## 3. Embedder watch — filtered by the criteria (state 2026)

| Option | Free | Local/private | Cross-OS | Office | FR quality | Verdict |
|---|---|---|---|---|---|---|
| **Gemini** (current) | ❌ paid | ❌ cloud | n/a | n/a | ⚠️ ~66.2 (MTEB FR) **unverified** (see §8) | **To replace** — fails 1 & 2 |
| **bge-m3** (568M, 1024-dim) | ✅ | ✅ | ✅ | ✅ (1.2 GB Ollama, CPU-OK) | decent **not SOTA** (~58.79 dense retrieval F-MTEB); multilingual 100+ languages = FR relevance guaranteed, not supremacy | **Candidate #1 office profile** (to be decided vs EmbeddingGemma) |
| **EmbeddingGemma** (300/308M) | ✅ | ✅ | ✅ | ✅✅ **<200 MB RAM** quantized, designed *on-device* | #1 open multilingual **<500M** on MTEB (~61.15 mean ML-v2); isolated FR score to be measured | **Direct rival of bge-m3 in the light tier** (2× smaller) — **new, to benchmark** |
| **nomic-embed-text** (v1/v1.5, 768-dim) | ✅ | ✅ | ✅ | ✅✅ ultra-light | **anglo-centric** (confirmed) — multilingual **only** in the separate `nomic-embed-text-v2-moe` variant | "fast everywhere" but **weak FR**; ranked behind bge-m3 in multilingual |
| **Qwen3-Embedding-0.6B** (1024-dim, like bge-m3) | ✅ | ✅ | ✅ | ✅ | **unknown** (the 8B=69.8 but not the small one) | To **benchmark**. ⚠️ Same dimension as bge-m3 does **NOT avoid the reindex** (different spaces) — and it's a **trap**: the stamp must keep to **provider+model**, not just the dimension (see §2) |
| **Qwen3-Embedding-8B** (4096-dim) | ✅ | ✅ | ❌ requires big GPU/RAM | ❌ | **~69.8** (excellent; 70.58 mean ML, #1 **June 2025**) | **Big-machine profile** only — *surpassed in 2026* by NVIDIA Llama-Embed-Nemotron-8B |

**To note:**
- **The "Gemini 66.2 FR" from the initial version is NOT confirmed** by the watch (no surviving
  source puts a number on `gemini-embedding-001` in FR). To recheck before making it an argument.
- **Volatile rankings**: the #1 Qwen3-8B dates from **June 5, 2025**; in 2026 NVIDIA
  Llama-Embed-Nemotron-8B moved ahead (Qwen3-8B ~rank 3). **Re-validate the leaderboards at the date
  of use.** And MTEB is criticized as an imperfect predictor of real retrieval (see RTEB) → a good
  MTEB score ≠ field quality on a personal FR Markdown corpus. **Measure, don't assume.**

**Mapping onto the multi-tier offering (§1.2):**
- **Office profile (default)**: `bge-m3` **OR `EmbeddingGemma`** via **Ollama** — free, private,
  Mac/PC, modest machine. **EmbeddingGemma** is the new lightest contender (designed
  on-device, <200 MB RAM); **which of the two as default = to be decided by the FR eval-set (§6).**
  (`nomic` ruled out of the default: FR too weak.)
- **Big-machine profile (opt-in)**: big `Qwen3-Embedding` (or Llama-Embed-Nemotron-8B) + reranking
  + possibly **light** GraphRAG (E2GraphRAG, see §4).
- **API endpoint profile (opt-in)**: **one "OpenAI-compatible" adapter with a configurable URL**
  covers public OpenAI, **Azure OpenAI**, a company's internal gateway, **Mistral**, and even local
  Ollama (+ Gemini via its native adapter). A "zero friction" option for a non-dev without Ollama **and**
  a direct answer to **Dimitry's enterprise** case (OpenAI/Azure approved by the company = the
  natural default for that audience). See box §1.2.

### 3 bis — ✅ MEASUREMENT Step 4 (2026-06-09): the local ones **do not degrade** FR quality

> **What was "to benchmark" above now is.** First real numbers under our
> own harness (eval-set, judge = Claude) on the FR Flemmr vault, via Ollama + the
> OpenAI-compatible adapter. Detail + repro: [`../eval-set.md`](../eval-set.md#étape-4--résultats-mesurés-local-vs-gemini-2026-06-09).

| Embedder | Location | Dim | **FR score** | Index 7 notes (warm) | Disk | RAM |
|---|---|---|---|---|---|---|
| **EmbeddingGemma** | 🟢 local | 768 | **90% (9/10)** | ~1.3 s | 621 MB | ~0.67 GB |
| **bge-m3** | 🟢 local | 1024 | **90% (9/10)** | ~1.7 s | 1.2 GB | ~0.66 GB |
| **Gemini** (baseline) | 🔴 cloud | 3072 | **80% (8/10)** | ~20.8 s | 0 | 0 |

- **Robust conclusion**: **no quality penalty** in going local on this FR corpus — both local ones
  are **at least at parity** with Gemini (they even beat it by one question). The targeted default
  profile (free + private + on-device, §1.1) is **viable on the quality side**: the measurement validates the intuition,
  it does not contradict it.
- **Acknowledged caveat** (don't oversell): tiny corpus → the 90 vs 80 = **a 1-question gap**, within
  the noise (judge variance + top-k that brings back nearly everything); each model misses a
  *different* question. ⇒ **"local at parity"** is defensible, **"local > Gemini" is not yet**.
  To **decide between EmbeddingGemma vs bge-m3** (the fine choice of D1), redo the measurement on a **rich
  corpus** (see `eval-set.md` §discriminate). At equal score, **EmbeddingGemma** is the favorite for the office
  default: 2× lighter on disk, smaller vectors (more compact index), designed on-device.
- **Real footprint validated**: both models fit within **~0.65 GB of RAM** (Metal GPU on a Mac
  Apple Silicon), far from a saturated laptop — confirms §1.3 (embedder ≠ chat LLM).

#### Quantified answer to Dimitry (getting out of Gemini)

> *"Yes, we can run the RAG **without Google**, and without losing quality. Measured here
> (in-house FR eval-set): a **100% local** embedder (EmbeddingGemma or bge-m3, via Ollama) scores
> **9/10** vs **8/10** for Gemini — so **at least at parity**, while staying **free, on-device,
> zero key, zero data sent to a provider**. Footprint: ~0.6 GB of RAM, near-instant indexing
> on a regular Mac/PC. For your **enterprise** case (OpenAI/Azure already approved by the
> company), the **same** code switches to your endpoint by changing one URL in `.env` — the adapter
> is neutral. The only level where *nothing* leaves the machine remains local (see confidentiality
> scale §privacy)."*

### 3 ter — 🔎 Lead "local WITHOUT Ollama" (embedding **in-process**) — watch 2026-06-09

> **Why this lead.** The only real price of all-local (§3 bis) is not the quality (measured ≥
> Gemini) nor the footprint (~0.65 GB) — it's the **install friction of Ollama** (separate app + `ollama
> pull`) for a non-dev (the "Achille's bare Mac"). Question dug into: can we run the local embedder
> **inside the RAG's own Node process**, with no server or app to install? **Answer: yes.**

**The mechanism.** Instead of talking HTTP to a local server (Ollama), an adapter loads the model
**into memory inside the process** via an ONNX runtime. The weights download **once** (local
cache) on first use, then everything is offline. On the architecture side: it's **a 4th adapter behind the
`Embedder` port** already in place (Step 1) — it doesn't speak the OpenAI HTTP dialect, it calls the model
directly. **Zero change to the harness or the MCP contract.**

| Local runtime | Install for a non-dev | Useful models available | Acceleration | Maintained | Verdict |
|---|---|---|---|---|---|
| **Ollama** (server) — *tested Step 4* | ⚠️ **separate app** (cask) + `ollama pull` | EmbeddingGemma, bge-m3 (measured 90%) | **Metal GPU** ✅ | ✅ active | Works, **but separate-app friction** |
| **Transformers.js v4** (`@huggingface/transformers`) — *in-process* | ✅ **`npm i` only** (already done by the installer); `onnxruntime-node` binaries **pre-built for Windows (x64+arm64), macOS (x64+arm64), Linux (x64+arm64)** — CPU everywhere, **no build tools**; model auto-downloaded+cached | **EmbeddingGemma-300m-ONNX** (q4/q8) ✅ + `Xenova/bge-m3` ✅ | CPU (WebGPU in Node still young) | ✅ active (HF, v4 Nov. 2025) | **🎯 most promising lead for "all-local WITHOUT friction"** |
| **fastembed-js** (`fastembed`) — *in-process* | ✅ `npm i` (precompiled native bindings) | bge-small/base, all-MiniLM, **multilingual-e5-large**; ❌ **no bge-m3 nor EmbeddingGemma** | CPU | ❌ **archived 15/01/2026** (read-only) | Possible fallback, but **unmaintained** + not our best models → ruled out |

**What it would change for the install default**: no Ollama at all anymore. The local embedder becomes
an **npm dependency** that the installer already pulls, + a **transparent weights
download** on first launch (~150–300 MB in q8). For a non-dev: *"you install nothing more, it works on its
own"* — exactly what unblocks target §1.1 (free + private + on-device, **without** the Ollama wall).

**Cross-platform (HARD requirement — Thomas, 2026-06-09): Mac AND Windows at parity.** On paper it's
settled — `onnxruntime-node` ships pre-built binaries for **Windows x64+arm64, macOS x64+arm64,
Linux x64+arm64** (CPU everywhere), so *no* build tool on either Mac or Windows. The MCP contract and
the `Embedder` port are already OS-agnostic. ⚠️ Builds are **volatile** → recheck the platform
matrix at the actually-pinned version of `onnxruntime-node` (see method caveats §8).

**⚠️ TO VALIDATE before making it the D1 default (honest: researched, NOT yet tested by us):**
1. **Real install on a bare Mac AND a bare Windows**: confirm that `onnxruntime-node` does pull the
   pre-built binary without build tools in the impoverished environment of the Code tab (see
   [[achille-bare-mac-desktop-path]]) — **both OSes**, not just the dev Mac.
2. **CPU latency**: without the Metal GPU (which Ollama used), CPU encoding is slower — to be measured
   (acceptable a priori, encoding being **one-off**; q8/q4 help).
3. **Re-measure quality under this runtime**: same model, but **quantized** (q8/q4) → replay the
   eval-set with the in-process adapter to **confirm parity** with the 90% measured via Ollama
   (don't assume quantized = identical).

**Integrated synthesis — the complete landscape of the default embedder choice:**

| Option | Status here | Subscription/cost | Does data leave? | Non-dev friction | FR quality |
|---|---|---|---|---|---|
| **Gemini** (current) | ✅ tested (baseline) | paid | yes (cloud) | ~none (paste key) | 80% |
| **Local via Ollama** (EmbeddingGemma/bge-m3) | ✅ **tested Step 4** | free | **no** | ⚠️ Ollama app + pull | **90%** (measured) |
| **Local in-process** (Transformers.js + EmbeddingGemma) | 🔎 **considered** (watch OK, to test) | free | **no** | ✅ **npm only, nothing to install** | to confirm (≈ expected parity) |
| **API endpoint** (OpenAI/Azure/Mistral) | ✅ adapter delivered (St. 3) | paid | yes (company tenant for Azure) | none (URL+key) | ≈ cloud |

→ **Recommendation for D1**: if the **in-process** lead passes the 3 validations above, it's
**the best candidate for the "all-local" default** (it lifts the only serious objection, the Ollama
friction). The Ollama-compatible adapter remains useful for the **power-user** (Metal GPU, bigger
models) and the API endpoint for the **enterprise**. Next concrete possible step: an **in-process adapter
spike + eval-set re-run** to turn "considered" into "measured".

---

## 4. LightRAG / GraphRAG (repo pointed to by Thomas: <https://github.com/HKUDS/LightRAG>)

- **MIT license** ✅. **Full-local POSSIBLE**: LLM via Ollama + local embeddings + **default
  file storage** (no external service required; Neo4j/Postgres/Milvus optional) ✅.
- **But the hard point**: entity/relation extraction requires a **capable LLM**. **Heavy**
  indexing: **one LLM call per chunk** (+ community aggregation → `c+n` calls total).
- **The minimum LLM size is UNCERTAIN (watch 2026)**: the README mentioned ~30B, but the
  watch **refuted both** "≥7B required" *and* "7-8B is enough". A solid finding, however:
  **small LLMs frequently fail extraction** (**empty** graphs — nano-graphrag documents
  *42 chunks → 0 entities / 0 relations*), with a recurring Ollama trap (`num_ctx` default = 2048
  too small for the extraction prompt → silent failure; fix `PARAMETER num_ctx 32000`).
- **Not demonstrated GPU-less**: the reference 2026 benchmark runs on a **discrete NVIDIA GPU**
  (GTX 1070 Ti 8 GB, concurrency forced to 1), indexing **88 min** (Qwen2.5-7B) to **211 min**
  (Llama3.1-8B). **No CPU-only / bare Mac demonstration.**
- **Verdict vs criteria**: *free + private* = running a **capable local LLM** → **outside the
  office profile** (unthinkable on Achille's bare Mac; slow even on a good machine without a
  GPU). Making it smooth = cloud LLM = **paid + leak**. ⇒ **In head-on tension with criteria
  1–4.** To reserve for the **big-machine profile** / power-user R&D track. **Not the default.**

**Light alternative without an LLM per chunk — `E2GraphRAG`** (arXiv 2505.24226): replaces LLM
extraction with the **SpaCy** NLP toolkit (entity co-occurrence), hence **~10× faster** at indexing
at comparable efficiency. **This is the lead that could make the graph playable without a big GPU** — to
prefer over LightRAG if we ever attack the graph track one day. (Another name crossed: `nano-graphrag`, lighter
than GraphRAG MS but which **still** relies on an LLM per chunk.)

**Substantive relevance:** a personal second brain is **very rich in entities/relations**
(people, decisions, meetings, 1-1s, initiatives), so GraphRAG **maps well** onto the case — this
is not hype. But to attack **only if the eval proves** that flat retrieval plateaus, and
**via the no-LLM-per-chunk route** (E2GraphRAG) on the modest-machine side.

---

## 5. Intermediate leads from the watch

> ⚠️ **All the numbers below come from Anthropic benchmarks (cookbook/blog), which are
> CLOUD and IN ENGLISH.** The fraction of gain **retained with a light local LLM/embedder in FR**
> is **NOT** demonstrated — it's an extrapolation, not a measured fact. Hence the primacy of
> the local eval-set (§6). Two marketing claims were moreover **refuted** in verification:
> "reranking −67%" (0-3) and "hybrid 30/70 optimal everywhere" (0-3).

- **Contextual Retrieval (Anthropic)**: enriching each chunk with a mini-context before embedding →
  **−35%** retrieval failures (top-20: 5.7% → 3.7%), **−49%** with Contextual BM25
  (→ 2.9%). Canonical version = Claude at indexing time (**paid + cloud** → fails the criteria as
  is). **Free+private version** = same technique with a **local LLM** to generate the context →
  **much lighter than LightRAG**, but **nobody has published the gain retained in local/FR** (see
  open questions §6). To keep in reserve.
- **Local reranking** (cross-encoder: `bge-reranker-v2-m3`, `Qwen3-Reranker` 0.6B/4B): on the
  **cloud** numbers (Cohere rerank-v3) it's **the biggest incremental jump** (Pass@10 95.3%,
  −47% failures). **BUT**: ⚠️ **no isolated gain figure for a LOCAL reranker survived
  verification** — the "best quality/cost ratio" idea remains a **hypothesis to validate
  empirically** (in FR, with the local reranker), not a given. Remains a strong candidate once
  the local embedder is in place.
- **Hybrid search (BM25 + dense + reciprocal rank fusion)**: 100% local, no extra
  model — but **MARGINAL gain** above contextual embeddings according to the cloud
  numbers (Pass@10 nearly nil; Pass@20 ~+1 pt). To consider **after** reranker/contextual, not before.

---

## 6. Eval-first — the centerpiece (and it's in the project's DNA)

The VIF feedback insists: **evaluation** is "indispensable, often set aside" (LangFuse,
**LLM-as-judge**, **human-in-the-loop**). And Thomas already has **the seed** of it: the **"Mollecuisse"
canary** in `scripts/verify-rag.mjs` *is* a mini-eval (it proves that the answer comes from the
vault).

⇒ **Before** choosing an embedder/strategy, build a **local eval-set** (15–20 questions →
expected answer, on the real vault), **judge = Claude** (already in the loop, occasional use =
acceptable). It turns "tricky / risky" into **"measured"** — exactly Thomas's way of working
(validate empirically, no over-engineering against an unproven risk).

- **Tools spotted** (in case we industrialize later): **RAGAS** (light, RAG-specific,
  without ground-truth), **DeepEval**, **TruLens**; **LangFuse** = self-hostable observability but
  **= infra** → don't go there before having the question. Starting with a **local script like
  `verify-rag`** gives 90% of the value without infra.

---

## 7. Recommended sequence (recalibrated on the criteria)

1. **Finish the `Embedder` port** (plan [`embedder-spi.md`](embedder-spi.md)) — the **instrument**.
2. **Local eval-set** (judge = Claude). Little code, huge leverage. **Confirmed indispensable by the
   watch**: no local/FR figure exists in the literature, we'll decide only by measurement.
3. **Wire up `bge-m3` AND `EmbeddingGemma` via Ollama** behind the port and **MEASURE** vs Gemini on
   FR → a **quantified** answer to Dimitry, and the choice of the default **office profile** (decide
   bge-m3 vs EmbeddingGemma). `Qwen3-0.6B` as a bonus (same 1024 dimension as bge-m3). (`nomic` ruled out:
   FR too weak.)
4. **Local reranker** (`bge-reranker-v2-m3` / `Qwen3-Reranker`) if the eval shows a gain — to **measure**,
   the "best ratio" not being proven locally.
5. **Big-machine profile** (big Qwen3/Nemotron-8B / GraphRAG **E2GraphRAG** / Contextual Retrieval)
   **only if** the eval proves a ceiling — accepting the machine cost.

---

## 8. Watch sources

**Initial watch (2026-06-08):**
- [Ailog — Embedding Models 2026 (benchmark)](https://app.ailog.fr/en/blog/news/embedding-models-2026)
- [BentoML — Open-Source Embedding Models 2026](https://www.bentoml.com/blog/a-guide-to-open-source-embedding-models)
- [AI Learning Guides — RAG in Production 2026 (GraphRAG, hybrid, evals)](https://ailearningguides.com/rag-production-patterns-2026/)
- [Anthropic — Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- [LightRAG — HKUDS (repo)](https://github.com/HKUDS/LightRAG)
- [Atlan — RAGAS / TruLens / DeepEval comparison 2026](https://atlan.com/know/llm-evaluation-frameworks-compared/)

**Refreshed watch (2026-06-08, sources verified adversarially — 21/25 claims confirmed):**
- [Qwen3-Embedding — official blog](https://qwenlm.github.io/blog/qwen3-embedding/) · [arXiv 2506.05176](https://arxiv.org/abs/2506.05176) — sizes/dimensions, #1 MTEB ML June 2025 (70.58)
- [Google — Introducing EmbeddingGemma](https://developers.googleblog.com/en/introducing-embeddinggemma/) · [arXiv 2509.20354](https://arxiv.org/abs/2509.20354) · [HF model card](https://huggingface.co/google/embeddinggemma-300m) — 308M, <200 MB RAM quantized, on-device
- [bge-m3 — Ollama](https://ollama.com/library/bge-m3) · [HF BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) · [arXiv 2402.03216](https://arxiv.org/abs/2402.03216) · [F-MTEB arXiv 2405.20468](https://arxiv.org/abs/2405.20468) — 1.2 GB Ollama, FR ~58.79 dense
- [nomic-embed-text — Ollama](https://ollama.com/library/nomic-embed-text) · [v2-moe](https://ollama.com/library/nomic-embed-text-v2-moe) — multilingual reserved for v2-moe
- [Anthropic Cookbook — Contextual Embeddings guide](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide) — Pass@k reranker/hybrid numbers (cloud, English)
- [E2GraphRAG — arXiv 2505.24226](https://arxiv.org/html/2505.24226v1) — SpaCy extraction, ~10× faster; [nano-graphrag FAQ](https://github.com/gusye1234/nano-graphrag/blob/main/docs/FAQ.md) — `num_ctx` trap, empty graphs
- [GraphRAG local bench 2026 — arXiv 2605.20815](https://arxiv.org/html/2605.20815) — discrete NVIDIA GPU, indexing 88–211 min
- [RTEB — arXiv 2508.21038](https://arxiv.org/abs/2508.21038) — MTEB criticized as a predictor of real retrieval

**Watch "local without Ollama" (2026-06-09):**
- [Transformers.js v4 — HF blog](https://huggingface.co/blog/transformersjs-v4) · [installation doc](https://huggingface.co/docs/transformers.js/installation) — `npm i @huggingface/transformers`, runs in Node/Bun/Deno, WebGPU runtime C++ rewritten
- [onnx-community/embeddinggemma-300m-ONNX](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX) — fp32/q8/q4 variants (no fp16), designed for Transformers.js; [demo "no server required"](https://github.com/glaforge/embedding-gemma-semantic-search)
- [Xenova/bge-m3](https://huggingface.co/Xenova/bge-m3) · [aapot/bge-m3-onnx](https://huggingface.co/aapot/bge-m3-onnx) — bge-m3 in ONNX for Transformers.js
- [onnxruntime-node — npm](https://www.npmjs.com/package/onnxruntime-node) · [official js/node README](https://github.com/microsoft/onnxruntime/blob/main/js/node/README.md) — postinstall `prebuild-install`; pre-built binaries **Windows x64+arm64, macOS x64+arm64, Linux x64+arm64** (CPU everywhere; WebGPU EP not yet on linux-arm64); fallback compile if absent
- [fastembed-js (`fastembed`)](https://github.com/Anush008/fastembed-js) — in-process ONNX, **archived 15/01/2026** (v2.1.0); bge-small/base, all-MiniLM, multilingual-e5-large; no bge-m3/EmbeddingGemma

> **Method caveats (from verification)**: (1) MTEB rankings **volatile** — re-validate
> at the date of use; (2) metrics **not equivalent** (multilingual Mean-Task ≠ FR score ≠ dense
> retrieval F-MTEB); (3) **Gemini FR ~66.2 NOT verified**; (4) **contextual/hybrid/reranker levers not
> quantified in local/FR**; (5) GraphRAG **CPU-only/bare-Mac viability not demonstrated**.
