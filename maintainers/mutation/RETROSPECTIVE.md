# Mutation testing — retrospective: what the survivors taught us (Step 6)

> **Dev-only.** This whole folder lives under `maintainers/` and is **excluded from the brain copy**
> (`scripts/lib/tracked-files.mjs` → `DEV_ONLY_PREFIXES`), so none of it ever reaches a generated brain.
> Sister docs: the scores in [`RESULTS.md`](RESULTS.md); the plan
> [`../plans/prospective/mutation-testing-stryker.md`](../plans/prospective/mutation-testing-stryker.md) (Step 6).

**Why this doc exists.** The point of the whole mutation exercise was never the score — it was to name
**what was systematically weak in our tests / TDD discipline** so the same gaps stop recurring. This is the
durable trace of that diagnosis, of the rules it produced, and of where they were engraved so they act as a
net going forward.

**Method.** We read across all 14 `test(...)` hardening commits on `test/rag-mutation-hardening`
(rag 8 files, local-mirror 6, scripts 3) with three parallel readers, classifying, for every survivor that
was killed, the mutant shape and the assertion/seam that killed it. **All 6 candidate clusters were
confirmed, none refuted, plus 3 new infra-shaped clusters.**

---

## The diagnosis — recurring survivor shapes

### The 6 language-agnostic assertion habits

