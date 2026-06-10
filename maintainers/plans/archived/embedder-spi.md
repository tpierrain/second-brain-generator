<!-- ════════════════════════════════════════════════════════════════════════ -->
<!-- STATUS: ✅ SHIPPED (created 2026-06-08, shipped 2026-06-08) — safe port + index. -->
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Plan — Abstract the RAG embedder behind an SPI port

> **STATUS: ✅ SHIPPED** (created 2026-06-08, shipped 2026-06-08 — Step 1 of the
> action plan `rag-embedder-plan-action.md`). Commits: `2ac9698` (round-trip stamp),
> `7e9fdec` (identity guard), `9d3b869` (port `Embedder`), `50b6fcd` (shouldStamp),
> `a49f861` (createEmbedder), `99abe61` (index-manager wired + stamp), `7fc678b`
> (guard wired on search), `bf2ead8` (FakeEmbedder). 91/91 tests green, tsc OK.
> The MCP contract didn't move.
> Self-sufficient plan: a fresh Claude session must be able to execute it reading ONLY this
> file + the cited files. Discipline **TDD** (skill `tdd-discipline`, and `outside-in-diamond-tdd`
> for the back-end/Hive scope), **manual** conventional commits + co-author Claude.
>
> **Realizes ADR [`../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md`](../decisions/0006-le-mcp-du-rag-est-un-contrat-stable.md)**
> (stable MCP port, embedder = interchangeable SPI) + its **"confirm-gate" addendum**.

---

## 0. Decisions made (the "what" and the "why")

