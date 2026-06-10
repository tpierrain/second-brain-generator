# Removing an obligation made the install *better* verified

> **Article material — takeaways from a RAG onboarding session (2026-06-09).**
> Context: Second Brain Generator. The install **forced** a Google Gemini key. Step 5 of the
> embedder plan was meant to make it **optional** and offer a 3-option embedder choice
> (all-local "Gemma inside" / API key / Ollama), with a machine-adapted recommendation.
> Methodological surprise: by **removing** the forced key, the install became **more**
> self-verifiable, not less. And a 3-line gate caught a bug hiding far from the main path.

---

## 1. Two scoping questions BEFORE writing a single line

The product decision (D1) was enacted: 3-way choice, 12 GB RAM threshold, adaptive recommendation.
But two zones remained ambiguous and **changed what had to be built**:
- in non-interactive mode (install driven by Claude), what to do **without** an `--embedder` flag?
- the "API key" option, is it *just Gemini* (simple) or *also* an OpenAI/company endpoint?

Answers obtained in 30 seconds: **machine recommendation by default**; **yes, offer the provider
choice**. The second broadened the scope of the interactive branch — exactly the kind of thing you
hate to discover *after* having coded the narrow version.

**Takeaway #1 — When an ambiguity changes the *deliverable* (not just a detail), ask before
coding.** The cost of a question is a sentence; the cost of having built the "Gemini-only" option 2
then reopening it is a refactor. The "as few questions as possible" rule holds for the *end user*,
not for the scoping of a task.

---

## 2. The decision core is PURE; only the readline shell isn't

The installer is very "I/O" (readline, files, git, npm). Temptation: write everything in
`installer.mjs` and test by hand. Instead, **all the decision** was extracted into pure functions
in `scripts/lib/embedder-choice.mjs`, each driven by a test (TDD baby-steps):
- `recommendedEmbedderKey({platform, arch, totalMemBytes})` — the recommendation (12 GB threshold, Mac Intel);
- `buildEmbedderOptions(...)` — the menu (privacy order, ⭐ on the recommendation, option 1 hidden
  + renumbered on Mac Intel);
- `envConfigForEmbedder(key)` — choice → `.env` lines;
- `embedderReady(envContent)` — "can this embedder index?".

Result: 18 tests cover **all the logic that can go wrong** (thresholds, Mac Intel,
numbering, `.env` mapping). `installer.mjs` keeps only the readline orchestration — the only
part a human has to re-read, and the least risky (no computation, just `console.log`s and
`ask`s).

**Takeaway #2 — Even an I/O-laden install flow has a pure *decision core*, hence testable.**
The question "which embedder, hidden or not, which `.env` lines" has no reason to touch the
disk. Extract it, test it exhaustively, and the big rewrite of the orchestrator becomes a
low-risk change.

---

## 3. The counter-intuitive: removing the forced key *strengthened* the install proof

Before, the install could only prove it worked if the user **already had** a Gemini key
— but the key **never** arrives at install time (never in chat or CLI, for security).
So the strongest post-flight (the "canary": proving that the RAG answers *from the vault* with a
fact not findable anywhere else) was **systematically deferred**. The install ended on "MCP
connection OK, but retrieval not proven".

By decoupling "ready to index" from "has a Gemini key" (`embedderReady`), the **all-local** option
has **no key to wait for**: at install, it downloads the weights, indexes, **and runs the canary
right away**. Measured end-to-end: `--embedder in-process` → *post-flight OK, "Mollecuisse" canary
found*, **without any key**, `exit 0`.

The most **private** option became the most **self-proven** option. The cloud path (Gemini),
for its part, stays condemned to a deferred verification — the key arrives later.

**Takeaway #3 — An "obligation" can mask a capability.** The forced key wasn't just a privacy
friction: it was the **bottleneck** that prevented the install from proving itself.
By removing it for the right path, we gained an *end-to-end fail-loud* install. When
you remove a prerequisite, ask yourself what it **blocked** on top of what it imposed.

---

## 4. One gate, three callers — and the bug hidden at the periphery

"Stop forcing the key" sounds like a change in the installer. In reality, the hypothesis
"the RAG = Gemini = a key is needed" was **scattered**. Rather than re-testing it everywhere, a
single pure predicate replaced it: `geminiKeyRequired(envContent)` (false as soon as
`EMBEDDING_PROVIDER` is `in-process` or `openai-compatible`).

By tracing *who* consumed the old hypothesis (`hasGeminiKey`), we found the trap **far from the
main path**: the **session status** hook (`session-status.mjs`) displayed at **every
startup** "⚠️ Gemini key missing". An all-local user, who *deliberately* has no key,
would have been scolded for life by their own install that works perfectly. The same gate
fixed the installer, `verify-rag` **and** this hook.

**Takeaway #4 — When you lift an obligation, `grep` all the consumers of the old invariant.**
The bug doesn't live in the feature you're modifying (the install), it lives in the **peripheral**
that assumed the invariant silently (a status line). Centralizing the question into **one** gate
isn't just DRY: it's what makes these consumers easy to flush out.

---

## 5. Backward-compat: a new default goes through *detection*, not a *flip*

The trap would have been: "in-process is the new default → everyone gets it." That would have broken
existing non-interactive installs (Mac Intel, small machines, automations that
expected Gemini). The default chosen without a flag is **not** "in-process", it's **"apply the
adaptive recommendation"**: the machine decides. Capable & ≥ 12 GB → all-local; otherwise → API key. And an
explicit `--embedder` always wins.

**Takeaway #5 — Ship a new default by detection, not by global switch.** "The best
choice *for this machine*" respects the existing (nothing breaks where the new default doesn't
fit) while making the capability available everywhere it does fit — without imposing a single
choice.

---

## Meta-lessons (transferable beyond install)

1. **Ask when the ambiguity changes the deliverable** — not for the end user, but for the
   scoping of the task.
2. **Every I/O flow has a pure decision core**: extract it, test it exhaustively, and the shell
   becomes a trivial re-read.
3. **An obligation often hides a capability**: in removing it, look at what it *blocked*,
   not only what it *imposed* (here: an install that proves itself).
4. **Centralize a lifted invariant into ONE predicate, then `grep` its consumers** — the bug hides
   in the peripheral that assumed it silently.
5. **A new default ships by detection, not by global flip** — "the best for *this*
   machine" preserves the existing and removes no choice.
6. **The decision threshold lives in ONE tested pure function** (here 12 GB), traceable to who
   settled it — not scattered in `if`s across the orchestrator.

---

*Artifacts: commits `7be29f6 → 4e83c5e` (Step 5 of the embedder plan). Pure tested core
`scripts/lib/embedder-choice.mjs` (18 tests); gate `geminiKeyRequired` (`scripts/lib/gemini-key.mjs`).
End-to-end proof: non-interactive install `--embedder in-process` → Mollecuisse canary `exit 0`
without a key; `verify-rag.mjs` in-process `exit 0`. Discipline: TDD baby-steps (red→green→refactor);
MCP contract unchanged (rag 112/112). Follow-up to the "shared embedder" retro (Step 4-quater).*
