# When the "small architectural refinement" reveals a ×50 on latency

> **Article material — takeaways from a RAG hardening session (2026-06-09).**
> Context: Second Brain Generator, local RAG engine. We were about to wire up the install
> (make the *in-process* "Gemma inside" embedder recommended by default on a capable machine).
> Before wiring, an architecture question asked at the right moment avoided shipping a
> sluggish search — and revealed a perf bug that the previous provider (Gemini) was masking.

---

## 1. The trigger: an architecture question asked BEFORE wiring

The product decision was made (RAM threshold, 3-option choice at install). Instead of charging
into the onboarding code, the question asked was:

> *"The fact that it's the MCP that does the RAG and the search, isn't that going to cause
> problems? If the RAG takes up resources a bit during indexing, is the search going to lag and
> slow down the experience? Before we wire all that into the harness, I'd like us to answer
> this question."*

**Takeaway #1 — The best architecture question is asked just *before* integration, not after.**
At this stage, the cost of the answer is a measurement; after wiring, it's a user incident +
a rollback. The reflex "we verify the load hypothesis before making it the default" set
everything off.

---

## 2. Read the code before speculating: where does indexing really run?

Answer found **in the code**, not by intuition: the `vault-rag` MCP server **reindexes in its
own process**, on the same event-loop as the search:
- an **auto-reindex** launched as a background task when the server starts;
- a **watcher** that relaunches an incremental reindex on every write to the vault.

So indexing and search **share the same Node process and the same CPU**. The contention
hypothesis was well-founded. What remained was to know *of what nature*: blocked event-loop (frozen
search) or simple CPU concurrency (slowed search)?

**Takeaway #2 — "It shares the CPU" is not an answer, it's the start of the investigation.**
Blocking the event-loop and saturating the CPU have opposite remedies. You have to tell them apart.

---

## 3. Measure the gray zone instead of guessing it

Rather than reasoning about the internals of Transformers.js / onnxruntime, a **probe**
reproduced the real architecture *faithfully*:
- search as the code does it (a fresh `createEmbedder()` on **every** request);
- a concurrent background indexing (batch embedding).

And — a crucial methodological point — it also measured the **simulated fix** (a single shared
instance) in the same run, to get a **before/after** under the same conditions.

### Results (p95)

| Scenario | Search at rest | Search during indexing |
|---|---|---|
| **Before** (fresh instance per search) | **510 ms** | **25,429 ms** (×50) |
| **After** (shared hot session) | **35 ms** | **810 ms** |

**Takeaway #3 — Prove the fix in the same measurement as the diagnosis.** A diagnosis without
a demonstration of the remedy leaves the doubt "what if the real problem was elsewhere?" hanging.
The before/after in a single run closes the question.

---

## 4. The real cause wasn't the one we were looking for

We were looking for a *contention* problem. The dominant culprit was elsewhere:
`search_vault` called `createEmbedder()` **on every request**, and the model's memoization was
**`private`** (per instance). So:
- each search started over with an empty cache → **reloaded an ONNX session (~440 ms,
  even at rest)**;
- search + indexing created **two concurrent sessions** → over-subscription of the CPU
  cores → the OS thrashes → search up to **25 s**.

**Why invisible until then?** The previous provider (Gemini, remote) didn't show it:
creating its client is free, and embedding is a **network** call (zero local CPU, zero
model to load). The switch to an **in-process** embedder changed the *nature* of
`createEmbedder()`: recreating an embedder went from "free" to "expensive".

**Takeaway #4 — Changing an implementation behind a port can shift the cost, not just the
tech.** An innocuous factory (`createEmbedder()` on every call) was perfectly correct
with a network adapter and becomes a trap with an in-process adapter. The port (good
hexagonal decoupling) enabled the swap; it did not, on its own, guarantee that the *performance
invariants* held after the swap. **Ports protect the functional contract, not the perf
profile — that one is re-measured at each new adapter.**

---

## 5. The fix: a singleton, and that's all

A single TDD *baby-step*: `createEmbedder()` **memoized at the module level** → search and
auto-reindex share **a single hot ONNX session**. Side effects checked:
- provider frozen at the 1st selection — harmless, a swap already goes through a restart;
- the API key is still read **lazily** at embed time → pasting the key afterwards still
  works.

Unexpected bonus: a choice made *earlier* in the project (capping embedding batches at 4,
for RAM) **naturally airs out the event-loop** between sub-batches → a search slips in
quickly during indexing. Two independent hardenings that reinforce each other.

**Takeaway #5 — The right fix for a ×50 can fit in three lines.** The magnitude of the symptom
says nothing about the magnitude of the cause. Here: no worker thread, no priority queue — a
singleton. *(The worker_thread temptation was explicitly set aside: 0.7 s in a rare window
doesn't justify the complexity. No over-engineering against an unproven risk.)*

---

## 6. Keep the right scale of drama

Important so as not to over-react: the big indexing (the minutes of computation) is the
**initial indexing**, **once**, when the user isn't asking questions yet. In steady state,
the watcher does **incremental** work (a few modified notes = under a second). The "search during
big indexing" case is **narrow** — and even there, the fix holds at ~0.7 s.

**Takeaway #6 — Measure the *frequency* of the worst case too, not just its magnitude.** A
spectacular but very rare worst case isn't handled like a permanent cost. Conclusion: the
"the MCP does the RAG" architecture is **sound**; we just needed to share the session.

---

## Meta-lessons (transferable beyond RAG)

1. **Ask the load question before integration, not in a post-mortem.**
2. **Tell blocked event-loop vs saturated CPU apart** — opposite remedies.
3. **Reproduce the real architecture in the probe**, including its "details" (here: factory called
   per request) — it's often the detail that is the bug.
4. **Measure the fix in the same run as the diagnosis** (reliable before/after).
5. **Re-check the perf invariants at each swap behind a port** — the functional decoupling
   doesn't carry over the performance profile.
6. **The symptom's magnitude ≠ the cause's magnitude** — a ×50 can be fixed in 3 lines.
7. **Weight the worst case by its frequency** before adding complexity.

---

*Artifacts: commit `feat(rag): embedder partagé (createEmbedder mémoïsé)`; reproducible probe
`rag/scripts/measure-contention.mts` (dev-only). Discipline: TDD baby-steps (red→green→refactor),
fix driven by a test (`createEmbedder()` returns the same instance).*