| # | Survivor shape (what stayed alive) | Root-cause TDD habit | The rule that would have prevented it |
|---|---|---|---|
| **C6** *(most frequent — 8/8 rag files)* | `?.` / `??` / default-arg / `&&`‑`\|\|` never broken by a test | happy-path-only inputs; the present case written, the absent one never | For every optional, write the **null/absent twin** next to the present one. |
| **C3** *(2nd)* | `>` vs `>=`, `&&` vs `\|\|`, regex `^`/`$` anchors survive | one-sided example that doesn't distinguish the operator | **Triangulate** boundaries *and* operators: the on-the-boundary (equal) case, the just-outside case, an asymmetric discriminator (`a·b ≠ b·a`, contains-but-not-a-segment, mid-line `#`). |
| **C4** *(the #1 score driver — every 0% file)* | whole branches unreachable through the public API | "it's pure glue / a top-level script — not worth a test" | **Unreachable is the diagnosis, not the exemption.** Extract a pure seam / inject a port / name every wiring factory until every branch is reachable. |
| **C2** | mutants on the *other* fields survive | asserting the one field I cared about | `deepEqual` the **whole object / the whole call sequence** (args included), not one field. |
| **C5** | `some`/`every`/`find`/sort identical on a 0–1 element or pre-sorted list | trivial collection under test | Test with **≥2 elements, deliberately unsorted, + an out-of-scope decoy**. |
| **C1** *(least frequent)* | `throw ''` survives a bare `assert.throws` | asserting the fact, not the message | **Matcher mandatory** on `throws`/`rejects` (regex/type); results carry their body; logs their exact payload. |

### The 3 new, infra-shaped clusters

1. **CLI/script fakes keyed on a PARTIAL command.** A fake `git` keyed on `args[0]` lets every *later*
   arg-string mutant survive (`--get`, `@{u}..HEAD`, the commit `-m <message>`). → key the fake on
   `args.join(" ")` and `deepEqual` the full command list; mirror real trailing-newline output so the
   production `.trim()`s are pinned.
2. **Composition roots / entry guards.** Inline boot arrows and `import.meta.url` guards. → name every
   wiring seam (no inline arrows Stryker can't observe), inject a `BootDeps`, keep the module
   import-testable. The entry guard itself is an accepted equivalent — earn it back with **one** subprocess
   integration test (that lone test is the whole gap between `auto-commit` 98% and `auto-push` 92%).
3. **LLM-facing string surfaces** (MCP tool names + every tool/field description). They never affect a
   return value, so behavioural tests miss them. → assert them explicitly (drive the real registered surface
   via an in-memory `Client`/`InMemoryTransport`; assert names + non-empty descriptions).

### Two pieces of mutation literacy (so we don't waste effort)

- **Equivalent mutants — do NOT chase them** (document + count "effective 100% on non-equivalents"): the
  default-wiring of an injected port (real-I/O-only), a `?? []`/`?? null` immediately `.map().join('')`ed
  back to the same string, a greedy regex masked by a downstream `.trim()`, real-SDK/real-network
  construction (`new Client({auth})`), `import.meta.url` guards, `Number()`/parse that already trims.
- **Tooling trap:** Stryker **inflates** the score via false timeouts (a bogus 87.5–100% masking the honest
  ~56%). Bridle `concurrency`/`timeout` in the config before trusting a run.

> **The objective signal is the mutation score, not line coverage** — a suite can cover 100% of lines and
> kill ~0% of mutants (exactly what `document-scanner`/`vault-watcher` did at 0%).

---

## What was done — so it can't recur

Rules engraved with a **belt-and-suspenders split** (mirroring the `language.md` model), agreed with Thomas
on 2026-07-15:

- **Global (all projects)** — the 5 language-agnostic habits (C1/C2/C3/C5/C6 + reachability-as-design-smell)
  live in the **`tdd-discipline` skill**, § "Qualité des assertions — leçons du mutation testing"; the global
  `use-case-driven-harness/rules/testing.md` points to it.
- **Repo-local** — [`../CONVENTIONS.md`](../CONVENTIONS.md) **§5ter** carries the 3 infra-shaped clusters +
  the equivalent-mutant literacy + the Stryker false-timeout trap; **§5bis** ("test the glue too") was
  **broadened** to cover C4 beyond plain I/O (pure unreachable branches, top-level scripts, composition roots).
- **Deterministic guard (ADR 0009 spirit)** — only C1 is cheaply mechanical, so it got a lint:
  [`../../scripts/lib/assert-matcher-lint.mjs`](../../scripts/lib/assert-matcher-lint.mjs) + its repo-wide
  `*.test.mjs` guard **fail CI loud** if any engine test file calls `assert.throws(…)`/`assert.rejects(…)`
  with no matcher/2nd argument. Built in TDD baby-steps (paren-depth + string-aware scanner; the
  trailing-comma edge was caught fail-first); dev-only (excluded from the brain copy via `DEV_ONLY_PREFIXES`).
  The other clusters stay **written rules** (no cheap reliable check) — the on-demand net is
  `npm --prefix maintainers/mutation run mutate:changed`.

The scores that produced this diagnosis are in [`RESULTS.md`](RESULTS.md); every per-file "before → after"
and its residual equivalents are in the plan's Step 3.

---

## Changes shipped in this retrospective (the full recap)

**In this repo (`second-brain-generator`, branch `test/rag-mutation-hardening`):**

- **`scripts/lib/assert-matcher-lint.mjs`** *(new)* — the deterministic C1 guard: a paren-depth +
  string-aware scanner exposing `findLooseAssertions(source)`.
- **`scripts/lib/assert-matcher-lint.test.mjs`** *(new)* — 8 unit tests (TDD baby-steps) + a repo-wide
  guard that fails CI loud on any loose `assert.throws/rejects` across the engine test suites.
- **`scripts/lib/tracked-files.mjs`** — added `scripts/lib/assert-matcher-lint` to `DEV_ONLY_PREFIXES`
  so the guard (and its test) never ship into a generated brain.
- **`maintainers/CONVENTIONS.md`** — **§5bis** broadened ("unreachable is the diagnosis, not the
  exemption" — pure branches, top-level scripts, composition roots); **§5ter** added (the 3 infra-shaped
  clusters + equivalent-mutant literacy + the Stryker false-timeout trap + the lint).
- **`maintainers/mutation/RETROSPECTIVE.md`** *(new — this file)*.
- **`maintainers/mutation/RESULTS.md`** — pointer to this retrospective.
- **`maintainers/plans/prospective/mutation-testing-stryker.md`** — Step 6 ticked with outcome.

**In the personal harness (`use-case-driven-harness`, separate repo — French corpus):**

- **`skills/tdd-discipline/SKILL.md`** — new § "Qualité des assertions — leçons du mutation testing"
  (the 5 language-agnostic habits).
- **`rules/testing.md`** — pointer to that new section.

**Verification:** `scripts/**` suite green (560/560), including the new lint guard and `tracked-files`.
The doc changes touch only `maintainers/` (never in the rag/local-mirror packages), so no engine re-run
was needed.
