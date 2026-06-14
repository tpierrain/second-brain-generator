# Post-QA polish — conversational version answer + status-line key segment (PR #10)

**STATUS: ✅ DONE (2026-06-14, branch `engine-packaging` / PR #10) — pending the maintainer's manual QA + merge
post-demos.** Item 1 (deterministic version via `vault_stats` + guidance) and Item 2 (status-line key gate)
both shipped green (harness 216/216, RAG 137/137, tsc clean). Commits: `311b009` (1a), `2d5cbe3` (1b),
`acd032c` (Item 2). Only the optional CLI-banner version box is intentionally left for a maintainer call. Plan to
be archived once merged. Original brief below.

**STATUS (original): 🚧 PLANNED (not started).** Two findings from the maintainer's **manual QA** of the comet-tail
(2026-06-14), on branch `engine-packaging` (**PR #10**, draft). **✅ Sequencing DECIDED = B (2026-06-14):** the
**deterministic fix goes into PR #10 now** — the version answer must rest on a single source of truth, not on
probabilistic prose ([`ADR 0009`](../decisions/0009-prefer-deterministic-mechanisms.md)). **This means `rag/` IS
in scope** (the `vault_stats` relabel) — fine on the **branch**: it rides PR #10 and only reaches `main` post-demo
(ADR 0014). **To be implemented AFTER a `/clear`** (the maintainer's explicit call). Order: **this polish →
`/code-review` on the diff → manual QA campaign → merge `main` + tag `v3.0.0`** (post-demos). ⚠️ **No `main` merge
before the Mon/Tue demos.**

> Surfaced while QA-ing the freshly-installed test brain (`~/sbg-statusline-smoketest`, in-process):
> the **status-line display** of the engine version works on both surfaces (CLI + Desktop), but two gaps
> remain — the **conversational** version answer and a **false "Gemini key missing"** warning.

## ▶ Progress checklist (SOURCE OF TRUTH — resume at the first unchecked box)

> **To resume after `/clear`:** say **« reprends le plan polish »**. The agent checks out `engine-packaging`,
> reads **this** checklist, does the first unchecked `- [ ]` in **TDD baby-steps** (skill `tdd-discipline`),
> **commits green only** ([[commit-only-green-todo-gate]]), ticks the box in the finishing commit, and mirrors
> progress in the PR #10 body.

- [x] **Item 1 — Make the conversational version answer = the engine TAG, reliably** _(2026-06-14)_ _(= the maintainer's "A";
      aligns the spoken answer with [`ADR 0017`](../decisions/0017-engine-version-reference-is-git-tags.md) and
      with the status-line)._ ⚠️ **Key insight (maintainer, 2026-06-14):** prose guidance to an LLM is **itself
      probabilistic** — it biases the coin flip, it doesn't remove it ([`ADR 0009`](../decisions/0009-prefer-deterministic-mechanisms.md):
      instructing an LLM ≠ determinism). The **real fix is a single source of truth**: remove the wrong answer at
      its source so every path leads to the tag. So this Item is **two layers**, with a sequencing decision below.
  - [x] **1a — THE deterministic fix (single source of truth): `vault_stats` surfaces `source.ref` as "Version".**
        _✅ DECIDED = do it now in PR #10 (option B)._ _(2026-06-14)_ The brain reaches for `vault_stats` spontaneously → make
        that tool return the **right** value: the engine **tag** (`source.ref`, read from `engine-manifest.json` at
        the brain root), labelled **"Version"**; and **relabel** `rag X.Y.Z` / index-schema as **"internal build /
        mechanics"** (kept for debug/reindex staleness diagnostic, **never again presented as "the version"** — do
        NOT remove it: a mute tool would just push the LLM back to guessing). Then whether the LLM reads the tool
        **or** the manifest, it lands on the tag — no wrong number left to grab.
    - [x] pure formatter in `rag/src/lib/engine-version.ts` mirroring `scripts/lib/engine-version.mjs`
          `formatEngineVersion` (tag verbatim → `engineVersion.rag` fallback → none); TDD, fail-first. _(2026-06-14 · `manifestEngineVersion`)_
    - [x] loader reading `engine-manifest.json` at the brain root (`../engine-manifest.json` relative to `rag/`);
          fail-silent if absent (launcher) → fall back, never throw. _(2026-06-14 · `loadManifestEngineVersion`, `../../../` from rag/src/lib)_
    - [x] rewire `formatEngineVersionReport` (`rag/src/lib/engine-version.ts`) + the live `vault_stats` handler
          (`rag/src/index.ts`): headline **"Version: `<tag>`"**, then a clearly-labelled **"internal build: rag
          X.Y.Z · index schema running N / stamped M"** line. Report tests updated to the new 3-arg shape. _(2026-06-14)_
          _(NB: `rag/src/tools/vault-stats.ts` is dead code — the live handler is inline in `index.ts`, as for all `src/tools/*`.)_
    - [x] **addendum to [`ADR 0017`](../decisions/0017-engine-version-reference-is-git-tags.md)** (§1.bis):
          the conversational/tool path single-sources the version from `source.ref` (vault_stats), so the answer is
          deterministic, not prose-dependent. _(2026-06-14)_
  - [x] **1b — Guidance (complement to 1a, cheap, doc-only).** _(2026-06-14)_ With 1a the data is already right everywhere; this
        just removes any residual phrasing ambiguity.
    - [x] **constitution EN** (`CLAUDE.md.template`): when asked "what's your engine version", report the engine
          **tag** (`source.ref` / `vault_stats` "Version") as THE version; the `rag`/schema vector is **internal
          mechanics**. _(2026-06-14 · bullet under the retrieval rules, ~line 173)_
    - [x] **constitution FR** (`templates/fr/CLAUDE.md.template`): same, in French. _(2026-06-14 · ~line 160)_
    - [x] **`update-engine` SKILL.md**: one line pointing the version-reporting path to `source.ref`. _(2026-06-14)_
- [x] **Item 2 — status-line: stop the false "⚠️ Gemini key missing" on keyless embedders.** _(2026-06-14)_ _(pre-existing bug,
      now QA-confirmed user-visible on an in-process brain — CLI screenshot 2026-06-14.)_
  - [x] `scripts/status-line.mjs`: gate `keySeg` behind the required-AND-missing check — only warn when a Gemini
        key is **required** (provider gemini/default) **and** missing. In-process / ollama / openai-compatible
        brains → **no warning**. _(2026-06-14 · via the new shared `geminiKeyWarning(envContent)` helper)_
  - [x] guard: extracted the decision into a pure **`geminiKeyWarning(envContent)`** in `./lib/gemini-key.mjs`
        (deterministic, ADR 0009) and unit-tested it (4 tests: required+missing/present, in-process, openai-compat);
        plus a manual smoke re-check (in-process brain → **no** "key missing" segment; gemini-without-key → warning). _(2026-06-14)_
  - [ ] _(optional, decide with maintainer)_ also surface the engine version in the **CLI startup banner**
        (`session-status.mjs` `systemMessage`) — currently intentionally skipped (status-line covers both
        surfaces). 2 lines if wanted; otherwise leave.
- [x] **Definition of done** _(2026-06-14)_ — harness `node --test` green (216/216, fail 0, todo 0); **RAG suite green**
      (`rag/` 137/137 + **`tsc` clean** — `rag/` IS changed now, option B); all boxes ticked with _(date · commit)_;
      PR #10 body refreshed; **NO `main` merge** (post-demos). Plan `git mv`'d into
      [`plans/archived/`](archived/) ([[plan-done-equals-archived]]). ⚠️ **Remaining (optional)**: the CLI-banner
      version box stays unchecked — a maintainer call (status-line already covers both surfaces).

## Findings (the QA evidence, so a fresh window has the context)

- **Finding 1 (Item 1) — and it's NON-DETERMINISTIC, which is the real reason guidance is needed.** Same
  question *"quelle version ?"*, two surfaces, two different answers:
  - **Claude Desktop** (Code tab) → **"rag 1.1.0"** via `vault_stats` (the mechanical `engineVersion` vector
    from `rag/package.json`) ❌ — the **wrong** number per ADR 0017.
  - **CLI** → **"engine engine-packaging"** from `engine-manifest.json` `source.ref`, correctly citing ADR 0017
    (offline, no network) and even spontaneously flagging the branch-vs-tag nuance ✅ — the **right** answer.

  So without guidance the answer is a **coin flip** (surface/model/effort/luck) between the `source.ref` tag and
  the mechanical vector — and the **majority audience is Desktop**, where it landed on the wrong one. ADR 0017
  makes the **`source.ref` tag** the user-facing version and the `engineVersion` vector "mechanics only"; the
  **status-line is always correct**, only the **conversational** answer is unreliable, because nothing tells the
  brain which to use and `vault_stats` hands it the mechanical value. **Item 1's guidance makes the correct
  answer reliable on every surface** (not a one-off bug — a determinism fix).
- **Finding 2 (Item 2).** CLI **and** Desktop status-line show **`⚠️ Gemini key missing`** on the in-process test
  brain (which needs **no** key). `status-line.mjs` calls `hasGeminiKey(envContent)` unconditionally instead of
  gating on `geminiKeyRequired(envContent)`. Misleading for the keyless embedders that are now the default path.

## Decisions settled (2026-06-14, with the maintainer)

- **Item 1 approach = guidance (doc), not a tool change, pre-demo.** The `vault_stats`-surfaces-`source.ref`
  hardening is **deferred** (post-demo) because it touches `rag/` + the MCP contract.
- **Both items ride PR #10**, implemented **after a `/clear`**, **before** the `/code-review`, so the version
  feature is complete and reviewed as a whole.
- **No `main` merge before the demos** (ADR 0012/0014); merge + tag `v3.0.0` only after QA is green.
