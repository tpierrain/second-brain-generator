# ADR 0007 — Three embedder adapters (native Gemini / OpenAI-compatible / local) + privacy scale

- **STATUS:** ACCEPTED (2026-06-08) for the **direction** (the three adapters + the privacy scale).
  **Open question #1 (default embedder at install) → SETTLED on 2026-06-09**: cf. **Addendum D1** at
  the end of the ADR (explicit 3-way choice, recommended default = in-process "Gemma inside").
- **Related:** [`0006-le-mcp-du-rag-est-un-contrat-stable.md`](0006-le-mcp-du-rag-est-un-contrat-stable.md)
  (this ADR **makes concrete** its "interchangeable embedder" SPI by naming the targeted adapters),
  [`0004-claude-only-pour-l-instant.md`](0004-claude-only-pour-l-instant.md) (the LLM that answers
  stays Claude → bounds the privacy promise).
- **Associated implementation plan:** [`../plans/embedder-spi.md`](../plans/embedder-spi.md) (the
  `Embedder` port + the identity stamp) — this ADR **opens the "prior discussion"** that its §0.2
  required before any 2nd concrete impl.
- **Study / watch:** [`../plans/etude-rag-local-criteres-et-veille.md`](../plans/etude-rag-local-criteres-et-veille.md)
  (range of profiles, embedder watch, detailed privacy scale).

## Context

Request from **Dimitry Ernot**: be able to use **something other than Google Gemini**. Two realities
behind it: (a) the **free + private** profile (leaving a paid cloud API), and (b) the **enterprise**
profile, where people go through an **OpenAI/Azure validated by their company** (data governance
already settled at their level) — not the central public service.

Today, the embedder is **Gemini only** (native Google SDK, `rag/src/lib/embedder.ts` + `config.ts`),
and the install **forces** a Gemini key into `.env`. ADR 0006 already established that the embedder
is an **interchangeable SPI** behind a stable MCP contract; it remained to decide **which** adapters
we target and **why**.

## Decision

### 1. Three user-side choices, ~two code-side implementations

| # | User choice | Implementation |
|---|---|---|
| 1 | **Gemini** (the existing one) | `GeminiEmbedder` — **native Google SDK**, kept as-is |
| 2 | **API endpoint** (public OpenAI, **Azure OpenAI**, enterprise gateway, **Mistral**…) | `OpenAiCompatibleEmbedder` — **a single** adapter, **configurable URL + key** |
| 3 | **Local** (EmbeddingGemma / bge-m3 via Ollama) | **nothing new**: adapter #2 **pointed at `http://localhost:11434/v1`** (Ollama exposes the OpenAI-compatible API), with no key |

→ **3 options to offer, but potentially only 2 impls to code** (native Gemini + OpenAI-compatible).
Local **reuses** adapter #2 — fewer moving parts, fewer bugs.

```
          ┌──────────────────────────────────────────────┐
          │   PORT  Embedder  (the internal contract, ONE) │
          │   • embedDocuments(texts) → vectors             │
          │   • embedQuery(text)      → vector              │
          │   • identity (provider / model / dimension)     │
          └──────────────────────────────────────────────┘
                 ▲                ▲                ▲
                 │ implements     │ implements     │ (reuses #2)
        ┌────────┴─────┐  ┌───────┴─────────┐  ┌───┴───────────────┐
        │GeminiEmbedder│  │OpenAiCompatible │  │ LOCAL = #2 pointed │
        │ = Google SDK │  │ Embedder        │  │ http://localhost…  │
        │ (the CURRENT)│  │ URL + key config│  │ (Ollama, no key)   │
        └──────────────┘  │ OpenAI · Azure ·│  └────────────────────┘
                          │ gateway ·       │
                          │ Mistral · …     │
                          └─────────────────┘

   The CONSUMERS (indexing via index-manager, search via search-vault)
   only know the port → changing adapter touches neither them, nor the
   MCP contract (ADR 0006). Provider specifics (taskType…) live INSIDE
   each adapter, without leaking into the port.
```

