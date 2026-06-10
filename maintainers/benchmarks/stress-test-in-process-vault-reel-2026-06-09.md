# In-process RAG stress-test on a real dense vault — 2026-06-09

> **Publication material.** First stress-test of the **all-local in-process** embedder
> ("Gemma inside") on a **real dense vault**, no longer on the Flemmr demo (7 notes).
> Goal: prove outside the demo that (a) the batch cap holds the RAM, (b) retrieval quality
> holds on a real dense corpus. Run carried out on the `feat/rag-embedder-swappable` branch.

---

## Protocol (reproducible)

> Replace `<VAULT_SOURCE>` with a real dense vault (here a personal **unversioned** vault,
> ~270 notes). The test brain is **disposable**: to be deleted afterwards (`rm -rf`), it contains
> private data in its `.git`.

**1. Install a disposable brain in-process** (no key, no network), from the branch:
```bash
node installer.mjs --non-interactive --name brain-pr-test --dest "$HOME" \
  --owner "<name>" --lang fr --embedder in-process
```

**2. Dump the real vault** (`.md` only, structure preserved, non-destructive):
```bash
rsync -a --prune-empty-dirs --include='*/' --include='*.md' --exclude='*' \
  "<VAULT_SOURCE>/" "$HOME/brain-pr-test/vault/"
```

**3. Trigger indexing via the watcher**: open a **Desktop conversation (Code tab)
rooted in `~/brain-pr-test`** — the MCP starts, its watcher detects the files and auto-indexes.
*(Indexing triggers the very second `rsync` drops the files, as soon as the MCP is running.)*

**4. Sample during the run** — RSS of the **isolated** indexing process (otherwise polluted by the
~40 "node" processes of Claude Desktop) + run state:
```bash
# real RAM peak of the indexer (OS RSS, MB)
ps -A -o pid,rss,command | grep "rag/src/index.ts" | grep -v grep \
  | sort -k2 -rn | head -1 | awk '{printf "PID %s  %.0f Mo\n", $1, $2/1024}'
# progress (status / doneChunks / totalChunks / errors)
cat "$HOME/brain-pr-test/rag/.cache/last-run.json"
```

**5. Verify memory release**: close the Desktop app (MCP shutdown) → the RAM must drop.

> ⚠️ A **concurrent CLI** indexing (`cd rag && npm run index`) launched in parallel is
> **correctly refused** by the `ReindexLock` (`skippedLocked: true`) — anti-double-index guardrail.

## Environment

| | |
|---|---|
| Machine | MacBook (Apple Silicon **M4**), **24 GB** RAM, `darwin arm64` |
| Embedder | **in-process** — Transformers.js v4 (`@huggingface/transformers`), `onnxruntime-node` 1.24.3, CPU |
| Model | **EmbeddingGemma-300m ONNX (q8)**, with task prompts |
| Batch cap | `EMBED_BATCH = 4` (default, Step 4-ter) |
| Provider | `EMBEDDING_PROVIDER=in-process` ; `GOOGLE_GEMINI_API_KEY` **empty** |

## Corpus

| | |
|---|---|
| `.md` notes indexed | **271** (+ 6 demo notes skipped, unchanged; 277 files scanned) |
| Markdown weight | ~2.8 MB, **24 folders** |
| Longest notes | transcripts of **~85 to 103 KB** each (`raw-sources/transcripts/`) |
| Non-`.md` (json, py, txt, pptx, png…) | **ignored** by the scanner (`.md` only) |

## Results — indexing (measured in this run)

| Metric | Value |
|---|---|
| Chunks produced / indexed | **2,764 / 2,764** (100%, `doneChunks == totalChunks`) |
| Errors | **0** |
| Total duration | **~5 min 48 s** (21:10:12 → 21:16:00 UTC) |
| Average throughput | **~7.9 chunks/s** (~477 chunks/min ; ~47 notes/min) |
| Chunks per note (average) | ~10.2 |
| **RAM peak** (OS RSS, isolated indexing process) | **~2.9 GB** |
| RAM during indexing (samples) | 2.44 GB (32%) → 2.48 GB (57%) → 2.92 GB (81%) |

**Reading:** the RSS stays **almost flat ~2.5 GB** for most of the run and peaks at **~2.9 GB** —
**never near 4 GB**, and *very* far from the **8.5 GB (then stall)** observed on this same type of
corpus **without** a batch cap (cf. Step 4-ter). The cap holds the RAM **bounded and
decoupled from the vault's size**, on a real dense corpus.

## Results — memory at rest (measured in this run)

- After indexing, the MCP process **keeps ~2.8 GB**: this is the **shared embedder** (Step
  4-quater) **kept hot** for fast searches — **deliberate choice, not a leak**.
- **Empirically confirmed**: on **closing the Desktop app** (hence MCP shutdown), the **RAM
  drops** immediately. The index stays persisted on disk (`rag/.cache/vault.db`) → instant
  reopening, **without re-indexing**.

## Results — retrieval quality (qualitative, this run)

3 **discriminating** test questions asked in a rooted Desktop conversation — **3/3 passed**:

1. **Isolated fact + figure** nested in a table of a **single** note (least-expressed Resonance
   score). → right note cited, right figure.
2. **Fact + nuance trap**: squad owning a POC + scope, **ruling out a distractor**
   ("person designated *afterwards* ≠ selection criterion"). → nuance handled correctly.
3. **Multi-hop**: answer impossible from a single note, forcing a **cross between 2 notes**
   (analytics auto-capture × micro-frontends architecture). → both sources surfaced.

→ Precision **and** multi-hop hold on 271 dense docs. **No quality ceiling observed** →
Steps 6/7 (reranker) remain unnecessary.

## Search latency (reference — dedicated bench, NOT this run)

Per-request latency was **not** instrumented in this run (questions asked by hand).
Relevant numbers from the instrumented bench of **Step 4-quater** (shared embedder), same
in-process embedder:

- Search at rest: **~510 ms → ~35 ms** after memoizing `createEmbedder()` at the process level.
- Search **during** an indexing: **~25,400 ms → ~810 ms** (p95).

> The cause of the peak was `createEmbedder()` recalled on every search (reload of an ONNX
> session ~440 ms) + over-subscription of the cores; the fix = **process singleton** embedder.

## Bonus — bug flushed out by this test (and fixed)

The real install test (in-process, no key) brought out a **false green** invisible in the demo:
`vault_stats` displayed a **hard-coded Gemini quota** ("Quota: 0/7600") even in in-process,
which the LLM aggravated into "Gemini key working" when no key existed at all. **Fixed in
TDD** (commit `2e2c320`): the report receives the `providerId` of the active embedder and only
displays the quota for Gemini; an honest local line otherwise. **Lesson: only a *real* install
test brings out this kind of false green.**

## Measurement pitfalls (to reuse)

- **`ps | grep node` is polluted**: Claude Desktop (Electron) launches dozens of "node"
  processes → the RSS sum does **not** reflect the indexer. **Isolate** `rag/src/index.ts`.
- The **watcher indexes the second** the files are dropped → any concurrent manual
  indexing is refused by the lock (normal).

## Verdict

The **in-process** embedder holds **load, RAM and quality** on a real dense corpus (271 notes,
2,764 chunks), **without key or network**, on a consumer machine (M4 / 24 GB), RAM peak **~2.9 GB**
in **~5 min 48 s**. The "all-local" default is validated outside the demo.