Validated with Thomas on 2026-06-08 (origin: request from Dimitry Ernot — "be able to use something
other than Google Gemini"):

1. **This plan abstracts the embedder, period.** It extracts a clean **SPI port `Embedder`** and makes
   the index **safe against a swap**. It keeps **Gemini as the only concrete impl** (plus,
   optionally, a test `FakeEmbedder`). **It introduces NO second real embedder**
   (Mistral / OpenAI / local-Ollama).

2. **The choice of a 2nd embedder/indexer is discussed BEFORE implementing it.** Thomas has ideas;
   we talk about it first. ⛔ **Do not start a 2nd concrete impl without that exchange.** This plan
   just prepares the ground so that it's then a local plug-in, without touching the harness.
   → Watch + selection criteria in the study
   [`etude-rag-local-criteres-et-veille.md`](etude-rag-local-criteres-et-veille.md) (free,
   privacy/local, Mac+PC, office machine, tiered offering; candidates bge-m3 / nomic / Qwen3;
   decision **after measurement** via a local eval-set).

3. **Embedder swap = a natural-language confirm-gate, never a reindex behind your back** (decision #1,
   locked — cf. §5 and the ADR 0006 addendum). On an embedder model change, the brain
   **explains to the user** that its search config has changed and that the **documents must be
   reindexed** (they don't move — just re-encoded), that **it takes a bit of time**, and **waits
   for an explicit confirmation**. By default: **we reindex nothing.**

---

## 1. The technical observation that drives the whole plan

The embeddings are stored as **raw `Float32` BLOB**; similarity reads `byteLength / 4`
(`rag/src/lib/vector-store.ts` ~l.154). **The index carries NO trace of who produced it**:
neither provider, nor model, nor **dimension**.

Yet each embedder has its own dimension (Gemini `gemini-embedding-001` ≈ 3072, `mistral-embed`
= 1024, `nomic-embed-text` local = 768). So — **mechanical certainty, not hypothesis**:

> The day we swap the embedder **without reindexing**, `cosineSimilarity` compares a fresh query
> vector to vectors of another dimension → **silently wrong results** (or a crash). Nothing
> detects it today.

⇒ "Make the embedder swappable" = **two inseparable deliverables**:
1. **The `Embedder` port** (extract the SPI interface — the easy part).
2. **The index identity stamp** (the index knows which embedder filled it, and **refuses a
   stale search** → triggers the confirm-gate — the part that makes the swap *safe*).

This is the "at worst the user reindexes" spirit of ADR 0006 — except that today **nothing
triggers that reindex**. It's the hidden debt behind the already-decided decision.

---

## 2. The SPI port `Embedder` (internal, agnostic contract)

A named interface, at the hexagonal altitude (and no longer an `embedOne` function injected
only for the tests, cf. the current `EmbedDeps`):

```ts
export interface Embedder {
  readonly identity: EmbedderIdentity;                    // who I am (stamped into the index)
  embedDocuments(texts: string[]): Promise<number[][]>;   // indexing path
  embedQuery(text: string): Promise<number[]>;            // search path (priority)
}

export interface EmbedderIdentity {
  providerId: string;   // "gemini" | "fake" | … (future: "mistral", "ollama")
  model: string;        // "gemini-embedding-001"
  dimension: number;    // 3072 — the index invalidation key
}
```

**Why two methods (`embedDocuments` vs `embedQuery`) and not a generic `embed()`?** The port
captures the **intent** in an agnostic way ("document to file away" vs "question asked"); **each
adapter translates that intent into its provider's native dialect** — or ignores it if its
backend doesn't have that knob. Provider specifics live **inside** the adapter, **never** in
the port signature (consistent with the "envelope vs letter" of ADR 0007 §3).

| Port method | Agnostic intent | Translation by the adapter |
|---|---|---|
| `embedDocuments(...)` | "I'm encoding **documents to file away**" | `GeminiEmbedder` → `taskType=RETRIEVAL_DOCUMENT` ; `OpenAiCompatibleEmbedder` → no such button, **ignores** |
| `embedQuery(...)` | "I'm encoding a **question**" | `GeminiEmbedder` → `taskType=RETRIEVAL_QUERY` ; `OpenAiCompatibleEmbedder` → **ignores** |

- **`GeminiEmbedder implements Embedder`** = the only concrete impl: all the current content of
  `rag/src/lib/embedder.ts` (`GoogleGenAI` client, `embedWithRetry`/retry 429, `EMBEDDING_MODEL`)
  **moved behind the port**, **without behavior change** (the existing tests remain the
  net).
- **The quota guardrail (`UsageTracker`) stays orthogonal**: it's a cross-cutting concern
  (anti-runaway), not a Gemini specific. It **decorates** any `Embedder`. Only its
  **defaults** are Gemini-flavored (timezone `America/Los_Angeles`, "Pacific midnight" message) →
  **noted debt, out of scope** (cf. §7).
- **`FakeEmbedder` (optional)**: deterministic impl (hash → vector, fixed dimension), no network or
  key. Serves in tests AND proves the port holds. Do NOT confuse it with a "2nd real embedder"
  (decision §0.2).

---

## 3. The index identity stamp (the deliverable that makes the swap *safe*)

- At **indexing**: write `identity` (provider/model/dimension) into an **`index_meta` table**
  of the DB (`vector-store.ts`).
- At **search** (and at reindex): compare the current embedder's identity to the stamped one.
  - **Match** → continue normally.
  - **Mismatch** (or DB with no stamp = an index from before this plan) → **do NOT return
    wrong results**: surface a **"stale index" signal** carrying **both identities** (stamped vs
    current), to trigger the confirm-gate (§5).

Consistent with the project's **fail-loud** culture (cf. revised ADR 0005, plans `harden-run-node-*`):
better an explicit, actionable refusal than a search that silently lies.

---

## 4. The confirm-gate (where it lives, and why the MCP contract doesn't move)

The MCP server doesn't "ask" on its own — it **returns text** that Claude relays. Breakdown:

| Actor | Role |
|---|---|
| **Identity guard** (RAG hexagon) | Detects the mismatch at search time. |
| **`search_vault`** (`src/tools/search-vault.ts`, `src/index.ts:50`) | Instead of wrong results, **returns the "stale index" signal** (both identities) — actionable, translatable into natural language. |
| **Claude** (conversational layer) | Relays the message below **and waits for the user's reply**. |
| **`reindex`** (`src/tools/reindex.ts` → `index-manager.reindex(force)`) | The **confirmed action**: called **only after** the "yes". |

**Message template** (the prose names the models **dynamically** via the `identity` — nothing is
hardcoded as "Gemini"):

> "My fast, semantic search capabilities rely on an **indexer/embedder**; yet **its
> configuration has changed** (before: `<stamped model>`, now: `<current model>`). To keep
> working, I need to **reindex your documents** — they don't move, it's just that they
> have to be re-encoded with the new model. **It may take a bit of time.** Do you want me to
> do it now?"

→ **by default we reindex NOTHING** until the user has confirmed ("we won't index
for nothing").

**Happy consequence: no new MCP surface to invent.** We reuse `search_vault`
(enriched return) + `reindex` (already there). The **MCP port remains the stable contract** of
ADR 0006 — zero breaking change, zero provider-leak in the tool **schemas**.

---

## 5. Refactor map — TDD sequence (outside-in, baby-steps)

One test at a time, **red → green → full refactor** at each step. Tentative order (the
most serious risk first):

1. **Stamp — round-trip**: `index_meta` writes the identity at indexing, read back afterward. *Drives
   the table + the access.*
2. **Stamp — identity guard**: search with a divergent (or absent) identity → **explicit
   "stale" signal** carrying both identities, **no** results. *Drives the guard in the
   `search_vault` path.*
3. **Extract the `Embedder` port**: introduce the interface; have `GeminiEmbedder` implemented by
   the existing code. The current tests (`rag/src/lib/embedder.test.ts`, which already stub via
   `EmbedDeps`/`embedOne`) remain the net — ideally reformulated around the port. **Behavior
   unchanged.**
4. **Inject the port into its 2 consumers**: `index-manager` (indexing → `embedDocuments`;
   it's the one that stamps the identity) and `search-vault`/`index.ts:50` (search → `embedQuery`; it's
   the one that consults the guard).
5. **A single selection point**: `createEmbedder()` in `rag/src/lib/config.ts` returns
   `GeminiEmbedder`. The future `EMBEDDING_PROVIDER` will plug in **there**, a single `switch`, **without
   touching the harness or the MCP port**. (⛔ we don't add the multi-provider `switch` now —
   just the single entry point.)
6. *(optional)* deterministic `FakeEmbedder` + its test.

After each green step: `npm test` (or the `rag/` folder's test command) must pass; conventional
commit.

---

## 6. Affected files

- `rag/src/lib/embedder.ts` — becomes the `Embedder` port + `GeminiEmbedder` (extraction).
- `rag/src/lib/config.ts` — `EMBEDDING_MODEL`, `readGeminiKey`; **add** `createEmbedder()` (single
  selection point).
- `rag/src/lib/vector-store.ts` — **add** the `index_meta` table (identity stamp) + access.
- `rag/src/lib/index-manager.ts` — indexing path (`embed?: typeof embedTexts` → inject the port);
  **stamps** the identity.
- `rag/src/tools/search-vault.ts` + `rag/src/index.ts` (l.50) — **consult the guard** before
  searching; return the "stale" signal where applicable.
- `rag/src/tools/reindex.ts` — unchanged in principle: remains the **confirmed action** (just verify
  that a `force` reindex re-stamps the new identity).
- `rag/src/lib/embedder.test.ts` — reformulate around the port (anti-regression net).

---

## 7. Out of scope (faithful to "just abstract")

- ❌ **No 2nd real embedder** (Mistral / OpenAI / local-Ollama) — **prior discussion with
  Thomas** (decision §0.2).
- ❌ No multi-provider `switch` nor catalog in `createEmbedder()` — just the entry point.
- ❌ No rework of the onboarding (`installer.mjs`, `scripts/verify-rag.mjs`, `scripts/lib/gemini-key.mjs`,
  `.env.example`, `CLAUDE.md` stub step 4): they assume a **Gemini key**. A local embedder
  *without a key* would break this flow → **to be handled the day a real 2nd impl arrives**, not here.
- ❌ De-Gemini-ize the **defaults** of the `UsageTracker` (Pacific timezone, "Pacific
  midnight" labels): noted debt, not done here.

---

## 8. MCP contract provider-leak — already clean ✅

ADR 0006 noted that `vault_stats` "speaks Gemini Quota". **Verified 2026-06-08:** `rag/src/tools/vault-stats.ts`
emits only **agnostic** terms (Documents / Chunks / By type), **zero** Gemini quota. The
residual leak is **internal to the SPI** (comments, the `DailyCapExceededError` error message,
`"google-rate-limit"` in `index-manager.ts`), **not in the MCP tool schemas**. The
public contract exposed is already clean — nothing to fix on the port side in this plan.