### 2. We **keep** the native `GeminiEmbedder` — we don't replace it with OpenAI-compatible

For "raw" embedding, the native SDK and the OpenAI-compatible gateway return the same thing (a
vector). But the **native one exposes specific knobs** that the OpenAI-compatible layer flattens —
above all **`taskType`** (encoding a *document* ≠ encoding a *question*, which improves relevance),
plus `outputDimensionality` and `title`. Replacing the native one **gains nothing** for Gemini and
would **lose** those settings. Rule: **we speak to each provider in its mother tongue when we
already can; we use the "OpenAI-compatible esperanto" for everyone we don't want to code one by
one.**

### 3. The OpenAI-compatible adapter is the concrete impl with the **highest leverage**

Since OpenAI's `/v1/embeddings` API is the **de facto standard**, **a single** adapter with a
configurable URL covers nearly the whole ecosystem (OpenAI, Azure, internal gateway, Mistral, local
Ollama). You change backend **by changing a URL in `.env`**, without a single extra line of code.
It's therefore the **first candidate** for the 2nd impl to build (after the SPI plan's `Embedder`
port).

**How far this standard goes — the envelope vs the letter.** What converged is the **envelope**:
request `{ model, input }` → response `{ data: [{ embedding: [...] }] }`. *That's* what makes the
single adapter possible. What remains **not** standardized: (a) the **fine-grained settings** unique
to a provider (e.g. Gemini/Cohere's "task type" document-vs-query), accessible only via the native
SDK → **justifies keeping the native Gemini adapter** (§2); (b) the **content** of the vectors,
specific to each model → **not interchangeable**, hence the mandatory reindex on swap (§5). In other
words: **we standardize *how we talk to each other*, not *what the numbers mean*.**

### 4. Privacy is a property of the **endpoint + tier**, not of the code

The adapter is **neutral plumbing**. The privacy level is decided by where you point it and under
which plan. We **document the privacy scale** (detail in the study):

```
🟢 1. LOCAL (EmbeddingGemma/bge-m3) ── nothing leaves. Free. Max privacy.
🟢 2. Azure OpenAI / company gateway ─ leaves but stays in the tenant, 0 training, contractual.
🟡 3. OpenAI API ──────────────────── leaves, 0 training by default, retention ~30 d.
🟡 4. Paid Mistral (EU) ───────────── leaves, 0 training, EU-hosted (GDPR).
🔴 5. ANY FREE tier ─────────────────  ⚠️ often exploited (free Gemini included → paying = moves to ~3).
```

Two truths not to oversell: **"no training" ≠ "it doesn't leave the machine"** (only local doesn't
leave); and **the LLM that answers stays Claude** (ADR 0004) — local privacy concerns **only** the
RAG (embeddings + index + search).

### 5. On embedder swap: the database stays, the vectors don't

Whatever the adapter, the **storage is the same** (SQLite, same tables) and the **notes never move**.
But the **vectors are NEVER reusable** from one embedder to another (different spaces, **even at
equal dimension**) → **mandatory reindex** on swap. It's the SPI plan's identity stamp that detects
it and triggers the **confirm-gate** (ADR 0006 addendum); the stamp keeps track of **provider +
model + dimension** (not dimension alone, which would be a trap).

## Consequences

- **Direct and complete answer to Dimitry**: the enterprise profile (Azure/gateway) and the
  free+private profile (local) are both covered by the same mechanism, without touching the harness
  or the MCP contract.
- **A single new adapter** (`OpenAiCompatibleEmbedder`) unlocks OpenAI + Azure + Mistral + local →
  minimal effort, minimal bug surface (faithful to "no over-engineering").
- **Clear install pitch**: the privacy scale states, in one line per option, which promise we keep
  (and which one we **don't**).
- **Costs**: maintaining a 2nd auth/error path (configurable key + URL, OpenAI error codes) and
  staying disciplined about provider leaks outside the MCP schemas (already clean, cf. ADR 0006 §8).

### Pedagogical requirement (build on what has already proven itself)

Offering three adapters **only has value if the choice is made crystal-clear** for a non-dev. The
**pedagogical artifacts validated in conversation with Thomas** (judged "really very clear") are
**first-class deliverables**, not decoration, and must be **reused** everywhere the user encounters
this choice (install doc, confirm-gate message, future user explainer):

1. **"Embedder ≠ chat LLM"** + disk/RAM/GPU table + "realistic on a regular laptop" verdict
   (study §1.3) — deflates the "running ChatGPT at home" fear.
2. **The per-provider privacy scale** (study, privacy framing §) — one line per option: what the
   promise keeps, and what it doesn't.
3. **The "reusable on swap or not" table** (study §2) — reassures: *your notes are never lost, we
   re-encode, it takes a few minutes.*

Rule: **always explain with a concrete table/scale + a one-sentence verdict**, never in jargon.
That's the register that worked; we standardize it for the RAG.

## Open questions (NOT settled here — Thomas's product/UX decision)

1. **Default embedder at install.** Today the install forces a Gemini key. Yet the *simplest*
   install might be **all-local by default** (zero key, zero cloud, zero "free-but-exploited" trap).
   **Real tension:**
   - *For all-local*: no key, max privacy, free, no cloud dependency.
   - *Against, for a true non-dev ("Achille's bare Mac")*: requires **Ollama installed + model
     pull** (~0.3–1.2 GB) → a **new native dependency** to manage (echoes of the `run-node` / bare
     desktop PATH lessons). "Pasting a key" may remain *mechanically* simpler — but drags along the
     paid tier + the cloud caveat.
   - **Leads:** all-local by default *(preferred target)*; (A) single simple default + swap via
     `.env`; (B) mini-question for the enterprise case; (C) explicit 3-way choice at install.
   - **Preference stated by Thomas (2026-06-08):** **default = PURELY LOCAL adapter** if possible
     (product argument: "we don't send your data to a provider"). **Accepted decision method:** we
     settle it **AFTER** shipping the 3 adapters and running **tests together** (cf. action plan
     [`../plans/rag-embedder-plan-action.md`](../plans/rag-embedder-plan-action.md), Decision D1,
     which depends on Step 4 / measurement) — **not on intuition.** ⚠️ To weigh against the local's
     install friction (Ollama + model) and the "generic install" rule of `CLAUDE.md`. **Not settled
     to date.**
2. **Local: via adapter #2 (localhost) or a native Ollama adapter?** Implementation detail; leaning
   = **reuse #2** (less code), to validate in practice.

## Rejected alternatives

- **Replacing the native `GeminiEmbedder` with OpenAI-compatible** — gains nothing for Gemini,
  **loses** `taskType` and breaks a proven path (canary). Refused (§2).
- **A hand-coded adapter per provider** (separate OpenAI, Azure, Mistral) — pointless: the OpenAI
  dialect is the de facto standard, a single adapter with a configurable URL is enough. Refused.
- **Forcing a provider choice on every non-dev at install** — friction, and rubs against the generic
  install philosophy. Set aside as a *default* (option C remains, open).

## Addendum D1 (2026-06-09) — default embedder at install: SETTLED

> Resolves **Open question #1**, post Steps 4 + 4-bis (measurements recorded in
> [`../eval-set.md`](../eval-set.md)). Thomas's product/UX decision.

**Decision: option C — explicit 3-way choice at install**, with an **ADAPTIVE recommendation based
on the machine** (rather than a fixed default). We accept **one** deliberate question (a conscious
exception to `CLAUDE.md`'s "as few questions as possible"): privacy is a **genuine user trade-off**,
not a technical detail.

**🎚️ Adaptive recommendation (refined 2026-06-09 after the dense-corpus test).** The install
**detects the machine** and puts the star ⭐ on the right option:
- **Capable machine (≥ 12 GB RAM, Apple Silicon / Windows)** → ⭐ **option 1 (in-process)**: private,
  free, nothing to install.
- **Small machine (< 12 GB RAM) OR Intel Mac** → ⭐ **option 2 (API key)**: Gemini, OpenAI, or **any
  provider, including the company endpoint**. **Why**: in-process climbs to **~4–6 GB during
  indexing** (real-vault test, after Step 4-ter's batch capping) → swaps on a small machine, and it
  is **unavailable on Intel Mac**. The API = RAM ~0, stays light on a small machine.
- **Threshold FROZEN at 12 GB** (Thomas's decision, post Step 4-ter — batch capping shipped, OS peak
  ~3.8–4 GB with `EMBED_BATCH=4`). Implemented in `scripts/lib/embedder-choice.mjs`
  (`IN_PROCESS_MIN_RAM_BYTES = 12 GB`).

The *why*, backed by numbers: the in-process "Gemma inside" (Step 4-bis) is **viable as a default**
— `npm`-only install (no key, no app), MCP startup not slowed, quality **90% = Ollama,
> Gemini 80%**, **nothing leaves the machine**. It therefore offers "free + private + zero friction"
without forcing a technical subject to be decided.

**The 3 options presented** (sorted by decreasing privacy):

| # | User label | Adapter | One-line trade-off |
|---|---|---|---|
| 1 ⭐ | **Everything on your machine, nothing to install** | `InProcessEmbedder` (in-process) | Private + free + offline; ~1.5 GB RAM at rest, **~4–6 GB while indexing a real vault** (≥ 12 GB; batch capping `EMBED_BATCH=4` shipped, Step 4-ter); **Apple Silicon Mac / Windows** (not Intel Mac) |
| 2 | **With an API key** (Gemini, or company endpoint) | `OpenAiCompatibleEmbedder` (or native Gemini) | Light for the machine; **the notes pass through the provider** — see free/paid framing below |
| 3 | **Local via Ollama** *(advanced)* | #2 pointed at `localhost:11434` | Like 1 (nothing leaves) but **a separate app**; useful for Intel Mac / a specific model |

**Implementation guardrails (for Step 5):**
- **Intel Mac**: option 1 (in-process) **does not appear** (`onnxruntime-node` 1.24.3 doesn't cover
  darwin/x64) → choice reduced to 2 (key / Ollama). To **detect automatically**.
- **No longer *force* the Gemini key**: the "open the `.env` / paste the key" step only triggers for
  **option 2** (today `installer.mjs` / `verify-rag.mjs` / `gemini-key.mjs` / the `CLAUDE.md` step-4
  bootstrap stub still require it).
- **`verify-rag` must pass** with the retained embedder (Mollecuisse canary already OK in-process).
- **Reuse the 3 pedagogical artifacts** (privacy scale / embedder≠LLM / reusable-on-swap) at the
  choice point.

**"Free vs paid key" framing (MANDATORY if the user picks option 2).** The trap to defuse: **"free"
≠ "private".** With a key, the **text of the notes** is sent to the provider; what changes
everything is the **tier**:

- **FREE Gemini** ⚠️ — limited (quotas) **AND Google may exploit your embedding data**. To avoid for
  a somewhat confidential vault (tier 🔴 5 of the scale).
- **PAID Gemini** ✅ — **a few tens of cents/month** in personal use (almost nothing), and **that is
  precisely what guarantees Google does NOT exploit your data** (no training, retention ~30 d → tier
  🟡 3). **Going paid = privacy.**
- **Company endpoint** (Azure / gateway) ✅ — data in the **company's tenant** (tier 🟢 2).

One-sentence verdict: **"free" doesn't mean "private"; for an API key, paying a few cents is what
makes your data private — and if you want truly-nothing-leaves for free, that's option 1.**

> **Next:** Step 5 of the plan [`../plans/rag-embedder-plan-action.md`](../plans/rag-embedder-plan-action.md)
> implements this flow. D1 checked off.
